'use client';

import { MAX_MEDIA_MB } from '@/lib/constants';
import type { GastoMedia } from '@/lib/types';

const BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp', mkv: 'video/x-matroska',
};

/** Some phones report an empty MIME type (HEIC, MOV…): infer it from the extension. */
export function mediaMime(file: File): string {
  if (Object.values(BY_EXT).includes(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXT[ext] ?? file.type;
}

export const isVideoMime = (mime: string) => mime.startsWith('video/');

/** Returns an error message, or null when the file can be attached. */
export function checkMediaFile(file: File): string | null {
  const mime = mediaMime(file);
  if (!Object.values(BY_EXT).includes(mime)) return `«${file.name}» no es una foto o video admitido.`;
  if (isVideoMime(mime) && file.size > MAX_MEDIA_MB * 1024 * 1024) {
    return `«${file.name}» pesa ${(file.size / 1024 / 1024).toFixed(0)} MB; el máximo por video es ${MAX_MEDIA_MB} MB.`;
  }
  return null;
}

const MAX_SIDE = 2400;

/** Downscales large photos to JPEG (keeps EXIF orientation). Videos and failures pass through. */
export async function prepareMedia(file: File): Promise<File> {
  const mime = mediaMime(file);
  if (!mime.startsWith('image/') || mime === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024 && mime !== 'image/heic' && mime !== 'image/heif') {
      bmp.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file; // e.g. HEIC on browsers that can't decode it: upload as is
  }
}

function putWithProgress(url: string, file: File, mime: string, onProgress?: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mime);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Error al subir (HTTP ${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Sin conexión al subir el archivo'));
    xhr.send(file);
  });
}

async function postJson<T>(body: object): Promise<T> {
  const res = await fetch('/api/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Compresses (photos), uploads straight to storage and registers the file for the expense. */
export async function uploadMedia(gastoId: string, original: File, onProgress?: (p: number) => void): Promise<GastoMedia> {
  const file = await prepareMedia(original);
  const mime = mediaMime(file);
  const base = { gasto_id: gastoId, mime_type: mime, size: file.size };
  const { media_id, signedUrl } = await postJson<{ media_id: string; signedUrl: string }>({ action: 'prepare', ...base });
  await putWithProgress(signedUrl, file, mime, onProgress);
  return postJson<GastoMedia>({ action: 'confirm', ...base, media_id, nombre: original.name });
}

export async function deleteMedia(id: string): Promise<void> {
  const res = await fetch(`/api/media/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo eliminar');
}
