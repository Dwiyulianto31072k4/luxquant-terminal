// src/components/WatchlistPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Watchlist Page v2 (Flowscan reskin)
// 100% aligned with backend /api/v1/watchlist/ + /api/v1/market/prices
// Tabel dense + expandable row + filter/sort/group
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { watchlistApi } from "../services/watchlistApi";
import StarButton from "./StarButton";
import CoinLogo from "./CoinLogo";
import SignalModal from "./SignalModal";
import AssistantWidget from "./assistant/AssistantWidget";
import { ShimmerStyles } from "./ui/Loaders";

const API_BASE = import.meta.env.VITE_API_URL || "";
const PRICE_REFRESH_INTERVAL = 15000;

// ── Filter options ──
const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "tp_hit", label: "TP Hit" },
  { key: "closed_win", label: "Closed Win" },
  { key: "closed_loss", label: "Closed Loss" },
];

const SORT_OPTIONS = [
  { key: "recent", label: "Recently Added" },
  { key: "pnl_desc", label: "P&L: High → Low" },
  { key: "pnl_asc", label: "P&L: Low → High" },
  { key: "pair_asc", label: "Pair: A → Z" },
];

// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
const WatchlistPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPrices, setCurrentPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("recent");
  const [search, setSearch] = useState("");

  const pairsRef = useRef("");
  const intervalRef = useRef(null);

  // ─── Fetch watchlist ───
  useEffect(() => {
    const fetchWatchlist = async () => {
      try {
        const data = await watchlistApi.getWatchlist();
        setWatchlist(data.items || []);
      } catch (error) {
        console.error("Failed to fetch watchlist:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchWatchlist();
  }, []);

  // ─── Fetch prices ───
  useEffect(() => {
    if (watchlist.length === 0) return;

    const uniquePairs = [...new Set(watchlist.map((item) => item.pair).filter(Boolean))].sort();
    const newKey = uniquePairs.join(",");

    if (newKey === pairsRef.current) return;
    pairsRef.current = newKey;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (uniquePairs.length === 0) return;

    const fetchPrices = async () => {
      try {
        const response = await fetch(
          `${API_BASE}/api/v1/market/prices?symbols=${uniquePairs.join(",")}`
        );
        if (response.ok) {
          const priceMap = await response.json();
          if (Object.keys(priceMap).length > 0) {
            setCurrentPrices(priceMap);
            return;
          }
        }
      } catch (error) {
        console.error("Failed to fetch prices:", error);
      }
    };

    setPricesLoading(true);
    fetchPrices().finally(() => setPricesLoading(false));
    intervalRef.current = setInterval(fetchPrices, PRICE_REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [watchlist]);

  // ─── Handlers & Helpers ───
  const handleRemove = (signalId) => {
    setWatchlist((prev) => prev.filter((item) => item.signal_id !== signalId));
  };

  const getPrice = useCallback(
    (pair) => {
      const data = currentPrices[pair];
      if (!data) return null;
      if (typeof data === "number") return data;
      return data.price ?? null;
    },
    [currentPrices]
  );

  const getVolume = useCallback(
    (pair) => {
      const data = currentPrices[pair];
      if (!data || typeof data === "number") return null;
      return data.volume ?? null;
    },
    [currentPrices]
  );

  const calcPct = (target, entry) => {
    if (!target || !entry) return null;
    const tNum = parseFloat(target);
    const eNum = parseFloat(entry);
    if (isNaN(tNum) || isNaN(eNum) || eNum === 0) return null;
    return ((tNum - eNum) / eNum) * 100;
  };

  const getPriceChange = (entry, current) => {
    if (!entry || !current) return null;
    return ((current - entry) / entry) * 100;
  };

  const getMaxTarget = (item) => {
    const targets = [item.target4, item.target3, item.target2, item.target1].filter(Boolean);
    return targets.length > 0 ? Math.max(...targets.map(Number)) : null;
  };

  const formatPrice = (price) => {
    if (!price && price !== 0) return "—";
    const num = parseFloat(price);
    if (isNaN(num)) return "—";
    if (num < 0.001) return num.toFixed(8);
    if (num < 1) return num.toFixed(6);
    if (num < 10) return num.toFixed(4);
    return num.toFixed(2);
  };

  const formatVolume = (vol) => {
    if (!vol) return "—";
    const num = parseFloat(vol);
    if (isNaN(num)) return "—";
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(0)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
    return `$${num.toFixed(0)}`;
  };

  const formatDateTime = (dt) => {
    if (!dt) return "—";
    const d = new Date(dt);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatDateTimeShort = (dt) => {
    if (!dt) return "—";
    const d = new Date(dt);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };

  const getCoinName = (pair) => (pair ? pair.replace(/USDT$/i, "") : "");

  // ── Semantic 3-tier badge style ──
  const riskStyle = (risk) => {
    const r = risk?.toLowerCase() || "";
    if (r.startsWith("low")) return "bg-profit/10 text-profit border-profit/25";
    if (r.startsWith("med") || r.startsWith("nor")) return "bg-accent/12 text-accent border-ink/12";
    if (r.startsWith("high")) return "bg-loss/10 text-loss border-loss/25";
    return "bg-ink/[0.04] text-text-primary/70 border-ink/[0.08]";
  };

  const riskLabel = (risk) => {
    const r = risk?.toLowerCase() || "";
    if (r.startsWith("low")) return "Low";
    if (r.startsWith("med") || r.startsWith("nor")) return "Normal";
    if (r.startsWith("high")) return "High";
    return risk || "—";
  };

  // ── Status: 3-tier (open=neutral, profit=gold, loss=red) ──
  const statusStyle = (status) => {
    const s = status?.toLowerCase() || "";
    if (s.includes("loss") || s === "sl") return "bg-loss/10 text-loss border-loss/25";
    if (s === "open") return "bg-ink/[0.04] text-text-primary/70 border-ink/[0.08]";
    if (s.startsWith("tp") || s.includes("win")) return "border-profit/25 bg-profit/10 text-profit";
    return "bg-ink/[0.04] text-text-primary/70 border-ink/[0.08]";
  };

  const statusLabel = (status) => {
    const s = status?.toLowerCase() || "";
    const map = {
      open: "OPEN",
      tp1: "TP1",
      tp2: "TP2",
      tp3: "TP3",
      tp4: "TP4",
      closed_win: "WIN",
      closed_loss: "LOSS",
      sl: "SL",
    };
    return map[s] || (status || "—").toUpperCase();
  };

  // ── Filter + sort logic (frontend compute, no backend change) ──
  const filteredWatchlist = useMemo(() => {
    let list = [...watchlist];

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (item) =>
          (item.pair || "").toLowerCase().includes(q) ||
          getCoinName(item.pair).toLowerCase().includes(q)
      );
    }

    // Status filter
    if (statusFilter !== "all") {
      list = list.filter((item) => {
        const s = item.status?.toLowerCase() || "";
        if (statusFilter === "open") return s === "open";
        if (statusFilter === "tp_hit") return s.startsWith("tp");
        if (statusFilter === "closed_win") return s === "closed_win";
        if (statusFilter === "closed_loss") return s === "closed_loss" || s === "sl";
        return true;
      });
    }

    // Sort
    list.sort((a, b) => {
      if (sortKey === "recent") {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      if (sortKey === "pair_asc") {
        return (a.pair || "").localeCompare(b.pair || "");
      }
      if (sortKey === "pnl_desc" || sortKey === "pnl_asc") {
        const aPnl = getPriceChange(a.entry, getPrice(a.pair)) ?? -Infinity;
        const bPnl = getPriceChange(b.entry, getPrice(b.pair)) ?? -Infinity;
        return sortKey === "pnl_desc" ? bPnl - aPnl : aPnl - bPnl;
      }
      return 0;
    });

    return list;
  }, [watchlist, search, statusFilter, sortKey, getPrice]);

  // ── Summary stats ──
  const summary = useMemo(() => {
    const open = watchlist.filter((w) => w.status?.toLowerCase() === "open").length;
    let inProfit = 0;
    let inLoss = 0;
    let totalPnl = 0;
    let pnlCount = 0;
    watchlist.forEach((w) => {
      const cp = getPrice(w.pair);
      if (cp && w.entry) {
        if (cp > w.entry) inProfit++;
        else if (cp < w.entry) inLoss++;
        const pct = getPriceChange(w.entry, cp);
        if (pct !== null) {
          totalPnl += pct;
          pnlCount++;
        }
      }
    });
    return {
      total: watchlist.length,
      open,
      inProfit,
      inLoss,
      avgPnl: pnlCount > 0 ? totalPnl / pnlCount : null,
    };
  }, [watchlist, getPrice]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-4 pb-10">
        <SectionHeader label="Watchlist" />
        <LoadingSkeleton />
      </div>
    );
  }

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  return (
    <div className="space-y-4 pb-10">
      {/* HEADER */}
      <div className="space-y-4">
        <SectionHeader label="Watchlist" />
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight">
              {t("watchlist.title") || "Watchlist"}
            </h1>
            <p className="text-text-muted text-sm mt-1.5 font-mono">
              {watchlist.length} {watchlist.length === 1 ? "signal" : "signals"} tracked
              {filteredWatchlist.length !== watchlist.length && (
                <span className="text-text-muted"> · {filteredWatchlist.length} showing</span>
              )}
            </p>
          </div>
          {watchlist.length > 0 && (
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-ink/[0.03] border border-ink/[0.06] text-text-muted">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    pricesLoading
                      ? "bg-accent animate-pulse"
                      : Object.keys(currentPrices).length > 0
                        ? "bg-profit animate-pulse"
                        : "bg-red-400"
                  }`}
                />
                <span className="uppercase tracking-[0.15em]">
                  {pricesLoading
                    ? "Updating"
                    : Object.keys(currentPrices).length > 0
                      ? "Live"
                      : "Offline"}
                </span>
              </span>
              <span className="px-3 py-1.5 rounded-md bg-ink/[0.03] border border-ink/[0.06] text-text-muted">
                <span className="uppercase tracking-[0.15em] text-[10px]">Refresh</span>
                <span className="ml-2 text-text-primary tabular-nums">15s</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {watchlist.length === 0 ? (
        <EmptyState onBrowse={() => navigate("/signals")} />
      ) : (
        <>
          {/* SUMMARY STATS */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total" value={summary.total} sublabel="Tracked signals" />
            <StatCard
              label="Open"
              value={summary.open}
              sublabel="Active signals"
              isLive={summary.open > 0}
            />
            <StatCard
              label="In Profit"
              value={summary.inProfit}
              sublabel={`vs ${summary.inLoss} in loss`}
              isGold={summary.inProfit > summary.inLoss}
            />
            <StatCard
              label="Avg P&L"
              value={
                summary.avgPnl !== null
                  ? `${summary.avgPnl >= 0 ? "+" : ""}${summary.avgPnl.toFixed(1)}%`
                  : "—"
              }
              sublabel="Across all signals"
              isGold={summary.avgPnl !== null && summary.avgPnl >= 0}
              isDanger={summary.avgPnl !== null && summary.avgPnl < 0}
            />
          </div>

          {/* FILTER BAR */}
          <div className="space-y-3">
            {/* Status chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              {STATUS_FILTERS.map(({ key, label }) => {
                const count =
                  key === "all"
                    ? watchlist.length
                    : watchlist.filter((item) => {
                        const s = item.status?.toLowerCase() || "";
                        if (key === "open") return s === "open";
                        if (key === "tp_hit") return s.startsWith("tp");
                        if (key === "closed_win") return s === "closed_win";
                        if (key === "closed_loss") return s === "closed_loss" || s === "sl";
                        return false;
                      }).length;
                const active = statusFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key)}
                    className={`shrink-0 px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-[0.1em] transition-all border whitespace-nowrap ${
                      active
                        ? "bg-accent text-accent-fg border-ink/15"
                        : "bg-ink/[0.02] text-text-muted border-ink/[0.06] hover:text-text-primary hover:border-ink/[0.12]"
                    }`}
                  >
                    {label}
                    <span
                      className={`ml-1.5 tabular-nums ${active ? "text-text-muted" : "text-text-muted/60"}`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search + sort */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 min-w-0">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search by pair..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-ink/[0.02] border border-ink/[0.06] rounded-md text-sm text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-ink/15 transition-colors font-mono"
                />
              </div>

              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="px-3 py-2 bg-ink/[0.02] border border-ink/[0.06] rounded-md text-xs font-mono uppercase tracking-[0.1em] text-text-muted hover:text-text-primary focus:outline-none focus:border-ink/15 transition-colors cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option
                    key={opt.key}
                    value={opt.key}
                    className="bg-surface-raised text-text-primary"
                  >
                    Sort: {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ════════════════════════════════════════ */}
          {/* MOBILE VIEW (<lg): Card Layout */}
          {/* ════════════════════════════════════════ */}
          <div className="lg:hidden space-y-1.5">
            <SectionHeader label="Signals" small />
            {filteredWatchlist.length === 0 ? (
              <NoMatch />
            ) : (
              filteredWatchlist.map((item) => (
                <MobileCard
                  key={item.id}
                  item={item}
                  currentPrice={getPrice(item.pair)}
                  currentVol={getVolume(item.pair)}
                  pricesLoading={pricesLoading}
                  formatPrice={formatPrice}
                  formatVolume={formatVolume}
                  formatDateTimeShort={formatDateTimeShort}
                  calcPct={calcPct}
                  getPriceChange={getPriceChange}
                  getCoinName={getCoinName}
                  riskStyle={riskStyle}
                  riskLabel={riskLabel}
                  statusStyle={statusStyle}
                  statusLabel={statusLabel}
                  onClick={() => setSelectedSignal(item)}
                  onRemove={() => handleRemove(item.signal_id)}
                />
              ))
            )}
          </div>

          {/* ════════════════════════════════════════ */}
          {/* DESKTOP VIEW (lg+): Tabel Dense */}
          {/* ════════════════════════════════════════ */}
          <div className="hidden lg:block space-y-3">
            <SectionHeader label="Signals" small />

            {filteredWatchlist.length === 0 ? (
              <NoMatch />
            ) : (
              <div className="relative overflow-hidden bg-surface-raised border border-ink/[0.06] rounded-md">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-ink/[0.06]">
                        <Th align="center" width="40">
                          <span className="sr-only">Star</span>
                        </Th>
                        <Th align="left">Pair</Th>
                        <Th align="right">Current</Th>
                        <Th align="right">Entry</Th>
                        <Th align="right">P&L</Th>
                        <Th align="right">Max Target</Th>
                        <Th align="right">Stop Loss</Th>
                        <Th align="center">Risk</Th>
                        <Th align="center">Status</Th>
                        <Th align="right">Added</Th>
                        <Th align="center" width="40">
                          <span className="sr-only">Expand</span>
                        </Th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWatchlist.map((item) => {
                        const currentPrice = getPrice(item.pair);
                        const currentVol = getVolume(item.pair);
                        const priceChange = getPriceChange(item.entry, currentPrice);
                        const maxTarget = getMaxTarget(item);
                        const isExpanded = expandedRow === item.id;

                        return (
                          <DesktopRow
                            key={item.id}
                            item={item}
                            currentPrice={currentPrice}
                            currentVol={currentVol}
                            priceChange={priceChange}
                            maxTarget={maxTarget}
                            isExpanded={isExpanded}
                            pricesLoading={pricesLoading}
                            formatPrice={formatPrice}
                            formatVolume={formatVolume}
                            formatDateTime={formatDateTime}
                            calcPct={calcPct}
                            getCoinName={getCoinName}
                            riskStyle={riskStyle}
                            riskLabel={riskLabel}
                            statusStyle={statusStyle}
                            statusLabel={statusLabel}
                            onToggle={() => setExpandedRow(isExpanded ? null : item.id)}
                            onOpenModal={() => setSelectedSignal(item)}
                            onRemove={() => handleRemove(item.signal_id)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Hint */}
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/50 text-center">
            Click ★ to remove · Click row to expand
          </p>
        </>
      )}

      {/* Modal */}
      {selectedSignal && (
        <SignalModal
          signal={selectedSignal}
          isOpen={!!selectedSignal}
          onClose={() => setSelectedSignal(null)}
        />
      )}

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="watchlist" />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// SECTION HEADER
// ════════════════════════════════════════════════════════════════
const SectionHeader = ({ label, small = false }) => (
  <div className="flex items-center gap-3">
    <span
      className={`font-mono uppercase tracking-[0.25em] text-text-muted ${
        small ? "text-[10px]" : "text-[11px]"
      }`}
    >
      {label}
    </span>
  </div>
);

// ════════════════════════════════════════════════════════════════
// STAT CARD
// ════════════════════════════════════════════════════════════════
const StatCard = ({ label, value, sublabel, isLive, isGold, isDanger }) => (
  <div className="relative overflow-hidden bg-surface-raised border border-ink/[0.06] rounded-md p-4 shadow-[inset_0_1px_0_0_rgb(var(--ink)_/_0.04)]">
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-mono">
          {label}
        </span>
        {isLive && <span className="w-1.5 h-1.5 rounded-full bg-profit animate-pulse" />}
      </div>
      <div
        className={`text-xl sm:text-2xl font-mono tabular-nums mb-1.5 truncate ${
          isDanger ? "text-loss" : isGold ? "text-accent" : "text-text-primary"
        }`}
      >
        {value}
      </div>
      {sublabel && (
        <div className="text-[10px] font-mono text-text-muted/70 truncate">{sublabel}</div>
      )}
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════
// DESKTOP TABLE HELPERS
// ════════════════════════════════════════════════════════════════
const Th = ({ children, align = "left", width }) => (
  <th
    className={`py-3 px-3 text-${align} text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/80 font-normal`}
    style={width ? { width: `${width}px` } : undefined}
  >
    {children}
  </th>
);

const Td = ({ children, align = "left", className = "" }) => (
  <td className={`py-3 px-3 text-${align} ${className}`}>{children}</td>
);

// ════════════════════════════════════════════════════════════════
// DESKTOP ROW (with expandable detail)
// ════════════════════════════════════════════════════════════════
const DesktopRow = ({
  item,
  currentPrice,
  currentVol,
  priceChange,
  maxTarget,
  isExpanded,
  pricesLoading,
  formatPrice,
  formatVolume,
  formatDateTime,
  calcPct,
  getCoinName,
  riskStyle,
  riskLabel,
  statusStyle,
  statusLabel,
  onToggle,
  onOpenModal,
  onRemove,
}) => {
  const tpList = [
    { label: "TP1", value: item.target1 },
    { label: "TP2", value: item.target2 },
    { label: "TP3", value: item.target3 },
    { label: "TP4", value: item.target4 },
  ].filter((tp) => tp.value);

  return (
    <>
      {/* Main row */}
      <tr
        onClick={onToggle}
        className={`group cursor-pointer transition-colors border-b border-ink/[0.04] ${
          isExpanded ? "bg-surface-secondary" : "hover:bg-ink/[0.02]"
        }`}
      >
        {/* Star */}
        <Td align="center" className="w-10">
          <div onClick={(e) => e.stopPropagation()}>
            <StarButton signalId={item.signal_id} isStarred={true} onToggle={onRemove} />
          </div>
        </Td>

        {/* Pair */}
        <Td>
          <div className="flex items-center gap-2.5">
            <CoinLogo pair={item.pair} size={32} />
            <div className="min-w-0">
              <p className="text-text-primary text-sm font-semibold group-hover:text-text-primary transition-colors font-mono">
                {getCoinName(item.pair)}
              </p>
              <p className="text-text-muted/60 text-[10px] font-mono uppercase tracking-wider">
                USDT
              </p>
            </div>
          </div>
        </Td>

        {/* Current price */}
        <Td align="right">
          {pricesLoading && !currentPrice ? (
            <div className="h-4 w-20 bg-ink/[0.04] rounded animate-pulse ml-auto" />
          ) : currentPrice ? (
            <span className="text-text-primary font-mono text-sm tabular-nums">
              {formatPrice(currentPrice)}
            </span>
          ) : (
            <span className="text-text-muted/40 font-mono text-sm">—</span>
          )}
        </Td>

        {/* Entry */}
        <Td align="right">
          <span className="text-text-primary/80 font-mono text-sm tabular-nums">
            {formatPrice(item.entry)}
          </span>
        </Td>

        {/* P&L */}
        <Td align="right">
          {priceChange !== null ? (
            <span
              className={`font-mono text-sm tabular-nums font-semibold ${
                priceChange >= 0 ? "text-profit" : "text-loss"
              }`}
            >
              {priceChange >= 0 ? "+" : ""}
              {priceChange.toFixed(2)}%
            </span>
          ) : (
            <span className="text-text-muted/40 font-mono text-sm">—</span>
          )}
        </Td>

        {/* Max Target */}
        <Td align="right">
          {maxTarget ? (
            <div className="flex flex-col items-end">
              <span className="text-accent font-mono text-sm tabular-nums">
                {formatPrice(maxTarget)}
              </span>
              {(() => {
                const pct = calcPct(maxTarget, item.entry);
                return pct !== null ? (
                  <span className="text-text-muted font-mono text-[10px] tabular-nums">
                    +{pct.toFixed(1)}%
                  </span>
                ) : null;
              })()}
            </div>
          ) : (
            <span className="text-text-muted/40 font-mono text-sm">—</span>
          )}
        </Td>

        {/* Stop Loss */}
        <Td align="right">
          {item.stop1 ? (
            <div className="flex flex-col items-end">
              <span className="text-loss/90 font-mono text-sm tabular-nums">
                {formatPrice(item.stop1)}
              </span>
              {(() => {
                const pct = calcPct(item.stop1, item.entry);
                return pct !== null ? (
                  <span className="text-loss/60 font-mono text-[10px] tabular-nums">
                    {pct.toFixed(1)}%
                  </span>
                ) : null;
              })()}
            </div>
          ) : (
            <span className="text-text-muted/40 font-mono text-sm">—</span>
          )}
        </Td>

        {/* Risk */}
        <Td align="center">
          <span
            className={`inline-flex items-center text-[9px] font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded border ${riskStyle(item.risk_level)}`}
          >
            {riskLabel(item.risk_level)}
          </span>
        </Td>

        {/* Status */}
        <Td align="center">
          <span
            className={`inline-flex items-center text-[9px] font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded border ${statusStyle(item.status)}`}
          >
            {statusLabel(item.status)}
          </span>
        </Td>

        {/* Added */}
        <Td align="right">
          <span className="text-text-muted/70 font-mono text-[11px] tabular-nums">
            {formatDateTime(item.created_at)}
          </span>
        </Td>

        {/* Expand chevron */}
        <Td align="center" className="w-10">
          <svg
            className={`w-3.5 h-3.5 mx-auto transition-all ${
              isExpanded ? "rotate-180 text-accent" : "text-text-muted/40"
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Td>
      </tr>

      {/* Expanded detail row */}
      {isExpanded && (
        <tr className="bg-surface-secondary/50 border-b border-ink/[0.04]">
          <td colSpan={11} className="px-4 py-4">
            <ExpandedDetail
              item={item}
              tpList={tpList}
              currentPrice={currentPrice}
              currentVol={currentVol}
              formatPrice={formatPrice}
              formatVolume={formatVolume}
              calcPct={calcPct}
              onOpenModal={onOpenModal}
            />
          </td>
        </tr>
      )}
    </>
  );
};

// ════════════════════════════════════════════════════════════════
// EXPANDED DETAIL (in-row, Flowscan signature)
// ════════════════════════════════════════════════════════════════
const ExpandedDetail = ({
  item,
  tpList,
  currentPrice,
  currentVol,
  formatPrice,
  formatVolume,
  calcPct,
  onOpenModal,
}) => (
  <div className="space-y-4">
    {/* Targets grid */}
    {tpList.length > 0 && (
      <div>
        <div className="flex items-center gap-3 mb-2">
          <span className="h-px w-6 bg-accent/30" />
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-text-muted">
            Targets
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {tpList.map((tp, i) => {
            const pct = calcPct(tp.value, item.entry);
            return (
              <div
                key={i}
                className="relative overflow-hidden bg-surface-raised border border-ink/10 rounded-md p-3"
              >
                <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-text-muted mb-1">
                  {tp.label}
                </p>
                <p className="text-text-primary font-mono text-sm tabular-nums">
                  {formatPrice(tp.value)}
                </p>
                {pct !== null && (
                  <p className="text-accent font-mono text-[10px] tabular-nums mt-0.5">
                    +{pct.toFixed(1)}%
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    )}

    {/* Stop Loss + Volume row */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      {/* Stop Loss */}
      {item.stop1 && (
        <div className="relative overflow-hidden bg-surface-raised border border-red-500/15 rounded-md p-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-loss/70 mb-1">
            Stop Loss
          </p>
          <p className="text-text-primary font-mono text-sm tabular-nums">
            {formatPrice(item.stop1)}
          </p>
          {(() => {
            const pct = calcPct(item.stop1, item.entry);
            return pct !== null ? (
              <p className="text-loss font-mono text-[10px] tabular-nums mt-0.5">
                {pct.toFixed(1)}%
              </p>
            ) : null;
          })()}
        </div>
      )}

      {/* Stop Loss 2 (if exists) */}
      {item.stop2 && (
        <div className="relative overflow-hidden bg-surface-raised border border-red-500/15 rounded-md p-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-loss/70 mb-1">
            Stop Loss 2
          </p>
          <p className="text-text-primary font-mono text-sm tabular-nums">
            {formatPrice(item.stop2)}
          </p>
          {(() => {
            const pct = calcPct(item.stop2, item.entry);
            return pct !== null ? (
              <p className="text-loss font-mono text-[10px] tabular-nums mt-0.5">
                {pct.toFixed(1)}%
              </p>
            ) : null;
          })()}
        </div>
      )}

      {/* Volume */}
      {currentVol ? (
        <div className="relative overflow-hidden bg-surface-raised border border-ink/[0.06] rounded-md p-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted mb-1">
            24H Volume
          </p>
          <p className="text-text-primary font-mono text-sm tabular-nums">
            {formatVolume(currentVol)}
          </p>
        </div>
      ) : item.volume_rank_num && item.volume_rank_den ? (
        <div className="relative overflow-hidden bg-surface-raised border border-ink/[0.06] rounded-md p-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted mb-1">
            Volume Rank
          </p>
          <p className="text-text-primary font-mono text-sm tabular-nums">
            <span className="text-accent">#{item.volume_rank_num}</span>
            <span className="text-text-muted/60"> / {item.volume_rank_den}</span>
          </p>
        </div>
      ) : null}
    </div>

    {/* Action button */}
    <div className="flex justify-end pt-2">
      <button
        type="button"
        onClick={onOpenModal}
        className="group inline-flex items-center gap-2 rounded-md border border-transparent bg-accent px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-fg transition-opacity hover:opacity-90"
      >
        View Full Detail
        <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
      </button>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════
// MOBILE CARD
// ════════════════════════════════════════════════════════════════
const MobileCard = ({
  item,
  currentPrice,
  currentVol,
  pricesLoading,
  formatPrice,
  formatVolume,
  formatDateTimeShort,
  calcPct,
  getPriceChange,
  getCoinName,
  riskStyle,
  riskLabel,
  statusStyle,
  statusLabel,
  onClick,
  onRemove,
}) => {
  const priceChange = getPriceChange(item.entry, currentPrice);
  const tpList = [
    { label: "TP1", value: item.target1 },
    { label: "TP2", value: item.target2 },
    { label: "TP3", value: item.target3 },
    { label: "TP4", value: item.target4 },
  ].filter((tp) => tp.value);

  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden bg-surface-raised border border-ink/[0.06] rounded-md p-3.5 cursor-pointer transition-all hover:border-ink/[0.12] active:bg-ink/[0.02]"
    >
      {/* Top: Coin + Status + Star */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <CoinLogo pair={item.pair} size={32} />
          <div>
            <p className="text-text-primary font-semibold text-sm font-mono">
              {getCoinName(item.pair)}
            </p>
            <p className="text-text-muted/60 text-[10px] font-mono uppercase tracking-wider">
              USDT
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center text-[9px] font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded border ${statusStyle(item.status)}`}
          >
            {statusLabel(item.status)}
          </span>
          <div onClick={(e) => e.stopPropagation()}>
            <StarButton signalId={item.signal_id} isStarred={true} onToggle={onRemove} />
          </div>
        </div>
      </div>

      {/* Price row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-text-muted mb-0.5">
            Entry
          </p>
          <p className="text-text-primary font-mono text-xs tabular-nums">
            {formatPrice(item.entry)}
          </p>
        </div>
        <div>
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-text-muted mb-0.5">
            Current
          </p>
          {pricesLoading && !currentPrice ? (
            <div className="h-3 w-14 bg-ink/[0.04] rounded animate-pulse" />
          ) : currentPrice ? (
            <p className="text-text-primary font-mono text-xs tabular-nums">
              {formatPrice(currentPrice)}
            </p>
          ) : (
            <p className="text-text-muted/40 font-mono text-xs">—</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-text-muted mb-0.5">
            P&amp;L
          </p>
          {priceChange !== null ? (
            <p
              className={`font-mono text-xs tabular-nums font-semibold ${
                priceChange >= 0 ? "text-profit" : "text-loss"
              }`}
            >
              {priceChange >= 0 ? "+" : ""}
              {priceChange.toFixed(2)}%
            </p>
          ) : (
            <p className="text-text-muted/40 font-mono text-xs">—</p>
          )}
        </div>
      </div>

      {/* Targets */}
      {tpList.length > 0 && (
        <div className="relative overflow-hidden bg-surface-secondary border border-ink/10 rounded p-2 mb-2">
          <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-text-muted mb-1.5">
            Targets
          </p>
          <div className={`grid gap-1.5 ${tpList.length <= 2 ? "grid-cols-2" : "grid-cols-4"}`}>
            {tpList.map((tp, i) => {
              const pct = calcPct(tp.value, item.entry);
              return (
                <div key={i} className="text-center">
                  <p className="text-text-muted text-[8px] font-mono tracking-wider">{tp.label}</p>
                  <p className="text-text-primary font-mono text-[10px] tabular-nums leading-tight">
                    {formatPrice(tp.value)}
                  </p>
                  {pct !== null && (
                    <p className="text-accent font-mono text-[9px] tabular-nums">
                      +{pct.toFixed(1)}%
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stop Loss */}
      {item.stop1 && (
        <div className="relative overflow-hidden bg-red-500/[0.03] border border-red-500/15 rounded p-2 mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-loss/70">
                Stop Loss
              </span>
              <span className="text-text-primary font-mono text-[11px] tabular-nums">
                {formatPrice(item.stop1)}
              </span>
            </div>
            {(() => {
              const pct = calcPct(item.stop1, item.entry);
              return pct !== null ? (
                <span className="text-loss font-mono text-[11px] tabular-nums">
                  {pct.toFixed(1)}%
                </span>
              ) : null;
            })()}
          </div>
        </div>
      )}

      {/* Bottom: Risk + Volume + Date */}
      <div className="flex items-center justify-between text-[10px] font-mono">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center text-[9px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border ${riskStyle(item.risk_level)}`}
          >
            {riskLabel(item.risk_level)}
          </span>
          {currentVol ? (
            <span className="text-text-muted">
              <span className="uppercase tracking-wider text-[9px]">Vol</span>
              <span className="ml-1 text-text-primary tabular-nums">
                {formatVolume(currentVol)}
              </span>
            </span>
          ) : item.volume_rank_num && item.volume_rank_den ? (
            <span className="text-text-muted">
              <span className="uppercase tracking-wider text-[9px]">Rank</span>
              <span className="ml-1 text-text-primary tabular-nums">#{item.volume_rank_num}</span>
              <span className="text-text-muted/60">/{item.volume_rank_den}</span>
            </span>
          ) : null}
        </div>
        <span className="text-text-muted/60 tabular-nums uppercase tracking-wider">
          {formatDateTimeShort(item.created_at)}
        </span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// LOADING / EMPTY / NO-MATCH STATES
// ════════════════════════════════════════════════════════════════
const LoadingSkeleton = () => (
  <div className="lqsk-group space-y-1.5">
    <ShimmerStyles />
    {[...Array(6)].map((_, i) => (
      <div
        key={i}
        className="bg-surface-raised border border-ink/[0.06] rounded-md p-3.5 flex items-center gap-3"
      >
        <div className="w-8 h-8 rounded bg-ink/[0.03] shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-ink/[0.05] rounded w-1/4" />
          <div className="h-3 bg-ink/[0.03] rounded w-3/4" />
        </div>
        <div className="w-20 space-y-1.5">
          <div className="h-3 bg-ink/[0.05] rounded" />
          <div className="h-2 bg-ink/[0.03] rounded w-2/3 ml-auto" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({ onBrowse }) => (
  <div className="relative bg-surface-raised border border-ink/[0.06] rounded-md p-12 text-center overflow-hidden">
    <div className="w-14 h-14 mx-auto mb-4 rounded-md border border-ink/10 flex items-center justify-center">
      <svg
        className="w-6 h-6 text-text-muted"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
        />
      </svg>
    </div>
    <p className="text-text-primary text-base font-medium mb-1.5">Watchlist is empty</p>
    <p className="text-text-muted text-xs font-mono uppercase tracking-[0.15em] mb-5">
      Star signals to track them here
    </p>
    <button
      type="button"
      onClick={onBrowse}
      className="group inline-flex items-center gap-2 rounded-md border border-transparent bg-accent px-5 py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-fg transition-opacity hover:opacity-90"
    >
      Browse Signals
      <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
    </button>
  </div>
);

const NoMatch = () => (
  <div className="relative bg-surface-raised border border-ink/[0.06] rounded-md p-8 text-center">
    <p className="text-text-muted text-sm font-mono uppercase tracking-[0.15em]">
      No matching signals
    </p>
    <p className="text-text-muted/50 text-[10px] font-mono uppercase tracking-[0.2em] mt-1">
      Try adjusting filters
    </p>
  </div>
);

export default WatchlistPage;
