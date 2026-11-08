'use client';

import { useState } from 'react';
import { Link2, Check, Share2 } from 'lucide-react';
import { galeriaUrl } from '@/lib/types';

interface Props {
  gastoId: string;
  title: string;
  variant?: 'icon' | 'full';
}

/** Copies (desktop) or shares (phone) the public gallery link of an expense. */
export default function ShareGalleryButton({ gastoId, title, variant = 'icon' }: Props) {
  const [copied, setCopied] = useState(false);

  const handle = async () => {
    const url = `${window.location.origin}${galeriaUrl(gastoId)}`;
    const canShare = typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;
    try {
      if (canShare) {
        await navigator.share({ title: `Fotos y videos · ${title}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch {
      // share cancelled or clipboard blocked: fall back to a prompt the user can copy from
      if (!canShare) window.prompt('Copia este enlace:', url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={handle}
        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors"
      >
        {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
        {copied ? 'Enlace copiado' : 'Compartir enlace'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handle}
      className={`p-1.5 rounded-md transition-colors ${copied ? 'text-ok' : 'text-faint hover:text-fg hover:bg-white/5'}`}
      title={copied ? 'Enlace copiado' : 'Copiar enlace de fotos y videos'}
      aria-label="Copiar enlace de fotos y videos"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" strokeWidth={1.75} />}
    </button>
  );
}
