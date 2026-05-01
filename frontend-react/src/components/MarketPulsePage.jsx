import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import CoinLogo from "./CoinLogo";

const API_BASE = import.meta.env.VITE_API_URL || "";

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════

const stripQuote = (sym) => (sym || "").replace(/USDT$|USDC$|BUSD$|USD$/i, "");

const titleCase = (s) => {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
};

// Binance klines — public, no auth, fast
const BINANCE_KLINES = "https://api.binance.com/api/v3/klines";

const fetchBinanceSparkline = async (pair) => {
  try {
    const res = await fetch(`${BINANCE_KLINES}?symbol=${pair}&interval=1h&limit=24`);
    if (!res.ok) return null;
    const data = await res.json();
    // klines = [openTime, open, high, low, close, volume, ...]
    return data.map((k) => parseFloat(k[4])); // close price
  } catch {
    return null;
  }
};

// ════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════

const MarketPulsePage = () => {
  const { t } = useTranslation();

  const [feed, setFeed] = useState([]);
  const [stats, setStats] = useState(null);
  const [topMovers, setTopMovers] = useState(null);
  const [coinDetail, setCoinDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [sourceFilter, setSourceFilter] = useState("all");
  const [timeframeFilter, setTimeframeFilter] = useState("all");
  const [searchPair, setSearchPair] = useState("");
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [moverPeriod, setMoverPeriod] = useState("1h");

  // Binance sparklines: { ORCAUSDT: [12.3, 12.5, ...] }
  const [sparklines, setSparklines] = useState({});
  const sparkRequestedRef = useRef(new Set());

  // ═════════ FETCH MAIN DATA ═════════

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

  // ═════════ FETCH SPARKLINES (Binance, batched) ═════════

  useEffect(() => {
    const uniquePairs = [...new Set(feed.map((e) => e.pair))]
      .filter((p) => p && !sparkRequestedRef.current.has(p))
      .slice(0, 30); // batch limit, prevent rate-limit

    if (uniquePairs.length === 0) return;

    uniquePairs.forEach((p) => sparkRequestedRef.current.add(p));

    Promise.all(uniquePairs.map((p) => fetchBinanceSparkline(p).then((data) => [p, data])))
      .then((results) => {
        setSparklines((prev) => {
          const next = { ...prev };
          results.forEach(([p, data]) => {
            if (data && data.length > 1) next[p] = data;
          });
          return next;
        });
      });

    // Refresh sparklines every 5 min
    const refreshTimer = setTimeout(() => {
      sparkRequestedRef.current.clear();
    }, 5 * 60 * 1000);

    return () => clearTimeout(refreshTimer);
  }, [feed]);

  // Coin detail
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

  // ═════════ DERIVED ═════════

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

  // Pulse Tape — DEDUP by pair (terbesar pct_change)
  const tapeItems = useMemo(() => {
    const map = {};
    feed.forEach((e) => {
      const abs = Math.abs(e.pct_change || 0);
      if (abs === 0) return;
      if (!map[e.pair] || abs > Math.abs(map[e.pair].pct_change)) {
        map[e.pair] = e;
      }
    });
    return Object.values(map)
      .sort((a, b) => Math.abs(b.pct_change || 0) - Math.abs(a.pct_change || 0))
      .slice(0, 16);
  }, [feed]);

  const heatmapEnriched = useMemo(() => {
    if (!stats?.heatmap) return [];
    const counts = {};
    feed.forEach((e) => {
      counts[e.pair] = (counts[e.pair] || 0) + 1;
    });
    return stats.heatmap.map((c) => ({
      ...c,
      event_count: counts[c.pair] || 1,
    }));
  }, [feed, stats]);

  // ═════════ HELPERS (formatting) ═════════

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
      return e.event_type === "flash_move" ? "Flash" : "Rapid";
    }
    return e.event_type || "—";
  };

  const eventTagClass = (e) => {
    const type = e.event_type?.toLowerCase() || "";
    if (type.includes("high break") || type.includes("strong rally") || type.includes("breakout"))
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/25";
    if (type.includes("low break") || type.includes("breakdown"))
      return "bg-red-500/15 text-red-300 border-red-500/25";
    if (type.includes("pullback") || type.includes("dip"))
      return "bg-amber-500/15 text-amber-300 border-amber-500/25";
    if (type === "flash_move")
      return "bg-red-500/15 text-red-300 border-red-500/25";
    if (type === "rapid_move")
      return "bg-amber-500/15 text-amber-300 border-amber-500/25";
    if (e.direction === "bullish")
      return "bg-emerald-500/10 text-emerald-300/80 border-emerald-500/15";
    return "bg-red-500/10 text-red-300/80 border-red-500/15";
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

  // ═════════ RENDER ═════════

  return (
    <div className="space-y-5 pb-10">
      <PulseStyles />

      {/* ═══ HEADER (compact, dense) ═══ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/[0.05] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-1 h-10 bg-gradient-to-b from-gold-primary to-gold-primary/30 rounded-full" />
          <div>
            <h1 className="text-2xl md:text-[28px] font-display font-bold text-white tracking-wide leading-none">
              Market Pulse
            </h1>
            <p className="text-text-muted text-[11px] mt-1.5 font-mono">
              <span className="text-white font-semibold">{stats?.hourly?.total_events || 0}</span> events ·{" "}
              <span className="text-gold-primary font-semibold">{stats?.hourly?.unique_coins || 0}</span> coins ·{" "}
              <span className="text-emerald-400">{stats?.daily?.bullish || 0}</span> bull /{" "}
              <span className="text-red-400">{stats?.daily?.bearish || 0}</span> bear (24h)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
          <span className="relative flex h-2 w-2">
            {loading && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                loading ? "bg-amber-500" : "bg-emerald-500"
              }`}
            />
          </span>
          <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">
            {loading
              ? "Syncing"
              : lastUpdated
              ? lastUpdated.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "Ready"}
          </span>
        </div>
      </div>

      {/* ═══ PULSE TAPE — dedup, real % ═══ */}
      {tapeItems.length > 0 && (
        <PulseTape items={tapeItems} onSelect={selectCoin} />
      )}

      {/* ═══ KPI CARDS — breathable, with sparklines ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Events (1h)"
          value={stats?.hourly?.total_events || 0}
          sub={`${stats?.hourly?.unique_coins || 0} unique coins`}
          accent="blue"
        />

        <KpiCardBullBear
          bull={bullBearRatio.bull}
          bear={bullBearRatio.bear}
          total={bullBearRatio.total}
        />

        <KpiCard
          label="Flash Moves (1h)"
          value={stats?.hourly?.flash_moves || 0}
          sub="Sudden spikes"
          accent="amber"
          highlight={(stats?.hourly?.flash_moves || 0) > 0}
        />

        <KpiCardBiggestMove
          biggest={stats?.hourly?.biggest_move}
          sparkline={stats?.hourly?.biggest_move?.pair && sparklines[stats.hourly.biggest_move.pair]}
          onSelect={selectCoin}
        />
      </div>

      {/* ═══ CONTROL BAR (search + chips + filters merged) ═══ */}
      <div className="bg-gradient-to-b from-[#180c10] to-[#0a0506] rounded-xl border border-white/[0.08] shadow-xl">
        <div className="p-4 flex flex-col gap-3">
          {/* Row 1: search + chips */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative w-full md:w-56 flex-shrink-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">⌕</span>
              <input
                type="text"
                placeholder="Search coin..."
                value={searchPair}
                onChange={(e) => {
                  setSearchPair(e.target.value);
                  setSelectedCoin(null);
                }}
                className="w-full pl-9 pr-3 py-2 bg-black/60 border border-white/10 rounded-lg text-white placeholder-gray-600 focus:border-gold-primary/50 focus:outline-none text-xs font-mono"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
              {activeCoins.map(([pair, count]) => {
                const symbol = stripQuote(pair);
                const isSelected = selectedCoin === pair;
                return (
                  <button
                    key={pair}
                    onClick={() => selectCoin(pair)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] transition-all border ${
                      isSelected
                        ? "bg-gold-primary text-[#0a0506] font-bold border-gold-primary"
                        : "bg-black/40 text-gray-400 border-white/10 hover:border-white/30 hover:text-white"
                    }`}
                  >
                    <CoinLogo pair={pair} size={14} />
                    <span className="font-semibold">{symbol}</span>
                    <span
                      className={`text-[9px] font-mono px-1 rounded ${
                        isSelected ? "bg-black/20" : "bg-white/10 text-gray-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 2: filter pills */}
          <div className="flex flex-wrap gap-1.5 items-center pt-3 border-t border-white/[0.04]">
            {[
              { value: "all", label: "All Sources" },
              { value: "pulse", label: "Pulse" },
              { value: "price_movement", label: "Price" },
            ].map((opt) => (
              <FilterPill
                key={opt.value}
                active={sourceFilter === opt.value}
                onClick={() => setSourceFilter(opt.value)}
                label={opt.label}
              />
            ))}

            <div className="w-px h-4 bg-white/10 mx-1" />

            {[
              { value: "all", label: "All TF" },
              { value: "5m", label: "5m" },
              { value: "1h", label: "1h" },
              { value: "2h", label: "2h" },
              { value: "4h", label: "4h" },
              { value: "1d", label: "1d" },
              { value: "1w", label: "1w" },
            ].map((opt) => (
              <FilterPill
                key={opt.value}
                active={timeframeFilter === opt.value}
                onClick={() => setTimeframeFilter(opt.value)}
                label={opt.label}
              />
            ))}

            <span className="ml-auto text-[9px] text-text-muted uppercase tracking-widest font-mono">
              24h rolling
            </span>
          </div>
        </div>

        {/* Coin Detail Banner — collapses below */}
        {coinDetail && selectedCoin && (
          <CoinDetailBanner
            pair={selectedCoin}
            coinDetail={coinDetail}
            sparkline={sparklines[selectedCoin]}
            timeAgo={timeAgo}
            onClose={() => setSelectedCoin(null)}
          />
        )}
      </div>

      {/* ═══ MAIN GRID ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT: ACTIVITY FEED — dense */}
        <div className="lg:col-span-8">
          <div className="bg-[#0a0506] rounded-xl border border-white/10 shadow-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between bg-black/30">
              <h2 className="text-[11px] font-bold text-gold-primary tracking-widest uppercase flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                Activity Feed
              </h2>
              <span className="text-[10px] text-text-muted font-mono">
                {filteredFeed.length} events
              </span>
            </div>

            <div className="divide-y divide-white/[0.04] max-h-[720px] overflow-y-auto pulse-feed-scroll">
              {filteredFeed.length === 0 && !loading && (
                <div className="p-12 text-center">
                  <div className="text-3xl mb-2 opacity-30">∅</div>
                  <div className="text-text-muted text-xs">No events match your filters</div>
                </div>
              )}
              {loading && feed.length === 0 && <FeedSkeleton />}
              {filteredFeed.map((event) => (
                <FeedRow
                  key={`${event.source}-${event.id}`}
                  event={event}
                  sparkline={sparklines[event.pair]}
                  isSelected={selectedCoin === event.pair}
                  onSelect={() => selectCoin(event.pair)}
                  eventTagClass={eventTagClass}
                  eventLabel={eventLabel}
                  timeAgo={timeAgo}
                />
              ))}
            </div>

            <div className="px-4 py-2 border-t border-white/[0.06] text-center bg-black/30">
              <span className="text-[9px] text-text-muted uppercase tracking-widest font-mono">
                Auto-refresh · 10s
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="lg:col-span-4 space-y-3">
          <HeatmapPanel
            heatmap={heatmapEnriched}
            selectedCoin={selectedCoin}
            onSelect={selectCoin}
          />

          <MostActivePanel
            movers={topMovers?.most_active}
            period={moverPeriod}
            setPeriod={setMoverPeriod}
            sparklines={sparklines}
            onSelect={selectCoin}
          />

          <FlashMovesPanel
            moves={topMovers?.flash_moves}
            onSelect={selectCoin}
          />

          <SummaryPanel daily={stats?.daily} />
        </div>
      </div>
    </div>
  );
};

export default MarketPulsePage;

// ════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════

// ── Pulse Tape (deduped) ──────────────────────────────
const PulseTape = ({ items, onSelect }) => {
  const tape = [...items, ...items];
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-gradient-to-r from-[#0a0506] via-[#180c10] to-[#0a0506]">
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#0a0506] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#0a0506] to-transparent z-10 pointer-events-none" />
      <div className="flex gap-6 py-2.5 animate-pulse-tape whitespace-nowrap">
        {tape.map((m, i) => {
          const symbol = stripQuote(m.pair);
          const pos = (m.pct_change || 0) >= 0;
          return (
            <button
              key={i}
              onClick={() => onSelect?.(m.pair)}
              className="flex items-center gap-1.5 flex-shrink-0 hover:opacity-80 transition-opacity px-1"
            >
              <CoinLogo pair={m.pair} size={16} />
              <span className="text-white text-[11px] font-bold">{symbol}</span>
              <span
                className={`text-[11px] font-mono font-bold ${
                  pos ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {pos ? "▲" : "▼"} {Math.abs(m.pct_change || 0).toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── KPI Card variants ──────────────────────────────────
const KpiCard = ({ label, value, sub, accent = "blue", highlight = false }) => {
  const accentMap = {
    blue: "bg-blue-500/5 hover:border-blue-500/30",
    amber: "bg-amber-500/5 hover:border-amber-500/30",
    purple: "bg-purple-500/5 hover:border-purple-500/30",
  };
  return (
    <div
      className={`bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-xl p-4 border border-white/5 shadow-md relative overflow-hidden group transition-colors ${accentMap[accent]}`}
    >
      <div
        className={`absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl ${accentMap[accent]
          .split(" ")[0]
          .replace("/5", "/10")} group-hover:opacity-60 transition-all`}
      />
      <p className="text-text-muted text-[9px] font-bold uppercase tracking-widest mb-1.5 relative z-10">
        {label}
      </p>
      <p
        className={`text-3xl font-display font-bold relative z-10 leading-none ${
          highlight ? "text-amber-400" : "text-white"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-text-muted text-[10px] mt-2 relative z-10">{sub}</p>}
    </div>
  );
};

const KpiCardBullBear = ({ bull, bear, total }) => {
  const bullPct = total > 0 ? (bull / total) * 100 : 50;
  const dominant = bull >= bear ? "bull" : "bear";
  return (
    <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-xl p-4 border border-white/5 shadow-md relative overflow-hidden group hover:border-emerald-500/30 transition-colors">
      <div className="absolute -top-8 -right-8 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl" />
      <p className="text-text-muted text-[9px] font-bold uppercase tracking-widest mb-1.5 relative z-10">
        Bull / Bear (1h)
      </p>
      <div className="flex items-baseline gap-1.5 relative z-10">
        <span className="text-emerald-400 text-2xl font-display font-bold leading-none">{bull}</span>
        <span className="text-text-muted/40 text-base">/</span>
        <span className="text-red-400 text-2xl font-display font-bold leading-none">{bear}</span>
      </div>
      {total > 0 && (
        <>
          <div className="relative h-1 rounded-full overflow-hidden mt-3 bg-white/5 z-10">
            <div
              className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${bullPct}%` }}
            />
            <div
              className="absolute top-0 bottom-0 right-0 bg-gradient-to-l from-red-500 to-red-400 transition-all duration-500"
              style={{ width: `${100 - bullPct}%` }}
            />
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/30" />
          </div>
          <p
            className={`text-[10px] mt-1.5 font-semibold relative z-10 ${
              dominant === "bull" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {dominant === "bull" ? "▲" : "▼"} {Math.abs(bull - bear)}{" "}
            {dominant === "bull" ? "bull dominance" : "bear pressure"}
          </p>
        </>
      )}
    </div>
  );
};

const KpiCardBiggestMove = ({ biggest, sparkline, onSelect }) => {
  if (!biggest?.pair) {
    return (
      <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-xl p-4 border border-white/5 shadow-md">
        <p className="text-text-muted text-[9px] font-bold uppercase tracking-widest mb-1.5">
          Biggest Move (1h)
        </p>
        <p className="text-white text-3xl font-display font-bold leading-none">—</p>
        <p className="text-text-muted text-[10px] mt-2">No data yet</p>
      </div>
    );
  }
  const symbol = stripQuote(biggest.pair);
  const pos = (biggest.pct_change || 0) >= 0;
  return (
    <button
      onClick={() => onSelect(biggest.pair)}
      className="text-left bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-xl p-4 border border-white/5 shadow-md relative overflow-hidden group hover:border-purple-500/30 transition-colors cursor-pointer"
    >
      <div className="absolute -top-8 -right-8 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl" />
      <p className="text-text-muted text-[9px] font-bold uppercase tracking-widest mb-1.5 relative z-10">
        Biggest Move (1h)
      </p>
      <div className="relative z-10 flex items-center gap-2 mb-1">
        <CoinLogo pair={biggest.pair} size={22} />
        <div className="min-w-0">
          <p className="text-white text-xs font-bold truncate leading-tight">{titleCase(symbol)}</p>
          <p className="text-text-muted text-[9px] font-mono leading-tight">{biggest.pair}</p>
        </div>
      </div>
      <div className="flex items-end justify-between mt-1.5 relative z-10">
        <p
          className={`text-2xl font-display font-bold leading-none ${
            pos ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {pos ? "+" : ""}
          {biggest.pct_change}%
        </p>
        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} color={pos ? "green" : "red"} width={70} height={24} />
        )}
      </div>
    </button>
  );
};

// ── Filter Pill ────────────────────────────────────────
const FilterPill = ({ active, onClick, label }) => (
  <button
    onClick={onClick}
    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all duration-200 border tracking-wider ${
      active
        ? "bg-gold-primary/15 text-gold-primary border-gold-primary/60 shadow-[0_0_8px_rgba(212,168,83,0.2)]"
        : "bg-black/40 text-gray-400 border-white/10 hover:border-white/30 hover:text-white"
    }`}
  >
    {label}
  </button>
);

// ── Coin Detail Banner ────────────────────────────────
const CoinDetailBanner = ({ pair, coinDetail, sparkline, timeAgo, onClose }) => {
  const symbol = stripQuote(pair);
  const stats = coinDetail.stats;
  const bullPct = stats.bull_pct;
  return (
    <div className="border-t border-gold-primary/20 bg-gradient-to-r from-gold-primary/[0.04] to-transparent p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <CoinLogo pair={pair} size={36} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-bold text-base">{titleCase(symbol)}</span>
              <span className="text-text-muted text-[10px] font-mono">{pair}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded border font-bold tracking-wider ${
                  bullPct >= 60
                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/25"
                    : bullPct <= 40
                    ? "bg-red-500/10 text-red-300 border-red-500/25"
                    : "bg-amber-500/10 text-amber-300 border-amber-500/25"
                }`}
              >
                {bullPct}% BULL
              </span>
            </div>
          </div>
        </div>
        {sparkline && sparkline.length > 1 && (
          <div className="hidden md:block">
            <Sparkline
              data={sparkline}
              color={bullPct >= 50 ? "green" : "red"}
              width={120}
              height={32}
            />
          </div>
        )}
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-white text-base transition-colors px-2"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DetailStat
          label="Strongest Up"
          value={`+${stats.strongest_up || 0}%`}
          accent={(stats.strongest_up || 0) >= 0 ? "green" : "red"}
        />
        <DetailStat
          label="Strongest Down"
          value={`${stats.strongest_down || 0}%`}
          accent="red"
        />
        <DetailStat label="Events 24h" value={stats.total_events} />
        <DetailStat label="Last Activity" value={timeAgo(stats.last_activity)} />
      </div>
    </div>
  );
};

const DetailStat = ({ label, value, accent }) => {
  const colorMap = {
    green: "text-emerald-400",
    red: "text-red-400",
  };
  return (
    <div className="bg-black/30 rounded-lg p-2.5 text-center border border-white/[0.04]">
      <p className={`text-base font-bold font-mono ${colorMap[accent] || "text-white"} leading-none`}>
        {value}
      </p>
      <p className="text-text-muted text-[9px] uppercase tracking-widest mt-1.5 font-mono">{label}</p>
    </div>
  );
};

// ── Feed Row — DENSE + SPARKLINE OPTIMAL ──────────────
const FeedRow = ({ event, sparkline, isSelected, onSelect, eventTagClass, eventLabel, timeAgo }) => {
  const symbol = stripQuote(event.pair);
  const isPositive = (event.pct_change || 0) >= 0;
  const magnitude = Math.min(Math.abs(event.pct_change || 0) / 10, 1);
  return (
    <div
      onClick={onSelect}
      className={`relative grid grid-cols-[28px_1fr_auto] md:grid-cols-[28px_minmax(0,1fr)_80px_auto_auto_44px] items-center gap-3 px-4 py-2.5 hover:bg-white/[0.025] transition-colors cursor-pointer ${
        isSelected ? "bg-gold-primary/[0.04] border-l-2 border-gold-primary" : "border-l-2 border-transparent"
      }`}
    >
      {/* Magnitude bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[2px]"
        style={{
          background: isPositive ? "#10b981" : "#ef4444",
          opacity: 0.2 + magnitude * 0.6,
        }}
      />

      <CoinLogo pair={event.pair} size={28} />

      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white font-semibold text-[13px] leading-none">{symbol}</span>
          <span
            className={`font-bold font-mono text-[13px] leading-none ${
              isPositive ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {isPositive ? "+" : ""}
            {event.pct_change}%
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase tracking-wider hidden sm:inline-block ${eventTagClass(
              event
            )}`}
          >
            {eventLabel(event)}
          </span>
        </div>
        <p className="text-text-muted text-[10px] mt-1 font-mono">
          {event.pair} ·{" "}
          {event.source === "price_movement"
            ? `${event.move_seconds}s move`
            : `${event.timeframe || "—"} TF`}
        </p>
      </div>

      {/* Sparkline (md+) — REAL price chart */}
      <div className="hidden md:flex items-center justify-end">
        {sparkline && sparkline.length > 1 ? (
          <Sparkline
            data={sparkline}
            color={sparkline[sparkline.length - 1] >= sparkline[0] ? "green" : "red"}
            width={70}
            height={22}
          />
        ) : (
          <SparklineSkeleton width={70} height={22} />
        )}
      </div>

      {/* Direction arrow (md+) */}
      <div
        className={`hidden md:flex w-6 h-6 rounded-full items-center justify-center text-[10px] font-bold flex-shrink-0 ${
          event.direction === "bullish"
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400"
        }`}
      >
        {event.direction === "bullish" ? "▲" : "▼"}
      </div>

      {/* (compact tag for mobile rendered above; lg+ here is overflow space) */}
      <span className="hidden lg:block" />

      {/* Time */}
      <span className="text-text-muted text-[10px] font-mono text-right flex-shrink-0">
        {timeAgo(event.created_at)}
      </span>
    </div>
  );
};

// ── Heatmap Panel ──────────────────────────────────────
const HeatmapPanel = ({ heatmap, selectedCoin, onSelect }) => (
  <div className="bg-[#0a0506] rounded-xl border border-white/10 p-3.5">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">
        Activity Heatmap
      </h3>
      <span className="text-[9px] text-text-muted font-mono">1h · top movers</span>
    </div>
    <div className="grid grid-cols-3 gap-1.5">
      {heatmap.map((coin) => {
        const symbol = stripQuote(coin.pair);
        const strongestMove =
          coin.max_up && (!coin.max_down || coin.max_up >= Math.abs(coin.max_down))
            ? coin.max_up
            : coin.max_down
            ? coin.max_down
            : 0;
        const isBull = strongestMove >= 0;
        const intensity = Math.min(Math.abs(strongestMove) / 10, 1);
        return (
          <button
            key={coin.pair}
            onClick={() => onSelect(coin.pair)}
            className={`relative rounded-lg p-2 transition-all hover:scale-[1.03] hover:z-10 cursor-pointer border overflow-hidden ${
              selectedCoin === coin.pair ? "border-gold-primary" : "border-transparent"
            }`}
            style={{
              backgroundColor: isBull
                ? `rgba(16, 185, 129, ${0.06 + intensity * 0.3})`
                : `rgba(239, 68, 68, ${0.06 + intensity * 0.3})`,
            }}
          >
            <div className="flex flex-col items-center gap-1">
              <CoinLogo pair={coin.pair} size={20} />
              <p
                className={`text-[10px] font-bold leading-tight truncate max-w-full ${
                  isBull ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {symbol}
              </p>
              <p
                className={`text-[9px] font-mono font-semibold leading-none ${
                  isBull ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {strongestMove >= 0 ? "+" : ""}
                {strongestMove.toFixed(1)}%
              </p>
            </div>
            {coin.event_count > 1 && (
              <span className="absolute top-0.5 right-0.5 text-[8px] font-mono text-white/70 bg-black/50 px-1 rounded leading-tight">
                {coin.event_count}
              </span>
            )}
          </button>
        );
      })}
      {heatmap.length === 0 && (
        <div className="col-span-3 text-center py-4 text-text-muted text-xs">
          No activity yet
        </div>
      )}
    </div>
  </div>
);

// ── Most Active Panel ──────────────────────────────────
const MostActivePanel = ({ movers, period, setPeriod, sparklines, onSelect }) => (
  <div className="bg-[#0a0506] rounded-xl border border-white/10 p-3.5">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">
        Most Active
      </h3>
      <div className="flex gap-0.5 bg-black/40 rounded-md p-0.5">
        {["1h", "4h", "24h"].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors ${
              period === p
                ? "bg-gold-primary/20 text-gold-primary"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
    <div className="space-y-0.5">
      {(movers || []).slice(0, 6).map((coin, i) => {
        const symbol = stripQuote(coin.pair);
        const strongIsUp = (coin.best || 0) >= Math.abs(coin.worst || 0);
        const sl = sparklines[coin.pair];
        return (
          <button
            key={coin.pair}
            onClick={() => onSelect(coin.pair)}
            className="w-full grid grid-cols-[12px_22px_minmax(0,1fr)_auto] items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors text-left"
          >
            <span className="text-[9px] text-text-muted/60 text-center font-mono">{i + 1}</span>
            <CoinLogo pair={coin.pair} size={20} />
            <div className="min-w-0">
              <p className="text-white text-[11px] font-semibold truncate leading-tight">
                {symbol}
              </p>
              <div className="flex items-center gap-1 text-[9px] text-text-muted leading-tight mt-0.5 font-mono">
                <span>{coin.event_count} ev</span>
                {sl && sl.length > 1 && (
                  <>
                    <span>·</span>
                    <Sparkline
                      data={sl}
                      color={sl[sl.length - 1] >= sl[0] ? "green" : "red"}
                      width={36}
                      height={10}
                    />
                  </>
                )}
              </div>
            </div>
            <span
              className={`text-[11px] font-bold font-mono text-right ${
                strongIsUp ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {strongIsUp ? `+${coin.best}%` : `${coin.worst}%`}
            </span>
          </button>
        );
      })}
      {(!movers || movers.length === 0) && (
        <p className="text-text-muted text-xs text-center py-3">No active coins yet</p>
      )}
    </div>
  </div>
);

// ── Flash Moves Panel ──────────────────────────────────
const FlashMovesPanel = ({ moves, onSelect }) => (
  <div className="bg-[#0a0506] rounded-xl border border-white/10 p-3.5">
    <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5">
      <span className="text-amber-400">⚡</span> Flash Moves
    </h3>
    <div className="space-y-0.5">
      {(moves || []).slice(0, 5).map((fm, i) => {
        const symbol = stripQuote(fm.pair);
        const opacity = Math.max(1 - (i / Math.max((moves || []).length, 1)) * 0.5, 0.5);
        return (
          <button
            key={i}
            onClick={() => onSelect(fm.pair)}
            className="w-full grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors text-left"
            style={{ opacity }}
          >
            <CoinLogo pair={fm.pair} size={16} />
            <span className="text-white text-[11px] font-semibold truncate">{symbol}</span>
            <span
              className={`text-[11px] font-bold font-mono ${
                fm.pct_change >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {fm.pct_change >= 0 ? "+" : ""}
              {fm.pct_change}%
            </span>
            <span className="text-text-muted text-[9px] font-mono w-7 text-right">
              {fm.move_seconds}s
            </span>
          </button>
        );
      })}
      {(!moves || moves.length === 0) && (
        <p className="text-text-muted text-xs text-center py-3">No flash moves yet</p>
      )}
    </div>
  </div>
);

// ── 24h Summary Panel ──────────────────────────────────
const SummaryPanel = ({ daily }) => (
  <div className="bg-[#0a0506] rounded-xl border border-white/10 p-3.5">
    <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-3">
      24h Summary
    </h3>
    <div className="space-y-1.5 text-[11px]">
      {[
        { label: "Total Events", value: daily?.total_events || 0 },
        { label: "Unique Coins", value: daily?.unique_coins || 0 },
        { label: "Bullish", value: daily?.bullish || 0, cls: "text-emerald-400" },
        { label: "Bearish", value: daily?.bearish || 0, cls: "text-red-400" },
        { label: "Flash Moves", value: daily?.flash_moves || 0, cls: "text-amber-400" },
      ].map((row) => (
        <div key={row.label} className="flex justify-between items-center">
          <span className="text-text-muted">{row.label}</span>
          <span className={`font-bold font-mono ${row.cls || "text-white"}`}>
            {(row.value || 0).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  </div>
);

// ── Sparkline (real-data, smooth) ──────────────────────
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
  const fillPath = `${linePath} L ${(width - pad).toFixed(1)} ${height} L ${pad.toFixed(1)} ${height} Z`;
  const colorMap = {
    green: { stroke: "#34d399", fill: "rgba(52, 211, 153, 0.15)" },
    red: { stroke: "#f87171", fill: "rgba(248, 113, 113, 0.15)" },
  };
  const c = colorMap[color] || colorMap.green;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={fillPath} fill={c.fill} />
      <path
        d={linePath}
        stroke={c.stroke}
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End-point dot */}
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r="1.8"
        fill={c.stroke}
      />
    </svg>
  );
};

const SparklineSkeleton = ({ width, height }) => (
  <div
    className="rounded animate-pulse bg-white/[0.04]"
    style={{ width, height }}
  />
);

// ── Feed Skeleton ──────────────────────────────────────
const FeedSkeleton = () => (
  <div className="space-y-0">
    {[...Array(8)].map((_, i) => (
      <div
        key={i}
        className="px-4 py-2.5 flex items-center gap-3 border-b border-white/[0.03] animate-pulse"
        style={{ opacity: 1 - i * 0.1 }}
      >
        <div className="w-7 h-7 rounded-full bg-white/[0.04]" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 bg-white/[0.04] rounded w-1/3" />
          <div className="h-2 bg-white/[0.03] rounded w-1/2" />
        </div>
        <div className="w-16 h-5 bg-white/[0.04] rounded" />
      </div>
    ))}
  </div>
);

// ── Scoped CSS ─────────────────────────────────────────
const PulseStyles = () => (
  <style>{`
    @keyframes pulse-tape-scroll {
      0% { transform: translateX(0); }
      100% { transform: translateX(-50%); }
    }
    .animate-pulse-tape {
      animation: pulse-tape-scroll 50s linear infinite;
    }
    .animate-pulse-tape:hover {
      animation-play-state: paused;
    }
    .pulse-feed-scroll::-webkit-scrollbar { width: 5px; }
    .pulse-feed-scroll::-webkit-scrollbar-track { background: transparent; }
    .pulse-feed-scroll::-webkit-scrollbar-thumb { background: rgba(212, 168, 83, 0.15); border-radius: 3px; }
    .pulse-feed-scroll::-webkit-scrollbar-thumb:hover { background: rgba(212, 168, 83, 0.3); }
  `}</style>
);
