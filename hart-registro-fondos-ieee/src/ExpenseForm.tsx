'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CATEGORIES, CURRENCIES, convertedUsd, money, validateExpense, type Currency, type ExpenseInput } from './domain';
import Signature from './Signature';
import ReceiptPicker from './ReceiptPicker';
import styles from './Hart.module.css';

const DRAFT = 'ieee:HART:draft:v1';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
type Fields = { id: string; fecha: string; categoria: string; proveedor: string; descripcion: string; amount: string; currency: Currency; rate: string; has_receipt: boolean; signer_name: string; rate_source: 'api' | 'manual'; rate_date: string | null };
const fresh = (): Fields => ({ id: crypto.randomUUID(), fecha: today(), categoria: 'vuelos', proveedor: '', descripcion: '', amount: '', currency: 'USD', rate: '1', has_receipt: true, signer_name: '', rate_source: 'api', rate_date: null });

export default function ExpenseForm({ onSaved, onClose }: { onSaved: () => void; onClose: () => void }) {
  const [fields, setFields] = useState<Fields | null>(null);
  const [signature, setSignature] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [rateNote, setRateNote] = useState('');
  const [rateLoading, setRateLoading] = useState(false);
  const requestId = useRef(0);
  const manual = useRef(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT) ?? 'null');
      const initial = saved && CURRENCIES.includes(saved.currency) ? { ...fresh(), ...saved } : fresh();
      manual.current = initial.rate_source === 'manual';
      setFields(initial);
    } catch { setFields(fresh()); }
  }, []);
  useEffect(() => { if (fields) { try { localStorage.setItem(DRAFT, JSON.stringify(fields)); } catch { /* storage unavailable */ } } }, [fields]);

  const currency = fields?.currency;
  useEffect(() => {
    if (!currency) return;
    const id = ++requestId.current;
    const controller = new AbortController();
    setRateNote('');
    if (currency === 'USD') { setRateLoading(false); return; }
    if (manual.current) { setRateLoading(false); setRateNote('Tasa manual guardada. Puedes actualizarla.'); return; }
    setRateLoading(true);
    fetch(`/api/hart/rates?currency=${currency}`, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (id !== requestId.current || manual.current) return;
      setFields(prev => prev ? { ...prev, rate: String(data.rate), rate_source: 'api', rate_date: data.date } : prev);
      setRateNote(`Tasa del ${new Date(data.date).toLocaleDateString('es-BO')}. Puedes modificarla si tienes una tasa bancaria.`);
      try { localStorage.setItem(`ieee:HART:rate:${currency}`, JSON.stringify(data)); } catch { /* unavailable */ }
    }).catch(e => {
      if (controller.signal.aborted || id !== requestId.current || manual.current) return;
      let cached;
      try { cached = JSON.parse(localStorage.getItem(`ieee:HART:rate:${currency}`) ?? 'null'); } catch { /* unavailable */ }
      if (cached && Number.isFinite(cached.rate) && cached.rate > 0) {
        manual.current = true;
        setFields(prev => prev ? { ...prev, rate: String(cached.rate), rate_source: 'manual', rate_date: cached.date } : prev);
        setRateNote(`Sin conexión al proveedor. Última tasa guardada: ${cached.date?.slice(0, 10)}. Revísala; se registrará como manual.`);
      } else setRateNote(e instanceof Error ? e.message : 'Introduce una tasa manual.');
    }).finally(() => { if (id === requestId.current) setRateLoading(false); });
    return () => controller.abort();
  }, [currency]);

  if (!fields) return <p>Cargando formulario…</p>;
  const f = fields;
  const total = convertedUsd(Number(f.amount), Number(f.rate));
  const validTotal = Number.isFinite(total) && total > 0;
  const needsReceipt = validTotal && total >= 25;
  const update = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields(prev => prev ? { ...prev, [key]: value } : prev);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    let input: ExpenseInput;
    try {
      input = validateExpense({ id: f.id, fecha: f.fecha, categoria: f.categoria, proveedor: f.proveedor, descripcion: f.descripcion,
        original_amount: Number(f.amount), original_currency: f.currency, exchange_rate: Number(f.rate),
        has_receipt: f.has_receipt, signer_name: f.signer_name, signature,
        rate_source: f.rate_source, rate_date: f.rate_date });
      if (f.has_receipt && !file) throw new Error('Adjunta la factura o recibo.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Revisa los datos.'); return; }
    setBusy(true);
    try {
      if (f.has_receipt && file) {
        setStatus('Subiendo comprobante…');
        const prep = await fetch('/api/hart/comprobantes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: f.id, mime_type: file.type, size: file.size }) });
        const data = await prep.json();
        if (!prep.ok) throw new Error(data.error);
        const upload = await fetch(data.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'true' }, body: file });
        if (!upload.ok) throw new Error('No se pudo subir el archivo. Reintenta.');
      }
      setStatus(f.has_receipt ? 'Generando comprobante y guardando…' : 'Generando declaración firmada…');
      const response = await fetch('/api/hart/gastos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      try { localStorage.removeItem(DRAFT); } catch { /* unavailable */ }
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setBusy(false); setStatus(''); }
  };

  return <form className={styles.card} onSubmit={submit} aria-label="Nuevo gasto HART">
    <div className={styles.header}><h2 className={styles.sectionTitle}>Registrar gasto HART</h2><button type="button" disabled={busy} className={styles.secondary} onClick={onClose}>Cerrar</button></div>
    <fieldset disabled={busy} className={styles.fieldset}>
      <div className={styles.grid}>
        <label className={styles.field}>Fecha<input className={styles.input} type="date" required value={f.fecha} onChange={e => update('fecha', e.target.value)} /></label>
        <label className={styles.field}>Categoría<select className={styles.input} value={f.categoria} onChange={e => update('categoria', e.target.value)}>{CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      </div>
      <label className={styles.field}>Proveedor<input className={styles.input} required maxLength={200} value={f.proveedor} onChange={e => update('proveedor', e.target.value)} /></label>
      <label className={styles.field}>Descripción / motivo del gasto<textarea className={styles.input} required={!f.has_receipt} maxLength={2000} rows={3} value={f.descripcion} onChange={e => update('descripcion', e.target.value)} /></label>
      <div className={styles.grid}>
        <label className={styles.field}>Monto original<input className={styles.input} type="number" inputMode="decimal" min="0.01" max="10000000" step="0.01" required value={f.amount} onChange={e => update('amount', e.target.value)} /></label>
        <label className={styles.field}>Moneda<select className={styles.input} value={f.currency} onChange={e => {
          const currency = e.target.value as Currency; manual.current = false; ++requestId.current;
          setFields({ ...f, currency, rate: currency === 'USD' ? '1' : '', rate_source: 'api', rate_date: null });
        }}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
      </div>
      <label className={styles.field}>Tipo de cambio: USD por 1 {f.currency}
        <input className={styles.input} type="number" inputMode="decimal" step="any" min="0.000000000001" max="10000" required disabled={f.currency === 'USD'} value={f.rate} onChange={e => {
          manual.current = true; ++requestId.current; setRateLoading(false);
          setFields({ ...f, rate: e.target.value, rate_source: 'manual', rate_date: null }); setRateNote('Tasa manual. Se conservará en el comprobante y el reporte.');
        }} />
      </label>
      {rateLoading && <p className={styles.muted} role="status">Consultando tasa…</p>}
      {rateNote && <p className={styles.notice}>{rateNote}</p>}
      <p className={styles.muted}><a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer" className={styles.link}>Tasas de ExchangeRate-API</a> · Actualización diaria.</p>
      <p className={styles.metric} aria-live="polite">Total: {validTotal ? money(total) : '—'}</p>
      <label className={styles.checkbox}><input type="checkbox" checked={f.has_receipt} onChange={e => { update('has_receipt', e.target.checked); setSignature(''); setFile(null); }} />Tengo factura o recibo oficial</label>
      {!f.has_receipt && needsReceipt && <p role="alert" className={styles.error}>Desde 25,00 USD debes adjuntar una factura o recibo para finalizar.</p>}
      {f.has_receipt ? <ReceiptPicker onChange={setFile} /> : <>
        <p className={styles.notice}>Para gastos inferiores a 25,00 USD se generará una declaración jurada. Al firmar declaras que este gasto corresponde a HART 2026, que no tienes comprobante y que los datos son correctos.</p>
        <label className={styles.field}>Nombre completo del declarante<input className={styles.input} required maxLength={200} value={f.signer_name} onChange={e => update('signer_name', e.target.value)} /></label>
        <Signature onChange={setSignature} />
      </>}
      <p className={styles.muted} style={{ margin: '18px 0' }}>Los datos se guardan como borrador en este dispositivo. Después de recargar, vuelve a adjuntar el archivo o dibujar la firma. Para finalizar necesitas conexión.</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <button className={styles.button} type="submit" disabled={busy || rateLoading || (f.has_receipt && !file) || (!f.has_receipt && (needsReceipt || !signature))}>{busy ? status : 'Guardar gasto'}</button>
      {status && <p role="status" className={styles.muted}>{status}</p>}
    </fieldset>
  </form>;
}
