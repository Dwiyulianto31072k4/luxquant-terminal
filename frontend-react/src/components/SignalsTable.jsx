import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import CoinLogo from "./CoinLogo";
import {
  turnoverRatio,
  turnoverBand,
  formatTurnover,
  turnoverSentence,
  turnoverToneClass,
} from "../utils/turnover";
import { readAllMyEntries, myEntryPnl, MY_ENTRY_EVENT } from "../utils/myEntries";
import { isShortSignal } from "../utils/signalDirection";
import StarButton from "./StarButton";
import { useAuth } from "../context/AuthContext";
import { watchlistApi } from "../services/watchlistApi";
import {
  coinDeskBand,
  getSignalDeskBandInfo,
  CoinDetailModal,
} from "./coinIntelShared";
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
  // Volume on its own says nothing across sizes: $101B is quiet for BTC and
  // impossible for a micro cap. Against market cap it becomes one comparable
  // number — how much of the coin changed hands today.
  { key: "turnover", label: "Turnover" },
  { key: "track_record", label: "Track Record" },
  { key: "edge_score", label: "Edge" },
  { key: "btc_corr", label: "BTC Corr" },
  { key: "verdict", label: "Pair record" },
  { key: "status", label: "Status" },
  // What changed last and how long ago. Sorting on it surfaces the calls that
  // just moved, which is the point: momentum is easier to read from a fresh
  // TP2 than from the board's ordering by call time.
  { key: "last_update", label: "Last Update" },
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
// Core always shown: pair · status · entry → target · SL (price + %) · live.
// Default = Telegram-simple; power users can turn extras on.
// ================================================================
const MOBILE_FIELDS = [
  {
    key: "verdict",
    label: "Pair record",
    hint: "this pair's win rate and how many closed calls it rests on · sorting adjusts for sample size",
  },
  { key: "risk", label: "Risk", hint: "High · Medium · Low chip" },
  { key: "vol", label: "Volume", hint: "24h volume on the card" },
  { key: "called_time", label: "Called time", hint: "When the call went out" },
];

const MOBILE_FIELDS_KEY = "lq:signals:mobile-fields:v2";

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
              Pair, entry → target, stop (price and %), and live price always stay on.
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
  emptyState = null,
  onEmptyAction = null,
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
  // The desk's own win rate, from the coin-intel payload. Without it a pair's
  // rate has nothing to be compared against, so every pair reads "in line" —
  // never a guess.
  deskWr = null,
  tagWrMap = {},
  edgeScoreMap = {},
  signalTags = {},
  onWatchlistChange = null,
  // Showcase / teaser: Price = max(live, recorded peak). Live only wins
  // when the coin is still printing a new high.
  preferBestPrice = false,
  onGuideBack = null,
  teaser = false,
}) => {
  const { t } = useTranslation();

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
  // Fills saved from the signal modal. Re-read on the modal's own event (same
  // tab) and on `storage` (another tab), because neither one covers both.
  const [myEntries, setMyEntries] = useState(readAllMyEntries);
  useEffect(() => {
    const refresh = () => setMyEntries(readAllMyEntries());
    window.addEventListener(MY_ENTRY_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(MY_ENTRY_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

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

  const pricePairsKey = JSON.stringify([...new Set(
    (allPairs?.length ? allPairs : (signals || []).map((s) => s.pair)).filter(Boolean)
  )].sort());
  useEffect(() => {
    const uniquePairs = JSON.parse(pricePairsKey);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (uniquePairs.length === 0) return;

    let alive = true;
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
          if (alive) applyMap(proxied);
          return;
        }
      } catch (err) {
        console.warn("[Prices] Backend proxy failed, trying Bybit direct:", err.message);
      }

      // 2) Fallback: direct Bybit linear (only where reachable from browser)
      try {
        const linear = await fromBybit("linear");
        if (linear) {
          if (alive) applyMap(linear);
          return;
        }
      } catch (err2) {
        console.warn("[Prices] Bybit linear failed:", err2.message);
      }

      // 3) Fallback: direct Bybit spot
      try {
        const spot = await fromBybit("spot");
        if (alive && spot) applyMap(spot);
      } catch (err3) {
        console.warn("[Prices] All providers failed:", err3.message);
      }
    };

    let fetching = false;
    const runFetch = async () => {
      if (!alive || fetching) return;
      fetching = true;
      try { await fetchPrices(); } finally { fetching = false; }
      // "Failed" only when the WHOLE map is still empty after every provider
      // tried. Individual unlisted coins staying blank is normal, not a failure.
      if (alive) setPricesFailed(Object.keys(pricesAccumRef.current).length === 0);
    };

    setPricesLoading(true);
    runFetch().finally(() => { if (alive) setPricesLoading(false); });

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
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [pricePairsKey]);

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
      const info = getSignalDeskBandInfo(coin, signal, deskWr);
      if (!info) return null;
      return {
        band: info.band,
        // Chip / LOO metrics for the cell; modal always uses full pair coin.
        coin: info.coin,
        fullCoin: info.fullCoin || coin,
        asOfEntry: !!info.asOfEntry,
      };
    }
    const v = verdictByPair?.[pair] || coinDeskBand(coin, deskWr);
    return { band: v, coin, fullCoin: coin, asOfEntry: false };
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

  // Index of the first row (in current page) whose pair is actually
  // distinguishable from the desk — the coachmark anchors to that row's cell.
  const firstVerdictIdx = useMemo(() => {
    if (!signals) return -1;
    return signals.findIndex((s) => {
      const v = getVerdict(s);
      return v && v.band && v.band !== "in_line";
    });
  }, [signals, coinIntel, verdictByPair, deskWr]);

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
      // "SL" for the same reason closed_win now reads TP4: it names the level
      // that was hit. "Loss" asserted a financial outcome the desk does not
      // measure — a call that touched TP1 and later stopped out is recorded as
      // a win by the published definition, and could well have been one.
      cls = "bg-negative/12 text-loss";
      label = "SL";
    } else if (s === "closed_win") {
      // closed_win is exactly tp4 (see outcome_to_status in signals.py), and
      // "Win" was the only status that did not name the level it reached.
      cls = "bg-profit/12 text-profit";
      label = "TP4";
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

  const EmptyView = () => (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-ink/[0.06] bg-ink/[0.03]">
        <EmptyStateIcon />
      </div>
      <p className="text-sm font-medium text-text-primary">
        {emptyState?.title || "No signals found"}
      </p>
      <p className="max-w-sm text-[12.5px] leading-snug text-text-muted">
        {emptyState?.hint || "Adjust your filters and try again"}
      </p>
      {emptyState?.actionLabel && onEmptyAction ? (
        <button
          type="button"
          onClick={() => onEmptyAction(emptyState.action)}
          className="mt-1 rounded-lg border border-ink/15 bg-surface-raised px-3.5 py-1.5 text-[12.5px] font-semibold text-text-primary transition-colors hover:border-ink/25 hover:bg-ink/[0.04]"
        >
          {emptyState.actionLabel}
        </button>
      ) : null}
    </div>
  );

  const MobileSignalCard = ({ signal }) => {
    const livePrice = getPrice(signal.pair);
    const currentPrice =
      preferBestPrice || (!isSubscriber && signal.close_price != null)
        ? bestPriceOf(signal, livePrice)
        : livePrice;
    const currentVol = getVolume(signal.pair);
    const priceChange = getPriceChange(signal.entry, currentPrice);
    const v = getVerdict(signal);
    const wr = getWinRate(signal.pair);
    const maxTarget = getMaxTarget(signal);
    const potentialPct = maxTarget != null ? calcPct(maxTarget, signal.entry) : null;
    const sl = signal.stop1 ?? signal.stop_loss;
    const slPct = sl != null ? calcPct(sl, signal.entry) : null;
    const mf = mobileFields;
    const showVerdict = !!mf.verdict;
    const showRisk = !!mf.risk;
    const showVol = !!mf.vol;
    const showCalled = !!mf.called_time;
    const edge = getEdge(signal.signal_id);
    // "E65" is a number with no unit, no scale and no direction. The bands are
    // the ones already colouring it; the words just say out loud what the
    // colour was hinting. They describe how this setup's own history compares
    // with the desk's average — not what this call will do.
    const edgeWord =
      edge && edge.score != null
        ? edge.score >= 68
          ? "well above average"
          : edge.score >= 62
            ? "above average"
            : edge.score >= 55
              ? "about average"
              : "below average"
        : null;
    const edgeChip =
      edge && edge.score != null ? (
        <span key="edge" className="flex items-baseline gap-1.5" title={edgeTitle(edge)}>
          <span
            className={`rounded-md border border-ink/[0.08] bg-ink/[0.03] px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${edgeToneCls(edge.score)}`}
          >
            Edge {Number(edge.score).toFixed(0)}
          </span>
          <span className="text-[11px] text-text-muted">{edgeWord}</span>
        </span>
      ) : null;
    // Where the price actually stands between the stop and the target. The card
    // printed all four numbers and never their relationship, so "now 0.096790"
    // against an entry of 0.096800 and a target of 0.111000 was arithmetic the
    // reader had to do on every row. Built from min/max rather than assuming
    // stop < target, because the book contains calls that read the other way.
    const railLo = [sl, signal.entry, maxTarget].filter((n) => n != null).length === 3
      ? Math.min(Number(sl), Number(signal.entry), Number(maxTarget))
      : null;
    const railHi = railLo != null
      ? Math.max(Number(sl), Number(signal.entry), Number(maxTarget))
      : null;
    const railSpan = railHi != null && railHi > railLo ? railHi - railLo : null;
    const at = (v) =>
      railSpan && v != null ? Math.max(0, Math.min(100, ((Number(v) - railLo) / railSpan) * 100)) : null;
    const entryAt = at(signal.entry);
    const nowAt = at(currentPrice);
    // Which rung this call actually reached. The card already said "Win" in the
    // corner, but the rail drew the same picture whether a call had touched TP4
    // or never left entry — the one fact a closed call is read for was missing
    // from the one place that shows the journey.
    const st = String(signal.status || "").toLowerCase();
    const reachedTp =
      st === "closed_win" || st === "tp4"
        ? 4
        : st === "tp3"
          ? 3
          : st === "tp2"
            ? 2
            : st === "tp1"
              ? 1
              : 0;
    const stoppedOut = st === "sl" || st === "closed_loss";
    const tpLevels = [signal.target1, signal.target2, signal.target3, signal.target4];
    const reachedPrice = reachedTp > 0 ? tpLevels[reachedTp - 1] : stoppedOut ? sl : null;
    const reachedAt = at(reachedPrice);

    return (
      <div className="group/card overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised transition-colors hover:border-ink/12">
        {/* Pair, E→TP, SL, live. Tap opens the call — star is the only other target. */}
        <div className="relative flex items-start gap-2 p-3.5">
          <button
            type="button"
            onClick={() => onRowClick && onRowClick(signal)}
            className="min-w-0 flex-1 text-left"
          >
            <div className="min-w-0 flex-1">
              {/* line 1 — who and where it stands. Five badges of four different
                  shapes used to share this row with no hierarchy; the pair and
                  its status are what identify a call, so they get the row and
                  the rest steps down a level. */}
              <div className="flex min-h-9 items-center gap-2 pr-9">
                <CoinLogo pair={signal.pair} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
                  {getCoinName(signal.pair)}
                  <span className="text-text-muted">/USDT</span>
                </span>
                {getStatusBadge(signal.status)}
              </div>
              {/* line 2 — the qualifiers, quiet and in one shape */}
              {(edgeChip || showRisk || showCalled) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pr-9 text-[11px] text-text-muted">
                  {edgeChip}
                  {showRisk ? (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getRiskClasses(signal.risk_level)}`}>
                      {getRiskLabel(signal.risk_level)}
                    </span>
                  ) : null}
                  {showCalled && signal.created_at ? (
                    <span className="font-mono tabular-nums">
                      called {formatTimeAgo(signal.created_at)}
                    </span>
                  ) : null}
                </div>
              )}
              {/* line 3 — the three published prices. Percentages sit beside the
                  price they belong to rather than a line below it, so a column
                  is one fact and not two stacked ones. */}
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-ink/[0.06] pt-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-text-muted">Entry</div>
                  <div className="mt-1 break-all font-mono text-xs tabular-nums text-text-primary">
                    {formatPrice(signal.entry)}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-text-muted">
                    Target{" "}
                    {potentialPct != null ? (
                      <span className="font-mono tabular-nums text-profit">
                        +{potentialPct.toFixed(1)}%
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 break-all font-mono text-xs tabular-nums text-profit">
                    {maxTarget != null ? formatPrice(maxTarget) : "—"}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-text-muted">
                    Stop{" "}
                    {slPct != null ? (
                      <span className="font-mono tabular-nums text-loss">
                        {slPct.toFixed(1)}%
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 break-all font-mono text-xs tabular-nums text-loss">
                    {sl != null ? formatPrice(sl) : "—"}
                  </div>
                </div>
              </div>
              {/* line 4 — stop · entry · now · target on one rail */}
              {railSpan ? (
                <div className="mt-3">
                  <div className="relative h-1.5 rounded-full bg-ink/[0.07]">
                    {nowAt != null && entryAt != null ? (
                      <span
                        className={`absolute top-0 h-full rounded-full ${
                          priceChange != null && priceChange < 0 ? "bg-loss/45" : "bg-profit/45"
                        }`}
                        style={{
                          left: `${Math.min(entryAt, nowAt)}%`,
                          width: `${Math.abs(nowAt - entryAt)}%`,
                        }}
                      />
                    ) : null}
                    {/* How far it got, drawn solid over the live band: on a call
                        that has closed, where the price is now and how far it
                        travelled are two different facts. */}
                    {reachedAt != null && entryAt != null ? (
                      <span
                        className={`absolute top-0 h-full rounded-full ${
                          stoppedOut ? "bg-loss" : "bg-profit"
                        }`}
                        style={{
                          left: `${Math.min(entryAt, reachedAt)}%`,
                          width: `${Math.abs(reachedAt - entryAt)}%`,
                        }}
                      />
                    ) : null}
                    {/* Every rung, so an unreached one is visibly unreached. */}
                    {tpLevels.map((tp, i) => {
                      const pos = at(tp);
                      if (pos == null) return null;
                      const hit = i < reachedTp;
                      return (
                        <span
                          key={`tp${i}`}
                          title={`TP${i + 1} ${formatPrice(tp)}${hit ? " — reached" : ""}`}
                          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm ${
                            hit ? "h-3 w-[3px] bg-profit" : "h-2 w-px bg-ink/30"
                          }`}
                          style={{ left: `${pos}%` }}
                        />
                      );
                    })}
                    <span
                      className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-text-muted"
                      style={{ left: `${entryAt}%` }}
                    />
                    {nowAt != null ? (
                      <span
                        title={`Now ${formatPrice(currentPrice)}`}
                        className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-raised ${
                          priceChange != null && priceChange < 0 ? "bg-loss" : "bg-profit"
                        }`}
                        // Held off the ends: at a true 0% or 100% the dot is
                        // half outside the track and reads as clipped.
                        style={{ left: `${Math.max(2, Math.min(98, nowAt))}%` }}
                      />
                    ) : null}
                  </div>
                  {/* Three labels, not two: an unlabelled tick between Stop and
                      Target is the one mark on the card a reader has to guess at. */}
                  <div className="relative mt-1 h-3 font-mono text-[9px] uppercase tracking-wide text-text-muted">
                    <span
                      className={`absolute left-0 ${stoppedOut ? "font-semibold text-loss" : ""}`}
                    >
                      {Number(sl) < Number(maxTarget)
                        ? stoppedOut
                          ? "Stop ✓"
                          : "Stop"
                        : "Target"}
                    </span>
                    <span
                      className="absolute -translate-x-1/2 whitespace-nowrap text-text-secondary"
                      style={{ left: `${Math.max(12, Math.min(88, entryAt))}%` }}
                    >
                      Entry
                    </span>
                    {/* The far end is TP4 by construction, so when the call got
                        there the end label says so rather than staying generic. */}
                    <span
                      className={`absolute right-0 ${reachedTp === 4 ? "font-semibold text-profit" : ""}`}
                    >
                      {Number(sl) < Number(maxTarget)
                        ? reachedTp === 4
                          ? "TP4 ✓"
                          : "Target"
                        : "Stop"}
                    </span>
                    {/* A rung short of the end gets its own marker where it sits.
                        Held clear of the Entry label, which is only a few percent
                        away on a tight ladder. */}
                    {reachedTp > 0 && reachedTp < 4 && reachedAt != null ? (
                      <span
                        className="absolute -translate-x-1/2 whitespace-nowrap font-semibold text-profit"
                        style={{
                          left: `${Math.max(Math.min(entryAt + 16, 82), Math.min(reachedAt, 82))}%`,
                        }}
                      >
                        TP{reachedTp} ✓
                      </span>
                    ) : null}

                  </div>
                </div>
              ) : null}
              {/* line 5 — live price, then the optional facts. Every number here
                  used to run together unlabelled: "-0.01% now 0.096790 81.5% ·
                  n=81 vol $8.0M 16m ago" is six facts in one sentence, and the
                  81.5% never said what it was the win rate OF. */}
              <div className="relative mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-t border-ink/[0.06] pt-2.5 pr-6 text-xs">
                <span className="flex items-baseline gap-1.5">
                  <span className="text-[11px] text-text-muted">Now</span>
                  <span className="font-mono tabular-nums text-text-primary">
                    {currentPrice ? formatPrice(currentPrice) : "—"}
                  </span>
                  {priceChange !== null ? (
                    <span
                      className={`font-mono text-[11px] font-medium tabular-nums ${
                        priceChange >= 0 ? "text-profit" : "text-loss"
                      }`}
                    >
                      {priceChange >= 0 ? "+" : ""}
                      {priceChange.toFixed(2)}%
                    </span>
                  ) : null}
                </span>
                {(() => {
                  const mine = myEntries[signal.signal_id];
                  if (!mine) return null;
                  const pnl = myEntryPnl(mine, currentPrice, isShortSignal(signal));
                  return (
                    <span
                      className="flex items-baseline gap-1.5"
                      title="Your own fill, saved on this device"
                    >
                      <span className="text-[11px] text-text-muted">Your fill</span>
                      <span className="font-mono text-[11px] tabular-nums text-text-secondary">
                        {formatPrice(mine)}
                      </span>
                      {pnl != null ? (
                        <span
                          className={`font-mono text-[11px] font-medium tabular-nums ${pnl >= 0 ? "text-profit" : "text-loss"}`}
                        >
                          {pnl >= 0 ? "+" : ""}
                          {pnl.toFixed(2)}%
                        </span>
                      ) : null}
                    </span>
                  );
                })()}
                {showVerdict && v && v.coin?.win_rate != null ? (
                  <span
                    className="flex items-baseline gap-1.5"
                    title={`This pair has closed ${v.coin.closed_trades ?? 0} calls, ${v.coin.win_rate}% of which reached TP1 or better`}
                  >
                    <span className="text-[11px] text-text-muted">This pair</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
                        v.band === "below"
                          ? "bg-negative/12 text-loss"
                          : v.band === "above"
                            ? "bg-profit/12 text-profit"
                            : "bg-ink/[0.04] text-text-secondary"
                      }`}
                    >
                      {v.coin.win_rate}% of {v.coin.closed_trades ?? 0} past calls hit TP1+
                    </span>
                  </span>
                ) : showVerdict && wr != null ? (
                  <span
                    className="flex items-baseline gap-1.5"
                    title="Share of this pair's past calls that reached TP1 or better"
                  >
                    <span className="text-[11px] text-text-muted">This pair</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums ${wr >= 70 ? "bg-profit/12 text-profit" : wr >= 50 ? "bg-accent/12 text-accent" : "bg-negative/12 text-loss"}`}
                    >
                      {wr}%
                    </span>
                  </span>
                ) : null}
                {/* Volume and turnover are the same fact twice — the dollars and
                    what they mean for a coin this size — so they share a line
                    rather than each taking one. */}
                {(() => {
                  const ratio = turnoverRatio(currentVol, signal.market_cap);
                  if (!showVol || !currentVol) {
                    if (ratio == null) return null;
                    return (
                      <span className="flex items-baseline gap-1.5" title={turnoverSentence(ratio)}>
                        <span className="text-[11px] text-text-muted">Turnover</span>
                        <span className={`font-mono text-[11px] tabular-nums ${turnoverToneClass(ratio)}`}>
                          {formatTurnover(ratio)}
                        </span>
                        <span className="text-[11px] text-text-muted">of mcap</span>
                      </span>
                    );
                  }
                  return (
                    <span
                      className="flex items-baseline gap-1.5"
                      title={ratio != null ? turnoverSentence(ratio) : undefined}
                    >
                      <span className="text-[11px] text-text-muted">Vol</span>
                      <span className="font-mono text-[11px] tabular-nums text-text-secondary">
                        {formatVolume(currentVol)}
                      </span>
                      {ratio != null ? (
                        <span className="text-[11px] text-text-muted">
                          ·{" "}
                          <span className={`font-mono tabular-nums ${turnoverToneClass(ratio)}`}>
                            {formatTurnover(ratio)}
                          </span>{" "}
                          of mcap, {turnoverBand(ratio).label.toLowerCase()}
                        </span>
                      ) : null}
                    </span>
                  );
                })()}
                {/* The card has always opened the call. Nothing on it said so,
                    so the chevron sits where a reader's eye finishes — bottom
                    right, after the last figure. */}
                <span
                  aria-hidden
                  className="absolute bottom-0 right-0 text-text-muted/70 transition-colors group-hover/card:text-accent"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </span>
              </div>
            </div>
          </button>
          {!teaser ? (
            <div
              className="absolute right-2 top-2"
              onClick={(e) => e.stopPropagation()}
            >
              <StarButton
                signalId={signal.signal_id}
                isStarred={watchlistIds.includes(signal.signal_id)}
                onToggle={handleStarToggle}
              />
            </div>
          ) : null}
        </div>
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
              Finished sample
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
        {/* Mobile toolbar — Fields (not desktop Columns). Hidden on the
            3-row VIP teaser: the parent already named the sample. */}
        {!teaser ? (
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
        ) : null}

        {loading ? (
          <MobileLoadingSkeleton />
        ) : signals?.length === 0 ? (
          <div className="rounded-xl border border-ink/[0.07] bg-surface-raised">
            <EmptyView />
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
          {!teaser ? (
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
          ) : null}

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
    loses row identity — opaque bg so body cells don't bleed through.
    .sig-teaser drops compare/star, so pair is column 1. */
 .sig-t tbody tr { background: rgb(var(--surface-raised)); }
 .sig-t tbody tr:hover { background: color-mix(in srgb, rgb(var(--ink)) 3.5%, rgb(var(--surface-raised))); }
 .sig-t:not(.sig-teaser) th:nth-child(1), .sig-t:not(.sig-teaser) td:nth-child(1),
 .sig-t:not(.sig-teaser) th:nth-child(2), .sig-t:not(.sig-teaser) td:nth-child(2),
 .sig-t:not(.sig-teaser) th:nth-child(3), .sig-t:not(.sig-teaser) td:nth-child(3) {
   position: sticky;
   background: inherit;
   z-index: 1;
 }
 .sig-t:not(.sig-teaser) th:nth-child(1), .sig-t:not(.sig-teaser) td:nth-child(1) {
   width: 42px;
   padding-left: 14px !important;
   padding-right: 8px !important;
   left: 0;
 }
 .sig-t:not(.sig-teaser) th:nth-child(2), .sig-t:not(.sig-teaser) td:nth-child(2) {
   width: 38px;
   padding-left: 6px !important;
   padding-right: 6px !important;
   left: 42px;
 }
 .sig-t:not(.sig-teaser) th:nth-child(3), .sig-t:not(.sig-teaser) td:nth-child(3) {
   left: 80px;
   box-shadow: 1px 0 0 rgb(var(--ink) / 0.07);
 }
 .sig-t:not(.sig-teaser) thead th:nth-child(1),
 .sig-t:not(.sig-teaser) thead th:nth-child(2),
 .sig-t:not(.sig-teaser) thead th:nth-child(3) {
   z-index: 3;
   background: rgb(var(--surface-raised));
 }
 .sig-t.sig-teaser th:nth-child(1), .sig-t.sig-teaser td:nth-child(1) {
   position: sticky;
   left: 0;
   background: inherit;
   z-index: 1;
   box-shadow: 1px 0 0 rgb(var(--ink) / 0.07);
 }
 .sig-t.sig-teaser thead th:nth-child(1) {
   z-index: 3;
   background: rgb(var(--surface-raised));
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
            <table className={`sig-t sig-${density} ${teaser ? "sig-teaser" : ""} w-full min-w-[980px] border-collapse text-left whitespace-nowrap`}>
              <thead>
                <tr className="border-b border-ink/[0.07] text-text-muted">
                  {!teaser ? (
                    <>
                  <th className="w-11 text-center">
                    <span className="sr-only">Compare</span>
                  </th>
                  <th className="w-10 text-center">
                    <span className="sr-only">Watchlist</span>
                  </th>
                    </>
                  ) : null}
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
                  {effectiveCols.turnover && (
                    <th className="select-none px-3 py-2.5 text-right">
                      <span className="inline-flex items-center justify-end gap-1.5 text-[11px] font-medium">
                        {/* The explanation belongs beside the number, not in a
                            hover title a phone can never open. */}
                        <InfoTip
                          side="bottom"
                          title="Turnover · 24h"
                          text="24h volume divided by market cap — how much of the coin changed hands today. Volume is live; market cap is the figure recorded with the call. Across coins: very heavy is 30%+ (top 5%), heavy 10–30%, active 4–10%, and half of all coins sit below 4%. It measures activity, not direction."
                        />
                        <button
                          type="button"
                          title={
                            sortRank("turnover")
                              ? `Sort level ${sortRank("turnover")} · Shift+click to stack`
                              : "Click sort · Shift+click add"
                          }
                          onClick={(e) => onSort && onSort("turnover", e)}
                          className={`inline-flex items-center gap-0.5 transition-colors ${sortRank("turnover") ? "text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
                        >
                          Turnover
                        </button>
                      </span>
                    </th>
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
                    <SortableHeader field="verdict" label="Pair record" align="center" />
                  )}
                  {effectiveCols.status && (
                    <SortableHeader field="status" label="Status" align="center" />
                  )}
                  {effectiveCols.last_update && (
                    <SortableHeader field="last_update" label="Updated" align="right" />
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
                    <td colSpan={visibleColCount} className="py-8">
                      <EmptyView />
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
                        {!teaser ? (
                          <>
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
                          </>
                        ) : null}

                        <td>
                          <div className="flex items-center gap-2.5">
                            <CoinLogo pair={signal.pair} size={26} />
                            <div className="leading-tight">
                              <p className="text-[13px] font-medium text-text-primary transition-colors group-hover:text-accent">
                                {getCoinName(signal.pair)}
                                <span className="text-text-muted">/USDT</span>
                              </p>
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
                            {(() => {
                              const mine = myEntries[signal.signal_id];
                              if (!mine) return null;
                              const pnl = myEntryPnl(mine, currentPrice, isShortSignal(signal));
                              return (
                                <span
                                  className="mt-0.5 block whitespace-nowrap font-mono text-[10px] tabular-nums text-text-muted"
                                  title="Your own fill, saved on this device"
                                >
                                  you {formatPrice(mine)}
                                  {pnl != null ? (
                                    <span
                                      className={`ml-1 font-medium ${pnl >= 0 ? "text-profit" : "text-loss"}`}
                                    >
                                      {pnl >= 0 ? "+" : ""}
                                      {pnl.toFixed(2)}%
                                    </span>
                                  ) : null}
                                </span>
                              );
                            })()}
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
                              /* Live volume is missing for this pair, so this is
                                 the exchange volume RANK recorded at call time —
                                 a different quantity from the dollars above it.
                                 Unmarked, "12/50" reads as a number in a column
                                 headed "Vol 24h". The # says which one it is. */
                              <span
                                title={`Volume rank ${signal.volume_rank_num} of ${signal.volume_rank_den} when the call went out — live 24h volume is unavailable for this pair`}
                                className="font-mono text-[13px] tabular-nums text-text-muted"
                              >
                                #{signal.volume_rank_num}
                                <span className="text-text-muted/60">
                                  /{signal.volume_rank_den}
                                </span>
                              </span>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                        )}

                        {effectiveCols.turnover && (
                          <td className="text-right">
                            {(() => {
                              const ratio = turnoverRatio(currentVol, signal.market_cap);
                              if (ratio == null)
                                return (
                                  <span
                                    className="text-text-muted"
                                    title={
                                      currentVol
                                        ? "No market cap was recorded with this call, so turnover cannot be worked out."
                                        : "Live 24h volume is unavailable for this pair."
                                    }
                                  >
                                    —
                                  </span>
                                );
                              const band = turnoverBand(ratio);
                              return (
                                <span
                                  className="inline-flex flex-col items-end leading-tight"
                                  title={turnoverSentence(ratio)}
                                >
                                  <span
                                    className={`font-mono text-[13px] tabular-nums ${turnoverToneClass(ratio)}`}
                                  >
                                    {formatTurnover(ratio)}
                                  </span>
                                  <span className="text-[10px] text-text-muted">{band.label}</span>
                                </span>
                              );
                            })()}
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
                              if (!v) return <span className="text-xs text-text-muted">—</span>;
                              // The cell shows the pair's record, shrunk, with
                              // the sample it rests on. It used to show a
                              // Worth / Avoid badge and then an em-dash once
                              // the badge was retired, which is the one thing
                              // a column must never be: present and empty.
                              const rate = v.coin?.win_rate;
                              const closed = v.coin?.closed_trades ?? null;
                              if (rate == null)
                                return <span className="text-xs text-text-muted">—</span>;
                              const isBelow = v.band === "below";
                              const flagged = v.band === "above" || v.band === "below";
                              const showHint = showVerdictHint && idx === firstVerdictIdx;
                              const modalCoin = v.fullCoin || v.coin;
                              const title = v.asOfEntry
                                ? `${rate}% of this pair's ${closed ?? 0} past calls reached TP1 or better, excluding this call's own outcome — a record, not a prediction`
                                : `${rate}% of this pair's ${closed ?? 0} past calls reached TP1 or better — a record, not a prediction`;
                              return (
                                <div className="relative inline-block">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShowVerdictHint(false);
                                      setSelectedCoinIntel(modalCoin);
                                    }}
                                    title={title}
                                    className={`group/vd inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums transition-all hover:brightness-110 ${
                                      flagged
                                        ? isBelow
                                          ? "bg-negative/12 text-loss"
                                          : "bg-profit/12 text-profit"
                                        : "bg-ink/[0.04] text-text-secondary"
                                    } ${showHint ? "ring-2 ring-accent/45 ring-offset-1 ring-offset-[rgb(var(--surface-raised))]" : ""}`}
                                  >
                                    <span>{rate}%</span>
                                    {closed != null && (
                                      // "n=99" is a statistician's shorthand in a
                                      // column read by traders; "of 99" says the
                                      // same thing without the training.
                                      <span className="text-[10px] opacity-60">of {closed}</span>
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
                                            ? "This pair’s record with this call’s own outcome excluded. It is a record, not a prediction — a pair’s past does not change the odds on its next call."
                                            : "This pair’s record so far. It is a record, not a prediction — a pair’s past does not change the odds on its next call."}
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

                        {effectiveCols.last_update && (
                          <td className="text-right">
                            {signal.last_update_at ? (
                              <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                                {getUpdateTypeBadge(signal.last_update_type)}
                                <span className="font-mono text-[11px] tabular-nums text-text-muted">
                                  {formatTimeAgo(signal.last_update_at)}
                                </span>
                              </span>
                            ) : (
                              <span className="font-mono text-[11px] text-text-muted/40">—</span>
                            )}
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
          deskWr={deskWr}
          onClose={() => setSelectedCoinIntel(null)}
        />
      )}
    </>
  );
};

export default SignalsTable;
