// src/components/WhaleAlertPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Whale Alert Page v2 (Flowscan reskin)
// 100% aligned with backend /api/v1/whale/{transactions,stats,flows}
// BTC + ETH whale tracking via blockchain.com + Etherscan
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import whaleApi from "../services/whaleApi";

// ═══════════════════════════════════════════
// Config
// ═══════════════════════════════════════════
const REFRESH_INTERVAL = 120000;

const getBlockchains = (t) => [
  { key: null, label: t("whale.all_chains") || "All Chains" },
  { key: "bitcoin", label: "Bitcoin", symbol: "BTC", color: "#F7931A" },
  { key: "ethereum", label: "Ethereum", symbol: "ETH", color: "#627EEA" },
];

const getTransferTypes = (t) => [
  { key: null, label: t("whale.all_types") || "All Types" },
  { key: "exchange_inflow", label: t("whale.exchange_inflow") || "Inflow" },
  { key: "exchange_outflow", label: t("whale.exchange_outflow") || "Outflow" },
  { key: "wallet_to_wallet", label: t("whale.wallet_to_wallet") || "Wallet → Wallet" },
  { key: "exchange_to_exchange", label: t("whale.exchange_to_exchange") || "Exchange → Exchange" },
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
  if (!val && val !== 0) return "—";
  const v = Number(val);
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};

const formatAmount = (val) => {
  if (!val && val !== 0) return "0";
  const v = Number(val);
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(2);
};

const timeAgo = (timestamp, t) => {
  if (!timestamp) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}${t("whale.s_ago") || "s"}`;
  if (diff < 3600) return `${Math.floor(diff / 60)}${t("whale.m_ago") || "m"}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}${t("whale.h_ago") || "h"}`;
  return `${Math.floor(diff / 86400)}${t("whale.d_ago") || "d"}`;
};

// ── Chain dot color (small dot only retains color) ──
const chainDot = (chain) => {
  const map = {
    bitcoin: "bg-orange-400",
    ethereum: "bg-blue-400",
    solana: "bg-purple-400",
  };
  return map[chain] || "bg-white/40";
};

// ── Semantic 3-tier transfer type style ──
const transferTypeStyle = (type) => {
  if (type === "exchange_inflow")
    return "bg-red-500/10 text-red-400 border-red-500/25";
  if (type === "exchange_outflow")
    return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
  if (type === "exchange_to_exchange")
    return "bg-gold-primary/10 text-gold-primary border-gold-primary/25";
  return "bg-white/[0.04] text-white/70 border-white/[0.08]";
};

const transferTypeLabel = (type) => {
  const map = {
    exchange_inflow: "Inflow",
    exchange_outflow: "Outflow",
    wallet_to_wallet: "Wallet → Wallet",
    exchange_to_exchange: "Exchange → Exchange",
  };
  return map[type] || type?.replace(/_/g, " ") || "transfer";
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
// FLOW STRIP — exchange net flow bar (compact)
// ════════════════════════════════════════════════════════════════
const FlowStrip = ({ flows, t }) => {
  if (!flows) return null;

  const isBullish = flows.sentiment === "bullish";
  const isBearish = flows.sentiment === "bearish";

  const sentimentLabel = isBullish
    ? t("whale.bullish") || "Bullish"
    : isBearish
    ? t("whale.bearish") || "Bearish"
    : t("whale.neutral") || "Neutral";

  const sentimentColor = isBullish
    ? "text-emerald-400"
    : isBearish
    ? "text-red-400"
    : "text-white/80";

  const sentimentDot = isBullish
    ? "bg-emerald-400"
    : isBearish
    ? "bg-red-400"
    : "bg-white/40";

  const netFlow = flows.net_flow_usd || 0;
  const netColor = netFlow > 0 ? "text-emerald-400" : netFlow < 0 ? "text-red-400" : "text-white/70";

  return (
    <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

      <div className="relative px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        {/* Sentiment */}
        <div className="flex items-center gap-2.5">
          <span className={`w-1.5 h-1.5 rounded-full ${sentimentDot} ${(isBullish || isBearish) ? "animate-pulse" : ""}`} />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
            Net Flow
          </span>
          <span className={`font-mono text-[11px] uppercase tracking-[0.2em] font-semibold ${sentimentColor}`}>
            {sentimentLabel}
          </span>
        </div>

        <Divider />

        {/* Inflow */}
        <FlowItem
          label={t("whale.inflow") || "Inflow"}
          value={formatUSD(flows.inflow?.volume_usd || 0)}
          sublabel={`${flows.inflow?.count || 0} tx`}
          tone="danger"
        />

        {/* Outflow */}
        <FlowItem
          label={t("whale.outflow") || "Outflow"}
          value={formatUSD(flows.outflow?.volume_usd || 0)}
          sublabel={`${flows.outflow?.count || 0} tx`}
          tone="positive"
        />

        {/* Net */}
        <FlowItem
          label={t("whale.net") || "Net"}
          value={`${netFlow > 0 ? "+" : ""}${formatUSD(Math.abs(netFlow))}`}
          valueColor={netColor}
        />

        {/* Description (hide on mobile, subtle on desktop) */}
        {flows.description && (
          <p className="hidden lg:block text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/70 ml-auto max-w-xs text-right truncate">
            {flows.description}
          </p>
        )}
      </div>
    </div>
  );
};

const Divider = () => <span className="hidden sm:inline h-3 w-px bg-white/[0.08]" />;

const FlowItem = ({ label, value, sublabel, tone, valueColor }) => {
  const color = valueColor || {
    positive: "text-emerald-400",
    danger: "text-red-400",
    neutral: "text-white",
  }[tone] || "text-white";

  return (
    <div className="flex items-center gap-2 font-mono text-[11px]">
      <span className="text-text-muted/70 uppercase tracking-[0.15em] text-[10px]">{label}</span>
      <span className={`tabular-nums font-semibold ${color}`}>{value}</span>
      {sublabel && (
        <span className="text-text-muted/50 lowercase tabular-nums">{sublabel}</span>
      )}
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// STAT CARD — Flowscan-exact pattern
// ════════════════════════════════════════════════════════════════
const StatCard = ({ label, value, sublabel }) => (
  <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="relative z-10">
      <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-mono mb-2">
        {label}
      </div>
      <div className="text-xl sm:text-2xl font-mono tabular-nums text-white mb-1.5 truncate">
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
// TRANSACTION ROW — compact, no emoji, semantic colors
// ════════════════════════════════════════════════════════════════
const TransactionRow = ({ tx, isNew, t }) => {
  const fromLabel = tx.from_owner && tx.from_owner !== "unknown"
    ? tx.from_owner
    : tx.from_address || "—";
  const toLabel = tx.to_owner && tx.to_owner !== "unknown"
    ? tx.to_owner
    : tx.to_address || "—";

  // Highlight if amount > $1M (whale-significant)
  const isHighlight = (tx.amount_usd || 0) >= 1_000_000;

  return (
    <a
      href={tx.explorer_url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative block transition-colors border-b border-white/[0.04] ${
        isNew ? "bg-gold-primary/[0.04]" : "hover:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-center gap-3 px-3 sm:px-4 py-3">
        {/* Chain indicator (small dot) */}
        <div className="shrink-0 flex items-center justify-center w-8 h-8 rounded bg-white/[0.03] border border-white/[0.06]">
          <span className={`w-2 h-2 rounded-full ${chainDot(tx.blockchain)}`} />
        </div>

        {/* Middle: amount + type + flow */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`font-mono text-sm tabular-nums font-semibold ${isHighlight ? "text-gold-primary" : "text-white"}`}>
              {tx.format_amount || formatAmount(tx.amount)} {tx.symbol}
            </span>
            <span
              className={`text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border ${transferTypeStyle(tx.transfer_type)}`}
            >
              {transferTypeLabel(tx.transfer_type)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted/70 truncate">
            <span className="truncate capitalize">{fromLabel}</span>
            <span className="text-text-muted/40 shrink-0">→</span>
            <span className="truncate capitalize">{toLabel}</span>
          </div>
        </div>

        {/* Right: USD + time */}
        <div className="shrink-0 flex flex-col items-end gap-0.5">
          <span className={`font-mono text-sm tabular-nums font-semibold ${isHighlight ? "text-gold-primary" : "text-white"}`}>
            {tx.format_amount_usd || formatUSD(tx.amount_usd)}
          </span>
          <span className="font-mono text-[10px] text-text-muted/60 tabular-nums uppercase tracking-wider">
            {timeAgo(tx.timestamp, t)}
          </span>
        </div>

        {/* External link icon (visible on hover) */}
        <svg
          className="shrink-0 w-3 h-3 text-text-muted/40 opacity-0 group-hover:opacity-100 transition-opacity"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </div>
    </a>
  );
};


// ════════════════════════════════════════════════════════════════
// SIDEBAR: BLOCKCHAIN BREAKDOWN
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

const SidebarBlockchains = ({ byBlockchain }) => {
  if (!byBlockchain || Object.keys(byBlockchain).length === 0) return null;

  const sorted = Object.entries(byBlockchain)
    .sort((a, b) => b[1].volume_usd - a[1].volume_usd)
    .slice(0, 8);
  const maxVol = sorted[0]?.[1]?.volume_usd || 1;

  return (
    <SidebarCard label="Chain Activity">
      <div className="space-y-px">
        {sorted.map(([chain, data]) => {
          const pct = (data.volume_usd / maxVol) * 100;
          return (
            <div
              key={chain}
              className="relative py-1.5 px-2 rounded transition-colors hover:bg-white/[0.03]"
            >
              {/* Subtle background bar (gold tint, not rainbow) */}
              <div
                className="absolute inset-y-0 left-0 bg-gold-primary/[0.05] rounded"
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-white">
                  <span className={`w-1.5 h-1.5 rounded-full ${chainDot(chain)}`} />
                  <span className="font-mono">{data.symbol || chain.slice(0, 4).toUpperCase()}</span>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-gold-primary/90 tabular-nums">
                    {formatUSD(data.volume_usd)}
                  </span>
                  <span className="text-[10px] font-mono text-text-muted/70 tabular-nums w-6 text-right">
                    {data.count}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SidebarCard>
  );
};


// ════════════════════════════════════════════════════════════════
// SIDEBAR: TOP WALLETS — labeled first, raw addresses compact
// ════════════════════════════════════════════════════════════════
const SidebarTopWallets = ({ label, wallets, t }) => {
  if (!wallets || wallets.length === 0) return null;

  // Sort: labeled (Coinbase/Binance/etc) first, then raw addresses
  const sorted = [...wallets].sort((a, b) => {
    const aIsLabeled = !a.owner?.includes("...");
    const bIsLabeled = !b.owner?.includes("...");
    if (aIsLabeled && !bIsLabeled) return -1;
    if (!aIsLabeled && bIsLabeled) return 1;
    return b.volume_usd - a.volume_usd;
  });

  const displayed = sorted.slice(0, 6);

  return (
    <SidebarCard label={label}>
      <div className="space-y-px">
        {displayed.map((w, i) => {
          const isLabeled = !w.owner?.includes("...");
          return (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-mono text-text-muted/50 tabular-nums w-4">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={`text-xs truncate ${isLabeled ? "text-white font-medium" : "text-text-muted/70 font-mono"}`}
                  title={w.owner}
                >
                  {w.owner || t("whale.unknown") || "unknown"}
                </span>
              </div>
              <span className="text-[10px] font-mono text-gold-primary tabular-nums shrink-0">
                {formatUSD(w.volume_usd)}
              </span>
            </div>
          );
        })}
      </div>
    </SidebarCard>
  );
};


// ════════════════════════════════════════════════════════════════
// LOADING / EMPTY / ERROR STATES
// ════════════════════════════════════════════════════════════════
const LoadingSkeleton = () => (
  <div className="space-y-px">
    {[...Array(8)].map((_, i) => (
      <div
        key={i}
        className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]"
      >
        <div className="w-8 h-8 rounded bg-white/[0.03] animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-white/[0.05] rounded w-1/4 animate-pulse" />
          <div className="h-2.5 bg-white/[0.03] rounded w-2/3 animate-pulse" />
        </div>
        <div className="w-20 space-y-1.5">
          <div className="h-3 bg-white/[0.05] rounded animate-pulse" />
          <div className="h-2 bg-white/[0.03] rounded w-2/3 ml-auto animate-pulse" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = ({ message, hint }) => (
  <div className="relative overflow-hidden p-12 text-center">
    <div className="w-12 h-12 mx-auto mb-4 rounded-md border border-gold-primary/20 flex items-center justify-center">
      <svg className="w-5 h-5 text-gold-primary/60" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    </div>
    <p className="text-white text-sm font-medium mb-1">{message}</p>
    {hint && (
      <p className="text-text-muted text-[10px] font-mono uppercase tracking-[0.15em]">
        {hint}
      </p>
    )}
  </div>
);


// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function WhaleAlertPage() {
  const { t } = useTranslation();

  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState(null);
  const [flows, setFlows] = useState(null);
  const [sources, setSources] = useState([]);
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

  const BLOCKCHAINS = useMemo(() => getBlockchains(t), [t]);
  const TRANSFER_TYPES = useMemo(() => getTransferTypes(t), [t]);

  // ── Fetch ──
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
        setSources(txData.sources || []);
        setFlows(flowData || null);
      } catch (err) {
        console.error("Whale fetch error:", err);
        setError(t("whale.load_error") || "Failed to load whale data");
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
      intervalRef.current = setInterval(() => fetchData(true), REFRESH_INTERVAL);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchData]);

  // ── Get count per transfer type (for filter chips) ──
  const getTypeCount = (key) => {
    if (key === null) return transactions.length;
    return stats?.by_transfer_type?.[key]?.count ?? 0;
  };

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-6">
      {/* ── Section Header ── */}
      <SectionHeader label="Whale Alert" />

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            {t("whale.title") || "Whale Alert"}
          </h1>
          <p className="text-text-muted text-sm mt-1.5 font-mono">
            {t("whale.subtitle") || "Track large crypto transactions across blockchains in real-time"}
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all ${
              autoRefresh
                ? "bg-emerald-500/[0.08] border-emerald-500/25 text-emerald-400"
                : "bg-white/[0.03] border-white/[0.06] text-text-muted hover:text-white hover:border-white/[0.12]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-text-muted"}`}
            />
            <span className="uppercase tracking-[0.15em]">
              {autoRefresh ? t("whale.live") || "Live" : t("whale.paused") || "Paused"}
            </span>
          </button>

          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/[0.06] bg-white/[0.03] text-text-muted hover:text-white hover:border-white/[0.12] disabled:opacity-50 transition-all"
          >
            <svg
              className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m0 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span className="uppercase tracking-[0.15em] text-[10px]">
              {t("whale.refresh") || "Refresh"}
            </span>
          </button>
        </div>
      </div>

      {/* ── Flow Strip (compact 1-row) ── */}
      {!loading && flows && <FlowStrip flows={flows} t={t} />}

      {/* ── Stats Cards (4) ── */}
      {!loading && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label={t("whale.total_volume") || "Total Volume"}
            value={formatUSD(stats.total_volume_usd)}
          />
          <StatCard
            label={t("whale.transactions") || "Transactions"}
            value={stats.total_transactions?.toLocaleString() || "0"}
          />
          <StatCard
            label={t("whale.avg_size") || "Avg Size"}
            value={formatUSD(stats.avg_transaction_usd)}
          />
          <StatCard
            label={t("whale.largest_tx") || "Largest TX"}
            value={formatUSD(stats.largest_transaction?.amount_usd || 0)}
            sublabel={stats.largest_transaction?.symbol || ""}
          />
        </div>
      )}

      {/* ── Filter Bar ── */}
      <div className="space-y-3">
        {/* Chain chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <span className="shrink-0 px-2 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/60">
            {t("whale.chain") || "Chain"}:
          </span>
          {BLOCKCHAINS.map((chain) => {
            const active = blockchain === chain.key;
            return (
              <button
                key={chain.key || "all"}
                onClick={() => setBlockchain(chain.key)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-[0.1em] transition-all border whitespace-nowrap ${
                  active
                    ? "bg-gold-primary/15 text-gold-primary border-gold-primary/40"
                    : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-white hover:border-white/[0.12]"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {chain.symbol && (
                    <span className={`w-1.5 h-1.5 rounded-full ${chainDot(chain.key)}`} />
                  )}
                  {chain.symbol || chain.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Type chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <span className="shrink-0 px-2 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/60">
            {t("whale.type") || "Type"}:
          </span>
          {TRANSFER_TYPES.map((type) => {
            const active = transferType === type.key;
            const count = getTypeCount(type.key);
            return (
              <button
                key={type.key || "all"}
                onClick={() => setTransferType(type.key)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-[0.1em] transition-all border whitespace-nowrap ${
                  active
                    ? "bg-gold-primary/15 text-gold-primary border-gold-primary/40"
                    : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-white hover:border-white/[0.12]"
                }`}
              >
                {type.label}
                {stats && (
                  <span className={`ml-1.5 tabular-nums ${active ? "text-gold-primary/70" : "text-text-muted/60"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Min USD chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          <span className="shrink-0 px-2 py-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/60">
            {t("whale.min") || "Min"}:
          </span>
          {MIN_USD_OPTIONS.map((opt) => {
            const active = minUsd === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setMinUsd(opt.value)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-[0.1em] transition-all border whitespace-nowrap ${
                  active
                    ? "bg-gold-primary/15 text-gold-primary border-gold-primary/40"
                    : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-white hover:border-white/[0.12]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main Grid: Feed + Sidebar ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Feed */}
        <div className="lg:col-span-9 space-y-3">
          <SectionHeader label="Live Transactions" small />

          <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent z-10" />

            {/* Tx count header */}
            <div className="relative flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted">
                  {transactions.length} {t("whale.transactions") || "transactions"}
                </span>
                {refreshing && (
                  <div className="w-2.5 h-2.5 border border-gold-primary/40 border-t-gold-primary rounded-full animate-spin" />
                )}
              </div>
              {sources.length > 0 && (
                <span className="hidden sm:inline text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/60">
                  Source: {sources.join(" · ")}
                </span>
              )}
            </div>

            {/* States */}
            {loading && <LoadingSkeleton />}

            {!loading && error && (
              <div className="p-8 text-center">
                <p className="text-red-400 text-sm mb-3 font-mono">{error}</p>
                <button
                  onClick={() => fetchData()}
                  className="text-gold-primary text-[11px] font-mono uppercase tracking-[0.15em] hover:underline"
                >
                  {t("whale.try_again") || "Try again"} →
                </button>
              </div>
            )}

            {!loading && !error && transactions.length === 0 && (
              <EmptyState
                message={t("whale.no_txs") || "No whale transactions"}
                hint={t("whale.try_lower_min") || "Try lowering minimum amount"}
              />
            )}

            {!loading && !error && transactions.length > 0 && (
              <div className="max-h-[640px] overflow-y-auto">
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

        {/* Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          {!loading && stats && (
            <>
              <SidebarBlockchains byBlockchain={stats.by_blockchain} />
              <SidebarTopWallets
                label={t("whale.top_senders") || "Top Senders"}
                wallets={stats.top_senders}
                t={t}
              />
              <SidebarTopWallets
                label={t("whale.top_receivers") || "Top Receivers"}
                wallets={stats.top_receivers}
                t={t}
              />
            </>
          )}

          {loading && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-4">
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/20 to-transparent" />
                  <div className="h-3 bg-white/[0.05] rounded w-1/2 mb-3 animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-3 bg-white/[0.03] rounded animate-pulse" />
                    <div className="h-3 bg-white/[0.03] rounded w-3/4 animate-pulse" />
                    <div className="h-3 bg-white/[0.03] rounded w-1/2 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-center gap-2 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/50">
        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
        <span>Auto-refresh 120s</span>
        <span className="text-text-muted/30">·</span>
        <span>
          {t("whale.footer_info") || "Whale transactions ≥"} {formatUSD(minUsd)}
        </span>
      </div>
    </div>
  );
}
