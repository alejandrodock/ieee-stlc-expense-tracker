/// <reference lib="webworker" />
/**
 * Runs the heavy scanner pipeline off the main thread so the UI stays responsive
 * on phones. Keeps the source photo and the last flattened page cached between
 * requests (changing the filter or rotation doesn't re-warp the photo).
 */
import {
  detectDocument, enhanceDocument, rotate90, warpPerspective,
  type EnhanceMode, type Quad, type RGBAImage,
} from './core';

export type WorkerRequest =
  | { id: number; type: 'setSource'; image: RGBAImage }
  | { id: number; type: 'detect' }
  | { id: number; type: 'process'; quad: Quad; mode: EnhanceMode; rotation: number };

export type WorkerResponse =
  | { id: number; ok: true; quad?: Quad | null; image?: RGBAImage }
  | { id: number; ok: false; error: string };

let source: RGBAImage | null = null;
let warpCache: { key: string; image: RGBAImage } | null = null;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === 'setSource') {
      source = msg.image;
      warpCache = null;
      ctx.postMessage({ id: msg.id, ok: true } satisfies WorkerResponse);
      return;
    }
    if (!source) throw new Error('No hay imagen cargada');

    if (msg.type === 'detect') {
      ctx.postMessage({ id: msg.id, ok: true, quad: detectDocument(source) } satisfies WorkerResponse);
      return;
    }

    const key = JSON.stringify(msg.quad.map((p) => [Math.round(p.x), Math.round(p.y)]));
    if (!warpCache || warpCache.key !== key) warpCache = { key, image: warpPerspective(source, msg.quad) };
    let result = enhanceDocument(warpCache.image, msg.mode);
    const turns = ((msg.rotation % 4) + 4) % 4;
    if (turns === 1) result = rotate90(result, 1);
    else if (turns === 2) result = rotate90(rotate90(result, 1), 1);
    else if (turns === 3) result = rotate90(result, -1);
    ctx.postMessage({ id: msg.id, ok: true, image: result } satisfies WorkerResponse, [result.data.buffer]);
  } catch (err) {
    ctx.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse);
  }
};
