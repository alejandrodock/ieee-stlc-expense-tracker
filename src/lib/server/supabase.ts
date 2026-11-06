import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service-role key.
 * Fails loudly when misconfigured instead of silently falling back to the anon key.
 */
export function getServerSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase no está configurado (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  }
  client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
