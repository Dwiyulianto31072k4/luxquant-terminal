// src/components/edgelab/WrVsBtcTab.jsx
// ════════════════════════════════════════════════════════════════
// WR × BTC — LuxQuant daily win rate overlaid with BTC daily close.
// · WR (left axis, 0–100%): 7-day rolling line (hero) + faint raw daily
// · BTC (right axis, price): gold area
// · Range toggle 30D / 90D / 1Y / All — data fetched once (range=all),
//   sliced client-side so toggles are instant.
// Data: GET /api/v1/analytics/wr-vs-btc?range=all
//   [{date, win_rate, total_closed, regime, btc_close}]
// ════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from "react";
import { createChart, LineSeries, AreaSeries } from "lightweight-charts";
import api from "../../services/authApi";
import { Panel, Methodology, EmptyState } from "./_shared";

const RANGES = [
  { id: "30", label: "30D" },
  { id: "90", label: "90D" },
  { id: "365", label: "1Y" },
  { id: "all", label: "All" },
];

const fmtPct = (v) => (v == null ? "—" : `${v.toFixed(1)}%`);
const fmtUsd = (v) =>
  v == null
    ? "—"
    : v >= 1000
    ? `$${(v / 1000).toFixed(1)}k`
    : `$${v.toFixed(0)}`;

// 7-day trailing rolling WR, weighted by closed count so quiet days don't whip the line.
function rollingWr(series, window = 7) {
  const out = [];
  for (let i = 0; i < series.length; i++) {
    let wins = 0;
    let closed = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const d = series[j];
      if (d.win_rate == null || !d.total_closed) continue;
      wins += (d.win_rate / 100) * d.total_closed;
      closed += d.total_closed;
    }
    out.push({
      time: series[i].date,
      value: closed > 0 ? (wins / closed) * 100 : null,
    });
  }
  return out.filter((p) => p.value != null);
}

const WrVsBtcTab = () => {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const [series, setSeries] = useState(null); // full all-time series
  const [error, setError] = useState(null);
  const [range, setRange] = useState("90");

  // ─── fetch once (all-time), slice locally ───
  useEffect(() => {
    let cancelled = false;
    api
      .get("/api/v1/analytics/wr-vs-btc", { params: { range: "all" } })
      .then((res) => {
        if (!cancelled) setSeries(res.data?.series || []);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load WR × BTC data");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sliced = useMemo(() => {
    if (!series) return [];
    if (range === "all") return series;
    return series.slice(-parseInt(range, 10));
  }, [series, range]);

  const insights = useMemo(() => {
    if (!sliced.length) return [];
    const withWr = sliced.filter((d) => d.win_rate != null && d.total_closed > 0);
    let wins = 0;
    let closed = 0;
    for (const d of withWr) {
      wins += (d.win_rate / 100) * d.total_closed;
      closed += d.total_closed;
    }
    const avgWr = closed > 0 ? (wins / closed) * 100 : null;
    const best = withWr.reduce(
      (a, b) => (b.win_rate > (a?.win_rate ?? -1) ? b : a),
      null
    );
    const first = sliced.find((d) => d.btc_close != null);
    const last = [...sliced].reverse().find((d) => d.btc_close != null);
    const btcChg =
      first && last && first.btc_close
        ? ((last.btc_close - first.btc_close) / first.btc_close) * 100
        : null;
    return [
      { label: "Avg WR (range)", value: fmtPct(avgWr), tone: "emerald" },
      best && {
        label: "Best day",
        value: `${fmtPct(best.win_rate)} · ${best.date}`,
        tone: "white",
      },
      btcChg != null && {
        label: "BTC over range",
        value: `${btcChg >= 0 ? "+" : ""}${btcChg.toFixed(1)}%`,
        tone: btcChg >= 0 ? "emerald" : "red",
      },
    ].filter(Boolean);
  }, [sliced]);

  // ─── chart lifecycle ───
  useEffect(() => {
    if (!containerRef.current || !sliced.length) return;

    const el = containerRef.current;
    const chart = createChart(el, {
      height: 380,
      layout: {
        background: { color: "transparent" },
        textColor: "rgba(255,255,255,0.45)",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      leftPriceScale: {
        visible: true,
        borderColor: "rgba(255,255,255,0.08)",
      },
      rightPriceScale: {
        visible: true,
        borderColor: "rgba(255,255,255,0.08)",
      },
      timeScale: { borderColor: "rgba(255,255,255,0.08)" },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    // BTC — gold area, right axis (price scale)
    const btcSeries = chart.addSeries(AreaSeries, {
      priceScaleId: "right",
      lineColor: "rgba(212,168,83,0.9)",
      topColor: "rgba(212,168,83,0.18)",
      bottomColor: "rgba(212,168,83,0.0)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "BTC",
    });
    btcSeries.setData(
      sliced
        .filter((d) => d.btc_close != null)
        .map((d) => ({ time: d.date, value: d.btc_close }))
    );

    // Raw daily WR — faint, context only
    const rawSeries = chart.addSeries(LineSeries, {
      priceScaleId: "left",
      color: "rgba(52,211,153,0.22)",
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    rawSeries.setData(
      sliced
        .filter((d) => d.win_rate != null && d.total_closed > 0)
        .map((d) => ({ time: d.date, value: d.win_rate }))
    );

    // 7d rolling WR — hero line, left axis
    const wrSeries = chart.addSeries(LineSeries, {
      priceScaleId: "left",
      color: "#34d399",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "WR 7d",
    });
    wrSeries.setData(rollingWr(sliced));

    // Pin WR axis to 0–100
    chart.priceScale("left").applyOptions({
      autoScale: false,
      scaleMargins: { top: 0.05, bottom: 0.05 },
    });
    wrSeries.applyOptions({
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: 0, maxValue: 100 },
      }),
    });

    chart.timeScale().fitContent();

    const onResize = () => chart.applyOptions({ width: el.clientWidth });
    onResize();
    const ro = new ResizeObserver(onResize);
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [sliced]);

  if (error) return <EmptyState title="WR × BTC unavailable" hint={error} />;
  if (!series) {
    return (
      <div className="h-[420px] rounded-lg bg-[#0c0a07] border border-white/[0.06] animate-pulse" />
    );
  }
  if (!series.length) return <EmptyState title="No data yet" hint="Daily performance history is empty" />;

  return (
    <div className="space-y-4">
      {insights.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {insights.map((it) => (
            <div
              key={it.label}
              className="rounded-lg bg-[#0c0a07] border border-white/[0.07] px-4 py-3"
            >
              <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/35">
                {it.label}
              </div>
              <div
                className={`mt-1 font-mono text-sm ${
                  it.tone === "emerald"
                    ? "text-emerald-400"
                    : it.tone === "red"
                    ? "text-red-400"
                    : "text-white/85"
                }`}
              >
                {it.value}
              </div>
            </div>
          ))}
        </div>
      )}

      <Panel
        title="Win Rate × BTC Price"
        meta="Daily · since first signal (Dec 2023)"
      >
        {/* toolbar: range toggle + legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-2.5 py-1 rounded font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  range === r.id
                    ? "bg-[#d4a853]/15 text-[#d4a853] border border-[#d4a853]/40"
                    : "text-white/40 border border-white/[0.06] hover:text-white/70"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-wider">
            <span className="flex items-center gap-1.5 text-white/50">
              <span className="w-3 h-[2px] bg-[#34d399] inline-block" />
              WR 7d (left, 0–100%)
            </span>
            <span className="flex items-center gap-1.5 text-white/50">
              <span className="w-3 h-[2px] bg-[#d4a853] inline-block" />
              BTC close (right)
            </span>
          </div>
        </div>

        <div ref={containerRef} className="w-full" />

        <p className="mt-2 font-mono text-[9px] text-white/25 uppercase tracking-wider">
          WR weighted by closed signals/day · faint line = raw daily WR
        </p>
      </Panel>

      <Methodology title="How this chart works">
        <p>
          Daily win rate comes from resolved signals grouped by creation date
          (precomputed nightly). The hero line is a 7-day rolling win rate
          weighted by how many signals closed each day, so quiet days don't
          whip the curve. The faint line is the raw daily value. BTC is the
          daily close from spot market data, plotted on its own price axis —
          the two scales are independent: this chart shows co-movement, not
          causation.
        </p>
      </Methodology>
    </div>
  );
};

export default WrVsBtcTab;
