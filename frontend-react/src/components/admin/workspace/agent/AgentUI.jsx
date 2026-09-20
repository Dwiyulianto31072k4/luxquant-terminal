// The Agent Monitor's own small design system.
//
// Built in HTML on purpose. Every remaining "chart" on this page is a share, a
// pair, or a ranked row — shapes where a canvas costs crispness and detaches
// the label from its mark, and buys nothing back. Here a value sits AT the end
// of its own bar, text stays selectable, and the whole thing reflows on a
// phone without a resize observer.
//
// Rules this file keeps:
//   • money wears --pos / --neg, health wears the status scale, everything else
//     is ink. Nothing is legible by colour alone: every coloured number has a
//     word beside it.
//   • one type ramp: mono + tabular for figures, sans for prose.
//   • bars are thin, tracks are one shade off the surface, and a bar always
//     starts at a shared baseline so lengths are comparable.

import { num, pct, signed, usd } from "./agentMetrics";

export const EYEBROW =
  "font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-text-muted";

export const moneyTone = (v) =>
  num(v) === null ? "text-text-muted" : num(v) >= 0 ? "text-positive" : "text-loss";

/** A section. The hint is not decoration: it is where the card says what the
 *  reader is looking at, in a sentence, so no figure has to be guessed at. */
export function Card({ title, hint, right, children, className = "", padded = true, id }) {
  return (
    <section
      id={id}
      className={`rounded-xl border border-ink/[0.07] bg-surface-raised ${className}`}
    >
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 px-4 pb-3 pt-3.5">
          <div className="min-w-0">
            <h3 className="text-[13.5px] font-semibold leading-tight text-text-primary">{title}</h3>
            {hint ? (
              <p className="mt-1 max-w-[62ch] text-[11.5px] leading-snug text-text-muted">{hint}</p>
            ) : null}
          </div>
          {/* min-w-0, never shrink-0: this slot carries the filter rail, and a
              rail that cannot shrink drags the whole page 700px wide on a
              phone instead of wrapping. */}
          {right ? <div className="min-w-0 max-w-full">{right}</div> : null}
        </header>
      ) : null}
      <div className={padded ? "px-4 pb-4" : ""}>{children}</div>
    </section>
  );
}

/** The number the page leads with. Sans, big, with the window under it. */
export function Hero({ label, value, tone, sub, foot }) {
  return (
    <div>
      <p className={EYEBROW}>{label}</p>
      <p className={`mt-2 font-mono text-[40px] font-semibold leading-none tracking-tight ${tone || "text-text-primary"}`}>
        {value}
      </p>
      {sub ? <p className="mt-2 text-[12.5px] leading-snug text-text-secondary">{sub}</p> : null}
      {foot ? <p className="mt-1 text-[11px] leading-snug text-text-muted">{foot}</p> : null}
    </div>
  );
}

/** A small figure in a grid of figures. Clickable when rows sit behind it. */
export function Stat({ label, value, sub, tone, onClick, title }) {
  const Box = onClick ? "button" : "div";
  return (
    <Box
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={`rounded-lg border border-ink/[0.07] bg-ink/[0.015] px-3 py-2.5 text-left ${
        onClick
          ? "transition-colors hover:border-ink/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
          : ""
      }`}
    >
      <p className={EYEBROW}>{label}</p>
      <p className={`mt-1.5 font-mono text-[19px] font-semibold leading-none ${tone || "text-text-primary"}`}>
        {value}
      </p>
      {sub ? <p className="mt-1.5 text-[11px] leading-snug text-text-muted">{sub}</p> : null}
    </Box>
  );
}

/** One finding: a share of the loss, the thing it is a share of, and a track
 *  that makes two findings comparable at a glance. */
export function Finding({ share, headline, detail, onClick }) {
  const Box = onClick ? "button" : "div";
  return (
    <Box
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-lg border border-ink/[0.07] bg-ink/[0.015] px-3.5 py-3 text-left ${
        onClick ? "transition-colors hover:border-ink/20" : ""
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[26px] font-semibold leading-none text-loss">
          {Math.round(share)}%
        </span>
        <span className="text-[12px] text-text-secondary">of the loss</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(2, Math.min(100, share))}%`, background: "rgb(var(--neg))" }}
        />
      </div>
      <p className="mt-2 text-[12.5px] font-medium leading-snug text-text-primary">{headline}</p>
      <p className="text-[11.5px] leading-snug text-text-muted">{detail}</p>
    </Box>
  );
}

/** A 100% stacked bar: part-to-whole for one set of shares, with the legend
 *  carrying the numbers. Segments are separated by a 2px surface gap rather
 *  than a border, and nothing under 2% is allowed to vanish. */
export function ShareBar({ segments }) {
  return (
    <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
      {segments.map((s) => (
        <div
          key={s.key}
          title={`${s.label} — ${s.share.toFixed(1)}%`}
          style={{ width: `${Math.max(1.2, s.share)}%`, background: s.color }}
          className="h-full first:rounded-l-full last:rounded-r-full"
        />
      ))}
    </div>
  );
}

/** A row under a ShareBar: swatch, name, what it means, and its figures. */
export function ShareRow({ color, label, note, share, trades, net, dim }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        aria-hidden
        className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
        style={{ background: color }}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-[12.5px] leading-tight ${dim ? "text-text-muted" : "text-text-primary"}`}>
          {label}
        </p>
        {note ? <p className="text-[10.5px] leading-tight text-text-muted">{note}</p> : null}
      </div>
      <span className="w-12 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-text-secondary">
        {pct(share, 0)}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-text-muted">
        {trades}
      </span>
      <span className={`w-20 shrink-0 text-right font-mono text-[11.5px] tabular-nums ${moneyTone(net)}`}>
        {signed(net)}
      </span>
    </div>
  );
}

/** Two quantities that belong on opposite sides of one baseline: won against
 *  lost, the average win against the average loss, how long each is held. The
 *  centre line is the comparison; the numbers sit at the outer ends where they
 *  cannot be confused with each other. */
export function PairRow({ label, hint, left, right, leftValue, rightValue, max, unit = "money" }) {
  // Percent of the HALF it sits in, not of the whole track: each side is its
  // own 50% box, so the largest value fills its side completely.
  const w = (v) => `${Math.max(2, Math.min(100, (100 * Math.abs(v)) / (max || 1)))}%`;
  const fmt = (v) => (unit === "money" ? usd(Math.abs(v)) : `${Math.abs(v).toFixed(1)} h`);
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12.5px] leading-tight text-text-primary">{label}</p>
        {hint ? <p className="text-[10.5px] leading-tight text-text-muted">{hint}</p> : null}
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className={`w-20 shrink-0 text-right font-mono text-[12px] tabular-nums ${leftValue ? "text-loss" : "text-text-muted"}`}>
          {fmt(left)}
        </span>
        <div className="relative flex h-2.5 flex-1 items-center">
          <div className="absolute inset-y-0 left-1/2 w-px bg-ink/25" />
          <div className="flex w-1/2 justify-end">
            <div className="h-2.5 rounded-l-full" style={{ width: w(left), background: "rgb(var(--neg))" }} />
          </div>
          <div className="flex w-1/2 justify-start">
            <div className="h-2.5 rounded-r-full" style={{ width: w(right), background: "rgb(var(--pos))" }} />
          </div>
        </div>
        <span className={`w-20 shrink-0 font-mono text-[12px] tabular-nums ${rightValue ? "text-positive" : "text-text-muted"}`}>
          {fmt(right)}
        </span>
      </div>
    </div>
  );
}

/** A bar inside a table cell: the row's share of the biggest row, so a table of
 *  accounts reads as a ranking without a second chart beside it. */
export function BarCell({ value, max, children }) {
  const share = max ? Math.min(100, (100 * Math.abs(num(value) || 0)) / max) : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-ink/[0.07] sm:block">
        <div
          className="ml-auto h-full rounded-full"
          style={{
            width: `${Math.max(2, share)}%`,
            background: (num(value) || 0) >= 0 ? "rgb(var(--pos))" : "rgb(var(--neg))",
          }}
        />
      </div>
      <span className={`font-mono text-[12px] tabular-nums ${moneyTone(value)}`}>{children}</span>
    </div>
  );
}
