'use client';

import { motion } from 'framer-motion';
import { FileText, AlertCircle, Trash2, Receipt, Download, HardDrive, Images, Film } from 'lucide-react';
import CategoryIcon from '@/components/CategoryIcon';
import ShareGalleryButton from '@/components/media/ShareGalleryButton';
import {
  getCategoriaLabel, getTipoComprobanteLabel, formatMonto, formatDate, MAX_MEDIA,
} from '@/lib/constants';
import { isVideoMime } from '@/lib/media-client';
import { mediaUrl, type Gasto } from '@/lib/types';

interface GastosListProps {
  gastos: Gasto[];
  onDelete?: (id: string) => void;
  onEditMedia?: (gasto: Gasto) => void;
}

export default function GastosList({ gastos, onDelete, onEditMedia }: GastosListProps) {
  if (gastos.length === 0) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-14">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full border border-line flex items-center justify-center text-faint">
          <Receipt className="w-5 h-5" strokeWidth={1.5} />
        </div>
        <p className="text-sm text-fg/80">Aún no hay compras registradas</p>
        <p className="text-xs text-faint mt-1">Usa «Registrar compra» para añadir la primera.</p>
      </motion.div>
    );
  }

  return (
    <section>
      <div className="flex items-baseline justify-between px-1 mb-3">
        <h3 className="text-[11px] uppercase tracking-[0.16em] text-muted">Compras</h3>
        <span className="text-[11px] text-faint tabular">{gastos.length}</span>
      </div>

      <ul className="rounded-2xl bg-ink-900 border border-line divide-y divide-line overflow-hidden">
        {gastos.map((gasto, i) => {
          const pdf = gasto.pdf_url ?? gasto.drive_url;
          const media = gasto.media ?? [];
          return (
            <motion.li
              key={gasto.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.03 }}
              className="p-4 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-start gap-3">
                <CategoryIcon categoria={gasto.categoria} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-fg truncate">{gasto.proveedor}</h4>
                      <p className="text-xs text-muted mt-0.5 truncate">
                        {getCategoriaLabel(gasto.categoria)} · {formatDate(gasto.fecha)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium text-fg tabular">Bs. {formatMonto(gasto.monto_bob)}</p>
                      {gasto.monto_usd != null && gasto.monto_usd > 0 && (
                        <p className="text-[11px] text-faint tabular">US$ {formatMonto(gasto.monto_usd)}</p>
                      )}
                    </div>
                  </div>

                  {gasto.descripcion && (
                    <p className="mt-2 text-xs text-fg/75 leading-relaxed">{gasto.descripcion}</p>
                  )}

                  {gasto.observaciones && (
                    <p className="mt-1.5 text-xs text-muted leading-relaxed border-l-2 border-warn/50 pl-2">
                      {gasto.observaciones}
                    </p>
                  )}

                  {media.length > 0 && (
                    <div className="mt-2.5 flex gap-1.5">
                      {media.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onEditMedia?.(gasto)}
                          className="relative w-12 h-12 rounded-lg overflow-hidden border border-line bg-ink-800 hover:border-brand-soft/60 transition-colors"
                          title={m.nombre ?? undefined}
                        >
                          {isVideoMime(m.mime_type) ? (
                            <span className="w-full h-full flex items-center justify-center text-muted"><Film className="w-4 h-4" strokeWidth={1.75} /></span>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={mediaUrl(m.id)} alt="" loading="lazy" className="w-full h-full object-cover" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1.5 mt-3">
                    <span className="text-[11px] text-faint">{getTipoComprobanteLabel(gasto.tipo_comprobante)}</span>

                    <div className="ml-auto flex items-center gap-1">
                      {onEditMedia && (
                        <button
                          type="button"
                          onClick={() => onEditMedia(gasto)}
                          className="flex items-center gap-1.5 text-[11px] font-medium text-muted hover:text-fg px-2 py-1 rounded-md hover:bg-white/5 transition-colors"
                          title="Agregar o editar fotos y videos"
                        >
                          <Images className="w-3.5 h-3.5" strokeWidth={1.75} />
                          {media.length > 0 ? `${media.length}/${MAX_MEDIA}` : 'Fotos'}
                        </button>
                      )}
                      {media.length > 0 && <ShareGalleryButton gastoId={gasto.id} title={gasto.proveedor} />}
                      {pdf ? (
                        <>
                          <a
                            href={pdf}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[11px] font-medium text-brand-soft hover:text-fg px-2 py-1 rounded-md hover:bg-white/5 transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />
                            Comprobante
                          </a>
                          {gasto.pdf_url && (
                            <a
                              href={`${gasto.pdf_url}?descargar=1`}
                              className="p-1.5 rounded-md text-faint hover:text-fg hover:bg-white/5 transition-colors"
                              title="Descargar PDF"
                              aria-label={`Descargar comprobante de ${gasto.proveedor}`}
                            >
                              <Download className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </a>
                          )}
                          {gasto.drive_url && (
                            <a
                              href={gasto.drive_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 rounded-md text-faint hover:text-fg hover:bg-white/5 transition-colors"
                              title="Abrir en Google Drive"
                              aria-label={`Abrir comprobante de ${gasto.proveedor} en Google Drive`}
                            >
                              <HardDrive className="w-3.5 h-3.5" strokeWidth={1.75} />
                            </a>
                          )}
                        </>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[11px] text-warn px-2 py-1">
                          <AlertCircle className="w-3.5 h-3.5" strokeWidth={1.75} />
                          Sin comprobante
                        </span>
                      )}

                      {onDelete && (
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar gasto de ${gasto.proveedor} (Bs. ${formatMonto(gasto.monto_bob)})? También se borrará su comprobante.`)) {
                              onDelete(gasto.id);
                            }
                          }}
                          className="p-1.5 rounded-md text-faint hover:bg-bad/15 hover:text-bad transition-colors"
                          title="Eliminar gasto"
                          aria-label={`Eliminar gasto de ${gasto.proveedor}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.75} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
