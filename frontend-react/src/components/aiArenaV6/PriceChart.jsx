// frontend-react/src/components/aiArenaV6/PriceChart.jsx
// ════════════════════════════════════════════════════════════
// PRICE CHART — trader projection view
// Renders BTC OHLC + technical overlays, Compass zones, liquidity
// magnets, and the current projected touch/invalidation context.
// ════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
 createChart,
 CandlestickSeries,
 HistogramSeries,
 LineSeries,
 CrosshairMode,
 LineStyle,
} from "lightweight-charts";
import { getChartData } from "../../services/aiArenaV6Api";
import { directionArrow, directionColor, directionLabel, formatPrice, formatPct } from "./constants";
import { highlightPrices } from "./_ui";
import Tooltip from "./Tooltip";

// ────────────────────────────────────────────────────────────
// Visual tokens
// ────────────────────────────────────────────────────────────
const COLORS = {
 bgTransparent: "rgb(var(--ink) / 0.0)",
 text: "#b8a89a",
 grid: "rgb(var(--accent) / 0.04)",
 border: "rgb(var(--accent) / 0.15)",
 gold: "rgb(var(--accent))",
 projection: "#f5c451",
 candleUp: "#4ade80",
 candleDown: "#f87171",
 ema20: "#60a5fa",
 ema50: "#a78bfa",
 sma100: "#fbbf24",
 sma200: "#f472b6",
 magnetAbove: "#f87171",
 magnetBelow: "#4ade80",
 support: "rgba(74, 222, 128, 0.7)",
 resistance: "rgba(248, 113, 113, 0.7)",
 strongSupport: "rgba(74, 222, 128, 1)",
 strongResistance: "rgba(248, 113, 113, 1)",
 zoneDemandLine: "#4ade80",
 zoneFairLine: "rgb(var(--accent))",
 zoneSupplyLine: "#f87171",
 zoneDemand: "rgba(74, 222, 128, 0.10)",
 zoneFair: "rgb(var(--accent) / 0.10)",
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

const LAYER_LABELS = {
 projection: "Projection",
 magnets: "Magnets",
 zones: "Zones",
 levels: "Key levels",
 trend: "Trend MA",
};

const sortByTime = (arr) =>
 Array.isArray(arr) ? [...arr].sort((a, b) => (a.time || 0) - (b.time || 0)) : [];

const toNumber = (value) => {
 const number = Number(value);
 return Number.isFinite(number) ? number : null;
};

// Dedup price lines that are within 0.05% — merge title
const dedupPriceLines = (lines) => {
 const valid = lines.filter((line) => toNumber(line.price) != null);
 const sorted = [...valid].sort((a, b) => a.price - b.price);
 const out = [];
 for (const line of sorted) {
 const last = out[out.length - 1];
 if (last && Math.abs(line.price - last.price) / Math.max(last.price, 1) < 0.0005) {
 last.title = `${last.title} · ${line.title}`;
 last.lineWidth = Math.max(last.lineWidth || 1, line.lineWidth || 1);
 continue;
 }
 out.push({ ...line });
 }
 return out;
};

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════
export default function PriceChart({ report }) {
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
 const [layers, setLayers] = useState({
 projection: true,
 magnets: false,
 zones: false,
 levels: false,
 trend: false,
 });
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
 volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
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

 const tech = data?.technicals || {};
 const lastPrice = tech.price ?? data?.candles?.[data.candles.length - 1]?.close ?? report?.btc_price;
 const firstClose = data?.candles?.[0]?.close;
 const pctMove = (lastPrice && firstClose) ? ((lastPrice - firstClose) / firstClose) * 100 : null;
 const labelText = data?.label || `${tf} chart`;
 const zones = useMemo(() => mergeZonesFromReportAndChart(report, data?.zones_to_watch), [report, data?.zones_to_watch]);
 const magnetLines = useMemo(() => getMagnetLines(report), [report]);
 const projection = useMemo(() => buildProjection(report, lastPrice, zones), [report, lastPrice, zones]);
 const visibleMaCount = Object.values(maVisible).filter(Boolean).length;
 const chartRead = useMemo(() => buildChartRead({ report, data, tech, lastPrice, firstClose, pctMove, zones, magnetLines, projection, tf }), [report, data, tech, lastPrice, firstClose, pctMove, zones, magnetLines, projection, tf]);

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
 line.applyOptions({ visible: !!layers.trend && !!maVisible[key] });
 });

 // 4. Clear old price lines BEFORE creating new
 allPriceLinesRef.current.forEach((pl) => {
 try { candles.removePriceLine(pl); } catch {}
 });
 allPriceLinesRef.current = [];

 // 5. Build new price lines list
 const newLines = [];

 if (layers.levels) {
 const liq = data.liquidation_levels || {};
 const kl = data.key_levels || {};

 if (liq.nearest_long_cluster) newLines.push({
 price: liq.nearest_long_cluster, color: COLORS.magnetBelow,
 lineStyle: LineStyle.Dotted, lineWidth: 2, axisLabelVisible: true,
 title: "Long liq",
 });
 if (liq.nearest_short_cluster) newLines.push({
 price: liq.nearest_short_cluster, color: COLORS.magnetAbove,
 lineStyle: LineStyle.Dotted, lineWidth: 2, axisLabelVisible: true,
 title: "Short liq",
 });
 if (kl.support) newLines.push({
 price: kl.support, color: COLORS.support,
 lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true,
 title: "Support",
 });
 if (kl.resistance) newLines.push({
 price: kl.resistance, color: COLORS.resistance,
 lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: true,
 title: "Resistance",
 });
 if (kl.strong_support) newLines.push({
 price: kl.strong_support, color: COLORS.strongSupport,
 lineStyle: LineStyle.Solid, lineWidth: 1, axisLabelVisible: true,
 title: "Bull invalid",
 });
 if (kl.strong_resistance) newLines.push({
 price: kl.strong_resistance, color: COLORS.strongResistance,
 lineStyle: LineStyle.Solid, lineWidth: 1, axisLabelVisible: true,
 title: "Bear invalid",
 });
 }

 if (layers.zones) {
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
 title: `${label} high`,
 });
 newLines.push({
 price: z.low, color,
 lineStyle: LineStyle.SparseDotted, lineWidth: 1, axisLabelVisible: false,
 title: `${label} low`,
 });
 });
 }

 if (layers.magnets) {
 magnetLines.forEach((line) => {
 newLines.push({
 price: line.price,
 color: line.side === "above" ? COLORS.magnetAbove : COLORS.magnetBelow,
 lineStyle: line.nearest ? LineStyle.Dashed : LineStyle.Dotted,
 lineWidth: line.nearest ? 2 : 1,
 axisLabelVisible: true,
 title: line.nearest ? `${line.label}` : line.label,
 });
 });
 }

 if (layers.projection && projection?.target) {
 newLines.push({
 price: projection.target,
 color: COLORS.projection,
 lineStyle: LineStyle.Solid,
 lineWidth: 2,
 axisLabelVisible: true,
 title: "Projected touch",
 });
 if (projection.secondaryTarget) {
 newLines.push({
 price: projection.secondaryTarget,
 color: COLORS.projection,
 lineStyle: LineStyle.LargeDashed,
 lineWidth: 1,
 axisLabelVisible: true,
 title: "Next reaction",
 });
 }
 }

 // 6. Dedup overlapping lines
 const deduped = dedupPriceLines(newLines);

 // 7. Attach price lines
 deduped.forEach((opts) => {
 const pl = candles.createPriceLine(opts);
 if (pl) allPriceLinesRef.current.push(pl);
 });

 // 8. Fit
 chart.timeScale().fitContent();
 }, [data, layers, maVisible, zones, magnetLines, projection]);

 // MA visibility toggle (no data reload)
 useEffect(() => {
 MA_CONFIG.forEach(({ key }) => {
 const line = maSeriesRef.current[key];
 if (line) line.applyOptions({ visible: !!layers.trend && !!maVisible[key] });
 });
 }, [maVisible, layers.trend]);

 const toggleLayer = (key) => {
 setLayers((current) => ({ ...current, [key]: !current[key] }));
 };

 // ════════════════════════════════════════════════════════════
 // RENDER
 // ════════════════════════════════════════════════════════════
 return (
 <div className="relative">

 <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
 <div className="flex items-center gap-3 min-w-0">
 <div className="w-8 lg:w-12 h-0.5 bg-gradient-to-r from-ink/30 to-transparent" />
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <h2 className="font-display text-xl lg:text-2xl font-semibold text-text-primary">Projection Chart</h2>
 <Tooltip termKey="confluence">
 <span className="text-text-muted text-[10px] font-mono px-1.5 py-0.5 rounded-md border border-ink/10">
 {labelText}
 </span>
 </Tooltip>
 </div>
 <p className="text-text-muted text-[10px] lg:text-xs mt-0.5">
 Real BTC candles with selectable projection, magnet, zone, and trend layers
 </p>
 </div>
 </div>

 <div className="flex items-center gap-3 flex-wrap">
 {lastPrice != null && (
 <div className="text-right">
 <p className="text-text-primary font-mono text-lg lg:text-xl font-semibold tabular-nums leading-none">
 {formatPrice(lastPrice)}
 </p>
 {pctMove != null && (
 <p className={`text-[10px] font-mono mt-0.5 ${pctMove >= 0 ? "text-positive" : "text-negative"}`}>
 {pctMove >= 0 ? "▲" : "▼"} {formatPct(Math.abs(pctMove), 2)} <span className="text-text-muted">· {tech.candle_count || 0} bars</span>
 </p>
 )}
 </div>
 )}

 <div className="flex rounded-md border border-ink/[0.06] bg-ink/[0.03] p-1">
 {TIMEFRAMES.map((opt) => (
 <button
 key={opt.value}
 onClick={() => setTf(opt.value)}
 className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition-all lg:px-3 lg:py-1.5 lg:text-xs ${
 tf === opt.value
 ? "bg-ink/10 text-text-primary"
 : "text-text-muted hover:text-text-primary"
 }`}
 title={`${opt.label} · ${opt.sub}`}
 >
 {opt.label}
 </button>
 ))}
 </div>
 </div>
 </div>

 <ProjectionPanel projection={projection} lastPrice={lastPrice} />

 <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
 <div>
 <div className="mb-2 text-[9px] font-mono uppercase tracking-[0.16em] text-text-muted/70">
 Select chart layers
 </div>
 <div className="flex flex-wrap gap-1.5">
 {Object.entries(LAYER_LABELS).map(([key, label]) => {
 const active = !!layers[key];
 return (
 <button
 key={key}
 type="button"
 onClick={() => toggleLayer(key)}
 className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-[0.1em] transition ${
 active
 ? "border-ink/12 bg-accent/10 text-accent"
 : "border-ink/[0.06] bg-scrim/10 text-text-primary/35 hover:border-ink/[0.12] hover:text-text-primary/65"
 }`}
 >
 <span className={`h-1.5 w-1.5 rounded-sm ${active ? "bg-accent" : "bg-ink/20"}`} />
 {label}
 </button>
 );
 })}
 </div>
 </div>
 <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-ink/[0.06] bg-scrim/15 p-1.5 text-[10px] font-mono text-text-primary/45 lg:min-w-[390px]">
 <DataBasis label="Candles" value="Live BTC" detail={`${tf} OHLCV`} />
 <DataBasis label="Projection" value={projection?.directionLabel || "Neutral"} detail="Compass read" />
 <DataBasis label="Liquidity" value={projection?.liquidityConfidence || "Model"} detail="Magnet map" />
 </div>
 </div>

 {layers.trend && (
 <div className="mt-3 flex items-center gap-2 lg:gap-3 flex-wrap">
 {MA_CONFIG.map(({ key, label, color }) => (
 <button
 key={key}
 onClick={() => setMaVisible((v) => ({ ...v, [key]: !v[key] }))}
 className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono font-semibold transition-all border ${
 maVisible[key]
 ? "bg-bg-card/60 border-ink/10 text-text-primary"
 : "bg-transparent border-ink/5 text-text-muted hover:text-text-primary"
 }`}
 >
 <span
 className="inline-block w-3 h-0.5 rounded-sm transition-opacity"
 style={{ background: color, opacity: maVisible[key] ? 1 : 0.3 }}
 />
 {label}
 </button>
 ))}
 <span className="text-[10px] font-mono text-text-primary/30">{visibleMaCount}/4 active</span>
 </div>
 )}

 <div className="relative mt-4">
 {crosshair && (
 <div className="absolute top-2 left-2 z-10 pointer-events-none flex items-center gap-3 px-3 py-1.5 rounded-lg bg-bg-primary/85 backdrop-blur-md border border-ink/10 text-[10px] font-mono">
 <span className="text-text-muted">O <span className="text-text-primary">{formatPrice(crosshair.open)}</span></span>
 <span className="text-text-muted">H <span className="text-text-primary">{formatPrice(crosshair.high)}</span></span>
 <span className="text-text-muted">L <span className="text-text-primary">{formatPrice(crosshair.low)}</span></span>
 <span className="text-text-muted">C <span className={crosshair.close >= crosshair.open ? "text-positive" : "text-negative"}>{formatPrice(crosshair.close)}</span></span>
 </div>
 )}

 <div
 ref={containerRef}
 className="w-full overflow-hidden rounded-md border border-ink/[0.04] bg-surface"
 style={{ height: "clamp(420px, 58vh, 640px)" }}
 />

 {loading && (
 <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/50 backdrop-blur-sm rounded-xl">
 <div className="flex flex-col items-center gap-3">
 <div className="w-8 h-8 border-2 border-ink/12 border-t-white/50 rounded-full animate-spin" />
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
 className="px-3 py-1.5 rounded-md text-[10px] font-semibold bg-ink/10 border border-ink/10 text-text-primary hover:bg-ink/15 transition-all"
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

 {data && !loading && <ChartReadPanel read={chartRead} />}

 {Object.keys(zones || {}).length > 0 && !loading && layers.zones && (
 <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
 <ZoneChip label="Demand" zone={zones.demand} tint={COLORS.zoneDemand} accent={COLORS.candleUp} arrow="↓" currentPrice={lastPrice} />
 <ZoneChip label="Fair Value" zone={zones.fair_value} tint={COLORS.zoneFair} accent={COLORS.gold} arrow="→" currentPrice={lastPrice} />
 <ZoneChip label="Supply" zone={zones.supply} tint={COLORS.zoneSupply} accent={COLORS.candleDown} arrow="↑" currentPrice={lastPrice} />
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

function ProjectionPanel({ projection, lastPrice }) {
 if (!projection) {
 return (
 <div className="rounded-xl border border-ink/[0.06] bg-scrim/15 p-4 text-sm text-text-primary/45">
 Projection detail is waiting for the latest Compass report.
 </div>
 );
 }

 const toneColor = directionColor(projection.direction);
 return (
 <div className="grid grid-cols-1 gap-3 rounded-xl border border-ink/[0.08] bg-scrim/15 p-4 md:grid-cols-[1.1fr_0.9fr]">
 <div>
 <div className="flex flex-wrap items-center gap-2">
 <span
 className="flex h-8 w-8 items-center justify-center rounded-md border text-lg"
 style={{ borderColor: `${toneColor}55`, background: `${toneColor}18`, color: toneColor }}
 >
 {directionArrow(projection.direction)}
 </span>
 <div>
 <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-accent/75">
 {projection.horizonLabel}
 </div>
 <h3 className="mt-0.5 text-xl font-semibold leading-tight text-text-primary/90">
 {projection.title}
 </h3>
 </div>
 </div>
 <p className="mt-3 max-w-3xl text-sm leading-7 text-text-primary/55">
 {highlightPrices(projection.explanation)}
 </p>
 <div className="mt-3 grid gap-2 sm:grid-cols-2">
 {projection.reasons.slice(0, 4).map((reason, index) => (
 <div key={`${reason.label}-${index}`} className="rounded-md border border-ink/[0.06] bg-ink/[0.025] px-3 py-2">
 <div className="text-[9px] font-mono uppercase tracking-[0.12em] text-text-primary/30">{reason.label}</div>
 <div className="mt-1 text-xs leading-5 text-text-primary/65">{reason.value}</div>
 </div>
 ))}
 </div>
 </div>

 <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-1">
 <ProjectionStat
 label="Potential touch"
 value={projection.target ? formatPrice(projection.target) : "—"}
 hint={projection.target ? `${distanceFrom(lastPrice, projection.target)} from current` : "waiting"}
 tone={projection.direction}
 />
 <ProjectionStat
 label="Next reaction area"
 value={projection.reactionLabel || "—"}
 hint={projection.reactionWhy || "zone not available"}
 />
 <ProjectionStat
 label="Invalidation watch"
 value={projection.invalidation || "—"}
 hint="condition that weakens this read"
 />
 </div>
 </div>
 );
}

function ProjectionStat({ label, value, hint, tone }) {
 return (
 <div className="rounded-sm border border-ink/[0.04] bg-surface-secondary p-3">
 <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/30">{label}</div>
 <div className="mt-1 font-mono text-lg font-semibold text-text-primary/90" style={{ color: tone ? directionColor(tone) : undefined }}>
 {value}
 </div>
 {hint && <div className="mt-1 text-[10px] leading-4 text-text-primary/40">{hint}</div>}
 </div>
 );
}

function DataBasis({ label, value, detail }) {
 return (
 <div className="rounded-md border border-ink/[0.05] bg-ink/[0.025] px-2.5 py-2">
 <div className="text-[8px] uppercase tracking-[0.12em] text-text-primary/25">{label}</div>
 <div className="mt-1 text-text-primary/75">{value}</div>
 <div className="mt-0.5 text-[9px] text-text-primary/30">{detail}</div>
 </div>
 );
}

function StatPill({ label, value, hint }) {
 return (
 <div className="bg-bg-card/40 rounded-lg px-3 py-2 border border-ink/5">
 <p className="text-text-muted text-[9px] uppercase tracking-wider">{label}</p>
 <p className="text-text-primary font-mono text-sm font-semibold tabular-nums mt-0.5">
 {value ?? "—"}
 </p>
 {hint && <p className="text-text-muted text-[9px] mt-0.5">{hint}</p>}
 </div>
 );
}


function ChartReadPanel({ read }) {
 if (!read) return null;
 const toneColor = directionColor(read.direction);
 return (
 <section className="relative mt-4 overflow-hidden rounded-md border border-ink/10 bg-surface-raised shadow-[inset_0_1px_0_0_rgb(var(--ink)_/_0.05),0_1px_2px_0_rgb(var(--ink) / 0.12)]">
 <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/[0.06] p-4">
 <div className="max-w-4xl">
 <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-accent/75">
 AI chart reasoning
 </div>
 <h3 className="mt-1 text-lg font-semibold leading-tight text-text-primary/90 lg:text-xl">
 {read.title}
 </h3>
 <p className="mt-2 text-sm leading-6 text-text-primary/55">
 {read.summary}
 </p>
 </div>
 <div
 className="rounded-lg border px-3 py-2 text-right font-mono"
 style={{ borderColor: `${toneColor}44`, background: `${toneColor}12` }}
 >
 <div className="text-[8px] uppercase tracking-[0.14em] text-text-primary/35">Mode</div>
 <div className="mt-1 text-sm font-semibold" style={{ color: toneColor }}>
 {read.mode}
 </div>
 </div>
 </div>

 <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-[0.92fr_1.08fr]">
 <div className="space-y-3">
 <div className="rounded-lg border border-ink/10 bg-accent/[0.055] p-3">
 <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-accent/75">
 What to do with it
 </div>
 <p className="mt-2 text-sm leading-6 text-text-primary/70">
 {highlightPrices(read.tradePlan)}
 </p>
 </div>

 <div className="grid gap-2 sm:grid-cols-2">
 {read.keyNumbers.map((item) => (
 <MarketNumber key={item.label} item={item} />
 ))}
 </div>
 </div>

 <div className="grid gap-2">
 {read.explanations.map((item) => (
 <ReasonRow key={item.title} item={item} />
 ))}
 </div>
 </div>

 <div className="border-t border-ink/[0.06] p-4">
 <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
 <div>
 <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-primary/30">Technical tape</div>
 <p className="mt-1 text-xs text-text-primary/45">These numbers explain whether the projected touch is clean, stretched, or noisy.</p>
 </div>
 <div className="text-[10px] font-mono text-text-primary/30">Projection layer is the default view</div>
 </div>
 <div className="grid gap-2 lg:grid-cols-4">
 {read.metrics.map((metric) => (
 <MetricExplain key={metric.label} metric={metric} />
 ))}
 </div>
 </div>
 </section>
 );
}

function MarketNumber({ item }) {
 return (
 <div className="rounded-lg border border-ink/[0.06] bg-ink/[0.025] p-3">
 <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/30">{item.label}</div>
 <div className="mt-1 font-mono text-base font-semibold tabular-nums text-text-primary/90">{item.value}</div>
 <div className="mt-1 text-[10px] leading-4 text-text-primary/45">{item.detail}</div>
 </div>
 );
}

function ReasonRow({ item }) {
 return (
 <div className="rounded-lg border border-ink/[0.06] bg-scrim/15 p-3">
 <div className="flex items-start gap-2">
 <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-sm bg-accent" />
 <div>
 <div className="text-sm font-semibold text-text-primary/85">{item.title}</div>
 <p className="mt-1 text-xs leading-5 text-text-primary/50">{item.body}</p>
 </div>
 </div>
 </div>
 );
}

function MetricExplain({ metric }) {
 return (
 <div className="rounded-sm border border-ink/[0.04] bg-surface-secondary p-3">
 <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/30">{metric.label}</div>
 <div className="mt-1 font-mono text-sm font-semibold text-text-primary/90">{metric.value}</div>
 <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-accent/75">{metric.state}</div>
 <p className="mt-1 text-[10px] leading-4 text-text-primary/45">{metric.reason}</p>
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
 borderColor: inZone ? accent : "rgb(var(--ink) / 0.06)",
 }}
 >
 <div className="flex items-center justify-between mb-1">
 <div className="flex items-center gap-1.5">
 <span style={{ color: accent }} className="text-sm leading-none">{arrow}</span>
 <span className="text-text-primary text-[11px] font-semibold uppercase tracking-wider">{label}</span>
 </div>
 {inZone && (
 <span style={{ color: accent }} className="text-[9px] font-mono font-bold flex items-center gap-1">
 <span className="w-1.5 h-1.5 rounded-sm animate-pulse" style={{ background: accent }} /> ACTIVE
 </span>
 )}
 </div>
 <p className="text-text-primary font-mono text-xs tabular-nums">
 {formatPrice(zone.low)} <span className="text-text-muted">–</span> {formatPrice(zone.high)}
 </p>
 {(zone.why || zone.liquidity_note || zone.notes) && (
 <p className="text-text-muted text-[9px] mt-1 line-clamp-2 leading-snug">
 {zone.why || zone.liquidity_note || zone.notes}
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


function compactMoney(value) {
 const number = toNumber(value);
 if (number == null) return "—";
 return formatPrice(number);
}

function zoneRead(currentPrice, zone, label) {
 if (zone?.low == null || zone?.high == null) return `${label} zone is not available in this read.`;
 const price = toNumber(currentPrice);
 const range = `${formatPrice(zone.low)}-${formatPrice(zone.high)}`;
 if (price == null) return `${label} sits at ${range}.`;
 if (price >= zone.low && price <= zone.high) return `BTC is inside ${label.toLowerCase()} at ${range}. This is a decision area, not a chase area.`;
 if (price < zone.low) return `BTC is below ${label.toLowerCase()} at ${range}. Regaining it would improve structure.`;
 return `BTC is above ${label.toLowerCase()} at ${range}. A retest can act as confirmation if buyers defend it.`;
}

function pickNearestMagnet(magnetLines, side) {
 return (magnetLines || []).find((line) => line.side === side && line.nearest) || (magnetLines || []).find((line) => line.side === side) || null;
}

function metricReason(label, value, state) {
 const lower = String(state || "").toLowerCase();
 if (label === "RSI 14") {
 if (lower === "oversold") return "Momentum is stretched to the downside. Late shorts need confirmation because snapback risk rises below 30.";
 if (lower === "weak") return "Momentum is weak but not exhausted. Sellers still have pressure, yet the best short entries need failed bounces.";
 if (lower === "neutral") return "Momentum is balanced. Price levels matter more than oscillator direction.";
 if (lower === "overbought") return "Upside momentum is stretched. Fresh longs need acceptance above resistance, not just a green candle.";
 return "Momentum is firm. Pullbacks can be bought only if key demand holds.";
 }
 if (label === "EMA Spread") {
 if (lower.includes("bearish")) return `Short moving averages are below pressure by ${value}. Trend still leans defensive until price reclaims the stack.`;
 return `Moving average structure is supportive by ${value}. Pullbacks are healthier if price holds above the fast averages.`;
 }
 if (label === "MACD") {
 if (Number(value) < 0) return "Histogram is below zero, so downside momentum is still heavier. Watch whether it improves into the projected touch.";
 if (Number(value) > 0) return "Histogram is above zero, so momentum is improving. Breakout attempts have better quality if volume follows.";
 return "MACD is flat enough that the level reaction matters more than the indicator.";
 }
 if (label === "BB Bandwidth") {
 if (lower === "expansion") return "Volatility is expanding. Levels can overshoot, so wait for candle acceptance/rejection around the line.";
 if (lower === "squeeze") return "Volatility is compressed. A clean break from the range can travel fast once it starts.";
 return "Volatility is normal. Level-to-level trading is more reliable than breakout chasing.";
 }
 return "Use this as context, then let price confirm at the projection level.";
}

function buildMetricExplain(tech) {
 const rsi = toNumber(tech?.rsi_14);
 const ema = toNumber(tech?.ema_spread_pct);
 const macd = toNumber(tech?.macd?.histogram);
 const bandwidth = toNumber(tech?.bollinger?.bandwidth);
 const rows = [
 { label: "RSI 14", raw: rsi, value: rsi != null ? rsi.toFixed(1) : "—", state: rsiHint(rsi) || "waiting" },
 { label: "EMA Spread", raw: ema, value: ema != null ? `${ema.toFixed(2)}%` : "—", state: tech?.ema_bullish_cross ? "bullish stack" : "bearish stack" },
 { label: "MACD", raw: macd, value: macd != null ? macd.toFixed(1) : "—", state: tech?.macd?.crossover || "neutral" },
 { label: "BB Bandwidth", raw: bandwidth, value: bandwidth != null ? `${bandwidth.toFixed(2)}%` : "—", state: bbHint(bandwidth) || "waiting" },
 ];
 return rows.map((row) => ({ ...row, reason: metricReason(row.label, row.value, row.state) }));
}

function buildChartRead({ report, data, tech, lastPrice, firstClose, pctMove, zones, magnetLines, projection, tf }) {
 if (!data || !projection) return null;
 const tactical = getHorizon(report, "24h") || {};
 const swing = getHorizon(report, "72h") || {};
 const cycle = getHorizon(report, "cycle") || {};
 const direction = projection.direction || String(tactical.direction || "neutral").toLowerCase();
 const directionText = directionLabel(direction);
 const price = toNumber(lastPrice);
 const reportPrice = toNumber(report?.btc_price ?? getInnerReport(report)?.btc_price);
 const above = pickNearestMagnet(magnetLines, "above");
 const below = pickNearestMagnet(magnetLines, "below");
 const demand = zones?.demand;
 const fair = zones?.fair_value;
 const supply = zones?.supply;
 const candleCount = tech?.candle_count || data?.candles?.length || 0;
 const moveLabel = pctMove != null ? `${pctMove >= 0 ? "+" : ""}${pctMove.toFixed(2)}%` : "—";
 const targetDistance = projection.target ? distanceFrom(price, projection.target) : "—";
 const aboveDistance = above ? distanceFrom(price, above.price) : "—";
 const belowDistance = below ? distanceFrom(price, below.price) : "—";
 const priceAction = getRow(report, "price_action");
 const liquidityRow = getRow(report, "liquidity");
 const priceScore = rowScore(priceAction, "24h");
 const liqScore = rowScore(liquidityRow, "24h");

 const neutralPlan = `Treat this as a range map. The first job is to see whether BTC accepts or rejects ${projection.target ? formatPrice(projection.target) : "the projected touch"}; after that, use ${projection.reactionLabel || "the reaction zone"} as the decision area.`;
 const bearishPlan = `Do not chase the red candle. Let sellers prove control into ${projection.target ? formatPrice(projection.target) : "the downside touch"}; if demand fails, look for continuation toward ${projection.secondaryTarget ? formatPrice(projection.secondaryTarget) : projection.reactionLabel || "the next demand area"}. The read weakens if BTC holds above ${projection.invalidation || "invalidation"}.`;
 const bullishPlan = `Do not buy the top of the push. Let bids reclaim/hold the projection area near ${projection.target ? formatPrice(projection.target) : "the upside touch"}; if supply breaks with acceptance, the next reaction becomes ${projection.secondaryTarget ? formatPrice(projection.secondaryTarget) : projection.reactionLabel || "upper supply"}. The read weakens if BTC loses ${projection.invalidation || "invalidation"}.`;

 const tradePlan = direction === "bearish" ? bearishPlan : direction === "bullish" ? bullishPlan : neutralPlan;

 const keyNumbers = [
 {
 label: "Current BTC",
 value: compactMoney(price),
 detail: `${tf} live chart, ${candleCount} bars. ${firstClose ? `Move from first candle: ${moveLabel}.` : "Waiting for enough candles."}`,
 },
 reportPrice && {
 label: "Report price",
 value: compactMoney(reportPrice),
 detail: `Compass projection was anchored here. Current gap: ${distanceFrom(reportPrice, price)} from report price.`,
 },
 {
 label: "Projected touch",
 value: projection.target ? compactMoney(projection.target) : "—",
 detail: `${targetDistance} from current. This is the first decision line, not an automatic entry.`,
 },
 {
 label: "Next reaction",
 value: projection.secondaryTarget ? compactMoney(projection.secondaryTarget) : projection.reactionLabel || "—",
 detail: projection.reactionWhy || "Use this area after the first touch is accepted or rejected.",
 },
 {
 label: "Magnet above",
 value: above ? compactMoney(above.price) : "—",
 detail: above ? `${aboveDistance} from current. Upside liquidity can attract price if bids reclaim control.` : "No upside magnet available in this read.",
 },
 {
 label: "Magnet below",
 value: below ? compactMoney(below.price) : "—",
 detail: below ? `${belowDistance} from current. Downside liquidity can attract price if sellers keep control.` : "No downside magnet available in this read.",
 },
 {
 label: "Invalidation",
 value: projection.invalidation || "—",
 detail: "If this condition is met, the current projection should be reduced or ignored.",
 },
 {
 label: "Liquidity read",
 value: projection.liquidityConfidence || "—",
 detail: `${directionLabel(liqScore.direction)} liquidity layer. ${firstEvidence(liquidityRow) || "Magnet map available."}`,
 },
 ].filter(Boolean);

 const explanations = [
 {
 title: "1. Start from the projection, not every line at once",
 body: `Default chart layer is now Projection only. The active line shows the first realistic touch: ${projection.target ? formatPrice(projection.target) : "not ready"}. Magnets, zones, key levels, and trend MAs are optional audit layers you can turn on one by one.`,
 },
 {
 title: "2. Price context defines whether the touch is tradable",
 body: `${directionLabel(priceScore.direction)} price action. ${firstEvidence(priceAction) || priceAction?.rationale || "The latest candle structure is mixed."} Current BTC at ${compactMoney(price)} is ${projection.target ? distanceFrom(price, projection.target) : "—"} from the projected touch.`,
 },
 {
 title: "3. Magnets explain where stops/liquidity can pull price",
 body: `Nearest upside magnet is ${above ? `${formatPrice(above.price)} (${aboveDistance})` : "not available"}; nearest downside magnet is ${below ? `${formatPrice(below.price)} (${belowDistance})` : "not available"}. When price is between both, let the stronger side prove control before entering.`,
 },
 {
 title: "4. Zones tell you where reaction matters",
 body: `${zoneRead(price, demand, "Demand")} ${zoneRead(price, fair, "Fair value")} ${zoneRead(price, supply, "Supply")}`,
 },
 {
 title: "5. Horizon conflict controls position size",
 body: `24h is ${directionText} at ${tactical.confidence ?? "—"}% confidence, 72h is ${directionLabel(swing.direction)}, and holder context is ${directionLabel(cycle.direction)}. If horizons conflict, the setup is a level-to-level trade, not a conviction swing.`,
 },
 ];

 return {
 direction,
 mode: `${directionText} ${tactical.confidence ?? "—"}%`,
 title: `${directionText} chart map: first decision near ${projection.target ? formatPrice(projection.target) : "the projected touch"}`,
 summary: "This chart is a trader map: candles show the live tape, the projection marks the first touch, magnets show where liquidity can pull, zones show where reaction should happen, and invalidation tells you when the read stops working.",
 tradePlan,
 keyNumbers,
 explanations,
 metrics: buildMetricExplain(tech),
 };
}

function getInnerReport(report) {
 return report?.report || report || {};
}

function readable(value) {
 const label = String(value || "unknown").replaceAll("_", " ");
 return label.charAt(0).toUpperCase() + label.slice(1);
}

function getHorizon(report, key) {
 const inner = getInnerReport(report);
 const verdict = inner.verdict || {};
 const summary = report?.verdict_summary || {};
 if (key === "24h") return verdict.tactical_24h || summary.tactical_24h || null;
 if (key === "72h") return verdict.secondary_7d || summary.secondary_7d || null;
 return verdict.primary_30d || summary.primary_30d || null;
}

function getRows(report) {
 return getInnerReport(report)?.evidence_matrix?.rows || [];
}

function getRow(report, key) {
 return getRows(report).find((row) => row.key === key);
}

function rowScore(row, horizon = "24h") {
 return row?.horizons?.[horizon] || {};
}

function firstEvidence(row) {
 const item = row?.evidence?.[0];
 if (!item) return null;
 return `${item.metric}: ${item.value}`;
}

function normalizeZone(zone) {
 if (!zone) return null;
 const low = toNumber(zone.low ?? zone.price_low);
 const high = toNumber(zone.high ?? zone.price_high);
 if (low == null || high == null) return null;
 return {
 kind: zone.kind,
 low,
 high,
 why: zone.why,
 liquidity_note: zone.liquidity_note,
 notes: zone.notes,
 };
}

function mergeZonesFromReportAndChart(report, chartZones) {
 const merged = {};
 ["demand", "fair_value", "supply"].forEach((key) => {
 const normalized = normalizeZone(chartZones?.[key]);
 if (normalized) merged[key] = { ...normalized, kind: key };
 });

 const reportZones = getInnerReport(report)?.verdict?.zones_to_watch || [];
 if (Array.isArray(reportZones)) {
 reportZones.forEach((zone) => {
 const key = zone.kind;
 const normalized = normalizeZone(zone);
 if (!key || !normalized) return;
 merged[key] = { ...(merged[key] || {}), ...normalized, kind: key };
 });
 }
 return merged;
}

function normalizeMagnet(magnet, side) {
 if (magnet == null) return null;
 if (typeof magnet === "number") return { price: magnet, value: null, side };
 const price = toNumber(magnet.price);
 if (price == null) return null;
 return {
 price,
 value: toNumber(magnet.value),
 side: side || magnet.side,
 };
}

function getLiquidity(report) {
 return getInnerReport(report)?.liquidity || {};
}

function getMagnets(report) {
 return getLiquidity(report)?.magnets || {};
}

function getMagnetLines(report) {
 const magnets = getMagnets(report);
 const out = [];
 const nearestAbove = normalizeMagnet(magnets.nearest_above, "above");
 const nearestBelow = normalizeMagnet(magnets.nearest_below, "below");

 if (nearestAbove) out.push({ ...nearestAbove, side: "above", nearest: true, label: "Magnet above" });
 if (nearestBelow) out.push({ ...nearestBelow, side: "below", nearest: true, label: "Magnet below" });

 (magnets.magnets_above || []).slice(0, 3).forEach((magnet, index) => {
 const normalized = normalizeMagnet(magnet, "above");
 if (normalized) out.push({ ...normalized, side: "above", nearest: false, label: `Above ${index + 1}` });
 });
 (magnets.magnets_below || []).slice(0, 3).forEach((magnet, index) => {
 const normalized = normalizeMagnet(magnet, "below");
 if (normalized) out.push({ ...normalized, side: "below", nearest: false, label: `Below ${index + 1}` });
 });

 const seen = new Set();
 return out.filter((line) => {
 const key = `${line.side}-${Math.round(line.price * 10)}`;
 if (seen.has(key)) return false;
 seen.add(key);
 return true;
 });
}

function distanceFrom(current, target) {
 const cur = toNumber(current);
 const tgt = toNumber(target);
 if (cur == null || tgt == null || cur === 0) return "—";
 const pct = ((tgt - cur) / cur) * 100;
 return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function zoneLabel(zone) {
 if (!zone) return null;
 return `${formatPrice(zone.low)}–${formatPrice(zone.high)}`;
}

function getLiquidityConfidence(report) {
 const liquidity = getLiquidity(report);
 const magnets = getMagnets(report);
 const confidence = toNumber(liquidity.model_confidence ?? magnets.model_confidence);
 if (confidence != null) return `${Math.round(confidence * 100)}% confidence`;
 return readable(magnets.confidence_label || liquidity.status || "model");
}

function buildProjection(report, lastPrice, zones) {
 if (!report) return null;
 const tactical = getHorizon(report, "24h") || {};
 const swing = getHorizon(report, "72h") || {};
 const cycle = getHorizon(report, "cycle") || {};
 const direction = String(tactical.direction || "neutral").toLowerCase();
 const directionLabelText = directionLabel(direction);
 const priceRow = getRow(report, "price_action");
 const liquidityRow = getRow(report, "liquidity");
 const priceScore = rowScore(priceRow, "24h");
 const liquidityScore = rowScore(liquidityRow, "24h");
 const magnets = getMagnets(report);
 const nearestAbove = normalizeMagnet(magnets.nearest_above, "above");
 const nearestBelow = normalizeMagnet(magnets.nearest_below, "below");
 const demand = zones?.demand;
 const fair = zones?.fair_value;
 const supply = zones?.supply;

 let target = null;
 let secondaryTarget = null;
 let reactionLabel = null;
 let reactionWhy = null;
 let invalidation = null;
 let explanation = "Compass is waiting for enough directional evidence to project a cleaner touch area.";

 if (direction === "bearish") {
 target = nearestBelow?.price ?? demand?.high ?? demand?.low ?? null;
 secondaryTarget = demand?.low ?? null;
 reactionLabel = zoneLabel(demand) || (nearestBelow ? formatPrice(nearestBelow.price) : null);
 reactionWhy = demand?.liquidity_note || demand?.why || "nearest downside magnet / demand reaction area";
 invalidation = supply ? `Clean hold above ${formatPrice(supply.low)}` : (nearestAbove ? `Acceptance above ${formatPrice(nearestAbove.price)}` : null);
 explanation = `The 24h read is bearish at ${tactical.confidence ?? "—"}% confidence. If sellers keep control, the first realistic touch is ${target ? formatPrice(target) : "the nearest downside magnet"}; below that, demand at ${reactionLabel || "the lower zone"} becomes the reaction area.`;
 } else if (direction === "bullish") {
 target = nearestAbove?.price ?? supply?.low ?? supply?.high ?? null;
 secondaryTarget = supply?.high ?? null;
 reactionLabel = zoneLabel(supply) || (nearestAbove ? formatPrice(nearestAbove.price) : null);
 reactionWhy = supply?.liquidity_note || supply?.why || "nearest upside magnet / supply reaction area";
 invalidation = demand ? `Lose ${formatPrice(demand.high)}` : (nearestBelow ? `Acceptance below ${formatPrice(nearestBelow.price)}` : null);
 explanation = `The 24h read is bullish at ${tactical.confidence ?? "—"}% confidence. If bids stay in control, the first realistic touch is ${target ? formatPrice(target) : "the nearest upside magnet"}; above that, supply at ${reactionLabel || "the upper zone"} becomes the next reaction area.`;
 } else {
 const aboveDistance = nearestAbove?.price && lastPrice ? Math.abs(nearestAbove.price - lastPrice) : Infinity;
 const belowDistance = nearestBelow?.price && lastPrice ? Math.abs(lastPrice - nearestBelow.price) : Infinity;
 target = aboveDistance <= belowDistance ? nearestAbove?.price : nearestBelow?.price;
 secondaryTarget = aboveDistance <= belowDistance ? nearestBelow?.price : nearestAbove?.price;
 reactionLabel = fair ? zoneLabel(fair) : "range midpoint";
 reactionWhy = fair?.why || "neutral read favors range confirmation before directional follow-through";
 invalidation = demand && supply ? `Break outside ${formatPrice(demand.low)} / ${formatPrice(supply.high)}` : null;
 explanation = `The 24h read is neutral at ${tactical.confidence ?? "—"}% confidence. The chart should be treated as a range map first: nearest magnet touch is more important than forcing direction.`;
 }

 const reasons = [
 {
 label: "24h stance",
 value: `${directionLabelText} with ${tactical.confidence ?? "—"}% confidence; 72h is ${directionLabel(swing.direction)} and holder context is ${directionLabel(cycle.direction)}.`,
 },
 priceRow && {
 label: "Price action",
 value: `${directionLabel(priceScore.direction)}: ${firstEvidence(priceRow) || priceRow.rationale || "latest candle/range evidence"}.`,
 },
 liquidityRow && {
 label: "Liquidity",
 value: `${directionLabel(liquidityScore.direction)}: ${firstEvidence(liquidityRow) || liquidityRow.rationale || "magnet evidence available"}.`,
 },
 {
 label: "Magnet distance",
 value: `Above ${nearestAbove ? `${formatPrice(nearestAbove.price)} (${distanceFrom(lastPrice, nearestAbove.price)})` : "—"}; below ${nearestBelow ? `${formatPrice(nearestBelow.price)} (${distanceFrom(lastPrice, nearestBelow.price)})` : "—"}.`,
 },
 ].filter(Boolean);

 return {
 direction,
 directionLabel: directionLabelText,
 horizonLabel: "24h projection",
 title: `${directionLabelText} read: potential touch ${target ? formatPrice(target) : "not ready"}`,
 explanation,
 reasons,
 target,
 secondaryTarget,
 reactionLabel,
 reactionWhy,
 invalidation,
 liquidityConfidence: getLiquidityConfidence(report),
 };
}
