import { useEffect, useRef, useState, useMemo } from "react";
import * as echarts from "echarts/core";
import { LineChart, BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

/**
 * ECharts, the same engine Gate's market dashboard runs on — but imported
 * piecewise. Pulling `echarts` whole would dwarf this route (the Overview
 * chunk is ~29 KB); registering only the chart types and components we
 * actually draw keeps the cost proportional. Add to this list when a new card
 * needs a new series type — GaugeChart and PieChart are deliberately absent
 * until the Opportunity tab exists.
 */
echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

const TOKENS = [
  "--accent",
  "--pos",
  "--neg",
  "--fg",
  "--fg-secondary",
  "--fg-muted",
  "--line",
  "--surface-raised",
  "--ink",
];

const readTokens = () => {
  if (typeof window === "undefined") return {};
  const cs = getComputedStyle(document.documentElement);
  const out = {};
  for (const name of TOKENS) {
    // Tokens are stored as "R G B" triplets so Tailwind can add an alpha.
    const triplet = cs.getPropertyValue(name).trim();
    out[name.slice(2)] = triplet ? `rgb(${triplet})` : "";
    out[`${name.slice(2)}Raw`] = triplet;
  }
  return out;
};

/**
 * Chart colours have to be concrete values at draw time — canvas cannot resolve
 * `rgb(var(--accent))` the way CSS can. So we read the computed tokens and
 * redraw whenever the theme flips. Watching the `data-theme` attribute rather
 * than consuming ThemeContext keeps this component usable anywhere, including
 * outside the provider.
 */
export const useChartTokens = () => {
  const [tokens, setTokens] = useState(readTokens);
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTokens(readTokens()));
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, []);
  return tokens;
};

/** Translucent overlay in the current theme's ink colour. */
export const inkAlpha = (tokens, alpha) =>
  tokens.inkRaw ? `rgba(${tokens.inkRaw.split(/\s+/).join(", ")}, ${alpha})` : "transparent";

const EChart = ({ option, height = 180, className = "", onInit, notMerge = false }) => {
  const hostRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!hostRef.current) return undefined;
    const chart = echarts.init(hostRef.current, null, { renderer: "canvas" });
    chartRef.current = chart;
    onInit?.(chart);

    // The host is often inside a grid that settles after mount; a plain window
    // resize listener misses that, so observe the element itself.
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (chartRef.current && option) chartRef.current.setOption(option, notMerge);
  }, [option, notMerge]);

  return <div ref={hostRef} className={className} style={{ height, width: "100%" }} />;
};

/** Shared axis/grid styling so every card reads as one chart system. */
export const baseGrid = { left: 0, right: 0, top: 4, bottom: 0, containLabel: false };

export const useTooltipStyle = () => {
  const t = useChartTokens();
  return useMemo(
    () => ({
      trigger: "axis",
      backgroundColor: t["surface-raised"],
      borderColor: inkAlpha(t, 0.12),
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: t.fg, fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
      axisPointer: { type: "line", lineStyle: { color: inkAlpha(t, 0.25), width: 1 } },
    }),
    [t]
  );
};

export default EChart;
