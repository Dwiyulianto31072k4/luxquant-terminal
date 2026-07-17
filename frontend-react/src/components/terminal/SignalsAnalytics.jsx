// ════════════════════════════════════════════════════════════════
// Signals Analytics — the VISUAL layer of Potential Trades (7-day
// window). Side-nav tabs live in TerminalLayout; shared atoms in
// vizShared.jsx; derivatives tabs in DerivTabs.jsx.
//
// · Fixed 7d, scope=all (TP4/SL included) — Potential Trades parity
// · CoinLogo everywhere; click coin/dot → latest call (SignalModal)
// · XCard expand + scatter zoom · quarantined suspects · medians
// · Derivatives blob (funding/OI/LSR/taker/RSI) precomputed by the
// backend worker — never empty (fresh → stale → warming notice)
// · localStorage hydration: charts render instantly from the last
// session's data, refresh happens silently in the background
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ScatterChart,
  Scatter,
  ReferenceLine,
  FunnelChart,
  Funnel,
  LabelList,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  LineChart,
  Line,
} from "recharts";
import SignalModal from "../SignalModal";
import CoinLogo from "../CoinLogo";
import {
  API_BASE,
  authHeaders,
  GOLD,
  POS,
  NEG,
  PURPLE,
  ORANGE,
  CYAN,
  GRAYBAR,
  GRID,
  AXIS,
  TICK,
  TICK_SM,
  STATUS_ORDER,
  STATUS_LABEL,
  STATUS_COLORS,
  RISK_COLORS,
  fmtPct,
  median,
  parseMcap,
  csv,
  makeBins,
  PLAUSIBLE_LO,
  PLAUSIBLE_HI,
  SectionBand,
  Kpi,
  Chip,
  SegControl,
  FilterMulti,
  DarkTip,
  ScatterTip,
  LegendChips,
  XCard,
  useZoom,
  CoinPill,
  RankBars,
  SectorBars,
  Donut,
  statusColorOf,
  fmtAxis,
  SectorGlyph,
} from "./vizShared";
import { OITab, LongShortTab, FundingTab, VsBtcTab, MomentumTab, SqueezeTab } from "./DerivTabs";
import { LiquidationsTab } from "./LiquidationsTab";
import { TokenFlowTab } from "./TokenFlowTab";
import { ConfluenceTab } from "./ConfluenceTabs";
import { EdgeTab } from "./EdgeSimulator";
import { RiskTab } from "./RiskCalculator";
import { RsiHeatmapTab, AtrLevelsTab, VolSqueezeTab, OrderFlowTab } from "./Screeners";
import { useSignalStatus } from "../../context/SignalStatusContext";

// Anomaly scatter dot — hot pumps glow + grow; decoupled stay cyan; rest muted.
function AnomDot({ cx, cy, payload, statusMap, onPair }) {
  if (cx == null || cy == null || !payload) return null;
  const sc = statusColorOf(statusMap, payload.pair);
  const hot = !!payload.hot;
  const dec = !!payload.dec;
  const r = hot ? 6.5 : dec ? 5 : 3.5;
  const fill = hot ? GOLD : dec ? CYAN : GRAYBAR;
  return (
    <g style={{ cursor: "pointer" }} onClick={() => payload.pair && onPair?.(payload.pair)}>
      {hot && <circle cx={cx} cy={cy} r={r + 5} fill={GOLD} fillOpacity={0.12} />}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        fillOpacity={hot ? 0.95 : dec ? 0.85 : 0.55}
        stroke={sc || (hot ? "rgba(240,216,144,0.7)" : "transparent")}
        strokeWidth={sc ? 2 : hot ? 1 : 0}
      />
    </g>
  );
}

// Market Regime — composite risk-on/off (altseason · BTC.D · closed win rate · funding)
// Live "in profit %" is intentionally excluded — momentum noise, not edge quality.
function RegimeGauge({ macro, deriv, winRate, closedN, tpHitPct }) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const btcDom = macro?.btc_dominance ?? null;
  const alt = macro?.altseason_index ?? null;
  const fund = deriv?.pairs
    ? Object.values(deriv.pairs)
        .map((p) => p.funding)
        .filter((v) => v != null)
    : [];
  const avgFund = fund.length ? fund.reduce((a, b) => a + b, 0) / fund.length : null;

  const altScore = alt != null ? clamp(alt, 0, 100) : null;
  const domScore = btcDom != null ? clamp(((65 - btcDom) / 20) * 100, 0, 100) : null;
  // Prefer resolved win rate; fall back to TP1+ hit rate when few closes
  const edgeScore = winRate != null ? winRate : tpHitPct != null ? tpHitPct : null;
  const fundScore = avgFund != null ? clamp(50 + avgFund * 100 * 500, 0, 100) : null;

  const parts = [
    [altScore, 0.35],
    [domScore, 0.25],
    [edgeScore, 0.25],
    [fundScore, 0.15],
  ].filter(([v]) => v != null);
  const wsum = parts.reduce((a, [, w]) => a + w, 0) || 1;
  const regime = parts.length ? parts.reduce((a, [v, w]) => a + v * w, 0) / wsum : null;
  // Semantic color only — no gold brand glow for neutral zone
  const regColor = regime == null ? "#94a3b8" : regime >= 65 ? POS : regime >= 45 ? "#94a3b8" : NEG;
  const label =
    regime == null
      ? "—"
      : regime >= 65
        ? "Risk-on"
        : regime >= 52
          ? "Constructive"
          : regime >= 42
            ? "Neutral"
            : "Risk-off";

  const edgeLabel = winRate != null ? "Win rate" : "TP1+ rate";
  const edgeRaw = winRate != null ? `${winRate}%` : tpHitPct != null ? `${tpHitPct}%` : "—";
  const edgeBar = edgeScore;
  const edgeSub =
    winRate != null && closedN
      ? `${closedN} resolved`
      : winRate == null && tpHitPct != null
        ? "reached TP1+"
        : null;

  const comp = (lbl, score, raw, sub) => (
    <div className="rounded-lg border border-ink/[0.05] bg-ink/[0.02] px-2.5 py-2">
      <div className="font-mono text-[8px] uppercase tracking-[0.12em] text-text-muted/80">
        {lbl}
      </div>
      <div className="mt-0.5 font-mono text-[13px] tabular-nums text-text-primary">{raw}</div>
      {sub && <div className="mt-0.5 font-mono text-[8px] text-text-muted/55">{sub}</div>}
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
        <div
          className="h-full rounded-full bg-text-primary/55"
          style={{ width: `${score || 0}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-ink/[0.06] bg-ink/[0.02] p-3.5">
      <div className="mb-2.5 flex items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
            Market regime
          </div>
          <div
            className="mt-1 font-mono text-[26px] tabular-nums leading-none"
            style={{ color: regColor }}
          >
            {regime == null ? "—" : Math.round(regime)}
            <span className="text-[12px] text-text-muted/50"> / 100</span>
          </div>
          <div className="mt-1 text-[12px] font-medium" style={{ color: regColor }}>
            {label}
          </div>
        </div>
        <div className="hidden max-w-[11rem] text-right text-[10px] leading-snug text-text-muted/60 sm:block">
          Backdrop for position sizing · edge from resolved outcomes
        </div>
      </div>
      <div
        className="relative h-2 overflow-hidden rounded-full"
        style={{
          background: "linear-gradient(90deg,rgb(var(--neg)),rgb(148 163 184),rgb(var(--pos)))",
        }}
      >
        {regime != null && (
          <div
            className="absolute top-1/2 h-4 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white shadow"
            style={{ left: `${regime}%` }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[8px] uppercase tracking-wider text-text-muted/50">
        <span>Risk-off</span>
        <span>Neutral</span>
        <span>Risk-on</span>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {comp("Altseason", altScore, alt != null ? alt.toFixed(0) : "—")}
        {comp("BTC dominance", domScore, btcDom != null ? `${btcDom.toFixed(1)}%` : "—")}
        {comp(edgeLabel, edgeBar, edgeRaw, edgeSub)}
        {comp("Avg funding", fundScore, avgFund != null ? `${(avgFund * 100).toFixed(3)}%` : "—")}
      </div>
    </div>
  );
}

// ── URL-synced global filters (window FIXED at 7d) ─────────────────
const DEFAULTS = { tab: "confluence", st: "all", sectors: "", risks: "", dec: "", q: "" };
const parseF = (sp) => {
  const f = { ...DEFAULTS };
  Object.keys(DEFAULTS).forEach((k) => {
    const v = sp.get(k);
    if (v != null) f[k] = v;
  });
  return f;
};
const toParams = (f) => {
  const p = new URLSearchParams();
  Object.keys(DEFAULTS).forEach((k) => {
    if (f[k] !== DEFAULTS[k]) p.set(k, f[k]);
  });
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
  } catch {
    return {};
  }
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
    setDayBuckets((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  const { map: statusMap } = useSignalStatus() || {}; // pair→status for scatter-dot rings

  // persist to localStorage
  useEffect(() => {
    if (!data) return;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), data, deriv, postsignal }));
    } catch {
      /* quota — skip */
    }
  }, [data, deriv, postsignal]);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/terminal/screener?days=7&scope=all`, {
        headers: authHeaders(),
      });
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
    } catch {
      /* keep previous */
    }
  }, []);
  const fetchPostsignal = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/terminal/postsignal`, { headers: authHeaders() });
      if (r.ok) {
        const j = await r.json();
        // keep last good blob while the worker is warming (heavy ~6h pass)
        setPostsignal((prev) =>
          j.warming && prev?.pairs && Object.keys(prev.pairs).length ? prev : j
        );
      }
    } catch {
      /* keep previous */
    }
  }, []);
  const [macro, setMacro] = useState(null);
  const fetchMacro = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/money-flow/macro`, { headers: authHeaders() });
      if (r.ok) setMacro(await r.json());
    } catch {
      /* keep previous */
    }
  }, []);
  // Live forced-liq tape (Bybit WS) — separate from Coinalyze /liquidations treemap
  const [liq, setLiq] = useState(null);
  const fetchLiq = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/terminal/liq-live`, { headers: authHeaders() });
      if (r.ok) setLiq(await r.json());
    } catch {
      /* keep previous */
    }
  }, []);
  const [cvd, setCvd] = useState(null);
  const fetchCvd = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/terminal/cvd`, { headers: authHeaders() });
      if (r.ok) setCvd(await r.json());
    } catch {
      /* keep previous */
    }
  }, []);
  const [ob, setOb] = useState(null);
  const fetchOb = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/terminal/orderbook`, { headers: authHeaders() });
      if (r.ok) setOb(await r.json());
    } catch {
      /* keep previous */
    }
  }, []);
  useEffect(() => {
    fetchData();
    fetchDeriv();
    fetchPostsignal();
    fetchMacro();
    fetchLiq();
    fetchCvd();
    fetchOb();
    const ivData = setInterval(fetchData, 60000);
    const ivDeriv = setInterval(fetchDeriv, 30000); // cheap: pure Redis read
    const ivPs = setInterval(fetchPostsignal, 300000); // 5 min: pure Redis read
    const ivMacro = setInterval(fetchMacro, 300000);
    const ivLiq = setInterval(fetchLiq, 6000); // live tape
    const ivCvd = setInterval(fetchCvd, 8000); // live order flow
    const ivOb = setInterval(fetchOb, 8000); // live order book
    return () => {
      clearInterval(ivData);
      clearInterval(ivDeriv);
      clearInterval(ivPs);
      clearInterval(ivMacro);
      clearInterval(ivLiq);
      clearInterval(ivCvd);
      clearInterval(ivOb);
    };
  }, [fetchData, fetchDeriv, fetchPostsignal, fetchMacro, fetchLiq, fetchCvd, fetchOb]);

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
      const r = await fetch(`${API_BASE}/api/v1/signals/detail/${base.signal_id}`, {
        headers: authHeaders(),
      });
      const full = r.ok ? await r.json() : {};
      setSelectedSignal({ ...base, ...full });
    } catch {
      setSelectedSignal(base);
    }
  }, []);

  const openPair = useCallback(
    (pair) => {
      const base = latestByPair[pair];
      if (base) openSignalRow(base);
    },
    [latestByPair, openSignalRow]
  );

  // ── everything live comes from the worker blob (no client polling) ──
  const liveOf = useCallback(
    (pair) => {
      const d = deriv?.pairs?.[pair];
      if (!d?.price) return null;
      return { price: d.price, volume: d.vol24h, change: d.price_chg_24h };
    },
    [deriv]
  );

  const fcOf = useCallback(
    (s) => {
      const lv = liveOf(s.pair);
      if (!lv?.price || !s.entry) return { v: null, suspect: false };
      const ratio = lv.price / s.entry;
      if (ratio > PLAUSIBLE_HI || ratio < PLAUSIBLE_LO)
        return { v: (ratio - 1) * 100, suspect: true };
      return { v: (ratio - 1) * 100, suspect: false };
    },
    [liveOf]
  );

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
    let decoupled = 0,
      extended = 0,
      leads = 0,
      betaN = 0,
      betaSum = 0;
    const fcVals = [],
      betaVals = [],
      alignVals = [],
      tt1Vals = [],
      maeVals = [];
    const scatterOpp = [],
      scatterBeta = [],
      anomPts = [],
      peakPts = [];
    const suspects = [],
      moversArr = [],
      rsArr = [],
      decoupledList = [];
    const btcChg = deriv?.btc?.chg ?? liveOf("BTCUSDT")?.change ?? null;
    const seenPair = new Set();

    view.forEach((s) => {
      const day = (s.created_at || "").slice(5, 10);
      if (day) {
        byDay[day] =
          byDay[day] || Object.fromEntries([["day", day], ...STATUS_ORDER.map((k) => [k, 0])]);
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
      if (s.beta_30d != null) {
        betaSum += s.beta_30d;
        betaN += 1;
        betaVals.push(s.beta_30d);
      }
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
          scatterOpp.push({
            x: v,
            y: Math.max(0, s.max_target_pct - v),
            pair: s.pair,
            risk: s.risk_norm,
          });
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
            if (Number.isFinite(volPct))
              anomPts.push({
                x: lv.change,
                y: volPct,
                pair: s.pair,
                dec: s.is_decoupled,
                sector: sec,
              });
          }
          if (lv?.change != null && btcChg != null && s.pair !== "BTCUSDT") {
            rsArr.push({ pair: s.pair, v: lv.change - btcChg });
          }
        }
      }
    });

    const flows = anomPts.map((p) => p.y);
    const medFlow = median(flows) || 0;
    anomPts.forEach((p) => {
      p.hot = medFlow > 0 && p.y > medFlow * 3 && p.x > 5;
    });

    const days = Object.values(byDay).sort((a, b) => a.day.localeCompare(b.day));
    // cumulative daily outcome balance (tp4 wins − sl losses)
    let cum = 0;
    const equity = days.map((d) => {
      cum += (d.closed_win || 0) - (d.closed_loss || 0);
      return { day: d.day, bal: cum };
    });
    const sectors = Object.values(bySector)
      .map((x) => ({
        sector: x.sector,
        count: x.count,
        medFc: median(x.fcs),
        medTgt: median(x.tgts),
      }))
      .sort((a, b) => b.count - a.count);

    const reached = (lvls) => lvls.reduce((a, k) => a + (statusMix[k] || 0), 0);
    const funnel = [
      { name: "Called", value: view.length, fill: GRAYBAR },
      { name: "TP1+", value: reached(["tp1", "tp2", "tp3", "closed_win"]), fill: "#2dd4a0" },
      { name: "TP2+", value: reached(["tp2", "tp3", "closed_win"]), fill: "rgb(var(--pos))" },
      { name: "TP3+", value: reached(["tp3", "closed_win"]), fill: "#86efac" },
      { name: "TP4", value: statusMix.closed_win || 0, fill: GOLD },
    ];
    const closedN = (statusMix.closed_win || 0) + (statusMix.closed_loss || 0);
    const winRate = closedN ? Math.round(((statusMix.closed_win || 0) / closedN) * 100) : null;

    return {
      days,
      equity,
      statusMix,
      riskMix,
      sectors,
      funnel,
      winRate,
      closedN,
      decoupled,
      extended,
      leads,
      avgBeta: betaN ? betaSum / betaN : null,
      medFc: median(fcVals),
      fcN: fcVals.length,
      fcVals,
      betaVals,
      alignVals,
      tt1Vals,
      maeMed: median(maeVals),
      scatterOpp,
      scatterBeta,
      anomPts,
      peakPts,
      medFlow,
      suspects: suspects.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)),
      movers: moversArr,
      rs: rsArr,
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

  const gainers = useMemo(
    () => [...agg.movers].sort((a, b) => b.v - a.v).slice(0, 8),
    [agg.movers]
  );
  const losers = useMemo(() => [...agg.movers].sort((a, b) => a.v - b.v).slice(0, 8), [agg.movers]);
  const rsTop = useMemo(() => [...agg.rs].sort((a, b) => b.v - a.v).slice(0, 8), [agg.rs]);
  const rsBottom = useMemo(() => [...agg.rs].sort((a, b) => a.v - b.v).slice(0, 8), [agg.rs]);

  // Anomaly tab meta — hot list, legend counts, data-age freshness badge
  const anomMeta = useMemo(() => {
    const hotPts = agg.anomPts.filter((p) => p.hot).sort((a, b) => b.x - a.x);
    const decN = agg.anomPts.filter((p) => p.dec && !p.hot).length;
    const restN = agg.anomPts.filter((p) => !p.hot && !p.dec).length;
    const ageS = deriv?.generated_at
      ? Math.max(0, Math.round((Date.now() - Date.parse(deriv.generated_at)) / 1000))
      : null;
    const fresh = ageS != null && ageS < 90 && !deriv?.stale;
    return { hotPts, hotN: hotPts.length, decN, restN, ageS, fresh };
  }, [agg.anomPts, deriv?.generated_at, deriv?.stale]);
  // top-10 |movers| → default selection of the vs-BTC chart
  const moversAbs = useMemo(
    () => [...agg.movers].sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 10),
    [agg.movers]
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
  const STRONG_TAGS = ["HTF_TREND_STRONG", "MTF_FULL_ALIGNED", "SMC_GOLDEN_SETUP"];
  const WARN_TAGS = [
    "LATE_ENTRY",
    "OVEREXTENDED",
    "PARABOLIC",
    "EXHAUSTION_CANDLE",
    "LIQ_VERY_LOW",
    "LIQ_LOW",
    "RISK_OFF_REGIME",
    "HTF_TREND_EXHAUSTED",
    "MTF_AGAINST_HTF",
  ];
  const coiledCount = useMemo(() => {
    let n = 0;
    Object.values(latestByPair).forEach((s) => {
      const tags = s.v3?.tags || [];
      if (!tags.length || !STRONG_TAGS.some((x) => tags.includes(x))) return;
      if (tags.some((x) => WARN_TAGS.includes(x))) return;
      const fc = pairFc[s.pair];
      if (fc == null || fc < -5 || fc > 6) return;
      n += 1;
    });
    return n;
  }, [latestByPair, pairFc]);

  // Early edge — strong/clean setups that have NOT run to high TP yet
  // (still open / TP1 / TP2, live P&L modest or red). Actionable scan list.
  const earlyEdge = useMemo(() => {
    const EARLY = new Set(["open", "tp1", "tp2"]);
    const seen = new Set();
    const out = [];
    Object.values(latestByPair).forEach((s) => {
      if (!s?.pair || seen.has(s.pair)) return;
      if (!EARLY.has(s.status)) return;
      const tags = s.v3?.tags || [];
      if (!tags.length || !STRONG_TAGS.some((x) => tags.includes(x))) return;
      if (tags.some((x) => WARN_TAGS.includes(x))) return;
      const fc = pairFc[s.pair];
      // Still early: under water, flat, or modest green — not already a runaway
      if (fc != null && fc > 18) return;
      const strength = tags.filter((x) => STRONG_TAGS.includes(x)).length;
      const score =
        strength * 12 +
        (tags.includes("SMC_GOLDEN_SETUP") ? 8 : 0) +
        (s.status === "open" ? 4 : s.status === "tp1" ? 2 : 0) +
        (fc == null ? 0 : fc < 0 ? 5 : Math.max(0, 6 - fc / 3));
      seen.add(s.pair);
      out.push({
        s,
        fc,
        status: s.status,
        score,
        golden: tags.includes("SMC_GOLDEN_SETUP"),
        htf: tags.includes("HTF_TREND_STRONG"),
        aligned: tags.includes("MTF_FULL_ALIGNED"),
      });
    });
    return out.sort((a, b) => b.score - a.score).slice(0, 18);
  }, [latestByPair, pairFc]);

  const zAnom = useZoom(-30, 30, 0, 60);
  const zOpp = useZoom(-60, 60, 0, 120);
  const zBeta = useZoom(-0.5, 2.5, -60, 60);
  const zPeak = useZoom(-20, 150, -60, 100);

  const derivProps = { view, deriv, pairFc, openPair, openSignalRow, liq };

  // ════════════════════════════════════════════════════════════
  return (
    <div className="space-y-2.5">
      {/* ── sticky toolbar (exchange-style: search · status · date · facets) ── */}
      <div className="sticky top-0 z-30 flex items-center gap-1.5 flex-wrap bg-surface/95 backdrop-blur-md border-b border-ink/[0.05] px-0.5 py-1.5 -mx-0.5">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted/50"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3-3" strokeLinecap="round" />
          </svg>
          <input
            value={filters.q}
            onChange={(e) => setF({ q: e.target.value })}
            placeholder={t("terminal.viz.searchPair")}
            className="w-32 sm:w-40 bg-ink/[0.03] border border-ink/[0.07] rounded-md pl-7 pr-2.5 py-1.5 text-[11px] text-text-primary placeholder:text-text-muted/45 focus:outline-none focus:border-ink/18 font-mono"
          />
        </div>

        <SegControl
          value={filters.st}
          onChange={(id) => setF({ st: id })}
          options={[
            { id: "all", label: t("terminal.viz.all") },
            ...STATUS_ORDER.map((s) => ({ id: s, label: STATUS_LABEL[s] || s })),
          ]}
        />

        {/* Date window — last 7 days */}
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-ink/[0.03] border border-ink/[0.06]">
          <span className="hidden sm:inline px-1.5 font-mono text-[8px] uppercase tracking-[0.12em] text-text-muted/55">
            Date
          </span>
          {[0, 1, 2, 3, 4, 5, 6].map((d) => {
            const on = dayBuckets.includes(d);
            const dt = new Date(Date.now() - d * 86400000);
            const label = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                title={d === 0 ? "Today" : `${d} day${d > 1 ? "s" : ""} ago`}
                className={`px-1.5 py-1 rounded-md font-mono text-[8.5px] tracking-wide transition-colors whitespace-nowrap ${
                  on
                    ? "bg-ink/[0.1] text-text-primary font-semibold"
                    : "text-text-muted/55 hover:text-text-primary"
                }`}
              >
                {label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setDayBuckets([0, 1, 2, 3, 4, 5, 6])}
            className={`px-1.5 py-1 rounded-md font-mono text-[8.5px] uppercase ${
              dayBuckets.length === 7
                ? "text-accent font-semibold"
                : "text-text-muted/45 hover:text-text-primary"
            }`}
          >
            7D
          </button>
        </div>

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
        <Chip
          active={filters.dec === "1"}
          onClick={() => setF({ dec: filters.dec === "1" ? "" : "1" })}
        >
          {t("terminal.viz.decoupled")}
        </Chip>
        {hasDrill && (
          <button
            type="button"
            onClick={resetF}
            className="font-mono text-[9px] uppercase tracking-wider text-text-muted hover:text-negative"
          >
            {t("terminal.viz.reset")}
          </button>
        )}
        <div className="ml-auto hidden md:flex items-center gap-2.5 font-mono text-[9px] text-text-muted/65">
          {agg.btcPrice && (
            <span className="tabular-nums">
              BTC{" "}
              <span className="text-text-primary/80">
                ${Number(agg.btcPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span className={agg.btcChg >= 0 ? "text-positive" : "text-negative"}>
                {" "}
                {fmtPct(agg.btcChg)}
              </span>
            </span>
          )}
          <span className="tabular-nums">{view.length} signals</span>
          {data?.generated_at && (
            <span className="tabular-nums opacity-80">
              Updated{" "}
              {new Date(data.generated_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              {deriv?.stale && <span className="text-warning"> · delayed</span>}
            </span>
          )}
        </div>
      </div>

      {/* ── loading / error (only when nothing hydrated) ── */}
      {loading && !data && (
        <div className="rounded-lg bg-surface-raised border border-ink/[0.07] py-24 flex flex-col items-center gap-3">
          <div className="w-6 h-6 border border-ink/10 border-t-accent rounded-full animate-spin" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {t("terminal.viz.loading")}
          </span>
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
              <RegimeGauge
                macro={macro}
                deriv={deriv}
                winRate={agg.winRate}
                closedN={agg.closedN}
                tpHitPct={tpHitPct}
              />
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi
                  compact
                  label={t("terminal.viz.kActive")}
                  value={view.length}
                  sub="Last 7 days"
                />
                <Kpi
                  compact
                  label="Win rate"
                  value={agg.winRate == null ? "—" : `${agg.winRate}%`}
                  sub={agg.closedN ? `${agg.closedN} resolved (TP4 vs SL)` : "Awaiting closes"}
                  tone={agg.winRate != null && agg.winRate >= 55 ? "text-positive" : undefined}
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kTpReached")}
                  value={tpHitPct == null ? "—" : `${tpHitPct}%`}
                  sub="Hit TP1 or better"
                  tone="text-positive"
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kCoiled")}
                  value={coiledCount}
                  sub="Near entry · high quality"
                />
              </div>

              <XCard
                title={t("terminal.viz.flowTitle")}
                desc={t("terminal.viz.flowDesc")}
                render={(h) => (
                  <>
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={agg.days}
                          margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                        >
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
                          <YAxis
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            content={<DarkTip />}
                            cursor={{ fill: "rgb(var(--accent) / 0.06)" }}
                          />
                          {STATUS_ORDER.map((k, i) => (
                            <Bar
                              key={k}
                              dataKey={k}
                              name={STATUS_LABEL[k]}
                              stackId="s"
                              fill={STATUS_COLORS[k]}
                              radius={i === STATUS_ORDER.length - 1 ? [2, 2, 0, 0] : 0}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <LegendChips
                      entries={STATUS_ORDER.map((k) => ({
                        key: k,
                        label: STATUS_LABEL[k],
                        value: agg.statusMix[k],
                        color: STATUS_COLORS[k],
                      }))}
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
                      data={STATUS_ORDER.map((k) => ({
                        key: k,
                        name: STATUS_LABEL[k],
                        value: agg.statusMix[k],
                        color: STATUS_COLORS[k],
                      }))}
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
                      data={Object.entries(agg.riskMix).map(([k, v]) => ({
                        key: k,
                        name: k,
                        value: v,
                        color: RISK_COLORS[k],
                      }))}
                      active={selRisks.length === 1 ? selRisks[0] : null}
                      onPick={(k) =>
                        setF({ risks: selRisks.length === 1 && selRisks[0] === k ? "" : k })
                      }
                    />
                  )}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.tt1Title")}
                  desc={t("terminal.viz.tt1Desc")}
                  hint={
                    agg.maeMed != null
                      ? `${t("terminal.viz.maeNote")}: ${fmtPct(agg.maeMed)}`
                      : undefined
                  }
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={makeBins(agg.tt1Vals, 4, 0, 48)}
                          margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                        >
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis
                            dataKey="x"
                            tick={TICK_SM}
                            axisLine={false}
                            tickLine={false}
                            unit="h"
                          />
                          <YAxis
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            content={<DarkTip />}
                            cursor={{ fill: "rgb(var(--accent) / 0.06)" }}
                          />
                          <Bar
                            dataKey="count"
                            name="signals"
                            fill={CYAN}
                            fillOpacity={0.75}
                            radius={[2, 2, 0, 0]}
                          />
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
                        <BarChart
                          data={agg.days.map((d) => ({
                            day: d.day,
                            tp1: d.tp1 || 0,
                            tp2: d.tp2 || 0,
                            tp3: d.tp3 || 0,
                            tp4: d.closed_win || 0,
                            sl: -(d.closed_loss || 0),
                          }))}
                          margin={{ top: 6, right: 8, left: -18, bottom: 0 }}
                          stackOffset="sign"
                        >
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
                          <YAxis
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            content={<DarkTip />}
                            cursor={{ fill: "rgb(var(--accent) / 0.06)" }}
                          />
                          <ReferenceLine y={0} stroke="rgb(var(--ink) / 0.2)" />
                          <Bar
                            dataKey="tp1"
                            name="TP1"
                            stackId="a"
                            fill="#2dd4a0"
                            fillOpacity={0.9}
                          />
                          <Bar
                            dataKey="tp2"
                            name="TP2"
                            stackId="a"
                            fill="rgb(var(--pos))"
                            fillOpacity={0.9}
                          />
                          <Bar
                            dataKey="tp3"
                            name="TP3"
                            stackId="a"
                            fill="#86efac"
                            fillOpacity={0.9}
                          />
                          <Bar
                            dataKey="tp4"
                            name="TP4"
                            stackId="a"
                            fill={GOLD}
                            fillOpacity={0.95}
                            radius={[2, 2, 0, 0]}
                          />
                          <Bar
                            dataKey="sl"
                            name="SL"
                            stackId="a"
                            fill={NEG}
                            fillOpacity={0.9}
                            radius={[0, 0, 2, 2]}
                          />
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
              <SectionBand
                title={t("terminal.viz.sectionAnom")}
                desc={t("terminal.viz.sectionAnomDesc")}
                badge={
                  <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-ink/[0.08] bg-ink/[0.02] font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${anomMeta.fresh ? "bg-positive animate-pulse" : "bg-warning"}`}
                    />
                    {anomMeta.fresh ? "Live" : "Stale"}
                    {anomMeta.ageS != null && (
                      <span className="text-text-primary/50">· {anomMeta.ageS}s</span>
                    )}
                  </span>
                }
              />

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi
                  compact
                  label="Early edge"
                  value={earlyEdge.length}
                  sub={earlyEdge.length ? "Strong setup · ≤TP2" : t("terminal.viz.none")}
                  tone={earlyEdge.length ? "text-positive" : undefined}
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kHot")}
                  value={anomMeta.hotN}
                  sub={anomMeta.hotN ? t("terminal.viz.kHotSub") : t("terminal.viz.none")}
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kSpikes")}
                  value={session.spikes.length}
                  sub={
                    session.spikes.length ? t("terminal.viz.kSpikesSub") : t("terminal.viz.none")
                  }
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kSession")}
                  value={anomMeta.ageS != null ? `${anomMeta.ageS}s` : "—"}
                  sub={
                    anomMeta.fresh ? t("terminal.viz.kSessionFresh") : t("terminal.viz.kSessionLag")
                  }
                  tone={
                    deriv?.stale
                      ? "text-warning"
                      : anomMeta.fresh
                        ? "text-positive"
                        : "text-warning"
                  }
                />
              </div>

              {/* Early edge desk — good structure not yet at high TP; click opens modal */}
              <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-ink/[0.05] bg-ink/[0.015] px-3.5 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-medium text-text-primary">
                        Early edge
                      </span>
                      <span className="rounded border border-ink/[0.08] bg-ink/[0.03] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-text-muted">
                        {earlyEdge.length}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10.5px] leading-snug text-text-muted">
                      Strong confluence still open / TP1 / TP2 — not extended. Tap a chip to open
                      call proof.
                    </p>
                  </div>
                </div>
                {earlyEdge.length === 0 ? (
                  <div className="px-3.5 py-8 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted/60">
                    No early-edge setups in the current window
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 p-3">
                    {earlyEdge.map(({ s, fc, status, golden, htf, aligned }) => (
                      <button
                        key={s.signal_id || s.pair}
                        type="button"
                        onClick={() => openSignalRow(s)}
                        className="group inline-flex items-center gap-1.5 rounded-lg border border-ink/[0.08] bg-ink/[0.03] py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-ink/18 hover:bg-ink/[0.06]"
                      >
                        <CoinLogo pair={s.pair} size={18} />
                        <span className="font-mono text-[11.5px] font-semibold text-text-primary group-hover:text-text-primary">
                          {(s.pair || "").replace(/USDT$/i, "")}
                        </span>
                        <span className="rounded bg-ink/[0.06] px-1 py-px font-mono text-[8.5px] uppercase tracking-wide text-text-muted">
                          {STATUS_LABEL[status] || status}
                        </span>
                        {golden && (
                          <span className="rounded border border-ink/10 px-1 py-px font-mono text-[8px] uppercase text-text-primary/55">
                            golden
                          </span>
                        )}
                        {!golden && htf && (
                          <span className="font-mono text-[8px] uppercase text-text-muted">
                            htf
                          </span>
                        )}
                        {!golden && !htf && aligned && (
                          <span className="font-mono text-[8px] uppercase text-text-muted">
                            mtf
                          </span>
                        )}
                        <span
                          className={`font-mono text-[11px] tabular-nums ${
                            fc == null
                              ? "text-text-muted"
                              : fc >= 0
                                ? "text-positive"
                                : "text-negative"
                          }`}
                        >
                          {fc == null ? "—" : fmtPct(fc, 1)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {anomMeta.hotN > 0 && (
                <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised px-3.5 py-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="flex shrink-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
                      {t("terminal.viz.hotNow")}
                    </span>
                    {anomMeta.hotPts.slice(0, 12).map((p) => (
                      <button
                        key={p.pair}
                        type="button"
                        onClick={() => openPair(p.pair)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-ink/[0.1] bg-ink/[0.04] py-1 pl-1.5 pr-2 transition-colors hover:border-ink/20 hover:bg-ink/[0.08]"
                      >
                        <CoinLogo pair={p.pair} size={15} />
                        <span className="font-mono text-[10.5px] text-text-primary/85">
                          {(p.pair || "").replace(/USDT$/i, "")}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-text-muted">
                          {fmtPct(p.x, 1)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.anomTitle")}
                  desc={t("terminal.viz.anomDesc")}
                  zoom={zAnom}
                  hint={t("terminal.viz.anomHint")}
                  render={(h) => (
                    <div className="flex flex-col" style={{ height: h }}>
                      <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 10, right: 14, left: -8, bottom: 4 }}>
                            <CartesianGrid stroke={GRID} strokeDasharray="3 6" />
                            <XAxis
                              type="number"
                              dataKey="x"
                              tick={TICK}
                              axisLine={false}
                              tickLine={false}
                              unit="%"
                              domain={zAnom.domX}
                              allowDataOverflow
                              tickFormatter={fmtAxis}
                            />
                            <YAxis
                              type="number"
                              dataKey="y"
                              tick={TICK}
                              axisLine={false}
                              tickLine={false}
                              unit="%"
                              domain={zAnom.domY}
                              allowDataOverflow
                              tickFormatter={fmtAxis}
                            />
                            <Tooltip
                              content={<ScatterTip xLabel="chg 24h %" yLabel="vol/mcap %" />}
                              cursor={{ strokeDasharray: "3 3", stroke: GOLD }}
                            />
                            <ReferenceLine
                              x={0}
                              stroke="rgb(var(--accent) / 0.35)"
                              strokeDasharray="4 4"
                            />
                            {agg.medFlow > 0 && (
                              <ReferenceLine
                                y={agg.medFlow * 3}
                                stroke="rgba(251,146,60,0.55)"
                                strokeDasharray="4 4"
                                label={{
                                  value: "3× flow",
                                  position: "insideTopRight",
                                  fill: "rgba(251,146,60,0.7)",
                                  fontSize: 9,
                                  fontFamily: "JetBrains Mono",
                                }}
                              />
                            )}
                            <Scatter
                              data={agg.anomPts}
                              shape={(props) => (
                                <AnomDot {...props} statusMap={statusMap} onPair={openPair} />
                              )}
                              isAnimationActive={false}
                              onClick={(p) => {
                                const d = p?.payload || p;
                                if (d?.pair) openPair(d.pair);
                              }}
                            />
                          </ScatterChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-3 pt-1.5 border-t border-ink/[0.04] mt-1">
                        {[
                          { c: GOLD, l: t("terminal.viz.legHot"), n: anomMeta.hotN },
                          { c: CYAN, l: t("terminal.viz.legDec"), n: anomMeta.decN },
                          { c: GRAYBAR, l: t("terminal.viz.legRest"), n: anomMeta.restN },
                        ].map((e) => (
                          <span
                            key={e.l}
                            className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-text-muted"
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{
                                background: e.c,
                                boxShadow:
                                  e.c === GOLD ? "0 0 6px rgb(var(--accent) / 0.5)" : undefined,
                              }}
                            />
                            {e.l}
                            <span className="text-text-primary/45 tabular-nums">{e.n}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                />

                <XCard
                  title={t("terminal.viz.spikeTitle")}
                  desc={t("terminal.viz.spikeDesc")}
                  render={() =>
                    session.spikes.length === 0 ? (
                      <div className="py-14 text-center">
                        <div className="mx-auto w-10 h-10 rounded-full border border-ink/[0.06] bg-ink/[0.02] flex items-center justify-center mb-3">
                          <span className="text-text-muted/50 text-lg leading-none">∅</span>
                        </div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted leading-relaxed">
                          {session.warming
                            ? t("terminal.viz.spikeWarming")
                            : t("terminal.viz.none")}
                        </div>
                      </div>
                    ) : (
                      <RankBars
                        align="start"
                        // Volume intensity ≠ PnL — monochrome ink, never red/green
                        data={session.spikes.map((s) => ({
                          ...s,
                          color: "rgb(var(--fg) / 0.72)",
                        }))}
                        fmt={(v) => `${v.toFixed(1)}`}
                        suffix="×"
                        onPair={openPair}
                      />
                    )
                  }
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.rsUpTitle")}
                  desc={t("terminal.viz.rsUpDesc")}
                  render={() => <RankBars data={rsTop} onPair={openPair} />}
                />
                <XCard
                  title={t("terminal.viz.rsDownTitle")}
                  desc={t("terminal.viz.rsDownDesc")}
                  render={() => <RankBars data={rsBottom} onPair={openPair} />}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={`${t("terminal.viz.sessTitle")} ↑`}
                  desc={t("terminal.viz.sessDesc")}
                  render={() =>
                    session.warming ? (
                      <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        {t("terminal.viz.spikeWarming")}
                      </div>
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
                      <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        {t("terminal.viz.spikeWarming")}
                      </div>
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
              <SectionBand
                title={t("terminal.viz.sectionLive")}
                desc={t("terminal.viz.sectionLiveDesc")}
              />

              {/* Strength metrics only */}
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi
                  compact
                  label={t("terminal.viz.kInProfit")}
                  value={`${liveStats.up + liveStats.down ? Math.round((liveStats.up / (liveStats.up + liveStats.down)) * 100) : 0}%`}
                  sub={`${liveStats.up} of ${liveStats.up + liveStats.down} above entry`}
                  tone="text-positive"
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kBest")}
                  value={gainers[0] ? fmtPct(gainers[0].v) : "—"}
                  sub={gainers[0]?.pair?.replace(/USDT$/i, "") || "—"}
                  tone="text-positive"
                />
                <Kpi
                  compact
                  label={t("terminal.viz.kBigWin")}
                  value={liveStats.bigWin}
                  sub="Above +10% from entry"
                  tone="text-positive"
                />
                <Kpi
                  compact
                  label="Median winner"
                  value={(() => {
                    const wins = fcClamped.filter((v) => v > 0);
                    if (!wins.length) return "—";
                    const s = [...wins].sort((a, b) => a - b);
                    const m =
                      s.length % 2
                        ? s[(s.length - 1) / 2]
                        : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
                    return fmtPct(m);
                  })()}
                  sub="Among calls in profit"
                  tone="text-positive"
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                <XCard
                  title={t("terminal.viz.fcDistTitle")}
                  desc={t("terminal.viz.fcDistDesc")}
                  height={320}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={makeBins(fcClamped, 2, -20, 20)}
                          margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                        >
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis dataKey="x" tick={TICK_SM} axisLine={false} tickLine={false} />
                          <YAxis
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            content={<DarkTip />}
                            cursor={{ fill: "rgb(var(--accent) / 0.06)" }}
                          />
                          <ReferenceLine x="0" stroke={GOLD} strokeDasharray="3 3" />
                          <Bar dataKey="count" name="signals" radius={[3, 3, 0, 0]}>
                            {makeBins(fcClamped, 2, -20, 20).map((b, i) => (
                              <Cell key={i} fill={b.mid >= 0 ? POS : NEG} fillOpacity={0.8} />
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
                  height={320}
                  hint={t("terminal.viz.oppHint")}
                  render={(h) => (
                    <div style={{ height: h }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                          <CartesianGrid stroke={GRID} strokeDasharray="3 6" />
                          <XAxis
                            type="number"
                            dataKey="x"
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            unit="%"
                            domain={zOpp.domX}
                            allowDataOverflow
                            tickFormatter={fmtAxis}
                          />
                          <YAxis
                            type="number"
                            dataKey="y"
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            unit="%"
                            domain={zOpp.domY}
                            allowDataOverflow
                            tickFormatter={fmtAxis}
                          />
                          <Tooltip
                            content={<ScatterTip xLabel="Δ call %" yLabel="upside left %" />}
                            cursor={{ strokeDasharray: "3 3", stroke: GOLD }}
                          />
                          <ReferenceLine x={0} stroke={GOLD} strokeDasharray="3 3" />
                          <Scatter
                            data={agg.scatterOpp}
                            fillOpacity={0.8}
                            onClick={(p) => {
                              const d = p?.payload || p;
                              if (d?.pair) openPair(d.pair);
                            }}
                          >
                            {agg.scatterOpp.map((p, i) => {
                              const sc = statusColorOf(statusMap, p.pair);
                              return (
                                <Cell
                                  key={i}
                                  fill={RISK_COLORS[p.risk] || GRAYBAR}
                                  stroke={sc || undefined}
                                  strokeWidth={sc ? 2 : 0}
                                  cursor="pointer"
                                />
                              );
                            })}
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
                        <XAxis
                          type="number"
                          dataKey="x"
                          tick={TICK}
                          axisLine={false}
                          tickLine={false}
                          unit="%"
                          domain={zPeak.domX}
                          allowDataOverflow
                          tickFormatter={fmtAxis}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          tick={TICK}
                          axisLine={false}
                          tickLine={false}
                          unit="%"
                          domain={zPeak.domY}
                          allowDataOverflow
                          tickFormatter={fmtAxis}
                        />
                        <Tooltip
                          content={<ScatterTip xLabel="peak %" yLabel="now %" />}
                          cursor={{ strokeDasharray: "3 3", stroke: GOLD }}
                        />
                        <ReferenceLine
                          segment={[
                            { x: 0, y: 0 },
                            { x: 150, y: 150 },
                          ]}
                          stroke="rgb(var(--ink) / 0.2)"
                          strokeDasharray="4 4"
                        />
                        <ReferenceLine y={0} stroke={GOLD} strokeDasharray="3 3" />
                        <Scatter
                          data={agg.peakPts}
                          fillOpacity={0.8}
                          onClick={(p) => {
                            const d = p?.payload || p;
                            if (d?.pair) openPair(d.pair);
                          }}
                        >
                          {agg.peakPts.map((p, i) => {
                            const sc = statusColorOf(statusMap, p.pair);
                            return (
                              <Cell
                                key={i}
                                fill={p.win ? GOLD : p.y >= 0 ? POS : NEG}
                                stroke={sc || undefined}
                                strokeWidth={sc ? 2 : 0}
                                cursor="pointer"
                              />
                            );
                          })}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                )}
              />

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.topGainers")}
                  desc={t("terminal.viz.topGainersDesc")}
                  render={() => <RankBars data={gainers} onPair={openPair} />}
                />
                <XCard
                  title={t("terminal.viz.topLosers")}
                  desc={t("terminal.viz.topLosersDesc")}
                  render={() => <RankBars data={losers} onPair={openPair} />}
                />
              </div>

              {agg.suspects.length > 0 && (
                <XCard
                  title={t("terminal.viz.suspectTitle")}
                  desc={t("terminal.viz.suspectDesc")}
                  render={() => (
                    <div className="flex flex-wrap gap-1.5 py-2">
                      {agg.suspects.slice(0, 30).map((s) => (
                        <span
                          key={s.pair}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-warning/25 bg-warning/[0.06] font-mono text-[10px]"
                        >
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
          {tab === "flow" && (
            <OrderFlowTab view={view} deriv={deriv} cvd={cvd} ob={ob} openPair={openPair} />
          )}
          {tab === "liquidations" && <LiquidationsTab view={view} />}
          {tab === "tokenflow" && <TokenFlowTab view={view} />}
          {tab === "vsbtc" && <VsBtcTab {...derivProps} movers={moversAbs} />}

          {/* ═══════════ BTC CORRELATION → merged under Sectors? keep own ═══════════ */}
          {tab === "btc" && (
            <>
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                <Kpi
                  label={t("terminal.viz.kAvgBeta")}
                  value={agg.avgBeta != null ? agg.avgBeta.toFixed(2) : "—"}
                  desc={t("terminal.viz.kAvgBetaDesc")}
                />
                <Kpi
                  label={t("terminal.viz.kDecoupled")}
                  value={agg.decoupled}
                  desc={t("terminal.viz.kDecoupledDesc")}
                  tone={undefined}
                />
                <Kpi
                  label={t("terminal.viz.kExtended")}
                  value={agg.extended}
                  desc={t("terminal.viz.kExtendedDesc")}
                  tone={undefined}
                />
                <Kpi
                  label={t("terminal.viz.kLeads")}
                  value={agg.leads}
                  desc={t("terminal.viz.kLeadsDesc")}
                  tone={undefined}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <XCard
                  title={t("terminal.viz.betaDistTitle")}
                  desc={t("terminal.viz.betaDistDesc")}
                  render={(h) => (
                    <>
                      <div style={{ height: h }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={makeBins(agg.betaVals, 0.25, 0, 2.5)}
                            margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                          >
                            <CartesianGrid stroke={GRID} vertical={false} />
                            <XAxis dataKey="x" tick={TICK_SM} axisLine={false} tickLine={false} />
                            <YAxis
                              tick={TICK}
                              axisLine={false}
                              tickLine={false}
                              allowDecimals={false}
                            />
                            <Tooltip
                              content={<DarkTip />}
                              cursor={{ fill: "rgb(var(--accent) / 0.06)" }}
                            />
                            <Bar dataKey="count" name="signals" radius={[2, 2, 0, 0]}>
                              {makeBins(agg.betaVals, 0.25, 0, 2.5).map((b, i) => (
                                <Cell
                                  key={i}
                                  fill={b.mid < 0.8 ? POS : b.mid <= 1.2 ? GOLD : NEG}
                                  fillOpacity={0.8}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <LegendChips
                        entries={[
                          {
                            key: "def",
                            label: t("terminal.viz.betaDef"),
                            value: agg.betaVals.filter((b) => b < 0.8).length,
                            color: POS,
                          },
                          {
                            key: "neu",
                            label: t("terminal.viz.betaNeu"),
                            value: agg.betaVals.filter((b) => b >= 0.8 && b <= 1.2).length,
                            color: GOLD,
                          },
                          {
                            key: "agg",
                            label: t("terminal.viz.betaAgg"),
                            value: agg.betaVals.filter((b) => b > 1.2).length,
                            color: NEG,
                          },
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
                          <XAxis
                            type="number"
                            dataKey="x"
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            domain={zBeta.domX}
                            allowDataOverflow
                            tickFormatter={fmtAxis}
                          />
                          <YAxis
                            type="number"
                            dataKey="y"
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            unit="%"
                            domain={zBeta.domY}
                            allowDataOverflow
                            tickFormatter={fmtAxis}
                          />
                          <Tooltip
                            content={<ScatterTip xLabel="β 30d" yLabel="Δ call %" />}
                            cursor={{ strokeDasharray: "3 3", stroke: GOLD }}
                          />
                          <ReferenceLine y={0} stroke={GOLD} strokeDasharray="3 3" />
                          <ReferenceLine
                            x={1}
                            stroke="rgb(var(--ink) / 0.15)"
                            strokeDasharray="3 3"
                          />
                          <Scatter
                            data={agg.scatterBeta}
                            fillOpacity={0.8}
                            onClick={(p) => {
                              const d = p?.payload || p;
                              if (d?.pair) openPair(d.pair);
                            }}
                          >
                            {agg.scatterBeta.map((p, i) => {
                              const sc = statusColorOf(statusMap, p.pair);
                              return (
                                <Cell
                                  key={i}
                                  fill={p.dec ? CYAN : GRAYBAR}
                                  stroke={sc || undefined}
                                  strokeWidth={sc ? 2 : 0}
                                  cursor="pointer"
                                />
                              );
                            })}
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
                        <BarChart
                          data={makeBins(agg.alignVals, 10, 0, 100)}
                          margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                        >
                          <CartesianGrid stroke={GRID} vertical={false} />
                          <XAxis dataKey="x" tick={TICK_SM} axisLine={false} tickLine={false} />
                          <YAxis
                            tick={TICK}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip
                            content={<DarkTip />}
                            cursor={{ fill: "rgb(var(--accent) / 0.06)" }}
                          />
                          <Bar
                            dataKey="count"
                            name="signals"
                            fill={PURPLE}
                            fillOpacity={0.8}
                            radius={[2, 2, 0, 0]}
                          />
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
                      <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        {t("terminal.viz.none")}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 py-2">
                        {agg.decoupledList.slice(0, 24).map((d) => (
                          <span
                            key={d.pair}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-sm border border-cyan-400/25 bg-cyan-400/[0.06] font-mono text-[10px]"
                          >
                            <CoinPill pair={d.pair} onPair={openPair} />
                            <span className={d.v >= 0 ? "text-positive" : "text-negative"}>
                              {fmtPct(d.v)}
                            </span>
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
                        <RadarChart
                          data={agg.sectors.filter((s) => s.sector !== "unclassified").slice(0, 7)}
                          outerRadius="72%"
                        >
                          <PolarGrid stroke="rgb(var(--ink) / 0.12)" />
                          <PolarAngleAxis
                            dataKey="sector"
                            tick={{
                              fill: AXIS,
                              fontSize: 9.5,
                              fontFamily: "JetBrains Mono",
                              fontWeight: 600,
                            }}
                          />
                          {/* Solid accent radar — not washed slate on bright */}
                          <Radar
                            dataKey="count"
                            name="signals"
                            stroke="rgb(var(--accent))"
                            strokeWidth={2}
                            fill="rgb(var(--accent))"
                            fillOpacity={0.28}
                          />
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
                      color={() => "rgb(var(--fg) / 0.72)"}
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
                      color={() => POS}
                      fmt={(v) => fmtPct(v, 0)}
                      onPick={(sec) => setF({ sectors: selSectors.includes(sec) ? "" : sec })}
                    />
                  )}
                />
              </div>

              {/* Sector signal desk — drill active sector filter to pairs → SignalModal */}
              {(() => {
                const activeSec = selSectors[0] || null;
                const sectorSignals = activeSec
                  ? view
                      .filter((s) => (s.sector || "unclassified") === activeSec)
                      .slice()
                      .sort((a, b) => {
                        const fa = pairFc[a.pair];
                        const fb = pairFc[b.pair];
                        if (fa == null && fb == null) return 0;
                        if (fa == null) return 1;
                        if (fb == null) return -1;
                        return fb - fa;
                      })
                  : [];
                const seen = new Set();
                const unique = [];
                sectorSignals.forEach((s) => {
                  if (seen.has(s.pair)) return;
                  seen.add(s.pair);
                  unique.push(s);
                });
                return (
                  <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/[0.05] bg-ink/[0.015] px-3.5 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12.5px] font-medium text-text-primary">
                            Sector signals
                          </span>
                          {activeSec && (
                            <span className="inline-flex items-center gap-1 rounded border border-ink/[0.1] bg-ink/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-text-primary/80">
                              <span className="opacity-70">
                                <SectorGlyph sector={activeSec} />
                              </span>
                              {activeSec}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10.5px] text-text-muted">
                          {activeSec
                            ? `${unique.length} pairs · click a row to open call proof`
                            : "Click a sector bar above to drill into its signals."}
                        </p>
                      </div>
                      {activeSec && (
                        <button
                          type="button"
                          onClick={() => setF({ sectors: "" })}
                          className="font-mono text-[9px] uppercase tracking-wider text-text-muted hover:text-text-primary"
                        >
                          Clear filter
                        </button>
                      )}
                    </div>
                    {!activeSec ? (
                      <div className="px-4 py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted/55">
                        Select a sector to list signals
                      </div>
                    ) : unique.length === 0 ? (
                      <div className="px-4 py-10 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted/55">
                        No signals in this sector for the current window
                      </div>
                    ) : (
                      <div className="max-h-[360px] divide-y divide-ink/[0.04] overflow-y-auto [scrollbar-width:thin]">
                        {unique.slice(0, 48).map((s) => {
                          const fc = pairFc[s.pair];
                          return (
                            <button
                              key={s.signal_id || s.pair}
                              type="button"
                              onClick={() => openSignalRow(s)}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-ink/[0.03]"
                            >
                              <CoinLogo pair={s.pair} size={22} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate font-mono text-[12.5px] font-semibold text-text-primary">
                                    {(s.pair || "").replace(/USDT$/i, "")}
                                  </span>
                                  <span className="rounded bg-ink/[0.05] px-1 py-px font-mono text-[8.5px] uppercase text-text-muted">
                                    {STATUS_LABEL[s.status] || s.status}
                                  </span>
                                </div>
                                <p className="mt-0.5 font-mono text-[9.5px] text-text-muted">
                                  {s.risk_norm || "—"} risk
                                  {s.max_target_pct != null
                                    ? ` · max +${Number(s.max_target_pct).toFixed(0)}%`
                                    : ""}
                                </p>
                              </div>
                              <span
                                className={`font-mono text-[12px] font-semibold tabular-nums ${
                                  fc == null
                                    ? "text-text-muted"
                                    : fc >= 0
                                      ? "text-positive"
                                      : "text-negative"
                                }`}
                              >
                                {fc == null ? "—" : fmtPct(fc, 1)}
                              </span>
                              <svg
                                className="h-3.5 w-3.5 text-text-primary/20"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.75}
                                  d="M9 5l7 7-7 7"
                                />
                              </svg>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
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
