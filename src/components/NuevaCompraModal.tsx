'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Calendar, Tag, FileText, DollarSign,
  Camera, Upload, Loader2, CheckCircle2, ChevronDown, Sparkles, ListChecks
} from 'lucide-react';
import {
  CATEGORIAS, TIPOS_COMPROBANTE, TIPO_CAMBIO_USD,
  getCategoriaLabel, getTipoComprobanteLabel, generatePdfFilename, formatMonto
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
  const [descripcion, setDescripcion] = useState('');
  const [tipoComprobante, setTipoComprobante] = useState('factura_ieee');
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
    setDescripcion('');
    setTipoComprobante('factura_ieee');
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
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      setProcessedImage(null);
    };
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

      // If we have an image, generate enhanced PDF with IEEE audit header
      if (processedImage || imagePreview) {
        const filename = generatePdfFilename(fecha, categoria, proveedor, montoNum);

        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // 1. Header institucional IEEE
        doc.setFillColor(15, 23, 42); // Slate dark
        doc.rect(0, 0, pageWidth, 28, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text('IEEE SECCIÓN BOLIVIA - STLC 2026', 14, 11);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(148, 163, 184);
        doc.text('COMPROBANTE OFICIAL DE RENDICIÓN DE FONDOS', 14, 18);
        doc.text(`Fecha Emisión: ${fecha}  |  Ref: ${filename}`, 14, 23);

        // 2. Info box
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(12, 32, pageWidth - 24, 28, 2, 2, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(12, 32, pageWidth - 24, 28, 2, 2, 'D');

        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Proveedor:', 16, 38);
        doc.text('Categoría:', 16, 44);
        doc.text('Tipo Comprobante:', 16, 50);

        doc.setFont('helvetica', 'normal');
        doc.text(proveedor, 45, 38);
        doc.text(getCategoriaLabel(categoria), 45, 44);
        doc.text(getTipoComprobanteLabel(tipoComprobante), 45, 50);

        // Amount on the right side
        doc.setFont('helvetica', 'bold');
        doc.text('Importe BOB:', 120, 38);
        doc.text('Equiv. USD:', 120, 44);

        doc.setFontSize(11);
        doc.setTextColor(16, 185, 129); // Emerald
        doc.text(`Bs. ${formatMonto(montoNum)}`, 146, 38);
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(`$ ${formatMonto(montoUsd)}`, 146, 44);

        // Optional Items / Description
        let imageStartY = 64;
        if (descripcion && descripcion.trim().length > 0) {
          doc.setFillColor(241, 245, 249);
          doc.roundedRect(12, 62, pageWidth - 24, 14, 2, 2, 'F');
          doc.setTextColor(100, 116, 139);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.text('ITEMS / DETALLE DE COMPRA:', 16, 67);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 41, 59);
          const splitDesc = doc.splitTextToSize(descripcion.trim(), pageWidth - 36);
          doc.text(splitDesc, 16, 72);
          imageStartY = 80;
        }

        // 3. Add receipt image
        const imgData = processedImage || imagePreview!;
        const img = new Image();
        img.src = imgData;
        await new Promise((resolve) => { img.onload = resolve; });

        const imgRatio = img.width / img.height;
        const maxImgWidth = pageWidth - 24;
        const maxImgHeight = pageHeight - imageStartY - 10;
        let finalWidth = maxImgWidth;
        let finalHeight = finalWidth / imgRatio;

        if (finalHeight > maxImgHeight) {
          finalHeight = maxImgHeight;
          finalWidth = finalHeight * imgRatio;
        }

        const imgX = (pageWidth - finalWidth) / 2;
        const imgY = imageStartY + (maxImgHeight - finalHeight) / 2;

        doc.addImage(imgData, 'PNG', imgX, imgY, finalWidth, finalHeight, undefined, 'FAST');
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
          descripcion: descripcion.trim() || null,
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
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={handleClose} />

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
            {/* STEP 1: Basic Info & Description */}
            {step === 1 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                {/* Fecha */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    Fecha de Compra
                  </label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                </div>

                {/* Categoría */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
                    <Tag className="w-3.5 h-3.5 text-purple-400" />
                    Categoría del Presupuesto
                  </label>
                  <div className="relative">
                    <select
                      value={categoria}
                      onChange={e => setCategoria(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none cursor-pointer transition-all"
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
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
                    <FileText className="w-3.5 h-3.5 text-green-400" />
                    Proveedor / Empresa
                  </label>
                  <input
                    type="text"
                    value={proveedor}
                    onChange={e => setProveedor(e.target.value)}
                    placeholder="Ej: Imprenta Gutenberg, Supermercado Hipermaxi..."
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                </div>

                {/* Descripción / Elementos del recibo (NUEVO) */}
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between text-xs font-medium text-slate-300">
                    <span className="flex items-center gap-2">
                      <ListChecks className="w-3.5 h-3.5 text-cyan-400" />
                      Descripción / Elementos que contiene
                    </span>
                    <span className="text-[10px] text-slate-500">Múltiples items</span>
                  </label>
                  <textarea
                    rows={2}
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    placeholder="Ej: 3 cajas de café, 200 vasos térmicos, 2 rollos de servilletas y azúcar..."
                    className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none transition-all"
                  />
                </div>

                {/* Tipo Comprobante (ACTUALIZADO: NIT IEEE vs CI Iván Mendoza vs Recibo) */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
                    <FileText className="w-3.5 h-3.5 text-amber-400" />
                    Tipo de Comprobante
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {TIPOS_COMPROBANTE.map(tipo => {
                      const isSelected = tipoComprobante === tipo.value;
                      return (
                        <button
                          key={tipo.value}
                          type="button"
                          onClick={() => setTipoComprobante(tipo.value)}
                          className={`px-3.5 py-2.5 rounded-xl text-xs text-left transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-blue-500/20 border-blue-500/60 text-blue-200 border shadow-sm'
                              : 'bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="font-medium">{tipo.label}</span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => setStep(2)}
                  disabled={!categoria || !proveedor.trim() || !tipoComprobante}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold hover:from-blue-500 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
                >
                  Siguiente (Monto) →
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
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-300">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    Monto en Bolivianos (BOB)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">Bs.</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={montoBob}
                      onChange={e => setMontoBob(e.target.value)}
                      placeholder="0.00"
                      autoFocus
                      className="w-full pl-14 pr-4 py-4 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
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
                      <span className="text-xs text-slate-400">Equivalente estimado USD (T.C. 6.96)</span>
                      <span className="text-xs font-semibold text-slate-200">
                        $ {formatMonto(montoUsd)}
                      </span>
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
                      <span className={`text-base font-bold ${
                        nuevoSaldo >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        Bs. {formatMonto(nuevoSaldo)}
                      </span>
                    </div>
                    {nuevoSaldo < 0 && (
                      <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg border border-red-500/20">
                        ⚠️ Este gasto sobrepasa el presupuesto disponible
                      </p>
                    )}
                  </motion.div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 py-3 rounded-xl border border-slate-700/50 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-all"
                  >
                    ← Atrás
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!montoBob || montoNum <= 0}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-semibold hover:from-blue-500 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/20"
                  >
                    Siguiente (Comprobante) →
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: Scanner con Auto-recorte y Color Nítido */}
            {step === 3 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                {/* Image Upload Area */}
                <div className="space-y-2">
                  <label className="flex items-center justify-between text-xs font-medium text-slate-300">
                    <span className="flex items-center gap-2">
                      <Camera className="w-3.5 h-3.5 text-pink-400" />
                      Foto del Recibo o Factura
                    </span>
                    <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Auto-recorte + Color nítido
                    </span>
                  </label>

                  {!imagePreview ? (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-700/60 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all group"
                      >
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Camera className="w-6 h-6 text-blue-400" />
                        </div>
                        <span className="text-xs font-medium text-slate-300">Tomar Foto</span>
                        <span className="text-[10px] text-slate-500">Cámara del celular</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-slate-700/60 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
                      >
                        <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Upload className="w-6 h-6 text-purple-400" />
                        </div>
                        <span className="text-xs font-medium text-slate-300">Subir Archivo</span>
                        <span className="text-[10px] text-slate-500">Galería / JPG / PNG</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="relative rounded-xl overflow-hidden border border-slate-700/50 bg-slate-900">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={processedImage || imagePreview}
                          alt="Preview"
                          className="w-full max-h-56 object-contain bg-slate-950"
                        />
                        {processedImage && (
                          <div className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white backdrop-blur-md shadow-lg">
                            <span className="text-[11px] font-semibold flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Escaneo Nítido + Auto-recorte
                            </span>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            setImageFile(null);
                            setImagePreview(null);
                            setProcessedImage(null);
                          }}
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-red-500/80 text-white transition-colors"
                          title="Cambiar foto"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {!processedImage ? (
                        <button
                          type="button"
                          onClick={processImage}
                          disabled={isProcessing}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-white text-xs font-semibold hover:opacity-95 disabled:opacity-60 transition-all flex items-center justify-center gap-2 shadow-md shadow-violet-900/30"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              Auto-recortando y realzando nitidez...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              Escanear (Recorte + Realce Nítido a Color)
                            </>
                          )}
                        </button>
                      ) : (
                        <p className="text-[11px] text-emerald-400 text-center flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Documento optimizado listo para PDF y Google Drive
                        </p>
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

                {/* Summary Card */}
                <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/40 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Proveedor:</span>
                    <span className="text-slate-200 font-medium">{proveedor}</span>
                  </div>
                  {descripcion && (
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-400 flex-shrink-0">Detalle:</span>
                      <span className="text-slate-300 text-right truncate">{descripcion}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tipo:</span>
                    <span className="text-slate-200">{getTipoComprobanteLabel(tipoComprobante)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Monto:</span>
                    <span className="text-emerald-400 font-bold">Bs. {formatMonto(montoNum)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Destino:</span>
                    <span className="text-cyan-400 font-medium">Google Drive / STLC_2026</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 py-3 rounded-xl border border-slate-700/50 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-all"
                  >
                    ← Atrás
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-sm font-semibold hover:from-emerald-500 hover:to-teal-400 disabled:opacity-60 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Guardando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Guardar Compra
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
