// Price against turnover, drawn on canvas.
//
// This chart was Recharts, which builds a DOM node per point. Four hundred
// coins meant four hundred SVG elements the browser re-laid-out every time the
// domain moved, and that is the cost no amount of tuning removes — it is what
// "they draw to canvas and move a viewport instead of re-rendering a scene
// graph" meant in the zoom commit. ECharts draws the field to a bitmap, so 400
// points and 40,000 cost about the same.
//
// Three things that were hand-built here become configuration, which is the
// real argument for the move:
//
//   · label collision   -> labelLayout: { hideOverlap: true }
//   · cooperative wheel -> dataZoom zoomOnMouseWheel: "ctrl"
//   · the log axis      -> yAxis type: "log", on the real turnover value
//
// What does NOT come for free is every decision above them: which regime a
// point belongs to, fitting each side of x on its own percentile, ranking which
// coins earn a mark, and the floor that lets a coin with no turnover still
// appear. Those are carried over deliberately, not re-derived.
import { useEffect, useMemo, useRef } from "react";

import EChart, { useChartTokens, inkAlpha } from "../../charts/EChart";
import { logoDiscSeries } from "../logoDisc";
import { roamDataZoom, makeZoomApi } from "../chartRoam";
import { pctRange, clampRange, pickLabels, labelCells, statusColorOf } from "../vizShared";
import { ANOM_FLOOR, ANOM_FILL } from "../anomSetups";

/** Disc diameter — shared by the logo layer and the invisible hit/label layer. */
const LOGO = 30;

/** Decade ticks for the turnover axis: 0.1%, 1%, 10%, 100%. */
const yTick = (v) => {
  if (v >= 1) return `${Math.round(v)}%`;
  if (v >= 0.1) return `${v.toFixed(1)}%`;
  return `${v.toFixed(2)}%`;
};

/**
 * The whole chart as data.
 *
 * Pulled out of the component so it can be asserted on: renderToString does not
 * run useEffect, so a render test proves the tree builds and nothing about
 * whether the axis is logarithmic, the wheel demands a modifier, or the field
 * is batched. Those are the reasons for the move, so they are the things worth
 * a test.
 */
export function buildAnomalyOption({
  points,
  medFlow,
  statusMap,
  tokens,
  height,
  labelMode = "focus",
  maxNames = 16,
}) {
  // Same asymmetric fit as before: 24h change is not symmetric on any given
  // day, and mirroring the larger side hands half the canvas to a region no
  // coin is in. Zero stays inside because the chart is read against it.
  const xr = pctRange(
    points.map((p) => p.x),
    0.98,
    0,
    8
  );

  const withPos = points.map((p) => ({
    ...p,
    cx: clampRange(p.x, xr),
    // A log axis cannot hold zero, and a coin that traded nothing still
    // belongs on the board.
    cy: Math.max(p.y, ANOM_FLOOR),
  }));

  // Which coins earn a mark and a ticker. hideOverlap below will drop a label
  // that cannot fit, but it cannot decide WHICH to keep — left to itself it
  // keeps whatever it drew first. Ranking by distance from the 3x line in the
  // space that is actually drawn is the same rule the SVG version used.
  const yRef = Math.log10(Math.max(medFlow * 3, ANOM_FLOOR));
  const span = Math.log10(Math.max(...withPos.map((p) => p.cy), 1)) - Math.log10(ANOM_FLOOR);
  const named =
    labelMode === "off"
      ? new Set()
      : pickLabels(
          withPos.map((p) => ({
            id: p.pair,
            x: ((p.cx - xr[0]) / (xr[1] - xr[0] || 1)) * 1000,
            y: ((Math.log10(p.cy) - Math.log10(ANOM_FLOOR)) / (span || 1)) * 1000,
            priority: Math.hypot(p.x / 25, (Math.log10(p.cy) - yRef) / 1.2),
          })),
          {
            ...labelCells(height, labelMode === "all" ? { w: 44, h: 44 } : undefined),
            max: labelMode === "all" ? 400 : maxNames,
          }
        );

  const dot = (p) => ({
    value: [p.cx, p.cy],
    name: p.pair,
    itemStyle: {
      color: ANOM_FILL[p.setup] || ANOM_FILL.ordinary,
      borderColor: statusColorOf(statusMap, p.pair) || "transparent",
      borderWidth: statusColorOf(statusMap, p.pair) ? 2 : 0,
    },
  });

  const sym = (pair) => String(pair || "").replace(/USDT$/i, "");
  const field = withPos.filter((p) => !named.has(p.pair)).map(dot);
  const marks = withPos.filter((p) => named.has(p.pair));

  return {
    animation: false,
    grid: { left: 56, right: 20, top: 16, bottom: 34 },
    tooltip: {
      trigger: "item",
      backgroundColor: tokens["surface-raised"],
      borderColor: inkAlpha(tokens, 0.12),
      borderWidth: 1,
      textStyle: { color: tokens.fg, fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
      formatter: (p) =>
        `${sym(p.name)}<br/>24h ${p.value[0] >= 0 ? "+" : ""}${p.value[0].toFixed(2)}%` +
        `<br/>turnover ${p.value[1].toFixed(2)}%`,
    },
    xAxis: {
      type: "value",
      min: xr[0],
      max: xr[1],
      axisLabel: {
        color: tokens["fg-muted"],
        fontSize: 11,
        fontFamily: "JetBrains Mono, monospace",
        formatter: (v) => `${v.toFixed(0)}%`,
      },
      splitLine: { lineStyle: { color: inkAlpha(tokens, 0.06) } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      // Turnover is log-normal: the median call trades ~2% of its cap a day
      // and a hot micro-cap trades sixty. On a linear axis every ordinary
      // coin lands in the bottom twentieth of the canvas.
      type: "log",
      logBase: 10,
      min: ANOM_FLOOR,
      axisLabel: {
        color: tokens["fg-muted"],
        fontSize: 11,
        fontFamily: "JetBrains Mono, monospace",
        formatter: yTick,
      },
      splitLine: { lineStyle: { color: inkAlpha(tokens, 0.06) } },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    dataZoom: roamDataZoom(),
    series: [
      {
        type: "scatter",
        symbolSize: 9,
        // The whole point of the move: past this many points ECharts batches
        // the field into one canvas path instead of styling each mark.
        large: true,
        largeThreshold: 120,
        progressive: 400,
        data: field,
        silent: false,
      },
      // A logo is the symbol itself, so the regime colour moves to the ring
      // around it — the same arrangement the SVG bubbles use. That was the
      // intent here from the start and it never rendered: ECharts does not
      // stroke a border on an image symbol, so the `borderWidth: 2` below was
      // inert and every regime looked alike. The disc draws it.
      logoDiscSeries({
        marks: marks.map((p) => ({
          pair: p.pair,
          value: dot(p).value,
          ring: statusColorOf(statusMap, p.pair) || ANOM_FILL[p.setup] || ANOM_FILL.ordinary,
        })),
        size: LOGO,
        tokens,
      }),
      {
        type: "scatter",
        // Invisible, and deliberately still here: it carries the label ranking,
        // hideOverlap, the tooltip and the click-through. The disc underneath is
        // silent, so every interaction still lands on this one.
        symbolSize: LOGO,
        data: marks.map((p) => ({
          ...dot(p),
          itemStyle: { color: "transparent", borderWidth: 0 },
        })),
        label: {
          show: labelMode !== "off",
          position: "bottom",
          distance: 6,
          color: tokens.fg,
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "JetBrains Mono, monospace",
          textBorderColor: tokens["surface-raised"],
          textBorderWidth: 3,
          formatter: (p) => sym(p.name),
        },
        // Native collision. It cannot choose WHICH label survives, which is
        // why the ranking above still runs — this only guarantees that what
        // does survive is readable.
        labelLayout: { hideOverlap: true },
        z: 5,
      },
      {
        type: "scatter",
        data: [],
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { type: "dashed", width: 1 },
          data: [
            { xAxis: 0, lineStyle: { color: inkAlpha(tokens, 0.28) } },
            ...(medFlow > 0
              ? [
                  {
                    yAxis: medFlow * 3,
                    lineStyle: { color: tokens.accent, opacity: 0.55 },
                    label: {
                      show: true,
                      formatter: "3× flow",
                      position: "insideEndTop",
                      color: tokens.accent,
                      fontSize: 10,
                      fontFamily: "JetBrains Mono, monospace",
                    },
                  },
                ]
              : []),
          ],
        },
      },
    ],
  };
}

export default function AnomalyScatter({
  points,
  medFlow,
  statusMap,
  onPair,
  height,
  labelMode = "focus",
  maxNames = 16,
  onApi,
}) {
  const tokens = useChartTokens();
  const chartRef = useRef(null);

  const option = useMemo(
    () => buildAnomalyOption({ points, medFlow, statusMap, tokens, height, labelMode, maxNames }),
    [points, medFlow, statusMap, tokens, height, labelMode, maxNames]
  );

  // Hand the card's +/-/reset buttons something to drive. They used to be
  // wired to the SVG useZoom, which no longer touches this chart — leaving them
  // connected would have shipped three buttons that quietly do nothing.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onApi) return undefined;
    onApi(makeZoomApi(chart));
    return undefined;
  }, [onApi]);

  // Clicking a point opens that pair, the way the dots always did.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;
    const handler = (p) => {
      if (p?.name) onPair?.(p.name);
    };
    chart.on("click", handler);
    return () => chart.off("click", handler);
  }, [onPair]);

  return (
    <EChart
      option={option}
      height={height}
      notMerge
      onInit={(c) => {
        chartRef.current = c;
      }}
    />
  );
}
