// src/components/landing/v2/sections/Performance.jsx
// ════════════════════════════════════════════════════════════════
// Performance — "An edge you can audit." (all real, public data)
//
//   /signals/analyze                  → all-time stats + outcome mix
//   /analytics/edge-lab               → pattern Expected Value, coins
//   /analytics/wr-vs-btc              → daily win rate + BTC OHLC
//   /signals/journey-insights/BTCUSDT → time to each TP (BTC flagship)
//
// Palette: LuxQuant gold = primary/performance · red = loss · BTC = orange.
// ════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import CoinLogo from "../../../CoinLogo";
import DayDrillModal from "./DayDrillModal";

const C = {
  gold: "#e7c373",
  goldL: "#f0d890",
  gold2: "#d4a853",
  gold3: "#b8893c",
  gold4: "#8b6914",
  loss: "#f87171",
  win: "#4ade80",
  btc: "#f7931a",
  amber: "#fbbf24",
  muted: "#8a8f9c",
};
const REL = { reliable: C.gold, moderate: C.amber, unreliable: C.loss };
const RANGES = [
  { id: "30D", days: 30 },
  { id: "90D", days: 90 },
  { id: "1Y", days: 365 },
  { id: "ALL", days: Infinity },
];
// Real BTC market regimes (verified) — used as one-click chart filters.
// cat: bull (gold) · bear (red) · event (orange black-swan).
const EVENTS = [
  { id: "etf", label: "ETF Run-Up", cat: "bull", start: "2023-12-27", end: "2024-03-14", note: "Spot BTC ETF approval rally into the first 2024 ATH (~$73k)." },
  { id: "yen", label: "Yen-Carry Crash", cat: "event", start: "2024-07-25", end: "2024-08-20", note: "BoJ hike triggered a global carry unwind — BTC -20% to ~$49k in a day." },
  { id: "election", label: "Election Bull", cat: "bull", start: "2024-11-05", end: "2025-01-20", note: "Trump win → first $100k BTC, peak near the Jan inauguration." },
  { id: "tariffQ1", label: "Tariff Shock '25", cat: "bear", start: "2025-02-15", end: "2025-04-10", note: "Bybit $1.5B hack + 'Liberation Day' tariffs — BTC bottomed ~$74k." },
  { id: "meltup", label: "Melt-Up to ATH", cat: "bull", start: "2025-04-10", end: "2025-10-06", note: "Recovery rally to the cycle ATH ~$126k (Oct 6, 2025)." },
  { id: "crash1010", label: "10.10 Crash", cat: "event", start: "2025-10-01", end: "2025-10-31", note: "Trump 100% China tariff → record ~$19B liquidations in a single day." },
  { id: "postath", label: "Post-ATH Bear", cat: "bear", start: "2025-10-06", end: "2026-02-28", note: "~50% drawdown from the ATH into early 2026." },
  { id: "bearcycle", label: "Bear Market (2025→now)", cat: "bear", start: "2025-10-06", end: "2099-12-31", ongoing: true, note: "BTC topped at ~$126,198 on Oct 6, 2025 — the cycle's ongoing bear market since. Does the edge survive it?" },
  { id: "iran", label: "Israel–Iran War", cat: "event", start: "2026-02-28", end: "2026-04-07", note: "Mideast strikes spiked volatility; relief rally on the Apr 7 ceasefire." },
];
const EV_COLOR = { bull: C.gold, bear: C.loss, event: C.btc };
// compact tab selector for the deep-analytics block
const ANA_TABS = [
  { id: "wrbtc", label: "WR × BTC" },
  { id: "patterns", label: "Patterns" },
  { id: "timing", label: "Timing" },
  { id: "coins", label: "Coins" },
];

// Per-card explainer: what it is + how to read it (shown via the "i" tooltip).
const INFO = {
  winRate: {
    title: "Win Rate",
    lines: [
      "Share of resolved signals that reached at least TP1 (take-profit) before hitting SL (stop-loss).",
      "How to read: the gold arc = wins, the dim arc = stop-outs. Based on every closed trade on record.",
    ],
  },
  outcome: {
    title: "Where Winners Exit",
    lines: [
      "How closed trades split across the four take-profits (TP1–TP4) and the stop-loss (SL).",
      "Avg P/L = the actual gain at TP1–TP3, the peak gain at TP4 (it usually breaks through), and the loss for SL.",
      "How to read: bigger TP3/TP4 slices mean winners ran further. SL (red) is the only losing bucket.",
    ],
  },
  wrBtc: {
    title: "Win Rate × Bitcoin",
    lines: [
      "Gold line = daily win rate (left axis). Candles = Bitcoin price that day (right axis).",
      "How to read: if the gold line stays high while BTC candles fall, the edge holds in bear markets.",
      "Filter by a market period or custom dates — and click any day to reveal that day's winning calls.",
    ],
  },
  patterns: {
    title: "Highest-Edge Patterns",
    lines: [
      "Expected value (EV) = average % gain per trade for each setup over the last 90 days.",
      "How to read: bar length = EV, the right number = that setup's win rate, n = sample size.",
    ],
  },
  timing: {
    title: "Time to Target",
    lines: [
      "Average time from entry until each take-profit is hit, across every call we've made.",
      "How to read: shorter bars = targets reached faster. 'fastest' is the single quickest call.",
    ],
  },
  coins: {
    title: "Top Coins We Called",
    lines: [
      "Coins ranked by their median peak gain after our call (last 90 days).",
      "How to read: % = median peak move, WR = per-coin win rate, n = number of calls.",
    ],
  },
};

const nfmt = (v) => (v ?? 0).toLocaleString();
const pct = (v) => `${(v ?? 0).toFixed(1)}%`;
const signed = (v) => `${v >= 0 ? "+" : ""}${(v ?? 0).toFixed(1)}%`;
const bigPct = (v) => {
  const n = v ?? 0;
  if (n >= 1000) return `+${(n / 1000).toFixed(1)}K%`;
  if (n >= 100) return `+${Math.round(n)}%`;
  return `+${n.toFixed(1)}%`;
};
const sym = (p) => (p || "").replace(/USDT$/i, "");
const niceName = (p) => (p || "").replace(/_/g, " ");

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const d = Math.sqrt(dx * dy);
  return d === 0 ? null : num / d;
}

function Card({ className = "", children }) {
  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-surface-raised p-5 transition-all duration-300 hover:border-line/25 hover:shadow-[0_14px_34px_rgba(0,0,0,0.5)] ${className}`}>
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
      {children}
    </div>
  );
}

/** Period filter popover — mobile-safe (never clips off the left edge). */
function PeriodFilterPopover({
  filterOpen,
  setFilterOpen,
  eventId,
  setEventId,
  customOn,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  activeEvent,
  EVENTS,
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setFilterOpen((o) => !o)}
        className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] transition-colors sm:w-auto ${
          eventId || customOn
            ? "border-gold-primary/50 text-text-primary"
            : "border-white/10 text-text-muted hover:border-white/25 hover:text-text-primary"
        }`}
      >
        <span className="max-w-[140px] truncate sm:max-w-[110px]">
          {activeEvent ? activeEvent.label : customOn ? "Custom range" : "Period"}
        </span>
        <svg className="h-3 w-3 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {filterOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFilterOpen(false)} aria-hidden="true" />
          {/* Fixed on mobile so Card overflow + right-0 never shove the panel off-screen.
              Desktop: anchor under the button. */}
          <div
            className="fixed left-1/2 top-[18%] z-50 w-[min(300px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-white/12 bg-surface-secondary p-3 text-left shadow-[0_20px_50px_rgba(0,0,0,0.7)] sm:absolute sm:left-auto sm:right-0 sm:top-9 sm:w-[280px] sm:translate-x-0"
            role="dialog"
            aria-label="Market period filter"
          >
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">Market period</p>
            <div className="relative">
              <select
                value={customOn ? "" : eventId || ""}
                onChange={(e) => {
                  setEventId(e.target.value || null);
                  setCustomStart("");
                  setCustomEnd("");
                }}
                className="w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-3 pr-8 font-mono text-[11px] text-text-primary outline-none transition-colors hover:border-white/20 focus:border-gold-primary/50"
              >
                <option value="" className="bg-surface-secondary">All / none</option>
                <optgroup label="Bull" className="bg-surface-secondary">
                  {EVENTS.filter((e) => e.cat === "bull").map((e) => (
                    <option key={e.id} value={e.id} className="bg-surface-secondary">{e.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Bear" className="bg-surface-secondary">
                  {EVENTS.filter((e) => e.cat === "bear").map((e) => (
                    <option key={e.id} value={e.id} className="bg-surface-secondary">{e.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Black-swan event" className="bg-surface-secondary">
                  {EVENTS.filter((e) => e.cat === "event").map((e) => (
                    <option key={e.id} value={e.id} className="bg-surface-secondary">{e.label}</option>
                  ))}
                </optgroup>
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
            </div>

            <div className="my-2.5 flex items-center gap-2">
              <span className="h-px flex-1 bg-white/10" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-text-primary/30">or custom dates</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-1.5 sm:rounded-lg sm:border sm:border-white/10 sm:bg-white/[0.03] sm:px-2 sm:py-1.5">
              <label className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 sm:flex-1 sm:border-0 sm:bg-transparent sm:p-0">
                <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted sm:hidden">From</span>
                <input
                  type="date"
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={(e) => {
                    setCustomStart(e.target.value);
                    setEventId(null);
                  }}
                  className="min-w-0 w-full bg-transparent font-mono text-[12px] text-text-primary outline-none [color-scheme:dark] sm:text-[11px]"
                />
              </label>
              <span className="hidden font-mono text-[10px] text-text-muted sm:inline">→</span>
              <label className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 sm:flex-1 sm:border-0 sm:bg-transparent sm:p-0">
                <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted sm:hidden">To</span>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(e) => {
                    setCustomEnd(e.target.value);
                    setEventId(null);
                  }}
                  className="min-w-0 w-full bg-transparent font-mono text-[12px] text-text-primary outline-none [color-scheme:dark] sm:text-[11px]"
                />
              </label>
            </div>

            <div className="mt-2.5 flex gap-2">
              {(eventId || customOn) && (
                <button
                  type="button"
                  onClick={() => {
                    setEventId(null);
                    setCustomStart("");
                    setCustomEnd("");
                  }}
                  className="flex-1 rounded-lg border border-white/10 px-2 py-1.5 font-mono text-[10px] text-text-muted transition-colors hover:border-white/25 hover:text-text-primary"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="flex-1 rounded-lg border border-gold-primary/40 bg-gold-primary/15 px-2 py-1.5 font-mono text-[10px] text-gold-primary transition-colors hover:bg-gold-primary/25"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
// Small "i" affordance that reveals a what-is-this / how-to-read tooltip.
function InfoTip({ info }) {
  const [open, setOpen] = useState(false);
  if (!info) return null;
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`What is ${info.title}?`}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="flex h-[15px] w-[15px] items-center justify-center rounded-full border border-white/25 font-mono text-[9px] font-bold leading-none text-text-muted transition-colors hover:border-gold-primary/70 hover:text-gold-primary"
      >
        i
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-40 w-64 rounded-xl border border-white/15 bg-surface-secondary/[0.98] p-3 text-left shadow-[0_16px_40px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <p className="mb-1.5 text-[11px] font-semibold text-text-primary">{info.title}</p>
          {info.lines.map((ln, i) => (
            <p key={i} className="mb-1.5 text-[11px] leading-snug text-text-primary/60 last:mb-0">{ln}</p>
          ))}
        </div>
      )}
    </span>
  );
}

function CardHead({ title, sub, right, info }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 className="flex items-center gap-1.5 text-[15px] font-semibold text-text-primary">
          {title}
          <InfoTip info={info} />
        </h3>
        {sub && <p className="mt-0.5 font-mono text-[11px] text-text-muted">{sub}</p>}
      </div>
      {right && (
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          {right}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex h-full min-h-[140px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10" style={{ borderTopColor: C.gold }} />
    </div>
  );
}
// Glossy 3D-style progress bar (MEXC-ish): inset track + cylinder-shaded gold
// fill with top sheen, bottom shadow and a soft glow.
function Bar3D({ pct, className = "h-2.5" }) {
  return (
    <div
      className={`relative flex-1 overflow-hidden rounded-full bg-black/40 ${className}`}
      style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.55)" }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.max(pct || 0, 3)}%`,
          background: "linear-gradient(180deg, #f6e0a0 0%, #e7c373 34%, #cba24f 68%, #a8842f 100%)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -2px 3px rgba(90,60,15,0.4), 0 0 8px rgba(212,168,83,0.4)",
        }}
      />
    </div>
  );
}
// candlestick drawn into a recharts range-Bar ([low, high]); body = open→close
function Candle({ x, y, width, height, payload }) {
  const { o, h, l, c } = payload || {};
  if (o == null || h == null || l == null || c == null || !height) return null;
  const span = h - l || 1;
  const pxPer = height / span;
  const up = c >= o;
  const color = up ? "#34d399" : "#f87171";
  const cx = x + width / 2;
  const bodyTop = y + (h - Math.max(o, c)) * pxPer;
  const bodyH = Math.max(Math.abs(c - o) * pxPer, 1);
  const bw = Math.max(Math.min(width * 0.7, 7), 1.2);
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} opacity={0.8} />
      <rect x={cx - bw / 2} y={bodyTop} width={bw} height={bodyH} rx={0.5} fill={color} opacity={0.95} />
    </g>
  );
}

// Small icon for the side tab-rail (Allium-style boxy menu).
function TabIcon({ id, className = "h-4 w-4" }) {
  const p = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  if (id === "wrbtc") return (<svg {...p}><path d="M3 16l5-5 3 2 4-6 4 3" /><path d="M3 21h18" opacity="0.4" /></svg>);
  if (id === "patterns") return (<svg {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.2" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.2" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.2" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.2" /></svg>);
  if (id === "timing") return (<svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></svg>);
  if (id === "coins") return (<svg {...p}><ellipse cx="12" cy="6.5" rx="7.5" ry="3" /><path d="M4.5 6.5v5c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-5" /><path d="M4.5 11.5v5c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-5" /></svg>);
  return null;
}

function Seg({ items, value, onChange }) {
  return (
    <div className="flex rounded-lg border border-white/10 p-0.5 font-mono text-[10px]">
      {items.map((it) => (
        <button
          key={it}
          onClick={() => onChange(it)}
          className={`rounded-md px-2.5 py-1 transition-colors ${value === it ? "text-surface" : "text-text-muted hover:text-text-primary"}`}
          style={value === it ? { background: C.gold } : {}}
        >
          {it}
        </button>
      ))}
    </div>
  );
}

export default function Performance({ data }) {
  const navigate = useNavigate();
  const [edge, setEdge] = useState(null);
  const [wrbtc, setWrbtc] = useState(null);
  const [timing, setTiming] = useState(null);
  const [rangeId, setRangeId] = useState("90D");
  const [eventId, setEventId] = useState(null);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [anaTab, setAnaTab] = useState("wrbtc");
  const [showBtc, setShowBtc] = useState(true);
  const [drillDate, setDrillDate] = useState(null);
  const [drillData, setDrillData] = useState(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const customOn = !!(customStart && customEnd);
  const activeEvent = !customOn ? EVENTS.find((e) => e.id === eventId) || null : null;
  const stats = data?.stats;

  // Click a day on the WR×BTC chart → load that day's calls (winners first).
  const openDay = (date) => {
    if (!date) return;
    setDrillDate(date);
    setDrillData(null);
    setDrillLoading(true);
    fetch(`/api/v1/analytics/edge-lab/drill?dimension=created_day&key=${date}&days=90&limit=80`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { setDrillData(j); setDrillLoading(false); })
      .catch(() => setDrillLoading(false));
  };
  const closeDay = () => { setDrillDate(null); setDrillData(null); };

  useEffect(() => {
    let alive = true;
    const grab = (url, set) =>
      fetch(url).then((r) => (r.ok ? r.json() : null)).then((j) => alive && j && set(j)).catch(() => {});
    grab("/api/v1/analytics/edge-lab?days=90&sector=all", setEdge);
    grab("/api/v1/analytics/wr-vs-btc?range=all", setWrbtc);
    grab("/api/v1/signals/journey-insights/ALL", setTiming); // aggregate: all pairs
    return () => { alive = false; };
  }, []);

  const headline = [
    { label: "Win Rate", value: stats ? pct(stats.win_rate) : "—", accent: true },
    { label: "Signals Resolved", value: stats ? nfmt(stats.closed_trades) : "—" },
    { label: "Winners", value: stats ? nfmt(stats.total_winners) : "—" },
    { label: "Pairs Traded", value: stats ? nfmt(stats.active_pairs) : "—" },
  ];

  const winRate = stats?.win_rate ?? 0;
  const wrDonut = [{ name: "win", value: winRate }, { name: "loss", value: Math.max(100 - winRate, 0) }];

  // avg realized P/L per bucket (from the all-pairs journey aggregate)
  const pnlMap = {};
  (timing?.hit_rate_per_tp || []).forEach((h) => { pnlMap[h.tp] = h.avg_exit_gain_pct; });
  const outcome = stats
    ? [
        { label: "TP1", count: stats.tp1_count, color: C.goldL, avg: pnlMap.TP1 },
        { label: "TP2", count: stats.tp2_count, color: C.gold, avg: pnlMap.TP2 },
        { label: "TP3", count: stats.tp3_count, color: C.gold2, avg: pnlMap.TP3 },
        { label: "TP4", count: stats.tp4_count, color: C.gold3, avg: pnlMap.TP4 },
        { label: "SL", count: stats.sl_count, color: C.loss, avg: pnlMap.SL },
      ]
    : [];
  const outcomeTotal = outcome.reduce((s, i) => s + (i.count || 0), 0);

  // ── WR × BTC, range-filtered ──
  const fullSeries = (wrbtc?.series || []).filter((r) => r.win_rate != null);
  const { trendData, wrAvg, corr, upWR, downWR, btcDelta, btcMin, btcMax } = useMemo(() => {
    const ev = EVENTS.find((e) => e.id === eventId);
    let rows;
    if (customStart && customEnd) {
      const a = customStart < customEnd ? customStart : customEnd;
      const b = customStart < customEnd ? customEnd : customStart;
      rows = fullSeries.filter((r) => {
        const d = (r.date || "").slice(0, 10);
        return d >= a && d <= b;
      });
    } else if (ev) {
      rows = fullSeries.filter((r) => {
        const d = (r.date || "").slice(0, 10);
        return d >= ev.start && d <= ev.end;
      });
    } else {
      const days = RANGES.find((r) => r.id === rangeId)?.days ?? 90;
      rows = days === Infinity ? fullSeries : fullSeries.slice(-days);
    }
    const td = rows.map((r) => ({
      label: new Date(r.date).toLocaleDateString("en", { month: "short", year: "2-digit" }),
      date: r.date,
      wr: r.win_rate,
      o: r.btc_open,
      h: r.btc_high,
      l: r.btc_low,
      c: r.btc_close,
      range: [r.btc_low, r.btc_high],
      chg: r.btc_open ? ((r.btc_close - r.btc_open) / r.btc_open) * 100 : null,
      closed: r.total_closed,
    }));
    const lows = rows.map((r) => r.btc_low).filter((v) => v != null);
    const highs = rows.map((r) => r.btc_high).filter((v) => v != null);
    const lo = lows.length ? Math.min(...lows) : 0;
    const hi = highs.length ? Math.max(...highs) : 1;
    const pad = (hi - lo) * 0.06;
    const wsum = rows.reduce((s, r) => s + r.win_rate * r.total_closed, 0);
    const nsum = rows.reduce((s, r) => s + r.total_closed, 0);
    const sig = td.filter((d) => d.closed >= 3 && d.chg != null);
    const r = pearson(sig.map((d) => d.wr), sig.map((d) => d.chg));
    const up = sig.filter((d) => d.chg > 0);
    const down = sig.filter((d) => d.chg < 0);
    const wAvg = (arr) => {
      const w = arr.reduce((s, d) => s + d.wr * d.closed, 0);
      const n = arr.reduce((s, d) => s + d.closed, 0);
      return n ? w / n : 0;
    };
    const withBtc = rows.filter((r) => r.btc_close != null);
    const first = withBtc[0]?.btc_close, last = withBtc[withBtc.length - 1]?.btc_close;
    return {
      trendData: td,
      wrAvg: nsum ? wsum / nsum : 0,
      corr: r,
      upWR: wAvg(up),
      downWR: wAvg(down),
      btcDelta: first && last ? ((last - first) / first) * 100 : null,
      btcMin: lo - pad,
      btcMax: hi + pad,
    };
  }, [fullSeries, rangeId, eventId, customStart, customEnd]);

  const ttp = timing?.time_to_each_tp || [];
  const maxSec = Math.max(...ttp.map((t) => t.avg_seconds || 0), 1);

  const patterns = [...(edge?.pattern_ev || [])].sort((a, b) => (b.expected_value || 0) - (a.expected_value || 0)).slice(0, 6);
  const maxEv = patterns[0]?.expected_value || 1;

  const coins = (edge?.coin_leaderboard || []).slice(0, 6);
  const maxPeak = coins[0]?.median_peak || 1;

  return (
    <section id="performance" className="relative z-10 mx-auto w-full max-w-7xl px-4 py-20 lg:px-8 lg:py-28">
      {/* header */}
      <div className="mb-12 text-center lg:mb-16">
        <span className="inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
          <span className="h-px w-7 bg-gradient-to-r from-transparent to-gold-primary/60" />
          Verified Track Record
        </span>
        <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-text-primary lg:text-[2.9rem]">
          An edge you can{" "}
          <span className="bg-gradient-to-r from-gold-light via-gold-primary to-accent-dark bg-clip-text text-transparent">audit.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-text-primary/55 lg:text-base">
          Every signal recorded since day one — no hidden trades, no
          cherry-picking. {stats ? nfmt(stats.total_signals) : "—"} signals on
          record, each outcome publicly verifiable.
        </p>
      </div>

      {/* headline */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {headline.map((s) => (
          <Card key={s.label} className="!p-4 hover:-translate-y-0.5 lg:!p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">{s.label}</p>
            <p className="mt-2 text-3xl font-bold leading-none tabular-nums transition-transform duration-300 group-hover:scale-[1.04] group-hover:origin-left lg:text-4xl" style={{ color: s.accent ? C.gold : "#fff" }}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* win rate donut + outcome donut */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <CardHead title="Win Rate" info={INFO.winRate} sub={stats ? `${nfmt(stats.total_winners)} W · ${nfmt(stats.sl_count)} L` : "—"} />
          {stats ? (
            <div className="flex flex-1 items-center gap-6">
              <div className="relative h-44 w-44 flex-shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <defs>
                      <linearGradient id="wrArc" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={C.goldL} />
                        <stop offset="100%" stopColor={C.gold2} />
                      </linearGradient>
                    </defs>
                    <Pie data={wrDonut} dataKey="value" startAngle={90} endAngle={-270} innerRadius="76%" outerRadius="100%" stroke="none" cornerRadius={6} paddingAngle={1}>
                      <Cell fill="url(#wrArc)" />
                      <Cell fill="rgba(248,113,113,0.25)" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold tabular-nums" style={{ color: C.gold }}>{winRate.toFixed(1)}%</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">win rate</span>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Winners</p>
                  <p className="text-xl font-bold tabular-nums" style={{ color: C.gold }}>{nfmt(stats.total_winners)}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Stopped out</p>
                  <p className="text-xl font-bold tabular-nums" style={{ color: C.loss }}>{nfmt(stats.sl_count)}</p>
                </div>
              </div>
            </div>
          ) : (
            <Spinner />
          )}
        </Card>

        <Card className="flex flex-col">
          <CardHead title="Where Winners Exit" info={INFO.outcome} sub={`${nfmt(outcomeTotal)} closed trades`} />
          {outcomeTotal > 0 ? (
            <>
            {/* Mobile: stack donut + full-width legend so Share % never clips.
                Desktop: side-by-side. */}
            <div className="flex flex-1 flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
              <div className="relative h-40 w-40 flex-shrink-0 sm:h-44 sm:w-44">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={outcome} dataKey="count" nameKey="label" startAngle={90} endAngle={-270} innerRadius="62%" outerRadius="100%" stroke="none" paddingAngle={1.5}>
                      {outcome.map((o) => <Cell key={o.label} fill={o.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold tabular-nums text-text-primary">{pct((outcome.slice(0, 4).reduce((s, o) => s + o.count, 0) / outcomeTotal) * 100)}</span>
                  <span className="font-mono text-[8px] uppercase tracking-wider text-text-muted">reach TP</span>
                </div>
              </div>
              <div className="w-full min-w-0 flex-1 space-y-2">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto] items-center gap-x-2 pb-0.5 font-mono text-[8px] uppercase tracking-wider text-text-muted sm:gap-x-2.5">
                  <span className="w-2.5" />
                  <span>Exit</span>
                  <span className="text-right">Avg P/L</span>
                  <span className="text-right">Trades</span>
                  <span className="min-w-[2.5rem] text-right">Share</span>
                </div>
                {outcome.map((o) => {
                  const share = ((o.count / outcomeTotal) * 100);
                  return (
                    <div
                      key={o.label}
                      className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)_auto] items-center gap-x-2 sm:gap-x-2.5"
                    >
                      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: o.color }} />
                      <span className="font-mono text-[12px] font-semibold" style={{ color: o.label === "SL" ? C.loss : "#fff" }}>
                        {o.label === "TP4" ? "TP4+" : o.label}
                      </span>
                      <span className="text-right font-mono text-[12px] tabular-nums" style={{ color: o.avg == null ? C.muted : o.avg >= 0 ? C.win : C.loss }}>
                        {o.avg == null ? "—" : signed(o.avg)}
                      </span>
                      <span className="text-right font-mono text-[12px] tabular-nums text-text-primary">{nfmt(o.count)}</span>
                      <span
                        className="min-w-[2.5rem] text-right font-mono text-[11px] font-semibold tabular-nums sm:text-[10px]"
                        style={{ color: o.label === "SL" ? C.loss : C.gold }}
                        title={`${share.toFixed(1)}% of closed trades`}
                      >
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-3 border-t border-white/[0.06] pt-2.5 font-mono text-[9px] leading-relaxed text-text-muted">
              Avg P/L · TP1–TP3 = actual target gains · <span className="text-text-primary">TP4+ = avg peak</span> (TP4 is the final target — winners usually run beyond it) · SL = avg loss · Share = % of all closed trades.
            </p>
            </>
          ) : (
            <Spinner />
          )}
        </Card>
      </div>

      {/* ── DEEP ANALYTICS — tabbed block ──
           Horizontal pill tabs on top for ALL breakpoints. Mobile: pills fill
           the row edge-to-edge (flex-1, no empty gap). Desktop: compact pills,
           content-sized & left-aligned; chart panel runs full width below. */}
      <div className="mt-4">
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-3">
          {ANA_TABS.map((tb) => {
            const on = anaTab === tb.id;
            return (
              <button
                key={tb.id}
                onClick={() => setAnaTab(tb.id)}
                title={tb.label}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2.5 py-2 text-[12.5px] font-medium transition-all duration-200 sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm ${
                  on
                    ? "border-gold-primary/50 bg-gold-primary/[0.12] text-text-primary shadow-[0_4px_14px_rgba(212,168,83,0.2)]"
                    : "border-white/10 bg-white/[0.02] text-text-muted hover:border-white/25 hover:text-text-primary"
                }`}
              >
                <TabIcon id={tb.id} className={`h-[15px] w-[15px] flex-shrink-0 ${on ? "text-gold-primary" : ""}`} />
                <span className="whitespace-nowrap">{tb.label}</span>
              </button>
            );
          })}
        </div>

        {/* active panel — full width below the tabs */}
        <div className="min-w-0">

      {/* WIN RATE × BITCOIN (filterable, deep) */}
      {anaTab === "wrbtc" && (
      <Card className="!overflow-visible">
        <CardHead
          title="Win Rate × Bitcoin"
          info={INFO.wrBtc}
          sub="Does the edge survive every BTC regime?"
          right={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Seg items={["30D", "90D", "1Y", "ALL"]} value={eventId || customOn ? "" : rangeId} onChange={(v) => { setRangeId(v); setEventId(null); setCustomStart(""); setCustomEnd(""); }} />
                <Seg items={["Win rate", "vs BTC"]} value={showBtc ? "vs BTC" : "Win rate"} onChange={(v) => setShowBtc(v === "vs BTC")} />
              </div>
              <PeriodFilterPopover
                filterOpen={filterOpen}
                setFilterOpen={setFilterOpen}
                eventId={eventId}
                setEventId={setEventId}
                customOn={customOn}
                customStart={customStart}
                setCustomStart={setCustomStart}
                customEnd={customEnd}
                setCustomEnd={setCustomEnd}
                activeEvent={activeEvent}
                EVENTS={EVENTS}
              />
            </div>
          }
        />

        {customOn && (
          <p className="mb-3 text-[11px] leading-snug text-text-primary/45">
            <span className="font-semibold text-gold-primary">Custom range</span>{" "}
            · {trendData.length} day{trendData.length === 1 ? "" : "s"} of signals in this window.
          </p>
        )}

        {activeEvent && (
          <p className="mb-3 text-[11px] leading-snug text-text-primary/45">
            <span className="font-semibold" style={{ color: EV_COLOR[activeEvent.cat] }}>
              {new Date(activeEvent.start).toLocaleDateString("en", { month: "short", day: "numeric", year: "2-digit" })} – {activeEvent.ongoing ? "now" : new Date(activeEvent.end).toLocaleDateString("en", { month: "short", day: "numeric", year: "2-digit" })}
            </span>{" "}
            · {activeEvent.note}
          </p>
        )}

        {/* range stats */}
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1.5 font-mono text-[11px]">
          <span className="text-text-muted">WR <b className="text-text-primary" style={{ color: C.gold }}>{pct(wrAvg)}</b></span>
          {showBtc && btcDelta != null && (
            <span className="text-text-muted">BTC <b style={{ color: btcDelta >= 0 ? C.win : C.loss }}>{signed(btcDelta)}</b> over range</span>
          )}
          {showBtc && corr != null && (
            <span className="text-text-muted">Correlation <b style={{ color: C.gold }}>r {corr >= 0 ? "+" : ""}{corr.toFixed(2)}</b></span>
          )}
        </div>

        <div className="h-56 w-full lg:h-72">
          {trendData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 8, right: showBtc ? 2 : 4, left: -20, bottom: 0 }} onClick={(e) => openDay(e?.activeLabel || e?.activePayload?.[0]?.payload?.date)} style={{ cursor: "pointer" }}>
                <defs>
                  <linearGradient id="wrFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.gold} stopOpacity={0.26} />
                    <stop offset="100%" stopColor={C.gold} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" stroke={C.muted} fontSize={10} tickLine={false} axisLine={false} interval={Math.ceil(trendData.length / 7)} dy={8} minTickGap={24} tickFormatter={(d) => new Date(d).toLocaleDateString("en", { month: "short", year: "2-digit" })} />
                <YAxis yAxisId="wr" stroke={C.muted} fontSize={10} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
                <YAxis yAxisId="btc" orientation="right" hide={!showBtc} stroke={C.muted} fontSize={9} width={34} domain={[btcMin, btcMax]} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tickLine={false} axisLine={false} />
                {/* BTC candlesticks (drawn first, behind WR line) */}
                {showBtc && <Bar yAxisId="btc" dataKey="range" shape={<Candle />} isAnimationActive={false} />}
                <ReferenceLine yAxisId="wr" y={wrAvg} stroke="rgba(231,195,115,0.3)" strokeDasharray="4 4" />
                {!showBtc && <Area yAxisId="wr" type="monotone" dataKey="wr" stroke="none" fill="url(#wrFill)" />}
                <Line yAxisId="wr" type="monotone" dataKey="wr" stroke={C.gold} strokeWidth={2.2} dot={false} activeDot={{ r: 4, fill: C.gold, stroke: "#0a0506", strokeWidth: 2 }} />
                <Tooltip
                  cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-lg border border-white/15 bg-surface-secondary/95 p-2.5 backdrop-blur-md">
                        <p className="text-[11px] font-semibold text-text-primary">{new Date(d.date).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</p>
                        <p className="mt-1 text-[12px]" style={{ color: C.gold }}>{pct(d.wr)} win rate <span className="text-text-muted">· {d.closed} closed</span></p>
                        {showBtc && d.c != null && (
                          <>
                            <p className="mt-0.5 text-[11px]">
                              <span style={{ color: C.btc }}>BTC ${Math.round(d.c).toLocaleString()}</span>{" "}
                              <span style={{ color: d.chg >= 0 ? C.win : C.loss }}>{signed(d.chg)}</span>
                            </p>
                            <p className="font-mono text-[9px] text-text-muted">
                              O {Math.round(d.o).toLocaleString()} · H {Math.round(d.h).toLocaleString()} · L {Math.round(d.l).toLocaleString()}
                            </p>
                          </>
                        )}
                      </div>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : eventId || customOn ? (
            <div className="flex h-full items-center justify-center text-center text-[12px] text-text-muted">
              No signals recorded in this window.
            </div>
          ) : (
            <Spinner />
          )}
        </div>

        {/* hint — click a day → opens the proof modal */}
        {trendData.length > 0 && (
          <p className="mt-2 font-mono text-[10px] text-text-muted">
            Tip: click any day to see its calls — with full proof (entry, targets &amp; charts).
          </p>
        )}

        {/* BTC × WR analysis */}
        {showBtc && corr != null && (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/[0.06] pt-4 font-mono text-[11px]">
            <span className="text-text-muted">
              On BTC <span style={{ color: C.win }}>up</span> days WR <b className="text-text-primary">{pct(upWR)}</b>
            </span>
            <span className="text-text-muted">
              On BTC <span style={{ color: C.loss }}>down</span> days WR <b className="text-text-primary">{pct(downWR)}</b>
            </span>
            <span className="text-text-primary/40">
              {Math.abs(upWR - downWR) < 8 ? "Edge holds in both directions." : `${signed(upWR - downWR)} swing — co-moves with BTC.`}
            </span>
          </div>
        )}
      </Card>
      )}

      {/* HIGHEST-EDGE PATTERNS */}
      {anaTab === "patterns" && (
        <Card className="flex flex-col">
          <CardHead title="Highest-Edge Patterns" info={INFO.patterns} sub="Expected gain per trade · 90d" right={<span className="font-mono text-[10px] text-text-muted">EV</span>} />
          {patterns.length ? (
            <div className="flex flex-1 flex-col justify-between gap-3.5">
              {patterns.map((p) => {
                const rc = REL[p.reliability] || C.amber;
                return (
                  <div key={p.pattern}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[11px] uppercase tracking-wide text-text-primary">{niceName(p.pattern)}</span>
                      <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: C.gold }}>+{p.expected_value.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Bar3D pct={(p.expected_value / maxEv) * 100} />
                      <span className="w-12 text-right font-mono text-[10px] tabular-nums text-text-muted">{pct(p.win_rate)}</span>
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium" style={{ color: rc, background: `${rc}1a` }}>
                        <span className="h-1 w-1 rounded-full" style={{ background: rc }} /> n={p.count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Spinner />
          )}
        </Card>
      )}

      {/* TIME TO TARGET */}
      {anaTab === "timing" && (
        <Card className="flex flex-col">
          <CardHead title="Time to Target" info={INFO.timing} sub="How fast our calls reach each TP" right={timing ? <span className="font-mono text-[10px] text-text-muted">All calls · n={nfmt(timing.sample_size)}</span> : null} />
          {ttp.length ? (
            <div className="flex flex-1 flex-col justify-between gap-3.5">
              {ttp.map((t) => (
                <div key={t.tp}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-mono text-[12px] font-bold" style={{ color: C.gold }}>{t.tp}</span>
                    <span className="font-mono text-[13px] font-semibold tabular-nums text-text-primary">{t.avg_human}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Bar3D pct={(t.avg_seconds / maxSec) * 100} />
                    <span className="w-24 text-right font-mono text-[9px] text-text-muted">fastest {t.fastest_human}</span>
                  </div>
                </div>
              ))}
              {timing?.peak_potential && (
                <p className="mt-1 border-t border-white/[0.06] pt-3 font-mono text-[10px] text-text-muted">
                  avg peak excursion <span style={{ color: C.gold }}>{bigPct(timing.peak_potential.avg_peak_excursion_pct)}</span> · time in profit <span className="text-text-primary">{pct(timing.risk_profile?.avg_time_in_profit_pct)}</span>
                </p>
              )}
            </div>
          ) : (
            <Spinner />
          )}
        </Card>
      )}

      {/* TOP COINS WE CALLED */}
      {anaTab === "coins" && (
      <Card>
        <CardHead title="Top Coins We Called" info={INFO.coins} sub="Ranked by median peak · 90d" right={<span className="font-mono text-[10px] text-text-muted">{edge?.coin_leaderboard?.length || ""} coins</span>} />
        {coins.length ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {coins.map((c) => (
              <div key={c.pair} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] px-3.5 py-2.5 transition-colors hover:border-line/25">
                <CoinLogo pair={c.pair} size={30} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-text-primary">
                    {sym(c.pair)}
                    <span className="ml-1.5 font-mono text-[9px] uppercase tracking-wider text-text-muted">{c.sector}</span>
                  </p>
                  <Bar3D pct={(c.median_peak / maxPeak) * 100} className="mt-1.5 h-2" />
                </div>
                <div className="text-right">
                  <p className="font-mono text-[15px] font-bold tabular-nums" style={{ color: C.gold }}>{bigPct(c.median_peak)}</p>
                  <p className="font-mono text-[9px] text-text-muted">{pct(c.win_rate)} WR · n={c.count}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Spinner />
        )}
      </Card>
      )}
        </div>
      </div>

      {/* footer CTA */}
      <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-2xl border border-line/15 bg-gold-primary/[0.04] p-5 sm:flex-row">
        <p className="text-sm text-text-primary/60">
          <span className="font-semibold text-text-primary">Every trade on record.</span> Pattern reliability, expected value, timing & per-coin breakdowns — all live.
        </p>
        <button
          onClick={() => navigate("/performance")}
          className="group inline-flex flex-shrink-0 items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5"
          style={{ background: "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)", color: "rgb(var(--surface))" }}
        >
          See Full Analytics
          <svg className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* per-day proof modal */}
      {drillDate && (
        <DayDrillModal date={drillDate} data={drillData} loading={drillLoading} onClose={closeDay} />
      )}
    </section>
  );
}
