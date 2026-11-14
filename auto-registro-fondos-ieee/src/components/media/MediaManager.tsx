'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, ImagePlus, Trash2, Loader2, Film, ExternalLink, Download, AlertTriangle } from 'lucide-react';
import { MAX_MEDIA, MAX_MEDIA_MB, formatMonto } from '@/lib/constants';
import { checkMediaFile, deleteMedia, isVideoMime, uploadMedia } from '@/lib/media-client';
import { galeriaUrl, mediaUrl, type Gasto, type GastoMedia } from '@/lib/types';
import ShareGalleryButton from './ShareGalleryButton';

interface MediaManagerProps {
  gasto: Gasto;
  onClose: () => void;
  onChanged: (gastoId: string, media: GastoMedia[]) => void;
}

type Pending = { key: string; name: string; progress: number };

/** Edit the photos/videos of an existing expense (add from PC or phone, view, delete). */
export default function MediaManager({ gasto, onClose, onChanged }: MediaManagerProps) {
  const [media, setMedia] = useState<GastoMedia[]>(() => sortMedia(gasto.media ?? []));
  const [pending, setPending] = useState<Pending[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = pending.length > 0 || deleting !== null;
  const free = MAX_MEDIA - media.length - pending.length;

  // Always apply changes on top of the latest list: uploads can overlap (adding a
  // photo while another is still uploading) and must not overwrite each other.
  const update = (fn: (prev: GastoMedia[]) => GastoMedia[]) => setMedia((prev) => sortMedia(fn(prev)));

  // Keep the dashboard in sync (ref avoids a render loop: onChanged is a new function each render).
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) { firstSync.current = false; return; }
    onChangedRef.current(gasto.id, media);
  }, [gasto.id, media]);

  /** Re-read what is actually stored, so the count never drifts from the server. */
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/gastos', { cache: 'no-store' });
      if (!res.ok) return;
      const list = (await res.json()) as Gasto[];
      const fresh = list.find((g) => g.id === gasto.id);
      if (fresh) setMedia(sortMedia(fresh.media ?? []));
    } catch { /* offline: keep local state */ }
  }, [gasto.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const addFiles = async (list: FileList | File[] | null) => {
    if (!list) return;
    const files = Array.from(list);
    if (!files.length) return;
    setError(null);
    const accepted: File[] = [];
    for (const f of files) {
      if (accepted.length >= free) { setError(`Máximo ${MAX_MEDIA} fotos o videos por gasto.`); break; }
      const problem = checkMediaFile(f);
      if (problem) { setError(problem); continue; }
      accepted.push(f);
    }
    if (!accepted.length) return;

    const jobs = accepted.map((f, i) => ({ key: `${Date.now()}-${i}`, file: f }));
    setPending((p) => [...p, ...jobs.map((j) => ({ key: j.key, name: j.file.name, progress: 0 }))]);

    let failed = false;
    for (const job of jobs) {
      try {
        const row = await uploadMedia(gasto.id, job.file, (progress) =>
          setPending((p) => p.map((x) => (x.key === job.key ? { ...x, progress } : x))),
        );
        update((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      } catch (e) {
        failed = true;
        setError(e instanceof Error ? `${job.file.name}: ${e.message}` : 'No se pudo subir el archivo');
      } finally {
        setPending((p) => p.filter((x) => x.key !== job.key));
      }
    }
    if (failed) await refresh();
  };

  const remove = async (m: GastoMedia) => {
    if (!confirm(`¿Eliminar ${isVideoMime(m.mime_type) ? 'este video' : 'esta foto'}?`)) return;
    setDeleting(m.id);
    setError(null);
    try {
      await deleteMedia(m.id);
      update((prev) => prev.filter((x) => x.id !== m.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar');
      await refresh();
    } finally {
      setDeleting(null);
    }
  };

  const close = () => !busy && onClose();

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog" aria-modal="true" aria-labelledby="media-title"
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={close} />
      <motion.div
        initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-lg max-h-[94dvh] overflow-y-auto bg-ink-900 rounded-t-3xl sm:rounded-2xl border border-line-strong shadow-2xl shadow-black/50"
        onDragOver={(e) => { e.preventDefault(); if (free > 0) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
      >
        <div className="sticky top-0 z-10 bg-ink-900/95 backdrop-blur-md border-b border-line px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h2 id="media-title" className="font-serif text-2xl text-fg leading-none">Fotos y videos</h2>
            <p className="mt-1.5 text-[11px] text-faint truncate">
              {gasto.proveedor} · Bs. {formatMonto(gasto.monto_bob)} · {media.length}/{MAX_MEDIA}
            </p>
          </div>
          <button onClick={close} disabled={busy} aria-label="Cerrar" className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-40">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className={`grid grid-cols-3 gap-2 rounded-xl transition-colors ${dragOver ? 'ring-2 ring-brand-soft/60 bg-brand/10' : ''}`}>
            {media.map((m) => {
              const video = isVideoMime(m.mime_type);
              const url = mediaUrl(m.id);
              return (
                <div key={m.id} className="group relative aspect-square rounded-xl overflow-hidden border border-line bg-ink-800">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full h-full" title="Abrir en una pestaña nueva">
                    {video ? (
                      <video src={url} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={m.nombre ?? 'Foto del gasto'} loading="lazy" className="w-full h-full object-cover" />
                    )}
                  </a>
                  {video && (
                    <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-ink-950/80 text-[10px] text-fg flex items-center gap-1 pointer-events-none">
                      <Film className="w-3 h-3" /> Video
                    </span>
                  )}
                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                    <a
                      href={`${url}?descargar=1`}
                      aria-label="Descargar"
                      className="w-7 h-7 rounded-full bg-ink-950/85 border border-line flex items-center justify-center text-fg hover:bg-white/15"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      disabled={busy}
                      aria-label="Eliminar"
                      className="w-7 h-7 rounded-full bg-ink-950/85 border border-line flex items-center justify-center text-fg hover:bg-bad/80 disabled:opacity-50"
                    >
                      {deleting === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}

            {pending.map((p) => (
              <div key={p.key} className="relative aspect-square rounded-xl border border-line bg-ink-800 flex flex-col items-center justify-center gap-2 px-2">
                <Loader2 className="w-5 h-5 text-brand-soft animate-spin" />
                <span className="text-[10px] text-muted text-center truncate w-full">{p.name}</span>
                <span className="text-[10px] text-faint tabular">{Math.round(p.progress * 100)} %</span>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                  <div className="h-full bg-signal transition-[width]" style={{ width: `${Math.round(p.progress * 100)}%` }} />
                </div>
              </div>
            ))}

            {free > 0 && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="aspect-square rounded-xl border border-dashed border-line-strong hover:bg-white/[0.03] transition-colors flex flex-col items-center justify-center gap-1 text-muted"
              >
                <ImagePlus className="w-5 h-5 text-brand-soft" strokeWidth={1.75} />
                <span className="text-[11px]">Agregar</span>
              </button>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />

          {error && (
            <p role="alert" className="text-xs text-bad bg-bad/10 px-3 py-2 rounded-lg border border-bad/30 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {error}
            </p>
          )}

          <p className="text-[11px] text-faint leading-relaxed">
            Hasta {MAX_MEDIA} fotos o videos por gasto (videos de máx. {MAX_MEDIA_MB} MB). En la computadora también puedes
            arrastrar los archivos a esta ventana. Toca una miniatura para verla en grande <ExternalLink className="inline w-3 h-3" />.
          </p>

          <div className="flex gap-2">
            {media.length > 0 && (
              <>
                <ShareGalleryButton gastoId={gasto.id} title={gasto.proveedor} variant="full" />
                <a
                  href={galeriaUrl(gasto.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 px-4 rounded-xl border border-line-strong text-fg/80 text-sm hover:bg-white/5 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" /> Ver
                </a>
              </>
            )}
            <button
              onClick={close}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl border border-line-strong text-fg/80 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-40"
            >
              {busy ? 'Subiendo…' : 'Listo'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function sortMedia(list: GastoMedia[]) {
  return [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
}
