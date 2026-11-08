'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import MediaPicker from '@/components/media/MediaPicker';
import InAppCamera from '@/components/scanner/InAppCamera';

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

/** Draft saved locally so a page reload (e.g. Android discarding the tab) doesn't lose the form. */
export const DRAFT_KEY = 'nueva-compra-draft';
type Draft = {
  fecha: string; categoria: string; proveedor: string; descripcion: string;
  observaciones: string; tipoComprobante: string; montoBob: string; step: number;
};
function loadDraft(): Partial<Draft> {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') ?? {}; } catch { return {}; }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

const inputCls =
  'w-full px-4 py-3 bg-ink-800 border border-line rounded-xl text-fg text-sm placeholder:text-faint focus:outline-none focus:border-brand-soft/60 focus:ring-2 focus:ring-brand/30 transition-all';

export default function NuevaCompraModal({ isOpen, onClose, onSuccess, saldoActual }: NuevaCompraModalProps) {
  const [draft] = useState(loadDraft);
  const [fecha, setFecha] = useState(draft.fecha ?? todayLocal());
  const [categoria, setCategoria] = useState(draft.categoria ?? '');
  const [proveedor, setProveedor] = useState(draft.proveedor ?? '');
  const [descripcion, setDescripcion] = useState(draft.descripcion ?? '');
  const [observaciones, setObservaciones] = useState(draft.observaciones ?? '');
  const [tipoComprobante, setTipoComprobante] = useState<string>(draft.tipoComprobante ?? 'factura_personal');
  const [montoBob, setMontoBob] = useState(draft.montoBob ?? '');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaProgress, setMediaProgress] = useState<(number | undefined)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(draft.step ?? 1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const montoNum = Math.round((parseFloat(montoBob) || 0) * 100) / 100;
  const nuevoSaldo = saldoActual - montoNum;
  const montoUsd = montoNum / TIPO_CAMBIO_USD;
  const isSubmitting = status !== null;

  useEffect(() => {
    const d: Draft = { fecha, categoria, proveedor, descripcion, observaciones, tipoComprobante, montoBob, step };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* ignore */ }
  }, [fecha, categoria, proveedor, descripcion, observaciones, tipoComprobante, montoBob, step]);

  const handleClose = () => {
    if (isSubmitting) return;
    clearDraft();
    onClose();
  };

  const openCamera = () => {
    if (typeof navigator !== 'undefined' && 'mediaDevices' in navigator && window.isSecureContext) setCameraOpen(true);
    else cameraInputRef.current?.click();
  };
  const onCameraUnavailable = useCallback(() => {
    setCameraOpen(false);
    cameraInputRef.current?.click();
  }, []);
  const onCameraCapture = (file: File) => {
    setCameraOpen(false);
    setError(null);
    setScan(null);
    setAttachment({ kind: 'image', file });
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
  const esGastoMenor = tipoComprobante === 'sin_comprobante';

  const onCategoriaChange = (value: string) => {
    setCategoria(value);
    // Taxis y pasajes casi nunca tienen factura.
    if (value === 'operativos') setTipoComprobante('sin_comprobante');
    else if (categoria === 'operativos' && tipoComprobante === 'sin_comprobante') setTipoComprobante('factura_personal');
  };

  const handleSubmit = async () => {
    if (!categoria || !proveedor.trim() || montoNum <= 0 || comprobantePendiente) return;
    setError(null);
    const id = crypto.randomUUID();
    let tieneComprobante = false;

    try {
      if (attachment || esGastoMenor) {
        setStatus('Generando PDF…');
        const { buildScanPdf, buildAttachedPdf, buildDeclaracionPdf } = await import('@/lib/pdf/comprobante');
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
        if (!attachment) {
          pdf = await buildDeclaracionPdf(meta);
        } else if (attachment.kind === 'image') {
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

      // Fotos / videos: el gasto ya está guardado, así que un fallo aquí no lo deshace.
      const fallidos: string[] = [];
      if (mediaFiles.length) {
        const { uploadMedia } = await import('@/lib/media-client');
        for (let i = 0; i < mediaFiles.length; i++) {
          setStatus(`Subiendo multimedia ${i + 1} de ${mediaFiles.length}…`);
          try {
            await uploadMedia(id, mediaFiles[i], (p) =>
              setMediaProgress((prev) => { const next = [...prev]; next[i] = p; return next; }),
            );
          } catch (err) {
            console.error('Media upload error:', err);
            fallidos.push(mediaFiles[i].name);
          }
        }
      }

      setStatus(null);
      clearDraft();
      onSuccess();
      onClose();
      if (fallidos.length) {
        alert(`El gasto se guardó, pero no se pudo subir: ${fallidos.join(', ')}.\nPuedes agregarlo luego con el botón «Fotos» del gasto.`);
      }
    } catch (e) {
      console.error('Submit error:', e);
      setError(e instanceof Error ? e.message : 'Error al guardar. Inténtalo de nuevo.');
      setStatus(null);
    }
  };

  if (!isOpen) return null;

  return (
    <>
    {cameraOpen && <InAppCamera onCapture={onCameraCapture} onClose={() => setCameraOpen(false)} onUnavailable={onCameraUnavailable} />}
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nueva-compra-title"
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={handleClose} />

      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-lg max-h-[94dvh] overflow-y-auto bg-ink-900 rounded-t-3xl sm:rounded-2xl border border-line-strong shadow-2xl shadow-black/50"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-ink-900/95 backdrop-blur-md border-b border-line px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl">
          <div>
            <h2 id="nueva-compra-title" className="font-serif text-2xl text-fg leading-none">Registrar compra</h2>
            <p className="mt-1.5 text-[11px] uppercase tracking-[0.14em] text-faint">Paso {step} de 3 · {['Datos', 'Monto', 'Comprobante'][step - 1]}</p>
          </div>
          <button onClick={handleClose} disabled={isSubmitting} aria-label="Cerrar" className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-40">
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="px-6 pt-4">
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`h-[3px] flex-1 rounded-full transition-colors duration-500 ${s <= step ? 'bg-brand-soft' : 'bg-white/[0.07]'}`} />
            ))}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* STEP 1 */}
          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="fecha" className="flex items-center gap-2 text-xs font-medium text-muted">
                  <Calendar className="w-3.5 h-3.5 text-faint" /> Fecha de Compra
                </label>
                <input id="fecha" type="date" value={fecha} max={todayLocal()} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="categoria" className="flex items-center gap-2 text-xs font-medium text-muted">
                  <Tag className="w-3.5 h-3.5 text-faint" /> Categoría del Presupuesto
                </label>
                <div className="relative">
                  <select id="categoria" value={categoria} onChange={(e) => onCategoriaChange(e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
                    <option value="" className="bg-ink-800">Seleccionar categoría...</option>
                    {CATEGORIAS.map((cat) => (
                      <option key={cat.value} value={cat.value} className="bg-ink-800">{cat.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="proveedor" className="flex items-center gap-2 text-xs font-medium text-muted">
                  <FileText className="w-3.5 h-3.5 text-faint" /> Proveedor o empresa
                </label>
                <input id="proveedor" type="text" maxLength={200} value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder={categoria === 'operativos' ? 'Ej: Taxi, Trufi, Minibús, Teleférico...' : 'Ej: Imprenta Gutenberg, Hipermaxi...'} className={inputCls} />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="descripcion" className="flex items-center justify-between text-xs font-medium text-muted">
                  <span className="flex items-center gap-2"><ListChecks className="w-3.5 h-3.5 text-faint" /> Descripción de los elementos</span>
                  <span className="text-[10px] text-faint">Múltiples items</span>
                </label>
                <textarea id="descripcion" rows={2} maxLength={2000} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej: 3 cajas de café, 200 vasos térmicos, azúcar y servilletas..." className={`${inputCls} resize-none py-2`} />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="observaciones" className="flex items-center justify-between text-xs font-medium text-muted">
                  <span className="flex items-center gap-2"><MessageSquareQuote className="w-3.5 h-3.5 text-faint" /> Observaciones</span>
                  <span className="text-[10px] text-faint font-normal">Opcional</span>
                </label>
                <input id="observaciones" type="text" maxLength={1000} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ej: Proveedor sin talonario de factura, descuento por pronto pago..." className={`${inputCls} py-2.5`} />
              </div>

              <div className="space-y-1.5">
                <span className="flex items-center gap-2 text-xs font-medium text-muted">
                  <FileText className="w-3.5 h-3.5 text-faint" /> Tipo de Comprobante
                </span>
                <div className="grid grid-cols-1 gap-2" role="radiogroup">
                  {TIPOS_COMPROBANTE.map((tipo) => {
                    const sel = tipoComprobante === tipo.value;
                    return (
                      <button
                        key={tipo.value} type="button" role="radio" aria-checked={sel}
                        onClick={() => setTipoComprobante(tipo.value)}
                        className={`px-3.5 py-2.5 rounded-xl text-xs text-left transition-all flex items-center justify-between border ${
                          sel ? 'bg-brand/15 border-brand-soft/50 text-fg' : 'bg-ink-800 border-line text-muted hover:text-fg hover:bg-white/[0.03]'
                        }`}
                      >
                        <span className="font-medium">{tipo.label}</span>
                        {sel && <CheckCircle2 className="w-4 h-4 text-brand-soft" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!categoria || !proveedor.trim() || !fecha}
                className="w-full py-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Continuar
              </button>
            </motion.div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="monto" className="flex items-center gap-2 text-xs font-medium text-muted">
                  <DollarSign className="w-4 h-4 text-faint" /> Monto en Bolivianos (BOB)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted text-lg">Bs.</span>
                  <input
                    id="monto" type="number" inputMode="decimal" step="0.01" min="0" value={montoBob}
                    onChange={(e) => setMontoBob(e.target.value)} placeholder="0.00" autoFocus
                    className="w-full pl-14 pr-4 py-4 bg-ink-800 border border-line rounded-xl text-fg font-serif text-3xl tabular focus:outline-none focus:border-brand-soft/60 focus:ring-2 focus:ring-brand/30 transition-all"
                  />
                </div>
              </div>

              {montoNum > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-ink-850 border border-line space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Equivalente USD (T.C. {formatTipoCambio()})</span>
                    <span className="text-xs font-semibold text-fg">$ {formatMonto(montoUsd)}</span>
                  </div>
                  <div className="h-px bg-line" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Saldo actual disponible</span>
                    <span className="text-xs text-fg/80">Bs. {formatMonto(saldoActual)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Descuento de esta compra</span>
                    <span className="text-xs text-fg/80 tabular">− Bs. {formatMonto(montoNum)}</span>
                  </div>
                  <div className="h-px bg-line" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-fg">Nuevo Saldo Restante</span>
                    <span className={`text-base font-semibold tabular ${nuevoSaldo >= 0 ? 'text-fg' : 'text-bad'}`}>Bs. {formatMonto(nuevoSaldo)}</span>
                  </div>
                  {nuevoSaldo < 0 && (
                    <p className="text-xs text-bad bg-bad/10 px-3 py-2 rounded-lg border border-bad/25">Este gasto sobrepasa el presupuesto disponible</p>
                  )}
                </motion.div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl border border-line-strong text-fg/80 text-sm font-medium hover:bg-white/5 transition-colors">Atrás</button>
                <button
                  onClick={() => setStep(3)} disabled={montoNum <= 0}
                  className="flex-1 py-3 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Continuar
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: receipt */}
          {step === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="flex items-center justify-between text-xs font-medium text-muted">
                <span className="flex items-center gap-2"><Camera className="w-3.5 h-3.5 text-faint" /> Comprobante (factura o recibo)</span>
                {attachment && !isSubmitting && (
                  <button type="button" onClick={clearAttachment} className="text-[11px] text-muted hover:text-fg flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" /> Cambiar
                  </button>
                )}
              </div>

              {!attachment && (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { ref: cameraInputRef, open: openCamera, icon: Camera, title: 'Escanear', sub: 'Cámara', border: 'hover:border-brand-soft/50', bg: 'bg-brand/15', text: 'text-brand-soft' },
                    { ref: fileInputRef, icon: Upload, title: 'Imagen', sub: 'Galería', border: 'hover:border-brand-soft/50', bg: 'bg-brand/15', text: 'text-brand-soft' },
                    { ref: pdfInputRef, icon: FileUp, title: 'PDF', sub: 'Recibo digital', border: 'hover:border-brand-soft/50', bg: 'bg-brand/15', text: 'text-brand-soft' },
                  ].map(({ ref, open, icon: Icon, title, sub, border, bg, text }: { ref: React.RefObject<HTMLInputElement | null>; open?: () => void; icon: typeof Camera; title: string; sub: string; border: string; bg: string; text: string }) => (
                    <button
                      key={title} type="button" onClick={() => (open ? open() : ref.current?.click())}
                      className={`flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border border-dashed border-line-strong hover:bg-white/[0.03] transition-colors group ${border}`}
                    >
                      <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center `}>
                        <Icon className={`w-5 h-5 ${text}`} />
                      </div>
                      <span className="text-xs font-medium text-fg">{title}</span>
                      <span className="text-[10px] text-faint">{sub}</span>
                    </button>
                  ))}
                </div>
              )}

              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={onImageChosen} className="hidden" />
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={onImageChosen} className="hidden" />
              <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" onChange={onPdfChosen} className="hidden" />

              {attachment?.kind === 'image' && <DocumentScanner file={attachment.file} onScanChange={handleScanChange} />}

              {attachment?.kind === 'pdf' && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-ink-850 border border-line">
                  <div className="w-10 h-10 rounded-lg bg-brand/15 flex items-center justify-center flex-shrink-0">
                    <FileUp className="w-5 h-5 text-brand-soft" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-fg font-medium truncate">{attachment.file.name}</p>
                    <p className="text-[11px] text-muted">
                      {(attachment.file.size / 1024 / 1024).toFixed(2)} MB
                      {attachment.pages ? ` · ${attachment.pages} página(s) · se agregará una portada de rendición` : ' · PDF protegido: se archivará tal cual'}
                    </p>
                  </div>
                </div>
              )}

              {!attachment && (
                esGastoMenor ? (
                  <p className="text-[11px] text-muted text-center leading-relaxed">
                    Gasto menor sin factura: se generará automáticamente una <span className="text-fg">declaración de gasto</span> en PDF para la rendición.
                    Si tienes algo (p. ej. captura de la app de taxi), puedes adjuntarlo.
                  </p>
                ) : (
                  <p className="text-[11px] text-faint text-center">Puedes guardar sin comprobante y adjuntarlo en un registro nuevo más tarde.</p>
                )
              )}

              <div className="pt-1">
                <MediaPicker files={mediaFiles} onChange={setMediaFiles} disabled={isSubmitting} progress={mediaProgress} />
              </div>

              {/* Summary */}
              <div className="p-3.5 rounded-xl bg-ink-850 border border-line space-y-1.5 text-xs">
                <div className="flex justify-between gap-4"><span className="text-muted">Proveedor:</span><span className="text-fg font-medium text-right truncate">{proveedor}</span></div>
                {descripcion && <div className="flex justify-between gap-4"><span className="text-muted flex-shrink-0">Detalle:</span><span className="text-fg/80 text-right truncate">{descripcion}</span></div>}
                {observaciones && <div className="flex justify-between gap-4"><span className="text-warn flex-shrink-0">Observaciones:</span><span className="text-fg/80 text-right truncate">{observaciones}</span></div>}
                <div className="flex justify-between gap-4"><span className="text-muted">Tipo:</span><span className="text-fg text-right">{getTipoComprobanteLabel(tipoComprobante)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Monto:</span><span className="text-fg font-semibold tabular">Bs. {formatMonto(montoNum)}</span></div>
              </div>

              {error && (
                <p role="alert" className="text-xs text-bad bg-bad/10 px-3 py-2 rounded-lg border border-bad/30 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {error}
                </p>
              )}
              {comprobantePendiente && (
                <p className="text-[11px] text-warn text-center">Pulsa «Recortar y escanear» para preparar el comprobante.</p>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep(2)} disabled={isSubmitting} className="flex-1 py-3 rounded-xl border border-line-strong text-fg/80 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-40">Atrás</button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || comprobantePendiente}
                  className="flex-[1.4] py-3 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> {status}</> : <><CheckCircle2 className="w-4 h-4" /> Guardar compra</>}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
    </>
  );
}
