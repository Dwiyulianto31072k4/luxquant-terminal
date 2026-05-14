// src/components/OnchainPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — On-Chain Intelligence Page v3 (Flowscan reskin)
// Whale transfers · Smart money · Liquidations
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

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

// ── Sort options ──
const SORT_OPTIONS = [
  { key: "latest", label: "Latest" },
  { key: "amount_desc", label: "Largest $" },
  { key: "amount_asc", label: "Smallest $" },
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

// ── Semantic 3-tier badge system ──
// gold = high-signal · red = danger · neutral = info
const typeStyle = (t) => {
  const gold = "bg-gold-primary/10 text-gold-primary border-gold-primary/25";
  const danger = "bg-red-500/10 text-red-400 border-red-500/25";
  const neutral = "bg-white/[0.04] text-white/70 border-white/[0.08]";

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

// ── Chain dot color (only tiny 5px dot retains color) ──
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

// Highlight threshold: alerts ≥ $1M get accent treatment
const HIGHLIGHT_THRESHOLD_USD = 1_000_000;
const isHighlight = (a) =>
  (a.amount_usd && a.amount_usd >= HIGHLIGHT_THRESHOLD_USD) ||
  a.alert_type === "liquidation" ||
  a.alert_type === "security";


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
  const [sort, setSort] = useState("latest");
  const [chainFilter, setChainFilter] = useState("all");
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [last24h, setLast24h] = useState(0);
  const refreshRef = useRef(null);

  // ── Fetch feed ──
  const fetchFeed = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(PER_PAGE),
        sort,
      });
      if (alertType !== "all") params.append("alert_type", alertType);
      if (chainFilter !== "all") params.append("blockchain", chainFilter);
      if (search.trim()) params.append("search", search.trim());
      const res = await fetch(`${API}/feed?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setAlerts(data.alerts || []);
      setTotalPages(data.total_pages || 1);
      setTotalAlerts(data.total || 0);
      setLast24h(data.last_24h || 0);
    } catch {
      console.error("Feed fetch failed");
    } finally {
      setLoading(false);
    }
  }, [page, alertType, search, sort, chainFilter]);

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

  // ── Filter handlers ──
  const handleTypeFilter = (t) => {
    setAlertType(t);
    setPage(1);
  };
  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };
  const handleSort = (s) => {
    setSort(s);
    setPage(1);
  };
  const handleChain = (c) => {
    setChainFilter(c);
    setPage(1);
  };

  // ── Computed top-line stats ──
  const headerStats = useMemo(() => {
    const totalDelta = stats?.delta_24h_pct;
    const netFlow = stats?.net_flow_24h_usd;
    const whaleCount = stats?.whale_count_24h;
    const whaleDelta = stats?.whale_delta_24h;
    const liqCount = stats?.liquidation_count_24h;
    const liqVolume = stats?.liquidation_volume_24h_usd;

    return [
      {
        label: "Total Alerts",
        value: fmtNum(totalAlerts),
        sublabel: `${last24h.toLocaleString()} in 24h`,
        delta: totalDelta,
      },
      {
        label: "Net Flow (24H)",
        value: fmtUsd(Math.abs(netFlow || 0)),
        sublabel: netFlow > 0 ? "Inflow" : netFlow < 0 ? "Outflow" : "Balanced",
        deltaDirection: netFlow > 0 ? "up" : netFlow < 0 ? "down" : null,
      },
      {
        label: "Whale Activity (24H)",
        value: fmtNum(whaleCount || 0),
        sublabel: "Alerts ≥ $1M",
        delta: whaleDelta,
      },
      {
        label: "Liquidations (24H)",
        value: fmtNum(liqCount || 0),
        sublabel: liqVolume ? fmtUsd(liqVolume) : "—",
        isDanger: (liqCount || 0) > 10,
      },
    ];
  }, [stats, totalAlerts, last24h]);

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-8">
      {/* ═════════════════════════════════════ */}
      {/* HEADER */}
      {/* ═════════════════════════════════════ */}
      <div className="space-y-4">
        <SectionHeader label="On-Chain Intelligence" />
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
              On-Chain Intelligence
            </h1>
            <p className="text-text-muted text-sm mt-1.5">
              Whale transfers · Smart money · Liquidations across {stats?.chain_count || 12} chains
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="uppercase tracking-[0.15em]">Live</span>
            </span>
            <span className="px-3 py-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] text-text-muted">
              <span className="uppercase tracking-[0.15em] text-[10px]">Auto-refresh</span>
              <span className="ml-2 text-white tabular-nums">60s</span>
            </span>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════ */}
      {/* STATS ROW (4 cards, Flowscan-exact) */}
      {/* ═════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {headerStats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* ═════════════════════════════════════ */}
      {/* FILTER BAR */}
      {/* ═════════════════════════════════════ */}
      <div className="space-y-3">
        {/* Type chips — horizontal scroll on mobile */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {ALERT_TYPES.map(({ key, label }) => {
            const count =
              key === "all"
                ? totalAlerts
                : stats?.by_type?.find((t) => t.type === key)?.count;
            const active = alertType === key;
            return (
              <button
                key={key}
                onClick={() => handleTypeFilter(key)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-[0.1em] transition-all border whitespace-nowrap ${
                  active
                    ? "bg-gold-primary/15 text-gold-primary border-gold-primary/40"
                    : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-white hover:border-white/[0.12]"
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

        {/* Search + sort + chain row */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
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
              placeholder="Search by token, wallet, or text..."
              value={search}
              onChange={handleSearch}
              className="w-full pl-9 pr-4 py-2 bg-white/[0.02] border border-white/[0.06] rounded-md text-sm text-white placeholder:text-text-muted/40 focus:outline-none focus:border-gold-primary/40 transition-colors font-mono"
            />
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => handleSort(e.target.value)}
            className="px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-md text-xs font-mono uppercase tracking-[0.1em] text-text-muted hover:text-white focus:outline-none focus:border-gold-primary/40 transition-colors cursor-pointer"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.key} value={s.key} className="bg-[#0a0805] text-white">
                Sort: {s.label}
              </option>
            ))}
          </select>

          {/* Chain filter */}
          <select
            value={chainFilter}
            onChange={(e) => handleChain(e.target.value)}
            className="px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-md text-xs font-mono uppercase tracking-[0.1em] text-text-muted hover:text-white focus:outline-none focus:border-gold-primary/40 transition-colors cursor-pointer"
          >
            <option value="all" className="bg-[#0a0805] text-white">Chain: All</option>
            {(stats?.by_blockchain || []).slice(0, 12).map((c) => (
              <option key={c.blockchain} value={c.blockchain} className="bg-[#0a0805] text-white">
                {c.blockchain}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ═════════════════════════════════════ */}
      {/* MAIN GRID: Feed + Sidebar */}
      {/* ═════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ── Feed column ── */}
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
                    onClick={() => setSelectedAlert(alert)}
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

        {/* ── Sidebar ── */}
        <div className="lg:col-span-3 space-y-4">
          <SidebarTrendingTokens stats={stats} />
          <SidebarBlockchains stats={stats} />
          <SidebarLargestMoves stats={stats} />
          <SidebarSmartMoney stats={stats} />
        </div>
      </div>

      {/* Modal */}
      {selectedAlert && (
        <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
      )}

      {/* Footer status */}
      <div className="flex items-center justify-center gap-2 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/50">
        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
        <span>Page {page} of {totalPages}</span>
        <span className="text-text-muted/30">·</span>
        <span>Auto-refresh 60s</span>
      </div>
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// SECTION HEADER — — · LABEL · —
// ════════════════════════════════════════════════════════════════
const SectionHeader = ({ label, small = false }) => (
  <div className="flex items-center gap-3">
    <span className="h-px w-8 bg-gold-primary/40" />
    <span
      className={`font-mono uppercase tracking-[0.25em] text-gold-primary/80 ${
        small ? "text-[10px]" : "text-[11px]"
      }`}
    >
      {label}
    </span>
    <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/20 to-transparent" />
  </div>
);


// ════════════════════════════════════════════════════════════════
// STAT CARD — Flowscan-exact pattern
// ════════════════════════════════════════════════════════════════
const StatCard = ({ label, value, sublabel, delta, deltaDirection, isDanger }) => {
  const showDelta = delta != null && !isNaN(delta);
  const deltaPositive = showDelta && delta >= 0;

  return (
    <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
      {/* Top hairline accent */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-mono">
            {label}
          </span>
        </div>

        <div className={`text-xl sm:text-2xl font-mono tabular-nums mb-1.5 ${isDanger ? "text-red-400" : "text-white"}`}>
          {value}
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono">
          {sublabel && (
            <span className="text-text-muted/70 tabular-nums">{sublabel}</span>
          )}
          {showDelta && (
            <span
              className={`inline-flex items-center gap-0.5 tabular-nums ${
                deltaPositive ? "text-emerald-400" : "text-red-400"
              }`}
            >
              <span>{deltaPositive ? "▲" : "▼"}</span>
              <span>{Math.abs(delta).toFixed(1)}%</span>
            </span>
          )}
          {deltaDirection && (
            <span
              className={`inline-flex items-center gap-0.5 ${
                deltaDirection === "up" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              <span>{deltaDirection === "up" ? "▲" : "▼"}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// ALERT ROW — Compact single-row, accent for high-signal alerts
// ════════════════════════════════════════════════════════════════
const AlertRow = ({ alert, onClick }) => {
  const highlight = isHighlight(alert);

  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer transition-colors rounded-md border overflow-hidden ${
        highlight
          ? "bg-gradient-to-r from-gold-primary/[0.04] to-transparent border-gold-primary/20 hover:border-gold-primary/40"
          : "bg-[#0a0805] border-white/[0.06] hover:border-white/[0.12]"
      }`}
    >
      {/* Top hairline for highlighted */}
      {highlight && (
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
      )}

      <div className="flex items-center gap-3 p-3 sm:p-3.5">
        {/* ── Left: Thumbnail (or chain dot fallback) ── */}
        <div className="shrink-0 w-10 h-10 rounded bg-white/[0.03] border border-white/[0.06] flex items-center justify-center overflow-hidden">
          {alert.has_photo && alert.image_url ? (
            <img
              src={alert.image_url}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          ) : (
            <span className={`w-2 h-2 rounded-full ${chainDot(alert.blockchain)}`} />
          )}
        </div>

        {/* ── Middle: Content ── */}
        <div className="flex-1 min-w-0">
          {/* Top row: badges + token */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border ${typeStyle(
                alert.alert_type
              )}`}
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
          </div>

          {/* Title — single line truncate */}
          <p
            className={`text-sm leading-snug line-clamp-1 transition-colors ${
              highlight ? "text-white" : "text-white/90"
            } group-hover:text-gold-primary`}
          >
            {alert.title || alert.raw_text?.slice(0, 140)}
          </p>
        </div>

        {/* ── Right: Amount + time ── */}
        <div className="shrink-0 flex flex-col items-end gap-0.5 min-w-[80px]">
          {alert.amount_usd ? (
            <span
              className={`font-mono text-sm tabular-nums font-semibold ${
                highlight ? "text-gold-primary" : "text-white"
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
  <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="px-3.5 py-3 border-b border-white/[0.04]">
      <span className="text-[10px] uppercase tracking-[0.25em] text-gold-primary/80 font-mono">
        {label}
      </span>
    </div>
    <div className="p-2">{children}</div>
  </div>
);

const SidebarTrendingTokens = ({ stats }) => {
  const tokens = stats?.top_tokens?.slice(0, 8) || [];
  if (!tokens.length) return null;
  return (
    <SidebarCard label="Trending Tokens">
      <div className="space-y-px">
        {tokens.map((t, i) => (
          <div
            key={t.token}
            className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/[0.03] transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-mono text-text-muted/50 tabular-nums w-4">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-xs text-white font-medium truncate">
                ${t.token}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {t.total_usd && (
                <span className="text-[10px] font-mono text-gold-primary/90 tabular-nums">
                  {fmtUsd(t.total_usd)}
                </span>
              )}
              <span className="text-[10px] font-mono text-text-muted/60 tabular-nums w-8 text-right">
                {t.count}
              </span>
            </div>
          </div>
        ))}
      </div>
    </SidebarCard>
  );
};

const SidebarBlockchains = ({ stats }) => {
  const chains = stats?.by_blockchain?.slice(0, 8) || [];
  if (!chains.length) return null;
  const max = Math.max(...chains.map((c) => c.count));
  return (
    <SidebarCard label="Chains">
      <div className="space-y-px">
        {chains.map((c) => {
          const pct = (c.count / max) * 100;
          return (
            <div
              key={c.blockchain}
              className="relative py-1.5 px-2 rounded hover:bg-white/[0.03] transition-colors"
            >
              {/* Subtle background bar */}
              <div
                className="absolute inset-y-0 left-0 bg-gold-primary/[0.04] rounded"
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-white">
                  <span className={`w-1.5 h-1.5 rounded-full ${chainDot(c.blockchain)}`} />
                  {c.blockchain}
                </span>
                <span className="text-[10px] font-mono text-text-muted/70 tabular-nums">
                  {fmtNum(c.count)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </SidebarCard>
  );
};

const SidebarLargestMoves = ({ stats }) => {
  const moves = stats?.largest_moves?.slice(0, 5) || [];
  if (!moves.length) return null;
  return (
    <SidebarCard label="Largest Moves (24H)">
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
              <span className="text-xs text-white truncate">
                ${m.token || "—"}
              </span>
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

const SidebarSmartMoney = ({ stats }) => {
  const wallets = stats?.smart_money_top?.slice(0, 5) || [];
  if (!wallets.length) return null;
  return (
    <SidebarCard label="Smart Money">
      <div className="space-y-px">
        {wallets.map((w, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/[0.03] transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-mono text-text-muted/50 tabular-nums w-4">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-xs text-white font-mono truncate">
                {w.label || `${w.address?.slice(0, 6)}…${w.address?.slice(-4)}` || "—"}
              </span>
            </div>
            {w.amount_usd && (
              <span className="text-[10px] font-mono text-gold-primary tabular-nums shrink-0">
                {fmtUsd(w.amount_usd)}
              </span>
            )}
          </div>
        ))}
      </div>
    </SidebarCard>
  );
};


// ════════════════════════════════════════════════════════════════
// MODAL — full detail view
// ════════════════════════════════════════════════════════════════
const AlertModal = ({ alert, onClose }) => {
  useEffect(() => {
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-xl bg-[#0a0805] border border-white/[0.08] rounded-md overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top hairline */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/50 to-transparent" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-md bg-black/40 border border-white/[0.06] flex items-center justify-center text-text-muted hover:text-white hover:border-white/[0.15] transition-colors font-mono text-sm"
        >
          ✕
        </button>

        <div className="overflow-y-auto">
          {/* Image */}
          {alert.image_url && (
            <div
              className="bg-black/60 flex items-center justify-center border-b border-white/[0.04]"
              style={{ minHeight: "160px", maxHeight: "400px" }}
            >
              <img
                src={alert.image_url}
                alt=""
                className="w-full max-h-[400px] object-contain"
                onError={(e) => {
                  e.target.parentElement.style.display = "none";
                }}
              />
            </div>
          )}

          <div className="p-5 space-y-5">
            {/* Section header */}
            <SectionHeader label="Alert Detail" small />

            {/* Badges */}
            <div className="flex flex-wrap gap-1.5">
              <span
                className={`text-[10px] font-mono uppercase tracking-[0.1em] px-2 py-1 rounded border ${typeStyle(
                  alert.alert_type
                )}`}
              >
                {typeLabel(alert.alert_type)}
              </span>
              {alert.blockchain && (
                <span className="text-[10px] font-mono uppercase tracking-[0.1em] px-2 py-1 rounded border bg-white/[0.04] border-white/[0.08] text-white/70 inline-flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${chainDot(alert.blockchain)}`} />
                  {alert.blockchain}
                </span>
              )}
              {alert.token && (
                <span className="text-[10px] font-mono uppercase tracking-[0.1em] px-2 py-1 rounded border bg-gold-primary/10 text-gold-primary border-gold-primary/25 font-semibold">
                  ${alert.token}
                </span>
              )}
            </div>

            {/* Amount — big */}
            {alert.amount_usd && (
              <div className="relative overflow-hidden bg-white/[0.02] border border-white/[0.06] rounded-md p-5">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
                <p className="text-[10px] uppercase tracking-[0.25em] text-text-muted font-mono mb-2">
                  Amount
                </p>
                <p className="text-3xl font-mono tabular-nums text-white">
                  {fmtUsd(alert.amount_usd)}
                </p>
                {alert.amount_raw && alert.token && (
                  <p className="text-text-muted text-xs font-mono mt-1.5 tabular-nums">
                    {Number(alert.amount_raw).toLocaleString()} {alert.token}
                  </p>
                )}
              </div>
            )}

            {/* From → To */}
            {(alert.from_entity || alert.to_entity) && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
                {alert.from_entity ? (
                  <div className="p-3 rounded-md bg-white/[0.02] border border-white/[0.06]">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-mono mb-1">
                      From
                    </p>
                    <p className="text-white text-xs font-mono truncate">
                      {alert.from_entity}
                    </p>
                  </div>
                ) : (
                  <div />
                )}
                <span className="text-text-muted/60 text-lg font-mono hidden sm:block">→</span>
                {alert.to_entity ? (
                  <div className="p-3 rounded-md bg-white/[0.02] border border-white/[0.06]">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-mono mb-1">
                      To
                    </p>
                    <p className="text-white text-xs font-mono truncate">
                      {alert.to_entity}
                    </p>
                  </div>
                ) : (
                  <div />
                )}
              </div>
            )}

            {/* Raw text */}
            <div className="p-3.5 rounded-md bg-white/[0.02] border border-white/[0.04]">
              <p className="text-[10px] uppercase tracking-[0.25em] text-text-muted font-mono mb-2">
                Raw
              </p>
              <p className="text-text-secondary text-xs leading-relaxed whitespace-pre-wrap break-words font-mono">
                {alert.raw_text}
              </p>
            </div>

            {/* Footer info */}
            <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/60">
              <span>{alert.source_name}</span>
              <span className="tabular-nums">
                {alert.created_at ? new Date(alert.created_at).toLocaleString() : ""}
              </span>
            </div>

            {/* CTA */}
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
        className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-[0.15em] border border-white/[0.06] text-text-muted hover:text-white hover:border-white/[0.15] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
                ? "bg-gold-primary/15 text-gold-primary border border-gold-primary/40"
                : "border border-white/[0.06] text-text-muted hover:text-white hover:border-white/[0.15]"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-[0.15em] border border-white/[0.06] text-text-muted hover:text-white hover:border-white/[0.15] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
  <div className="space-y-1.5">
    {[...Array(10)].map((_, i) => (
      <div
        key={i}
        className="bg-[#0a0805] border border-white/[0.06] rounded-md p-3.5 flex items-center gap-3"
      >
        <div className="w-10 h-10 rounded bg-white/[0.03] animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-white/[0.05] rounded w-1/4 animate-pulse" />
          <div className="h-3 bg-white/[0.03] rounded w-3/4 animate-pulse" />
        </div>
        <div className="w-20 space-y-1.5">
          <div className="h-3 bg-white/[0.05] rounded animate-pulse" />
          <div className="h-2 bg-white/[0.03] rounded w-2/3 ml-auto animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = () => (
  <div className="relative bg-[#0a0805] border border-white/[0.06] rounded-md p-12 text-center overflow-hidden">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="w-12 h-12 mx-auto mb-4 rounded-md border border-gold-primary/20 flex items-center justify-center">
      <svg className="w-5 h-5 text-gold-primary/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    </div>
    <p className="text-white text-sm font-medium mb-1">No alerts found</p>
    <p className="text-text-muted text-xs font-mono uppercase tracking-[0.15em]">
      Try adjusting filters
    </p>
  </div>
);


export default OnchainPage;