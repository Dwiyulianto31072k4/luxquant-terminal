// FlowUI — the marks the two flow panels are built from.
//
// Deliberately HTML and CSS rather than a chart library. Everything here is a
// single value beside its own bar; a canvas would cost a bundle, blur the
// figures and put the number somewhere other than the end of the mark it
// belongs to. The only things that stay real charts are the ones with a
// geometry HTML cannot hold — the bubble field.
//
// Rules kept throughout:
//   • money and moves are DIVERGING (profit / loss around a real zero)
//   • magnitude is SEQUENTIAL (one hue, accent, light to dark)
//   • every coloured figure also carries a word or a sign, never colour alone
//   • a bar is scaled to a FIXED reference, never to whoever is on screen

import { fmtMultiple, pct } from "./flowMetrics";

/** A move, signed, in the diverging pair. */
export function Delta({ value, digits = 2, className = "", muted = false }) {
  if (value == null || Number.isNaN(Number(value)))
    return <span className={`text-text-muted ${className}`}>—</span>;
  const n = Number(value);
  const tone = muted
    ? "text-text-secondary"
    : n >= 0
      ? "text-profit"
      : "text-loss";
  return (
    <span className={`font-mono tabular-nums ${tone} ${className}`}>{pct(n, digits)}</span>
  );
}

/** Points, not percent — a difference between two percentages is a different
 *  unit and printing it with a % sign is how "14.8% short" gets read as a rate. */
export function Points({ value, digits = 1, className = "" }) {
  if (value == null) return <span className={`text-text-muted ${className}`}>—</span>;
  const n = Number(value);
  return (
    <span className={`font-mono tabular-nums ${n >= 0 ? "text-profit" : "text-loss"} ${className}`}>
      {n >= 0 ? "+" : "−"}
      {Math.abs(n).toFixed(digits)}
      <span className="text-[0.82em] opacity-70">pp</span>
    </span>
  );
}

/** Turnover: the rail is where this coin sits among every coin in the snapshot,
 *  the number beside it is the ratio itself.
 *
 *  See percentileRanker for why the rail cannot be the raw ratio. The tick is
 *  the 30% "busy" line in the same percentile space, so the rail keeps an
 *  absolute meaning: a bar past the tick traded a third of itself today. */
export function TurnoverCell({ value, band, rank, busyRank, compact = false }) {
  const v = value == null ? null : Number(value);
  const w = rank == null ? 0 : Math.max(2, Math.min(100, rank));
  const tone =
    band?.key === "high" ? "bg-accent" : band?.key === "elevated" ? "bg-accent/60" : "bg-accent/30";
  return (
    <span className="flex items-center justify-end gap-2">
      {!compact ? (
        <span
          className="relative hidden h-1.5 w-14 overflow-hidden rounded-full bg-ink/[0.07] sm:block lg:w-20"
          title={
            v == null
              ? "no turnover in this snapshot"
              : `24h volume is ${(v * 100).toFixed(1)}% of market cap — busier than ${
                  rank == null ? "—" : Math.round(rank)
                }% of the snapshot`
          }
        >
          <span className={`block h-full rounded-full ${tone}`} style={{ width: `${w}%` }} />
          {busyRank != null && busyRank > 0 && busyRank < 100 ? (
            <span
              className="absolute inset-y-0 w-px bg-text-primary/45"
              style={{ left: `${busyRank}%` }}
              aria-hidden="true"
              title="the 30% busy line"
            />
          ) : null}
        </span>
      ) : null}
      <span className="w-10 text-right font-mono text-[11px] tabular-nums text-text-primary">
        {v == null ? "—" : v.toFixed(2)}
      </span>
    </span>
  );
}

/** A word for the band, so turnover is never carried by colour alone. */
export function BandTag({ band }) {
  if (!band || band.key === "none") return <span className="text-text-muted">—</span>;
  const cls =
    band.key === "high"
      ? "bg-accent/15 text-accent"
      : band.key === "elevated"
        ? "bg-ink/[0.06] text-text-secondary"
        : "bg-transparent text-text-muted";
  return (
    <span className={`rounded px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wider ${cls}`}>
      {band.label}
    </span>
  );
}

/** Volume against its own level a week ago. This is a magnitude, not a
 *  direction — more trading is not good news — so it wears one hue and the
 *  emphasis only arrives at the 3x line the finding strip counts. */
export function VolCell({ x }) {
  if (x == null) return <span className="font-mono text-[11px] text-text-muted">—</span>;
  const hot = x >= 3;
  const cold = x < 0.5;
  return (
    <span
      className={`font-mono text-[11.5px] tabular-nums ${
        hot ? "font-semibold text-accent" : cold ? "text-text-muted" : "text-text-secondary"
      }`}
      title={`24h volume is ${fmtMultiple(x)} what it was seven days ago`}
    >
      {fmtMultiple(x)}
    </span>
  );
}

/** A value against the book it belongs to: the bar is the value, the tick is
 *  the book's median. A bullet chart, which is the honest shape for "is this
 *  one above or below typical" — a bare bar only ever says "bigger". */
export function BulletCell({ value, max, median: mid, suffix = "%", digits = 1, tone = "accent" }) {
  if (value == null)
    return <span className="font-mono text-[11.5px] text-text-muted">—</span>;
  const w = max ? Math.min(100, (value / max) * 100) : 0;
  const t = mid != null && max ? Math.min(100, (mid / max) * 100) : null;
  const fill = tone === "profit" ? "bg-profit/70" : "bg-accent/70";
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="relative hidden h-1.5 w-14 overflow-hidden rounded-full bg-ink/[0.07] sm:block lg:w-[72px]">
        <span className={`block h-full rounded-full ${fill}`} style={{ width: `${w}%` }} />
        {t != null ? (
          <span
            className="absolute inset-y-0 w-px bg-text-primary/45"
            style={{ left: `${t}%` }}
            aria-hidden="true"
            title="book median"
          />
        ) : null}
      </span>
      <span className="w-[46px] text-right font-mono text-[11.5px] tabular-nums text-text-primary">
        {value.toFixed(digits)}
        <span className="text-[0.8em] text-text-muted">{suffix}</span>
      </span>
    </span>
  );
}

/** A rate printed WITH the interval it rests on.
 *
 *  Across narratives the win rate runs 83 to 94 with intervals of two to eight
 *  points, so almost no pair of rows is actually different. Printing the rate
 *  alone invites a ranking the sample cannot support; printing the interval
 *  next to it is the cheapest possible honesty. */
export function RateCell({ value, half, n, digits = 1, dim = false }) {
  if (value == null) return <span className="text-text-muted">—</span>;
  return (
    <span className="whitespace-nowrap font-mono tabular-nums">
      <span className={`text-[12px] ${dim ? "text-text-secondary" : "text-text-primary"}`}>
        {Number(value).toFixed(digits)}%
      </span>
      {/* The interval and the sample both ride here, and they need a real
          separator between them: "±6.6" and "97" set side by side read as one
          number, 87.6% ±6.697. */}
      {half != null ? (
        <span className="ml-1 text-[9.5px] text-text-muted">
          {"\u00B1"}
          {Number(half).toFixed(1)}
        </span>
      ) : null}
      {n != null ? (
        <span className="ml-1 text-[9.5px] text-text-muted">
          <span className="px-0.5 opacity-40">{"\u00B7"}</span>
          {n}
        </span>
      ) : null}
    </span>
  );
}

/** A finding: a sentence the data supports, and the filter that proves it.
 *  Reading it and checking it are the same click. */
export function Finding({ headline, detail, active, onClick, count }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`group flex min-w-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
        active
          ? "border-accent bg-accent/[0.08]"
          : "border-ink/[0.08] hover:border-accent/40 hover:bg-ink/[0.02]"
      }`}
    >
      <span className="flex w-full min-w-0 items-baseline gap-1.5">
        <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-text-primary">
          {headline}
        </span>
        <span
          className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] ${
            active ? "text-accent" : "text-text-muted group-hover:text-accent"
          }`}
        >
          {active ? "Showing" : "Show"}
          {count != null ? ` ${count}` : ""}
        </span>
      </span>
      {/* The reasoning is desk-only. Three findings with their full detail push
          420px of prose above the first row on a phone, which is a scroll past
          the thing the panel is for. The headline and the count are the whole
          claim; the sentence behind it is for the screen that has room. */}
      <span className="hidden text-[11px] leading-snug text-text-muted sm:block">{detail}</span>
    </button>
  );
}

/** A figure with its label, for the strips above a table. */
export function Stat({ label, value, sub, tone = "" }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">{label}</p>
      <p className={`font-mono text-[17px] font-medium tabular-nums leading-tight ${tone || "text-text-primary"}`}>
        {value}
      </p>
      {sub ? <p className="mt-px truncate text-[10.5px] text-text-muted">{sub}</p> : null}
    </div>
  );
}

/** One row of a 100% stacked bar — parts of a single whole, which is the one
 *  case this shape is right for. */
export function ShareBar({ parts = [], height = "h-1.5", title }) {
  const total = parts.reduce((s, p) => s + (p.value || 0), 0);
  if (!total) return null;
  return (
    <span className={`flex ${height} w-full overflow-hidden rounded-full bg-ink/[0.07]`} title={title}>
      {parts.map((p) =>
        p.value > 0 ? (
          <span
            key={p.key}
            style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
            title={`${p.label} ${Math.round((p.value / total) * 100)}%`}
          />
        ) : null
      )}
    </span>
  );
}

/** A diverging rail around a real zero, with the overflow marked. */
export function DivergingBar({ value, ref: reference, height = "h-3.5" }) {
  const v = value == null ? 0 : Number(value);
  const pos = v >= 0;
  const w = reference ? Math.min(100, (Math.abs(v) / reference) * 100) : 0;
  const over = reference ? Math.abs(v) > reference : false;
  return (
    <span className={`relative flex ${height} min-w-0 flex-1 items-center`}>
      <span className="absolute inset-y-0 left-1/2 w-px bg-ink/[0.12]" aria-hidden="true" />
      <span className="flex h-full w-1/2 justify-end">
        {!pos ? (
          <span className="relative h-full rounded-l-sm bg-loss/70" style={{ width: `${w}%` }}>
            {over ? <span className="absolute inset-y-0 left-0 w-1 bg-loss" aria-hidden="true" /> : null}
          </span>
        ) : null}
      </span>
      <span className="flex h-full w-1/2">
        {pos ? (
          <span className="relative h-full rounded-r-sm bg-profit/70" style={{ width: `${w}%` }}>
            {over ? <span className="absolute inset-y-0 right-0 w-1 bg-profit" aria-hidden="true" /> : null}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** The header every section under a panel wears, so the panel reads as one
 *  document rather than four widgets that happen to be stacked. */
export function SectionHead({ title, note, right }) {
  return (
    <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="text-[12.5px] font-medium text-text-primary">{title}</span>
      {note ? (
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
          {note}
        </span>
      ) : null}
      {right ? <span className="ml-auto">{right}</span> : null}
    </div>
  );
}
