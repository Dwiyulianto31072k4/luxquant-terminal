// ════════════════════════════════════════════════════════════════
// Trade Replay — the terminal's flagship NEW view.
//
// Replays a signal's full price journey on real candles:
//   entry / TP1-4 / SL price lines · journey event markers (TP hits,
//   SL, market peak, pullback) · MAE/MFE stats · play/scrub animation.
//
// Data (ALL existing endpoints — no schema changes):
//   GET /api/v1/signals/?page=&page_size=&pair=&status=   → picker list
//   GET /api/v1/signals/{id}                              → entry/targets/stop
//   GET /api/v1/signals/journey/{id}                      → events + MAE/MFE stats
//   GET /api/v1/market/klines?symbol&interval&startTime&endTime → candles
//     (proxy extended additively with startTime/endTime + futures fallback)
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  CrosshairMode,
  LineStyle,
  createSeriesMarkers,
} from "lightweight-charts";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ── visual tokens (same language as aiArenaV6/PriceChart) ──────────
const C = {
  text: "#b8a89a",
  grid: "rgba(212, 168, 83, 0.04)",
  border: "rgba(212, 168, 83, 0.15)",
  gold: "#d4a853",
  up: "#4ade80",
  down: "#f87171",
  tp: "#56c996",
  sl: "#e07288",
  entry: "#d4a853",
  peak: "#f0d890",
  pullback: "#67e8f9",
};

const authHeaders = () => {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ── formatting helpers ─────────────────────────────────────────────
const fmtPrice = (val) => {
  const p = Number(val);
  if (Number.isNaN(p) || p <= 0) return "—";
  if (p < 0.0001) return p.toFixed(8);
  if (p < 0.01) return p.toFixed(6);
  if (p < 1) return p.toFixed(4);
  return p < 100 ? p.toFixed(4) : p.toFixed(2);
};
const fmtPct = (val, sign = true) => {
  if (val == null || Number.isNaN(Number(val))) return "—";
  const n = Number(val);
  return `${sign && n > 0 ? "+" : ""}${n.toFixed(2)}%`;
};
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

// pick the tightest Binance interval that keeps the window ≤ ~450 bars
const INTERVALS = [
  ["1m", 60], ["3m", 180], ["5m", 300], ["15m", 900], ["30m", 1800],
  ["1h", 3600], ["2h", 7200], ["4h", 14400], ["6h", 21600],
  ["12h", 43200], ["1d", 86400],
];
function pickInterval(durationSec) {
  for (const [name, sec] of INTERVALS) {
    if (durationSec / sec <= 450) return [name, sec];
  }
  return ["1d", 86400];
}

const EVENT_MARKER_STYLE = {
  entry: { color: C.entry, shape: "arrowUp", position: "belowBar" },
  tp1: { color: C.tp, shape: "circle", position: "aboveBar" },
  tp2: { color: C.tp, shape: "circle", position: "aboveBar" },
  tp3: { color: C.tp, shape: "circle", position: "aboveBar" },
  tp4: { color: C.tp, shape: "circle", position: "aboveBar" },
  sl: { color: C.sl, shape: "arrowDown", position: "aboveBar" },
  swing_high: { color: C.peak, shape: "circle", position: "aboveBar" },
  swing_low: { color: C.pullback, shape: "circle", position: "belowBar" },
};

const COLOR_TOKEN = {
  green: "text-positive", lime: "text-lime-400", amber: "text-amber-400",
  orange: "text-orange-400", cyan: "text-cyan-400", purple: "text-purple-400",
  red: "text-negative", gold: "text-gold-primary", gray: "text-gray-400",
};

const STATUS_BADGE = {
  open: "bg-white/[0.06] text-white/70 border-white/[0.1]",
  tp1: "bg-positive/10 text-positive border-positive/25",
  tp2: "bg-positive/10 text-positive border-positive/25",
  tp3: "bg-positive/10 text-positive border-positive/25",
  closed_win: "bg-positive/15 text-positive border-positive/30",
  tp4: "bg-positive/15 text-positive border-positive/30",
  closed_loss: "bg-negative/15 text-negative border-negative/30",
  sl: "bg-negative/15 text-negative border-negative/30",
};

// ════════════════════════════════════════════════════════════════
// Signal picker (left panel)
// ════════════════════════════════════════════════════════════════
function SignalPicker({ selectedId, onSelect }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [chip, setChip] = useState("all"); // all | closed_win | closed_loss | open
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const fetchList = useCallback(async (pageNum, query, status, append) => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(pageNum), page_size: "25" });
      if (query) p.set("pair", query);
      if (status !== "all") p.set("status", status);
      const r = await fetch(`${API_BASE}/api/v1/signals/?${p}`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`http ${r.status}`);
      const json = await r.json();
      setItems((prev) => (append ? [...prev, ...(json.items || [])] : json.items || []));
      setTotalPages(json.total_pages || 1);
    } catch {
      if (!append) setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // search debounce
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchList(1, q, chip, false);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [q, chip, fetchList]);

  const chips = [
    { id: "all", label: t("terminal.replay.all") },
    { id: "closed_win", label: t("terminal.replay.wins") },
    { id: "closed_loss", label: t("terminal.replay.losses") },
    { id: "open", label: t("terminal.replay.open") },
  ];

  return (
    <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] overflow-hidden flex flex-col">
      <div className="h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
      <div className="p-3 space-y-2.5 border-b border-white/[0.06]">
        <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-muted">
          {t("terminal.replay.pickSignal")}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("terminal.replay.searchPair")}
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[12px] text-white placeholder:text-text-muted/60 focus:outline-none focus:border-gold-primary/40 font-mono"
        />
        <div className="flex gap-1">
          {chips.map((c) => (
            <button
              key={c.id}
              onClick={() => setChip(c.id)}
              className={`flex-1 px-1.5 py-1 rounded-sm font-mono text-[9.5px] uppercase tracking-wider border transition-colors ${
                chip === c.id
                  ? "bg-gold-primary/15 text-gold-primary border-gold-primary/30"
                  : "bg-transparent text-text-muted border-white/[0.06] hover:text-white"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-h-[520px] lg:max-h-[calc(100vh-320px)]">
        {items.length === 0 && !loading && (
          <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {t("terminal.replay.noResults")}
          </div>
        )}
        {items.map((s) => {
          const st = (s.status || "open").toLowerCase();
          const active = s.signal_id === selectedId;
          return (
            <button
              key={s.signal_id}
              onClick={() => onSelect(s.signal_id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.04] text-left transition-colors ${
                active ? "bg-gold-primary/[0.07]" : "hover:bg-white/[0.03]"
              }`}
            >
              {active && (
                <span className="w-[2px] self-stretch rounded-full shrink-0" style={{ background: C.gold }} />
              )}
              <div className="min-w-0 flex-1">
                <div className={`text-[12px] font-mono truncate ${active ? "text-gold-primary" : "text-white/90"}`}>
                  {s.pair}
                </div>
                <div className="text-[9.5px] font-mono text-text-muted mt-0.5">
                  {fmtDate(s.created_at)}
                  {s.risk_level ? ` · ${String(s.risk_level).toUpperCase()}` : ""}
                </div>
              </div>
              <span
                className={`shrink-0 px-1.5 py-0.5 rounded-sm border font-mono text-[8.5px] uppercase tracking-wider ${
                  STATUS_BADGE[st] || STATUS_BADGE.open
                }`}
              >
                {st.replace("closed_", "")}
              </span>
            </button>
          );
        })}
        {loading && (
          <div className="py-4 flex justify-center">
            <div className="w-4 h-4 border border-gold-primary/25 border-t-gold-primary rounded-full animate-spin" />
          </div>
        )}
        {!loading && page < totalPages && items.length > 0 && (
          <button
            onClick={() => {
              const next = page + 1;
              setPage(next);
              fetchList(next, q, chip, true);
            }}
            className="w-full py-2.5 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-gold-primary transition-colors"
          >
            {t("terminal.replay.loadMore")} ↓
          </button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// KPI tile
// ════════════════════════════════════════════════════════════════
function Kpi({ label, value, sub, tone }) {
  return (
    <div className="relative rounded-lg bg-[#0c0a07] border border-white/[0.07] px-3.5 py-3 flex flex-col min-w-0">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/25 to-transparent" />
      <div className="text-[9px] tracking-[0.18em] font-mono uppercase text-white/40 truncate">{label}</div>
      <div className={`font-mono tabular-nums mt-1 leading-none text-lg lg:text-xl truncate ${tone || "text-white/95"}`}>
        {value}
      </div>
      {sub && <div className="text-[9px] tracking-[0.1em] font-mono uppercase mt-1.5 text-white/35 truncate">{sub}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════
export default function TradeReplayView() {
  const { t } = useTranslation();
  const { signalId } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [journey, setJourney] = useState(null); // full journey response OR {available:false,...}
  const [candles, setCandles] = useState(null); // [{time,open,high,low,close}] | null
  const [loading, setLoading] = useState(false);
  const [chartMode, setChartMode] = useState("candles"); // candles | events | none

  // replay state
  const [replayIdx, setReplayIdx] = useState(null); // null = full view
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);

  // chart plumbing
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const markersApiRef = useRef(null);
  const dataRef = useRef({ candles: [], markers: [] });
  const playTimerRef = useRef(null);

  const selectSignal = (id) => {
    setPlaying(false);
    setReplayIdx(null);
    navigate(`/terminal/replay/${id}`);
  };

  // ── data fetch on signalId ───────────────────────────────────
  useEffect(() => {
    if (!signalId) {
      setDetail(null); setJourney(null); setCandles(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setPlaying(false);
      setReplayIdx(null);
      setDetail(null); setJourney(null); setCandles(null);
      try {
        const h = authHeaders();
        const [dR, jR] = await Promise.allSettled([
          fetch(`${API_BASE}/api/v1/signals/${signalId}`, { headers: h }),
          fetch(`${API_BASE}/api/v1/signals/journey/${signalId}`, { headers: h }),
        ]);
        if (cancelled) return;

        let det = null;
        if (dR.status === "fulfilled" && dR.value.ok) det = await dR.value.json();
        setDetail(det);

        let jny = null;
        if (jR.status === "fulfilled" && jR.value.ok) jny = await jR.value.json();
        setJourney(jny);

        // candle window from journey coverage (fallback: detail.created_at → now)
        const pair = det?.pair || jny?.pair;
        if (pair) {
          let fromMs = jny?.coverage_from ? Date.parse(jny.coverage_from) : det?.created_at ? Date.parse(det.created_at) : null;
          let untilMs = jny?.coverage_until ? Date.parse(jny.coverage_until) : Date.now();
          if (fromMs && untilMs && untilMs > fromMs) {
            const dur = untilMs - fromMs;
            const pad = Math.max(dur * 0.12, 3600e3);
            fromMs -= pad;
            untilMs = Math.min(untilMs + pad, Date.now());
            const [interval] = pickInterval((untilMs - fromMs) / 1000);
            try {
              const kp = new URLSearchParams({
                symbol: pair.replace("/", ""),
                interval,
                limit: "500",
                startTime: String(Math.floor(fromMs)),
                endTime: String(Math.floor(untilMs)),
              });
              const kr = await fetch(`${API_BASE}/api/v1/market/klines?${kp}`);
              if (!cancelled && kr.ok) {
                const raw = await kr.json();
                if (Array.isArray(raw) && raw.length > 1) {
                  setCandles(
                    raw.map((k) => ({
                      time: Math.floor(k[0] / 1000),
                      open: +k[1], high: +k[2], low: +k[3], close: +k[4],
                    }))
                  );
                } else setCandles(null);
              } else if (!cancelled) setCandles(null);
            } catch {
              if (!cancelled) setCandles(null);
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [signalId]);

  const journeyOk = journey && journey.available !== false && Array.isArray(journey.events);

  // ── derived stats ────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!journeyOk) return null;
    const o = journey.outcome || {};
    const e = journey.entry_stats || {};
    const realized = o.realized_pct;
    const peak = o.peak_excursion_pct;
    const efficiency =
      realized != null && peak != null && Math.abs(peak) > 0.01
        ? Math.max(0, Math.min(100, (realized / peak) * 100))
        : null;
    return { o, e, realized, peak, efficiency };
  }, [journey, journeyOk]);

  // markers built from journey events (mapped to chart time)
  const eventMarkers = useMemo(() => {
    if (!journeyOk) return [];
    return journey.events
      .filter((ev) => ev.at && ev.price != null)
      .map((ev) => {
        const style = EVENT_MARKER_STYLE[ev.type] || { color: C.gold, shape: "circle", position: "aboveBar" };
        return {
          time: Math.floor(Date.parse(ev.at) / 1000),
          position: style.position,
          color: style.color,
          shape: style.shape,
          text: ev.label || ev.type.toUpperCase(),
          _price: ev.price,
        };
      })
      .sort((a, b) => a.time - b.time);
  }, [journey, journeyOk]);

  // snap marker times onto candle buckets so they always render
  const snappedMarkers = useMemo(() => {
    if (!candles || !candles.length) return eventMarkers;
    const times = candles.map((c) => c.time);
    const step = times.length > 1 ? times[1] - times[0] : 60;
    return eventMarkers
      .map((m) => {
        const snapped = times.find((tm) => m.time >= tm && m.time < tm + step);
        return snapped ? { ...m, time: snapped } : null;
      })
      .filter(Boolean);
  }, [eventMarkers, candles]);

  // ── chart lifecycle ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: "solid", color: "rgba(0,0,0,0)" },
        textColor: C.text,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
      },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.gold, width: 1, style: LineStyle.Dashed, labelBackgroundColor: C.gold },
        horzLine: { color: C.gold, width: 1, style: LineStyle.Dashed, labelBackgroundColor: C.gold },
      },
      rightPriceScale: { borderColor: C.border, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderColor: C.border, timeVisible: true, secondsVisible: false, rightOffset: 4 },
    });
    chartRef.current = chart;
    return () => {
      try { chart.remove(); } catch { /* noop */ }
      chartRef.current = null;
      seriesRef.current = null;
      markersApiRef.current = null;
    };
  }, []);

  // ── data → chart sync ────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // reset previous series
    if (seriesRef.current) {
      try { chart.removeSeries(seriesRef.current); } catch { /* noop */ }
      seriesRef.current = null;
      markersApiRef.current = null;
    }

    let series = null;
    let seriesData = [];
    let markers = [];

    if (candles && candles.length > 1) {
      setChartMode("candles");
      series = chart.addSeries(CandlestickSeries, {
        upColor: C.up, downColor: C.down, borderVisible: false,
        wickUpColor: C.up, wickDownColor: C.down,
        priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
      });
      seriesData = candles;
      markers = snappedMarkers;
    } else if (journeyOk && eventMarkers.length > 1) {
      setChartMode("events");
      series = chart.addSeries(LineSeries, {
        color: C.gold, lineWidth: 2,
        crosshairMarkerVisible: true, crosshairMarkerRadius: 3,
        priceFormat: { type: "price", precision: 6, minMove: 0.000001 },
      });
      // dedupe times (line series requires strictly ascending)
      const seen = new Set();
      seriesData = eventMarkers
        .filter((m) => (seen.has(m.time) ? false : (seen.add(m.time), true)))
        .map((m) => ({ time: m.time, value: m._price }));
      markers = eventMarkers;
    } else {
      setChartMode("none");
      return;
    }

    series.setData(seriesData);
    seriesRef.current = series;
    dataRef.current = { candles: seriesData, markers };

    // markers
    try {
      markersApiRef.current = createSeriesMarkers(series, markers);
    } catch { /* older lib — skip markers */ }

    // price lines: entry / TP1-4 / SL
    const entry = Number(detail?.entry);
    const lines = [];
    if (entry > 0) {
      lines.push({ price: entry, color: C.entry, lineStyle: LineStyle.Solid, lineWidth: 2, axisLabelVisible: true, title: t("terminal.replay.entry").toUpperCase() });
      [detail?.target1, detail?.target2, detail?.target3, detail?.target4].forEach((tp, i) => {
        const v = Number(tp);
        if (v > 0) {
          const pct = ((v - entry) / entry) * 100;
          lines.push({
            price: v, color: C.tp, lineStyle: LineStyle.Dashed, lineWidth: 1,
            axisLabelVisible: true, title: `TP${i + 1} ${fmtPct(pct)}`,
          });
        }
      });
      const sl = Number(detail?.stop1);
      if (sl > 0) {
        const pct = ((sl - entry) / entry) * 100;
        lines.push({
          price: sl, color: C.sl, lineStyle: LineStyle.Solid, lineWidth: 1,
          axisLabelVisible: true, title: `SL ${fmtPct(pct)}`,
        });
      }
    }
    lines.forEach((opts) => { try { series.createPriceLine(opts); } catch { /* noop */ } });

    chart.timeScale().fitContent();
    setReplayIdx(null);
    setPlaying(false);
  }, [candles, snappedMarkers, eventMarkers, journeyOk, detail, t]);

  // ── replay engine ────────────────────────────────────────────
  const applyReplay = useCallback((idx) => {
    const series = seriesRef.current;
    const { candles: all, markers } = dataRef.current;
    if (!series || !all.length) return;
    const clamped = Math.max(1, Math.min(idx, all.length - 1));
    series.setData(all.slice(0, clamped + 1));
    const cutoff = all[clamped].time;
    try { markersApiRef.current?.setMarkers(markers.filter((m) => m.time <= cutoff)); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    clearInterval(playTimerRef.current);
    if (!playing) return;
    playTimerRef.current = setInterval(() => {
      setReplayIdx((prev) => {
        const total = dataRef.current.candles.length;
        const next = (prev == null ? 1 : prev) + speed;
        if (next >= total - 1) {
          setPlaying(false);
          return total - 1;
        }
        return next;
      });
    }, 90);
    return () => clearInterval(playTimerRef.current);
  }, [playing, speed]);

  useEffect(() => {
    if (replayIdx == null) return;
    applyReplay(replayIdx);
  }, [replayIdx, applyReplay]);

  const resetReplay = () => {
    setPlaying(false);
    setReplayIdx(null);
    const series = seriesRef.current;
    const { candles: all, markers } = dataRef.current;
    if (series && all.length) {
      series.setData(all);
      try { markersApiRef.current?.setMarkers(markers); } catch { /* noop */ }
      chartRef.current?.timeScale().fitContent();
    }
  };

  // derive from state (not dataRef) so the slider max is never stale
  const totalBars =
    chartMode === "candles"
      ? candles?.length || 0
      : chartMode === "events"
        ? eventMarkers.length
        : 0;
  const [showAllEvents, setShowAllEvents] = useState(false);
  const events = journeyOk ? journey.events : [];
  const shownEvents = showAllEvents ? events : events.slice(0, 12);

  const st = (detail?.status || "open").toLowerCase();

  // ════════════════════════════════════════════════════════════
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-4 items-start">
      <SignalPicker selectedId={signalId} onSelect={selectSignal} />

      <div className="min-w-0 space-y-4">
        {/* ── empty state ── */}
        {!signalId && (
          <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] py-20 px-6 text-center">
            <div className="flex items-center justify-center gap-3 mb-5">
              <span className="h-px w-8 bg-gold-primary/40" />
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
                {t("terminal.replay.title")}
              </span>
              <span className="h-px w-8 bg-gold-primary/40" />
            </div>
            <h2 className="text-xl text-white mb-2 tracking-tight">{t("terminal.replay.emptyTitle")}</h2>
            <p className="text-[12px] text-text-muted max-w-md mx-auto leading-relaxed">
              {t("terminal.replay.emptyBody")}
            </p>
          </div>
        )}

        {signalId && !loading && (
          <>
            {/* ── header ── */}
            <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-lg text-white tracking-tight">{detail?.pair || journey?.pair || "—"}</span>
                  <span className={`px-2 py-0.5 rounded-sm border font-mono text-[9px] uppercase tracking-wider ${STATUS_BADGE[st] || STATUS_BADGE.open}`}>
                    {st.replace("closed_", "")}
                  </span>
                  {journeyOk && journey.direction && (
                    <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted border border-white/[0.08] rounded-sm px-1.5 py-0.5">
                      {journey.direction}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[9.5px] uppercase tracking-wider text-text-muted ml-auto">
                  <span>{t("terminal.replay.calledAt")} · <span className="text-white/70">{fmtDate(detail?.created_at)}</span></span>
                  {detail?.risk_level && (
                    <span>{t("terminal.replay.riskLabel")} · <span className="text-white/70">{String(detail.risk_level).toUpperCase()}</span></span>
                  )}
                  {journeyOk && (
                    <>
                      <span>{t("terminal.replay.duration")} · <span className="text-white/70">{journey.duration_human}</span></span>
                      <span>{t("terminal.replay.dataSource")} · <span className="text-white/70">{journey.data_source}</span></span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ── journey unavailable notices ── */}
            {journey && journey.available === false && (
              <div className="rounded-lg border border-warning/25 bg-warning/[0.06] px-4 py-3 font-mono text-[11px] text-warning">
                {journey.reason === "requires_subscription"
                  ? t("terminal.replay.requiresSub")
                  : t("terminal.replay.journeyUnavailable")}
              </div>
            )}

          </>
        )}

        {/* ── chart card — container stays MOUNTED at all times so the
               lightweight-charts instance (created once) survives loading
               and signal switches; visibility is CSS-only. ── */}
        <div
          className={`rounded-lg bg-[#0c0a07] border border-white/[0.07] p-3 relative ${
            signalId && (loading || chartMode !== "none") ? "block" : "hidden"
          }`}
        >
          {!loading && chartMode === "events" && (
            <div className="mb-2 font-mono text-[9.5px] uppercase tracking-wider text-warning/80">
              ⚠ {t("terminal.replay.chartUnavailable")}
            </div>
          )}
          <div
            ref={containerRef}
            className="w-full overflow-hidden rounded-md"
            style={{ height: "clamp(340px, 48vh, 560px)" }}
          />
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#0c0a07]/80 backdrop-blur-sm rounded-lg">
              <div className="w-6 h-6 border border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {t("terminal.replay.loading")}
              </span>
            </div>
          )}

          {/* replay controls */}
                {totalBars > 2 && (
                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => {
                        if (playing) { setPlaying(false); return; }
                        if (replayIdx == null || replayIdx >= totalBars - 1) setReplayIdx(1);
                        setPlaying(true);
                      }}
                      className="px-4 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider bg-gold-primary/15 text-gold-primary border border-gold-primary/30 hover:bg-gold-primary/25 transition-colors"
                    >
                      {playing ? `❚❚ ${t("terminal.replay.pause")}` : `▶ ${t("terminal.replay.play")}`}
                    </button>
                    <input
                      type="range"
                      min={1}
                      max={Math.max(totalBars - 1, 1)}
                      value={replayIdx == null ? totalBars - 1 : replayIdx}
                      onChange={(e) => { setPlaying(false); setReplayIdx(Number(e.target.value)); }}
                      className="flex-1 min-w-[140px] accent-[#d4a853] h-1"
                    />
                    <div className="flex gap-1">
                      {[1, 2, 4].map((s) => (
                        <button
                          key={s}
                          onClick={() => setSpeed(s)}
                          className={`px-2 py-1 rounded-sm font-mono text-[9px] border transition-colors ${
                            speed === s
                              ? "bg-white/10 text-white border-white/[0.15]"
                              : "text-text-muted border-white/[0.06] hover:text-white"
                          }`}
                        >
                          {s}×
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={resetReplay}
                      className="px-2.5 py-1 rounded-sm font-mono text-[9px] uppercase tracking-wider text-text-muted border border-white/[0.06] hover:text-white transition-colors"
                    >
                      ⟲
                    </button>
            </div>
          )}
        </div>

        {signalId && !loading && (
          <>
            {/* ── stats ── */}
            {stats && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
                  <Kpi
                    label={t("terminal.replay.realized")}
                    value={fmtPct(stats.realized)}
                    sub={stats.o.realized_via ? `${t("terminal.replay.realizedVia")} ${stats.o.realized_via}` : undefined}
                    tone={stats.realized > 0 ? "text-positive" : stats.realized < 0 ? "text-negative" : undefined}
                  />
                  <Kpi
                    label={t("terminal.replay.peak")}
                    value={fmtPct(stats.peak)}
                    sub={stats.o.peak_excursion_delta_text || undefined}
                    tone="text-gold-primary"
                  />
                  <Kpi
                    label={t("terminal.replay.efficiency")}
                    value={stats.efficiency != null ? `${stats.efficiency.toFixed(0)}%` : "—"}
                    sub={t("terminal.replay.efficiency_hint")}
                  />
                  <Kpi
                    label={t("terminal.replay.maxHeat")}
                    value={fmtPct(stats.o.worst_drawdown_pct)}
                    sub={stats.o.worst_drawdown_context || t("terminal.replay.maxHeat_hint")}
                    tone="text-negative"
                  />
                  <Kpi
                    label={t("terminal.replay.timeToTp1")}
                    value={stats.e.time_to_tp1_human || "—"}
                  />
                  <Kpi
                    label={t("terminal.replay.timeAboveEntry")}
                    value={stats.o.pct_time_above_entry != null ? `${Number(stats.o.pct_time_above_entry).toFixed(0)}%` : "—"}
                  />
                </div>

                {/* fakeout warning */}
                {stats.o.tp_then_sl && (
                  <div className="rounded-lg border border-negative/25 bg-negative/[0.06] px-4 py-3 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-negative">
                      ⚠ {t("terminal.replay.fakeout")}
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {t("terminal.replay.fakeout_hint")}
                      {stats.o.tps_hit_before_sl?.length
                        ? ` — ${t("terminal.replay.tpsBeforeSl")}: ${stats.o.tps_hit_before_sl.join(", ").toUpperCase()}`
                        : ""}
                    </span>
                  </div>
                )}

                {/* outcome summary */}
                {stats.o.summary_sentence && (
                  <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] px-4 py-3.5">
                    <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-gold-primary/75 mb-1.5">
                      {t("terminal.replay.outcomeTitle")}
                    </div>
                    <p className="text-[13px] leading-relaxed text-white/80">{stats.o.summary_sentence}</p>
                  </div>
                )}

                {/* timeline */}
                {events.length > 0 && (
                  <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-muted">
                        {t("terminal.replay.timeline")}
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[8.5px] uppercase tracking-wider text-text-muted/70">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-positive" /> {t("terminal.replay.confirmed")}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full border border-white/40" /> {t("terminal.replay.detected")}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      {shownEvents.map((ev, i) => {
                        const tone = COLOR_TOKEN[ev.color_token] || COLOR_TOKEN.gray;
                        return (
                          <div
                            key={`${ev.type}-${i}`}
                            className={`flex items-center gap-3 px-2.5 py-2 rounded-md ${
                              ev.is_highlighted ? "bg-white/[0.03]" : ""
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                ev.confirmed ? "" : "border bg-transparent"
                              }`}
                              style={{
                                background: ev.confirmed ? "currentColor" : "transparent",
                                borderColor: "currentColor",
                                color: "inherit",
                              }}
                            />
                            <span className={`font-mono text-[11px] w-24 shrink-0 ${tone}`}>{ev.label}</span>
                            <span className="font-mono text-[10.5px] text-white/70 tabular-nums w-24 shrink-0">
                              {fmtPrice(ev.price)}
                            </span>
                            <span className={`font-mono text-[10.5px] tabular-nums w-16 shrink-0 ${
                              ev.pct > 0 ? "text-positive" : ev.pct < 0 ? "text-negative" : "text-text-muted"
                            }`}>
                              {fmtPct(ev.pct)}
                            </span>
                            <span className="text-[10px] text-text-muted truncate hidden sm:block flex-1">
                              {ev.context}
                            </span>
                            <span className="font-mono text-[9.5px] text-text-muted/80 shrink-0">{ev.time_main}</span>
                          </div>
                        );
                      })}
                    </div>
                    {events.length > 12 && (
                      <button
                        onClick={() => setShowAllEvents((v) => !v)}
                        className="mt-2 font-mono text-[9.5px] uppercase tracking-wider text-gold-primary/80 hover:text-gold-primary transition-colors"
                      >
                        {showAllEvents
                          ? t("terminal.replay.showLess")
                          : `${t("terminal.replay.showAll")} (${events.length})`}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
