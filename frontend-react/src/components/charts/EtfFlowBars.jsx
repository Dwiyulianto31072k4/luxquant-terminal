import { useMemo } from "react";
import EChart, { useChartTokens, inkAlpha, baseGrid } from "./EChart";

/**
 * 30 days of Bitcoin ETF net flow, drawn with ECharts — the same engine Gate's
 * market dashboard runs on. Colour is per-bar so an outflow day reads red
 * without splitting the series in two.
 *
 * Lives in its own module because it is the only thing on the Home route that
 * pulls ECharts in. Imported lazily, it becomes a separate async chunk instead
 * of adding ~180 KB gzip to the page's first paint.
 */
const EtfFlowBars = ({ records }) => {
  const tokens = useChartTokens();

  const option = useMemo(() => {
    const rows = (records || []).slice(0, 30).reverse();
    if (rows.length < 2) return null;
    return {
      grid: { ...baseGrid, top: 6, bottom: 2 },
      xAxis: { type: "category", show: false, data: rows.map((r) => r.date) },
      yAxis: { type: "value", show: false, scale: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: tokens["surface-raised"],
        borderColor: inkAlpha(tokens, 0.12),
        borderWidth: 1,
        padding: [6, 10],
        textStyle: { color: tokens.fg, fontSize: 11, fontFamily: "JetBrains Mono, monospace" },
        formatter: (points) => {
          const p = points[0];
          const v = Number(p.value) || 0;
          return `${p.axisValue}<br/>${v >= 0 ? "+" : "-"}$${Math.abs(v / 1e6).toFixed(1)}M`;
        },
      },
      series: [
        {
          type: "bar",
          data: rows.map((r) => ({
            value: r.netFlow,
            itemStyle: { color: r.netFlow >= 0 ? tokens.pos : tokens.neg },
          })),
          barMaxWidth: 6,
          barMinHeight: 1,
        },
      ],
    };
  }, [records, tokens]);

  if (!option) return null;
  return <EChart option={option} height={56} className="mt-3" />;
};

export default EtfFlowBars;
