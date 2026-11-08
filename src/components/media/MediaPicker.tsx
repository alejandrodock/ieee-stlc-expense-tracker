'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, X, Film } from 'lucide-react';
import { MAX_MEDIA, MAX_MEDIA_MB } from '@/lib/constants';
import { checkMediaFile, isVideoMime, mediaMime } from '@/lib/media-client';

interface MediaPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  /** Upload progress per file (0–1), shown while saving. */
  progress?: (number | undefined)[];
}

/** Local selection of up to 3 photos/videos, uploaded after the expense is saved. */
export default function MediaPicker({ files, onChange, disabled, progress }: MediaPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const add = (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...files];
    let msg: string | null = null;
    for (const f of Array.from(list)) {
      if (next.length >= MAX_MEDIA) { msg = `Máximo ${MAX_MEDIA} fotos o videos por gasto.`; break; }
      const problem = checkMediaFile(f);
      if (problem) { msg = problem; continue; }
      next.push(f);
    }
    setError(msg);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        <span className="flex items-center gap-2"><ImagePlus className="w-3.5 h-3.5 text-faint" /> Fotos y videos del gasto</span>
        <span className="text-[10px] text-faint">Opcional · {files.length}/{MAX_MEDIA}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {files.map((f, i) => {
          const video = isVideoMime(mediaMime(f));
          const p = progress?.[i];
          return (
            <div key={`${f.name}-${i}`} className="relative aspect-square rounded-xl overflow-hidden border border-line bg-ink-800">
              {video ? (
                <video src={previews[i]} muted playsInline preload="metadata" className="w-full h-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previews[i]} alt={f.name} className="w-full h-full object-cover" />
              )}
              {video && (
                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-ink-950/80 text-[10px] text-fg flex items-center gap-1">
                  <Film className="w-3 h-3" /> {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
              )}
              {p !== undefined && (
                <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                  <div className="h-full bg-signal transition-[width]" style={{ width: `${Math.round(p * 100)}%` }} />
                </div>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                  aria-label={`Quitar ${f.name}`}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-ink-950/85 border border-line flex items-center justify-center text-fg hover:bg-bad/80"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {files.length < MAX_MEDIA && !disabled && (
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
        onChange={(e) => { add(e.target.files); e.target.value = ''; }}
      />
      {error && <p className="text-[11px] text-warn">{error}</p>}
      {files.length === 0 && (
        <p className="text-[11px] text-faint">Fotos del producto, la entrega o el evento. Videos de hasta {MAX_MEDIA_MB} MB.</p>
      )}
    </div>
  );
}
