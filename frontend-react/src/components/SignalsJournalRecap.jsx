// SignalsJournalRecap — did the calls you took do better than the ones you passed?
//
// The honest answer is usually "not enough calls to say", and the chart has to
// be able to say that. The first version printed three big numbers — 100%, 100%,
// +0pp — from two resolved calls a side. Every one of those figures was correct
// and the panel as a whole was misleading: a reader has no way to see that a
// 100% built on n=2 and a 100% built on n=200 are different claims.
//
// So the form is a dot plot with Wilson intervals rather than tiles or bars.
// The dot is the rate, the bar through it is what the sample actually pins down,
// and at n=2 that bar runs most of the width — the uncertainty becomes the thing
// you see first, which is the correct reading. A percentage bar would have shown
// two full bars and implied a dead heat between two numbers that are not
// measured at all.
//
// Colour is CATEGORICAL — two groups, not good vs bad. --viz-1/--viz-2 are the
// desk's validated categorical steps (OKLab, worst adjacent CVD ΔE 9.2). Green
// and red are deliberately not used: "you took" is an identity, not an outcome,
// and painting it by whether it won turns a measurement into a verdict.

import { useMemo, useState } from "react";
import { InfoTip } from "./GuideInfo";

/** Wilson score interval — the same estimator the backend uses for tag WR.
 *  Chosen over p ± 1.96·√(p(1-p)/n) because that one collapses to zero width at
 *  p=0 and p=1, which is exactly where this panel lives: 2 of 2 would draw a
 *  point estimate with no interval at all and claim perfect certainty. */
export function wilson(wins, n, z = 1.96) {
  if (!n || n <= 0) return null;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const m = (z / d) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { p: p * 100, lo: Math.max(0, c - m) * 100, hi: Math.min(1, c + m) * 100 };
}

const ROWS = [
  { key: "taken", label: "You took", color: "var(--viz-1)" },
  { key: "skipped", label: "You passed", color: "var(--viz-2)" },
];

function Plot({ series, deskWr }) {
  const pct = (v) => `${Math.max(0, Math.min(100, v))}%`;
  return (
    <div className="relative">
      {/* The reference line is labelled up here, not on the axis. At a desk rate
          in the mid-80s its tick landed on top of the 100% tick — and the fix is
          a legend, not a nudge, because any nudge only moves the collision to
          whatever rate the desk prints next month. */}
      {deskWr != null ? (
        <div className="mb-2.5 flex items-center gap-1.5">
          <span className="inline-block w-4 border-t border-dashed border-ink/30" aria-hidden="true" />
          <span className="text-[10.5px] text-text-muted">
            Desk lifetime{" "}
            <span className="font-mono tabular-nums">{deskWr.toFixed(1)}%</span>
          </span>
        </div>
      ) : null}

      {/* Reference line first so every mark sits above it. */}
      {deskWr != null ? (
        <div
          className="pointer-events-none absolute bottom-5 top-7 z-0 border-l border-dashed border-ink/20"
          style={{ left: pct(deskWr) }}
          aria-hidden="true"
        />
      ) : null}

      <div className="space-y-3">
        {series.map((s) => (
          <div key={s.key} className="flex items-center gap-3">
            {/* Direct label: identity never rests on colour alone. */}
            <span className="w-[74px] shrink-0 text-[12px] text-text-secondary sm:w-[86px]">
              {s.label}
            </span>

            <div
              className="relative h-5 flex-1"
              title={
                s.ci
                  ? `${s.label}: ${s.wins} of ${s.n} reached TP1+ (${s.ci.p.toFixed(0)}%). 95% interval ${s.ci.lo.toFixed(0)}–${s.ci.hi.toFixed(0)}%.`
                  : `${s.label}: no resolved calls yet`
              }
            >
              {/* Track */}
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink/[0.09]" />
              {s.ci ? (
                <>
                  {/* The interval — 4px, rounded ends, the widest mark in the
                      row on purpose. */}
                  <div
                    className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-30"
                    style={{
                      left: pct(s.ci.lo),
                      width: pct(s.ci.hi - s.ci.lo),
                      background: s.color,
                    }}
                  />
                  {/* The estimate — 10px dot with a surface ring so it stays
                      readable where the two rows' intervals overlap. */}
                  <span
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-raised"
                    style={{ left: pct(s.ci.p), background: s.color }}
                  />
                </>
              ) : null}
            </div>

            <span className="w-[86px] shrink-0 text-right font-mono text-[11.5px] tabular-nums">
              {s.ci ? (
                <>
                  <span className="text-text-primary">{s.ci.p.toFixed(0)}%</span>
                  <span className="text-text-muted"> · {s.n}</span>
                </>
              ) : (
                <span className="text-text-muted">no data</span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Axis. 0–100 with a midpoint is all this needs; a denser scale would
          claim a precision the intervals openly do not have. */}
      <div className="mt-2 flex items-center gap-3">
        <span className="w-[74px] shrink-0 sm:w-[86px]" />
        <div className="relative h-4 flex-1">
          {[0, 50, 100].map((t) => (
            <span
              key={t}
              className="absolute top-0 -translate-x-1/2 font-mono text-[9.5px] tabular-nums text-text-muted"
              style={{ left: pct(t) }}
            >
              {t}%
            </span>
          ))}
        </div>
        <span className="w-[86px] shrink-0" />
      </div>
    </div>
  );
}

/** What the two intervals actually license you to say. */
function readOut({ a, b }) {
  if (!a || !b) {
    return {
      tone: "muted",
      text: "Mark calls on both sides and this will compare them.",
    };
  }
  const overlap = a.lo <= b.hi && b.lo <= a.hi;
  const diff = a.p - b.p;
  if (overlap) {
    return {
      tone: "muted",
      // The overlap IS the finding. Reporting the gap as a result here is the
      // mistake this panel exists to avoid.
      text: `The two intervals overlap, so this sample cannot tell them apart yet — the ${Math.abs(diff).toFixed(0)}pp gap is inside the noise. Keep marking.`,
    };
  }
  return {
    tone: diff >= 0 ? "up" : "down",
    text:
      diff >= 0
        ? `The calls you took reached TP1+ more often, by ${diff.toFixed(0)}pp, and the intervals do not overlap.`
        : `The calls you passed on reached TP1+ more often, by ${Math.abs(diff).toFixed(0)}pp, and the intervals do not overlap.`,
  };
}

export default function SignalsJournalRecap({ stats, deskWr = null }) {
  // Collapsed by default on a phone: this is a review panel, not something you
  // need on the way to the table, and closed it costs one line instead of
  // pushing every row down a screen. Desktop has the height, so it starts open.
  //
  // The panel really collapses at every width rather than being hidden by a
  // `sm:block` override — a button that reports aria-expanded while CSS keeps
  // the content visible anyway tells a screen reader the opposite of what is on
  // screen, and it also means a desk user can close it if they want to.
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 640px)").matches;
  });

  const series = useMemo(
    () =>
      ROWS.map((r) => {
        const n = r.key === "taken" ? stats.takenN : stats.skippedN;
        const wr = r.key === "taken" ? stats.takenWr : stats.skippedWr;
        const wins = n && wr != null ? Math.round((wr / 100) * n) : 0;
        return { ...r, n, wins, ci: n ? wilson(wins, n) : null };
      }),
    [stats]
  );

  const read = readOut({ a: series[0].ci, b: series[1].ci });
  const marked = stats.counts.taken + stats.counts.skipped;

  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
      <div className="flex items-center gap-2.5 px-3 py-2.5 sm:px-3.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted ${
              open ? "" : "-rotate-90"
            }`}
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-text-primary">Your journal</span>
            <span className="block truncate text-[11.5px] text-text-muted">
              {stats.counts.all} saved · {marked} marked
              {stats.counts.none ? ` · ${stats.counts.none} unmarked` : ""}
            </span>
          </span>
        </button>
        <InfoTip
          side="bottom"
          title="Your journal"
          text={
            "The dot is the share of your resolved calls that reached TP1+. The bar through it is the 95% Wilson interval — the range the sample actually supports.\n\n" +
            "Read the bar, not the dot. Two calls and two hundred calls can both show 100%, and only the bar tells you which one means anything. While the two bars overlap, any gap between the dots is noise.\n\n" +
            "Resolved calls only: an open call has no outcome, and counting it as a loss would make your own record look worse than it is. A win is the desk's definition — highest level reached was TP1 or better, not profit.\n\n" +
            "The dashed line is the desk's lifetime rate, for scale."
          }
        />
      </div>

      <div className={open ? "block" : "hidden"}>
        {stats.takenN || stats.skippedN ? (
          <>
            <div className="border-t border-ink/[0.06] px-3 py-3.5 sm:px-3.5">
              <Plot series={series} deskWr={deskWr} />
            </div>
            <p
              className={`border-t border-ink/[0.06] px-3 py-2.5 text-[12px] leading-snug sm:px-3.5 ${
                read.tone === "muted" ? "text-text-muted" : "text-text-secondary"
              }`}
            >
              {read.text}
            </p>
          </>
        ) : (
          <p className="border-t border-ink/[0.06] px-3 py-2.5 text-[12px] leading-snug text-text-muted sm:px-3.5">
            Mark a call Yes or No to start the comparison. Nothing leaves this list — a call you
            passed on stays, so it can be counted against the ones you took.
          </p>
        )}
      </div>
    </div>
  );
}
