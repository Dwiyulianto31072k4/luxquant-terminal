import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SignalsTable from "./SignalsTable";
import SignalModal from "./SignalModal";
import BtcDomAlert from "./BtcDomAlert";
import { classifyCoin } from './coinIntelShared';
import { InfoTip, GuideModal } from './GuideInfo';
import { watchlistApi } from '../services/watchlistApi';
import moneyFlowApi from '../services/moneyFlowApi';
import { signalsApi } from '../services/api';
import CoinLogo from './CoinLogo';
import CompassSnapshot from './aiArenaV6/CompassSnapshot';
import AssistantWidget from './assistant/AssistantWidget';
import { filtersToParams } from '../utils/signalFilters';

const API_BASE = import.meta.env.VITE_API_URL || "";

// ================================================================
// INLINE SVG ICONS (Lucide-style) — unchanged
// ================================================================
const Icon = {
  filter: (className = 'w-3.5 h-3.5') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  search: (className = 'w-3.5 h-3.5') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  chevronDown: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  arrowUp: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  ),
  arrowDown: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  ),
  close: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  alert: (className = 'w-4 h-4') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  bell: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  check: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  trophy: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  ),
  x: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  flame: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  ),
  zap: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  target: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  sliders: (className = 'w-3.5 h-3.5') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

// ================================================================
// SECTION HEADER — unchanged
// ================================================================
const SectionHeader = ({ label, hint }) => (
  <div className="flex items-center gap-3 mb-4">
    <span className="h-px w-8 bg-gold-primary/40" />
    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">{label}</span>
    <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/40 via-white/[0.06] to-transparent" />
    {hint && <span className="font-mono text-[10px] uppercase tracking-wider text-text-primary/50">{hint}</span>}
  </div>
);

// ================================================================
// STAT CARD — brighter label/sub for contrast
// ================================================================
// MEXC-soft KPI card — background halus (bukan box tebal), angka dominan.
const StatCard = ({ label, value, valueColor = 'text-text-primary', sub }) => (
  <div className="bg-white/[0.02] rounded-xl p-4 lg:p-5 transition-colors duration-200 hover:bg-white/[0.035]">
    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-primary/45 mb-2.5">{label}</p>
    <p className={`font-mono text-2xl lg:text-[28px] font-medium tabular-nums leading-none ${valueColor}`}>{value}</p>
    {sub && <p className="font-mono text-[10px] uppercase tracking-wider text-text-primary/40 mt-2">{sub}</p>}
  </div>
);

// ================================================================
// TOKEN SEARCH — strict, base-token aware matching
// ================================================================
// Quote assets we know about. Longest-first so "USDT" is stripped before "USD".
const QUOTE_ASSETS = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'TUSD', 'USD', 'BTC', 'ETH'];

// Split a pair like "MANAUSDT" -> { base: "MANA", quote: "USDT" }.
const splitPair = (pairUpper) => {
  for (const qa of QUOTE_ASSETS) {
    if (pairUpper.endsWith(qa) && pairUpper.length > qa.length) {
      return { base: pairUpper.slice(0, -qa.length), quote: qa };
    }
  }
  return { base: pairUpper, quote: '' };
};

// Match a signal pair against a user query.
//   - "MUSDT"  (token + quote)  -> exact full-pair match only ("M/USDT")
//   - "M"      (bare token)     -> base token must START WITH the query
// This stops false positives like "XLMUSDT" / "ATOMUSDT" matching "MUSDT",
// and "NMR" / "XLM" matching a bare "M".
const pairMatchesQuery = (pair, rawQuery) => {
  if (!pair) return false;
  const q = (rawQuery || '').trim().toUpperCase();
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
// MAIN PAGE
// ================================================================
const SignalsPage = () => {
  const { t } = useTranslation();

  const [allSignals, setAllSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [stats, setStats] = useState(null);

  // Coin Intelligence map { pair: coinObj } — used to join win-streak (and other
  // anomaly data) onto signal rows for the new column / filter / sort.
  const [coinIntel, setCoinIntel] = useState({});
  const [currentFlow, setCurrentFlow] = useState(null);


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
  const [flowCount, setFlowCount] = useState(10);   // berapa koin ditampilkan (min 10)
  const [flowSort, setFlowSort] = useState({ key: 'intensity', dir: 'desc' }); // sort tabel flow
  const navigate = useNavigate();
  const tabScrollRef = useRef(null); // horizontal scroll tab bar (day tabs)
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  // Tag intelligence (historical WR per important tag + active signal map).
  const [tagWr, setTagWr] = useState([]);            // raw list from /analytics/tag-wr
  const [selectedTags, setSelectedTags] = useState([]); // tag names the user filters by
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
        fetch(`${API_BASE}/api/v1/analytics/tag-wr?days=90&min_n=200`, { headers: authHeaders }),
      ]);
      if (signalsRes.status === "fulfilled" && signalsRes.value.ok) {
        const data = await signalsRes.value.json();
        setAllSignals(data.items || []);
      } else {
        throw new Error("Failed to fetch signals.");
      }
      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        const statsData = await statsRes.value.json();
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
        setCoinIntel(map);
        setCurrentFlow(intel.current_flow ?? null);
      }
      // Tag WR is best-effort: failure just hides the tag filter / badges.
      if (tagWrRes.status === "fulfilled" && tagWrRes.value.ok) {
        const tw = await tagWrRes.value.json();
        setTagWr(Array.isArray(tw.tags) ? tw.tags : []);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error fetching signals:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBulkSignals(true);
    const interval = setInterval(() => fetchBulkSignals(false), 30000);
    return () => clearInterval(interval);
  }, [fetchBulkSignals]);

  // ── Modal sinyal didorong oleh URL: ?signal=<id>&tab=chart|trade|research|history ──
  // Sumber kebenaran tunggal — buka via klik baris, deep-link, atau back/forward
  // browser semuanya lewat query param yang sama, jadi selalu konsisten.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSignalId = searchParams.get("signal");
  const selectedTab = searchParams.get("tab") || "chart";
  // Fallback signal object for signals opened by id that aren't in the currently
  // loaded `allSignals` (SignalsPage only holds the last 7 days). Applies to:
  //   - clicking an older call in the History tab
  //   - deep-linking ?signal=<old id> directly
  // Without this, the URL updates but the modal resolves to null → nothing shows.
  const [directSignal, setDirectSignal] = useState(null);
  const fetchedSignalIdRef = useRef(null);
  const selectedSignal = useMemo(() => {
    if (!selectedSignalId) return null;
    const fromList = allSignals.find((s) => String(s.signal_id) === String(selectedSignalId));
    if (fromList) return fromList;
    if (directSignal && String(directSignal.signal_id) === String(selectedSignalId)) return directSignal;
    return null;
  }, [selectedSignalId, allSignals, directSignal]);

  // If the selected signal isn't in the 7-day list, fetch it by id (once per id).
  // Mirrors DailyPerformancePage.handlePickSignal so any-age signals open.
  useEffect(() => {
    if (!selectedSignalId) return;
    if (allSignals.some((s) => String(s.signal_id) === String(selectedSignalId))) return;
    if (fetchedSignalIdRef.current === String(selectedSignalId)) return;
    fetchedSignalIdRef.current = String(selectedSignalId);
    let alive = true;
    signalsApi
      .getSignal(selectedSignalId)
      .then((full) => { if (alive && full) setDirectSignal(full); })
      .catch((err) => console.error("Failed to load signal by id:", err));
    return () => { alive = false; };
  }, [selectedSignalId, allSignals]);

  const openSignal = useCallback((sig, tab = "chart") => {
    if (!sig) return;
    setDirectSignal(sig);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("signal", String(sig.signal_id));
      if (tab && tab !== "chart") next.set("tab", tab);
      else next.delete("tab");
      return next;
    });
  }, [setSearchParams]);

  const closeSignal = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("signal");
      next.delete("tab");
      return next;
    });
  }, [setSearchParams]);

  const changeSignalTab = useCallback((tab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab && tab !== "chart") next.set("tab", tab);
      else next.delete("tab");
      return next;
    });
  }, [setSearchParams]);

  useEffect(() => {
    setPage(1);
  }, [searchPair, statusFilter, riskFilter, streakFilter, corrDecoupled, corrHighAlign, verdictFilter, selectedDates, sortBy, sortOrder, selectedTags, showWatchlistOnly]);

  // Ambil watchlist penuh (objek sinyal lengkap, lintas-tanggal) untuk tab Watchlist
  // + turunkan ID-nya buat badge. Dipanggil saat mount & tiap star berubah.
  const refreshWatchlist = useCallback(async () => {
    try {
      const data = await watchlistApi.getWatchlist();
      const items = Array.isArray(data) ? data : (data?.items || data?.watchlist || []);
      setWatchlistSignals(items);
      setWatchlistIds(items.map((i) => i.signal_id).filter(Boolean));
    } catch (_) {}
  }, []);

  useEffect(() => { refreshWatchlist(); }, [refreshWatchlist]);

  // Coin Flow Intensity (top-10, exclude stablecoin) untuk strip — sumber Money Flow.
  useEffect(() => {
    let alive = true;
    const STABLE = new Set(['USDT','USDC','DAI','TUSD','FDUSD','USDE','USDD','PYUSD','BUSD','USDP','GUSD','FRAX','LUSD','USDS','USR','USD1']);
    moneyFlowApi.getCoins({ limit: 80 })
      .then((res) => {
        const coins = Array.isArray(res) ? res : (res?.coins || []);
        const filtered = (coins || []).filter((c) => c.symbol && !STABLE.has(c.symbol.toUpperCase()));
        if (alive) setFlowCoins(filtered.slice(0, 60));
      })
      .catch(() => {});
    return () => { alive = false; };
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
    let dec = 0, hi = 0;
    for (const s of allSignals) {
      if (s.btc_decoupled) dec++;
      if ((s.btc_align_score ?? -1) >= 70) hi++;
    }
    return { dec, hi };
  }, [allSignals]);

  // Verdict (worth_it / avoid / neutral) per pair, computed once from coin-intel.
  const verdictByPair = useMemo(() => {
    const map = {};
    for (const pair in coinIntel) {
      map[pair] = classifyCoin(coinIntel[pair]);
    }
    return map;
  }, [coinIntel]);

  const verdictCounts = useMemo(() => {
    let worth = 0, avoid = 0;
    for (const s of allSignals) {
      const v = verdictByPair[s.pair];
      if (v === "worth_it") worth++;
      else if (v === "avoid") avoid++;
    }
    return { worth, avoid };
  }, [allSignals, verdictByPair]);

  // Tag WR lookup { tagName: { wr, n, median_peak } } — for chip labels & badges.
  const tagWrMap = useMemo(() => {
    const m = {};
    for (const t of tagWr) m[t.tag] = { wr: t.win_rate, n: t.n, median_peak: t.median_peak };
    return m;
  }, [tagWr]);

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

  // Tags sorted by WR desc (chips); top 10 unless "show all".
  const sortedTagsForChips = useMemo(() => {
    return [...tagWr].sort((a, b) => b.win_rate - a.win_rate);
  }, [tagWr]);

  // Signals passing every filter EXCEPT the tag filter — used to compute
  // dynamic per-tag counts (how many currently-visible signals carry each tag)
  // and to decide which chips to show. Tag filter itself is excluded so counts
  // don't collapse to the current selection.
  const signalsBeforeTagFilter = useMemo(() => {
    let f;
    if (showWatchlistOnly) {
      const bySid = new Map(allSignals.map((s) => [s.signal_id, s]));
      f = watchlistSignals.map((w) => { const m = bySid.get(w.signal_id); return m ? { ...w, ...m } : w; });
    } else {
      f = [...allSignals];
    }
    if (searchPair) {
      f = f.filter((s) => pairMatchesQuery(s.pair, searchPair));
    }
    if (!showWatchlistOnly && selectedDates.length > 0) {
      f = f.filter((s) => s.created_at && selectedDates.includes(s.created_at.slice(0, 10)));
    }
    if (statusFilter === "updated") {
      f = f.filter((s) => s.last_update_at);
    } else if (statusFilter !== "all") {
      f = f.filter((s) => {
        const st = (s.status || "").toLowerCase();
        switch (statusFilter) {
          case "open": return st === "open";
          case "tp1": return st === "tp1";
          case "tp2": return st === "tp2";
          case "tp3": return st === "tp3";
          case "tp4": case "closed_win": return st === "closed_win" || st === "tp4";
          case "sl": case "closed_loss": return st === "closed_loss" || st === "sl";
          default: return true;
        }
      });
    }
    if (riskFilter !== "all") {
      f = f.filter((s) => {
        const r = (s.risk_level || "").toLowerCase();
        switch (riskFilter) {
          case "low": return r.startsWith("low");
          case "normal": return r.startsWith("med") || r.startsWith("nor");
          case "high": return r.startsWith("high");
          default: return true;
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
    if (verdictFilter !== "all") f = f.filter((s) => verdictByPair[s.pair] === verdictFilter);
    return f;
  }, [allSignals, searchPair, selectedDates, statusFilter, riskFilter, streakFilter, corrDecoupled, corrHighAlign, verdictFilter, verdictByPair, coinIntel, showWatchlistOnly, watchlistIds, watchlistSignals]);

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
    return [...new Set([
      ...allSignals.map((s) => s.pair),
      ...watchlistSignals.map((s) => s.pair),
    ].filter(Boolean))];
  }, [allSignals, watchlistSignals]);

  const todayStats = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const todaySignals = allSignals.filter((s) => s.created_at && s.created_at.slice(0, 10) === todayStr);
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
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel = i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      const count = allSignals.filter((s) => s.created_at && s.created_at.slice(0, 10) === dateStr).length;
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

  const getOrderLabel = () => {
    const isTime = ["created_at", "last_update"].includes(sortBy);
    const isAlpha = sortBy === "pair";
    const isRisk = sortBy === "risk_level";
    const isStatus = sortBy === "status";
    if (sortOrder === "desc") {
      if (isTime) return "Newest";
      if (isAlpha) return "Z–A";
      if (isRisk) return "High";
      if (isStatus) return "Latest";
      return "Highest";
    } else {
      if (isTime) return "Oldest";
      if (isAlpha) return "A–Z";
      if (isRisk) return "Low";
      if (isStatus) return "Early";
      return "Lowest";
    }
  };

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
    (selectedTags.length > 0 ? 1 : 0);

  // Panel murni dikontrol toggle user (bisa ditutup walau ada filter aktif).
  const advancedOpen = showAdvanced;

  const hasActiveFilters = searchPair || statusFilter !== "all" || riskFilter !== "all" || streakFilter !== "all" || corrDecoupled || corrHighAlign || verdictFilter !== "all" || selectedDates.length > 0 || sortBy !== "created_at" || selectedTags.length > 0 || showWatchlistOnly;

  const toggleTag = (tag) => {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]);
  };

  const resetFilters = () => {
    setSearchPair("");
    setStatusFilter("all");
    setRiskFilter("all");
    setStreakFilter("all");
    setCorrDecoupled(false);
    setCorrHighAlign(false);
    setVerdictFilter("all");
    setSelectedDates([]);
    setSelectedTags([]);
    setShowWatchlistOnly(false);
    setSortBy("created_at");
    setSortOrder("desc");
  };

  // Buka LuxQuant Terminal (visualisasi) membawa filter aktif saat ini.
  const goTerminal = () => {
    const params = filtersToParams({
      searchPair, statusFilter, riskFilter, streakFilter,
      corrDecoupled, corrHighAlign, verdictFilter,
      selectedDates, selectedTags, showWatchlistOnly, sortBy, sortOrder,
    });
    const qs = params.toString();
    navigate(qs ? `/terminal?${qs}` : "/terminal");
  };

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

  const { signals, totalPages, totalSignals } = useMemo(() => {
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

    if (searchPair) {
      filtered = filtered.filter((s) => pairMatchesQuery(s.pair, searchPair));
    }

    // Filter tanggal hanya berlaku di mode non-watchlist (watchlist lintas-tanggal).
    if (!showWatchlistOnly && selectedDates.length > 0) {
      filtered = filtered.filter((s) => s.created_at && selectedDates.includes(s.created_at.slice(0, 10)));
    }

    if (statusFilter === "updated") {
      filtered = filtered.filter((s) => s.last_update_at);
    } else if (statusFilter !== "all") {
      filtered = filtered.filter((s) => {
        const st = (s.status || "").toLowerCase();
        switch (statusFilter) {
          case "open": return st === "open";
          case "tp1": return st === "tp1";
          case "tp2": return st === "tp2";
          case "tp3": return st === "tp3";
          case "tp4": case "closed_win": return st === "closed_win" || st === "tp4";
          case "sl": case "closed_loss": return st === "closed_loss" || st === "sl";
          default: return true;
        }
      });
    }

    if (riskFilter !== "all") {
      filtered = filtered.filter((s) => {
        const r = (s.risk_level || "").toLowerCase();
        switch (riskFilter) {
          case "low": return r.startsWith("low");
          case "normal": return r.startsWith("med") || r.startsWith("nor");
          case "high": return r.startsWith("high");
          default: return true;
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

    // Verdict filter (Worth It / Avoid) — from Coin Intelligence classification.
    if (verdictFilter !== "all") {
      filtered = filtered.filter((s) => verdictByPair[s.pair] === verdictFilter);
    }

    // Tag filter — signal passes if it carries ANY of the selected tags.
    if (selectedTags.length > 0) {
      filtered = filtered.filter((s) => {
        const tags = signalTags[s.signal_id];
        if (!tags) return false;
        return selectedTags.some((t) => tags.includes(t));
      });
    }

    // Stable tiebreaker — when two rows compare equal (or share missing/0 data),
    // fall back to a deterministic order (newest call first). This is what stops
    // rows from reshuffling every refresh, especially on page 2+.
    const tiebreak = (a, b) => (b.call_message_id || 0) - (a.call_message_id || 0);

    filtered.sort((a, b) => {
      // Pair: alphabetical, with stable tiebreaker for duplicate pairs
      if (sortBy === "pair") {
        const pa = (a.pair || "").toLowerCase();
        const pb = (b.pair || "").toLowerCase();
        const r = sortOrder === "asc" ? pa.localeCompare(pb) : pb.localeCompare(pa);
        return r !== 0 ? r : tiebreak(a, b);
      }

      let valA, valB;
      switch (sortBy) {
        case "current_price":
          valA = getPriceVal(a.pair); valB = getPriceVal(b.pair); break;
        case "entry":
          valA = parseFloat(a.entry) || 0; valB = parseFloat(b.entry) || 0; break;
        case "max_target": {
          const getMaxPct = (s) => {
            const targets = [s.target4, s.target3, s.target2, s.target1].filter(Boolean);
            if (targets.length === 0 || !s.entry) return 0;
            const maxT = Math.max(...targets.map(Number));
            const entry = parseFloat(s.entry);
            return entry > 0 ? ((maxT - entry) / entry * 100) : 0;
          };
          valA = getMaxPct(a); valB = getMaxPct(b); break;
        }
        case "stop_loss":
          valA = parseFloat(a.stop1) || 0; valB = parseFloat(b.stop1) || 0; break;
        case "status": {
          const statusRank = { open: 0, tp1: 1, tp2: 2, tp3: 3, closed_win: 4, tp4: 4, closed_loss: 5, sl: 5 };
          valA = statusRank[(a.status || "").toLowerCase()] ?? 9;
          valB = statusRank[(b.status || "").toLowerCase()] ?? 9; break;
        }
        case "risk_level": {
          const riskRank = (r) => { const rl = (r || "").toLowerCase(); if (rl.startsWith("low")) return 1; if (rl.startsWith("med") || rl.startsWith("nor")) return 2; if (rl.startsWith("high")) return 3; return 4; };
          valA = riskRank(a.risk_level); valB = riskRank(b.risk_level); break;
        }
        case "market_cap": {
          const parseMcap = (mcap) => { if (!mcap) return 0; const str = mcap.toString().toUpperCase(); const num = parseFloat(str.replace(/[^0-9.]/g, "")) || 0; if (str.includes("T")) return num * 1e12; if (str.includes("B")) return num * 1e9; if (str.includes("M")) return num * 1e6; if (str.includes("K")) return num * 1e3; return num; };
          valA = parseMcap(a.market_cap); valB = parseMcap(b.market_cap); break;
        }
        case "volume":
          valA = getVolVal(a.pair); valB = getVolVal(b.pair); break;
        case "win_streak":
          valA = getStreakVal(a.pair); valB = getStreakVal(b.pair); break;
        case "win_rate":
          valA = getWinRateVal(a.pair); valB = getWinRateVal(b.pair); break;
        case "btc_corr":
          valA = a.btc_align_score ?? null; valB = b.btc_align_score ?? null; break;
        case "verdict": {
          const rank = (p) => { const v = verdictByPair[p]; return v === "worth_it" ? 2 : v === "avoid" ? 1 : null; };
          valA = rank(a.pair); valB = rank(b.pair); break;
        }
        case "last_update": {
          const tsA = a.last_update_at ? new Date(a.last_update_at).getTime() : 0;
          const tsB = b.last_update_at ? new Date(b.last_update_at).getTime() : 0;
          if (tsA === 0 && tsB !== 0) return 1;
          if (tsA !== 0 && tsB === 0) return -1;
          valA = tsA; valB = tsB; break;
        }
        case "created_at": default:
          valA = a.call_message_id || 0; valB = b.call_message_id || 0; break;
      }

      // Live-derived metrics (fetched from the price provider): rows with no data
      // (value 0) always sink to the bottom regardless of asc/desc, so they never
      // pollute the top of an ascending volume/price sort.
      if (sortBy === "volume" || sortBy === "current_price") {
        const hasA = valA > 0;
        const hasB = valB > 0;
        if (hasA !== hasB) return hasA ? -1 : 1;
      }

      // Win streak / BTC alignment: rows without that data (null) always sink,
      // regardless of direction — valid negatives (loss streaks) must not be
      // treated as "missing".
      if (sortBy === "win_streak" || sortBy === "btc_corr" || sortBy === "win_rate" || sortBy === "verdict") {
        const hasA = valA !== null && valA !== undefined;
        const hasB = valB !== null && valB !== undefined;
        if (hasA !== hasB) return hasA ? -1 : 1;
        valA = valA ?? 0; valB = valB ?? 0;
      }

      const cmp = sortOrder === "asc" ? valA - valB : valB - valA;
      return cmp !== 0 ? cmp : tiebreak(a, b);
    });

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pages);
    const start = (safePage - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);
    return { signals: paged, totalPages: pages, totalSignals: total };
  }, [allSignals, searchPair, statusFilter, riskFilter, streakFilter, corrDecoupled, corrHighAlign, verdictFilter, verdictByPair, selectedDates, sortBy, sortOrder, page, pageSize, priceVersion, coinIntel, selectedTags, signalTags, showWatchlistOnly, watchlistIds, watchlistSignals]);

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortOrder("desc"); }
  };

  const statusOptions = [
    { value: "all", label: "All Status" },
    { value: "updated", label: "Recently Hit", icon: Icon.bell, accent: 'gold' },
    { value: "open", label: "Open" },
    { value: "tp1", label: "TP1", icon: Icon.check, accent: 'emerald' },
    { value: "tp2", label: "TP2", icon: Icon.check, accent: 'emerald' },
    { value: "tp3", label: "TP3", icon: Icon.check, accent: 'emerald' },
    { value: "closed_win", label: "TP4", icon: Icon.trophy, accent: 'emerald' },
    { value: "closed_loss", label: "Loss", icon: Icon.x, accent: 'red' },
  ];

  const riskOptions = [
    { value: "all", label: "All" },
    { value: "low", label: "Low", dotColor: 'bg-emerald-400' },
    { value: "normal", label: "Normal", dotColor: 'bg-amber-400' },
    { value: "high", label: "High", dotColor: 'bg-red-400' },
  ];

  const sortOptions = [
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
    { value: "verdict", label: "Verdict (Worth/Avoid)" },
    { value: "market_cap", label: "Market Cap" },
    { value: "volume", label: "Volume 24H" },
  ];

  return (
    <div className="space-y-6 pb-10">
      {/* PAGE HEADER — reworded: feature name is the H1, "last 7 days" is the descriptor */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-3">
            <span className="h-px w-8 bg-gold-primary/40" />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">Terminal Signals</span>
            <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/40 via-white/[0.06] to-transparent" />
          </div>
          <h1 className="font-display text-2xl lg:text-3xl font-normal text-text-primary tracking-tight">Potential Trades</h1>
          <p className="font-mono text-[10px] uppercase tracking-wider text-text-primary/70 mt-1.5">
            Last 7 days
            <span className="mx-2 text-text-primary/30">·</span>
            <span className="text-text-primary tabular-nums">{allSignals.length}</span> signals
            {updatedCount > 0 && (
              <>
                <span className="mx-2 text-text-primary/30">·</span>
                <span className="text-gold-primary tabular-nums">{updatedCount}</span> recently updated
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Open the LuxQuant Terminal (visualizations) carrying current filters */}
          <button
            onClick={goTerminal}
            title="Visualize the current (filtered) signals in the Terminal"
            className="group flex items-center gap-2 bg-gold-primary/[0.08] hover:bg-gold-primary/[0.15] border border-gold-primary/30 hover:border-gold-primary/50 px-3.5 py-1.5 rounded-full transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-gold-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="8" height="10" rx="1" /><rect x="13" y="3" width="8" height="6" rx="1" /><rect x="13" y="11" width="8" height="10" rx="1" /><rect x="3" y="15" width="8" height="6" rx="1" />
            </svg>
            <span className="font-mono text-[10px] uppercase tracking-wider text-gold-primary">Terminal</span>
          </button>

          <div className="flex items-center gap-2 bg-white/[0.03] px-3 py-1.5 rounded-full">
            <span className="relative flex h-1.5 w-1.5">
              {!loading && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              )}
              <span
                className="relative inline-flex h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: loading ? '#fbbf24' : '#10b981' }}
              />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-primary/55">
              {loading
                ? 'Syncing'
                : lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`
                : 'Ready'}
            </span>
          </div>
        </div>
      </div>

      {/* BTC COMPASS SNAPSHOT — 24h read + trade geometry + shortcuts to AI Research */}
      <CompassSnapshot />

      {/* PERFORMANCE STATS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Today's Activity"
          value={todayStats.total}
          sub={`${todayStats.open} open · ${todayStats.wins}W · ${todayStats.losses}L`}
        />
        <StatCard
          label="Today's Win Rate"
          value={`${todayStats.wr}%`}
          valueColor="text-emerald-400"
          sub={`${todayStats.closedCount} signals closed`}
        />
        <StatCard
          label="Overall Win Rate"
          value={stats?.win_rate ? `${stats.win_rate}%` : '—'}
          valueColor="text-amber-400"
          sub={stats ? `${(stats.total_signals || 0).toLocaleString()} total signals` : '—'}
        />
        <StatCard
          label="This Week"
          value={allSignals.length}
          sub="signals in view"
        />
      </div>

      {/* ── COIN FLOW INTENSITY — tabel tipis + data call LuxQuant, default tertutup ── */}
      {flowCoins.length > 0 && (() => {
        const findSignal = (sym) =>
          allSignals.find((s) => (s.pair || '').replace(/USDT$/i, '').toUpperCase() === String(sym).toUpperCase());
        const statusRank = (st) => {
          const s = (st || '').toLowerCase();
          if (!st) return -1;
          if (s === 'sl' || s === 'closed_loss') return 0;
          if (s === 'open') return 1;
          if (s.startsWith('tp')) return 1 + (parseInt(s.slice(2)) || 1);
          if (s === 'closed_win') return 6;
          return 1;
        };
        // enrich (signal + from-call %) lalu sort per kolom, baru slice
        const enriched = flowCoins.map((c) => {
          const sig = findSignal(c.symbol);
          const entry = sig?.entry ? Number(sig.entry) : null;
          const fromCall = (entry && c.price) ? ((c.price - entry) / entry) * 100 : null;
          return { c, sig, fromCall };
        });
        const sortVal = (x, key) => {
          switch (key) {
            case 'coin': return x.c.symbol || '';
            case 'chg': return x.c.price_change_24h ?? -Infinity;
            case 'intensity': return x.c.flow_intensity ?? -Infinity;
            case 'fromcall': return x.fromCall ?? -Infinity;
            case 'status': return x.sig ? statusRank(x.sig.status) : -Infinity;
            case 'called': return x.sig?.created_at ? new Date(x.sig.created_at).getTime() : -Infinity;
            default: return 0;
          }
        };
        const sortedFlow = [...enriched].sort((a, b) => {
          const va = sortVal(a, flowSort.key), vb = sortVal(b, flowSort.key);
          const cmp = typeof va === 'string' ? String(va).localeCompare(String(vb)) : (va - vb);
          return flowSort.dir === 'asc' ? cmp : -cmp;
        });
        const rows = sortedFlow.slice(0, flowCount);
        const maxInt = Math.max(...rows.map((r) => r.c.flow_intensity || 0), 0.0001);
        const toggleSort = (key) => setFlowSort((s) => s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' });
        const SortHead = ({ label, k, align = 'right' }) => (
          <th className={`py-2 px-2 ${align === 'left' ? 'text-left' : 'text-right'}`}>
            <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.14em] transition-colors ${flowSort.key === k ? 'text-gold-primary' : 'text-text-primary/35 hover:text-text-primary/60'} ${align === 'left' ? '' : 'flex-row-reverse'}`}>
              {label}
              <span className="text-[7px]">{flowSort.key === k ? (flowSort.dir === 'desc' ? '▼' : '▲') : '⇅'}</span>
            </button>
          </th>
        );
        const timeAgo = (iso) => {
          if (!iso) return null;
          const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
          if (m < 1) return 'now'; if (m < 60) return `${m}m ago`;
          const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
          return `${Math.floor(h / 24)}d ago`;
        };
        const fmtDT = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false }) : '—';
        const statusMeta = (st) => {
          const s = (st || '').toLowerCase();
          if (s === 'sl' || s === 'closed_loss') return { l:'SL', c:'text-red-400 border-red-500/30 bg-red-500/10' };
          if (s === 'closed_win') return { l:'WIN', c:'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
          if (s.startsWith('tp')) return { l:s.toUpperCase(), c:'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' };
          return { l:'OPEN', c:'text-blue-300 border-blue-500/30 bg-blue-500/10' };
        };
        const openCoin = (c) => { const sig = findSignal(c.symbol); if (sig) openSignal(sig); else navigate('/money-flow'); };
        return (
        <div className="mt-2.5 bg-white/[0.02] rounded-xl px-4 py-2.5">
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setFlowOpen((v) => !v)} className="group flex items-center gap-2 min-w-0">
              <svg className={`w-3.5 h-3.5 text-gold-primary/70 transition-transform ${flowOpen ? '' : '-rotate-90'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-primary/60 group-hover:text-text-primary/85 whitespace-nowrap">Coin Flow Intensity</span>
              {!flowOpen && (
                <span className="font-mono text-[9px] normal-case tracking-normal text-gold-primary/60 group-hover:text-gold-primary/90 truncate">— tap to see where money is flowing now</span>
              )}
            </button>
            <div className="flex items-center gap-2 flex-shrink-0">
              {flowOpen && (
                <div className="relative">
                  <select
                    value={flowCount}
                    onChange={(e) => setFlowCount(Number(e.target.value))}
                    className="appearance-none pl-2 pr-6 py-1 bg-surface border border-white/[0.1] rounded-md font-mono text-[10px] text-text-primary/80 focus:outline-none focus:border-gold-primary/40 cursor-pointer"
                  >
                    {[10, 20, 30, 50].map((n) => <option key={n} value={n} className="bg-surface">Top {n}</option>)}
                  </select>
                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-primary/50">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                  </span>
                </div>
              )}
              <button onClick={() => navigate('/money-flow')} className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-gold-primary/80 hover:text-gold-primary transition-colors">
                More
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>

          {flowOpen && (
            <>
              <p className="mt-2 mb-1 font-mono text-[10px] leading-relaxed text-text-primary/40 normal-case">
                <span className="text-text-primary/65">Flow intensity = 24h volume ÷ market cap</span> — how fast capital is rotating (higher = money moving in/out faster). Click a coin to open its LuxQuant call.
              </p>
              <div className="overflow-x-auto no-scrollbar -mx-1">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
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
                      const barW = Math.max(5, Math.round(((c.flow_intensity || 0) / maxInt) * 100));
                      const sm = sig ? statusMeta(sig.status) : null;
                      return (
                        <tr key={c.coin_id || c.symbol} onClick={() => openCoin(c)}
                          className="border-b border-white/[0.04] hover:bg-white/[0.03] cursor-pointer transition-colors">
                          {/* Coin */}
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              <CoinLogo pair={`${c.symbol}USDT`} size={20} />
                              <span className="font-mono text-[12px] font-semibold text-text-primary">{c.symbol}</span>
                              {c.is_luxquant_signal && <span className="font-mono text-[7.5px] uppercase tracking-wider text-gold-primary border border-gold-primary/40 rounded px-1 py-0.5 leading-none">Call</span>}
                            </div>
                          </td>
                          {/* 24h */}
                          <td className={`py-2 px-2 text-right font-mono text-[12px] tabular-nums font-semibold ${chg == null ? 'text-text-primary/40' : up ? 'text-emerald-400' : 'text-red-400'}`}>
                            {chg == null ? '—' : `${up ? '+' : ''}${chg.toFixed(2)}%`}
                          </td>
                          {/* Intensity + bar */}
                          <td className="py-2 px-2">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-14 h-1 rounded-full bg-white/[0.07] overflow-hidden hidden sm:block">
                                <div className="h-full rounded-full bg-gradient-to-r from-gold-primary/60 to-gold-primary" style={{ width: `${barW}%` }} />
                              </div>
                              <span className="font-mono text-[11px] tabular-nums text-text-primary/70 w-9 text-right">{c.flow_intensity != null ? c.flow_intensity.toFixed(2) : '—'}</span>
                            </div>
                          </td>
                          {/* From Call */}
                          <td className="py-2 px-2 text-left">
                            {fromCall != null ? (
                              <span className={`font-mono text-[11px] tabular-nums font-semibold ${fromCall >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fromCall >= 0 ? '+' : ''}{fromCall.toFixed(2)}%</span>
                            ) : <span className="text-text-primary/25 text-[11px]">—</span>}
                          </td>
                          {/* Status */}
                          <td className="py-2 px-2 text-left">
                            {sm ? <span className={`font-mono text-[8.5px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${sm.c}`}>{sm.l}</span> : <span className="text-text-primary/25 text-[11px]">—</span>}
                          </td>
                          {/* Called */}
                          <td className="py-2 px-2 text-left whitespace-nowrap">
                            {sig ? (
                              <div className="flex flex-col leading-tight">
                                <span className="font-mono text-[10px] text-text-primary/70">{fmtDT(sig.created_at)}</span>
                                <span className="font-mono text-[9px] text-text-primary/35">{timeAgo(sig.created_at)}</span>
                              </div>
                            ) : <span className="text-text-primary/25 text-[11px]">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        );
      })()}

      {/* FILTER CONSOLE */}
      <div className="bg-surface-raised rounded-md border border-white/[0.06] p-4 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

        <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 mb-3">
          <div className="flex items-center gap-2.5">
            {Icon.filter('w-3.5 h-3.5 text-gold-primary/70')}
            <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-primary">Call Filter</h2>
            <button
              onClick={() => setShowGuide(true)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-sm border border-gold-primary/30 text-gold-primary/90 hover:bg-gold-primary/10 hover:border-gold-primary/50 transition-all font-mono text-[9px] uppercase tracking-wider"
            >
              <span className="inline-flex items-center justify-center w-3 h-3 rounded-full border border-gold-primary/50 text-[8px] leading-none">?</span>
              {t('guide.button')}
            </button>
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-1 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] transition-all rounded-sm font-mono text-[10px] uppercase tracking-wider text-text-primary/70 hover:text-text-primary"
            >
              {Icon.close('w-3 h-3')}
              Reset All
            </button>
          )}
        </div>

        {/* ── TAB BAR — Watchlist + day tabs (full width, fade + panah kanan ala MEXC) ── */}
        <div className="relative edge-fade-r border-b border-white/[0.07] mb-3">
          <div ref={tabScrollRef} className="flex items-center gap-6 overflow-x-auto no-scrollbar pr-12">
            {/* Watchlist (tanpa bintang biar hemat tempat) */}
            <button
              onClick={() => setShowWatchlistOnly((v) => !v)}
              className={`flex items-center gap-1.5 whitespace-nowrap pb-3 pt-1 text-[15px] font-medium border-b-2 -mb-px transition-colors ${
                showWatchlistOnly ? 'text-gold-primary border-gold-primary' : 'text-text-primary/50 border-transparent hover:text-text-primary/80'
              }`}
            >
              Watchlist
              {watchlistIds.length > 0 && (
                <span className={`font-mono text-[12px] tabular-nums ${showWatchlistOnly ? 'text-gold-primary' : 'text-text-primary/40'}`}>{watchlistIds.length}</span>
              )}
            </button>

            {/* Day tabs — bisa pilih satu / semua */}
            {dateOptions.map((opt) => {
              const active = !showWatchlistOnly && (opt.value === 'all' ? selectedDates.length === 0 : selectedDates.includes(opt.value));
              return (
                <button
                  key={opt.value}
                  onClick={() => { setShowWatchlistOnly(false); toggleDateFilter(opt.value); }}
                  className={`flex items-center gap-1.5 whitespace-nowrap pb-3 pt-1 text-[15px] font-medium border-b-2 -mb-px transition-colors ${
                    active ? 'text-text-primary border-gold-primary' : 'text-text-primary/50 border-transparent hover:text-text-primary/80'
                  }`}
                >
                  {opt.label}
                  {opt.count != null && (
                    <span className={`font-mono text-[12px] tabular-nums ${active ? 'text-gold-primary' : 'text-text-primary/35'}`}>{opt.count}</span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Panah kanan — geser lihat hari sebelumnya (MEXC-style, di atas fade) */}
          <button
            onClick={() => tabScrollRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
            aria-label="Lihat hari sebelumnya"
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-6 h-6 text-text-primary/60 hover:text-gold-primary transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        {/* ── Controls row — search (kiri) + Called Time + order (kanan) ── */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-primary/45 pointer-events-none">
              {Icon.search('w-3.5 h-3.5')}
            </span>
            <input
              type="text"
              placeholder="Search pair (e.g. BTC, ETH, SOL)..."
              value={searchPair}
              onChange={(e) => setSearchPair(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-surface border border-white/[0.08] rounded-md text-text-primary placeholder-text-secondary/50 font-mono text-xs focus:border-gold-primary/40 focus:outline-none focus:bg-white/[0.02] transition-all"
            />
          </div>
          <div className="relative flex-shrink-0">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="pl-3 pr-8 py-2 bg-surface border border-white/[0.08] rounded-md text-text-primary font-mono text-[11px] focus:border-gold-primary/40 focus:outline-none appearance-none cursor-pointer transition-all"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-surface">{opt.label}</option>
              ))}
            </select>
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-primary/70 pointer-events-none">
              {Icon.chevronDown('w-3 h-3')}
            </span>
          </div>
          <button
            onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-surface border border-white/[0.08] hover:border-gold-primary/30 transition-all rounded-md font-mono text-[10px] uppercase tracking-wider text-text-primary"
          >
            {sortOrder === 'desc' ? Icon.arrowDown('w-3 h-3') : Icon.arrowUp('w-3 h-3')}
            <span className="hidden sm:inline">{getOrderLabel()}</span>
          </button>
        </div>

        {/* ADVANCED FILTERS TOGGLE */}
        <div className="mt-5 pt-4 border-t border-white/[0.06]">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between gap-2 group"
            aria-expanded={advancedOpen}
          >
            <span className="flex items-center gap-2">
              <span className="text-gold-primary/70">{Icon.sliders('w-3.5 h-3.5')}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-primary/70 group-hover:text-text-primary transition-colors">
                Advanced Filters
              </span>
              {advancedActiveCount > 0 && (
                <span className="px-1.5 py-0 font-mono text-[9px] tabular-nums rounded-sm bg-gold-primary/15 text-gold-primary border border-gold-primary/30">
                  {advancedActiveCount} active
                </span>
              )}
            </span>
            <span className={`text-text-primary/70 group-hover:text-text-primary transition-all ${advancedOpen ? 'rotate-180' : ''}`}>
              {Icon.chevronDown('w-3.5 h-3.5')}
            </span>
          </button>
        </div>

        {/* ACTIVE FILTER CHIPS — tetap terlihat & bisa dihapus per-item walau panel ditutup */}
        {!advancedOpen && advancedActiveCount > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-text-primary/40 mr-0.5">Active</span>
            {[
              statusFilter !== 'all' && { label: `Status: ${statusFilter}`, clear: () => setStatusFilter('all') },
              riskFilter !== 'all' && { label: `Risk: ${riskFilter}`, clear: () => setRiskFilter('all') },
              streakFilter !== 'all' && { label: 'Hot streak', clear: () => setStreakFilter('all') },
              verdictFilter !== 'all' && { label: `Verdict: ${verdictFilter.replace(/_/g, ' ')}`, clear: () => setVerdictFilter('all') },
              corrDecoupled && { label: 'BTC decoupled', clear: () => setCorrDecoupled(false) },
              corrHighAlign && { label: 'BTC aligned', clear: () => setCorrHighAlign(false) },
              ...selectedTags.map((tag) => ({ label: tag, clear: () => toggleTag(tag) })),
            ].filter(Boolean).map((chip, i) => (
              <button
                key={i}
                onClick={chip.clear}
                className="group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md bg-gold-primary/10 border border-gold-primary/30 text-gold-primary font-mono text-[9px] uppercase tracking-wider hover:bg-gold-primary/20 transition-all"
              >
                <span>{chip.label}</span>
                <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gold-primary/15 group-hover:bg-gold-primary/30 leading-none">×</span>
              </button>
            ))}
          </div>
        )}

        {/* ADVANCED FILTERS BODY — collapsed by default */}
        {advancedOpen && (
          <div className="mt-4 space-y-5 animate-slideDown">
            {/* Status + Risk */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Status */}
              <div className="lg:col-span-8">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-text-primary/70">Signal Status</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {statusOptions.map((opt) => {
                    const isActive = statusFilter === opt.value;
                    const accentColor =
                      opt.accent === 'emerald' ? 'text-emerald-400' :
                      opt.accent === 'red' ? 'text-red-400' :
                      opt.accent === 'gold' ? 'text-gold-primary' :
                      'text-text-primary/70';
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setStatusFilter(opt.value);
                          if (opt.value === "updated" && sortBy === "created_at") setSortBy("last_update");
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                          isActive
                            ? 'bg-white/10 border border-white/[0.08] text-text-primary'
                            : 'bg-white/[0.03] border border-transparent text-text-primary/70 hover:bg-white/[0.06] hover:text-text-primary'
                        }`}
                      >
                        {opt.icon && <span className={isActive ? accentColor : 'opacity-70'}>{opt.icon('w-3 h-3')}</span>}
                        <span>{opt.label}</span>
                        {opt.value === "updated" && updatedCount > 0 && !isActive && (
                          <span className="px-1 py-0 bg-gold-primary/10 text-gold-primary text-[9px] tabular-nums rounded-sm">
                            {updatedCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Risk */}
              <div className="lg:col-span-4 lg:border-l lg:border-white/[0.06] lg:pl-5">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-text-primary/70">Risk Profile</span>
                </div>
                <div className="flex bg-white/[0.02] border border-white/[0.06] rounded-sm p-0.5">
                  {riskOptions.map((opt) => {
                    const isActive = riskFilter === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setRiskFilter(opt.value)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                          isActive
                            ? 'bg-white/10 text-text-primary'
                            : 'text-text-primary/70 hover:text-text-primary hover:bg-white/[0.03]'
                        }`}
                      >
                        {opt.dotColor && (
                          <span className={`w-1.5 h-1.5 rounded-full ${opt.dotColor} ${isActive ? '' : 'opacity-50'}`} />
                        )}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Intelligence Filters */}
            <div className="pt-5 border-t border-white/[0.06]">
              <div className="flex items-center justify-between mb-2.5">
                <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-primary/70">Intelligence Filters<InfoTip side="bottom" title={t('guide.sec_intel')} text={t('guide.worth_d')} /></span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-text-primary/40">powered by coin intelligence</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setStreakFilter(streakFilter === "hot" ? "all" : "hot")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                    streakFilter === "hot"
                      ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400'
                      : 'bg-white/[0.03] border border-transparent text-text-primary/70 hover:bg-white/[0.06] hover:text-text-primary'
                  }`}
                >
                  <span className={streakFilter === "hot" ? 'text-emerald-400' : 'opacity-70'}>{Icon.flame('w-3 h-3')}</span>
                  <span>High Win Streak</span>
                  <span className="font-mono text-[9px] normal-case tracking-normal opacity-70">≥{HOT_STREAK_MIN}</span>
                  {hotStreakCount > 0 && streakFilter !== "hot" && (
                    <span className="px-1 py-0 bg-emerald-500/10 text-emerald-400 text-[9px] tabular-nums rounded-sm">
                      {hotStreakCount}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setCorrDecoupled((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                    corrDecoupled
                      ? 'bg-purple-500/15 border border-purple-500/40 text-purple-400'
                      : 'bg-white/[0.03] border border-transparent text-text-primary/70 hover:bg-white/[0.06] hover:text-text-primary'
                  }`}
                >
                  <span className={corrDecoupled ? 'text-purple-400' : 'opacity-70'}>{Icon.zap('w-3 h-3')}</span>
                  <span>Decoupled from BTC</span>
                  {corrCounts.dec > 0 && !corrDecoupled && (
                    <span className="px-1 py-0 bg-purple-500/10 text-purple-400 text-[9px] tabular-nums rounded-sm">
                      {corrCounts.dec}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setCorrHighAlign((v) => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                    corrHighAlign
                      ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400'
                      : 'bg-white/[0.03] border border-transparent text-text-primary/70 hover:bg-white/[0.06] hover:text-text-primary'
                  }`}
                >
                  <span className={corrHighAlign ? 'text-emerald-400' : 'opacity-70'}>{Icon.target('w-3 h-3')}</span>
                  <span>High BTC Alignment</span>
                  <span className="font-mono text-[9px] normal-case tracking-normal opacity-70">≥70</span>
                  {corrCounts.hi > 0 && !corrHighAlign && (
                    <span className="px-1 py-0 bg-emerald-500/10 text-emerald-400 text-[9px] tabular-nums rounded-sm">
                      {corrCounts.hi}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setVerdictFilter(verdictFilter === "worth_it" ? "all" : "worth_it")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                    verdictFilter === "worth_it"
                      ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-400'
                      : 'bg-white/[0.03] border border-transparent text-text-primary/70 hover:bg-white/[0.06] hover:text-text-primary'
                  }`}
                >
                  <span className={verdictFilter === "worth_it" ? 'text-emerald-400' : 'opacity-70'}>✓</span>
                  <span>Worth It</span>
                  {verdictCounts.worth > 0 && verdictFilter !== "worth_it" && (
                    <span className="px-1 py-0 bg-emerald-500/10 text-emerald-400 text-[9px] tabular-nums rounded-sm">
                      {verdictCounts.worth}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setVerdictFilter(verdictFilter === "avoid" ? "all" : "avoid")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                    verdictFilter === "avoid"
                      ? 'bg-red-500/15 border border-red-500/40 text-red-400'
                      : 'bg-white/[0.03] border border-transparent text-text-primary/70 hover:bg-white/[0.06] hover:text-text-primary'
                  }`}
                >
                  <span className={verdictFilter === "avoid" ? 'text-red-400' : 'opacity-70'}>⛔</span>
                  <span>Avoid</span>
                  {verdictCounts.avoid > 0 && verdictFilter !== "avoid" && (
                    <span className="px-1 py-0 bg-red-500/10 text-red-400 text-[9px] tabular-nums rounded-sm">
                      {verdictCounts.avoid}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Pattern Filters */}
            {sortedTagsForChips.length > 0 && (
              <div className="pt-5 border-t border-white/[0.06]">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-primary/70">Pattern Filters<InfoTip side="bottom" title={t('guide.pattern_t')} text={t('guide.pattern_d')} /></span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-text-primary/40">historical win rate · descriptive</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(() => {
                    const present = sortedTagsForChips.filter((t) => (tagActiveCount[t.tag] || 0) > 0 || selectedTags.includes(t.tag));
                    const shown = showAllTags ? present : present.slice(0, 10);
                    return shown;
                  })().map((t) => {
                    const active = selectedTags.includes(t.tag);
                    const cnt = tagActiveCount[t.tag] || 0;
                    const wrCol = t.win_rate >= 88 ? 'text-emerald-400' : t.win_rate >= 82 ? 'text-amber-400' : 'text-text-primary/70';
                    return (
                      <button
                        key={t.tag}
                        onClick={() => toggleTag(t.tag)}
                        title={`${t.win_rate}% historical win rate · n=${t.n} · ${cnt} active now`}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                          active
                            ? 'bg-gold-primary/15 border border-gold-primary/40 text-gold-primary'
                            : 'bg-white/[0.03] border border-transparent text-text-primary/70 hover:bg-white/[0.06] hover:text-text-primary'
                        }`}
                      >
                        <span className="normal-case">{t.tag.replace(/_/g, ' ').toLowerCase()}</span>
                        <span className={`tabular-nums ${active ? 'text-gold-primary' : wrCol}`}>{t.win_rate}%</span>
                        {cnt > 0 && (
                          <span className={`px-1 py-0 text-[9px] tabular-nums rounded-sm ${active ? 'bg-gold-primary/20 text-gold-primary' : 'bg-white/[0.06] text-text-primary/70'}`}>
                            {cnt}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {(() => {
                    const presentCount = sortedTagsForChips.filter((t) => (tagActiveCount[t.tag] || 0) > 0).length;
                    if (presentCount <= 10) return null;
                    return (
                      <button
                        onClick={() => setShowAllTags((v) => !v)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider bg-white/[0.02] border border-white/[0.08] text-text-primary/70 hover:text-text-primary hover:border-white/[0.15] transition-all"
                      >
                        {showAllTags ? 'Show less' : `Show all (${presentCount})`}
                      </button>
                    );
                  })()}
                </div>
                <p className="font-mono text-[9px] text-text-primary/45 mt-2 normal-case tracking-normal leading-relaxed">
                  Win rate of resolved signals that carried each tag. Tags overlap and describe entry conditions — not a standalone buy trigger.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* BTC Dominance Alert — self-contained (has its own expand) */}
      <BtcDomAlert allSignals={allSignals} onSignalClick={(sig) => openSignal(sig)} />

      {/* ERROR / TABLE */}
      {error && (
        <div className="bg-surface-raised rounded-md p-6 border border-red-500/30 text-center relative overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-500/[0.06] border border-red-500/20 flex items-center justify-center text-red-400">
              {Icon.alert('w-5 h-5')}
            </div>
            <h3 className="font-mono text-sm text-text-primary">Failed to load signals</h3>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-primary/70">{error}</p>
            <button
              onClick={() => fetchBulkSignals(true)}
              className="px-4 py-2 mt-1 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30 transition-all rounded-sm font-mono text-[10px] uppercase tracking-wider"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {!error && (
        <SignalsTable
          signals={signals}
          loading={loading}
          onRowClick={(sig) => openSignal(sig)}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onPricesUpdate={handlePricesUpdate}
          allPairs={allPairs}
          coinIntel={coinIntel}
          verdictByPair={verdictByPair}
          currentFlow={currentFlow}
          tagWrMap={tagWrMap}
          signalTags={signalTags}
          onWatchlistChange={(signalId, newState) => {
            // optimistic badge
            setWatchlistIds((prev) =>
              newState ? [...new Set([...prev, signalId])] : prev.filter((id) => id !== signalId)
            );
            if (!newState) setWatchlistSignals((prev) => prev.filter((s) => s.signal_id !== signalId));
            // sync objek sinyal penuh (buat item baru yang di-star)
            refreshWatchlist();
          }}
        />
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