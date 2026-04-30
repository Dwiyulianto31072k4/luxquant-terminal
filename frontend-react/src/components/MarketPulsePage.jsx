import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ════════════════════════════════════════════════════════
// COIN LOGO + METADATA HELPERS
// ════════════════════════════════════════════════════════

const stripQuote = (sym) => (sym || "").replace(/USDT$|USDC$|BUSD$|USD$/i, "");

const getCoinLogo = (symbol) => {
  if (!symbol) return null;
  return `https://assets.coincap.io/assets/icons/${stripQuote(symbol).toLowerCase()}@2x.png`;
};

const MarketPulsePage = () => {
  const { t } = useTranslation();

  // ── Existing state (preserved) ────────────────────────
  const [feed, setFeed] = useState([]);
  const [stats, setStats] = useState(null);
  const [topMovers, setTopMovers] = useState(null);
  const [coinDetail, setCoinDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // ── Filters (preserved) ────────────────────────────────
  const [sourceFilter, setSourceFilter] = useState("all");
  const [timeframeFilter, setTimeframeFilter] = useState("all");
  const [searchPair, setSearchPair] = useState("");
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [moverPeriod, setMoverPeriod] = useState("1h");

  // ── NEW: Coin metadata cache ───────────────────────────
  const [coinMeta, setCoinMeta] = useState({});
  const metaLoaded = useRef(false);

  // ════════════════════════════════════════
  // DATA FETCHING (preserved + add coin meta)
  // ════════════════════════════════════════

  const fetchData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);

      const params = new URLSearchParams({ limit: "200" });
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (timeframeFilter !== "all") params.set("timeframe", timeframeFilter);
      if (selectedCoin) params.set("pair", selectedCoin);

      const [feedRes, statsRes, moversRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/v1/market-pulse/feed?${params}`),
        fetch(`${API_BASE}/api/v1/market-pulse/stats`),
        fetch(`${API_BASE}/api/v1/market-pulse/top-movers?period=${moverPeriod}`),
      ]);

      if (feedRes.status === "fulfilled" && feedRes.value.ok) {
        const data = await feedRes.value.json();
        setFeed(data.events || []);
      }
      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        setStats(await statsRes.value.json());
      }
      if (moversRes.status === "fulfilled" && moversRes.value.ok) {
        setTopMovers(await moversRes.value.json());
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error("Market Pulse fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, timeframeFilter, selectedCoin, moverPeriod]);

  // NEW: fetch coin metadata once (name, image, rank)
  const fetchCoinMeta = useCallback(async () => {
    if (metaLoaded.current) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/market/coins?per_page=250&page=1`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const map = {};
      data.forEach((c) => {
        if (!c.symbol) return;
        const sym = c.symbol.toUpperCase();
        const meta = {
          name: c.name,
          image: c.image,
          rank: c.market_cap_rank,
        };
        map[sym] = meta;
        map[sym + "USDT"] = meta;
      });
      setCoinMeta(map);
      metaLoaded.current = true;
    } catch (e) {
      // silently fail — fallback logos still work
    }
  }, []);

  useEffect(() => {
    fetchData(true);
    fetchCoinMeta();
    const interval = setInterval(() => fetchData(false), 10000);
    return () => clearInterval(interval);
  }, [fetchData, fetchCoinMeta]);

  // Coin detail fetch (preserved)
  useEffect(() => {
    if (!selectedCoin) {
      setCoinDetail(null);
      return;
    }
    fetch(`${API_BASE}/api/v1/market-pulse/coin/${selectedCoin}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setCoinDetail(data))
      .catch(() => setCoinDetail(null));
  }, [selectedCoin]);

  // ════════════════════════════════════════
  // DERIVED DATA
  // ════════════════════════════════════════

  // NEW: resolve coin metadata (name + image + rank)
  const getCoin = useCallback((pair) => {
    if (!pair) return { name: "", symbol: "", image: null };
    const upper = pair.toUpperCase();
    const meta = coinMeta[upper] || coinMeta[stripQuote(upper)];
    if (meta) {
      return {
        name: meta.name,
        symbol: stripQuote(upper),
        image: meta.image,
        rank: meta.rank,
      };
    }
    return {
      name: stripQuote(upper),
      symbol: stripQuote(upper),
      image: getCoinLogo(upper),
    };
  }, [coinMeta]);

  // NEW: precompute sparklines per coin from feed (O(1) lookup later)
  const coinSparklines = useMemo(() => {
    const map = {};
    feed.forEach((e) => {
      if (!map[e.pair]) map[e.pair] = [];
      if (map[e.pair].length < 12) map[e.pair].push(e.pct_change || 0);
    });
    Object.keys(map).forEach((k) => { map[k] = map[k].reverse(); });
    return map;
  }, [feed]);

  const filteredFeed = useMemo(() => {
    if (!searchPair) return feed;
    const q = searchPair.toUpperCase();
    return feed.filter((e) => e.pair?.includes(q));
  }, [feed, searchPair]);

  const activeCoins = useMemo(() => {
    const map = {};
    feed.forEach((e) => {
      if (!map[e.pair]) map[e.pair] = 0;
      map[e.pair]++;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [feed]);

  const bullBearRatio = useMemo(() => {
    if (!stats?.hourly) return { bull: 0, bear: 0, total: 0 };
    const bull = stats.hourly.bullish || 0;
    const bear = stats.hourly.bearish || 0;
    return { bull, bear, total: bull + bear };
  }, [stats]);

  // NEW: Pulse Tape items (top movers from feed)
  const tapeItems = useMemo(() => {
    return [...feed]
      .filter((e) => Math.abs(e.pct_change || 0) > 0)
      .sort((a, b) => Math.abs(b.pct_change || 0) - Math.abs(a.pct_change || 0))
      .slice(0, 16);
  }, [feed]);

  // NEW: heatmap enriched with event_count
  const heatmapEnriched = useMemo(() => {
    if (!stats?.heatmap) return [];
    const counts = {};
    feed.forEach((e) => { counts[e.pair] = (counts[e.pair] || 0) + 1; });
    return stats.heatmap.map((c) => ({
      ...c,
      event_count: counts[c.pair] || 1,
    }));
  }, [feed, stats]);

  // ════════════════════════════════════════
  // HELPERS (preserved)
  // ════════════════════════════════════════

  const timeAgo = (isoStr) => {
    if (!isoStr) return "";
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000;
    if (diff < 60) return `${Math.round(diff)}s`;
    if (diff < 3600) return `${Math.round(diff / 60)}m`;
    if (diff < 86400) return `${Math.round(diff / 3600)}h`;
    return `${Math.round(diff / 86400)}d`;
  };

  const eventLabel = (e) => {
    if (e.source === "price_movement") {
      return e.event_type === "flash_move" ? "Flash Move" : "Rapid Move";
    }
    return e.event_type || "—";
  };

  const eventTagClass = (e) => {
    const type = e.event_type?.toLowerCase() || "";
    if (type.includes("high break") || type.includes("strong rally") || type.includes("breakout"))
      return "bg-green-500/15 text-green-400 border-green-500/20";
    if (type.includes("low break") || type.includes("breakdown"))
      return "bg-red-500/15 text-red-400 border-red-500/20";
    if (type.includes("pullback") || type.includes("dip"))
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    if (type === "flash_move")
      return "bg-red-500/15 text-red-400 border-red-500/20";
    if (type === "rapid_move")
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    if (e.direction === "bullish")
      return "bg-green-500/10 text-green-400/80 border-green-500/10";
    return "bg-red-500/10 text-red-400/80 border-red-500/10";
  };

  const selectCoin = (pair) => {
    if (selectedCoin === pair) {
      setSelectedCoin(null);
      setSearchPair("");
    } else {
      setSelectedCoin(pair);
      setSearchPair("");
    }
  };

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════

  const biggestMoveCoin = stats?.hourly?.biggest_move
    ? getCoin(stats.hourly.biggest_move.pair)
    : null;

  return (
    <div className="space-y-6 pb-10">
      <PulseStyles />

      {/* ═══ PAGE HEADER ═══ */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-1 bg-gradient-to-r from-gold-primary to-transparent rounded-full" />
            <h1 className="text-3xl font-display font-bold text-white tracking-wide">Market Pulse</h1>
          </div>
          <p className="text-text-muted text-sm ml-15">
            Real-time market activity monitor ·{" "}
            <span className="text-white font-semibold">{stats?.hourly?.total_events || 0}</span> events this hour ·{" "}
            <span className="text-gold-primary font-semibold">{stats?.hourly?.unique_coins || 0}</span> coins
          </p>
        </div>

        <div className="flex items-center gap-3 bg-bg-secondary/50 px-4 py-2 rounded-full border border-white/5 shadow-inner">
          <span className="relative flex h-3 w-3">
            {loading && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${loading ? "bg-yellow-500" : "bg-green-500"}`} />
          </span>
          <span className="text-xs font-medium text-text-muted">
            {loading ? "Syncing..." : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Ready"}
          </span>
        </div>
      </div>

      {/* ═══ NEW: PULSE TAPE TICKER ═══ */}
      {tapeItems.length > 0 && <PulseTape items={tapeItems} getCoin={getCoin} onSelect={selectCoin} />}

      {/* ═══ STATS CARDS — upgraded ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Events */}
        <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-2xl p-5 border border-white/5 shadow-md relative overflow-hidden group hover:border-gold-primary/30 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-blue-500/10 transition-all" />
          <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Events (1h)</p>
          <p className="text-white text-3xl font-display font-bold relative z-10">{stats?.hourly?.total_events || 0}</p>
          <p className="text-text-muted text-xs mt-2 relative z-10">{stats?.hourly?.unique_coins || 0} unique coins</p>
        </div>

        {/* Bull / Bear with PIVOT BAR */}
        <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-2xl p-5 border border-white/5 shadow-md relative overflow-hidden group hover:border-green-500/30 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-green-500/10 transition-all" />
          <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Bullish / Bearish</p>
          <div className="flex items-baseline gap-2 relative z-10">
            <span className="text-green-400 text-2xl font-display font-bold">{bullBearRatio.bull}</span>
            <span className="text-text-muted text-lg">/</span>
            <span className="text-red-400 text-2xl font-display font-bold">{bullBearRatio.bear}</span>
          </div>
          {bullBearRatio.total > 0 && (
            <>
              <div className="relative h-1.5 rounded-full overflow-hidden mt-3 bg-white/5 z-10">
                <div className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-green-500 to-green-400"
                  style={{ width: `${(bullBearRatio.bull / bullBearRatio.total) * 100}%` }} />
                <div className="absolute top-0 bottom-0 right-0 bg-gradient-to-l from-red-500 to-red-400"
                  style={{ width: `${(bullBearRatio.bear / bullBearRatio.total) * 100}%` }} />
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/30" />
              </div>
              <p className={`text-[10px] mt-1.5 font-semibold relative z-10 ${
                bullBearRatio.bull >= bullBearRatio.bear ? "text-green-400" : "text-red-400"
              }`}>
                {bullBearRatio.bull >= bullBearRatio.bear ? "▲" : "▼"} {Math.abs(bullBearRatio.bull - bullBearRatio.bear)}{" "}
                {bullBearRatio.bull >= bullBearRatio.bear ? "bull dominance" : "bear pressure"}
              </p>
            </>
          )}
        </div>

        {/* Flash Moves */}
        <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-2xl p-5 border border-white/5 shadow-md relative overflow-hidden group hover:border-amber-500/30 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-amber-500/10 transition-all" />
          <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Flash Moves (1h)</p>
          <p className="text-amber-400 text-3xl font-display font-bold relative z-10">{stats?.hourly?.flash_moves || 0}</p>
          <p className="text-text-muted text-xs mt-2 relative z-10">Sudden price spikes</p>
        </div>

        {/* Biggest Move — UPGRADED with logo + name */}
        <div
          className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-2xl p-5 border border-white/5 shadow-md relative overflow-hidden group hover:border-purple-500/30 transition-colors cursor-pointer"
          onClick={() => stats?.hourly?.biggest_move?.pair && selectCoin(stats.hourly.biggest_move.pair)}
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-purple-500/10 transition-all" />
          <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Biggest Move (1h)</p>
          {stats?.hourly?.biggest_move && biggestMoveCoin ? (
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <CoinAvatar coin={biggestMoveCoin} size={26} />
                <div className="min-w-0">
                  <p className="text-white text-sm font-bold truncate leading-tight">{biggestMoveCoin.name || biggestMoveCoin.symbol}</p>
                  <p className="text-text-muted text-[10px] font-mono leading-tight">{stats.hourly.biggest_move.pair}</p>
                </div>
              </div>
              <p className={`text-2xl font-display font-bold mt-2 ${stats.hourly.biggest_move.pct_change >= 0 ? "text-green-400" : "text-red-400"}`}>
                {stats.hourly.biggest_move.pct_change >= 0 ? "+" : ""}{stats.hourly.biggest_move.pct_change}%
              </p>
            </div>
          ) : (
            <p className="text-white text-3xl font-display font-bold relative z-10">—</p>
          )}
        </div>
      </div>

      {/* ═══ SEARCH + COIN CHIPS (with logos) ═══ */}
      <div className="bg-gradient-to-b from-[#1a0f13] to-[#0a0506] rounded-2xl p-5 border border-white/[0.08] shadow-2xl">
        <div className="flex flex-col md:flex-row gap-4 items-start">
          {/* Search Input */}
          <div className="relative group w-full md:w-64 flex-shrink-0">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-gold-primary transition-colors">🔍</span>
            <input
              type="text"
              placeholder="Search coin..."
              value={searchPair}
              onChange={(e) => { setSearchPair(e.target.value); setSelectedCoin(null); }}
              className="w-full pl-11 pr-4 py-2.5 bg-black/60 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:border-gold-primary/50 focus:ring-1 focus:ring-gold-primary/50 focus:outline-none text-sm shadow-inner transition-all"
            />
          </div>

          {/* Active Coin Chips with logos */}
          <div className="flex flex-wrap gap-2 flex-1">
            {activeCoins.map(([pair, count]) => {
              const coin = getCoin(pair);
              const isSelected = selectedCoin === pair;
              return (
                <button
                  key={pair}
                  onClick={() => selectCoin(pair)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs transition-all duration-200 border ${
                    isSelected
                      ? "bg-gold-primary text-[#0a0506] font-bold border-gold-primary shadow-[0_0_15px_rgba(212,168,83,0.3)]"
                      : "bg-black/40 text-gray-400 border-white/10 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <CoinAvatar coin={coin} size={16} />
                  <span>{coin.symbol}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                    isSelected ? "bg-black/20 text-[#0a0506]" : "bg-white/10 text-gray-500"
                  }`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Coin Detail Banner — UPGRADED with big logo + name */}
        {coinDetail && selectedCoin && (() => {
          const detailCoin = getCoin(selectedCoin);
          return (
            <div className="mt-4 p-4 rounded-xl bg-black/40 border border-gold-primary/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <CoinAvatar coin={detailCoin} size={40} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-lg">{detailCoin.name || detailCoin.symbol}</span>
                      {detailCoin.rank && <span className="text-text-muted text-[10px] font-mono">#{detailCoin.rank}</span>}
                    </div>
                    <p className="text-text-muted text-xs font-mono">{coinDetail.pair}</p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-lg border font-semibold ${
                    coinDetail.stats.bull_pct >= 60 ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : coinDetail.stats.bull_pct <= 40 ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  }`}>
                    {coinDetail.stats.bull_pct}% bullish
                  </span>
                </div>
                <button onClick={() => setSelectedCoin(null)} className="text-gray-500 hover:text-white text-lg transition-colors">✕</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className={`text-xl font-bold font-mono ${(coinDetail.stats.strongest_up || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                    +{coinDetail.stats.strongest_up || 0}%
                  </p>
                  <p className="text-text-muted text-[10px] uppercase tracking-widest mt-1">Strongest Up</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold font-mono text-white">{coinDetail.stats.total_events}</p>
                  <p className="text-text-muted text-[10px] uppercase tracking-widest mt-1">Events (24h)</p>
                </div>
                <div className="text-center">
                  <p className={`text-xl font-bold font-mono ${coinDetail.stats.bull_pct >= 50 ? "text-green-400" : "text-red-400"}`}>
                    {coinDetail.stats.bull_pct}%
                  </p>
                  <p className="text-text-muted text-[10px] uppercase tracking-widest mt-1">Bull Ratio</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold font-mono text-white">{timeAgo(coinDetail.stats.last_activity)}</p>
                  <p className="text-text-muted text-[10px] uppercase tracking-widest mt-1">Last Activity</p>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ═══ FILTER PILLS (preserved) ═══ */}
      <div className="flex flex-wrap gap-2 items-center">
        {[
          { value: "all", label: "All" },
          { value: "pulse", label: "Pulse" },
          { value: "price_movement", label: "Price Moves" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSourceFilter(opt.value)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border ${
              sourceFilter === opt.value
                ? "bg-gold-primary/10 text-gold-primary border-gold-primary shadow-[0_0_10px_rgba(212,168,83,0.15)]"
                : "bg-black/40 text-gray-400 border-white/10 hover:border-white/30 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}

        <div className="w-px h-5 bg-white/10 mx-1" />

        {[
          { value: "all", label: "All TF" },
          { value: "5m", label: "5m" },
          { value: "1h", label: "1h" },
          { value: "2h", label: "2h" },
          { value: "4h", label: "4h" },
          { value: "1d", label: "1d" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTimeframeFilter(opt.value)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border ${
              timeframeFilter === opt.value
                ? "bg-gold-primary/10 text-gold-primary border-gold-primary shadow-[0_0_10px_rgba(212,168,83,0.15)]"
                : "bg-black/40 text-gray-400 border-white/10 hover:border-white/30 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}

        <span className="ml-auto text-[10px] text-text-muted uppercase tracking-widest">24h rolling window</span>
      </div>

      {/* ═══ MAIN GRID: FEED + SIDEBAR ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* LEFT: ACTIVITY FEED */}
        <div className="lg:col-span-8">
          <div className="bg-[#0a0506] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
            {/* Feed header */}
            <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gold-primary flex items-center gap-2 tracking-widest uppercase">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                Activity Feed
              </h2>
              <span className="text-[10px] text-text-muted">{filteredFeed.length} events</span>
            </div>

            {/* Feed items */}
            <div className="divide-y divide-white/[0.04] max-h-[680px] overflow-y-auto pulse-feed-scroll">
              {filteredFeed.length === 0 && !loading && (
                <div className="p-10 text-center text-text-muted text-sm">No events found</div>
              )}
              {loading && feed.length === 0 && (
                <div className="p-10 text-center">
                  <div className="inline-flex items-center gap-3 text-text-muted text-sm">
                    <div className="w-5 h-5 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
                    Loading market pulse...
                  </div>
                </div>
              )}
              {filteredFeed.map((event) => (
                <FeedRow
                  key={`${event.source}-${event.id}`}
                  event={event}
                  coin={getCoin(event.pair)}
                  sparkline={coinSparklines[event.pair]}
                  isSelected={selectedCoin === event.pair}
                  onSelect={() => selectCoin(event.pair)}
                  eventTagClass={eventTagClass}
                  eventLabel={eventLabel}
                  timeAgo={timeAgo}
                />
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-2.5 border-t border-white/[0.06] text-center">
              <span className="text-[10px] text-text-muted uppercase tracking-widest">Auto-refreshing every 10s</span>
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="lg:col-span-4 space-y-4">

          {/* Heatmap with logos */}
          <div className="bg-[#0a0506] rounded-2xl border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Activity Heatmap</h3>
              <span className="text-[9px] text-text-muted">1h · top movers</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {heatmapEnriched.map((coin) => {
                const coinData = getCoin(coin.pair);
                const strongestMove =
                  coin.max_up && (!coin.max_down || coin.max_up >= Math.abs(coin.max_down))
                    ? coin.max_up
                    : coin.max_down ? coin.max_down : 0;
                const isBull = strongestMove >= 0;
                const intensity = Math.min(Math.abs(strongestMove) / 10, 1);
                return (
                  <button
                    key={coin.pair}
                    onClick={() => selectCoin(coin.pair)}
                    className={`relative rounded-lg p-2 transition-all hover:scale-105 cursor-pointer border overflow-hidden ${
                      selectedCoin === coin.pair ? "border-gold-primary" : "border-transparent"
                    }`}
                    style={{
                      backgroundColor: isBull
                        ? `rgba(34, 197, 94, ${0.06 + intensity * 0.3})`
                        : `rgba(239, 68, 68, ${0.06 + intensity * 0.3})`,
                    }}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <CoinAvatar coin={coinData} size={22} />
                      <p className={`text-[10px] font-bold leading-tight truncate max-w-full ${isBull ? "text-green-300" : "text-red-300"}`}>
                        {coinData.symbol}
                      </p>
                      <p className={`text-[9px] font-mono font-semibold ${isBull ? "text-green-400" : "text-red-400"}`}>
                        {strongestMove >= 0 ? "+" : ""}{strongestMove.toFixed(1)}%
                      </p>
                    </div>
                    {coin.event_count > 1 && (
                      <span className="absolute top-0.5 right-0.5 text-[8px] font-mono text-white/70 bg-black/40 px-1 rounded">
                        {coin.event_count}
                      </span>
                    )}
                  </button>
                );
              })}
              {heatmapEnriched.length === 0 && (
                <div className="col-span-3 text-center py-4 text-text-muted text-xs">No activity yet</div>
              )}
            </div>
          </div>

          {/* Most Active with logos + names */}
          <div className="bg-[#0a0506] rounded-2xl border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">Most Active</h3>
              <div className="flex gap-1">
                {["1h", "4h", "24h"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setMoverPeriod(p)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                      moverPeriod === p
                        ? "bg-gold-primary/20 text-gold-primary"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              {(topMovers?.most_active || []).slice(0, 6).map((coin, i) => {
                const coinData = getCoin(coin.pair);
                const strongIsUp = (coin.best || 0) >= Math.abs(coin.worst || 0);
                return (
                  <button
                    key={coin.pair}
                    onClick={() => selectCoin(coin.pair)}
                    className="w-full grid grid-cols-[14px_24px_1fr_auto] items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors text-left"
                  >
                    <span className="text-[10px] text-text-muted text-center font-mono">{i + 1}</span>
                    <CoinAvatar coin={coinData} size={22} />
                    <div className="min-w-0">
                      <p className="text-white text-xs font-semibold truncate leading-tight">{coinData.name || coinData.symbol}</p>
                      <div className="flex items-center gap-1 text-[10px] text-text-muted leading-tight mt-0.5">
                        <span className="font-mono">{coinData.symbol}</span>
                        <span>·</span>
                        <span>{coin.event_count} ev</span>
                      </div>
                    </div>
                    <span className={`text-xs font-bold font-mono text-right ${strongIsUp ? "text-green-400" : "text-red-400"}`}>
                      {strongIsUp ? `+${coin.best}%` : `${coin.worst}%`}
                    </span>
                  </button>
                );
              })}
              {(!topMovers?.most_active || topMovers.most_active.length === 0) && (
                <p className="text-text-muted text-xs text-center py-3">No active coins yet</p>
              )}
            </div>
          </div>

          {/* Flash Moves with logos */}
          <div className="bg-[#0a0506] rounded-2xl border border-white/10 p-4">
            <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5">
              <span className="text-amber-400">⚡</span> Flash Moves
            </h3>
            <div className="space-y-1">
              {(topMovers?.flash_moves || []).slice(0, 5).map((fm, i) => {
                const coinData = getCoin(fm.pair);
                const opacity = Math.max(1 - (i / Math.max((topMovers?.flash_moves || []).length, 1)) * 0.5, 0.4);
                return (
                  <button
                    key={i}
                    onClick={() => selectCoin(fm.pair)}
                    className="w-full grid grid-cols-[20px_1fr_auto_auto] items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors text-left"
                    style={{ opacity }}
                  >
                    <CoinAvatar coin={coinData} size={18} />
                    <span className="text-white text-xs font-semibold truncate">{coinData.symbol}USDT</span>
                    <span className={`text-xs font-bold font-mono ${fm.pct_change >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {fm.pct_change >= 0 ? "+" : ""}{fm.pct_change}%
                    </span>
                    <span className="text-text-muted text-[10px] font-mono w-8 text-right">{fm.move_seconds}s</span>
                  </button>
                );
              })}
              {(!topMovers?.flash_moves || topMovers.flash_moves.length === 0) && (
                <p className="text-text-muted text-xs text-center py-3">No flash moves yet</p>
              )}
            </div>
          </div>

          {/* 24h Summary (preserved) */}
          <div className="bg-[#0a0506] rounded-2xl border border-white/10 p-4">
            <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-3">24h Summary</h3>
            <div className="space-y-2 text-xs">
              {[
                { label: "Total Events", value: stats?.daily?.total_events || 0 },
                { label: "Unique Coins", value: stats?.daily?.unique_coins || 0 },
                { label: "Bullish Events", value: stats?.daily?.bullish || 0, cls: "text-green-400" },
                { label: "Bearish Events", value: stats?.daily?.bearish || 0, cls: "text-red-400" },
                { label: "Flash Moves", value: stats?.daily?.flash_moves || 0, cls: "text-amber-400" },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center">
                  <span className="text-text-muted">{row.label}</span>
                  <span className={`font-bold font-mono ${row.cls || "text-white"}`}>{row.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketPulsePage;

// ════════════════════════════════════════════════════════
// SUB-COMPONENTS (inline — same file, no import needed)
// ════════════════════════════════════════════════════════

// Pulse Tape — horizontal scrolling ticker
const PulseTape = ({ items, getCoin, onSelect }) => {
  const tape = [...items, ...items]; // duplicate for seamless loop
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-r from-[#0a0506] via-[#140a0c] to-[#0a0506]">
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#0a0506] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#0a0506] to-transparent z-10 pointer-events-none" />
      <div className="flex gap-7 py-3 animate-pulse-tape whitespace-nowrap">
        {tape.map((m, i) => {
          const coin = getCoin(m.pair);
          const pos = (m.pct_change || 0) >= 0;
          return (
            <button
              key={i}
              onClick={() => onSelect?.(m.pair)}
              className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity"
            >
              <CoinAvatar coin={coin} size={18} />
              <span className="text-white text-xs font-bold">{coin.symbol}</span>
              <span className={`text-xs font-mono font-bold ${pos ? "text-green-400" : "text-red-400"}`}>
                {pos ? "▲" : "▼"} {Math.abs(m.pct_change || 0).toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Feed Row — extracted with logo + name + sparkline
const FeedRow = ({ event, coin, sparkline, isSelected, onSelect, eventTagClass, eventLabel, timeAgo }) => {
  const isPositive = (event.pct_change || 0) >= 0;
  const magnitude = Math.min(Math.abs(event.pct_change || 0) / 10, 1);
  return (
    <div
      onClick={onSelect}
      className={`relative grid grid-cols-[36px_1fr_auto_auto] md:grid-cols-[36px_1fr_70px_28px_auto_42px] items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer ${
        isSelected ? "bg-gold-primary/[0.03] border-l-2 border-gold-primary" : ""
      }`}
    >
      {/* Magnitude bar (left edge) */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{
          background: isPositive ? "#22c55e" : "#ef4444",
          opacity: 0.15 + magnitude * 0.6,
        }}
      />

      <CoinAvatar coin={coin} size={32} />

      {/* Name + symbol */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white font-semibold text-sm truncate max-w-[140px]">{coin.name || coin.symbol}</span>
          {coin.rank && <span className="text-[9px] text-text-muted/70 font-mono">#{coin.rank}</span>}
          <span className={`font-bold font-mono text-sm ${isPositive ? "text-green-400" : "text-red-400"}`}>
            {isPositive ? "+" : ""}{event.pct_change}%
          </span>
        </div>
        <p className="text-text-muted text-[11px] mt-0.5 font-mono">
          {event.pair} ·{" "}
          {event.source === "price_movement"
            ? `moved in ${event.move_seconds}s`
            : `${event.timeframe || ""} timeframe`}
        </p>
      </div>

      {/* Sparkline (md+) */}
      <div className="hidden md:block opacity-50">
        {sparkline?.length > 1 ? (
          <Sparkline data={sparkline} color={isPositive ? "green" : "red"} width={60} height={22} />
        ) : (
          <div className="w-[60px] h-[22px]" />
        )}
      </div>

      {/* Direction arrow (md+) */}
      <div
        className={`hidden md:flex w-7 h-7 rounded-full items-center justify-center text-xs font-bold flex-shrink-0 ${
          event.direction === "bullish"
            ? "bg-green-500/10 text-green-400"
            : "bg-red-500/10 text-red-400"
        }`}
      >
        {event.direction === "bullish" ? "▲" : "▼"}
      </div>

      {/* Event tag (lg+) */}
      <span className={`text-[10px] px-2.5 py-1 rounded-lg border font-semibold flex-shrink-0 hidden lg:inline-block ${eventTagClass(event)}`}>
        {eventLabel(event)}
      </span>

      {/* Time */}
      <span className="text-text-muted text-[11px] font-mono text-right flex-shrink-0">
        {timeAgo(event.created_at)}
      </span>
    </div>
  );
};

// Coin Avatar with fallback
const CoinAvatar = ({ coin, size = 24 }) => {
  const [errored, setErrored] = useState(false);
  const src = !errored ? (coin?.image || getCoinLogo(coin?.symbol)) : null;
  const letter = (coin?.symbol || coin?.name || "?").charAt(0).toUpperCase();
  const palette = ["#a855f7", "#3b82f6", "#ec4899", "#10b981", "#f97316", "#06b6d4", "#eab308"];
  const bgColor = palette[letter.charCodeAt(0) % palette.length];

  if (!src) {
    return (
      <div
        className="flex-shrink-0 rounded-full flex items-center justify-center font-bold text-white"
        style={{
          width: size,
          height: size,
          fontSize: size * 0.42,
          background: `linear-gradient(135deg, ${bgColor}, ${bgColor}66)`,
          border: `1px solid ${bgColor}44`,
        }}
      >
        {letter}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={coin?.symbol || ""}
      onError={() => setErrored(true)}
      className="flex-shrink-0 rounded-full bg-bg-card"
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
};

// Sparkline mini SVG
const Sparkline = ({ data, color = "green", width = 60, height = 22 }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  const fillPath = `${linePath} L ${(width - pad).toFixed(1)} ${height} L ${pad} ${height} Z`;
  const colorMap = {
    green: { stroke: "#4ade80", fill: "rgba(74, 222, 128, 0.18)" },
    red: { stroke: "#f87171", fill: "rgba(248, 113, 113, 0.18)" },
  };
  const c = colorMap[color] || colorMap.green;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={fillPath} fill={c.fill} />
      <path d={linePath} stroke={c.stroke} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// Scoped CSS for animations + scrollbar
const PulseStyles = () => (
  <style>{`
    @keyframes pulse-tape-scroll {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    .animate-pulse-tape {
      animation: pulse-tape-scroll 60s linear infinite;
    }
    .animate-pulse-tape:hover {
      animation-play-state: paused;
    }
    .pulse-feed-scroll::-webkit-scrollbar { width: 6px; }
    .pulse-feed-scroll::-webkit-scrollbar-track { background: transparent; }
    .pulse-feed-scroll::-webkit-scrollbar-thumb { background: rgba(212, 168, 83, 0.15); border-radius: 3px; }
    .pulse-feed-scroll::-webkit-scrollbar-thumb:hover { background: rgba(212, 168, 83, 0.3); }
  `}</style>
);
