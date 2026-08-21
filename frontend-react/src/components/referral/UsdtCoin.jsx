// Gold USDT mark — LuxQuant accent, not Tether green.
export function UsdtCoin({ size = 40, className = "" }) {
  const s = Number(size);
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="22" fill="rgb(var(--accent))" />
      <circle cx="24" cy="24" r="20.5" fill="rgb(var(--surface-raised))" stroke="rgb(var(--accent))" strokeWidth="1.2" />
      <circle cx="24" cy="24" r="16.5" fill="rgb(var(--accent) / 0.12)" />
      <path
        d="M16 18.5h16M24 18.5v13.5M18.5 25.5H24c3.3 0 5.5-1.5 5.5-4s-2.2-4-5.5-4H18.5"
        stroke="rgb(var(--accent))"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UsdtCoinStack({ className = "" }) {
  return (
    <div className={`relative h-[132px] w-[148px] ${className}`} aria-hidden="true">
      <div className="absolute left-8 top-7 rotate-[-18deg] opacity-70">
        <UsdtCoin size={72} />
      </div>
      <div className="absolute left-[52px] top-2 rotate-[14deg] opacity-85">
        <UsdtCoin size={80} />
      </div>
      <div className="absolute left-2 top-10">
        <UsdtCoin size={96} />
      </div>
      <p className="absolute -bottom-1 left-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
        USDT
      </p>
    </div>
  );
}
