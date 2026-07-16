// src/components/OnchainPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — On-Chain Intelligence Page v3.1 (Flowscan reskin)
// 100% aligned with backend /api/v1/onchain/{feed,stats,detail,filters}
// Whale transfers · Smart money · Liquidations
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import AssistantWidget from "./assistant/AssistantWidget";
import { ShimmerStyles } from "./ui/Loaders";

const API = "/api/v1/onchain";
const PER_PAGE = 30;
const REFRESH_INTERVAL = 60000;

// ── Alert type config (no emoji, just text) ──
const ALERT_TYPES = [
  { key: "all", label: "All" },
  { key: "transfer", label: "Transfer" },
  { key: "whale_transfer", label: "Whale" },
  { key: "smart_money", label: "Smart Money" },
  { key: "mint_burn", label: "Mint/Burn" },
  { key: "buy", label: "Buy" },
  { key: "sell", label: "Sell" },
  { key: "deposit", label: "Deposit" },
  { key: "liquidation", label: "Liquidation" },
  { key: "position", label: "Position" },
  { key: "security", label: "Security" },
];

// ── Min USD preset chips ──
const MIN_USD_PRESETS = [
  { key: "0", label: "All", value: 0 },
  { key: "10000", label: "$10K+", value: 10000 },
  { key: "100000", label: "$100K+", value: 100000 },
  { key: "1000000", label: "$1M+", value: 1000000 },
  { key: "10000000", label: "$10M+", value: 10000000 },
];

// ── Helpers ──
const fmtUsd = (v) => {
  if (v == null || v === 0) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};

const fmtNum = (v) => {
  if (v == null) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString();
};

const timeAgo = (iso) => {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
};

// ── Compute p95 from alert amounts (dynamic whale threshold) ──
const computeWhaleThreshold = (alerts) => {
  const amounts = alerts
    .map((a) => a.amount_usd)
    .filter((v) => v != null && v > 0)
    .sort((a, b) => a - b);
  if (amounts.length < 10) return 1_000_000; // fallback
  const idx = Math.floor(amounts.length * 0.95);
  return amounts[idx] || 1_000_000;
};

// ── Semantic 3-tier badge system ──
const typeStyle = (t) => {
  const gold = "bg-gold-primary/10 text-gold-primary border-line/25";
  const danger = "bg-red-500/10 text-red-400 border-red-500/25";
  const neutral = "bg-white/[0.04] text-text-primary/70 border-white/[0.08]";

  const map = {
    whale_transfer: gold,
    smart_money: gold,
    liquidation: danger,
    security: danger,
  };
  return map[t] || neutral;
};

const typeLabel = (t) => {
  if (!t) return "ALERT";
  return t.replace(/_/g, " ").toUpperCase();
};

const prettyType = (t) => {
  if (!t) return "—";
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

// ── Chain dot color (only tiny dot retains color) ──
const chainDot = (c) => {
  const map = {
    Ethereum: "bg-blue-400",
    Bitcoin: "bg-orange-400",
    Solana: "bg-purple-400",
    Tron: "bg-red-400",
    Base: "bg-blue-300",
    Hyperliquid: "bg-emerald-400",
    Polygon: "bg-violet-400",
    Arbitrum: "bg-sky-400",
    BSC: "bg-yellow-400",
    Avalanche: "bg-red-500",
    Optimism: "bg-rose-400",
    Sui: "bg-cyan-400",
  };
  return map[c] || "bg-white/40";
};


// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
const OnchainPage = () => {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [alertType, setAlertType] = useState("all");
  const [search, setSearch] = useState("");
  const [chainFilter, setChainFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [tokenFilter, setTokenFilter] = useState("all");
  const [minUsd, setMinUsd] = useState(0);

  // ── Modal alert is URL-driven: ?alert=<id> ──
  // Sumber kebenaran tunggal lewat query param, jadi tombol back nutup modal
  // dan link bisa di-share. Objek alert di-cache (lihat effect di bawah) biar
  // modal yang lagi kebuka nggak ilang pas auto-refresh 60s / ganti filter
  // ngebangun ulang list feed.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAlertId = searchParams.get("alert");
  const alertCacheRef = useRef(new Map());

  const refreshRef = useRef(null);

  // ── Fetch feed (uses ONLY backend-supported params) ──
  const fetchFeed = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(PER_PAGE),
      });
      if (alertType !== "all") params.append("alert_type", alertType);
      if (chainFilter !== "all") params.append("blockchain", chainFilter);
      if (sourceFilter !== "all") params.append("source", sourceFilter);
      if (tokenFilter !== "all") params.append("token", tokenFilter);
      if (search.trim()) params.append("search", search.trim());
      if (minUsd > 0) params.append("min_usd", String(minUsd));

      const res = await fetch(`${API}/feed?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAlerts(data.alerts || []);
      setTotalPages(data.total_pages || 1);
      setTotalAlerts(data.total || 0);
    } catch {
      console.error("Feed fetch failed");
    } finally {
      setLoading(false);
    }
  }, [page, alertType, search, chainFilter, sourceFilter, tokenFilter, minUsd]);

  // ── Fetch stats ──
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats`);
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchFeed();
  }, [fetchFeed]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    refreshRef.current = setInterval(() => {
      fetchFeed();
      fetchStats();
    }, REFRESH_INTERVAL);
    return () => clearInterval(refreshRef.current);
  }, [fetchFeed, fetchStats]);

  // ── Cache setiap alert yang lewat, biar modal yang lagi kebuka nggak hilang
  //    saat feed di-rebuild (refresh 60s / ganti filter / pindah halaman). ──
  useEffect(() => {
    for (const a of alerts) {
      if (a && a.id != null) alertCacheRef.current.set(String(a.id), a);
    }
  }, [alerts]);

  // Alert yang ditampilkan modal, diturunkan dari ?alert=<id>: cari di list
  // sekarang dulu, fallback ke cache. null kalau ga ketemu (modal nutup).
  const selectedAlert = useMemo(() => {
    if (!selectedAlertId) return null;
    return (
      alerts.find((a) => String(a.id) === String(selectedAlertId)) ||
      alertCacheRef.current.get(String(selectedAlertId)) ||
      null
    );
  }, [selectedAlertId, alerts]);

  const openAlert = useCallback((alert) => {
    if (!alert || alert.id == null) return;
    alertCacheRef.current.set(String(alert.id), alert);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("alert", String(alert.id));
      return next;
    });
  }, [setSearchParams]);

  const closeAlert = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("alert");
      return next;
    });
  }, [setSearchParams]);

  // ── Filter handlers ──
  const handleTypeFilter = (t) => { setAlertType(t); setPage(1); };
  const handleSearch = (e) => { setSearch(e.target.value); setPage(1); };
  const handleChain = (c) => { setChainFilter(c); setPage(1); };
  const handleSource = (s) => { setSourceFilter(s); setPage(1); };
  const handleToken = (t) => { setTokenFilter(t); setPage(1); };
  const handleMinUsd = (v) => { setMinUsd(v); setPage(1); };

  // ── Dynamic whale threshold (p95 of fetched alerts) ──
  const whaleThreshold = useMemo(() => computeWhaleThreshold(alerts), [alerts]);
  const isHighlight = useCallback(
    (a) =>
      (a.amount_usd && a.amount_usd >= whaleThreshold) ||
      a.alert_type === "liquidation" ||
      a.alert_type === "security" ||
      a.alert_type === "whale_transfer" ||
      a.alert_type === "smart_money",
    [whaleThreshold]
  );

  // ── Compute top type from by_type ──
  const topType = useMemo(() => {
    if (!stats?.by_type?.length) return null;
    return stats.by_type[0];
  }, [stats]);

  // ── 4 Header stat cards — ALL from real backend fields ──
  const headerStats = useMemo(() => [
    {
      label: "Total Alerts",
      value: fmtNum(stats?.total || 0),
      sublabel: `${(stats?.last_24h || 0).toLocaleString()} in 24h`,
    },
    {
      label: "Last Hour",
      value: fmtNum(stats?.last_1h || 0),
      sublabel: stats?.last_1h ? "Active flow" : "Quiet",
      isLive: (stats?.last_1h || 0) > 0,
    },
    {
      label: "Top Activity",
      value: topType ? prettyType(topType.type) : "—",
      sublabel: topType ? `${fmtNum(topType.count)} alerts` : "",
    },
    {
      label: "Whale Threshold",
      value: whaleThreshold >= 1e6 ? `$${(whaleThreshold / 1e6).toFixed(1)}M` : fmtUsd(whaleThreshold),
      sublabel: "p95 of page",
      isGold: true,
    },
  ], [stats, topType, whaleThreshold]);

  // ── Active filter count ──
  const activeFiltersCount = [
    alertType !== "all",
    chainFilter !== "all",
    sourceFilter !== "all",
    tokenFilter !== "all",
    minUsd > 0,
    search.trim().length > 0,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setAlertType("all");
    setChainFilter("all");
    setSourceFilter("all");
    setTokenFilter("all");
    setMinUsd(0);
    setSearch("");
    setPage(1);
  };

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-8">
      {/* HEADER */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight">
              On-Chain Intelligence
            </h1>
            <p className="text-text-muted text-sm mt-1.5">
              Whale transfers · Smart money · Liquidations
              {stats?.by_blockchain?.length && (
                <span> across {stats.by_blockchain.length} chains</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="uppercase tracking-[0.15em]">Live</span>
            </span>
            <span className="px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-text-muted">
              <span className="uppercase tracking-[0.15em] text-[10px]">Auto-refresh</span>
              <span className="ml-2 text-text-primary tabular-nums">60s</span>
            </span>
          </div>
        </div>
      </div>

      {/* STATS ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {headerStats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* FILTER BAR */}
      <div className="space-y-3">
        {/* Type chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {ALERT_TYPES.map(({ key, label }) => {
            const count = key === "all"
              ? totalAlerts
              : stats?.by_type?.find((t) => t.type === key)?.count;
            const active = alertType === key;
            return (
              <button
                key={key}
                onClick={() => handleTypeFilter(key)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-[0.1em] transition-all border whitespace-nowrap ${
                  active
                    ? "bg-gold-primary/15 text-gold-primary border-line/40"
                    : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-text-primary hover:border-white/[0.12]"
                }`}
              >
                {label}
                {count != null && (
                  <span className={`ml-1.5 tabular-nums ${active ? "text-gold-primary/70" : "text-text-muted/60"}`}>
                    {fmtNum(count)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Min USD presets */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <span className="shrink-0 px-2 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/60">
            Min:
          </span>
          {MIN_USD_PRESETS.map(({ key, label, value }) => {
            const active = minUsd === value;
            return (
              <button
                key={key}
                onClick={() => handleMinUsd(value)}
                className={`shrink-0 px-2.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-[0.15em] transition-all border whitespace-nowrap ${
                  active
                    ? "bg-gold-primary/15 text-gold-primary border-line/40"
                    : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-text-primary hover:border-white/[0.12]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Search + dropdowns */}
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
              placeholder="Search title or raw text..."
              value={search}
              onChange={handleSearch}
              className="w-full pl-9 pr-4 py-2 bg-white/[0.02] border border-white/[0.06] rounded-md text-sm text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-line/40 transition-colors font-mono"
            />
          </div>

          <select
            value={chainFilter}
            onChange={(e) => handleChain(e.target.value)}
            className="px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-md text-xs font-mono uppercase tracking-[0.1em] text-text-muted hover:text-text-primary focus:outline-none focus:border-line/40 transition-colors cursor-pointer"
          >
            <option value="all" className="bg-surface-raised text-text-primary">Chain: All</option>
            {(stats?.by_blockchain || []).slice(0, 12).map((c) => (
              <option key={c.blockchain} value={c.blockchain} className="bg-surface-raised text-text-primary">
                {c.blockchain}
              </option>
            ))}
          </select>

          <select
            value={sourceFilter}
            onChange={(e) => handleSource(e.target.value)}
            className="px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-md text-xs font-mono uppercase tracking-[0.1em] text-text-muted hover:text-text-primary focus:outline-none focus:border-line/40 transition-colors cursor-pointer"
          >
            <option value="all" className="bg-surface-raised text-text-primary">Source: All</option>
            {(stats?.by_source || []).map((s) => (
              <option key={s.source} value={s.source} className="bg-surface-raised text-text-primary">
                {s.source}
              </option>
            ))}
          </select>

          <select
            value={tokenFilter}
            onChange={(e) => handleToken(e.target.value)}
            className="px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-md text-xs font-mono uppercase tracking-[0.1em] text-text-muted hover:text-text-primary focus:outline-none focus:border-line/40 transition-colors cursor-pointer"
          >
            <option value="all" className="bg-surface-raised text-text-primary">Token: All</option>
            {(stats?.by_token || []).slice(0, 15).map((t) => (
              <option key={t.token} value={t.token} className="bg-surface-raised text-text-primary">
                ${t.token}
              </option>
            ))}
          </select>
        </div>

        {activeFiltersCount > 0 && (
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="text-text-muted/70 uppercase tracking-[0.15em]">
              {activeFiltersCount} filter{activeFiltersCount > 1 ? "s" : ""} active
            </span>
            <button
              onClick={clearFilters}
              className="text-gold-primary/80 hover:text-gold-primary uppercase tracking-[0.15em] transition-colors"
            >
              Clear all →
            </button>
          </div>
        )}
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-9 space-y-3">
          <SectionHeader label="Latest Alerts" small />

          {loading ? (
            <LoadingSkeleton />
          ) : alerts.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="space-y-1.5">
                {alerts.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    isHighlight={isHighlight(alert)}
                    onClick={() => openAlert(alert)}
                  />
                ))}
              </div>

              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <SidebarTrendingTokens stats={stats} onTokenClick={handleToken} activeToken={tokenFilter} />
          <SidebarBlockchains stats={stats} onChainClick={handleChain} activeChain={chainFilter} />
          <SidebarLargestMoves stats={stats} />
          <SidebarSources stats={stats} onSourceClick={handleSource} activeSource={sourceFilter} />
        </div>
      </div>

      {selectedAlert && (
        <AlertModal alert={selectedAlert} onClose={closeAlert} />
      )}

      <div className="flex items-center justify-center gap-2 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/50">
        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
        <span>Page {page} of {totalPages}</span>
        <span className="text-text-muted/30">·</span>
        <span>Auto-refresh 60s</span>
      </div>

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="onchain" />
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// SECTION HEADER
// ════════════════════════════════════════════════════════════════
const SectionHeader = ({ label, small = false }) => (
  <div className="flex items-center gap-3">
    <span
      className={`font-mono uppercase tracking-[0.25em] text-gold-primary/80 ${
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
const StatCard = ({ label, value, sublabel, isLive, isGold }) => (
  <div className="relative overflow-hidden bg-surface-raised border border-white/[0.06] rounded-md p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

    <div className="relative z-10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-mono">
          {label}
        </span>
        {isLive && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        )}
      </div>

      <div className={`text-xl sm:text-2xl font-mono tabular-nums mb-1.5 truncate ${isGold ? "text-gold-primary" : "text-text-primary"}`}>
        {value}
      </div>

      {sublabel && (
        <div className="text-[10px] font-mono text-text-muted/70 tabular-nums truncate">
          {sublabel}
        </div>
      )}
    </div>
  </div>
);


// ════════════════════════════════════════════════════════════════
// ALERT ROW
// ════════════════════════════════════════════════════════════════
const AlertRow = ({ alert, isHighlight, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer transition-colors rounded-md border overflow-hidden ${
        isHighlight
          ? "bg-gradient-to-r from-gold-primary/[0.04] to-transparent border-line/20 hover:border-line/40"
          : "bg-surface-raised border-white/[0.06] hover:border-white/[0.12]"
      }`}
    >
      {isHighlight && (
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
      )}

      <div className="flex items-center gap-3 p-3 sm:p-3.5">
        <div className="shrink-0 w-10 h-10 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center overflow-hidden">
          {alert.has_photo && alert.image_url ? (
            <img
              src={alert.image_url}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <span className={`w-2 h-2 rounded-full ${chainDot(alert.blockchain)}`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border ${typeStyle(alert.alert_type)}`}
            >
              {typeLabel(alert.alert_type)}
            </span>
            {alert.token && (
              <span className="text-[10px] font-mono text-gold-primary/90 font-semibold">
                ${alert.token}
              </span>
            )}
            {alert.blockchain && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-text-muted/70">
                <span className={`w-1 h-1 rounded-full ${chainDot(alert.blockchain)}`} />
                {alert.blockchain}
              </span>
            )}
            {alert.source_name && (
              <span className="hidden md:inline text-[10px] text-text-muted/50 font-mono">
                · {alert.source_name}
              </span>
            )}
          </div>

          <p
            className={`text-sm leading-snug line-clamp-1 transition-colors ${
              isHighlight ? "text-text-primary" : "text-text-primary/90"
            } group-hover:text-gold-primary`}
          >
            {alert.title || alert.raw_text?.slice(0, 140) || "—"}
          </p>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-0.5 min-w-[80px]">
          {alert.amount_usd ? (
            <span
              className={`font-mono text-sm tabular-nums font-semibold ${
                isHighlight ? "text-gold-primary" : "text-text-primary"
              }`}
            >
              {fmtUsd(alert.amount_usd)}
            </span>
          ) : (
            <span className="font-mono text-sm text-text-muted/40">—</span>
          )}
          <span className="font-mono text-[10px] text-text-muted/60 tabular-nums uppercase tracking-wider">
            {timeAgo(alert.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// SIDEBAR COMPONENTS
// ════════════════════════════════════════════════════════════════
const SidebarCard = ({ label, children }) => (
  <div className="relative overflow-hidden bg-surface-raised border border-white/[0.06] rounded-md">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="px-3.5 py-3 border-b border-white/[0.04]">
      <span className="text-[10px] uppercase tracking-[0.25em] text-gold-primary/80 font-mono">
        {label}
      </span>
    </div>
    <div className="p-2">{children}</div>
  </div>
);

const SidebarTrendingTokens = ({ stats, onTokenClick, activeToken }) => {
  const tokens = stats?.by_token?.slice(0, 8) || [];
  if (!tokens.length) return null;
  return (
    <SidebarCard label="Trending Tokens">
      <div className="space-y-px">
        {tokens.map((t, i) => {
          const active = activeToken === t.token;
          return (
            <button
              key={t.token}
              onClick={() => onTokenClick(active ? "all" : t.token)}
              className={`w-full flex items-center justify-between py-1.5 px-2 rounded transition-colors ${
                active ? "bg-gold-primary/[0.08]" : "hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono text-text-muted/50 tabular-nums w-4">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={`text-xs font-medium truncate ${active ? "text-gold-primary" : "text-text-primary"}`}>
                  ${t.token}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {t.total_usd > 0 && (
                  <span className="text-[10px] font-mono text-gold-primary/90 tabular-nums">
                    {fmtUsd(t.total_usd)}
                  </span>
                )}
                <span className="text-[10px] font-mono text-text-muted/60 tabular-nums w-8 text-right">
                  {t.count}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </SidebarCard>
  );
};

const SidebarBlockchains = ({ stats, onChainClick, activeChain }) => {
  const chains = stats?.by_blockchain?.slice(0, 8) || [];
  if (!chains.length) return null;
  const max = Math.max(...chains.map((c) => c.count));
  return (
    <SidebarCard label="Chains">
      <div className="space-y-px">
        {chains.map((c) => {
          const pct = (c.count / max) * 100;
          const active = activeChain === c.blockchain;
          return (
            <button
              key={c.blockchain}
              onClick={() => onChainClick(active ? "all" : c.blockchain)}
              className={`relative w-full py-1.5 px-2 rounded transition-colors ${
                active ? "bg-gold-primary/[0.08]" : "hover:bg-white/[0.03]"
              }`}
            >
              <div
                className="absolute inset-y-0 left-0 bg-gold-primary/[0.04] rounded"
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between">
                <span className={`flex items-center gap-2 text-xs ${active ? "text-gold-primary" : "text-text-primary"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${chainDot(c.blockchain)}`} />
                  {c.blockchain}
                </span>
                <span className="text-[10px] font-mono text-text-muted/70 tabular-nums">
                  {fmtNum(c.count)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </SidebarCard>
  );
};

const SidebarLargestMoves = ({ stats }) => {
  const moves = stats?.largest?.slice(0, 5) || [];
  if (!moves.length) return null;
  return (
    <SidebarCard label="Largest Moves">
      <div className="space-y-px">
        {moves.map((m, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/[0.03] transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-mono text-text-muted/50 tabular-nums w-4">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-xs text-text-primary truncate">
                  {m.token ? `$${m.token}` : "—"}
                </span>
                {m.alert_type && (
                  <span className="text-[9px] font-mono text-text-muted/50 uppercase tracking-[0.1em] truncate">
                    {m.alert_type.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            </div>
            <span className="text-[10px] font-mono text-gold-primary tabular-nums shrink-0">
              {fmtUsd(m.amount_usd)}
            </span>
          </div>
        ))}
      </div>
    </SidebarCard>
  );
};

const SidebarSources = ({ stats, onSourceClick, activeSource }) => {
  const sources = stats?.by_source?.slice(0, 6) || [];
  if (!sources.length) return null;
  const max = Math.max(...sources.map((s) => s.count));
  return (
    <SidebarCard label="Sources">
      <div className="space-y-px">
        {sources.map((s) => {
          const pct = (s.count / max) * 100;
          const active = activeSource === s.source;
          return (
            <button
              key={s.source}
              onClick={() => onSourceClick(active ? "all" : s.source)}
              className={`relative w-full py-1.5 px-2 rounded transition-colors ${
                active ? "bg-gold-primary/[0.08]" : "hover:bg-white/[0.03]"
              }`}
            >
              <div
                className="absolute inset-y-0 left-0 bg-gold-primary/[0.04] rounded"
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between">
                <span className={`text-xs truncate ${active ? "text-gold-primary" : "text-text-primary"}`}>
                  {s.source}
                </span>
                <span className="text-[10px] font-mono text-text-muted/70 tabular-nums shrink-0 ml-2">
                  {fmtNum(s.count)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </SidebarCard>
  );
};


// ════════════════════════════════════════════════════════════════
// MODAL
// ════════════════════════════════════════════════════════════════
const AlertModal = ({ alert, onClose }) => {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  // Kunci scroll background selama modal kebuka (cegah halaman ke-scroll di
  // belakang modal).
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const modalContent = (
    <div
      className="fixed inset-0 z-[100000] flex items-end justify-center sm:items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-xl bg-surface-raised border-t border-white/[0.08] sm:border rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.65)] max-h-[min(92dvh,100%)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-0 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent" />

        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-md bg-black/40 border border-white/[0.06] flex items-center justify-center text-text-muted hover:text-text-primary hover:border-white/[0.15] transition-colors font-mono text-sm"
        >
          ✕
        </button>

        <div className="overflow-y-auto">
          {alert.image_url && (
            <div
              className="bg-black/60 flex items-center justify-center border-b border-white/[0.04]"
              style={{ minHeight: "160px", maxHeight: "400px" }}
            >
              <img
                src={alert.image_url}
                alt=""
                className="w-full max-h-[400px] object-contain"
                onError={(e) => { e.target.parentElement.style.display = "none"; }}
              />
            </div>
          )}

          <div className="p-5 space-y-5">
            <SectionHeader label="Alert Detail" small />

            <div className="flex flex-wrap gap-1.5">
              <span
                className={`text-[10px] font-mono uppercase tracking-[0.1em] px-2 py-1 rounded border ${typeStyle(alert.alert_type)}`}
              >
                {typeLabel(alert.alert_type)}
              </span>
              {alert.blockchain && (
                <span className="text-[10px] font-mono uppercase tracking-[0.1em] px-2 py-1 rounded border bg-white/[0.04] border-white/[0.08] text-text-primary/70 inline-flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${chainDot(alert.blockchain)}`} />
                  {alert.blockchain}
                </span>
              )}
              {alert.token && (
                <span className="text-[10px] font-mono uppercase tracking-[0.1em] px-2 py-1 rounded border bg-gold-primary/10 text-gold-primary border-line/25 font-semibold">
                  ${alert.token}
                </span>
              )}
              {alert.source_name && (
                <span className="text-[10px] font-mono uppercase tracking-[0.1em] px-2 py-1 rounded border bg-white/[0.04] border-white/[0.08] text-text-primary/70">
                  {alert.source_name}
                </span>
              )}
            </div>

            {alert.amount_usd && (
              <div className="relative overflow-hidden bg-white/[0.02] border border-white/[0.06] rounded-md p-5">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
                <p className="text-[10px] uppercase tracking-[0.25em] text-text-muted font-mono mb-2">
                  Amount
                </p>
                <p className="text-3xl font-mono tabular-nums text-text-primary">
                  {fmtUsd(alert.amount_usd)}
                </p>
                {alert.amount_raw && alert.token && (
                  <p className="text-text-muted text-xs font-mono mt-1.5 tabular-nums">
                    {Number(alert.amount_raw).toLocaleString()} {alert.token}
                  </p>
                )}
              </div>
            )}

            {(alert.from_entity || alert.to_entity) && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
                {alert.from_entity ? (
                  <div className="p-3 rounded-md bg-white/[0.02] border border-white/[0.06]">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-mono mb-1">
                      From
                    </p>
                    <p className="text-text-primary text-xs font-mono truncate">
                      {alert.from_entity}
                    </p>
                  </div>
                ) : <div />}
                <span className="text-text-muted/60 text-lg font-mono hidden sm:block">→</span>
                {alert.to_entity ? (
                  <div className="p-3 rounded-md bg-white/[0.02] border border-white/[0.06]">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-mono mb-1">
                      To
                    </p>
                    <p className="text-text-primary text-xs font-mono truncate">
                      {alert.to_entity}
                    </p>
                  </div>
                ) : <div />}
              </div>
            )}

            {alert.raw_text && (
              <div className="p-3.5 rounded-md bg-white/[0.02] border border-white/[0.04]">
                <p className="text-[10px] uppercase tracking-[0.25em] text-text-muted font-mono mb-2">
                  Raw
                </p>
                <p className="text-text-secondary text-xs leading-relaxed whitespace-pre-wrap break-words font-mono">
                  {alert.raw_text}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/60">
              <span>{alert.source_name || "Unknown source"}</span>
              <span className="tabular-nums">
                {alert.created_at ? new Date(alert.created_at).toLocaleString() : ""}
              </span>
            </div>

            {alert.tx_url && (
              <a
                href={alert.tx_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block w-full text-center py-3 rounded-md font-mono text-xs uppercase tracking-[0.2em] text-black transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(212,168,83,0.3)]"
                style={{
                  background:
                    "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
                }}
              >
                View on Explorer
                <span className="inline-block ml-2 transition-transform group-hover:translate-x-0.5">
                  ↗
                </span>
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};


// ════════════════════════════════════════════════════════════════
// PAGINATION
// ════════════════════════════════════════════════════════════════
const Pagination = ({ page, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const getPages = () => {
    const pages = [];
    const delta = 2;
    const left = Math.max(2, page - delta);
    const right = Math.min(totalPages - 1, page + delta);

    pages.push(1);
    if (left > 2) pages.push("...");
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push("...");
    if (totalPages > 1) pages.push(totalPages);
    return pages;
  };

  return (
    <div className="flex items-center justify-center gap-1 pt-6">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-[0.15em] border border-white/[0.06] text-text-muted hover:text-text-primary hover:border-white/[0.15] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        ← Prev
      </button>
      {getPages().map((p, i) =>
        p === "..." ? (
          <span
            key={`dots-${i}`}
            className="px-1.5 text-text-muted/50 text-xs font-mono"
          >
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`min-w-[34px] h-8 px-2 rounded-md text-[11px] font-mono tabular-nums transition-all ${
              p === page
                ? "bg-gold-primary/15 text-gold-primary border border-line/40"
                : "border border-white/[0.06] text-text-muted hover:text-text-primary hover:border-white/[0.15]"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-[0.15em] border border-white/[0.06] text-text-muted hover:text-text-primary hover:border-white/[0.15] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        Next →
      </button>
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// LOADING & EMPTY STATES
// ════════════════════════════════════════════════════════════════
const LoadingSkeleton = () => (
  <div className="lqsk-group space-y-1.5">
    <ShimmerStyles />
    {[...Array(10)].map((_, i) => (
      <div
        key={i}
        className="bg-surface-raised border border-white/[0.06] rounded-md p-3.5 flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded bg-white/[0.03] shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-white/[0.05] rounded w-1/4" />
          <div className="h-3 bg-white/[0.03] rounded w-3/4" />
        </div>
        <div className="w-20 space-y-1.5">
          <div className="h-3 bg-white/[0.05] rounded" />
          <div className="h-2 bg-white/[0.03] rounded w-2/3 ml-auto" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = () => (
  <div className="relative bg-surface-raised border border-white/[0.06] rounded-md p-12 text-center overflow-hidden">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="w-12 h-12 mx-auto mb-4 rounded-md border border-line/20 flex items-center justify-center">
      <svg className="w-5 h-5 text-gold-primary/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
    </div>
    <p className="text-text-primary text-sm font-medium mb-1">No alerts found</p>
    <p className="text-text-muted text-xs font-mono uppercase tracking-[0.15em]">
      Try adjusting filters
    </p>
  </div>
);


export default OnchainPage;