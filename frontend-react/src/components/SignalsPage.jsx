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
import { coinDeskBand } from "./coinIntelShared";
import { InfoTip, GuideModal } from "./GuideInfo";
import { watchlistApi } from "../services/watchlistApi";
import { signalsApi } from "../services/api";
import CompassSnapshot from "./aiArenaV6/CompassSnapshot";
import AssistantWidget from "./assistant/AssistantWidget";
import EdgePlaybook from "./EdgePlaybook";
import EdgeActiveFilters from "./EdgeActiveFilters";
import EdgeCorrelationPanel from "./EdgeCorrelationPanel";
import EdgeRecipesBar, { ALL_MODE_STATE } from "./EdgeRecipesBar";
import SignalsCoinFlow from "./SignalsCoinFlow";
import SignalsNarrativeFlow from "./SignalsNarrativeFlow";
import SignalsJournalRecap from "./SignalsJournalRecap";
import SignalsCustomCalls from "./SignalsCustomCalls";
import { signalAlertApi } from "../services/signalAlertApi";
import Modal from "./ui/Modal";
import {
  SegGroup,
  deskBadgeClass,
  deskChipClass,
  deskGhostClass,
} from "./ui/SegGroup";
import { buildEdgeScoreMap, plainEdgeWhy } from "../utils/edgeScore";
import { edgeTopThreshold } from "../utils/signalFilters";
import {
  DEFAULT_SORTS,
  MAX_SORTS,
  MULTI_SORT_PRESETS,
  applySortClick,
  isDefaultSorts,
  normalizeSorts,
  orderLabel,
  primaryOf,
  removeSortLevel,
  promoteSortField,
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

const utcTodayYmd = () => new Date().toISOString().slice(0, 10);

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
/** The three states that answer "is this call still running?". Everything else
 *  in statusOptions answers "how far did it get?", which is a different
 *  question and gets its own row in the filter sheet. */
/** Names the dimension a rail varies on. Same voice as the sheet's headings,
 *  and the fixed width on sm+ makes the two rails start on one left edge
 *  instead of each one beginning wherever its label ends. */
const CONSOLE_LABEL =
  "hidden sm:block w-9 shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted sm:w-[3.9rem]";

/** The way into the mode briefings.
 *
 *  This was a 12px ⓘ riding the word MODE, and it did not invite anyone to read
 *  anything. NN/G is blunt about why: an icon needs a text label beside it, the
 *  label has to be visible without interaction — hover does not exist on a
 *  phone — and an unlabelled icon is "reduced to mere eye candy… visual noise".
 *  Their guidance on wording is the other half: a help control should name what
 *  it explains, which is why this says what these mean rather than "Learn more"
 *  or "Info".
 *
 *  Sentence case on purpose. Every other control on this console is uppercase
 *  mono; prose in the middle of that reads as something to be read rather than
 *  operated, which is the whole job. Presence comes from the resting border,
 *  not from colour or motion. */
function ModeGuideLink({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="What these mean"
      title="What these mean"
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-ink/[0.1] bg-surface-secondary text-text-muted transition-colors hover:border-ink/20 hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:h-7 sm:w-auto sm:gap-1.5 sm:px-2.5 sm:font-mono sm:text-[10px] sm:font-semibold sm:uppercase sm:tracking-[0.06em]"
    >
      <svg
        className="h-3.5 w-3.5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </svg>
      <span className="hidden sm:inline">What these mean</span>
    </button>
  );
}

const PLAIN_STATUS = ["all", "open", "updated"];

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
  // The desk's own win rate. Every per-coin rate is read against it, so it
  // travels with coinIntel — including through the boot cache, or a returning
  // reader sees a coin's rate with nothing to compare it to for a beat.
  const [deskWr, setDeskWr] = useState(() => bootCache?.deskWr ?? null);
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
  // Keep only the top N% of the visible book by Edge Score. A percentile, not
  // a score: the share clearing any fixed score swings by a factor of two
  // between months, so a fixed bar would make this list double and halve on
  // its own. Runners sets it to 20.
  const [edgeTop, setEdgeTop] = useState(null);
  const [mineExtra, setMineExtra] = useState(null);
  const [customMatch, setCustomMatch] = useState(null);
  const [customRetry, setCustomRetry] = useState(0);

  const [selectedDates, setSelectedDates] = useState(() => [utcTodayYmd()]);
  // Watchlist is a desk mode (not a day tab). It can be older than 7 days, so it
  // has its own source (/watchlist/) instead of filtering allSignals.
  const [watchlistIds, setWatchlistIds] = useState([]);
  const [watchlistSignals, setWatchlistSignals] = useState([]);
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);
  // Coin Flow Intensity (top-5) — di-inject dari Money Flow, "More" ke /money-flow.
  const [flowCoins, setFlowCoins] = useState([]);
  // Narrative row — CoinGecko categories the desk has 3+ calls in, plus how
  // each category is trading. Its own source: the money-flow snapshot alone
  // knows the category move, and allSignals alone knows what we called.
  const [narrativeData, setNarrativeData] = useState(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [narrativeDays, setNarrativeDays] = useState(30);
  // [{ category_id, name, pairs:Set }] — the desk filtered to one or more
  // narratives. Multi-select behaves like the day strip: the picks are OR'd,
  // so adding a second narrative widens the view rather than narrowing it.
  const [narratives, setNarratives] = useState([]);
  // One flat set, rebuilt only when the picks change — the filter chain runs
  // per signal and must not walk every narrative for each row.
  const narrativeActiveIds = useMemo(
    () => narratives.map((n) => n.category_id),
    [narratives]
  );

  const narrativePairSet = useMemo(() => {
    if (!narratives.length) return null;
    const all = new Set();
    for (const n of narratives) for (const p of n.pairs) all.add(p);
    return all;
  }, [narratives]);

  const navigate = useNavigate();
  // Every blurred number is a button, and they all lead here.
  const goPricing = () => navigate("/pricing?src=signals_locked");
  const tabScrollRef = useRef(null); // horizontal scroll tab bar (day tabs)
  // Multi-level sort chain: [{ field, order }, ...] — primary first.
  const [sorts, setSorts] = useState(() => [...DEFAULT_SORTS]);
  const sortBy = sorts[0]?.field || "created_at";
  const sortOrder = sorts[0]?.order || "desc";
  const setSortBy = useCallback((field) => {
    setSorts((prev) => promoteSortField(prev, field));
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
  const [showAllSorts, setShowAllSorts] = useState(false);
  // Lifted out of EdgeRecipesBar so the single ? on the search row can open the
  // briefing for whichever mode is current. "__current" means exactly that.
  const [guideMode, setGuideMode] = useState(null);

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
        snapshot.deskWr = intel.platform_avg_wr ?? null;
        setCoinIntel(map);
        setCurrentFlow(snapshot.currentFlow);
        setDeskWr(snapshot.deskWr);
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
        deskWr: snapshot.deskWr ?? bootCache?.deskWr ?? null,
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
    narratives,
    statusFilter,
    riskFilter,
    streakFilter,
    corrDecoupled,
    corrHighAlign,
    edgeTop,
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

  // What the journal actually says, once enough calls are marked. Resolved
  // only: an open call has no outcome to compare, and counting it as a loss is
  // how a journal starts lying to its owner.
  const journalStats = useMemo(() => {
    const counts = { all: 0, taken: 0, skipped: 0, none: 0 };
    const res = { taken: { n: 0, w: 0 }, skipped: { n: 0, w: 0 } };
    for (const w of watchlistSignals) {
      counts.all += 1;
      const k = w.taken === "taken" ? "taken" : w.taken === "skipped" ? "skipped" : "none";
      counts[k] += 1;
      if (k === "none") continue;
      const st = String(w.status || "").toLowerCase();
      const win = st.startsWith("tp") || st === "closed_win";
      const loss = st === "sl" || st === "closed_loss";
      if (!win && !loss) continue;
      res[k].n += 1;
      if (win) res[k].w += 1;
    }
    const rate = (b) => (b.n ? (b.w / b.n) * 100 : null);
    const takenWr = rate(res.taken);
    const skippedWr = rate(res.skipped);
    return {
      counts,
      takenN: res.taken.n,
      skippedN: res.skipped.n,
      takenWr,
      skippedWr,
      // Only a comparison when BOTH sides have something to compare.
      delta: takenWr != null && skippedWr != null ? takenWr - skippedWr : null,
    };
  }, [watchlistSignals]);

  // all | taken | skipped | none — only meaningful on the Watchlist desk.
  const [journalFilter, setJournalFilter] = useState("all");

  // Optimistic: the answer is the user's own, so the row should flip under the
  // thumb and only reconcile if the server disagrees. A failed write refetches
  // rather than guessing what the server now holds.
  const markTaken = useCallback(
    async (signalId, next) => {
      setWatchlistSignals((prev) =>
        prev.map((w) => (w.signal_id === signalId ? { ...w, taken: next } : w))
      );
      try {
        await watchlistApi.setTaken(signalId, next);
      } catch {
        refreshWatchlist();
      }
    },
    [refreshWatchlist]
  );

  // Coin Flow Intensity (exclude stablecoin) untuk strip — sumber Money Flow.
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
    // The whole snapshot, not its busiest eightieth. Coin flow can filter to
    // the coins LuxQuant has called, and 63 of the 108 called coins rank below
    // 80th by turnover — asking for 80 made that filter hide more than half of
    // its own subject while looking complete.
    import("../services/moneyFlowApi")
      .then((m) => m.default.getCoins({ limit: 250 }))
      .then((res) => {
        const coins = Array.isArray(res) ? res : res?.coins || [];
        const filtered = (coins || []).filter(
          (c) => c.symbol && !STABLE.has(c.symbol.toUpperCase())
        );
        if (alive) setFlowCoins(filtered);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Narrative row. Re-runs on window change; the endpoint caches for 15m and
  // the snapshot behind it only moves every 4h, so this is cheap to re-ask.
  useEffect(() => {
    let alive = true;
    setNarrativeLoading(true);
    const token = localStorage.getItem("access_token");
    fetch(`${API_BASE}/api/v1/analytics/narrative-flow?days=${narrativeDays}&limit=40`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setNarrativeData(d);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setNarrativeLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [narrativeDays]);

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

  // Where each pair sits against the desk. Display only — there is no filter
  // on it any more. The old Worth It / Avoid filter passed 487 of 491 pairs,
  // so it screened out four coins while presenting itself as a screen, and a
  // pair's record was measured to carry no information about its next call.
  const verdictByPair = useMemo(() => {
    const map = {};
    for (const pair in coinIntel) {
      map[pair] = coinDeskBand(coinIntel[pair], deskWr);
    }
    return map;
  }, [coinIntel, deskWr]);

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
    if (narrativePairSet?.size) {
      f = f.filter((s) => narrativePairSet.has(s.pair));
    }
    if (showWatchlistOnly && journalFilter !== "all") {
      f = f.filter((s) =>
        journalFilter === "none" ? !s.taken : s.taken === journalFilter
      );
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
          case "unrated":
            return !r;
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
    return f;
  }, [
    allSignals,
    searchPair,
    narrativePairSet,
    journalFilter,
    selectedDates,
    statusFilter,
    riskFilter,
    streakFilter,
    corrDecoupled,
    corrHighAlign,
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
    // Today first — the desk default. All days sits at the end as the 7-day tape.
    const now = new Date();
    const options = [];
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
      // Always show Today and Yesterday, even at 0 — otherwise the default tab
      // vanishes before the first call of the UTC day lands.
      if (i <= 1 || count > 0) {
        options.push({ value: dateStr, label: dayLabel, count });
      }
    }
    options.push({ value: "all", label: "All days", count: allSignals.length });
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

  // Count of active advanced (secondary) filters — drives the badge on the
  // "Advanced filters" toggle. TIDAK lagi memaksa panel terbuka: user boleh
  // apply filter lalu menutup panel; filter tetap berlaku (badge "N active").
  const advancedActiveCount =
    (statusFilter !== "all" && statusFilter !== "open" && statusFilter !== "updated" ? 1 : 0) +
    (riskFilter !== "all" ? 1 : 0) +
    (streakFilter !== "all" ? 1 : 0) +
    (corrDecoupled ? 1 : 0) +
    (corrHighAlign ? 1 : 0) +
    (edgeTop ? 1 : 0) +
    (selectedTags.length > 0 ? 1 : 0) +
    (!isDefaultSorts(sorts) ? 1 : 0);

  // Panel murni dikontrol toggle user (bisa ditutup walau ada filter aktif).
  const advancedOpen = showAdvanced;

  // What the Filter button reports. Status moved into the sheet, so it counts
  // here now — advancedActiveCount deliberately ignores open/updated because
  // those used to be their own buttons on the console.
  const sheetActiveCount =
    advancedActiveCount + (statusFilter === "open" || statusFilter === "updated" ? 1 : 0);

  const todayYmd = utcTodayYmd();
  const dayIsDefault =
    selectedDates.length === 1 && selectedDates[0] === todayYmd;

  const hasActiveFilters =
    !!mineExtra ||
    narratives.length > 0 ||
    searchPair ||
    statusFilter !== "all" ||
    riskFilter !== "all" ||
    streakFilter !== "all" ||
    corrDecoupled ||
    corrHighAlign ||
    !!edgeTop ||
    !dayIsDefault ||
    !isDefaultSorts(sorts) ||
    selectedTags.length > 0 ||
    showWatchlistOnly;

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]
    );
  };

  // What is actually narrowing the desk, as a list you can read and undo one
  // at a time. Before this the only evidence a filter was on lived inside the
  // Filter sheet — so a narrative tapped in the row above silently cut the
  // table and nothing on the page said why.
  const activeFilterChips = useMemo(() => {
    const out = [];
    const pretty = (v) =>
      String(v).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    for (const n of narratives)
      out.push({
        key: `narrative:${n.category_id}`,
        label: `Narrative: ${n.name}`,
        clear: () =>
          setNarratives((prev) => prev.filter((x) => x.category_id !== n.category_id)),
      });
    if (searchPair)
      out.push({
        key: "search",
        label: `Search: ${searchPair.toUpperCase()}`,
        clear: () => setSearchPair(""),
      });
    if (showWatchlistOnly)
      out.push({
        key: "watchlist",
        label: "Watchlist only",
        clear: () => setShowWatchlistOnly(false),
      });
    if (statusFilter !== "all")
      out.push({
        key: "status",
        label: `Status: ${pretty(statusFilter)}`,
        clear: () => setStatusFilter("all"),
      });
    if (riskFilter !== "all")
      out.push({
        key: "risk",
        label: `Risk: ${pretty(riskFilter)}`,
        clear: () => setRiskFilter("all"),
      });
    if (streakFilter !== "all")
      out.push({
        key: "streak",
        label: "High win streak",
        clear: () => setStreakFilter("all"),
      });
    if (corrDecoupled)
      out.push({
        key: "decoupled",
        label: "BTC decoupled",
        clear: () => setCorrDecoupled(false),
      });
    if (corrHighAlign)
      out.push({
        key: "align",
        label: "High BTC alignment",
        clear: () => setCorrHighAlign(false),
      });
    if (edgeTop)
      out.push({
        key: "edge",
        label: `Edge top ${edgeTop}`,
        clear: () => setEdgeTop(null),
      });
    for (const t of selectedTags)
      out.push({
        key: `tag:${t}`,
        label: `Tag: ${t}`,
        clear: () => setSelectedTags((prev) => prev.filter((x) => x !== t)),
      });
    // Days only counts as a filter when it is not the default single day —
    // "Today" is the desk's resting state, not something the user switched on.
    if (!dayIsDefault)
      out.push({
        key: "days",
        label: selectedDates.length === 0 ? "All days" : `${selectedDates.length} days`,
        clear: () => setSelectedDates([utcTodayYmd()]),
      });
    return out;
  }, [
    narratives,
    searchPair,
    showWatchlistOnly,
    statusFilter,
    riskFilter,
    streakFilter,
    corrDecoupled,
    corrHighAlign,
    edgeTop,
    selectedTags,
    dayIsDefault,
    selectedDates,
  ]);

  const resetFilters = useCallback(() => {
    setSearchPair("");
    setNarratives([]);
    setJournalFilter("all");
    setStatusFilter("all");
    setRiskFilter("all");
    setStreakFilter("all");
    setCorrDecoupled(false);
    setCorrHighAlign(false);
    setEdgeTop(null);
    setMineExtra(null);
    setSelectedDates([utcTodayYmd()]);
    setSelectedTags([]);
    setTagMatchMode("any");
    setShowWatchlistOnly(false);
    setSorts([...DEFAULT_SORTS]);
    setPage(1);
  }, []);

  const enterWatchlist = useCallback(() => {
    setMineExtra(null);
    setShowWatchlistOnly(true);
    setSelectedTags([]);
    setTagMatchMode("any");
    setStatusFilter("all");
    setRiskFilter("all");
    setStreakFilter("all");
    setCorrDecoupled(false);
    setCorrHighAlign(false);
    setEdgeTop(null);
    setSorts([...DEFAULT_SORTS]);
    setPage(1);
  }, []);

  /** Apply a mode recipe (Runners).
   *
   * A mode is a mode; the day tabs and the search box are slices inside it.
   * Wiping dates here is what forced the awkward order "mode first, then the
   * day" — picking Today then a mode bounced you back to All Days. Leave the
   * current day and an empty search alone. A saved view that actually stored a
   * pair still restores it. Watchlist is a different source, so leave it. */
  const applyRecipeState = useCallback((state) => {
    if (!state || typeof state !== "object") return;
    setMineExtra(null);
    setSelectedTags(Array.isArray(state.selectedTags) ? state.selectedTags : []);
    setTagMatchMode(state.tagMatchMode === "all" ? "all" : "any");
    setStatusFilter(state.statusFilter || "all");
    setRiskFilter(state.riskFilter || "all");
    setStreakFilter(state.streakFilter || "all");
    if (Array.isArray(state.sorts) && state.sorts.length) {
      setSorts(normalizeSorts(state.sorts));
    } else {
      setSorts(sortsFromLegacy(state.sortBy || "created_at", state.sortOrder || "desc"));
    }
    if (state.searchPair) setSearchPair(state.searchPair);
    setCorrDecoupled(!!state.corrDecoupled);
    setCorrHighAlign(!!state.corrHighAlign);
    setEdgeTop(state.edgeTop || null);
    setShowWatchlistOnly(false);
    setPage(1);
  }, []);



  const toggleDateFilter = (dateVal) => {
    if (dateVal === "all") {
      setSelectedDates([]);
      return;
    }
    setSelectedDates((prev) => {
      if (prev.includes(dateVal)) return prev.filter((d) => d !== dateVal);
      return [...prev, dateVal];
    });
  };

  useEffect(() => {
    if (!mineExtra?.criteria) { setCustomMatch(null); return; }
    const controller = new AbortController();
    signalAlertApi.preview(mineExtra.criteria, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setCustomMatch({ criteria: mineExtra.criteria, book: allSignals, ids: new Set(data.signal_ids) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setCustomMatch({ criteria: mineExtra.criteria, book: allSignals, error: true });
      });
    return () => controller.abort();
  }, [mineExtra, allSignals, customRetry]);
  const customReady = customMatch?.criteria === mineExtra?.criteria && customMatch?.book === allSignals;

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
    if (narrativePairSet?.size) {
      filtered = filtered.filter((s) => narrativePairSet.has(s.pair));
    }
    if (showWatchlistOnly && journalFilter !== "all") {
      filtered = filtered.filter((s) =>
        journalFilter === "none" ? !s.taken : s.taken === journalFilter
      );
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
          case "unrated":
            return !r;
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

    // Edge cut, deliberately BEFORE the tag filter. "Runner tag AND top 20%"
    // has to mean the top 20% of the book; the top 20% OF the tagged rows is a
    // different, larger and weaker set, and the measurement was taken the
    // first way round.
    if (edgeTop) {
      const cut = edgeTopThreshold(filtered, edgeScoreMap, edgeTop);
      if (cut != null) {
        filtered = filtered.filter((s) => {
          const sc = edgeScoreMap?.[s.signal_id]?.score;
          return typeof sc === "number" && sc >= cut;
        });
      }
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

    if (mineExtra?.criteria) {
      filtered = customReady && customMatch?.ids
        ? filtered.filter((s) => customMatch.ids.has(String(s.signal_id))) : [];
    }

    // Multi-level sort: e.g. verdict ↓ → edge ↓ → called ↓ (stable tiebreak inside).
    filtered = sortSignals(filtered, sorts, {
      getPriceVal,
      getVolVal,
      getStreakVal,
      getWinRateVal,
      edgeScoreMap,
      coinIntel,
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
    narrativePairSet,
    journalFilter,
    statusFilter,
    riskFilter,
    streakFilter,
    corrDecoupled,
    corrHighAlign,
    edgeTop,
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
    mineExtra,
    customMatch,
    customReady,
  ]);

  const emptyState = useMemo(() => {
    const onToday = selectedDates.length === 1 && selectedDates[0] === utcTodayYmd();
    const huntOn = selectedTags.length > 0;
    if (showWatchlistOnly) {
      return {
        title: "No starred calls",
        hint: "Star a call to keep it here — watchlist is not limited to the last 7 days.",
        actionLabel: "Back to desk",
        action: "all",
      };
    }
    if (searchPair) {
      return {
        title: `No ${searchPair.toUpperCase()} in this view`,
        hint: "Nothing here matches that pair. Clear search, or open All days.",
        actionLabel: "Clear search",
        action: "search",
      };
    }
    if (huntOn && onToday) {
      return {
        title: "No Runners today",
        hint: "Runners is on for this day. Open All days, or switch the mode to All.",
        actionLabel: "Show all days",
        action: "days",
      };
    }
    if (statusFilter === "open" && onToday) {
      return {
        title: "No open calls today",
        hint: "Nothing still running on this UTC day. Open All days to see the week.",
        actionLabel: "Show all days",
        action: "days",
      };
    }
    if (onToday) {
      return {
        title: "No calls today",
        hint: "The desk is quiet so far. Open All days to see the last week.",
        actionLabel: "Show all days",
        action: "days",
      };
    }
    return {
      title: "No signals found",
      hint: "Nothing matches this view. Reset to today’s desk.",
      actionLabel: "Reset",
      action: "reset",
    };
  }, [showWatchlistOnly, searchPair, selectedDates, selectedTags, statusFilter]);

  const onEmptyAction = useCallback(
    (action) => {
      if (action === "search") setSearchPair("");
      else if (action === "days") {
        setShowWatchlistOnly(false);
        setSelectedDates([]);
      } else if (action === "all") {
        setShowWatchlistOnly(false);
      } else resetFilters();
      setPage(1);
    },
    [resetFilters]
  );

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

  // The six a reader recognises without being told what they mean. The other
  // ten are one tap away — a list of sixteen identical rows is not a menu, it
  // is a wall, and a first-time reader stops at it.
  const COMMON_SORTS = [
    "created_at",
    "last_update",
    "edge_score",
    "max_target",
    "win_rate",
    "volume",
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
    { value: "market_cap", label: "Market Cap" },
    { value: "volume", label: "Volume 24H" },
    { value: "turnover", label: "Turnover (vol ÷ mcap)" },
  ];

  // Expanded on request, or automatically when the active sort is not one of
  // the six — the selected row must never be hidden behind a toggle.
  const sortListExpanded = showAllSorts || !COMMON_SORTS.includes(sortBy);
  const visibleSortOptions = sortListExpanded
    ? sortOptions
    : sortOptions.filter((o) => COMMON_SORTS.includes(o.value));

  const riskOptions = [
    { value: "all", label: "All" },
    { value: "low", label: "Low", dotColor: "bg-profit" },
    { value: "normal", label: "Normal", dotColor: "bg-accent" },
    { value: "high", label: "High", dotColor: "bg-negative" },
    // ~9% of signals carry no risk_level. Without this they matched none of
    // Low/Normal/High and could only be reached by clearing the filter, so the
    // three options silently failed to add up to the whole set.
    { value: "unrated", label: "Unrated", dotColor: "bg-ink/30" },
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

      {flowCoins.length > 0 && (
        <SignalsCoinFlow
          coins={flowCoins}
          signals={allSignals}
          onOpenSignal={openSignal}
          onMore={() => navigate("/money-flow")}
        />
      )}

      <SignalsNarrativeFlow
        data={narrativeData}
        loading={narrativeLoading}
        days={narrativeDays}
        onDaysChange={setNarrativeDays}
        activeIds={narrativeActiveIds}
        signals={allSignals}
        onOpenSignal={openSignal}
        onMore={() => navigate("/money-flow")}
        onPick={(n) => {
          setNarratives((prev) => {
            // Tapping one already picked removes it, so the row is its own off
            // switch and never strands the desk on an empty filter.
            const on = prev.some((x) => x.category_id === n.category_id);
            if (on) return prev.filter((x) => x.category_id !== n.category_id);
            return [
              ...prev,
              {
                category_id: n.category_id,
                name: n.name,
                pairs: new Set(n.pairs || []),
              },
            ];
          });
          // The narrative window is 30-90 days but the day tabs default to
          // today, so filtering without widening the dates would usually land
          // on an empty table and read as a broken filter. Only on the way IN:
          // clearing the last pick should not also throw the day tabs back.
          if (!narratives.some((x) => x.category_id === n.category_id)) {
            setSelectedDates([]);
          }
          setPage(1);
        }}
      />


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
              deskWr={deskWr}
              tagWrMap={tagWrMap}
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

      {/* FILTER CONSOLE — rebuilt from scratch. One question per row:
          1. which set of calls?   (mode)
          2. how recent?           (day)
          3. narrow it down        (search + everything else, behind one button)

          The old console put five rails of controls on the first screen, which
          pushed the first signal a full phone-screen below the fold — it showed
          the filters instead of the product. Refinement is not selection, so
          status, sort and the advanced filters moved into a sheet, and the
          chip bar under this card reports what is on. */}
      <div className="relative overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised p-3 sm:p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-2 sm:flex sm:gap-3">
          <span className={CONSOLE_LABEL}>Mode</span>
          <EdgeRecipesBar
          tagWr={tagWr}
          selectedTags={selectedTags}
          tagMatchMode={tagMatchMode}
            statusFilter={statusFilter}
          riskFilter={riskFilter}
          streakFilter={streakFilter}
          sortBy={sortBy}
          sortOrder={sortOrder}
          sorts={sorts}
          searchPair={searchPair}
          corrDecoupled={corrDecoupled}
          corrHighAlign={corrHighAlign}
          edgeTop={edgeTop}
          onApplyState={applyRecipeState}
          customActive={!!mineExtra}
          showRecipes={isSubscriber}
          watchlistCount={watchlistIds.length}
          watchlistActive={showWatchlistOnly}
          onWatchlist={enterWatchlist}
          guideMode={guideMode}
          onGuideMode={setGuideMode}
          onDeskGuide={() => {
            setGuideMode(null);
            setShowGuide(true);
          }}
          onTutorials={() => navigate("/tips?lesson=anatomy-of-a-call")}
          />
          {isSubscriber ? (
            <SignalsCustomCalls
              show
              active={!!mineExtra}
              activeName={mineExtra?.name || null}
              tagWr={tagWr}
              pairs={allPairs}
              deskState={{
                selectedTags,
                tagMatchMode,
                riskFilter,
                statusFilter,
                searchPair,
                corrDecoupled,
                corrHighAlign,
              }}
              onApply={(s) => {
                applyRecipeState({
                  ...ALL_MODE_STATE,
                  ...s,
                  edgeTop: s.edgeTop ?? null,
                });
                setSearchPair(s.searchPair || "");
                setMineExtra(s.extra || null);
              }}
            />
          ) : null}
          <ModeGuideLink onClick={() => setGuideMode("__browse")} />
        </div>

        {/* Day strip — eight-plus options, so not a segmented control: Apple
            caps those at five equal segments on a phone, which is why cramming
            the days into one shell clipped the last label behind a chevron.
            Chips that snap, with the next one peeking past the fade — on touch
            the peek is the affordance, so the arrow is pointer-only. */}
        <div
          className={`mt-2 flex items-center gap-1.5 sm:mt-3 sm:gap-3 ${
            showWatchlistOnly ? "opacity-40" : ""
          }`}
        >
          <span className={CONSOLE_LABEL}>Day</span>
          <div className="edge-fade-raised-r relative min-w-0 flex-1">
          <div
            ref={tabScrollRef}
            className="flex snap-x snap-proximity gap-1.5 overflow-x-auto no-scrollbar pr-10"
          >
            {dateOptions.map((opt) => {
              const active =
                !showWatchlistOnly &&
                (opt.value === "all"
                  ? selectedDates.length === 0
                  : selectedDates.includes(opt.value));
              return (
                <button
                  key={opt.value}
                  type="button"
                  title={
                    opt.value === "all"
                      ? "Whole 7-day tape"
                      : "Click to add or remove this day. Several days can be on at once."
                  }
                  onClick={() => {
                    setShowWatchlistOnly(false);
                    toggleDateFilter(opt.value);
                  }}
                  className={`${deskChipClass(active)} !h-11 sm:!h-7`}
                >
                  {opt.label}
                  {opt.count != null ? (
                    <span className={deskBadgeClass(active)}>{opt.count}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => tabScrollRef.current?.scrollBy({ left: 240, behavior: "smooth" })}
            aria-label="View previous day"
            className="absolute right-0 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary sm:flex"
          >
            <svg
              className="h-4 w-4"
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
        </div>

        <div className="mt-2.5 flex items-center gap-2 sm:mt-3">
          <div className="relative min-w-0 flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-primary/45 pointer-events-none">
              {Icon.search("w-3.5 h-3.5")}
            </span>
            <input
              type="text"
              placeholder="Search pair"
              value={searchPair}
              onChange={(e) => setSearchPair(e.target.value)}
              className={`h-11 w-full rounded-md border border-ink/[0.1] bg-surface-secondary font-mono text-base sm:text-xs text-text-primary placeholder-text-secondary/50 focus:border-ink/20 focus:outline-none sm:h-8 pl-9 ${
                searchPair ? "pr-9" : "pr-3"
              }`}
            />
            {searchPair ? (
              <button
                type="button"
                onClick={() => setSearchPair("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-primary/45 transition-colors hover:bg-ink/[0.06] hover:text-text-primary"
              >
                {Icon.close ? Icon.close("w-3 h-3") : <span className="text-[13px] leading-none">×</span>}
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(true)}
            aria-expanded={advancedOpen}
            className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors sm:h-8 ${
              sheetActiveCount > 0
                ? "border-accent/50 bg-accent/10 text-text-primary"
                : "border-ink/[0.1] bg-surface-secondary text-text-muted hover:text-text-primary"
            }`}
          >
            {Icon.sliders("w-3.5 h-3.5")}
            Filter
            {sheetActiveCount > 0 ? (
              <span className={deskBadgeClass(false)}>{sheetActiveCount}</span>
            ) : null}
          </button>

        </div>
      </div>

      {showWatchlistOnly && journalStats.counts.all > 0 ? (
        <div className="space-y-2">
          <SignalsJournalRecap stats={journalStats} deskWr={deskWr} />

          {/* The filter rail stays OUTSIDE the collapsible panel: on a phone the
              recap is closed by default, and burying the only way to see just
              your unmarked calls behind that would cost a tap to reach a
              control that is not a chart. */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-ink/[0.07] bg-surface-raised px-3 py-2 sm:px-3.5">
            {[
              { k: "all", label: "All", n: journalStats.counts.all },
              { k: "taken", label: "Taken", n: journalStats.counts.taken },
              { k: "skipped", label: "Skipped", n: journalStats.counts.skipped },
              { k: "none", label: "Unmarked", n: journalStats.counts.none },
            ].map((o) => {
              const on = journalFilter === o.k;
              return (
                <button
                  key={o.k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setJournalFilter(o.k);
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors ${
                    on
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-ink/[0.12] text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {o.label}
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      on ? "text-accent-fg/80" : "text-text-muted"
                    }`}
                  >
                    {o.n}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeFilterChips.length > 0 ? (
        <div
          role="status"
          aria-label="Active filters"
          className="flex flex-wrap items-center gap-1.5 rounded-xl border border-ink/[0.07] bg-surface-raised px-3 py-2"
        >
          <span className="mr-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
            Filtering by
          </span>
          {activeFilterChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              title={`Remove — ${c.label}`}
              className="group inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/[0.08] py-1 pl-2.5 pr-1.5 text-[11.5px] text-text-primary transition-colors hover:border-accent/70"
            >
              <span className="max-w-[220px] truncate">{c.label}</span>
              <span
                aria-hidden="true"
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-text-muted group-hover:bg-accent/20 group-hover:text-text-primary"
              >
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </span>
            </button>
          ))}
          {activeFilterChips.length > 1 ? (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-1 rounded-md px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-muted hover:text-text-primary"
            >
              Clear all
            </button>
          ) : null}
        </div>
      ) : null}

      {mineExtra ? (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-ink/[0.07] bg-surface-raised p-3 text-sm text-text-secondary">
          <span className="flex-1 min-w-[12rem]">
            {!customReady ? (
              "Checking Custom rules…"
            ) : customMatch?.error ? (
              "Custom could not load. Retry to see matching calls."
            ) : (
              <>
                {/* Which screen, and whether it is actually alerting. "Custom
                    active · same rules as notifications" was true of a saved,
                    enabled screen and wrong about every other one — and it
                    never said WHICH screen was doing the filtering. */}
                <span className="font-medium text-text-primary">
                  {mineExtra.name ? `Custom: ${mineExtra.name}` : "Custom: unsaved rules"}
                </span>
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                    mineExtra.notify
                      ? "bg-profit/12 text-profit"
                      : "bg-ink/[0.06] text-text-muted"
                  }`}
                >
                  {mineExtra.notify ? "Alerts on" : "Alerts off"}
                </span>
                <span className="mt-0.5 block text-[12px] text-text-muted">
                  {mineExtra.name
                    ? mineExtra.notify
                      ? "New calls matching this screen are sent to you. Days and search narrow this view."
                      : "Saved, but not sending alerts. Days and search narrow this view."
                    : "Save this screen to keep it or to get alerts. Days and search narrow this view."}
                </span>
              </>
            )}
          </span>
          {customMatch?.error && customReady ? <button type="button" className="min-h-11 px-3 text-accent" onClick={() => setCustomRetry((v) => v + 1)}>Retry</button> : null}
          <button type="button" className="min-h-11 px-3" onClick={() => setMineExtra(null)}>Clear Custom</button>
        </div>
      ) : null}

      {/* FILTER SHEET — a bottom sheet on a phone, a centred dialog on a desk
          (Modal already does both). Refinement belongs behind a deliberate tap:
          it is used once and then wanted out of the way, which is exactly the
          case bottom sheets exist for. */}
      <Modal
        isOpen={advancedOpen}
        onClose={() => setShowAdvanced(false)}
        size="lg"
        eyebrow="Signals"
        title="Filter & sort"
        subtitle={
          allSignals?.length
            ? `${totalSignals} of ${allSignals.length} calls match`
            : "Narrow the desk down"
        }
        footer={() => (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className={`inline-flex h-11 items-center rounded-md border border-ink/[0.1] px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 sm:h-9`}
            >
              Reset all
            </button>
            <button
              type="button"
              onClick={() => setShowAdvanced(false)}
              className="ml-auto inline-flex h-11 items-center rounded-md bg-accent px-5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-accent-fg shadow-sm sm:h-9"
            >
              Show {totalSignals} {totalSignals === 1 ? "call" : "calls"}
            </button>
          </div>
        )}
      >
        <div className="space-y-6">
          {/* Status is ONE tri-state, not two toggles. Open and Hit as separate
              buttons implied they could both be on; they never could. */}
          <section>
            <h3 className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Status
            </h3>
            <p className="mb-2 text-[12px] leading-snug text-text-muted">
              Open is still running. Hit has already reached a target or its stop.
            </p>
            <SegGroup
              size="touch"
              fill
              aria-label="Call status"
              value={PLAIN_STATUS.includes(statusFilter) ? statusFilter : ""}
              onChange={(k) => {
                if (k === "updated" && sortBy === "created_at") setSortBy("last_update");
                setStatusFilter(k);
                setPage(1);
              }}
              options={[
                { key: "all", label: "All" },
                { key: "open", label: "Open" },
                { key: "updated", label: "Hit", badge: updatedCount > 0 ? updatedCount : null },
              ]}
            />
            {/* The exact milestone is the same single filter, but it is a
                different question and there are five of them — past the five
                Apple caps a phone segmented control at, so chips. */}
            <p className="mb-1.5 mt-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
              Or by how far it got
            </p>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions
                .filter((opt) => !PLAIN_STATUS.includes(opt.value))
                .map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(statusFilter === opt.value ? "all" : opt.value);
                      setPage(1);
                    }}
                    className={deskChipClass(statusFilter === opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Sort by
            </h3>
            <p className="mb-2 text-[12px] leading-snug text-text-muted">
              What decides the order of the list. Direction is below.
            </p>
            <div className="grid grid-cols-2 gap-1">
              {visibleSortOptions.map((opt) => {
                const on = sortBy === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSorts((prev) => promoteSortField(prev, opt.value))}
                    className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left font-mono text-[11px] leading-tight transition-colors sm:min-h-[36px] ${
                      on
                        ? "border-accent/50 bg-accent/10 text-text-primary"
                        : "border-ink/[0.08] bg-surface-secondary text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {opt.label}
                    {on ? <span className="text-accent">✓</span> : null}
                  </button>
                );
              })}
            </div>
            {sortListExpanded ? (
              showAllSorts ? (
                <button
                  type="button"
                  onClick={() => setShowAllSorts(false)}
                  className={`mt-1 ${deskGhostClass({ bordered: true })}`}
                >
                  Show fewer
                </button>
              ) : null
            ) : (
              <button
                type="button"
                onClick={() => setShowAllSorts(true)}
                className={`mt-1 ${deskGhostClass({ bordered: true })}`}
              >
                All {sortOptions.length} fields
              </button>
            )}
            <div className="mt-2">
              <SegGroup
                size="touch"
                fill
                aria-label="Sort direction"
                value={sortOrder}
                onChange={(k) => setSortOrder(k === "asc" ? "asc" : "desc")}
                options={[
                  { key: "desc", label: orderLabel(sortBy, "desc") },
                  { key: "asc", label: orderLabel(sortBy, "asc") },
                ]}
              />
            </div>
          </section>

          {/* Refine — the filters a regular reader actually reaches for. Both
              now carry a plain line saying what they mean, because "Risk
              Profile" and "Intelligence Filters" tell a first-time reader
              nothing on their own. */}
          <section>
            <h3 className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              Risk profile
            </h3>
            <p className="mb-2 text-[12px] leading-snug text-text-muted">
              The grade published with the call itself. Unrated means it arrived without one.
            </p>
            <SegGroup
              size="touch"
              fill
              aria-label="Risk profile"
              value={riskFilter}
              onChange={(k) => {
                setRiskFilter(k);
                setPage(1);
              }}
              options={riskOptions.map((opt) => ({
                key: opt.value,
                label: opt.label,
                icon: opt.dotColor ? (
                  <span className={`h-1.5 w-1.5 rounded-full ${opt.dotColor}`} />
                ) : null,
              }))}
            />
          </section>

            {/* Intelligence Filters */}
            <section className="border-t border-ink/[0.06] pt-5">
              <h3 className="mb-1 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                What the pair's history says
                <InfoTip side="bottom" title={t("guide.sec_intel")} text={t("guide.worth_d")} />
              </h3>
              <p className="mb-2 text-[12px] leading-snug text-text-muted">
                Scored from this pair's own closed calls, as of the entry — not from this call's
                outcome. Tap one to keep only those.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setStreakFilter(streakFilter === "hot" ? "all" : "hot")}
                  className={deskChipClass(streakFilter === "hot")}
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
                  className={deskChipClass(corrDecoupled)}
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
                  className={deskChipClass(corrHighAlign)}
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

              </div>
            </section>

            {/* Advanced — everything that only makes sense once you already
                read the desk. Collapsed, so a first-time reader is never asked
                to parse a four-level sort stack to find "newest first". */}
            <details className="group rounded-md border border-ink/[0.08] bg-surface-secondary/40 px-3 py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted [&::-webkit-details-marker]:hidden">
                Advanced
                <span className="transition-transform group-open:rotate-180" aria-hidden>
                  ▾
                </span>
              </summary>
              <p className="mt-1.5 text-[12px] leading-snug text-text-muted">
                Stack several sort levels, and filter by the entry tags a call carried. Nothing
                here is needed to read the desk.
              </p>
              <div className="mt-4 space-y-5">
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
                        className={`${deskChipClass(active)} !h-11 sm:!h-7`}
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
            </details>

        </div>
      </Modal>

      {/* Sticky current-filter chips */}
      <EdgeActiveFilters
        variant="bar"
        sticky
        selectedTags={selectedTags}
        tagMatchMode={tagMatchMode}
        statusFilter={statusFilter}
        riskFilter={riskFilter}
        streakFilter={streakFilter}
        corrDecoupled={corrDecoupled}
        corrHighAlign={corrHighAlign}
        edgeTop={edgeTop}
        sortBy={sortBy}
        sortOrder={sortOrder}
        sorts={sorts}
        selectedDates={selectedDates}
        searchPair={searchPair}
        watchlistActive={showWatchlistOnly}
        filteredCount={totalSignals}
        totalUnfiltered={allSignals?.length}
        onEdgeTop={(v) => {
          setEdgeTop(v || null);
          setPage(1);
        }}
        onRemoveTag={(tag) => {
          toggleTag(tag);
          setPage(1);
        }}
        onTagMatchMode={(mode) => {
          setTagMatchMode(mode === "all" ? "all" : "any");
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
          setSelectedDates([utcTodayYmd()]);
          setPage(1);
        }}
        onClearWatchlist={() => {
          setShowWatchlistOnly(false);
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
        signalTags={signalTags}
        selectedTags={selectedTags}
        tagMatchMode={tagMatchMode}
        statusFilter={statusFilter}
        riskFilter={riskFilter}
        sortBy={sortBy}
        sortOrder={sortOrder}
        sorts={sorts}
        edgeFilterActive={
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
            setSorts((prev) => promoteSortField(prev, field, order || null));
          }
          setPage(1);
        }}
        onSorts={(next) => {
          setSorts(normalizeSorts(next));
          setPage(1);
        }}
        onApplyEdge={(tags) => {
          if (tags?.length) {
            setSelectedTags((prev) => [...new Set([...prev, ...tags])]);
          }
          setSorts(
            normalizeSorts([
              { field: "edge_score", order: "desc" },
              { field: "created_at", order: "desc" },
            ])
          );
          setPage(1);
        }}
        onScreenRunners={(tags) => {
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
                setRiskFilter("all");
          setStreakFilter("all");
          setCorrDecoupled(false);
          setCorrHighAlign(false);
          setEdgeTop(null);
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
                setStatusFilter(st || "all");
          setRiskFilter("all");
          setStreakFilter("all");
          setCorrDecoupled(false);
          setCorrHighAlign(false);
          setEdgeTop(null);
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
                setStatusFilter("open");
          setRiskFilter("all");
          setStreakFilter("all");
          setCorrDecoupled(false);
          setCorrHighAlign(false);
          setEdgeTop(null);
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
          journalMode={showWatchlistOnly}
          onMarkTaken={markTaken}
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
          emptyState={emptyState}
          onEmptyAction={onEmptyAction}
          onPageChange={setPage}
          onPricesUpdate={handlePricesUpdate}
          allPairs={allPairs}
          coinIntel={coinIntel}
          verdictByPair={verdictByPair}
          currentFlow={currentFlow}
          deskWr={deskWr}
          tagWrMap={tagWrMap}
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
