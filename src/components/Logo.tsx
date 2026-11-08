/**
 * Marca de la app: ondas de señal que nacen de un punto (comunicaciones),
 * en blanco y cian sobre un sello marino. Original, sin usar marcas registradas.
 */
export function LogoMark({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x="0.5" y="0.5" width="47" height="47" rx="12" fill="#0B2A45" stroke="rgba(255,255,255,0.14)" />
      <g fill="none" strokeLinecap="round" strokeWidth="2.6">
        <path d="M14 26a8 8 0 0 1 8 8" stroke="#FFFFFF" />
        <path d="M14 19a15 15 0 0 1 15 15" stroke="#FFFFFF" strokeOpacity="0.6" />
        <path d="M14 12a22 22 0 0 1 22 22" stroke="#00B5E2" />
      </g>
      <circle cx="14" cy="34" r="2.8" fill="#00B5E2" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="leading-none">
        <p className="font-serif text-[21px] text-fg tracking-tight">IEEE STLC</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-faint">Rendición de fondos</p>
      </div>
    </div>
  );
}
