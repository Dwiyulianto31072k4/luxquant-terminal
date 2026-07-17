// src/components/ui/StatCard.jsx
//
// Desk metric tiles — muted chrome, mono labels, solid accent only on
// intentional emphasis (never decorative gold walls).
// PnL / signed values: pass tone="profit" | "loss" | "accent" | "default".

const TONE_VALUE = {
  default: "text-text-primary",
  accent: "text-accent",
  profit: "text-profit",
  loss: "text-loss",
  muted: "text-text-muted",
};

/**
 * Single metric cell.
 * @param {{
 *   label: import('react').ReactNode,
 *   value: import('react').ReactNode,
 *   hint?: import('react').ReactNode,
 *   tone?: keyof typeof TONE_VALUE,
 *   icon?: import('react').ReactNode,
 *   className?: string,
 *   dense?: boolean,
 * }} props
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  className = "",
  dense = false,
}) {
  const valueCls = TONE_VALUE[tone] || TONE_VALUE.default;
  return (
    <div
      className={`rounded-md border border-ink/[0.08] bg-surface-raised ${
        dense ? "px-3 py-2.5" : "px-4 py-3.5"
      } ${className}`}
    >
      <div className="flex items-start gap-2.5">
        {icon ? (
          <span
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ink/[0.08] bg-ink/[0.04] text-text-muted"
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            {label}
          </p>
          <p
            className={`mt-1 font-mono font-semibold tabular-nums leading-none ${valueCls} ${
              dense ? "text-lg" : "text-xl lg:text-2xl"
            }`}
          >
            {value}
          </p>
          {hint != null && hint !== false ? (
            <div className="mt-1.5 text-[11px] leading-snug text-text-muted">{hint}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Responsive grid of StatCards.
 * @param {{
 *   children: import('react').ReactNode,
 *   cols?: 2 | 3 | 4 | 5,
 *   className?: string,
 * }} props
 */
export function StatGrid({ children, cols = 4, className = "" }) {
  const colCls =
    cols === 2
      ? "grid-cols-2"
      : cols === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : cols === 5
          ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
          : "grid-cols-2 sm:grid-cols-4";
  return <div className={`grid gap-2.5 ${colCls} ${className}`}>{children}</div>;
}

export default StatCard;
