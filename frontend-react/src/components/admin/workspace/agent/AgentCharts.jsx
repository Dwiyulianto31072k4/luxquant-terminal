// The two charts on the Agent Monitor that earn a canvas.
//
// Everything else on the page is drawn in HTML (see AgentUI.jsx), because the
// rest of this data is a handful of shares and pairs: HTML keeps the label
// welded to its bar, stays crisp at any zoom, and cannot produce the failure
// the first version shipped — ten bars of near-identical length with their
// values floating in a column an inch away.
//
// What is left is the one thing a canvas is for: 26 days of money over time.
//
// Money is DIVERGING — two poles, a real zero — so the palette is --pos/--neg
// against a zero line, never the categorical set. The zero line is the axis
// itself (`axisLine.onZero`): in ECharts 6 a `markLine` at zero throws
// "reading 'coord'" AFTER mount, which keeps the build green and kills the page.

import { useMemo } from "react";

import EChart, { inkAlpha, useChartTokens, useTooltipStyle } from "../../../charts/EChart";
import { fmtDay, signed, usdShort } from "./agentMetrics";

const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

const line = (k, v, color) =>
  `<div style="display:flex;gap:12px;justify-content:space-between"><span style="opacity:.6">${esc(
    k
  )}</span><span${color ? ` style="color:${color}"` : ""}>${esc(v)}</span></div>`;

const MONO = "JetBrains Mono, monospace";

/** Running total over the window: the one question no tile answers — is this
 *  desk getting better or worse, and when did it turn?
 *
 *  The two worst days are direct-labelled (the skill's rule: label the extreme,
 *  never every point) because in production they are 81% of the whole loss;
 *  the reader should not have to hunt for them. */
export function EquityCurve({ series, worst = [], height = 260 }) {
  const t = useChartTokens();
  const base = useTooltipStyle();
  const option = useMemo(() => {
    if (!series) return null;
    const { days, cumulative, pnl, btc, end } = series;
    const tone = end >= 0 ? t.pos : t.neg;
    const marks = (worst || [])
      .map((w) => {
        const i = days.indexOf(w.day);
        return i < 0 ? null : { value: [i, cumulative[i]], day: w.day, pnl: w.pnl };
      })
      .filter(Boolean);
    return {
      animationDuration: 420,
      grid: { left: 58, right: 58, top: 26, bottom: 24 },
      tooltip: {
        ...base,
        confine: true,
        formatter: (ps) => {
          const i = ps?.[0]?.dataIndex ?? 0;
          const b = btc[i];
          return [
            `<div style="margin-bottom:4px;opacity:.75">${esc(fmtDay(days[i]))}</div>`,
            line("That day", signed(pnl[i]), pnl[i] >= 0 ? t.pos : t.neg),
            line("Running total", signed(cumulative[i]), cumulative[i] >= 0 ? t.pos : t.neg),
            b == null ? "" : line("BTC that day", `${b > 0 ? "+" : ""}${b}%`),
          ].join("");
        },
      },
      xAxis: {
        type: "category",
        data: days,
        boundaryGap: false,
        axisLine: { show: true, onZero: true, lineStyle: { color: inkAlpha(t, 0.28) } },
        axisTick: { show: false },
        axisLabel: {
          color: t["fg-muted"],
          fontSize: 10,
          fontFamily: MONO,
          hideOverlap: true,
          formatter: (d) => fmtDay(d),
        },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: t["fg-muted"], fontSize: 10, fontFamily: MONO, formatter: usdShort },
        splitLine: { lineStyle: { color: inkAlpha(t, 0.06) } },
      },
      series: [
        {
          type: "line",
          data: cumulative,
          showSymbol: false,
          smooth: 0.12,
          lineStyle: { width: 2, color: tone },
          itemStyle: { color: tone },
          areaStyle: {
            opacity: 1,
            color: {
              type: "linear",
              x: 0,
              y: end >= 0 ? 0 : 1,
              x2: 0,
              y2: end >= 0 ? 1 : 0,
              colorStops: [
                { offset: 0, color: fade(tone, 0.22) },
                { offset: 1, color: fade(tone, 0) },
              ],
            },
          },
          endLabel: {
            show: true,
            color: tone,
            fontFamily: MONO,
            fontSize: 11,
            formatter: () => signed(end),
          },
          emphasis: { disabled: true },
          z: 2,
        },
        {
          // The extremes, direct-labelled. A scatter rather than a markPoint:
          // same picture, none of v6's mark-* coordinate handling.
          type: "scatter",
          data: marks.map((m) => m.value),
          symbolSize: 7,
          itemStyle: { color: t.neg, borderColor: t["surface-raised"], borderWidth: 2 },
          label: {
            show: true,
            position: "bottom",
            distance: 8,
            color: t["fg-secondary"],
            fontFamily: MONO,
            fontSize: 10,
            formatter: (p) => {
              const m = marks[p.dataIndex];
              return `${fmtDay(m.day)}  ${signed(m.pnl)}`;
            },
          },
          labelLayout: { hideOverlap: true },
          tooltip: { show: false },
          silent: true,
          z: 3,
        },
      ],
    };
  }, [series, worst, t, base]);
  return option ? <EChart option={option} height={height} notMerge /> : null;
}

/** The same window, one bar a day. A curve hides whether a fall was one bad day
 *  or a slow bleed; this says which, and it is the only place every day is
 *  individually visible. */
export function DailyStrip({ series, height = 96 }) {
  const t = useChartTokens();
  const base = useTooltipStyle();
  const option = useMemo(() => {
    if (!series) return null;
    const { days, pnl, btc } = series;
    return {
      animationDuration: 420,
      grid: { left: 58, right: 58, top: 6, bottom: 20 },
      tooltip: {
        ...base,
        confine: true,
        formatter: (ps) => {
          const i = ps?.[0]?.dataIndex ?? 0;
          const b = btc[i];
          return [
            `<div style="margin-bottom:4px;opacity:.75">${esc(fmtDay(days[i]))}</div>`,
            line("That day", signed(pnl[i]), pnl[i] >= 0 ? t.pos : t.neg),
            b == null ? "" : line("BTC that day", `${b > 0 ? "+" : ""}${b}%`),
          ].join("");
        },
      },
      xAxis: {
        type: "category",
        data: days,
        axisLine: { show: true, onZero: true, lineStyle: { color: inkAlpha(t, 0.28) } },
        axisTick: { show: false },
        axisLabel: { show: false },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      series: [
        {
          type: "bar",
          data: pnl.map((v) => ({ value: v, itemStyle: { color: v >= 0 ? t.pos : t.neg } })),
          barMaxWidth: 12,
          barMinHeight: 1,
        },
      ],
    };
  }, [series, t, base]);
  return option ? <EChart option={option} height={height} notMerge /> : null;
}

/** A token colour with an alpha applied. The wrapper hands these over as
 *  `rgb(246 70 93)` — CSS Color 4 spacing, NOT commas, because the underlying
 *  custom property is a bare triplet. Splitting on "," alone yields one part
 *  and produces `rgba(246 70 93, undefined, undefined, .22)`, which canvas
 *  rejects at addColorStop and takes the chart down with it. */
function fade(color, alpha) {
  const m = /rgba?\(([^)]+)\)/.exec(color || "");
  if (!m) return color;
  const [r, g, b] = m[1].split(/[\s,/]+/).filter(Boolean);
  if (r == null || g == null || b == null) return color;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
