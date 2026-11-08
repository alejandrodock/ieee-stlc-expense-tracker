'use client';

import { Download, Loader2, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const OPTIONS = [
  { lang: 'es', label: 'Español', file: 'Rendicion_IEEE_Student_Tech_Leadership_Conference_2026.xlsx' },
  { lang: 'en', label: 'English', file: 'Expense_Report_IEEE_Student_Tech_Leadership_Conference_2026.xlsx' },
] as const;

export default function ExportButton() {
  const [isExporting, setIsExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const handleExport = async (opt: (typeof OPTIONS)[number]) => {
    setOpen(false);
    setIsExporting(true);
    try {
      const response = await fetch(`/api/export?lang=${opt.lang}`);
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = opt.file;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      alert('Error al exportar. Inténtelo de nuevo.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={isExporting}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-line-strong text-fg text-xs font-medium hover:bg-white/5 disabled:opacity-60 transition-colors"
      >
        {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {isExporting ? 'Exportando…' : 'Exportar'}
        {!isExporting && <ChevronDown className={`w-3 h-3 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-52 rounded-xl bg-ink-850 border border-line-strong shadow-xl shadow-black/40 p-1.5 z-50"
        >
          <p className="px-2.5 pt-1.5 pb-2 text-[10px] uppercase tracking-[0.14em] text-faint">Idioma del reporte</p>
          {OPTIONS.map((opt) => (
            <button
              key={opt.lang}
              role="menuitem"
              onClick={() => handleExport(opt)}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-sm text-fg hover:bg-white/5 transition-colors"
            >
              {opt.label}
              <span className="text-[10px] uppercase tracking-wider text-faint">{opt.lang}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
