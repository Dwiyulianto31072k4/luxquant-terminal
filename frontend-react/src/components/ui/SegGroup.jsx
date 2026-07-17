// src/components/ui/SegGroup.jsx
//
// Desk segmented control — Binance/exchange Pro·Lite pattern.
// Solid accent + accent-fg for the active segment (works dark + bright).
// Use for mode switches, filter rails, and calendar/news type tabs.

/**
 * @typedef {Object} SegOption
 * @property {string} key
 * @property {import('react').ReactNode} label
 * @property {import('react').ReactNode} [icon]
 * @property {import('react').ReactNode} [badge]
 * @property {string} [title]
 * @property {boolean} [disabled]
 */

/**
 * @param {{
 *   options: SegOption[],
 *   value: string,
 *   onChange: (key: string) => void,
 *   size?: 'sm' | 'md',
 *   className?: string,
 *   'aria-label'?: string,
 *   wrap?: boolean,
 * }} props
 */
export function SegGroup({
  options = [],
  value,
  onChange,
  size = "md",
  className = "",
  "aria-label": ariaLabel = "Options",
  wrap = false,
}) {
  const pad = size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3.5 py-1.5 text-[11px]";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex max-w-full items-center gap-0.5 rounded-md border border-ink/[0.1] bg-surface-secondary p-0.5 ${
        wrap ? "flex-wrap" : "overflow-x-auto no-scrollbar"
      } ${className}`}
    >
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            title={opt.title}
            disabled={opt.disabled}
            onClick={() => {
              if (!opt.disabled && onChange) onChange(opt.key);
            }}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm font-mono font-semibold uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${pad} ${
              active
                ? "bg-accent text-accent-fg shadow-sm"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {opt.icon ? (
              <span
                className={`inline-flex shrink-0 ${active ? "text-accent-fg" : "text-text-muted"}`}
                aria-hidden
              >
                {opt.icon}
              </span>
            ) : null}
            {opt.label}
            {opt.badge != null && opt.badge !== false ? (
              <span
                className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${
                  active ? "bg-black/15 text-accent-fg" : "bg-ink/[0.06] text-text-muted"
                }`}
              >
                {opt.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default SegGroup;
