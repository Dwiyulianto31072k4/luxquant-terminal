// src/components/OnchainPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — On-Chain Intelligence
// Whale transfers, smart money moves, liquidations
// Grid layout, filters, modal, pagination (same style as CryptoNewsPage)
// ════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react';

const API = '/api/v1/onchain';
const PAGE_SIZE = 24;

// ─── Alert type config ───
const ALERT_TYPES = {
  transfer:      { icon: '🔄', label: 'Transfer',    color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
  whale_transfer:{ icon: '🐋', label: 'Whale',       color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20' },
  buy:           { icon: '🟢', label: 'Buy',          color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/20' },
  sell:          { icon: '🔴', label: 'Sell',          color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
  liquidation:   { icon: '💀', label: 'Liquidation',  color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
  deposit:       { icon: '📥', label: 'Deposit',      color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
  mint_burn:     { icon: '🔥', label: 'Mint/Burn',    color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20' },
  position:      { icon: '📊', label: 'Position',     color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20' },
  security:      { icon: '🚨', label: 'Security',     color: 'text-red-500',     bg: 'bg-red-600/10',     border: 'border-red-600/20' },
  smart_money:   { icon: '🧠', label: 'Smart Money',  color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
};

const SOURCE_ICONS = {
  'Whale Alert':     '🐋',
  'Lookonchain':     '👁️',
  'WhaleBot Alerts': '🐳',
  'Mlm Onchain':     '📊',
};

const BLOCKCHAIN_COLORS = {
  Bitcoin: '#f7931a', Ethereum: '#627eea', Solana: '#9945ff', Tron: '#ff0013',
  BSC: '#f3ba2f', Polygon: '#8247e5', Arbitrum: '#28a0f0', Hyperliquid: '#00d4aa',
  Base: '#0052ff', Optimism: '#ff0420',
};

// ─── Helpers ───
const fmtUSD = (n) => {
  if (!n) return null;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

const timeAgo = (iso) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

// ════════════════════════════════════════════
// Alert Card
// ════════════════════════════════════════════
const AlertCard = ({ alert, onClick }) => {
  const cfg = ALERT_TYPES[alert.alert_type] || ALERT_TYPES.transfer;
  const srcIcon = SOURCE_ICONS[alert.source_name] || '📡';
  const bcColor = BLOCKCHAIN_COLORS[alert.blockchain] || '#666';

  return (
    <div
      onClick={() => onClick(alert)}
      className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] p-4 cursor-pointer transition-all duration-200 flex flex-col gap-2.5 min-h-[150px]"
    >
      {/* Top: type badge + time */}
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.border} border ${cfg.color}`}>
          {cfg.icon} {cfg.label}
        </span>
        <span className="text-text-muted text-[10px] flex-shrink-0">{timeAgo(alert.created_at)}</span>
      </div>

      {/* Token + Amount line */}
      {(alert.token || alert.amount_usd) && (
        <div className="flex items-baseline gap-2">
          {alert.token && <span className="text-white font-bold text-sm">${alert.token}</span>}
          {alert.amount_usd && (
            <span className="text-gold-primary font-mono text-xs font-semibold">{fmtUSD(alert.amount_usd)}</span>
          )}
        </div>
      )}

      {/* Title / preview text */}
      <p className="text-text-secondary text-[11px] leading-relaxed line-clamp-3 flex-1">
        {alert.title || (alert.raw_text ? alert.raw_text.slice(0, 140) : 'No details')}
      </p>

      {/* Bottom: source + blockchain + photo indicator */}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/[0.04] mt-auto">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs flex-shrink-0">{srcIcon}</span>
          <span className="text-text-muted text-[10px] truncate">{alert.source_name}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {alert.blockchain && (
            <span className="flex items-center gap-1 text-[10px] text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: bcColor }} />
              {alert.blockchain}
            </span>
          )}
          {alert.has_photo && <span className="text-[10px] opacity-60">📷</span>}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════
// Featured Card (large, for top row)
// ════════════════════════════════════════════
const FeaturedCard = ({ alert, onClick }) => {
  const cfg = ALERT_TYPES[alert.alert_type] || ALERT_TYPES.transfer;
  const bcColor = BLOCKCHAIN_COLORS[alert.blockchain] || '#666';

  return (
    <div
      onClick={() => onClick(alert)}
      className="group relative rounded-xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-transparent hover:border-gold-primary/20 cursor-pointer transition-all duration-300 overflow-hidden"
    >
      {/* Image area */}
      <div className="relative h-36 sm:h-44 bg-black/20 overflow-hidden">
        {alert.image_url ? (
          <img
            src={alert.image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gold-primary/5 to-transparent">
            <span className="text-4xl opacity-20">{cfg.icon}</span>
          </div>
        )}
        {/* Overlay badges */}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${cfg.bg} ${cfg.color} backdrop-blur-md border ${cfg.border}`}>
            {cfg.icon} {cfg.label}
          </span>
        </div>
        {alert.amount_usd && (
          <div className="absolute bottom-2 right-2">
            <span className="px-2 py-0.5 rounded-md text-xs font-bold font-mono bg-black/60 backdrop-blur-md text-gold-primary border border-gold-primary/20">
              {fmtUSD(alert.amount_usd)}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 space-y-2">
        {alert.token && (
          <span className="text-white font-bold text-sm">${alert.token}</span>
        )}
        <p className="text-text-secondary text-xs leading-relaxed line-clamp-2">
          {alert.title || (alert.raw_text ? alert.raw_text.slice(0, 120) : '')}
        </p>
        <div className="flex items-center justify-between text-[10px] text-text-muted pt-1">
          <span>{SOURCE_ICONS[alert.source_name] || '📡'} {alert.source_name}</span>
          <div className="flex items-center gap-2">
            {alert.blockchain && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: bcColor }} />
                {alert.blockchain}
              </span>
            )}
            <span>{timeAgo(alert.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════
// Alert Detail Modal
// ════════════════════════════════════════════
const AlertModal = ({ alert, onClose }) => {
  if (!alert) return null;
  const cfg = ALERT_TYPES[alert.alert_type] || ALERT_TYPES.transfer;
  const bcColor = BLOCKCHAIN_COLORS[alert.blockchain] || '#666';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-bg-card border border-white/10 shadow-2xl custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close btn */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-text-muted hover:text-white transition-colors"
        >
          ✕
        </button>

        {/* Image */}
        {alert.image_url && (
          <div className="w-full aspect-video bg-black/30 overflow-hidden rounded-t-2xl">
            <img src={alert.image_url} alt="" className="w-full h-full object-contain" />
          </div>
        )}

        <div className="p-5 space-y-4">
          {/* Badges row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${cfg.bg} ${cfg.border} border ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </span>
            {alert.blockchain && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-white/5 border border-white/10 text-text-secondary">
                <span className="w-2 h-2 rounded-full" style={{ background: bcColor }} />
                {alert.blockchain}
              </span>
            )}
            {alert.token && (
              <span className="px-2 py-1 rounded-lg text-xs font-bold bg-gold-primary/10 border border-gold-primary/20 text-gold-primary">
                ${alert.token}
              </span>
            )}
          </div>

          {/* Amount */}
          {alert.amount_usd && (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white font-mono">{fmtUSD(alert.amount_usd)}</span>
              {alert.amount_raw && (
                <span className="text-text-muted text-xs">
                  ({Number(alert.amount_raw).toLocaleString()} {alert.token || ''})
                </span>
              )}
            </div>
          )}

          {/* From → To */}
          {(alert.from_entity || alert.to_entity) && (
            <div className="bg-white/[0.03] rounded-xl p-3 border border-white/5 space-y-2">
              {alert.from_entity && (
                <div className="flex items-center gap-2">
                  <span className="text-red-400 text-[10px] font-bold uppercase w-10 flex-shrink-0">From</span>
                  <span className="text-white text-xs font-mono truncate">{alert.from_entity}</span>
                </div>
              )}
              {alert.from_entity && alert.to_entity && (
                <div className="flex justify-center"><span className="text-text-muted/40 text-base">↓</span></div>
              )}
              {alert.to_entity && (
                <div className="flex items-center gap-2">
                  <span className="text-green-400 text-[10px] font-bold uppercase w-10 flex-shrink-0">To</span>
                  <span className="text-white text-xs font-mono truncate">{alert.to_entity}</span>
                </div>
              )}
            </div>
          )}

          {/* Raw text */}
          <div className="bg-white/[0.02] rounded-xl p-3.5 border border-white/5">
            <p className="text-text-secondary text-xs leading-relaxed whitespace-pre-wrap">{alert.raw_text}</p>
          </div>

          {/* Meta footer */}
          <div className="flex items-center justify-between text-[10px] text-text-muted pt-1">
            <span>{SOURCE_ICONS[alert.source_name] || '📡'} {alert.source_name}</span>
            <span>{alert.created_at ? new Date(alert.created_at).toLocaleString() : ''}</span>
          </div>

          {/* CTA: View on Explorer */}
          {alert.tx_url && (
            <a
              href={alert.tx_url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-gold-dark via-gold-primary to-gold-light text-bg-primary rounded-xl text-sm font-bold shadow-lg shadow-gold-primary/20 hover:shadow-gold-primary/40 hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
              View on Explorer
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════
// Pagination (same style as CryptoNewsPage)
// ════════════════════════════════════════════
const Pagination = ({ page, totalPages, onChange }) => {
  if (totalPages <= 1) return null;

  const pages = [];
  const maxShow = 5;
  let start = Math.max(1, page - Math.floor(maxShow / 2));
  let end = Math.min(totalPages, start + maxShow - 1);
  if (end - start < maxShow - 1) start = Math.max(1, end - maxShow + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="px-4 py-2 rounded-xl text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-text-secondary hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        ← Prev
      </button>

      <div className="flex items-center gap-1">
        {start > 1 && (
          <>
            <button onClick={() => onChange(1)} className="w-9 h-9 rounded-xl text-xs text-text-muted hover:text-white hover:bg-white/[0.05] transition-colors">1</button>
            {start > 2 && <span className="text-text-muted/40 text-xs px-0.5">…</span>}
          </>
        )}
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`w-9 h-9 rounded-xl text-xs font-medium transition-all duration-200 ${
              p === page
                ? 'bg-gold-primary/15 text-gold-primary border border-gold-primary/25 shadow-sm shadow-gold-primary/10'
                : 'text-text-muted hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {p}
          </button>
        ))}
        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="text-text-muted/40 text-xs px-0.5">…</span>}
            <button onClick={() => onChange(totalPages)} className="w-9 h-9 rounded-xl text-xs text-text-muted hover:text-white hover:bg-white/[0.05] transition-colors">{totalPages}</button>
          </>
        )}
      </div>

      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="px-4 py-2 rounded-xl text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-text-secondary hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  );
};

// ════════════════════════════════════════════
// Sidebar
// ════════════════════════════════════════════
const Sidebar = ({ stats, activeFilters, onFilter }) => {
  if (!stats) return null;

  return (
    <div className="space-y-4">
      {/* Top Tokens */}
      {stats.by_token?.length > 0 && (
        <div className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.06]">
          <h3 className="text-white text-xs font-bold mb-3 flex items-center gap-1.5">
            🪙 Trending Tokens
          </h3>
          <div className="space-y-1">
            {stats.by_token.slice(0, 8).map((t) => (
              <button
                key={t.token}
                onClick={() => onFilter('token', activeFilters.token === t.token ? null : t.token)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-all ${
                  activeFilters.token === t.token
                    ? 'bg-gold-primary/10 border border-gold-primary/20 text-gold-primary'
                    : 'hover:bg-white/[0.04] text-text-secondary'
                }`}
              >
                <span className="font-mono font-medium">${t.token}</span>
                <div className="flex items-center gap-2">
                  {t.total_usd > 0 && <span className="text-text-muted text-[10px]">{fmtUSD(t.total_usd)}</span>}
                  <span className="text-text-muted/60 text-[10px] min-w-[20px] text-right">{t.count}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Blockchains */}
      {stats.by_blockchain?.length > 0 && (
        <div className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.06]">
          <h3 className="text-white text-xs font-bold mb-3 flex items-center gap-1.5">
            ⛓️ Blockchains
          </h3>
          <div className="space-y-1">
            {stats.by_blockchain.map((b) => (
              <button
                key={b.blockchain}
                onClick={() => onFilter('blockchain', activeFilters.blockchain === b.blockchain ? null : b.blockchain)}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-all ${
                  activeFilters.blockchain === b.blockchain
                    ? 'bg-gold-primary/10 border border-gold-primary/20 text-gold-primary'
                    : 'hover:bg-white/[0.04] text-text-secondary'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: BLOCKCHAIN_COLORS[b.blockchain] || '#666' }} />
                  {b.blockchain}
                </span>
                <span className="text-text-muted/60 text-[10px]">{b.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Largest Moves */}
      {stats.largest?.length > 0 && (
        <div className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.06]">
          <h3 className="text-white text-xs font-bold mb-3 flex items-center gap-1.5">
            💰 Largest Moves
          </h3>
          <div className="space-y-2">
            {stats.largest.map((l, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-text-muted w-4 text-[10px]">#{i + 1}</span>
                  <span className="text-text-secondary font-mono">{l.token || '?'}</span>
                </div>
                <span className="text-gold-primary font-mono font-semibold">{fmtUSD(l.amount_usd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════
// Loading Skeleton
// ════════════════════════════════════════════
const LoadingSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
    {[...Array(12)].map((_, i) => (
      <div key={i} className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.06] animate-pulse min-h-[150px] space-y-3">
        <div className="flex justify-between">
          <div className="h-4 bg-white/[0.06] rounded-md w-20" />
          <div className="h-3 bg-white/[0.04] rounded w-12" />
        </div>
        <div className="h-4 bg-white/[0.05] rounded w-1/2" />
        <div className="space-y-1.5 flex-1">
          <div className="h-3 bg-white/[0.03] rounded w-full" />
          <div className="h-3 bg-white/[0.03] rounded w-4/5" />
        </div>
        <div className="h-3 bg-white/[0.02] rounded w-2/3 mt-auto" />
      </div>
    ))}
  </div>
);

// ═══════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════
export default function OnchainPage() {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ alert_type: null, source: null, token: null, blockchain: null });
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch alerts
  const fetchAlerts = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const params = new URLSearchParams({ page, per_page: PAGE_SIZE });
      if (filters.alert_type) params.set('alert_type', filters.alert_type);
      if (filters.source) params.set('source', filters.source);
      if (filters.token) params.set('token', filters.token);
      if (filters.blockchain) params.set('blockchain', filters.blockchain);
      if (search) params.set('search', search);
      const res = await fetch(`${API}/feed?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.alerts || []);
      setTotalPages(data.total_pages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Onchain feed error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filters, search]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats`);
      if (!res.ok) return;
      setStats(await res.json());
    } catch (err) {
      console.error('Onchain stats error:', err);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Auto refresh 60s
  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(() => { fetchAlerts(false); fetchStats(); }, 60000);
    return () => clearInterval(iv);
  }, [autoRefresh, fetchAlerts, fetchStats]);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleFilter = (key, val) => {
    setFilters((f) => ({ ...f, [key]: val }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ alert_type: null, source: null, token: null, blockchain: null });
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const hasFilters = Object.values(filters).some(Boolean) || search;

  const handlePageChange = (p) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Type filter pills from stats
  const typeFilters = useMemo(() => {
    const types = stats?.by_type || [];
    return [
      { key: null, label: 'All', icon: '📡' },
      ...types.map((t) => ({
        key: t.type,
        label: ALERT_TYPES[t.type]?.label || t.type,
        icon: ALERT_TYPES[t.type]?.icon || '📡',
        count: t.count,
      })),
    ];
  }, [stats]);

  // Featured: first 2 alerts with photos on page 1
  const featuredAlerts = useMemo(() => {
    if (page !== 1 || hasFilters) return [];
    return alerts.filter((a) => a.has_photo && a.image_url).slice(0, 2);
  }, [alerts, page, hasFilters]);

  const gridAlerts = useMemo(() => {
    const featuredIds = new Set(featuredAlerts.map((a) => a.id));
    return alerts.filter((a) => !featuredIds.has(a.id));
  }, [alerts, featuredAlerts]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
            On-Chain Intelligence
          </h1>
          <p className="text-text-muted text-xs sm:text-sm mt-0.5">
            Whale transfers · Smart money · Liquidations
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stats && (
            <>
              {[
                { icon: '📡', label: 'Total', value: stats.total },
                { icon: '🕐', label: '24h', value: stats.last_24h },
                { icon: '⚡', label: '1h', value: stats.last_1h },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
                  <span className="text-sm">{s.icon}</span>
                  <span className="text-[11px] text-text-muted">{s.label}</span>
                  <span className="text-[11px] text-white font-bold">{s.value?.toLocaleString()}</span>
                </div>
              ))}
            </>
          )}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              autoRefresh
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-white/[0.03] border-white/[0.06] text-text-muted'
            }`}
          >
            {autoRefresh ? '🟢 Live' : '⏸️ Paused'}
          </button>
          <button
            onClick={() => { fetchAlerts(true); fetchStats(); }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-text-secondary hover:text-white transition-all"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* ── Type filter pills ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {typeFilters.map((t) => (
          <button
            key={t.key ?? 'all'}
            onClick={() => handleFilter('alert_type', t.key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filters.alert_type === t.key
                ? 'border-gold-primary/40 bg-gold-primary/10 text-gold-primary'
                : 'border-white/[0.06] bg-white/[0.02] text-text-secondary hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            {t.icon} {t.label}
            {t.count != null && <span className="ml-1 text-text-muted/60">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* ── Search + active filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search alerts..."
            className="w-full px-3 py-2 pl-8 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-xs placeholder-text-muted/60 focus:outline-none focus:border-gold-primary/30 transition-colors"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted/50 text-xs">🔍</span>
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 rounded-xl text-xs text-red-400 hover:bg-red-500/10 border border-red-500/20 transition-colors"
          >
            ✕ Clear
          </button>
        )}
        {Object.entries(filters).map(([k, v]) =>
          v ? (
            <span key={k} className="px-2 py-1 rounded-lg text-[10px] bg-gold-primary/10 text-gold-primary border border-gold-primary/20 flex items-center gap-1">
              {v}
              <button onClick={() => handleFilter(k, null)} className="hover:text-white ml-0.5">✕</button>
            </span>
          ) : null
        )}
      </div>

      {/* ── Main content ── */}
      {loading ? (
        <LoadingSkeleton />
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
            <span className="text-2xl opacity-30">🔗</span>
          </div>
          <p className="text-text-muted text-sm">No alerts found</p>
          {hasFilters && <p className="text-text-muted/60 text-xs mt-1">Try adjusting your filters</p>}
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-5">
          {/* Left: feed */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Featured row */}
            {featuredAlerts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {featuredAlerts.map((a) => (
                  <FeaturedCard key={a.id} alert={a} onClick={setSelectedAlert} />
                ))}
              </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {gridAlerts.map((a) => (
                <AlertCard key={a.id} alert={a} onClick={setSelectedAlert} />
              ))}
            </div>

            {/* Pagination */}
            <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} />
          </div>

          {/* Right: sidebar */}
          <div className="w-full lg:w-72 xl:w-80 flex-shrink-0">
            <div className="lg:sticky lg:top-20">
              <Sidebar stats={stats} activeFilters={filters} onFilter={handleFilter} />
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div className="flex items-center justify-center gap-2 py-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        <span className="text-text-muted text-[10px]">
          Auto-refresh every 60s — Page {page} of {totalPages || 1}
        </span>
      </div>

      {/* ── Modal ── */}
      <AlertModal alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
    </div>
  );
}