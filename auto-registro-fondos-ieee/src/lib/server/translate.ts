import 'server-only';

/**
 * Traducción automática (ES → EN) de los textos libres que escribe el usuario
 * (proveedor, descripción, observaciones, tipos de comprobante personalizados…).
 * No modifica la base de datos: se traduce al momento de exportar.
 *
 * Proveedor (por orden de preferencia, según variables de entorno):
 *   1. DEEPL_API_KEY            → DeepL API (free o pro)
 *   2. GOOGLE_TRANSLATE_API_KEY → Google Cloud Translation v2
 *   3. sin clave                → endpoint público de Google Translate (gratuito)
 * Si la traducción falla, se conserva el texto original para que la exportación nunca se rompa.
 */

const TIMEOUT_MS = 8000;
const CONCURRENCY = 6;
const CACHE_MAX = 2000;

/** Caché en memoria: sobrevive entre solicitudes mientras la función siga "caliente". */
const cache = new Map<string, string>();

function remember(src: string, out: string) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(src, out);
}

/** Textos que no vale la pena traducir (vacíos, números, códigos, URLs, correos). */
function needsTranslation(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (!/\p{L}{2,}/u.test(t)) return false;
  if (/^(https?:\/\/|www\.)\S+$/i.test(t) || /^\S+@\S+\.\S+$/.test(t)) return false;
  return true;
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const decodeEntities = (s: string) =>
  s.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function deepl(texts: string[], key: string): Promise<string[]> {
  const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const out: string[] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const chunk = texts.slice(i, i + 50);
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
  for (let i = 0; i < texts.length; i += 100) {
    const chunk = texts.slice(i, i + 100);
    const data = (await fetchJson(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: chunk, target: 'en', format: 'text' }),
    })) as { data: { translations: { translatedText: string }[] } };
    out.push(...data.data.translations.map((t) => decodeEntities(t.translatedText)));
  }
  return out;
}

/** Endpoint público de Google Translate (sin clave). Un texto por solicitud. */
async function googleFree(text: string): Promise<string> {
  const data = (await fetchJson('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({ q: text }).toString(),
  })) as [[string, string][] | null];
  const segments = data?.[0];
  if (!Array.isArray(segments)) throw new Error('Respuesta inesperada');
  const joined = segments.map((s) => s?.[0] ?? '').join('');
  return joined || text;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Traduce al inglés una lista de textos. Devuelve una función `tr(texto)` que da la
 * traducción (o el original si no se pudo traducir).
 */
export async function translateToEnglish(texts: Iterable<string | null | undefined>): Promise<(s: string | null | undefined) => string> {
  const pending = [...new Set([...texts].filter((s): s is string => !!s && needsTranslation(s)).map((s) => s.trim()))]
    .filter((s) => !cache.has(s));

  if (pending.length) {
    const deeplKey = process.env.DEEPL_API_KEY?.trim();
    const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
    let translated: (string | null)[] | null = null;

    try {
      if (deeplKey) translated = await deepl(pending, deeplKey);
      else if (googleKey) translated = await googleCloud(pending, googleKey);
    } catch (err) {
      console.error('Traducción con API configurada falló, se usa el servicio gratuito:', err);
    }
    if (!translated) {
      translated = await mapLimit(pending, CONCURRENCY, (s) =>
        googleFree(s).catch((err) => {
          console.error('No se pudo traducir:', s.slice(0, 60), err);
          return null;
        }),
      );
    }
    pending.forEach((src, i) => {
      const out = translated?.[i];
      if (out) remember(src, out.trim());
    });
  }

  return (s) => {
    if (!s) return s ?? '';
    return cache.get(s.trim()) ?? s;
  };
}
