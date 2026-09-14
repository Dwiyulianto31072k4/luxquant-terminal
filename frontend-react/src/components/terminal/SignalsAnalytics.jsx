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
  pctBound,
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
  CoinBubble,
  PairBubble,
  promote,
  namedLast,
  useChartHeight,
  pctRange,
  clampRange,
  sectorKeyOf,
} from "./vizShared";
import { STRONG_TAGS, WARN_TAGS } from "./tagGlossary";
import { ANOM_FLOOR, anomSetupOf } from "./anomSetups";
import AnomalyTab from "./tabs/AnomalyTab";
import SectorsTab from "./tabs/SectorsTab";
import BtcTab from "./tabs/BtcTab";
import LiveTab from "./tabs/LiveTab";
import { OITab, LongShortTab, FundingTab, VsBtcTab, MomentumTab, SqueezeTab } from "./DerivTabs";
import { LiquidationsTab } from "./LiquidationsTab";
import { TokenFlowTab } from "./TokenFlowTab";
import { ConfluenceTab } from "./ConfluenceTabs";
import { EdgeTab } from "./EdgeSimulator";
import { RiskTab } from "./RiskCalculator";
import { RsiHeatmapTab, AtrLevelsTab, VolSqueezeTab, OrderFlowTab } from "./Screeners";
import { useSignalStatus } from "../../context/SignalStatusContext";






// ── URL-synced global filters (window FIXED at 7d) ─────────────────
// `sectors` and `narr` are BOTH real and do different jobs. The toolbar filters
// on narratives, the same CoinGecko taxonomy the Signals desk uses. `sectors`
// is the 10-bucket key the Sectors and Overview charts drill on when you click
// a bar — those charts ARE bucket charts, so clicking one has to filter by
// bucket. Removing it silently broke both.
const DEFAULTS = { tab: "confluence", st: "all", sectors: "", narr: "", risks: "", dec: "", q: "" };
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
// Active filters, named and individually removable.
//
// The controls above tell you what you CAN filter; nothing told you what you
// currently ARE filtering. With a narrative, a risk band, a status and a search
// all set, the only summary was a "reset" button that took the lot — so the way
// to drop one condition was to remember which control you had touched and go
// back to it. The Signals desk has carried this chip row for a while; this is
// the terminal catching up.
//
// Each chip removes exactly one thing. Clear all is the old reset, kept, but it
// now sits beside the list of what it would clear rather than standing alone.
function ActiveFilterChips({ items, onClearAll }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 pb-2">
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted/60">
        Filtering by
      </span>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={it.onRemove}
          title={`Remove: ${it.label}`}
          className="group inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-text-primary transition-colors hover:border-negative/40 hover:bg-negative/10"
        >
          <span className="text-text-muted/70">{it.field}</span>
          <span>{it.label}</span>
          <span className="text-text-muted/50 group-hover:text-negative">×</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-0.5 rounded-md px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-muted transition-colors hover:bg-negative/5 hover:text-negative"
      >
        Clear all
      </button>
    </div>
  );
}

export default function SignalsAnalytics() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => parseF(searchParams));
  // A tab id that no longer exists used to render nothing at all — a blank
  // body with working chrome, which reads as a broken page rather than a dead
  // link. Overview was removed and its bookmarks are still out there, so an
  // unknown id lands on the default instead.
  const KNOWN_TABS = new Set([
    "confluence", "live", "anomaly", "oi", "ls", "funding", "squeeze", "flow",
    "liquidations", "vsbtc", "btc", "momentum", "sectors", "tokenflow", "rsi",
    "atr", "vsqueeze", "edge", "risk", "treemap", "bubble", "matrix", "explore",
  ]);
  const rawTab = searchParams.get("tab") || "confluence";
  const tab = KNOWN_TABS.has(rawTab) ? rawTab : "confluence";
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
  // Window preset: last N calendar days (0=today only … 7=full week).
  // Replaces the old multi-toggle day chips that overcrowded the toolbar.
  const [windowDays, setWindowDays] = useState(7);
  const dayBuckets = useMemo(
    () => Array.from({ length: Math.min(7, Math.max(1, windowDays)) }, (_, i) => i),
    [windowDays]
  );
  // Anomaly chart-local (does not change global toolbar filters)
  // layer: all | hot | dec | rest · labels: off | focus | all

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
    const vis = (fn) => () => {
      if (document.visibilityState === "visible") fn();
    };
    const ivData = setInterval(vis(fetchData), 60000);
    const ivDeriv = setInterval(vis(fetchDeriv), 30000);
    const ivPs = setInterval(vis(fetchPostsignal), 300000);
    const ivMacro = setInterval(vis(fetchMacro), 300000);
    const ivLiq = setInterval(vis(fetchLiq), 6000);
    const ivCvd = setInterval(vis(fetchCvd), 8000);
    const ivOb = setInterval(vis(fetchOb), 8000);
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

  const items = useMemo(() => data?.items || [], [data]);

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
  const selNarr = csv(filters.narr);
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
    if (selSectors.length) out = out.filter((s) => selSectors.includes(sectorKeyOf(s)));
    if (selNarr.length)
      out = out.filter((s) => (narrMap[s.pair] || []).some((n) => selNarr.includes(n)));
    if (f.dec === "1") out = out.filter((s) => s.is_decoupled);
    // Window: keep signals whose age falls within the last N days
    if (windowDays < 7) {
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
  }, [items, filters, dayBuckets, windowDays]);

  // Narratives, the same CoinGecko taxonomy the Signals desk filters on.
  //
  // Two things had to be handled, both measured rather than guessed.
  //
  // A coin sits in SEVEN categories on average (max 27), so this is a
  // many-to-many filter: the counts below add up to far more than the number of
  // signals, and that is correct — they are "pairs carrying this narrative",
  // not a partition.
  //
  // And the raw list is 332 narratives in a 7-day window with 108 of them
  // holding a single pair. A dropdown of 332 rows, a third of which empty the
  // desk, is not a filter. Floored at three pairs, the same shape of floor the
  // Signals narrative row uses (min_coins=3) and for the same reason: below
  // that a "narrative" is one coin wearing a label.
  //
  // Worth knowing before reading the list: CoinGecko mixes at least four kinds
  // of label in one field. The biggest entries here are chain membership
  // ("ethereum ecosystem" 178 pairs, "bnb chain ecosystem" 171), exchange
  // programmes ("binance alpha spotlight" 125) and even jurisdiction ("made in
  // usa"), sitting beside real sectors like defi and AI. That is what the
  // Signals desk shows too, so this is aligned with it rather than corrected
  // behind its back.
  const narrMap = useMemo(() => data?.narratives || {}, [data]);

  const narrCounts = useMemo(() => {
    const n = {};
    const seen = new Set();
    for (const i of items) {
      if (seen.has(i.pair)) continue;
      seen.add(i.pair);
      for (const name of narrMap[i.pair] || []) n[name] = (n[name] || 0) + 1;
    }
    return n;
  }, [items, narrMap]);

  const NARR_MIN_PAIRS = 3;
  const narrOptions = useMemo(
    () =>
      Object.keys(narrCounts)
        .filter((k) => narrCounts[k] >= NARR_MIN_PAIRS || selNarr.includes(k))
        .sort((x, y) => narrCounts[y] - narrCounts[x] || x.localeCompare(y)),
    [narrCounts, selNarr]
  );

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
      stillRunning = [],
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
      const sec = sectorKeyOf(s);
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

        // Still running — the one thing on this tab that is a shortlist rather
        // than a recap, and the rule behind it is measured.
        //
        // A call that reached TP1 inside 15 minutes goes on to TP3+ far more
        // often than one that took longer: 55.9% against 48.9% over the tag
        // era (n=3,845 fast). That is not an artefact of a tight ladder — held
        // inside bands of TP1 distance it survives in all six, +5.7pp in the
        // dominant band (2,639 fast against 8,219 slower, 56.7% vs 51.0%).
        //
        // So: hit TP1 fast, and there is still room between here and the last
        // target. Those two together are the closest thing this desk has to
        // "worth a second look right now".
        if (
          s.max_target_pct != null &&
          s.time_to_tp1_seconds != null &&
          s.time_to_tp1_seconds >= 0 &&
          s.time_to_tp1_seconds <= 900 &&
          s.max_target_pct - v > 1
        )
          stillRunning.push({
            pair: s.pair,
            signal_id: s.signal_id,
            status: s.status,
            fc: v,
            left: s.max_target_pct - v,
            tt1: s.time_to_tp1_seconds,
            created_at: s.created_at,
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
                // Turnover is log-normal: the median call trades ~2% of its cap
                // in a day and a hot micro-cap trades 60%+. On a linear axis the
                // 97th percentile sets the top and every ordinary coin lands in
                // the bottom twentieth of the canvas — the chart drew 400 points
                // and separated none of them. Plot the decade, keep `y` as the
                // true figure for the tooltip and the lists.
                yl: Math.log10(Math.max(volPct, ANOM_FLOOR)),
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
      p.setup = anomSetupOf(p.x, p.y, medFlow);
      // hot keeps its old meaning exactly — the KPI card and the Hot list read
      // it, and breakout is defined as the same test it always was.
      p.hot = p.setup === "breakout";
    });
    // Label the extremes, not everything. Recharts draws each dot without
    // knowing its neighbours, so labelling every hot point piles names on top of
    // each other wherever the cloud is dense — which is exactly around the axis,
    // where most coins sit. Collision detection would work but makes labels
    // flicker on every re-render; ranking is deterministic and is what the
    // charting rule asks for anyway: selective direct labels, never one per
    // point. Rank by distance from the origin so both a big mover and a heavy
    // flow can earn a name — measured in the space that is actually DRAWN, i.e.
    // decades of turnover. Ranking on raw turnover handed all 14 names to the
    // top of the chart, because linearly a 60% coin is 30x a 2% one while on
    // screen it is a decade and a half.
    const yRef = Math.log10(Math.max(medFlow * 3, ANOM_FLOOR));
    [...anomPts]
      .sort(
        (a, b) =>
          Math.hypot(b.x / 25, (b.yl - yRef) / 1.2) -
          Math.hypot(a.x / 25, (a.yl - yRef) / 1.2)
      )
      .forEach((p, i) => {
        p.named = i < 14;
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
      stillRunning: stillRunning.sort((x, y) => y.left - x.left).slice(0, 24),
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



  // top-10 |movers| → default selection of the vs-BTC chart
  const moversAbs = useMemo(
    () => [...agg.movers].sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 10),
    [agg.movers]
  );


  // One chip per condition, so each can be dropped on its own.
  const activeChips = useMemo(() => {
    const out = [];
    if (filters.q) out.push({ key: "q", field: "search", label: filters.q, onRemove: () => setF({ q: "" }) });
    if (filters.st && filters.st !== "all")
      out.push({ key: "st", field: "status", label: filters.st.toUpperCase(), onRemove: () => setF({ st: "all" }) });
    if (windowDays !== 7)
      out.push({ key: "win", field: "window", label: `${windowDays}D`, onRemove: () => setWindowDays(7) });
    for (const n of selNarr)
      out.push({
        key: `narr:${n}`,
        field: "narrative",
        label: n,
        onRemove: () => setF({ narr: selNarr.filter((x) => x !== n).join(",") }),
      });
    for (const r of selRisks)
      out.push({
        key: `risk:${r}`,
        field: "risk",
        label: r,
        onRemove: () => setF({ risks: selRisks.filter((x) => x !== r).join(",") }),
      });
    for (const sec of selSectors)
      out.push({
        key: `sec:${sec}`,
        field: "sector",
        label: sec,
        onRemove: () => setF({ sectors: selSectors.filter((x) => x !== sec).join(",") }),
      });
    if (filters.dec === "1")
      out.push({ key: "dec", field: "beta", label: "decoupled", onRemove: () => setF({ dec: "" }) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, windowDays, selNarr, selRisks, selSectors]);

  const fcClamped = useMemo(() => agg.fcVals.filter((v) => v >= -95 && v <= 300), [agg.fcVals]);
  // share of calls in window that have reached at least TP1
  const tpHitPct = useMemo(() => {
    if (!view.length) return null;
    const hit = view.filter((s) => ["tp1", "tp2", "tp3", "closed_win"].includes(s.status)).length;
    return Math.round((hit / view.length) * 100);
  }, [view]);


  // Which points on each of these three carry a coin's mark and ticker. The
  // ranking is each chart's own question: how much room is left to the target,
  // how far past the call the peak went, how far a coin has run for its beta.
  const stdH = useChartHeight("std");
  const heroH = useChartHeight("hero");


  const derivProps = { view, deriv, pairFc, openPair, openSignalRow, liq };

  // Every tab shares one scroll pane, and it used to keep its offset across a
  // tab change. Click "Open Interest" after scrolling "Anomaly" and you land
  // halfway down the new tab — its heading, its KPI labels and the top of its
  // chart already cut off above the fold, which reads as a broken, half-covered
  // page rather than as scroll. A new tab starts at its own top.
  const paneRef = useRef(null);
  useEffect(() => {
    const el = paneRef.current;
    if (el) el.scrollTop = 0;
  }, [tab]);

  // ════════════════════════════════════════════════════════════
  // Layout: filter chrome is OUTSIDE the scroll pane (never overlays cards).
  // Parent TerminalLayout main is flex-col; we fill height and scroll body only.
  return (
    <div className="flex flex-col min-w-0 w-full min-h-0 lg:h-full">
      {/* ── pinned filter chrome (does not scroll) ── */}
      {/* ONE toolbar, not two stacked rows.
          It was search + status on one line and window + sector + risk on the
          next, and the two lines did not agree on anything: the window group
          was hand-rolled next to a SegControl with the same job, down to
          border-ink/[0.07] against [0.06] and px-2.5 against px-2 — close
          enough to look like a mistake rather than a choice. Same primitive for
          both now, one wrapping row, and the live meta pinned to its end
          instead of floating at the edge of the first line. */}
      <div className="shrink-0 z-20 border-b border-ink/[0.07] bg-surface px-1 pb-2.5 pt-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
          <div className="relative shrink-0">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted/45"
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
              className="w-[8.5rem] sm:w-44 bg-ink/[0.03] border border-ink/[0.08] rounded-lg pl-8 pr-2.5 py-1.5 text-[12px] text-text-primary placeholder:text-text-muted/45 focus:outline-none focus:border-ink/20 font-mono"
            />
          </div>

          <div className="min-w-0 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <SegControl
              className="min-w-max"
              value={filters.st}
              onChange={(id) => setF({ st: id })}
              options={[
                { id: "all", label: t("terminal.viz.all") },
                ...STATUS_ORDER.map((s) => ({ id: s, label: STATUS_LABEL[s] || s })),
              ]}
            />
          </div>

          <div className="order-last ml-auto hidden lg:flex shrink-0 items-center gap-3 font-mono text-[10px] text-text-muted/70 pl-2">
            {agg.btcPrice && (
              <span className="tabular-nums whitespace-nowrap">
                BTC{" "}
                <span className="text-text-primary/85">
                  ${Number(agg.btcPrice).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className={agg.btcChg >= 0 ? "text-positive" : "text-negative"}>
                  {" "}
                  {fmtPct(agg.btcChg)}
                </span>
              </span>
            )}
            <span className="tabular-nums whitespace-nowrap" title="Signals matching filters">
              <span className="text-text-primary/85 font-semibold">{view.length}</span> signals
            </span>
            {data?.generated_at && (
              <span
                className="tabular-nums whitespace-nowrap opacity-80"
                title="Last data refresh"
              >
                {new Date(data.generated_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {deriv?.stale && <span className="text-warning"> · delayed</span>}
              </span>
            )}
          </div>

          {/* Same SegControl as the status pills. The inline "Window" caption
              went with it: 1D / 3D / 7D says what it is, and no other control
              in this row wears its own name. */}
          <SegControl
            value={String(windowDays)}
            onChange={(id) => setWindowDays(Number(id))}
            options={[
              { id: "1", label: "1D" },
              { id: "3", label: "3D" },
              { id: "7", label: "7D" },
            ]}
          />

          <FilterMulti
            label={t("terminal.viz.filterNarrative")}
            options={narrOptions}
            counts={narrCounts}
            selected={selNarr}
            onChange={(arr) => setF({ narr: arr.join(",") })}
          />
          <FilterMulti
            label={t("terminal.viz.filterRisk")}
            options={["LOW", "NORMAL", "HIGH"]}
            selected={selRisks}
            onChange={(arr) => setF({ risks: arr.join(",") })}
          />
          {/* Hidden when nothing qualifies. Decoupled is real but rare — 0 of
              the last 655 calls — and a filter that empties the desk with no
              explanation is worse than no filter. Still rendered while it is
              ACTIVE, or turning it off would become impossible. */}
          {agg.decoupled > 0 || filters.dec === "1" ? (
            <Chip
              active={filters.dec === "1"}
              onClick={() => setF({ dec: filters.dec === "1" ? "" : "1" })}
              title={`Low beta — moves independently of Bitcoin · ${agg.decoupled} in view`}
            >
              {t("terminal.viz.decoupled")}
              <span className="ml-1 font-mono text-[10px] opacity-70">{agg.decoupled}</span>
            </Chip>
          ) : null}
          {/* mobile meta */}
          <div className="ml-auto flex lg:hidden items-center gap-2 font-mono text-[10px] text-text-muted/65">
            <span className="tabular-nums">{view.length} sig</span>
          </div>
        </div>

        <ActiveFilterChips
          items={activeChips}
          onClearAll={() => {
            resetF();
            setWindowDays(7);
          }}
        />
      </div>

      {/* ── scrollable tab body only ── */}
      <div
        ref={paneRef}
        className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden space-y-3 pt-3 pb-20 lg:pb-8 [scrollbar-width:thin] [scrollbar-color:rgb(var(--ink)_/_0.12)_transparent]"
      >
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
          {/* ═══════════ ANOMALY (LIVE) ═══════════ */}
          {tab === "anomaly" && (
            <AnomalyTab
              agg={agg}
              deriv={deriv}
              view={view}
              latestByPair={latestByPair}
              pairFc={pairFc}
              statusMap={statusMap}
              openPair={openPair}
              openSignalRow={openSignalRow}
            />
          )}

          {tab === "live" && (
            <LiveTab
              agg={agg}
              view={view}
              deriv={deriv}
              openPair={openPair}
              statusMap={statusMap}
              fcClamped={fcClamped}
            />
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
            <BtcTab agg={agg} view={view} deriv={deriv} openPair={openPair} statusMap={statusMap} />
          )}

          {/* ═══════════ SECTORS ═══════════ */}
          {tab === "sectors" && (
            <SectorsTab
              agg={agg}
              view={view}
              deriv={deriv}
              setF={setF}
              openPair={openPair}
              openSignalRow={openSignalRow}
              pairFc={pairFc}
              selSectors={selSectors}
            />
          )}
        </>
      )}
      </div>

      {/* ── drill-down: latest call for a coin ── */}
      {selectedSignal && (
        <SignalModal
          signal={selectedSignal}
          isOpen={!!selectedSignal}
          onClose={() => setSelectedSignal(null)}
          onSwitchSignal={(s) => setSelectedSignal(s)}
        />
      )}
    </div>
  );
}
