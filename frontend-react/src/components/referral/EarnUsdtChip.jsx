// Gold header CTA — visible to guests, free, and VIP.
export default function EarnUsdtChip({ onClick, active = false, compact = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Invite friends and earn USDT"
      className={`relative inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-[11px] font-semibold tracking-tight transition-colors sm:px-3 sm:text-[12px] ${
        active
          ? "border-accent/40 bg-accent text-accent-fg"
          : "border-accent/30 bg-accent/10 text-accent hover:bg-accent/15"
      }`}
    >
      {!compact && (
        <span className="hidden sm:inline font-medium opacity-80">Invite</span>
      )}
      {!compact && <span className="hidden sm:inline opacity-50">·</span>}
      <span>Earn USDT</span>
    </button>
  );
}
