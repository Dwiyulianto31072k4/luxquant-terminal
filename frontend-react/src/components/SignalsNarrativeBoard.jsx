// SignalsNarrativeBoard — the overview half of the Narratives panel.
//
// Shneiderman's order: overview, then zoom and filter, then details on demand.
// The table is the detail; this is everything above it.
//
// Three questions, three shapes, each picked for what it is actually good at:
//
//   Market breadth  → HALF GAUGE. One ratio against a fixed range, read at a
//                     glance. Gauges are a bad way to compare things and a fine
//                     way to show a single share of a whole.
//   Outcome mix     → DONUT. Five parts of one whole, summing to 100%. This is
//                     the narrow case a donut is right for, and it works because
//                     the weights conserve (each call is split 1/k across its
//                     narratives, so the ring totals the call count).
//   Rotation vs us  → SCATTER. Two continuous variables across 40 items. No
//                     donut or gauge can hold this, and it is the only shape
//                     that shows the relationship rather than two rankings.
//
// The scatter is the point of the panel. Measured 2026-09-12 the correlation
// between capital rotating INTO a narrative and our calls running further there
// is 0.07 — effectively none, with the quadrants splitting 10/10/10/10. That is
// worth showing, not hiding: a hot narrative is not a reason to expect more from
// a call, and the chart says so honestly by refusing to form a trend.
//
// Drawn in plain SVG rather than a chart library: 40 points and two axes do not
// justify a bundle, and hand-drawn marks let the theme tokens apply directly.

import { useMemo } from "react";
import { InfoTip } from "./GuideInfo";

const OUT = [
  { key: "tp4", label: "TP4", token: "--viz-tp4" },
  { key: "tp3", label: "TP3", token: "--viz-tp3" },
  { key: "tp2", label: "TP2", token: "--viz-tp2" },
  { key: "tp1", label: "TP1", token: "--viz-tp1" },
  { key: "sl", label: "SL", token: null },
];

const money = (v) => {
  const n = Math.abs(Number(v) || 0);
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
};

/** Share of narratives beating the market, as a half ring. */
function BreadthGauge({ up, total }) {
  const pct = total ? up / total : 0;
  const R = 34;
  const C = Math.PI * R; // half circumference
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 80 46" className="h-[46px] w-20 shrink-0" role="img" aria-label={`${up} of ${total} narratives ahead of the market`}>
        <path d={`M6 40 A ${R} ${R} 0 0 1 74 40`} fill="none" stroke="rgb(var(--ink) / 0.1)" strokeWidth="7" strokeLinecap="round" />
        <path
          d={`M6 40 A ${R} ${R} 0 0 1 74 40`}
          fill="none"
          stroke="rgb(var(--pos))"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${pct * C} ${C}`}
        />
        <text x="40" y="34" textAnchor="middle" className="fill-text-primary" style={{ fontSize: 15, fontFamily: "monospace" }}>
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium text-text-primary">Market breadth</p>
        <p className="text-[11px] leading-snug text-text-muted">
          <span className="font-mono tabular-nums text-profit">{up}</span> of {total} narratives
          beat the market
        </p>
      </div>
    </div>
  );
}

/** Outcome mix of every resolved call in the window. */
function OutcomeDonut({ totals }) {
  const grand = OUT.reduce((s, o) => s + (totals[o.key] || 0), 0);
  if (!grand) return null;
  const R = 30;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 80 80" className="h-[62px] w-[62px] shrink-0" role="img" aria-label="Outcome mix">
        <g transform="translate(40,40) rotate(-90)">
          {OUT.map((o) => {
            const v = totals[o.key] || 0;
            if (!v) return null;
            const len = (v / grand) * C;
            const el = (
              <circle
                key={o.key}
                r={R}
                fill="none"
                stroke={o.token ? `var(${o.token})` : "rgb(var(--neg))"}
                strokeWidth="11"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-acc}
              />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x="40" y="44" textAnchor="middle" className="fill-text-primary" style={{ fontSize: 13, fontFamily: "monospace" }}>
          {Math.round(grand)}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium text-text-primary">How they ended</p>
        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
          {OUT.map((o) =>
            totals[o.key] ? (
              <span key={o.key} className="flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: o.token ? `var(${o.token})` : "rgb(var(--neg))" }}
                />
                <span className="font-mono text-[9.5px] tabular-nums text-text-muted">
                  {o.label} {Math.round(((totals[o.key] || 0) / grand) * 100)}%
                </span>
              </span>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
}

/** Shared derivation so the strip and the chart can never disagree. */
function buildModel(narratives, marketChange7d) {
  const m = marketChange7d ?? 0;
  const rows = narratives.filter((x) => x.mcap_change_7d != null && x.median_peak != null);
  const items = rows.map((x) => ({
    id: x.category_id,
    name: x.name,
    rs: (x.mcap_change_7d ?? 0) - m,
    peak: x.median_peak,
    coins: x.coins_called || 1,
    raw: x,
  }));
  const peaks = [...items.map((i) => i.peak)].sort((a, b) => a - b);
  const medianPeak = peaks.length ? peaks[Math.floor(peaks.length / 2)] : 0;
  const totals = {};
  for (const x of narratives) {
    for (const o of OUT) totals[o.key] = (totals[o.key] || 0) + Number(x.outcome_flow?.[o.key] || 0);
  }
  return {
    items,
    medianPeak,
    totals,
    up: items.filter((i) => i.rs > 0).length,
    total: items.length,
    moved: rows.reduce((t, x) => t + Math.abs(x.flow_usd_7d || 0), 0),
  };
}

export default function SignalsNarrativeBoard({ narratives = [], marketChange7d = null }) {
  const model = useMemo(() => buildModel(narratives, marketChange7d), [narratives, marketChange7d]);

  if (!model.items.length) return null;

  return (
    <div>
      <div className="grid grid-cols-1 items-center gap-x-5 gap-y-3 rounded-lg bg-ink/[0.02] px-3 py-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_auto]">
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium text-text-primary">Market · 7 days</p>
          <p className="font-mono text-[19px] font-medium tabular-nums leading-tight">
            <span className={(marketChange7d ?? 0) >= 0 ? "text-profit" : "text-loss"}>
              {(marketChange7d ?? 0) >= 0 ? "+" : ""}
              {(marketChange7d ?? 0).toFixed(2)}%
            </span>
          </p>
          <p className="text-[10.5px] text-text-muted">{money(model.moved)} of cap moved</p>
        </div>
        <BreadthGauge up={model.up} total={model.total} />
        <OutcomeDonut totals={model.totals} />
        <span className="justify-self-end">
          <InfoTip
            side="bottom"
            title="Narrative board"
            text={
              "Market · 7 days is the change across every narrative on this desk, and it is the baseline everything else is measured against.\n\n" +
              "Breadth is how many narratives beat that baseline. High breadth means the move is broad; low breadth means a handful of stories are carrying it.\n\n" +
              "How they ended is every resolved call in the window, split by the level it reached. Each call is divided evenly across the narratives it belongs to, so the ring totals the call count rather than double counting.\n\n" +
              "The chart plots rotation against how far our calls ran there. Measured 2026-09-12 those two are essentially uncorrelated (0.07) — capital arriving in a narrative is NOT a reason to expect more from a call in it, and the scatter shows that honestly by not forming a trend."
            }
          />
        </span>
      </div>

    </div>
  );
}
