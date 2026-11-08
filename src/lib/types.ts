/** A photo or video attached to an expense (stored in the private `evidencias` bucket). */
export type GastoMedia = {
  id: string;
  nombre: string | null;
  mime_type: string;
  created_at: string;
};

/** A registered expense as returned by GET /api/gastos (never includes heavy blobs). */
export type Gasto = {
  id: string;
  created_at: string;
  fecha: string;
  categoria: string;
  proveedor: string;
  descripcion: string | null;
  observaciones: string | null;
  tipo_comprobante: string;
  monto_bob: number;
  monto_usd: number | null;
  /** App-relative link to the receipt PDF (e.g. /api/comprobantes/<id>), if any. */
  pdf_url: string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  /** Photos / videos (max. 3). Open each one with `mediaUrl(id)`. */
  media?: GastoMedia[];
};

/** Columns selected for list views – keep in sync with `Gasto`. */
export const GASTO_COLUMNS =
  'id, created_at, fecha, categoria, proveedor, descripcion, observaciones, tipo_comprobante, monto_bob, monto_usd, pdf_url, drive_file_id, drive_url, media:gasto_media(id, nombre, mime_type, created_at)';

export const mediaUrl = (id: string) => `/api/media/${id}`;
