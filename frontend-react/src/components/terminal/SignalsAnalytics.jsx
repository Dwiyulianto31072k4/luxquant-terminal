// ════════════════════════════════════════════════════════════════
// Signals Analytics — the VISUAL layer of Potential Trades (7-day
// window). Side-nav tabs live in TerminalLayout; shared atoms in
// vizShared.jsx; derivatives tabs in DerivTabs.jsx.
//
//   · Fixed 7d, scope=all (TP4/SL included) — Potential Trades parity
//   · CoinLogo everywhere; click coin/dot → latest call (SignalModal)
//   · XCard expand + scatter zoom · quarantined suspects · medians
//   · Derivatives blob (funding/OI/LSR/taker/RSI) precomputed by the
//     backend worker — never empty (fresh → stale → warming notice)
//   · localStorage hydration: charts render instantly from the last
//     session's data, refresh happens silently in the background
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ScatterChart, Scatter, ReferenceLine,
  FunnelChart, Funnel, LabelList,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  LineChart, Line,
} from "recharts";
import SignalModal from "../SignalModal";
import {
  API_BASE, authHeaders,
  GOLD, POS, NEG, PURPLE, ORANGE, CYAN, GRAYBAR, GRID, AXIS, TICK, TICK_SM,
  STATUS_ORDER, STATUS_LABEL, STATUS_COLORS, RISK_COLORS,
  fmtPct, median, parseMcap, csv, makeBins, PLAUSIBLE_LO, PLAUSIBLE_HI,
  SectionBand, Kpi, Chip, FilterMulti, DarkTip, ScatterTip, LegendChips,
  XCard, useZoom, CoinPill, RankBars, SectorBars, Donut, statusColorOf, fmtAxis,
} from "./vizShared";
import { OITab, LongShortTab, FundingTab, VsBtcTab, MomentumTab, SqueezeTab } from "./DerivTabs";
import { ConfluenceTab } from "./ConfluenceTabs";
import { EdgeTab } from "./EdgeSimulator";
import { RiskTab } from "./RiskCalculator";
import { RsiHeatmapTab, AtrLevelsTab, VolSqueezeTab, OrderFlowTab } from "./Screeners";
import { useSignalStatus } from "../../context/SignalStatusContext";

// ── Market Regime gauge — fuses altseason, BTC dominance, breadth (calls in
// profit) and aggregate funding into one risk-on/off score so users read the
// backdrop before taking a call. All inputs already computed in-house.
function RegimeGauge({ macro, pairFc, deriv }) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const btcDom = macro?.btc_dominance ?? null;
  const alt = macro?.altseason_index ?? null;
  const fcs = Object.values(pairFc || {});
  const breadth = fcs.length ? (fcs.filter((v) => v > 0).length / fcs.length) * 100 : null;
  const fund = deriv?.pairs ? Object.values(deriv.pairs).map((p) => p.funding).filter((v) => v != null) : [];
  const avgFund = fund.length ? fund.reduce((a, b) => a + b, 0) / fund.length : null;

  const altScore = alt != null ? clamp(alt, 0, 100) : null;
  const domScore = btcDom != null ? clamp(((65 - btcDom) / 20) * 100, 0, 100) : null; // 45%→100, 65%→0
  const breadthScore = breadth;
  const fundScore = avgFund != null ? clamp(50 + avgFund * 100 * 500, 0, 100) : null;

  const parts = [[altScore, 0.35], [domScore, 0.25], [breadthScore, 0.25], [fundScore, 0.15]].filter(([v]) => v != null);
  const wsum = parts.reduce((a, [, w]) => a + w, 0) || 1;
  const regime = parts.length ? parts.reduce((a, [v, w]) => a + v * w, 0) / wsum : null;
  const regColor = regime == null ? "#9ca3af" : regime >= 65 ? "#34d399" : regime >= 45 ? "#d4a853" : "#f87171";
  const label = regime == null ? "—" : regime >= 65 ? "Risk-On · Alt Season" : regime >= 52 ? "Constructive" : regime >= 42 ? "Neutral" : "Risk-Off · BTC-led";

  const comp = (lbl, score, raw) => (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-2.5 py-2">
      <div className="font-mono text-[8.5px] uppercase tracking-wider text-text-muted">{lbl}</div>
      <div className="font-mono text-[13px] text-white/90 mt-0.5">{raw}</div>
      <div className="h-1 rounded-full bg-white/[0.06] mt-1.5 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${score || 0}%`, background: regColor }} /></div>
    </div>
  );

  return (
    <div className="relative rounded-2xl bg-[#0a0805] border border-white/[0.07] overflow-hidden p-4">
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
      <div className="flex items-end justify-between mb-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-text-muted">Market Regime</div>
          <div className="text-[28px] font-mono tabular-nums leading-none mt-1" style={{ color: regColor }}>{regime == null ? "—" : Math.round(regime)}<span className="text-[13px] text-white/40"> / 100</span></div>
          <div className="text-[12px] mt-1" style={{ color: regColor }}>{label}</div>
        </div>
        <div className="text-right font-mono text-[9px] uppercase tracking-wider text-text-muted/70 leading-relaxed hidden sm:block">take calls with<br />the backdrop</div>
      </div>
      <div className="relative h-3 rounded-full overflow-hidden" style={{ background: "linear-gradient(90deg,#f87171,#d4a853,#34d399)" }}>
        {regime != null && <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-5 rounded-sm bg-white shadow-lg" style={{ left: `${regime}%` }} />}
      </div>
      <div className="flex justify-between font-mono text-[8px] uppercase tracking-wider text-text-muted/60 mt-1"><span>risk-off · btc</span><span>neutral</span><span>risk-on · alts</span></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
        {comp("Altseason", altScore, alt != null ? alt.toFixed(0) : "—")}
        {comp("BTC Dom (inv)", domScore, btcDom != null ? btcDom.toFixed(0) + "%" : "—")}
        {comp("Calls in profit", breadthScore, breadth != null ? breadth.toFixed(0) + "%" : "—")}
        {comp("Avg funding", fundScore, avgFund != null ? (avgFund * 100).toFixed(3) + "%" : "—")}
      </div>
    </div>
  );
}

// ── URL-synced global filters (window FIXED at 7d) ─────────────────
const DEFAULTS = { tab: "confluence", st: "all", sectors: "", risks: "", dec: "", q: "" };
const parseF = (sp) => {
  const f = { ...DEFAULTS };
  Object.keys(DEFAULTS).forEach((k) => { const v = sp.get(k); if (v != null) f[k] = v; });
  return f;
};
const toParams = (f) => {
  const p = new URLSearchParams();
  Object.keys(DEFAULTS).forEach((k) => { if (f[k] !== DEFAULTS[k]) p.set(k, f[k]); });
  return p;
};

// ── localStorage hydration (never show empty on revisit) ───────────
const LS_KEY = "lq:terminal:v4";
const hydrate = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw);
    if (Date.now() - (j.ts || 0) > 24 * 3600e3) return {};
    return j;
  } catch { return {}; }
};

// ════════════════════════════════════════════════════════════════
export default function SignalsAnalytics() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => parseF(searchParams));
  const tab = searchParams.get("tab") || "confluence";
  const setF = (patch) => {
    const next = { ...filters, ...patch, tab };
    setFilters(next);
    setSearchParams(toParams(next), { replace: true });
  };
  const resetF = () => setF({ ...DEFAULTS, tab });

  // hydrate last session instantly, refresh silently.
  // ONE backend worker fills EVERYTHING (prices, 15m movers, volume spikes,
  // funding/OI/LSR/RSI) into a Redis blob every minute — the page only READS.
  const seedRef = useRef(hydrate());
  const [data, setData] = useState(seedRef.current.data || null);
  const [deriv, setDeriv] = useState(seedRef.current.deriv || null);
  const [postsignal, setPostsignal] = useState(seedRef.current.postsignal || null);
  const [loading, setLoading] = useState(!seedRef.current.data);
  const [error, setError] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  // multi-day window: which "days-ago" buckets (0=today … 6=6d ago) are on.
  // Default = all 7 days. Signals live max 7d, so this is the full range.
  const [dayBuckets, setDayBuckets] = useState(() => [0, 1, 2, 3, 4, 5, 6]);
  const toggleDay = (d) =>
    setDayBuckets((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
  const { map: statusMap } = useSignalStatus() || {}; // pair→status for scatter-dot rings

  // persist to localStorage
  useEffect(() => {
    if (!data) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), data, deriv, postsignal }));
    } catch { /* quota — skip */ }
  }, [data, deriv, postsignal]);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/terminal/screener?days=7&scope=all`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`http ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e.message || "failed");
    } finally {
      setLoading(false);
    }
  }, []);
  const fetchDeriv = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/terminal/derivatives`, { headers: authHeaders() });
      if (r.ok) {
        const j = await r.json();
        // keep last good blob while backend is warming after a cold boot
        setDeriv((prev) => (j.warming && prev?.pairs && Object.keys(prev.pairs).length ? prev : j));
      }
    } catch { /* keep previous */ }
  }, []);
  const fetchPostsignal = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/terminal/postsignal`, { headers: authHeaders() });
      if (r.ok) {
        const j = await r.json();
        // keep last good blob while the worker is warming (heavy ~6h pass)
        setPostsignal((prev) => (j.warming && prev?.pairs && Object.keys(prev.pairs).length ? prev : j));
      }
    } catch { /* keep previous */ }
  }, []);
  const [macro, setMacro] = useState(null);
  const fetchMacro = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/money-flow/macro`, { headers: authHeaders() });
      if (r.ok) setMacro(await r.json());
    } catch { /* keep previous */ }
  }, []);
  const [liq, setLiq] = useState(null);
  const fetchLiq = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/terminal/liquidations`, { headers: authHeaders() });
      if (r.ok) setLiq(await r.json());
    } catch { /* keep previous */ }
  }, []);
  const [cvd, setCvd] = useState(null);
  const fetchCvd = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/terminal/cvd`, { headers: authHeaders() });
      if (r.ok) setCvd(await r.json());
    } catch { /* keep previous */ }
  }, []);
  useEffect(() => {
    fetchData();
    fetchDeriv();
    fetchPostsignal();
    fetchMacro();
    fetchLiq();
    fetchCvd();
    const ivData = setInterval(fetchData, 60000);
    const ivDeriv = setInterval(fetchDeriv, 30000); // cheap: pure Redis read
    const ivPs = setInterval(fetchPostsignal, 300000); // 5 min: pure Redis read
    const ivMacro = setInterval(fetchMacro, 300000);
    const ivLiq = setInterval(fetchLiq, 6000); // live tape
    const ivCvd = setInterval(fetchCvd, 8000); // live order flow
    return () => { clearInterval(ivData); clearInterval(ivDeriv); clearInterval(ivPs); clearInterval(ivMacro); clearInterval(ivLiq); clearInterval(ivCvd); };
  }, [fetchData, fetchDeriv, fetchPostsignal, fetchMacro, fetchLiq, fetchCvd]);

  const items = data?.items || [];

  // latest call per pair
  const latestByPair = useMemo(() => {
    const m = {};
    items.forEach((s) => {
      if (!m[s.pair] || (s.created_at || "") > (m[s.pair].created_at || "")) m[s.pair] = s;
    });
    return m;
  }, [items]);

  // open a SPECIFIC signal row (by its own signal_id) — used by the confluence
  // cards so the modal always matches the card's status (a pair can have >1
  // signal in 7d; latest-by-pair could differ from the card's).
  const openSignalRow = useCallback(async (base) => {
    if (!base?.signal_id) return;
    try {
      const r = await fetch(`${API_BASE}/api/v1/signals/detail/${base.signal_id}`, { headers: authHeaders() });
      const full = r.ok ? await r.json() : {};
      setSelectedSignal({ ...base, ...full });
    } catch {
      setSelectedSignal(base);
    }
  }, []);

  const openPair = useCallback((pair) => {
    const base = latestByPair[pair];
    if (base) openSignalRow(base);
  }, [latestByPair, openSignalRow]);

  // ── everything live comes from the worker blob (no client polling) ──
  const liveOf = useCallback((pair) => {
    const d = deriv?.pairs?.[pair];
    if (!d?.price) return null;
    return { price: d.price, volume: d.vol24h, change: d.price_chg_24h };
  }, [deriv]);

  const fcOf = useCallback((s) => {
    const lv = liveOf(s.pair);
    if (!lv?.price || !s.entry) return { v: null, suspect: false };
    const ratio = lv.price / s.entry;
    if (ratio > PLAUSIBLE_HI || ratio < PLAUSIBLE_LO) return { v: (ratio - 1) * 100, suspect: true };
    return { v: (ratio - 1) * 100, suspect: false };
  }, [liveOf]);

  // ── global-filtered view ───────────────────────────────────────
  const selSectors = csv(filters.sectors);
  const selRisks = csv(filters.risks);
  const view = useMemo(() => {
    let out = items;
    const f = filters;
    if (f.q) {
      const q = f.q.trim().toUpperCase();
      out = out.filter((s) => (s.pair || "").toUpperCase().includes(q));
    }
    if (f.st !== "all") out = out.filter((s) => s.status === f.st);
    if (selRisks.length) out = out.filter((s) => selRisks.includes(s.risk_norm));
    if (selSectors.length) out = out.filter((s) => selSectors.includes(s.sector || "unclassified"));
    if (f.dec === "1") out = out.filter((s) => s.is_decoupled);
    // multi-day window — keep signals whose age falls in a selected day bucket
    if (dayBuckets.length > 0 && dayBuckets.length < 7) {
      const set = new Set(dayBuckets);
      const now = Date.now();
      out = out.filter((s) => {
        const ts = Date.parse(s.created_at || "");
        if (!ts) return true;
        const bucket = Math.min(6, Math.max(0, Math.floor((now - ts) / 86400000)));
        return set.has(bucket);
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, filters, dayBuckets]);

  const sectorOptions = useMemo(() => {
    const s = new Set(items.map((i) => i.sector || "unclassified"));
    return [...s].sort();
  }, [items]);

  // fc per pair (latest call, plausible only) — feeds derivatives tabs
  const pairFc = useMemo(() => {
    const m = {};
    Object.values(latestByPair).forEach((s) => {
      const { v, suspect } = fcOf(s);
      if (v != null && !suspect) m[s.pair] = v;
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestByPair, deriv]);

  // ── aggregations (suspect-aware, median-based) ─────────────────
  const agg = useMemo(() => {
    const byDay = {};
    const statusMix = Object.fromEntries(STATUS_ORDER.map((k) => [k, 0]));
    const riskMix = { LOW: 0, NORMAL: 0, HIGH: 0 };
    const bySector = {};
    let decoupled = 0, extended = 0, leads = 0, betaN = 0, betaSum = 0;
    const fcVals = [], betaVals = [], alignVals = [], tt1Vals = [], maeVals = [];
    const scatterOpp = [], scatterBeta = [], anomPts = [], peakPts = [];
    const suspects = [], moversArr = [], rsArr = [], decoupledList = [];
    const btcChg = deriv?.btc?.chg ?? liveOf("BTCUSDT")?.change ?? null;
    const seenPair = new Set();

    view.forEach((s) => {
      const day = (s.created_at || "").slice(5, 10);
      if (day) {
        byDay[day] = byDay[day] || Object.fromEntries([["day", day], ...STATUS_ORDER.map((k) => [k, 0])]);
        if (byDay[day][s.status] != null) byDay[day][s.status] += 1;
      }
      if (statusMix[s.status] != null) statusMix[s.status] += 1;
      if (s.risk_norm && riskMix[s.risk_norm] != null) riskMix[s.risk_norm] += 1;
      const sec = s.sector || "unclassified";
      bySector[sec] = bySector[sec] || { sector: sec, count: 0, fcs: [], tgts: [] };
      bySector[sec].count += 1;

      if (s.is_decoupled) decoupled += 1;
      if (s.is_extended) extended += 1;
      if (s.lead_lag_hours != null && s.lead_lag_hours < 0) leads += 1;
      if (s.beta_30d != null) { betaSum += s.beta_30d; betaN += 1; betaVals.push(s.beta_30d); }
      if (s.alignment_score != null) alignVals.push(s.alignment_score);
      if (s.max_target_pct != null) bySector[sec].tgts.push(s.max_target_pct);
      if (s.time_to_tp1_seconds != null && s.time_to_tp1_seconds > 0)
        tt1Vals.push(Math.min(s.time_to_tp1_seconds / 3600, 48));
      if (s.initial_mae_pct != null) maeVals.push(s.initial_mae_pct);

      const { v, suspect } = fcOf(s);
      if (v != null && suspect) {
        if (!seenPair.has(`sus:${s.pair}`)) {
          seenPair.add(`sus:${s.pair}`);
          suspects.push({ pair: s.pair, v });
        }
        return;
      }
      if (v != null) {
        fcVals.push(v);
        bySector[sec].fcs.push(v);
        if (s.max_target_pct != null)
          scatterOpp.push({ x: v, y: Math.max(0, s.max_target_pct - v), pair: s.pair, risk: s.risk_norm });
        if (s.beta_30d != null)
          scatterBeta.push({ x: s.beta_30d, y: v, pair: s.pair, dec: s.is_decoupled });
        if (s.peak_pct != null && s.peak_pct > -50 && s.peak_pct < 300 && v >= -95 && v <= 300)
          peakPts.push({ x: s.peak_pct, y: v, pair: s.pair, win: s.status === "closed_win" });
        if (!seenPair.has(s.pair)) {
          seenPair.add(s.pair);
          moversArr.push({ pair: s.pair, v });
          if (s.is_decoupled) decoupledList.push({ pair: s.pair, v });
          const lv = liveOf(s.pair);
          const mcap = parseMcap(s.market_cap);
          if (lv?.change != null && lv?.volume && mcap && mcap > 0) {
            // clamp so a single micro-cap outlier can't blow up the whole axis
            const volPct = Math.min((lv.volume / mcap) * 100, 150);
            if (Number.isFinite(volPct)) anomPts.push({ x: lv.change, y: volPct, pair: s.pair, dec: s.is_decoupled, sector: sec });
          }
          if (lv?.change != null && btcChg != null && s.pair !== "BTCUSDT") {
            rsArr.push({ pair: s.pair, v: lv.change - btcChg });
          }
        }
      }
    });

    const flows = anomPts.map((p) => p.y);
    const medFlow = median(flows) || 0;
    anomPts.forEach((p) => { p.hot = medFlow > 0 && p.y > medFlow * 3 && p.x > 5; });

    const days = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
    // cumulative daily outcome balance (tp4 wins − sl losses)
    let cum = 0;
    const equity = days.map((d) => {
      cum += (d.closed_win || 0) - (d.closed_loss || 0);
      return { day: d.day, bal: cum };
    });
    const sectors = Object.values(bySector)
      .map((x) => ({ sector: x.sector, count: x.count, medFc: median(x.fcs), medTgt: median(x.tgts) }))
      .sort((a, b) => b.count - a.count);

    const reached = (lvls) => lvls.reduce((a, k) => a + (statusMix[k] || 0), 0);
    const funnel = [
      { name: "Called", value: view.length, fill: GRAYBAR },
      { name: "TP1+", value: reached(["tp1", "tp2", "tp3", "closed_win"]), fill: "#2dd4a0" },
      { name: "TP2+", value: reached(["tp2", "tp3", "closed_win"]), fill: "#4ade80" },
      { name: "TP3+", value: reached(["tp3", "closed_win"]), fill: "#86efac" },
      { name: "TP4", value: statusMix.closed_win || 0, fill: GOLD },
    ];
    const closedN = (statusMix.closed_win || 0) + (statusMix.closed_loss || 0);
    const winRate = closedN ? Math.round(((statusMix.closed_win || 0) / closedN) * 100) : null;

    return {
      days, equity, statusMix, riskMix, sectors, funnel, winRate, closedN,
      decoupled, extended, leads,
      avgBeta: betaN ? betaSum / betaN : null,
      medFc: median(fcVals), fcN: fcVals.length,
      fcVals, betaVals, alignVals, tt1Vals,
      maeMed: median(maeVals),
      scatterOpp, scatterBeta, anomPts, peakPts, medFlow,
      suspects: suspects.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)),
      movers: moversArr, rs: rsArr,
      decoupledList: decoupledList.sort((a, b) => b.v - a.v),
      btcChg,
      btcPrice: deriv?.btc?.price ?? liveOf("BTCUSDT")?.price ?? null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, deriv]);

  // ── live session layers — PRECOMPUTED server-side by the worker ──
  // (chg_15m & spike_15m ship in the blob → no client warm-up ever)
  const session = useMemo(() => {
    const seen = new Set();
    const movers15 = [];
    const spikes = [];
    view.forEach((s) => {
      if (!s.pair || seen.has(s.pair)) return;
      seen.add(s.pair);
      const d = deriv?.pairs?.[s.pair];
      if (!d) return;
      if (d.chg_15m != null) movers15.push({ pair: s.pair, v: d.chg_15m });
      if (d.spike_15m != null && d.spike_15m > 1.5) spikes.push({ pair: s.pair, v: d.spike_15m });
    });
    return {
      spikes: spikes.sort((a, b) => b.v - a.v).slice(0, 10),
      gain15: movers15.sort((a, b) => b.v - a.v).slice(0, 8),
      lose15: movers15.sort((a, b) => a.v - b.v).slice(0, 8),
      warming: !deriv || deriv.warming || movers15.length === 0,
    };
  }, [view, deriv]);

  const gainers = useMemo(() => [...agg.movers].sort((a, b) => b.v - a.v).slice(0, 8), [agg.movers]);
  const losers = useMemo(() => [...agg.movers].sort((a, b) => a.v - b.v).slice(0, 8), [agg.movers]);
  const rsTop = useMemo(() => [...agg.rs].sort((a, b) => b.v - a.v).slice(0, 8), [agg.rs]);
  const rsBottom = useMemo(() => [...agg.rs].sort((a, b) => a.v - b.v).slice(0, 8), [agg.rs]);
  // top-10 |movers| → default selection of the vs-BTC chart
  const moversAbs = useMemo(
    () => [...agg.movers].sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 10),
    [agg.movers],
  );

  const hasDrill = ["st", "sectors", "risks", "dec", "q"].some((k) => filters[k] !== DEFAULTS[k]);
  const fcClamped = useMemo(() => agg.fcVals.filter((v) => v >= -95 && v <= 300), [agg.fcVals]);
  // robust live-performance metrics (ignore implausible suspects)
  const liveStats = useMemo(() => {
    const n = fcClamped.length;
    return {
      n,
      up: fcClamped.filter((v) => v > 0).length,
      down: fcClamped.filter((v) => v < 0).length,
      bigWin: fcClamped.filter((v) => v > 10).length,
      bigLoss: fcClamped.filter((v) => v < -10).length,
    };
  }, [fcClamped]);
  // share of calls in window that have reached at least TP1
  const tpHitPct = useMemo(() => {
    if (!view.length) return null;
    const hit = view.filter((s) => ["tp1", "tp2", "tp3", "closed_win"].includes(s.status)).length;
    return Math.round((hit / view.length) * 100);
  }, [view]);
  // "coiled" = high-confluence, clean setups still sitting near entry (not pumped)
  const coiledCount = useMemo(() => {
    const STRONG = ["HTF_TREND_STRONG", "MTF_FULL_ALIGNED", "SMC_GOLDEN_SETUP"];
    const WARN = ["LATE_ENTRY", "OVEREXTENDED", "PARABOLIC", "EXHAUSTION_CANDLE", "LIQ_VERY_LOW", "LIQ_LOW", "RISK_OFF_REGIME", "HTF_TREND_EXHAUSTED", "MTF_AGAINST_HTF"];
    let n = 0;
    Object.values(latestByPair).forEach((s) => {
      const tags = s.v3?.tags || [];
      if (!tags.length || !STRONG.some((x) => tags.includes(x))) return;
      if (tags.some((x) => WARN.includes(x))) return;
      const fc = pairFc[s.pair];
      if (fc == null || fc < -5 || fc > 6) return;
      n += 1;
    });
    return n;
  }, [latestByPair, pairFc]);

  const zAnom = useZoom(-30, 30, 0, 60);
  const zOpp = useZoom(-60, 60, 0, 120);
  const zBeta = useZoom(-0.5, 2.5, -60, 60);
  const zPeak = useZoom(-20, 150, -60, 100);

  const derivProps = { view, deriv, pairFc, openPair, openSignalRow, liq };

  // ════════════════════════════════════════════════════════════
  return (
    <div className="space-y-3">
      {/* ── filter row + live BTC + freshness — sticky & solid (Allium) ── */}
      <div className="sticky top-0 z-30 flex items-center gap-2 flex-wrap bg-[#0a0806] border-b border-white/[0.07] px-1 py-2 -mx-0.5 rounded-b-md">
        <input
          value={filters.q}
          onChange={(e) => setF({ q: e.target.value })}
          placeholder={t("terminal.viz.searchPair")}
          className="w-36 bg-[#15120d] border border-white/[0.1] rounded-md px-3 py-1.5 text-[11.5px] text-white placeholder:text-text-muted/60 focus:outline-none focus:border-gold-primary/40 font-mono"
        />
        <div className="flex gap-1">
          {["all", ...STATUS_ORDER].map((s) => (
            <Chip key={s} active={filters.st === s} onClick={() => setF({ st: s })}>
              {s === "all" ? t("terminal.viz.all") : STATUS_LABEL[s] || s}
            </Chip>
          ))}
        </div>
        <span className="h-4 w-px bg-white/[0.08]" />
        {/* multi-day window — toggle any of the last 7 days (0 = today) */}
        <div className="flex items-center gap-0.5 rounded-md bg-[#0c0a07] border border-white/[0.1] p-0.5">
          <span className="px-1.5 font-mono text-[8.5px] uppercase tracking-[0.15em] text-text-muted/70">{t("terminal.viz.window")}</span>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => {
            const on = dayBuckets.includes(d);
            const dt = new Date(Date.now() - d * 86400000);
            const label = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }); // e.g. "Jul 11"
            return (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                title={d === 0 ? "today" : `${d} day${d > 1 ? "s" : ""} ago`}
                className={`px-1.5 py-1 rounded-sm font-mono text-[9px] tracking-wide transition-colors whitespace-nowrap ${
                  on ? "bg-gold-primary text-[#17110a] font-semibold" : "text-text-muted/60 hover:text-white"
                }`}
              >
                {label}
              </button>
            );
          })}
          <button
            onClick={() => setDayBuckets([0, 1, 2, 3, 4, 5, 6])}
            title="all 7 days"
            className={`px-1.5 py-1 rounded-sm font-mono text-[9px] uppercase tracking-wider transition-colors ${
              dayBuckets.length === 7 ? "text-gold-primary" : "text-text-muted/50 hover:text-white"
            }`}
          >
            all
          </button>
        </div>
        <span className="h-4 w-px bg-white/[0.08]" />
        <FilterMulti
          label={t("terminal.viz.filterSector")}
          options={sectorOptions}
          selected={selSectors}
          onChange={(arr) => setF({ sectors: arr.join(",") })}
        />
        <FilterMulti
          label={t("terminal.viz.filterRisk")}
          options={["LOW", "NORMAL", "HIGH"]}
          selected={selRisks}
          onChange={(arr) => setF({ risks: arr.join(",") })}
        />
        <Chip active={filters.dec === "1"} onClick={() => setF({ dec: filters.dec === "1" ? "" : "1" })}>
          ⚡ {t("terminal.viz.decoupled")}
        </Chip>
        {hasDrill && (
          <button
            onClick={resetF}
            className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted hover:text-negative transition-colors"
          >
            × {t("terminal.viz.reset")}
          </button>
        )}
        <div className="ml-auto hidden sm:flex items-center gap-3 font-mono text-[9px] uppercase tracking-wider text-text-muted/70">
          {agg.btcPrice && (
            <span>
              BTC <span className="text-white/80">${Number(agg.btcPrice).toLocaleString()}</span>{" "}
              <span className={agg.btcChg >= 0 ? "text-positive" : "text-negative"}>{fmtPct(agg.btcChg)}</span>
            </span>
          )}
          <span>{view.length} {t("terminal.viz.signals")}</span>
          {data?.generated_at && (
            <span>
              {t("terminal.viz.updBadge")} {new Date(data.generated_at).toLocaleTimeString()}
              {deriv?.stale && <span className="text-warning"> · {t("terminal.viz.staleBadge")}</span>}
            </span>
          )}
        </div>
      </div>

      {/* ── loading / error (only when nothing hydrated) ── */}
      {loading && !data && (
        <div className="rounded-lg bg-[#0c0a07] border border-white/[0.07] py-24 flex flex-col items-center gap-3">
          <div className="w-6 h-6 border border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{t("terminal.viz.loading")}</span>
        </div>
      )}
      {error && !data && (
        <div className="rounded-lg border border-negative/25 bg-negative/[0.06] px-4 py-3 flex items-center gap-3">
          <span className="font-mono text-[11px] text-negative">⚠ {t("terminal.viz.error")}</span>
          <button
            onClick={fetchData}
            className="px-3 py-1 rounded-sm font-mono text-[10px] uppercase tracking-wider bg-negative/15 text-negative border border-negative/30"
          >
            ↻
          </button>
        </div>
      )}

      {data && (
        <>
          {/* ═══════════ CONFLUENCE SCREENER (landing) ═══════════ */}
          {tab === "confluence" && (
            <ConfluenceTab {...derivProps} postsignal={postsignal} openPair={openPair} />
          )}

          {/* ═══════════ OVERVIEW ═══════════ */}
          {tab === "overview" && (
            <>
              <RegimeGauge macro={macro} pairFc={pairFc} deriv={deriv} />
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi label={t("terminal.viz.kActive")} value={view.length} desc={t("terminal.viz.kActiveDesc")} />
                <Kpi
                  label={t("terminal.viz.kCoiled")}
                  value={coiledCount}
                  desc={t("terminal.viz.kCoiledDesc")}
                  tone={coiledCount ? "text-gold-primary" : undefined}
                />
                <Kpi
                  label={t("terminal.viz.kTpReached")}
                  value={tpHitPct == null ? "—" : `${tpHitPct}%`}
                  desc={t("terminal.viz.kTpReachedDesc")}
                  tone="text-positive"
                />
                <Kpi label={t("terminal.viz.kDecoupled")} value={agg.decoupled} desc={t("terminal.viz.kDecoupledDesc")} tone={agg.decoupled ? "text-cyan-400" : undefined} />
              </div>

              <XCard
                title={t("terminal.viz.flowTitle")}
                desc={t("terminal.viz.flowDesc")}
                render={(h) => (
                  <>
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={agg.days} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
                          <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                          {STATUS_ORDER.map((k, i) => (
                            <Bar key={k} dataKey={k} name={STATUS_LABEL[k]} stackId="s" fill={STATUS_COLORS[k]} radius={i === STATUS_ORDER.length - 1 ? [2, 2, 0, 0] : 0} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <LegendChips
                      entries={STATUS_ORDER.map((k) => ({ key: k, label: STATUS_LABEL[k], value: agg.statusMix[k], color: STATUS_COLORS[k] }))}
                      activeKey={filters.st}
                      onPick={(k) => setF({ st: filters.st === k ? "all" : k })}
                    />
                  </>
                )}
              />

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                <XCard
                  title={t("terminal.viz.funnelTitle")}
                  desc={t("terminal.viz.funnelDesc")}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <FunnelChart margin={{ top: 8, right: 90, left: 8, bottom: 8 }}>
                          <Tooltip content={<DarkTip />} />
                          <Funnel dataKey="value" data={agg.funnel} isAnimationActive={false}>
                            <LabelList
                              position="right"
                              dataKey="name"
                              fill={AXIS}
                              stroke="none"
                              fontSize={10}
                              fontFamily="JetBrains Mono"
                              formatter={(name) => name}
                            />
                          </Funnel>
                        </FunnelChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />
                <XCard
                  title={t("terminal.viz.statusTitle")}
                  desc={t("terminal.viz.statusDesc")}
                  render={(h) => (
                    <Donut
                      h={Math.max(150, h - 50)}
                      data={STATUS_ORDER.map((k) => ({ key: k, name: STATUS_LABEL[k], value: agg.statusMix[k], color: STATUS_COLORS[k] }))}
                      active={filters.st}
                      onPick={(k) => setF({ st: filters.st === k ? "all" : k })}
                    />
                  )}
                />
                <XCard
                  title={t("terminal.viz.riskTitle")}
                  desc={t("terminal.viz.riskDesc")}
                  render={(h) => (
                    <Donut
                      h={Math.max(150, h - 50)}
                      data={Object.entries(agg.riskMix).map(([k, v]) => ({ key: k, name: k, value: v, color: RISK_COLORS[k] }))}
                      active={selRisks.length === 1 ? selRisks[0] : null}
                      onPick={(k) => setF({ risks: selRisks.length === 1 && selRisks[0] === k ? "" : k })}
                    />
                  )}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.tt1Title")}
                  desc={t("terminal.viz.tt1Desc")}
                  hint={agg.maeMed != null ? `${t("terminal.viz.maeNote")}: ${fmtPct(agg.maeMed)}` : undefined}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={makeBins(agg.tt1Vals, 4, 0, 48)} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis dataKey="x" tick={TICK_SM} axisLine={false} tickLine={false} unit="h" />
                          <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                          <Bar dataKey="count" name="signals" fill={CYAN} fillOpacity={0.75} radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />
                <XCard
                  title={t("terminal.viz.equityTitle")}
                  desc={t("terminal.viz.equityDesc")}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={agg.days.map((d) => ({ day: d.day, tp1: d.tp1 || 0, tp2: d.tp2 || 0, tp3: d.tp3 || 0, tp4: d.closed_win || 0, sl: -(d.closed_loss || 0) }))} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} stackOffset="sign">
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
                          <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                          <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                          <Bar dataKey="tp1" name="TP1" stackId="a" fill="#2dd4a0" fillOpacity={0.9} />
                          <Bar dataKey="tp2" name="TP2" stackId="a" fill="#4ade80" fillOpacity={0.9} />
                          <Bar dataKey="tp3" name="TP3" stackId="a" fill="#86efac" fillOpacity={0.9} />
                          <Bar dataKey="tp4" name="TP4" stackId="a" fill={GOLD} fillOpacity={0.95} radius={[2, 2, 0, 0]} />
                          <Bar dataKey="sl" name="SL" stackId="a" fill={NEG} fillOpacity={0.9} radius={[0, 0, 2, 2]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />
              </div>

              <XCard
                title={t("terminal.viz.sectorCountTitle")}
                desc={t("terminal.viz.sectorCountDesc")}
                render={() => (
                  <SectorBars
                    data={agg.sectors.slice(0, 12)}
                    dataKey="count"
                    color={() => GOLD}
                    fmt={(v) => v}
                    onPick={(sec) => setF({ sectors: selSectors.includes(sec) ? "" : sec })}
                  />
                )}
              />
            </>
          )}

          {/* ═══════════ ANOMALY (LIVE) ═══════════ */}
          {tab === "anomaly" && (
            <>
              <SectionBand title={t("terminal.viz.sectionAnom")} desc={t("terminal.viz.sectionAnomDesc")} />

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi
                  label="BTC"
                  value={agg.btcPrice ? `$${Number(agg.btcPrice).toLocaleString()}` : "—"}
                  desc={t("terminal.viz.kBtcDesc")}
                  tone={agg.btcChg >= 0 ? "text-positive" : "text-negative"}
                />
                <Kpi label={t("terminal.viz.kHot")} value={agg.anomPts.filter((p) => p.hot).length} desc={t("terminal.viz.kHotDesc")} tone="text-gold-primary" />
                <Kpi label={t("terminal.viz.kSpikes")} value={session.spikes.length} desc={t("terminal.viz.kSpikesDesc")} tone={session.spikes.length ? "text-orange-400" : undefined} />
                <Kpi
                  label={t("terminal.viz.kSession")}
                  value={deriv?.generated_at ? `${Math.max(0, Math.round((Date.now() - Date.parse(deriv.generated_at)) / 1000))}s` : "—"}
                  desc={t("terminal.viz.kSessionDesc")}
                  tone={deriv?.stale ? "text-warning" : undefined}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.anomTitle")}
                  desc={t("terminal.viz.anomDesc")}
                  zoom={zAnom}
                  hint={t("terminal.viz.anomHint")}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                          <CartesianGrid stroke={GRID} />
                          <XAxis type="number" dataKey="x" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zAnom.domX} allowDataOverflow tickFormatter={fmtAxis} />
                          <YAxis type="number" dataKey="y" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zAnom.domY} allowDataOverflow tickFormatter={fmtAxis} />
                          <Tooltip content={<ScatterTip xLabel="chg 24h %" yLabel="vol/mcap %" />} cursor={{ strokeDasharray: "3 3", stroke: GOLD }} />
                          <ReferenceLine x={0} stroke={GOLD} strokeDasharray="3 3" />
                          {agg.medFlow > 0 && <ReferenceLine y={agg.medFlow * 3} stroke={ORANGE} strokeDasharray="3 3" />}
                          <Scatter data={agg.anomPts} fillOpacity={0.85} onClick={(p) => { const d = p?.payload || p; if (d?.pair) openPair(d.pair); }}>
                            {agg.anomPts.map((p, i) => { const sc = statusColorOf(statusMap, p.pair); return (
                              <Cell key={i} fill={p.hot ? GOLD : p.dec ? CYAN : GRAYBAR} stroke={sc || undefined} strokeWidth={sc ? 2 : 0} cursor="pointer" />
                            ); })}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />

                <XCard
                  title={t("terminal.viz.spikeTitle")}
                  desc={t("terminal.viz.spikeDesc")}
                  render={() =>
                    session.spikes.length === 0 ? (
                      <div className="py-14 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted leading-relaxed">
                        {session.warming ? t("terminal.viz.spikeWarming") : t("terminal.viz.none")}
                      </div>
                    ) : (
                      <RankBars data={session.spikes.map((s) => ({ ...s, color: ORANGE }))} fmt={(v) => `${v.toFixed(1)}`} suffix="×" onPair={openPair} />
                    )
                  }
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard title={t("terminal.viz.rsUpTitle")} desc={t("terminal.viz.rsUpDesc")} render={() => <RankBars data={rsTop} onPair={openPair} />} />
                <XCard title={t("terminal.viz.rsDownTitle")} desc={t("terminal.viz.rsDownDesc")} render={() => <RankBars data={rsBottom} onPair={openPair} />} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={`${t("terminal.viz.sessTitle")} ↑`}
                  desc={t("terminal.viz.sessDesc")}
                  render={() =>
                    session.warming ? (
                      <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">{t("terminal.viz.spikeWarming")}</div>
                    ) : (
                      <RankBars data={session.gain15} fmt={(v) => fmtPct(v, 2)} onPair={openPair} />
                    )
                  }
                />
                <XCard
                  title={`${t("terminal.viz.sessTitle")} ↓`}
                  desc={t("terminal.viz.sessDesc")}
                  render={() =>
                    session.warming ? (
                      <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">{t("terminal.viz.spikeWarming")}</div>
                    ) : (
                      <RankBars data={session.lose15} fmt={(v) => fmtPct(v, 2)} onPair={openPair} />
                    )
                  }
                />
              </div>
            </>
          )}

          {/* ═══════════ LIVE PERFORMANCE ═══════════ */}
          {tab === "live" && (
            <>
              <SectionBand title={t("terminal.viz.sectionLive")} desc={t("terminal.viz.sectionLiveDesc")} />

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi
                  label={t("terminal.viz.kBreadth")}
                  value={`${liveStats.up}▲ ${liveStats.down}▼`}
                  desc={t("terminal.viz.kBreadthDesc")}
                  tone={liveStats.up >= liveStats.down ? "text-positive" : "text-negative"}
                />
                <Kpi label={t("terminal.viz.kBest")} value={gainers[0] ? fmtPct(gainers[0].v) : "—"} desc={gainers[0]?.pair} tone="text-positive" />
                <Kpi label={t("terminal.viz.kBigWin")} value={liveStats.bigWin} desc={t("terminal.viz.kBigWinDesc")} tone={liveStats.bigWin ? "text-positive" : undefined} />
                <Kpi label={t("terminal.viz.kBigLoss")} value={liveStats.bigLoss} desc={t("terminal.viz.kBigLossDesc")} tone={liveStats.bigLoss ? "text-negative" : undefined} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.fcDistTitle")}
                  desc={t("terminal.viz.fcDistDesc")}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={makeBins(fcClamped, 2, -20, 20)} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis dataKey="x" tick={TICK_SM} axisLine={false} tickLine={false} />
                          <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                          <ReferenceLine x="0" stroke={GOLD} strokeDasharray="3 3" />
                          <Bar dataKey="count" name="signals" radius={[2, 2, 0, 0]}>
                            {makeBins(fcClamped, 2, -20, 20).map((b, i) => (
                              <Cell key={i} fill={b.mid >= 0 ? POS : NEG} fillOpacity={0.75} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />

                <XCard
                  title={t("terminal.viz.oppTitle")}
                  desc={t("terminal.viz.oppDesc")}
                  zoom={zOpp}
                  hint={t("terminal.viz.oppHint")}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                          <CartesianGrid stroke={GRID} />
                          <XAxis type="number" dataKey="x" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zOpp.domX} allowDataOverflow tickFormatter={fmtAxis} />
                          <YAxis type="number" dataKey="y" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zOpp.domY} allowDataOverflow tickFormatter={fmtAxis} />
                          <Tooltip content={<ScatterTip xLabel="Δ call %" yLabel="upside left %" />} cursor={{ strokeDasharray: "3 3", stroke: GOLD }} />
                          <ReferenceLine x={0} stroke={GOLD} strokeDasharray="3 3" />
                          <Scatter data={agg.scatterOpp} fillOpacity={0.8} onClick={(p) => { const d = p?.payload || p; if (d?.pair) openPair(d.pair); }}>
                            {agg.scatterOpp.map((p, i) => { const sc = statusColorOf(statusMap, p.pair); return (
                              <Cell key={i} fill={RISK_COLORS[p.risk] || GRAYBAR} stroke={sc || undefined} strokeWidth={sc ? 2 : 0} cursor="pointer" />
                            ); })}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />
              </div>

              <XCard
                title={t("terminal.viz.peakTitle")}
                desc={t("terminal.viz.peakDesc")}
                zoom={zPeak}
                hint={t("terminal.viz.peakHint")}
                render={(h) => (
                  <div style={{ height: Math.max(h, 280) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                        <CartesianGrid stroke={GRID} />
                        <XAxis type="number" dataKey="x" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zPeak.domX} allowDataOverflow tickFormatter={fmtAxis} />
                        <YAxis type="number" dataKey="y" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zPeak.domY} allowDataOverflow tickFormatter={fmtAxis} />
                        <Tooltip content={<ScatterTip xLabel="peak %" yLabel="now %" />} cursor={{ strokeDasharray: "3 3", stroke: GOLD }} />
                        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 150, y: 150 }]} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                        <ReferenceLine y={0} stroke={GOLD} strokeDasharray="3 3" />
                        <Scatter data={agg.peakPts} fillOpacity={0.8} onClick={(p) => { const d = p?.payload || p; if (d?.pair) openPair(d.pair); }}>
                          {agg.peakPts.map((p, i) => { const sc = statusColorOf(statusMap, p.pair); return (
                            <Cell key={i} fill={p.win ? GOLD : p.y >= 0 ? POS : NEG} stroke={sc || undefined} strokeWidth={sc ? 2 : 0} cursor="pointer" />
                          ); })}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
              />

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard title={t("terminal.viz.topGainers")} desc={t("terminal.viz.topGainersDesc")} render={() => <RankBars data={gainers} onPair={openPair} />} />
                <XCard title={t("terminal.viz.topLosers")} desc={t("terminal.viz.topLosersDesc")} render={() => <RankBars data={losers} onPair={openPair} />} />
              </div>

              {agg.suspects.length > 0 && (
                <XCard
                  title={t("terminal.viz.suspectTitle")}
                  desc={t("terminal.viz.suspectDesc")}
                  render={() => (
                    <div className="flex flex-wrap gap-1.5 py-2">
                      {agg.suspects.slice(0, 30).map((s) => (
                        <span key={s.pair} className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-warning/25 bg-warning/[0.06] font-mono text-[10px]">
                          <CoinPill pair={s.pair} onPair={openPair} />
                          <span className="text-text-muted">{fmtPct(s.v, 0)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                />
              )}
            </>
          )}

          {/* ═══════════ DERIVATIVES ═══════════ */}
          {tab === "oi" && <OITab {...derivProps} />}
          {tab === "ls" && <LongShortTab {...derivProps} />}
          {tab === "funding" && <FundingTab {...derivProps} />}
          {tab === "squeeze" && <SqueezeTab {...derivProps} />}
          {tab === "momentum" && <MomentumTab {...derivProps} />}
          {tab === "edge" && <EdgeTab />}
          {tab === "risk" && <RiskTab view={view} deriv={deriv} />}
          {tab === "rsi" && <RsiHeatmapTab view={view} deriv={deriv} openPair={openPair} />}
          {tab === "atr" && <AtrLevelsTab view={view} deriv={deriv} openPair={openPair} />}
          {tab === "vsqueeze" && <VolSqueezeTab view={view} deriv={deriv} openPair={openPair} />}
          {tab === "flow" && <OrderFlowTab view={view} deriv={deriv} cvd={cvd} openPair={openPair} />}
          {tab === "vsbtc" && <VsBtcTab {...derivProps} movers={moversAbs} />}

          {/* ═══════════ BTC CORRELATION → merged under Sectors? keep own ═══════════ */}
          {tab === "btc" && (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi label={t("terminal.viz.kAvgBeta")} value={agg.avgBeta != null ? agg.avgBeta.toFixed(2) : "—"} desc={t("terminal.viz.kAvgBetaDesc")} />
                <Kpi label={t("terminal.viz.kDecoupled")} value={agg.decoupled} desc={t("terminal.viz.kDecoupledDesc")} tone={agg.decoupled ? "text-cyan-400" : undefined} />
                <Kpi label={t("terminal.viz.kExtended")} value={agg.extended} desc={t("terminal.viz.kExtendedDesc")} tone={agg.extended ? "text-orange-400" : undefined} />
                <Kpi label={t("terminal.viz.kLeads")} value={agg.leads} desc={t("terminal.viz.kLeadsDesc")} tone={agg.leads ? "text-purple-400" : undefined} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.betaDistTitle")}
                  desc={t("terminal.viz.betaDistDesc")}
                  render={(h) => (
                    <>
                      <div style={{ height: h }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={makeBins(agg.betaVals, 0.25, 0, 2.5)} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                            <CartesianGrid stroke={GRID} vertical={false} />
                            <XAxis dataKey="x" tick={TICK_SM} axisLine={false} tickLine={false} />
                            <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                            <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                            <Bar dataKey="count" name="signals" radius={[2, 2, 0, 0]}>
                              {makeBins(agg.betaVals, 0.25, 0, 2.5).map((b, i) => (
                                <Cell key={i} fill={b.mid < 0.8 ? POS : b.mid <= 1.2 ? GOLD : NEG} fillOpacity={0.8} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <LegendChips
                        entries={[
                          { key: "def", label: t("terminal.viz.betaDef"), value: agg.betaVals.filter((b) => b < 0.8).length, color: POS },
                          { key: "neu", label: t("terminal.viz.betaNeu"), value: agg.betaVals.filter((b) => b >= 0.8 && b <= 1.2).length, color: GOLD },
                          { key: "agg", label: t("terminal.viz.betaAgg"), value: agg.betaVals.filter((b) => b > 1.2).length, color: NEG },
                        ]}
                      />
                    </>
                  )}
                />

                <XCard
                  title={t("terminal.viz.betaPerfTitle")}
                  desc={t("terminal.viz.betaPerfDesc")}
                  zoom={zBeta}
                  hint={t("terminal.viz.betaPerfHint")}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                          <CartesianGrid stroke={GRID} />
                          <XAxis type="number" dataKey="x" tick={TICK} axisLine={false} tickLine={false} domain={zBeta.domX} allowDataOverflow tickFormatter={fmtAxis} />
                          <YAxis type="number" dataKey="y" tick={TICK} axisLine={false} tickLine={false} unit="%" domain={zBeta.domY} allowDataOverflow tickFormatter={fmtAxis} />
                          <Tooltip content={<ScatterTip xLabel="β 30d" yLabel="Δ call %" />} cursor={{ strokeDasharray: "3 3", stroke: GOLD }} />
                          <ReferenceLine y={0} stroke={GOLD} strokeDasharray="3 3" />
                          <ReferenceLine x={1} stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                          <Scatter data={agg.scatterBeta} fillOpacity={0.8} onClick={(p) => { const d = p?.payload || p; if (d?.pair) openPair(d.pair); }}>
                            {agg.scatterBeta.map((p, i) => { const sc = statusColorOf(statusMap, p.pair); return (
                              <Cell key={i} fill={p.dec ? CYAN : GRAYBAR} stroke={sc || undefined} strokeWidth={sc ? 2 : 0} cursor="pointer" />
                            ); })}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.alignTitle")}
                  desc={t("terminal.viz.alignDesc")}
                  render={(h) => (
                    <div style={{ height: Math.min(h, 220) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={makeBins(agg.alignVals, 10, 0, 100)} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis dataKey="x" tick={TICK_SM} axisLine={false} tickLine={false} />
                          <YAxis tick={TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip content={<DarkTip />} cursor={{ fill: "rgba(212,168,83,0.05)" }} />
                          <Bar dataKey="count" name="signals" fill={PURPLE} fillOpacity={0.8} radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />

                <XCard
                  title={t("terminal.viz.decListTitle")}
                  desc={t("terminal.viz.decListDesc")}
                  render={() =>
                    agg.decoupledList.length === 0 ? (
                      <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">{t("terminal.viz.none")}</div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 py-2">
                        {agg.decoupledList.slice(0, 24).map((d) => (
                          <span key={d.pair} className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-cyan-400/25 bg-cyan-400/[0.06] font-mono text-[10px]">
                            <CoinPill pair={d.pair} onPair={openPair} />
                            <span className={d.v >= 0 ? "text-positive" : "text-negative"}>{fmtPct(d.v)}</span>
                          </span>
                        ))}
                      </div>
                    )
                  }
                />
              </div>
            </>
          )}

          {/* ═══════════ SECTORS ═══════════ */}
          {tab === "sectors" && (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.radarTitle")}
                  desc={t("terminal.viz.radarDesc")}
                  render={(h) => (
                    <div style={{ height: Math.max(h, 260) }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={agg.sectors.filter((s) => s.sector !== "unclassified").slice(0, 7)} outerRadius="72%">
                          <PolarGrid stroke="rgba(212,168,83,0.12)" />
                          <PolarAngleAxis dataKey="sector" tick={{ fill: AXIS, fontSize: 9.5, fontFamily: "JetBrains Mono" }} />
                          <Radar dataKey="count" name="signals" stroke={GOLD} fill={GOLD} fillOpacity={0.25} />
                          <Tooltip content={<DarkTip />} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                />
                <XCard
                  title={t("terminal.viz.sectorCountTitle")}
                  desc={t("terminal.viz.sectorCountDesc")}
                  render={() => (
                    <SectorBars
                      data={agg.sectors.slice(0, 12)}
                      dataKey="count"
                      color={() => GOLD}
                      fmt={(v) => v}
                      onPick={(sec) => setF({ sectors: selSectors.includes(sec) ? "" : sec })}
                    />
                  )}
                />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.sectorFcTitle")}
                  desc={t("terminal.viz.sectorFcDesc")}
                  render={() => (
                    <SectorBars
                      data={agg.sectors.filter((s) => s.medFc != null).slice(0, 12)}
                      dataKey="medFc"
                      color={(v) => (v >= 0 ? POS : NEG)}
                      fmt={(v) => fmtPct(v)}
                      onPick={(sec) => setF({ sectors: selSectors.includes(sec) ? "" : sec })}
                      diverging
                    />
                  )}
                />
                <XCard
                  title={t("terminal.viz.sectorTgtTitle")}
                  desc={t("terminal.viz.sectorTgtDesc")}
                  render={() => (
                    <SectorBars
                      data={agg.sectors.filter((s) => s.medTgt != null).slice(0, 12)}
                      dataKey="medTgt"
                      color={() => GOLD}
                      fmt={(v) => fmtPct(v, 0)}
                      onPick={(sec) => setF({ sectors: selSectors.includes(sec) ? "" : sec })}
                    />
                  )}
                />
              </div>
            </>
          )}
        </>
      )}

      {/* ── drill-down: latest call for a coin ── */}
      {selectedSignal && (
        <SignalModal
          signal={selectedSignal}
          isOpen={!!selectedSignal}
          onClose={() => setSelectedSignal(null)}
        />
      )}
    </div>
  );
}
