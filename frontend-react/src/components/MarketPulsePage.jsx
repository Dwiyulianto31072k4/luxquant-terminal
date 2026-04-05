import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

const API_BASE = import.meta.env.VITE_API_URL || "";

const MarketPulsePage = () => {
  const { t } = useTranslation();

  const [feed, setFeed] = useState([]);
  const [stats, setStats] = useState(null);
  const [topMovers, setTopMovers] = useState(null);
  const [coinDetail, setCoinDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Filters
  const [sourceFilter, setSourceFilter] = useState("all");
  const [timeframeFilter, setTimeframeFilter] = useState("all");
  const [searchPair, setSearchPair] = useState("");
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [moverPeriod, setMoverPeriod] = useState("1h");

  // ════════════════════════════════════════
  // DATA FETCHING
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

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Fetch coin detail when selected
  useEffect(() => {
    if (!selectedCoin) {
      setCoinDetail(null);
      return;
    }
    fetch(`${API_BASE}/api/v1/market-pulse/coin/${selectedCoin}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setCoinDetail(data))
      .catch(() => setCoinDetail(null));
  }, [selectedCoin]);

  // ════════════════════════════════════════
  // DERIVED DATA
  // ════════════════════════════════════════

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

  // ════════════════════════════════════════
  // HELPERS
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

  return (
    <div className="space-y-6 pb-10">

      {/* ═══ PAGE HEADER ═══ */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-1 bg-gradient-to-r from-gold-primary to-transparent rounded-full" />
            <h1 className="text-3xl font-display font-bold text-white tracking-wide">Market Pulse</h1>
          </div>
          <p className="text-text-muted text-sm ml-15">
            Real-time market activity monitor · <span className="text-white font-semibold">{stats?.hourly?.total_events || 0}</span> events this hour
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

      {/* ═══ STATS CARDS ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Events */}
        <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-2xl p-5 border border-white/5 shadow-md relative overflow-hidden group hover:border-gold-primary/30 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-blue-500/10 transition-all" />
          <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Events (1h)</p>
          <p className="text-white text-3xl font-display font-bold relative z-10">{stats?.hourly?.total_events || 0}</p>
          <p className="text-text-muted text-xs mt-2 relative z-10">{stats?.hourly?.unique_coins || 0} unique coins</p>
        </div>

        {/* Bull / Bear Ratio */}
        <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-2xl p-5 border border-white/5 shadow-md relative overflow-hidden group hover:border-green-500/30 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-green-500/10 transition-all" />
          <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Bullish / Bearish</p>
          <div className="flex items-baseline gap-2 relative z-10">
            <span className="text-green-400 text-2xl font-display font-bold">{bullBearRatio.bull}</span>
            <span className="text-text-muted text-lg">/</span>
            <span className="text-red-400 text-2xl font-display font-bold">{bullBearRatio.bear}</span>
          </div>
          {bullBearRatio.total > 0 && (
            <div className="flex h-1.5 rounded-full overflow-hidden mt-3 bg-white/5 relative z-10">
              <div className="bg-green-500 rounded-l-full" style={{ width: `${(bullBearRatio.bull / bullBearRatio.total) * 100}%` }} />
              <div className="bg-red-500 rounded-r-full" style={{ width: `${(bullBearRatio.bear / bullBearRatio.total) * 100}%` }} />
            </div>
          )}
        </div>

        {/* Flash Moves */}
        <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-2xl p-5 border border-white/5 shadow-md relative overflow-hidden group hover:border-amber-500/30 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-amber-500/10 transition-all" />
          <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Flash Moves (1h)</p>
          <p className="text-amber-400 text-3xl font-display font-bold relative z-10">{stats?.hourly?.flash_moves || 0}</p>
          <p className="text-text-muted text-xs mt-2 relative z-10">Sudden price spikes</p>
        </div>

        {/* Biggest Move */}
        <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-2xl p-5 border border-white/5 shadow-md relative overflow-hidden group hover:border-purple-500/30 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-purple-500/10 transition-all" />
          <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Biggest Move</p>
          {stats?.hourly?.biggest_move ? (
            <>
              <p className={`text-3xl font-display font-bold relative z-10 ${stats.hourly.biggest_move.pct_change >= 0 ? "text-green-400" : "text-red-400"}`}>
                {stats.hourly.biggest_move.pct_change >= 0 ? "+" : ""}{stats.hourly.biggest_move.pct_change}%
              </p>
              <p className="text-text-muted text-xs mt-2 relative z-10">{stats.hourly.biggest_move.pair}</p>
            </>
          ) : (
            <p className="text-white text-3xl font-display font-bold relative z-10">—</p>
          )}
        </div>
      </div>

      {/* ═══ SEARCH + COIN CHIPS ═══ */}
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

          {/* Active Coin Chips */}
          <div className="flex flex-wrap gap-2 flex-1">
            {activeCoins.map(([pair, count]) => (
              <button
                key={pair}
                onClick={() => selectCoin(pair)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all duration-200 border ${
                  selectedCoin === pair
                    ? "bg-gold-primary text-[#0a0506] font-bold border-gold-primary shadow-[0_0_15px_rgba(212,168,83,0.3)]"
                    : "bg-black/40 text-gray-400 border-white/10 hover:border-white/30 hover:text-white"
                }`}
              >
                <span>{pair.replace("USDT", "")}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  selectedCoin === pair ? "bg-black/20 text-[#0a0506]" : "bg-white/10 text-gray-500"
                }`}>{count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Coin Detail Banner */}
        {coinDetail && selectedCoin && (
          <div className="mt-4 p-4 rounded-xl bg-black/40 border border-gold-primary/20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-white font-bold text-lg">{coinDetail.pair}</span>
                <span className={`text-xs px-2.5 py-1 rounded-lg border font-semibold ${
                  coinDetail.stats.bull_pct >= 60
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : coinDetail.stats.bull_pct <= 40
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                }`}>
                  {coinDetail.stats.bull_pct}% bullish
                </span>
              </div>
              <button onClick={() => setSelectedCoin(null)} className="text-gray-500 hover:text-white text-lg transition-colors">✕</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className={`text-xl font-bold ${(coinDetail.stats.strongest_up || 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                  +{coinDetail.stats.strongest_up || 0}%
                </p>
                <p className="text-text-muted text-[10px] uppercase tracking-widest mt-1">Strongest Up</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-white">{coinDetail.stats.total_events}</p>
                <p className="text-text-muted text-[10px] uppercase tracking-widest mt-1">Events (24h)</p>
              </div>
              <div className="text-center">
                <p className={`text-xl font-bold ${coinDetail.stats.bull_pct >= 50 ? "text-green-400" : "text-red-400"}`}>
                  {coinDetail.stats.bull_pct}%
                </p>
                <p className="text-text-muted text-[10px] uppercase tracking-widest mt-1">Bull Ratio</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-white">{timeAgo(coinDetail.stats.last_activity)}</p>
                <p className="text-text-muted text-[10px] uppercase tracking-widest mt-1">Last Activity</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══ FILTER PILLS ═══ */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Source filter */}
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

        {/* Timeframe filter */}
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

        {/* ═══ LEFT: ACTIVITY FEED ═══ */}
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
            <div className="divide-y divide-white/[0.04] max-h-[650px] overflow-y-auto custom-scrollbar">
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
                <div
                  key={`${event.source}-${event.id}`}
                  onClick={() => selectCoin(event.pair)}
                  className={`flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer ${
                    selectedCoin === event.pair ? "bg-gold-primary/[0.03] border-l-2 border-gold-primary" : ""
                  }`}
                >
                  {/* Direction arrow */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    event.direction === "bullish"
                      ? "bg-green-500/10 text-green-400"
                      : "bg-red-500/10 text-red-400"
                  }`}>
                    {event.direction === "bullish" ? "▲" : "▼"}
                  </div>

                  {/* Pair + detail */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold text-sm">{event.pair}</span>
                      <span className={`font-bold text-sm ${event.pct_change >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {event.pct_change >= 0 ? "+" : ""}{event.pct_change}%
                      </span>
                    </div>
                    <p className="text-text-muted text-[11px] mt-0.5">
                      {event.source === "price_movement"
                        ? `moved in ${event.move_seconds}s`
                        : `${event.timeframe || ""} timeframe`}
                    </p>
                  </div>

                  {/* Event tag */}
                  <span className={`text-[10px] px-2.5 py-1 rounded-lg border font-semibold flex-shrink-0 ${eventTagClass(event)}`}>
                    {eventLabel(event)}
                  </span>

                  {/* Time */}
                  <span className="text-text-muted text-[11px] w-10 text-right flex-shrink-0">
                    {timeAgo(event.created_at)}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-2.5 border-t border-white/[0.06] text-center">
              <span className="text-[10px] text-text-muted uppercase tracking-widest">Auto-refreshing every 10s</span>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT: SIDEBAR ═══ */}
        <div className="lg:col-span-4 space-y-4">

          {/* Heatmap */}
          <div className="bg-[#0a0506] rounded-2xl border border-white/10 p-4">
            <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-3">Activity Heatmap (1h)</h3>
            <div className="grid grid-cols-4 gap-1.5">
              {(stats?.heatmap || []).map((coin) => {
                const strongestMove = coin.max_up && (!coin.max_down || coin.max_up >= Math.abs(coin.max_down))
                  ? coin.max_up
                  : coin.max_down ? coin.max_down : 0;
                const isBull = strongestMove >= 0;
                const intensity = Math.min(Math.abs(strongestMove) / 10, 1);
                return (
                  <button
                    key={coin.pair}
                    onClick={() => selectCoin(coin.pair)}
                    className={`rounded-lg p-2 text-center transition-all hover:scale-105 cursor-pointer border ${
                      selectedCoin === coin.pair
                        ? "border-gold-primary bg-gold-primary/10"
                        : "border-transparent"
                    }`}
                    style={{
                      backgroundColor: isBull
                        ? `rgba(34, 197, 94, ${0.05 + intensity * 0.25})`
                        : `rgba(239, 68, 68, ${0.05 + intensity * 0.25})`,
                    }}
                  >
                    <p className={`text-[11px] font-bold ${isBull ? "text-green-400" : "text-red-400"}`}>
                      {coin.pair.replace("USDT", "")}
                    </p>
                    <p className={`text-[9px] font-semibold mt-0.5 ${isBull ? "text-green-400/70" : "text-red-400/70"}`}>
                      {strongestMove >= 0 ? "+" : ""}{strongestMove.toFixed(1)}%
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top Movers */}
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
            <div className="space-y-1.5">
              {(topMovers?.most_active || []).slice(0, 6).map((coin, i) => (
                <button
                  key={coin.pair}
                  onClick={() => selectCoin(coin.pair)}
                  className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors text-left"
                >
                  <span className="text-[10px] text-text-muted w-4 text-center">{i + 1}</span>
                  <span className="text-white text-xs font-semibold flex-1">{coin.pair}</span>
                  <span className="text-text-muted text-[10px]">{coin.event_count} events</span>
                  <span className={`text-xs font-bold w-16 text-right ${
                    (coin.best || 0) >= Math.abs(coin.worst || 0)
                      ? "text-green-400"
                      : "text-red-400"
                  }`}>
                    {(coin.best || 0) >= Math.abs(coin.worst || 0)
                      ? `+${coin.best}%`
                      : `${coin.worst}%`}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Flash Moves */}
          <div className="bg-[#0a0506] rounded-2xl border border-white/10 p-4">
            <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-3">Flash Moves</h3>
            <div className="space-y-1.5">
              {(topMovers?.flash_moves || []).slice(0, 5).map((fm, i) => (
                <button
                  key={i}
                  onClick={() => selectCoin(fm.pair)}
                  className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors text-left"
                >
                  <span className="text-white text-xs font-semibold flex-1">{fm.pair}</span>
                  <span className={`text-xs font-bold ${fm.pct_change >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {fm.pct_change >= 0 ? "+" : ""}{fm.pct_change}%
                  </span>
                  <span className="text-text-muted text-[10px] w-8 text-right">{fm.move_seconds}s</span>
                </button>
              ))}
              {(!topMovers?.flash_moves || topMovers.flash_moves.length === 0) && (
                <p className="text-text-muted text-xs text-center py-3">No flash moves yet</p>
              )}
            </div>
          </div>

          {/* 24h Summary */}
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
                  <span className={`font-bold ${row.cls || "text-white"}`}>{row.value.toLocaleString()}</span>
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