export const CRITERIA = [
  { name: 'Innovación y originalidad', description: 'Creatividad, diferenciación y carácter disruptivo.', weight: 20 },
  { name: 'Viabilidad técnica', description: 'Fundamento matemático, arquitectura, simulaciones y consistencia técnica.', weight: 25 },
  { name: 'Impacto y pertinencia', description: 'Relevancia del problema y contribución al ecosistema tecnológico nacional.', weight: 20 },
  { name: 'Escalabilidad', description: 'Crecimiento, replicabilidad y potencial de implementación.', weight: 15 },
  { name: 'Viabilidad financiera', description: 'Presupuesto, optimización de recursos y sostenibilidad económica.', weight: 10 },
  { name: 'Presentación y demostración', description: 'Claridad del pitch, calidad de la demo y respuestas al jurado.', weight: 10 },
] as const;
export const TEAMS = [
  { id: 'tilcayos', name: 'Los Tilcayos 2.0', project: 'SAT BENI', paper: 'https://drive.google.com/open?id=1LhD5jxHqSbzsAg7CvEqyElBJGp2NH-S5', pitch: 'https://canva.link/sp6cit8pwxngafb' },
  { id: 'f1-char', name: 'f1+Char', project: 'KALLPA EDGE - YUNGAS SALUD', paper: 'https://drive.google.com/open?id=1J8DvHowQfzSg1N3IVUyIpbSZBEQ8yC5B', pitch: 'https://reto04triajeia-b6xbwzujsicmnoxnoxulkb.streamlit.app/' },
  { id: 'novax', name: 'NOVAX', project: 'SAT BOLIVIA', paper: 'https://drive.google.com/file/d/1-bBWvQi-qtuerseaTLw9jHpbX832U9Dt/view?usp=drivesdk', pitch: 'https://canva.link/g1y083bm9imth32' },
  { id: 'code-alchemist', name: 'Code Alchemist', project: 'SALUD ENLACE', paper: 'https://drive.google.com/open?id=1pNWcdORDqFne81DmS-9S-IkOVL26xfTW', pitch: 'https://www.canva.com/design/DAHaQJ-5Iqo/DCNTG9UbOeeI_yAeMDAqmA/edit' },
  { id: 'ldg', name: 'LDG', project: 'ECOBORDE MED', paper: 'https://drive.google.com/open?id=1oLC65neqwELkRVOYXSisjJr8dMdZ_uld', pitch: 'https://drive.google.com/file/d/1_zz-qwlbV9ziKBFtE9zI3_lv3JAfwEhx/view?usp=drive_link' },
] as const;
export const JUDGES = [
  { id: 'ivan', name: 'IVAN ALEJANDRO MENDOZA MENDOZA' },
  { id: 'fabian', name: 'MARCO FABIAN BORDA WIEGERT' },
  { id: 'eloy', name: 'ELOY RICARDO SERRUDO CAREAGA' },
] as const;
export type JudgeId = typeof JUDGES[number]['id'];
export type TeamId = typeof TEAMS[number]['id'];
export type Baseline = [number | null, number | null, number | null, number | null, number | null, number];
export type Baselines = Record<TeamId, Baseline>;
export type Submission = { id: string; judgeId: JudgeId; teamId: TeamId; baseline: Baseline; scores: number[]; total: number; submittedAt: string };
export const INITIAL_SCORES: Record<JudgeId, Baselines> = {
  ivan: { tilcayos: [null,null,null,null,null,95], ldg: [null,null,null,null,null,80], novax: [null,null,null,null,null,90], 'code-alchemist': [null,null,null,null,null,75], 'f1-char': [null,null,null,null,null,30] },
  fabian: { tilcayos: [75,95,95,95,80,85], ldg: [80,95,90,90,70,70], novax: [85,95,95,95,95,95], 'code-alchemist': [80,85,90,90,70,75], 'f1-char': [85,70,80,70,60,20] },
  eloy: { tilcayos: [90,80,95,80,80,90], ldg: [80,80,90,70,70,61], novax: [90,85,95,90,80,95], 'code-alchemist': [80,60,85,75,80,65], 'f1-char': [75,80,85,65,65,60] },
};
export function validScores(value: unknown, length = 6): value is number[] {
  return Array.isArray(value) && value.length === length && value.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-8);
}
export function weightedTotal(scores: number[]): number {
  return Math.round(scores.reduce((sum, score, i) => sum + score * CRITERIA[i].weight, 0)) / 100;
}
export function ranking(submissions: Submission[]) {
  return TEAMS.map(team => {
    const entries = submissions.filter(row => row.teamId === team.id);
    return { ...team, count: entries.length, average: entries.length ? Math.round(entries.reduce((sum, row) => sum + row.total, 0) / entries.length * 100) / 100 : null };
  }).sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
}
