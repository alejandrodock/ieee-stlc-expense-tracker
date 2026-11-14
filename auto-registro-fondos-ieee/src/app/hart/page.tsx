import HartDashboard from '@hart/Dashboard';
import { hartBudget } from '@hart/server/export';
export const metadata = { title: 'IEEE HART 2026 · Travel Grant' };
export const dynamic = 'force-dynamic';
export default function HartPage() { return <HartDashboard budget={hartBudget()} />; }
