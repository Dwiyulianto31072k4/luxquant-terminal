// src/components/OnchainPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — On-Chain Intelligence
// Gate.io / Home card language: soft rounded-xl shells, pill filters,
// single-feed list (not individual bordered cards), clean desk chrome.
// Aligned with /api/v1/onchain/{feed,stats,detail,filters}
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import AssistantWidget from "./assistant/AssistantWidget";
import CoinLogo from "./CoinLogo";
import { ShimmerStyles } from "./ui/Loaders";
import { PageHeader } from "./ui/PageHeader";

const API = "/api/v1/onchain";
// 15, not 30. A row measures ~64px with its gap; thirty of them ran far past
// the sidebar. Fifteen lands the last row level with the sidebar bottom.
const PER_PAGE = 15;
const REFRESH_INTERVAL = 60000;

// ── Alert type config ──
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

/** Strip the emoji spam some whale bots put at the start of every line. */
const cleanText = (s) => {
  if (!s) return "";
  return s
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]+/gu, " ")
    .replace(/[🚨📈📉💵🔥⚡💰🐋🐳🔔🔒🚪✅❌⚠️🔴🟢🟡]+/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/**
 * Recover amount_usd / amount_raw / token from title+raw when the API left them
 * null. Mirrors the forwarder's improved parser so a stale cache or a remaining
 * unfilled row still shows the notional in the UI.
 *
 * WhaleBot:  "19,632 BTC ($1,234,469,000) transfered ..."
 * Whale Alert: "2,000 $BTC (125,638,352 USD) transferred ..."
 */
const parseAmountFromText = (text) => {
  if (!text) return { amount_raw: null, amount_usd: null, token: null };
  const scale = (val, s) => {
    const k = (s || "").toLowerCase();
    if (k === "m") return val * 1e6;
    if (k === "b") return val * 1e9;
    if (k === "k") return val * 1e3;
    return val;
  };
  const num = (s) => parseFloat(String(s).replace(/,/g, ""));

  let m = text.match(
    /([\d,]+(?:\.\d+)?)\s+(?:#|@|\$)?([A-Za-z]{2,15})\s*\(\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([mMbBkK])?\s*(?:USD|usd)?\s*\)/
  );
  if (m) {
    return {
      amount_raw: m[1].replace(/,/g, ""),
      amount_usd: scale(num(m[3]), m[4]),
      token: m[2].toUpperCase(),
    };
  }
  m = text.match(
    /([\d,]+(?:\.\d+)?)\s*\$([A-Za-z]{2,15})\s*\(\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([mMbBkK])?\s*(?:USD|usd)?\s*\)/
  );
  if (m) {
    return {
      amount_raw: m[1].replace(/,/g, ""),
      amount_usd: scale(num(m[3]), m[4]),
      token: m[2].toUpperCase(),
    };
  }
  m = text.match(/\(\s*\$?\s*([\d,]+(?:\.\d+)?)\s*([mMbBkK])?\s*(?:USD|usd)?\s*\)/);
  if (m) {
    return { amount_raw: null, amount_usd: scale(num(m[1]), m[2]), token: null };
  }
  return { amount_raw: null, amount_usd: null, token: null };
};

/** Merge API fields with text-recovered fallbacks for display. */
const enrichAlert = (alert) => {
  if (!alert) return alert;
  const blob = `${alert.title || ""}\n${alert.raw_text || ""}`;
  const parsed = parseAmountFromText(blob);
  const amount_usd =
    alert.amount_usd != null && Number(alert.amount_usd) > 0
      ? Number(alert.amount_usd)
      : parsed.amount_usd;
  const amount_raw = alert.amount_raw || parsed.amount_raw || null;
  const token = alert.token || parsed.token || null;
  return {
    ...alert,
    amount_usd,
    amount_raw,
    token,
    title_clean: cleanText(alert.title || ""),
    raw_clean: cleanText(alert.raw_text || ""),
  };
};

// ── Compute p95 from alert amounts (dynamic whale threshold) ──
const computeWhaleThreshold = (alerts) => {
  const amounts = alerts
    .map((a) => enrichAlert(a).amount_usd)
    .filter((v) => v != null && v > 0)
    .sort((a, b) => a - b);
  if (amounts.length < 10) return 1_000_000;
  const idx = Math.floor(amounts.length * 0.95);
  return amounts[idx] || 1_000_000;
};

// ── Semantic badge system ──
const typeStyle = (t) => {
  const attention = "bg-accent/12 text-accent";
  const danger = "bg-loss/12 text-loss";
  const profit = "bg-profit/12 text-profit";
  const neutral = "bg-ink/[0.05] text-text-secondary";
  const map = {
    whale_transfer: attention,
    smart_money: attention,
    liquidation: danger,
    security: danger,
    buy: profit,
    sell: danger,
    deposit: profit,
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

const chainDot = (_c) => "bg-ink/40";

/**
 * Chains drawn as their native asset mark.
 * Tron → TRX, BSC → BNB, Base → BASE (local official Coinbase mark),
 * Hyperliquid → HYPE (OKX-preferred in CoinLogo). Anything not listed keeps
 * the plain dot — a wrong chain mark is worse than a neutral one.
 */
const CHAIN_TOKEN = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  tron: "TRX",
  bsc: "BNB",
  base: "BASE",
  hyperliquid: "HYPE",
  arbitrum: "ARB",
  optimism: "OP",
  avalanche: "AVAX",
  polygon: "POL",
  matic: "POL",
  sui: "SUI",
};

const ChainMark = ({ chain, size = 14 }) => {
  const token = CHAIN_TOKEN[String(chain || "").toLowerCase()];
  if (!token) {
    return <span className={`h-1.5 w-1.5 rounded-full ${chainDot(chain)}`} />;
  }
  return <CoinLogo pair={token} size={size} className="shrink-0" />;
};

// ── Snapshot icons — filled, desk-grade (not thin stroke stick figures) ──
const IconActivity = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M3.5 12.75h3.1l1.85-5.4a.85.85 0 0 1 1.62.05l2.55 8.7 1.7-5.1a.85.85 0 0 1 1.6 0l1.2 2.75h3.9a.75.75 0 0 1 0 1.5h-4.45a.85.85 0 0 1-.8-.55l-.7-1.6-1.85 5.55a.85.85 0 0 1-1.62-.05L8.75 9.9l-1.25 3.65a.85.85 0 0 1-.8.55H3.5a.75.75 0 0 1 0-1.5Z" />
  </svg>
);
const IconClock = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M12 2.25a9.75 9.75 0 1 0 0 19.5 9.75 9.75 0 0 0 0-19.5ZM12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm.75 3.5a.75.75 0 0 0-1.5 0v4.3c0 .2.08.39.22.53l2.6 2.6a.75.75 0 1 0 1.06-1.06l-2.38-2.38V7.5Z"
      clipRule="evenodd"
    />
  </svg>
);
const IconTrend = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M3.4 16.9a.85.85 0 0 1 0-1.2l5.05-5.05a.85.85 0 0 1 1.2 0l2.55 2.55 5.2-5.2H15.2a.85.85 0 0 1 0-1.7h5.1c.47 0 .85.38.85.85v5.1a.85.85 0 0 1-1.7 0V9.4l-5.9 5.9a.85.85 0 0 1-1.2 0L10.8 12.75 4.6 18.95a.85.85 0 0 1-1.2-1.05Z" />
    <path d="M4.5 19.5h4.2a.75.75 0 0 0 0-1.5H6.06l3.2-3.2a.75.75 0 0 0-1.06-1.06L5 16.94V14.7a.75.75 0 0 0-1.5 0v4.05c0 .41.34.75.75.75Z" opacity="0.45" />
  </svg>
);
const IconWhale = ({ className = "h-4 w-4" }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M20.6 10.2c-.45-2.7-2.4-4.75-5.1-5.55-1.1-.35-2.25-.4-3.4-.2-1.95.35-3.7 1.4-4.95 2.95-.55.7-1 1.5-1.3 2.35-.25-.05-.5-.08-.75-.08-1.7 0-3.15 1.15-3.55 2.75-.15.55.3 1.1.9 1.1h1.15c.3 1.55 1.55 2.75 3.15 2.95v1.35c0 .4.35.75.75.75h1.1c.4 0 .75-.35.75-.75v-1.2h.9c.95 0 1.85-.3 2.55-.85.9.55 1.95.85 3.05.85h.1c2.85-.1 5.15-2.3 5.45-5.1.05-.4.05-.8 0-1.17Zm-13.35 2.55c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1Zm5.6 1.85c-1.55 0-2.9-.9-3.5-2.2.7-.7 1.65-1.15 2.7-1.15 1.35 0 2.55.7 3.2 1.75-.6 1-1.7 1.6-2.4 1.6Zm5.55-2.35c-.4 0-.75-.35-.75-.75s.35-.75.75-.75.75.35.75.75-.35.75-.75.75Z" />
    <path d="M8.2 7.1c.55-.85 1.3-1.55 2.2-2.05-.15-.55-.05-1.15.35-1.6.45-.5 1.2-.6 1.8-.3.35-1 .15-2.15-.6-2.9l-.15.15c.55.6.7 1.45.4 2.2-.55.1-1.05.45-1.3.95-.35.7-.15 1.55.45 2.05-.45.4-.85.9-1.15 1.45-.35-.05-.7-.05-1 .05Z" opacity="0.55" />
  </svg>
);
const IconSearch = ({ className = "h-3.5 w-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path
      fillRule="evenodd"
      d="M10.5 3.25a7.25 7.25 0 1 0 4.55 12.88l3.91 3.91a.75.75 0 1 0 1.06-1.06l-3.91-3.91A7.25 7.25 0 0 0 10.5 3.25Zm-5.75 7.25a5.75 5.75 0 1 1 11.5 0 5.75 5.75 0 0 1-11.5 0Z"
      clipRule="evenodd"
    />
  </svg>
);
const IconLink = ({ className = "h-5 w-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9.6 14.4a.75.75 0 0 1 0-1.06l4.8-4.8a.75.75 0 0 1 1.06 1.06l-4.8 4.8a.75.75 0 0 1-1.06 0Z" />
    <path d="M11.03 16.97a3.75 3.75 0 0 1 0-5.3l.7-.7a.75.75 0 0 1 1.06 1.06l-.7.7a2.25 2.25 0 1 0 3.18 3.18l.7-.7a.75.75 0 1 1 1.06 1.06l-.7.7a3.75 3.75 0 0 1-5.3 0Zm1.94-9.94a3.75 3.75 0 0 1 5.3 0l.7.7a.75.75 0 1 1-1.06 1.06l-.7-.7a2.25 2.25 0 1 0-3.18 3.18l-.7.7a.75.75 0 0 1-1.06-1.06l.7-.7a3.75 3.75 0 0 1 0-5.18Z" />
  </svg>
);

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

  // Modal is URL-driven: ?alert=<id>
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAlertId = searchParams.get("alert");
  const alertCacheRef = useRef(new Map());
  const refreshRef = useRef(null);

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

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/stats`);
      if (res.ok) setStats(await res.json());
    } catch {
      /* silent */
    }
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

  useEffect(() => {
    for (const a of alerts) {
      if (a && a.id != null) alertCacheRef.current.set(String(a.id), a);
    }
  }, [alerts]);

  const selectedAlert = useMemo(() => {
    if (!selectedAlertId) return null;
    return (
      alerts.find((a) => String(a.id) === String(selectedAlertId)) ||
      alertCacheRef.current.get(String(selectedAlertId)) ||
      null
    );
  }, [selectedAlertId, alerts]);

  const openAlert = useCallback(
    (alert) => {
      if (!alert || alert.id == null) return;
      alertCacheRef.current.set(String(alert.id), alert);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("alert", String(alert.id));
        return next;
      });
    },
    [setSearchParams]
  );

  const closeAlert = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("alert");
      return next;
    });
  }, [setSearchParams]);

  const handleTypeFilter = (t) => {
    setAlertType(t);
    setPage(1);
  };
  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };
  const handleChain = (c) => {
    setChainFilter(c);
    setPage(1);
  };
  const handleSource = (s) => {
    setSourceFilter(s);
    setPage(1);
  };
  const handleToken = (t) => {
    setTokenFilter(t);
    setPage(1);
  };
  const handleMinUsd = (v) => {
    setMinUsd(v);
    setPage(1);
  };

  const whaleThreshold = useMemo(() => computeWhaleThreshold(alerts), [alerts]);
  const isHighlight = useCallback(
    (a) => {
      const e = enrichAlert(a);
      return (
        (e.amount_usd && e.amount_usd >= whaleThreshold) ||
        a.alert_type === "liquidation" ||
        a.alert_type === "security" ||
        a.alert_type === "whale_transfer" ||
        a.alert_type === "smart_money"
      );
    },
    [whaleThreshold]
  );

  const topType = useMemo(() => {
    if (!stats?.by_type?.length) return null;
    return stats.by_type[0];
  }, [stats]);

  // Snapshot cards — compact 2×2 on mobile, 4-up on desktop
  const snapshotCards = useMemo(
    () => [
      {
        key: "total",
        icon: <IconActivity className="h-3.5 w-3.5 text-accent" />,
        title: "Total",
        value: fmtNum(stats?.total || 0),
        note: `${(stats?.last_24h || 0).toLocaleString()} / 24h`,
      },
      {
        key: "hour",
        icon: <IconClock className="h-3.5 w-3.5 text-profit" />,
        title: "Last Hour",
        value: fmtNum(stats?.last_1h || 0),
        note: (stats?.last_1h || 0) > 0 ? "Active" : "Quiet",
        isLive: (stats?.last_1h || 0) > 0,
      },
      {
        key: "top",
        icon: <IconTrend className="h-3.5 w-3.5 text-accent" />,
        title: "Top Activity",
        value: topType ? prettyType(topType.type) : "—",
        note: topType ? `${fmtNum(topType.count)} alerts` : "—",
      },
      {
        key: "whale",
        icon: <IconWhale className="h-3.5 w-3.5 text-accent" />,
        title: "Whale",
        value:
          whaleThreshold >= 1e6
            ? `$${(whaleThreshold / 1e6).toFixed(1)}M`
            : fmtUsd(whaleThreshold),
        note: "p95 page",
        isGold: true,
      },
    ],
    [stats, topType, whaleThreshold]
  );

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

  return (
    <div className="space-y-3 pb-10 sm:space-y-4">
      {/* HEADER — no LIVE / Auto-refresh chrome */}
      <PageHeader
        title="On-Chain Intelligence"
        subtitle={
          stats?.by_blockchain?.length
            ? `Whale · Smart money · Liquidations · ${stats.by_blockchain.length} chains`
            : "Whale · Smart money · Liquidations · 7 chains"
        }
      />

      {/* SNAPSHOT — 2×2 mobile, 4-up desktop; dense so the feed starts sooner */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {snapshotCards.map((c) => (
          <SnapshotCard key={c.key} {...c} />
        ))}
      </div>

      {/* FILTER + FEED + SIDEBAR */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-9">
          {/* Filter shell — Gate-style pill chips inside one card */}
          <div className="overflow-hidden rounded-xl border border-ink/[0.06] bg-surface-raised">
            {/* Type pills */}
            <div className="border-b border-ink/[0.06] px-3 py-3 sm:px-4">
              <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
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
                      type="button"
                      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        active
                          ? "bg-accent text-accent-fg"
                          : "bg-ink/[0.04] text-text-secondary hover:bg-ink/[0.08] hover:text-text-primary"
                      }`}
                    >
                      {label}
                      {count != null && (
                        <span
                          className={`ml-1.5 font-mono text-[11px] tabular-nums ${
                            active ? "text-accent-fg/75" : "text-text-muted"
                          }`}
                        >
                          {fmtNum(count)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Min USD + search + dropdowns */}
            <div className="space-y-3 px-3 py-3 sm:px-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] font-medium text-text-muted">Min size</span>
                {MIN_USD_PRESETS.map(({ key, label, value }) => {
                  const active = minUsd === value;
                  return (
                    <button
                      key={key}
                      onClick={() => handleMinUsd(value)}
                      type="button"
                      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                        active
                          ? "bg-accent text-accent-fg"
                          : "bg-ink/[0.04] text-text-secondary hover:bg-ink/[0.08] hover:text-text-primary"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    placeholder="Search title or raw text…"
                    value={search}
                    onChange={handleSearch}
                    className="w-full rounded-lg border border-ink/[0.08] bg-surface-secondary py-2 pl-9 pr-3 text-[13px] text-text-primary placeholder:text-text-muted transition-colors focus:border-ink/20 focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <FilterSelect
                    value={chainFilter}
                    onChange={handleChain}
                    placeholder="Chain: All"
                    options={(stats?.by_blockchain || []).slice(0, 12).map((c) => ({
                      value: c.blockchain,
                      label: c.blockchain,
                    }))}
                  />
                  <FilterSelect
                    value={sourceFilter}
                    onChange={handleSource}
                    placeholder="Source: All"
                    options={(stats?.by_source || []).map((s) => ({
                      value: s.source,
                      label: s.source,
                    }))}
                  />
                  <FilterSelect
                    value={tokenFilter}
                    onChange={handleToken}
                    placeholder="Token: All"
                    options={(stats?.by_token || []).slice(0, 15).map((t) => ({
                      value: t.token,
                      label: `$${t.token}`,
                    }))}
                  />
                </div>
              </div>

              {activeFiltersCount > 0 && (
                <div className="flex items-center gap-3 text-[12px]">
                  <span className="text-text-muted">
                    {activeFiltersCount} filter{activeFiltersCount > 1 ? "s" : ""} active
                  </span>
                  <button
                    onClick={clearFilters}
                    type="button"
                    className="font-medium text-accent transition-opacity hover:opacity-80"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ALERT FEED — single card shell, table-like rows */}
          <div className="overflow-hidden rounded-xl border border-ink/[0.06] bg-surface-raised">
            <div className="flex items-center justify-between gap-3 border-b border-ink/[0.06] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="text-[14px] font-semibold text-text-primary">Latest Alerts</h2>
                {!loading && (
                  <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 font-mono text-[11px] tabular-nums text-text-muted">
                    {fmtNum(totalAlerts)}
                  </span>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-text-muted">
                Page {page}
                {totalPages > 1 ? ` / ${totalPages}` : ""}
              </span>
            </div>

            {loading ? (
              <LoadingSkeleton />
            ) : alerts.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <div className="divide-y divide-ink/[0.04]">
                  {alerts.map((alert) => (
                    <AlertRow
                      key={alert.id}
                      alert={alert}
                      isHighlight={isHighlight(alert)}
                      onClick={() => openAlert(alert)}
                    />
                  ))}
                </div>
                <div className="border-t border-ink/[0.06] px-4 py-3">
                  <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* SIDEBAR — sticky soft cards */}
        <div className="space-y-3 lg:sticky lg:top-4 lg:col-span-3 lg:self-start">
          <SidebarTrendingTokens
            stats={stats}
            onTokenClick={handleToken}
            activeToken={tokenFilter}
          />
          <SidebarBlockchains stats={stats} onChainClick={handleChain} activeChain={chainFilter} />
          <SidebarLargestMoves stats={stats} />
          <SidebarSources stats={stats} onSourceClick={handleSource} activeSource={sourceFilter} />
        </div>
      </div>

      {selectedAlert && <AlertModal alert={selectedAlert} onClose={closeAlert} />}

      <AssistantWidget pageId="onchain" />
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// SNAPSHOT CARD — dense (mobile first)
// ════════════════════════════════════════════════════════════════
const SnapshotCard = ({ icon, title, value, note, isLive, isGold }) => (
  <div className="flex min-h-0 flex-col rounded-xl border border-ink/[0.06] bg-surface-raised px-3 py-2.5 transition-colors hover:border-ink/[0.12] sm:px-4 sm:py-3.5">
    <div className="mb-1.5 flex items-center justify-between gap-1.5 sm:mb-2.5">
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
        <span className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ink/[0.08] bg-ink/[0.04] sm:flex sm:h-7 sm:w-7 sm:rounded-lg">
          {icon}
        </span>
        <h3 className="truncate text-[11px] font-medium text-text-muted sm:text-[13px] sm:font-semibold sm:text-text-primary">
          {title}
        </h3>
      </div>
      {isLive && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-profit" />
        </span>
      )}
    </div>
    <div
      className={`truncate font-mono text-[18px] font-semibold tabular-nums tracking-tight sm:text-[22px] ${
        isGold ? "text-accent" : "text-text-primary"
      }`}
    >
      {value}
    </div>
    {note ? (
      <div className="mt-0.5 truncate text-[10px] leading-snug text-text-muted/75 sm:mt-1.5 sm:text-[11px]">
        {note}
      </div>
    ) : null}
  </div>
);

// ════════════════════════════════════════════════════════════════
// FILTER SELECT
// ════════════════════════════════════════════════════════════════
const FilterSelect = ({ value, onChange, placeholder, options }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="cursor-pointer rounded-lg border border-ink/[0.08] bg-surface-secondary px-2.5 py-2 text-[12px] font-medium text-text-secondary transition-colors hover:border-ink/16 hover:text-text-primary focus:border-ink/20 focus:outline-none"
  >
    <option value="all" className="bg-surface-raised text-text-primary">
      {placeholder}
    </option>
    {options.map((o) => (
      <option key={o.value} value={o.value} className="bg-surface-raised text-text-primary">
        {o.label}
      </option>
    ))}
  </select>
);

// ════════════════════════════════════════════════════════════════
// ALERT ROW
// ════════════════════════════════════════════════════════════════
/** Avatar: coin logo first, source photo only when no token, chain dot as fallback. */
const AlertAvatar = ({ alert }) => {
  const [photoFailed, setPhotoFailed] = useState(false);
  const usePhoto = !alert.token && alert.has_photo && alert.image_url && !photoFailed;
  // Prefer token logo → chain mark (Tron/Base/etc.) → source photo → empty dot
  const chainToken = CHAIN_TOKEN[String(alert.blockchain || "").toLowerCase()];

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-ink/[0.08] bg-surface-secondary sm:h-10 sm:w-10">
      {alert.token ? (
        <CoinLogo pair={alert.token} size={40} className="h-full w-full" />
      ) : chainToken ? (
        <CoinLogo pair={chainToken} size={40} className="h-full w-full" />
      ) : usePhoto ? (
        <img
          src={alert.image_url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <span className={`h-2 w-2 rounded-full ${chainDot(alert.blockchain)}`} />
      )}
    </div>
  );
};

const AlertRow = ({ alert, isHighlight, onClick }) => {
  const e = enrichAlert(alert);
  const title = e.title_clean || e.raw_clean?.slice(0, 140) || "—";

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") onClick?.();
      }}
      className={`group relative flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors sm:gap-3.5 sm:px-4 ${
        isHighlight ? "bg-accent/[0.03] hover:bg-accent/[0.06]" : "hover:bg-ink/[0.02]"
      }`}
    >
      {isHighlight && (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" aria-hidden="true" />
      )}

      <AlertAvatar alert={e} />

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${typeStyle(e.alert_type)}`}
          >
            {typeLabel(e.alert_type)}
          </span>
          {e.token && (
            <span className="text-[12px] font-semibold text-text-primary">${e.token}</span>
          )}
          {e.blockchain && (
            <span className="hidden items-center gap-1 text-[11px] text-text-muted sm:inline-flex">
              <ChainMark chain={e.blockchain} size={12} />
              <span className="capitalize">{e.blockchain}</span>
            </span>
          )}
          {e.source_name && (
            <span className="hidden text-[11px] text-text-muted/70 md:inline">
              · {e.source_name}
            </span>
          )}
        </div>

        <p className="line-clamp-1 text-[13px] leading-snug text-text-primary/90 transition-colors group-hover:text-text-primary">
          {title}
        </p>
      </div>

      <div className="flex min-w-[78px] shrink-0 flex-col items-end gap-0.5">
        {e.amount_usd ? (
          <span
            className={`font-mono text-[13px] font-semibold tabular-nums sm:text-[14px] ${
              isHighlight ? "text-accent" : "text-text-primary"
            }`}
          >
            {fmtUsd(e.amount_usd)}
          </span>
        ) : (
          <span className="font-mono text-[13px] text-text-muted">—</span>
        )}
        <span className="font-mono text-[11px] tabular-nums text-text-muted">
          {timeAgo(e.created_at)}
        </span>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// SIDEBAR
// ════════════════════════════════════════════════════════════════
const SidebarCard = ({ title, children }) => (
  <div className="overflow-hidden rounded-xl border border-ink/[0.06] bg-surface-raised transition-colors hover:border-ink/[0.12]">
    <div className="flex items-center justify-between gap-2 px-4 py-3">
      <h3 className="text-[14px] font-semibold text-text-primary">{title}</h3>
    </div>
    <div className="px-2 pb-2">{children}</div>
  </div>
);

const SidebarTrendingTokens = ({ stats, onTokenClick, activeToken }) => {
  const tokens = stats?.by_token?.slice(0, 8) || [];
  if (!tokens.length) return null;
  return (
    <SidebarCard title="Trending Tokens">
      <div className="space-y-px">
        {tokens.map((t, i) => {
          const active = activeToken === t.token;
          return (
            <button
              key={t.token}
              onClick={() => onTokenClick(active ? "all" : t.token)}
              type="button"
              className={`flex w-full items-center justify-between rounded-lg px-2 py-2 transition-colors ${
                active ? "bg-accent/12" : "hover:bg-ink/[0.04]"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-4 font-mono text-[10px] tabular-nums text-text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <CoinLogo pair={t.token} size={18} className="shrink-0" />
                <span
                  className={`truncate text-[13px] font-medium ${active ? "text-accent" : "text-text-primary"}`}
                >
                  ${t.token}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {t.total_usd > 0 && (
                  <span className="font-mono text-[11px] tabular-nums text-text-secondary">
                    {fmtUsd(t.total_usd)}
                  </span>
                )}
                <span className="w-7 text-right font-mono text-[11px] tabular-nums text-text-muted">
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
  const max = Math.max(...chains.map((c) => c.count), 1);
  return (
    <SidebarCard title="Chains">
      <div className="space-y-px">
        {chains.map((c) => {
          const ratio = c.count / max;
          const active = activeChain === c.blockchain;
          return (
            <button
              key={c.blockchain}
              onClick={() => onChainClick(active ? "all" : c.blockchain)}
              type="button"
              className={`w-full rounded-lg px-2 py-2 transition-colors ${
                active ? "bg-accent/12" : "hover:bg-ink/[0.04]"
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span
                  className={`flex min-w-0 items-center gap-2 text-[13px] ${active ? "text-accent" : "text-text-primary"}`}
                >
                  <ChainMark chain={c.blockchain} size={14} />
                  <span className="truncate capitalize">{c.blockchain}</span>
                </span>
                <span className="font-mono text-[11px] tabular-nums text-text-muted">
                  {fmtNum(c.count)}
                </span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-full bg-ink/[0.06]">
                <div
                  className="h-full rounded-full bg-accent/70"
                  style={{ width: `${Math.max(4, ratio * 100)}%` }}
                />
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
    <SidebarCard title="Largest Moves">
      <div className="space-y-px">
        {moves.map((m, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-ink/[0.04]"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-4 font-mono text-[10px] tabular-nums text-text-muted">
                {String(i + 1).padStart(2, "0")}
              </span>
              {m.token ? <CoinLogo pair={m.token} size={18} className="shrink-0" /> : null}
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium text-text-primary">
                  {m.token ? `$${m.token}` : "—"}
                </span>
                {m.alert_type && (
                  <span className="truncate text-[10px] text-text-muted">
                    {prettyType(m.alert_type)}
                  </span>
                )}
              </div>
            </div>
            <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-text-primary">
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
  const max = Math.max(...sources.map((s) => s.count), 1);
  return (
    <SidebarCard title="Sources">
      <div className="space-y-px">
        {sources.map((s) => {
          const ratio = s.count / max;
          const active = activeSource === s.source;
          return (
            <button
              key={s.source}
              onClick={() => onSourceClick(active ? "all" : s.source)}
              type="button"
              className={`w-full rounded-lg px-2 py-2 transition-colors ${
                active ? "bg-accent/12" : "hover:bg-ink/[0.04]"
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span
                  className={`truncate text-[13px] ${active ? "text-accent" : "text-text-primary"}`}
                >
                  {s.source}
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-text-muted">
                  {fmtNum(s.count)}
                </span>
              </div>
              <div className="h-[5px] overflow-hidden rounded-full bg-ink/[0.06]">
                <div
                  className="h-full rounded-full bg-ink/25"
                  style={{ width: `${Math.max(4, ratio * 100)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </SidebarCard>
  );
};

// ════════════════════════════════════════════════════════════════
// MODAL — coin logo + big amount highlight on every open
// ════════════════════════════════════════════════════════════════
const AlertModal = ({ alert, onClose }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const e = useMemo(() => enrichAlert(alert), [alert]);

  useEffect(() => {
    const h = (ev) => {
      if (ev.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const showPhoto = e.image_url && !imageFailed;
  const hasRoute = e.from_entity || e.to_entity;

  const modalContent = (
    <div
      className="lq-modal-safe fixed inset-0 z-[100000] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div className="lq-scrim" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Alert detail"
        className="lq-sheet relative flex max-h-[min(var(--lq-modal-maxh),100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-t border-ink/[0.08] bg-surface-raised shadow-[0_-20px_60px_rgb(var(--scrim)_/_0.35)] sm:rounded-2xl sm:border"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pb-0 pt-2.5 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-ink/[0.1] bg-surface-secondary text-text-secondary transition-colors hover:border-ink/20 hover:text-text-primary"
        >
          ✕
        </button>

        <div className="overflow-y-auto">
          {/* Hero: coin + amount — always present so every modal has a visual anchor */}
          <div className="border-b border-ink/[0.06] bg-gradient-to-b from-ink/[0.03] to-transparent px-5 pb-5 pt-6 sm:px-6 sm:pt-7">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-ink/[0.08] bg-surface-raised shadow-sm sm:h-16 sm:w-16">
                {e.token ? (
                  <CoinLogo pair={e.token} size={64} className="h-full w-full" />
                ) : showPhoto ? (
                  <img
                    src={e.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <span className="font-mono text-[13px] font-semibold text-text-muted">
                    {typeLabel(e.alert_type).slice(0, 3)}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1 pr-6">
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${typeStyle(e.alert_type)}`}
                  >
                    {typeLabel(e.alert_type)}
                  </span>
                  {e.token && (
                    <span className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">
                      ${e.token}
                    </span>
                  )}
                  {e.blockchain && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-ink/[0.05] px-2 py-0.5 text-[11px] font-medium text-text-secondary">
                      <ChainMark chain={e.blockchain} size={12} />
                      <span className="capitalize">{e.blockchain}</span>
                    </span>
                  )}
                </div>

                <p className="text-[12px] text-text-muted">
                  {e.source_name || "Unknown source"}
                  {e.created_at ? ` · ${new Date(e.created_at).toLocaleString()}` : ""}
                </p>

                {/* Big amount highlight — the whole point of opening the modal */}
                <div className="mt-3">
                  {e.amount_usd ? (
                    <>
                      <p className="font-mono text-[32px] font-semibold leading-none tracking-tight text-accent tabular-nums sm:text-[36px]">
                        {fmtUsd(e.amount_usd)}
                      </p>
                      {e.amount_raw && e.token ? (
                        <p className="mt-1.5 font-mono text-[13px] tabular-nums text-text-secondary">
                          {Number(e.amount_raw).toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })}{" "}
                          {e.token}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="font-mono text-[28px] font-semibold tabular-nums text-text-muted">
                      —
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 p-5 sm:p-6">
            {e.title_clean ? (
              <p className="text-[14px] leading-relaxed text-text-primary">{e.title_clean}</p>
            ) : null}

            {hasRoute && (
              <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary p-3.5">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    From
                  </p>
                  <p className="truncate text-[13px] font-medium text-text-primary">
                    {e.from_entity || "—"}
                  </p>
                </div>
                <span className="hidden text-text-muted sm:block" aria-hidden="true">
                  →
                </span>
                <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary p-3.5">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                    To
                  </p>
                  <p className="truncate text-[13px] font-medium text-text-primary">
                    {e.to_entity || "—"}
                  </p>
                </div>
              </div>
            )}

            {e.raw_clean && e.raw_clean !== e.title_clean ? (
              <div className="rounded-xl border border-ink/[0.06] bg-surface-secondary p-3.5">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                  Details
                </p>
                <p className="break-words whitespace-pre-wrap text-[12.5px] leading-relaxed text-text-secondary">
                  {e.raw_clean}
                </p>
              </div>
            ) : null}

            {/* Photo fits the modal width; object-contain keeps aspect, never crops */}
            {showPhoto ? (
              <div className="flex max-h-[min(42vh,320px)] items-center justify-center overflow-hidden rounded-xl border border-ink/[0.06] bg-surface">
                <img
                  src={e.image_url}
                  alt=""
                  className="max-h-[min(42vh,320px)] w-full object-contain object-center"
                  onError={() => setImageFailed(true)}
                />
              </div>
            ) : null}

            {e.tx_url ? (
              <a
                href={e.tx_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-[13px] font-semibold text-accent-fg transition-opacity hover:opacity-90"
              >
                View on Explorer
                <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// ════════════════════════════════════════════════════════════════
// PAGINATION (GateMarketTable style)
// ════════════════════════════════════════════════════════════════
const PageBtn = ({ onClick, disabled, label, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className="flex h-7 w-7 items-center justify-center rounded-md text-[15px] leading-none text-text-secondary transition-colors hover:bg-ink/[0.06] hover:text-text-primary disabled:pointer-events-none disabled:opacity-25"
  >
    {children}
  </button>
);

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

const Pagination = ({ page, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="font-mono text-[11px] tabular-nums text-text-muted">
        Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <PageBtn
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          label="Previous page"
        >
          ‹
        </PageBtn>
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
        <PageBtn
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          label="Next page"
        >
          ›
        </PageBtn>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
// LOADING & EMPTY
// ════════════════════════════════════════════════════════════════
const LoadingSkeleton = () => (
  <div className="lqsk-group divide-y divide-ink/[0.04]">
    <ShimmerStyles />
    {[...Array(10)].map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-3.5">
        <div className="h-10 w-10 shrink-0 rounded-full bg-ink/[0.04]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-1/4 rounded bg-ink/[0.05]" />
          <div className="h-3 w-3/4 rounded bg-ink/[0.03]" />
        </div>
        <div className="w-16 space-y-1.5">
          <div className="h-3 rounded bg-ink/[0.05]" />
          <div className="ml-auto h-2 w-2/3 rounded bg-ink/[0.03]" />
        </div>
      </div>
    ))}
  </div>
);

const EmptyState = () => (
  <div className="px-6 py-14 text-center">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-ink/[0.08] bg-surface-secondary">
      <IconLink className="h-5 w-5 text-text-muted" />
    </div>
    <p className="mb-1 text-[14px] font-medium text-text-primary">No alerts found</p>
    <p className="text-[12px] text-text-muted">Try adjusting filters or wait for the next pulse</p>
  </div>
);

export default OnchainPage;
