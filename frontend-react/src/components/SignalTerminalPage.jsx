import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { classifyCoin } from "./coinIntelShared";
import CoinLogo from "./CoinLogo";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, Cell, ReferenceLine,
} from "recharts";
import { GOLD, GRID, AXIS, TICK_SM, SectorGlyph, statusColorOf, useZoom } from "./terminal/vizShared";
import { useSignalStatus, STATUS_META, timeAgo } from "../context/SignalStatusContext";
import {
  DEFAULT_FILTERS, parseFilters, filtersToParams, applySignalFilters,
  parseMcap, maxTargetPct,
} from "../utils/signalFilters";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — multi-panel visualization over Potential Trades.
// Data: bulk-7d + coin-intel + money-flow (coins/sectors/macro) + live
// prices. Filters mirror SignalsPage EXACTLY via shared signalFilters util,
// and are read from the URL so the "Terminal" button can carry them over.
// ════════════════════════════════════════════════════════════════

// ── color helpers ──
const lerp = (a, b, t) => a + (b - a) * t;
function heat(t) {
  t = Math.max(0, Math.min(1, t));
  const r = [239, 68, 68], m = [70, 60, 55], g = [16, 185, 129];
  if (t < 0.5) { const u = t / 0.5; return `rgb(${lerp(r[0], m[0], u) | 0},${lerp(r[1], m[1], u) | 0},${lerp(r[2], m[2], u) | 0})`; }
  const u = (t - 0.5) / 0.5; return `rgb(${lerp(m[0], g[0], u) | 0},${lerp(m[1], g[1], u) | 0},${lerp(m[2], g[2], u) | 0})`;
}
function shortNum(v) {
  if (!v && v !== 0) return "—";
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return Number(v).toFixed(0);
}

// ── squarified treemap (bounded — rows laid along the shorter side) ──
function tmWorst(row, side) {
  const s = row.reduce((a, b) => a + b.area, 0);
  const mx = Math.max(...row.map((r) => r.area)), mn = Math.min(...row.map((r) => r.area));
  return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
}
function squarify(items, x0, y0, W0, H0) {
  const rects = [];
  const total = items.reduce((s, i) => s + i.v, 0) || 1;
  const nodes = items.map((i) => ({ d: i.d, area: (i.v / total) * W0 * H0 }));
  let x = x0, y = y0, w = W0, h = H0, i = 0;
  while (i < nodes.length) {
    const side = Math.min(w, h) || 1;
    let row = [], best = Infinity, j = i;
    while (j < nodes.length) {
      const cand = [...row, nodes[j]];
      const r = tmWorst(cand, side);
      if (row.length === 0 || r <= best) { row = cand; best = tmWorst(row, side); j++; } else break;
    }
    const rowArea = row.reduce((s, n) => s + n.area, 0) || 1;
    const rowThick = rowArea / side;
    let off = w >= h ? y : x;
    for (const n of row) {
      const len = n.area / rowThick;
      if (w >= h) { rects.push({ d: n.d, x, y: off, w: rowThick, h: len }); off += len; }
      else { rects.push({ d: n.d, x: off, y, w: len, h: rowThick }); off += len; }
    }
    if (w >= h) { x += rowThick; w -= rowThick; } else { y += rowThick; h -= rowThick; }
    i = j;
  }
  return rects;
}

// ── metric registry ──
const METRICS = {
  market_cap: { lbl: "Market Cap", get: (d) => d.market_cap, fmt: (v) => "$" + shortNum(v) },
  volume_24h: { lbl: "Volume 24h", get: (d) => d.volume_24h, fmt: (v) => "$" + shortNum(v) },
  flow_intensity: { lbl: "Vol/MCap", get: (d) => d.flow_intensity * 100, fmt: (v) => (v ? v.toFixed(1) + "%" : "—") },
  price_change_24h: { lbl: "Price Δ 24h", get: (d) => d.price_change_24h, fmt: (v) => (v >= 0 ? "+" : "") + v.toFixed(1) + "%", diverge: true },
  from_call: { lbl: "% From Call", get: (d) => d.from_call, fmt: (v) => (v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%"), diverge: true },
  win_rate: { lbl: "Win Rate", get: (d) => d.win_rate, fmt: (v) => (v == null ? "—" : v.toFixed(0) + "%") },
  max_target: { lbl: "Max Target %", get: (d) => d.max_target, fmt: (v) => "+" + v.toFixed(0) + "%" },
  btc_align: { lbl: "BTC Align", get: (d) => d.btc_align ?? 0, fmt: (v) => (v ? v.toFixed(0) : "—") },
};
// percentile of a pre-sorted array (q in 0..1)
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}
// robust color: clamp the domain to p5..p95 so a single outlier (e.g. one
// +154% max-target coin) can't wash every other cell to the same shade.
function colorByMetric(d, mk, rows) {
  const m = METRICS[mk];
  const vals = rows.map(m.get).filter((v) => v != null && !isNaN(v)).sort((a, b) => a - b);
  if (!vals.length) return heat(0.5);
  const v = m.get(d) ?? 0;
  const lo = quantile(vals, 0.05), hi = quantile(vals, 0.95);
  if (m.diverge) {
    const a = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    return heat((Math.max(-1, Math.min(1, v / a)) + 1) / 2);
  }
  return heat(Math.max(0, Math.min(1, (v - lo) / ((hi - lo) || 1))));
}

// ════════════════════════════════════════════════════════════════
export default function SignalTerminalPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [signals, setSignals] = useState([]);
  const [coinIntel, setCoinIntel] = useState({});
  const [flowCoins, setFlowCoins] = useState({}); // {SYMBOL: coin}
  const [sectors, setSectors] = useState([]);
  const [macro, setMacro] = useState(null);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // which market-map view — now driven by the left nav (?view=)
  const view = searchParams.get("view") || "treemap";

  // filters initialized from URL (carried from Potential Trades)
  const [filters, setFilters] = useState(() => parseFilters(searchParams));
  const setF = (patch) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    const p = filtersToParams(next);
    p.set("view", view); // preserve which view the nav selected
    setSearchParams(p, { replace: true });
  };

  const { openPair } = useSignalStatus() || {};
  const pick = (d) => (openPair ? openPair(d.pair) : openSignal(d, navigate, filters));
  const [sizeBy, setSizeBy] = useState("market_cap");
  const [colorBy, setColorBy] = useState(() => (searchParams.get("view") === "bubble" ? "from_call" : "max_target"));

  const authHeaders = () => {
    const token = localStorage.getItem("access_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchAll = useCallback(async (showLoad = true) => {
    if (showLoad) setLoading(true);
    const h = authHeaders();
    const [sigR, intelR, flowR, secR, macR] = await Promise.allSettled([
      fetch(`${API_BASE}/api/v1/signals/bulk-7d`, { headers: h }),
      fetch(`${API_BASE}/api/v1/signals/coin-intel`, { headers: h }),
      fetch(`${API_BASE}/api/v1/money-flow/coins?luxquant_only=true&limit=200`, { headers: h }),
      fetch(`${API_BASE}/api/v1/money-flow/sectors?limit=12`, { headers: h }),
      fetch(`${API_BASE}/api/v1/money-flow/macro`, { headers: h }),
    ]);
    try {
      if (sigR.status === "fulfilled" && sigR.value.ok) {
        const d = await sigR.value.json();
        setSignals(d.items || []);
      }
      if (intelR.status === "fulfilled" && intelR.value.ok) {
        const intel = await intelR.value.json();
        const all = [...(intel.top_coins || []), ...(intel.rest_coins || [])];
        const map = {};
        for (const c of all) if (c && c.pair) map[c.pair] = c;
        setCoinIntel(map);
      }
      if (flowR.status === "fulfilled" && flowR.value.ok) {
        const fd = await flowR.value.json();
        const map = {};
        for (const c of (fd.coins || [])) if (c.symbol) map[c.symbol.toUpperCase()] = c;
        setFlowCoins(map);
      }
      if (secR.status === "fulfilled" && secR.value.ok) {
        const sd = await secR.value.json();
        setSectors(sd.sectors || []);
      }
      if (macR.status === "fulfilled" && macR.value.ok) {
        setMacro(await macR.value.json());
      }
    } catch (e) { /* best-effort */ }
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll(true);
    const iv = setInterval(() => fetchAll(false), 30000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  // (live-price polling is defined below, after `filteredSignals`, so it fetches
  //  prices ONLY for the pairs currently in view — not all 7-day signals.)

  // verdict per pair
  const verdictByPair = useMemo(() => {
    const map = {};
    for (const pair in coinIntel) map[pair] = classifyCoin(coinIntel[pair]);
    return map;
  }, [coinIntel]);

  // filtered signals — SAME logic as Potential Trades
  const filteredSignals = useMemo(
    () => applySignalFilters(signals, filters, { coinIntel, verdictByPair }),
    [signals, filters, coinIntel, verdictByPair]
  );

  // Live prices — ONLY for the pairs currently in view (filtered), refreshed
  // every 30s. Previously this fetched all 700+ 7-day pairs every 15s, which
  // piled avoidable load on the shared /market/prices proxy during peak windows.
  const pricePairs = useMemo(
    () => [...new Set(filteredSignals.map((s) => s.pair).filter(Boolean))],
    [filteredSignals]
  );
  useEffect(() => {
    if (!pricePairs.length) return;
    let alive = true;
    const run = async () => {
      const acc = {};
      for (let i = 0; i < pricePairs.length; i += 100) {
        const batch = pricePairs.slice(i, i + 100);
        try {
          const r = await fetch(`${API_BASE}/api/v1/market/prices?symbols=${batch.join(",")}`);
          if (r.ok) Object.assign(acc, await r.json());
        } catch (_) {}
      }
      // Merge (never replace) so switching filters doesn't blank prices we already have.
      if (alive) setPrices((prev) => ({ ...prev, ...acc }));
    };
    run();
    const iv = setInterval(run, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, [pricePairs]);

  // build per-pair model joining every source
  const model = useMemo(() => {
    return filteredSignals.map((s) => {
      const sym = (s.pair || "").replace(/USDT$/i, "").toUpperCase();
      const flow = flowCoins[sym];
      const ci = coinIntel[s.pair];
      const priceObj = prices[s.pair];
      const livePrice = priceObj ? (typeof priceObj === "number" ? priceObj : priceObj.price) : (flow?.price ?? null);
      const liveVol = priceObj && typeof priceObj !== "number" ? priceObj.volume : (flow?.volume_24h ?? 0);
      const liveChange = priceObj && typeof priceObj !== "number" && priceObj.change != null ? priceObj.change : null;
      const mcap = flow?.market_cap ?? parseMcap(s.market_cap);
      const entry = parseFloat(s.entry) || 0;
      return {
        signal_id: s.signal_id,
        pair: s.pair, sym,
        status: (s.status || "open").toLowerCase(),
        risk: (s.risk_level || "").toLowerCase(),
        market_cap: mcap,
        volume_24h: liveVol || flow?.volume_24h || 0,
        flow_intensity: flow?.flow_intensity ?? (mcap ? (liveVol || 0) / mcap : 0),
        price_change_24h: liveChange ?? flow?.price_change_24h ?? 0,
        from_call: (() => {
          if (!entry || !livePrice) return null;
          const ratio = livePrice / entry;
          if (ratio < 0.05 || ratio > 5) return null; // redenom/stale → quarantine (else it shows +1.8M% & skews color)
          return (ratio - 1) * 100;
        })(),
        win_rate: ci?.win_rate ?? null,
        streak: ci?.current_streak ? (ci.current_streak.type === "win" ? ci.current_streak.length : -ci.current_streak.length) : 0,
        btc_align: s.btc_align_score ?? null,
        decoupled: !!s.btc_decoupled,
        max_target: maxTargetPct(s),
        verdict: verdictByPair[s.pair] || "neutral",
        entry, price: livePrice, _sig: s,
      };
    });
  }, [filteredSignals, flowCoins, coinIntel, prices, verdictByPair]);

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="space-y-3 pb-6">
      {/* Filter bar (parity with Potential Trades) */}
      <FilterBar filters={filters} setF={setF} coinIntel={coinIntel} verdictByPair={verdictByPair} signals={signals} />

      {/* View chrome — encoders aligned with timeless desk */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted/60">Market map</span>
          <div className="font-display text-[15px] font-semibold tracking-tight text-text-primary capitalize leading-tight">
            {view}
          </div>
        </div>
        <div className="flex-1" />
        {view === "treemap" && <Enc label="Size" value={sizeBy} onChange={setSizeBy} />}
        {view !== "explore" && <Enc label="Color" value={colorBy} onChange={setColorBy} />}
        <span className="font-mono text-[10px] tabular-nums text-text-muted/55">
          {model.length} pairs
        </span>
      </div>

      {/* Macro strip — market context, shown on the treemap overview */}
      {view === "treemap" && <MacroStrip macro={macro} sectors={sectors} model={model} />}

      {/* Main stage */}
      <div className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-surface-raised p-3 sm:p-4">
        {model.length === 0 ? (
          <div className="flex h-[360px] items-center justify-center font-mono text-xs text-text-primary/40">
            {loading ? "Loading signals…" : "No signals match the current filters."}
          </div>
        ) : view === "treemap" ? (
          <Treemap model={model} sizeBy={sizeBy} colorBy={colorBy} onPick={pick} />
        ) : view === "bubble" ? (
          <Bubble model={model} colorBy={colorBy} onPick={pick} />
        ) : view === "matrix" ? (
          <Matrix model={model} onPick={pick} />
        ) : view === "explore" ? (
          <ExploreView model={model} onPick={pick} />
        ) : (
          <SectorView model={model} colorBy={colorBy} onPick={pick} />
        )}
      </div>

      {/* Screener */}
      <Screener model={model} onPick={pick} />

      <p className="border-t border-white/[0.05] pt-2.5 font-mono text-[10px] leading-relaxed text-text-primary/30">
        Filters mirror Potential Trades · live prices via Binance Futures proxy · click any tile for call proof
      </p>
    </div>
  );
}

// open the SignalModal on Potential Trades (deep-link), preserving filters
function openSignal(d, navigate, filters) {
  const p = filtersToParams(filters);
  p.set("signal", String(d.signal_id));
  navigate(`/signals?${p.toString()}`);
}

const fmtPrice = (v) => {
  if (!v && v !== 0) return "—";
  if (v >= 1) return Number(v).toFixed(2);
  if (v >= 0.01) return Number(v).toFixed(4);
  return Number(v).toPrecision(3);
};
const ST_META = {
  open: { label: "OPEN", color: "#60a5fa", desc: "Live — no target hit yet" },
  tp1: { label: "TP1 HIT", color: "rgb(var(--pos))", desc: "First target reached" },
  tp2: { label: "TP2 HIT", color: "rgb(var(--pos))", desc: "Second target reached" },
  tp3: { label: "TP3 HIT", color: "rgb(var(--pos))", desc: "Third target reached" },
  closed_win: { label: "TP4 / WIN", color: "rgb(var(--accent))", desc: "Final target — closed in profit" },
  closed_loss: { label: "STOPPED OUT", color: "rgb(var(--neg))", desc: "Hit stop loss" },
};

// ── Signal detail modal — opens when any point/row/tile is clicked ──
function SignalDetailModal({ d, onClose, onFull }) {
  if (!d) return null;
  const st = ST_META[d.status] || { label: (d.status || "—").toUpperCase(), color: "rgb(var(--fg-secondary))", desc: "" };
  const sign = (v) => (v == null ? "text-text-primary/90" : v >= 0 ? "text-positive" : "text-negative");
  const Stat = ({ label, val, tone }) => (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-2.5">
      <div className="font-mono text-[8.5px] uppercase tracking-[0.15em] text-text-muted">{label}</div>
      <div className={`font-mono tabular-nums text-[15px] mt-1 ${tone || "text-text-primary/90"}`}>{val}</div>
    </div>
  );
  return (
    <div
      className="fixed inset-0 flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      style={{ zIndex: 200000 }}
      onClick={onClose}
    >
      <div
        className="relative max-h-[min(92dvh,100%)] w-full max-w-[540px] overflow-auto rounded-t-2xl border-t border-white/[0.1] bg-surface-raised shadow-[0_-20px_60px_rgba(0,0,0,0.65)] sm:rounded-xl sm:border sm:shadow-2xl sm:shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex justify-center bg-surface-raised pb-0 pt-2.5 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>

        <div className="flex items-center gap-3 px-5 pt-4 sm:pt-5">
          <CoinLogo pair={d.pair} size={38} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[18px] font-semibold leading-none text-text-primary">{d.sym}</span>
              <span className="font-mono text-[11px] text-text-muted">{d.pair}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              {d.risk && (
                <span className="rounded-sm border border-white/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-primary/60">
                  {d.risk} risk
                </span>
              )}
              {d.decoupled && (
                <span className="rounded-sm border border-cyan-500/25 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-cyan-400/90">
                  btc-decoupled
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-text-muted hover:border-white/25 hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        <div
          className="mx-5 mt-4 flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: `${st.color}14`, border: `1px solid ${st.color}44` }}
        >
          <span className="font-mono text-[15px] font-bold tracking-wider" style={{ color: st.color }}>
            {st.label}
          </span>
          <span className="hidden text-[11px] text-text-muted sm:block">{st.desc}</span>
          <span className="ml-auto text-right">
            <span className="block font-mono text-[8px] uppercase tracking-[0.15em] text-text-muted/70">from call</span>
            <span
              className="font-mono text-[17px] tabular-nums"
              style={{ color: d.from_call == null ? "#8a8478" : d.from_call >= 0 ? "#34d399" : "#f87171" }}
            >
              {d.from_call == null ? "—" : (d.from_call >= 0 ? "+" : "") + d.from_call.toFixed(1) + "%"}
            </span>
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 px-5 sm:grid-cols-3">
          <Stat label="Win Rate" val={d.win_rate == null ? "—" : d.win_rate.toFixed(0) + "%"} tone="text-text-primary" />
          <Stat label="Max Target" val={d.max_target == null ? "—" : "+" + d.max_target.toFixed(0) + "%"} tone="text-emerald-400" />
          <Stat label="24h Δ" val={(d.price_change_24h >= 0 ? "+" : "") + (d.price_change_24h?.toFixed?.(1) ?? "—") + "%"} tone={sign(d.price_change_24h)} />
          <Stat label="BTC Align" val={d.btc_align == null ? "—" : d.btc_align.toFixed(0)} />
          <Stat label="Vol / MCap" val={d.flow_intensity ? (d.flow_intensity * 100).toFixed(1) + "%" : "—"} />
          <Stat label="Market Cap" val={"$" + shortNum(d.market_cap)} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 px-5">
          <Stat label="Entry" val={d.entry ? "$" + fmtPrice(d.entry) : "—"} />
          <Stat label="Live Price" val={d.price ? "$" + fmtPrice(d.price) : "—"} />
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] px-5 py-4">
          <button
            onClick={onFull}
            className="flex-1 rounded-lg border border-white/15 bg-white/[0.1] py-2.5 text-[13px] font-semibold text-text-primary transition hover:bg-white/[0.14]"
          >
            Open full signal →
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/12 px-4 py-2.5 text-[13px] text-text-primary/70 transition hover:border-white/25"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Encoder select ──
function Enc({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-2">
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-primary/35">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-surface border border-white/[0.1] rounded-lg font-mono text-[11px] text-text-primary/80 px-2.5 py-1.5 pr-6 focus:outline-none focus:border-line/40 cursor-pointer">
        {Object.entries(METRICS).map(([k, m]) => <option key={k} value={k} className="bg-surface">{m.lbl}</option>)}
      </select>
    </label>
  );
}

// ── Filter bar ──
function FilterBar({ filters, setF }) {
  const chip = (on) =>
    `font-mono text-[10px] uppercase tracking-wide px-2.5 py-1.5 rounded-md border transition-colors cursor-pointer ${
      on
        ? "text-text-primary border-white/20 bg-white/[0.1] font-semibold"
        : "text-text-primary/55 border-white/[0.08] bg-white/[0.02] hover:border-white/16 hover:text-text-primary/80"
    }`;
  const sel =
    "appearance-none bg-white/[0.03] border border-white/[0.08] rounded-md font-mono text-[11px] text-text-primary/80 px-2.5 py-1.5 pr-7 focus:outline-none focus:border-white/20 cursor-pointer";
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-surface-raised/95 p-2.5 backdrop-blur-md">
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-primary/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          value={filters.searchPair}
          onChange={(e) => setF({ searchPair: e.target.value })}
          placeholder="Search pair…"
          className="w-36 rounded-md border border-white/[0.08] bg-white/[0.03] py-1.5 pl-8 pr-2.5 font-mono text-[11px] text-text-primary focus:border-white/20 focus:outline-none sm:w-40"
        />
      </div>
      <select className={sel} value={filters.statusFilter} onChange={(e) => setF({ statusFilter: e.target.value })}>
        <option value="all">All Status</option>
        <option value="open">Open</option>
        <option value="tp1">TP1</option>
        <option value="tp2">TP2</option>
        <option value="tp3">TP3</option>
        <option value="closed_win">TP4 / Win</option>
        <option value="closed_loss">Loss</option>
      </select>
      <select className={sel} value={filters.riskFilter} onChange={(e) => setF({ riskFilter: e.target.value })}>
        <option value="all">All Risk</option>
        <option value="low">Low</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
      </select>
      <div className={chip(filters.streakFilter === "hot")} onClick={() => setF({ streakFilter: filters.streakFilter === "hot" ? "all" : "hot" })}>
        Hot Streak
      </div>
      <div className={chip(filters.corrDecoupled)} onClick={() => setF({ corrDecoupled: !filters.corrDecoupled })}>
        BTC Decoupled
      </div>
      <div className={chip(filters.corrHighAlign)} onClick={() => setF({ corrHighAlign: !filters.corrHighAlign })}>
        High BTC Align
      </div>
      <div className={chip(filters.verdictFilter === "worth_it")} onClick={() => setF({ verdictFilter: filters.verdictFilter === "worth_it" ? "all" : "worth_it" })}>
        Worth It
      </div>
      <div className={chip(filters.verdictFilter === "avoid")} onClick={() => setF({ verdictFilter: filters.verdictFilter === "avoid" ? "all" : "avoid" })}>
        Avoid
      </div>
      <div className="flex-1" />
      <button
        onClick={() => setF({ ...DEFAULT_FILTERS })}
        className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide text-text-primary/45 hover:text-red-400"
      >
        × Reset
      </button>
    </div>
  );
}

// ── Macro strip: dominance gauges + altseason + sector rotation ──
function MacroStrip({ macro, sectors }) {
  const gauge = (v, color, lbl) => {
    const R = 22;
    const C = 2 * Math.PI * R;
    const frac = Math.min(1, (v || 0) / 100);
    return (
      <div className="text-center">
        <svg width="56" height="56" viewBox="0 0 56 56">
          <circle cx="28" cy="28" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
          <circle
            cx="28"
            cy="28"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - frac)}
            transform="rotate(-90 28 28)"
          />
          <text x="28" y="32" textAnchor="middle" fontFamily="monospace" fontSize="12" fontWeight="700" fill="#fff">
            {v == null ? "—" : v.toFixed(0)}
          </text>
        </svg>
        <div className="mt-0.5 font-mono text-[9px] uppercase tracking-widest text-text-primary/40">{lbl}</div>
      </div>
    );
  };
  const topSectors = [...(sectors || [])]
    .sort((a, b) => (b.mcap_change_24h ?? -9) - (a.mcap_change_24h ?? -9))
    .slice(0, 6);
  const maxAbs = Math.max(...topSectors.map((s) => Math.abs(s.mcap_change_24h ?? 0)), 1);
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <div className="rounded-xl border border-white/[0.06] bg-surface-raised p-4">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          Dominance & Altseason
        </div>
        <div className="flex justify-around">
          {gauge(macro?.btc_dominance, "#F7931A", "BTC Dom")}
          {gauge(macro?.eth_dominance, "#627EEA", "ETH Dom")}
          {gauge(macro?.altseason_index, "#94a3b8", "Altseason")}
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-surface-raised p-4 lg:col-span-2">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          Sector Rotation · Δ Market Cap 24h
        </div>
        <div className="space-y-1.5">
          {topSectors.length === 0 && (
            <div className="font-mono text-[11px] text-text-primary/30">No sector snapshot yet.</div>
          )}
          {topSectors.map((s) => {
            const c = s.mcap_change_24h ?? 0;
            return (
              <div key={s.category_id || s.name} className="flex items-center gap-2">
                <span className="flex w-36 items-center gap-1.5 font-mono text-[11px] text-text-primary/70">
                  <SectorGlyph sector={s.name} />
                  <span className="truncate">{s.name}</span>
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded bg-white/[0.04]">
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${(Math.abs(c) / maxAbs) * 100}%`,
                      background: c >= 0 ? "#34d399" : "#f87171",
                    }}
                  />
                </div>
                <span
                  className="w-14 text-right font-mono text-[10px] tabular-nums"
                  style={{ color: c >= 0 ? "#34d399" : "#f87171" }}
                >
                  {c >= 0 ? "+" : ""}
                  {c.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Treemap ──
function Treemap({ model, sizeBy, colorBy, onPick }) {
  const ref = useRef(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const H = 380;
  const sm = METRICS[sizeBy];
  // √-scale the size metric so a few mega-caps (BTC/ETH) don't swallow the
  // canvas and small caps stay legible — you can actually SEE the smallest.
  const items = model
    .map((d) => ({ v: Math.sqrt(Math.max(sm.get(d) || 0, 0)) + 0.5, d }))
    .sort((a, b) => b.v - a.v);
  const rects = squarify(items, 0, 0, w, H);
  return (
    <>
    <div ref={ref} className="relative w-full overflow-hidden rounded-lg" style={{ height: H }}>
      {rects.map((r) => {
        const d = r.d, big = r.w > 58 && r.h > 34, fs = Math.max(9, Math.min(14, r.w / 6));
        // only show the ticker when the tile is wide/tall enough to fit it —
        // avoids garbled single-letter labels on tiny cells.
        const showLabel = r.w > 30 && r.h > 16;
        return (
          <div key={d.signal_id} onClick={() => onPick(d)} title={`${d.sym} · ${METRICS[colorBy].fmt(METRICS[colorBy].get(d))}`}
            className="absolute rounded-md overflow-hidden cursor-pointer border border-black/40 hover:outline hover:outline-1 hover:outline-white/60 transition-transform hover:-translate-y-0.5"
            style={{ left: r.x, top: r.y, width: r.w - 3, height: r.h - 3, background: colorByMetric(d, colorBy, model) }}>
            <div className="absolute inset-0 p-1.5 flex flex-col justify-between">
              <div className="flex items-center gap-1 min-w-0">
                {big && <CoinLogo pair={d.pair} size={Math.min(18, Math.max(12, fs))} />}
                {showLabel && <div className="font-mono font-bold leading-none text-text-primary truncate" style={{ fontSize: fs, textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>{d.sym}</div>}
              </div>
              {big && <div className="font-mono leading-none text-text-primary/90" style={{ fontSize: Math.max(8, fs - 3), textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>{METRICS[colorBy].fmt(METRICS[colorBy].get(d))}</div>}
            </div>
          </div>
        );
      })}
    </div>
    <div className="text-center font-mono text-[9px] uppercase tracking-wider text-text-muted/70 mt-1">
      tile size = {sm.lbl} (√-scaled) · color = {METRICS[colorBy].lbl} · click → latest call
    </div>
    </>
  );
}

// ── Bubble (recharts ScatterChart — log-x so it isn't crammed; bubble = mcap) ──
function BubbleTip({ active, payload, colorBy }) {
  const ctx = useSignalStatus();
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload?.d;
  if (!d) return null;
  const info = ctx?.map && d.pair ? ctx.map[d.pair.toUpperCase()] : null;
  const meta = STATUS_META[d.status] || (info ? STATUS_META[info.status] : null);
  const ago = info ? timeAgo(info.created) : null;
  return (
    <div className="rounded-md bg-surface-secondary border border-line/25 px-3 py-2 font-mono text-[10px] shadow-lg">
      <div className="flex items-center gap-1.5 mb-1"><CoinLogo pair={d.pair} size={16} /><span className="text-text-primary">{d.sym}</span>{meta && <span className="font-bold ml-auto" style={{ color: meta.color }}>{meta.label}</span>}</div>
      {ago && <div className="text-text-primary/45 mb-1">called {ago}</div>}
      <div className="text-text-primary/55">Win rate: <span className="text-text-primary/90">{d.win_rate == null ? "—" : d.win_rate.toFixed(0) + "%"}</span></div>
      <div className="text-text-primary/55">Vol/MCap: <span className="text-text-primary/90">{(d.flow_intensity * 100).toFixed(2)}%</span></div>
      <div className="text-text-primary/55">MCap: <span className="text-text-primary/90">${shortNum(d.market_cap)}</span></div>
      <div className="text-text-primary/55">{METRICS[colorBy].lbl}: <span className="text-text-primary/90">{METRICS[colorBy].get(d) == null ? "—" : METRICS[colorBy].fmt(METRICS[colorBy].get(d))}</span></div>
    </div>
  );
}
// axis domain fitted to the bulk of the data (p2..p98) so clusters spread out
// instead of squishing against a fixed 0-100 range; outliers get clamped to the
// edge (still visible) rather than dragging the whole scale.
function niceDomain(vals, log) {
  const s = vals.slice().sort((a, b) => a - b);
  let lo = quantile(s, 0.02), hi = quantile(s, 0.98);
  if (lo === hi) { lo -= 1; hi += 1; }
  if (log) {
    const firstPos = s.find((v) => v > 0) || 1e-4;
    lo = Math.max(lo, firstPos, 1e-4);
    if (hi <= lo) hi = lo * 10;
  } else {
    const pad = (hi - lo) * 0.06 || 1;
    lo -= pad; hi += pad;
  }
  return [lo, hi];
}
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

// ── MarketScatter — analytics-grade quadrant scatter ────────────────
// Auto-fits axes, draws median crosshairs (→ 4 quadrants), sizes by market
// cap, colors robustly, labels the largest caps, and keeps overplotting
// legible via small semi-transparent dots. Used by Bubble + Explore.
function MarketScatter({ model, xKey, yKey, colorKey, onPick, logX = false, height = 480, quadrants = null, labelTop = 12 }) {
  const { map: statusMap } = useSignalStatus() || {};
  const mx = METRICS[xKey], my = METRICS[yKey];
  const pts = model
    .map((d) => ({ xv: mx.get(d), yv: my.get(d), d }))
    .filter((p) => p.xv != null && p.yv != null && !isNaN(p.xv) && !isNaN(p.yv));
  const xs = pts.map((p) => p.xv), ys = pts.map((p) => p.yv);
  const [x0, x1] = pts.length ? niceDomain(xs, logX) : [0, 1];
  const [y0, y1] = pts.length ? niceDomain(ys, false) : [0, 1];
  const z = useZoom(x0, x1, y0, y1); // free pan + unlimited zoom (hook must stay unconditional)
  if (!pts.length)
    return <div style={{ height }} className="flex items-center justify-center font-mono text-[11px] text-text-primary/30">No data for these axes.</div>;

  const xsS = xs.slice().sort((a, b) => a - b), ysS = ys.slice().sort((a, b) => a - b);
  const xMed = quantile(xsS, 0.5), yMed = quantile(ysS, 0.5);

  const mcaps = pts.map((p) => Math.max(p.d.market_cap || 1, 1));
  const sqLo = Math.sqrt(Math.min(...mcaps)), sqHi = Math.sqrt(Math.max(...mcaps));
  const rOf = (mc) => 4 + ((Math.sqrt(mc) - sqLo) / ((sqHi - sqLo) || 1)) * 20;

  const labSet = new Set(
    labelTop > 0
      ? [...pts].sort((a, b) => (b.d.market_cap || 0) - (a.d.market_cap || 0)).slice(0, labelTop).map((p) => p.d.signal_id)
      : []
  );

  const data = pts.map((p) => {
    const mc = Math.max(p.d.market_cap || 1, 1);
    return {
      x: clampN(logX ? Math.max(p.xv, x0) : p.xv, x0, x1),
      y: clampN(p.yv, y0, y1),
      z: mc, d: p.d,
      fill: colorByMetric(p.d, colorKey, model),
      r: rOf(mc),
      lab: labSet.has(p.d.signal_id) ? p.d.sym : null,
      sc: statusColorOf(statusMap, p.d.pair),
    };
  }).sort((a, b) => a.z - b.z); // draw big-cap bubbles last → on top, not buried

  const Dot = (props) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return null;
    return (
      <g style={{ cursor: "pointer" }} onClick={() => onPick(payload.d)}>
        <circle cx={cx} cy={cy} r={payload.r} fill={payload.fill} fillOpacity={0.5} stroke={payload.sc || "rgba(0,0,0,0.55)"} strokeWidth={payload.sc ? 2 : 0.6} />
        {payload.lab && (
          <text x={cx} y={cy - payload.r - 3} textAnchor="middle" fontFamily="monospace" fontSize={9.5} fontWeight="700"
            fill="#fff" stroke="rgba(0,0,0,0.9)" strokeWidth={2.6} paintOrder="stroke" pointerEvents="none">{payload.lab}</text>
        )}
      </g>
    );
  };
  const fmtTick = (m) => (v) => { const s = m.fmt(v); return typeof s === "string" ? s : String(s); };

  return (
    <div
      className="relative" style={{ height, touchAction: "none", cursor: "grab" }}
      ref={z.ref} onPointerDown={z.onPointerDown} onPointerMove={z.onPointerMove}
      onPointerUp={z.onPointerUp} onPointerLeave={z.onPointerUp} onClickCapture={z.onClickCapture}
      onDoubleClick={z.reset} title="drag to pan · wheel to zoom · double-click to reset"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 16, right: 24, left: 14, bottom: 30 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" />
          <XAxis type="number" dataKey="x" scale={logX ? "log" : "linear"} domain={logX ? [Math.max(z.domX[0], 1e-4), z.domX[1]] : z.domX} allowDataOverflow
            tick={TICK_SM} axisLine={false} tickLine={false} tickFormatter={fmtTick(mx)}
            label={{ value: mx.lbl + (logX ? "  (log)" : ""), position: "insideBottom", offset: -14, fill: AXIS, fontSize: 9.5, fontFamily: "monospace" }} />
          <YAxis type="number" dataKey="y" domain={z.domY} allowDataOverflow
            tick={TICK_SM} axisLine={false} tickLine={false} tickFormatter={fmtTick(my)}
            label={{ value: my.lbl, angle: -90, position: "insideLeft", offset: 6, fill: AXIS, fontSize: 9.5, fontFamily: "monospace" }} />
          <ZAxis type="number" dataKey="z" range={[26, 460]} />
          <ReferenceLine x={xMed} stroke="rgba(255,255,255,0.18)" strokeDasharray="5 5" />
          <ReferenceLine y={yMed} stroke="rgba(255,255,255,0.18)" strokeDasharray="5 5" />
          <Tooltip cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.25)" }} content={<BubbleTip colorBy={colorKey} />} />
          <Scatter data={data} shape={<Dot />} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
      {quadrants && (
        <>
          <span className="pointer-events-none absolute top-2 right-8 font-mono text-[8px] uppercase tracking-wider text-text-primary/20">{quadrants[0]}</span>
          <span className="pointer-events-none absolute top-2 left-[72px] font-mono text-[8px] uppercase tracking-wider text-text-primary/20">{quadrants[1]}</span>
          <span className="pointer-events-none absolute bottom-[42px] left-[72px] font-mono text-[8px] uppercase tracking-wider text-text-primary/20">{quadrants[2]}</span>
          <span className="pointer-events-none absolute bottom-[42px] right-8 font-mono text-[8px] uppercase tracking-wider text-text-primary/20">{quadrants[3]}</span>
        </>
      )}
    </div>
  );
}

function Bubble({ model, colorBy, onPick }) {
  return (
    <>
      <MarketScatter model={model} xKey="flow_intensity" yKey="price_change_24h" colorKey={colorBy}
        onPick={onPick} logX height={560} labelTop={14}
        quadrants={["🔥 Hot money · rising", "Quiet climbers", "Fading · ignored", "Heavy churn · falling"]} />
      <div className="text-center font-mono text-[9px] uppercase tracking-wider text-text-muted/70 mt-1">
        X = turnover (Vol/MCap, log) · Y = 24h momentum · size = market cap · color = {METRICS[colorBy].lbl} · dashed = median · labels = largest caps · click → latest call
      </div>
    </>
  );
}

// ── Matrix (koin × metrik) ──
const MX_COLS = ["win_rate", "flow_intensity", "btc_align", "max_target", "from_call", "price_change_24h"];
function Matrix({ model, onPick }) {
  const [sortK, setSortK] = useState("win_rate");
  const [dir, setDir] = useState(-1);
  const rows = [...model].sort((a, b) => ((METRICS[sortK].get(a) ?? -1e9) - (METRICS[sortK].get(b) ?? -1e9)) * dir);
  return (
    <div className="max-h-[560px] overflow-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15">
      <table className="w-full border-separate" style={{ borderSpacing: 0 }}>
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 bg-surface px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-wide text-text-primary/55">
              Pair
            </th>
            {MX_COLS.map((k) => (
              <th
                key={k}
                onClick={() => {
                  setDir(sortK === k ? -dir : -1);
                  setSortK(k);
                }}
                className="sticky top-0 z-20 cursor-pointer whitespace-nowrap bg-surface px-1.5 py-2.5 text-center font-mono text-[10px] font-medium uppercase tracking-wide text-text-primary/55 hover:text-text-primary"
              >
                {METRICS[k].lbl}
                {sortK === k ? (dir < 0 ? " ▼" : " ▲") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.signal_id}>
              <td
                onClick={() => onPick(d)}
                className="sticky left-0 z-10 cursor-pointer bg-surface px-3 py-1 font-mono text-[12px] font-bold text-text-primary hover:text-white"
              >
                <span className="flex items-center gap-2">
                  <CoinLogo pair={d.pair} size={20} />
                  <span>{d.sym}</span>
                </span>
              </td>
              {MX_COLS.map((k) => {
                const raw = METRICS[k].get(d);
                const txt = raw == null || Number.isNaN(raw) ? "—" : METRICS[k].fmt(raw);
                const missing = txt === "—";
                return (
                  <td key={k} className="p-0 text-center">
                    <div onClick={() => onPick(d)} className="m-1 h-9 rounded-md flex items-center justify-center font-mono text-[12px] font-bold cursor-pointer hover:outline hover:outline-1 hover:outline-white transition-transform hover:-translate-y-0.5"
                      style={missing ? { background: "rgb(var(--surface-hover))", color: "#6b6259" } : { background: colorByMetric(d, k, model), color: "rgb(var(--surface))" }}>
                      {txt}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sector view (group signals by verdict/risk since sector needs category join) ──
function SectorView({ model, colorBy, onPick }) {
  const groups = {};
  model.forEach((d) => { const k = d.risk ? d.risk.toUpperCase() : "UNKNOWN"; (groups[k] = groups[k] || []).push(d); });
  const order = ["LOW", "NORMAL", "MEDIUM", "HIGH", "UNKNOWN"];
  const keys = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {keys.map((k) => {
        const list = [...groups[k]].sort((a, b) => (METRICS[colorBy].get(b) ?? 0) - (METRICS[colorBy].get(a) ?? 0));
        const mx = Math.max(...list.map((d) => Math.abs(METRICS[colorBy].get(d) ?? 0)), 1);
        return (
          <div key={k} className="bg-surface border border-white/[0.06] rounded-xl p-3">
            <div className="font-mono text-xs font-semibold text-text-primary mb-0.5">{k} risk</div>
            <div className="font-mono text-[9px] uppercase tracking-wide text-text-primary/35 mb-2">{list.length} signals</div>
            <div className="max-h-[300px] space-y-1.5 overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15">
              {list.map((d) => {
                const v = METRICS[colorBy].get(d) ?? 0;
                return (
                  <div key={d.signal_id} onClick={() => onPick(d)} className="group flex cursor-pointer items-center gap-2">
                    <span className="flex w-20 shrink-0 items-center gap-1.5">
                      <CoinLogo pair={d.pair} size={15} />
                      <span className="truncate font-mono text-[11px] text-text-primary/70 group-hover:text-white">{d.sym}</span>
                    </span>
                    <div className="flex-1 h-3.5 rounded bg-white/[0.04] overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${(Math.abs(v) / mx) * 100}%`, background: colorByMetric(d, colorBy, model) }} />
                    </div>
                    <span className="font-mono text-[10px] w-14 text-right text-text-primary/70">{METRICS[colorBy].fmt(v)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Data Explorer — pick any metric for X / Y / color, size = market cap ──
function MetricPick({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-primary/35">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-surface-raised border border-white/[0.12] rounded-md font-mono text-[11px] text-text-primary/85 px-2 py-1.5 pr-6 focus:outline-none focus:border-line/40 cursor-pointer">
        {Object.entries(METRICS).map(([k, m]) => <option key={k} value={k} className="bg-surface">{m.lbl}</option>)}
      </select>
    </label>
  );
}
function ExploreView({ model, onPick }) {
  const [xk, setXk] = useState("flow_intensity");
  const [yk, setYk] = useState("win_rate");
  const [ck, setCk] = useState("price_change_24h");
  const [logX, setLogX] = useState(true);
  const [labels, setLabels] = useState(true);
  const mx = METRICS[xk], my = METRICS[yk];
  const toggle = (on) =>
    `font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-md border transition-colors ${
      on
        ? "text-text-primary bg-white/[0.1] border-white/20 font-semibold"
        : "text-text-primary/55 bg-white/[0.02] border-white/[0.1] hover:border-white/20"
    }`;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <MetricPick label="X" value={xk} onChange={setXk} />
        <MetricPick label="Y" value={yk} onChange={setYk} />
        <MetricPick label="Color" value={ck} onChange={setCk} />
        <button onClick={() => setLogX((v) => !v)} className={toggle(logX)}>{logX ? "Log X" : "Lin X"}</button>
        <button onClick={() => setLabels((v) => !v)} className={toggle(labels)}>Labels</button>
      </div>
      <MarketScatter model={model} xKey={xk} yKey={yk} colorKey={ck} onPick={onPick} logX={logX} height={560} labelTop={labels ? 12 : 0} />
      <div className="text-center font-mono text-[9px] uppercase tracking-wider text-text-muted/70 mt-1">
        X = {mx.lbl} · Y = {my.lbl} · color = {METRICS[ck].lbl} · size = market cap · dashed = median · click → latest call
      </div>
    </>
  );
}

// ── Screener table ──
const SCR = [["sym", "Pair"], ["status", "Status"], ["price_change_24h", "Δ24h"], ["from_call", "From Call"], ["win_rate", "WR"], ["flow_intensity", "Vol/MC"], ["btc_align", "BTC"], ["max_target", "Max Tgt"], ["market_cap", "MCap"]];
function Screener({ model, onPick }) {
  const [sortK, setSortK] = useState("market_cap");
  const [dir, setDir] = useState(-1);
  const val = (d, k) => (k === "sym" ? d.sym : k === "status" ? d.status : (METRICS[k]?.get(d) ?? 0));
  const rows = [...model].sort((a, b) => {
    const va = val(a, sortK), vb = val(b, sortK);
    if (typeof va === "string") return String(va).localeCompare(vb) * dir;
    return ((va ?? -1e9) - (vb ?? -1e9)) * dir;
  });
  const stColor = (s) => ({ open: "#60a5fa", tp1: "#34d399", tp2: "#34d399", tp3: "#34d399", closed_win: "#34d399", closed_loss: "#f87171" }[s] || "#9ca3af");
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-surface-raised">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5">
        <span className="text-[12.5px] font-medium text-text-primary/90">Signal Screener</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{model.length} pairs</span>
      </div>
      <div className="max-h-[440px] overflow-auto px-2 pb-2 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15">
        <table className="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr>
              {SCR.map(([k, l], i) => (
                <th
                  key={k}
                  onClick={() => {
                    setDir(sortK === k ? -dir : -1);
                    setSortK(k);
                  }}
                  className={`${i === 0 ? "text-left" : "text-right"} sticky top-0 z-10 cursor-pointer whitespace-nowrap border-b border-white/[0.08] bg-surface-raised px-2 py-2 text-[9px] font-medium uppercase tracking-wide text-text-primary/40 hover:text-text-primary`}
                >
                  {l}
                  {sortK === k ? (dir < 0 ? " ▼" : " ▲") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.signal_id} onClick={() => onPick(d)} className="cursor-pointer hover:bg-white/[0.03]">
                <td className="border-b border-white/[0.04] px-2 py-1.5 text-left">
                  <span className="flex items-center gap-1.5">
                    <CoinLogo pair={d.pair} size={16} />
                    <span className="font-bold text-text-primary">{d.sym}</span>
                  </span>
                </td>
                <td className="border-b border-white/[0.04] px-2 py-1.5 text-right">
                  <span className="rounded px-1.5 py-0.5 text-[9px] uppercase" style={{ color: stColor(d.status), border: `1px solid ${stColor(d.status)}` }}>
                    {d.status}
                  </span>
                </td>
                <td className="border-b border-white/[0.04] px-2 py-1.5 text-right" style={{ color: d.price_change_24h >= 0 ? "#34d399" : "#f87171" }}>
                  {d.price_change_24h >= 0 ? "+" : ""}
                  {d.price_change_24h.toFixed(1)}%
                </td>
                <td className="border-b border-white/[0.04] px-2 py-1.5 text-right" style={{ color: d.from_call == null ? "#8a8478" : d.from_call >= 0 ? "#34d399" : "#f87171" }}>
                  {d.from_call == null ? "—" : (d.from_call >= 0 ? "+" : "") + d.from_call.toFixed(1) + "%"}
                </td>
                <td className="border-b border-white/[0.04] px-2 py-1.5 text-right text-text-primary/90">
                  {d.win_rate == null ? "—" : d.win_rate.toFixed(0) + "%"}
                </td>
                <td className="border-b border-white/[0.04] px-2 py-1.5 text-right text-text-primary/80">{(d.flow_intensity * 100).toFixed(1)}%</td>
                <td className="border-b border-white/[0.04] px-2 py-1.5 text-right text-text-primary/80">{d.btc_align ?? "—"}</td>
                <td className="border-b border-white/[0.04] px-2 py-1.5 text-right text-emerald-400/90">+{d.max_target.toFixed(0)}%</td>
                <td className="border-b border-white/[0.04] px-2 py-1.5 text-right text-text-primary/80">${shortNum(d.market_cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
