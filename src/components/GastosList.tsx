'use client';

import { motion } from 'framer-motion';
import {
  ExternalLink, FileCheck, AlertCircle, Trash2
} from 'lucide-react';
import {
  getCategoriaLabel, getCategoriaIcon, getCategoriaColor,
  formatMonto, formatDate
} from '@/lib/constants';
import type { Gasto } from '@/lib/supabase';

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
              className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg"
              style={{ backgroundColor: `${getCategoriaColor(gasto.categoria)}15` }}
            >
              {getCategoriaIcon(gasto.categoria)}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-medium text-white truncate">
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
                  {gasto.monto_usd && (
                    <p className="text-xs text-slate-500">
                      ≈ $ {formatMonto(gasto.monto_usd)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-slate-500">
                  {formatDate(gasto.fecha)}
                </span>
                <span className="text-xs text-slate-600">•</span>
                <span className="text-xs text-slate-500">
                  {gasto.tipo_comprobante === 'factura' ? 'Factura' : 'Recibo'}
                </span>

                {/* Comprobante Status */}
                {gasto.drive_url ? (
                  <a
                    href={gasto.drive_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    <FileCheck className="w-3 h-3" />
                    Subido
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-amber-400">
                    <AlertCircle className="w-3 h-3" />
                    Pendiente
                  </span>
                )}
              </div>
            </div>

            {/* Delete Button */}
            {onDelete && (
              <button
                onClick={() => {
                  if (confirm('¿Eliminar este gasto?')) {
                    onDelete(gasto.id);
                  }
                }}
                className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 p-1.5 rounded-lg hover:bg-red-500/20 transition-all"
                title="Eliminar gasto"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
              </button>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
