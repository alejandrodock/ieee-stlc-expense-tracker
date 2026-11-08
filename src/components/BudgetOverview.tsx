'use client';

import { motion } from 'framer-motion';
import { CATEGORIAS, PRESUPUESTO_INICIAL, formatMonto } from '@/lib/constants';
import type { Gasto } from '@/lib/types';

interface BudgetOverviewProps {
  gastos: Gasto[];
}

export default function BudgetOverview({ gastos }: BudgetOverviewProps) {
  const totalGastado = gastos.reduce((sum, g) => sum + Number(g.monto_bob), 0);
  const saldoRestante = PRESUPUESTO_INICIAL - totalGastado;
  const porcentajeGastado = (totalGastado / PRESUPUESTO_INICIAL) * 100;

  const gastosPorCategoria = CATEGORIAS.map(cat => {
    const total = gastos
      .filter(g => g.categoria === cat.value)
      .reduce((sum, g) => sum + Number(g.monto_bob), 0);
    return { ...cat, total };
  }).filter(c => c.total > 0);

  const barColor = porcentajeGastado > 90 ? 'bg-bad' : porcentajeGastado > 70 ? 'bg-warn' : 'bg-signal';

  return (
    <div className="space-y-4">
      {/* Saldo */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-2xl bg-ink-900 border border-line"
      >
        <div className="absolute inset-x-0 top-0 h-[3px] bg-brand" />
        <div className="p-6 pb-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Saldo disponible</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-base text-muted">Bs.</span>
            <span className={`font-serif text-[46px] leading-none tracking-tight tabular ${saldoRestante >= 0 ? 'text-fg' : 'text-bad'}`}>
              {formatMonto(saldoRestante)}
            </span>
          </div>

          <div className="mt-6">
            <div className="flex justify-between text-[11px] text-muted mb-2">
              <span>Ejecutado</span>
              <span className="tabular">{porcentajeGastado.toFixed(1)} %</span>
            </div>
            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(porcentajeGastado, 100)}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                className={`h-full rounded-full ${barColor}`}
              />
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-3 border-t border-line text-center">
          {[
            { label: 'Presupuesto', value: `Bs. ${formatMonto(PRESUPUESTO_INICIAL)}` },
            { label: 'Gastado', value: `Bs. ${formatMonto(totalGastado)}` },
            { label: 'Registros', value: String(gastos.length) },
          ].map((s, i) => (
            <div key={s.label} className={`py-3.5 px-2 ${i > 0 ? 'border-l border-line' : ''}`}>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-faint">{s.label}</dt>
              <dd className="mt-1 text-[13px] font-medium text-fg tabular">{s.value}</dd>
            </div>
          ))}
        </dl>
      </motion.section>

      {/* Desglose por categoría */}
      {gastosPorCategoria.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
          className="rounded-2xl bg-ink-900 border border-line p-5"
        >
          <h3 className="text-[11px] uppercase tracking-[0.16em] text-muted mb-4">Por categoría</h3>
          <div className="space-y-3.5">
            {gastosPorCategoria.map((cat) => {
              const percentage = totalGastado > 0 ? (cat.total / totalGastado) * 100 : 0;
              return (
                <div key={cat.value} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2.5 text-fg/90">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                      {cat.label}
                    </span>
                    <span className="text-fg tabular">
                      Bs. {formatMonto(cat.total)}
                      <span className="ml-2 text-[11px] text-faint">{percentage.toFixed(0)} %</span>
                    </span>
                  </div>
                  <div className="h-[3px] bg-white/[0.05] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.7, delay: 0.15 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>
      )}
    </div>
  );
}
