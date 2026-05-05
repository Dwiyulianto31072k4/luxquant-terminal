// frontend-react/src/components/aiArenaV6/PriceChart.jsx
// ════════════════════════════════════════════════════════════
// PRICE CHART — Lightweight Charts v5 wrapper (v2 — fix-pass)
// ────────────────────────────────────────────────────────────
// Renders BTC OHLC + 4 MA overlays + volume subpane +
// liquidation/key-level price lines + zone bands.
//
// FIX vs v1:
// • Single consolidated useEffect for chart updates — eliminates
//   race between data setData and createPriceLine calls.
// • Price lines created in same effect as setData, after MA series
//   have data, guaranteeing series state is settled.
// • Strong support / strong resistance now rendered (deduped vs cluster).
// • try/catch removed around createPriceLine so errors surface.
// • Defensive null check on createPriceLine return.
// ════════════════════════════════════════════════════════════
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
} from "lightweight-charts";
import { getChartData } from "../../services/aiArenaV6Api";
import { formatPrice, formatPct } from "./constants";
import Tooltip from "./Tooltip";

// ────────────────────────────────────────────────────────────
// Visual tokens
// ────────────────────────────────────────────────────────────
const COLORS = {
  bgTransparent: "rgba(0,0,0,0)",
  text: "#b8a89a",
  grid: "rgba(212, 168, 83, 0.04)",
  border: "rgba(212, 168, 83, 0.15)",
  gold: "#d4a853",
  candleUp: "#4ade80",
  candleDown: "#f87171",
  ema20: "#60a5fa",
  ema50: "#a78bfa",
  sma100: "#fbbf24",
  sma200: "#f472b6",
  liqLong: "#4ade80",
  liqShort: "#f87171",
  support: "rgba(74, 222, 128, 0.7)",
  resistance: "rgba(248, 113, 113, 0.7)",
  strongSupport: "rgba(74, 222, 128, 1)",
  strongResistance: "rgba(248, 113, 113, 1)",
  zoneDemandLine: "#4ade80",
  zoneFairLine: "#d4a853",
  zoneSupplyLine: "#f87171",
  zoneDemand: "rgba(74, 222, 128, 0.10)",
  zoneFair: "rgba(212, 168, 83, 0.10)",
  zoneSupply: "rgba(248, 113, 113, 0.10)",
};

const TIMEFRAMES = [
  { value: "1D", label: "1D", sub: "Tide" },
  { value: "4H", label: "4H", sub: "Wave" },
  { value: "1H", label: "1H", sub: "Ripple" },
];

const MA_CONFIG = [
  { key: "ema20", label: "EMA 20", color: COLORS.ema20, width: 2 },
  { key: "ema50", label: "EMA 50", color: COLORS.ema50, width: 2 },
  { key: "sma100", label: "SMA 100", color: COLORS.sma100, width: 1 },
  { key: "sma200", label: "SMA 200", color: COLORS.sma200, width: 1 },
];

const sortByTime = (arr) =>
  Array.isArray(arr) ? [...arr].sort((a, b) => (a.time || 0) - (b.time || 0)) : [];

// Dedup price lines that are within 0.05% — merge title
const dedupPriceLines = (lines) => {
  const sorted = [...lines].sort((a, b) => a.price - b.price);
  const out = [];
  for (const line of sorted) {
    const last = out[out.length - 1];
    if (last && Math.abs(line.price - last.price) / Math.max(last.price, 1) < 0.0005) {
      last.title = `${last.title} · ${line.title}`;
      continue;
    }
    out.push({ ...line });
  }
  return out;
};

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════
export default function PriceChart() {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const maSeriesRef = useRef({});
  const allPriceLinesRef = useRef([]);

  const [tf, setTf] = useState("4H");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maVisible, setMaVisible] = useState({
    ema20: true, ema50: true, sma100: true, sma200: false,
  });
  const [showLiq, setShowLiq] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [crosshair, setCrosshair] = useState(null);

  // Fetch
  const fetchData = useCallback(async (timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getChartData(timeframe);
      setData(result);
    } catch (err) {
      console.error("[PriceChart] fetch error:", err);
      setError(err?.response?.data?.detail || err?.message || "Failed to load chart data");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(tf); }, [tf, fetchData]);

  // ────────────────────────────────────────────────────────────
  // Chart lifecycle
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: "solid", color: COLORS.bgTransparent },
        textColor: COLORS.text,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: COLORS.gold, width: 1, style: LineStyle.Dashed, labelBackgroundColor: COLORS.gold },
        horzLine: { color: COLORS.gold, width: 1, style: LineStyle.Dashed, labelBackgroundColor: COLORS.gold },
      },
      rightPriceScale: {
        borderColor: COLORS.border,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: COLORS.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.candleUp,
      downColor: COLORS.candleDown,
      borderVisible: false,
      wickUpColor: COLORS.candleUp,
      wickDownColor: COLORS.candleDown,
      priceFormat: { type: "price", precision: 1, minMove: 0.1 },
    });
    candleSeriesRef.current = candles;

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeriesRef.current = volume;

    MA_CONFIG.forEach(({ key, color, width }) => {
      const line = chart.addSeries(LineSeries, {
        color,
        lineWidth: width,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 3,
      });
      maSeriesRef.current[key] = line;
    });

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData || param.seriesData.size === 0) {
        setCrosshair(null);
        return;
      }
      const cd = param.seriesData.get(candles);
      if (!cd) { setCrosshair(null); return; }
      setCrosshair({ time: param.time, open: cd.open, high: cd.high, low: cd.low, close: cd.close });
    });

    const ro = new ResizeObserver(() => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      try { ro.disconnect(); } catch {}
      try { chart.remove(); } catch {}
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      maSeriesRef.current = {};
      allPriceLinesRef.current = [];
    };
  }, []);

  // ────────────────────────────────────────────────────────────
  // CONSOLIDATED data → chart sync
  // Single effect, runs in correct order, no race conditions.
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    const candles = candleSeriesRef.current;
    const volume = volumeSeriesRef.current;
    if (!chart || !candles || !data) return;

    // 1. Set candle data first
    candles.setData(sortByTime(data.candles));

    // 2. Volume
    if (volume) volume.setData(sortByTime(data.volumes));

    // 3. MA lines
    const ms = data.ma_series || {};
    MA_CONFIG.forEach(({ key }) => {
      const line = maSeriesRef.current[key];
      if (!line) return;
      line.setData(sortByTime(ms[key]));
      line.applyOptions({ visible: !!maVisible[key] });
    });

    // 4. Clear old price lines BEFORE creating new
    allPriceLinesRef.current.forEach((pl) => {
      try { candles.removePriceLine(pl); } catch {}
    });
    allPriceLinesRef.current = [];

    // 5. Build new price lines list
    const newLines = [];

    if (showLiq) {
      const liq = data.liquidation_levels || {};
      const kl = data.key_levels || {};

      if (liq.nearest_long_cluster) newLines.push({
        price: liq.nearest_long_cluster, color: COLORS.liqLong,
        lineStyle: LineStyle.Dotted, lineWidth: 2, axisLabelVisible: true,
        title: `Liq Long`,
      });
      if (liq.nearest_short_cluster) newLines.push({
        price: liq.nearest_short_cluster, color: COLORS.liqShort,
        lineStyle: LineStyle.Dotted, lineWidth: 2, axisLabelVisible: true,
        title: `Liq Short`,
      });
      if (kl.support) newLines.push({
        price: kl.support, color: COLORS.support,
        lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true,
        title: `Support`,
      });
      if (kl.resistance) newLines.push({
        price: kl.resistance, color: COLORS.resistance,
        lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true,
        title: `Resistance`,
      });
      if (kl.strong_support) newLines.push({
        price: kl.strong_support, color: COLORS.strongSupport,
        lineStyle: LineStyle.Solid, lineWidth: 1, axisLabelVisible: true,
        title: `Strong Sup`,
      });
      if (kl.strong_resistance) newLines.push({
        price: kl.strong_resistance, color: COLORS.strongResistance,
        lineStyle: LineStyle.Solid, lineWidth: 1, axisLabelVisible: true,
        title: `Strong Res`,
      });
    }

    if (showZones) {
      const zones = data.zones_to_watch || {};
      const zoneDefs = [
        { key: "demand", color: COLORS.zoneDemandLine, label: "Demand" },
        { key: "fair_value", color: COLORS.zoneFairLine, label: "Fair" },
        { key: "supply", color: COLORS.zoneSupplyLine, label: "Supply" },
      ];
      zoneDefs.forEach(({ key, color, label }) => {
        const z = zones[key];
        if (!z || z.low == null || z.high == null) return;
        newLines.push({
          price: z.high, color,
          lineStyle: LineStyle.SparseDotted, lineWidth: 1, axisLabelVisible: false,
          title: `${label} ↑`,
        });
        newLines.push({
          price: z.low, color,
          lineStyle: LineStyle.SparseDotted, lineWidth: 1, axisLabelVisible: false,
          title: `${label} ↓`,
        });
      });
    }

    // 6. Dedup overlapping lines (e.g., long_cluster == strong_support at $76,200)
    const deduped = dedupPriceLines(newLines);

    // 7. Attach price lines (no try/catch — surface real errors)
    deduped.forEach((opts) => {
      const pl = candles.createPriceLine(opts);
      if (pl) allPriceLinesRef.current.push(pl);
    });

    // 8. Fit
    chart.timeScale().fitContent();
  }, [data, showLiq, showZones]); // eslint-disable-line react-hooks/exhaustive-deps

  // MA visibility toggle (no data reload)
  useEffect(() => {
    MA_CONFIG.forEach(({ key }) => {
      const line = maSeriesRef.current[key];
      if (line) line.applyOptions({ visible: !!maVisible[key] });
    });
  }, [maVisible]);

  // Derived
  const tech = data?.technicals || {};
  const lastPrice = tech.price ?? data?.candles?.[data.candles.length - 1]?.close;
  const firstClose = data?.candles?.[0]?.close;
  const pctMove = (lastPrice && firstClose) ? ((lastPrice - firstClose) / firstClose) * 100 : null;
  const labelText = data?.label || `${tf} chart`;

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  return (
    <div className="glass-card rounded-2xl p-4 lg:p-6 border border-gold-primary/10 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 lg:w-12 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl lg:text-2xl font-semibold text-white">Price Chart</h2>
              <Tooltip termKey="confluence">
                <span className="text-text-muted text-[10px] font-mono px-1.5 py-0.5 rounded border border-gold-primary/15">
                  {labelText}
                </span>
              </Tooltip>
            </div>
            <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">
              BTCUSDT · candles + EMAs + liquidation magnets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {lastPrice != null && (
            <div className="text-right">
              <p className="text-white font-mono text-lg lg:text-xl font-semibold tabular-nums leading-none">
                {formatPrice(lastPrice)}
              </p>
              {pctMove != null && (
                <p className={`text-[10px] font-mono mt-0.5 ${pctMove >= 0 ? "text-positive" : "text-negative"}`}>
                  {pctMove >= 0 ? "▲" : "▼"} {formatPct(Math.abs(pctMove), 2)} <span className="text-text-muted">· {tech.candle_count || 0} bars</span>
                </p>
              )}
            </div>
          )}

          <div className="flex bg-bg-card/80 rounded-xl p-1 border border-gold-primary/10">
            {TIMEFRAMES.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTf(opt.value)}
                className={`px-2.5 lg:px-3 py-1 lg:py-1.5 rounded-lg text-[10px] lg:text-xs font-semibold transition-all ${
                  tf === opt.value
                    ? "bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-gold-glow"
                    : "text-text-muted hover:text-white"
                }`}
                title={`${opt.label} · ${opt.sub}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-3 flex-wrap mb-3">
        {MA_CONFIG.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setMaVisible((v) => ({ ...v, [key]: !v[key] }))}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono font-semibold transition-all border ${
              maVisible[key]
                ? "bg-bg-card/60 border-white/10 text-white"
                : "bg-transparent border-white/5 text-text-muted hover:text-white"
            }`}
          >
            <span
              className="inline-block w-3 h-0.5 rounded-full transition-opacity"
              style={{ background: color, opacity: maVisible[key] ? 1 : 0.3 }}
            />
            {label}
          </button>
        ))}

        <span className="w-px h-4 bg-white/10 mx-1" />

        <button
          onClick={() => setShowLiq((v) => !v)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold transition-all border ${
            showLiq ? "bg-gold-primary/10 border-gold-primary/25 text-gold-primary" : "bg-transparent border-white/5 text-text-muted hover:text-white"
          }`}
          title="Liquidation clusters & key levels"
        >
          ◆ Liq Levels
        </button>
        <button
          onClick={() => setShowZones((v) => !v)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold transition-all border ${
            showZones ? "bg-gold-primary/10 border-gold-primary/25 text-gold-primary" : "bg-transparent border-white/5 text-text-muted hover:text-white"
          }`}
          title="Demand / Fair / Supply bands"
        >
          ▭ Zones
        </button>
      </div>

      <div className="relative">
        {crosshair && (
          <div className="absolute top-2 left-2 z-10 pointer-events-none flex items-center gap-3 px-3 py-1.5 rounded-lg bg-bg-primary/85 backdrop-blur-md border border-gold-primary/20 text-[10px] font-mono">
            <span className="text-text-muted">O <span className="text-white">{formatPrice(crosshair.open)}</span></span>
            <span className="text-text-muted">H <span className="text-white">{formatPrice(crosshair.high)}</span></span>
            <span className="text-text-muted">L <span className="text-white">{formatPrice(crosshair.low)}</span></span>
            <span className="text-text-muted">C <span className={crosshair.close >= crosshair.open ? "text-positive" : "text-negative"}>{formatPrice(crosshair.close)}</span></span>
          </div>
        )}

        <div
          ref={containerRef}
          className="w-full rounded-xl overflow-hidden bg-bg-primary/30 border border-white/5"
          style={{ height: 460 }}
        />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/50 backdrop-blur-sm rounded-xl">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-gold-primary/25 border-t-gold-primary rounded-full animate-spin" />
              <p className="text-text-muted text-[10px] font-mono uppercase tracking-wider">
                Loading {tf} candles…
              </p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/70 backdrop-blur-sm rounded-xl">
            <div className="flex flex-col items-center gap-3 px-4 text-center">
              <p className="text-negative text-xs">⚠ {error}</p>
              <button
                onClick={() => fetchData(tf)}
                className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-gold-primary/15 border border-gold-primary/30 text-gold-primary hover:bg-gold-primary/25 transition-all"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      {data && !loading && (
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
          <StatPill label="RSI 14" value={tech.rsi_14?.toFixed(1)} hint={rsiHint(tech.rsi_14)} />
          <StatPill label="EMA Spread" value={tech.ema_spread_pct != null ? `${tech.ema_spread_pct.toFixed(2)}%` : "—"} hint={tech.ema_bullish_cross ? "bullish stack" : "bearish stack"} />
          <StatPill label="MACD" value={tech.macd?.histogram != null ? tech.macd.histogram.toFixed(1) : "—"} hint={tech.macd?.crossover || "—"} />
          <StatPill label="BB Bandwidth" value={tech.bollinger?.bandwidth != null ? `${tech.bollinger.bandwidth.toFixed(2)}%` : "—"} hint={bbHint(tech.bollinger?.bandwidth)} />
        </div>
      )}

      {data?.zones_to_watch && !loading && showZones && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <ZoneChip label="Demand" zone={data.zones_to_watch.demand} tint={COLORS.zoneDemand} accent={COLORS.candleUp} arrow="↓" currentPrice={lastPrice} />
          <ZoneChip label="Fair Value" zone={data.zones_to_watch.fair_value} tint={COLORS.zoneFair} accent={COLORS.gold} arrow="→" currentPrice={lastPrice} />
          <ZoneChip label="Supply" zone={data.zones_to_watch.supply} tint={COLORS.zoneSupply} accent={COLORS.candleDown} arrow="↑" currentPrice={lastPrice} />
        </div>
      )}

      <div className="mt-3 flex items-center justify-end">
        <a
          href="https://www.tradingview.com/lightweight-charts/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[9px] text-text-muted/60 hover:text-text-muted transition-colors"
        >
          charts by TradingView
        </a>
      </div>
    </div>
  );
}

function StatPill({ label, value, hint }) {
  return (
    <div className="bg-bg-card/40 rounded-lg px-3 py-2 border border-white/5">
      <p className="text-text-muted text-[9px] uppercase tracking-wider">{label}</p>
      <p className="text-white font-mono text-sm font-semibold tabular-nums mt-0.5">
        {value ?? "—"}
      </p>
      {hint && <p className="text-text-muted text-[9px] mt-0.5">{hint}</p>}
    </div>
  );
}

function ZoneChip({ label, zone, tint, accent, arrow, currentPrice }) {
  if (!zone) return null;
  const inZone =
    currentPrice != null && zone.low != null && zone.high != null &&
    currentPrice >= zone.low && currentPrice <= zone.high;

  return (
    <div
      className="rounded-lg p-2.5 border relative overflow-hidden"
      style={{
        background: tint,
        borderColor: inZone ? accent : "rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span style={{ color: accent }} className="text-sm leading-none">{arrow}</span>
          <span className="text-white text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        </div>
        {inZone && (
          <span style={{ color: accent }} className="text-[9px] font-mono font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} /> ACTIVE
          </span>
        )}
      </div>
      <p className="text-white font-mono text-xs tabular-nums">
        {formatPrice(zone.low)} <span className="text-text-muted">–</span> {formatPrice(zone.high)}
      </p>
      {zone.notes && (
        <p className="text-text-muted text-[9px] mt-1 line-clamp-2 leading-snug">
          {zone.notes}
        </p>
      )}
    </div>
  );
}

function rsiHint(rsi) {
  if (rsi == null) return null;
  if (rsi >= 70) return "overbought";
  if (rsi >= 60) return "strong";
  if (rsi >= 40) return "neutral";
  if (rsi >= 30) return "weak";
  return "oversold";
}

function bbHint(bw) {
  if (bw == null) return null;
  if (bw < 3) return "squeeze";
  if (bw < 6) return "normal";
  return "expansion";
}
