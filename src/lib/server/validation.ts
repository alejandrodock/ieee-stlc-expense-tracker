import 'server-only';
import { CATEGORIAS, TIPOS_COMPROBANTE, TIPO_CAMBIO_USD } from '@/lib/constants';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export type GastoInput = {
  id: string;
  fecha: string;
  categoria: string;
  proveedor: string;
  descripcion: string | null;
  observaciones: string | null;
  tipo_comprobante: string;
  monto_bob: number;
  monto_usd: number;
  tiene_comprobante: boolean;
};

type Result = { ok: true; data: GastoInput } | { ok: false; error: string };

function optionalText(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (t.length > max) return undefined;
  return t || null;
}

function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

/** Validates and normalises the body of POST /api/gastos. USD is computed server-side. */
export function parseGastoInput(body: unknown): Result {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Cuerpo inválido' };
  const b = body as Record<string, unknown>;

  if (!isUuid(b.id)) return { ok: false, error: 'id inválido' };
  if (!isValidDate(b.fecha)) return { ok: false, error: 'Fecha inválida' };
  if (!CATEGORIAS.some((c) => c.value === b.categoria)) return { ok: false, error: 'Categoría inválida' };
  if (!TIPOS_COMPROBANTE.some((t) => t.value === b.tipo_comprobante)) {
    return { ok: false, error: 'Tipo de comprobante inválido' };
  }
  const proveedor = typeof b.proveedor === 'string' ? b.proveedor.trim() : '';
  if (!proveedor || proveedor.length > 200) return { ok: false, error: 'Proveedor inválido' };

  const descripcion = optionalText(b.descripcion, 2000);
  const observaciones = optionalText(b.observaciones, 1000);
  if (descripcion === undefined || observaciones === undefined) return { ok: false, error: 'Texto demasiado largo' };

  const monto = typeof b.monto_bob === 'number' ? b.monto_bob : Number(b.monto_bob);
  if (!Number.isFinite(monto) || monto <= 0 || monto > 10_000_000) return { ok: false, error: 'Monto inválido' };
  const monto_bob = Math.round(monto * 100) / 100;

  return {
    ok: true,
    data: {
      id: b.id,
      fecha: b.fecha,
      categoria: b.categoria as string,
      proveedor,
      descripcion,
      observaciones,
      tipo_comprobante: b.tipo_comprobante as string,
      monto_bob,
      monto_usd: Math.round((monto_bob / TIPO_CAMBIO_USD) * 100) / 100,
      tiene_comprobante: b.tiene_comprobante === true,
    },
  };
}
