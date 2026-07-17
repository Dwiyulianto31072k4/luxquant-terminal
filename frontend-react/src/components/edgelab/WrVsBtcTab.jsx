// WrVsBtcTab v5 — daily LuxQuant win rate vs BTC candlestick + BTC × WR analysis.
// Chart:
// - BTC: real OHLC candlesticks (right axis), green/red + wicks
// - WR : emerald line, left axis locked 0-100%, raw daily by default;
// smoothing is an explicit toggle (window dynamic per range)
// - Markers ▲ best / ▼ worst WR day (min 5 closed) · crosshair tooltip · click-to-drill
// Analysis (all client-side from the same all-time payload, recomputed per range):
// - Pearson r between BTC daily return and WR (+ strength label)
// - Conditional WR by BTC move bucket (dump / down / flat / up / pump)
// - Anomaly days from linear-fit residuals — each card drillable (created_day)
// Drill payloads now carry btcSeries — a {date: {o, c}} map over ALL days —
// so the drawer can compute each signal's BTC change over its OWN
// created→resolved window (multi-day holds included), plus alpha.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
} from "lightweight-charts";
import { Panel, EmptyState, Methodology } from "./_shared";

const RANGES = [
  { id: "30", label: "30D", days: 30, smooth: 3 },
  { id: "90", label: "90D", days: 90, smooth: 7 },
  { id: "365", label: "1Y", days: 365, smooth: 14 },
  { id: "all", label: "All", days: Infinity, smooth: 30 },
];

const COLORS = {
  up: "#10b981",
  down: "#f43f5e",
  wr: "#34d399",
  wrRaw: "rgba(52, 211, 153, 0.22)",
  text: "rgb(var(--ink) / 0.40)",
  grid: "rgb(var(--ink) / 0.04)",
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
  v == null ? "—" : v >= 1000 ? `$${Math.round(v).toLocaleString("en-US")}` : `$${v.toFixed(2)}`;

const wAvg = (days) => {
  const n = days.reduce((p, c) => p + c.total_closed, 0);
  if (!n) return null;
  return days.reduce((p, c) => p + c.win_rate * c.total_closed, 0) / n;
};

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const corrStrength = (r) => {
  const a = Math.abs(r);
  if (a < 0.2) return "negligible";
  if (a < 0.4) return "weak";
  if (a < 0.6) return "moderate";
  if (a < 0.8) return "strong";
  return "very strong";
};

const BTC_BUCKETS = [
  { id: "dump", label: "BTC ≤ −3%", test: (v) => v <= -3 },
  { id: "down", label: "−3% … −1%", test: (v) => v > -3 && v <= -1 },
  { id: "flat", label: "±1%", test: (v) => v > -1 && v < 1 },
  { id: "up", label: "+1% … +3%", test: (v) => v >= 1 && v < 3 },
  { id: "pump", label: "BTC ≥ +3%", test: (v) => v >= 3 },
];

// drill bucket for a chart day — shared by candle click & anomaly cards
const dayBucket = (r, btcSeries) => ({
  dimension: "created_day",
  key: r.date,
  label: `${r.date} · ${r.win_rate}% WR`,
  win_rate: r.win_rate,
  total: r.total_closed,
  btc:
    r.btc_open != null && r.btc_close != null && r.btc_open > 0
      ? {
          chg: +(((r.btc_close - r.btc_open) / r.btc_open) * 100).toFixed(2),
          open: r.btc_open,
          close: r.btc_close,
        }
      : null,
  btcSeries,
});

const WrVsBtcTab = ({ onDrill }) => {
  const [allSeries, setAllSeries] = useState(null);
  const [error, setError] = useState(null);
  const [rangeId, setRangeId] = useState("all");
  const [smoothOn, setSmoothOn] = useState(false); // default: raw actual WR, no averaging

  const containerRef = useRef(null);
  const tooltipRef = useRef(null);

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

  // ── BTC open/close per day over ALL days (not the slice) — handed to the
  // drill drawer so multi-day holds resolving outside the slice still work ──
  const btcSeries = useMemo(() => {
    const m = {};
    for (const r of allSeries?.series || []) {
      if (r.btc_open != null && r.btc_close != null) {
        m[r.date] = { o: r.btc_open, c: r.btc_close };
      }
    }
    return m;
  }, [allSeries]);

  // ── headline stats (actual WR over the range, not an "average of averages") ──
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
      wr: nSum ? +(wSum / nSum).toFixed(1) : null,
      totalClosed: nSum,
      best,
      worst,
      btcDelta,
      btcLast,
    };
  }, [sliced]);

  // ── BTC × WR analysis: correlation, conditional WR, anomalies ──
  const analysis = useMemo(() => {
    // daily BTC return needs previous close
    const rows = [];
    for (let i = 1; i < sliced.length; i++) {
      const prev = sliced[i - 1];
      const cur = sliced[i];
      if (prev.btc_close != null && cur.btc_close != null && prev.btc_close > 0) {
        rows.push({
          ...cur,
          btcRet: +(((cur.btc_close - prev.btc_close) / prev.btc_close) * 100).toFixed(2),
        });
      }
    }
    // noise guard: correlation/buckets only on days with >=3 closed
    const usable = rows.filter((r) => r.total_closed >= 3);
    if (usable.length < 10) return null;

    const xs = usable.map((r) => r.btcRet);
    const ys = usable.map((r) => r.win_rate);
    const mx = xs.reduce((p, c) => p + c, 0) / xs.length;
    const my = ys.reduce((p, c) => p + c, 0) / ys.length;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < xs.length; i++) {
      const a = xs[i] - mx;
      const b = ys[i] - my;
      num += a * b;
      dx += a * a;
      dy += b * b;
    }
    const r = dx && dy ? +(num / Math.sqrt(dx * dy)).toFixed(2) : 0;
    const slope = dx ? num / dx : 0;
    const intercept = my - slope * mx;

    const overallWr = wAvg(usable);

    const buckets = BTC_BUCKETS.map((b) => {
      const ds = usable.filter((d) => b.test(d.btcRet));
      const closed = ds.reduce((p, c) => p + c.total_closed, 0);
      const wr = wAvg(ds);
      // capture = how much of peak (MFE) the static TP banked, per day,
      // then median across the bucket. Only days carrying journey medians.
      const caps = ds
        .filter((d) => d.med_mfe != null && d.med_mfe > 0 && d.med_realized != null)
        .map((d) => (d.med_realized / d.med_mfe) * 100);
      const capture = caps.length ? median(caps) : null;
      return {
        ...b,
        days: ds.length,
        closed,
        wr: wr != null ? +wr.toFixed(1) : null,
        delta: wr != null && overallWr != null ? +(wr - overallWr).toFixed(1) : null,
        capture: capture != null ? Math.round(capture) : null,
      };
    });

    const upWr = wAvg(usable.filter((d) => d.btcRet >= 1));
    const downWr = wAvg(usable.filter((d) => d.btcRet <= -1));
    const upDownGap = upWr != null && downWr != null ? +(upWr - downWr).toFixed(1) : null;

    // anomalies: largest residuals from the linear fit, min 5 closed
    const classify = (d) => {
      if (d.btcRet <= -2 && d.resid > 0)
        return { kind: "resilient", label: "WR held despite BTC dump", c: "#34d399" };
      if (d.btcRet >= 2 && d.resid < 0)
        return { kind: "fragile", label: "WR sank despite BTC pump", c: "#f43f5e" };
      return d.resid > 0
        ? { kind: "over", label: "WR above BTC-implied", c: "#34d399" }
        : { kind: "under", label: "WR below BTC-implied", c: "#f43f5e" };
    };
    const anomalies = rows
      .filter((d) => d.total_closed >= 5)
      .map((d) => ({ ...d, resid: +(d.win_rate - (intercept + slope * d.btcRet)).toFixed(1) }))
      .sort((a, b) => Math.abs(b.resid) - Math.abs(a.resid))
      .slice(0, 6)
      .map((d) => ({ ...d, ...classify(d) }));

    return {
      r,
      strength: corrStrength(r),
      nDays: usable.length,
      overallWr: overallWr != null ? +overallWr.toFixed(1) : null,
      buckets,
      upWr: upWr != null ? +upWr.toFixed(1) : null,
      downWr: downWr != null ? +downWr.toFixed(1) : null,
      upDownGap,
      anomalies,
    };
  }, [sliced]);

  // ── chart lifecycle ──
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

    const rowByDate = new Map(sliced.map((r) => [r.date, r]));
    const candleData = sliced
      .filter(
        (r) => r.btc_open != null && r.btc_high != null && r.btc_low != null && r.btc_close != null
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

    const lockWr = {
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    };
    if (smoothOn) {
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
    wr.setData(rollingMean(sliced, smoothOn ? range.smooth : 1));

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
 <div class="text-[10px] uppercase tracking-widest text-text-primary/40 mb-1">${r.date}${r.regime ? ` · ${r.regime}` : ""}</div>
 <div class="font-mono tabular-nums text-profit">WR ${r.win_rate}% · ${r.total_closed} closed</div>
 ${
   r.btc_close != null
     ? `<div class="font-mono tabular-nums text-text-primary/60 text-[11px] mt-1">O ${fmtUsd(r.btc_open)} · H ${fmtUsd(r.btc_high)}<br/>L ${fmtUsd(r.btc_low)} · C ${fmtUsd(r.btc_close)}</div>`
     : ""
 }
 <div class="text-[9px] uppercase tracking-widest text-accent/50 mt-1.5">click candle to drill</div>`;
      tip.style.display = "block";
      const x = Math.min(param.point.x + 14, el.clientWidth - tip.offsetWidth - 8);
      const y = Math.min(param.point.y + 14, 440 - tip.offsetHeight - 8);
      tip.style.left = `${Math.max(0, x)}px`;
      tip.style.top = `${Math.max(0, y)}px`;
    };
    chart.subscribeCrosshairMove(onMove);

    const onClick = (param) => {
      if (!param.time || !onDrill) return;
      const r = rowByDate.get(timeToKey(param.time));
      if (!r || !r.total_closed) return;
      onDrill(dayBucket(r, btcSeries));
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
    };
  }, [sliced, range, smoothOn, stats, onDrill, btcSeries]);

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
        <div className="h-[440px] flex items-center justify-center text-text-primary/30 text-xs uppercase tracking-widest">
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

  const smoothLabel = smoothOn ? `${range.smooth}d smoothed` : "raw daily";

  const drillDay = (d) => onDrill?.(dayBucket(d, btcSeries));

  return (
    <div className="space-y-4">
      {/* ═══ chart panel ═══ */}
      <Panel
        title="WR × BTC"
        meta={`since first signal · ${smoothLabel} · click a candle to drill`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRangeId(r.id)}
                className={`px-3 py-1 text-[10px] uppercase tracking-widest rounded border transition-colors ${
                  rangeId === r.id
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-ink/10 text-text-primary/40 hover:text-text-primary/70"
                }`}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={() => setSmoothOn((v) => !v)}
              className={`ml-1 px-3 py-1 text-[10px] uppercase tracking-widest rounded border transition-colors ${
                smoothOn
                  ? "border-profit/40 bg-profit/10 text-profit"
                  : "border-ink/10 text-text-primary/40 hover:text-text-primary/70"
              }`}
              title="Toggle rolling smoothing on the WR line"
            >
              Smooth {range.smooth}d
            </button>
          </div>
          {stats && (
            <div className="flex flex-wrap gap-2">
              <span className="px-2.5 py-1 rounded border border-ink/10 bg-ink/[0.03] text-[11px] font-mono tabular-nums text-profit">
                WR {stats.wr ?? "—"}%
                <span className="text-text-primary/30 ml-1">
                  · {range.label} · {stats.totalClosed.toLocaleString()} closed
                </span>
              </span>
              {stats.best && (
                <span className="px-2.5 py-1 rounded border border-ink/10 bg-ink/[0.03] text-[11px] font-mono tabular-nums text-text-primary/60">
                  Best <span className="text-profit">{stats.best.win_rate}%</span>{" "}
                  <span className="text-text-primary/30">{stats.best.date}</span>
                </span>
              )}
              {stats.worst && (
                <span className="px-2.5 py-1 rounded border border-ink/10 bg-ink/[0.03] text-[11px] font-mono tabular-nums text-text-primary/60">
                  Worst <span className="text-negative">{stats.worst.win_rate}%</span>{" "}
                  <span className="text-text-primary/30">{stats.worst.date}</span>
                </span>
              )}
              {stats.btcDelta != null && (
                <span className="px-2.5 py-1 rounded border border-ink/10 bg-ink/[0.03] text-[11px] font-mono tabular-nums text-text-primary/60">
                  BTC{" "}
                  <span className={stats.btcDelta >= 0 ? "text-profit" : "text-negative"}>
                    {stats.btcDelta >= 0 ? "+" : ""}
                    {stats.btcDelta}%
                  </span>{" "}
                  <span className="text-text-primary/30">{fmtUsd(stats.btcLast)}</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <div ref={containerRef} className="w-full" />
          <div
            ref={tooltipRef}
            style={{ display: "none" }}
            className="absolute z-20 pointer-events-none px-3 py-2 rounded-lg border border-accent/20 bg-surface-raised/95 shadow-xl"
          />
        </div>

        <div className="flex flex-wrap gap-4 mt-3 text-[10px] uppercase tracking-widest text-text-primary/35">
          <span>
            <span
              className="inline-block w-3 h-[2px] align-middle mr-1.5"
              style={{ background: COLORS.wr }}
            />
            WR {smoothLabel} (left, 0–100%)
          </span>
          {smoothOn && (
            <span>
              <span
                className="inline-block w-3 h-[2px] align-middle mr-1.5"
                style={{ background: COLORS.wrRaw }}
              />
              WR raw daily
            </span>
          )}
          <span>
            <span
              className="inline-block w-2 h-2 align-middle mr-1.5 rounded-[2px]"
              style={{ background: COLORS.up }}
            />
            <span
              className="inline-block w-2 h-2 align-middle mr-1.5 rounded-[2px]"
              style={{ background: COLORS.down }}
            />
            BTC daily OHLC (right)
          </span>
        </div>
      </Panel>

      {/* ═══ BTC × WR analysis panel ═══ */}
      {analysis && (
        <Panel
          title="BTC × WR Analysis"
          meta={`${range.label} · ${analysis.nDays} days with ≥3 closed · same-day BTC move vs WR`}
        >
          {/* headline chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="px-2.5 py-1 rounded border border-ink/10 bg-ink/[0.03] text-[11px] font-mono tabular-nums text-text-primary/70">
              Correlation r{" "}
              <span
                className={Math.abs(analysis.r) >= 0.4 ? "text-accent" : "text-text-primary/85"}
              >
                {analysis.r >= 0 ? "+" : ""}
                {analysis.r}
              </span>{" "}
              <span className="text-text-primary/35">({analysis.strength})</span>
            </span>
            {analysis.upWr != null && analysis.downWr != null && (
              <span className="px-2.5 py-1 rounded border border-ink/10 bg-ink/[0.03] text-[11px] font-mono tabular-nums text-text-primary/70">
                BTC up days <span className="text-profit">{analysis.upWr}%</span>
                <span className="text-text-primary/35 mx-1.5">vs</span>
                down days <span className="text-negative">{analysis.downWr}%</span>
                {analysis.upDownGap != null && (
                  <span className="text-text-primary/35 ml-1.5">
                    ({analysis.upDownGap >= 0 ? "+" : ""}
                    {analysis.upDownGap}pp)
                  </span>
                )}
              </span>
            )}
          </div>

          {/* verdict — factual, no advice */}
          <p className="text-xs text-text-primary/50 leading-relaxed mb-4">
            Within this range, the same-day relationship between BTC moves and signal win rate is{" "}
            <span className="text-text-primary/80">{analysis.strength}</span> (r ={" "}
            {analysis.r >= 0 ? "+" : ""}
            {analysis.r}).{" "}
            {analysis.upDownGap != null &&
              (Math.abs(analysis.upDownGap) < 2
                ? "Win rate on BTC up days and down days is essentially the same — "
                : `Win rate runs ${Math.abs(analysis.upDownGap)}pp ${
                    analysis.upDownGap > 0 ? "higher on BTC up days" : "higher on BTC down days"
                  } — `)}
            this describes co-movement in this window, not causation.
          </p>

          {/* conditional WR by BTC move */}
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-widest text-text-primary/35 mb-2">
              WR by same-day BTC move
            </div>
            <div className="rounded-lg border border-ink/[0.06] overflow-hidden">
              <div className="grid grid-cols-[1.2fr_0.55fr_0.7fr_0.8fr_0.85fr_1.3fr] gap-2 px-3 py-2 text-[9px] font-mono uppercase tracking-[0.18em] text-text-primary/30 border-b border-ink/[0.05]">
                <span>BTC day</span>
                <span className="text-right">Days</span>
                <span className="text-right">Closed</span>
                <span className="text-right">WR</span>
                <span
                  className="text-right"
                  title="Median share of peak (MFE) the static TP banked"
                >
                  Capture
                </span>
                <span className="text-right">vs range WR ({analysis.overallWr}%)</span>
              </div>
              {analysis.buckets.map((b) => (
                <div
                  key={b.id}
                  className="grid grid-cols-[1.2fr_0.55fr_0.7fr_0.8fr_0.85fr_1.3fr] gap-2 px-3 py-2 text-[11px] font-mono tabular-nums border-b border-ink/[0.04] last:border-0 items-center"
                >
                  <span className="text-text-primary/70">{b.label}</span>
                  <span className="text-right text-text-primary/45">{b.days}</span>
                  <span className="text-right text-text-primary/45">
                    {b.closed.toLocaleString()}
                  </span>
                  <span
                    className={`text-right ${
                      b.wr == null
                        ? "text-text-primary/30"
                        : b.wr >= (analysis.overallWr ?? 0)
                          ? "text-profit"
                          : "text-negative"
                    }`}
                  >
                    {b.wr != null ? `${b.wr}%` : "—"}
                  </span>
                  <span
                    className={`text-right ${
                      b.capture == null
                        ? "text-text-primary/25"
                        : b.capture >= 60
                          ? "text-profit/80"
                          : b.capture >= 40
                            ? "text-accent/80"
                            : "text-negative/80"
                    }`}
                    title="Median realized ÷ median MFE — share of the peak the TP captured"
                  >
                    {b.capture != null ? `${b.capture}%` : "—"}
                  </span>
                  <span className="flex items-center justify-end gap-2">
                    {b.delta != null ? (
                      <>
                        <span
                          className={`text-[10px] ${b.delta >= 0 ? "text-profit/80" : "text-negative/80"}`}
                        >
                          {b.delta >= 0 ? "+" : ""}
                          {b.delta}pp
                        </span>
                        <span className="w-20 h-1.5 rounded-full bg-ink/[0.05] overflow-hidden flex">
                          <span
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (Math.abs(b.delta) / 15) * 100)}%`,
                              background: b.delta >= 0 ? COLORS.up : COLORS.down,
                              marginLeft: "0",
                            }}
                          />
                        </span>
                      </>
                    ) : (
                      <span className="text-text-primary/25 text-[10px]">no days</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-text-primary/35 leading-relaxed">
              Capture = median realized gain ÷ median peak (MFE) for signals created that day. Lower
              capture means the static TP left more of the move on the table — it tends to fall when
              BTC gives bigger swings.
            </p>
          </div>

          {/* anomalies — drillable */}
          {analysis.anomalies.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-text-primary/35 mb-2">
                Anomaly days — largest divergence from the BTC-implied WR · click to drill
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {analysis.anomalies.map((d) => (
                  <button
                    key={d.date}
                    onClick={() => drillDay(d)}
                    className="group text-left rounded-lg border border-ink/[0.06] bg-ink/[0.02] hover:border-accent/35 hover:bg-ink/[0.04] transition p-3"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-mono text-text-primary/45">{d.date}</span>
                      <span className="text-text-primary/0 group-hover:text-accent/60 transition text-xs">
                        ↗
                      </span>
                    </div>
                    <div
                      className="text-[10px] uppercase tracking-wider mb-2"
                      style={{ color: d.c }}
                    >
                      {d.label}
                    </div>
                    <div className="flex items-center gap-3 font-mono tabular-nums text-[11px]">
                      <span className="text-text-primary/75">
                        WR <span style={{ color: d.c }}>{d.win_rate}%</span>
                      </span>
                      <span className={d.btcRet >= 0 ? "text-profit/70" : "text-negative/70"}>
                        BTC {d.btcRet >= 0 ? "+" : ""}
                        {d.btcRet}%
                      </span>
                      <span className="text-text-primary/35">{d.total_closed} closed</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}

      <Methodology title="How to read this chart">
        <p>
          Win rate comes from <code>daily_market_regime</code> — signals grouped by the UTC day they
          were <em>created</em>. The headline WR chip is the actual aggregate over the selected
          range (total wins ÷ total closed), not an average of daily percentages. Clicking a candle
          or an anomaly card drills into that exact set of signals (dimension{" "}
          <code>created_day</code>), so the modal count matches the chart. Inside the drill modal,
          each signal's "BTC over hold" compares BTC's open on the signal's created day to its close
          on the resolved day — the same window the trade was alive — and alpha is the signal's peak
          minus that move. BTC candles are Binance spot daily OHLC; BTC daily return compares
          consecutive closes. Correlation and the conditional table only use days with ≥3 closed
          signals to limit small-sample noise; anomaly days require ≥5. The two chart axes are
          independent scales — everything here describes co-movement within the window, not
          causation. Smoothing is off by default (raw daily WR); when enabled the window widens with
          range (30D 3d · 90D 7d · 1Y 14d · All 30d) and the faint line is the raw daily value.
          Best/Worst markers require ≥5 closed signals on that day.
        </p>
      </Methodology>
    </div>
  );
};

export default WrVsBtcTab;
