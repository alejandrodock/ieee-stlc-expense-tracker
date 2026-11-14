'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, Crop, RotateCcw, RotateCw, Maximize, ScanLine, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import CornerEditor from './CornerEditor';
import {
  ScannerClient, encodeScan, fullImageQuad, loadPhoto, type EnhanceMode, type Quad,
} from '@/lib/scanner/client';

export type ScanResult = { jpeg: Uint8Array; width: number; height: number; previewUrl: string };

interface DocumentScannerProps {
  file: File;
  /** Called with the current scan, or null while there is no valid scan yet. */
  onScanChange: (scan: ScanResult | null) => void;
}

const MODES: { value: EnhanceMode; label: string; hint: string }[] = [
  { value: 'color', label: 'Color nítido', hint: 'Papel blanco, letra resaltada y colores originales' },
  { value: 'grayscale', label: 'Grises', hint: 'Máximo contraste de texto, sin color' },
  { value: 'original', label: 'Original', hint: 'Solo recorte y enderezado' },
];

type Phase = 'loading' | 'adjust' | 'processing' | 'result' | 'error';

export default function DocumentScanner({ file, onScanChange }: DocumentScannerProps) {
  const clientRef = useRef<ScannerClient | null>(null);
  const runRef = useRef(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<{ previewUrl: string; width: number; height: number } | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [detected, setDetected] = useState<Quad | null>(null);
  const [mode, setMode] = useState<EnhanceMode>('color');
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);

  // Load photo + auto-detect page borders
  useEffect(() => {
    let cancelled = false;
    const client = new ScannerClient();
    clientRef.current = client;
    setPhase('loading');
    setResult(null);
    onScanChange(null);
    (async () => {
      try {
        const { image, previewUrl } = await loadPhoto(file);
        if (cancelled) return;
        await client.setSource(image);
        const found = await client.detect();
        if (cancelled) return;
        const q = found ?? fullImageQuad(image.width, image.height);
        setSource({ previewUrl, width: image.width, height: image.height });
        setDetected(found);
        setQuad(q);
        setRotation(0);
        setPhase('adjust');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'No se pudo procesar la imagen');
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
      client.dispose();
      clientRef.current = null;
    };
    // onScanChange is intentionally excluded: parent callbacks shouldn't restart scanning
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const run = useCallback(async (q: Quad, m: EnhanceMode, rot: number) => {
    const client = clientRef.current;
    if (!client) return;
    const token = ++runRef.current;
    setPhase('processing');
    try {
      const image = await client.process(q, m, rot);
      const { jpeg, previewUrl } = await encodeScan(image);
      if (token !== runRef.current) return; // a newer request superseded this one
      const scan = { jpeg, width: image.width, height: image.height, previewUrl };
      setResult(scan);
      onScanChange(scan);
      setPhase('result');
    } catch (e) {
      if (token !== runRef.current) return;
      setError(e instanceof Error ? e.message : 'Error al escanear');
      setPhase('error');
    }
  }, [onScanChange]);

  const busy = phase === 'loading' || phase === 'processing';

  if (phase === 'error') {
    return (
      <div className="p-4 rounded-xl bg-bad/10 border border-bad/30 text-sm text-bad flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>{error ?? 'Error al procesar la imagen'}. Prueba con otra foto.</span>
      </div>
    );
  }

  if (phase === 'loading' || !source || !quad) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 rounded-xl border border-line bg-ink-900/60">
        <Loader2 className="w-6 h-6 text-brand-soft animate-spin" />
        <p className="text-xs text-muted">Detectando bordes del documento…</p>
      </div>
    );
  }

  const showEditor = phase === 'adjust' || (phase === 'processing' && !result);

  return (
    <div className="space-y-3">
      {showEditor ? (
        <>
          <p className="text-[11px] text-muted flex items-center gap-1.5">
            <Crop className="w-3.5 h-3.5 text-brand-soft" />
            {detected
              ? 'Bordes detectados. Arrastra las esquinas si hace falta afinar.'
              : 'No se detectaron bordes claros: arrastra las 4 esquinas al borde del papel.'}
          </p>
          <div className={busy ? 'opacity-60 pointer-events-none' : ''}>
            <CornerEditor
              previewUrl={source.previewUrl}
              width={source.width}
              height={source.height}
              quad={quad}
              onChange={setQuad}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setQuad(detected ?? fullImageQuad(source.width, source.height))}
              className="py-2 rounded-lg bg-ink-800 border border-line text-xs text-fg/80 hover:bg-white/10 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <ScanLine className="w-3.5 h-3.5" /> Bordes automáticos
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setQuad(fullImageQuad(source.width, source.height))}
              className="py-2 rounded-lg bg-ink-800 border border-line text-xs text-fg/80 hover:bg-white/10 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Maximize className="w-3.5 h-3.5" /> Imagen completa
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(quad, mode, rotation)}
            className="w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crop className="w-4 h-4" />}
            {busy ? 'Escaneando…' : 'Recortar y escanear'}
          </button>
        </>
      ) : (
        <>
          <div className="relative rounded-xl overflow-hidden border border-line bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result?.previewUrl} alt="Documento escaneado" className="w-full max-h-[52vh] object-contain" />
            {phase === 'processing' && (
              <div className="absolute inset-0 bg-ink-950/40 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
            {phase === 'result' && (
              <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-ink-950/85 text-fg text-[11px] font-medium flex items-center gap-1.5 border border-line">
                <CheckCircle2 className="w-3.5 h-3.5" /> Escaneado
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Filtro de escaneo">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={mode === m.value}
                title={m.hint}
                disabled={busy}
                onClick={() => { setMode(m.value); run(quad, m.value, rotation); }}
                className={`py-2 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-60 ${
                  mode === m.value
                    ? 'bg-brand/15 border-brand-soft/50 text-fg'
                    : 'bg-ink-800/60 border-line text-fg/80 hover:bg-ink-800'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button" disabled={busy}
              onClick={() => { const r = rotation - 1; setRotation(r); run(quad, mode, r); }}
              className="py-2 rounded-lg bg-ink-800 border border-line text-[11px] text-fg/80 hover:bg-white/10 transition-colors flex items-center justify-center gap-1 disabled:opacity-60"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Girar
            </button>
            <button
              type="button" disabled={busy}
              onClick={() => { setPhase('adjust'); setResult(null); onScanChange(null); }}
              className="py-2 rounded-lg bg-ink-800 border border-line text-[11px] text-fg/80 hover:bg-white/10 transition-colors flex items-center justify-center gap-1 disabled:opacity-60"
            >
              <Crop className="w-3.5 h-3.5" /> Bordes
            </button>
            <button
              type="button" disabled={busy}
              onClick={() => { const r = rotation + 1; setRotation(r); run(quad, mode, r); }}
              className="py-2 rounded-lg bg-ink-800 border border-line text-[11px] text-fg/80 hover:bg-white/10 transition-colors flex items-center justify-center gap-1 disabled:opacity-60"
            >
              <RotateCw className="w-3.5 h-3.5" /> Girar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
