/** Safe messages for expense writes; never expose database details to the client. */
export function gastoWriteError(error: unknown, action: 'guardar' | 'actualizar') {
  if (error && typeof error === 'object' && 'code' in error && error.code === '23514'
    && 'message' in error && typeof error.message === 'string'
    && error.message.includes('gastos_tipo_comprobante_check')) {
    return {
      error: 'Este tipo de comprobante aún no está habilitado para guardar. Contacta al administrador; tus datos siguen en el formulario.',
      status: 503,
    };
  }
  return { error: `No se pudo ${action} el gasto. Puedes reintentar; tus datos siguen en el formulario.`, status: 500 };
}
