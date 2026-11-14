import { NextRequest, NextResponse } from 'next/server';
import { db, EXPENSE_COLUMNS } from './db';
import { buildHartReport } from '../report';
import { DEFAULT_BUDGET_USD, type Expense } from '../domain';

export function hartBudget() {
  const configured = Number(process.env.HART_BUDGET_USD ?? DEFAULT_BUDGET_USD);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_BUDGET_USD;
}
export async function GET(req: NextRequest) {
  try {
    const { data, error } = await db().from('gastos').select(EXPENSE_COLUMNS).eq('project_id', 'HART').order('fecha');
    if (error) throw error;
    const file = await buildHartReport(data as Expense[], req.nextUrl.origin, hartBudget());
    return new NextResponse(new Uint8Array(file), { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Rendicion_IEEE_HART_2026.xlsx"', 'Cache-Control': 'no-store',
    } });
  } catch (e) {
    console.error('HART export:', e);
    return NextResponse.json({ error: 'No se pudo exportar HART.' }, { status: 500 });
  }
}
