'use client';

import { fullImageQuad, type EnhanceMode, type Quad, type RGBAImage } from './core';
import type { WorkerRequest, WorkerResponse } from './scanner.worker';

/** Long edge used for processing – plenty for ~250 dpi on a receipt, safe for phone memory. */
const MAX_SOURCE_SIDE = 3200;

type Pending = { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void };
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** Promise-based wrapper around the scanner Web Worker. */
export class ScannerClient {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker = new Worker(new URL('./scanner.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data);
      else p.reject(new Error(e.data.error));
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) p.reject(new Error(e.message || 'Error en el escáner'));
      this.pending.clear();
    };
  }

  private call(msg: DistributiveOmit<WorkerRequest, 'id'>, transfer: Transferable[] = []) {
    const id = ++this.seq;
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...msg, id } as WorkerRequest, transfer);
    });
  }

  async setSource(image: RGBAImage) {
    // copy so the caller keeps its buffer (the worker owns the transferred copy)
    const copy: RGBAImage = { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height };
    await this.call({ type: 'setSource', image: copy }, [copy.data.buffer]);
  }

  async detect(): Promise<Quad | null> {
    const r = await this.call({ type: 'detect' });
    return r.ok ? r.quad ?? null : null;
  }

  async process(quad: Quad, mode: EnhanceMode, rotation: number): Promise<RGBAImage> {
    const r = await this.call({ type: 'process', quad, mode, rotation });
    if (!r.ok || !r.image) throw new Error('El escáner no devolvió imagen');
    return r.image;
  }

  dispose() {
    this.worker.terminate();
    this.pending.clear();
  }
}

/**
 * Decodes a photo (honouring EXIF orientation) into RGBA, downscaled to MAX_SOURCE_SIDE.
 * Also returns a light preview URL for the corner editor.
 */
export async function loadPhoto(file: File): Promise<{ image: RGBAImage; previewUrl: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode().catch(() => {
      throw new Error('No se pudo leer la imagen. Usa JPG, PNG o WEBP.');
    });
    const scale = Math.min(1, MAX_SOURCE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas no disponible');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);

    const ps = Math.min(1, 1400 / Math.max(w, h));
    const pc = document.createElement('canvas');
    pc.width = Math.round(w * ps);
    pc.height = Math.round(h * ps);
    pc.getContext('2d')!.drawImage(canvas, 0, 0, pc.width, pc.height);
    const previewUrl = pc.toDataURL('image/jpeg', 0.85);

    return { image: { data: data.data, width: w, height: h }, previewUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Encodes an RGBA image to JPEG (for the PDF) and a data URL preview. */
export async function encodeScan(image: RGBAImage, quality = 0.88): Promise<{ jpeg: Uint8Array; previewUrl: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo codificar la imagen'))), 'image/jpeg', quality)
  );
  const ps = Math.min(1, 1000 / Math.max(image.width, image.height));
  const pc = document.createElement('canvas');
  pc.width = Math.round(image.width * ps);
  pc.height = Math.round(image.height * ps);
  pc.getContext('2d')!.drawImage(canvas, 0, 0, pc.width, pc.height);
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), previewUrl: pc.toDataURL('image/jpeg', 0.85) };
}

export { fullImageQuad };
export type { Quad, EnhanceMode, RGBAImage };
