'use client';
import { useCallback, useEffect, useState } from 'react';
import { categoryLabel, CATEGORIES, money, type Expense } from './domain';
import ExpenseForm from './ExpenseForm';
import styles from './Hart.module.css';

export default function HartDashboard({ budget }: { budget: number }) {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(false);
  const [exporting, setExporting] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/hart/gastos', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setExpenses(data); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar los gastos.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const total = expenses?.reduce((sum, e) => sum + Number(e.amount_usd), 0) ?? 0;
  const remove = async (e: Expense) => {
    if (!confirm(`¿Eliminar el gasto de ${e.proveedor} (${money(Number(e.amount_usd))}) y su comprobante?`)) return;
    try {
      const response = await fetch('/api/hart/gastos', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: e.id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo eliminar.'); }
  };
  const exportFile = async () => {
    setExporting(true);
    try {
      const response = await fetch('/api/hart/export');
      if (!response.ok) throw new Error('No se pudo generar el Excel.');
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a'); a.href = url; a.download = 'Rendicion_IEEE_HART_2026.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo exportar.'); }
    finally { setExporting(false); }
  };
  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Travel Grant · 2026</p><h1 className={styles.title}>IEEE HART</h1><p className={styles.muted}>Tus gastos de viaje, reunidos en dólares.</p></div>
      <button className={styles.secondary} disabled={exporting || !expenses} onClick={exportFile}>{exporting ? 'Exportando…' : 'Exportar Excel'}</button>
    </header>
    {error && <p className={styles.error} role="alert">{error} {expenses ? 'Los totales mostrados pueden no estar actualizados.' : ''}</p>}
    <section className={styles.card} aria-label="Presupuesto HART">
      <div className={styles.budget}>
        <div><p className={styles.muted}>Presupuesto USD</p><p className={styles.metric}>{money(budget)}</p></div>
        <div><p className={styles.muted}>Gastado USD</p><p className={styles.metric}>{expenses ? money(total) : '—'}</p></div>
        <div><p className={styles.muted}>Disponible USD</p><p className={styles.metric}>{expenses ? money(budget - total) : '—'}</p></div>
      </div>
      {expenses && <><progress className={styles.progress} max={budget} value={Math.min(total, budget)} aria-label="Presupuesto utilizado" /><p className={styles.muted}>{(total / budget * 100).toFixed(1)}% utilizado{total > budget ? ' · Presupuesto excedido' : ''}</p></>}
    </section>
    <div className={styles.header}><h2 className={styles.sectionTitle}>Gastos de viaje</h2><div className={styles.actions}>
      <button className={styles.secondary} disabled={loading} onClick={() => void load()}>{loading ? 'Cargando…' : 'Actualizar'}</button>
      <button className={styles.button} onClick={() => setForm(true)}>Nuevo gasto</button>
    </div></div>
    {form && <ExpenseForm onClose={() => setForm(false)} onSaved={() => { setForm(false); void load(); }} />}
    {expenses?.length === 0 && <section className={styles.card}><h3 className={styles.sectionTitle}>Tu primer gasto de viaje</h3><p className={styles.muted}>Registra el importe en USD, EUR o BOB. Conservaremos la tasa y el respaldo de cada compra.</p></section>}
    {!!expenses?.length && <>
      <section className={styles.card} aria-label="Resumen por categoría">{CATEGORIES.map(([id, label]) => {
        const sum = expenses.filter(e => e.categoria === id).reduce((s, e) => s + Number(e.amount_usd), 0);
        return sum > 0 ? <div className={styles.category} key={id}><span>{label}</span><strong>{money(sum)}</strong></div> : null;
      })}</section>
      <section className={styles.card} aria-label="Lista de gastos HART">{expenses.map(e => <article className={styles.row} key={e.id}>
        <div className={styles.rowTop}><div><strong>{e.proveedor}</strong><p className={styles.muted}>{e.fecha} · {categoryLabel(e.categoria)}</p></div><strong>{money(Number(e.amount_usd))}</strong></div>
        <p className={styles.muted}>{money(Number(e.original_amount), e.original_currency)} · 1 {e.original_currency} = {e.exchange_rate} USD</p>
        {e.descripcion && <p className={styles.muted}>{e.descripcion}</p>}
        <div className={styles.actions} style={{ marginTop: 12 }}><a className={styles.link} href={e.pdf_url} target="_blank" rel="noreferrer">{e.has_receipt ? 'Ver comprobante' : 'Ver declaración firmada'}</a><a className={styles.link} href={`${e.pdf_url}?descargar=1`}>Descargar PDF</a><button className={styles.secondary} onClick={() => void remove(e)}>Eliminar</button></div>
      </article>)}</section>
    </>}
  </main>;
}
