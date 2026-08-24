import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A drawing layer for lightweight-charts, which renders and ships no tools.
 *
 * This used to cover only the two things needed to judge a single call —
 * measure a move, mark a price — and said outright that anything richer
 * belonged in TradingView mode. That call was reversed deliberately: people
 * work the PLAN chart because it is the one that carries the entry, targets and
 * stops, and sending them to another tab to draw a box on it is the friction
 * the PLAN chart exists to remove.
 *
 * What it still does NOT do, on purpose: selection handles, per-shape editing,
 * persistence across reloads. Those need hit-testing and a storage story, and a
 * half-built version of them is worse than none — a drawing you can almost drag
 * reads as broken.
 *
 * Everything lives in an SVG overlay above the canvas. Drawings are stored in
 * chart space (time + price), never pixels, so they survive pan and zoom; the
 * overlay re-projects whenever the visible range moves.
 */

export const TOOLS = {
  CURSOR: "cursor",
  MEASURE: "measure",
  HLINE: "hline",
  VLINE: "vline",
  TREND: "trend",
  RAY: "ray",
  RECT: "rect",
  FIB: "fib",
};

/** Tools that are placed with one click rather than a drag. */
const CLICK_TOOLS = new Set([TOOLS.HLINE, TOOLS.VLINE]);

/** Retracement levels, the set every charting package ships by default. */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

const uid = () => Math.random().toString(36).slice(2, 9);

export function useChartDrawings({
  chartRef,
  seriesRef,
  hostRef,
  decimals = 5,
  epoch = 0,
  candlesRef = null,
}) {
  const [tool, setTool] = useState(TOOLS.CURSOR);
  const [shapes, setShapes] = useState([]);
  const [draft, setDraft] = useState(null);
  const [magnet, setMagnet] = useState(true);
  // Bumped on every pan/zoom so the overlay re-projects; the shapes themselves
  // never change, only where they land on screen.
  const [, setTick] = useState(0);
  const startRef = useRef(null);
  const magnetRef = useRef(magnet);
  magnetRef.current = magnet;

  /**
   * Snap a price to the nearest open/high/low/close of the candle under the
   * pointer, when one is close enough to have been the intended target.
   * Measured in pixels, not price, so it behaves the same on a $70k coin and a
   * $0.00004 one.
   */
  const snapPrice = useCallback(
    (time, price, y) => {
      const series = seriesRef.current;
      const candles = candlesRef?.current;
      if (!magnetRef.current || !series || !candles?.length) return price;

      let bar = null;
      for (let i = candles.length - 1; i >= 0; i -= 1) {
        if (candles[i].time <= time) {
          bar = candles[i];
          break;
        }
      }
      if (!bar) return price;

      let best = null;
      for (const v of [bar.open, bar.high, bar.low, bar.close]) {
        const c = series.priceToCoordinate(v);
        if (c == null) continue;
        const d = Math.abs(c - y);
        if (d <= 8 && (best === null || d < best.d)) best = { d, v };
      }
      return best ? best.v : price;
    },
    [seriesRef, candlesRef]
  );

  /** Pixel → chart space. Returns null outside the plot. */
  const toChart = useCallback(
    (clientX, clientY) => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      const host = hostRef.current;
      if (!chart || !series || !host) return null;
      const box = host.getBoundingClientRect();
      const x = clientX - box.left;
      const y = clientY - box.top;
      const time = chart.timeScale().coordinateToTime(x);
      const price = series.coordinateToPrice(y);
      if (time == null || price == null) return null;
      const snapped = snapPrice(time, price, y);
      return { time, price: snapped, x, y: series.priceToCoordinate(snapped) ?? y };
    },
    [chartRef, seriesRef, hostRef, snapPrice]
  );

  /** Chart space → pixel. Time may fall outside the visible range. */
  const toPixel = useCallback(
    (pt) => {
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series || !pt) return null;
      const x = chart.timeScale().timeToCoordinate(pt.time);
      const y = series.priceToCoordinate(pt.price);
      if (x == null || y == null) return null;
      return { x, y };
    },
    [chartRef, seriesRef]
  );

  // Re-project on pan/zoom.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return undefined;
    const onRange = () => setTick((n) => n + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    return () => {
      try {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      } catch {
        /* chart already disposed */
      }
    };
    // Keyed on `epoch`, which the parent bumps once the chart exists. Without it
    // this effect ran while chartRef.current was still null, never subscribed,
    // and drawings stayed pinned to stale pixels through pan and zoom.
  }, [chartRef, epoch]);

  // Pointer handling. Attached to the host so it also covers the canvas.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || tool === TOOLS.CURSOR) return undefined;

    const onDown = (e) => {
      const p = toChart(e.clientX, e.clientY);
      if (!p) return;
      if (CLICK_TOOLS.has(tool)) {
        setShapes((s) => [
          ...s,
          tool === TOOLS.HLINE
            ? { id: uid(), type: TOOLS.HLINE, price: p.price }
            : { id: uid(), type: TOOLS.VLINE, time: p.time },
        ]);
        setTool(TOOLS.CURSOR);
        return;
      }
      startRef.current = p;
      setDraft({ type: tool, a: p, b: p });
    };
    const onMove = (e) => {
      if (!startRef.current) return;
      const p = toChart(e.clientX, e.clientY);
      if (!p) return;
      setDraft({ type: tool, a: startRef.current, b: p });
    };
    const onUp = () => {
      if (!startRef.current) return;
      setDraft((d) => {
        if (d && d.a && d.b) {
          const moved = Math.abs(d.a.x - d.b.x) > 4 || Math.abs(d.a.y - d.b.y) > 4;
          // A click with no drag is a mis-fire, not a zero-length drawing.
          if (moved) setShapes((s) => [...s, { id: uid(), ...d }]);
        }
        return null;
      });
      startRef.current = null;
      setTool(TOOLS.CURSOR);
    };

    host.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [tool, toChart, hostRef]);

  const clear = useCallback(() => {
    setShapes([]);
    setDraft(null);
    startRef.current = null;
  }, []);

  const undo = useCallback(() => {
    setShapes((s) => s.slice(0, -1));
  }, []);

  // Escape drops the armed tool, ⌘/Ctrl-Z takes back the last drawing. Both are
  // what the muscle memory expects, and Escape is the way out for anyone who
  // armed a tool by accident and cannot pan any more.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setTool(TOOLS.CURSOR);
        setDraft(null);
        startRef.current = null;
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const fmt = useCallback((v) => Number(v).toFixed(decimals), [decimals]);

  return {
    tool,
    setTool,
    shapes,
    draft,
    clear,
    undo,
    magnet,
    setMagnet,
    toPixel,
    fmt,
  };
}

/** Δ% and elapsed time between two chart-space points. */
export function measureStats(a, b) {
  if (!a || !b) return null;
  const pct = a.price ? ((b.price - a.price) / a.price) * 100 : 0;
  const secs = Math.abs(Number(b.time) - Number(a.time));
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const span = d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  return { pct, span, up: pct >= 0 };
}
