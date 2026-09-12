// SignalsNarrativeSankey — where the desk's calls flowed, and how they ended.
//
// A Sankey has one rule: it must CONSERVE. The ribbons leaving the left column
// have to add up to the same quantity arriving on the right, or the picture is
// simply false. Narratives break that rule on their own — a coin sits in 4.62
// CoinGecko categories on average and up to 16, so counting each call once per
// narrative inflates the total by that factor.
//
// So the backend splits every call evenly across the narratives it belongs to:
// a coin in five narratives sends a fifth of its call to each. Verified against
// production 2026-09-12 — 2,655 resolved calls, 2,655.00 units of weight. The
// figures are fractional on purpose, and the panel says so rather than rounding
// them into a claim they cannot support.
//
// Colour is the TP ladder, which is ORDINAL: --viz-tp1..tp4 is one validated
// hue ramp going light→dark as a call gets further, and SL is the loss colour.
// That is the one place a verdict colour is correct here — an outcome IS the
// result, unlike the narrative it came from.

import { useMemo } from "react";
import EChart, { useChartTokens, inkAlpha } from "./charts/EChart";

const OUTCOMES = [
  { key: "tp4", label: "TP4", token: "viz-tp4" },
  { key: "tp3", label: "TP3", token: "viz-tp3" },
  { key: "tp2", label: "TP2", token: "viz-tp2" },
  { key: "tp1", label: "TP1", token: "viz-tp1" },
  { key: "sl", label: "SL", token: "neg" },
];

/** Long category names wreck a Sankey's left column; ECharts will not wrap. */
const shorten = (name, max = 22) => {
  const s = String(name || "");
  if (s.length <= max) return s;
  // Cut at a word boundary so "Binance HODLer Airdrops" never becomes "Binance
  // HODLer Airdr…".
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.5 ? cut.slice(0, sp) : cut).trim()}…`;
};

export default function SignalsNarrativeSankey({
  narratives = [],
  activeIds = [],
  topN = 8,
  height = 380,
}) {
  const t = useChartTokens();

  const { option, totals, shown } = useMemo(() => {
    const active = new Set(activeIds || []);
    // When the desk is filtered, the flow should describe what is on screen.
    const pool = active.size
      ? narratives.filter((x) => active.has(x.category_id))
      : narratives;

    const withFlow = pool
      .filter((x) => x.flow_total > 0)
      .sort((a, b) => (b.flow_total || 0) - (a.flow_total || 0));

    const head = withFlow.slice(0, topN);
    const tail = withFlow.slice(topN);

    const nodes = [];
    const links = [];
    const totals = { tp4: 0, tp3: 0, tp2: 0, tp1: 0, sl: 0 };

    const push = (label, flow) => {
      if (!flow) return;
      nodes.push({ name: label, itemStyle: { color: inkAlpha(t, 0.32) } });
      for (const o of OUTCOMES) {
        const w = Number(flow[o.key] || 0);
        if (w <= 0) continue;
        totals[o.key] += w;
        links.push({ source: label, target: o.label, value: Number(w.toFixed(3)) });
      }
    };

    for (const x of head) push(shorten(x.name), x.outcome_flow || {});

    // The tail is folded rather than dropped: a Sankey that silently omits rows
    // stops conserving, which is the whole reason this shape was chosen.
    if (tail.length) {
      const merged = {};
      for (const x of tail) {
        for (const o of OUTCOMES) {
          merged[o.key] = (merged[o.key] || 0) + Number(x.outcome_flow?.[o.key] || 0);
        }
      }
      push(`${tail.length} more`, merged);
    }

    for (const o of OUTCOMES) {
      if (totals[o.key] > 0) {
        nodes.push({ name: o.label, itemStyle: { color: t[o.token] || t.accent } });
      }
    }

    const option = {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        backgroundColor: t["surface-raised"],
        borderColor: inkAlpha(t, 0.12),
        borderWidth: 1,
        padding: [7, 10],
        textStyle: { color: t.fg, fontSize: 11.5 },
        formatter: (p) =>
          p.dataType === "edge"
            ? `${p.data.source} → <b>${p.data.target}</b><br/>${p.data.value.toFixed(1)} calls`
            : `<b>${p.name}</b><br/>${Number(p.value || 0).toFixed(1)} calls`,
      },
      series: [
        {
          type: "sankey",
          left: 0,
          right: 54,
          top: 6,
          bottom: 6,
          nodeWidth: 9,
          nodeGap: 9,
          nodeAlign: "justify",
          draggable: false,
          emphasis: { focus: "adjacency" },
          label: {
            color: t["fg-secondary"] || t.fg,
            fontSize: 11,
            // Left column labels sit outside the node; the right column's would
            // run off the canvas, so they turn inward.
            formatter: "{b}",
          },
          labelLayout: { hideOverlap: true },
          lineStyle: { color: "gradient", opacity: 0.32, curveness: 0.5 },
          data: nodes,
          links,
        },
      ],
    };

    return {
      option,
      totals,
      shown: head.length + (tail.length ? 1 : 0),
    };
  }, [narratives, activeIds, topN, t]);

  const grand = OUTCOMES.reduce((s, o) => s + totals[o.key], 0);
  if (!grand) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {OUTCOMES.map((o) =>
          totals[o.key] > 0 ? (
            <span key={o.key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ background: t[o.token] || t.accent }}
                aria-hidden="true"
              />
              <span className="text-[11px] text-text-secondary">{o.label}</span>
              <span className="font-mono text-[10.5px] tabular-nums text-text-muted">
                {Math.round((totals[o.key] / grand) * 100)}%
              </span>
            </span>
          ) : null
        )}
      </div>

      <EChart option={option} height={height} notMerge className="min-h-0 flex-1" />

      <p className="mt-1.5 text-[11px] leading-snug text-text-muted">
        {grand.toFixed(0)} resolved calls across {shown} narratives. A coin belongs to several
        narratives at once, so each call is split evenly between them — the widths add up to the
        number of calls, not to a count per narrative.
      </p>
    </div>
  );
}
