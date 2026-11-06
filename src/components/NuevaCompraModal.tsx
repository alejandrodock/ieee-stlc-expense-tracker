'use client';

import { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X, Calendar, Tag, FileText, DollarSign, Camera, Upload, Loader2, CheckCircle2,
  ChevronDown, ListChecks, MessageSquareQuote, FileUp, AlertTriangle, RefreshCw,
} from 'lucide-react';
import {
  CATEGORIAS, TIPOS_COMPROBANTE, TIPO_CAMBIO_USD,
  getCategoriaLabel, getTipoComprobanteLabel, generatePdfFilename, formatMonto,
  formatTipoCambio, todayLocal,
} from '@/lib/constants';
import DocumentScanner, { type ScanResult } from '@/components/scanner/DocumentScanner';

interface NuevaCompraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  saldoActual: number;
}

type Attachment =
  | { kind: 'image'; file: File }
  | { kind: 'pdf'; file: File; pages: number | null };

const MAX_PDF_MB = 20;

const inputCls =
  'w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all';

export default function NuevaCompraModal({ isOpen, onClose, onSuccess, saldoActual }: NuevaCompraModalProps) {
  const [fecha, setFecha] = useState(todayLocal);
  const [categoria, setCategoria] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [tipoComprobante, setTipoComprobante] = useState<string>('factura_ieee');
  const [montoBob, setMontoBob] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const montoNum = Math.round((parseFloat(montoBob) || 0) * 100) / 100;
  const nuevoSaldo = saldoActual - montoNum;
  const montoUsd = montoNum / TIPO_CAMBIO_USD;
  const isSubmitting = status !== null;

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleScanChange = useCallback((s: ScanResult | null) => setScan(s), []);

  const onImageChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setScan(null);
    setAttachment({ kind: 'image', file });
  };

  const onPdfChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setScan(null);
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('El archivo debe ser un PDF.');
      return;
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      setError(`El PDF supera ${MAX_PDF_MB} MB.`);
      return;
    }
    const { inspectPdf } = await import('@/lib/pdf/comprobante');
    const info = await inspectPdf(new Uint8Array(await file.arrayBuffer()));
    setAttachment({ kind: 'pdf', file, pages: info?.pages ?? null });
  };

  const clearAttachment = () => {
    setAttachment(null);
    setScan(null);
    setError(null);
  };

  const comprobantePendiente = attachment?.kind === 'image' && !scan;

  const handleSubmit = async () => {
    if (!categoria || !proveedor.trim() || montoNum <= 0 || comprobantePendiente) return;
    setError(null);
    const id = crypto.randomUUID();
    let tieneComprobante = false;

    try {
      if (attachment) {
        setStatus('Generando PDF…');
        const { buildScanPdf, buildAttachedPdf } = await import('@/lib/pdf/comprobante');
        const meta = {
          referencia: generatePdfFilename(fecha, categoria, proveedor.trim(), montoNum),
          fecha,
          proveedor: proveedor.trim(),
          categoria: getCategoriaLabel(categoria),
          tipoComprobante: getTipoComprobanteLabel(tipoComprobante),
          montoBob: formatMonto(montoNum),
          montoUsd: formatMonto(montoUsd),
          tipoCambio: formatTipoCambio(),
          descripcion: descripcion.trim() || null,
          observaciones: observaciones.trim() || null,
          generadoEn: new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date()),
        };

        let pdf: Uint8Array;
        if (attachment.kind === 'image') {
          pdf = await buildScanPdf(meta, scan!);
        } else {
          const result = await buildAttachedPdf(meta, new Uint8Array(await attachment.file.arrayBuffer()));
          pdf = result.bytes;
          if (!result.merged) console.warn('PDF adjunto protegido o inválido: se archiva sin portada.');
        }

        setStatus('Subiendo comprobante…');
        const urlRes = await fetch('/api/comprobantes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        if (!urlRes.ok) throw new Error((await urlRes.json().catch(() => null))?.error ?? 'No se pudo preparar la subida');
        const { signedUrl, maxBytes } = await urlRes.json();
        if (pdf.byteLength > maxBytes) throw new Error('El PDF generado es demasiado grande');

        const put = await fetch(signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
          body: new Blob([pdf as BlobPart], { type: 'application/pdf' }),
        });
        if (!put.ok) throw new Error('No se pudo subir el comprobante');
        tieneComprobante = true;
      }

      setStatus('Guardando gasto…');
      const res = await fetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          fecha,
          categoria,
          proveedor: proveedor.trim(),
          descripcion: descripcion.trim() || null,
          observaciones: observaciones.trim() || null,
          tipo_comprobante: tipoComprobante,
          monto_bob: montoNum,
          tiene_comprobante: tieneComprobante,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo guardar el gasto');

      setStatus(null);
      onSuccess();
      onClose();
    } catch (e) {
      console.error('Submit error:', e);
      setError(e instanceof Error ? e.message : 'Error al guardar. Inténtalo de nuevo.');
      setStatus(null);
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nueva-compra-title"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={handleClose} />

      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-lg max-h-[94dvh] overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950 rounded-t-3xl sm:rounded-2xl border border-white/10 shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl">
          <div>
            <h2 id="nueva-compra-title" className="text-lg font-bold text-white">Registrar Compra</h2>
            <p className="text-xs text-slate-400">Paso {step} de 3</p>
          </div>
          <button onClick={handleClose} disabled={isSubmitting} aria-label="Cerrar" className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-40">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="px-6 pt-4">
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`h-1 flex-1 rounded-full transition-all duration-500 ${s <= step ? 'bg-gradient-to-r from-blue-500 to-cyan-400' : 'bg-slate-800'}`} />
            ))}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* STEP 1 */}
          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="fecha" className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" /> Fecha de Compra
                </label>
                <input id="fecha" type="date" value={fecha} max={todayLocal()} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="categoria" className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <Tag className="w-3.5 h-3.5 text-purple-400" /> Categoría del Presupuesto
                </label>
                <div className="relative">
                  <select id="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
                    <option value="" className="bg-slate-800">Seleccionar categoría...</option>
                    {CATEGORIAS.map((cat) => (
                      <option key={cat.value} value={cat.value} className="bg-slate-800">{cat.icon} {cat.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="proveedor" className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <FileText className="w-3.5 h-3.5 text-green-400" /> Proveedor / Empresa
                </label>
                <input id="proveedor" type="text" maxLength={200} value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Ej: Imprenta Gutenberg, Hipermaxi..." className={inputCls} />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="descripcion" className="flex items-center justify-between text-xs font-medium text-slate-300">
                  <span className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-cyan-400" /> Descripción / Elementos que contiene</span>
                  <span className="text-[10px] text-slate-500">Múltiples items</span>
                </label>
                <textarea id="descripcion" rows={2} maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: 3 cajas de café, 200 vasos térmicos, azúcar y servilletas..." className={`${inputCls} resize-none py-2`} />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="observaciones" className="flex items-center justify-between text-xs font-medium text-slate-300">
                  <span className="flex items-center gap-2"><MessageSquareQuote className="w-3.5 h-3.5 text-amber-400" /> Observaciones</span>
                  <span className="text-[10px] text-slate-500 font-normal">Opcional</span>
                </label>
                <input id="observaciones" type="text" maxLength={1000} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ej: Proveedor sin talonario de factura, descuento por pronto pago..." className={`${inputCls} py-2.5`} />
              </div>

              <div className="space-y-1.5">
                <span className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <FileText className="w-3.5 h-3.5 text-amber-400" /> Tipo de Comprobante
                </span>
                <div className="grid grid-cols-1 gap-2" role="radiogroup">
                  {TIPOS_COMPROBANTE.map((tipo) => {
                    const sel = tipoComprobante === tipo.value;
                    return (
                      <button
                        key={tipo.value} type="button" role="radio" aria-checked={sel}
                        onClick={() => setTipoComprobante(tipo.value)}
                        className={`px-3.5 py-2.5 rounded-xl text-xs text-left transition-all flex items-center justify-between border ${
                          sel ? 'bg-blue-500/20 border-blue-500/60 text-blue-200 shadow-sm' : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="font-medium">{tipo.label}</span>
                        {sel && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!categoria || !proveedor.trim() || !fecha}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold hover:from-blue-500 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
              >
                Siguiente (Monto) →
              </button>
            </motion.div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="monto" className="flex items-center gap-2 text-xs font-medium text-slate-300">
                  <DollarSign className="w-4 h-4 text-emerald-400" /> Monto en Bolivianos (BOB)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">Bs.</span>
                  <input
                    id="monto" type="number" inputMode="decimal" step="0.01" min="0" value={montoBob}
                    onChange={(e) => setMontoBob(e.target.value)} placeholder="0.00" autoFocus
                    className="w-full pl-14 pr-4 py-4 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  />
                </div>
              </div>

              {montoNum > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-gradient-to-br from-slate-800/80 to-slate-800/40 border border-slate-700/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Equivalente USD (T.C. {formatTipoCambio()})</span>
                    <span className="text-xs font-semibold text-slate-200">$ {formatMonto(montoUsd)}</span>
                  </div>
                  <div className="h-px bg-slate-700/50" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Saldo actual disponible</span>
                    <span className="text-xs text-slate-300">Bs. {formatMonto(saldoActual)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Descuento de esta compra</span>
                    <span className="text-xs text-red-400 font-medium">- Bs. {formatMonto(montoNum)}</span>
                  </div>
                  <div className="h-px bg-slate-700/50" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Nuevo Saldo Restante</span>
                    <span className={`text-base font-bold ${nuevoSaldo >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Bs. {formatMonto(nuevoSaldo)}</span>
                  </div>
                  {nuevoSaldo < 0 && (
                    <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">⚠️ Este gasto sobrepasa el presupuesto disponible</p>
                  )}
                </motion.div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl border border-slate-700/50 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-all">← Atrás</button>
                <button
                  onClick={() => setStep(3)} disabled={montoNum <= 0}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold hover:from-blue-500 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
                >
                  Siguiente (Comprobante) →
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: receipt */}
          {step === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span className="flex items-center gap-2"><Camera className="w-3.5 h-3.5 text-pink-400" /> Comprobante (factura o recibo)</span>
                {attachment && !isSubmitting && (
                  <button type="button" onClick={clearAttachment} className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Cambiar
                  </button>
                )}
              </div>

              {!attachment && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { ref: cameraInputRef, icon: Camera, title: 'Escanear', sub: 'Cámara', border: 'hover:border-blue-500/50', bg: 'bg-blue-500/10', text: 'text-blue-400' },
                    { ref: fileInputRef, icon: Upload, title: 'Imagen', sub: 'Galería', border: 'hover:border-purple-500/50', bg: 'bg-purple-500/10', text: 'text-purple-400' },
                    { ref: pdfInputRef, icon: FileUp, title: 'PDF', sub: 'Recibo digital', border: 'hover:border-emerald-500/50', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
                  ].map(({ ref, icon: Icon, title, sub, border, bg, text }) => (
                    <button
                      key={title} type="button" onClick={() => ref.current?.click()}
                      className={`flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-dashed border-slate-700/60 hover:bg-white/5 transition-all group ${border}`}
                    >
                      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                        <Icon className={`w-5 h-5 ${text}`} />
                      </div>
                      <span className="text-xs font-medium text-slate-200">{title}</span>
                      <span className="text-[10px] text-slate-500">{sub}</span>
                    </button>
                  ))}
                </div>
              )}

              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onImageChosen} className="hidden" />
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={onImageChosen} className="hidden" />
              <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" onChange={onPdfChosen} className="hidden" />

              {attachment?.kind === 'image' && <DocumentScanner file={attachment.file} onScanChange={handleScanChange} />}

              {attachment?.kind === 'pdf' && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <FileUp className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{attachment.file.name}</p>
                    <p className="text-[11px] text-emerald-200/80">
                      {(attachment.file.size / 1024 / 1024).toFixed(2)} MB
                      {attachment.pages ? ` · ${attachment.pages} página(s) · se agregará una portada de rendición` : ' · PDF protegido: se archivará tal cual'}
                    </p>
                  </div>
                </div>
              )}

              {!attachment && (
                <p className="text-[11px] text-slate-500 text-center">Puedes guardar sin comprobante y adjuntarlo en un registro nuevo más tarde.</p>
              )}

              {/* Summary */}
              <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1.5 text-xs">
                <div className="flex justify-between gap-4"><span className="text-slate-400">Proveedor:</span><span className="text-slate-200 font-medium text-right truncate">{proveedor}</span></div>
                {descripcion && <div className="flex justify-between gap-4"><span className="text-slate-400 flex-shrink-0">Detalle:</span><span className="text-slate-300 text-right truncate">{descripcion}</span></div>}
                {observaciones && <div className="flex justify-between gap-4"><span className="text-amber-400/90 flex-shrink-0">Observaciones:</span><span className="text-slate-300 text-right truncate">{observaciones}</span></div>}
                <div className="flex justify-between gap-4"><span className="text-slate-400">Tipo:</span><span className="text-slate-200 text-right">{getTipoComprobanteLabel(tipoComprobante)}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Monto:</span><span className="text-emerald-400 font-bold">Bs. {formatMonto(montoNum)}</span></div>
              </div>

              {error && (
                <p role="alert" className="text-xs text-red-300 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/30 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {error}
                </p>
              )}
              {comprobantePendiente && (
                <p className="text-[11px] text-amber-300 text-center">Pulsa «Recortar y escanear» para preparar el comprobante.</p>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(2)} disabled={isSubmitting} className="flex-1 py-3 rounded-xl border border-slate-700/50 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-all disabled:opacity-40">← Atrás</button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || comprobantePendiente}
                  className="flex-[1.4] py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-sm font-semibold hover:from-emerald-500 hover:to-teal-400 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {status}</> : <><CheckCircle2 className="w-4 h-4" /> Guardar Compra</>}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
