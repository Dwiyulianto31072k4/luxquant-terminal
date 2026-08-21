import { UsdtCoin } from "./UsdtCoin";

// Same chrome as header nav items (rounded-md, underline when active).
export default function EarnUsdtChip({ onClick, active = false, compact = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Invite friends and earn USDT"
      className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-1.5 text-[13px] font-medium transition-all duration-150 ${
        active
          ? "border-transparent text-text-primary"
          : "border-transparent text-text-secondary hover:border-ink/[0.1] hover:bg-ink/[0.06] hover:text-text-primary"
      }`}
    >
      <UsdtCoin size={16} />
      {compact ? (
        <span>Earn USDT</span>
      ) : (
        <>
          <span className="hidden sm:inline">Invite</span>
          <span className="hidden sm:inline opacity-40">·</span>
          <span>Earn USDT</span>
        </>
      )}
      {active && (
        <span className="absolute inset-x-3 -bottom-[17px] hidden h-[2.5px] rounded-full bg-accent lg:block" />
      )}
    </button>
  );
}
