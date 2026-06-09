// WrVsBtcTab v2 — daily LuxQuant win rate vs BTC candlestick, all-time since first signal.
// - BTC: real OHLC candlesticks (right axis), green/red + wicks
// - WR : emerald line, left axis locked 0-100%, smoothing window dynamic per range
//        (30D raw daily · 90D 7d · 1Y 14d · All 30d) + faint raw overlay when smoothed
// - Markers: ▲ best / ▼ worst WR day (min 5 closed) within visible range
// - Crosshair tooltip: date · WR · closed · regime · OHLC
// - Click a candle → onDrill({dimension:'created_day', ...}) → SignalDrillDrawer → SignalModal
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
} from "lightweight-charts";
import { Panel, EmptyState, Methodology } from "./_shared";

const RANGES = [
  { id: "30", label: "30D", days: 30, smooth: 1 },
  { id: "90", label: "90D", days: 90, smooth: 7 },
  { id: "365", label: "1Y", days: 365, smooth: 14 },
  { id: "all", label: "All", days: Infinity, smooth: 30 },
];

const COLORS = {
  up: "#10b981",
  down: "#f43f5e",
  wr: "#34d399",
  wrRaw: "rgba(52, 211, 153, 0.22)",
  text: "rgba(255,255,255,0.40)",
  grid: "rgba(255,255,255,0.04)",
};

const timeToKey = (t) =>
  typeof t === "string"
    ? t
    : `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;

const rollingMean = (rows, window) => {
  if (window <= 1) return rows.map((r) => ({ time: r.date, value: r.win_rate }));
  const out = [];
  let sum = 0;
  const buf = [];
  for (const r of rows) {
    buf.push(r.win_rate);
    sum += r.win_rate;
    if (buf.length > window) sum -= buf.shift();
    out.push({ time: r.date, value: +(sum / buf.length).toFixed(2) });
  }
  return out;
};

const fmtUsd = (v) =>
  v == null
    ? "—"
    : v >= 1000
      ? `$${Math.round(v).toLocaleString("en-US")}`
      : `$${v.toFixed(2)}`;

const WrVsBtcTab = ({ onDrill }) => {
  const [allSeries, setAllSeries] = useState(null); // full all-time payload
  const [error, setError] = useState(null);
  const [rangeId, setRangeId] = useState("all");

  const containerRef = useRef(null);
  const tooltipRef = useRef(null);
  const chartRef = useRef(null);

  // ── fetch all-time once; range toggles slice locally ──
  useEffect(() => {
    let alive = true;
    fetch("/api/v1/analytics/wr-vs-btc?range=all")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => alive && setAllSeries(d))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const range = RANGES.find((r) => r.id === rangeId) || RANGES[3];

  const sliced = useMemo(() => {
    const rows = (allSeries?.series || []).filter((r) => r.win_rate != null);
    if (range.days === Infinity) return rows;
    return rows.slice(-range.days);
  }, [allSeries, range]);

  const stats = useMemo(() => {
    if (!sliced.length) return null;
    let wSum = 0;
    let nSum = 0;
    let best = null;
    let worst = null;
    for (const r of sliced) {
      wSum += r.win_rate * r.total_closed;
      nSum += r.total_closed;
      if (r.total_closed >= 5) {
        if (!best || r.win_rate > best.win_rate) best = r;
        if (!worst || r.win_rate < worst.win_rate) worst = r;
      }
    }
    const withBtc = sliced.filter((r) => r.btc_close != null);
    const btcFirst = withBtc[0]?.btc_close;
    const btcLast = withBtc[withBtc.length - 1]?.btc_close;
    const btcDelta =
      btcFirst && btcLast ? +(((btcLast - btcFirst) / btcFirst) * 100).toFixed(1) : null;
    return {
      avgWr: nSum ? +(wSum / nSum).toFixed(1) : null,
      totalClosed: nSum,
      best,
      worst,
      btcDelta,
      btcLast,
    };
  }, [sliced]);

  // ── chart lifecycle: rebuild on data/range change (cheap at ≤900 pts) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !sliced.length) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: 440,
      layout: {
        background: { color: "transparent" },
        textColor: COLORS.text,
        fontSize: 10,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      leftPriceScale: { visible: true, borderVisible: false },
      rightPriceScale: { visible: true, borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    // BTC candlesticks — right axis
    const rowByDate = new Map(sliced.map((r) => [r.date, r]));
    const candleData = sliced
      .filter(
        (r) =>
          r.btc_open != null && r.btc_high != null && r.btc_low != null && r.btc_close != null,
      )
      .map((r) => ({
        time: r.date,
        open: r.btc_open,
        high: r.btc_high,
        low: r.btc_low,
        close: r.btc_close,
      }));

    let candle = null;
    if (candleData.length) {
      candle = chart.addSeries(CandlestickSeries, {
        priceScaleId: "right",
        upColor: COLORS.up,
        downColor: COLORS.down,
        borderUpColor: COLORS.up,
        borderDownColor: COLORS.down,
        wickUpColor: COLORS.up,
        wickDownColor: COLORS.down,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      candle.setData(candleData);
    }

    // WR — left axis, locked 0-100
    const lockWr = { autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) };
    if (range.smooth > 1) {
      const raw = chart.addSeries(LineSeries, {
        priceScaleId: "left",
        color: COLORS.wrRaw,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        ...lockWr,
      });
      raw.setData(rollingMean(sliced, 1));
    }
    const wr = chart.addSeries(LineSeries, {
      priceScaleId: "left",
      color: COLORS.wr,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      ...lockWr,
    });
    wr.setData(rollingMean(sliced, range.smooth));

    // markers: best / worst WR day (min 5 closed) on candles
    if (candle && stats?.best && stats?.worst && stats.best.date !== stats.worst.date) {
      const markers = [
        {
          time: stats.best.date,
          position: "aboveBar",
          color: COLORS.up,
          shape: "arrowUp",
          text: `▲ ${stats.best.win_rate}%`,
        },
        {
          time: stats.worst.date,
          position: "belowBar",
          color: COLORS.down,
          shape: "arrowDown",
          text: `▼ ${stats.worst.win_rate}%`,
        },
      ].sort((a, b) => (a.time < b.time ? -1 : 1));
      createSeriesMarkers(candle, markers);
    }

    // crosshair tooltip — direct DOM (no re-render per move)
    const tip = tooltipRef.current;
    const onMove = (param) => {
      if (!tip) return;
      if (!param.time || !param.point) {
        tip.style.display = "none";
        return;
      }
      const r = rowByDate.get(timeToKey(param.time));
      if (!r) {
        tip.style.display = "none";
        return;
      }
      tip.innerHTML = `
        <div class="text-[10px] uppercase tracking-widest text-white/40 mb-1">${r.date}${r.regime ? ` · ${r.regime}` : ""}</div>
        <div class="font-mono tabular-nums text-emerald-300">WR ${r.win_rate}% · ${r.total_closed} closed</div>
        ${
          r.btc_close != null
            ? `<div class="font-mono tabular-nums text-white/60 text-[11px] mt-1">O ${fmtUsd(r.btc_open)} · H ${fmtUsd(r.btc_high)}<br/>L ${fmtUsd(r.btc_low)} · C ${fmtUsd(r.btc_close)}</div>`
            : ""
        }
        <div class="text-[9px] uppercase tracking-widest text-amber-300/50 mt-1.5">click candle to drill</div>`;
      tip.style.display = "block";
      const x = Math.min(param.point.x + 14, el.clientWidth - tip.offsetWidth - 8);
      const y = Math.min(param.point.y + 14, 440 - tip.offsetHeight - 8);
      tip.style.left = `${Math.max(0, x)}px`;
      tip.style.top = `${Math.max(0, y)}px`;
    };
    chart.subscribeCrosshairMove(onMove);

    // click → drill into the signals that formed that day's WR
    const onClick = (param) => {
      if (!param.time || !onDrill) return;
      const r = rowByDate.get(timeToKey(param.time));
      if (!r || !r.total_closed) return;
      onDrill({
        dimension: "created_day",
        key: r.date,
        label: `${r.date} · ${r.win_rate}% WR`,
        win_rate: r.win_rate,
        total: r.total_closed,
      });
    };
    chart.subscribeClick(onClick);

    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(onMove);
      chart.unsubscribeClick(onClick);
      chart.remove();
      chartRef.current = null;
    };
  }, [sliced, range, stats, onDrill]);

  // ── render ──
  if (error) {
    return (
      <Panel title="WR × BTC">
        <EmptyState title="Failed to load" hint={error} />
      </Panel>
    );
  }
  if (!allSeries) {
    return (
      <Panel title="WR × BTC">
        <div className="h-[440px] flex items-center justify-center text-white/30 text-xs uppercase tracking-widest">
          Loading…
        </div>
      </Panel>
    );
  }
  if (!sliced.length) {
    return (
      <Panel title="WR × BTC">
        <EmptyState title="No data" hint="daily_market_regime returned no rows" />
      </Panel>
    );
  }

  const smoothLabel = range.smooth > 1 ? `${range.smooth}d smoothed` : "raw daily";

  return (
    <div className="space-y-4">
      <Panel
        title="WR × BTC"
        meta={`since first signal · ${smoothLabel} · click a candle to drill`}
      >
        {/* controls + insight chips */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRangeId(r.id)}
                className={`px-3 py-1 text-[10px] uppercase tracking-widest rounded border transition-colors ${
                  rangeId === r.id
                    ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
                    : "border-white/10 text-white/40 hover:text-white/70"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {stats && (
            <div className="flex flex-wrap gap-2">
              <span className="px-2.5 py-1 rounded border border-white/10 bg-white/[0.03] text-[11px] font-mono tabular-nums text-emerald-300">
                Avg WR {stats.avgWr ?? "—"}%
                <span className="text-white/30 ml-1">({stats.totalClosed} closed)</span>
              </span>
              {stats.best && (
                <span className="px-2.5 py-1 rounded border border-white/10 bg-white/[0.03] text-[11px] font-mono tabular-nums text-white/60">
                  Best <span className="text-emerald-300">{stats.best.win_rate}%</span>{" "}
                  <span className="text-white/30">{stats.best.date}</span>
                </span>
              )}
              {stats.worst && (
                <span className="px-2.5 py-1 rounded border border-white/10 bg-white/[0.03] text-[11px] font-mono tabular-nums text-white/60">
                  Worst <span className="text-rose-300">{stats.worst.win_rate}%</span>{" "}
                  <span className="text-white/30">{stats.worst.date}</span>
                </span>
              )}
              {stats.btcDelta != null && (
                <span className="px-2.5 py-1 rounded border border-white/10 bg-white/[0.03] text-[11px] font-mono tabular-nums text-white/60">
                  BTC{" "}
                  <span className={stats.btcDelta >= 0 ? "text-emerald-300" : "text-rose-300"}>
                    {stats.btcDelta >= 0 ? "+" : ""}
                    {stats.btcDelta}%
                  </span>{" "}
                  <span className="text-white/30">{fmtUsd(stats.btcLast)}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* chart + tooltip overlay */}
        <div className="relative">
          <div ref={containerRef} className="w-full" />
          <div
            ref={tooltipRef}
            style={{ display: "none" }}
            className="absolute z-20 pointer-events-none px-3 py-2 rounded-lg border border-amber-400/20 bg-[#0a0805]/95 shadow-xl"
          />
        </div>

        {/* legend */}
        <div className="flex flex-wrap gap-4 mt-3 text-[10px] uppercase tracking-widest text-white/35">
          <span>
            <span className="inline-block w-3 h-[2px] align-middle mr-1.5" style={{ background: COLORS.wr }} />
            WR {smoothLabel} (left, 0–100%)
          </span>
          {range.smooth > 1 && (
            <span>
              <span className="inline-block w-3 h-[2px] align-middle mr-1.5" style={{ background: COLORS.wrRaw }} />
              WR raw daily
            </span>
          )}
          <span>
            <span className="inline-block w-2 h-2 align-middle mr-1.5 rounded-[2px]" style={{ background: COLORS.up }} />
            <span className="inline-block w-2 h-2 align-middle mr-1.5 rounded-[2px]" style={{ background: COLORS.down }} />
            BTC daily OHLC (right)
          </span>
        </div>
      </Panel>

      <Methodology title="How to read this chart">
        <p>
          Win rate comes from <code>daily_market_regime</code> — signals grouped by the UTC day
          they were <em>created</em>. Clicking a candle drills into that exact set of signals
          (dimension <code>created_day</code>), so the modal count matches the chart. BTC candles
          are Binance spot daily OHLC. The two axes are independent scales — this shows
          co-movement, not causation. Smoothing widens with range (30D raw · 90D 7d · 1Y 14d ·
          All 30d) so long-range patterns stay readable; the faint line is always the raw daily
          value. Best/Worst markers require ≥5 closed signals on that day.
        </p>
      </Methodology>
    </div>
  );
};

export default WrVsBtcTab;
