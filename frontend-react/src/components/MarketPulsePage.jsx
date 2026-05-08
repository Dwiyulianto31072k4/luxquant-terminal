import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
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

const formatPrice = (p) => {
  if (!p || p <= 0) return "0.00";
  if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(6);
  return p.toFixed(8);
};

const formatVolume = (v) => {
  if (!v || v <= 0) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return v.toFixed(2);
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
  const [expandedGroups, setExpandedGroups] = useState({});

  // === NEW: Heatmap sort mode + Chart Modal ===
  const [heatmapSortMode, setHeatmapSortMode] = useState("events"); // "events" | "pct"
  const [chartModalPair, setChartModalPair] = useState(null);

  // ═════════ FETCH ═════════

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

  // Group consecutive same-pair events into clusters
  const groupedFeed = useMemo(() => {
    const groups = [];
    let current = null;
    filteredFeed.forEach((e) => {
      if (current && current.pair === e.pair) {
        current.events.push(e);
      } else {
        current = { pair: e.pair, events: [e] };
        groups.push(current);
      }
    });
    return groups;
  }, [filteredFeed]);

  const activeCoins = useMemo(() => {
    const map = {};
    feed.forEach((e) => {
      if (!map[e.pair]) map[e.pair] = 0;
      map[e.pair]++;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [feed]);

  const bullBearRatio = useMemo(() => {
    if (!stats?.hourly) return { bull: 0, bear: 0, total: 0, bullPct: 50 };
    const bull = stats.hourly.bullish || 0;
    const bear = stats.hourly.bearish || 0;
    const total = bull + bear;
    return { bull, bear, total, bullPct: total > 0 ? (bull / total) * 100 : 50 };
  }, [stats]);

  // Pulse Tape — dedup by pair
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

  // Per-coin event histogram (for sparkbar)
  const coinHistograms = useMemo(() => {
    const map = {};
    feed.forEach((e) => {
      if (!map[e.pair]) map[e.pair] = [];
      map[e.pair].push({
        pct: e.pct_change || 0,
        bull: e.direction === "bullish",
      });
    });
    Object.keys(map).forEach((k) => {
      map[k] = map[k].slice(0, 10).reverse();
    });
    return map;
  }, [feed]);

  // Events distribution per ~6min slot (hero card visual)
  const eventsHistogram = useMemo(() => {
    const buckets = Array(10).fill(null).map(() => ({ bull: 0, bear: 0 }));
    const now = Date.now();
    const span = 60 * 60 * 1000;
    feed.forEach((e) => {
      if (!e.created_at) return;
      const t = new Date(e.created_at).getTime();
      const age = now - t;
      if (age < 0 || age > span) return;
      const idx = Math.min(9, Math.floor((span - age) / (span / 10)));
      if (e.direction === "bullish") buckets[idx].bull++;
      else buckets[idx].bear++;
    });
    return buckets;
  }, [feed]);

  // === NEW: Heatmap enriched — supports up to 20 coins + sort by events/% ===
  const heatmapEnriched = useMemo(() => {
    if (!stats?.heatmap) return [];
    const counts = {};
    feed.forEach((e) => {
      counts[e.pair] = (counts[e.pair] || 0) + 1;
    });
    const items = stats.heatmap.slice(0, 20).map((c) => ({
      ...c,
      event_count: counts[c.pair] || c.event_count || 1,
    }));

    if (heatmapSortMode === "pct") {
      items.sort((a, b) => {
        const aPct = Math.max(Math.abs(a.max_up || 0), Math.abs(a.max_down || 0));
        const bPct = Math.max(Math.abs(b.max_up || 0), Math.abs(b.max_down || 0));
        return bPct - aPct;
      });
    } else {
      items.sort((a, b) => (b.event_count || 0) - (a.event_count || 0));
    }
    return items;
  }, [feed, stats, heatmapSortMode]);

  // ═════════ HELPERS ═════════

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
      return "bg-emerald-500/12 text-emerald-300 border-emerald-500/25";
    if (type.includes("low break") || type.includes("breakdown"))
      return "bg-red-500/12 text-red-300 border-red-500/25";
    if (type.includes("pullback") || type.includes("dip"))
      return "bg-amber-500/12 text-amber-300 border-amber-500/25";
    if (type === "flash_move")
      return "bg-red-500/12 text-red-300 border-red-500/25";
    if (type === "rapid_move")
      return "bg-amber-500/12 text-amber-300 border-amber-500/25";
    if (e.direction === "bullish")
      return "bg-emerald-500/8 text-emerald-300/80 border-emerald-500/15";
    return "bg-red-500/8 text-red-300/80 border-red-500/15";
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

  const toggleGroup = (pair, e) => {
    e.stopPropagation();
    setExpandedGroups((prev) => ({ ...prev, [pair]: !prev[pair] }));
  };

  // === NEW: open chart modal ===
  const openChartModal = (pair) => {
    setChartModalPair(pair);
  };

  // Flash moves (top 5) — derived from feed for hero card
  const flashMovesPreview = useMemo(() => {
    return (topMovers?.flash_moves || []).slice(0, 2);
  }, [topMovers]);

  // ═════════ RENDER ═════════

  return (
    <div className="space-y-4 pb-10">
      <PulseStyles />

      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/[0.05] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-[3px] h-10 bg-gradient-to-b from-gold-primary to-gold-primary/30 rounded-sm" />
          <div>
            <h1 className="text-2xl md:text-[26px] font-display font-bold text-white tracking-wide leading-none">
              Market Pulse
            </h1>
            <p className="text-text-muted text-[11px] mt-2 font-mono">
              <span className="text-white font-semibold">{stats?.hourly?.total_events || 0}</span> events ·{" "}
              <span className="text-gold-primary font-semibold">{stats?.hourly?.unique_coins || 0}</span> coins ·{" "}
              <span className="text-emerald-400 font-semibold">{(stats?.daily?.bullish || 0).toLocaleString()}</span> bull /{" "}
              <span className="text-red-400 font-semibold">{(stats?.daily?.bearish || 0).toLocaleString()}</span> bear · 24h
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-black/40 px-3 py-2 rounded-lg border border-white/5">
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
          <span className="text-[10px] font-mono text-text-muted/80 uppercase tracking-wider">
            {loading
              ? "Syncing"
              : lastUpdated
              ? lastUpdated.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                })
              : "Ready"}
          </span>
        </div>
      </div>

      {/* ═══ PULSE TAPE ═══ */}
      {tapeItems.length > 0 && <PulseTape items={tapeItems} onSelect={openChartModal} />}

      {/* ═══ KPI CARDS — with mini visuals ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiEvents
          total={stats?.hourly?.total_events || 0}
          uniqueCoins={stats?.hourly?.unique_coins || 0}
          histogram={eventsHistogram}
        />
        <KpiBullBear ratio={bullBearRatio} />
        <KpiFlash
          count={stats?.hourly?.flash_moves || 0}
          previews={flashMovesPreview}
          onSelect={openChartModal}
        />
        <KpiBiggestMove
          biggest={stats?.hourly?.biggest_move}
          onSelect={openChartModal}
        />
      </div>

      {/* ═══ CONTROL BAR ═══ */}
      <div className="bg-gradient-to-b from-[#180c10] to-[#0a0506] rounded-xl border border-white/[0.08] shadow-xl">
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative w-full md:w-52 flex-shrink-0">
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

          <div className="flex flex-wrap gap-1.5 items-center pt-3 border-t border-white/[0.04]">
            <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted/60 mr-1">
              Source
            </span>
            {[
              { value: "all", label: "All" },
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

            <div className="w-px h-3.5 bg-white/10 mx-2" />

            <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted/60 mr-1">
              TF
            </span>
            {[
              { value: "all", label: "All" },
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

            <span className="ml-auto text-[9px] text-text-muted/50 uppercase tracking-widest font-mono">
              24h rolling
            </span>
          </div>
        </div>

        {coinDetail && selectedCoin && (
          <CoinDetailBanner
            pair={selectedCoin}
            coinDetail={coinDetail}
            histogram={coinHistograms[selectedCoin]}
            timeAgo={timeAgo}
            onClose={() => setSelectedCoin(null)}
            onOpenChart={openChartModal}
          />
        )}
      </div>

      {/* ═══ MAIN GRID — equal height columns ═══ */}
      <div className="mp-main-grid">
        {/* LEFT: Activity Feed */}
        <div className="mp-feed-col">
          <div className="bg-[#0a0506] rounded-xl border border-white/10 shadow-2xl mp-feed-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between bg-black/30 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                <h2 className="text-[11px] font-bold text-gold-primary tracking-widest uppercase">
                  Activity Feed
                </h2>
              </div>
              <span className="text-[10px] text-text-muted/60 font-mono">
                {filteredFeed.length} events
              </span>
            </div>

            <div className="mp-feed-list pulse-feed-scroll">
              {filteredFeed.length === 0 && !loading && (
                <div className="p-12 text-center">
                  <div className="text-3xl mb-2 opacity-30">∅</div>
                  <div className="text-text-muted text-xs">No events match your filters</div>
                </div>
              )}
              {loading && feed.length === 0 && <FeedSkeleton />}

              {groupedFeed.map((group, gi) => {
                if (group.events.length === 1) {
                  const event = group.events[0];
                  return (
                    <FeedRow
                      key={`single-${event.source}-${event.id}`}
                      event={event}
                      histogram={coinHistograms[event.pair]}
                      isSelected={selectedCoin === event.pair}
                      onSelect={() => openChartModal(event.pair)}
                      eventTagClass={eventTagClass}
                      eventLabel={eventLabel}
                      timeAgo={timeAgo}
                    />
                  );
                }

                // Group of multiple consecutive same-coin events
                const isExpanded = expandedGroups[`${gi}-${group.pair}`] !== false;
                const avgPct =
                  group.events.reduce((s, e) => s + (e.pct_change || 0), 0) / group.events.length;
                return (
                  <div key={`group-${gi}-${group.pair}`}>
                    <FeedGroupHeader
                      group={group}
                      avgPct={avgPct}
                      expanded={isExpanded}
                      onToggle={(e) => toggleGroup(`${gi}-${group.pair}`, e)}
                      isSelected={selectedCoin === group.pair}
                      onSelectCoin={() => openChartModal(group.pair)}
                    />
                    {isExpanded &&
                      group.events.map((event, ei) => (
                        <FeedSubRow
                          key={`sub-${event.source}-${event.id}`}
                          event={event}
                          eventTagClass={eventTagClass}
                          eventLabel={eventLabel}
                          timeAgo={timeAgo}
                          onSelect={() => openChartModal(event.pair)}
                        />
                      ))}
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-2 border-t border-white/[0.06] text-center bg-black/30 flex-shrink-0">
              <span className="text-[9px] text-text-muted/40 uppercase tracking-widest font-mono">
                Auto-refresh · 10s
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT: Sidebar — equal height */}
        <div className="mp-sidebar-col">
          <HeatmapPanel
            heatmap={heatmapEnriched}
            selectedCoin={selectedCoin}
            onSelect={openChartModal}
            sortMode={heatmapSortMode}
            onSortChange={setHeatmapSortMode}
          />

          <MostActivePanel
            movers={topMovers?.most_active}
            period={moverPeriod}
            setPeriod={setMoverPeriod}
            histograms={coinHistograms}
            onSelect={openChartModal}
          />

          <FlashMovesPanel
            moves={topMovers?.flash_moves}
            onSelect={openChartModal}
          />

          {/* Last panel stretches to fill */}
          <SummaryPanel daily={stats?.daily} className="mp-sidebar-stretch" />
        </div>
      </div>

      {/* ═══ COIN CHART MODAL ═══ */}
      {chartModalPair && (
        <CoinChartModal
          pair={chartModalPair}
          onClose={() => setChartModalPair(null)}
        />
      )}
    </div>
  );
};

export default MarketPulsePage;

// ════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════════════════

// ── Pulse Tape ───────────────────────────────────────────
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

// ── KPI: Events with histogram ──────────────────────────
const KpiEvents = ({ total, uniqueCoins, histogram }) => {
  const max = Math.max(1, ...histogram.map((b) => b.bull + b.bear));
  return (
    <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-xl p-4 border border-white/5 hover:border-blue-500/30 transition-colors relative overflow-hidden">
      <div className="absolute -top-8 -right-8 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl" />
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
            Events 1h
          </span>
          <span className="text-[10px] font-mono text-text-muted/50">live</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[28px] font-display font-bold text-white leading-none">{total}</span>
          <span className="text-[11px] font-mono text-text-muted/70">/ {uniqueCoins} coins</span>
        </div>
        <div className="mt-3 flex items-end gap-[2px] h-3.5">
          {histogram.map((b, i) => {
            const tot = b.bull + b.bear;
            const pct = (tot / max) * 100;
            const bullRatio = tot > 0 ? b.bull / tot : 0;
            return (
              <div key={i} className="flex-1 flex flex-col-reverse" style={{ height: `${pct}%` }}>
                {b.bull > 0 && (
                  <div
                    className="bg-emerald-500/85 rounded-[1px]"
                    style={{ height: `${bullRatio * 100}%` }}
                  />
                )}
                {b.bear > 0 && (
                  <div
                    className="bg-red-500/85 rounded-[1px]"
                    style={{ height: `${(1 - bullRatio) * 100}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── KPI: Bull/Bear ──────────────────────────────────────
const KpiBullBear = ({ ratio }) => {
  const dom = ratio.bull >= ratio.bear ? "bull" : "bear";
  return (
    <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-xl p-4 border border-white/5 hover:border-emerald-500/30 transition-colors relative overflow-hidden">
      <div className="absolute -top-8 -right-8 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl" />
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
            Bull / Bear 1h
          </span>
          {ratio.total > 0 && (
            <span
              className={`text-[10px] font-mono font-semibold ${
                dom === "bull" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {dom === "bull" ? "▲" : "▼"} {Math.abs(ratio.bull - ratio.bear)} dom
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[24px] font-display font-bold text-emerald-400 leading-none">
            {ratio.bull}
          </span>
          <span className="text-base text-text-muted/40">/</span>
          <span className="text-[24px] font-display font-bold text-red-400 leading-none">
            {ratio.bear}
          </span>
        </div>
        {ratio.total > 0 && (
          <>
            <div className="mt-3 h-1 rounded-full overflow-hidden bg-white/5 flex">
              <div
                className="bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                style={{ width: `${ratio.bullPct}%` }}
              />
              <div
                className="bg-gradient-to-l from-red-500 to-red-400 transition-all duration-500"
                style={{ width: `${100 - ratio.bullPct}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between">
              <span className="text-[10px] font-mono text-emerald-400">
                {Math.round(ratio.bullPct)}%
              </span>
              <span className="text-[10px] font-mono text-red-400">
                {Math.round(100 - ratio.bullPct)}%
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── KPI: Flash Moves ────────────────────────────────────
const KpiFlash = ({ count, previews, onSelect }) => (
  <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-xl p-4 border border-white/5 hover:border-amber-500/30 transition-colors relative overflow-hidden">
    <div className="absolute -top-8 -right-8 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl" />
    <div className="relative z-10">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
          Flash Moves 1h
        </span>
        {count > 0 && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className={`text-[28px] font-display font-bold leading-none ${
            count > 0 ? "text-amber-400" : "text-white"
          }`}
        >
          {count}
        </span>
        <span className="text-[11px] font-mono text-text-muted/70">spikes</span>
      </div>
      <div className="mt-3 space-y-1">
        {previews.length > 0 ? (
          previews.map((p, i) => {
            const symbol = stripQuote(p.pair);
            const pct = Math.min(Math.abs(p.pct_change || 0) / 10, 1);
            return (
              <button
                key={i}
                onClick={() => onSelect(p.pair)}
                className="w-full flex items-center gap-1.5 group"
              >
                <span className="text-[9px] font-mono text-text-muted/60 w-9 truncate text-left group-hover:text-white transition-colors">
                  {symbol}
                </span>
                <div className="flex-1 h-1 bg-amber-500/15 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full"
                    style={{ width: `${pct * 100}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-amber-400">{p.move_seconds}s</span>
              </button>
            );
          })
        ) : (
          <p className="text-text-muted/40 text-[10px] mt-2">No flash moves yet</p>
        )}
      </div>
    </div>
  </div>
);

// ── KPI: Biggest Move ───────────────────────────────────
const KpiBiggestMove = ({ biggest, onSelect }) => {
  if (!biggest?.pair) {
    return (
      <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-xl p-4 border border-white/5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
          Biggest Move 1h
        </span>
        <p className="text-white text-[28px] font-display font-bold mt-2 leading-none">—</p>
        <p className="text-text-muted/40 text-[10px] mt-2">No data yet</p>
      </div>
    );
  }
  const symbol = stripQuote(biggest.pair);
  const pos = (biggest.pct_change || 0) >= 0;
  return (
    <button
      onClick={() => onSelect(biggest.pair)}
      className="text-left bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-xl p-4 border border-white/5 hover:border-purple-500/30 transition-colors cursor-pointer relative overflow-hidden"
    >
      <div className="absolute -top-8 -right-8 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl" />
      <div className="relative z-10">
        <div className="flex justify-between items-start mb-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
            Biggest Move 1h
          </span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <CoinLogo pair={biggest.pair} size={22} />
          <div className="min-w-0">
            <p className="text-white text-xs font-bold truncate leading-tight">
              {titleCase(symbol)}
            </p>
            <p className="text-text-muted/60 text-[9px] font-mono leading-tight mt-0.5">
              {biggest.pair}
            </p>
          </div>
        </div>
        <p
          className={`text-[24px] font-display font-bold leading-none ${
            pos ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {pos ? "+" : ""}
          {biggest.pct_change}%
        </p>
      </div>
    </button>
  );
};

// ── Filter Pill ─────────────────────────────────────────
const FilterPill = ({ active, onClick, label }) => (
  <button
    onClick={onClick}
    className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all border tracking-wider ${
      active
        ? "bg-gold-primary/15 text-gold-primary border-gold-primary/60 shadow-[0_0_8px_rgba(212,168,83,0.2)]"
        : "bg-black/40 text-gray-400 border-white/10 hover:border-white/30 hover:text-white"
    }`}
  >
    {label}
  </button>
);

// ── Coin Detail Banner ──────────────────────────────────
const CoinDetailBanner = ({ pair, coinDetail, histogram, timeAgo, onClose, onOpenChart }) => {
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
              <span className="text-text-muted/60 text-[10px] font-mono">{pair}</span>
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
        {histogram && histogram.length >= 1 && (
          <div className="hidden md:flex items-end gap-[2px] h-8">
            {histogram.map((h, i) => {
              const mag = Math.min(Math.abs(h.pct) / 10, 1);
              return (
                <div
                  key={i}
                  className={`w-1.5 rounded-[1px] ${h.bull ? "bg-emerald-500" : "bg-red-500"} opacity-80`}
                  style={{ height: `${10 + mag * 90}%` }}
                />
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-2">
          {onOpenChart && (
            <button
              onClick={() => onOpenChart(pair)}
              className="text-[10px] px-2.5 py-1 rounded border border-gold-primary/40 text-gold-primary hover:bg-gold-primary/10 transition-colors font-bold tracking-wider"
            >
              📊 CHART
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white text-base px-2 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <DetailStat
          label="Strongest Up"
          value={`+${stats.strongest_up || 0}%`}
          accent="green"
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
  const colorMap = { green: "text-emerald-400", red: "text-red-400" };
  return (
    <div className="bg-black/30 rounded-lg p-2.5 text-center border border-white/[0.04]">
      <p
        className={`text-base font-bold font-mono ${
          colorMap[accent] || "text-white"
        } leading-none`}
      >
        {value}
      </p>
      <p className="text-text-muted/60 text-[9px] uppercase tracking-widest mt-1.5 font-mono">
        {label}
      </p>
    </div>
  );
};

// ── Mini sparkbar (event histogram fallback) ────────────
const MiniSparkbar = ({ histogram, height = 18, gap = 1.5 }) => {
  if (!histogram || histogram.length === 0) return null;

  // Single event: render compact dot indicator
  if (histogram.length === 1) {
    const h = histogram[0];
    return (
      <div className="flex items-center justify-end" style={{ height }}>
        <div
          className={`rounded-full ${h.bull ? "bg-emerald-500" : "bg-red-500"} opacity-80`}
          style={{
            width: Math.max(4, height * 0.4),
            height: Math.max(4, height * 0.4),
          }}
        />
      </div>
    );
  }

  const max = Math.max(0.01, ...histogram.map((h) => Math.abs(h.pct)));
  return (
    <div className="flex items-end" style={{ height, gap: `${gap}px` }}>
      {histogram.map((h, i) => {
        const mag = Math.abs(h.pct) / max;
        return (
          <div
            key={i}
            className={`w-[3px] rounded-[1px] ${h.bull ? "bg-emerald-500" : "bg-red-500"} opacity-80`}
            style={{ height: `${10 + mag * 90}%` }}
          />
        );
      })}
    </div>
  );
};

// ── Feed Row (single event) ─────────────────────────────
const FeedRow = ({
  event,
  histogram,
  isSelected,
  onSelect,
  eventTagClass,
  eventLabel,
  timeAgo,
}) => {
  const symbol = stripQuote(event.pair);
  const isPositive = (event.pct_change || 0) >= 0;
  const magnitude = Math.min(Math.abs(event.pct_change || 0) / 10, 1);
  return (
    <div
      onClick={onSelect}
      className={`relative grid grid-cols-[26px_minmax(0,1fr)_auto] md:grid-cols-[26px_minmax(0,1fr)_70px_22px_44px] items-center gap-3 px-4 py-2.5 hover:bg-white/[0.025] transition-colors cursor-pointer border-l-2 ${
        isSelected ? "bg-gold-primary/[0.04] border-gold-primary" : "border-transparent"
      }`}
      style={{
        borderLeftColor: !isSelected
          ? isPositive
            ? `rgba(16,185,129,${0.2 + magnitude * 0.4})`
            : `rgba(239,68,68,${0.2 + magnitude * 0.4})`
          : undefined,
      }}
    >
      <CoinLogo pair={event.pair} size={26} />

      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white font-semibold text-[12.5px] leading-none">{symbol}</span>
          <span
            className={`font-bold font-mono text-[12.5px] leading-none ${
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
        <p className="text-text-muted/60 text-[10px] mt-1 font-mono">
          {event.pair} ·{" "}
          {event.source === "price_movement"
            ? `${event.move_seconds}s move`
            : `${event.timeframe || "—"} TF`}
        </p>
      </div>

      <div className="hidden md:flex items-center justify-end opacity-80">
        {histogram && histogram.length >= 1 ? (
          <MiniSparkbar histogram={histogram} height={18} />
        ) : (
          <div style={{ width: 60, height: 18 }} />
        )}
      </div>

      <div
        className={`hidden md:flex w-[22px] h-[22px] rounded-full items-center justify-center text-[10px] font-bold ${
          event.direction === "bullish"
            ? "bg-emerald-500/12 text-emerald-400"
            : "bg-red-500/12 text-red-400"
        }`}
      >
        {event.direction === "bullish" ? "▲" : "▼"}
      </div>

      <span className="text-text-muted/60 text-[10px] font-mono text-right">
        {timeAgo(event.created_at)}
      </span>
    </div>
  );
};

// ── Feed Group Header (multiple consecutive events) ─────
const FeedGroupHeader = ({ group, avgPct, expanded, onToggle, isSelected, onSelectCoin }) => {
  const symbol = stripQuote(group.pair);
  const isPos = avgPct >= 0;
  // Histogram from group itself
  const groupHist = group.events
    .map((e) => ({ pct: e.pct_change || 0, bull: e.direction === "bullish" }))
    .reverse();
  return (
    <div
      onClick={onSelectCoin}
      className={`px-4 py-2 border-b border-white/[0.04] flex items-center gap-2.5 cursor-pointer transition-colors hover:bg-white/[0.02] ${
        isSelected ? "bg-gold-primary/[0.04]" : "bg-gold-primary/[0.015]"
      }`}
    >
      <CoinLogo pair={group.pair} size={26} />
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span className="text-white text-[12.5px] font-semibold">{symbol}</span>
        <span className="text-[9px] text-text-muted/50 px-1.5 py-0.5 bg-white/[0.04] rounded font-mono">
          ×{group.events.length} events
        </span>
      </div>
      <MiniSparkbar histogram={groupHist} height={16} gap={2} />
      <span
        className={`text-[11px] font-mono font-bold min-w-[60px] text-right ${
          isPos ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isPos ? "+" : ""}
        {avgPct.toFixed(2)}% avg
      </span>
      <button
        onClick={onToggle}
        className="w-[22px] h-[22px] rounded-md border border-white/[0.08] text-text-muted/60 text-[10px] hover:text-white hover:border-white/20 transition-colors flex items-center justify-center"
      >
        {expanded ? "▲" : "▼"}
      </button>
    </div>
  );
};

// ── Feed Sub Row (inside group) ─────────────────────────
const FeedSubRow = ({ event, eventTagClass, eventLabel, timeAgo, onSelect }) => {
  const isPos = (event.pct_change || 0) >= 0;
  return (
    <div
      onClick={onSelect}
      className="grid grid-cols-[12px_minmax(0,1fr)_22px_44px] items-center gap-3 px-4 py-2 pl-14 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer border-l-2"
      style={{ borderLeftColor: "rgba(212,168,83,0.4)" }}
    >
      <span className="text-text-muted/35 text-[9px] font-mono">→</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-text-muted/80 text-[12px]">{event.event_type || "—"}</span>
          <span
            className={`font-bold font-mono text-[12px] ${
              isPos ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {isPos ? "+" : ""}
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
        <p className="text-text-muted/50 text-[10px] mt-0.5 font-mono">
          {event.pair} ·{" "}
          {event.source === "price_movement"
            ? `${event.move_seconds}s move`
            : `${event.timeframe || "—"} TF`}
        </p>
      </div>
      <div
        className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] ${
          event.direction === "bullish"
            ? "bg-emerald-500/12 text-emerald-400"
            : "bg-red-500/12 text-red-400"
        }`}
      >
        {event.direction === "bullish" ? "▲" : "▼"}
      </div>
      <span className="text-text-muted/50 text-[10px] font-mono text-right">
        {timeAgo(event.created_at)}
      </span>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// ★ NEW HEATMAP — uniform grid, NO overlap, toggle Events / % Change
// ════════════════════════════════════════════════════════

const HeatmapPanel = ({ heatmap, selectedCoin, onSelect, sortMode, onSortChange }) => {
  const tiles = useMemo(() => {
    if (!heatmap || heatmap.length === 0) return [];
    return heatmap.slice(0, 16).map((coin) => {
      const upAbs = Math.abs(coin.max_up || 0);
      const downAbs = Math.abs(coin.max_down || 0);
      const strongest = upAbs >= downAbs ? coin.max_up || 0 : coin.max_down || 0;
      return {
        pair: coin.pair,
        symbol: stripQuote(coin.pair),
        eventCount: Math.max(1, coin.event_count || 1),
        pct: strongest,
        isBull: strongest >= 0,
      };
    });
  }, [heatmap]);

  // Intensity scaling depends on sort mode — gives clearer visual meaning
  const maxEvents = useMemo(
    () => Math.max(1, ...tiles.map((t) => t.eventCount)),
    [tiles]
  );

  return (
    <div className="bg-[#0a0506] rounded-xl border border-white/10 p-3">
      {/* Header with sort toggle */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">
            Heatmap · 1h
          </h3>
          <span className="text-[9px] text-text-muted/50 font-mono">
            Top {tiles.length}
          </span>
        </div>

        <div className="flex bg-black/40 rounded-md p-0.5 border border-white/[0.06] flex-shrink-0">
          <button
            onClick={() => onSortChange("events")}
            className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${
              sortMode === "events"
                ? "bg-gold-primary/20 text-gold-primary"
                : "text-text-muted/60 hover:text-white"
            }`}
            title="Sort by event count"
          >
            Events
          </button>
          <button
            onClick={() => onSortChange("pct")}
            className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all ${
              sortMode === "pct"
                ? "bg-gold-primary/20 text-gold-primary"
                : "text-text-muted/60 hover:text-white"
            }`}
            title="Sort by % change"
          >
            % Change
          </button>
        </div>
      </div>

      {tiles.length === 0 ? (
        <div className="text-center py-12 text-text-muted/50 text-xs">
          No activity yet
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
          {tiles.map((tile) => (
            <HeatmapTile
              key={tile.pair}
              tile={tile}
              isSelected={selectedCoin === tile.pair}
              onSelect={onSelect}
              maxEvents={maxEvents}
              sortMode={sortMode}
            />
          ))}
        </div>
      )}

      <div className="mt-2.5 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[8.5px] font-mono text-text-muted/50">
        <span className="uppercase tracking-wider">
          Color = direction · Tap for chart
        </span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-500/60" /> bull
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-red-500/60" /> bear
          </span>
        </div>
      </div>
    </div>
  );
};

// ── Heatmap Tile — uniform sized, vertical stack, NO overlap ──
const HeatmapTile = ({ tile, isSelected, onSelect, maxEvents, sortMode }) => {
  const { pair, symbol, pct, isBull, eventCount } = tile;

  // Intensity: events mode uses event count ratio; pct mode uses |pct| / 10
  const intensity =
    sortMode === "events"
      ? Math.min(eventCount / maxEvents, 1)
      : Math.min(Math.abs(pct) / 10, 1);

  const bgColor = isBull
    ? `rgba(16, 185, 129, ${0.1 + intensity * 0.4})`
    : `rgba(239, 68, 68, ${0.1 + intensity * 0.4})`;

  const borderColor = isSelected
    ? "#d4a853"
    : isBull
    ? `rgba(16,185,129,${0.25 + intensity * 0.3})`
    : `rgba(239,68,68,${0.25 + intensity * 0.3})`;

  // Truncate symbol if too long (e.g., "PEPECOIN" -> "PEPEC…")
  const displaySymbol =
    symbol.length > 6 ? symbol.slice(0, 5) + "…" : symbol;

  return (
    <button
      onClick={() => onSelect(pair)}
      title={`${pair} · ${eventCount} events · ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
      className="heatmap-tile relative rounded-md cursor-pointer transition-all hover:scale-[1.04] hover:z-10"
      style={{
        backgroundColor: bgColor,
        border: `${isSelected ? 2 : 1}px solid ${borderColor}`,
        padding: "8px 6px 6px",
        minHeight: "76px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "3px",
      }}
    >
      {/* Event count badge — top-left corner, separate from main content */}
      <span
        className="absolute top-1 left-1.5 text-[8.5px] font-mono font-bold leading-none"
        style={{ color: "rgba(255,255,255,0.55)" }}
      >
        ×{eventCount}
      </span>

      {/* Direction arrow — top-right corner */}
      <span
        className="absolute top-1 right-1.5 text-[9px] leading-none"
        style={{ color: isBull ? "#34d399" : "#f87171" }}
      >
        {isBull ? "▲" : "▼"}
      </span>

      {/* Logo */}
      <CoinLogo pair={pair} size={22} />

      {/* Symbol */}
      <span
        className="text-white font-bold leading-none"
        style={{
          fontSize: "11px",
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {displaySymbol}
      </span>

      {/* % Change */}
      <span
        className="font-mono font-bold leading-none"
        style={{
          fontSize: "11px",
          color: isBull ? "#34d399" : "#f87171",
        }}
      >
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(1)}%
      </span>
    </button>
  );
};

// ── Most Active Panel ───────────────────────────────────
const MostActivePanel = ({ movers, period, setPeriod, histograms, onSelect }) => (
  <div className="bg-[#0a0506] rounded-xl border border-white/10 p-3">
    <div className="flex items-center justify-between mb-2.5">
      <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">
        Most Active
      </h3>
      <div className="flex gap-0.5 bg-black/40 rounded-md p-0.5 border border-white/[0.04]">
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
    <div className="space-y-px">
      {(movers || []).slice(0, 6).map((coin, i) => {
        const symbol = stripQuote(coin.pair);
        const strongIsUp = (coin.best || 0) >= Math.abs(coin.worst || 0);
        const hist = histograms[coin.pair];
        return (
          <button
            key={coin.pair}
            onClick={() => onSelect(coin.pair)}
            className="w-full grid grid-cols-[12px_22px_minmax(0,1fr)_auto] items-center gap-2 py-1.5 px-1 rounded hover:bg-white/[0.02] transition-colors text-left border-b border-white/[0.03] last:border-b-0"
          >
            <span className="text-[9px] text-text-muted/40 text-center font-mono">{i + 1}</span>
            <CoinLogo pair={coin.pair} size={22} />
            <div className="min-w-0">
              <p className="text-white text-[11px] font-semibold truncate leading-tight flex items-center gap-1.5">
                {symbol}
                <span className="text-[9px] text-text-muted/50 font-mono font-normal">
                  {coin.event_count} ev
                </span>
              </p>
              {hist && hist.length >= 1 && (
                <div className="mt-1">
                  <MiniSparkbar histogram={hist} height={7} gap={1.5} />
                </div>
              )}
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
        <p className="text-text-muted/50 text-xs text-center py-3">No active coins yet</p>
      )}
    </div>
  </div>
);

// ── Flash Moves Panel ───────────────────────────────────
const FlashMovesPanel = ({ moves, onSelect }) => (
  <div className="bg-[#0a0506] rounded-xl border border-white/10 p-3">
    <div className="flex items-center justify-between mb-2.5">
      <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5">
        <span className="text-amber-400">⚡</span> Flash Moves
      </h3>
      <span className="text-[9px] text-text-muted/50 font-mono">
        {(moves || []).length} active
      </span>
    </div>
    <div className="space-y-px">
      {(moves || []).slice(0, 5).map((fm, i) => {
        const symbol = stripQuote(fm.pair);
        const opacity = Math.max(1 - (i / Math.max((moves || []).length, 1)) * 0.5, 0.5);
        return (
          <button
            key={i}
            onClick={() => onSelect(fm.pair)}
            className="w-full grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-2 py-1.5 px-1 rounded hover:bg-white/[0.02] transition-colors text-left border-b border-white/[0.03] last:border-b-0"
            style={{ opacity }}
          >
            <CoinLogo pair={fm.pair} size={18} />
            <span className="text-white text-[11px] font-semibold truncate">{symbol}</span>
            <span
              className={`text-[11px] font-bold font-mono ${
                fm.pct_change >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {fm.pct_change >= 0 ? "+" : ""}
              {fm.pct_change}%
            </span>
            <span className="text-text-muted/60 text-[9px] font-mono w-6 text-right">
              {fm.move_seconds}s
            </span>
          </button>
        );
      })}
      {(!moves || moves.length === 0) && (
        <p className="text-text-muted/50 text-xs text-center py-3">No flash moves yet</p>
      )}
    </div>
  </div>
);

// ── 24h Summary (stretches to fill remaining space) ─────
const SummaryPanel = ({ daily, className = "" }) => {
  const total = daily?.total_events || 0;
  const bull = daily?.bullish || 0;
  const bear = daily?.bearish || 0;
  const flash = daily?.flash_moves || 0;
  const bullPct = total > 0 ? Math.round((bull / (bull + bear || 1)) * 100) : 50;
  return (
    <div className={`bg-[#0a0506] rounded-xl border border-white/10 p-3 flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-2.5 flex-shrink-0">
        <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">
          24h Summary
        </h3>
        <span className="text-[9px] text-text-muted/50 font-mono">Rolling</span>
      </div>

      {/* Stat grid: 2x2 natural height */}
      <div className="grid grid-cols-2 gap-1.5">
        <SummaryCell label="Events" value={daily?.total_events} accent="white" />
        <SummaryCell label="Coins" value={daily?.unique_coins} accent="white" />
        <SummaryCell label="Bullish" value={daily?.bullish} accent="emerald" />
        <SummaryCell label="Bearish" value={daily?.bearish} accent="red" />
      </div>

      {/* Bull/Bear distribution bar — shows only when there's data */}
      {bull + bear > 0 && (
        <div className="mt-2">
          <div className="h-1 rounded-full overflow-hidden bg-white/5 flex">
            <div
              className="bg-gradient-to-r from-emerald-500 to-emerald-400"
              style={{ width: `${bullPct}%` }}
            />
            <div
              className="bg-gradient-to-l from-red-500 to-red-400"
              style={{ width: `${100 - bullPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] font-mono text-emerald-400">{bullPct}% bull</span>
            <span className="text-[9px] font-mono text-red-400">{100 - bullPct}% bear</span>
          </div>
        </div>
      )}

      {/* Flash moves footer */}
      <div className="mt-2 bg-amber-500/[0.06] rounded-md p-2.5 flex items-center justify-between">
        <div>
          <div className="font-mono text-[15px] text-amber-400 font-semibold leading-none">
            {flash.toLocaleString()}
          </div>
          <div className="text-[9px] text-text-muted/60 mt-1.5 uppercase tracking-wider">
            Flash Moves
          </div>
        </div>
        <span className="text-amber-400 text-base">⚡</span>
      </div>
    </div>
  );
};

const SummaryCell = ({ label, value, accent }) => {
  const colorMap = {
    white: "text-white bg-black/30",
    emerald: "text-emerald-400 bg-emerald-500/[0.06]",
    red: "text-red-400 bg-red-500/[0.06]",
  };
  return (
    <div className={`rounded-md p-2.5 ${colorMap[accent]}`}>
      <div className="font-mono text-[15px] font-semibold leading-none">
        {(value || 0).toLocaleString()}
      </div>
      <div className="text-[9px] text-text-muted/60 mt-1.5 uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
};

// ── Feed Skeleton ───────────────────────────────────────
const FeedSkeleton = () => (
  <div className="space-y-0">
    {[...Array(8)].map((_, i) => (
      <div
        key={i}
        className="px-4 py-2.5 flex items-center gap-3 border-b border-white/[0.03] animate-pulse"
        style={{ opacity: 1 - i * 0.1 }}
      >
        <div className="w-[26px] h-[26px] rounded-full bg-white/[0.04]" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 bg-white/[0.04] rounded w-1/3" />
          <div className="h-2 bg-white/[0.03] rounded w-1/2" />
        </div>
        <div className="w-16 h-5 bg-white/[0.04] rounded" />
      </div>
    ))}
  </div>
);

// ════════════════════════════════════════════════════════
// ★ NEW COIN CHART MODAL — premium style, real data via Binance
// ════════════════════════════════════════════════════════

const CoinChartModal = ({ pair, onClose }) => {
  const symbol = stripQuote(pair);
  const binanceSymbol = symbol + "USDT";
  const tvSymbol = `BINANCE:${binanceSymbol}.P`;

  const [klines, setKlines] = useState(null); // raw klines array
  const [interval, setIntervalState] = useState("1h"); // "15m" | "1h" | "4h" | "1d"
  const [stats24h, setStats24h] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTV, setShowTV] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const tvContainerRef = useRef(null);
  const tvWidgetRef = useRef(null);

  // ── Lock body scroll while open ──
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // ── Close on ESC ──
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 180);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  // ── Fetch klines (Binance Futures, fallback Spot) ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setKlines(null);

    const limit = 100;

    const fetchOne = async (url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      if (!Array.isArray(d) || d.length === 0) throw new Error("Empty");
      return d;
    };

    (async () => {
      let data = null;
      try {
        data = await fetchOne(
          `https://fapi.binance.com/fapi/v1/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`
        );
      } catch {
        try {
          data = await fetchOne(
            `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=${limit}`
          );
        } catch (e) {
          if (!cancelled) {
            setError("Chart data unavailable");
            setLoading(false);
          }
          return;
        }
      }
      if (cancelled) return;
      setKlines(data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [binanceSymbol, interval]);

  // ── Fetch 24h ticker ──
  useEffect(() => {
    let cancelled = false;
    const tryFetch = async () => {
      try {
        let r = await fetch(
          `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${binanceSymbol}`
        );
        if (!r.ok) {
          r = await fetch(
            `https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`
          );
        }
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        setStats24h({
          last: parseFloat(d.lastPrice),
          high: parseFloat(d.highPrice),
          low: parseFloat(d.lowPrice),
          volume: parseFloat(d.quoteVolume || d.volume || 0),
          changePct: parseFloat(d.priceChangePercent),
        });
      } catch {}
    };
    tryFetch();
    return () => {
      cancelled = true;
    };
  }, [binanceSymbol]);

  // ── TradingView widget mount ──
  useEffect(() => {
    if (!showTV) {
      // Cleanup if user toggled off
      if (tvWidgetRef.current) {
        try {
          tvWidgetRef.current.remove();
        } catch {}
        tvWidgetRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const containerId = "tv_chart_pulse_modal";

    const init = () => {
      if (cancelled || !document.getElementById(containerId)) return;
      try {
        tvWidgetRef.current = new window.TradingView.widget({
          container_id: containerId,
          autosize: true,
          symbol: tvSymbol,
          interval: interval === "15m" ? "15" : interval === "1h" ? "60" : interval === "4h" ? "240" : "D",
          timezone: "Asia/Jakarta",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#0a0a0f",
          enable_publishing: false,
          backgroundColor: "#0d0d0d",
          gridColor: "rgba(212, 168, 83, 0.05)",
          allow_symbol_change: true,
          save_image: false,
        });
      } catch (e) {
        console.error("[TradingView]", e);
      }
    };

    if (window.TradingView) {
      const t = setTimeout(init, 80);
      return () => {
        cancelled = true;
        clearTimeout(t);
        if (tvWidgetRef.current) {
          try {
            tvWidgetRef.current.remove();
          } catch {}
          tvWidgetRef.current = null;
        }
      };
    } else {
      const s = document.createElement("script");
      s.src = "https://s3.tradingview.com/tv.js";
      s.async = true;
      s.onload = () => {
        const t = setTimeout(init, 80);
      };
      document.head.appendChild(s);
      return () => {
        cancelled = true;
        if (tvWidgetRef.current) {
          try {
            tvWidgetRef.current.remove();
          } catch {}
          tvWidgetRef.current = null;
        }
      };
    }
  }, [showTV, tvSymbol, interval]);

  // ── Derived chart geometry from klines ──
  const chartGeo = useMemo(() => {
    if (!klines || klines.length === 0) return null;
    // Binance kline: [openTime, open, high, low, close, volume, closeTime, ...]
    const data = klines.map((k) => ({
      t: k[0],
      o: parseFloat(k[1]),
      h: parseFloat(k[2]),
      l: parseFloat(k[3]),
      c: parseFloat(k[4]),
      v: parseFloat(k[5]),
    }));
    const first = data[0].o;
    const last = data[data.length - 1].c;
    const high = Math.max(...data.map((d) => d.h));
    const low = Math.min(...data.map((d) => d.l));
    const change = first > 0 ? ((last - first) / first) * 100 : 0;
    return { data, first, last, high, low, change };
  }, [klines]);

  // ── SVG path for area chart ──
  const svgPath = useMemo(() => {
    if (!chartGeo) return null;
    const { data, high, low } = chartGeo;
    const W = 800;
    const H = 320;
    const padX = 4;
    const padY = 16;
    const range = Math.max(high - low, 1e-9);
    const stepX = (W - padX * 2) / Math.max(data.length - 1, 1);

    const points = data.map((d, i) => {
      const x = padX + i * stepX;
      const y = padY + (1 - (d.c - low) / range) * (H - padY * 2);
      return [x, y];
    });

    const linePath = points
      .map((p, i) => (i === 0 ? `M ${p[0]},${p[1]}` : `L ${p[0]},${p[1]}`))
      .join(" ");
    const areaPath =
      linePath +
      ` L ${points[points.length - 1][0]},${H - padY}` +
      ` L ${points[0][0]},${H - padY} Z`;

    return { W, H, linePath, areaPath, points };
  }, [chartGeo]);

  const last = chartGeo?.last ?? stats24h?.last ?? 0;
  const change = stats24h?.changePct ?? chartGeo?.change ?? 0;
  const isPos = change >= 0;

  const intervals = [
    { v: "15m", l: "15m" },
    { v: "1h", l: "1H" },
    { v: "4h", l: "4H" },
    { v: "1d", l: "1D" },
  ];

  // ── Render ──
  const modalContent = (
    <div
      className={`fixed inset-0 z-[100000] flex items-start justify-center px-3 py-4 sm:px-6 md:px-8 pt-[80px] sm:pt-[100px] pb-6 ${
        isClosing
          ? "animate-[mpfade-out_.18s_ease-in_forwards]"
          : "animate-[mpfade-in_.22s_ease-out]"
      }`}
      style={{ backgroundColor: "rgba(0,0,0,0.78)", backdropFilter: "blur(6px)" }}
      onClick={handleClose}
    >
      <div
        className={`relative w-full max-w-[920px] bg-[#0a0506] border border-gold-primary/40 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[calc(100dvh-110px)] sm:max-h-[calc(100dvh-130px)] ${
          isClosing
            ? "animate-[mppanel-out_.18s_ease-in_forwards]"
            : "animate-[mppanel-in_.28s_cubic-bezier(.16,1,.3,1)]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3 bg-black/30 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <CoinLogo pair={pair} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white text-base sm:text-lg font-bold leading-none">
                  {symbol}
                </span>
                <span className="text-text-muted/60 text-[10px] font-mono">{pair}</span>
              </div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-white font-mono text-sm sm:text-base font-bold leading-none">
                  ${formatPrice(last)}
                </span>
                <span
                  className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                    isPos
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-red-500/15 text-red-400"
                  }`}
                >
                  {isPos ? "+" : ""}
                  {change.toFixed(2)}%
                </span>
                <span className="text-[9px] text-text-muted/50 uppercase tracking-wider">
                  24h
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-[#0a0a0a] border border-gold-primary/20 hover:bg-red-500/20 hover:border-red-500/50 flex items-center justify-center text-text-muted hover:text-white transition-all flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Toolbar: interval + view toggle */}
        <div className="px-4 sm:px-5 py-2 border-b border-white/[0.04] flex items-center justify-between gap-3 bg-black/20 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-1 bg-black/40 rounded-md p-0.5 border border-white/[0.06]">
            {intervals.map((it) => (
              <button
                key={it.v}
                onClick={() => setIntervalState(it.v)}
                disabled={showTV}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                  interval === it.v && !showTV
                    ? "bg-gold-primary/20 text-gold-primary"
                    : "text-text-muted/60 hover:text-white"
                } ${showTV ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {it.l}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[9px] text-text-muted/50 font-mono uppercase tracking-wider hidden sm:inline">
              {showTV ? "TradingView" : "Quick chart"}
            </span>
            <button
              onClick={() => setShowTV((v) => !v)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                showTV
                  ? "bg-gold-primary/15 text-gold-primary border-gold-primary/40"
                  : "bg-black/40 text-text-muted border-white/10 hover:text-white hover:border-white/30"
              }`}
            >
              {showTV ? "✕ Close TV" : "📊 Open in TradingView"}
            </button>
          </div>
        </div>

        {/* Chart area */}
        <div
          className="relative bg-[#0d0908] flex-1 overflow-hidden"
          style={{ minHeight: 320 }}
        >
          {showTV ? (
            <div
              id="tv_chart_pulse_modal"
              ref={tvContainerRef}
              style={{ width: "100%", height: "100%", minHeight: 320 }}
            />
          ) : (
            <>
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center text-text-muted/50 text-xs">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
                    <span className="font-mono text-[10px] uppercase tracking-wider">
                      Loading chart…
                    </span>
                  </div>
                </div>
              )}

              {error && !loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl mb-2 opacity-30">⚠</div>
                    <div className="text-text-muted text-xs">{error}</div>
                    <div className="text-text-muted/40 text-[10px] mt-1 font-mono">
                      {binanceSymbol} not on Binance
                    </div>
                  </div>
                </div>
              )}

              {!loading && !error && chartGeo && svgPath && (
                <svg
                  viewBox={`0 0 ${svgPath.W} ${svgPath.H}`}
                  preserveAspectRatio="none"
                  className="w-full h-full"
                  style={{ display: "block" }}
                >
                  <defs>
                    <linearGradient id="mp-area" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor={isPos ? "#10b981" : "#ef4444"}
                        stopOpacity="0.35"
                      />
                      <stop
                        offset="100%"
                        stopColor={isPos ? "#10b981" : "#ef4444"}
                        stopOpacity="0.01"
                      />
                    </linearGradient>
                  </defs>

                  {/* Grid lines */}
                  {[0.25, 0.5, 0.75].map((p) => (
                    <line
                      key={p}
                      x1="0"
                      x2={svgPath.W}
                      y1={svgPath.H * p}
                      y2={svgPath.H * p}
                      stroke="rgba(255,255,255,0.04)"
                      strokeWidth="1"
                    />
                  ))}

                  {/* Area fill */}
                  <path d={svgPath.areaPath} fill="url(#mp-area)" />

                  {/* Line */}
                  <path
                    d={svgPath.linePath}
                    fill="none"
                    stroke={isPos ? "#10b981" : "#ef4444"}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />

                  {/* Last-point dot */}
                  {svgPath.points.length > 0 && (
                    <circle
                      cx={svgPath.points[svgPath.points.length - 1][0]}
                      cy={svgPath.points[svgPath.points.length - 1][1]}
                      r="3.5"
                      fill={isPos ? "#10b981" : "#ef4444"}
                      stroke="#0d0908"
                      strokeWidth="2"
                    />
                  )}
                </svg>
              )}
            </>
          )}
        </div>

        {/* Footer stats */}
        <div className="border-t border-white/[0.06] bg-black/30 px-4 sm:px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0">
          <ModalStat
            label="24h High"
            value={stats24h ? `$${formatPrice(stats24h.high)}` : "—"}
            accent="emerald"
          />
          <ModalStat
            label="24h Low"
            value={stats24h ? `$${formatPrice(stats24h.low)}` : "—"}
            accent="red"
          />
          <ModalStat
            label="24h Volume"
            value={stats24h ? `$${formatVolume(stats24h.volume)}` : "—"}
          />
          <ModalStat
            label="Source"
            value="Binance"
            accent="gold"
          />
        </div>

        <div className="px-4 sm:px-5 py-2 border-t border-white/[0.04] flex items-center justify-between text-[9px] font-mono text-text-muted/40 bg-black/20 flex-shrink-0">
          <span className="uppercase tracking-wider">Live · Binance API</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

const ModalStat = ({ label, value, accent }) => {
  const colorMap = {
    emerald: "text-emerald-400",
    red: "text-red-400",
    gold: "text-gold-primary",
  };
  return (
    <div className="bg-black/30 rounded-lg p-2.5 border border-white/[0.04]">
      <p className={`text-sm font-bold font-mono leading-none ${colorMap[accent] || "text-white"}`}>
        {value}
      </p>
      <p className="text-text-muted/60 text-[9px] uppercase tracking-widest mt-1.5 font-mono">
        {label}
      </p>
    </div>
  );
};

// ── CSS for animations + equal-height grid ──────────────
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

    /* Modal animations */
    @keyframes mpfade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes mpfade-out { from { opacity: 1; } to { opacity: 0; } }
    @keyframes mppanel-in {
      from { opacity: 0; transform: translateY(20px) scale(.98); }
      to   { opacity: 1; transform: translateY(0)    scale(1); }
    }
    @keyframes mppanel-out {
      from { opacity: 1; transform: translateY(0)    scale(1); }
      to   { opacity: 0; transform: translateY(20px) scale(.98); }
    }

    /* Sidebar dictates height. Feed matches sidebar's natural height,
       and its internal list area scrolls. No fixed height — adapts to sidebar content.
       This means: when sidebar has 4 panels, feed = same height, scrollable. */
    .mp-main-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    @media (min-width: 1024px) {
      .mp-main-grid {
        grid-template-columns: 1.7fr 1fr;
        align-items: stretch;
        min-height: 600px;
      }
      .mp-feed-col {
        position: relative;
        min-height: 0;
      }
      .mp-feed-card {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .mp-feed-list {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }
      .mp-sidebar-col {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      /* 24h Summary is the last panel — render natural, no stretch */
      .mp-sidebar-stretch {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
      }
    }
    @media (max-width: 1023px) {
      .mp-feed-col, .mp-sidebar-col { display: block; }
      .mp-sidebar-col > * + * { margin-top: 10px; }
      .mp-feed-list { max-height: 500px; overflow-y: auto; }
    }
  `}</style>
);