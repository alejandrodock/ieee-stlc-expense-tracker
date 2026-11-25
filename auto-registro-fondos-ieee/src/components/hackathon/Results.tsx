'use client';
import { Fragment, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { CRITERIA, JUDGES, TEAMS, ranking, type Submission } from '@/lib/hackathon/domain';

type Props = {
  data: { submissions: Submission[]; ranking: ReturnType<typeof ranking> };
  loading: boolean;
  refresh: () => void;
};
const number = (value: number) => value.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed';
const judgeColors = ['text-sky-200 bg-sky-400/5', 'text-violet-200 bg-violet-400/5', 'text-rose-200 bg-rose-400/5'];

export default function Results({ data, loading, refresh }: Props) {
  const [selected, setSelected] = useState<string>(TEAMS[0].id);
  const team = TEAMS.find(t => t.id === selected)!;
  const entries = data.submissions.filter(s => s.teamId === selected);
  const summary = data.ranking.find(t => t.id === selected)!;
  const complete = data.submissions.length === 15;
  function download() {
    const rows: (string | number)[][] = [[
      'Equipo', 'Proyecto', 'Jurado', ...CRITERIA.map(c => `${c.name} parcial`),
      ...CRITERIA.flatMap(c => [`${c.name} final`, `${c.name} peso (%)`, `${c.name} aporte ponderado`]),
      'Total ponderado /100', 'Fecha UTC', 'Comprobante',
    ]];
    for (const judge of JUDGES) for (const team of TEAMS) {
      const row = data.submissions.find(s => s.judgeId === judge.id && s.teamId === team.id);
      if (row) rows.push([
        team.name, team.project, judge.name, ...row.baseline.map(n => n ?? 'Sin nota previa'),
        ...CRITERIA.flatMap((c, i) => [row.scores[i], c.weight, Math.round(row.scores[i] * c.weight) / 100]),
        row.total, row.submittedAt, row.id,
      ]);
    }
    const csv = '\ufeff' + rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'telecom-hackathon-evaluaciones.csv'; link.click();
    URL.revokeObjectURL(url);
  }
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <p className="text-emerald-300 text-sm font-semibold">{data.submissions.length} / 15 evaluaciones registradas</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={refresh} disabled={loading} className={`${button} border border-sky-400/30 text-sky-200 bg-sky-400/10 hover:bg-sky-400/20`}><RefreshCw size={16} />Actualizar</button>
        <button onClick={download} disabled={!data.submissions.length} className={`${button} border border-emerald-400/30 text-emerald-200 bg-emerald-400/10 hover:bg-emerald-400/20`}><Download size={16} />Exportar CSV</button>
      </div>
    </div>
    <p className="text-xs text-muted mb-4"><span className={complete ? 'text-emerald-300' : 'text-amber-200'}>{complete ? 'Evaluación completa.' : 'Resultados provisionales.'}</span> Promedios de envíos recibidos; pendientes excluidos.</p>
    <div className="overflow-x-auto rounded-2xl border border-line-strong bg-ink-900" tabIndex={0} role="region" aria-label="Resumen de resultados">
      <table className="w-full text-sm text-left">
        <caption className="sr-only">Resultados por equipo y jurado</caption>
        <thead className="bg-ink-800"><tr>
          <th scope="col" className="p-4">Equipo</th>
          {JUDGES.map((judge, i) => <th scope="col" key={judge.id} className={`p-4 min-w-40 text-xs leading-relaxed ${judgeColors[i]}`}>{judge.name}</th>)}
          <th scope="col" className="p-4 text-emerald-200">Promedio /100</th><th scope="col" className="p-4">Avance</th>
        </tr></thead>
        <tbody>{data.ranking.map(team => <tr key={team.id} className="border-t border-line">
          <th scope="row" className="p-4 font-medium min-w-44"><button onClick={() => setSelected(team.id)} className="text-left hover:text-violet-200 underline decoration-violet-400/40 underline-offset-4">{team.name}</button><span className="block text-xs text-muted mt-1">{team.project}</span></th>
          {JUDGES.map((judge, i) => {
            const entry = data.submissions.find(s => s.teamId === team.id && s.judgeId === judge.id);
            return <td key={judge.id} className={`p-4 tabular ${judgeColors[i]}`}>{entry ? number(entry.total) : <span className="text-muted">Pendiente</span>}</td>;
          })}
          <td className="p-4 font-semibold text-emerald-300 bg-emerald-400/5 tabular">{team.average === null ? '—' : number(team.average)}</td>
          <td className="p-4 whitespace-nowrap">{team.count} de 3</td>
        </tr>)}</tbody>
      </table>
    </div>

    <section className="mt-8" aria-labelledby="team-detail-title">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        <h2 id="team-detail-title" className="text-lg font-semibold">Detalle por criterio</h2>
        <div className="w-full sm:w-auto sm:min-w-72">
          <label htmlFor="results-team" className="sr-only">Equipo para ver resultados detallados</label>
          <select id="results-team" value={selected} onChange={e => setSelected(e.target.value)} className="w-full rounded-xl border border-violet-400/30 bg-ink-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400">
            {TEAMS.map(team => <option key={team.id} value={team.id}>{team.name} · {team.project}</option>)}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="font-semibold">{team.name} <span className="font-normal text-muted text-xs">· {team.project}</span></h3>
        <span className="text-xs text-muted">{entries.length} de 3 jurados · Nota × peso = aporte</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line-strong bg-ink-900" tabIndex={0} role="region" aria-label={`Detalle de ${team.name}`}>
        <table className="w-full text-sm text-right tabular">
          <caption className="sr-only">Puntajes y ponderaciones de {team.name}</caption>
          <thead>
            <tr className="bg-ink-800">
              <th scope="col" rowSpan={2} className="p-4 text-left min-w-48">Criterio</th>
              <th scope="col" rowSpan={2} className="p-3 text-amber-200">Peso</th>
              {JUDGES.map((judge, i) => <th scope="colgroup" key={judge.id} colSpan={2} className={`px-3 py-4 text-center text-xs min-w-40 leading-relaxed border-l border-line ${judgeColors[i]}`}>{judge.name}</th>)}
              <th scope="colgroup" colSpan={2} className="px-3 py-4 text-center text-emerald-200 bg-emerald-400/5 border-l border-line">Promedio</th>
            </tr>
            <tr className="text-xs text-muted border-t border-line">
              {JUDGES.map(judge => <Fragment key={judge.id}><th scope="col" className="p-3 border-l border-line">Nota /100</th><th scope="col" className="p-3 text-amber-200">Aporte</th></Fragment>)}
              <th scope="col" className="p-3 border-l border-line">Nota /100</th><th scope="col" className="p-3 text-emerald-200 bg-emerald-400/5">Aporte</th>
            </tr>
          </thead>
          <tbody>{CRITERIA.map((criterion, index) => {
            const mean = entries.length ? entries.reduce((sum, row) => sum + row.scores[index], 0) / entries.length : null;
            return <tr key={criterion.name} className="border-t border-line">
              <th scope="row" className="p-4 text-left font-normal">{criterion.name}</th>
              <td className="p-3 text-amber-200 bg-amber-400/5 whitespace-nowrap">{criterion.weight} %</td>
              {JUDGES.map((judge, i) => {
                const entry = entries.find(s => s.judgeId === judge.id);
                return <Fragment key={judge.id}>
                  <td className={`p-3 border-l border-line ${judgeColors[i]}`}>{entry ? number(entry.scores[index]) : <span className="text-muted text-xs">Pendiente</span>}</td>
                  <td className="p-3 text-amber-200">{entry ? number(entry.scores[index] * criterion.weight / 100) : '—'}</td>
                </Fragment>;
              })}
              <td className="p-3 border-l border-line">{mean === null ? '—' : number(mean)}</td>
              <td className="p-3 text-emerald-200 bg-emerald-400/5 font-semibold">{mean === null ? '—' : number(mean * criterion.weight / 100)}</td>
            </tr>;
          })}</tbody>
          <tfoot><tr className="border-t border-emerald-400/30 bg-emerald-400/5">
            <th scope="row" className="p-4 text-left text-emerald-200">Total ponderado /100</th><td className="p-3 text-amber-200">100 %</td>
            {JUDGES.map(judge => {
              const entry = entries.find(s => s.judgeId === judge.id);
              return <td key={judge.id} colSpan={2} className="p-3 text-emerald-200 font-semibold border-l border-line">{entry ? number(entry.total) : '—'}</td>;
            })}
            <td colSpan={2} className="p-3 text-emerald-300 font-bold border-l border-line">{summary.average === null ? '—' : number(summary.average)}</td>
          </tr></tfoot>
        </table>
      </div>
      <div className="mt-4 space-y-2">{entries.map(row => <details key={row.id} className="rounded-xl border border-line p-4">
        <summary className="cursor-pointer text-xs text-muted">Notas parciales y finales · {JUDGES.find(j => j.id === row.judgeId)?.name}</summary>
        <div className="overflow-x-auto mt-3"><table className="w-full text-sm text-left">
          <caption className="sr-only">Comparación de notas de {JUDGES.find(j => j.id === row.judgeId)?.name}</caption>
          <thead><tr className="text-muted"><th scope="col" className="py-2 pr-3">Criterio</th><th scope="col" className="p-2">Parcial</th><th scope="col" className="p-2">Final</th><th scope="col" className="p-2 text-amber-200">Ponderación</th></tr></thead>
          <tbody>{CRITERIA.map((criterion, i) => <tr key={criterion.name} className="border-t border-line"><th scope="row" className="py-3 pr-3 font-normal">{criterion.name}</th><td className="p-2">{row.baseline[i] ?? '—'}</td><td className="p-2">{row.scores[i]}</td><td className="p-2 text-amber-200 whitespace-nowrap">{row.scores[i]} × {criterion.weight} % = {number(row.scores[i] * criterion.weight / 100)}</td></tr>)}</tbody>
        </table></div>
        <p className="text-xs text-muted mt-3">{new Date(row.submittedAt).toLocaleString('es-BO', { timeZone: 'America/La_Paz' })} · Bolivia</p>
      </details>)}</div>
    </section>
  </>;
}
