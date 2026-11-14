import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const stlcId = '623ca6f5-70ca-4fa7-95a0-41aec20238cc';
const hartId = '623ca6f5-70ca-4fa7-95a0-41aec20238cd';
let rows = [
  { id: stlcId, project_id: 'STLC', fecha: '2026-11-01', created_at: '2026-11-01T10:00:00Z', categoria: 'catering', proveedor: 'Proveedor STLC histórico', monto_bob: 115.8, monto_usd: 10, descripcion: 'Gasto histórico', observaciones: null, tipo_comprobante: 'recibo', pdf_url: null, drive_url: null, media: [] },
  { id: hartId, project_id: 'HART', fecha: '2026-11-02', created_at: '2026-11-02T10:00:00Z', categoria: 'vuelos', proveedor: 'Proveedor HART previo', original_amount: 100, original_currency: 'USD', exchange_rate: 1, amount_usd: 100, has_receipt: true, pdf_url: `/api/hart/comprobantes/${hartId}` },
];
const files = new Map();
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const url = new URL(req.url, 'http://127.0.0.1:54399');
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const json = () => JSON.parse(body.toString() || '{}');
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  try {
    if (url.pathname === '/rest/v1/gastos') {
      if (req.method === 'POST') {
        const input = json(); const row = Array.isArray(input) ? input[0] : input;
        if (!['STLC','HART'].includes(row.project_id)) return send(400, { message: 'Missing explicit project' });
        if (rows.some(e => e.id === row.id)) return send(409, { message: 'Duplicate ID' });
        rows.push({ ...row, created_at: new Date().toISOString() });
        return send(201, { ...row, created_at: new Date().toISOString() });
      }
      const project = url.searchParams.get('project_id');
      if (!['eq.STLC', 'eq.HART'].includes(project)) return send(400, { message: 'Test rejects queries without project scope' });
      let selected = rows.filter(e => e.project_id === project.slice(3));
      const id = url.searchParams.get('id'); if (id) selected = selected.filter(e => e.id === id.slice(3));
      if (req.method === 'DELETE') rows = rows.filter(e => !selected.includes(e));
      if (req.method === 'PATCH') selected.forEach(e => Object.assign(e, json()));
      if (req.headers.accept?.includes('vnd.pgrst.object+json')) return send(200, selected[0] ?? null);
      return send(200, selected);
    }
    if (url.pathname.startsWith('/storage/v1/bucket')) return send(200, { id: 'hart-comprobantes', public: false });
    const prefix = '/storage/v1/object/';
    if (url.pathname.startsWith(prefix)) {
      let key = decodeURIComponent(url.pathname.slice(prefix.length));
      if (key.startsWith('upload/sign/')) {
        key = key.slice('upload/sign/'.length);
        if (req.method === 'POST') return send(200, { url: `/object/upload/sign/${key}?token=test` });
      } else if (key.startsWith('sign/')) {
        key = key.slice('sign/'.length);
        if (req.method === 'POST') return send(200, { signedURL: `/object/authenticated/${key}?token=test` });
      } else if (key.startsWith('authenticated/')) key = key.slice('authenticated/'.length);
      if (req.method === 'DELETE') { for (const path of json().prefixes ?? []) files.delete(`${key}/${path}`); return send(200, []); }
      if (req.method === 'PUT' || req.method === 'POST') {
        files.set(key, { bytes: body, type: req.headers['content-type'] ?? 'application/pdf' });
        return send(200, { Key: key, Id: crypto.randomUUID() });
      }
      const file = files.get(key);
      if (!file) return send(404, { message: 'Not found' });
      res.writeHead(200, { 'Content-Type': file.type }); res.end(file.bytes); return;
    }
    send(404, { message: 'Unsupported fixture request' });
  } catch (e) { send(500, { message: String(e) }); }
});
await new Promise(resolve => server.listen(54399, '127.0.0.1', resolve));
const child = spawn(process.execPath, ['--import', new URL('./preload.mjs', import.meta.url).href, '../node_modules/next/dist/bin/next', 'start', '-p', '3100', '-H', '127.0.0.1'], {
  cwd: fileURLToPath(new URL('../auto-registro-fondos-ieee', import.meta.url)), stdio: 'inherit',
  env: { ...process.env, SUPABASE_URL: 'http://127.0.0.1:54399', NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
    GOOGLE_DRIVE_SCRIPT_URL: '', GOOGLE_DRIVE_SCRIPT_SECRET: '', GOOGLE_DRIVE_FOLDER_ID: '', FIRMA_PNG_BASE64: '', HART_BUDGET_USD: '9000', NEXT_TELEMETRY_DISABLED: '1' },
});
const shutdown = () => { child.kill(); server.close(); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
child.on('exit', code => { server.close(); process.exitCode = code ?? 0; });
