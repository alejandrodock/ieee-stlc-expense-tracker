import test from 'node:test';
import assert from 'node:assert/strict';
import { gastoWriteError } from '../auto-registro-fondos-ieee/src/lib/server/gasto-errors.ts';

test('receipt constraint failures give an actionable message for creates and edits without leaking row data', () => {
  for (const action of ['guardar', 'actualizar']) {
    const failure = gastoWriteError({ code: '23514', message: 'new row violates check constraint "gastos_tipo_comprobante_check"', details: 'private row data' }, action);
    assert.equal(failure.status, 503);
    assert.match(failure.error, /tipo de comprobante.*Contacta al administrador/);
    assert.doesNotMatch(failure.error, /private|constraint|23514/);
  }
});

test('unrelated write errors do not incorrectly report a receipt migration issue', () => {
  for (const error of [null, new Error('private data'), { code: '23514', message: 'gastos_project_amounts' }, { code: '23505', message: 'gastos_tipo_comprobante_check' }]) {
    assert.equal(gastoWriteError(error, 'guardar').status, 500);
    assert.match(gastoWriteError(error, 'actualizar').error, /actualizar el gasto/);
    assert.doesNotMatch(gastoWriteError(error, 'guardar').error, /private|administrador|gastos_project_amounts/);
  }
});
