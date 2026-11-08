import 'server-only';
import { Readable } from 'stream';
import { drive as googleDrive, auth as googleAuth } from '@googleapis/drive';

/**
 * Optional copy of each receipt PDF to Google Drive. Two modes:
 *
 * 1. Apps Script (recommended for a personal Gmail Drive): set GOOGLE_DRIVE_SCRIPT_URL and
 *    GOOGLE_DRIVE_SCRIPT_SECRET. The web app in `scripts/drive-upload.gs` runs as the Drive
 *    owner, so files land in their own "My Drive" with their quota.
 * 2. Service account: GOOGLE_DRIVE_FOLDER_ID + GOOGLE_DRIVE_CLIENT_EMAIL + GOOGLE_DRIVE_PRIVATE_KEY.
 *    A service account has no storage quota, so the folder must be in a Shared Drive.
 *
 * Failures never block the main flow – the PDF is always stored in Supabase Storage first.
 */
const scriptUrl = () => process.env.GOOGLE_DRIVE_SCRIPT_URL?.trim();
const scriptSecret = () => process.env.GOOGLE_DRIVE_SCRIPT_SECRET?.trim();

function scriptMode(): boolean {
  return Boolean(scriptUrl() && scriptSecret());
}

function serviceAccountMode(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() &&
      process.env.GOOGLE_DRIVE_CLIENT_EMAIL &&
      process.env.GOOGLE_DRIVE_PRIVATE_KEY
  );
}

export function isDriveSyncEnabled(): boolean {
  return scriptMode() || serviceAccountMode();
}

/** Accepts keys with literal "\n", real newlines, or pasted on a single line. */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n');
  if (key.includes('\n')) return key;
  const m = key.match(/-----BEGIN ([A-Z ]+)-----(.*)-----END \1-----/);
  if (!m) return key;
  const body = m[2].replace(/\s+/g, '').match(/.{1,64}/g)?.join('\n') ?? '';
  key = `-----BEGIN ${m[1]}-----\n${body}\n-----END ${m[1]}-----\n`;
  return key;
}

async function callScript<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(scriptUrl()!, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, secret: scriptSecret() }),
    redirect: 'follow',
  });
  const text = await res.text();
  let data: { error?: string } & T;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Apps Script respondió algo inesperado (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || data.error) throw new Error(`Apps Script: ${data.error ?? `HTTP ${res.status}`}`);
  return data;
}

function serviceAccountDrive() {
  const auth = new googleAuth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      private_key: normalizePrivateKey(process.env.GOOGLE_DRIVE_PRIVATE_KEY ?? ''),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return googleDrive({ version: 'v3', auth });
}

export async function uploadToDrive(
  filename: string,
  pdf: Uint8Array,
  subfolder?: string,
): Promise<{ fileId: string; webViewLink: string | null }> {
  if (scriptMode()) {
    const r = await callScript<{ id: string; url: string }>({
      action: 'upload',
      filename,
      subfolder: subfolder ?? null,
      pdf: Buffer.from(pdf).toString('base64'),
    });
    return { fileId: r.id, webViewLink: r.url ?? null };
  }

  const res = await serviceAccountDrive().files.create({
    requestBody: { name: filename, mimeType: 'application/pdf', parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!.trim()] },
    media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(pdf)) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error('Drive no devolvió un id');
  return { fileId: res.data.id, webViewLink: res.data.webViewLink ?? null };
}

/** Moves a previously synced receipt to the Drive trash (recoverable for 30 days). */
export async function trashInDrive(fileId: string): Promise<void> {
  if (scriptMode()) {
    await callScript({ action: 'trash', fileId });
    return;
  }
  if (serviceAccountMode()) {
    await serviceAccountDrive().files.update({ fileId, requestBody: { trashed: true }, supportsAllDrives: true });
  }
}
