'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';
import BudgetOverview from '@/components/BudgetOverview';
import GastosList from '@/components/GastosList';
import NuevaCompraModal from '@/components/NuevaCompraModal';
import ExportButton from '@/components/ExportButton';
import { PRESUPUESTO_INICIAL } from '@/lib/constants';
import type { Gasto } from '@/lib/supabase';

export default function Dashboard() {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchGastos = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    try {
      const res = await fetch('/api/gastos');
      if (res.ok) {
        const data = await res.json();
        setGastos(data);
      }
    } catch (error) {
      console.error('Error fetching gastos:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchGastos();
  }, [fetchGastos]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch('/api/gastos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setGastos(prev => prev.filter(g => g.id !== id));
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const totalGastado = gastos.reduce((sum, g) => sum + g.monto_bob, 0);
  const saldoActual = PRESUPUESTO_INICIAL - totalGastado;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="text-2xl font-bold text-white">IE</span>
            </div>
            <Loader2 className="w-6 h-6 text-blue-400 animate-spin absolute -bottom-1 -right-1" />
          </div>
          <p className="text-sm text-slate-400 animate-pulse">Cargando ExpenseTracker...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <span className="text-sm font-bold text-white">IE</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">IEEE STLC</h1>
              <p className="text-[10px] text-slate-400 leading-tight">ExpenseTracker</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchGastos(true)}
              disabled={isRefreshing}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors"
              title="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 text-slate-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <ExportButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-4 py-6 pb-28 space-y-6">
        <BudgetOverview gastos={gastos} />
        <GastosList gastos={gastos} onDelete={handleDelete} />
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-[calc(50%-240px+24px)] z-40">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsModalOpen(true)}
          className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-2xl shadow-blue-500/40 flex items-center justify-center hover:shadow-blue-500/60 transition-shadow"
        >
          <Plus className="w-7 h-7" />
        </motion.button>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <NuevaCompraModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSuccess={() => fetchGastos(true)}
            saldoActual={saldoActual}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
