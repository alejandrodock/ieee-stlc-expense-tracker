'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import dynamic from 'next/dynamic';
import type { ScanResult } from '@/components/scanner/DocumentScanner';
import styles from './Hart.module.css';

// Reuse STLC's camera, corner editor, filters and worker. HART owns the upload.
const DocumentScanner = dynamic(() => import('@/components/scanner/DocumentScanner'), { ssr: false });
const InAppCamera = dynamic(() => import('@/components/scanner/InAppCamera'), { ssr: false });
type Attachment = { kind: 'image'; file: File } | { kind: 'pdf'; file: File; pages: number | null };
const MAX_BYTES = 20 * 1024 * 1024;

export default function ReceiptPicker({ onChange }: { onChange: (file: File | null) => void }) {
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const cameraInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => () => { ++generation.current; }, []);

  const clear = () => {
    ++generation.current;
    setAttachment(null); setError(''); setPending(false); onChange(null);
  };
  const chooseImage = (file: File) => {
    ++generation.current;
    onChange(null); setError(''); setPending(true);
    setAttachment({ kind: 'image', file });
    setCameraOpen(false);
  };
  const imageChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (file) chooseImage(file);
  };
  const cameraUnavailable = useCallback(() => {
    setCameraOpen(false);
    cameraInput.current?.click();
  }, []);
  const scanChanged = useCallback((scan: ScanResult | null) => {
    setPending(!scan); onChange(null);
    if (!scan) return;
    if (scan.jpeg.byteLength > MAX_BYTES) { setError('La imagen escaneada supera 20 MB. Prueba con otra foto.'); return; }
    setError('');
    // HART's server adds its currency/rate/USD cover to the processed image.
    onChange(new File([new Uint8Array(scan.jpeg)], 'comprobante-escaneado.jpg', { type: 'image/jpeg' }));
  }, [onChange]);

  const pdfChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    clear();
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setError('El archivo debe ser un PDF.'); return; }
    if (file.size > MAX_BYTES) { setError('El PDF supera 20 MB.'); return; }
    const token = ++generation.current;
    setPending(true);
    try {
      const { inspectPdf } = await import('@/lib/pdf/comprobante');
      const info = await inspectPdf(new Uint8Array(await file.arrayBuffer()));
      if (token !== generation.current) return;
      const pdf = file.type === 'application/pdf' ? file : new File([file], file.name, { type: 'application/pdf' });
      setAttachment({ kind: 'pdf', file: pdf, pages: info?.pages ?? null });
      onChange(pdf);
    } catch {
      if (token === generation.current) setError('No se pudo abrir el PDF. Selecciónalo de nuevo.');
    } finally { if (token === generation.current) setPending(false); }
  };

  return <section className={styles.receipt} aria-label="Comprobante HART">
    <div className={styles.rowTop}>
      <h3>Comprobante (factura o recibo)</h3>
      {(attachment || pending) && <button type="button" className={styles.link} onClick={clear}>Cambiar</button>}
    </div>
    {!attachment && <div className={styles.receiptOptions}>
      <button type="button" className={styles.receiptOption} onClick={() => {
        if ('mediaDevices' in navigator && window.isSecureContext) setCameraOpen(true);
        else cameraInput.current?.click();
      }}><strong>Escanear</strong><span>Cámara</span></button>
      <button type="button" className={styles.receiptOption} onClick={() => imageInput.current?.click()}><strong>Imagen</strong><span>Galería</span></button>
      <button type="button" className={styles.receiptOption} onClick={() => pdfInput.current?.click()}><strong>PDF</strong><span>Recibo digital</span></button>
    </div>}
    <input ref={cameraInput} type="file" accept="image/*" capture="environment" aria-label="Foto desde cámara" onChange={imageChosen} hidden />
    <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-label="Imagen del comprobante" onChange={imageChosen} hidden />
    <input ref={pdfInput} type="file" accept="application/pdf,.pdf" aria-label="PDF del comprobante" onChange={pdfChosen} hidden />
    {cameraOpen && <InAppCamera onCapture={chooseImage} onClose={() => setCameraOpen(false)} onUnavailable={cameraUnavailable} />}
    {attachment?.kind === 'image' && <DocumentScanner file={attachment.file} onScanChange={scanChanged} />}
    {attachment?.kind === 'pdf' && <div className={styles.notice}>
      <strong className={styles.filename}>{attachment.file.name}</strong>
      <p>{(attachment.file.size / 1024 / 1024).toFixed(2)} MB{attachment.pages ? ` · ${attachment.pages} página(s) · Se agregará la portada de rendición HART.` : ' · Si el PDF está protegido, se conservará el archivo original sin portada.'}</p>
    </div>}
    {pending && <p className={styles.muted} role="status">{attachment?.kind === 'image' ? 'Pulsa «Recortar y escanear» para preparar el comprobante.' : 'Leyendo comprobante…'}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!attachment && !pending && <p className={styles.muted}>Fotografía el comprobante, elige una imagen o adjunta un PDF de hasta 20 MB.</p>}
  </section>;
}
