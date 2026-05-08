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
// ★ HEATMAP — Treemap layout (size scales with rank)
//   Rank 1 → 2x2 huge tile · Rank 2-3 → 2x1 wide · Rank 4+ → 1x1
//   Toggle: Events count vs % Change · Direction = color
// ════════════════════════════════════════════════════════

const HeatmapPanel = ({ heatmap, selectedCoin, onSelect, sortMode, onSortChange }) => {
  const tiles = useMemo(() => {
    if (!heatmap || heatmap.length === 0) return [];
    return heatmap.slice(0, 13).map((coin) => {
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

  // Treemap layout — 4 cols × 5 rows = 20 cells, fits 13 tiles
  // Cell positions for each rank (1-indexed visually, 0-indexed in array):
  //   Rank 1: 2x2 huge   |  Rank 2-3: 2x1 wide  |  Rank 4-11: 1x1 small
  //   Rank 12-13: 2x1 wide (bottom row)
  const layouts = [
    { col: "1 / 3", row: "1 / 3", size: "xl" }, // R1: 2x2
    { col: "3 / 5", row: "1 / 2", size: "lg" }, // R2: 2x1
    { col: "3 / 5", row: "2 / 3", size: "lg" }, // R3: 2x1
    { col: "1 / 2", row: "3 / 4", size: "sm" }, // R4
    { col: "2 / 3", row: "3 / 4", size: "sm" }, // R5
    { col: "3 / 4", row: "3 / 4", size: "sm" }, // R6
    { col: "4 / 5", row: "3 / 4", size: "sm" }, // R7
    { col: "1 / 2", row: "4 / 5", size: "sm" }, // R8
    { col: "2 / 3", row: "4 / 5", size: "sm" }, // R9
    { col: "3 / 4", row: "4 / 5", size: "sm" }, // R10
    { col: "4 / 5", row: "4 / 5", size: "sm" }, // R11
    { col: "1 / 3", row: "5 / 6", size: "lg" }, // R12: 2x1 (extra)
    { col: "3 / 5", row: "5 / 6", size: "lg" }, // R13: 2x1 (extra)
  ];

  const visibleTiles = tiles.slice(0, layouts.length);

  return (
    <div className="bg-[#0a0506] rounded-xl border border-white/10 p-3">
      {/* Header with sort toggle */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-text-muted text-[10px] font-bold uppercase tracking-widest">
            Heatmap · 1h
          </h3>
          <span className="text-[9px] text-text-muted/50 font-mono">
            Top {visibleTiles.length}
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
            title="Sort by event count (more events = bigger tile)"
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
            title="Sort by % change (bigger move = bigger tile)"
          >
            % Change
          </button>
        </div>
      </div>

      {visibleTiles.length === 0 ? (
        <div className="text-center py-12 text-text-muted/50 text-xs">
          No activity yet
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gridAutoRows: "62px",
            gap: "6px",
          }}
        >
          {visibleTiles.map((tile, i) => (
            <HeatmapTile
              key={tile.pair}
              tile={tile}
              isSelected={selectedCoin === tile.pair}
              onSelect={onSelect}
              layout={layouts[i]}
            />
          ))}
        </div>
      )}

      <div className="mt-2.5 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[8.5px] font-mono text-text-muted/50">
        <span className="uppercase tracking-wider">
          Size = rank · Color = direction · Tap for chart
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

// ── Heatmap Tile — Size-aware typography (3 variants: xl, lg, sm) ──
const HeatmapTile = ({ tile, isSelected, onSelect, layout }) => {
  const { pair, symbol, pct, isBull, eventCount } = tile;

  const intensity = Math.min(Math.abs(pct) / 12, 0.85);
  const bgColor = isBull
    ? `rgba(16, 185, 129, ${0.12 + intensity * 0.4})`
    : `rgba(239, 68, 68, ${0.12 + intensity * 0.4})`;

  const isXL = layout.size === "xl";
  const isLG = layout.size === "lg";

  // Per-size styling — guarantees no overlap regardless of tile dimensions
  const styles = isXL
    ? { logo: 36, symbolFs: 15, pctFs: 22, pad: "16px 12px 12px", gap: 4 }
    : isLG
    ? { logo: 26, symbolFs: 13, pctFs: 16, pad: "8px 10px", gap: 6 }
    : { logo: 18, symbolFs: 11, pctFs: 11, pad: "14px 6px 6px", gap: 2 };

  // Truncate symbol smartly per tile size
  const maxLen = isXL ? 8 : isLG ? 8 : 5;
  const displaySymbol =
    symbol.length > maxLen ? symbol.slice(0, maxLen) + "…" : symbol;

  // LG (2x1 wide) uses HORIZONTAL layout: logo left, text stacked right
  // XL and SM use VERTICAL stack
  const useHorizontal = isLG;

  return (
    <button
      onClick={() => onSelect(pair)}
      title={`${pair} · ${eventCount} events · ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
      style={{
        gridColumn: layout.col,
        gridRow: layout.row,
        backgroundColor: bgColor,
        border: isSelected
          ? "1.5px solid #d4a853"
          : `1px solid ${isBull ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
        borderRadius: "8px",
        padding: styles.pad,
        cursor: "pointer",
        position: "relative",
        overflow: "hidden",
        transition: "transform 0.15s ease, border-color 0.15s ease",
        display: "flex",
        flexDirection: useHorizontal ? "row" : "column",
        alignItems: "center",
        justifyContent: "center",
        gap: `${styles.gap}px`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.02)";
        e.currentTarget.style.zIndex = "10";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.zIndex = "1";
      }}
    >
      {/* Event count badge — top-left corner (separate from main content) */}
      <span
        style={{
          position: "absolute",
          top: 4,
          left: 6,
          fontSize: isXL ? "10px" : "8.5px",
          fontFamily: "ui-monospace, monospace",
          color: "rgba(255,255,255,0.55)",
          fontWeight: 600,
          lineHeight: 1,
          pointerEvents: "none",
        }}
      >
        ×{eventCount}
      </span>

      {/* Direction arrow — top-right corner */}
      <span
        style={{
          position: "absolute",
          top: 4,
          right: 6,
          fontSize: isXL ? "11px" : "9px",
          color: isBull ? "#34d399" : "#f87171",
          lineHeight: 1,
          pointerEvents: "none",
        }}
      >
        {isBull ? "▲" : "▼"}
      </span>

      <CoinLogo pair={pair} size={styles.logo} />

      {useHorizontal ? (
        // Horizontal layout: text stacked vertically beside logo
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 3,
            minWidth: 0,
            flex: 1,
          }}
        >
          <span
            style={{
              fontSize: `${styles.symbolFs}px`,
              fontWeight: 700,
              color: "#fff",
              lineHeight: 1,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displaySymbol}
          </span>
          <span
            style={{
              fontSize: `${styles.pctFs}px`,
              fontFamily: "ui-monospace, monospace",
              fontWeight: 800,
              color: isBull ? "#34d399" : "#f87171",
              lineHeight: 1,
            }}
          >
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(1)}%
          </span>
        </div>
      ) : (
        // Vertical stack (XL & SM)
        <>
          <span
            style={{
              fontSize: `${styles.symbolFs}px`,
              fontWeight: 700,
              color: "#fff",
              lineHeight: 1,
              maxWidth: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: isXL ? 2 : 0,
            }}
          >
            {displaySymbol}
          </span>
          <span
            style={{
              fontSize: `${styles.pctFs}px`,
              fontFamily: "ui-monospace, monospace",
              fontWeight: 800,
              color: isBull ? "#34d399" : "#f87171",
              lineHeight: 1,
            }}
          >
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(1)}%
          </span>
        </>
      )}
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
// ★ COIN CHART MODAL — TradingView embed (same approach as SignalModal)
//   No manual API fetching — TV handles symbol resolution itself.
//   Supplementary 24h stats from Binance with Bybit fallback.
// ════════════════════════════════════════════════════════

const CoinChartModal = ({ pair, onClose }) => {
  const symbol = stripQuote(pair);
  // pair is already like "OGUSDT" / "BUSDT" — TV format: "BINANCE:{pair}.P"
  const tvSymbol = `BINANCE:${pair}.P`;

  const [tvInterval, setTvInterval] = useState("60"); // TV interval string
  // Trading metrics — fetched in parallel, each independent (one failing doesn't break others)
  const [metrics, setMetrics] = useState({
    ticker: null,       // { last, high, low, volume, changePct }
    funding: null,      // { rate, nextTime }       — perp funding rate + countdown
    openInterest: null, // { current, changePct }   — OI now + 24h change
    ratio: null,        // { longPct, shortPct, r } — top traders L/S ratio
  });
  const [isClosing, setIsClosing] = useState(false);

  const tvContainerRef = useRef(null);

  // ── Lock body scroll while open ──
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // ── Close handler with exit animation ──
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 180);
  }, [onClose]);

  // ── Close on ESC ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  // ── Fetch all trading metrics in parallel (each independent) ──
  // All endpoints are FREE Binance Futures public APIs (CORS-enabled).
  // Bybit fallback for ticker only (perp metrics are Binance-specific).
  useEffect(() => {
    let cancelled = false;
    setMetrics({
      ticker: null,
      funding: null,
      openInterest: null,
      ratio: null,
    });

    const setMetric = (key, value) => {
      if (cancelled) return;
      setMetrics((m) => ({ ...m, [key]: value }));
    };

    // 1) 24h ticker — Binance Futures → Spot → Bybit Linear → Bybit Spot
    const fetchTicker = async () => {
      const sources = [
        `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${pair}`,
        `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`,
      ];
      for (const url of sources) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const d = await r.json();
          setMetric("ticker", {
            last: parseFloat(d.lastPrice),
            high: parseFloat(d.highPrice),
            low: parseFloat(d.lowPrice),
            volume: parseFloat(d.quoteVolume || d.volume || 0),
            changePct: parseFloat(d.priceChangePercent),
          });
          return;
        } catch {}
      }
      // Bybit fallback
      for (const cat of ["linear", "spot"]) {
        try {
          const r = await fetch(
            `https://api.bybit.com/v5/market/tickers?category=${cat}&symbol=${pair}`
          );
          if (!r.ok) continue;
          const j = await r.json();
          const t = j?.result?.list?.[0];
          if (!t) continue;
          setMetric("ticker", {
            last: parseFloat(t.lastPrice),
            high: parseFloat(t.highPrice24h),
            low: parseFloat(t.lowPrice24h),
            volume: parseFloat(t.turnover24h || 0),
            changePct: parseFloat(t.price24hPcnt) * 100,
          });
          return;
        } catch {}
      }
    };

    // 2) Funding rate + next funding countdown — Binance Futures → Bybit fallback
    const fetchFunding = async () => {
      try {
        const r = await fetch(
          `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`
        );
        if (r.ok) {
          const d = await r.json();
          if (d?.lastFundingRate != null) {
            setMetric("funding", {
              rate: parseFloat(d.lastFundingRate),
              nextTime: parseInt(d.nextFundingTime),
            });
            return;
          }
        }
      } catch {}
      try {
        const r = await fetch(
          `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${pair}`
        );
        if (r.ok) {
          const j = await r.json();
          const t = j?.result?.list?.[0];
          if (t?.fundingRate != null && t?.nextFundingTime != null) {
            setMetric("funding", {
              rate: parseFloat(t.fundingRate),
              nextTime: parseInt(t.nextFundingTime),
            });
          }
        }
      } catch {}
    };

    // 3) Open Interest — fetch 24h history, compute current vs 24h ago
    const fetchOI = async () => {
      try {
        const r = await fetch(
          `https://fapi.binance.com/futures/data/openInterestHist?symbol=${pair}&period=1h&limit=24`
        );
        if (!r.ok) return;
        const d = await r.json();
        if (!Array.isArray(d) || d.length === 0) return;
        const latest = d[d.length - 1];
        const oldest = d[0];
        const current = parseFloat(latest.sumOpenInterestValue || 0);
        const prev = parseFloat(oldest.sumOpenInterestValue || 0);
        const changePct = prev > 0 ? ((current - prev) / prev) * 100 : 0;
        setMetric("openInterest", { current, changePct });
      } catch {}
    };

    // 4) Long/Short ratio (top traders by position) — better signal than retail accounts
    const fetchRatio = async () => {
      try {
        const r = await fetch(
          `https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${pair}&period=1h&limit=1`
        );
        if (!r.ok) return;
        const d = await r.json();
        if (!Array.isArray(d) || d.length === 0) return;
        const item = d[0];
        setMetric("ratio", {
          longPct: parseFloat(item.longAccount) * 100,
          shortPct: parseFloat(item.shortAccount) * 100,
          r: parseFloat(item.longShortRatio),
        });
      } catch {}
    };

    // Fire all in parallel — independent failures
    fetchTicker();
    fetchFunding();
    fetchOI();
    fetchRatio();

    return () => {
      cancelled = true;
    };
  }, [pair]);

  // ── Mount TradingView embed widget (same pattern as SignalModal) ──
  useEffect(() => {
    const container = tvContainerRef.current;
    if (!container) return;

    // Clear any previous widget
    container.innerHTML = "";

    let timezone = "Etc/UTC";
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {}

    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container";
    widgetContainer.style.cssText = "height:100%;width:100%";

    const widgetInner = document.createElement("div");
    widgetInner.className = "tradingview-widget-container__widget";
    widgetInner.style.cssText = "height:100%;width:100%";
    widgetContainer.appendChild(widgetInner);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: tvInterval,
      timezone: timezone,
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(13, 13, 13, 1)",
      gridColor: "rgba(212, 168, 83, 0.05)",
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: false,
      studies: ["STD;EMA"],
      support_host: "https://www.tradingview.com",
    });

    widgetContainer.appendChild(script);
    container.appendChild(widgetContainer);

    return () => {
      if (container) container.innerHTML = "";
    };
  }, [tvSymbol, tvInterval]);

  const last = metrics.ticker?.last;
  const change = metrics.ticker?.changePct;
  const isPos = (change ?? 0) >= 0;

  const intervals = [
    { v: "15", l: "15m" },
    { v: "60", l: "1H" },
    { v: "240", l: "4H" },
    { v: "D", l: "1D" },
  ];

  const tvFullUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;

  // ── Render via portal ──
  const modalContent = (
    <div
      className={`fixed inset-0 z-[100000] flex items-start justify-center px-3 py-4 sm:px-6 md:px-8 pt-[60px] sm:pt-[80px] pb-6 ${
        isClosing
          ? "animate-[mpfade-out_.18s_ease-in_forwards]"
          : "animate-[mpfade-in_.22s_ease-out]"
      }`}
      style={{
        backgroundColor: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(6px)",
      }}
      onClick={handleClose}
    >
      <div
        className={`relative w-full max-w-[1180px] bg-[#0a0506] border border-gold-primary/40 rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[calc(100dvh-90px)] sm:h-[calc(100dvh-110px)] max-h-[920px] min-h-0 ${
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
                <span className="text-text-muted/60 text-[10px] font-mono">
                  {pair}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-white font-mono text-sm sm:text-base font-bold leading-none">
                  {last != null ? `$${formatPrice(last)}` : "—"}
                </span>
                {change != null && (
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
                )}
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

        {/* Toolbar: interval + open in TV */}
        <div className="px-4 sm:px-5 py-2 border-b border-white/[0.04] flex items-center justify-between gap-3 bg-black/20 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-1 bg-black/40 rounded-md p-0.5 border border-white/[0.06]">
            {intervals.map((it) => (
              <button
                key={it.v}
                onClick={() => setTvInterval(it.v)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                  tvInterval === it.v
                    ? "bg-gold-primary/20 text-gold-primary"
                    : "text-text-muted/60 hover:text-white"
                }`}
              >
                {it.l}
              </button>
            ))}
          </div>

          <a
            href={tvFullUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-md text-[10px] font-bold border bg-black/40 text-text-muted border-white/10 hover:text-white hover:border-white/30 transition-all flex items-center gap-1.5"
          >
            <span>↗</span>
            <span>Open in TradingView</span>
          </a>
        </div>

        {/* Chart area — TradingView embed fills the box (matches SignalModal pattern) */}
        <div className="relative flex-1 min-h-0 min-w-0 bg-[#0d0d0d]">
          <div ref={tvContainerRef} className="w-full h-full" />
        </div>

        {/* Footer trading metrics — 4 perp-essential signals from Binance Futures public API */}
        <div className="border-t border-white/[0.06] bg-black/30 px-4 sm:px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 flex-shrink-0">
          <Metric24h ticker={metrics.ticker} />
          <MetricFunding funding={metrics.funding} />
          <MetricOI oi={metrics.openInterest} />
          <MetricLS ratio={metrics.ratio} />
        </div>

        <div className="px-4 sm:px-5 py-2 border-t border-white/[0.04] flex items-center justify-between text-[9px] font-mono text-text-muted/40 bg-black/20 flex-shrink-0">
          <span className="uppercase tracking-wider">
            Chart by TradingView · Metrics by Binance Futures
          </span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// ════════════════════════════════════════════════════════
// Footer metric cells — each is self-contained, handles null state
// ════════════════════════════════════════════════════════

const MetricCellShell = ({ label, children }) => (
  <div className="bg-black/30 rounded-lg px-2.5 py-2 border border-white/[0.04] min-h-[64px] flex flex-col justify-between">
    <p className="text-text-muted/60 text-[9px] uppercase tracking-widest font-mono">
      {label}
    </p>
    {children}
  </div>
);

// 1) 24h Change with H/L sub-line
const Metric24h = ({ ticker }) => {
  if (!ticker) {
    return (
      <MetricCellShell label="24h Change">
        <p className="text-sm font-bold font-mono text-text-muted/40 leading-none mt-1">—</p>
        <p className="text-[9px] text-text-muted/30 font-mono mt-1 leading-tight">
          high / low
        </p>
      </MetricCellShell>
    );
  }
  const isPos = ticker.changePct >= 0;
  return (
    <MetricCellShell label="24h Change">
      <p
        className={`text-sm font-bold font-mono leading-none mt-1 ${
          isPos ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isPos ? "+" : ""}
        {ticker.changePct.toFixed(2)}%
      </p>
      <p className="text-[9px] text-text-muted/60 font-mono mt-1 leading-tight">
        H ${formatPrice(ticker.high)} · L ${formatPrice(ticker.low)}
      </p>
    </MetricCellShell>
  );
};

// 2) Funding Rate with countdown to next payment
const MetricFunding = ({ funding }) => {
  if (!funding) {
    return (
      <MetricCellShell label="Funding · perp">
        <p className="text-sm font-bold font-mono text-text-muted/40 leading-none mt-1">—</p>
        <p className="text-[9px] text-text-muted/30 font-mono mt-1 leading-tight">
          spot only
        </p>
      </MetricCellShell>
    );
  }
  const ratePct = funding.rate * 100;
  const isPos = ratePct >= 0;
  const msToNext = Math.max(0, funding.nextTime - Date.now());
  const hrs = Math.floor(msToNext / 3600000);
  const mins = Math.floor((msToNext % 3600000) / 60000);
  return (
    <MetricCellShell label="Funding · perp">
      <p
        className={`text-sm font-bold font-mono leading-none mt-1 ${
          isPos ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isPos ? "+" : ""}
        {ratePct.toFixed(4)}%
      </p>
      <p className="text-[9px] text-text-muted/60 font-mono mt-1 leading-tight">
        {isPos ? "longs pay" : "shorts pay"} · in {hrs}h {mins}m
      </p>
    </MetricCellShell>
  );
};

// 3) Open Interest with 24h delta
const MetricOI = ({ oi }) => {
  if (!oi) {
    return (
      <MetricCellShell label="Open Interest">
        <p className="text-sm font-bold font-mono text-text-muted/40 leading-none mt-1">—</p>
        <p className="text-[9px] text-text-muted/30 font-mono mt-1 leading-tight">
          24h change
        </p>
      </MetricCellShell>
    );
  }
  const isPos = oi.changePct >= 0;
  return (
    <MetricCellShell label="Open Interest">
      <p className="text-sm font-bold font-mono text-white leading-none mt-1">
        ${formatVolume(oi.current)}
      </p>
      <p
        className={`text-[9px] font-mono mt-1 leading-tight ${
          isPos ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isPos ? "↑" : "↓"} {Math.abs(oi.changePct).toFixed(2)}% · 24h
      </p>
    </MetricCellShell>
  );
};

// 4) Long/Short Ratio (top traders by position) — with split bar viz
const MetricLS = ({ ratio }) => {
  if (!ratio) {
    return (
      <MetricCellShell label="L/S · top traders">
        <p className="text-sm font-bold font-mono text-text-muted/40 leading-none mt-1">—</p>
        <div className="h-1 mt-2 rounded-full bg-white/5" />
      </MetricCellShell>
    );
  }
  return (
    <MetricCellShell label="L/S · top traders">
      <p className="text-sm font-bold font-mono leading-none mt-1">
        <span className="text-emerald-400">{ratio.longPct.toFixed(0)}%</span>
        <span className="text-text-muted/40 mx-1">/</span>
        <span className="text-red-400">{ratio.shortPct.toFixed(0)}%</span>
      </p>
      <div className="h-1 mt-2 rounded-full overflow-hidden bg-white/5 flex">
        <div
          className="bg-gradient-to-r from-emerald-500 to-emerald-400"
          style={{ width: `${ratio.longPct}%` }}
        />
        <div
          className="bg-gradient-to-l from-red-500 to-red-400"
          style={{ width: `${ratio.shortPct}%` }}
        />
      </div>
    </MetricCellShell>
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