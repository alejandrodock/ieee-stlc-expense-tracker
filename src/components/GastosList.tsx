'use client';

import { motion } from 'framer-motion';
import {
  ExternalLink, FileCheck, AlertCircle, Trash2
} from 'lucide-react';
import {
  getCategoriaLabel, getCategoriaIcon, getCategoriaColor,
  getTipoComprobanteLabel, formatMonto, formatDate
} from '@/lib/constants';
import type { Gasto } from '@/lib/types';

interface GastosListProps {
  gastos: Gasto[];
  onDelete?: (id: string) => void;
}

export default function GastosList({ gastos, onDelete }: GastosListProps) {
  if (gastos.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-12"
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800/50 flex items-center justify-center">
          <span className="text-3xl">📋</span>
        </div>
        <p className="text-slate-400 text-sm">No hay gastos registrados aún</p>
        <p className="text-slate-500 text-xs mt-1">Presiona + para registrar tu primera compra</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-300 px-1">
        Compras Recientes ({gastos.length})
      </h3>
      {gastos.map((gasto, i) => (
        <motion.div
          key={gasto.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.05 }}
          className="group relative rounded-xl bg-slate-900/60 border border-white/5 p-4 hover:bg-slate-800/60 transition-all"
        >
          <div className="flex items-start gap-3">
            {/* Category Icon */}
            <div
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-sm"
              style={{ backgroundColor: `${getCategoriaColor(gasto.categoria)}18` }}
            >
              {getCategoriaIcon(gasto.categoria)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-white truncate">
                    {gasto.proveedor}
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {getCategoriaLabel(gasto.categoria)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-white">
                    Bs. {formatMonto(gasto.monto_bob)}
                  </p>
                  {gasto.monto_usd != null && gasto.monto_usd > 0 && (
                    <p className="text-xs text-slate-400">
                      ≈ $ {formatMonto(gasto.monto_usd)}
                    </p>
                  )}
                </div>
              </div>

              {/* Items / Description */}
              {gasto.descripcion && (
                <div className="mt-2 text-xs text-slate-300 bg-slate-800/50 rounded-lg p-2 border border-slate-700/40">
                  <span className="text-slate-400 font-medium">Contenido: </span>
                  <span className="text-slate-200">{gasto.descripcion}</span>
                </div>
              )}

              {/* Observaciones (Opcional) */}
              {gasto.observaciones && (
                <div className="mt-1.5 text-[11px] text-amber-200/90 bg-amber-500/10 rounded-lg px-2.5 py-1.5 border border-amber-500/20 flex items-start gap-1.5">
                  <span className="font-semibold text-amber-400">Obs:</span>
                  <span className="text-slate-300">{gasto.observaciones}</span>
                </div>
              )}

              <div className="flex items-center flex-wrap gap-2 mt-2.5">
                <span className="text-xs text-slate-500">
                  {formatDate(gasto.fecha)}
                </span>
                <span className="text-xs text-slate-600">•</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/50">
                  {getTipoComprobanteLabel(gasto.tipo_comprobante)}
                </span>

                {/* Comprobante Status */}
                {gasto.pdf_url || gasto.drive_url ? (
                  <a
                    href={gasto.pdf_url ?? gasto.drive_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors ml-auto bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20"
                  >
                    <FileCheck className="w-3 h-3" />
                    Ver PDF
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-400 ml-auto bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                    <AlertCircle className="w-3 h-3" />
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
                    className="p-1.5 -my-1 rounded-lg text-slate-500 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                    title="Eliminar gasto"
                    aria-label={`Eliminar gasto de ${gasto.proveedor}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
