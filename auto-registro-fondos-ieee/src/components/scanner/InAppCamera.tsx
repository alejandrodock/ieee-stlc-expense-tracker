'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Loader2, RotateCcw, Check, Camera } from 'lucide-react';

interface InAppCameraProps {
  /** Photo taken and confirmed by the user. */
  onCapture: (file: File) => void;
  onClose: () => void;
  /** Camera unavailable or permission denied: fall back to the native camera app. */
  onUnavailable: () => void;
}

/**
 * Camera inside the page (getUserMedia). Unlike <input capture>, the browser never
 * leaves the foreground, so Android can't discard the tab and reload the app
 * while the native camera app is open.
 */
export default function InAppCamera({ onCapture, onClose, onUnavailable }: InAppCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }
      } catch (err) {
        console.warn('getUserMedia failed, falling back to native camera:', err);
        if (!cancelled) onUnavailable();
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [onUnavailable]);

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `comprobante-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setShot({ file, url: URL.createObjectURL(blob) });
    }, 'image/jpeg', 0.92);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Cámara">
      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        <video
          ref={videoRef}
          playsInline
          muted
          onLoadedMetadata={() => setReady(true)}
          className={`w-full h-full object-contain ${shot ? 'hidden' : ''}`}
        />
        {shot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shot.url} alt="Foto tomada" className="w-full h-full object-contain" />
        )}
        {!ready && !shot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70 text-sm">
            <Loader2 className="w-6 h-6 animate-spin" /> Abriendo cámara…
          </div>
        )}
        <button
          type="button" onClick={onClose} aria-label="Cerrar cámara"
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 flex items-center justify-center text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center justify-center gap-10 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-black">
        {shot ? (
          <>
            <button type="button" onClick={() => setShot(null)} className="flex flex-col items-center gap-1 text-white/80 text-xs">
              <span className="w-14 h-14 rounded-full border border-white/30 flex items-center justify-center"><RotateCcw className="w-6 h-6" /></span>
              Repetir
            </button>
            <button type="button" onClick={() => onCapture(shot.file)} className="flex flex-col items-center gap-1 text-white text-xs">
              <span className="w-14 h-14 rounded-full bg-brand flex items-center justify-center"><Check className="w-7 h-7" /></span>
              Usar foto
            </button>
          </>
        ) : (
          <button
            type="button" onClick={takePhoto} disabled={!ready} aria-label="Tomar foto"
            className="w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40"
          >
            <span className="w-14 h-14 rounded-full bg-white flex items-center justify-center"><Camera className="w-6 h-6 text-black" /></span>
          </button>
        )}
      </div>
    </div>
  );
}
