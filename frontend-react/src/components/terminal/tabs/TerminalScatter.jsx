// The Live scatters, drawn on canvas.
//
// They were Recharts, which builds a DOM node per point. "Peak vs current"
// reports 594 shown, so every zoom frame asked the browser to re-lay-out about
// six hundred SVG elements — that is the lag, and it is not a thing tuning
// removes. Canvas draws the field into a bitmap: 600 points and 40,000 cost
// about the same, which is why the boards people compare us to (Crypto Bubbles
// among them) are canvas and never SVG.
//
// This is the same move the Anomaly chart already made in AnomalyScatter.jsx,
// generalised so both Live charts share it. Bundle cost is nil: echarts is
// already in vendor-charts for the Anomaly board.
//
// Three hand-built systems become configuration again:
//   · label collision   -> labelLayout: { hideOverlap: true }
//   · cooperative wheel -> dataZoom zoomOnMouseWheel: "ctrl"
//   · pan / reset       -> dataZoom inside
//
// What does NOT come free is ranking WHICH labels survive — hideOverlap drops
// whatever will not fit but cannot choose, so the caller still passes a named
// set built by promote().
import { useEffect, useMemo, useRef } from "react";

import EChart, { useChartTokens, inkAlpha } from "../../charts/EChart";
import { logoDiscSeries } from "../logoDisc";
import { roamDataZoom, makeZoomApi } from "../chartRoam";
import { clampRange } from "../vizShared";

const sym = (pair) => String(pair || "").replace(/USDT$/i, "");
const MONO = "JetBrains Mono, monospace";
/** Disc diameter — shared by the logo layer and the invisible hit/label layer. */
const LOGO = 28;

export function buildScatterOption({
  points,
  named,
  domX,
  domY,
  tokens,
  labelMode = "focus",
  diagonal = false,
  quadrants = null,
  tip,
  axisFmt = (v) => `${v.toFixed(0)}%`,
}) {
  // Clamped, not clipped. ECharts given a fixed min/max simply does not draw a
  // point outside it, so an outlier would VANISH — and a hidden outlier is a
  // lie. Pinned to the rail it still says "there is something past here", which
  // is the same rule the percentile domains were introduced under.
  const dot = (p) => ({
    value: [clampRange(p.x, domX), clampRange(p.y, domY)],
    name: p.pair,
    itemStyle: {
      color: p.fill,
      borderColor: p.sc || "transparent",
      borderWidth: p.sc ? 2 : 0,
    },
  });

  const field = points.filter((p) => !named.has(p.pair)).map(dot);
  const marks = labelMode === "off" ? [] : points.filter((p) => named.has(p.pair));

  const axis = (dom) => ({
    type: "value",
    min: dom[0],
    max: dom[1],
    axisLabel: { color: tokens["fg-muted"], fontSize: 11, fontFamily: MONO, formatter: axisFmt },
    splitLine: { lineStyle: { color: inkAlpha(tokens, 0.06) } },
    axisLine: { show: false },
    axisTick: { show: false },
  });

  const refs = [
    { xAxis: 0, lineStyle: { color: inkAlpha(tokens, 0.28), type: "dashed", width: 1 } },
    { yAxis: 0, lineStyle: { color: inkAlpha(tokens, 0.28), type: "dashed", width: 1 } },
  ];

  return {
    animation: false,
    grid: { left: 52, right: 18, top: 14, bottom: 30 },
    tooltip: {
      trigger: "item",
      backgroundColor: tokens["surface-raised"],
      borderColor: inkAlpha(tokens, 0.12),
      borderWidth: 1,
      textStyle: { color: tokens.fg, fontSize: 11, fontFamily: MONO },
      formatter: (p) => (tip ? tip(p) : `${sym(p.name)}<br/>${p.value[0].toFixed(1)}% · ${p.value[1].toFixed(1)}%`),
    },
    xAxis: axis(domX),
    yAxis: axis(domY),
    dataZoom: roamDataZoom(),
    series: [
      {
        type: "scatter",
        symbolSize: 9,
        // Past this many points ECharts batches the field into one canvas path
        // instead of styling each mark. This is the whole performance argument.
        large: true,
        largeThreshold: 120,
        progressive: 400,
        data: field,
      },
      logoDiscSeries({
        marks: marks.map((p) => ({
          pair: p.pair,
          value: dot(p).value,
          // The status ring the image symbol could never show: ECharts does not
          // stroke a border on an image symbol, so `borderColor` here was only
          // ever inert. On the disc it draws.
          ring: p.sc || p.fill,
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
          show: true,
          position: "bottom",
          distance: 5,
          color: tokens.fg,
          fontSize: 10,
          fontWeight: 700,
          fontFamily: MONO,
          textBorderColor: tokens["surface-raised"],
          textBorderWidth: 3,
          formatter: (p) => sym(p.name),
        },
        labelLayout: { hideOverlap: true },
        z: 5,
      },
      {
        type: "line",
        data: [],
        // Quadrant wash. The OI board is read by which corner a coin sits in —
        // price up with open interest up is a different story from price up
        // with open interest falling — so the corners are tinted rather than
        // left to be inferred from two axis labels.
        markArea: quadrants
          ? {
              silent: true,
              itemStyle: { opacity: 0.045 },
              data: quadrants.map((q) => [
                { coord: [q.x0, q.y0], itemStyle: { color: q.color } },
                { coord: [q.x1, q.y1] },
              ]),
            }
          : undefined,
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          data: diagonal
            ? [
                ...refs,
                // y = x. Everything under it gave profit back, which is the one
                // thing this chart exists to show and was previously a sentence
                // in the subtitle rather than a line on the canvas.
                [
                  { coord: [Math.max(domX[0], domY[0]), Math.max(domX[0], domY[0])] },
                  { coord: [Math.min(domX[1], domY[1]), Math.min(domX[1], domY[1])] },
                ],
              ]
            : refs,
          lineStyle: { color: inkAlpha(tokens, 0.3), type: "dashed", width: 1 },
        },
      },
    ],
  };
}

export default function TerminalScatter({
  points = [],
  named,
  domX,
  domY,
  height,
  labelMode = "focus",
  diagonal = false,
  quadrants = null,
  tip,
  onPair,
  onApi,
}) {
  const tokens = useChartTokens();
  const chartRef = useRef(null);
  const namedSet = useMemo(() => named || new Set(), [named]);

  const option = useMemo(
    () =>
      buildScatterOption({ points, named: namedSet, domX, domY, tokens, labelMode, diagonal, quadrants, tip }),
    [points, namedSet, domX, domY, tokens, labelMode, diagonal, quadrants, tip]
  );

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onApi) return undefined;
    onApi(makeZoomApi(chart));
    return undefined;
  }, [onApi]);

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
