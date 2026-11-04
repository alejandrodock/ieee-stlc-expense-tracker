'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Calendar, Tag, FileText, DollarSign,
  Camera, Upload, Loader2, CheckCircle2, ChevronDown
} from 'lucide-react';
import {
  CATEGORIAS, TIPOS_COMPROBANTE, TIPO_CAMBIO_USD,
  generatePdfFilename, formatMonto
} from '@/lib/constants';

interface NuevaCompraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  saldoActual: number;
}

export default function NuevaCompraModal({
  isOpen, onClose, onSuccess, saldoActual
}: NuevaCompraModalProps) {
  const today = new Date().toISOString().split('T')[0];
  const [fecha, setFecha] = useState(today);
  const [categoria, setCategoria] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [tipoComprobante, setTipoComprobante] = useState('');
  const [montoBob, setMontoBob] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const montoNum = parseFloat(montoBob) || 0;
  const nuevoSaldo = saldoActual - montoNum;
  const montoUsd = montoNum / TIPO_CAMBIO_USD;

  const resetForm = () => {
    setFecha(today);
    setCategoria('');
    setProveedor('');
    setTipoComprobante('');
    setMontoBob('');
    setImageFile(null);
    setImagePreview(null);
    setProcessedImage(null);
    setStep(1);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleImageSelect = useCallback((file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
  };

  const processImage = async () => {
    if (!imageFile) return;
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('image', imageFile);

      const res = await fetch('/api/process-image', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Failed to process image');
      const data = await res.json();
      setProcessedImage(data.processedImage);
    } catch (error) {
      console.error('Error processing image:', error);
      // Use original image as fallback
      setProcessedImage(imagePreview);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (!categoria || !proveedor || !montoBob || !tipoComprobante) return;
    setIsSubmitting(true);

    try {
      let driveFileId = null;
      let driveUrl = null;
      let pdfUrl = null;

      // If we have a processed image, generate PDF and upload to Drive
      if (processedImage || imagePreview) {
        const filename = generatePdfFilename(fecha, categoria, proveedor, montoNum);

        // Create PDF from processed image using jsPDF on the client side
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const imgData = processedImage || imagePreview!;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Add image centered on page
        const img = new Image();
        img.src = imgData;
        await new Promise((resolve) => { img.onload = resolve; });

        const imgRatio = img.width / img.height;
        const maxWidth = pageWidth - 20;
        const maxHeight = pageHeight - 20;
        let finalWidth = maxWidth;
        let finalHeight = finalWidth / imgRatio;

        if (finalHeight > maxHeight) {
          finalHeight = maxHeight;
          finalWidth = finalHeight * imgRatio;
        }

        const x = (pageWidth - finalWidth) / 2;
        const y = (pageHeight - finalHeight) / 2;

        doc.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
        const pdfBlob = doc.output('blob');

        // Upload PDF to Google Drive
        try {
          const driveForm = new FormData();
          driveForm.append('file', pdfBlob, filename);
          driveForm.append('filename', filename);

          const driveRes = await fetch('/api/upload-drive', {
            method: 'POST',
            body: driveForm,
          });

          if (driveRes.ok) {
            const driveData = await driveRes.json();
            driveFileId = driveData.fileId;
            driveUrl = driveData.webViewLink;
          }
        } catch (driveError) {
          console.error('Drive upload error (non-fatal):', driveError);
        }

        pdfUrl = driveUrl;
      }

      // Save to database
      const res = await fetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha,
          categoria,
          proveedor,
          tipo_comprobante: tipoComprobante,
          monto_bob: montoNum,
          monto_usd: parseFloat(montoUsd.toFixed(2)),
          pdf_url: pdfUrl,
          drive_file_id: driveFileId,
          drive_url: driveUrl,
          imagen_original: imagePreview,
        }),
      });

      if (!res.ok) throw new Error('Failed to save');

      handleClose();
      onSuccess();
    } catch (error) {
      console.error('Submit error:', error);
      alert('Error al guardar el gasto. Inténtelo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

        {/* Modal */}
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto bg-gradient-to-b from-slate-900 to-slate-950 rounded-t-3xl sm:rounded-2xl border border-white/10 shadow-2xl"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl">
            <div>
              <h2 className="text-lg font-bold text-white">Registrar Compra</h2>
              <p className="text-xs text-slate-400">Paso {step} de 3</p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Step Indicators */}
          <div className="px-6 pt-4">
            <div className="flex gap-2">
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                    s <= step ? 'bg-gradient-to-r from-blue-500 to-cyan-400' : 'bg-slate-800'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* STEP 1: Basic Info */}
            {step === 1 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                {/* Fecha */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <Calendar className="w-4 h-4 text-blue-400" />
                    Fecha de Compra
                  </label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                  />
                </div>

                {/* Categoría */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <Tag className="w-4 h-4 text-purple-400" />
                    Categoría del Presupuesto
                  </label>
                  <div className="relative">
                    <select
                      value={categoria}
                      onChange={e => setCategoria(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none cursor-pointer transition-all"
                    >
                      <option value="" className="bg-slate-800">Seleccionar categoría...</option>
                      {CATEGORIAS.map(cat => (
                        <option key={cat.value} value={cat.value} className="bg-slate-800">
                          {cat.icon} {cat.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Proveedor */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <FileText className="w-4 h-4 text-green-400" />
                    Proveedor / Concepto
                  </label>
                  <input
                    type="text"
                    value={proveedor}
                    onChange={e => setProveedor(e.target.value)}
                    placeholder="Ej: Catering Express S.R.L."
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                </div>

                {/* Tipo Comprobante */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <FileText className="w-4 h-4 text-amber-400" />
                    Tipo de Comprobante
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {TIPOS_COMPROBANTE.map(tipo => (
                      <button
                        key={tipo.value}
                        type="button"
                        onClick={() => setTipoComprobante(tipo.value)}
                        className={`px-4 py-3 rounded-xl text-sm text-left transition-all ${
                          tipoComprobante === tipo.value
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-300 border'
                            : 'bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {tipo.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setStep(2)}
                  disabled={!categoria || !proveedor || !tipoComprobante}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold hover:from-blue-500 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
                >
                  Siguiente →
                </button>
              </motion.div>
            )}

            {/* STEP 2: Monto */}
            {step === 2 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                {/* Monto BOB */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    Monto en BOB
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">Bs.</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={montoBob}
                      onChange={e => setMontoBob(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-12 pr-4 py-4 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                    />
                  </div>
                </div>

                {/* Auto Calculator */}
                {montoNum > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-gradient-to-br from-slate-800/80 to-slate-800/40 border border-slate-700/30 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">Equivalente USD</span>
                      <span className="text-sm font-medium text-slate-200">
                        $ {formatMonto(montoUsd)}
                      </span>
                    </div>
                    <div className="h-px bg-slate-700/50" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">Saldo actual</span>
                      <span className="text-sm text-slate-300">Bs. {formatMonto(saldoActual)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">Descuento</span>
                      <span className="text-sm text-red-400">- Bs. {formatMonto(montoNum)}</span>
                    </div>
                    <div className="h-px bg-slate-700/50" />
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">Nuevo Saldo</span>
                      <span className={`text-lg font-bold ${
                        nuevoSaldo >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        Bs. {formatMonto(nuevoSaldo)}
                      </span>
                    </div>
                    {nuevoSaldo < 0 && (
                      <p className="text-xs text-red-400/80 bg-red-500/10 px-3 py-2 rounded-lg">
                        ⚠️ Este gasto excede el presupuesto disponible
                      </p>
                    )}
                  </motion.div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 py-3.5 rounded-xl border border-slate-700/50 text-slate-300 font-medium hover:bg-slate-800 transition-all"
                  >
                    ← Atrás
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!montoBob || montoNum <= 0}
                    className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold hover:from-blue-500 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
                  >
                    Siguiente →
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: Image Upload + Submit */}
            {step === 3 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                {/* Image Upload Area */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                    <Camera className="w-4 h-4 text-pink-400" />
                    Comprobante (Foto / Imagen)
                  </label>

                  {!imagePreview ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-700/50 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all"
                      >
                        <Camera className="w-8 h-8 text-blue-400" />
                        <span className="text-sm text-slate-400">Cámara</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-700/50 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all"
                      >
                        <Upload className="w-8 h-8 text-purple-400" />
                        <span className="text-sm text-slate-400">Archivo</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative rounded-xl overflow-hidden border border-slate-700/50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={processedImage || imagePreview}
                          alt="Preview"
                          className="w-full max-h-48 object-contain bg-slate-800"
                        />
                        {processedImage && (
                          <div className="absolute top-2 left-2 px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                            <span className="text-xs text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Escaneado
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            setImageFile(null);
                            setImagePreview(null);
                            setProcessedImage(null);
                          }}
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/20 hover:bg-red-500/40 transition-colors"
                        >
                          <X className="w-4 h-4 text-red-400" />
                        </button>
                      </div>

                      {!processedImage && (
                        <button
                          type="button"
                          onClick={processImage}
                          disabled={isProcessing}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white text-sm font-medium hover:from-violet-500 hover:to-fuchsia-400 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Procesando escaneo...
                            </>
                          ) : (
                            <>📷 Escanear (estilo CamScanner)</>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Hidden inputs */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {/* Summary */}
                <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/30 space-y-2">
                  <h4 className="text-sm font-semibold text-white">Resumen</h4>
                  <div className="grid grid-cols-2 gap-y-1.5 text-xs">
                    <span className="text-slate-400">Categoría:</span>
                    <span className="text-slate-200">{CATEGORIAS.find(c => c.value === categoria)?.label}</span>
                    <span className="text-slate-400">Proveedor:</span>
                    <span className="text-slate-200">{proveedor}</span>
                    <span className="text-slate-400">Monto:</span>
                    <span className="text-emerald-400 font-medium">Bs. {formatMonto(montoNum)}</span>
                    <span className="text-slate-400">Comprobante:</span>
                    <span className="text-slate-200">
                      {imagePreview ? '✅ Adjunto' : '⚠️ Sin adjuntar'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 py-3.5 rounded-xl border border-slate-700/50 text-slate-300 font-medium hover:bg-slate-800 transition-all"
                  >
                    ← Atrás
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-semibold hover:from-emerald-500 hover:to-teal-400 disabled:opacity-60 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Guardar Gasto
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
