import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('custom receipt types can be inserted and edited without changing historical expenses', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE gastos (
        id serial PRIMARY KEY,
        tipo_comprobante text NOT NULL CHECK (tipo_comprobante IN ('factura', 'factura_ieee', 'factura_personal', 'recibo', 'sin_comprobante')),
        monto_bob numeric(12,2) NOT NULL
      );
      INSERT INTO gastos (tipo_comprobante, monto_bob) VALUES
        ('factura', 350), ('factura_ieee', 100), ('factura_personal', 20), ('recibo', 30), ('sin_comprobante', 10);
    `);
    const before = (await db.query('SELECT * FROM gastos ORDER BY id')).rows;
    const custom = 'Factura a nombre de Fabian Borda';
    const insert = 'INSERT INTO gastos (tipo_comprobante, monto_bob) VALUES ($1, 350) RETURNING id';
    await assert.rejects(db.query(insert, [custom]), /gastos_tipo_comprobante_check/);

    const migration = await readFile(new URL('../auto-registro-fondos-ieee/supabase/migrations/20261115_tipos_comprobante_personalizados.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT * FROM gastos ORDER BY id')).rows, before);

    const { rows: [saved] } = await db.query(insert, [custom]);
    assert.equal((await db.query('SELECT tipo_comprobante FROM gastos WHERE id=$1', [saved.id])).rows[0].tipo_comprobante, custom);
    await db.query('UPDATE gastos SET tipo_comprobante=$1 WHERE id=$2', ['Recibo a nombre de otra persona', saved.id]);
    assert.equal((await db.query('SELECT tipo_comprobante FROM gastos WHERE id=$1', [saved.id])).rows[0].tipo_comprobante, 'Recibo a nombre de otra persona');
    await db.query(insert, ['x'.repeat(100)]);
    for (const invalid of ['', '   ', 'x'.repeat(101)]) {
      await assert.rejects(db.query(insert, [invalid]), /gastos_tipo_comprobante_check/);
    }
    await assert.rejects(db.query(insert, [null]), /not-null constraint/);
  } finally {
    await db.close();
  }
});
