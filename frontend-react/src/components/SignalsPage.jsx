import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import useShariahFilter from "../hooks/useShariahFilter";
import ShariahFilterNotice from "./ShariahFilterNotice";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SignalsTable from "./SignalsTable";
import { useAuth } from "../context/AuthContext";
import { isEntitled } from "../utils/entitlement";
import SignalModal from "./SignalModal";
import BtcDomAlert from "./BtcDomAlert";
import { classifyCoin, classifySignalVerdict } from "./coinIntelShared";
import { InfoTip, GuideModal } from "./GuideInfo";
import { watchlistApi } from "../services/watchlistApi";
import moneyFlowApi from "../services/moneyFlowApi";
import { signalsApi } from "../services/api";
import CoinLogo from "./CoinLogo";
import CompassSnapshot from "./aiArenaV6/CompassSnapshot";
import AssistantWidget from "./assistant/AssistantWidget";
import EdgePlaybook, { buildRunnerTagSet } from "./EdgePlaybook";
import EdgeActiveFilters from "./EdgeActiveFilters";
import EdgeCorrelationPanel from "./EdgeCorrelationPanel";
import EdgeRecipesBar from "./EdgeRecipesBar";
import { buildEdgeScoreMap, plainEdgeWhy } from "../utils/edgeScore";
import {
  DEFAULT_SORTS,
  MAX_SORTS,
  MULTI_SORT_PRESETS,
  applySortClick,
  formatSortChain,
  isDefaultSorts,
  normalizeSorts,
  orderLabel,
  primaryOf,
  removeSortLevel,
  setPrimarySort,
  sortSignals,
  sortsFromLegacy,
  SORT_LABELS as SORT_FIELD_LABELS,
  toggleSortLevel,
} from "../utils/signalSort";
import {
  DESK_ID,
  FINISHED_ID,
  FreeDeskStrip,
  FreeScrollCue,
  RECENT_ID,
  VipToolsPreview,
} from "./FreeSignalsGuide";



const API_BASE = import.meta.env.VITE_API_URL || "";

// ================================================================
// INLINE SVG ICONS (Lucide-style) — unchanged
// ================================================================
const Icon = {
  filter: (className = "w-3.5 h-3.5") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  search: (className = "w-3.5 h-3.5") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  chevronDown: (className = "w-3 h-3") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  arrowUp: (className = "w-3 h-3") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  ),
  arrowDown: (className = "w-3 h-3") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  ),
  close: (className = "w-3 h-3") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  alert: (className = "w-4 h-4") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  bell: (className = "w-3 h-3") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  check: (className = "w-3 h-3") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  trophy: (className = "w-3 h-3") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  ),
  x: (className = "w-3 h-3") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  flame: (className = "w-3 h-3") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  ),
  zap: (className = "w-3 h-3") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  target: (className = "w-3 h-3") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  sliders: (className = "w-3.5 h-3.5") => (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  ),
};

// Desk KPI cell — Stripe/Bloomberg strip: quiet label, big number, human sub
// A locked KPI keeps its own shape — same label, same footprint — so the row
// still reads as a row and the reader can see exactly what they are missing.
// The value is rendered and then blurred rather than replaced by dots: the
// blur says "there is a real number here", which a placeholder does not.
const LockedKpi = ({ label, value, sub, edge, onUnlock, className = "" }) => (
  <button
    type="button"
    onClick={onUnlock}
    aria-label={`${label} — subscribe to unlock`}
    className={`group relative min-w-0 overflow-hidden px-3 py-2.5 text-left sm:px-5 sm:py-3.5 ${
      edge ? "" : "border-l border-ink/[0.06]"
    } ${className}`}
  >
    <p className="text-[11px] font-medium text-text-muted">{label}</p>
    <p
      aria-hidden="true"
      className="mt-1 select-none font-mono text-[22px] font-semibold tabular-nums leading-none tracking-tight text-text-primary sm:text-[26px]"
      style={{ filter: "blur(7px)", opacity: 0.55 }}
    >
      {value}
    </p>
    {sub ? (
      <p
        aria-hidden="true"
        className="mt-1.5 select-none truncate text-[11px] text-text-muted/85"
        style={{ filter: "blur(4px)", opacity: 0.55 }}
      >
        {sub}
      </p>
    ) : null}
    <span
      className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      style={{ background: "rgb(var(--surface-raised) / 0.72)" }}
    >
      <span
        className="rounded-md px-2.5 py-1 text-[10.5px] font-semibold"
        style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-fg))" }}
      >
        Unlock
      </span>
    </span>
  </button>
);

const KpiCell = ({ label, value, valueColor = "text-text-primary", sub, edge, className = "" }) => (
  <div
    className={`min-w-0 px-3 py-2.5 sm:px-5 sm:py-3.5 ${edge ? "" : "border-l border-ink/[0.06]"} ${className}`}
  >
    <p className="text-[11px] font-medium text-text-muted">{label}</p>
    <p
      className={`mt-1 font-mono text-[22px] font-semibold tabular-nums leading-none tracking-tight sm:text-[26px] ${valueColor}`}
    >
      {value}
    </p>
    {sub ? (
      <p className="mt-1.5 truncate text-[11px] text-text-muted/85">{sub}</p>
    ) : null}
  </div>
);

// ================================================================
// TOKEN SEARCH — strict, base-token aware matching
// ================================================================
// Quote assets we know about. Longest-first so "USDT" is stripped before "USD".
const QUOTE_ASSETS = ["USDT", "USDC", "FDUSD", "BUSD", "TUSD", "USD", "BTC", "ETH"];

// Split a pair like "MANAUSDT" -> { base: "MANA", quote: "USDT" }.
const splitPair = (pairUpper) => {
  for (const qa of QUOTE_ASSETS) {
    if (pairUpper.endsWith(qa) && pairUpper.length > qa.length) {
      return { base: pairUpper.slice(0, -qa.length), quote: qa };
    }
  }
  return { base: pairUpper, quote: "" };
};

// Match a signal pair against a user query.
// - "MUSDT" (token + quote) -> exact full-pair match only ("M/USDT")
// - "M" (bare token) -> base token must START WITH the query
// This stops false positives like "XLMUSDT" / "ATOMUSDT" matching "MUSDT",
// and "NMR" / "XLM" matching a bare "M".
const pairMatchesQuery = (pair, rawQuery) => {
  if (!pair) return false;
  const q = (rawQuery || "").trim().toUpperCase();
  if (!q) return true;
  const P = pair.toUpperCase();

  // If the query itself carries a quote suffix, treat it as a full pair -> exact.
  for (const qa of QUOTE_ASSETS) {
    if (q.endsWith(qa) && q.length > qa.length) {
      return P === q;
    }
  }

  // Otherwise it's a bare token name -> prefix match on the base token.
  const { base } = splitPair(P);
  return base === q || base.startsWith(q);
};

// ================================================================
// LAST-RESULT CACHE
// ================================================================
// The page used to start from `useState([])` + `loading = true` on every mount,
// so returning to Signals — from another page, from a reload, from the menu —
// blanked the table and showed a skeleton for 1-2s even though the very same
// rows had been on screen seconds earlier. The data was thrown away and asked
// for again.
//
// Two layers: a module variable (survives unmount, costs nothing) and
// sessionStorage (survives a reload, and is per-tab so one tab can't hand its
// rows to another). The cached rows are rendered immediately and revalidated in
// the background; the existing "Syncing / Updated HH:MM" chip is what keeps that
// honest, so a trader can always see how old the numbers are.
const SIGNALS_CACHE_KEY = "lq:signals:last";
// Past this the data is stale enough that a clean load is the better trade.
const SIGNALS_CACHE_MAX_AGE = 10 * 60 * 1000;

let signalsMemCache = null;

function readSignalsCache() {
  if (signalsMemCache) {
    return Date.now() - signalsMemCache.at > SIGNALS_CACHE_MAX_AGE ? null : signalsMemCache;
  }
  try {
    const raw = sessionStorage.getItem(SIGNALS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > SIGNALS_CACHE_MAX_AGE) return null;
    signalsMemCache = parsed;
    return parsed;
  } catch {
    return null; // private mode, quota, corrupt entry — just load fresh
  }
}

function writeSignalsCache(payload) {
  signalsMemCache = payload;
  try {
    sessionStorage.setItem(SIGNALS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* over quota — the in-memory copy still covers navigation */
  }
}

// ================================================================
// MAIN PAGE
// ================================================================
const SignalsPage = () => {
  const { t } = useTranslation();

  // Read once, at mount, so the first paint already has rows. useState's lazy
  // initialiser rather than useRef(readSignalsCache()) — the latter re-runs the
  // read on every render and throws the result away.
  const [bootCache] = useState(readSignalsCache);

  const [allSignals, setAllSignals] = useState(() => bootCache?.signals || []);
  const [loading, setLoading] = useState(!bootCache);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(() =>
    bootCache ? new Date(bootCache.at) : null
  );
  const [stats, setStats] = useState(() => bootCache?.stats || null);
  const [apiIsSubscriber, setIsSubscriber] = useState(
    () => bootCache?.isSubscriber ?? false
  );
  const [apiAnswered, setEntitlementKnown] = useState(
    () => bootCache?.isSubscriber != null
  );
  // The account itself is the fast answer and needs no request; the payload
  // confirms it. OR-ed, so a stale snapshot can never take access away from
  // someone who has it.
  const { user, loading: authLoading } = useAuth();
  const entitledByAccount = isEntitled(user);
  const isSubscriber = entitledByAccount || apiIsSubscriber;
  // Guessing wrong is a bug in both directions: guess "free" and a paying
  // admin gets a blurred desk; guess "paid" and a free account sees the real
  // numbers flash before they are hidden. So lock nothing until one of the two
  // sources has actually spoken.
  const entitlementKnown = !authLoading || apiAnswered;
  const [hiddenCount, setHiddenCount] = useState(
    () => bootCache?.hiddenCount ?? 0
  );
  const [vipSample, setVipSample] = useState(() => bootCache?.vipSample ?? null);

  // Coin Intelligence map { pair: coinObj } — used to join win-streak (and other
  // anomaly data) onto signal rows for the new column / filter / sort.
  const [coinIntel, setCoinIntel] = useState(() => bootCache?.coinIntel || {});
  const [currentFlow, setCurrentFlow] = useState(() => bootCache?.currentFlow ?? null);

  const currentPricesRef = useRef({});
  const [priceVersion, setPriceVersion] = useState(0);

  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [searchPair, setSearchPair] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [streakFilter, setStreakFilter] = useState("all"); // 'all' | 'hot'
  const [corrDecoupled, setCorrDecoupled] = useState(false);
  const [corrHighAlign, setCorrHighAlign] = useState(false);
  const [verdictFilter, setVerdictFilter] = useState("all"); // 'all' | 'worth_it' | 'avoid'
  const [selectedDates, setSelectedDates] = useState([]);
  // Watchlist tab (ala MEXC "Favorites"). Watchlist bisa lintas-tanggal (lebih tua
  // dari 7 hari), sementara allSignals cuma 7 hari — jadi watchlist punya SUMBER
  // DATA sendiri (watchlistSignals dari /watchlist/), bukan sekadar filter allSignals.
  const [watchlistIds, setWatchlistIds] = useState([]);
  const [watchlistSignals, setWatchlistSignals] = useState([]);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  // Coin Flow Intensity (top-5) — di-inject dari Money Flow, "More" ke /money-flow.
  const [flowCoins, setFlowCoins] = useState([]);
  const [flowOpen, setFlowOpen] = useState(false); // default tertutup biar hemat tempat
  const [flowCount, setFlowCount] = useState(10); // berapa koin ditampilkan (min 10)
  const [flowSort, setFlowSort] = useState({ key: "intensity", dir: "desc" }); // sort tabel flow
  const navigate = useNavigate();
  // Every blurred number is a button, and they all lead here.
  const goPricing = () => navigate("/pricing?src=signals_locked");
  const tabScrollRef = useRef(null); // horizontal scroll tab bar (day tabs)
  // Multi-level sort chain: [{ field, order }, ...] — primary first.
  const [sorts, setSorts] = useState(() => [...DEFAULT_SORTS]);
  const sortBy = sorts[0]?.field || "created_at";
  const sortOrder = sorts[0]?.order || "desc";
  const setSortBy = useCallback((field) => {
    setSorts((prev) => {
      const order = prev[0]?.field === field ? prev[0].order : "desc";
      return setPrimarySort(field, order);
    });
  }, []);
  const setSortOrder = useCallback((order) => {
    setSorts((prev) => {
      const p = primaryOf(prev);
      return [{ field: p.field, order: order === "asc" ? "asc" : "desc" }, ...prev.slice(1)];
    });
  }, []);

  // Tag intelligence (historical WR per important tag + active signal map).
  const [tagWr, setTagWr] = useState(() => bootCache?.tagWr || []); // raw list from /analytics/tag-wr
  const [selectedTags, setSelectedTags] = useState([]); // multi-select tags (combine freely)
  // any = OR (has at least one tag); all = AND (must carry every selected tag)
  const [tagMatchMode, setTagMatchMode] = useState("any");
  const [showAllTags, setShowAllTags] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Advanced (secondary) filter section — collapsed by default so the console
  // doesn't push the table far down the page. Always force-open when an advanced
  // filter is active so the user can see/clear what's applied.
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Min win-streak length to count as a "High Win Streak" (matches the
  // Coin Intelligence hot-streak heuristic).
  const HOT_STREAK_MIN = 5;

  const fetchBulkSignals = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const token = localStorage.getItem("access_token");
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

      const [signalsRes, statsRes, intelRes, tagWrRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/v1/signals/bulk-7d`, { headers: authHeaders }),
        fetch(`${API_BASE}/api/v1/signals/stats`, { headers: authHeaders }),
        fetch(`${API_BASE}/api/v1/signals/coin-intel`, { headers: authHeaders }),
        // days=0 = all since tag-metrics era (2026-03-10); min_n=40 matches correlation.
        fetch(`${API_BASE}/api/v1/analytics/tag-wr?days=0&min_n=40`, { headers: authHeaders }),
      ]);
      // Collected as we go so the cache written at the end holds one coherent
      // snapshot — never a mix of this fetch and the previous one.
      const snapshot = {};

      if (signalsRes.status === "fulfilled" && signalsRes.value.ok) {
        const data = await signalsRes.value.json();
        snapshot.signals = data.items || [];
        // The API is the authority on what this account may see — reading the
        // role from a local token would let a stale claim disagree with the
        // payload actually served.
        snapshot.isSubscriber = Boolean(data.is_subscriber);
        snapshot.hiddenCount = Number(data.hidden_count) || 0;
        snapshot.vipSample = data.vip_sample || null;
        setAllSignals(snapshot.signals);
        setIsSubscriber(snapshot.isSubscriber);
        setHiddenCount(snapshot.hiddenCount);
        setVipSample(snapshot.vipSample);
        setEntitlementKnown(true);
      } else {
        throw new Error("Failed to fetch signals.");
      }
      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        const statsData = await statsRes.value.json();
        snapshot.stats = statsData;
        setStats(statsData);
      }
      // Coin Intelligence is best-effort: if it fails, the Win Streak column /
      // filter simply shows nothing — the rest of the page is unaffected.
      if (intelRes.status === "fulfilled" && intelRes.value.ok) {
        const intel = await intelRes.value.json();
        const all = [...(intel.top_coins || []), ...(intel.rest_coins || [])];
        const map = {};
        for (const c of all) {
          if (c && c.pair) map[c.pair] = c;
        }
        snapshot.coinIntel = map;
        snapshot.currentFlow = intel.current_flow ?? null;
        setCoinIntel(map);
        setCurrentFlow(snapshot.currentFlow);
      }
      // Tag WR is best-effort: failure just hides the tag filter / badges.
      if (tagWrRes.status === "fulfilled" && tagWrRes.value.ok) {
        const tw = await tagWrRes.value.json();
        snapshot.tagWr = Array.isArray(tw.tags) ? tw.tags : [];
        setTagWr(snapshot.tagWr);
      }
      const at = Date.now();
      setLastUpdated(new Date(at));
      // Only the mandatory part is required to be present; the best-effort
      // pieces fall back to whatever the previous snapshot held.
      writeSignalsCache({
        at,
        signals: snapshot.signals,
        // Entitlement has to survive the reload too, or a returning subscriber
        // gets the free-account view until the fetch catches up.
        isSubscriber: snapshot.isSubscriber ?? bootCache?.isSubscriber ?? false,
        hiddenCount: snapshot.hiddenCount ?? bootCache?.hiddenCount ?? 0,
        vipSample: snapshot.vipSample ?? bootCache?.vipSample ?? null,
        stats: snapshot.stats ?? bootCache?.stats ?? null,
        coinIntel: snapshot.coinIntel ?? bootCache?.coinIntel ?? {},
        currentFlow: snapshot.currentFlow ?? bootCache?.currentFlow ?? null,
        tagWr: snapshot.tagWr ?? bootCache?.tagWr ?? [],
      });
    } catch (err) {
      console.error("Error fetching signals:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // With cached rows already on screen, revalidate WITHOUT the skeleton —
    // blanking a table the user can read is the thing being fixed here. The
    // "Syncing" chip still reports that a refresh is in flight.
    fetchBulkSignals(!bootCache);

    // Only the tab being looked at does the work. Three open tabs used to poll
    // in lockstep even though two of them were hidden. Same pattern as
    // AutoTradePage: skip while hidden, and refresh the moment the tab comes
    // back so what you see is never the version you left behind.
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      fetchBulkSignals(false);
    };
    const interval = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [fetchBulkSignals, bootCache]);

  // ── Modal sinyal didorong oleh URL: ?signal=<id>&tab=chart|trade|research|history ──
  // Sumber kebenaran tunggal — buka via klik baris, deep-link, atau back/forward
  // browser semuanya lewat query param yang sama, jadi selalu konsisten.
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const selectedSignalId = searchParams.get("signal");
  const selectedTab = searchParams.get("tab") || "chart";
  // Fallback for signals not in the 7-day bulk list (deep-link / landing day-proof /
  // history). Without this, URL has ?signal= but modal never mounts.
  const [directSignal, setDirectSignal] = useState(null);
  const fetchedSignalIdRef = useRef(null);

  // Seed from landing day-drill router state (instant paint + trust data)
  useEffect(() => {
    const seed = location.state?.seedSignal;
    if (!seed?.signal_id || !selectedSignalId) return;
    if (String(seed.signal_id) !== String(selectedSignalId)) return;
    setDirectSignal((prev) => {
      if (prev && String(prev.signal_id) === String(selectedSignalId) && prev.pair) return prev;
      return { ...seed, signal_id: String(seed.signal_id) };
    });
  }, [location.state, selectedSignalId]);

  const selectedSignal = useMemo(() => {
    if (!selectedSignalId) return null;
    const fromList = allSignals.find((s) => String(s.signal_id) === String(selectedSignalId));
    if (fromList) return fromList;
    if (directSignal && String(directSignal.signal_id) === String(selectedSignalId))
      return directSignal;
    // Immediate stub so modal opens while detail loads (trust path from landing)
    return { signal_id: selectedSignalId };
  }, [selectedSignalId, allSignals, directSignal]);

  // Load full detail for any-age signal id (not only last 7 days).
  useEffect(() => {
    if (!selectedSignalId) {
      setDirectSignal(null);
      fetchedSignalIdRef.current = null;
      return undefined;
    }
    if (allSignals.some((s) => String(s.signal_id) === String(selectedSignalId))) {
      return undefined;
    }

    let alive = true;
    const id = String(selectedSignalId);
    // Always (re)fetch detail for deep-links so Trade tab has charts/journey.
    // Merge over seed/stub; do not skip after bulk list churn.
    signalsApi
      .getSignal(id)
      .then((full) => {
        if (!alive || !full) return;
        fetchedSignalIdRef.current = id;
        setDirectSignal((prev) => ({
          ...(prev && String(prev.signal_id) === id ? prev : {}),
          ...full,
          // Prefer non-null seed entry/targets if API redacted
          entry: full.entry ?? prev?.entry,
          target1: full.target1 ?? prev?.target1,
          target2: full.target2 ?? prev?.target2,
          target3: full.target3 ?? prev?.target3,
          target4: full.target4 ?? prev?.target4,
          stop1: full.stop1 ?? prev?.stop1,
          stop2: full.stop2 ?? prev?.stop2,
          entry_chart_url: full.entry_chart_url || prev?.entry_chart_url,
          latest_chart_url: full.latest_chart_url || prev?.latest_chart_url,
          signal_id: full.signal_id || id,
        }));
      })
      .catch((err) => {
        console.error("Failed to load signal by id:", err);
        if (alive) {
          setDirectSignal((prev) =>
            prev && String(prev.signal_id) === id
              ? prev
              : { signal_id: id, pair: "???", status: "open" }
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [selectedSignalId, allSignals]);

  // The three biggest movers in the loaded window, ranked by peak —
  // close_price holds the recorded high (final target when no high was
  // captured). Drawn from rows already on the page, so the showcase follows
  // the period instead of being a hand-picked brag that goes stale.
  // Chosen server-side: the coin objects have to travel with the choice, and
  // /coin-intel is subscriber-only so the client cannot fetch them.
  const vipSamples = useMemo(() => {
    const ids = vipSample?.signal_ids;
    if (!ids?.length) return [];
    const byId = new Map((allSignals || []).map((x) => [x.signal_id, x]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }, [vipSample, allSignals]);

  // The desk's own figures, verbatim. Deriving them here is what produced a
  // 63.8% win rate and an "Avoid" verdict on a call rated Worth 82.
  const vipSampleIntel = vipSample?.intel || {};

  const openSignal = useCallback(
    (sig, tab = "chart") => {
      if (!sig) return;
      setDirectSignal(sig);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("signal", String(sig.signal_id));
        if (tab && tab !== "chart") next.set("tab", tab);
        else next.delete("tab");
        return next;
      });
    },
    [setSearchParams]
  );

  const closeSignal = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("signal");
      next.delete("tab");
      return next;
    });
  }, [setSearchParams]);

  const changeSignalTab = useCallback(
    (tab) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (tab && tab !== "chart") next.set("tab", tab);
        else next.delete("tab");
        return next;
      });
    },
    [setSearchParams]
  );

  useEffect(() => {
    setPage(1);
  }, [
    searchPair,
    statusFilter,
    riskFilter,
    streakFilter,
    corrDecoupled,
    corrHighAlign,
    verdictFilter,
    selectedDates,
    sorts,
    selectedTags,
    showWatchlistOnly,
  ]);

  // Ambil watchlist penuh (objek sinyal lengkap, lintas-tanggal) untuk tab Watchlist
  // + turunkan ID-nya buat badge. Dipanggil saat mount & tiap star berubah.
  const refreshWatchlist = useCallback(async () => {
    try {
      const data = await watchlistApi.getWatchlist();
      const items = Array.isArray(data) ? data : data?.items || data?.watchlist || [];
      setWatchlistSignals(items);
      setWatchlistIds(items.map((i) => i.signal_id).filter(Boolean));
    } catch {}
  }, []);

  useEffect(() => {
    refreshWatchlist();
  }, [refreshWatchlist]);

  // Coin Flow Intensity (top-10, exclude stablecoin) untuk strip — sumber Money Flow.
  useEffect(() => {
    let alive = true;
    const STABLE = new Set([
      "USDT",
      "USDC",
      "DAI",
      "TUSD",
      "FDUSD",
      "USDE",
      "USDD",
      "PYUSD",
      "BUSD",
      "USDP",
      "GUSD",
      "FRAX",
      "LUSD",
      "USDS",
      "USR",
      "USD1",
    ]);
    moneyFlowApi
      .getCoins({ limit: 80 })
      .then((res) => {
        const coins = Array.isArray(res) ? res : res?.coins || [];
        const filtered = (coins || []).filter(
          (c) => c.symbol && !STABLE.has(c.symbol.toUpperCase())
        );
        if (alive) setFlowCoins(filtered.slice(0, 60));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const updatedCount = useMemo(() => {
    return allSignals.filter((s) => s.last_update_at).length;
  }, [allSignals]);

  // Count of signals currently on a "high" win streak (for the filter badge).
  const hotStreakCount = useMemo(() => {
    return allSignals.filter((s) => {
      const st = coinIntel[s.pair]?.current_streak;
      return st && st.type === "win" && st.length >= HOT_STREAK_MIN;
    }).length;
  }, [allSignals, coinIntel]);

  // Counts for the BTC correlation filter badges.
  const corrCounts = useMemo(() => {
    let dec = 0,
      hi = 0;
    for (const s of allSignals) {
      if (s.btc_decoupled) dec++;
      if ((s.btc_align_score ?? -1) >= 70) hi++;
    }
    return { dec, hi };
  }, [allSignals]);

  // Pair-level verdict (coin detail / recipes). Row filters use LOO below.
  const verdictByPair = useMemo(() => {
    const map = {};
    for (const pair in coinIntel) {
      map[pair] = classifyCoin(coinIntel[pair]);
    }
    return map;
  }, [coinIntel]);

  // Per-signal Avoid/Worth: leave-one-out when closed so the row's own
  // outcome cannot invent the label (as-of-entry best practice).
  const getVerdictForSignal = useCallback(
    (signal) => {
      if (!signal?.pair) return null;
      const coin = coinIntel?.[signal.pair];
      if (!coin) return null;
      return classifySignalVerdict(coin, signal);
    },
    [coinIntel]
  );

  const verdictCounts = useMemo(() => {
    let worth = 0,
      avoid = 0;
    for (const s of allSignals) {
      const v = getVerdictForSignal(s);
      if (v === "worth_it") worth++;
      else if (v === "avoid") avoid++;
    }
    return { worth, avoid };
  }, [allSignals, getVerdictForSignal]);

  // Tag WR lookup { tagName: { wr, n, median_peak } } — for chip labels & badges.
  const tagWrMap = useMemo(() => {
    const m = {};
    for (const t of tagWr) {
      m[t.tag] = {
        wr: t.win_rate,
        n: t.n,
        median_peak: t.median_peak,
        median_peak_wins: t.median_peak_wins,
        tp4_rate: t.tp4_rate,
        full_tp_rate: t.full_tp_rate,
      };
    }
    return m;
  }, [tagWr]);

  // Tags historically associated with fuller targets / higher peak (for row badges)
  const runnerTagSet = useMemo(() => buildRunnerTagSet(tagWr), [tagWr]);

  // Map { signal_id: [tagName, ...] } built from each signal's own tags
  // (provided by bulk-7d). This is what makes the filter dynamic — it reflects
  // exactly the signals currently in view, whatever timeline/day is selected.
  const signalTags = useMemo(() => {
    const m = {};
    for (const s of allSignals) {
      if (s.signal_id && Array.isArray(s.important_tags)) {
        m[s.signal_id] = s.important_tags;
      }
    }
    return m;
  }, [allSignals]);

  // Overall resolved baseline WR from edge-correlation (same base_wr as API open score).
  // Fallback: client weighted tag avg inside buildEdgeScoreContext.
  const [edgeBaselineWr, setEdgeBaselineWr] = useState(null);
  // Server open_scored map — single source of truth for open ranks vs Edge column.
  const [apiOpenScoreById, setApiOpenScoreById] = useState({});
  // Edge Score v2 — EB-shrunk tags + multi-factor (vol/risk/BTC/tt/coin/expectancy)
  const { map: edgeScoreMap } = useMemo(() => {
    const { map, ctx } = buildEdgeScoreMap(
      allSignals,
      signalTags,
      tagWr,
      edgeBaselineWr,
      coinIntel
    );
    // Overlay server open scores so Edge column matches ranked open table exactly.
    for (const [id, row] of Object.entries(apiOpenScoreById || {})) {
      if (row == null || row.score == null) continue;
      const merged = {
        ...(map[id] || {}),
        score: row.score,
        scoreVersion: row.score_version || "v2",
        confidence: row.confidence ?? map[id]?.confidence,
        avgLift: row.avg_lift_pp ?? map[id]?.avgLift,
        avgFull: row.avg_full_tp ?? map[id]?.avgFull,
        avg_lift_pp: row.avg_lift_pp,
        avg_full_tp: row.avg_full_tp,
        bestTag: row.best_tag ?? map[id]?.bestTag,
        bestTagWr: row.best_tag_wr ?? map[id]?.bestTagWr,
        caution: row.caution_tags ?? map[id]?.caution,
        caution_tags: row.caution_tags,
        matchedN: row.matched_n ?? map[id]?.matchedN,
        preferN: map[id]?.preferN,
        reason: row.reason ?? map[id]?.reason,
        factors: row.factors ?? map[id]?.factors,
        expectancyR: row.expectancy_r ?? map[id]?.expectancyR,
        fromApi: true,
      };
      merged.plainWhy = plainEdgeWhy(merged);
      map[id] = merged;
    }
    return { map, ctx };
  }, [allSignals, signalTags, tagWr, edgeBaselineWr, apiOpenScoreById, coinIntel]);

  // Tags sorted by WR desc (chips); top 10 unless "show all".
  const sortedTagsForChips = useMemo(() => {
    return [...tagWr].sort((a, b) => b.win_rate - a.win_rate);
  }, [tagWr]);

  // UTC calendar day (default) — matches backend bulk timestamps and historical
  // Signals tabs. created_at is ISO; first 10 chars are the UTC date.
  const signalUtcYmd = (iso) => (iso ? String(iso).slice(0, 10) : "");

  // Shariah screening filter — no-op unless the user switched it on.
  const shariah = useShariahFilter();

  // Signals passing every filter EXCEPT the tag filter — used to compute
  // dynamic per-tag counts (how many currently-visible signals carry each tag)
  // and to decide which chips to show. Tag filter itself is excluded so counts
  // don't collapse to the current selection.
  const signalsBeforeTagFilter = useMemo(() => {
    let f;
    if (showWatchlistOnly) {
      const bySid = new Map(allSignals.map((s) => [s.signal_id, s]));
      f = watchlistSignals.map((w) => {
        const m = bySid.get(w.signal_id);
        return m ? { ...w, ...m } : w;
      });
    } else {
      f = [...allSignals];
    }
    if (searchPair) {
      f = f.filter((s) => pairMatchesQuery(s.pair, searchPair));
    }
    if (!showWatchlistOnly && selectedDates.length > 0) {
      f = f.filter(
        (s) => s.created_at && selectedDates.includes(signalUtcYmd(s.created_at))
      );
    }
    if (statusFilter === "updated") {
      f = f.filter((s) => s.last_update_at);
    } else if (statusFilter !== "all") {
      f = f.filter((s) => {
        const st = (s.status || "").toLowerCase();
        switch (statusFilter) {
          case "open":
            return st === "open";
          case "tp1":
            return st === "tp1";
          case "tp2":
            return st === "tp2";
          case "tp3":
            return st === "tp3";
          case "tp1_plus":
            return ["tp1", "tp2", "tp3", "tp4", "closed_win"].includes(st);
          case "tp2_plus":
            return ["tp2", "tp3", "tp4", "closed_win"].includes(st);
          case "full_tp":
            return st === "tp3" || st === "tp4" || st === "closed_win";
          case "tp4":
          case "closed_win":
            return st === "closed_win" || st === "tp4";
          case "sl":
          case "closed_loss":
            return st === "closed_loss" || st === "sl";
          default:
            return true;
        }
      });
    }
    if (riskFilter !== "all") {
      f = f.filter((s) => {
        const r = (s.risk_level || "").toLowerCase();
        switch (riskFilter) {
          case "low":
            return r.startsWith("low");
          case "normal":
            return r.startsWith("med") || r.startsWith("nor");
          case "high":
            return r.startsWith("high");
          default:
            return true;
        }
      });
    }
    if (streakFilter === "hot") {
      f = f.filter((s) => {
        const st = coinIntel[s.pair]?.current_streak;
        return st && st.type === "win" && st.length >= HOT_STREAK_MIN;
      });
    }
    if (corrDecoupled) f = f.filter((s) => s.btc_decoupled === true);
    if (corrHighAlign) f = f.filter((s) => (s.btc_align_score ?? -1) >= 70);
    if (verdictFilter !== "all") f = f.filter((s) => getVerdictForSignal(s) === verdictFilter);
    return f;
  }, [
    allSignals,
    searchPair,
    selectedDates,
    statusFilter,
    riskFilter,
    streakFilter,
    corrDecoupled,
    corrHighAlign,
    verdictFilter,
    getVerdictForSignal,
    coinIntel,
    showWatchlistOnly,
    watchlistSignals,
  ]);

  // Dynamic per-tag count: how many currently-visible signals carry each tag.
  const tagActiveCount = useMemo(() => {
    const m = {};
    for (const s of signalsBeforeTagFilter) {
      const tags = s.important_tags;
      if (!Array.isArray(tags)) continue;
      for (const tg of tags) m[tg] = (m[tg] || 0) + 1;
    }
    return m;
  }, [signalsBeforeTagFilter]);

  // All unique pairs across every signal — passed to the table so it can fetch
  // live price/volume for the WHOLE dataset, not just the current page. This is
  // what makes "sort by volume" correct & stable across pages.
  const allPairs = useMemo(() => {
    // Sertakan pair watchlist (bisa lebih tua dari 7 hari) supaya harga live-nya
    // tetap ke-fetch saat tab Watchlist aktif.
    return [
      ...new Set(
        [...allSignals.map((s) => s.pair), ...watchlistSignals.map((s) => s.pair)].filter(Boolean)
      ),
    ];
  }, [allSignals, watchlistSignals]);

  const todayStats = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySignals = allSignals.filter(
      (s) => s.created_at && signalUtcYmd(s.created_at) === todayStr
    );
    const total = todaySignals.length;
    const open = todaySignals.filter((s) => s.status === "open").length;
    const closed = todaySignals.filter((s) => s.status !== "open");
    const wins = closed.filter((s) => !["closed_loss", "sl"].includes(s.status)).length;
    const losses = closed.filter((s) => ["closed_loss", "sl"].includes(s.status)).length;
    const closedCount = closed.length;
    const wr = closedCount > 0 ? Math.round((wins / closedCount) * 100) : 0;
    return { total, open, wins, losses, closedCount, wr };
  }, [allSignals]);

  const dateOptions = useMemo(() => {
    const options = [{ value: "all", label: "All Days" }];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel =
        i === 0
          ? "Today"
          : i === 1
            ? "Yesterday"
            : d.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                timeZone: "UTC",
              });
      const count = allSignals.filter((s) => signalUtcYmd(s.created_at) === dateStr).length;
      if (count > 0) {
        options.push({ value: dateStr, label: dayLabel, count });
      }
    }
    return options;
  }, [allSignals]);

  const handlePricesUpdate = useCallback((priceMap) => {
    currentPricesRef.current = priceMap;
    setPriceVersion((v) => v + 1);
  }, []);

  const getPriceVal = (pair) => {
    const data = currentPricesRef.current[pair];
    if (!data) return 0;
    if (typeof data === "number") return data;
    return data.price || 0;
  };

  const getVolVal = (pair) => {
    const data = currentPricesRef.current[pair];
    if (!data || typeof data === "number") return 0;
    return data.volume || 0;
  };

  // Signed win-streak value for sorting: win → +length, loss → −length,
  // no Coin Intelligence data → null (so it can sink to the bottom).
  const getStreakVal = (pair) => {
    const st = coinIntel[pair]?.current_streak;
    if (!st || !st.length) return null;
    return st.type === "win" ? st.length : -st.length;
  };

  // Win rate for sorting (null when coin has no Coin Intelligence entry).
  const getWinRateVal = (pair) => {
    const wr = coinIntel[pair]?.win_rate;
    return wr == null ? null : wr;
  };

  const getOrderLabel = () => orderLabel(sortBy, sortOrder);

  // Count of active advanced (secondary) filters — drives the badge on the
  // "Advanced filters" toggle. TIDAK lagi memaksa panel terbuka: user boleh
  // apply filter lalu menutup panel; filter tetap berlaku (badge "N active").
  const advancedActiveCount =
    (statusFilter !== "all" ? 1 : 0) +
    (riskFilter !== "all" ? 1 : 0) +
    (streakFilter !== "all" ? 1 : 0) +
    (corrDecoupled ? 1 : 0) +
    (corrHighAlign ? 1 : 0) +
    (verdictFilter !== "all" ? 1 : 0) +
    (selectedTags.length > 0 ? 1 : 0) +
    (!isDefaultSorts(sorts) ? 1 : 0);

  // Panel murni dikontrol toggle user (bisa ditutup walau ada filter aktif).
  const advancedOpen = showAdvanced;

  const hasActiveFilters =
    searchPair ||
    statusFilter !== "all" ||
    riskFilter !== "all" ||
    streakFilter !== "all" ||
    corrDecoupled ||
    corrHighAlign ||
    verdictFilter !== "all" ||
    selectedDates.length > 0 ||
    !isDefaultSorts(sorts) ||
    selectedTags.length > 0 ||
    showWatchlistOnly;

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    );
  };

  const resetFilters = useCallback(() => {
    setSearchPair("");
    setStatusFilter("all");
    setRiskFilter("all");
    setStreakFilter("all");
    setCorrDecoupled(false);
    setCorrHighAlign(false);
    setVerdictFilter("all");
    setSelectedDates([]);
    setSelectedTags([]);
    setTagMatchMode("any");
    setShowWatchlistOnly(false);
    setSorts([...DEFAULT_SORTS]);
    setPage(1);
  }, []);

  /** Apply a full recipe / saved-view state (Cara cepat + My recipes). */
  const applyRecipeState = useCallback((state) => {
    if (!state || typeof state !== "object") return;
    setSelectedTags(Array.isArray(state.selectedTags) ? state.selectedTags : []);
    setTagMatchMode(state.tagMatchMode === "all" ? "all" : "any");
    setVerdictFilter(state.verdictFilter || "all");
    setStatusFilter(state.statusFilter || "all");
    setRiskFilter(state.riskFilter || "all");
    setStreakFilter(state.streakFilter || "all");
    if (Array.isArray(state.sorts) && state.sorts.length) {
      setSorts(normalizeSorts(state.sorts));
    } else {
      setSorts(sortsFromLegacy(state.sortBy || "created_at", state.sortOrder || "desc"));
    }
    setSearchPair(state.searchPair || "");
    setCorrDecoupled(!!state.corrDecoupled);
    setCorrHighAlign(!!state.corrHighAlign);
    setSelectedDates([]);
    setShowWatchlistOnly(false);
    setPage(1);
  }, []);



  const toggleDateFilter = (dateVal) => {
    if (dateVal === "all") {
      setSelectedDates([]);
    } else {
      setSelectedDates((prev) => {
        if (prev.includes(dateVal)) return prev.filter((d) => d !== dateVal);
        return [...prev, dateVal];
      });
    }
  };

  const { signals, totalPages, totalSignals, shariahHidden } = useMemo(() => {
    // Watchlist mode: sumbernya data watchlist penuh (lintas-tanggal), BUKAN allSignals
    // (yang cuma 7 hari). Objek watchlist lebih ramping → merge dgn allSignals (by
    // signal_id) supaya kolom MCAP / BTC Corr / dll tetap terisi untuk sinyal yang
    // masih ada di set 7-hari.
    let filtered;
    if (showWatchlistOnly) {
      const bySid = new Map(allSignals.map((s) => [s.signal_id, s]));
      filtered = watchlistSignals.map((w) => {
        const m = bySid.get(w.signal_id);
        return m ? { ...w, ...m } : w; // m (allSignals) menang → semua kolom terisi
      });
    } else {
      filtered = [...allSignals];
    }

    // Shariah screening, applied before every other filter so the date tabs,
    // tag counts and pagination all describe the list actually on screen.
    // Counted here rather than derived later: the banner has to say how many
    // signals it removed, and that number only exists at this moment.
    const beforeShariah = filtered.length;
    filtered = shariah.filter(filtered, (s) => s.pair);
    const shariahHidden = beforeShariah - filtered.length;

    if (searchPair) {
      filtered = filtered.filter((s) => pairMatchesQuery(s.pair, searchPair));
    }

    // Filter tanggal hanya berlaku di mode non-watchlist (watchlist lintas-tanggal).
    // UTC calendar day — matches created_at ISO prefix and default Signals tabs.
    if (!showWatchlistOnly && selectedDates.length > 0) {
      filtered = filtered.filter(
        (s) => s.created_at && selectedDates.includes(signalUtcYmd(s.created_at))
      );
    }

    if (statusFilter === "updated") {
      filtered = filtered.filter((s) => s.last_update_at);
    } else if (statusFilter !== "all") {
      filtered = filtered.filter((s) => {
        const st = (s.status || "").toLowerCase();
        switch (statusFilter) {
          case "open":
            return st === "open";
          case "tp1":
            return st === "tp1";
          case "tp2":
            return st === "tp2";
          case "tp3":
            return st === "tp3";
          case "tp1_plus":
            return ["tp1", "tp2", "tp3", "tp4", "closed_win"].includes(st);
          case "tp2_plus":
            return ["tp2", "tp3", "tp4", "closed_win"].includes(st);
          case "full_tp":
            return st === "tp3" || st === "tp4" || st === "closed_win";
          case "tp4":
          case "closed_win":
            return st === "closed_win" || st === "tp4";
          case "sl":
          case "closed_loss":
            return st === "closed_loss" || st === "sl";
          default:
            return true;
        }
      });
    }

    if (riskFilter !== "all") {
      filtered = filtered.filter((s) => {
        const r = (s.risk_level || "").toLowerCase();
        switch (riskFilter) {
          case "low":
            return r.startsWith("low");
          case "normal":
            return r.startsWith("med") || r.startsWith("nor");
          case "high":
            return r.startsWith("high");
          default:
            return true;
        }
      });
    }

    // High Win Streak filter — joins Coin Intelligence by pair.
    if (streakFilter === "hot") {
      filtered = filtered.filter((s) => {
        const st = coinIntel[s.pair]?.current_streak;
        return st && st.type === "win" && st.length >= HOT_STREAK_MIN;
      });
    }

    // BTC correlation filters (data joined onto each row by the backend).
    if (corrDecoupled) {
      filtered = filtered.filter((s) => s.btc_decoupled === true);
    }
    if (corrHighAlign) {
      filtered = filtered.filter((s) => (s.btc_align_score ?? -1) >= 70);
    }

    // Verdict filter — per-signal LOO (closed rows exclude own outcome).
    if (verdictFilter !== "all") {
      filtered = filtered.filter((s) => getVerdictForSignal(s) === verdictFilter);
    }

    // Tag filter — multi-select; match mode any (OR) or all (AND).
    if (selectedTags.length > 0) {
      filtered = filtered.filter((s) => {
        const tags = signalTags[s.signal_id];
        if (!tags?.length) return false;
        return tagMatchMode === "all"
          ? selectedTags.every((t) => tags.includes(t))
          : selectedTags.some((t) => tags.includes(t));
      });
    }

    // Multi-level sort: e.g. verdict ↓ → edge ↓ → called ↓ (stable tiebreak inside).
    filtered = sortSignals(filtered, sorts, {
      getPriceVal,
      getVolVal,
      getStreakVal,
      getWinRateVal,
      edgeScoreMap,
      coinIntel,
      getVerdictForSignal,
    });

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pages);
    const start = (safePage - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);
    return { signals: paged, totalPages: pages, totalSignals: total, shariahHidden };
  }, [
    allSignals,
    shariah,
    searchPair,
    statusFilter,
    riskFilter,
    streakFilter,
    corrDecoupled,
    corrHighAlign,
    verdictFilter,
    getVerdictForSignal,
    selectedDates,
    sorts,
    page,
    pageSize,
    priceVersion,
    coinIntel,
    selectedTags,
    tagMatchMode,
    signalTags,
    edgeScoreMap,
    showWatchlistOnly,
    watchlistIds,
    watchlistSignals,
    getVerdictForSignal,
  ]);

  /** Table header click — Shift/⌘/Ctrl adds a secondary sort level. */
  const handleSort = useCallback((field, ev) => {
    const additive = !!(ev && (ev.shiftKey || ev.metaKey || ev.ctrlKey));
    setSorts((prev) => applySortClick(prev, field, { additive }));
  }, []);

  const statusOptions = [
    { value: "all", label: "All Status" },
    { value: "updated", label: "Recently Hit", icon: Icon.bell, accent: "gold" },
    { value: "open", label: "Open" },
    { value: "tp1", label: "TP1", icon: Icon.check, accent: "emerald" },
    { value: "tp2", label: "TP2", icon: Icon.check, accent: "emerald" },
    { value: "tp3", label: "TP3", icon: Icon.check, accent: "emerald" },
    { value: "closed_win", label: "TP4", icon: Icon.trophy, accent: "emerald" },
    { value: "closed_loss", label: "Loss", icon: Icon.x, accent: "red" },
  ];

  const riskOptions = [
    { value: "all", label: "All" },
    { value: "low", label: "Low", dotColor: "bg-profit" },
    { value: "normal", label: "Normal", dotColor: "bg-accent" },
    { value: "high", label: "High", dotColor: "bg-negative" },
  ];

  const sortOptions = [
    { value: "edge_score", label: "Edge Score (learn)" },
    { value: "created_at", label: "Called Time" },
    { value: "last_update", label: "Last Update" },
    { value: "pair", label: "Pair Name" },
    { value: "current_price", label: "Current Price" },
    { value: "entry", label: "Entry Price" },
    { value: "max_target", label: "Max Target %" },
    { value: "stop_loss", label: "Stop Loss %" },
    { value: "status", label: "Signal Status" },
    { value: "risk_level", label: "Risk Level" },
    { value: "win_rate", label: "Win Rate" },
    { value: "win_streak", label: "Win Streak" },
    { value: "btc_corr", label: "BTC Alignment" },
    { value: "verdict", label: "Verdict (Worth→Avoid)" },
    { value: "market_cap", label: "Market Cap" },
    { value: "volume", label: "Volume 24H" },
  ];

  return (
    <div className="space-y-4 pb-10">
      {!isSubscriber && entitlementKnown && (
        <FreeDeskStrip hasRecent={vipSamples.length > 0} onUpgrade={goPricing} />
      )}
      {/* ── SIGNALS DESK — command center (title + KPI + BTC in one board) ── */}
      <header id={DESK_ID} className="scroll-mt-32 space-y-3">
        {/* Title row — hidden on phones; the tab already says Signals */}
        <div className="hidden sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-text-primary lg:text-[28px]">
              Signals
            </h1>
            <p className="mt-0.5 text-[13px] text-text-muted">
              Desk · last 7 days
              <span className="mx-1.5 text-text-muted/40">·</span>
              <span className="font-mono tabular-nums text-text-secondary">
                {allSignals.length}
              </span>
              {updatedCount > 0 ? (
                <>
                  <span className="text-text-muted"> signals · </span>
                  <span className="font-mono tabular-nums text-text-secondary">
                    {updatedCount}
                  </span>
                  <span className="text-text-muted"> updated</span>
                </>
              ) : (
                <span className="text-text-muted"> signals</span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.04] px-2.5 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                {loading ? (
                  <span className="relative inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
                ) : (
                  <>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-40" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-positive" />
                  </>
                )}
              </span>
              <span className="text-[11px] font-medium tabular-nums text-text-muted">
                {loading
                  ? "Syncing"
                  : lastUpdated
                    ? lastUpdated.toLocaleTimeString("en-US", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : "Live"}
              </span>
            </div>
          </div>
        </div>

        {/* Unified desk board: KPIs + embedded Compass */}
        <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {isSubscriber || !entitlementKnown ? (
              <KpiCell
                edge
                label="Today"
                value={todayStats.total}
                sub={`${todayStats.open} open · ${todayStats.wins}W / ${todayStats.losses}L`}
              />
            ) : (
              <LockedKpi
                edge
                label="Today"
                value={todayStats.total}
                sub={`${todayStats.open} open · ${todayStats.wins}W / ${todayStats.losses}L`}
                onUnlock={goPricing}
              />
            )}
            {isSubscriber || !entitlementKnown ? (
              <KpiCell
                label="Desk WR"
                value={`${todayStats.wr}%`}
                valueColor={
                  todayStats.wr >= 50
                    ? "text-profit"
                    : todayStats.wr > 0
                      ? "text-text-primary"
                      : "text-text-primary"
                }
                sub={`${todayStats.closedCount} closed today`}
              />
            ) : (
              <LockedKpi
                label="Desk WR"
                value={`${todayStats.wr}%`}
                sub={`${todayStats.closedCount} closed today`}
                onUnlock={goPricing}
              />
            )}
            <KpiCell
              className="hidden sm:block"
              label="Lifetime WR"
              value={stats?.win_rate != null ? `${stats.win_rate}%` : "—"}
              valueColor={
                stats?.win_rate != null && stats.win_rate >= 70
                  ? "text-profit"
                  : "text-text-primary"
              }
              sub={
                stats
                  ? `${(stats.total_signals || 0).toLocaleString()} trades`
                  : "—"
              }
            />
            {isSubscriber || !entitlementKnown ? (
              <KpiCell
                className="hidden sm:block"
                label="In view"
                value={allSignals.length}
                sub="rolling 7 days"
              />
            ) : (
              <LockedKpi
                className="hidden sm:flex"
                label="In view"
                // The real 7-day count, blurred — not the filtered length,
                // which would understate the desk by whatever we hid.
                value={allSignals.length + hiddenCount}
                sub="rolling 7 days"
                onUnlock={goPricing}
              />
            )}
          </div>

          <div className="border-t border-ink/[0.06]">
            <CompassSnapshot embedded />
          </div>
        </div>

        {!isSubscriber && entitlementKnown && (
          <FreeScrollCue
            label={vipSamples.length ? "Recent call" : "Finished calls"}
            targetId={vipSamples.length ? RECENT_ID : FINISHED_ID}
          />
        )}
      </header>

      {/* Coin flow — header only until expanded. Chip rail hid so the desk stays the table. */}
      {flowCoins.length > 0 &&
        (() => {
          const findSignal = (sym) =>
            allSignals.find(
              (s) =>
                (s.pair || "").replace(/USDT$/i, "").toUpperCase() === String(sym).toUpperCase()
            );
          const statusRank = (st) => {
            const s = (st || "").toLowerCase();
            if (!st) return -1;
            if (s === "sl" || s === "closed_loss") return 0;
            if (s === "open") return 1;
            if (s.startsWith("tp")) return 1 + (parseInt(s.slice(2)) || 1);
            if (s === "closed_win") return 6;
            return 1;
          };
          // enrich (signal + from-call %) lalu sort per kolom, baru slice
          const enriched = flowCoins.map((c) => {
            const sig = findSignal(c.symbol);
            const entry = sig?.entry ? Number(sig.entry) : null;
            const fromCall = entry && c.price ? ((c.price - entry) / entry) * 100 : null;
            return { c, sig, fromCall };
          });
          const sortVal = (x, key) => {
            switch (key) {
              case "coin":
                return x.c.symbol || "";
              case "chg":
                return x.c.price_change_24h ?? -Infinity;
              case "intensity":
                return x.c.flow_intensity ?? -Infinity;
              case "fromcall":
                return x.fromCall ?? -Infinity;
              case "status":
                return x.sig ? statusRank(x.sig.status) : -Infinity;
              case "called":
                return x.sig?.created_at ? new Date(x.sig.created_at).getTime() : -Infinity;
              default:
                return 0;
            }
          };
          const sortedFlow = [...enriched].sort((a, b) => {
            const va = sortVal(a, flowSort.key),
              vb = sortVal(b, flowSort.key);
            const cmp = typeof va === "string" ? String(va).localeCompare(String(vb)) : va - vb;
            return flowSort.dir === "asc" ? cmp : -cmp;
          });
          const rows = sortedFlow.slice(0, flowCount);
          const maxInt = Math.max(...rows.map((r) => r.c.flow_intensity || 0), 0.0001);
          const toggleSort = (key) =>
            setFlowSort((s) =>
              s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }
            );
          const SortHead = ({ label, k, align = "right" }) => (
            <th className={`py-2 px-2 ${align === "left" ? "text-left" : "text-right"}`}>
              <button
                onClick={() => toggleSort(k)}
                className={`inline-flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.14em] transition-colors ${flowSort.key === k ? "text-text-primary" : "text-text-primary/35 hover:text-text-primary/60"} ${align === "left" ? "" : "flex-row-reverse"}`}
              >
                {label}
                <span className="text-[7px]">
                  {flowSort.key === k ? (flowSort.dir === "desc" ? "▼" : "▲") : "⇅"}
                </span>
              </button>
            </th>
          );
          const timeAgo = (iso) => {
            if (!iso) return null;
            const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
            if (m < 1) return "now";
            if (m < 60) return `${m}m ago`;
            const h = Math.floor(m / 60);
            if (h < 24) return `${h}h ago`;
            return `${Math.floor(h / 24)}d ago`;
          };
          const fmtDT = (iso) =>
            iso
              ? new Date(iso).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
              : "—";
          const statusMeta = (st) => {
            const s = (st || "").toLowerCase();
            if (s === "sl" || s === "closed_loss")
              return { l: "SL", c: "text-loss border-loss/25 bg-loss/10" };
            if (s === "closed_win")
              return { l: "WIN", c: "text-profit border-profit/25 bg-profit/10" };
            if (s.startsWith("tp"))
              return { l: s.toUpperCase(), c: "text-profit border-profit/25 bg-profit/10" };
            return { l: "OPEN", c: "text-accent border-accent/30 bg-accent/10" };
          };
          const openCoin = (c) => {
            const sig = findSignal(c.symbol);
            if (sig) openSignal(sig);
            else navigate("/money-flow");
          };
          return (
            <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 sm:px-4">
                <button
                  type="button"
                  onClick={() => setFlowOpen((v) => !v)}
                  className="group flex min-w-0 items-center gap-2"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-transform group-hover:bg-ink/[0.05] ${flowOpen ? "" : "-rotate-90"}`}
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                  <span className="text-[13px] font-medium text-text-primary">Coin flow</span>
                  <span className="hidden text-[12px] text-text-muted sm:inline">
                    capital rotation
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  {flowOpen && (
                    <select
                      value={flowCount}
                      onChange={(e) => setFlowCount(Number(e.target.value))}
                      className="cursor-pointer appearance-none rounded-md border border-ink/[0.08] bg-ink/[0.03] py-1 pl-2 pr-7 text-[11px] text-text-secondary focus:outline-none"
                    >
                      {[10, 20, 30, 50].map((n) => (
                        <option key={n} value={n}>
                          Top {n}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate("/money-flow")}
                    className="text-[12px] font-medium text-text-muted transition-colors hover:text-accent"
                  >
                    More →
                  </button>
                </div>
              </div>

              {flowOpen && (
                <div className="border-t border-ink/[0.06] px-2 pb-2 sm:px-3">
                  <p className="px-1.5 py-2 text-[11px] text-text-muted">
                    Intensity = 24h volume ÷ market cap. Click a row to open its call.
                  </p>
                  <div className="no-scrollbar -mx-1 overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse">
                      <thead>
                        <tr className="border-b border-ink/[0.06]">
                          <SortHead label="Coin" k="coin" align="left" />
                          <SortHead label="24h" k="chg" />
                          <SortHead label="Intensity" k="intensity" />
                          <SortHead label="From Call" k="fromcall" align="left" />
                          <SortHead label="Status" k="status" align="left" />
                          <SortHead label="Called" k="called" align="left" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ c, sig, fromCall }) => {
                          const chg = c.price_change_24h;
                          const up = chg != null && chg >= 0;
                          const barW = Math.max(
                            5,
                            Math.round(((c.flow_intensity || 0) / maxInt) * 100)
                          );
                          const sm = sig ? statusMeta(sig.status) : null;
                          return (
                            <tr
                              key={c.coin_id || c.symbol}
                              onClick={() => openCoin(c)}
                              className="cursor-pointer border-b border-ink/[0.04] transition-colors last:border-0 hover:bg-ink/[0.03]"
                            >
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-2">
                                  <CoinLogo pair={`${c.symbol}USDT`} size={20} />
                                  <span className="text-[12px] font-medium text-text-primary">
                                    {c.symbol}
                                  </span>
                                  {c.is_luxquant_signal && (
                                    <span className="rounded bg-accent/10 px-1 py-0.5 text-[9px] font-medium text-accent">
                                      Call
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td
                                className={`px-2 py-2 text-right font-mono text-[12px] font-medium tabular-nums ${chg == null ? "text-text-muted" : up ? "text-profit" : "text-loss"}`}
                              >
                                {chg == null ? "—" : `${up ? "+" : ""}${chg.toFixed(2)}%`}
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="hidden h-1 w-14 overflow-hidden rounded-full bg-ink/[0.07] sm:block">
                                    <div
                                      className="h-full rounded-full bg-ink/40"
                                      style={{ width: `${barW}%` }}
                                    />
                                  </div>
                                  <span className="w-9 text-right font-mono text-[11px] tabular-nums text-text-secondary">
                                    {c.flow_intensity != null ? c.flow_intensity.toFixed(2) : "—"}
                                  </span>
                                </div>
                              </td>
                              <td className="px-2 py-2 text-left">
                                {fromCall != null ? (
                                  <span
                                    className={`font-mono text-[11px] font-medium tabular-nums ${fromCall >= 0 ? "text-profit" : "text-loss"}`}
                                  >
                                    {fromCall >= 0 ? "+" : ""}
                                    {fromCall.toFixed(2)}%
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-text-muted">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-left">
                                {sm ? (
                                  <span
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${sm.c.replace(/border-\S+/g, "").trim()}`}
                                  >
                                    {sm.l}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-text-muted">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 text-left whitespace-nowrap">
                                {sig ? (
                                  <span className="font-mono text-[11px] tabular-nums text-text-secondary">
                                    {fmtDT(sig.created_at)}
                                    <span className="ml-1.5 text-text-muted">
                                      {timeAgo(sig.created_at)}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-text-muted">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      {!isSubscriber && vipSamples.length > 0 && (
        <>
          <div
            id={RECENT_ID}
            className="scroll-mt-32 overflow-hidden rounded-xl border"
            style={{
              borderColor: "rgb(var(--accent) / 0.35)",
              background: "rgb(var(--accent) / 0.04)",
            }}
          >
            <div
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              style={{ background: "rgb(var(--accent) / 0.10)" }}
            >
              <div className="min-w-0">
                <p
                  className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
                  style={{ color: "rgb(var(--accent-text))" }}
                >
                  2 · Recent VIP call
                </p>
                <p className="mt-0.5 text-[13px] font-semibold text-text-primary">
                  A real recent call, the way a subscriber sees it. Tap a row to check the chart.
                </p>
              </div>
              <button
                type="button"
                onClick={goPricing}
                className="shrink-0 self-start whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition-all hover:brightness-110 sm:self-auto"
                style={{ background: "rgb(var(--accent))", color: "rgb(var(--accent-fg))" }}
              >
                See it live
              </button>
            </div>

            <SignalsTable
              signals={vipSamples}
              loading={false}
              isSubscriber
              teaser
              hideColumnsMenu
              preferBestPrice
              onRowClick={(sig) => openSignal(sig, "trade")}
              sortBy="created_at"
              sortOrder="desc"
              sorts={sorts}
              onSort={() => {}}
              page={1}
              totalPages={1}
              totalSignals={vipSamples.length}
              countLabel="sample of what you get as a subscriber"
              rowHint="Detail"
              onPageChange={() => {}}
              allPairs={vipSamples.map((x) => x.pair)}
              coinIntel={vipSampleIntel}
              verdictByPair={{}}
              currentFlow={currentFlow}
              tagWrMap={tagWrMap}
              runnerTagSet={runnerTagSet}
              edgeScoreMap={edgeScoreMap}
              signalTags={signalTags}
            />
          </div>
          <FreeScrollCue label="Finished calls" targetId={FINISHED_ID} />
        </>
      )}

      {/* Sits above the filter console, because it explains why the list is
          shorter than the counts on the date tabs suggest. */}
      <ShariahFilterNotice
        hidden={shariahHidden}
        total={allSignals.length}
        strict={shariah.strict}
      />

      {/* FILTER CONSOLE */}
      <div className="relative overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised p-4">
        <div className="mb-3 flex items-center justify-between border-b border-ink/[0.06] pb-3">
          <div className="flex items-center gap-2">
            {Icon.filter("w-3.5 h-3.5 text-text-muted")}
            <h2 className="text-[13px] font-medium text-text-primary">Filters</h2>
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-ink/[0.05] hover:text-text-primary"
            >
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-ink/15 text-[9px] leading-none">
                ?
              </span>
              {t("guide.button")}
            </button>
            <button
              type="button"
              onClick={() => navigate("/tips?lesson=anatomy-of-a-call")}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-ink/[0.05] hover:text-text-primary"
            >
              Tutorials
            </button>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium text-text-muted transition-colors hover:bg-ink/[0.05] hover:text-text-primary"
            >
              {Icon.close("w-3 h-3")}
              Reset
            </button>
          )}
        </div>

        {/* ── TAB BAR — Watchlist + day tabs (full width, fade + panah kanan ala MEXC) ── */}
        <div className="relative edge-fade-r border-b border-ink/[0.07] mb-3">
          <div
            ref={tabScrollRef}
            className="flex items-center gap-6 overflow-x-auto no-scrollbar pr-12"
          >
            {/* Watchlist (tanpa bintang biar hemat tempat) */}
            <button
              onClick={() => setShowWatchlistOnly((v) => !v)}
              className={`flex items-center gap-1.5 whitespace-nowrap pb-3 pt-1 text-[15px] font-medium border-b-2 -mb-px transition-colors ${
                showWatchlistOnly
                  ? "text-text-primary border-ink/30"
                  : "text-text-primary/50 border-transparent hover:text-text-primary/80"
              }`}
            >
              Watchlist
              {watchlistIds.length > 0 && (
                <span
                  className={`font-mono text-[12px] tabular-nums ${showWatchlistOnly ? "text-text-primary" : "text-text-primary/40"}`}
                >
                  {watchlistIds.length}
                </span>
              )}
            </button>

            {/* Day tabs — bisa pilih satu / semua */}
            {dateOptions.map((opt) => {
              const active =
                !showWatchlistOnly &&
                (opt.value === "all"
                  ? selectedDates.length === 0
                  : selectedDates.includes(opt.value));
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    setShowWatchlistOnly(false);
                    toggleDateFilter(opt.value);
                  }}
                  className={`flex items-center gap-1.5 whitespace-nowrap pb-3 pt-1 text-[15px] font-medium border-b-2 -mb-px transition-colors ${
                    active
                      ? "text-text-primary border-ink/30"
                      : "text-text-primary/50 border-transparent hover:text-text-primary/80"
                  }`}
                >
                  {opt.label}
                  {opt.count != null && (
                    <span
                      className={`font-mono text-[12px] tabular-nums ${active ? "text-text-primary" : "text-text-primary/35"}`}
                    >
                      {opt.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Panah kanan — geser lihat hari sebelumnya (MEXC-style, di atas fade) */}
          <button
            onClick={() => tabScrollRef.current?.scrollBy({ left: 240, behavior: "smooth" })}
            aria-label="View previous day"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-6 h-6 text-text-primary/60 hover:text-text-primary transition-colors"
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* ── Controls row — search + multi-sort stack ── */}
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-primary/45 pointer-events-none">
                {Icon.search("w-3.5 h-3.5")}
              </span>
              <input
                type="text"
                placeholder="Search pair (e.g. BTC, ETH, SOL)..."
                value={searchPair}
                onChange={(e) => setSearchPair(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-surface border border-ink/[0.08] rounded-md text-text-primary placeholder-text-secondary/50 font-mono text-xs focus:border-ink/15 focus:outline-none focus:bg-ink/[0.02] transition-all"
              />
            </div>
            <div className="relative flex-shrink-0">
              <select
                value={sortBy}
                onChange={(e) => setSorts(setPrimarySort(e.target.value, "desc"))}
                title="Primary sort (replaces chain). Shift+click table headers to add levels."
                className="pl-3 pr-8 py-2 bg-surface border border-ink/[0.08] rounded-md text-text-primary font-mono text-[11px] focus:border-ink/15 focus:outline-none appearance-none cursor-pointer transition-all"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-surface">
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-primary/70 pointer-events-none">
                {Icon.chevronDown("w-3 h-3")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-surface border border-ink/[0.08] hover:border-ink/12 transition-all rounded-md font-mono text-[10px] uppercase tracking-wider text-text-primary"
              title="Toggle primary sort direction"
            >
              {sortOrder === "desc" ? Icon.arrowDown("w-3 h-3") : Icon.arrowUp("w-3 h-3")}
              <span className="hidden sm:inline">{getOrderLabel()}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={advancedOpen}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-ink/[0.08] bg-surface font-mono text-[10px] uppercase tracking-wider text-text-primary/80 hover:border-ink/15 hover:text-text-primary"
            >
              {Icon.sliders("w-3.5 h-3.5")}
              More
              {advancedActiveCount > 0 && (
                <span className="rounded-sm bg-ink/10 px-1.5 font-mono text-[9px] tabular-nums text-text-primary">
                  {advancedActiveCount}
                </span>
              )}
              <span className={advancedOpen ? "rotate-180" : ""}>
                {Icon.chevronDown("w-3 h-3")}
              </span>
            </button>
          </div>
        </div>

        {/* MORE — helper filters, sort stack, playbook. First screen stays date + search + Hunt. */}
        {advancedOpen && (
          <div className="mt-4 space-y-5 animate-slideDown">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted mr-0.5">
                Sort
              </span>
              {sorts.map((s, i) => (
                <button
                  key={`${s.field}-${i}`}
                  type="button"
                  onClick={() => setSorts((prev) => toggleSortLevel(prev, s.field))}
                  title={`Level ${i + 1}: click to flip direction`}
                  className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent/[0.08] px-2 py-1 font-mono text-[10px] text-text-primary transition-colors hover:border-accent/40"
                >
                  <span className="tabular-nums text-accent opacity-80">{i + 1}</span>
                  <span>{SORT_FIELD_LABELS[s.field] || s.field}</span>
                  <span className="text-accent">{s.order === "asc" ? "↑" : "↓"}</span>
                  {sorts.length > 1 && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSorts((prev) => removeSortLevel(prev, s.field));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          setSorts((prev) => removeSortLevel(prev, s.field));
                        }
                      }}
                      className="ml-0.5 text-text-muted hover:text-loss"
                      aria-label={`Remove ${s.field} from sort`}
                    >
                      ×
                    </span>
                  )}
                </button>
              ))}
              {!isDefaultSorts(sorts) && (
                <button
                  type="button"
                  onClick={() => setSorts([...DEFAULT_SORTS])}
                  className="rounded-md border border-ink/[0.08] px-2 py-1 font-mono text-[10px] text-text-muted hover:text-text-primary"
                >
                  Reset
                </button>
              )}
              {MULTI_SORT_PRESETS.map((p) => {
                const active =
                  sorts.length === p.sorts.length &&
                  sorts.every(
                    (s, i) => s.field === p.sorts[i].field && s.order === p.sorts[i].order
                  );
                return (
                  <button
                    key={p.id}
                    type="button"
                    title={p.hint}
                    onClick={() => setSorts(normalizeSorts(p.sorts))}
                    className={`rounded-md border px-2 py-1 font-mono text-[10px] transition-colors ${
                      active
                        ? "border-accent/35 bg-accent/12 text-accent"
                        : "border-ink/[0.08] text-text-muted hover:border-ink/15 hover:text-text-primary"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
              <span className="w-full font-mono text-[9px] text-text-muted/70 sm:w-auto sm:ml-1">
                Shift+click column headers to stack up to {MAX_SORTS} levels
              </span>
            </div>

            {/* Status + Risk */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Status */}
              <div className="lg:col-span-8">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-text-primary/70">
                    Signal Status
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {statusOptions.map((opt) => {
                    const isActive = statusFilter === opt.value;
                    const accentColor =
                      opt.accent === "emerald"
                        ? "text-profit"
                        : opt.accent === "red"
                          ? "text-loss"
                          : opt.accent === "gold"
                            ? "text-text-primary"
                            : "text-text-primary/70";
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setStatusFilter(opt.value);
                          if (opt.value === "updated" && sortBy === "created_at")
                            setSortBy("last_update");
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                          isActive
                            ? "bg-ink/10 border border-ink/[0.08] text-text-primary"
                            : "bg-ink/[0.03] border border-transparent text-text-primary/70 hover:bg-ink/[0.06] hover:text-text-primary"
                        }`}
                      >
                        {opt.icon && (
                          <span className={isActive ? accentColor : "opacity-70"}>
                            {opt.icon("w-3 h-3")}
                          </span>
                        )}
                        <span>{opt.label}</span>
                        {opt.value === "updated" && updatedCount > 0 && !isActive && (
                          <span className="px-1 py-0 bg-ink/[0.06] text-text-primary text-[9px] tabular-nums rounded-sm">
                            {updatedCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Risk */}
              <div className="lg:col-span-4 lg:border-l lg:border-ink/[0.06] lg:pl-5">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-text-primary/70">
                    Risk Profile
                  </span>
                </div>
                <div className="flex bg-ink/[0.02] border border-ink/[0.06] rounded-sm p-0.5">
                  {riskOptions.map((opt) => {
                    const isActive = riskFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setRiskFilter(opt.value)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                          isActive
                            ? "bg-ink/10 text-text-primary"
                            : "text-text-primary/70 hover:text-text-primary hover:bg-ink/[0.03]"
                        }`}
                      >
                        {opt.dotColor && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${opt.dotColor} ${isActive ? "" : "opacity-50"}`}
                          />
                        )}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Intelligence Filters */}
            <div className="pt-5 border-t border-ink/[0.06]">
              <div className="flex items-center justify-between mb-2.5">
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-primary/70">
                  Intelligence Filters
                  <InfoTip side="bottom" title={t("guide.sec_intel")} text={t("guide.worth_d")} />
                </span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-text-primary/40">
                  powered by coin intelligence
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setStreakFilter(streakFilter === "hot" ? "all" : "hot")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                    streakFilter === "hot"
                      ? "bg-profit/15 border border-profit/30 text-profit"
                      : "bg-ink/[0.03] border border-transparent text-text-primary/70 hover:bg-ink/[0.06] hover:text-text-primary"
                  }`}
                >
                  <span className={streakFilter === "hot" ? "text-profit" : "opacity-70"}>
                    {Icon.flame("w-3 h-3")}
                  </span>
                  <span>High Win Streak</span>
                  <span className="font-mono text-[9px] normal-case tracking-normal opacity-70">
                    ≥{HOT_STREAK_MIN}
                  </span>
                  {hotStreakCount > 0 && streakFilter !== "hot" && (
                    <span className="px-1 py-0 bg-profit/10 text-profit text-[9px] tabular-nums rounded-sm">
                      {hotStreakCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setCorrDecoupled((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                    corrDecoupled
                      ? "bg-accent/15 border border-accent/40 text-accent"
                      : "bg-ink/[0.03] border border-transparent text-text-primary/70 hover:bg-ink/[0.06] hover:text-text-primary"
                  }`}
                >
                  <span className={corrDecoupled ? "text-accent" : "opacity-70"}>
                    {Icon.zap("w-3 h-3")}
                  </span>
                  <span>Decoupled from BTC</span>
                  {corrCounts.dec > 0 && !corrDecoupled && (
                    <span className="px-1 py-0 bg-accent/10 text-accent text-[9px] tabular-nums rounded-sm">
                      {corrCounts.dec}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setCorrHighAlign((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                    corrHighAlign
                      ? "bg-profit/15 border border-profit/30 text-profit"
                      : "bg-ink/[0.03] border border-transparent text-text-primary/70 hover:bg-ink/[0.06] hover:text-text-primary"
                  }`}
                >
                  <span className={corrHighAlign ? "text-profit" : "opacity-70"}>
                    {Icon.target("w-3 h-3")}
                  </span>
                  <span>High BTC Alignment</span>
                  <span className="font-mono text-[9px] normal-case tracking-normal opacity-70">
                    ≥70
                  </span>
                  {corrCounts.hi > 0 && !corrHighAlign && (
                    <span className="px-1 py-0 bg-profit/10 text-profit text-[9px] tabular-nums rounded-sm">
                      {corrCounts.hi}
                    </span>
                  )}
                </button>

                <button
                  onClick={() =>
                    setVerdictFilter(verdictFilter === "worth_it" ? "all" : "worth_it")
                  }
                  title="As-of-entry: closed rows exclude their own outcome"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                    verdictFilter === "worth_it"
                      ? "bg-profit/15 border border-profit/30 text-profit"
                      : "bg-ink/[0.03] border border-transparent text-text-primary/70 hover:bg-ink/[0.06] hover:text-text-primary"
                  }`}
                >
                  <span className={verdictFilter === "worth_it" ? "text-profit" : "opacity-70"}>
                    ✓
                  </span>
                  <span>Worth It</span>
                  {verdictCounts.worth > 0 && verdictFilter !== "worth_it" && (
                    <span className="px-1 py-0 bg-profit/10 text-profit text-[9px] tabular-nums rounded-sm">
                      {verdictCounts.worth}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setVerdictFilter(verdictFilter === "avoid" ? "all" : "avoid")}
                  title="As-of-entry: closed rows exclude their own outcome"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                    verdictFilter === "avoid"
                      ? "bg-loss/15 border border-loss/30 text-loss"
                      : "bg-ink/[0.03] border border-transparent text-text-primary/70 hover:bg-ink/[0.06] hover:text-text-primary"
                  }`}
                >
                  <span className={verdictFilter === "avoid" ? "text-loss" : "opacity-70"}>⛔</span>
                  <span>Avoid</span>
                  {verdictCounts.avoid > 0 && verdictFilter !== "avoid" && (
                    <span className="px-1 py-0 bg-loss/10 text-loss text-[9px] tabular-nums rounded-sm">
                      {verdictCounts.avoid}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Pattern Filters */}
            {sortedTagsForChips.length > 0 && (
              <div className="pt-5 border-t border-ink/[0.06]">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-primary/70">
                    Pattern Filters
                    <InfoTip
                      side="bottom"
                      title={t("guide.pattern_t")}
                      text={t("guide.pattern_d")}
                    />
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-text-primary/40">
                    historical win rate · descriptive
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const present = sortedTagsForChips.filter(
                      (t) => (tagActiveCount[t.tag] || 0) > 0 || selectedTags.includes(t.tag)
                    );
                    const shown = showAllTags ? present : present.slice(0, 10);
                    return shown;
                  })().map((t) => {
                    const active = selectedTags.includes(t.tag);
                    const cnt = tagActiveCount[t.tag] || 0;
                    const wrCol =
                      t.win_rate >= 88
                        ? "text-profit"
                        : t.win_rate >= 82
                          ? "text-accent"
                          : "text-text-primary/70";
                    return (
                      <button
                        key={t.tag}
                        onClick={() => toggleTag(t.tag)}
                        title={`${t.win_rate}% historical win rate · n=${t.n} · ${cnt} active now`}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                          active
                            ? "bg-ink/10 border border-ink/15 text-text-primary"
                            : "bg-ink/[0.03] border border-transparent text-text-primary/70 hover:bg-ink/[0.06] hover:text-text-primary"
                        }`}
                      >
                        <span className="normal-case">
                          {t.tag.replace(/_/g, " ").toLowerCase()}
                        </span>
                        <span className={`tabular-nums ${active ? "text-text-primary" : wrCol}`}>
                          {t.win_rate}%
                        </span>
                        {cnt > 0 && (
                          <span
                            className={`px-1 py-0 text-[9px] tabular-nums rounded-sm ${active ? "bg-ink/12 text-text-primary" : "bg-ink/[0.06] text-text-primary/70"}`}
                          >
                            {cnt}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {(() => {
                    const presentCount = sortedTagsForChips.filter(
                      (t) => (tagActiveCount[t.tag] || 0) > 0
                    ).length;
                    if (presentCount <= 10) return null;
                    return (
                      <button
                        onClick={() => setShowAllTags((v) => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider bg-ink/[0.02] border border-ink/[0.08] text-text-primary/70 hover:text-text-primary hover:border-ink/[0.15] transition-all"
                      >
                        {showAllTags ? "Show less" : `Show all (${presentCount})`}
                      </button>
                    );
                  })()}
                </div>
                <p className="font-mono text-[9px] text-text-primary/45 mt-2 normal-case tracking-normal leading-relaxed">
                  Win rate of resolved signals that carried each tag. Tags overlap and describe
                  entry conditions — not a standalone buy trigger.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {isSubscriber && (
        <EdgeRecipesBar
          tagWr={tagWr}
          selectedTags={selectedTags}
          tagMatchMode={tagMatchMode}
          verdictFilter={verdictFilter}
          statusFilter={statusFilter}
          riskFilter={riskFilter}
          streakFilter={streakFilter}
          sortBy={sortBy}
          sortOrder={sortOrder}
          sorts={sorts}
          searchPair={searchPair}
          corrDecoupled={corrDecoupled}
          corrHighAlign={corrHighAlign}
          filteredCount={totalSignals}
          onApplyState={applyRecipeState}
          onReset={resetFilters}
          onScrollToPlaybook={() => {
            setShowAdvanced(true);
            requestAnimationFrame(() => {
              document.getElementById("edge-playbook")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
            });
          }}
        />
      )}

      {/* Sticky current-filter chips */}
      <EdgeActiveFilters
        variant="bar"
        sticky
        selectedTags={selectedTags}
        tagMatchMode={tagMatchMode}
        verdictFilter={verdictFilter}
        statusFilter={statusFilter}
        riskFilter={riskFilter}
        streakFilter={streakFilter}
        corrDecoupled={corrDecoupled}
        corrHighAlign={corrHighAlign}
        sortBy={sortBy}
        sortOrder={sortOrder}
        sorts={sorts}
        selectedDates={selectedDates}
        searchPair={searchPair}
        filteredCount={totalSignals}
        totalUnfiltered={allSignals?.length}
        onRemoveTag={(tag) => {
          toggleTag(tag);
          setPage(1);
        }}
        onTagMatchMode={(mode) => {
          setTagMatchMode(mode === "all" ? "all" : "any");
          setPage(1);
        }}
        onVerdictFilter={(v) => {
          setVerdictFilter(v);
          setPage(1);
        }}
        onStatusFilter={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        onRiskFilter={(v) => {
          setRiskFilter(v);
          setPage(1);
        }}
        onStreakFilter={(v) => {
          setStreakFilter(v);
          setPage(1);
        }}
        onCorrDecoupled={(v) => {
          setCorrDecoupled(!!v);
          setPage(1);
        }}
        onCorrHighAlign={(v) => {
          setCorrHighAlign(!!v);
          setPage(1);
        }}
        onSortReset={() => {
          setSorts([...DEFAULT_SORTS]);
          setPage(1);
        }}
        onRemoveSortLevel={(field) => {
          setSorts((prev) => removeSortLevel(prev, field));
          setPage(1);
        }}
        onToggleSortLevel={(field) => {
          setSorts((prev) => toggleSortLevel(prev, field));
          setPage(1);
        }}
        onClearDates={() => {
          setSelectedDates([]);
          setPage(1);
        }}
        onClearSearch={() => {
          setSearchPair("");
          setPage(1);
        }}
        onClearAll={resetFilters}
      />

      {/* Playbook + Learn — off the first screen; still mounted so Edge scores keep loading. */}
      {isSubscriber && (
      <div className={showAdvanced ? "" : "hidden"}>
      <EdgePlaybook
        defaultOpen={false}
        tagWr={tagWr}
        verdictCounts={verdictCounts}
        signalTags={signalTags}
        selectedTags={selectedTags}
        tagMatchMode={tagMatchMode}
        verdictFilter={verdictFilter}
        statusFilter={statusFilter}
        riskFilter={riskFilter}
        sortBy={sortBy}
        sortOrder={sortOrder}
        sorts={sorts}
        edgeFilterActive={
          verdictFilter !== "all" ||
          selectedTags.length > 0 ||
          statusFilter !== "all" ||
          riskFilter !== "all" ||
          !isDefaultSorts(sorts)
        }
        filteredCount={totalSignals}
        onToggleTag={(tag) => {
          if (!tag) return;
          toggleTag(tag);
          setPage(1);
        }}
        onSetTags={(tags) => {
          setSelectedTags(Array.isArray(tags) ? tags : []);
          setPage(1);
        }}
        onTagMatchMode={(mode) => {
          setTagMatchMode(mode === "all" ? "all" : "any");
          setPage(1);
        }}
        onVerdictFilter={(v) => {
          setVerdictFilter(v);
          setPage(1);
        }}
        onStatusFilter={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
        onRiskFilter={(v) => {
          setRiskFilter(v);
          setPage(1);
        }}
        onSort={(field, order) => {
          if (field) {
            setSorts(setPrimarySort(field, order || "desc"));
          }
          setPage(1);
        }}
        onSorts={(next) => {
          setSorts(normalizeSorts(next));
          setPage(1);
        }}
        onApplyEdge={(tags) => {
          setVerdictFilter("worth_it");
          if (tags?.length) {
            setSelectedTags((prev) => [...new Set([...prev, ...tags])]);
          }
          setSorts(
            normalizeSorts([
              { field: "verdict", order: "desc" },
              { field: "edge_score", order: "desc" },
              { field: "created_at", order: "desc" },
            ])
          );
          setPage(1);
        }}
        onScreenRunners={(tags) => {
          setVerdictFilter("worth_it");
          if (tags?.length) {
            setSelectedTags((prev) => [...new Set([...prev, ...tags])]);
          }
          setTagMatchMode("any");
          setSorts(
            normalizeSorts([
              { field: "edge_score", order: "desc" },
              { field: "created_at", order: "desc" },
            ])
          );
          setPage(1);
        }}
        onFilterTag={(tag) => {
          if (!tag) return;
          toggleTag(tag);
          setPage(1);
        }}
        onClear={resetFilters}
      />

      <EdgeCorrelationPanel
        defaultOpen={false}
        deskSignals={allSignals}
        signalTags={signalTags}
        edgeScoreMap={edgeScoreMap}
        onFilterTag={(tag) => {
          if (!tag) return;
          toggleTag(tag);
          setPage(1);
        }}
        onEdgeData={(payload) => {
          const wr = payload?.baseline?.win_rate;
          if (wr != null && Number.isFinite(Number(wr))) setEdgeBaselineWr(Number(wr));
          // Prefer correlation tags (EB fields) for client Edge when available
          if (Array.isArray(payload?.tags) && payload.tags.length) {
            setTagWr((prev) => {
              // merge by tag name — keep active_signal_ids from tag-wr if present
              const by = Object.fromEntries((prev || []).map((t) => [t.tag, t]));
              for (const t of payload.tags) {
                by[t.tag] = { ...(by[t.tag] || {}), ...t };
              }
              return Object.values(by);
            });
          }
          const scored = payload?.open_scored || [];
          const byId = {};
          for (const row of scored) {
            if (row?.signal_id != null) byId[String(row.signal_id)] = row;
          }
          setApiOpenScoreById(byId);
        }}
        onSelectPair={(pair, signalId) => {
          setSelectedTags([]);
          setTagMatchMode("any");
          setVerdictFilter("all");
          setRiskFilter("all");
          setStreakFilter("all");
          setCorrDecoupled(false);
          setCorrHighAlign(false);
          setSelectedDates([]);
          setShowWatchlistOnly(false);
          if (pair) setSearchPair(String(pair).replace(/USDT$/i, ""));
          setSortBy("edge_score");
          setSortOrder("desc");
          setPage(1);
          if (signalId) {
            const fromList = allSignals.find(
              (s) => String(s.signal_id) === String(signalId)
            );
            if (fromList?.status) {
              const st = String(fromList.status).toLowerCase();
              if (st === "open") setStatusFilter("open");
              else if (["tp1", "tp2", "tp3", "tp4", "closed_win"].includes(st))
                setStatusFilter("tp1_plus");
              else setStatusFilter("all");
            }
            openSignal(
              fromList || {
                signal_id: String(signalId),
                pair: pair || undefined,
                status: "open",
              }
            );
          }
        }}
        onApplyToTable={({ statusFilter: st, sortBy: sb, sortOrder: so }) => {
          setSelectedTags([]);
          setTagMatchMode("any");
          setVerdictFilter("all");
          setStatusFilter(st || "all");
          setRiskFilter("all");
          setStreakFilter("all");
          setCorrDecoupled(false);
          setCorrHighAlign(false);
          setSelectedDates([]);
          setShowWatchlistOnly(false);
          setSearchPair("");
          setSortBy(sb || "edge_score");
          setSortOrder(so || "desc");
          setPage(1);
        }}
        onShowOpenOnDesk={() => {
          setSelectedTags([]);
          setTagMatchMode("any");
          setVerdictFilter("all");
          setStatusFilter("open");
          setRiskFilter("all");
          setStreakFilter("all");
          setCorrDecoupled(false);
          setCorrHighAlign(false);
          setSelectedDates([]);
          setShowWatchlistOnly(false);
          setSearchPair("");
          setSortBy("edge_score");
          setSortOrder("desc");
          setPage(1);
        }}
      />
      </div>
      )}

      {/* BTC Dominance Alert — self-contained (has its own expand) */}
      <BtcDomAlert allSignals={allSignals} onSignalClick={(sig) => openSignal(sig)} />

      {/* ERROR / TABLE */}
      {error && (
        <div className="bg-surface-raised rounded-md p-6 border border-loss/25 text-center relative overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-negative/40 to-transparent" />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-negative/[0.06] border border-loss/20 flex items-center justify-center text-loss">
              {Icon.alert("w-5 h-5")}
            </div>
            <h3 className="font-mono text-sm text-text-primary">Failed to load signals</h3>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-primary/70">
              {error}
            </p>
            <button
              onClick={() => fetchBulkSignals(true)}
              className="px-4 py-2 mt-1 bg-loss/10 text-loss border border-loss/20 hover:bg-loss/15 hover:border-loss/25 transition-all rounded-sm font-mono text-[10px] uppercase tracking-wider"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {!error && (
        <div id={FINISHED_ID} className="scroll-mt-32">
        <SignalsTable
          signals={signals}
          loading={loading}
          isSubscriber={isSubscriber}
          onSubscribe={goPricing}
          hiddenCount={hiddenCount}
          // A free account only ever sees finished calls, so the live chart is
          // the wrong landing tab for every one of them.
          onRowClick={(sig) => openSignal(sig, isSubscriber ? "chart" : "trade")}
          onOpenProof={(sig) => openSignal(sig, "trade")}
          sortBy={sortBy}
          sortOrder={sortOrder}
          sorts={sorts}
          onSort={handleSort}
          page={page}
          totalPages={totalPages}
          totalSignals={totalSignals}
          onPageChange={setPage}
          onPricesUpdate={handlePricesUpdate}
          allPairs={allPairs}
          coinIntel={coinIntel}
          verdictByPair={verdictByPair}
          currentFlow={currentFlow}
          tagWrMap={tagWrMap}
          runnerTagSet={runnerTagSet}
          edgeScoreMap={edgeScoreMap}
          signalTags={signalTags}
          onWatchlistChange={(signalId, newState) => {
            setWatchlistIds((prev) =>
              newState ? [...new Set([...prev, signalId])] : prev.filter((id) => id !== signalId)
            );
            if (!newState)
              setWatchlistSignals((prev) => prev.filter((s) => s.signal_id !== signalId));
            refreshWatchlist();
          }}
        />
        </div>
      )}

      {!isSubscriber && entitlementKnown && (
        <VipToolsPreview onUnlock={goPricing} />
      )}

      {showGuide && <GuideModal onClose={() => setShowGuide(false)} />}

      {selectedSignal && (
        <SignalModal
          key={selectedSignal.signal_id}
          signal={selectedSignal}
          isOpen={!!selectedSignal}
          initialTab={selectedTab}
          onTabChange={changeSignalTab}
          onClose={closeSignal}
          onSwitchSignal={(newSignal) => openSignal(newSignal, "chart")}
        />
      )}

      {/* Context-aware help assistant (MVP: Potential Trades page) */}
      <AssistantWidget pageId="signals" />
    </div>
  );
};

export default SignalsPage;
