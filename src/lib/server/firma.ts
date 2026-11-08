import 'server-only';

/**
 * Firma digital del responsable (PNG con fondo transparente).
 * Vive SOLO en la variable de entorno FIRMA_PNG_BASE64 (Vercel / .env.local),
 * nunca en el repositorio, que es público.
 */
export function getFirmaPng(): Buffer | null {
  const b64 = process.env.FIRMA_PNG_BASE64?.trim();
  if (!b64) return null;
  try {
    const buf = Buffer.from(b64, 'base64');
    // Firma PNG: 89 50 4E 47
    return buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47 ? buf : null;
  } catch {
    return null;
  }
}

/** Width/height in px read from the PNG header. */
export function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
