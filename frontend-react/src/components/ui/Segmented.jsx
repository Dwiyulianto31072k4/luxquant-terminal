// One control style for every table selector on Home.
//
// The two tables used to carry two different controls side by side: filled
// pills for "what am I looking at" and a segmented group for "over what
// window". The pills also used the brand gold, which on this product means
// "act on this" (Invite, upgrade, pay) — spending it on a filter state put a
// view switch above the numbers it filters. One segmented group for both, and
// gold goes back to meaning what it means.
//
// Selected reads as raised (surface + shadow) rather than coloured, which is
// the pattern that survives a theme change: it works on the bright desk and
// the dark one without a second set of tokens.

/**
 * @param {{value: string, label: string, hint?: string}[]} options
 * @param {string} value          currently selected option value
 * @param {(value: string) => void} onChange
 * @param {boolean} [mono]        monospace labels (1D / 3D / 1W …)
 * @param {string}  [ariaLabel]   names the group for assistive tech
 */
export default function Segmented({ options, value, onChange, mono = false, ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-lg bg-ink/[0.04] p-0.5"
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            title={opt.hint}
            onClick={() => onChange(opt.value)}
            className={`whitespace-nowrap rounded-md px-2.5 py-1 transition-colors ${
              mono ? "font-mono text-[11px]" : "text-[12px]"
            } ${
              selected
                ? "bg-surface-raised font-medium text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
