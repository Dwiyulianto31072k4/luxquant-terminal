// Charts for the Agent Monitor.
//
// Every chart here draws MONEY, which is a diverging quantity: two poles and a
// meaningful zero. So the palette is --pos / --neg against a neutral zero line,
// never the categorical set — those say "different thing", not "other side of
// break-even". Nothing is coloured by rank, and text stays in text tokens.
//
// Canvas via the shared EChart wrapper (the same engine the terminal runs on),
// tokens re-read on a theme flip so Bright and Dark are both first-class.
//
// TWO ECharts 6 rules this file is built around, both learned by white-screen:
//
//  • `markLine` is NOT how you draw a zero baseline any more. A markLine with
//    `data: [{ yAxis: 0 }]` throws "Cannot read properties of undefined
//    (reading 'coord')" asynchronously, AFTER the chart has mounted — so lint,
//    tests and the build all stay green and the page dies in the browser. The
//    baseline we want is the axis itself: a value axis that crosses zero puts
//    the other axis' line on zero (`axisLine.onZero`, on by default), so making
//    that line visible gives a true zero line with no extra component.
//  • `grid.containLabel` is legacy in 6 and ignored unless
//    LegacyGridContainLabel is registered — labels are simply clipped. Grids
//    here reserve their gutter explicitly, measured from the longest label.

import { useMemo } from "react";

import EChart, { inkAlpha, useChartTokens, useTooltipStyle } from "../../../charts/EChart";
import { fmtDay, signed, usdShort } from "./agentMetrics";

// Tooltips are HTML; anything that came from data is escaped first.
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

const row = (k, v, color) =>
  `<div style="display:flex;gap:10px;justify-content:space-between"><span style="opacity:.65">${esc(
    k
  )}</span><span${color ? ` style="color:${color}"` : ""}>${esc(v)}</span></div>`;

/** The zero line, drawn by the axis that crosses it. */
const zeroLine = (t) => ({
  show: true,
  onZero: true,
  lineStyle: { color: inkAlpha(t, 0.28), width: 1 },
});

/** Cumulative net over the window. The curve answers "is this desk getting
 *  better or worse", which no tile can.
 *
 *  Coloured by where it ENDS, with the zero line and the daily bars underneath
 *  carrying the rest — a per-segment gradient needs a visualMap, and that is one
 *  more moving part on a canvas that has already taken this page down once. */
export function EquityCurve({ series, height = 200 }) {
  const t = useChartTokens();
  const base = useTooltipStyle();
  const option = useMemo(() => {
    if (!series) return null;
    const { days, cumulative, pnl, btc, end } = series;
    const tone = end >= 0 ? t.pos : t.neg;
    return {
      animationDuration: 400,
      grid: { left: 58, right: 14, top: 12, bottom: 24 },
      tooltip: {
        ...base,
        confine: true,
        formatter: (ps) => {
          const i = ps?.[0]?.dataIndex ?? 0;
          const b = btc[i];
          return [
            `<div style="margin-bottom:3px">${esc(fmtDay(days[i]))}</div>`,
            row("That day", signed(pnl[i]), pnl[i] >= 0 ? t.pos : t.neg),
            row("Running total", signed(cumulative[i]), cumulative[i] >= 0 ? t.pos : t.neg),
            b == null ? "" : row("BTC that day", `${b > 0 ? "+" : ""}${b}%`),
          ].join("");
        },
      },
      xAxis: {
        type: "category",
        data: days,
        boundaryGap: false,
        axisLine: zeroLine(t),
        axisTick: { show: false },
        axisLabel: {
          color: t["fg-muted"],
          fontSize: 10,
          hideOverlap: true,
          formatter: (d) => fmtDay(d),
        },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: t["fg-muted"], fontSize: 10, formatter: usdShort },
        splitLine: { lineStyle: { color: inkAlpha(t, 0.07) } },
      },
      series: [
        {
          type: "line",
          data: cumulative,
          showSymbol: false,
          lineStyle: { width: 2, color: tone },
          itemStyle: { color: tone },
          areaStyle: { color: tone, opacity: 0.12 },
        },
      ],
    };
  }, [series, t, base]);
  return option ? <EChart option={option} height={height} notMerge /> : null;
}

/** The same window, day by day. A curve hides whether a fall was one bad day or
 *  a slow bleed; these bars say which. */
export function DailyBars({ series, height = 110 }) {
  const t = useChartTokens();
  const base = useTooltipStyle();
  const option = useMemo(() => {
    if (!series) return null;
    const { days, pnl, btc } = series;
    return {
      animationDuration: 400,
      grid: { left: 58, right: 14, top: 8, bottom: 22 },
      tooltip: {
        ...base,
        confine: true,
        formatter: (ps) => {
          const i = ps?.[0]?.dataIndex ?? 0;
          const b = btc[i];
          return [
            `<div style="margin-bottom:3px">${esc(fmtDay(days[i]))}</div>`,
            row("That day", signed(pnl[i]), pnl[i] >= 0 ? t.pos : t.neg),
            b == null ? "" : row("BTC that day", `${b > 0 ? "+" : ""}${b}%`),
          ].join("");
        },
      },
      xAxis: {
        type: "category",
        data: days,
        axisLine: zeroLine(t),
        axisTick: { show: false },
        axisLabel: {
          color: t["fg-muted"],
          fontSize: 10,
          hideOverlap: true,
          formatter: (d) => fmtDay(d),
        },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: t["fg-muted"], fontSize: 10, formatter: usdShort },
        splitLine: { lineStyle: { color: inkAlpha(t, 0.07) } },
      },
      series: [
        {
          type: "bar",
          data: pnl.map((v) => ({ value: v, itemStyle: { color: v >= 0 ? t.pos : t.neg } })),
          barMaxWidth: 14,
        },
      ],
    };
  }, [series, t, base]);
  return option ? <EChart option={option} height={height} notMerge /> : null;
}

/** Horizontal diverging bars: one row per venue, per symbol, per anything with
 *  a name and a net. Horizontal because the names are words, and a word on a
 *  vertical axis is read without tilting the head. */
export function SplitBars({ rows, labelOf = (r) => r.key, rowHeight = 30, meta }) {
  const t = useChartTokens();
  const base = useTooltipStyle();
  const option = useMemo(() => {
    if (!rows?.length) return null;
    // ECharts stacks a category axis bottom-up, so the array is reversed to put
    // the best row at the top, where a reader starts.
    const ordered = [...rows].reverse();
    const labels = ordered.map((r) => String(labelOf(r)));
    const values = ordered.map((r) => Number(r.net) || 0);
    // containLabel is ignored in v6, so the gutter is measured: 11px text runs
    // about 6.2px a character, and the axis needs a little air after it.
    const gutter = Math.min(180, Math.max(64, Math.max(...labels.map((l) => l.length)) * 6.2 + 14));
    return {
      animationDuration: 400,
      grid: { left: gutter, right: 78, top: 6, bottom: 26 },
      tooltip: {
        ...base,
        trigger: "item",
        confine: true,
        formatter: (p) => {
          const r = ordered[p.dataIndex];
          const extra = meta?.(r) || [];
          return [
            `<div style="margin-bottom:3px">${esc(labels[p.dataIndex])}</div>`,
            row("Net", signed(r.net), r.net >= 0 ? t.pos : t.neg),
            ...extra.map(([k, v]) => row(k, v)),
          ].join("");
        },
      },
      xAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: t["fg-muted"], fontSize: 10, formatter: usdShort },
        splitLine: { lineStyle: { color: inkAlpha(t, 0.07) } },
      },
      yAxis: {
        type: "category",
        data: labels,
        axisLine: zeroLine(t),
        axisTick: { show: false },
        axisLabel: { color: t["fg-secondary"], fontSize: 11, hideOverlap: true },
      },
      series: [
        {
          type: "bar",
          data: values.map((v) => ({ value: v, itemStyle: { color: v >= 0 ? t.pos : t.neg } })),
          barMaxWidth: 16,
          label: {
            show: true,
            position: "right",
            distance: 6,
            color: t["fg-secondary"],
            fontSize: 10.5,
            fontFamily: "JetBrains Mono, monospace",
            formatter: (p) => signed(p.value),
          },
          labelLayout: { hideOverlap: true },
        },
      ],
    };
  }, [rows, labelOf, meta, t, base]);
  const height = Math.max(120, (rows?.length || 0) * rowHeight + 36);
  return option ? <EChart option={option} height={height} notMerge /> : null;
}

/** Leverage is ordinal — 2×, then 3×, then 5× — so it keeps a value axis across
 *  the bottom and reads left to right like the ladder it is. */
export function LeverageBars({ rows, height = 190 }) {
  const t = useChartTokens();
  const base = useTooltipStyle();
  const option = useMemo(() => {
    if (!rows?.length) return null;
    const ordered = [...rows].sort((a, b) => Number(a.key) - Number(b.key));
    return {
      animationDuration: 400,
      grid: { left: 58, right: 14, top: 12, bottom: 26 },
      tooltip: {
        ...base,
        trigger: "item",
        confine: true,
        formatter: (p) => {
          const r = ordered[p.dataIndex];
          return [
            `<div style="margin-bottom:3px">${esc(r.key)}× leverage</div>`,
            row("Net", signed(r.net), r.net >= 0 ? t.pos : t.neg),
            row("Trades", r.trades),
            row("Win rate", `${r.win_rate}%`),
          ].join("");
        },
      },
      xAxis: {
        type: "category",
        data: ordered.map((r) => `${r.key}×`),
        axisLine: zeroLine(t),
        axisTick: { show: false },
        axisLabel: { color: t["fg-secondary"], fontSize: 11 },
      },
      yAxis: {
        type: "value",
        axisLine: { show: false },
        axisLabel: { color: t["fg-muted"], fontSize: 10, formatter: usdShort },
        splitLine: { lineStyle: { color: inkAlpha(t, 0.07) } },
      },
      series: [
        {
          type: "bar",
          data: ordered.map((r) => ({
            value: Number(r.net) || 0,
            itemStyle: { color: Number(r.net) >= 0 ? t.pos : t.neg },
          })),
          barMaxWidth: 46,
        },
      ],
    };
  }, [rows, t, base]);
  return option ? <EChart option={option} height={height} notMerge /> : null;
}
