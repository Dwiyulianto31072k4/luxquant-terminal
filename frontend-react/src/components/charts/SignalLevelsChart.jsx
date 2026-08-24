import { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  CrosshairMode,
} from "lightweight-charts";
import { useChartDrawings, TOOLS, measureStats, FIB_LEVELS } from "./useChartDrawings";
import {
  IconCursor,
  IconMeasure,
  IconHLine,
  IconVLine,
  IconTrend,
  IconRay,
  IconRect,
  IconFib,
  IconMagnet,
  IconUndo,
  IconTrash,
} from "./chartToolIcons";
import { detectFVGs, partitionZones, MITIGATION } from "./fvg";
import { FvgPrimitive } from "./fvgPrimitive";
import { EntryPrimitive } from "./entryPrimitive";

/**
 * The signal's own chart, with entry / TP1-4 / SL1-2 drawn on it.
 *
 * Why this exists alongside the TradingView embed: that widget is an iframe
 * served from s3.tradingview.com, so nothing outside it can add a price line.
 * Reading the levels off the side panel and placing them on the chart by eye is
 * exactly the step users asked us to remove — on a fast-moving altcoin that
 * translation costs the entry.
 *
 * TradingView stays the default and keeps its drawing tools and symbol search;
 * this is the opt-in view for "show me where the levels are, now".
 */

const API_BASE = "/api/v1";

const TF = [
  { key: "15m", label: "15m" },
  { key: "1h", label: "1H" },
  { key: "4h", label: "4H" },
  { key: "1d", label: "1D" },
];

const TOOL_BUTTONS = [
  { k: TOOLS.CURSOR, Icon: IconCursor, title: "Pan / zoom (Esc)" },
  { k: TOOLS.TREND, Icon: IconTrend, title: "Trend line — drag between two points" },
  { k: TOOLS.RAY, Icon: IconRay, title: "Ray — drag, and it carries on to the right" },
  { k: TOOLS.HLINE, Icon: IconHLine, title: "Horizontal line — click a price" },
  { k: TOOLS.VLINE, Icon: IconVLine, title: "Vertical line — click a time" },
  { sep: "shapes" },
  { k: TOOLS.RECT, Icon: IconRect, title: "Rectangle — mark a zone" },
  { k: TOOLS.FIB, Icon: IconFib, title: "Fib retracement — drag from swing to swing" },
  { k: TOOLS.MEASURE, Icon: IconMeasure, title: "Measure a move — drag across the candles" },
];

const cssRgb = (name, fallback) => {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : fallback;
};
const cssRgba = (name, alpha, fallback) => {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgba(${v.split(/\s+/).join(", ")}, ${alpha})` : fallback;
};

/**
 * lightweight-charts defaults to 2 decimals, which rendered every level on a
 * sub-cent coin as the same "0.02" — entry, all four targets and both stops
 * collapsed into one number and the labels became worthless. Derive the
 * precision from the price instead.
 */
/**
 * Timestamps come off the API as UTC seconds and lightweight-charts renders
 * them as UTC. The side panel prints the same instant in the reader's own zone,
 * so the two disagreed by the reader's offset — seven hours, for the report
 * that surfaced this. These format in local time so the axis, the crosshair and
 * the ENTRY stamp all agree with the panel.
 */
const fmtLocalStamp = (ts) =>
  new Date(ts * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * Axis ticks get only as much detail as the tick's own weight calls for —
 * printing a full date on every intraday tick is what makes an axis unreadable.
 */
const fmtLocalTick = (ts, tickMarkType) => {
  const d = new Date(ts * 1000);
  switch (tickMarkType) {
    case 0: // Year
      return String(d.getFullYear());
    case 1: // Month
      return d.toLocaleDateString("en-GB", { month: "short" });
    case 2: // DayOfMonth
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    default: // Time / TimeWithSeconds
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
};

const decimalsFor = (p) => {
  const n = Math.abs(Number(p) || 0);
  if (n >= 1000) return 2;
  if (n >= 1) return 4;
  if (n >= 0.01) return 5;
  if (n >= 0.0001) return 6;
  return 8;
};

/** A price, or null — zero and NaN are both "no level here". */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Long or short, from the levels themselves — no signal carries a side field.
 *
 * Read the stop first and the *far* target second. Never TP1: it can sit on or
 * within a tick of the entry, and reading direction off it is what once made 70
 * tie-signals report as shorts. Two other places in the app still do exactly
 * that (SignalModal), which is a separate problem to this chart.
 */
const directionOf = (signal) => {
  const entry = num(signal?.entry);
  if (!entry) return "long";
  const stop = num(signal?.stop1);
  if (stop && stop !== entry) return stop < entry ? "long" : "short";
  const far = num(signal?.target4) || num(signal?.target3) || num(signal?.target2);
  if (far && far !== entry) return far > entry ? "long" : "short";
  return "long";
};

/** Levels to draw, in the order they should win a collision. */
const buildLevels = (signal, palette) => {
  const out = [];
  const entry = num(signal?.entry);
  if (entry) {
    out.push({ price: entry, title: "ENTRY", color: palette.accent, width: 2, style: LineStyle.Solid });
  }
  [1, 2, 3, 4].forEach((i) => {
    const p = num(signal?.[`target${i}`]);
    if (p) out.push({ price: p, title: `TP${i}`, color: palette.pos, width: 1, style: LineStyle.Dashed });
  });
  [1, 2].forEach((i) => {
    const p = num(signal?.[`stop${i}`]);
    if (p) out.push({ price: p, title: `SL${i}`, color: palette.neg, width: 1, style: LineStyle.Dashed });
  });
  return out;
};

const SignalLevelsChart = ({ signal, theme, height = 420 }) => {
  const hostRef = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const volRef = useRef(null);
  const linesRef = useRef([]);
  // Read by the chart-construction effect, which must not re-run per signal.
  const signalRef = useRef(signal);
  signalRef.current = signal;
  const fittedRef = useRef("");
  // Bumped after the chart is constructed so the drawing layer can bind to it.
  const [chartEpoch, setChartEpoch] = useState(0);

  const [interval, setInterval_] = useState("4h");
  const [candles, setCandles] = useState(null);
  // The magnet needs the bar under the pointer on every pointermove; a ref
  // keeps that lookup out of the drawing hook's dependency list.
  const candlesRef = useRef(null);
  candlesRef.current = candles;
  const [error, setError] = useState(null);

  // Fair Value Gaps. Off by default — this chart's job is the trade plan, and a
  // user who has not asked for imbalance zones should not have to dismiss them.
  // The preference is remembered so it does not have to be re-armed per signal.
  const [fvgOn, setFvgOn] = useState(() => {
    try {
      return localStorage.getItem("pref_chart_fvg") === "1";
    } catch {
      return false;
    }
  });
  const toggleFvg = () => {
    setFvgOn((on) => {
      const next = !on;
      try {
        localStorage.setItem("pref_chart_fvg", next ? "1" : "0");
      } catch {
        /* private mode — the toggle still works for this session */
      }
      return next;
    });
  };

  // Recomputed only when the candles actually change. The primitive repaints
  // with the chart on every frame, so detection must not be on that path.
  const fvgZones = useMemo(() => {
    if (!fvgOn || !candles?.length) return { open: [], inverted: [] };
    return partitionZones(
      detectFVGs(candles, { mitigation: MITIGATION.AVERAGE })
    );
  }, [fvgOn, candles]);

  const fvgRef = useRef(null);
  const entryRef = useRef(null);

  const pair = (signal?.pair || "").toUpperCase();

  // ── data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pair) return undefined;
    let alive = true;
    setError(null);
    setCandles(null);

    const load = (first) =>
      fetch(`${API_BASE}/market/klines?symbol=${encodeURIComponent(pair)}&interval=${interval}&limit=300`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((rows) => {
          if (!alive) return;
          if (!Array.isArray(rows) || !rows.length) throw new Error("no candles");
          setCandles(
            rows.map((k) => ({
              time: Math.floor(Number(k[0]) / 1000),
              open: Number(k[1]),
              high: Number(k[2]),
              low: Number(k[3]),
              close: Number(k[4]),
              volume: Number(k[5]),
            }))
          );
        })
        // A failed refresh must not blank a chart that is already drawn — only
        // the first load is allowed to surface an error.
        .catch((e) => alive && first && setError(e.message));

    load(true);
    // Not a websocket: this is a REST poll of the same klines endpoint the rest
    // of the app uses. 20s is well inside a 15m candle and costs one cached
    // request. TradingView mode streams properly; this trades that for the
    // ability to draw the levels at all.
    const iv = window.setInterval(() => load(false), 20000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [pair, interval]);

  const palette = useMemo(
    () => ({
      accent: cssRgb("--accent", "rgb(240,185,11)"),
      pos: cssRgb("--pos", "rgb(14,203,129)"),
      neg: cssRgb("--neg", "rgb(246,70,93)"),
      text: cssRgb("--fg-secondary", "rgb(132,142,156)"),
      grid: cssRgba("--ink", 0.06, "rgba(255,255,255,0.06)"),
      border: cssRgba("--ink", 0.12, "rgba(255,255,255,0.12)"),
      volUp: cssRgba("--pos", 0.35, "rgba(14,203,129,0.35)"),
      volDown: cssRgba("--neg", 0.35, "rgba(246,70,93,0.35)"),
      crosshair: cssRgba("--ink", 0.38, "rgba(255,255,255,0.38)"),
      crosshairLabel: cssRgb("--fg-secondary", "rgb(132,142,156)"),
      // The entry flag's text sits on solid accent in every desk, so it needs
      // the colour that reads against accent — not the page foreground.
      onAccent: cssRgb("--accent-fg", "rgb(11,14,17)"),
    }),
    // theme is the trigger: the tokens themselves are read imperatively
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme]
  );

  const dp = decimalsFor(signal?.entry);
  const { tool, setTool, shapes, draft, clear, undo, magnet, setMagnet, toPixel, fmt } =
    useChartDrawings({
      chartRef,
      seriesRef: candleRef,
      hostRef,
      decimals: dp,
      epoch: chartEpoch,
      candlesRef,
    });

  // While a drawing tool is armed, dragging must draw — not pan the chart.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const idle = tool === TOOLS.CURSOR;
    chart.applyOptions({
      handleScroll: idle,
      handleScale: idle,
    });
  }, [tool, candles]);

  // ── chart lifecycle. Rebuilt on theme change because lightweight-charts
  //    reads colours at construction for several of these options.
  useEffect(() => {
    if (!hostRef.current) return undefined;
    const chart = createChart(hostRef.current, {
      autoSize: true,
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: palette.text,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      // The crosshair used to be drawn in accent gold — the same gold as the
      // ENTRY line and the entry stamp. Its time label therefore read as "the
      // signal fired here", wherever the pointer happened to rest, and was
      // reported twice as a clock bug. Gold is reserved for the entry now.
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: palette.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: palette.crosshairLabel },
        horzLine: { color: palette.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: palette.crosshairLabel },
      },
      // lightweight-charts renders timestamps in UTC unless told otherwise,
      // while the side panel prints them in the reader's own zone. For anyone
      // in WIB that put the axis seven hours behind the ENTRY stamp beside it,
      // which is the mismatch users actually saw. Both now say local time.
      localization: { timeFormatter: fmtLocalStamp },
      rightPriceScale: { borderColor: palette.border, scaleMargins: { top: 0.1, bottom: 0.26 } },
      timeScale: {
        borderColor: palette.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        tickMarkFormatter: fmtLocalTick,
      },
    });
    chartRef.current = chart;

    const dp = decimalsFor(signalRef.current?.entry);
    candleRef.current = chart.addSeries(CandlestickSeries, {
      priceFormat: { type: "price", precision: dp, minMove: 1 / 10 ** dp },
      upColor: palette.pos,
      downColor: palette.neg,
      borderUpColor: palette.pos,
      borderDownColor: palette.neg,
      wickUpColor: palette.pos,
      wickDownColor: palette.neg,
    });

    // Volume shares the pane but is pinned to the bottom quarter, the way the
    // user's reference screenshot has it.
    volRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    // Attached once per chart. The chart is rebuilt on theme change, so the
    // primitive is recreated with it rather than carried across — a primitive
    // outlives its series only as a dangling reference.
    fvgRef.current = new FvgPrimitive();
    // Label text stays white: the chip behind it is the zone colour at high
    // alpha in both themes, so it never sits on the page background.
    fvgRef.current.setColors({ bull: palette.pos, bear: palette.neg });
    candleRef.current.attachPrimitive(fvgRef.current);

    entryRef.current = new EntryPrimitive();
    entryRef.current.setColors({ color: palette.accent, labelText: palette.onAccent });
    candleRef.current.attachPrimitive(entryRef.current);

    setChartEpoch((n) => n + 1);

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      fvgRef.current = null;
      entryRef.current = null;
      linesRef.current = [];
    };
  }, [palette]);

  // Push the entry stamp. Re-runs on every timeframe change and every 20s
  // refresh, so the marker follows the data instead of being placed once.
  useEffect(() => {
    const prim = entryRef.current;
    if (!prim) return;

    const at = signal?.created_at ? Math.floor(new Date(signal.created_at).getTime() / 1000) : null;
    if (!at || !candles?.length) {
      prim.setEntry({ time: null, price: null, stamp: "" });
      return;
    }

    // Snap to the bar that contains the entry: the chart can only place a
    // coordinate on a bar it holds, and at 4h the entry almost never lands on
    // a bar boundary. Out of range on purpose stays unsnapped — the primitive
    // pins those to the edge and marks which way they lie, which is more
    // honest than drawing them on the first bar as if they happened there.
    let bucket = null;
    for (let i = candles.length - 1; i >= 0; i -= 1) {
      if (candles[i].time <= at) {
        bucket = candles[i].time;
        break;
      }
    }

    prim.setEntry({
      time: bucket ?? at,
      price: num(signal?.entry),
      // The stamp is the entry instant, not the bar it fell in, so it matches
      // the side panel to the minute.
      stamp: fmtLocalStamp(at),
      dir: directionOf(signal),
    });
  }, [signal, candles, chartEpoch]);

  // Push zones to the primitive whenever detection or the toggle changes. The
  // primitive owns the painting; this only hands it the data.
  useEffect(() => {
    fvgRef.current?.setZones(fvgOn ? fvgZones : { open: [], inverted: [] });
  }, [fvgZones, fvgOn, chartEpoch]);

  // ── data + levels ───────────────────────────────────────────────────────
  useEffect(() => {
    const candleSeries = candleRef.current;
    if (!candleSeries || !candles) return;
    candleSeries.setData(candles);
    volRef.current?.setData(
      candles.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? palette.volUp : palette.volDown,
      }))
    );

    linesRef.current.forEach((l) => {
      try {
        candleSeries.removePriceLine(l);
      } catch {
        /* series may already be gone */
      }
    });
    linesRef.current = buildLevels(signal, palette).map((lv) =>
      candleSeries.createPriceLine({
        price: lv.price,
        color: lv.color,
        lineWidth: lv.width,
        lineStyle: lv.style,
        axisLabelVisible: true,
        title: lv.title,
      })
    );

    // Only frame the chart the first time this pair/interval is drawn. The 20s
    // poll used to re-fit on every tick, so a user who had zoomed in was thrown
    // back to the full range every 20 seconds.
    //
    // Only fit once the host actually has a width. Fitting into a zero-width
    // container computes a bar spacing for a pane that does not exist yet, and
    // because the fit is once-per-key it is never corrected — the whole series
    // ends up crushed into a corner for as long as the chart is open. Leaving
    // the key unset here hands the job to the resize observer below.
    const fitKey = `${pair}:${interval}`;
    if (fittedRef.current !== fitKey && hostRef.current?.clientWidth > 0) {
      chartRef.current?.timeScale().fitContent();
      fittedRef.current = fitKey;
    }
  }, [candles, signal, palette, pair, interval]);

  // The first real size the host gets. Fires once per pair/interval and then
  // stands down, so a user who has zoomed is never re-framed by a resize.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => {
      const fitKey = `${pair}:${interval}`;
      if (fittedRef.current === fitKey || !candles?.length) return;
      if (host.clientWidth <= 0) return;
      chartRef.current?.timeScale().fitContent();
      fittedRef.current = fitKey;
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, [pair, interval, candles, chartEpoch]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <div className="flex items-center gap-1">
          {TF.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setInterval_(t.key)}
              className={`rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors ${
                interval === t.key
                  ? "bg-accent text-accent-fg"
                  : "text-text-muted hover:bg-ink/[0.06] hover:text-text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-ink/[0.10]" />
          <button
            type="button"
            onClick={toggleFvg}
            title={
              "Fair Value Gaps — unfilled 3-candle imbalances.\n" +
              "Solid = still open. Hatched = price closed through it, so the zone " +
              "has flipped and now acts as the opposite level."
            }
            className={`rounded px-2 py-1 font-mono text-[10px] leading-none transition-colors ${
              fvgOn
                ? "bg-accent text-accent-fg"
                : "text-text-muted hover:bg-ink/[0.06] hover:text-text-primary"
            }`}
          >
            FVG
          </button>
        </div>
        <div className="flex items-center gap-2.5 font-mono text-[10px] text-text-muted">
          <span className="flex items-center gap-1">
            <span className="h-[2px] w-3" style={{ background: palette.accent }} /> Entry
          </span>
          <span className="flex items-center gap-1">
            <span className="h-[2px] w-3" style={{ background: palette.pos }} /> TP
          </span>
          <span className="flex items-center gap-1">
            <span className="h-[2px] w-3" style={{ background: palette.neg }} /> SL
          </span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1" style={{ height }}>
        <div ref={hostRef} className="absolute inset-0" />

        {/* Tool rail. Sits over the plot the way every charting package puts
            it, on the left because the price scale owns the right. It is the
            only overlay that takes pointer events — the drawing surface below
            needs the rest. */}
        <div className="pointer-events-auto absolute left-1 top-1 z-10 flex flex-col gap-0.5 rounded-lg border border-ink/[0.08] bg-surface-raised/95 p-1 backdrop-blur-sm">
          {TOOL_BUTTONS.map((b) =>
            b.sep ? (
              <span key={b.sep} className="my-0.5 h-px bg-ink/[0.08]" />
            ) : (
              <button
                key={b.k}
                type="button"
                title={b.title}
                aria-label={b.title}
                aria-pressed={tool === b.k}
                onClick={() => setTool(b.k)}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                  tool === b.k
                    ? "bg-accent text-accent-fg"
                    : "text-text-muted hover:bg-ink/[0.06] hover:text-text-primary"
                }`}
              >
                <b.Icon />
              </button>
            )
          )}

          <span className="my-0.5 h-px bg-ink/[0.08]" />

          <button
            type="button"
            title={
              magnet
                ? "Magnet on — drawings snap to the nearest open/high/low/close"
                : "Magnet off — drawings land exactly where you click"
            }
            aria-label="Magnet"
            aria-pressed={magnet}
            onClick={() => setMagnet((m) => !m)}
            className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
              magnet
                ? "bg-accent/15 text-accent-text"
                : "text-text-muted hover:bg-ink/[0.06] hover:text-text-primary"
            }`}
          >
            <IconMagnet />
          </button>

          <button
            type="button"
            title="Undo last drawing (⌘Z)"
            aria-label="Undo last drawing"
            onClick={undo}
            disabled={!shapes.length}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors enabled:hover:bg-ink/[0.06] enabled:hover:text-text-primary disabled:opacity-30"
          >
            <IconUndo />
          </button>

          <button
            type="button"
            title="Clear all drawings"
            aria-label="Clear all drawings"
            onClick={clear}
            disabled={!shapes.length}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors enabled:hover:bg-ink/[0.06] enabled:hover:text-loss disabled:opacity-30"
          >
            <IconTrash />
          </button>
        </div>
        {/* Drawings live here, above the canvas. pointer-events stay off so the
            chart keeps its own crosshair and wheel zoom; the host element below
            is what listens for drawing gestures. */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {[...shapes, ...(draft ? [{ ...draft, id: "draft" }] : [])].map((sh) => {
            const MONO = "JetBrains Mono, monospace";

            if (sh.type === TOOLS.HLINE) {
              const y = candleRef.current?.priceToCoordinate(sh.price);
              if (y == null) return null;
              return (
                <g key={sh.id}>
                  <line x1="0" y1={y} x2="100%" y2={y} stroke={palette.text} strokeWidth="1" strokeDasharray="4 3" />
                  <text x="6" y={y - 4} fill={palette.text} fontSize="10" fontFamily={MONO}>
                    {fmt(sh.price)}
                  </text>
                </g>
              );
            }

            if (sh.type === TOOLS.VLINE) {
              const x = chartRef.current?.timeScale().timeToCoordinate(sh.time);
              if (x == null) return null;
              return (
                <line
                  key={sh.id}
                  x1={x}
                  y1="0"
                  x2={x}
                  y2="100%"
                  stroke={palette.text}
                  strokeWidth="1"
                  strokeDasharray="4 3"
                />
              );
            }

            const a = toPixel(sh.a);
            const b = toPixel(sh.b);
            if (!a || !b) return null;

            if (sh.type === TOOLS.TREND) {
              return (
                <line key={sh.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={palette.accent} strokeWidth="1.5" />
              );
            }

            if (sh.type === TOOLS.RAY) {
              // Extend past the right edge along the same gradient. A ray that
              // stopped where the drag stopped would just be a trend line.
              const dx = b.x - a.x;
              const far = dx === 0 ? a.x : 4000;
              const t = dx === 0 ? 0 : (far - a.x) / dx;
              return (
                <line
                  key={sh.id}
                  x1={a.x}
                  y1={a.y}
                  x2={dx === 0 ? a.x : far}
                  y2={dx === 0 ? 4000 : a.y + (b.y - a.y) * t}
                  stroke={palette.accent}
                  strokeWidth="1.5"
                />
              );
            }

            if (sh.type === TOOLS.RECT) {
              return (
                <rect
                  key={sh.id}
                  x={Math.min(a.x, b.x)}
                  y={Math.min(a.y, b.y)}
                  width={Math.abs(b.x - a.x)}
                  height={Math.abs(b.y - a.y)}
                  fill={palette.accent}
                  fillOpacity="0.08"
                  stroke={palette.accent}
                  strokeWidth="1"
                />
              );
            }

            if (sh.type === TOOLS.FIB) {
              // 0 sits at the end of the drag and 1 at the start, so dragging
              // from a swing low up to a swing high puts 0 at the high — the
              // convention every charting package uses for a retracement.
              const left = Math.min(a.x, b.x);
              const right = Math.max(a.x, b.x);
              return (
                <g key={sh.id}>
                  {FIB_LEVELS.map((lv) => {
                    const price = sh.b.price + (sh.a.price - sh.b.price) * lv;
                    const y = candleRef.current?.priceToCoordinate(price);
                    if (y == null) return null;
                    const key = `${sh.id}-${lv}`;
                    // 0.618 is the level people actually trade; the rest are
                    // reference. Weighting them equally hides the one that matters.
                    const strong = lv === 0.618 || lv === 0.5;
                    return (
                      <g key={key}>
                        <line
                          x1={left}
                          y1={y}
                          x2={right}
                          y2={y}
                          stroke={palette.accent}
                          strokeOpacity={strong ? 0.95 : 0.5}
                          strokeWidth={strong ? 1.4 : 1}
                          strokeDasharray={strong ? "" : "3 3"}
                        />
                        <text
                          x={left + 4}
                          y={y - 3}
                          fill={palette.accent}
                          fillOpacity={strong ? 1 : 0.75}
                          fontSize="9"
                          fontFamily={MONO}
                        >
                          {lv.toFixed(3)} · {fmt(price)}
                        </text>
                      </g>
                    );
                  })}
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={palette.accent}
                    strokeOpacity="0.35"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />
                </g>
              );
            }

            const st = measureStats(sh.a, sh.b);
            const color = st?.up ? palette.pos : palette.neg;
            return (
              <g key={sh.id}>
                <rect
                  x={Math.min(a.x, b.x)}
                  y={Math.min(a.y, b.y)}
                  width={Math.abs(b.x - a.x)}
                  height={Math.abs(b.y - a.y)}
                  fill={color}
                  fillOpacity="0.12"
                  stroke={color}
                  strokeWidth="1"
                />
                <text
                  x={(a.x + b.x) / 2}
                  y={Math.min(a.y, b.y) - 6}
                  fill={color}
                  fontSize="11"
                  fontFamily={MONO}
                  textAnchor="middle"
                >
                  {st ? `${st.pct >= 0 ? "+" : ""}${st.pct.toFixed(2)}% · ${st.span}` : ""}
                </text>
              </g>
            );
          })}
        </svg>
        {!candles && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-text-muted">
            Loading candles…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-[12px] text-text-muted">
            Chart unavailable ({error})
          </div>
        )}
      </div>
    </div>
  );
};

export default SignalLevelsChart;
