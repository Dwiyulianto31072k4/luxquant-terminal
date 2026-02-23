// src/components/WhaleAlertPage.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import whaleApi from "../services/whaleApi";

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════
const BLOCKCHAINS = [
  { key: null, label: "All Chains" },
  { key: "bitcoin", label: "Bitcoin", symbol: "BTC", color: "#F7931A" },
  { key: "ethereum", label: "Ethereum", symbol: "ETH", color: "#627EEA" },
];

const TRANSFER_TYPES = [
  { key: null, label: "All Types", icon: "🔄" },
  { key: "exchange_inflow", label: "Exchange Inflow", icon: "📥", color: "#ef4444" },
  { key: "exchange_outflow", label: "Exchange Outflow", icon: "📤", color: "#22c55e" },
  { key: "wallet_to_wallet", label: "Wallet → Wallet", icon: "👛", color: "#8b5cf6" },
  { key: "exchange_to_exchange", label: "Exchange → Exchange", icon: "🏦", color: "#3b82f6" },
];

const MIN_USD_OPTIONS = [
  { value: 50000, label: "$50K+" },
  { value: 100000, label: "$100K+" },
  { value: 500000, label: "$500K+" },
  { value: 1000000, label: "$1M+" },
  { value: 5000000, label: "$5M+" },
];

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════
const formatUSD = (val) => {
  if (!val) return "$0";
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
};

const formatAmount = (val) => {
  if (!val) return "0";
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toFixed(2);
};

const timeAgo = (timestamp) => {
  if (!timestamp) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const shortenAddress = (addr) => {
  if (!addr || addr.length < 12) return addr || "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const getTransferTypeInfo = (type) => {
  return TRANSFER_TYPES.find((t) => t.key === type) || TRANSFER_TYPES[0];
};

// ═══════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════

/** Flow Sentiment Banner */
const FlowBanner = ({ flows }) => {
  if (!flows) return null;

  const isBullish = flows.sentiment === "bullish";
  const isBearish = flows.sentiment === "bearish";

  return (
    <div
      className="rounded-2xl p-4 sm:p-5 border backdrop-blur-sm"
      style={{
        background: isBullish
          ? "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))"
          : isBearish
          ? "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(239,68,68,0.02))"
          : "linear-gradient(135deg, rgba(212,168,83,0.08), rgba(212,168,83,0.02))",
        borderColor: isBullish
          ? "rgba(34,197,94,0.2)"
          : isBearish
          ? "rgba(239,68,68,0.2)"
          : "rgba(212,168,83,0.2)",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        {/* Sentiment indicator */}
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{
              background: isBullish
                ? "rgba(34,197,94,0.15)"
                : isBearish
                ? "rgba(239,68,68,0.15)"
                : "rgba(212,168,83,0.15)",
            }}
          >
            {isBullish ? "🟢" : isBearish ? "🔴" : "⚪"}
          </div>
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider font-medium">
              Exchange Net Flow
            </p>
            <p
              className="text-lg font-bold font-display"
              style={{
                color: isBullish ? "#22c55e" : isBearish ? "#ef4444" : "#d4a853",
              }}
            >
              {isBullish ? "Bullish" : isBearish ? "Bearish" : "Neutral"}
            </p>
          </div>
        </div>

        {/* Flow details */}
        <div className="flex gap-4 sm:gap-6 flex-1">
          <div className="flex-1 sm:flex-none">
            <p className="text-[11px] text-text-muted mb-0.5">📥 Inflow</p>
            <p className="text-sm font-semibold text-red-400">
              {formatUSD(flows.inflow?.volume_usd || 0)}
            </p>
            <p className="text-[10px] text-text-muted">
              {flows.inflow?.count || 0} txs
            </p>
          </div>
          <div className="flex-1 sm:flex-none">
            <p className="text-[11px] text-text-muted mb-0.5">📤 Outflow</p>
            <p className="text-sm font-semibold text-green-400">
              {formatUSD(flows.outflow?.volume_usd || 0)}
            </p>
            <p className="text-[10px] text-text-muted">
              {flows.outflow?.count || 0} txs
            </p>
          </div>
          <div className="flex-1 sm:flex-none">
            <p className="text-[11px] text-text-muted mb-0.5">📊 Net</p>
            <p
              className="text-sm font-bold"
              style={{
                color: flows.net_flow_usd > 0 ? "#22c55e" : flows.net_flow_usd < 0 ? "#ef4444" : "#888",
              }}
            >
              {flows.net_flow_usd > 0 ? "+" : ""}
              {formatUSD(Math.abs(flows.net_flow_usd || 0))}
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-text-secondary max-w-xs hidden lg:block">
          {flows.description}
        </p>
      </div>
    </div>
  );
};

/** Stats cards row */
const StatsCards = ({ stats }) => {
  if (!stats) return null;

  const cards = [
    {
      label: "Total Volume",
      value: formatUSD(stats.total_volume_usd),
      icon: "💰",
    },
    {
      label: "Transactions",
      value: stats.total_transactions?.toLocaleString() || "0",
      icon: "📊",
    },
    {
      label: "Avg Size",
      value: formatUSD(stats.avg_transaction_usd),
      icon: "📏",
    },
    {
      label: "Largest Tx",
      value: formatUSD(stats.largest_transaction?.amount_usd || 0),
      sub: stats.largest_transaction?.symbol || "",
      icon: "🐋",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <div
          key={i}
          className="rounded-xl p-3.5 border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">{card.icon}</span>
            <span className="text-[11px] text-text-muted uppercase tracking-wider">
              {card.label}
            </span>
          </div>
          <p className="text-lg font-bold text-white font-display">
            {card.value}
          </p>
          {card.sub && (
            <p className="text-[11px] text-text-muted mt-0.5">{card.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
};

/** Blockchain breakdown mini-chart */
const BlockchainBreakdown = ({ byBlockchain }) => {
  if (!byBlockchain || Object.keys(byBlockchain).length === 0) return null;

  const sorted = Object.entries(byBlockchain)
    .sort((a, b) => b[1].volume_usd - a[1].volume_usd)
    .slice(0, 8);

  const maxVol = sorted[0]?.[1]?.volume_usd || 1;

  return (
    <div className="rounded-xl p-4 border border-white/[0.06] bg-white/[0.02]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <span>⛓️</span> Chain Activity
      </h3>
      <div className="space-y-2.5">
        {sorted.map(([chain, data]) => (
          <div key={chain} className="flex items-center gap-2.5">
            <span
              className="text-sm font-bold w-14 text-right"
              style={{ color: data.color || "#888" }}
            >
              {data.symbol || chain.slice(0, 4).toUpperCase()}
            </span>
            <div className="flex-1 h-5 rounded-full bg-white/[0.04] overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.max((data.volume_usd / maxVol) * 100, 3)}%`,
                  background: `linear-gradient(90deg, ${data.color || "#888"}88, ${data.color || "#888"})`,
                }}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-white/70">
                {formatUSD(data.volume_usd)}
              </span>
            </div>
            <span className="text-[11px] text-text-muted w-8 text-right">
              {data.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Top wallets */
const TopWallets = ({ title, icon, wallets, color }) => {
  if (!wallets || wallets.length === 0) return null;

  return (
    <div className="rounded-xl p-4 border border-white/[0.06] bg-white/[0.02]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
      <div className="space-y-2">
        {wallets.slice(0, 5).map((w, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: `${color}22`, color }}
              >
                {i + 1}
              </span>
              <span className="text-sm text-text-secondary capitalize">
                {w.owner || "unknown"}
              </span>
            </div>
            <span className="text-sm font-semibold text-white">
              {formatUSD(w.volume_usd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Single transaction row */
const TransactionRow = ({ tx, isNew }) => {
  const typeInfo = getTransferTypeInfo(tx.transfer_type);
  const chainConfig = BLOCKCHAINS.find((b) => b.key === tx.blockchain);

  return (
    <div
      className={`group flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.03] transition-all ${
        isNew ? "animate-pulse-once bg-gold-primary/[0.03]" : ""
      }`}
    >
      {/* Chain icon + type */}
      <div className="flex-shrink-0 relative">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
          style={{
            background: `${chainConfig?.color || "#888"}15`,
            color: chainConfig?.color || "#888",
          }}
        >
          {tx.blockchain_icon || tx.symbol?.charAt(0) || "?"}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 text-xs">
          {typeInfo.icon}
        </span>
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-white">
            {formatAmount(tx.amount)} {tx.symbol}
          </span>
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded-md"
            style={{
              background: `${typeInfo.color || "#888"}15`,
              color: typeInfo.color || "#888",
            }}
          >
            {tx.transfer_type?.replace(/_/g, " ") || "transfer"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-text-muted">
          <span className="capitalize">{tx.from_owner || shortenAddress(tx.from_address)}</span>
          <span className="text-text-muted/50">→</span>
          <span className="capitalize">{tx.to_owner || shortenAddress(tx.to_address)}</span>
        </div>
      </div>

      {/* Amount USD */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-gold-primary">
          {formatUSD(tx.amount_usd)}
        </p>
        <p className="text-[11px] text-text-muted">{timeAgo(tx.timestamp)}</p>
      </div>

      {/* Explorer link */}
      {tx.hash && (
        <a
          href={
            tx.blockchain === "bitcoin"
              ? `https://blockchair.com/bitcoin/transaction/${tx.hash}`
              : tx.blockchain === "ethereum"
              ? `https://etherscan.io/tx/${tx.hash}`
              : tx.blockchain === "solana"
              ? `https://solscan.io/tx/${tx.hash}`
              : `https://blockchair.com/${tx.blockchain}/transaction/${tx.hash}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-white hover:bg-white/[0.06] transition-all opacity-0 group-hover:opacity-100"
          title="View on explorer"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
        </a>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════
export default function WhaleAlertPage() {
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState(null);
  const [flows, setFlows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [blockchain, setBlockchain] = useState(null);
  const [transferType, setTransferType] = useState(null);
  const [minUsd, setMinUsd] = useState(100000);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef(null);
  const prevTxRef = useRef(new Set());

  const fetchData = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const [txData, flowData] = await Promise.all([
          whaleApi.getTransactions({
            blockchain,
            min_usd: minUsd,
            transfer_type: transferType,
            size: 50,
          }),
          whaleApi.getFlows(),
        ]);

        // Track new transactions for animation
        const newIds = new Set(
          (txData.transactions || []).map((tx) => tx.id)
        );
        prevTxRef.current = newIds;

        setTransactions(txData.transactions || []);
        setStats(txData.stats || null);
        setFlows(flowData || null);
      } catch (err) {
        console.error("Whale fetch error:", err);
        setError("Gagal memuat data whale alert");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [blockchain, transferType, minUsd]
  );

  // Initial load + filter change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchData(true), 120000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchData]);

  // ─── Render ───
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-white flex items-center gap-2.5">
            <span className="text-2xl">🐋</span>
            Whale Alert
          </h1>
          <p className="text-text-muted text-sm mt-1">
            Track large crypto transactions across blockchains in real-time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              autoRefresh
                ? "bg-green-500/10 border-green-500/20 text-green-400"
                : "bg-white/[0.03] border-white/[0.06] text-text-muted"
            }`}
          >
            {autoRefresh ? "🟢 Live" : "⏸️ Paused"}
          </button>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-text-secondary hover:text-white hover:bg-white/[0.06] transition-all disabled:opacity-50"
          >
            {refreshing ? "⏳" : "🔄"} Refresh
          </button>
        </div>
      </div>

      {/* Exchange Flow Banner */}
      {!loading && flows && <FlowBanner flows={flows} />}

      {/* Stats Cards */}
      {!loading && stats && <StatsCards stats={stats} />}

      {/* Filters */}
      <div className="space-y-3">
        {/* Blockchain filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <span className="text-[11px] text-text-muted uppercase tracking-wider flex-shrink-0 mr-1">
            Chain:
          </span>
          {BLOCKCHAINS.map((chain) => (
            <button
              key={chain.key || "all"}
              onClick={() => setBlockchain(chain.key)}
              className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                blockchain === chain.key
                  ? "border-gold-primary/40 bg-gold-primary/10 text-gold-primary"
                  : "border-white/[0.06] bg-white/[0.02] text-text-secondary hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              {chain.symbol ? (
                <span className="flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: chain.color }}
                  />
                  {chain.symbol}
                </span>
              ) : (
                chain.label
              )}
            </button>
          ))}
        </div>

        {/* Transfer type + Min USD */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-text-muted uppercase tracking-wider mr-1">
            Type:
          </span>
          {TRANSFER_TYPES.map((type) => (
            <button
              key={type.key || "all"}
              onClick={() => setTransferType(type.key)}
              className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                transferType === type.key
                  ? "border-gold-primary/40 bg-gold-primary/10 text-gold-primary"
                  : "border-white/[0.06] bg-white/[0.02] text-text-secondary hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <span className="flex items-center gap-1">
                <span>{type.icon}</span>
                <span className="hidden sm:inline">{type.label}</span>
              </span>
            </button>
          ))}

          <div className="h-4 w-px bg-white/[0.06] mx-1 hidden sm:block" />

          <span className="text-[11px] text-text-muted uppercase tracking-wider mr-1">
            Min:
          </span>
          {MIN_USD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setMinUsd(opt.value)}
              className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                minUsd === opt.value
                  ? "border-gold-primary/40 bg-gold-primary/10 text-gold-primary"
                  : "border-white/[0.06] bg-white/[0.02] text-text-secondary hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Transaction feed - takes 2 cols */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] overflow-hidden">
            {/* Feed header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="text-sm">📡</span>
                <h3 className="text-sm font-semibold text-white">
                  Live Transactions
                </h3>
                {refreshing && (
                  <div className="w-3 h-3 border border-gold-primary/40 border-t-gold-primary rounded-full animate-spin" />
                )}
              </div>
              <span className="text-xs text-text-muted">
                {transactions.length} transactions
              </span>
            </div>

            {/* Loading state */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative w-12 h-12 mb-4">
                  <div className="absolute inset-0 border-2 border-gold-primary/20 rounded-full" />
                  <div className="absolute inset-0 border-2 border-transparent border-t-gold-primary rounded-full animate-spin" />
                </div>
                <p className="text-text-muted text-sm">
                  Memuat whale transactions...
                </p>
              </div>
            )}

            {/* Error state */}
            {!loading && error && (
              <div className="flex flex-col items-center justify-center py-16">
                <p className="text-red-400 text-sm mb-3">{error}</p>
                <button
                  onClick={() => fetchData()}
                  className="text-gold-primary text-sm hover:underline"
                >
                  Coba lagi
                </button>
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && transactions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <span className="text-4xl mb-3">🐋</span>
                <p className="text-text-muted text-sm mb-1">
                  Tidak ada whale transaction ditemukan
                </p>
                <p className="text-text-muted/60 text-xs">
                  Coba turunkan minimum USD atau ubah filter
                </p>
              </div>
            )}

            {/* Transaction list */}
            {!loading && !error && transactions.length > 0 && (
              <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                {transactions.map((tx, idx) => (
                  <TransactionRow
                    key={tx.id || tx.hash || idx}
                    tx={tx}
                    isNew={idx < 3 && refreshing}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar - stats */}
        <div className="space-y-4">
          {!loading && stats && (
            <>
              <BlockchainBreakdown byBlockchain={stats.by_blockchain} />
              <TopWallets
                title="Top Senders"
                icon="📤"
                wallets={stats.top_senders}
                color="#ef4444"
              />
              <TopWallets
                title="Top Receivers"
                icon="📥"
                wallets={stats.top_receivers}
                color="#22c55e"
              />
            </>
          )}

          {loading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="rounded-xl p-4 border border-white/[0.06] bg-white/[0.02] animate-pulse"
                >
                  <div className="h-4 bg-white/[0.06] rounded w-1/2 mb-3" />
                  <div className="space-y-2">
                    <div className="h-5 bg-white/[0.04] rounded" />
                    <div className="h-5 bg-white/[0.04] rounded w-3/4" />
                    <div className="h-5 bg-white/[0.04] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer attribution */}
      <p className="text-center text-text-muted/40 text-[11px] pt-2">
        Data source: ClankApp · Auto-refresh setiap 2 menit · Transaksi whale
        ≥ {formatUSD(minUsd)}
      </p>
    </div>
  );
}