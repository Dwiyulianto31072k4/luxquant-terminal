// src/components/CryptoNewsPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — Crypto News Feed
// Real-time news aggregated from Telegram channels
// 3-day rolling window, auto-refresh every 60s
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API_BASE = "/api/v1";

// ════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return "";
  }
};

const getDomainColor = (domain) => {
  const colors = {
    "tradingview.com": "#2962FF",
    "cointelegraph.com": "#2563eb",
    "coindesk.com": "#6366f1",
    "decrypt.co": "#10b981",
    "bitcoinworld.co.in": "#f59e0b",
    "bitcoinmagazine.com": "#ef4444",
    "theblock.co": "#8b5cf6",
    "cryptoslate.com": "#06b6d4",
    "newsbtc.com": "#F7931A",
    "beincrypto.com": "#22c55e",
    "cryptobriefing.com": "#3b82f6",
    "coinpedia.org": "#14b8a6",
    "u.today": "#f97316",
  };
  return colors[domain] || "#d4a24e";
};

// Domain-based fallback for articles without images
const DOMAIN_FALLBACKS = {
  "tradingview.com": { emoji: "📊", label: "TradingView" },
  "cointelegraph.com": { emoji: "📰", label: "CoinTelegraph" },
  "coindesk.com": { emoji: "📰", label: "CoinDesk" },
  "decrypt.co": { emoji: "🔓", label: "Decrypt" },
  "theblock.co": { emoji: "🧱", label: "The Block" },
  "bitcoinworld.co.in": { emoji: "🌐", label: "BitcoinWorld" },
  "beincrypto.com": { emoji: "🐝", label: "BeInCrypto" },
  "newsbtc.com": { emoji: "₿", label: "NewsBTC" },
  "cryptobriefing.com": { emoji: "📋", label: "CryptoBriefing" },
  "coinpedia.org": { emoji: "📖", label: "CoinPedia" },
  "u.today": { emoji: "📰", label: "U.Today" },
  "cryptoslate.com": { emoji: "🔷", label: "CryptoSlate" },
  "bitcoinist.com": { emoji: "₿", label: "Bitcoinist" },
  "ambcrypto.com": { emoji: "📊", label: "AMBCrypto" },
  "cryptonews.com": { emoji: "📰", label: "CryptoNews" },
};

const getDomainFallback = (domain) => {
  if (!domain) return { emoji: "📰", label: "News" };
  const key = Object.keys(DOMAIN_FALLBACKS).find((d) => domain.includes(d));
  return key ? DOMAIN_FALLBACKS[key] : { emoji: "📰", label: domain };
};

// Fallback placeholder component
const DomainPlaceholder = ({ domain, size = "lg" }) => {
  const fb = getDomainFallback(domain);
  const color = getDomainColor(domain);
  const isLg = size === "lg";
  return (
    <div
      className={`${isLg ? "w-full h-full" : "w-full h-full"} flex flex-col items-center justify-center gap-1`}
      style={{ background: `linear-gradient(135deg, ${color}15, ${color}05)` }}
    >
      <span className={isLg ? "text-3xl" : "text-xl"}>{fb.emoji}</span>
      <span
        className="font-semibold tracking-wider uppercase"
        style={{
          color: `${color}80`,
          fontSize: isLg ? "9px" : "7px",
        }}
      >
        {fb.label}
      </span>
    </div>
  );
};

// ════════════════════════════════════════════
// Sub-Components
// ════════════════════════════════════════════

const StatChip = ({ label, value, icon }) => (
  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/5">
    <span className="text-sm">{icon}</span>
    <span className="text-[11px] text-text-muted">{label}</span>
    <span className="text-[11px] text-white font-bold">{value}</span>
  </div>
);

const FilterPill = ({ label, active, onClick, count }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all duration-200 ${
      active
        ? "bg-gold-primary/20 text-gold-primary border border-gold-primary/40"
        : "bg-white/[0.03] text-text-muted border border-white/5 hover:text-white hover:border-white/15"
    }`}
  >
    {label}
    {count !== undefined && (
      <span
        className={`text-[9px] px-1.5 py-0.5 rounded-full ${
          active ? "bg-gold-primary/30 text-gold-primary" : "bg-white/5 text-text-muted"
        }`}
      >
        {count}
      </span>
    )}
  </button>
);

const DomainBadge = ({ domain }) => {
  if (!domain) return null;
  const color = getDomainColor(domain);
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
      style={{ background: `${color}20`, color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: color }}
      />
      {domain.replace(".com", "").replace(".co.in", "").replace(".co", "")}
    </span>
  );
};

const EmptyState = ({ text }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
      <span className="text-2xl opacity-30">📰</span>
    </div>
    <p className="text-text-muted text-sm">{text}</p>
  </div>
);

const LoadingSkeleton = () => (
  <div className="space-y-4">
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className="rounded-xl bg-white/[0.02] border border-white/5 p-4 animate-pulse"
      >
        <div className="flex gap-4">
          <div className="w-20 h-20 rounded-lg bg-white/5 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-white/5 rounded w-3/4" />
            <div className="h-3 bg-white/5 rounded w-1/2" />
            <div className="h-3 bg-white/5 rounded w-1/4" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

// ════════════════════════════════════════════
// Article Card — for content_type="article"
// ════════════════════════════════════════════
const ArticleCard = ({ item, featured = false }) => {
  const handleClick = () => {
    if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
  };

  const hasImage = item.image_url && item.image_url !== "webpage_photo";

  if (featured) {
    return (
      <div
        onClick={handleClick}
        className="group cursor-pointer rounded-xl overflow-hidden bg-white/[0.02] border border-white/5 hover:border-gold-primary/25 transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,.3)]"
      >
        {/* Image area */}
        <div className="relative w-full h-48 sm:h-56 overflow-hidden">
          {hasImage ? (
            <img
              src={item.image_url}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={(e) => {
                e.target.style.display = "none";
                if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
              }}
            />
          ) : null}
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center ${hasImage ? "hidden" : ""}`}
          >
            <DomainPlaceholder domain={item.domain} size="lg" />
          </div>
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          {/* Domain badge */}
          <div className="absolute top-3 left-3">
            <DomainBadge domain={item.domain} />
          </div>
          {/* Title over image */}
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="text-white font-semibold text-base sm:text-lg leading-snug line-clamp-2 group-hover:text-gold-primary transition-colors">
              {item.title}
            </h3>
          </div>
        </div>
        {/* Description */}
        <div className="p-4 pt-2">
          {item.description && (
            <p className="text-text-muted text-[12px] leading-relaxed line-clamp-2 mb-3">
              {item.description}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-[10px]">
              {timeAgo(item.created_at)}
            </span>
            {item.url && (
              <span className="text-gold-primary/60 text-[10px] group-hover:text-gold-primary transition-colors">
                Read article →
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Compact article card
  return (
    <div
      onClick={handleClick}
      className="group cursor-pointer flex gap-3 p-3 rounded-xl bg-white/[0.015] border border-white/5 hover:border-gold-primary/20 transition-all duration-300"
    >
      {/* Thumbnail */}
      <div className="w-[72px] h-[72px] flex-shrink-0 rounded-lg overflow-hidden bg-white/[0.03]">
        {hasImage ? (
          <img
            src={item.image_url}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.style.display = "none";
              if (e.target.nextSibling) e.target.nextSibling.style.display = "flex";
            }}
          />
        ) : null}
        <div
          className={`w-full h-full ${hasImage ? "hidden" : "flex"} items-center justify-center`}
        >
          <DomainPlaceholder domain={item.domain} size="sm" />
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h4 className="text-white text-[12px] sm:text-[13px] font-semibold line-clamp-2 leading-snug group-hover:text-gold-primary transition-colors">
          {item.title}
        </h4>
        <div className="flex items-center gap-2 mt-1.5">
          <DomainBadge domain={item.domain} />
          <span className="text-text-muted text-[10px]">
            {timeAgo(item.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════
// Photo Card — for content_type="photo"
// ════════════════════════════════════════════
const PhotoCard = ({ item }) => (
  <div
    className="group flex gap-3 p-3 rounded-xl bg-white/[0.015] border border-white/5 hover:border-gold-primary/20 transition-all duration-300 cursor-pointer"
    onClick={() => {
      if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
    }}
  >
    {/* Photo thumbnail */}
    <div className="w-[72px] h-[72px] flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-blue-500/10 to-purple-500/10 flex items-center justify-center border border-white/5">
      {item.image_url && item.image_url !== "webpage_photo" ? (
        <img
          src={item.image_url}
          alt=""
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            e.target.style.display = "none";
            e.target.parentElement.innerHTML =
              '<svg class="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" /></svg>';
          }}
        />
      ) : (
        <svg
          className="w-6 h-6 text-white/20"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
          />
        </svg>
      )}
    </div>
    {/* Content */}
    <div className="flex-1 min-w-0 flex flex-col justify-center">
      <h4 className="text-white text-[12px] sm:text-[13px] font-semibold line-clamp-2 leading-snug">
        {item.title}
      </h4>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-500/15 text-purple-400">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
          Photo
        </span>
        <span className="text-text-muted text-[10px]">
          {timeAgo(item.created_at)}
        </span>
      </div>
    </div>
  </div>
);

// ════════════════════════════════════════════
// Headline Card — for content_type="headline"
// ════════════════════════════════════════════
const HeadlineCard = ({ item }) => (
  <div
    className={`group p-3 rounded-xl bg-white/[0.015] border border-white/5 hover:border-gold-primary/20 transition-all duration-300 border-l-2 border-l-gold-primary/40 ${item.url ? "cursor-pointer" : ""}`}
    onClick={() => {
      if (item.url) window.open(item.url, "_blank", "noopener,noreferrer");
    }}
  >
    <h4 className="text-white text-[12px] sm:text-[13px] font-semibold line-clamp-2 leading-snug">
      {item.title}
    </h4>
    <div className="flex items-center gap-2 mt-1.5">
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-gold-primary/10 text-gold-primary/80">
        <span className="w-1.5 h-1.5 rounded-full bg-gold-primary/60" />
        Headline
      </span>
      <span className="text-text-muted text-[10px]">
        {timeAgo(item.created_at)}
      </span>
    </div>
  </div>
);

// ════════════════════════════════════════════
// Trending Sidebar
// ════════════════════════════════════════════
const TrendingSidebar = ({ trending, stats, onSearchTopic }) => {
  const topDomains = stats?.top_domains?.slice(0, 6) || [];
  const maxDomainCount = topDomains.length > 0 ? topDomains[0].count : 1;

  return (
    <div className="space-y-4">
      {/* Trending Now */}
      {trending?.trending?.length > 0 && (
        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
          <h3 className="text-white text-xs font-bold uppercase tracking-widest mb-3">
            Trending Now
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {trending.trending.slice(0, 12).map((t, i) => (
              <button
                key={t.topic}
                onClick={() => onSearchTopic(t.topic)}
                className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all hover:scale-105 ${
                  i < 3
                    ? "bg-gold-primary/15 text-gold-primary border border-gold-primary/25 hover:bg-gold-primary/25"
                    : "bg-white/[0.04] text-text-muted border border-white/5 hover:text-white hover:border-white/15"
                }`}
              >
                {i < 3 && (
                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-gold-primary/20 text-gold-primary text-[8px] font-bold mr-1">
                    {i + 1}
                  </span>
                )}
                {t.topic}
                <span className="text-[8px] opacity-50 ml-1">×{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Top Domains */}
      {topDomains.length > 0 && (
        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
          <h3 className="text-white text-xs font-bold uppercase tracking-widest mb-3">
            Top Sources
          </h3>
          <div className="space-y-2">
            {topDomains.map((d) => (
              <div key={d.domain} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] text-text-secondary truncate">
                    {d.domain}
                  </span>
                  <span className="text-[10px] text-text-muted font-mono">
                    {d.count}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(d.count / maxDomainCount) * 100}%`,
                      background: getDomainColor(d.domain),
                      opacity: 0.6,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity */}
      {stats && (
        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
          <h3 className="text-white text-xs font-bold uppercase tracking-widest mb-3">
            Activity
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-text-muted">Last hour</span>
              <span className="text-white font-bold">
                {stats.last_hour} articles
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-text-muted">Last 6 hours</span>
              <span className="text-white font-bold">
                {stats.last_6h} articles
              </span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-text-muted">3-day total</span>
              <span className="text-white font-bold">
                {stats.total} articles
              </span>
            </div>
          </div>
          {/* Mini hourly chart */}
          {stats.hourly?.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <p className="text-[9px] text-text-muted uppercase tracking-widest mb-2">
                24h Activity
              </p>
              <div className="flex items-end gap-0.5 h-8">
                {stats.hourly
                  .slice()
                  .reverse()
                  .slice(0, 24)
                  .map((h, i) => {
                    const max = Math.max(
                      ...stats.hourly.map((x) => x.count),
                      1
                    );
                    const height = (h.count / max) * 100;
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-t bg-gold-primary/30 hover:bg-gold-primary/60 transition-colors"
                        style={{ height: `${Math.max(height, 4)}%` }}
                        title={`${h.count} articles`}
                      />
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════

const CryptoNewsPage = () => {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [trending, setTrending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimeout = useRef(null);

  const LIMIT = 30;

  // ─── Fetch news feed ───
  const fetchFeed = useCallback(
    async (reset = false) => {
      try {
        if (reset) {
          setLoading(true);
          setOffset(0);
        } else {
          setLoadingMore(true);
        }

        const params = new URLSearchParams({
          limit: LIMIT,
          offset: reset ? 0 : offset,
        });
        if (activeFilter !== "all") params.set("content_type", activeFilter);
        if (searchQuery) params.set("search", searchQuery);

        const res = await fetch(
          `${API_BASE}/crypto-news-feed/feed?${params}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (reset) {
          setItems(data.items || []);
        } else {
          setItems((prev) => [...prev, ...(data.items || [])]);
        }
        setTotal(data.total || 0);
        setOffset((reset ? 0 : offset) + LIMIT);
      } catch (err) {
        console.error("News feed error:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [offset, activeFilter, searchQuery]
  );

  // ─── Fetch stats + trending ───
  const fetchMeta = useCallback(async () => {
    try {
      const [statsRes, trendingRes] = await Promise.all([
        fetch(`${API_BASE}/crypto-news-feed/stats`),
        fetch(`${API_BASE}/crypto-news-feed/trending`),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (trendingRes.ok) setTrending(await trendingRes.json());
    } catch (err) {
      console.error("News meta error:", err);
    }
  }, []);

  // ─── Initial load + auto-refresh ───
  useEffect(() => {
    fetchFeed(true);
    fetchMeta();
    const iv = setInterval(() => {
      fetchFeed(true);
      fetchMeta();
    }, 60000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, searchQuery]);

  // ─── Search debounce ───
  const handleSearchInput = (val) => {
    setSearchInput(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setSearchQuery(val);
    }, 400);
  };

  const handleSearchTopic = (topic) => {
    setSearchInput(topic);
    setSearchQuery(topic);
  };

  // ─── Filter change ───
  const handleFilterChange = (filter) => {
    setActiveFilter(filter);
    setOffset(0);
  };

  // ─── Split items for layout ───
  const featuredItems = useMemo(() => {
    return items
      .filter((i) => i.content_type === "article" && i.description)
      .slice(0, 2);
  }, [items]);

  const remainingItems = useMemo(() => {
    const featuredIds = new Set(featuredItems.map((f) => f.id));
    return items.filter((i) => !featuredIds.has(i.id));
  }, [items, featuredItems]);

  const hasMore = items.length < total;

  // ════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-white tracking-tight">
            Crypto News
          </h1>
          <p className="text-text-muted text-xs sm:text-sm mt-0.5">
            Real-time crypto news aggregator — 3 day rolling window
          </p>
        </div>
        {/* Stat chips */}
        {stats && (
          <div className="flex flex-wrap gap-2">
            <StatChip icon="📰" label="Total" value={stats.total} />
            <StatChip icon="🔗" label="Articles" value={stats.articles} />
            <StatChip icon="📷" label="Photos" value={stats.photos} />
            <StatChip icon="⏰" label="1h" value={stats.last_hour} />
          </div>
        )}
      </div>

      {/* ═══ SEARCH + FILTERS ═══ */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder="Search news..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm placeholder:text-text-muted/50 focus:outline-none focus:border-gold-primary/40 focus:ring-1 focus:ring-gold-primary/20 transition-all"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput("");
                setSearchQuery("");
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors"
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
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          <FilterPill
            label="All"
            active={activeFilter === "all"}
            onClick={() => handleFilterChange("all")}
            count={stats?.total}
          />
          <FilterPill
            label="Articles"
            active={activeFilter === "article"}
            onClick={() => handleFilterChange("article")}
            count={stats?.articles}
          />
          <FilterPill
            label="Photos"
            active={activeFilter === "photo"}
            onClick={() => handleFilterChange("photo")}
            count={stats?.photos}
          />
          <FilterPill
            label="Headlines"
            active={activeFilter === "headline"}
            onClick={() => handleFilterChange("headline")}
            count={stats?.headlines}
          />
        </div>
      </div>

      {/* ═══ MAIN LAYOUT ═══ */}
      {loading ? (
        <LoadingSkeleton />
      ) : items.length === 0 ? (
        <EmptyState
          text={
            searchQuery
              ? `No news found for "${searchQuery}"`
              : "No news available yet"
          }
        />
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          {/* LEFT — News Feed */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Featured articles (only on first page, all filter) */}
            {activeFilter === "all" &&
              !searchQuery &&
              featuredItems.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {featuredItems.map((item) => (
                    <ArticleCard key={item.id} item={item} featured />
                  ))}
                </div>
              )}

            {/* Remaining news */}
            <div className="space-y-2">
              {remainingItems.map((item) => {
                switch (item.content_type) {
                  case "article":
                    return <ArticleCard key={item.id} item={item} />;
                  case "photo":
                    return <PhotoCard key={item.id} item={item} />;
                  case "headline":
                    return <HeadlineCard key={item.id} item={item} />;
                  default:
                    return <HeadlineCard key={item.id} item={item} />;
                }
              })}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => fetchFeed(false)}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-text-secondary hover:text-white hover:border-gold-primary/30 transition-all disabled:opacity-50"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Loading...
                    </span>
                  ) : (
                    `Load more (${items.length} of ${total})`
                  )}
                </button>
              </div>
            )}
          </div>

          {/* RIGHT — Sidebar */}
          <div className="w-full lg:w-72 xl:w-80 flex-shrink-0">
            <div className="lg:sticky lg:top-20">
              <TrendingSidebar
                trending={trending}
                stats={stats}
                onSearchTopic={handleSearchTopic}
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══ FOOTER ═══ */}
      <div className="flex items-center justify-center gap-2 py-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        <span className="text-text-muted text-[10px]">
          Auto-refresh every 60s — DB retention: 3 days
        </span>
      </div>
    </div>
  );
};

export default CryptoNewsPage;