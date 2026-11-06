'use client';

import { useCallback, useRef, useState } from 'react';
import type { Point, Quad } from '@/lib/scanner/core';

interface CornerEditorProps {
  previewUrl: string;
  /** Natural size of the processed source image (quad coordinates use this space). */
  width: number;
  height: number;
  quad: Quad;
  onChange: (quad: Quad) => void;
}

const LOUPE = 112; // px
const ZOOM = 2.5;

/**
 * Draggable 4-corner selector over the photo, with a magnifier while dragging
 * (the finger hides the exact corner on phones).
 */
export default function CornerEditor({ previewUrl, width, height, quad, onChange }: CornerEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [display, setDisplay] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  const toImage = useCallback((clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(width, Math.max(0, ((clientX - rect.left) / rect.width) * width)),
      y: Math.min(height, Math.max(0, ((clientY - rect.top) / rect.height) * height)),
    };
  }, [width, height]);

  const onPointerDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = svgRef.current!.getBoundingClientRect();
    setDisplay({ w: rect.width, h: rect.height });
    setActive(i);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (active === null) return;
    const p = toImage(e.clientX, e.clientY);
    const next = quad.map((q, i) => (i === active ? p : q)) as Quad;
    onChange(next);
  };

  const endDrag = () => setActive(null);

  // handle radius in image units so it renders ~14px regardless of photo size
  const unit = width / Math.max(1, display.w > 1 ? display.w : 360);
  const r = 14 * unit;
  const points = quad.map((p) => `${p.x},${p.y}`).join(' ');
  const activePoint = active !== null ? quad[active] : null;

  return (
    <div className="relative select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={previewUrl} alt="Foto del comprobante" className="w-full h-auto rounded-xl block" draggable={false} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 w-full h-full touch-none"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerEnter={() => {
          const rect = svgRef.current?.getBoundingClientRect();
          if (rect) setDisplay({ w: rect.width, h: rect.height });
        }}
      >
        <defs>
          <mask id="doc-mask">
            <rect width={width} height={height} fill="white" />
            <polygon points={points} fill="black" />
          </mask>
        </defs>
        <rect width={width} height={height} fill="rgba(2,6,23,0.55)" mask="url(#doc-mask)" />
        <polygon points={points} fill="rgba(34,211,238,0.08)" stroke="#22d3ee" strokeWidth={2.5 * unit} strokeLinejoin="round" />
        {quad.map((p, i) => (
          <g key={i}>
            {/* generous invisible hit area for fingers */}
            <circle cx={p.x} cy={p.y} r={r * 2.2} fill="transparent" className="cursor-grab" onPointerDown={onPointerDown(i)} />
            <circle
              cx={p.x} cy={p.y} r={r}
              fill={active === i ? '#22d3ee' : 'rgba(255,255,255,0.9)'}
              stroke="#0891b2" strokeWidth={2.5 * unit}
              pointerEvents="none"
            />
          </g>
        ))}
      </svg>

      {activePoint && (
        <div
          className="pointer-events-none absolute rounded-full border-2 border-cyan-400 shadow-2xl overflow-hidden"
          style={{
            width: LOUPE,
            height: LOUPE,
            left: Math.min(display.w - LOUPE, Math.max(0, (activePoint.x / width) * display.w - LOUPE / 2)),
            top: Math.max(-LOUPE - 8, (activePoint.y / height) * display.h - LOUPE - 36),
            backgroundImage: `url(${previewUrl})`,
            backgroundRepeat: 'no-repeat',
            backgroundSize: `${display.w * ZOOM}px ${display.h * ZOOM}px`,
            backgroundPosition: `${-((activePoint.x / width) * display.w * ZOOM - LOUPE / 2)}px ${-((activePoint.y / height) * display.h * ZOOM - LOUPE / 2)}px`,
          }}
        >
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-300/80" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-300/80" />
        </div>
      )}
    </div>
  );
}
