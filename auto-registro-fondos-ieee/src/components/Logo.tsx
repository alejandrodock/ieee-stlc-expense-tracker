/** Marca de la app: logo oficial del IEEE Student Tech Leadership Conference (desde logostlc.png). */
export function LogoMark({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/icon-192.png"
      alt=""
      aria-hidden="true"
      width={192}
      height={192}
      className={`${className} rounded-xl border border-white/15 object-cover flex-shrink-0`}
    />
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <LogoMark />
      <div className="leading-tight min-w-0">
        <p className="font-serif text-[15px] sm:text-[17px] text-fg tracking-tight">IEEE Student Tech Leadership Conference</p>
        <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-faint">Rendición de fondos</p>
      </div>
    </div>
  );
}
