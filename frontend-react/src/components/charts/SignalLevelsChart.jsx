import { useEffect, useRef, useState, useMemo } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineStyle,
  CrosshairMode,
} from "lightweight-charts";

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
const decimalsFor = (p) => {
  const n = Math.abs(Number(p) || 0);
  if (n >= 1000) return 2;
  if (n >= 1) return 4;
  if (n >= 0.01) return 5;
  if (n >= 0.0001) return 6;
  return 8;
};

/** Levels to draw, in the order they should win a collision. */
const buildLevels = (signal, palette) => {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
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

  const [interval, setInterval_] = useState("4h");
  const [candles, setCandles] = useState(null);
  const [error, setError] = useState(null);

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
    }),
    // theme is the trigger: the tokens themselves are read imperatively
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme]
  );

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
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: palette.accent, width: 1, style: LineStyle.Dashed, labelBackgroundColor: palette.accent },
        horzLine: { color: palette.accent, width: 1, style: LineStyle.Dashed, labelBackgroundColor: palette.accent },
      },
      rightPriceScale: { borderColor: palette.border, scaleMargins: { top: 0.1, bottom: 0.26 } },
      timeScale: { borderColor: palette.border, timeVisible: true, secondsVisible: false, rightOffset: 6 },
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

    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      linesRef.current = [];
    };
  }, [palette]);

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
    const fitKey = `${pair}:${interval}`;
    if (fittedRef.current !== fitKey) {
      chartRef.current?.timeScale().fitContent();
      fittedRef.current = fitKey;
    }
  }, [candles, signal, palette, pair, interval]);

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
