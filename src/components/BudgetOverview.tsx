'use client';

import { motion } from 'framer-motion';
import { TrendingDown, Wallet, PieChart } from 'lucide-react';
import { CATEGORIAS, PRESUPUESTO_INICIAL, formatMonto } from '@/lib/constants';
import type { Gasto } from '@/lib/supabase';

interface BudgetOverviewProps {
  gastos: Gasto[];
}

export default function BudgetOverview({ gastos }: BudgetOverviewProps) {
  const totalGastado = gastos.reduce((sum, g) => sum + g.monto_bob, 0);
  const saldoRestante = PRESUPUESTO_INICIAL - totalGastado;
  const porcentajeGastado = (totalGastado / PRESUPUESTO_INICIAL) * 100;

  // Totals per category
  const gastosPorCategoria = CATEGORIAS.map(cat => {
    const total = gastos
      .filter(g => g.categoria === cat.value)
      .reduce((sum, g) => sum + g.monto_bob, 0);
    return { ...cat, total };
  }).filter(c => c.total > 0);

  return (
    <div className="space-y-4">
      {/* Main Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6 shadow-2xl shadow-blue-900/30"
      >
        {/* Background decoration */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-cyan-400/10 rounded-full blur-xl" />

        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-blue-200" />
            <span className="text-sm font-medium text-blue-200">Saldo Restante</span>
          </div>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-sm text-blue-300">Bs.</span>
            <span className={`text-4xl font-bold tracking-tight ${
              saldoRestante >= 0 ? 'text-white' : 'text-red-300'
            }`}>
              {formatMonto(saldoRestante)}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-blue-200 mb-1.5">
              <span>Gastado: Bs. {formatMonto(totalGastado)}</span>
              <span>{porcentajeGastado.toFixed(1)}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(porcentajeGastado, 100)}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className={`h-full rounded-full ${
                  porcentajeGastado > 90
                    ? 'bg-gradient-to-r from-red-400 to-red-500'
                    : porcentajeGastado > 70
                    ? 'bg-gradient-to-r from-amber-400 to-orange-400'
                    : 'bg-gradient-to-r from-cyan-400 to-emerald-400'
                }`}
              />
            </div>
          </div>

          <div className="flex gap-4 text-xs text-blue-200">
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" />
              <span>Presupuesto: Bs. {formatMonto(PRESUPUESTO_INICIAL)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5" />
              <span>{gastos.length} gastos</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Category Breakdown */}
      {gastosPorCategoria.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-2xl bg-slate-900/80 border border-white/5 p-5"
        >
          <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
            <PieChart className="w-4 h-4 text-purple-400" />
            Desglose por Categoría
          </h3>
          <div className="space-y-3">
            {gastosPorCategoria.map((cat, i) => {
              const percentage = (cat.total / totalGastado) * 100;
              return (
                <motion.div
                  key={cat.value}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-base">{cat.icon}</span>
                      <span className="text-slate-300">{cat.label}</span>
                    </span>
                    <span className="font-medium text-slate-200">
                      Bs. {formatMonto(cat.total)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.05 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
