'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, RefreshCw, Loader2 } from 'lucide-react';
import BudgetOverview from '@/components/BudgetOverview';
import GastosList from '@/components/GastosList';
import NuevaCompraModal, { DRAFT_KEY } from '@/components/NuevaCompraModal';
import ExportButton from '@/components/ExportButton';
import MediaManager from '@/components/media/MediaManager';
import { Logo, LogoMark } from '@/components/Logo';
import { PRESUPUESTO_INICIAL } from '@/lib/constants';
import type { Gasto } from '@/lib/types';

export default function Dashboard() {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // If the page reloaded mid-registration (Android can discard the tab), reopen the form with its draft.
  useEffect(() => {
    try { if (localStorage.getItem(DRAFT_KEY)) setIsModalOpen(true); } catch { /* ignore */ }
  }, []);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mediaGastoId, setMediaGastoId] = useState<string | null>(null);
  const mediaGasto = mediaGastoId ? gastos.find((g) => g.id === mediaGastoId) ?? null : null;

  const fetchGastos = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    try {
      const res = await fetch('/api/gastos', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Gasto[] = await res.json();
      setGastos(data.map((g) => ({ ...g, monto_bob: Number(g.monto_bob), monto_usd: g.monto_usd == null ? null : Number(g.monto_usd) })));
      setLoadError(null);
    } catch (error) {
      console.error('Error fetching gastos:', error);
      // Never show an empty list / full budget when data failed to load.
      setLoadError('No se pudieron cargar los gastos. El saldo mostrado puede no estar actualizado.');
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGastos(prev => prev.filter(g => g.id !== id));
    } catch (error) {
      console.error('Delete error:', error);
      alert('No se pudo eliminar el gasto. Inténtalo de nuevo.');
    }
  };

  const totalGastado = gastos.reduce((sum, g) => sum + g.monto_bob, 0);
  const saldoActual = PRESUPUESTO_INICIAL - totalGastado;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-5"
        >
          <LogoMark className="w-14 h-14" />
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Cargando…
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-ink-950/90 backdrop-blur-md border-b border-line">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => fetchGastos(true)}
              disabled={isRefreshing}
              className="p-2 rounded-lg text-muted hover:text-fg hover:bg-white/5 transition-colors"
              title="Actualizar"
              aria-label="Actualizar"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <ExportButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-lg mx-auto px-4 py-6 pb-28 space-y-6">
        {loadError && (
          <div role="alert" className="flex items-start justify-between gap-3 p-3 rounded-xl bg-bad/10 border border-bad/30 text-xs text-bad">
            <span>{loadError}</span>
            <button onClick={() => fetchGastos(true)} className="underline whitespace-nowrap">Reintentar</button>
          </div>
        )}
        <BudgetOverview gastos={gastos} />
        <GastosList gastos={gastos} onDelete={handleDelete} onEditMedia={(g) => setMediaGastoId(g.id)} />
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 sm:bottom-8 sm:right-[calc(50%-240px+24px)] z-40">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => setIsModalOpen(true)}
          aria-label="Registrar compra"
          className="h-12 pl-4 pr-5 rounded-full bg-brand hover:bg-brand-hover text-white text-sm font-medium flex items-center gap-2 shadow-lg shadow-black/40 ring-1 ring-white/10 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2.25} />
          Registrar compra
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

      <AnimatePresence>
        {mediaGasto && (
          <MediaManager
            gasto={mediaGasto}
            onClose={() => setMediaGastoId(null)}
            onChanged={(id, media) => setGastos((prev) => prev.map((g) => (g.id === id ? { ...g, media } : g)))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
