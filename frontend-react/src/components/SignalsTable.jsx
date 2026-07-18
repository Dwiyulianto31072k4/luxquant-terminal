import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import CoinLogo from "./CoinLogo";
import StarButton from "./StarButton";
import { useAuth } from "../context/AuthContext";
import { watchlistApi } from "../services/watchlistApi";
import { classifyCoin, CoinDetailModal } from "./coinIntelShared";
import { InfoTip } from "./GuideInfo";
import { Ic } from "./signalIcons";
import { shareSignal } from "../services/shareSignal";
import { ShimmerStyles } from "./ui/Loaders";

const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * SignalsTable — Full Original + Strong Color Fix (emerald-400 & red-400)
 * Tidak ada yang dihapus. Hanya warna yang diubah.
 *
 * ROUTING FIX (NEW):
 * - SignalsTable used to own its OWN `selectedSignal` state and render its OWN
 * <SignalModal>, completely independent from the one in SignalsPage. That
 * meant the `onRowClick` prop passed down from the parent was silently
 * ignored, two separate modal instances existed, and `onSwitchSignal` (used
 * by the History tab) only worked on the parent's instance — which almost
 * never opened via normal row clicks.
 * - Fixed: this component no longer owns any modal state. Every place that
 * used to call its local `setSelectedSignal(signal)` now calls the
 * `onRowClick` prop instead, so SignalsPage (URL-driven via useSearchParams)
 * is the single source of truth for which signal/tab is open.
 *
 * COLUMN PICKER:
 * - User bisa pilih kolom mana yang ditampilkan di tabel desktop lewat tombol
 * "Columns" di kanan atas. Preferensi disimpan di localStorage, jadi pilihan
 * user persist antar-sesi. Kolom Star + Pair selalu tampil (identitas baris).
 * - Mobile tetap pakai card layout (semua field ringkas), jadi picker hanya
 * relevan & aktif di desktop table.
 * - Set kolom dibuat sebagai registry (SIGNAL_COLUMNS) supaya nambah kolom baru
 * (mis. BTC Correlation / Win Streak) cukup tambah 1 entri + 1 header + 1 sel.
 *
 * VOLUME SORT FIX:
 * - Prices/volume are now fetched for ALL pairs (via `allPairs` prop), not just
 * the current page. Sorting by volume therefore has data for every row.
 * - The accumulated price map is MERGED (never replaced), so navigating pages or
 * the 15s refresh never blanks out previously-fetched pairs → no reshuffle.
 *
 * PRICE/PNL REGRESSION FIX:
 * - The browser CANNOT reach api.bybit.com directly in many regions (e.g. ID
 * returns net::ERR_CONNECTION_REFUSED). So we fetch through the BACKEND PROXY
 * (server-side on the VPS, which can reach Bybit + has .com/.id fallback),
 * chunked to avoid HTTP 414 on large symbol sets. Direct Bybit is last-resort.
 */

// ================================================================
// COLUMN REGISTRY — toggleable columns (Star + Pair always shown)
// To add a new column later (e.g. BTC Correlation / Win Streak):
// 1) add an entry here, 2) add its <SortableHeader> + <td> in the table,
// both wrapped in {visibleCols.<key> && (...)}.
// ================================================================
const SIGNAL_COLUMNS = [
  { key: "current_price", label: "Price" },
  { key: "entry", label: "Entry" },
  { key: "max_target", label: "Target" },
  { key: "stop_loss", label: "Stop Loss" },
  { key: "risk_level", label: "Risk" },
  { key: "market_cap", label: "MCap" },
  { key: "volume", label: "Vol 24h" },
  { key: "track_record", label: "Track Record" },
  { key: "btc_corr", label: "BTC Corr" },
  { key: "verdict", label: "Verdict" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Called Time" },
];

const COLS_STORAGE_KEY = "lq:signals:visible-cols";

const defaultVisibleCols = () =>
  SIGNAL_COLUMNS.reduce((acc, c) => {
    acc[c.key] = true;
    return acc;
  }, {});

// Load saved prefs, merged over defaults so any newly-added column defaults to
// visible (and corrupt/missing storage falls back gracefully).
const loadVisibleCols = () => {
  const defaults = defaultVisibleCols();
  try {
    const raw = localStorage.getItem(COLS_STORAGE_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return defaults;
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
};

// ================================================================
// COLUMNS MENU — dropdown of checkboxes to toggle visible columns
// ================================================================
const ColumnsMenu = ({ visibleCols, onToggle, onReset }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const visibleCount = SIGNAL_COLUMNS.filter((c) => visibleCols[c.key]).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised border border-ink/[0.08] hover:border-ink/12 transition-all rounded-sm font-mono text-[10px] uppercase tracking-wider text-text-primary/75 hover:text-text-primary"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="18" rx="1" />
          <rect x="14" y="3" width="7" height="18" rx="1" />
        </svg>
        <span>Columns</span>
        <span className="text-text-primary/45 tabular-nums">
          {visibleCount}/{SIGNAL_COLUMNS.length}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 z-50 bg-surface-raised border border-ink/[0.1] rounded-md shadow-2xl overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-ink/10 to-transparent" />
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-ink/[0.06]">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-primary">
              Visible Columns
            </span>
            <button
              onClick={onReset}
              className="font-mono text-[9px] uppercase tracking-wider text-text-primary/75 hover:text-text-primary transition-colors"
            >
              Reset
            </button>
          </div>
          <div className="py-1 max-h-72 overflow-y-auto">
            {SIGNAL_COLUMNS.map((c) => {
              const active = !!visibleCols[c.key];
              const isLast = active && visibleCount === 1; // keep at least one column
              return (
                <button
                  key={c.key}
                  onClick={() => {
                    if (!isLast) onToggle(c.key);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 font-mono text-[11px] transition-colors ${
                    isLast ? "cursor-not-allowed opacity-60" : "hover:bg-ink/[0.04]"
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors ${
                      active
                        ? "bg-accent/20 border-ink/18 text-accent"
                        : "border-ink/[0.15] text-transparent"
                    }`}
                  >
                    <svg
                      className="w-2.5 h-2.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span className={active ? "text-text-primary" : "text-text-primary/75"}>
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const SignalsTable = ({
  signals,
  loading,
  page,
  totalPages,
  onPageChange,
  sortBy,
  sortOrder,
  onSort,
  onRowClick,
  onPricesUpdate,
  allPairs,
  coinIntel = {},
  verdictByPair = {},
  currentFlow = null,
  tagWrMap = {},
  signalTags = {},
  onWatchlistChange = null,
}) => {
  const { t } = useTranslation();

  const [expandedCards, setExpandedCards] = useState({}); // mobile card expand, keyed by signal_id (survives 15s price refresh)
  const [selectedCoinIntel, setSelectedCoinIntel] = useState(null); // coin object for CoinDetailModal
  const [showVerdictHint, setShowVerdictHint] = useState(false); // verdict coachmark (auto-shows on load)
  const [currentPrices, setCurrentPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesFailed, setPricesFailed] = useState(false); // true only when NO pair could be fetched at all
  const [showNotice, setShowNotice] = useState(false); // the dismissible "data unavailable" toast

  // ── Column visibility (desktop table) ──
  const [visibleCols, setVisibleCols] = useState(loadVisibleCols);

  const toggleCol = (key) => {
    setVisibleCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const resetCols = () => {
    const d = defaultVisibleCols();
    setVisibleCols(d);
    try {
      localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(d));
    } catch {
      /* ignore */
    }
  };

  // Total <th>/<td> count = Star (1) + Pair (1) + visible toggleable columns.
  // Used for the loading skeleton + empty-state colSpan so they stay aligned.
  const visibleColCount = useMemo(
    () => 2 + SIGNAL_COLUMNS.filter((c) => visibleCols[c.key]).length,
    [visibleCols]
  );

  // Density adaptif — makin banyak kolom tampil, makin rapat spacing-nya biar
  // semua kolom fit tanpa scroll; makin sedikit kolom, makin lega (breathing room).
  // Pola density-toggle ala TradingView/Notion. Dikontrol via class di <table>.
  const density = visibleColCount >= 11 ? "compact" : visibleColCount >= 8 ? "cozy" : "roomy";

  const { isAuthenticated } = useAuth();
  const [watchlistIds, setWatchlistIds] = useState([]);

  const pairsRef = useRef("");
  const intervalRef = useRef(null);
  const pricesAccumRef = useRef({}); // accumulated price map (merge target)
  const noticeShownRef = useRef(false); // ensures the notice shows at most once per mount
  const onPricesUpdateRef = useRef(onPricesUpdate);
  onPricesUpdateRef.current = onPricesUpdate;

  useEffect(() => {
    if (!isAuthenticated) return;
    watchlistApi
      .getWatchlistIds()
      .then((data) => setWatchlistIds(data.signal_ids || []))
      .catch(() => {});
  }, [isAuthenticated]);

  // Show a one-time, auto-dismissing notice ONLY when live market data totally
  // failed to load (proxy returned nothing AND direct Bybit was unreachable) —
  // the typical cause is a regional/ISP block on the global exchange.
  useEffect(() => {
    if (pricesFailed && !noticeShownRef.current) {
      noticeShownRef.current = true;
      setShowNotice(true);
      const tid = setTimeout(() => setShowNotice(false), 9000);
      return () => clearTimeout(tid);
    }
  }, [pricesFailed]);

  const handleStarToggle = (signalId, newState) => {
    setWatchlistIds((prev) =>
      newState ? [...prev, signalId] : prev.filter((id) => id !== signalId)
    );
    // Beri tahu parent (SignalsPage) supaya tab Watchlist ikut sinkron tanpa refresh.
    if (onWatchlistChange) onWatchlistChange(signalId, newState);
  };

  // Share — copied-toast keyed by signal_id so the right row/card shows it
  const [sharedId, setSharedId] = useState(null);
  const handleShareSignal = async (e, signal) => {
    if (e) e.stopPropagation();
    const res = await shareSignal(signal);
    if (res.method === "clipboard" && res.ok) {
      setSharedId(signal.signal_id);
      setTimeout(() => setSharedId((cur) => (cur === signal.signal_id ? null : cur)), 2000);
    }
  };

  // Merge a freshly-fetched map into the accumulated map and notify the parent.
  // Merge (not replace) ensures pairs fetched earlier never disappear.
  const applyMap = (newMap) => {
    const merged = { ...pricesAccumRef.current, ...newMap };
    pricesAccumRef.current = merged;
    setCurrentPrices(merged);
    if (onPricesUpdateRef.current) onPricesUpdateRef.current(merged);
  };

  useEffect(() => {
    // Prefer the full set of pairs (all signals) so volume sort has complete data.
    // Fall back to current-page pairs if allPairs wasn't provided.
    const sourcePairs =
      allPairs && allPairs.length > 0 ? allPairs : (signals || []).map((s) => s.pair);

    const uniquePairs = [...new Set(sourcePairs.filter(Boolean))].sort();
    const newKey = uniquePairs.join(",");

    if (newKey === pairsRef.current) return;
    pairsRef.current = newKey;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (uniquePairs.length === 0) return;

    const wanted = new Set(uniquePairs);

    // Fetch all requested symbols THROUGH THE BACKEND PROXY, in chunks.
    // Why proxy: the browser cannot reach api.bybit.com directly in many
    // regions (e.g. ID → net::ERR_CONNECTION_REFUSED). The proxy runs
    // server-side on the VPS, which can reach Bybit (+ has .com/.id fallback).
    // Why chunk: a single symbols= URL with hundreds of pairs blows past the
    // server URL limit (HTTP 414). 40/chunk keeps every URL short & safe.
    const fetchViaProxy = async (symbolList) => {
      const CHUNK = 40;
      const batches = [];
      for (let i = 0; i < symbolList.length; i += CHUNK) {
        batches.push(symbolList.slice(i, i + CHUNK));
      }
      const results = await Promise.allSettled(
        batches.map((b) =>
          fetch(`${API_BASE}/api/v1/market/prices?symbols=${b.join(",")}`).then((r) =>
            r.ok ? r.json() : null
          )
        )
      );
      const acc = {};
      for (const r of results) {
        if (r.status === "fulfilled" && r.value && typeof r.value === "object") {
          Object.assign(acc, r.value);
        }
      }
      return Object.keys(acc).length > 0 ? acc : null;
    };

    // Last-resort only: direct Bybit from the browser. Works where bybit.com is
    // reachable; will simply fail (and we degrade gracefully) where it isn't.
    const fromBybit = async (category) => {
      const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=${category}`);
      if (!res.ok) return null;
      const json = await res.json();
      const list = json?.result?.list || [];
      const map = {};
      for (const item of list) {
        if (wanted.has(item.symbol)) {
          map[item.symbol] = {
            price: parseFloat(item.lastPrice) || 0,
            volume: parseFloat(item.turnover24h) || 0,
          };
        }
      }
      return Object.keys(map).length > 0 ? map : null;
    };

    const fetchPrices = async () => {
      // 1) Primary: backend proxy (chunked). Server-side, region-proof.
      try {
        const proxied = await fetchViaProxy(uniquePairs);
        if (proxied) {
          applyMap(proxied);
          return;
        }
      } catch (err) {
        console.warn("[Prices] Backend proxy failed, trying Bybit direct:", err.message);
      }

      // 2) Fallback: direct Bybit linear (only where reachable from browser)
      try {
        const linear = await fromBybit("linear");
        if (linear) {
          applyMap(linear);
          return;
        }
      } catch (err2) {
        console.warn("[Prices] Bybit linear failed:", err2.message);
      }

      // 3) Fallback: direct Bybit spot
      try {
        const spot = await fromBybit("spot");
        if (spot) applyMap(spot);
      } catch (err3) {
        console.warn("[Prices] All providers failed:", err3.message);
      }
    };

    const runFetch = async () => {
      await fetchPrices();
      // "Failed" only when the WHOLE map is still empty after every provider
      // tried. Individual unlisted coins staying blank is normal, not a failure.
      setPricesFailed(Object.keys(pricesAccumRef.current).length === 0);
    };

    setPricesLoading(true);
    runFetch().finally(() => setPricesLoading(false));

    intervalRef.current = setInterval(runFetch, 15000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [allPairs, signals]);

  const getPrice = (pair) => {
    const data = currentPrices[pair];
    if (!data) return null;
    if (typeof data === "number") return data;
    return data.price ?? null;
  };

  const getVolume = (pair) => {
    const data = currentPrices[pair];
    if (!data || typeof data === "number") return null;
    return data.volume ?? null;
  };

  // Win streak from Coin Intelligence (joined by full pair, e.g. "ZKPUSDT").
  // Returns { type: 'win'|'loss', length } or null when the coin isn't flagged.
  const getStreak = (pair) => {
    const s = coinIntel?.[pair]?.current_streak;
    return s && s.length ? s : null;
  };

  // Win rate from Coin Intelligence (same join as streak).
  const getWinRate = (pair) => {
    const wr = coinIntel?.[pair]?.win_rate;
    return wr == null ? null : wr;
  };
  const wrColor = (wr) => (wr >= 70 ? "text-profit" : wr >= 50 ? "text-accent" : "text-loss");

  // BTC correlation — joined onto the row by the backend bulk-7d query.
  // Returns null when the correlation worker hasn't computed this signal yet.
  const getBtc = (signal) => {
    const score = signal?.btc_align_score;
    if (score == null) return null;
    return {
      score,
      beta: signal.btc_beta,
      corr: signal.btc_corr,
      risk: signal.btc_risk,
      decoupled: !!signal.btc_decoupled,
      extended: !!signal.btc_extended,
    };
  };
  const btcScoreColor = (s) =>
    s >= 70 ? "text-profit" : s >= 50 ? "text-accent" : "text-negative";
  const fmtSigned = (n, d = 2) => (n == null ? "—" : (n >= 0 ? "+" : "") + Number(n).toFixed(d));

  // Verdict (worth_it / avoid / neutral) for a pair, plus its coin-intel object
  // (needed to open the deep-analysis modal). Returns null when no intel exists.
  const getVerdict = (pair) => {
    const coin = coinIntel?.[pair];
    if (!coin) return null;
    const v = verdictByPair?.[pair] || classifyCoin(coin);
    return { verdict: v, coin };
  };

  // Highest-WR tag a signal carries (for the descriptive tag badge).
  // Returns { tag, wr } or null. Descriptive only — tags overlap.
  const getTopTag = (signalId) => {
    const tags = signalTags?.[signalId];
    if (!tags || tags.length === 0) return null;
    let best = null;
    for (const tg of tags) {
      const wr = tagWrMap?.[tg]?.wr;
      if (wr == null) continue;
      if (!best || wr > best.wr) best = { tag: tg, wr };
    }
    return best;
  };
  const fmtTag = (tg) => tg.replace(/_H1$/, "").replace(/_/g, " ");

  // Index of the first row (in current page) that has a non-neutral verdict —
  // the coachmark anchors to this row's verdict cell.
  const firstVerdictIdx = useMemo(() => {
    if (!signals) return -1;
    return signals.findIndex((s) => {
      const v = getVerdict(s.pair);
      return v && v.verdict !== "neutral";
    });
  }, [signals, coinIntel, verdictByPair]);

  // Auto-show the verdict coachmark whenever the table loads with verdict data
  // visible. Shows for 5s every page open (no localStorage — user asked for it
  // to appear each visit). Cleans up on unmount / dependency change.
  useEffect(() => {
    if (loading) return;
    if (!visibleCols.verdict) return;
    if (firstVerdictIdx < 0) return;
    setShowVerdictHint(true);
    const tid = setTimeout(() => setShowVerdictHint(false), 5000);
    return () => clearTimeout(tid);
  }, [loading, visibleCols.verdict, firstVerdictIdx]);

  const formatPrice = (price) => {
    if (!price && price !== 0) return "-";
    const num = parseFloat(price);
    if (isNaN(num)) return "-";
    if (num < 0.001) return num.toFixed(8);
    if (num < 1) return num.toFixed(6);
    if (num < 10) return num.toFixed(4);
    return num.toFixed(2);
  };

  const formatVolume = (vol) => {
    if (!vol) return "-";
    const num = parseFloat(vol);
    if (isNaN(num)) return "-";
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const getCoinName = (pair) => (pair ? pair.replace(/USDT$/i, "") : "");

  const calcPct = (target, entry) => {
    if (!target || !entry) return null;
    const t = parseFloat(target);
    const e = parseFloat(entry);
    if (isNaN(t) || isNaN(e) || e === 0) return null;
    return ((t - e) / e) * 100;
  };

  const getMaxTarget = (signal) => {
    const targets = [signal.target4, signal.target3, signal.target2, signal.target1].filter(
      Boolean
    );
    return targets.length > 0 ? Math.max(...targets.map(Number)) : null;
  };

  const getPriceChange = (entry, current) => {
    if (!entry || !current) return null;
    return ((current - entry) / entry) * 100;
  };

  // ==================== WARNA KUAT (emerald & red) ====================
  const getRiskClasses = (risk) => {
    const r = risk?.toLowerCase() || "";
    if (r.startsWith("low")) return "bg-profit/10 text-profit border-profit/25";
    if (r.startsWith("high")) return "bg-negative/10 text-loss border-negative/30";
    return "bg-accent/10 text-accent border-accent/30";
  };

  const getRiskLabel = (risk) => {
    const r = risk?.toLowerCase() || "";
    if (r.startsWith("low")) return "Low";
    if (r.startsWith("med") || r.startsWith("nor")) return "Normal";
    if (r.startsWith("high")) return "High";
    return risk || "-";
  };

  const formatMarketCap = (mcap) => {
    if (!mcap) return "-";
    if (typeof mcap === "string" && /[BMKTbmkt]/.test(mcap)) return mcap;
    const num = parseFloat(mcap);
    if (isNaN(num)) return mcap;
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const getStatusBadge = (status) => {
    const s = status?.toLowerCase() || "";
    let cls, label;

    if (s === "open") {
      cls = "bg-accent/10 text-accent border-accent/30";
      label = "OPEN";
    } else if (s === "closed_loss" || s === "sl") {
      cls = "bg-negative/10 text-loss border-negative/30";
      label = "LOSS";
    } else if (s === "closed_win") {
      cls = "bg-profit/10 text-profit border-profit/25";
      label = "WIN";
    } else if (s.startsWith("tp")) {
      cls = "bg-profit/10 text-profit border-profit/25";
      label = s.toUpperCase();
    } else {
      cls = "bg-ink/[0.04] text-text-primary/75 border-ink/[0.06]";
      label = status || "-";
    }
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 border font-mono text-[10px] uppercase tracking-wider rounded-sm ${cls}`}
      >
        {label}
      </span>
    );
  };

  const formatDateTimeShort = (dt) => {
    if (!dt) return "-";
    const d = new Date(dt);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  const getUpdateTypeBadge = (updateType) => {
    if (!updateType) return null;
    const ut = updateType.toLowerCase();
    const isLoss = ut === "sl" || ut === "sl1" || ut === "sl2";
    const label = isLoss ? "Hit SL" : `Hit ${ut.toUpperCase()}`;
    return (
      <span
        className={`font-mono text-[10px] uppercase tracking-wider ${isLoss ? "text-loss" : "text-profit"}`}
      >
        {label}
      </span>
    );
  };

  const formatTimeAgo = (dt) => {
    if (!dt) return "";
    const now = new Date();
    const d = new Date(dt);
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDateTimeShort(dt);
  };

  const SortableHeader = ({ field, label, align = "left" }) => {
    const isActive = sortBy === field;
    const textAlign =
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
    const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "";
    return (
      <th
        className={`py-3 px-4 font-mono text-[10px] font-medium uppercase tracking-[0.18em] cursor-pointer transition-colors select-none ${textAlign} ${
          isActive ? "text-text-primary" : "text-text-primary/50 hover:text-text-primary/80"
        }`}
        onClick={() => onSort && onSort(field)}
      >
        <span className={`group flex items-center gap-1.5 ${justify}`}>
          <span>{label}</span>
          <svg
            className={`w-3 h-3 transition-all ${isActive ? "opacity-100 text-accent" : "opacity-40 group-hover:opacity-70"}`}
            style={{ transform: isActive && sortOrder === "asc" ? "rotate(180deg)" : "none" }}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M17.6569 16.2427L19.0711 14.8285L12.0001 7.75739L4.92896 14.8285L6.34317 16.2427L12.0001 10.5858L17.6569 16.2427Z" />
          </svg>
        </span>
      </th>
    );
  };

  const EmptyStateIcon = () => (
    <svg
      className="w-8 h-8 text-text-primary/30"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );

  const MobileSignalCard = ({ signal }) => {
    const currentPrice = getPrice(signal.pair);
    const currentVol = getVolume(signal.pair);
    const priceChange = getPriceChange(signal.entry, currentPrice);
    const open = !!expandedCards[signal.signal_id];
    const toggle = () =>
      setExpandedCards((p) => ({ ...p, [signal.signal_id]: !p[signal.signal_id] }));
    const v = getVerdict(signal.pair);
    const wr = getWinRate(signal.pair);
    const streak = getStreak(signal.pair);
    const topTag = getTopTag(signal.signal_id);
    const btc = getBtc(signal);
    const maxTarget = getMaxTarget(signal);
    const potentialPct = maxTarget != null ? calcPct(maxTarget, signal.entry) : null;

    return (
      <div className="relative bg-surface-raised rounded-md border border-ink/[0.06] overflow-hidden transition-all hover:border-ink/12">
        <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />

        {/* COLLAPSED — overview, tap to expand */}
        <div className="flex items-center gap-2.5 p-3">
          <button
            onClick={toggle}
            aria-expanded={open}
            className="flex flex-1 items-center gap-2.5 min-w-0 text-left"
          >
            <CoinLogo pair={signal.pair} size={30} />
            <div className="min-w-0 flex-1">
              {/* line 1 — identity */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-text-primary font-mono text-sm tracking-wide">
                  {getCoinName(signal.pair)}
                </span>
                <span className="text-text-primary/45 text-[10px] font-mono">USDT</span>
                {getStatusBadge(signal.status)}
              </div>
              {/* line 2 — trade levels: entry -> max target + potential */}
              <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] flex-wrap">
                <span className="text-text-primary/45">E</span>
                <span className="text-text-primary/85 tabular-nums">
                  {formatPrice(signal.entry)}
                </span>
                {maxTarget != null ? (
                  <>
                    <span className="text-text-primary/30">→</span>
                    <span className="text-profit tabular-nums">{formatPrice(maxTarget)}</span>
                    {potentialPct != null ? (
                      <span className="text-profit font-medium tabular-nums">
                        +{potentialPct.toFixed(1)}%
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
              {/* line 3 — live + quality cue */}
              <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] flex-wrap">
                {priceChange !== null ? (
                  <span
                    className={`tabular-nums font-medium ${priceChange >= 0 ? "text-profit" : "text-loss"}`}
                  >
                    {priceChange >= 0 ? "+" : ""}
                    {priceChange.toFixed(2)}%
                  </span>
                ) : (
                  <span className="text-text-primary/40">—</span>
                )}
                {currentPrice ? (
                  <span className="text-text-primary/45 tabular-nums">
                    now {formatPrice(currentPrice)}
                  </span>
                ) : null}
                {v && v.verdict !== "neutral" ? (
                  <span
                    className={`px-1.5 py-0.5 border rounded-sm text-[9px] uppercase tracking-wider ${v.verdict === "avoid" ? "bg-negative/10 text-loss border-negative/30" : "bg-profit/10 text-profit border-profit/25"}`}
                  >
                    {v.verdict === "avoid" ? "Avoid" : "Worth"}
                    {v.coin.risk_score != null ? ` ${v.coin.risk_score}` : ""}
                  </span>
                ) : wr != null ? (
                  <span
                    className={`px-1.5 py-0.5 border rounded-sm text-[9px] tabular-nums ${wr >= 70 ? "bg-profit/10 text-profit border-profit/25" : wr >= 50 ? "bg-accent/10 text-accent border-accent/30" : "bg-negative/10 text-loss border-negative/30"}`}
                  >
                    {wr}%
                  </span>
                ) : null}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-1 flex-shrink-0">
            <div onClick={(e) => e.stopPropagation()}>
              <StarButton
                signalId={signal.signal_id}
                isStarred={watchlistIds.includes(signal.signal_id)}
                onToggle={handleStarToggle}
              />
            </div>
            <button
              onClick={toggle}
              aria-label={open ? "Collapse" : "Expand"}
              className="w-8 h-8 flex items-center justify-center text-text-primary/50 hover:text-text-primary"
            >
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>
        </div>

        {/* EXPANDED — detail + open full signal */}
        {open ? (
          <div className="border-t border-ink/[0.06] p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`px-2 py-0.5 border font-mono text-[9px] uppercase tracking-wider rounded-sm ${getRiskClasses(signal.risk_level)}`}
              >
                {getRiskLabel(signal.risk_level)}
              </span>
              {wr != null ? (
                <span
                  className={`px-2 py-0.5 border font-mono text-[9px] uppercase tracking-wider rounded-sm ${wr >= 70 ? "bg-profit/10 text-profit border-profit/25" : wr >= 50 ? "bg-accent/10 text-accent border-accent/30" : "bg-negative/10 text-loss border-negative/30"}`}
                >
                  {wr}%
                </span>
              ) : null}
              {streak ? (
                <span
                  className={`px-2 py-0.5 border font-mono text-[9px] uppercase tracking-wider rounded-sm ${streak.type === "win" ? "bg-profit/10 text-profit border-profit/25" : "bg-negative/10 text-loss border-negative/30"}`}
                >
                  {streak.length}
                  {streak.type === "win" ? "W" : "L"}
                </span>
              ) : null}
              {topTag ? (
                <span
                  title={`${fmtTag(topTag.tag)}: ${topTag.wr}% historical win rate when present`}
                  className="px-2 py-0.5 border font-mono text-[9px] uppercase tracking-wider rounded-sm bg-accent/12 text-accent border-ink/12 normal-case max-w-[160px] truncate"
                >
                  {fmtTag(topTag.tag).toLowerCase()} {topTag.wr}%
                </span>
              ) : null}
            </div>

            {signal.last_update_at ? (
              <div className="flex items-center justify-between px-3 py-2 bg-ink/[0.02] border border-ink/[0.06] rounded-sm">
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-accent/60" />
                  {getUpdateTypeBadge(signal.last_update_type)}
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-primary/45">
                  {formatTimeAgo(signal.last_update_at)}
                </span>
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2 bg-ink/[0.02] border border-ink/[0.06] p-3 rounded-sm">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-wider text-text-primary/45 mb-1">
                  Entry
                </p>
                <p className="text-text-primary font-mono text-[12px] tabular-nums font-medium">
                  {formatPrice(signal.entry)}
                </p>
              </div>
              <div className="text-center border-x border-ink/[0.04]">
                <p className="font-mono text-[9px] uppercase tracking-wider text-text-primary/45 mb-1">
                  Current
                </p>
                {currentPrice ? (
                  <p
                    className={`font-mono text-[12px] tabular-nums font-medium ${priceChange !== null ? (priceChange >= 0 ? "text-profit" : "text-loss") : "text-text-primary"}`}
                  >
                    {formatPrice(currentPrice)}
                  </p>
                ) : (
                  <p className="text-text-primary/30 text-[12px]">-</p>
                )}
              </div>
              <div className="text-right">
                <p className="font-mono text-[9px] uppercase tracking-wider text-text-primary/45 mb-1">
                  P&amp;L
                </p>
                {priceChange !== null ? (
                  <p
                    className={`font-mono text-[12px] tabular-nums font-medium ${priceChange >= 0 ? "text-profit" : "text-loss"}`}
                  >
                    {priceChange >= 0 ? "+" : ""}
                    {priceChange.toFixed(2)}%
                  </p>
                ) : (
                  <p className="text-text-primary/30 text-[12px]">-</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: "TP1", value: signal.target1 },
                { label: "TP2", value: signal.target2 },
                { label: "TP3", value: signal.target3 },
                { label: "TP4", value: signal.target4 },
              ].map((tp, i) => {
                const pct = tp.value ? calcPct(tp.value, signal.entry) : null;
                return (
                  <div
                    key={i}
                    className="text-center bg-ink/[0.015] border border-ink/[0.06] py-1.5 px-1 rounded-sm"
                  >
                    <p className="font-mono text-[8px] uppercase tracking-wider text-text-primary/45">
                      {tp.label}
                    </p>
                    <p className="text-text-primary/75 font-mono text-[10px] mt-0.5 tabular-nums font-medium">
                      {tp.value ? formatPrice(tp.value) : "—"}
                    </p>
                    {pct != null ? (
                      <p className="text-profit/70 font-mono text-[8px] tabular-nums mt-0.5">
                        +{pct.toFixed(1)}%
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] font-mono flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                {signal.market_cap ? (
                  <span className="text-text-primary/45">
                    MC{" "}
                    <span className="text-text-primary/75">
                      {formatMarketCap(signal.market_cap)}
                    </span>
                  </span>
                ) : null}
                {currentVol ? (
                  <span className="text-text-primary/45">
                    Vol <span className="text-text-primary/75">{formatVolume(currentVol)}</span>
                  </span>
                ) : signal.volume_rank_num && signal.volume_rank_den ? (
                  <span className="text-text-primary/45">
                    Vol{" "}
                    <span className="text-text-primary/75">
                      {signal.volume_rank_num}/{signal.volume_rank_den}
                    </span>
                  </span>
                ) : null}
                {btc ? (
                  <span className="text-text-primary/45">
                    BTC <span className={btcScoreColor(btc.score)}>{btc.score}</span>
                    {btc.decoupled ? " ⚡" : ""}
                  </span>
                ) : null}
              </div>
              <span className="text-text-primary/45">
                Called{" "}
                <span className="text-text-primary/75 tabular-nums">
                  {(() => {
                    const d = new Date(signal.created_at);
                    const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
                    const time = d.toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    });
                    return `${date}, ${time}`;
                  })()}
                </span>
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-ink/[0.06] pt-3">
              <button
                onClick={() => onRowClick && onRowClick(signal)}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent hover:text-accent"
              >
                Open full signal →
              </button>
              <div className="flex items-center gap-1.5">
                {v && v.verdict !== "neutral" ? (
                  <button
                    onClick={() => setSelectedCoinIntel(v.coin)}
                    className={`inline-flex items-center gap-1 px-2 py-1 border font-mono text-[9px] uppercase tracking-wider rounded-sm ${v.verdict === "avoid" ? "bg-negative/10 text-loss border-negative/30" : "bg-profit/10 text-profit border-profit/25"}`}
                  >
                    {v.verdict === "avoid" ? "Avoid" : "Worth"} detail
                    <svg
                      className="w-2.5 h-2.5 opacity-60"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                ) : null}
                <button
                  onClick={(e) => handleShareSignal(e, signal)}
                  title="Share signal"
                  aria-label="Share signal"
                  className="w-8 h-8 flex items-center justify-center rounded-sm text-accent hover:bg-accent/12 transition-colors"
                >
                  {sharedId === signal.signal_id
                    ? Ic.check("w-3.5 h-3.5")
                    : Ic.share("w-3.5 h-3.5")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const MobileLoadingSkeleton = () => (
    <div className="lqsk-group space-y-3">
      <ShimmerStyles />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="bg-surface-raised rounded-md p-4 border border-ink/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-ink/[0.04] rounded-full" />
              <div>
                <div className="h-3 w-16 bg-ink/[0.04] rounded mb-1.5" />
                <div className="h-2 w-10 bg-ink/[0.04] rounded" />
              </div>
            </div>
            <div className="h-5 w-16 bg-ink/[0.04] rounded-sm" />
          </div>
          <div className="h-14 w-full bg-ink/[0.03] rounded-sm mb-3" />
          <div className="h-7 w-full bg-ink/[0.03] rounded-sm mb-3" />
          <div className="h-3 w-full bg-ink/[0.03] rounded" />
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div className="lg:hidden">
        {loading ? (
          <MobileLoadingSkeleton />
        ) : signals?.length === 0 ? (
          <div className="bg-surface-raised rounded-md p-8 border border-ink/[0.06] text-center relative overflow-hidden">
            <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-accent/25 to-transparent" />
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-ink/[0.03] border border-ink/[0.06] flex items-center justify-center">
                <EmptyStateIcon />
              </div>
              <p className="text-text-primary font-mono text-sm">No signals found</p>
              <p className="text-text-primary/75 font-mono text-[10px] uppercase tracking-wider">
                Adjust your filters and try again
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal, idx) => (
              <MobileSignalCard key={signal.signal_id || idx} signal={signal} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between py-4 mt-2">
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-primary/75">
              Page {page}/{totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPageChange(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1.5 bg-ink/[0.03] border border-ink/[0.08] hover:bg-ink/[0.06] hover:border-ink/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-wider text-text-primary rounded-sm"
              >
                Prev
              </button>
              <button
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 bg-ink/[0.03] border border-ink/[0.08] hover:bg-ink/[0.06] hover:border-ink/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-wider text-text-primary rounded-sm"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="hidden lg:block w-full">
        {/* Toolbar — column picker (sits outside the overflow-hidden card so the
 dropdown isn't clipped) */}
        <div className="flex items-center justify-end mb-3">
          <ColumnsMenu visibleCols={visibleCols} onToggle={toggleCol} onReset={resetCols} />
        </div>

        {/* De-boxed list — flat rows di atas background halaman (CoinGecko/MEXC-style),
 tanpa card border. Baris dipisah hairline + hover highlight. */}
        <div className="relative">
          <style>{`
 .sig-t td, .sig-t th { transition: padding .18s ease; }
 /* compact: banyak kolom → rapat, fit tanpa scroll */
 .sig-compact td, .sig-compact th { padding: 8px 8px !important; }
 /* cozy: menengah */
 .sig-cozy td, .sig-cozy th { padding: 11px 12px !important; }
 /* roomy: sedikit kolom → lega */
 .sig-roomy td, .sig-roomy th { padding: 15px 20px !important; }

 /* ── Frozen header ───────────────────────────────────────────────
    A wide table scrolled past its header turns every number into an
    unlabelled figure. Pinned below the 64px app bar (this table is lg+ only). */
 .sig-t thead th {
   position: sticky;
   top: 64px;
   z-index: 2;
   background: rgb(var(--surface));
 }

 /* ── Frozen identity columns ─────────────────────────────────────
    With 8–12 columns you scroll sideways and lose WHICH COIN the row is.
    Star + Pair stay put so a row never becomes anonymous. Backgrounds are
    opaque (and inherited) so body content can't show through underneath. */
 .sig-t tbody tr { background: rgb(var(--surface)); }
 .sig-t tbody tr:hover { background: color-mix(in srgb, rgb(var(--ink)) 4%, rgb(var(--surface))); }
 .sig-t th:nth-child(1), .sig-t td:nth-child(1),
 .sig-t th:nth-child(2), .sig-t td:nth-child(2) {
   position: sticky;
   background: inherit;
 }
 .sig-t th:nth-child(1), .sig-t td:nth-child(1) { left: 0; z-index: 1; }
 .sig-t th:nth-child(2), .sig-t td:nth-child(2) { left: 40px; z-index: 1; }
 /* header corner cells must sit above both axes */
 .sig-t thead th:nth-child(1), .sig-t thead th:nth-child(2) { z-index: 3; }
 /* hairline marks where the frozen pane ends */
 .sig-t th:nth-child(2), .sig-t td:nth-child(2) { box-shadow: 1px 0 0 rgb(var(--ink) / 0.07); }

 /* keyboard focus must be visible now that rows are reachable by Tab */
 .sig-t tbody tr:focus-visible {
   outline: 1px solid rgb(var(--accent));
   outline-offset: -1px;
 }
 `}</style>
          <div className="overflow-x-auto">
            <table className={`sig-t sig-${density} w-full text-left whitespace-nowrap`}>
              <thead className="border-b border-ink/[0.08]">
                <tr>
                  <th className="py-3 px-4 w-10 text-center"></th>
                  <SortableHeader field="pair" label="Pair" />
                  {visibleCols.current_price && (
                    <SortableHeader field="current_price" label="Price" align="right" />
                  )}
                  {visibleCols.entry && (
                    <SortableHeader field="entry" label="Entry" align="right" />
                  )}
                  {visibleCols.max_target && (
                    <SortableHeader field="max_target" label="Target" align="right" />
                  )}
                  {visibleCols.stop_loss && (
                    <SortableHeader field="stop_loss" label="Stop Loss" align="right" />
                  )}
                  {visibleCols.risk_level && (
                    <SortableHeader field="risk_level" label="Risk" align="center" />
                  )}
                  {visibleCols.market_cap && (
                    <SortableHeader field="market_cap" label="MCap" align="right" />
                  )}
                  {visibleCols.volume && (
                    <SortableHeader field="volume" label="Vol 24h" align="right" />
                  )}
                  {visibleCols.track_record && (
                    <th className="py-3 px-4 font-mono text-[10px] font-medium uppercase tracking-[0.18em] select-none text-center">
                      <span className="flex items-center justify-center gap-1.5">
                        <InfoTip
                          side="bottom"
                          title={t("guide.track_t")}
                          text={t("guide.track_d")}
                        />
                        <button
                          onClick={() => onSort && onSort("win_rate")}
                          className={`flex items-center gap-0.5 transition-colors ${sortBy === "win_rate" ? "text-text-primary" : "text-text-primary/50 hover:text-text-primary/80"}`}
                        >
                          WR
                          <svg
                            className={`w-2.5 h-2.5 transition-all ${sortBy === "win_rate" ? "opacity-100 text-accent" : "opacity-0"}`}
                            style={{
                              transform:
                                sortBy === "win_rate" && sortOrder === "asc"
                                  ? "rotate(180deg)"
                                  : "none",
                            }}
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M17.6569 16.2427L19.0711 14.8285L12.0001 7.75739L4.92896 14.8285L6.34317 16.2427L12.0001 10.5858L17.6569 16.2427Z" />
                          </svg>
                        </button>
                        <span className="text-text-primary/25">/</span>
                        <button
                          onClick={() => onSort && onSort("win_streak")}
                          className={`flex items-center gap-0.5 transition-colors ${sortBy === "win_streak" ? "text-text-primary" : "text-text-primary/50 hover:text-text-primary/80"}`}
                        >
                          Streak
                          <svg
                            className={`w-2.5 h-2.5 transition-all ${sortBy === "win_streak" ? "opacity-100 text-accent" : "opacity-0"}`}
                            style={{
                              transform:
                                sortBy === "win_streak" && sortOrder === "asc"
                                  ? "rotate(180deg)"
                                  : "none",
                            }}
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M17.6569 16.2427L19.0711 14.8285L12.0001 7.75739L4.92896 14.8285L6.34317 16.2427L12.0001 10.5858L17.6569 16.2427Z" />
                          </svg>
                        </button>
                      </span>
                    </th>
                  )}
                  {visibleCols.btc_corr && (
                    <SortableHeader field="btc_corr" label="BTC Corr" align="center" />
                  )}
                  {visibleCols.verdict && (
                    <SortableHeader field="verdict" label="Verdict" align="center" />
                  )}
                  {visibleCols.status && (
                    <SortableHeader field="status" label="Status" align="center" />
                  )}
                  {visibleCols.created_at && (
                    <SortableHeader field="created_at" label="Called Time" align="right" />
                  )}
                  <th className="py-3 px-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i} className="border-b border-ink/[0.03]">
                      {[...Array(visibleColCount + 1)].map((_, j) => (
                        <td key={j} className="py-4 px-4">
                          <div className="h-3 bg-ink/[0.04] rounded animate-pulse"></div>
                        </td>
                      ))}
                    </tr>
                  ))
                ) : signals?.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColCount + 1} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-14 h-14 rounded-full bg-ink/[0.03] border border-ink/[0.06] flex items-center justify-center">
                          <EmptyStateIcon />
                        </div>
                        <p className="text-text-primary font-mono text-sm">No signals found</p>
                        <p className="text-text-primary/75 font-mono text-[10px] uppercase tracking-wider">
                          Adjust your filters and try again
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  signals?.map((signal, idx) => {
                    const maxTarget = getMaxTarget(signal);
                    const currentPrice = getPrice(signal.pair);
                    const currentVol = getVolume(signal.pair);
                    const priceChange = getPriceChange(signal.entry, currentPrice);

                    const currentPriceColor =
                      priceChange !== null
                        ? priceChange >= 0
                          ? "text-profit"
                          : "text-loss"
                        : "text-text-primary";

                    return (
                      <tr
                        key={signal.signal_id || idx}
                        onClick={() => onRowClick && onRowClick(signal)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick && onRowClick(signal);
                          }
                        }}
                        tabIndex={0}
                        aria-label={`Open ${signal.pair} signal`}
                        className="group cursor-pointer border-b border-ink/[0.05] transition-colors"
                      >
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <StarButton
                            signalId={signal.signal_id}
                            isStarred={watchlistIds.includes(signal.signal_id)}
                            onToggle={handleStarToggle}
                          />
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <CoinLogo pair={signal.pair} size={28} />
                            <div>
                              <p className="text-text-primary font-mono text-sm tracking-wide group-hover:text-accent transition-colors">
                                {getCoinName(signal.pair)}
                              </p>
                              <p className="text-text-primary/45 text-[10px] font-mono">USDT</p>
                            </div>
                          </div>
                        </td>

                        {visibleCols.current_price && (
                          <td className="py-3 px-4 text-right">
                            {pricesLoading && !currentPrice ? (
                              <div className="h-3 w-16 bg-ink/[0.04] rounded animate-pulse ml-auto" />
                            ) : currentPrice ? (
                              <div className="flex flex-col items-end">
                                <span
                                  className={`font-mono text-sm tabular-nums font-medium ${currentPriceColor}`}
                                >
                                  {formatPrice(currentPrice)}
                                </span>
                                {priceChange !== null && (
                                  <span
                                    className={`font-mono text-[10px] tabular-nums mt-0.5 font-medium ${priceChange >= 0 ? "text-profit" : "text-loss"}`}
                                  >
                                    {priceChange >= 0 ? "+" : ""}
                                    {priceChange.toFixed(2)}%
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-text-primary/30">-</span>
                            )}
                          </td>
                        )}

                        {visibleCols.entry && (
                          <td className="py-3 px-4 text-right">
                            <span className="text-text-primary/75 font-mono text-sm tabular-nums font-medium">
                              {formatPrice(signal.entry)}
                            </span>
                          </td>
                        )}

                        {visibleCols.max_target && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-profit font-mono text-sm tabular-nums font-medium">
                                {maxTarget ? formatPrice(maxTarget) : "-"}
                              </span>
                              {maxTarget &&
                                (() => {
                                  const pct = calcPct(maxTarget, signal.entry);
                                  return pct !== null ? (
                                    <span className="text-profit/70 font-mono text-[10px] tabular-nums mt-0.5">
                                      +{pct.toFixed(1)}%
                                    </span>
                                  ) : null;
                                })()}
                            </div>
                          </td>
                        )}

                        {visibleCols.stop_loss && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-loss font-mono text-sm tabular-nums font-medium">
                                {signal.stop1 ? formatPrice(signal.stop1) : "-"}
                              </span>
                              {signal.stop1 &&
                                (() => {
                                  const pct = calcPct(signal.stop1, signal.entry);
                                  return pct !== null ? (
                                    <span className="text-loss/70 font-mono text-[10px] tabular-nums mt-0.5">
                                      {pct.toFixed(1)}%
                                    </span>
                                  ) : null;
                                })()}
                            </div>
                          </td>
                        )}

                        {visibleCols.risk_level && (
                          <td className="py-3 px-4 text-center">
                            {(() => {
                              const rl = getRiskLabel(signal.risk_level);
                              const c = /high/i.test(rl)
                                ? "text-loss"
                                : /low/i.test(rl)
                                  ? "text-profit"
                                  : "text-accent";
                              return (
                                <span
                                  className={`font-mono text-[11px] uppercase tracking-wider font-semibold ${c}`}
                                >
                                  {rl}
                                </span>
                              );
                            })()}
                          </td>
                        )}

                        {visibleCols.market_cap && (
                          <td className="py-3 px-4 text-right">
                            {signal.market_cap ? (
                              <span className="text-text-primary/75 font-mono text-sm tabular-nums font-medium">
                                {formatMarketCap(signal.market_cap)}
                              </span>
                            ) : (
                              <span className="text-text-primary/30">-</span>
                            )}
                          </td>
                        )}

                        {visibleCols.volume && (
                          <td className="py-3 px-4 text-right">
                            {currentVol ? (
                              <span className="text-text-primary/75 font-mono text-sm tabular-nums font-medium">
                                {formatVolume(currentVol)}
                              </span>
                            ) : signal.volume_rank_num && signal.volume_rank_den ? (
                              <span className="text-text-primary/75 font-mono text-sm tabular-nums font-medium">
                                {signal.volume_rank_num}
                                <span className="text-text-primary/30">
                                  /{signal.volume_rank_den}
                                </span>
                              </span>
                            ) : (
                              <span className="text-text-primary/30">-</span>
                            )}
                          </td>
                        )}

                        {visibleCols.track_record && (
                          <td className="py-3 px-4 text-center">
                            {(() => {
                              const wr = getWinRate(signal.pair);
                              const s = getStreak(signal.pair);
                              if (wr == null && !s)
                                return <span className="text-text-primary/30 text-xs">—</span>;
                              return (
                                <div className="flex flex-col items-center">
                                  {wr != null ? (
                                    <span
                                      className={`font-mono text-sm tabular-nums font-medium ${wrColor(wr)}`}
                                    >
                                      {wr}%
                                    </span>
                                  ) : (
                                    <span className="text-text-primary/30 text-xs">—</span>
                                  )}
                                  {s && (
                                    <span
                                      className={`font-mono text-[10px] tabular-nums mt-0.5 font-medium ${s.type === "win" ? "text-profit/80" : "text-loss/80"}`}
                                    >
                                      {s.type === "win" ? "▲" : "▼"} {s.length}
                                      {s.type === "win" ? "W" : "L"}
                                    </span>
                                  )}
                                  {(() => {
                                    const tt = getTopTag(signal.signal_id);
                                    if (!tt) return null;
                                    return (
                                      <span
                                        title={`${fmtTag(tt.tag)}: ${tt.wr}% historical win rate when present`}
                                        className="font-mono text-[9px] tabular-nums mt-1 px-1.5 py-0.5 rounded-sm bg-accent/12 text-accent border border-ink/10 normal-case leading-none max-w-[120px] truncate"
                                      >
                                        {fmtTag(tt.tag).toLowerCase()} · {tt.wr}%
                                      </span>
                                    );
                                  })()}
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {visibleCols.btc_corr && (
                          <td className="py-3 px-4 text-center">
                            {(() => {
                              const b = getBtc(signal);
                              if (!b)
                                return <span className="text-text-primary/30 text-xs">—</span>;
                              return (
                                <div className="flex flex-col items-center">
                                  <div className="flex items-center gap-1">
                                    {b.decoupled && (
                                      <span
                                        className="text-accent text-[10px]"
                                        title="Decoupled from BTC"
                                      >
                                        ⚡
                                      </span>
                                    )}
                                    {b.extended && (
                                      <span
                                        className="text-accent text-[10px]"
                                        title="Extended move"
                                      >
                                        🔥
                                      </span>
                                    )}
                                    <span
                                      className={`font-mono text-sm tabular-nums font-medium ${btcScoreColor(b.score)}`}
                                    >
                                      {b.score}
                                    </span>
                                  </div>
                                  <span className="font-mono text-[10px] tabular-nums text-text-primary/45 mt-0.5">
                                    ρ{fmtSigned(b.corr)} · β{fmtSigned(b.beta)}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {visibleCols.verdict && (
                          <td
                            className="py-3 px-4 text-center relative"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(() => {
                              const v = getVerdict(signal.pair);
                              if (!v || v.verdict === "neutral")
                                return <span className="text-text-primary/30 text-xs">—</span>;
                              const isAvoid = v.verdict === "avoid";
                              const score = v.coin.risk_score ?? null;
                              const showHint = showVerdictHint && idx === firstVerdictIdx;
                              return (
                                <div className="relative inline-block">
                                  <button
                                    onClick={() => {
                                      setShowVerdictHint(false);
                                      setSelectedCoinIntel(v.coin);
                                    }}
                                    title="View deep analysis"
                                    className={`group/vd inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider transition-all hover:brightness-125 cursor-pointer ${
                                      isAvoid ? "text-loss" : "text-profit"
                                    } ${showHint ? "ring-2 ring-accent/50 ring-offset-1 ring-offset-[rgb(var(--surface-raised))] rounded-sm px-1" : ""}`}
                                  >
                                    <span>{isAvoid ? "⛔ Avoid" : "✓ Worth It"}</span>
                                    {score != null && (
                                      <span className="tabular-nums opacity-70">{score}</span>
                                    )}
                                    <svg
                                      className="w-2.5 h-2.5 opacity-50 group-hover/vd:opacity-100 group-hover/vd:translate-x-0.5 transition-all"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M9 18l6-6-6-6" />
                                    </svg>
                                  </button>

                                  {showHint && (
                                    <div className="lq-verdict-hint absolute top-full left-1/2 -translate-x-1/2 mt-2 z-40 w-60 text-left">
                                      {/* arrow */}
                                      <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-surface-raised border-l border-t border-ink/15" />
                                      <div className="relative bg-surface-raised border border-ink/15 rounded-lg shadow-2xl p-3 overflow-hidden">
                                        <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-ink/15 to-transparent" />
                                        <div className="flex items-center justify-between mb-1.5">
                                          <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                                            👆 Click for detail
                                          </span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setShowVerdictHint(false);
                                            }}
                                            className="text-text-primary/45 hover:text-text-primary"
                                            aria-label="Dismiss"
                                          >
                                            <svg
                                              className="w-3 h-3"
                                              viewBox="0 0 24 24"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            >
                                              <path d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                          </button>
                                        </div>
                                        <p className="font-mono text-[10px] leading-relaxed text-text-primary/75 normal-case tracking-normal mb-2">
                                          Full assessment based on win-rate history, streaks &amp;
                                          more.
                                        </p>
                                        <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-ink/[0.06]">
                                          <div>
                                            <p className="font-mono text-[8px] uppercase tracking-wider text-text-primary/45">
                                              Win Rate
                                            </p>
                                            <p
                                              className="font-mono text-[11px] tabular-nums"
                                              style={{
                                                color:
                                                  v.coin.win_rate >= 70
                                                    ? "#34d399"
                                                    : v.coin.win_rate >= 50
                                                      ? "#fbbf24"
                                                      : "#f87171",
                                              }}
                                            >
                                              {v.coin.win_rate}%
                                            </p>
                                          </div>
                                          <div>
                                            <p className="font-mono text-[8px] uppercase tracking-wider text-text-primary/45">
                                              Streak
                                            </p>
                                            <p
                                              className="font-mono text-[11px] tabular-nums"
                                              style={{
                                                color:
                                                  v.coin.current_streak?.type === "win"
                                                    ? "#34d399"
                                                    : "#f87171",
                                              }}
                                            >
                                              {v.coin.current_streak?.length
                                                ? `${v.coin.current_streak.length}${v.coin.current_streak.type === "win" ? "W" : "L"}`
                                                : "—"}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="font-mono text-[8px] uppercase tracking-wider text-text-primary/45">
                                              Trades
                                            </p>
                                            <p className="font-mono text-[11px] tabular-nums text-text-primary">
                                              {v.coin.closed_trades ?? "—"}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="font-mono text-[8px] uppercase tracking-wider text-text-primary/45">
                                              Avg TP
                                            </p>
                                            <p className="font-mono text-[11px] tabular-nums text-text-primary">
                                              {v.coin.avg_outcome ?? "—"}
                                            </p>
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => {
                                            setShowVerdictHint(false);
                                            setSelectedCoinIntel(v.coin);
                                          }}
                                          className="w-full mt-2.5 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider bg-accent text-accent-fg border border-ink/12 hover:bg-accent/25 transition-all"
                                        >
                                          View Detail →
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {visibleCols.status && (
                          <td className="py-3 px-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {getStatusBadge(signal.status)}
                              {signal.last_update_at && (
                                <span className="font-mono text-[9px] uppercase tracking-wider text-text-primary/40 whitespace-nowrap">
                                  {formatTimeAgo(signal.last_update_at)}
                                </span>
                              )}
                            </div>
                          </td>
                        )}

                        {visibleCols.created_at && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-text-primary/75 font-mono text-[11px] tabular-nums font-medium">
                                {(() => {
                                  const d = new Date(signal.created_at);
                                  return d.toLocaleDateString("en-GB", {
                                    day: "2-digit",
                                    month: "short",
                                  });
                                })()}
                              </span>
                              <span className="font-mono text-[10px] tabular-nums text-text-primary/45 mt-0.5 font-medium">
                                {(() => {
                                  const d = new Date(signal.created_at);
                                  return d.toLocaleTimeString("en-GB", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: false,
                                  });
                                })()}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* Share — appears on row hover (desktop) */}
                        <td
                          className="py-3 px-2 w-10 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => handleShareSignal(e, signal)}
                            title="Share signal"
                            aria-label="Share signal"
                            className={`w-7 h-7 inline-flex items-center justify-center rounded-sm transition-all text-accent hover:bg-accent/12 ${
                              sharedId === signal.signal_id ? "scale-110" : ""
                            }`}
                          >
                            {sharedId === signal.signal_id
                              ? Ic.check("w-3.5 h-3.5")
                              : Ic.share("w-3.5 h-3.5")}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-ink/[0.06] bg-ink/[0.015]">
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-primary/75">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1.5 bg-ink/[0.03] border border-ink/[0.08] hover:bg-ink/[0.06] hover:border-ink/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-wider text-text-primary rounded-sm"
                >
                  Prev
                </button>
                <button
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 bg-ink/[0.03] border border-ink/[0.08] hover:bg-ink/[0.06] hover:border-ink/[0.12] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono text-[10px] uppercase tracking-wider text-text-primary rounded-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNotice && (
        <div className="fixed bottom-4 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:max-w-md z-[60] lq-notice-in">
          <div className="relative flex items-start gap-3 bg-surface-raised border border-ink/12 rounded-md p-4 pr-10 shadow-2xl overflow-hidden">
            <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-ink/12 to-transparent" />
            <span className="absolute left-0 inset-y-0 w-0.5 bg-accent/100" />
            <div className="w-8 h-8 shrink-0 rounded-sm bg-accent/10 border border-ink/10 flex items-center justify-center text-text-muted">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-xs text-text-primary tracking-wide">
                Some market data unavailable
              </p>
              <p className="font-mono text-[11px] leading-relaxed text-text-primary/75 mt-1">
                If prices or volume aren't loading, a global crypto exchange may be blocked on your
                network or region. Connecting through a VPN usually restores live data.
              </p>
            </div>
            <button
              onClick={() => setShowNotice(false)}
              aria-label="Dismiss"
              className="absolute top-2.5 right-2.5 w-6 h-6 flex items-center justify-center rounded-sm text-text-primary/45 hover:text-text-primary hover:bg-ink/[0.06] transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <style>{`
 @keyframes lqNoticeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
 .lq-notice-in > div { animation: lqNoticeIn 0.25s ease-out; }
 @keyframes lqVerdictHintIn { from { opacity: 0; transform: translate(-50%, -4px); } to { opacity: 1; transform: translate(-50%, 0); } }
 .lq-verdict-hint { animation: lqVerdictHintIn 0.3s ease-out; }
 `}</style>
        </div>
      )}

      {selectedCoinIntel && (
        <CoinDetailModal
          coin={selectedCoinIntel}
          currentFlow={currentFlow}
          onClose={() => setSelectedCoinIntel(null)}
        />
      )}
    </>
  );
};

export default SignalsTable;
