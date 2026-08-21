import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import CoinLogo from "./CoinLogo";
import StarButton from "./StarButton";
import { useAuth } from "../context/AuthContext";
import { watchlistApi } from "../services/watchlistApi";
import { classifyCoin, getSignalVerdictInfo, CoinDetailModal } from "./coinIntelShared";
import { InfoTip } from "./GuideInfo";
import { Ic } from "./signalIcons";
import { shareSignal } from "../services/shareSignal";
import { ShimmerStyles } from "./ui/Loaders";
import SignalCompare from "./SignalCompare";

const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * SignalsTable — denser, Gate/Coinbase-style market table for signal rows.
 *
 * UX notes (redesign):
 * - Soft rounded-xl shell, hairline grid, soft status/risk/verdict pills.
 * - Frozen compare/star/pair panes so horizontal scroll never loses identity.
 * - Adaptive density (compact / cozy / roomy) from visible column count.
 * - Numbered pagination, hover-only share, column picker with localStorage.
 *
 * Architecture:
 * - Parent (SignalsPage) owns the signal modal via onRowClick / URL params.
 * - Prices via backend proxy (chunked); map is merged, never replaced.
 * - Mobile uses expandable cards; desktop uses the column-picker table.
 */

// ================================================================
// COLUMN REGISTRY — toggleable columns (Star + Pair always shown)
// To add a new column later (e.g. BTC Correlation / Win Streak):
// 1) add an entry here, 2) add its <SortableHeader> + <td> in the table,
// both wrapped in {effectiveCols.<key> && (...)}.
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
  { key: "edge_score", label: "Edge" },
  { key: "btc_corr", label: "BTC Corr" },
  { key: "verdict", label: "Verdict" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Called Time" },
];

const COLS_STORAGE_KEY = "lq:signals:visible-cols";

// What a free account sees. Deliberately short: these rows are receipts, and a
// receipt needs the price paid, the price reached, and enough liquidity context
// to believe it — not the desk's scoring apparatus.
const FREE_VISIBLE_COLS = ["entry", "max_target", "current_price", "volume"];

const freeVisibleCols = () =>
  SIGNAL_COLUMNS.reduce((acc, c) => {
    acc[c.key] = FREE_VISIBLE_COLS.includes(c.key);
    return acc;
  }, {});

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
// MOBILE CARD FIELDS — optional chips on collapsed cards (not desktop columns).
// Core always shown: pair · status · E→target · live price/%.
// Default = Telegram-simple; power users can turn extras on.
// ================================================================
const MOBILE_FIELDS = [
  { key: "verdict", label: "Verdict / WR", hint: "Worth · Avoid · win rate" },
  { key: "risk", label: "Risk", hint: "High · Medium · Low chip" },
  { key: "stop_loss", label: "Stop loss", hint: "SL next to entry path" },
  { key: "vol", label: "Volume", hint: "24h volume on the card" },
  { key: "called_time", label: "Called time", hint: "When the call went out" },
];

const MOBILE_FIELDS_KEY = "lq:signals:mobile-fields";

const defaultMobileFields = () =>
  MOBILE_FIELDS.reduce((acc, f) => {
    // Simple default: verdict only; rest off until user asks
    acc[f.key] = f.key === "verdict";
    return acc;
  }, {});

const loadMobileFields = () => {
  const defaults = defaultMobileFields();
  try {
    const raw = localStorage.getItem(MOBILE_FIELDS_KEY);
    if (!raw) return defaults;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== "object") return defaults;
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
};

// ================================================================
// MOBILE FIELDS SHEET — bottom sheet for card field toggles (lg:hidden only)
// ================================================================
const MobileFieldsSheet = ({ open, onClose, fields, onToggle, onReset, onPreset }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="lq-modal-safe fixed inset-0 z-[99990] flex items-end justify-center lg:hidden">
      <button
        type="button"
        aria-label="Close"
        className="lq-scrim"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-fields-title"
        className="relative z-10 w-full max-w-lg rounded-t-2xl border border-ink/[0.08] bg-surface-raised shadow-2xl"
        style={{
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          animation: "sigSheetUp .28s cubic-bezier(.16,1,.3,1)",
        }}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-ink/20" />
        </div>
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-1">
          <div className="min-w-0">
            <h2
              id="mobile-fields-title"
              className="text-[15px] font-semibold tracking-tight text-text-primary"
            >
              Card fields
            </h2>
            <p className="mt-0.5 text-[12px] leading-snug text-text-muted">
              Pair, entry → target, and live price always stay on. Toggle extras only.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-ink/[0.08] text-text-muted"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2 px-4 pb-3">
          <button
            type="button"
            onClick={() => onPreset("simple")}
            className="flex-1 rounded-xl border border-ink/[0.1] bg-ink/[0.03] py-2 text-[12px] font-semibold text-text-primary"
          >
            Simple
          </button>
          <button
            type="button"
            onClick={() => onPreset("trader")}
            className="flex-1 rounded-xl border border-ink/[0.1] bg-ink/[0.03] py-2 text-[12px] font-semibold text-text-primary"
          >
            Trader
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-xl border border-ink/[0.08] px-3 py-2 text-[12px] font-medium text-text-muted"
          >
            Reset
          </button>
        </div>

        <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto px-3 pb-4">
          {MOBILE_FIELDS.map((f) => {
            const on = !!fields[f.key];
            return (
              <li key={f.key}>
                <button
                  type="button"
                  onClick={() => onToggle(f.key)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-ink/[0.04]"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      on
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-ink/20 bg-transparent text-transparent"
                    }`}
                  >
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-text-primary">{f.label}</span>
                    <span className="block text-[11px] text-text-muted">{f.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <style>{`@keyframes sigSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>,
    document.body
  );
};

// ================================================================
// COLUMNS MENU — dropdown of checkboxes to toggle visible columns
// Gate/Notion-style: soft pill trigger, rounded-xl panel, clear density cue.
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
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
          open
            ? "border-ink/14 bg-ink/[0.06] text-text-primary"
            : "border-ink/[0.08] bg-ink/[0.03] text-text-secondary hover:border-ink/12 hover:bg-ink/[0.05] hover:text-text-primary"
        }`}
      >
        <svg
          className="h-3.5 w-3.5 opacity-70"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="18" rx="1.5" />
          <rect x="14" y="3" width="7" height="18" rx="1.5" />
        </svg>
        <span>Columns</span>
        <span className="rounded-md bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-text-muted">
          {visibleCount}/{SIGNAL_COLUMNS.length}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-ink/[0.1] bg-surface-raised shadow-2xl">
          <div className="flex items-center justify-between border-b border-ink/[0.06] px-3.5 py-2.5">
            <span className="text-[12px] font-medium text-text-primary">Visible columns</span>
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] font-medium text-text-muted transition-colors hover:text-accent"
            >
              Reset
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1" role="listbox">
            {SIGNAL_COLUMNS.map((c) => {
              const active = !!visibleCols[c.key];
              const isLast = active && visibleCount === 1; // keep at least one column
              return (
                <button
                  key={c.key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    if (!isLast) onToggle(c.key);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-[12.5px] transition-colors ${
                    isLast
                      ? "cursor-not-allowed opacity-50"
                      : "hover:bg-ink/[0.04]"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-[5px] border transition-colors ${
                      active
                        ? "border-accent bg-accent text-accent-fg"
                        : "border-ink/[0.16] bg-transparent text-transparent"
                    }`}
                  >
                    <svg
                      className="h-2.5 w-2.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span className={active ? "text-text-primary" : "text-text-secondary"}>
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

/** Page numbers with ellipsis gaps — stable width like Gate / Coinbase tables. */
const pageWindow = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);
  const sorted = [...pages].sort((a, b) => a - b);
  const out = [];
  let prev = null;
  for (const p of sorted) {
    if (prev !== null && p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
};

const SignalsTable = ({
  signals,
  loading,
  page,
  totalPages,
  totalSignals,
  onPageChange,
  sortBy,
  sortOrder,
  sorts = null,
  onSort,
  onRowClick,
  onPricesUpdate,
  isSubscriber = true,
  onSubscribe,
  onOpenProof,
  hideColumnsMenu = false,
  countLabel = null,
  rowHint = null,
  hiddenCount = 0,
  allPairs,
  coinIntel = {},
  verdictByPair = {},
  currentFlow = null,
  tagWrMap = {},
  runnerTagSet = null,
  edgeScoreMap = {},
  signalTags = {},
  onWatchlistChange = null,
  // Showcase / teaser: Price = max(live, recorded peak). Live only wins
  // when the coin is still printing a new high.
  preferBestPrice = false,
  onGuideBack = null,
}) => {
  const { t } = useTranslation();

  const [expandedCards, setExpandedCards] = useState({}); // mobile card expand, keyed by signal_id (survives 15s price refresh)
  const [selectedCoinIntel, setSelectedCoinIntel] = useState(null); // coin object for CoinDetailModal
  const [showVerdictHint, setShowVerdictHint] = useState(false); // verdict coachmark (auto-shows on load)
  const [currentPrices, setCurrentPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesFailed, setPricesFailed] = useState(false); // true only when NO pair could be fetched at all
  const [showNotice, setShowNotice] = useState(false); // the dismissible "data unavailable" toast

  // ── Compare selection ──
  // Capped at 5: past that the columns get too narrow to read on a laptop and
  // the decision stops being a comparison and becomes another screener.
  const COMPARE_MAX = 5;
  // Holds the SIGNAL OBJECTS, not just their ids. Ids alone meant the tray had
  // to look each one up in `signals` — which is the filtered, paginated page —
  // so searching or changing a filter silently dropped every selection that
  // scrolled out of the result set. Live prices are unaffected either way:
  // they are fetched for allPairs, not just the visible rows.
  const [compareSel, setCompareSel] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const isCompared = (id) => compareSel.some((s) => s.signal_id === id);
  const toggleCompare = (signal) =>
    setCompareSel((prev) =>
      prev.some((s) => s.signal_id === signal.signal_id)
        ? prev.filter((s) => s.signal_id !== signal.signal_id)
        : prev.length >= COMPARE_MAX
          ? prev
          : [...prev, signal]
    );

  // ── Column visibility (desktop table) ──
  const [visibleCols, setVisibleCols] = useState(loadVisibleCols);
  // Not persisted and not toggleable: this is the wall, not a preference. A
  // subscriber's own saved choice is left untouched underneath.
  const effectiveCols = isSubscriber ? visibleCols : freeVisibleCols();

  // ── Mobile card fields (separate prefs from desktop columns) ──
  const [mobileFields, setMobileFields] = useState(loadMobileFields);
  const [mobileFieldsOpen, setMobileFieldsOpen] = useState(false);

  const persistMobileFields = (next) => {
    try {
      localStorage.setItem(MOBILE_FIELDS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const toggleMobileField = (key) => {
    setMobileFields((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      persistMobileFields(next);
      return next;
    });
  };

  const resetMobileFields = () => {
    const d = defaultMobileFields();
    setMobileFields(d);
    persistMobileFields(d);
  };

  const presetMobileFields = (kind) => {
    const next =
      kind === "trader"
        ? MOBILE_FIELDS.reduce((acc, f) => {
            acc[f.key] = true;
            return acc;
          }, {})
        : defaultMobileFields();
    setMobileFields(next);
    persistMobileFields(next);
  };

  const mobileExtraCount = MOBILE_FIELDS.filter((f) => mobileFields[f.key]).length;

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

  // Total <th>/<td> count = Compare + Star + Pair + visible toggleable + Share
  // (+ Subscribe for a free account, which adds one more column).
  // Used for the loading skeleton + empty-state colSpan so they stay aligned.
  const visibleColCount = useMemo(
    () => 4 + SIGNAL_COLUMNS.filter((c) => visibleCols[c.key]).length,
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

    // Prices come straight from the exchange, so this costs the user's data and
    // battery rather than our server — which is exactly why a hidden tab should
    // not keep paying for quotes nobody is reading. Coming back refreshes at
    // once, so the visible tab is never showing a price from minutes ago.
    const onVisible = () => {
      if (document.visibilityState === "visible") runFetch();
    };
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      runFetch();
    };
    intervalRef.current = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
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

  // Per-signal verdict (leave-one-out when closed). Modal opens full pair intel.
  const getVerdict = (signalOrPair) => {
    const signal =
      signalOrPair && typeof signalOrPair === "object" ? signalOrPair : null;
    const pair = signal ? signal.pair : signalOrPair;
    const coin = coinIntel?.[pair];
    if (!coin) return null;
    if (signal) {
      const info = getSignalVerdictInfo(coin, signal);
      if (!info) return null;
      return {
        verdict: info.verdict,
        // Badge / LOO metrics for the cell; modal always uses full pair coin.
        coin: info.coin,
        fullCoin: info.fullCoin || coin,
        asOfEntry: !!info.asOfEntry,
      };
    }
    const v = verdictByPair?.[pair] || classifyCoin(coin);
    return { verdict: v, coin, fullCoin: coin, asOfEntry: false };
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
  // Runner badge if signal carries any high-runner tag (90d fuller TP / peak).
  const getRunnerHint = (signalId) => {
    if (!runnerTagSet || runnerTagSet.size === 0) return null;
    const tags = signalTags?.[signalId];
    if (!tags?.length) return null;
    let best = null;
    for (const tg of tags) {
      if (!runnerTagSet.has(tg)) continue;
      const meta = tagWrMap?.[tg];
      const full = meta?.full_tp_rate ?? 0;
      const peak = meta?.median_peak_wins ?? meta?.median_peak ?? 0;
      if (!best || full > (best.full || 0)) {
        best = { tag: tg, full, peak, tp4: meta?.tp4_rate };
      }
    }
    return best;
  };

  const getEdge = (signalId) => edgeScoreMap?.[signalId] || null;
  const edgeToneCls = (score) => {
    if (score == null) return "text-text-muted";
    if (score >= 68) return "text-accent font-semibold";
    if (score >= 62) return "text-positive font-semibold";
    if (score >= 55) return "text-text-primary";
    return "text-text-muted";
  };
  const edgeTitle = (e) => {
    if (!e || e.score == null) return "";
    // Prefer precomputed plainWhy / full tooltip from edgeScore utils
    try {
      // lazy import style: fields already on object when available
      const plain = e.plainWhy;
      const lines = [`Edge ${Number(e.score).toFixed(1)}`];
      if (plain) lines.push(plain);
      else if (e.reason) lines.push(e.reason);
      if (e.bestTag) lines.push(`Best tag: ${e.bestTag}${e.bestTagWr != null ? ` ${e.bestTagWr}%` : ""}`);
      if (e.caution?.length) lines.push(`Caution: ${e.caution.join(", ")}`);
      if (e.excludedOutcome) {
        lines.push("As of entry · this call’s outcome excluded (no look-ahead)");
      } else {
        lines.push("As of entry · resolved history before / excluding this open call");
      }
      lines.push("Not a guarantee");
      return lines.join("\n");
    } catch {
      return e.reason || `Edge ${e.score}`;
    }
  };
  const fmtTag = (tg) => tg.replace(/_H1$/, "").replace(/_/g, " ");

  // Index of the first row (in current page) that has a non-neutral verdict —
  // the coachmark anchors to this row's verdict cell.
  const firstVerdictIdx = useMemo(() => {
    if (!signals) return -1;
    return signals.findIndex((s) => {
      const v = getVerdict(s);
      return v && v.verdict !== "neutral";
    });
  }, [signals, coinIntel, verdictByPair]);

  // Auto-show the verdict coachmark whenever the table loads with verdict data
  // visible. Shows for 5s every page open (no localStorage — user asked for it
  // to appear each visit). Cleans up on unmount / dependency change.
  useEffect(() => {
    if (loading) return;
    if (!effectiveCols.verdict) return;
    if (firstVerdictIdx < 0) return;
    setShowVerdictHint(true);
    const tid = setTimeout(() => setShowVerdictHint(false), 5000);
    return () => clearTimeout(tid);
  }, [loading, effectiveCols.verdict, firstVerdictIdx]);

  const formatPrice = (price) => {
    if (!price && price !== 0) return "-";
    const num = parseFloat(price);
    if (isNaN(num)) return "-";
    if (num < 0.001) return num.toFixed(8);
    if (num < 1) return num.toFixed(6);
    if (num < 10) return num.toFixed(4);
    return num.toFixed(2);
  };

  // Recorded high (peak_price travels as close_price on the list payload).
  // Live wins only when it has already printed through that high.
  const bestPriceOf = (signal, live) => {
    const peak = Number(signal.close_price ?? signal.peak_price);
    const now = Number(live);
    const peakOk = Number.isFinite(peak) && peak > 0;
    const nowOk = Number.isFinite(now) && now > 0;
    if (peakOk && nowOk) return Math.max(peak, now);
    if (nowOk) return now;
    if (peakOk) return peak;
    return null;
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

  // Soft semantic chips — Coinbase/Gate language: tinted pill + optional live dot,
  // no heavy borders that fight the table grid on bright theme.
  const getRiskClasses = (risk) => {
    const r = risk?.toLowerCase() || "";
    if (r.startsWith("low")) return "bg-profit/12 text-profit";
    if (r.startsWith("high")) return "bg-negative/12 text-loss";
    return "bg-accent/12 text-accent";
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
    let cls;
    let label;
    let live = false;

    if (s === "open") {
      cls = "bg-accent/12 text-accent";
      label = "Open";
      live = true;
    } else if (s === "closed_loss" || s === "sl") {
      cls = "bg-negative/12 text-loss";
      label = "Loss";
    } else if (s === "closed_win") {
      cls = "bg-profit/12 text-profit";
      label = "Win";
    } else if (s.startsWith("tp")) {
      cls = "bg-profit/12 text-profit";
      label = s.toUpperCase();
    } else {
      cls = "bg-ink/[0.05] text-text-secondary";
      label = status || "—";
    }
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${cls}`}
      >
        {live ? (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-40" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        ) : null}
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

  // Multi-sort chain (primary = sorts[0] or sortBy). Shift/⌘/Ctrl+click adds levels.
  const sortChain = Array.isArray(sorts) && sorts.length
    ? sorts
    : [{ field: sortBy, order: sortOrder || "desc" }];
  const sortRank = (field) => {
    const i = sortChain.findIndex((s) => s.field === field);
    return i >= 0 ? i + 1 : 0;
  };
  const sortDir = (field) => {
    const s = sortChain.find((x) => x.field === field);
    return s?.order || sortOrder || "desc";
  };

  const SortableHeader = ({ field, label, align = "left" }) => {
    const rank = sortRank(field);
    const isActive = rank > 0;
    const dir = sortDir(field);
    const textAlign =
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
    const justify =
      align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
    return (
      <th
        className={`cursor-pointer select-none px-3 py-2.5 transition-colors ${textAlign} ${
          isActive ? "text-text-primary" : "text-text-muted hover:text-text-secondary"
        }`}
        title={
          isActive
            ? `Sort level ${rank} · click toggle · Shift+click add/cycle`
            : "Click to sort · Shift+click to add as secondary"
        }
        onClick={(e) => onSort && onSort(field, e)}
      >
        <span className={`group inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium ${justify}`}>
          {rank > 0 && sortChain.length > 1 && (
            <span className="inline-flex h-3.5 min-w-[14px] items-center justify-center rounded bg-accent/15 px-0.5 font-mono text-[8px] tabular-nums text-accent">
              {rank}
            </span>
          )}
          <span>{label}</span>
          <span
            className={`text-[8px] leading-none transition-opacity ${
              isActive ? "text-accent opacity-100" : "opacity-0 group-hover:opacity-40"
            }`}
            aria-hidden="true"
          >
            {isActive && dir === "asc" ? "▲" : "▼"}
          </span>
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

  // Compare checkbox. Deliberately always visible rather than hover-revealed:
  // a hover-only control simply does not exist on a touch device, which is how
  // the Confluence compare pin ended up unreachable on phones.
  const CompareBox = ({ signal, size = 15 }) => {
    const on = isCompared(signal.signal_id);
    const full = !on && compareSel.length >= COMPARE_MAX;
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={`${on ? "Remove" : "Add"} ${getCoinName(signal.pair)} ${on ? "from" : "to"} compare`}
        title={
          full
            ? `Compare holds ${COMPARE_MAX} at a time`
            : on
              ? "Remove from compare"
              : "Add to compare"
        }
        disabled={full}
        onClick={(e) => {
          e.stopPropagation();
          toggleCompare(signal);
        }}
        style={{ width: size, height: size }}
        className={`inline-flex items-center justify-center rounded-[4px] border transition-colors ${
          on
            ? "border-accent bg-accent text-accent-fg shadow-sm"
            : full
              ? "cursor-not-allowed border-ink/[0.08] text-transparent"
              : "border-ink/[0.16] text-transparent hover:border-accent/55 hover:bg-accent/[0.08]"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-2.5 w-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
        >
          <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    );
  };

  const MobileSignalCard = ({ signal }) => {
    const livePrice = getPrice(signal.pair);
    const currentPrice =
      preferBestPrice || (!isSubscriber && signal.close_price != null)
        ? bestPriceOf(signal, livePrice)
        : livePrice;
    const currentVol = getVolume(signal.pair);
    const priceChange = getPriceChange(signal.entry, currentPrice);
    const open = !!expandedCards[signal.signal_id];
    const toggle = () =>
      setExpandedCards((p) => ({ ...p, [signal.signal_id]: !p[signal.signal_id] }));
    const v = getVerdict(signal);
    const wr = getWinRate(signal.pair);
    const streak = getStreak(signal.pair);
    const topTag = getTopTag(signal.signal_id);
    const runner = getRunnerHint(signal.signal_id);
    const btc = getBtc(signal);
    const maxTarget = getMaxTarget(signal);
    const potentialPct = maxTarget != null ? calcPct(maxTarget, signal.entry) : null;
    const mf = mobileFields;
    const showVerdict = !!mf.verdict;
    const showRisk = !!mf.risk;
    const showSl = !!mf.stop_loss;
    const showVol = !!mf.vol;
    const showCalled = !!mf.called_time;

    return (
      <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised transition-colors hover:border-ink/12">
        {/* COLLAPSED — telegram-simple core + optional fields */}
        <div className="flex items-center gap-2.5 p-3.5">
          <button
            onClick={toggle}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            <CoinLogo pair={signal.pair} size={32} />
            <div className="min-w-0 flex-1">
              {/* line 1 — identity */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13.5px] font-medium text-text-primary">
                  {getCoinName(signal.pair)}
                  <span className="text-text-muted">/USDT</span>
                </span>
                {runner ? (
                  <span
                    title={[
                      "Historically fuller targets / higher peak",
                      runner.full != null ? `${Number(runner.full).toFixed(0)}% TP3+` : null,
                      runner.peak != null ? `med peak +${Number(runner.peak).toFixed(0)}%` : null,
                      runner.tag ? fmtTag(runner.tag) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    className="rounded-md border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-accent"
                  >
                    Runner
                  </span>
                ) : null}
                {(() => {
                  const e = getEdge(signal.signal_id);
                  if (!e || e.score == null) return null;
                  return (
                    <span
                      title={edgeTitle(e)}
                      className={`rounded-md border border-ink/[0.08] bg-ink/[0.03] px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${edgeToneCls(e.score)}`}
                    >
                      E{Number(e.score).toFixed(0)}
                    </span>
                  );
                })()}
                {getStatusBadge(signal.status)}
                {showRisk ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getRiskClasses(signal.risk_level)}`}
                  >
                    {getRiskLabel(signal.risk_level)}
                  </span>
                ) : null}
              </div>
              {/* line 2 — trade levels: entry -> max target (+ SL optional) */}
              <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                <span className="text-text-muted">E</span>
                <span className="tabular-nums text-text-secondary">
                  {formatPrice(signal.entry)}
                </span>
                {maxTarget != null ? (
                  <>
                    <span className="text-text-muted/60">→</span>
                    <span className="tabular-nums text-profit">{formatPrice(maxTarget)}</span>
                    {potentialPct != null ? (
                      <span className="font-medium tabular-nums text-profit">
                        +{potentialPct.toFixed(1)}%
                      </span>
                    ) : null}
                  </>
                ) : null}
                {showSl && signal.stop_loss ? (
                  <>
                    <span className="text-text-muted/40">·</span>
                    <span className="text-text-muted">SL</span>
                    <span className="tabular-nums text-loss/90">
                      {formatPrice(signal.stop_loss)}
                    </span>
                  </>
                ) : null}
              </div>
              {/* line 3 — live + optional quality / vol / time */}
              <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-[11px]">
                {priceChange !== null ? (
                  <span
                    className={`font-medium tabular-nums ${priceChange >= 0 ? "text-profit" : "text-loss"}`}
                  >
                    {priceChange >= 0 ? "+" : ""}
                    {priceChange.toFixed(2)}%
                  </span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
                {currentPrice ? (
                  <span className="tabular-nums text-text-muted">
                    now {formatPrice(currentPrice)}
                  </span>
                ) : null}
                {showVerdict && v && v.verdict !== "neutral" ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${v.verdict === "avoid" ? "bg-negative/12 text-loss" : "bg-profit/12 text-profit"}`}
                  >
                    {v.verdict === "avoid" ? "Avoid" : "Worth"}
                    {v.coin.risk_score != null ? ` ${v.coin.risk_score}` : ""}
                  </span>
                ) : showVerdict && wr != null ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${wr >= 70 ? "bg-profit/12 text-profit" : wr >= 50 ? "bg-accent/12 text-accent" : "bg-negative/12 text-loss"}`}
                  >
                    {wr}%
                  </span>
                ) : null}
                {showVol && currentVol ? (
                  <span className="tabular-nums text-text-muted">
                    vol {formatVolume(currentVol)}
                  </span>
                ) : null}
                {showCalled && signal.created_at ? (
                  <span className="tabular-nums text-text-muted">
                    {formatTimeAgo(signal.created_at)}
                  </span>
                ) : null}
              </div>
            </div>
          </button>
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="px-1.5" onClick={(e) => e.stopPropagation()}>
              <CompareBox signal={signal} size={18} />
            </div>
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
          <div className="space-y-3 border-t border-ink/[0.06] p-3.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getRiskClasses(signal.risk_level)}`}
              >
                {getRiskLabel(signal.risk_level)}
              </span>
              {wr != null ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums ${wr >= 70 ? "bg-profit/12 text-profit" : wr >= 50 ? "bg-accent/12 text-accent" : "bg-negative/12 text-loss"}`}
                >
                  WR {wr}%
                </span>
              ) : null}
              {streak ? (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums ${streak.type === "win" ? "bg-profit/12 text-profit" : "bg-negative/12 text-loss"}`}
                >
                  {streak.length}
                  {streak.type === "win" ? "W" : "L"}
                </span>
              ) : null}
              {topTag ? (
                <span
                  title={`${fmtTag(topTag.tag)}: ${topTag.wr}% historical win rate when present`}
                  className="max-w-[160px] truncate rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-medium text-accent"
                >
                  {fmtTag(topTag.tag).toLowerCase()} {topTag.wr}%
                </span>
              ) : null}
            </div>

            {signal.last_update_at ? (
              <div className="flex items-center justify-between rounded-lg border border-ink/[0.06] bg-ink/[0.02] px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
                  {getUpdateTypeBadge(signal.last_update_type)}
                </div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-primary/45">
                  {formatTimeAgo(signal.last_update_at)}
                </span>
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2 rounded-xl border border-ink/[0.06] bg-ink/[0.02] p-3">
              <div>
                <p className="mb-1 text-[10px] font-medium text-text-muted">Entry</p>
                <p className="font-mono text-[12.5px] font-medium tabular-nums text-text-primary">
                  {formatPrice(signal.entry)}
                </p>
              </div>
              <div className="border-x border-ink/[0.05] text-center">
                <p className="mb-1 text-[10px] font-medium text-text-muted">Current</p>
                {currentPrice ? (
                  <p
                    className={`font-mono text-[12.5px] font-medium tabular-nums ${priceChange !== null ? (priceChange >= 0 ? "text-profit" : "text-loss") : "text-text-primary"}`}
                  >
                    {formatPrice(currentPrice)}
                  </p>
                ) : (
                  <p className="text-[12.5px] text-text-muted">—</p>
                )}
              </div>
              <div className="text-right">
                <p className="mb-1 text-[10px] font-medium text-text-muted">P&amp;L</p>
                {priceChange !== null ? (
                  <p
                    className={`font-mono text-[12.5px] font-medium tabular-nums ${priceChange >= 0 ? "text-profit" : "text-loss"}`}
                  >
                    {priceChange >= 0 ? "+" : ""}
                    {priceChange.toFixed(2)}%
                  </p>
                ) : (
                  <p className="text-[12.5px] text-text-muted">—</p>
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
                    className="rounded-lg border border-ink/[0.06] bg-ink/[0.015] px-1 py-1.5 text-center"
                  >
                    <p className="text-[9px] font-medium text-text-muted">{tp.label}</p>
                    <p className="mt-0.5 font-mono text-[10.5px] font-medium tabular-nums text-text-secondary">
                      {tp.value ? formatPrice(tp.value) : "—"}
                    </p>
                    {pct != null ? (
                      <p className="mt-0.5 font-mono text-[9px] tabular-nums text-profit/80">
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
                type="button"
                onClick={() => onRowClick && onRowClick(signal)}
                className="text-[12px] font-medium text-accent transition-colors hover:text-accent/80"
              >
                Open signal →
              </button>
              <div className="flex items-center gap-1.5">
                {v && v.verdict !== "neutral" ? (
                  <button
                    type="button"
                    onClick={() => setSelectedCoinIntel(v.fullCoin || v.coin)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${v.verdict === "avoid" ? "bg-negative/12 text-loss" : "bg-profit/12 text-profit"}`}
                  >
                    {v.verdict === "avoid" ? "Avoid" : "Worth"} detail
                    <svg
                      className="h-2.5 w-2.5 opacity-60"
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
                  type="button"
                  onClick={(e) => handleShareSignal(e, signal)}
                  title="Share signal"
                  aria-label="Share signal"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-accent transition-colors hover:bg-accent/12"
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
        <div key={i} className="rounded-xl border border-ink/[0.06] bg-surface-raised p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-ink/[0.04]" />
              <div>
                <div className="mb-1.5 h-3 w-16 rounded bg-ink/[0.04]" />
                <div className="h-2 w-10 rounded bg-ink/[0.04]" />
              </div>
            </div>
            <div className="h-5 w-16 rounded-full bg-ink/[0.04]" />
          </div>
          <div className="mb-3 h-14 w-full rounded-lg bg-ink/[0.03]" />
          <div className="mb-3 h-7 w-full rounded-lg bg-ink/[0.03]" />
          <div className="h-3 w-full rounded bg-ink/[0.03]" />
        </div>
      ))}
    </div>
  );

  const PaginationBar = ({ className = "" }) => {
    if (totalPages <= 1) return null;
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-3 ${className}`}
      >
        <span className="font-mono text-[11px] tabular-nums text-text-muted">
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] leading-none text-text-secondary transition-colors hover:bg-ink/[0.06] hover:text-text-primary disabled:pointer-events-none disabled:opacity-25"
          >
            ‹
          </button>
          {pageWindow(page, totalPages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1 text-[12px] text-text-muted">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? "page" : undefined}
                className={`h-7 min-w-[28px] rounded-md px-2 font-mono text-[12px] tabular-nums transition-colors ${
                  p === page
                    ? "bg-accent text-accent-fg"
                    : "text-text-secondary hover:bg-ink/[0.06] hover:text-text-primary"
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] leading-none text-text-secondary transition-colors hover:bg-ink/[0.06] hover:text-text-primary disabled:pointer-events-none disabled:opacity-25"
          >
            ›
          </button>
        </div>
      </div>
    );
  };

  const FreeTapeBanner = () =>
    !isSubscriber && hiddenCount > 0 ? (
      <div
        className="flex flex-col gap-3 rounded-xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
        style={{
          borderColor: "rgb(var(--accent) / 0.22)",
          background: "rgb(var(--accent) / 0.06)",
        }}
      >
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span
              className="rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em]"
              style={{
                background: "rgb(var(--accent) / 0.2)",
                color: "rgb(var(--accent-text))",
              }}
            >
              {onGuideBack ? "3 · Example" : "Example"}
            </span>
            <p
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "rgb(var(--accent-text))" }}
            >
              Free view · finished calls
            </p>
          </div>
          <p className="text-[13px] font-semibold text-text-primary">
            These already hit their target — timestamped, and yours to verify.
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-text-muted">
            Open any row for the proof on a chart.{" "}
            <span className="font-medium text-text-primary">
              Calls still running are on the subscribers&rsquo; side.
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {onGuideBack ? (
            <button
              type="button"
              onClick={onGuideBack}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-ink/10 bg-surface-raised px-3.5 py-2 text-[12px] font-semibold text-text-primary transition-colors hover:bg-ink/[0.04]"
            >
              Recent call
              <svg className="h-3.5 w-3.5 rotate-180" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSubscribe}
            className="shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-[12px] font-semibold transition-all hover:brightness-110"
            style={{
              background: "rgb(var(--accent))",
              color: "rgb(var(--accent-fg))",
            }}
          >
            See what&rsquo;s running
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className="lg:hidden">
        {!isSubscriber && hiddenCount > 0 ? (
          <div className="mb-3">
            <FreeTapeBanner />
          </div>
        ) : null}
        {/* Mobile toolbar — Fields (not desktop Columns) */}
        <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-text-primary">Signals</p>
            {!loading && (totalSignals > 0 || signals?.length > 0) ? (
              <p className="font-mono text-[10px] tabular-nums text-text-muted">
                {totalSignals != null ? totalSignals : signals.length} total
                {totalPages > 1 ? ` · page ${page}/${totalPages}` : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setMobileFieldsOpen(true)}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-ink/[0.1] bg-surface-raised px-2.5 text-[12px] font-medium text-text-primary transition-colors hover:border-ink/20"
          >
            <svg
              className="h-3.5 w-3.5 text-text-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="4" width="7" height="7" rx="1" />
              <rect x="14" y="4" width="7" height="7" rx="1" />
              <rect x="3" y="13" width="7" height="7" rx="1" />
              <rect x="14" y="13" width="7" height="7" rx="1" />
            </svg>
            Fields
            {mobileExtraCount > 0 ? (
              <span className="rounded-md bg-ink/[0.06] px-1 py-px font-mono text-[10px] tabular-nums text-text-muted">
                {mobileExtraCount}
              </span>
            ) : null}
          </button>
        </div>

        {loading ? (
          <MobileLoadingSkeleton />
        ) : signals?.length === 0 ? (
          <div className="rounded-xl border border-ink/[0.07] bg-surface-raised p-10 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-ink/[0.06] bg-ink/[0.03]">
                <EmptyStateIcon />
              </div>
              <p className="text-sm font-medium text-text-primary">No signals found</p>
              <p className="text-[12px] text-text-muted">
                Adjust your filters and try again
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {signals.map((signal, idx) => (
              <MobileSignalCard key={signal.signal_id || idx} signal={signal} />
            ))}
          </div>
        )}

        <PaginationBar className="mt-3 px-1 py-3" />

        <MobileFieldsSheet
          open={mobileFieldsOpen}
          onClose={() => setMobileFieldsOpen(false)}
          fields={mobileFields}
          onToggle={toggleMobileField}
          onReset={resetMobileFields}
          onPreset={presetMobileFields}
        />
      </div>

      <div className="hidden w-full lg:block">
        {/* Gate-style shell: soft rounded card, toolbar inside, horizontal scroll only. */}
        {/* No overflow-hidden on the shell — ColumnsMenu dropdown must paint outside. */}
        <div className="relative rounded-xl border border-ink/[0.07] bg-surface-raised">
          <div className="flex items-center justify-between gap-3 border-b border-ink/[0.06] px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-[12.5px] font-medium text-text-primary">Signals</span>
              {/* A count describes a result set. On the showcase it reads as
                  the whole inventory, so that table passes a label instead. */}
              {countLabel ? (
                <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                  {countLabel}
                </span>
              ) : !loading && (totalSignals > 0 || signals?.length > 0) ? (
                <span className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-text-muted">
                  {totalSignals != null ? totalSignals : signals.length} total
                  {totalPages > 1 ? ` · page ${page}/${totalPages}` : ""}
                </span>
              ) : null}
              {pricesLoading ? (
                <span className="hidden items-center gap-1.5 text-[11px] text-text-muted sm:inline-flex">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  Updating prices
                </span>
              ) : null}
            </div>
            {/* Hidden for a free account: the column set is fixed there, so a
                toggle that changes nothing is worse than no toggle. */}
            {isSubscriber && !hideColumnsMenu && (
              <ColumnsMenu visibleCols={visibleCols} onToggle={toggleCol} onReset={resetCols} />
            )}
          </div>

          {!isSubscriber && hiddenCount > 0 ? (
            <div className="border-b border-ink/[0.06] p-3">
              <FreeTapeBanner />
            </div>
          ) : null}

          <style>{`
 .sig-t td, .sig-t th { transition: padding .18s ease; vertical-align: middle; }
 /* Single-line cells — keep vertical padding tight so rows stay even height */
 .sig-compact td, .sig-compact th { padding: 10px 10px !important; }
 .sig-cozy td, .sig-cozy th { padding: 11px 12px !important; }
 .sig-roomy td, .sig-roomy th { padding: 12px 14px !important; }

 /* Sticky thead skipped inside overflow-x-auto — see prior notes. */

 /* Frozen identity columns (compare / star / pair) so sideways scroll never
    loses row identity — opaque bg so body cells don't bleed through. */
 .sig-t tbody tr { background: rgb(var(--surface-raised)); }
 .sig-t tbody tr:hover { background: color-mix(in srgb, rgb(var(--ink)) 3.5%, rgb(var(--surface-raised))); }
 .sig-t th:nth-child(1), .sig-t td:nth-child(1),
 .sig-t th:nth-child(2), .sig-t td:nth-child(2),
 .sig-t th:nth-child(3), .sig-t td:nth-child(3) {
   position: sticky;
   background: inherit;
   z-index: 1;
 }
 .sig-t th:nth-child(1), .sig-t td:nth-child(1) {
   width: 42px;
   padding-left: 14px !important;
   padding-right: 8px !important;
 }
 .sig-t th:nth-child(2), .sig-t td:nth-child(2) {
   width: 38px;
   padding-left: 6px !important;
   padding-right: 6px !important;
 }
 .sig-t th:nth-child(1), .sig-t td:nth-child(1) { left: 0; }
 .sig-t th:nth-child(2), .sig-t td:nth-child(2) { left: 42px; }
 .sig-t th:nth-child(3), .sig-t td:nth-child(3) { left: 80px; }
 .sig-t thead th:nth-child(1),
 .sig-t thead th:nth-child(2),
 .sig-t thead th:nth-child(3) {
   z-index: 3;
   background: rgb(var(--surface-raised));
 }
 .sig-t th:nth-child(3), .sig-t td:nth-child(3) {
   box-shadow: 1px 0 0 rgb(var(--ink) / 0.07);
 }
 .sig-t tbody tr:focus-visible {
   outline: 1px solid rgb(var(--accent));
   outline-offset: -1px;
 }
 /* Share affordance: quiet until row hover / keyboard focus */
 .sig-share-btn { opacity: 0; transition: opacity .15s ease, background .15s ease; }
 .sig-t tbody tr:hover .sig-share-btn,
 .sig-t tbody tr:focus-within .sig-share-btn { opacity: 1; }
 `}</style>
          <div className="overflow-x-auto">
            <table className={`sig-t sig-${density} w-full min-w-[980px] border-collapse text-left whitespace-nowrap`}>
              <thead>
                <tr className="border-b border-ink/[0.07] text-text-muted">
                  <th className="w-11 text-center">
                    <span className="sr-only">Compare</span>
                  </th>
                  <th className="w-10 text-center">
                    <span className="sr-only">Watchlist</span>
                  </th>
                  <SortableHeader field="pair" label="Pair" />
                  {effectiveCols.current_price && (
                    <SortableHeader
                      field="current_price"
                      label={isSubscriber ? "Price" : "Closed"}
                      align="right"
                    />
                  )}
                  {effectiveCols.entry && (
                    <SortableHeader field="entry" label="Entry" align="right" />
                  )}
                  {effectiveCols.max_target && (
                    <SortableHeader field="max_target" label="Target" align="right" />
                  )}
                  {effectiveCols.stop_loss && (
                    <SortableHeader field="stop_loss" label="Stop" align="right" />
                  )}
                  {effectiveCols.risk_level && (
                    <SortableHeader field="risk_level" label="Risk" align="center" />
                  )}
                  {effectiveCols.market_cap && (
                    <SortableHeader field="market_cap" label="MCap" align="right" />
                  )}
                  {effectiveCols.volume && (
                    <SortableHeader field="volume" label="Vol 24h" align="right" />
                  )}
                  {effectiveCols.track_record && (
                    <th className="select-none px-3 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center gap-1.5 text-[11px] font-medium">
                        <InfoTip
                          side="bottom"
                          title={t("guide.track_t")}
                          text={t("guide.track_d")}
                        />
                        <button
                          type="button"
                          title={
                            sortRank("win_rate")
                              ? `Sort level ${sortRank("win_rate")} · Shift+click to stack`
                              : "Click sort · Shift+click add"
                          }
                          onClick={(e) => onSort && onSort("win_rate", e)}
                          className={`inline-flex items-center gap-0.5 transition-colors ${sortRank("win_rate") ? "text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
                        >
                          {sortRank("win_rate") > 0 && sortChain.length > 1 && (
                            <span className="font-mono text-[8px] tabular-nums text-accent">
                              {sortRank("win_rate")}
                            </span>
                          )}
                          WR
                          <span
                            className={`text-[8px] leading-none ${sortRank("win_rate") ? "text-accent opacity-100" : "opacity-0"}`}
                          >
                            {sortRank("win_rate") && sortDir("win_rate") === "asc" ? "▲" : "▼"}
                          </span>
                        </button>
                        <span className="text-text-muted/40">/</span>
                        <button
                          type="button"
                          title={
                            sortRank("win_streak")
                              ? `Sort level ${sortRank("win_streak")} · Shift+click to stack`
                              : "Click sort · Shift+click add"
                          }
                          onClick={(e) => onSort && onSort("win_streak", e)}
                          className={`inline-flex items-center gap-0.5 transition-colors ${sortRank("win_streak") ? "text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
                        >
                          {sortRank("win_streak") > 0 && sortChain.length > 1 && (
                            <span className="font-mono text-[8px] tabular-nums text-accent">
                              {sortRank("win_streak")}
                            </span>
                          )}
                          Streak
                          <span
                            className={`text-[8px] leading-none ${sortRank("win_streak") ? "text-accent opacity-100" : "opacity-0"}`}
                          >
                            {sortRank("win_streak") && sortDir("win_streak") === "asc" ? "▲" : "▼"}
                          </span>
                        </button>
                      </span>
                    </th>
                  )}
                  {effectiveCols.edge_score && (
                    <SortableHeader field="edge_score" label="Edge" align="center" />
                  )}
                  {effectiveCols.btc_corr && (
                    <SortableHeader field="btc_corr" label="BTC Corr" align="center" />
                  )}
                  {effectiveCols.verdict && (
                    <SortableHeader field="verdict" label="Verdict" align="center" />
                  )}
                  {effectiveCols.status && (
                    <SortableHeader field="status" label="Status" align="center" />
                  )}
                  {effectiveCols.created_at && (
                    <SortableHeader field="created_at" label="Called" align="right" />
                  )}
                  <th className="w-10 px-2" />
                  {rowHint && <th className="w-20 px-2" />}
                  {!isSubscriber && <th className="w-28 px-2" />}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(10)].map((_, i) => (
                    <tr key={i} className="border-b border-ink/[0.04]">
                      {[...Array(visibleColCount)].map((_, j) => (
                        <td key={j} className="px-3 py-3.5">
                          <div className="h-3 animate-pulse rounded bg-ink/[0.05]" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : signals?.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColCount} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-ink/[0.06] bg-ink/[0.03]">
                          <EmptyStateIcon />
                        </div>
                        <p className="text-sm font-medium text-text-primary">No signals found</p>
                        <p className="text-[12px] text-text-muted">
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
                        className="group cursor-pointer border-b border-ink/[0.045] transition-colors last:border-0"
                      >
                        <td
                          className="text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <CompareBox signal={signal} />
                        </td>

                        <td className="text-center" onClick={(e) => e.stopPropagation()}>
                          <StarButton
                            signalId={signal.signal_id}
                            isStarred={watchlistIds.includes(signal.signal_id)}
                            onToggle={handleStarToggle}
                          />
                        </td>

                        <td>
                          <div className="flex items-center gap-2.5">
                            <CoinLogo pair={signal.pair} size={26} />
                            <div className="leading-tight">
                              <p className="text-[13px] font-medium text-text-primary transition-colors group-hover:text-accent">
                                {getCoinName(signal.pair)}
                                <span className="text-text-muted">/USDT</span>
                              </p>
                              {(() => {
                                const runner = getRunnerHint(signal.signal_id);
                                if (!runner) return null;
                                return (
                                  <span
                                    title={[
                                      "Historically fuller targets / higher peak",
                                      runner.full != null
                                        ? `${Number(runner.full).toFixed(0)}% TP3+`
                                        : null,
                                      runner.peak != null
                                        ? `med peak +${Number(runner.peak).toFixed(0)}%`
                                        : null,
                                      runner.tag ? fmtTag(runner.tag) : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                    className="mt-0.5 inline-flex rounded-md border border-accent/25 bg-accent/10 px-1 py-px font-mono text-[9px] font-semibold uppercase tracking-wider text-accent"
                                  >
                                    Runner
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                        </td>

                        {effectiveCols.current_price && (
                          <td className="text-right">
                            {(() => {
                              // Free list + the VIP sample: never show a
                              // retrace below the recorded high. Live only
                              // wins when price is still printing a new peak.
                              const useBest =
                                preferBestPrice ||
                                (!isSubscriber && signal.close_price != null);
                              if (!useBest) return null;
                              const display = bestPriceOf(signal, currentPrice);
                              if (display == null) return null;
                              const e = Number(signal.entry);
                              const gain = e > 0 ? ((display - e) / e) * 100 : null;
                              return (
                                <span className="inline-flex items-baseline justify-end gap-1.5 whitespace-nowrap font-mono tabular-nums">
                                  <span className="text-[13px] font-medium text-profit">
                                    {formatPrice(display)}
                                  </span>
                                  {gain != null && (
                                    <span className="text-[11px] font-semibold text-profit">
                                      (+{gain.toFixed(1)}%)
                                    </span>
                                  )}
                                </span>
                              );
                            })()}
                            {preferBestPrice ||
                            (!isSubscriber && signal.close_price != null) ? null : pricesLoading &&
                              !currentPrice ? (
                              <div className="ml-auto h-3 w-16 animate-pulse rounded bg-ink/[0.05]" />
                            ) : currentPrice ? (
                              /* Yahoo/Google Finance: price then relative change in parentheses */
                              <span className="inline-flex items-baseline justify-end gap-1 whitespace-nowrap font-mono tabular-nums">
                                <span className={`text-[13px] font-medium ${currentPriceColor}`}>
                                  {formatPrice(currentPrice)}
                                </span>
                                {priceChange !== null && (
                                  <span
                                    className={`text-[11px] font-medium ${priceChange >= 0 ? "text-profit" : "text-loss"}`}
                                  >
                                    ({priceChange >= 0 ? "+" : ""}
                                    {priceChange.toFixed(2)}%)
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        )}

                        {effectiveCols.entry && (
                          <td className="text-right">
                            <span className="whitespace-nowrap font-mono text-[13px] tabular-nums text-text-secondary">
                              {formatPrice(signal.entry)}
                            </span>
                          </td>
                        )}

                        {effectiveCols.max_target && (
                          <td className="text-right">
                            {maxTarget ? (
                              <span className="inline-flex items-baseline justify-end gap-1 whitespace-nowrap font-mono tabular-nums">
                                <span className="text-[13px] font-medium text-profit">
                                  {formatPrice(maxTarget)}
                                </span>
                                {(() => {
                                  const pct = calcPct(maxTarget, signal.entry);
                                  return pct !== null ? (
                                    <span className="text-[11px] text-profit/80">
                                      (+{pct.toFixed(1)}%)
                                    </span>
                                  ) : null;
                                })()}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        )}

                        {effectiveCols.stop_loss && (
                          <td className="text-right">
                            {signal.stop1 ? (
                              <span className="inline-flex items-baseline justify-end gap-1 whitespace-nowrap font-mono tabular-nums">
                                <span className="text-[13px] font-medium text-loss">
                                  {formatPrice(signal.stop1)}
                                </span>
                                {(() => {
                                  const pct = calcPct(signal.stop1, signal.entry);
                                  return pct !== null ? (
                                    <span className="text-[11px] text-loss/80">
                                      ({pct.toFixed(1)}%)
                                    </span>
                                  ) : null;
                                })()}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        )}

                        {effectiveCols.risk_level && (
                          <td className="text-center">
                            {(() => {
                              const rl = getRiskLabel(signal.risk_level);
                              return (
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${getRiskClasses(signal.risk_level)}`}
                                >
                                  {rl}
                                </span>
                              );
                            })()}
                          </td>
                        )}

                        {effectiveCols.market_cap && (
                          <td className="text-right">
                            {signal.market_cap ? (
                              <span className="font-mono text-[13px] tabular-nums text-text-secondary">
                                {formatMarketCap(signal.market_cap)}
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        )}

                        {effectiveCols.volume && (
                          <td className="text-right">
                            {currentVol ? (
                              <span className="font-mono text-[13px] tabular-nums text-text-secondary">
                                {formatVolume(currentVol)}
                              </span>
                            ) : signal.volume_rank_num && signal.volume_rank_den ? (
                              <span className="font-mono text-[13px] tabular-nums text-text-secondary">
                                {signal.volume_rank_num}
                                <span className="text-text-muted">
                                  /{signal.volume_rank_den}
                                </span>
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        )}

                        {effectiveCols.track_record && (
                          <td className="text-center">
                            {(() => {
                              const wr = getWinRate(signal.pair);
                              const s = getStreak(signal.pair);
                              const tt = getTopTag(signal.signal_id);
                              if (wr == null && !s)
                                return <span className="text-xs text-text-muted">—</span>;
                              const tagTitle = tt
                                ? `${fmtTag(tt.tag)}: ${tt.wr}% historical win rate when present`
                                : undefined;
                              /* Sibling metrics: middot separator (Linear / Apple style) */
                              return (
                                <span
                                  title={tagTitle}
                                  className="inline-flex items-baseline justify-center gap-1 whitespace-nowrap font-mono tabular-nums"
                                >
                                  {wr != null ? (
                                    <span className={`text-[13px] font-medium ${wrColor(wr)}`}>
                                      {wr}%
                                    </span>
                                  ) : null}
                                  {wr != null && s ? (
                                    <span className="text-[11px] text-text-muted/50" aria-hidden>
                                      ·
                                    </span>
                                  ) : null}
                                  {s ? (
                                    <span
                                      className={`text-[11px] font-medium ${s.type === "win" ? "text-profit/85" : "text-loss/85"}`}
                                    >
                                      {s.type === "win" ? "▲" : "▼"}
                                      {s.length}
                                      {s.type === "win" ? "W" : "L"}
                                    </span>
                                  ) : null}
                                </span>
                              );
                            })()}
                          </td>
                        )}

                        {/* Header order is edge_score then btc_corr — the body
                            used to be the other way round, which put rho/beta
                            under "Edge" and the edge score under "BTC Corr". */}
                        {effectiveCols.edge_score && (
                          <td className="text-center">
                            {(() => {
                              const e = getEdge(signal.signal_id);
                              if (!e || e.score == null)
                                return <span className="text-xs text-text-muted">—</span>;
                              const plain = e.plainWhy;
                              const conf = e.confidence;
                              return (
                                <span
                                  title={edgeTitle(e)}
                                  className="inline-flex max-w-[9rem] flex-col items-center gap-0.5"
                                >
                                  <span className="inline-flex items-center gap-0.5">
                                    <span
                                      className={`inline-flex items-center rounded-md border border-ink/[0.08] bg-ink/[0.03] px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${edgeToneCls(e.score)}`}
                                    >
                                      {Number(e.score).toFixed(1)}
                                    </span>
                                    {conf && (
                                      <span
                                        className={`font-mono text-[8px] uppercase tracking-wide ${
                                          conf === "high"
                                            ? "text-positive"
                                            : conf === "medium"
                                              ? "text-text-muted"
                                              : "text-text-muted/70"
                                        }`}
                                        title={`Confidence: ${conf}`}
                                      >
                                        {conf === "high" ? "H" : conf === "medium" ? "M" : "L"}
                                      </span>
                                    )}
                                  </span>
                                  {plain && (
                                    <span className="line-clamp-1 max-w-full truncate text-[9px] leading-tight text-text-muted">
                                      {plain}
                                    </span>
                                  )}
                                </span>
                              );
                            })()}
                          </td>
                        )}

                        {effectiveCols.btc_corr && (
                          <td className="text-center">
                            {(() => {
                              const b = getBtc(signal);
                              if (!b)
                                return <span className="text-xs text-text-muted">—</span>;
                              const flags = [
                                b.decoupled ? "Decoupled from BTC" : null,
                                b.extended ? "Extended move" : null,
                              ]
                                .filter(Boolean)
                                .join(" · ");
                              return (
                                <span
                                  title={flags || undefined}
                                  className="inline-flex items-baseline justify-center gap-1 whitespace-nowrap font-mono tabular-nums"
                                >
                                  <span
                                    className={`text-[13px] font-medium ${btcScoreColor(b.score)}`}
                                  >
                                    {b.score}
                                  </span>
                                  <span className="text-[11px] text-text-muted/50" aria-hidden>
                                    ·
                                  </span>
                                  <span className="text-[11px] text-text-muted">
                                    ρ{fmtSigned(b.corr)} · β{fmtSigned(b.beta)}
                                  </span>
                                </span>
                              );
                            })()}
                          </td>
                        )}

                        {effectiveCols.verdict && (
                          <td
                            className="relative text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {(() => {
                              const v = getVerdict(signal);
                              if (!v || v.verdict === "neutral")
                                return <span className="text-xs text-text-muted">—</span>;
                              const isAvoid = v.verdict === "avoid";
                              // risk_score stays pair-level (not re-scored LOO)
                              const score = (v.fullCoin || v.coin).risk_score ?? null;
                              const showHint = showVerdictHint && idx === firstVerdictIdx;
                              const modalCoin = v.fullCoin || v.coin;
                              const title = v.asOfEntry
                                ? "As of entry · excludes this call’s outcome (no look-ahead)"
                                : "View deep analysis";
                              return (
                                <div className="relative inline-block">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowVerdictHint(false);
                                      setSelectedCoinIntel(modalCoin);
                                    }}
                                    title={title}
                                    className={`group/vd inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-all hover:brightness-110 ${
                                      isAvoid
                                        ? "bg-negative/12 text-loss"
                                        : "bg-profit/12 text-profit"
                                    } ${showHint ? "ring-2 ring-accent/45 ring-offset-1 ring-offset-[rgb(var(--surface-raised))]" : ""}`}
                                  >
                                    <span>{isAvoid ? "Avoid" : "Worth"}</span>
                                    {score != null && (
                                      <span className="tabular-nums opacity-70">{score}</span>
                                    )}
                                    <svg
                                      className="h-2.5 w-2.5 opacity-50 transition-all group-hover/vd:translate-x-0.5 group-hover/vd:opacity-100"
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
                                    <div className="lq-verdict-hint absolute left-1/2 top-full z-40 mt-2 w-60 -translate-x-1/2 text-left">
                                      <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-ink/12 bg-surface-raised" />
                                      <div className="relative overflow-hidden rounded-xl border border-ink/12 bg-surface-raised p-3 shadow-2xl">
                                        <div className="mb-1.5 flex items-center justify-between">
                                          <span className="text-[11px] font-medium text-accent">
                                            Click for detail
                                          </span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setShowVerdictHint(false);
                                            }}
                                            className="text-text-muted hover:text-text-primary"
                                            aria-label="Dismiss"
                                          >
                                            <svg
                                              className="h-3 w-3"
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
                                        <p className="mb-2 text-[11px] leading-relaxed text-text-secondary">
                                          {v.asOfEntry
                                            ? "As-of-entry verdict: this call’s outcome is excluded so the label is not look-ahead."
                                            : "Prior pair history (win rate, streaks, flags) — not a guarantee."}
                                        </p>
                                        <div className="grid grid-cols-2 gap-1.5 border-t border-ink/[0.06] pt-2">
                                          <div>
                                            <p className="text-[9px] font-medium text-text-muted">
                                              Win Rate
                                            </p>
                                            <p
                                              className={`font-mono text-[12px] tabular-nums ${wrColor(v.coin.win_rate ?? 0)}`}
                                            >
                                              {v.coin.win_rate}%
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-[9px] font-medium text-text-muted">
                                              Streak
                                            </p>
                                            <p
                                              className={`font-mono text-[12px] tabular-nums ${
                                                v.coin.current_streak?.type === "win"
                                                  ? "text-profit"
                                                  : "text-loss"
                                              }`}
                                            >
                                              {v.coin.current_streak?.length
                                                ? `${v.coin.current_streak.length}${v.coin.current_streak.type === "win" ? "W" : "L"}`
                                                : "—"}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-[9px] font-medium text-text-muted">
                                              Trades
                                            </p>
                                            <p className="font-mono text-[12px] tabular-nums text-text-primary">
                                              {v.coin.closed_trades ?? "—"}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-[9px] font-medium text-text-muted">
                                              Avg TP
                                            </p>
                                            <p className="font-mono text-[12px] tabular-nums text-text-primary">
                                              {modalCoin.avg_outcome ?? "—"}
                                            </p>
                                          </div>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setShowVerdictHint(false);
                                            setSelectedCoinIntel(modalCoin);
                                          }}
                                          className="mt-2.5 w-full rounded-lg bg-accent py-1.5 text-[11px] font-medium text-accent-fg transition-colors hover:bg-accent/90"
                                        >
                                          View detail →
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        )}

                        {effectiveCols.status && (
                          <td className="text-center">
                            <span
                              className="inline-flex whitespace-nowrap"
                              title={
                                signal.last_update_at
                                  ? `Updated ${formatTimeAgo(signal.last_update_at)}`
                                  : undefined
                              }
                            >
                              {getStatusBadge(signal.status)}
                            </span>
                          </td>
                        )}

                        {effectiveCols.created_at && (
                          <td className="text-right">
                            <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-text-secondary">
                              {(() => {
                                const d = new Date(signal.created_at);
                                const date = d.toLocaleDateString("en-GB", {
                                  day: "2-digit",
                                  month: "short",
                                });
                                const time = d.toLocaleTimeString("en-GB", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: false,
                                });
                                return `${date} ${time}`;
                              })()}
                            </span>
                          </td>
                        )}

                        {/* Share — quiet until row hover (desktop) */}
                        <td
                          className="w-10 px-2 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => handleShareSignal(e, signal)}
                            title="Share signal"
                            aria-label="Share signal"
                            className={`sig-share-btn inline-flex h-7 w-7 items-center justify-center rounded-md text-accent transition-colors hover:bg-accent/12 ${
                              sharedId === signal.signal_id ? "scale-105 opacity-100" : ""
                            }`}
                          >
                            {sharedId === signal.signal_id
                              ? Ic.check("w-3.5 h-3.5")
                              : Ic.share("w-3.5 h-3.5")}
                          </button>
                        </td>

                        {/* Nothing on the row said it opens anything. */}
                        {rowHint && (
                          <td className="w-20 px-2 text-right">
                            <span
                              className="whitespace-nowrap text-[11px] font-medium"
                              style={{ color: "rgb(var(--accent-text))" }}
                            >
                              {rowHint} &rarr;
                            </span>
                          </td>
                        )}

                        {/* The row is where the want happens: a coin that won,
                            next to a dash where its entry should be. */}
                        {!isSubscriber && (
                          <td
                            className="w-28 px-2 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => (onOpenProof || onRowClick)?.(signal)}
                              title="Open this trade — the chart at the call, and where it went"
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all hover:brightness-110"
                              style={{
                                background: "rgb(var(--accent))",
                                color: "rgb(var(--accent-fg))",
                              }}
                            >
                              See proof &rarr;
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <PaginationBar className="border-t border-ink/[0.06] px-4 py-3" />
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

      {/* The compare bar is position:fixed, so it would otherwise sit on top of
          the pagination. Desktop only: <main> already carries pb-24 on mobile
          to clear the bottom nav, which is more than the bar needs. */}
      {compareSel.length > 0 && <div aria-hidden className="hidden h-14 lg:block" />}

      <SignalCompare
        items={compareSel.map((picked) => {
          // Prefer the live row when it is on the current page so status and
          // targets stay fresh; fall back to the snapshot taken at selection
          // time when a filter has scrolled it out of view.
          const sig = signals?.find((x) => x.signal_id === picked.signal_id) || picked;
          return {
            signal: sig,
            // currentPrices[pair] is sometimes a bare number and sometimes an
            // object, and volume only ever lives on the feed — never on the
            // signal row. Resolve both through the same helpers the table uses.
            price: getPrice(sig.pair),
            volume: getVolume(sig.pair),
          };
        })}
        onRemove={(id) => setCompareSel((prev) => prev.filter((s) => s.signal_id !== id))}
        onClear={() => {
          setCompareSel([]);
          setCompareOpen(false);
        }}
        onOpen={(sig) => onRowClick && onRowClick(sig)}
        open={compareOpen}
        setOpen={setCompareOpen}
      />

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
