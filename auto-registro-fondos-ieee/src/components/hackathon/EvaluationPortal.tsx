'use client';
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, LockKeyhole, RadioTower } from 'lucide-react';
import Results from './Results';
import { CRITERIA, TEAMS, ranking, validScores, weightedTotal, type Baselines, type JudgeId, type Submission } from '@/lib/hackathon/domain';

type JudgeData = { role: 'judge'; judge: { id: JudgeId; name: string }; baselines: Baselines; submissions: Submission[] };
type AdminData = { role: 'admin'; submissions: Submission[]; ranking: ReturnType<typeof ranking> };
type PortalData = JudgeData | AdminData;
const number = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (s: string) => new Date(s).toLocaleString('es-BO', { timeZone: 'America/La_Paz' });
const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
const inputClass = 'w-full rounded-xl border border-line-strong bg-ink-950 px-4 py-3 text-fg focus:outline-none focus:ring-2 focus:ring-signal';
function Contact() {
  return <p className="text-xs text-muted leading-relaxed">Correcciones: <a className="text-violet-200 underline underline-offset-4" href="https://wa.me/59168108299" target="_blank" rel="noopener noreferrer">IVAN ALEJANDRO MENDOZA MENDOZA (+59168108299)</a>.</p>;
}
export default function EvaluationPortal() {
  const [token, setToken] = useState('');
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('');
  const [scores, setScores] = useState<string[]>(Array(5).fill(''));
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Submission | null>(null);
  const [notice, setNotice] = useState('');
  const request = useCallback(async (accessToken: string, body?: unknown) => {
    const response = await fetch('/api/hackathon', {
      method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'No se pudo completar la solicitud.');
    return payload;
  }, []);
  const refresh = useCallback(async (accessToken: string) => {
    setLoading(true); setError('');
    try { const next = await request(accessToken); setData(next); return next as PortalData; }
    catch (e) { setError(e instanceof Error ? e.message : 'No hay conexión. Intenta nuevamente.'); return null; }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => {
    // Fragment credentials are never sent in page URLs, referrers, or server logs.
    const openAccess = () => {
      const accessToken = new URLSearchParams(window.location.hash.slice(1)).get('acceso') || '';
      setToken(accessToken); setData(null); setSelected(''); setReceipt(null); setConfirmed(false);
      if (accessToken) void refresh(accessToken);
      else { setLoading(false); setError('Abre el enlace personal que te envió la coordinación. Cada jurado tiene un acceso distinto.'); }
    };
    openAccess();
    window.addEventListener('hashchange', openAccess);
    return () => window.removeEventListener('hashchange', openAccess);
  }, [refresh]);
  const team = TEAMS.find(t => t.id === selected);
  const baseline = data?.role === 'judge' && team ? data.baselines?.[team.id] : null;
  const existing = data?.submissions.find(row => row.teamId === selected && (data.role !== 'judge' || row.judgeId === data.judge.id));
  const values = scores.map(s => s.trim() === '' ? NaN : Number(s));
  const valid = validScores(values, 5) && !!baseline;
  const total = valid ? weightedTotal([...values, baseline![5]]) : null;
  function choose(id: string) {
    setSelected(id); setConfirmed(false); setReceipt(null); setNotice(''); setError('');
    const partial = data?.role === 'judge' ? data.baselines?.[id as keyof Baselines] : null;
    setScores(partial ? partial.slice(0, 5).map(n => n === null ? '' : String(n)) : Array(5).fill(''));
  }
  async function send() {
    if (busy || !valid || !confirmed || !team || data?.role !== 'judge') return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request(token, { teamId: team.id, scores: values, confirmed: true });
      const saved = result.submission as Submission;
      setReceipt(saved);
      setData(current => current ? { ...current, submissions: [...current.submissions.filter(s => s.teamId !== saved.teamId), saved] } : current);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'No se pudo confirmar el envío.';
      // Recover the receipt if a successful write lost its response. Never assume failure means no write.
      const latest = await refresh(token);
      const saved = latest?.submissions.find(s => s.teamId === team.id);
      if (saved) { setReceipt(saved); setNotice('Ya existe una evaluación registrada para este equipo. Se muestra el comprobante guardado.'); }
      else setError(message);
    } finally { setBusy(false); }
  }
  return <main className={`${data?.role === 'admin' ? 'max-w-7xl' : 'max-w-5xl'} w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-safe`}>
    <header className="flex flex-wrap items-center justify-between gap-3 mb-6 border-b border-line pb-5">
      <div className="flex items-center gap-3"><RadioTower size={21} className="text-violet-300 shrink-0" /><h1 className="text-base sm:text-lg font-semibold">Telecom Innovation Hackathon</h1></div>
      <span className="text-xs text-muted">{data?.role === 'admin' ? 'Resultados' : 'Evaluación'}</span>
    </header>
    {error && <div role="alert" className="border border-bad/40 bg-bad/10 rounded-xl p-4 mb-6 text-sm">{error} {token && <button className="underline ml-2" onClick={() => void refresh(token)} disabled={busy || loading}>Volver a consultar</button>}</div>}
    {loading && <p role="status" className="text-muted py-6">Consultando evaluaciones guardadas…</p>}
    {data?.role === 'admin' && <Results data={data} loading={loading} refresh={() => void refresh(token)} />}
    {data?.role === 'judge' && <>
      <section className="rounded-2xl border border-line-strong bg-ink-900 p-5 sm:p-6 mb-6">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-5"><h2 className="font-semibold text-sm sm:text-base">{data.judge.name}</h2><span className="text-sm rounded-full px-3 py-1 bg-ok/10 text-ok">{data.submissions.length} de 5 enviados</span></div>
        <label htmlFor="team" className="block text-sm font-medium mb-2">Selecciona el equipo</label>
        <select id="team" value={selected} disabled={busy} onChange={e => choose(e.target.value)} className={inputClass}>
          <option value="">Elige un equipo para evaluar</option>
          {TEAMS.map(t => <option key={t.id} value={t.id}>{t.name} · {t.project}{data.submissions.some(s => s.teamId === t.id) ? ' — Enviado ✓' : ''}</option>)}
        </select>
        {data.submissions.length === 5 && <p className="text-ok text-sm mt-4">Completaste las cinco evaluaciones. Gracias por tu participación.</p>}
      </section>
      {team && <section className="mb-7">
        <p className="text-signal text-xs uppercase tracking-widest mb-2">{team.project}</p><h2 className="font-serif text-3xl mb-4">{team.name}</h2>
        <div className="flex flex-wrap gap-3"><a href={team.paper} target="_blank" rel="noopener noreferrer" className={`${button} bg-violet-500/15 text-violet-200 border border-violet-400/40 hover:bg-violet-500/25`}>Whitepaper / Roadmap <ExternalLink size={16} /></a><a href={team.pitch} target="_blank" rel="noopener noreferrer" className={`${button} bg-orange-500/15 text-orange-200 border border-orange-400/40 hover:bg-orange-500/25`}>Presentación / Demo <ExternalLink size={16} /></a></div>
      </section>}
      {team && (existing || receipt) ? <Receipt row={(receipt || existing)!} notice={notice} /> : team && baseline ? <form onSubmit={e => { e.preventDefault(); void send(); }}>
        <div className="border-l-2 border-amber-400/50 pl-4 mb-5 text-sm text-muted leading-relaxed space-y-2">
          <p>Las notas parciales corresponden a las calificaciones que cada jurado registró en la rúbrica impresa el día del hackathon. Al revisar el paper, las notas de los criterios 1–5 pueden <strong className="text-fg">aumentar o disminuir</strong> según la calidad del documento y el cumplimiento de cada aspecto de la rúbrica.</p>
          <p>El sistema muestra el aporte ponderado de cada nota (0–100) según su peso y calcula el total sobre 100. <strong className="text-amber-200">El criterio 6, Presentación y demostración, conserva su nota presencial fija y su ponderación del 10 %.</strong></p>
        </div>
        <div className="space-y-3">{CRITERIA.map((criterion, i) => <div key={criterion.name} className="rounded-2xl border border-line bg-ink-900 p-5 sm:p-6 grid sm:grid-cols-[1fr_160px] gap-4">
          <div><div className="flex gap-3 items-baseline mb-2"><span className="text-muted font-mono text-xs">0{i + 1}</span><label htmlFor={`score-${i}`} className="font-medium">{criterion.name}</label><span className="text-amber-200 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2 py-1 text-xs ml-auto shrink-0">{criterion.weight} %</span></div><p className="text-muted text-sm leading-relaxed">{criterion.description}</p><p className="text-sm mt-3">{i === 5 ? 'Nota presencial fija: ' : 'Calificación parcial: '}<strong>{baseline[i] === null ? 'Sin nota previa' : baseline[i]}</strong></p></div>
          <div><label htmlFor={`score-${i}`} className="text-xs text-muted block mb-2">{i === 5 ? 'Nota fija · no editable' : 'Nota final (0–100)'}</label><div className="relative"><input id={`score-${i}`} aria-label={`${criterion.name} — nota final`} type="number" inputMode="decimal" min="0" max="100" step="0.01" required readOnly={i === 5} disabled={busy} value={i === 5 ? baseline[5] : scores[i]} onChange={e => { setScores(current => current.map((s, index) => index === i ? e.target.value : s)); setConfirmed(false); }} className={`${inputClass} ${i === 5 ? 'text-muted pr-9' : ''}`} />{i === 5 && <LockKeyhole className="absolute right-3 top-3.5 text-muted" size={17} />}</div><p className="text-xs text-amber-200 bg-amber-400/5 rounded-lg px-2 py-2 mt-2">Aporte: {i === 5 ? number(baseline[5] * .1) : Number.isFinite(values[i]) && values[i] >= 0 && values[i] <= 100 ? number(values[i] * criterion.weight / 100) : '—'} puntos</p></div>
        </div>)}</div>
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-5 sm:p-6 mt-6"><div className="flex justify-between items-center gap-4 mb-5"><p className="font-medium">Puntaje final ponderado</p><p className="text-3xl font-serif text-emerald-300 whitespace-nowrap" aria-live="polite">{total === null ? '—' : number(total)}<span className="text-sm text-muted"> /100</span></p></div>
          <label className="flex items-start gap-3 text-sm leading-relaxed cursor-pointer"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} className="mt-1 h-4 w-4 accent-cyan-500 shrink-0" />Confirmo que revisé las notas. Entiendo que este envío es definitivo y no podré volver a evaluar este equipo.</label>
          <button type="submit" disabled={!valid || !confirmed || busy || loading} className={`${button} bg-emerald-400 text-ink-950 w-full mt-5 hover:bg-emerald-300`}>{busy ? 'Registrando evaluación…' : 'Enviar evaluación definitiva'}</button>
        </div>
      </form> : null}
    </>}
    <footer className="border-t border-line pt-5 mt-8"><Contact /></footer>
  </main>;
}
function Receipt({ row, notice }: { row: Submission; notice: string }) {
  return <section className="rounded-2xl border border-ok/40 bg-ok/5 p-5 sm:p-7" role="status">
    <div className="flex items-center gap-3 text-ok mb-3"><CheckCircle2 size={24} /><h2 className="text-xl font-semibold">Evaluación registrada</h2></div>
    {notice && <p className="text-sm mb-3">{notice}</p>}
    <p className="text-muted text-sm mb-5">Este equipo ya fue evaluado con tu acceso. El registro está cerrado.</p>
    <dl className="space-y-3">{CRITERIA.map((c, i) => <div key={c.name} className="flex justify-between gap-4 text-sm"><dt>{c.name} <span className="text-muted">({c.weight} %)</span></dt><dd className="font-semibold tabular">{row.scores[i]}</dd></div>)}</dl>
    <div className="border-t border-ok/20 mt-5 pt-5 flex justify-between"><span>Total ponderado</span><strong className="text-ok text-2xl">{number(row.total)} /100</strong></div>
    <p className="text-xs text-muted mt-5">Registrado: {date(row.submittedAt)} · Bolivia</p><p className="text-xs text-muted mt-2 break-all">Comprobante: {row.id}</p>
  </section>;
}
