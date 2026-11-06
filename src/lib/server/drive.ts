import 'server-only';
import { Readable } from 'stream';
import { drive as googleDrive, auth as googleAuth } from '@googleapis/drive';

/**
 * Optional copy of each receipt PDF to Google Drive.
 *
 * Enabled only when GOOGLE_DRIVE_FOLDER_ID and the service-account credentials are set.
 * NOTE: a service account has no storage quota of its own, so the folder must live in a
 * Shared Drive (Google Workspace) where the service account is a member; uploads into a
 * personal "My Drive" folder fail with `storageQuotaExceeded`. Failures never block the
 * main flow – the PDF is always stored in Supabase Storage first.
 */
export function isDriveSyncEnabled(): boolean {
  return Boolean(
    process.env.GOOGLE_DRIVE_FOLDER_ID?.trim() &&
      process.env.GOOGLE_DRIVE_CLIENT_EMAIL &&
      process.env.GOOGLE_DRIVE_PRIVATE_KEY
  );
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

export async function uploadToDrive(filename: string, pdf: Uint8Array): Promise<{ fileId: string; webViewLink: string | null }> {
  const auth = new googleAuth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
      private_key: normalizePrivateKey(process.env.GOOGLE_DRIVE_PRIVATE_KEY ?? ''),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  const drive = googleDrive({ version: 'v3', auth });
  const res = await drive.files.create({
    requestBody: { name: filename, mimeType: 'application/pdf', parents: [process.env.GOOGLE_DRIVE_FOLDER_ID!.trim()] },
    media: { mimeType: 'application/pdf', body: Readable.from(Buffer.from(pdf)) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error('Drive no devolvió un id');
  return { fileId: res.data.id, webViewLink: res.data.webViewLink ?? null };
}
