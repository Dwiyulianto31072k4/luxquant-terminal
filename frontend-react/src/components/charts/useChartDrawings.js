import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A small drawing layer for lightweight-charts.
 *
 * lightweight-charts renders; it ships no drawing tools at all. Rather than
 * reimplement TradingView's toolbox — hit-testing, handles, z-order, undo,
 * persistence — this covers the two things a trader actually reaches for while
 * judging a single call: measure a move, and mark a price.
 *
 * Everything lives in an SVG overlay positioned above the canvas. Drawings are
 * stored in chart space (time + price), never pixels, so they stay put through
 * pan and zoom; the overlay re-projects them whenever the visible range moves.
 *
 * Anything richer than this belongs in TradingView mode, which already has it.
 */

export const TOOLS = {
  CURSOR: "cursor",
  MEASURE: "measure",
  HLINE: "hline",
  TREND: "trend",
};

const uid = () => Math.random().toString(36).slice(2, 9);

export function useChartDrawings({ chartRef, seriesRef, hostRef, decimals = 5, epoch = 0 }) {
  const [tool, setTool] = useState(TOOLS.CURSOR);
  const [shapes, setShapes] = useState([]);
  const [draft, setDraft] = useState(null);
  // Bumped on every pan/zoom so the overlay re-projects; the shapes themselves
  // never change, only where they land on screen.
  const [, setTick] = useState(0);
  const startRef = useRef(null);

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
      return { time, price, x, y };
    },
    [chartRef, seriesRef, hostRef]
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
      if (tool === TOOLS.HLINE) {
        setShapes((s) => [...s, { id: uid(), type: TOOLS.HLINE, price: p.price }]);
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

  const fmt = useCallback((v) => Number(v).toFixed(decimals), [decimals]);

  return { tool, setTool, shapes, draft, clear, toPixel, fmt };
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
