// src/components/OnchainPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — On-Chain Intelligence Page v2
// Whale transfers · Smart money · Liquidations
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";

const API = "/api/v1/onchain";
const PER_PAGE = 24;
const REFRESH_INTERVAL = 60000;

// ── Alert type config ──
const ALERT_TYPES = [
  { key: "all", label: "All", icon: "📡" },
  { key: "transfer", label: "Transfer", icon: "🔄" },
  { key: "whale_transfer", label: "Whale", icon: "🐋" },
  { key: "smart_money", label: "Smart Money", icon: "🧠" },
  { key: "mint_burn", label: "Mint/Burn", icon: "🔥" },
  { key: "buy", label: "Buy", icon: "🟢" },
  { key: "deposit", label: "Deposit", icon: "📥" },
  { key: "sell", label: "Sell", icon: "🔴" },
  { key: "liquidation", label: "Liquidation", icon: "💀" },
  { key: "position", label: "Position", icon: "📊" },
  { key: "security", label: "Security", icon: "🚨" },
];

// ── Helpers ──
const fmtUsd = (v) => {
  if (!v) return null;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

const timeAgo = (iso) => {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const typeColor = (t) => {
  const map = {
    transfer: "bg-blue-500/15 text-blue-400 border-blue-500/25",
    whale_transfer: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25",
    smart_money: "bg-purple-500/15 text-purple-400 border-purple-500/25",
    buy: "bg-green-500/15 text-green-400 border-green-500/25",
    sell: "bg-red-500/15 text-red-400 border-red-500/25",
    liquidation: "bg-orange-500/15 text-orange-400 border-orange-500/25",
    deposit: "bg-teal-500/15 text-teal-400 border-teal-500/25",
    mint_burn: "bg-amber-500/15 text-amber-400 border-amber-500/25",
    position: "bg-indigo-500/15 text-indigo-400 border-indigo-500/25",
    security: "bg-red-600/15 text-red-500 border-red-600/25",
  };
  return map[t] || "bg-white/10 text-white/70 border-white/15";
};

const typeIcon = (t) => {
  const map = {
    transfer: "🔄", whale_transfer: "🐋", smart_money: "🧠", buy: "🟢",
    sell: "🔴", liquidation: "💀", deposit: "📥", mint_burn: "🔥",
    position: "📊", security: "🚨",
  };
  return map[t] || "📡";
};

const chainColor = (c) => {
  const map = {
    Ethereum: "bg-blue-500", Bitcoin: "bg-orange-500", Solana: "bg-purple-500",
    Tron: "bg-red-500", Base: "bg-blue-400", Hyperliquid: "bg-green-500",
    Polygon: "bg-violet-500", Arbitrum: "bg-sky-500", BSC: "bg-yellow-500",
    Avalanche: "bg-red-600", Optimism: "bg-red-500", Sui: "bg-cyan-400",
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
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [last24h, setLast24h] = useState(0);
  const refreshRef = useRef(null);

  // ── Fetch feed ──
  const fetchFeed = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE) });
      if (alertType !== "all") params.append("alert_type", alertType);
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
  }, [page, alertType, search]);

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
    refreshRef.current = setInterval(() => { fetchFeed(); fetchStats(); }, REFRESH_INTERVAL);
    return () => clearInterval(refreshRef.current);
  }, [fetchFeed, fetchStats]);

  // ── Filter change resets page ──
  const handleTypeFilter = (t) => { setAlertType(t); setPage(1); };
  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  // ── Separate featured (has photo) from regular alerts ──
  const featuredAlerts = page === 1 ? alerts.filter(a => a.has_photo && a.image_url).slice(0, 2) : [];
  const featuredIds = new Set(featuredAlerts.map(a => a.id));
  const regularAlerts = alerts.filter(a => !featuredIds.has(a.id));

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">On-Chain Intelligence</h1>
          <p className="text-text-muted text-sm mt-1">Whale transfers · Smart money · Liquidations</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-text-muted">
            📡 Total <span className="text-white font-bold ml-1">{totalAlerts.toLocaleString()}</span>
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-text-muted">
            🕐 24h <span className="text-white font-bold ml-1">{last24h.toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Live
          </span>
        </div>
      </div>

      {/* ── Type filters ── */}
      <div className="flex flex-wrap gap-2">
        {ALERT_TYPES.map(({ key, label, icon }) => {
          const count = key === "all" ? totalAlerts : stats?.by_type?.find(t => t.type === key)?.count;
          return (
            <button
              key={key}
              onClick={() => handleTypeFilter(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                alertType === key
                  ? "bg-gold-primary/20 text-gold-primary border-gold-primary/30"
                  : "bg-white/[0.03] text-text-muted border-white/5 hover:text-white hover:border-gold-primary/20"
              }`}
            >
              {icon} {label} {count != null && <span className="opacity-60 ml-0.5">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* ── Search bar ── */}
      <div className="relative max-w-md">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search alerts..."
          value={search}
          onChange={handleSearch}
          className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-white/10 rounded-xl text-sm text-white placeholder:text-text-muted/50 focus:outline-none focus:border-gold-primary/40 transition-colors"
        />
      </div>

      {/* ── Main content grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Feed */}
        <div className="lg:col-span-9 space-y-5">
          {loading ? (
            <LoadingSkeleton />
          ) : alerts.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* Featured cards (alerts with photos) */}
              {featuredAlerts.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {featuredAlerts.map(alert => (
                    <FeaturedCard key={alert.id} alert={alert} onClick={() => setSelectedAlert(alert)} />
                  ))}
                </div>
              )}

              {/* Regular grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {regularAlerts.map(alert => (
                  <AlertCard key={alert.id} alert={alert} onClick={() => setSelectedAlert(alert)} />
                ))}
              </div>

              {/* Pagination */}
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </div>

        {/* Right: Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          <SidebarTrendingTokens stats={stats} />
          <SidebarBlockchains stats={stats} />
          <SidebarLargestMoves stats={stats} />
        </div>
      </div>

      {/* ── Modal ── */}
      {selectedAlert && (
        <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
      )}

      {/* ── Footer ── */}
      <div className="text-center py-4">
        <span className="text-text-muted/40 text-xs flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Auto-refresh every 60s — Page {page} of {totalPages}
        </span>
      </div>
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// FEATURED CARD — alerts with photos get hero treatment
// ════════════════════════════════════════════════════════════════
const FeaturedCard = ({ alert, onClick }) => (
  <div
    onClick={onClick}
    className="group glass-card rounded-xl overflow-hidden border border-gold-primary/10 hover:border-gold-primary/30 cursor-pointer transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,.3)]"
  >
    {/* Image — contained properly so tables/charts don't overflow */}
    {alert.image_url && (
      <div className="h-48 bg-black/60 flex items-center justify-center overflow-hidden">
        <img
          src={alert.image_url}
          alt=""
          className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-500"
          onError={(e) => { e.target.parentElement.style.display = "none"; }}
        />
      </div>
    )}
    <div className="p-4">
      {/* Type badge + token */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${typeColor(alert.alert_type)}`}>
          {typeIcon(alert.alert_type)} {alert.alert_type?.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
        </span>
        {alert.token && (
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-gold-primary/15 text-gold-primary border border-gold-primary/25 font-bold">
            ${alert.token}
          </span>
        )}
      </div>
      {/* Title */}
      <p className="text-white text-sm font-semibold leading-snug line-clamp-2 group-hover:text-gold-primary transition-colors">
        {alert.title || alert.raw_text?.slice(0, 120)}
      </p>
      {/* Footer */}
      <div className="flex items-center justify-between mt-3 text-[10px] text-text-muted">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${chainColor(alert.blockchain)}`} />
            {alert.blockchain || "Unknown"}
          </span>
          {alert.amount_usd && (
            <span className="font-mono text-gold-primary font-bold">{fmtUsd(alert.amount_usd)}</span>
          )}
        </div>
        <span>{timeAgo(alert.created_at)}</span>
      </div>
    </div>
  </div>
);


// ════════════════════════════════════════════════════════════════
// ALERT CARD — regular grid card with optional thumbnail
// ════════════════════════════════════════════════════════════════
const AlertCard = ({ alert, onClick }) => (
  <div
    onClick={onClick}
    className="group glass-card rounded-xl border border-white/5 hover:border-gold-primary/20 cursor-pointer transition-all duration-200 overflow-hidden"
  >
    {/* Thumbnail — small preview if alert has photo */}
    {alert.has_photo && alert.image_url && (
      <div className="h-28 bg-black/40 flex items-center justify-center overflow-hidden">
        <img
          src={alert.image_url}
          alt=""
          className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300"
          onError={(e) => { e.target.parentElement.style.display = "none"; }}
        />
      </div>
    )}
    <div className="p-3.5">
      {/* Type badge row */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${typeColor(alert.alert_type)}`}>
          {typeIcon(alert.alert_type)} {alert.alert_type?.replace("_", " ").toUpperCase()}
        </span>
        {alert.amount_usd && (
          <span className="text-[10px] font-mono text-gold-primary font-bold ml-auto">
            {fmtUsd(alert.amount_usd)}
          </span>
        )}
        <span className="text-[10px] text-text-muted ml-auto">{timeAgo(alert.created_at)}</span>
      </div>
      {/* Token + amount */}
      {alert.token && (
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-white font-bold text-sm">${alert.token}</span>
          {alert.amount_raw && (
            <span className="text-text-muted text-xs font-mono">{Number(alert.amount_raw).toLocaleString()}</span>
          )}
        </div>
      )}
      {/* Title */}
      <p className="text-text-secondary text-xs leading-relaxed line-clamp-2">
        {alert.title || alert.raw_text?.slice(0, 100)}
      </p>
      {/* Footer */}
      <div className="flex items-center gap-2 mt-2.5 text-[10px] text-text-muted">
        {alert.blockchain && (
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${chainColor(alert.blockchain)}`} />
            {alert.blockchain}
          </span>
        )}
        <span className="opacity-50">{alert.source_name}</span>
      </div>
    </div>
  </div>
);


// ════════════════════════════════════════════════════════════════
// ALERT MODAL — full detail view
// ════════════════════════════════════════════════════════════════
const AlertModal = ({ alert, onClose }) => {
  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      
      {/* Modal content */}
      <div
        className="relative w-full max-w-lg bg-[#0d0809] border border-gold-primary/20 rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center text-text-muted hover:text-white hover:border-white/30 transition-colors"
        >
          ✕
        </button>

        {/* Scrollable content */}
        <div className="overflow-y-auto">
          {/* Image — full width, properly contained */}
          {alert.image_url && (
            <div className="bg-black flex items-center justify-center" style={{ minHeight: "120px", maxHeight: "400px" }}>
              <img
                src={alert.image_url}
                alt=""
                className="w-full max-h-[400px] object-contain"
                onError={(e) => { e.target.parentElement.style.display = "none"; }}
              />
            </div>
          )}

          <div className="p-5 space-y-4">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-lg border font-bold ${typeColor(alert.alert_type)}`}>
                {typeIcon(alert.alert_type)} {alert.alert_type?.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
              </span>
              {alert.blockchain && (
                <span className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-text-secondary flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${chainColor(alert.blockchain)}`} />
                  {alert.blockchain}
                </span>
              )}
              {alert.token && (
                <span className="text-xs px-2.5 py-1 rounded-lg bg-gold-primary/15 text-gold-primary border border-gold-primary/25 font-bold">
                  ${alert.token}
                </span>
              )}
            </div>

            {/* Amount */}
            {alert.amount_usd && (
              <div>
                <p className="text-3xl font-bold text-white font-mono">{fmtUsd(alert.amount_usd)}</p>
                {alert.amount_raw && alert.token && (
                  <p className="text-text-muted text-sm mt-0.5">
                    ({Number(alert.amount_raw).toLocaleString()} {alert.token})
                  </p>
                )}
              </div>
            )}

            {/* From → To */}
            {(alert.from_entity || alert.to_entity) && (
              <div className="flex items-center gap-3">
                {alert.from_entity && (
                  <div className="flex-1 p-2.5 rounded-lg bg-red-500/5 border border-red-500/15">
                    <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mb-0.5">From</p>
                    <p className="text-white text-xs font-mono truncate">{alert.from_entity}</p>
                  </div>
                )}
                {alert.from_entity && alert.to_entity && (
                  <span className="text-text-muted text-lg">→</span>
                )}
                {alert.to_entity && (
                  <div className="flex-1 p-2.5 rounded-lg bg-green-500/5 border border-green-500/15">
                    <p className="text-[10px] text-green-400 font-semibold uppercase tracking-wider mb-0.5">To</p>
                    <p className="text-white text-xs font-mono truncate">{alert.to_entity}</p>
                  </div>
                )}
              </div>
            )}

            {/* Raw text */}
            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/5">
              <p className="text-text-secondary text-xs leading-relaxed whitespace-pre-wrap break-words">
                {alert.raw_text}
              </p>
            </div>

            {/* Footer info */}
            <div className="flex items-center justify-between text-[10px] text-text-muted">
              <span>{alert.source_name}</span>
              <span>{alert.created_at ? new Date(alert.created_at).toLocaleString() : ""}</span>
            </div>

            {/* Explorer button */}
            {alert.tx_url && (
              <a
                href={alert.tx_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center py-3 rounded-xl bg-gradient-to-r from-gold-primary to-yellow-600 text-black font-bold text-sm hover:brightness-110 transition-all"
              >
                View on Explorer ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// SIDEBAR COMPONENTS
// ════════════════════════════════════════════════════════════════
const SidebarSection = ({ title, icon, children }) => (
  <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
    <div className="px-4 py-3 border-b border-gold-primary/10">
      <h3 className="text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
    </div>
    <div className="p-3">{children}</div>
  </div>
);

const SidebarTrendingTokens = ({ stats }) => {
  const tokens = stats?.top_tokens?.slice(0, 8) || [];
  if (!tokens.length) return null;
  return (
    <SidebarSection title="Trending Tokens" icon="🔥">
      <div className="space-y-1.5">
        {tokens.map((t, i) => (
          <div key={t.token} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors">
            <span className="text-white text-xs font-semibold">${t.token}</span>
            <div className="flex items-center gap-2">
              {t.total_usd && (
                <span className="text-gold-primary text-[10px] font-mono">{fmtUsd(t.total_usd)}</span>
              )}
              <span className="text-text-muted text-[10px]">{t.count}</span>
            </div>
          </div>
        ))}
      </div>
    </SidebarSection>
  );
};

const SidebarBlockchains = ({ stats }) => {
  const chains = stats?.by_blockchain?.slice(0, 8) || [];
  if (!chains.length) return null;
  return (
    <SidebarSection title="Blockchains" icon="⛓">
      <div className="space-y-1.5">
        {chains.map(c => (
          <div key={c.blockchain} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors">
            <span className="flex items-center gap-2 text-xs text-white">
              <span className={`w-2 h-2 rounded-full ${chainColor(c.blockchain)}`} />
              {c.blockchain}
            </span>
            <span className="text-text-muted text-[10px]">{c.count}</span>
          </div>
        ))}
      </div>
    </SidebarSection>
  );
};

const SidebarLargestMoves = ({ stats }) => {
  const moves = stats?.largest_moves?.slice(0, 5) || [];
  if (!moves.length) return null;
  return (
    <SidebarSection title="Largest Moves" icon="💰">
      <div className="space-y-1.5">
        {moves.map((m, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-text-muted text-[10px] w-4">#{i + 1}</span>
              <span className="text-white text-xs font-semibold">{m.token || "?"}</span>
            </div>
            <span className="text-gold-primary text-xs font-mono font-bold">{fmtUsd(m.amount_usd)}</span>
          </div>
        ))}
      </div>
    </SidebarSection>
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
    <div className="flex items-center justify-center gap-1.5 pt-4">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="px-3 py-2 rounded-xl text-xs font-semibold border border-white/10 text-text-muted hover:text-white hover:border-gold-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
      >
        ← Prev
      </button>
      {getPages().map((p, i) =>
        p === "..." ? (
          <span key={`dots-${i}`} className="px-2 text-text-muted text-xs">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-9 h-9 rounded-xl text-xs font-bold transition-all ${
              p === page
                ? "bg-gold-primary text-black"
                : "border border-white/10 text-text-muted hover:text-white hover:border-gold-primary/30"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="px-3 py-2 rounded-xl text-xs font-semibold border border-white/10 text-text-muted hover:text-white hover:border-gold-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
  <div className="space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="glass-card rounded-xl border border-white/5 overflow-hidden">
          <div className="h-48 bg-white/[0.03] animate-pulse" />
          <div className="p-4 space-y-2">
            <div className="h-4 bg-white/[0.05] rounded w-1/3 animate-pulse" />
            <div className="h-3 bg-white/[0.03] rounded w-2/3 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="glass-card rounded-xl border border-white/5 p-4 space-y-2">
          <div className="h-4 bg-white/[0.05] rounded w-1/4 animate-pulse" />
          <div className="h-3 bg-white/[0.03] rounded w-3/4 animate-pulse" />
          <div className="h-3 bg-white/[0.03] rounded w-1/2 animate-pulse" />
        </div>
      ))}
    </div>
  </div>
);

const EmptyState = () => (
  <div className="glass-card rounded-xl border border-gold-primary/10 p-12 text-center">
    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gold-primary/10 flex items-center justify-center">
      <span className="text-3xl">🔗</span>
    </div>
    <p className="text-text-muted text-sm">No alerts found</p>
    <p className="text-text-muted/50 text-xs mt-1">Try adjusting your filters</p>
  </div>
);


export default OnchainPage;