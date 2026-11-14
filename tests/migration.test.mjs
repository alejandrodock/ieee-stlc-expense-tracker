import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('migration preserves legacy STLC rows, defaults old inserts to STLC, and isolates the summary', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE gastos (
        id uuid PRIMARY KEY, fecha date NOT NULL, created_at timestamptz DEFAULT now(),
        categoria text NOT NULL, proveedor text NOT NULL, monto_bob numeric(12,2) NOT NULL CHECK (monto_bob > 0),
        monto_usd numeric(12,2), pdf_url text, drive_url text, tipo_comprobante text
      );
      CREATE TABLE gasto_media (id uuid PRIMARY KEY, gasto_id uuid REFERENCES gastos(id) ON DELETE CASCADE);
      CREATE VIEW resumen_categorias AS SELECT categoria, COUNT(*) as total_gastos, SUM(monto_bob) as total_bob, SUM(monto_usd) as total_usd, MIN(fecha) as primera_fecha, MAX(fecha) as ultima_fecha FROM gastos GROUP BY categoria ORDER BY total_bob DESC;
      INSERT INTO gastos VALUES ('623ca6f5-70ca-4fa7-95a0-41aec20238cc','2026-11-01','2026-11-01T10:00:00Z','catering','STLC histórico',115.80,10,'/api/comprobantes/old','https://drive.google.com/old','recibo');
    `);
    const before = (await db.query('SELECT * FROM gastos')).rows;
    const migration = await readFile(new URL('../auto-registro-fondos-ieee/supabase/migrations/20261113_add_multi_project_support.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // idempotent rerun
    const after = (await db.query('SELECT * FROM gastos')).rows;
    for (const key of Object.keys(before[0])) assert.deepEqual(after[0][key], before[0][key], key);
    assert.equal(after[0].project_id, 'STLC');
    await db.exec(`INSERT INTO gastos (id,fecha,categoria,proveedor,monto_bob,monto_usd) VALUES ('623ca6f5-70ca-4fa7-95a0-41aec20238cd','2026-11-02','catering','Legacy insert',11.58,1)`);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM gastos WHERE project_id=\'STLC\'')).rows[0].n, 2);
    await db.exec(`INSERT INTO gastos (id,fecha,categoria,proveedor,project_id,original_amount,original_currency,exchange_rate,amount_usd,has_receipt,signer_name,pdf_url) VALUES ('623ca6f5-70ca-4fa7-95a0-41aec20238ce','2026-11-03','alimentacion','HART nuevo','HART',18,'USD',1,18,false,'Voluntario','/api/hart/comprobantes/new')`);
    const summary = (await db.query('SELECT * FROM resumen_categorias')).rows;
    assert.equal(summary.length, 1);
    assert.equal(Number(summary[0].total_usd), 11);
    assert.equal(Number(summary[0].total_bob), 127.38);
    await assert.rejects(db.exec(`UPDATE gastos SET original_amount=25, amount_usd=25 WHERE project_id='HART'`), /gastos_project_amounts/);
    await assert.rejects(db.exec(`UPDATE gastos SET signer_name=NULL WHERE project_id='HART'`), /gastos_project_amounts/);
    await db.exec('SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM gastos'), /permission denied/);
    await db.exec('RESET ROLE; SET ROLE authenticated');
    await assert.rejects(db.query('SELECT * FROM gastos'), /permission denied/);
  } finally { await db.close(); }
});
