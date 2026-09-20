// MetricSelect — a metric picker that costs one control, not eight.
//
// The axis pickers were three segmented rails of eight options each. Twenty-four
// buttons, three full rows, stacked above a fourth row of screens and a fifth of
// sorts — the plot got what was left, and the tool showed its own controls
// instead of the calls. A segmented control is right when there are two or three
// choices you compare at a glance; past that it is a menu wearing the wrong
// clothes.
//
// A native <select> on purpose: it is one line high, it is keyboard- and
// screen-reader-complete without a line of code, and on a phone it opens the
// platform's own wheel instead of a custom sheet nobody has learned.

export default function MetricSelect({ label, value, onChange, options, title }) {
  return (
    <label className="inline-flex min-w-0 items-center gap-1.5" title={title}>
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      <span className="relative inline-flex min-w-0 items-center">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 min-w-0 max-w-[160px] appearance-none truncate rounded-md border border-ink/[0.12] bg-surface-secondary py-0 pl-2.5 pr-6 font-mono text-[10.5px] font-semibold uppercase tracking-[0.04em] text-text-primary transition-colors hover:border-accent/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-2 h-3 w-3 text-text-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </label>
  );
}
