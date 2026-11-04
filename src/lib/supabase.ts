import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client with service role key
export function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || supabaseUrl;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;
  return createClient(url, serviceKey);
}

export type Gasto = {
  id: string;
  created_at: string;
  fecha: string;
  categoria: string;
  proveedor: string;
  tipo_comprobante: string;
  monto_bob: number;
  monto_usd: number | null;
  pdf_url: string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  imagen_original: string | null;
};
