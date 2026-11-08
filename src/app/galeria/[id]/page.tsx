import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FileText, Download } from 'lucide-react';
import { getServerSupabase } from '@/lib/server/supabase';
import { isUuid } from '@/lib/server/validation';
import { MEDIA_BUCKET } from '@/lib/server/media';
import { LogoMark } from '@/components/Logo';
import { formatDate, formatMonto, getCategoriaLabel } from '@/lib/constants';
import { mediaUrl } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fotos y videos · IEEE STLC',
  robots: { index: false, follow: false },
};

type Row = { id: string; path: string; nombre: string | null; mime_type: string; created_at: string };

/**
 * Public, shareable gallery of one expense's photos and videos.
 * The link is unguessable (expense UUID); files are served through signed URLs.
 */
export default async function GaleriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = getServerSupabase();
  const { data: gasto } = await supabase
    .from('gastos')
    .select('id, fecha, categoria, proveedor, descripcion, monto_bob, pdf_url, media:gasto_media(id, path, nombre, mime_type, created_at)')
    .eq('id', id)
    .maybeSingle();
  if (!gasto) notFound();

  const media = ([...((gasto.media as Row[] | null) ?? [])]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const signed = media.length
    ? (await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(media.map((m) => m.path), 60 * 60 * 6)).data ?? []
    : [];
  const urlFor = (path: string) => signed.find((s) => s.path === path)?.signedUrl ?? null;

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header className="flex items-center gap-3">
        <LogoMark className="w-10 h-10" />
        <div className="leading-tight">
          <p className="font-serif text-xl text-fg">IEEE Student Tech Leadership Conference</p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-faint">Fotos y videos del gasto</p>
        </div>
      </header>

      <section className="rounded-2xl bg-ink-900 border border-line p-5 space-y-1.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-medium text-fg">{gasto.proveedor}</h1>
            <p className="text-xs text-muted">{getCategoriaLabel(gasto.categoria)} · {formatDate(gasto.fecha)}</p>
          </div>
          <p className="font-serif text-2xl text-fg tabular whitespace-nowrap">Bs. {formatMonto(Number(gasto.monto_bob))}</p>
        </div>
        {gasto.descripcion && <p className="text-sm text-fg/75 pt-1">{gasto.descripcion}</p>}
        {gasto.pdf_url && (
          <a href={gasto.pdf_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 pt-2 text-xs font-medium text-brand-soft hover:text-fg">
            <FileText className="w-3.5 h-3.5" /> Ver comprobante PDF
          </a>
        )}
      </section>

      {media.length === 0 ? (
        <p className="text-sm text-muted text-center py-12">Este gasto todavía no tiene fotos ni videos.</p>
      ) : (
        <div className="space-y-4">
          {media.map((m, i) => {
            const url = urlFor(m.path);
            if (!url) return null;
            const video = m.mime_type.startsWith('video/');
            return (
              <figure key={m.id} className="rounded-2xl overflow-hidden bg-ink-900 border border-line">
                {video ? (
                  <video src={url} controls playsInline preload="metadata" className="w-full max-h-[75vh] bg-black" />
                ) : (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={m.nombre ?? `Foto ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} className="w-full max-h-[75vh] object-contain bg-black" />
                  </a>
                )}
                <figcaption className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs text-muted">
                  <span className="truncate">{video ? 'Video' : 'Foto'} {i + 1} de {media.length}{m.nombre ? ` · ${m.nombre}` : ''}</span>
                  <a href={`${mediaUrl(m.id)}?descargar=1`} className="flex items-center gap-1 text-brand-soft hover:text-fg whitespace-nowrap">
                    <Download className="w-3.5 h-3.5" /> Descargar
                  </a>
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </main>
  );
}
