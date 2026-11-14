'use client';
import { useRef, useState, type PointerEvent } from 'react';
import styles from './Hart.module.css';

export default function Signature({ onChange }: { onChange: (signature: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const length = useRef(0);
  const last = useRef({ x: 0, y: 0 });
  const [signed, setSigned] = useState(false);
  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * 1000 / rect.width, y: (e.clientY - rect.top) * 320 / rect.height };
  };
  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (length.current > 35 && canvas.current) { setSigned(true); onChange(canvas.current.toDataURL('image/png')); }
  };
  return <div>
    <p className={styles.muted} id="signature-help">Dibuja tu firma con el dedo o el cursor. Se incluirá en esta declaración.</p>
    <canvas ref={canvas} width={1000} height={320} className={styles.canvas} aria-label="Firma de la declaración" aria-describedby="signature-help"
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; last.current = point(e);
        const ctx = e.currentTarget.getContext('2d')!; ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y);
      }}
      onPointerMove={e => {
        if (!drawing.current) return;
        const p = point(e); length.current += Math.hypot(p.x - last.current.x, p.y - last.current.y); last.current = p;
        const ctx = e.currentTarget.getContext('2d')!; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = '#152e42'; ctx.lineTo(p.x, p.y); ctx.stroke();
      }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />
    <div className={styles.actions} style={{ marginTop: 10 }}>
      <button type="button" className={styles.secondary} onClick={() => { canvas.current?.getContext('2d')?.clearRect(0, 0, 1000, 320); length.current = 0; setSigned(false); onChange(''); }}>Borrar firma</button>
      <span className={styles.muted} aria-live="polite">{signed ? 'Firma capturada' : 'Firma pendiente'}</span>
    </div>
  </div>;
}
