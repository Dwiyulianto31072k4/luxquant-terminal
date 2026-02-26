// src/components/WhaleAlertPage.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next"; // <-- 1. Import i18n
import whaleApi from "../services/whaleApi";

// ═══════════════════════════════════════════
// Helpers & Data Generators
// ═══════════════════════════════════════════

// Fungsi untuk mendapatkan Blockchain Configs dengan terjemahan
const getBlockchains = (t) => [
  { key: null, label: t('whale.all_chains') },
  { key: "bitcoin", label: "Bitcoin", symbol: "BTC", color: "#F7931A" },
  { key: "ethereum", label: "Ethereum", symbol: "ETH", color: "#627EEA" },
];

// Fungsi untuk mendapatkan Transfer Types dengan terjemahan
const getTransferTypes = (t) => [
  { key: null, label: t('whale.all_types'), icon: "🔄" },
  { key: "exchange_inflow", label: t('whale.exchange_inflow'), icon: "📥", color: "#ef4444" },
  { key: "exchange_outflow", label: t('whale.exchange_outflow'), icon: "📤", color: "#22c55e" },
  { key: "wallet_to_wallet", label: t('whale.wallet_to_wallet'), icon: "👛", color: "#8b5cf6" },
  { key: "exchange_to_exchange", label: t('whale.exchange_to_exchange'), icon: "🏦", color: "#3b82f6" },
];

const MIN_USD_OPTIONS = [
  { value: 50000, label: "$50K+" },
  { value: 100000, label: "$100K+" },
  { value: 500000, label: "$500K+" },
  { value: 1000000, label: "$1M+" },
  { value: 5000000, label: "$5M+" },
];

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

// Menambahkan t untuk terjemahan waktu
const timeAgo = (timestamp, t) => {
  if (!timestamp) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff} ${t('whale.s_ago')}`;
  if (diff < 3600) return `${Math.floor(diff / 60)} ${t('whale.m_ago')}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ${t('whale.h_ago')}`;
  return `${Math.floor(diff / 86400)} ${t('whale.d_ago')}`;
};

const shortenAddress = (addr) => {
  if (!addr || addr.length < 12) return addr || "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

// ═══════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════

const FlowBanner = ({ flows, t }) => {
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
              {t('whale.exchange_net_flow')}
            </p>
            <p
              className="text-lg font-bold font-display"
              style={{
                color: isBullish ? "#22c55e" : isBearish ? "#ef4444" : "#d4a853",
              }}
            >
              {isBullish ? t('whale.bullish') : isBearish ? t('whale.bearish') : t('whale.neutral')}
            </p>
          </div>
        </div>

        <div className="flex gap-4 sm:gap-6 flex-1">
          <div className="flex-1 sm:flex-none">
            <p className="text-[11px] text-text-muted mb-0.5">📥 {t('whale.inflow')}</p>
            <p className="text-sm font-semibold text-red-400">
              {formatUSD(flows.inflow?.volume_usd || 0)}
            </p>
            <p className="text-[10px] text-text-muted">
              {flows.inflow?.count || 0} {t('whale.txs')}
            </p>
          </div>
          <div className="flex-1 sm:flex-none">
            <p className="text-[11px] text-text-muted mb-0.5">📤 {t('whale.outflow')}</p>
            <p className="text-sm font-semibold text-green-400">
              {formatUSD(flows.outflow?.volume_usd || 0)}
            </p>
            <p className="text-[10px] text-text-muted">
              {flows.outflow?.count || 0} {t('whale.txs')}
            </p>
          </div>
          <div className="flex-1 sm:flex-none">
            <p className="text-[11px] text-text-muted mb-0.5">📊 {t('whale.net')}</p>
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

        {/* Karena description dari API bersifat bebas, kita biarkan saja aslinya atau sembunyikan jika mau. Di sini dibiarkan sesuai aslinya. */}
        <p className="text-xs text-text-secondary max-w-xs hidden lg:block">
          {flows.description}
        </p>
      </div>
    </div>
  );
};

const StatsCards = ({ stats, t }) => {
  if (!stats) return null;

  const cards = [
    { label: t('whale.total_volume'), value: formatUSD(stats.total_volume_usd), icon: "💰" },
    { label: t('whale.transactions'), value: stats.total_transactions?.toLocaleString() || "0", icon: "📊" },
    { label: t('whale.avg_size'), value: formatUSD(stats.avg_transaction_usd), icon: "📏" },
    { label: t('whale.largest_tx'), value: formatUSD(stats.largest_transaction?.amount_usd || 0), sub: stats.largest_transaction?.symbol || "", icon: "🐋" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <div key={i} className="rounded-xl p-3.5 border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">{card.icon}</span>
            <span className="text-[11px] text-text-muted uppercase tracking-wider">{card.label}</span>
          </div>
          <p className="text-lg font-bold text-white font-display">{card.value}</p>
          {card.sub && <p className="text-[11px] text-text-muted mt-0.5">{card.sub}</p>}
        </div>
      ))}
    </div>
  );
};

const BlockchainBreakdown = ({ byBlockchain, t }) => {
  if (!byBlockchain || Object.keys(byBlockchain).length === 0) return null;

  const sorted = Object.entries(byBlockchain)
    .sort((a, b) => b[1].volume_usd - a[1].volume_usd)
    .slice(0, 8);

  const maxVol = sorted[0]?.[1]?.volume_usd || 1;

  return (
    <div className="rounded-xl p-4 border border-white/[0.06] bg-white/[0.02]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <span>⛓️</span> {t('whale.chain_activity')}
      </h3>
      <div className="space-y-2.5">
        {sorted.map(([chain, data]) => (
          <div key={chain} className="flex items-center gap-2.5">
            <span className="text-sm font-bold w-14 text-right" style={{ color: data.color || "#888" }}>
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

const TopWallets = ({ title, icon, wallets, color, t }) => {
  if (!wallets || wallets.length === 0) return null;

  return (
    <div className="rounded-xl p-4 border border-white/[0.06] bg-white/[0.02]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
      <div className="space-y-2">
        {wallets.slice(0, 5).map((w, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/[0.03] last:border-0">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: `${color}22`, color }}>
                {i + 1}
              </span>
              <span className="text-sm text-text-secondary capitalize">
                {w.owner || t('whale.unknown')}
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

const TransactionRow = ({ tx, isNew, t }) => {
  const TYPE_OPTIONS = getTransferTypes(t);
  const typeInfo = TYPE_OPTIONS.find((opt) => opt.key === tx.transfer_type) || TYPE_OPTIONS[0];
  
  const CHAIN_OPTIONS = getBlockchains(t);
  const chainConfig = CHAIN_OPTIONS.find((b) => b.key === tx.blockchain);

  // Fallback untuk mengganti label API yang mungkin bahasa inggris
  const typeLabel = typeInfo.key ? typeInfo.label : (tx.transfer_type?.replace(/_/g, " ") || "transfer");

  return (
    <div className={`group flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.03] transition-all ${isNew ? "animate-pulse-once bg-gold-primary/[0.03]" : ""}`}>
      <div className="flex-shrink-0 relative">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold"
          style={{ background: `${chainConfig?.color || "#888"}15`, color: chainConfig?.color || "#888" }}
        >
          {tx.blockchain_icon || tx.symbol?.charAt(0) || "?"}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 text-xs">{typeInfo.icon}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-white">
            {formatAmount(tx.amount)} {tx.symbol}
          </span>
          <span
            className="text-xs font-medium px-1.5 py-0.5 rounded-md"
            style={{ background: `${typeInfo.color || "#888"}15`, color: typeInfo.color || "#888" }}
          >
            {typeLabel}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[11px] text-text-muted">
          <span className="capitalize">{tx.from_owner || shortenAddress(tx.from_address)}</span>
          <span className="text-text-muted/50">→</span>
          <span className="capitalize">{tx.to_owner || shortenAddress(tx.to_address)}</span>
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-gold-primary">{formatUSD(tx.amount_usd)}</p>
        <p className="text-[11px] text-text-muted">{timeAgo(tx.timestamp, t)}</p>
      </div>

      {tx.hash && (
        <a
          href={
            tx.blockchain === "bitcoin" ? `https://blockchair.com/bitcoin/transaction/${tx.hash}` :
            tx.blockchain === "ethereum" ? `https://etherscan.io/tx/${tx.hash}` :
            tx.blockchain === "solana" ? `https://solscan.io/tx/${tx.hash}` :
            `https://blockchair.com/${tx.blockchain}/transaction/${tx.hash}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-white hover:bg-white/[0.06] transition-all opacity-0 group-hover:opacity-100"
          title={t('whale.view_explorer')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
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
  const { t } = useTranslation(); // <-- 2. Panggil Hook
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

  // Generate opsi menggunakan hook translation
  const BLOCKCHAINS = getBlockchains(t);
  const TRANSFER_TYPES = getTransferTypes(t);

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

        const newIds = new Set((txData.transactions || []).map((tx) => tx.id));
        prevTxRef.current = newIds;

        setTransactions(txData.transactions || []);
        setStats(txData.stats || null);
        setFlows(flowData || null);
      } catch (err) {
        console.error("Whale fetch error:", err);
        setError(t('whale.load_error'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [blockchain, transferType, minUsd, t]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchData(true), 120000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchData]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-white flex items-center gap-2.5">
            <span className="text-2xl">🐋</span>
            {t('whale.title')}
          </h1>
          <p className="text-text-muted text-sm mt-1">
            {t('whale.subtitle')}
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
            {autoRefresh ? `🟢 ${t('whale.live')}` : `⏸️ ${t('whale.paused')}`}
          </button>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/[0.08] bg-white/[0.03] text-text-secondary hover:text-white hover:bg-white/[0.06] transition-all disabled:opacity-50"
          >
            {refreshing ? "⏳" : "🔄"} {t('whale.refresh')}
          </button>
        </div>
      </div>

      {/* Exchange Flow Banner */}
      {!loading && flows && <FlowBanner flows={flows} t={t} />}

      {/* Stats Cards */}
      {!loading && stats && <StatsCards stats={stats} t={t} />}

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <span className="text-[11px] text-text-muted uppercase tracking-wider flex-shrink-0 mr-1">
            {t('whale.chain')}
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
                  <span className="w-2 h-2 rounded-full" style={{ background: chain.color }} />
                  {chain.symbol}
                </span>
              ) : (
                chain.label
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-text-muted uppercase tracking-wider mr-1">
            {t('whale.type')}
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
            {t('whale.min')}
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
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <span className="text-sm">📡</span>
                <h3 className="text-sm font-semibold text-white">
                  {t('whale.live_txs')}
                </h3>
                {refreshing && (
                  <div className="w-3 h-3 border border-gold-primary/40 border-t-gold-primary rounded-full animate-spin" />
                )}
              </div>
              <span className="text-xs text-text-muted">
                {transactions.length} {t('whale.transactions').toLowerCase()}
              </span>
            </div>

            {loading && (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="relative w-12 h-12 mb-4">
                  <div className="absolute inset-0 border-2 border-gold-primary/20 rounded-full" />
                  <div className="absolute inset-0 border-2 border-transparent border-t-gold-primary rounded-full animate-spin" />
                </div>
                <p className="text-text-muted text-sm">{t('whale.loading_txs')}</p>
              </div>
            )}

            {!loading && error && (
              <div className="flex flex-col items-center justify-center py-16">
                <p className="text-red-400 text-sm mb-3">{error}</p>
                <button onClick={() => fetchData()} className="text-gold-primary text-sm hover:underline">
                  {t('whale.try_again')}
                </button>
              </div>
            )}

            {!loading && !error && transactions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16">
                <span className="text-4xl mb-3">🐋</span>
                <p className="text-text-muted text-sm mb-1">{t('whale.no_txs')}</p>
                <p className="text-text-muted/60 text-xs">{t('whale.try_lower_min')}</p>
              </div>
            )}

            {!loading && !error && transactions.length > 0 && (
              <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
                {transactions.map((tx, idx) => (
                  <TransactionRow
                    key={tx.id || tx.hash || idx}
                    tx={tx}
                    isNew={idx < 3 && refreshing}
                    t={t}
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
              <BlockchainBreakdown byBlockchain={stats.by_blockchain} t={t} />
              <TopWallets title={t('whale.top_senders')} icon="📤" wallets={stats.top_senders} color="#ef4444" t={t} />
              <TopWallets title={t('whale.top_receivers')} icon="📥" wallets={stats.top_receivers} color="#22c55e" t={t} />
            </>
          )}

          {loading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl p-4 border border-white/[0.06] bg-white/[0.02] animate-pulse">
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

      <p className="text-center text-text-muted/40 text-[11px] pt-2">
        {t('whale.footer_info')} {formatUSD(minUsd)}
      </p>
    </div>
  );
}