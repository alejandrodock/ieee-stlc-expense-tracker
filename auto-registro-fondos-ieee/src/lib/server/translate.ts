import 'server-only';
import { getServerSupabase } from '@/lib/server/supabase';

/**
 * Traducción automática (ES → EN) de los textos libres que escribe el usuario
 * (proveedor, descripción, observaciones, tipos de comprobante personalizados…).
 * No modifica la tabla de gastos: se traduce al momento de exportar.
 *
 * Servicio (por orden de preferencia):
 *   1. DEEPL_API_KEY            → DeepL API (free o pro)
 *   2. GOOGLE_TRANSLATE_API_KEY → Google Cloud Translation v2
 *   3. sin clave                → Google Translate público, en lotes (pocas solicitudes)
 *   4. respaldo por texto       → MyMemory (gratuito)
 *
 * Cada traducción se guarda de forma permanente en Supabase Storage (bucket privado
 * `traducciones`, archivo `es-en.json`): un texto se traduce una sola vez y solo los
 * textos nuevos o editados vuelven a consultar el servicio. Si todo falla, se conserva
 * el texto original para que la exportación nunca se rompa.
 */

const BUCKET = 'traducciones';
const OBJECT = 'es-en.json';
const TIMEOUT_MS = 10000;
const BATCH_MAX_ITEMS = 40;
const BATCH_MAX_CHARS = 4500;

/** Caché en memoria (función "caliente") + copia persistente en Storage. */
const cache = new Map<string, string>();
let storeLoaded = false;

/** Textos que no vale la pena traducir (vacíos, números, códigos, URLs, correos). */
function needsTranslation(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (!/\p{L}{2,}/u.test(t)) return false;
  if (/^(https?:\/\/|www\.)\S+$/i.test(t) || /^\S+@\S+\.\S+$/.test(t)) return false;
  return true;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch con tiempo límite y reintentos ante 429 / 5xx. */
async function fetchJson(url: string, init: RequestInit, retries = 2): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
    if (res.ok) return res.json();
    if (attempt < retries && (res.status === 429 || res.status >= 500)) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
}

const decodeEntities = (s: string) =>
  s.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Divide en lotes respetando un máximo de elementos y de caracteres. */
function chunks(texts: string[]): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let len = 0;
  for (const t of texts) {
    if (cur.length && (cur.length >= BATCH_MAX_ITEMS || len + t.length > BATCH_MAX_CHARS)) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(t);
    len += t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

async function deepl(texts: string[], key: string): Promise<string[]> {
  const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const out: string[] = [];
  for (const chunk of chunks(texts)) {
    const data = (await fetchJson(`https://${host}/v2/translate`, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: chunk, target_lang: 'EN-US' }),
    })) as { translations: { text: string }[] };
    out.push(...data.translations.map((t) => t.text));
  }
  return out;
}

async function googleCloud(texts: string[], key: string): Promise<string[]> {
  const out: string[] = [];
  for (const chunk of chunks(texts)) {
    const data = (await fetchJson(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: chunk, target: 'en', format: 'text' }),
    })) as { data: { translations: { translatedText: string }[] } };
    out.push(...data.data.translations.map((t) => decodeEntities(t.translatedText)));
  }
  return out;
}

/** Google Translate público: varios textos por solicitud. Los lotes que fallan quedan en null. */
async function googleFreeBatch(texts: string[]): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (const chunk of chunks(texts)) {
    try {
      const body = new URLSearchParams();
      chunk.forEach((t) => body.append('q', t));
      const data = (await fetchJson('https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&tl=en&format=text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: body.toString(),
      })) as unknown[];
      if (!Array.isArray(data)) throw new Error('Respuesta inesperada');
      // Con un solo texto la respuesta puede ser ["trad", "es"] en lugar de [["trad", "es"]].
      const items = chunk.length === 1 && typeof data[0] === 'string' ? [data[0]] : data;
      if (items.length !== chunk.length) throw new Error('Respuesta inesperada');
      out.push(...items.map((item) =>
        Array.isArray(item) && typeof item[0] === 'string' ? item[0] : typeof item === 'string' ? item : null,
      ));
    } catch (err) {
      console.error('Lote de traducción falló (Google):', err);
      out.push(...chunk.map(() => null));
    }
  }
  return out;
}

/** Respaldo gratuito, un texto por solicitud. */
async function myMemory(text: string): Promise<string | null> {
  try {
    const data = (await fetchJson(
      `https://api.mymemory.translated.net/get?langpair=es|en&q=${encodeURIComponent(text.slice(0, 480))}`,
      { method: 'GET' },
      1,
    )) as { responseStatus?: number; responseData?: { translatedText?: string } };
    const t = data.responseData?.translatedText;
    if (Number(data.responseStatus) !== 200 || !t || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) return null;
    return decodeEntities(t);
  } catch {
    return null;
  }
}

// ── Caché persistente en Supabase Storage ─────────────────────
async function loadStore() {
  if (storeLoaded) return;
  try {
    const { data, error } = await getServerSupabase().storage.from(BUCKET).download(OBJECT);
    if (!error && data) {
      const saved = JSON.parse(await data.text()) as Record<string, string>;
      for (const [k, v] of Object.entries(saved)) if (!cache.has(k)) cache.set(k, v);
    }
    storeLoaded = true;
  } catch (err) {
    console.error('No se pudo leer la caché de traducciones:', err);
  }
}

async function saveStore() {
  const sb = getServerSupabase();
  const body = JSON.stringify(Object.fromEntries(cache));
  const upload = () => sb.storage.from(BUCKET).upload(OBJECT, body, { contentType: 'application/json', upsert: true });
  try {
    let { error } = await upload();
    if (error && /not.?found|bucket/i.test(error.message)) {
      await sb.storage.createBucket(BUCKET, { public: false });
      ({ error } = await upload());
    }
    if (error) throw error;
  } catch (err) {
    console.error('No se pudo guardar la caché de traducciones:', err);
  }
}

/**
 * Traduce al inglés una lista de textos. Devuelve una función `tr(texto)` que da la
 * traducción (o el original si no se pudo traducir).
 */
export async function translateToEnglish(texts: Iterable<string | null | undefined>): Promise<(s: string | null | undefined) => string> {
  const wanted = [...new Set([...texts].filter((s): s is string => !!s && needsTranslation(s)).map((s) => s.trim()))];
  if (wanted.some((s) => !cache.has(s))) await loadStore();
  const pending = wanted.filter((s) => !cache.has(s));

  if (pending.length) {
    const deeplKey = process.env.DEEPL_API_KEY?.trim();
    const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
    let translated: (string | null)[] = pending.map(() => null);

    try {
      if (deeplKey) translated = await deepl(pending, deeplKey);
      else if (googleKey) translated = await googleCloud(pending, googleKey);
    } catch (err) {
      console.error('Traducción con API configurada falló, se usa el servicio gratuito:', err);
    }

    let missing = pending.map((_, i) => i).filter((i) => !translated[i]);
    if (missing.length) {
      const res = await googleFreeBatch(missing.map((i) => pending[i]));
      missing.forEach((idx, j) => { if (res[j]) translated[idx] = res[j]; });
    }
    missing = pending.map((_, i) => i).filter((i) => !translated[i]);
    for (const idx of missing) translated[idx] = await myMemory(pending[idx]);

    let added = 0;
    pending.forEach((src, i) => {
      const out = translated[i]?.trim();
      if (out) {
        cache.set(src, out);
        added++;
      }
    });
    const failed = pending.length - added;
    if (failed) console.error(`Traducción: ${failed} de ${pending.length} textos quedaron en el idioma original.`);
    if (added) await saveStore();
  }

  return (s) => {
    if (!s) return s ?? '';
    return cache.get(s.trim()) ?? s;
  };
}
