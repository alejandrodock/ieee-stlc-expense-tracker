'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export const PROJECT_KEY = 'ieee:active-project';
export function ProjectNavigation() {
  const pathname = usePathname();
  const active = pathname.startsWith('/hart') ? 'HART' : pathname.startsWith('/stlc') ? 'STLC' : null;
  useEffect(() => { if (active) { try { localStorage.setItem(PROJECT_KEY, active); } catch { /* unavailable */ } } }, [active]);
  if (!active) return null;
  return <nav aria-label="Seleccionar proyecto" className="border-b border-line bg-ink-900">
    <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3 text-xs">
      <Link href="/" className="text-muted hover:text-fg">← Proyectos</Link>
      <div className="flex gap-4"><Link href="/stlc" aria-current={active === 'STLC' ? 'page' : undefined} className={active === 'STLC' ? 'text-brand-soft font-semibold' : 'text-muted'}>STLC 2026</Link><Link href="/hart" aria-current={active === 'HART' ? 'page' : undefined} className={active === 'HART' ? 'text-ok font-semibold' : 'text-muted'}>HART 2026</Link></div>
    </div>
  </nav>;
}

export function ProjectHub() {
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => { try { setLast(localStorage.getItem(PROJECT_KEY)); } catch { /* unavailable */ } }, []);
  return <main className="max-w-3xl w-full mx-auto px-5 py-12 md:py-20">
    <p className="text-brand-soft text-xs uppercase tracking-widest mb-4">IEEE · Rendición de fondos</p>
    <h1 className="font-serif text-4xl md:text-5xl mb-4">Cada proyecto, sus cuentas.</h1>
    <p className="text-muted text-sm leading-relaxed mb-10 max-w-lg">Selecciona el proyecto para registrar compras, conservar comprobantes y preparar tu rendición.</p>
    <div className="grid gap-5 sm:grid-cols-2">
      <Link href="/stlc" className="rounded-2xl border border-line-strong bg-ink-900 p-7 hover:border-brand-soft transition-colors">
        <p className="text-brand-soft text-xs mb-5 uppercase tracking-widest">Conferencia</p><h2 className="font-serif text-3xl mb-3">STLC 2026</h2>
        <p className="text-muted text-sm leading-relaxed mb-7">Compras del evento, comprobantes y evidencias. Tipo de cambio fijo de 11,58 Bs/USD.</p>
        <p className="text-lg">1.176 USD <span className="text-muted text-xs">· 13.618,08 Bs</span></p><p className="text-brand-soft text-sm mt-7">Abrir STLC → {last === 'STLC' && <span className="block text-muted text-xs mt-2">Último proyecto utilizado</span>}</p>
      </Link>
      <Link href="/hart" className="rounded-2xl border border-line-strong bg-ink-900 p-7 hover:border-ok transition-colors">
        <p className="text-ok text-xs mb-5 uppercase tracking-widest">Travel Grant</p><h2 className="font-serif text-3xl mb-3">IEEE HART 2026</h2>
        <p className="text-muted text-sm leading-relaxed mb-7">Viajes en USD, EUR y BOB. Conversión a dólares y declaraciones firmadas para gastos menores.</p>
        <p className="text-lg">Presupuesto y reportes en USD</p><p className="text-ok text-sm mt-7">Abrir HART → {last === 'HART' && <span className="block text-muted text-xs mt-2">Último proyecto utilizado</span>}</p>
      </Link>
    </div>
  </main>;
}
