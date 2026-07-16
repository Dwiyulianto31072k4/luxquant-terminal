// src/components/MarketPulsePage.jsx
//
// NOTE (activity-tracking fix): semua fetch ke backend LuxQuant
// (/api/v1/market-pulse/*) sekarang lewat instance `api`
// (src/services/authApi.js) bukan `fetch()` polos, supaya Bearer token
// tersisip otomatis (lewat axios interceptor) kalau user sedang login.
// Endpoint market-pulse tetap publik (boleh diakses tanpa login), tapi
// dengan ini ActivityTrackerMiddleware di backend bisa mencatat
// kunjungan halaman Market Pulse untuk user yang sedang login.
// Fetch ke Binance/Bybit di CoinChartModal TIDAK diubah — itu API publik
// pihak ketiga (bukan backend kita), jadi tidak relevan untuk tracking.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import CoinLogo from "./CoinLogo";
import { SignalStatusProvider, useSignalStatus } from "../context/SignalStatusContext";
import GlobalSignalModalHost from "./SignalStatusModal";
import { ResponsiveContainer, Treemap, Tooltip as RTooltip } from "recharts";
import api from "../services/authApi";
import { useSearchParams } from "react-router-dom";
import AssistantWidget from "./assistant/AssistantWidget";
import { ShimmerStyles } from "./ui/Loaders";

// ════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════

const stripQuote = (sym) => (sym || "").replace(/USDT$|USDC$|BUSD$|USD$/i, "");

// Classify an event as pump (upside) vs dump (downside). Bullish direction OR
// a non-bearish event with a non-negative pct counts as a pump.
const isPumpEvent = (e) => {
  const pc = Number(e?.pct_change) || 0;
  return e?.direction === "bullish" || (e?.direction !== "bearish" && pc >= 0);
};

// Group consecutive events that share the same pair (feed comes newest-first).
const groupConsecutive = (list) => {
  const groups = [];
  let current = null;
  (list || []).forEach((e) => {
    if (current && current.pair === e.pair) {
      current.events.push(e);
    } else {
      current = { pair: e.pair, events: [e] };
      groups.push(current);
    }
  });
  return groups;
};

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
// ICONS — Lucide-style inline SVG (consistent w/ Flowscan)
// ════════════════════════════════════════════════════════

const IconSearch = ({ className = "h-3.5 w-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
);

const IconClose = ({ className = "h-3.5 w-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconBolt = ({ className = "h-3.5 w-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const IconChartLine = ({ className = "h-3.5 w-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 3v18h18" />
    <path d="m19 9-5 5-4-4-3 3" />
  </svg>
);

const IconExternal = ({ className = "h-3 w-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const IconChevronDown = ({ className = "h-3 w-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconChevronUp = ({ className = "h-3 w-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const IconArrowUpTri = ({ className = "h-2.5 w-2.5" }) => (
  <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
    <path d="M6 2 L11 9 L1 9 Z" />
  </svg>
);

const IconArrowDownTri = ({ className = "h-2.5 w-2.5" }) => (
  <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
    <path d="M6 10 L1 3 L11 3 Z" />
  </svg>
);

const IconEmpty = ({ className = "h-8 w-8" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
);

const IconActivity = ({ className = "h-3.5 w-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

// Panel collapse (chevrons →) / expand (chevrons ←)
const IconChevronsRight = ({ className = "h-3.5 w-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 17 11 12 6 7" />
    <polyline points="13 17 18 12 13 7" />
  </svg>
);

const IconChevronsLeft = ({ className = "h-3.5 w-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="11 17 6 12 11 7" />
    <polyline points="18 17 13 12 18 7" />
  </svg>
);

// ════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════

const MarketPulsePageInner = () => {
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

  // === Feed view mode (pump/dump screening) ===
  // feedLayout: "unified" (single list + All/Pumps/Dumps toggle)
  //           | "split"   (Pumps | Dumps side-by-side)
  //           | "focus"   (one side, full width)
  // feedSide:  "all" | "pump" | "dump" — active side for unified/focus
  const [feedLayout, setFeedLayout] = useState(() => {
    try {
      const v = localStorage.getItem("mp_feed_layout");
      return v === "split" || v === "focus" || v === "unified" ? v : "unified";
    } catch {
      return "unified";
    }
  });
  const [feedSide, setFeedSide] = useState("all");

  const changeLayout = useCallback((mode) => {
    setFeedLayout(mode);
    try { localStorage.setItem("mp_feed_layout", mode); } catch {}
    // Focus mode has no "all" — default to pumps when entering it.
    setFeedSide((prev) => (mode === "focus" && prev === "all" ? "pump" : prev));
  }, []);

  // Side panel (heatmap/stats) collapse — default OPEN, choice persisted.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem("mp_sidebar_open") !== "0"; } catch { return true; }
  });
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem("mp_sidebar_open", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  // === Heatmap sort mode + Chart Modal (URL-driven: ?pair=BTCUSDT) ===
  const [heatmapSortMode, setHeatmapSortMode] = useState("events");
  const [searchParams, setSearchParams] = useSearchParams();
  const chartModalPair = searchParams.get("pair");

  // ═════════ FETCH ═════════ (LOGIC IDENTICAL, transport via `api` instance)

  const fetchData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);

      const params = { limit: "500" };
      if (sourceFilter !== "all") params.source = sourceFilter;
      if (timeframeFilter !== "all") params.timeframe = timeframeFilter;
      if (selectedCoin) params.pair = selectedCoin;

      const [feedRes, statsRes, moversRes] = await Promise.allSettled([
        api.get(`/api/v1/market-pulse/feed`, { params }),
        api.get(`/api/v1/market-pulse/stats`),
        api.get(`/api/v1/market-pulse/top-movers`, { params: { period: moverPeriod } }),
      ]);

      if (feedRes.status === "fulfilled") {
        setFeed(feedRes.value.data.events || []);
      }
      if (statsRes.status === "fulfilled") {
        setStats(statsRes.value.data);
      }
      if (moversRes.status === "fulfilled") {
        setTopMovers(moversRes.value.data);
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
    api.get(`/api/v1/market-pulse/coin/${selectedCoin}`)
      .then((res) => setCoinDetail(res.data))
      .catch(() => setCoinDetail(null));
  }, [selectedCoin]);

  // ═════════ DERIVED (UNCHANGED) ═════════

  const filteredFeed = useMemo(() => {
    if (!searchPair) return feed;
    const q = searchPair.toUpperCase();
    return feed.filter((e) => e.pair?.includes(q));
  }, [feed, searchPair]);

  // Pump = bullish / upside move; Dump = bearish / downside move.
  // Mirrors the heatmap direction logic so classification is consistent.
  const pumpFeed = useMemo(() => filteredFeed.filter(isPumpEvent), [filteredFeed]);
  const dumpFeed = useMemo(() => filteredFeed.filter((e) => !isPumpEvent(e)), [filteredFeed]);

  const sideFeed =
    feedSide === "pump" ? pumpFeed : feedSide === "dump" ? dumpFeed : filteredFeed;

  const groupedSide = useMemo(() => groupConsecutive(sideFeed), [sideFeed]);
  const groupedPump = useMemo(() => groupConsecutive(pumpFeed), [pumpFeed]);
  const groupedDump = useMemo(() => groupConsecutive(dumpFeed), [dumpFeed]);

  const activeCoins = useMemo(() => {
    const map = {};
    feed.forEach((e) => {
      if (!map[e.pair]) map[e.pair] = 0;
      map[e.pair]++;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [feed]);

  const bullBearRatio = useMemo(() => {
    if (!stats?.hourly)
      return { bull: 0, bear: 0, total: 0, bullPct: 50, verdict: "neutral", adRatio: null };
    const bull = stats.hourly.bullish || 0;
    const bear = stats.hourly.bearish || 0;
    const total = bull + bear;
    const bullPct = total > 0 ? (bull / total) * 100 : 50;
    // Verdict thresholds ~ advance/decline breadth read.
    const verdict = bullPct >= 58 ? "bull" : bullPct <= 42 ? "bear" : "neutral";
    const adRatio = bear > 0 ? bull / bear : bull > 0 ? Infinity : null;
    return { bull, bear, total, bullPct, verdict, adRatio };
  }, [stats]);

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

  // Heatmap is built from the LIVE FEED (every unique coin in the stream), not
  // the 12-capped stats query — so it shows as many coins as the feed carries.
  const heatmapEnriched = useMemo(() => {
    if (!feed || feed.length === 0) return [];
    const m = {};
    feed.forEach((e) => {
      const p = e.pair;
      if (!p) return;
      if (!m[p]) m[p] = { pair: p, event_count: 0, max_up: 0, max_down: 0 };
      m[p].event_count += 1;
      const pc = Number(e.pct_change) || 0;
      const bull = e.direction === "bullish" || (e.direction !== "bearish" && pc >= 0);
      if (bull) m[p].max_up = Math.max(m[p].max_up, Math.abs(pc));
      else m[p].max_down = Math.min(m[p].max_down, -Math.abs(pc));
    });
    let items = Object.values(m);
    if (heatmapSortMode === "pct") {
      items.sort(
        (a, b) =>
          Math.max(Math.abs(b.max_up), Math.abs(b.max_down)) -
          Math.max(Math.abs(a.max_up), Math.abs(a.max_down))
      );
    } else {
      items.sort((a, b) => b.event_count - a.event_count);
    }
    return items;
  }, [feed, heatmapSortMode]);

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

  // Tag class — keep emerald/red bull/bear colors per user request, just flatten styling
  const eventTagClass = (e) => {
    const type = e.event_type?.toLowerCase() || "";
    if (type.includes("high break") || type.includes("strong rally") || type.includes("breakout"))
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/25";
    if (type.includes("low break") || type.includes("breakdown"))
      return "bg-red-500/10 text-red-300 border-red-500/25";
    if (type.includes("pullback") || type.includes("dip"))
      return "bg-amber-500/10 text-amber-300 border-amber-500/25";
    if (type === "flash_move")
      return "bg-red-500/10 text-red-300 border-red-500/25";
    if (type === "rapid_move")
      return "bg-amber-500/10 text-amber-300 border-amber-500/25";
    if (e.direction === "bullish")
      return "bg-emerald-500/[0.06] text-emerald-300/80 border-emerald-500/15";
    return "bg-red-500/[0.06] text-red-300/80 border-red-500/15";
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

  const openChartModal = (pair) => {
    if (!pair) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("pair", pair);
      return next;
    });
  };

  const closeChartModal = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("pair");
      return next;
    });
  };

  const flashMovesPreview = useMemo(() => {
    return (topMovers?.flash_moves || []).slice(0, 2);
  }, [topMovers]);

  // ═════════ RENDER ═════════

  return (
    <div className="space-y-6 pb-10">
      <PulseStyles />

      {/* ═══ PAGE HEADER (Flowscan: gradient title + subtitle + live pill) ═══ */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-primary/70 mb-2">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold-primary/40 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold-primary/80" />
            </span>
            <span>Live Market Activity</span>
          </div>
          <h1
            className="text-2xl sm:text-3xl font-semibold tracking-tight leading-none"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, rgba(255,255,255,0.7) 60%, rgba(212,168,83,0.85) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Market Pulse
          </h1>
          <p className="text-sm text-text-muted/70 mt-2">
            Real-time event flow across{" "}
            <span className="text-text-primary/85 font-mono tabular-nums">{stats?.hourly?.unique_coins || 0}</span>{" "}
            coins · auto-refresh 10s
          </p>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="hidden sm:inline text-[11px] text-text-muted/50 font-mono tabular-nums">
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                })}`
              : "Loading…"}
          </span>
          <div className="flex h-8 items-center gap-2 border border-emerald-500/25 bg-emerald-500/[0.06] rounded-md px-2.5">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              {!loading && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                  loading ? "bg-amber-500" : "bg-emerald-500"
                }`}
              />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-emerald-400">
              {loading ? "Sync" : "Live"}
            </span>
          </div>
        </div>
      </header>

      {/* ═══ PULSE TAPE (Flowscan card pattern + scrolling ticker) ═══ */}
      {tapeItems.length > 0 && <PulseTape items={tapeItems} onSelect={openChartModal} />}

      {/* ═══ MARKET BIAS — at-a-glance breadth verdict (short/long bias) ═══ */}
      <MarketBiasBanner ratio={bullBearRatio} pumpCount={pumpFeed.length} dumpCount={dumpFeed.length} />

      {/* ═══ KPI CARDS — Flowscan stat card pattern ═══ */}
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
        <KpiBiggestMove biggest={stats?.hourly?.biggest_move} onSelect={openChartModal} />
      </div>

      {/* ═══ CONTROL BAR (Flowscan card + filter pills) ═══ */}
      <ControlBar
        searchPair={searchPair}
        setSearchPair={setSearchPair}
        setSelectedCoin={setSelectedCoin}
        activeCoins={activeCoins}
        selectedCoin={selectedCoin}
        selectCoin={selectCoin}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        timeframeFilter={timeframeFilter}
        setTimeframeFilter={setTimeframeFilter}
        coinDetail={coinDetail}
        timeAgo={timeAgo}
        openChartModal={openChartModal}
      />

      {/* ═══ MAIN GRID ═══ */}
      <div className={`mp-main-grid ${sidebarOpen ? "" : "mp-sidebar-collapsed"}`}>
        <div className="mp-feed-col">
          <ActivityFeedPanel
            filteredFeed={filteredFeed}
            feed={feed}
            loading={loading}
            feedLayout={feedLayout}
            changeLayout={changeLayout}
            feedSide={feedSide}
            setFeedSide={setFeedSide}
            groupedSide={groupedSide}
            groupedPump={groupedPump}
            groupedDump={groupedDump}
            pumpCount={pumpFeed.length}
            dumpCount={dumpFeed.length}
            sideCount={sideFeed.length}
            coinHistograms={coinHistograms}
            selectedCoin={selectedCoin}
            openChartModal={openChartModal}
            eventTagClass={eventTagClass}
            eventLabel={eventLabel}
            timeAgo={timeAgo}
            expandedGroups={expandedGroups}
            toggleGroup={toggleGroup}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={toggleSidebar}
          />
        </div>

        <div className="mp-side-slot">
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

            <FlashMovesPanel moves={topMovers?.flash_moves} onSelect={openChartModal} />

            <SummaryPanel daily={stats?.daily} className="mp-sidebar-stretch" />
          </div>

          {/* Collapsed rail — click to re-open the side panel */}
          <button
            type="button"
            onClick={toggleSidebar}
            aria-expanded={sidebarOpen}
            aria-label="Show side panel"
            title="Show side panel"
            className="mp-sidebar-rail group relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md hover:border-gold-primary/30 transition-colors"
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-md border border-white/[0.08] bg-white/[0.03] text-text-muted/70 group-hover:text-gold-primary transition-colors">
              <IconChevronsLeft className="h-3.5 w-3.5" />
            </span>
            <span className="mp-rail-label text-[9px] font-semibold uppercase tracking-[0.22em] text-text-muted/60 group-hover:text-text-primary transition-colors">
              Market Panel
            </span>
          </button>
        </div>
      </div>

      {chartModalPair && (
        <CoinChartModal pair={chartModalPair} onClose={closeChartModal} />
      )}

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="market-pulse" />
    </div>
  );
};

// Wrap in the shared SignalStatusProvider so every CoinLogo on this page shows
// a live "called" dot (latest LuxQuant call per pair) and opens the global
// signal modal on click — exactly like the Terminal scan page.
const MarketPulsePage = () => (
  <SignalStatusProvider>
    <MarketPulsePageInner />
    <GlobalSignalModalHost />
  </SignalStatusProvider>
);

export default MarketPulsePage;

// ════════════════════════════════════════════════════════
// PULSE TAPE — Flowscan card pattern + scrolling ticker
// ════════════════════════════════════════════════════════

const PulseTape = ({ items, onSelect }) => {
  const tape = [...items, ...items];
  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)]">
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#0a0805] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#0a0805] to-transparent z-10 pointer-events-none" />
      <div className="flex gap-8 py-2.5 animate-pulse-tape whitespace-nowrap relative z-0">
        {tape.map((m, i) => {
          const symbol = stripQuote(m.pair);
          const pos = (m.pct_change || 0) >= 0;
          return (
            <button
              key={i}
              onClick={() => onSelect?.(m.pair)}
              className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity px-1 group"
            >
              <CoinLogo pair={m.pair} size={16} />
              <span className="text-text-primary/90 text-[11px] font-medium tracking-tight">{symbol}</span>
              <span
                className={`text-[11px] font-mono tabular-nums flex items-center gap-1 ${
                  pos ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {pos ? <IconArrowUpTri /> : <IconArrowDownTri />}
                {Math.abs(m.pct_change || 0).toFixed(2)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// MARKET BIAS BANNER — breadth verdict (short/long bias, at a glance)
// ════════════════════════════════════════════════════════

const MarketBiasBanner = ({ ratio, pumpCount, dumpCount }) => {
  const { bull, bear, bullPct, verdict, adRatio } = ratio;
  const bearPct = 100 - bullPct;
  const cfg = {
    bull: { label: "Bullish", bias: "Long bias", color: "#34d399", text: "text-emerald-400", chip: "bg-emerald-500/[0.12] text-emerald-400 border-emerald-500/30" },
    bear: { label: "Bearish", bias: "Short bias", color: "#f87171", text: "text-red-400", chip: "bg-red-500/[0.12] text-red-400 border-red-500/30" },
    neutral: { label: "Neutral", bias: "No clear bias", color: "#e8c877", text: "text-gold-primary", chip: "bg-gold-primary/[0.12] text-gold-primary border-gold-primary/30" },
  }[verdict];

  const adDisplay =
    adRatio == null ? "—" : adRatio === Infinity ? "∞" : adRatio.toFixed(2);

  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#120809] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] px-4 py-3">
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
        {/* Verdict */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted/55 hidden sm:inline">
            Market Bias · 1h
          </span>
          <div className="flex items-center gap-2">
            <span className={`text-lg sm:text-xl font-medium leading-none tracking-tight ${cfg.text}`}>
              {cfg.label}
            </span>
            <span className={`text-[10px] font-mono tabular-nums px-2 py-0.5 rounded-md border font-medium uppercase tracking-[0.1em] ${cfg.chip}`}>
              {cfg.bias}
            </span>
          </div>
        </div>

        {/* Diverging bar */}
        <div className="flex-1 min-w-0">
          <div className="h-2 rounded-full overflow-hidden bg-white/[0.05] flex">
            <div className="bg-emerald-500/80 transition-all duration-500" style={{ width: `${bullPct}%` }} />
            <div className="bg-red-500/80 transition-all duration-500" style={{ width: `${bearPct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between font-mono tabular-nums text-[10px]">
            <span className="text-emerald-400 flex items-center gap-1">
              <IconArrowUpTri className="h-2 w-2" /> {bull} pumps · {Math.round(bullPct)}%
            </span>
            <span className="text-red-400 flex items-center gap-1">
              {Math.round(bearPct)}% · {bear} dumps <IconArrowDownTri className="h-2 w-2" />
            </span>
          </div>
        </div>

        {/* A/D ratio */}
        <div className="flex-shrink-0 flex items-center gap-1.5 border-t sm:border-t-0 sm:border-l border-white/[0.06] pt-2 sm:pt-0 sm:pl-5">
          <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted/45">A/D</span>
          <span className="text-sm font-mono tabular-nums font-medium text-text-primary leading-none">{adDisplay}</span>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// KPI CARDS — Flowscan stat card pattern (flat + hairline + inset shadow)
// ════════════════════════════════════════════════════════

const StatCardShell = ({ children }) => (
  <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#120809] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-4 transition-all duration-200 hover:border-white/[0.10] hover:bg-[#150a0c]">
    <div className="relative z-10 h-full flex flex-col">{children}</div>
  </div>
);

// ── KPI: Events with mini histogram ─────────────────────
const KpiEvents = ({ total, uniqueCoins, histogram }) => {
  const max = Math.max(1, ...histogram.map((b) => b.bull + b.bear));
  return (
    <StatCardShell>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted/60">
          Events · 1h
        </span>
        <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted/40">
          live
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl sm:text-[28px] font-light text-text-primary leading-none tabular-nums tracking-tight">
          {total}
        </span>
        <span className="text-[11px] font-mono text-text-muted/55 tabular-nums">
          / {uniqueCoins} coins
        </span>
      </div>
      <div className="mt-auto pt-3 flex items-end gap-[2px] h-4">
        {histogram.map((b, i) => {
          const tot = b.bull + b.bear;
          const pct = (tot / max) * 100;
          const bullRatio = tot > 0 ? b.bull / tot : 0;
          return (
            <div key={i} className="flex-1 flex flex-col-reverse" style={{ height: `${pct}%` }}>
              {b.bull > 0 && (
                <div
                  className="bg-emerald-500/75 rounded-[1px]"
                  style={{ height: `${bullRatio * 100}%` }}
                />
              )}
              {b.bear > 0 && (
                <div
                  className="bg-red-500/75 rounded-[1px]"
                  style={{ height: `${(1 - bullRatio) * 100}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
    </StatCardShell>
  );
};

// ── KPI: Bull/Bear ratio ────────────────────────────────
const KpiBullBear = ({ ratio }) => {
  const dom = ratio.bull >= ratio.bear ? "bull" : "bear";
  return (
    <StatCardShell>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted/60">
          Bull · Bear · 1h
        </span>
        {ratio.total > 0 && (
          <span
            className={`text-[10px] font-mono tabular-nums flex items-center gap-0.5 ${
              dom === "bull" ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {dom === "bull" ? <IconArrowUpTri /> : <IconArrowDownTri />}
            {Math.abs(ratio.bull - ratio.bear)}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl sm:text-[26px] font-light text-emerald-400 leading-none tabular-nums tracking-tight">
          {ratio.bull}
        </span>
        <span className="text-base text-text-muted/30">/</span>
        <span className="text-2xl sm:text-[26px] font-light text-red-400 leading-none tabular-nums tracking-tight">
          {ratio.bear}
        </span>
      </div>
      {ratio.total > 0 && (
        <div className="mt-auto pt-3">
          <div className="h-1 rounded-full overflow-hidden bg-white/[0.04] flex">
            <div
              className="bg-emerald-500/80 transition-all duration-500"
              style={{ width: `${ratio.bullPct}%` }}
            />
            <div
              className="bg-red-500/80 transition-all duration-500"
              style={{ width: `${100 - ratio.bullPct}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono tabular-nums">
            <span className="text-[10px] text-emerald-400">{Math.round(ratio.bullPct)}%</span>
            <span className="text-[10px] text-red-400">{Math.round(100 - ratio.bullPct)}%</span>
          </div>
        </div>
      )}
    </StatCardShell>
  );
};

// ── KPI: Flash Moves ────────────────────────────────────
const KpiFlash = ({ count, previews, onSelect }) => (
  <StatCardShell>
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted/60">
        Flash Moves · 1h
      </span>
      {count > 0 && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
        </span>
      )}
    </div>
    <div className="flex items-baseline gap-2">
      <span
        className={`text-2xl sm:text-[28px] font-light leading-none tabular-nums tracking-tight ${
          count > 0 ? "text-amber-400" : "text-text-primary"
        }`}
      >
        {count}
      </span>
      <span className="text-[11px] font-mono text-text-muted/55">spikes</span>
    </div>
    <div className="mt-auto pt-3 space-y-1.5">
      {previews.length > 0 ? (
        previews.map((p, i) => {
          const symbol = stripQuote(p.pair);
          const pct = Math.min(Math.abs(p.pct_change || 0) / 10, 1);
          return (
            <button
              key={i}
              onClick={() => onSelect(p.pair)}
              className="w-full flex items-center gap-2 group"
            >
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted/60 w-10 truncate text-left group-hover:text-text-primary transition-colors">
                {symbol}
              </span>
              <div className="flex-1 h-[3px] bg-amber-500/15 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500/80 h-full rounded-full"
                  style={{ width: `${pct * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-mono tabular-nums text-amber-400/80">
                {p.move_seconds}s
              </span>
            </button>
          );
        })
      ) : (
        <p className="text-text-muted/40 text-[10px]">No flash moves yet</p>
      )}
    </div>
  </StatCardShell>
);

// ── KPI: Biggest Move (click to open chart) ─────────────
const KpiBiggestMove = ({ biggest, onSelect }) => {
  if (!biggest?.pair) {
    return (
      <StatCardShell>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted/60">
          Biggest Move · 1h
        </span>
        <p className="text-text-primary text-2xl sm:text-[28px] font-light mt-2 leading-none tabular-nums">
          —
        </p>
        <p className="text-text-muted/40 text-[10px] mt-auto pt-3">No data yet</p>
      </StatCardShell>
    );
  }
  const symbol = stripQuote(biggest.pair);
  const pos = (biggest.pct_change || 0) >= 0;
  return (
    <button
      onClick={() => onSelect(biggest.pair)}
      className="text-left relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#120809] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-4 transition-all duration-200 hover:border-gold-primary/30 hover:bg-[#150a0c] cursor-pointer"
    >
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted/60">
            Biggest Move · 1h
          </span>
          <IconChartLine className="h-3 w-3 text-text-muted/30" />
        </div>
        <div className="flex items-center gap-2.5 mb-2">
          <CoinLogo pair={biggest.pair} size={22} />
          <div className="min-w-0">
            <p className="text-text-primary text-[13px] font-medium truncate leading-tight">
              {titleCase(symbol)}
            </p>
            <p className="text-text-muted/55 text-[10px] font-mono tabular-nums leading-tight mt-0.5">
              {biggest.pair}
            </p>
          </div>
        </div>
        <p
          className={`text-2xl sm:text-[26px] font-light leading-none tabular-nums tracking-tight mt-auto ${
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

// ════════════════════════════════════════════════════════
// CONTROL BAR — Flowscan card with filter pills
// ════════════════════════════════════════════════════════

const ControlBar = ({
  searchPair, setSearchPair, setSelectedCoin,
  activeCoins, selectedCoin, selectCoin,
  sourceFilter, setSourceFilter,
  timeframeFilter, setTimeframeFilter,
  coinDetail, timeAgo, openChartModal,
}) => (
  <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_1px_2px_0_rgba(0,0,0,0.15)]">
    <div className="relative z-10 p-4 flex flex-col gap-3">
      {/* Row 1: Search + active coin pills */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
        <label className="group flex h-9 min-w-0 md:w-52 flex-shrink-0 items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-md px-3 transition-colors focus-within:border-gold-primary/30 focus-within:bg-white/[0.05]">
          <IconSearch className="h-3.5 w-3.5 text-text-muted/55 transition-colors group-focus-within:text-gold-primary/70 shrink-0" />
          <input
            type="text"
            placeholder="Search coin..."
            value={searchPair}
            onChange={(e) => {
              setSearchPair(e.target.value);
              setSelectedCoin(null);
            }}
            className="w-full min-w-0 bg-transparent text-[12px] font-mono outline-none placeholder:text-text-muted/40 text-text-primary"
          />
        </label>

        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {activeCoins.map(([pair, count]) => {
            const symbol = stripQuote(pair);
            const isSelected = selectedCoin === pair;
            return (
              <button
                key={pair}
                onClick={() => selectCoin(pair)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition-all border ${
                  isSelected
                    ? "bg-gold-primary/15 text-text-primary border-gold-primary/40"
                    : "bg-white/[0.03] text-text-muted/80 border-white/[0.06] hover:border-white/[0.14] hover:text-text-primary"
                }`}
              >
                <CoinLogo pair={pair} size={14} />
                <span className="font-medium tracking-tight">{symbol}</span>
                <span
                  className={`text-[9px] font-mono tabular-nums px-1 rounded-sm ${
                    isSelected ? "bg-gold-primary/20 text-gold-primary" : "bg-white/[0.05] text-text-muted/55"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 2: Source + Timeframe filter pills */}
      <div className="flex flex-wrap gap-1.5 items-center pt-3 border-t border-white/[0.04]">
        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-text-muted/55 mr-1">
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

        <div className="w-px h-3.5 bg-white/[0.08] mx-2" />

        <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-text-muted/55 mr-1">
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

        <span className="ml-auto text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted/40">
          24h rolling
        </span>
      </div>
    </div>

    {coinDetail && selectedCoin && (
      <CoinDetailBanner
        pair={selectedCoin}
        coinDetail={coinDetail}
        timeAgo={timeAgo}
        onClose={() => {/* parent handles via selectCoin */}}
        onOpenChart={openChartModal}
      />
    )}
  </div>
);

// ── Filter Pill ─────────────────────────────────────────
const FilterPill = ({ active, onClick, label }) => (
  <button
    onClick={onClick}
    className={`px-2.5 py-1 rounded-md text-[10px] font-medium uppercase tracking-[0.15em] transition-all border ${
      active
        ? "bg-gold-primary/15 text-text-primary border-gold-primary/40"
        : "bg-white/[0.03] text-text-muted/70 border-white/[0.06] hover:border-white/[0.14] hover:text-text-primary"
    }`}
  >
    {label}
  </button>
);

// ── Coin Detail Banner (Flowscan inset panel) ───────────
const CoinDetailBanner = ({ pair, coinDetail, timeAgo, onClose, onOpenChart }) => {
  const symbol = stripQuote(pair);
  const stats = coinDetail.stats;
  const bullPct = stats.bull_pct;
  return (
    <div className="border-t border-gold-primary/15 bg-gradient-to-r from-gold-primary/[0.04] to-transparent p-4">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-3">
          <CoinLogo pair={pair} size={32} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-text-primary font-medium text-[15px] tracking-tight">
                {titleCase(symbol)}
              </span>
              <span className="text-text-muted/55 text-[10px] font-mono tabular-nums">{pair}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-sm border font-mono uppercase tracking-[0.12em] ${
                  bullPct >= 60
                    ? "bg-emerald-500/[0.08] text-emerald-300 border-emerald-500/20"
                    : bullPct <= 40
                    ? "bg-red-500/[0.08] text-red-300 border-red-500/20"
                    : "bg-amber-500/[0.08] text-amber-300 border-amber-500/20"
                }`}
              >
                {bullPct}% bull
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onOpenChart && (
            <button
              onClick={() => onOpenChart(pair)}
              className="flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md border border-gold-primary/30 text-gold-primary hover:bg-gold-primary/10 hover:border-gold-primary/50 transition-all font-medium uppercase tracking-[0.12em]"
            >
              <IconChartLine className="h-3 w-3" />
              <span>Chart</span>
            </button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <DetailStat label="Strongest Up" value={`+${stats.strongest_up || 0}%`} accent="emerald" />
        <DetailStat label="Strongest Down" value={`${stats.strongest_down || 0}%`} accent="red" />
        <DetailStat label="Events 24h" value={stats.total_events} />
        <DetailStat label="Last Activity" value={timeAgo(stats.last_activity)} />
      </div>
    </div>
  );
};

const DetailStat = ({ label, value, accent }) => {
  const colorMap = { emerald: "text-emerald-400", red: "text-red-400" };
  return (
    <div className="bg-[#120809] rounded-md p-2.5 text-center border border-white/[0.04]">
      <p className={`text-sm font-mono font-medium tabular-nums leading-none ${colorMap[accent] || "text-text-primary"}`}>
        {value}
      </p>
      <p className="text-text-muted/55 text-[9px] uppercase tracking-[0.18em] mt-1.5 font-mono">
        {label}
      </p>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// MINI SPARKBAR (used in feed rows, group headers, mover panel)
// ════════════════════════════════════════════════════════

const MiniSparkbar = ({ histogram, height = 18, gap = 1.5 }) => {
  if (!histogram || histogram.length === 0) return null;

  if (histogram.length === 1) {
    const h = histogram[0];
    return (
      <div className="flex items-center justify-end" style={{ height }}>
        <div
          className={`rounded-full ${h.bull ? "bg-emerald-500/80" : "bg-red-500/80"}`}
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
            className={`w-[3px] rounded-[1px] ${h.bull ? "bg-emerald-500/75" : "bg-red-500/75"}`}
            style={{ height: `${10 + mag * 90}%` }}
          />
        );
      })}
    </div>
  );
};

// ════════════════════════════════════════════════════════
// ACTIVITY FEED PANEL — Flowscan main card pattern
// ════════════════════════════════════════════════════════

// ── Segmented control (mode switch + side filter) — Flowscan pill group ──
const SegGroup = ({ options, value, onChange }) => (
  <div className="flex bg-white/[0.03] rounded-md p-0.5 border border-white/[0.06]">
    {options.map((opt) => {
      const active = value === opt.value;
      const activeClass =
        opt.accent === "emerald"
          ? "bg-emerald-500/15 text-emerald-400"
          : opt.accent === "red"
          ? "bg-red-500/15 text-red-400"
          : "bg-gold-primary/15 text-gold-primary";
      return (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 rounded-sm text-[9.5px] font-medium uppercase tracking-[0.14em] transition-all ${
            active ? activeClass : "text-text-muted/60 hover:text-text-primary"
          }`}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

// ── Feed list renderer (shared by all layout modes) ──────
const FeedList = ({
  grouped, keyPrefix, coinHistograms, selectedCoin, openChartModal,
  eventTagClass, eventLabel, timeAgo, expandedGroups, toggleGroup,
}) =>
  grouped.map((group, gi) => {
    if (group.events.length === 1) {
      const event = group.events[0];
      return (
        <FeedRow
          key={`${keyPrefix}-single-${event.source}-${event.id}`}
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
    const gkey = `${keyPrefix}-${gi}-${group.pair}`;
    const isExpanded = expandedGroups[gkey] !== false;
    const avgPct =
      group.events.reduce((s, e) => s + (e.pct_change || 0), 0) / group.events.length;
    return (
      <div key={`${keyPrefix}-group-${gi}-${group.pair}`}>
        <FeedGroupHeader
          group={group}
          avgPct={avgPct}
          expanded={isExpanded}
          onToggle={(e) => toggleGroup(gkey, e)}
          isSelected={selectedCoin === group.pair}
          onSelectCoin={() => openChartModal(group.pair)}
        />
        {isExpanded &&
          group.events.map((event) => (
            <FeedSubRow
              key={`${keyPrefix}-sub-${event.source}-${event.id}`}
              event={event}
              eventTagClass={eventTagClass}
              eventLabel={eventLabel}
              timeAgo={timeAgo}
              onSelect={() => openChartModal(event.pair)}
            />
          ))}
      </div>
    );
  });

const FeedEmpty = ({ label = "No events match your filters" }) => (
  <div className="p-12 flex flex-col items-center justify-center gap-3">
    <IconEmpty className="h-7 w-7 text-text-muted/30" />
    <div className="text-text-muted/60 text-[11px] font-mono uppercase tracking-[0.15em] text-center">
      {label}
    </div>
  </div>
);

// ── Split column header (Pumps / Dumps) ─────────────────
const SplitColHeader = ({ dir, count }) => {
  const isPump = dir === "pump";
  return (
    <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.015] flex-shrink-0">
      <span
        className={`text-[10px] font-semibold uppercase tracking-[0.16em] flex items-center gap-1.5 ${
          isPump ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isPump ? <IconArrowUpTri className="h-2.5 w-2.5" /> : <IconArrowDownTri className="h-2.5 w-2.5" />}
        {isPump ? "Pumps" : "Dumps"}
      </span>
      <span className="text-[9.5px] font-mono tabular-nums text-text-muted/50">{count}</span>
    </div>
  );
};

const ActivityFeedPanel = ({
  filteredFeed, feed, loading,
  feedLayout, changeLayout, feedSide, setFeedSide,
  groupedSide, groupedPump, groupedDump,
  pumpCount, dumpCount, sideCount,
  coinHistograms, selectedCoin, openChartModal, eventTagClass, eventLabel, timeAgo,
  expandedGroups, toggleGroup, sidebarOpen, onToggleSidebar,
}) => {
  const isSplit = feedLayout === "split";
  const isFocus = feedLayout === "focus";

  const listProps = {
    coinHistograms, selectedCoin, openChartModal,
    eventTagClass, eventLabel, timeAgo, expandedGroups, toggleGroup,
  };

  const headerCount = isSplit ? pumpCount + dumpCount : sideCount;

  const sideOptions = isFocus
    ? [
        { value: "pump", label: "Pumps", accent: "emerald" },
        { value: "dump", label: "Dumps", accent: "red" },
      ]
    : [
        { value: "all", label: "All" },
        { value: "pump", label: "Pumps", accent: "emerald" },
        { value: "dump", label: "Dumps", accent: "red" },
      ];

  return (
    <div className="relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_1px_2px_0_rgba(0,0,0,0.15)] mp-feed-card">
      {/* Header strip */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3 bg-white/[0.015] flex-shrink-0 relative z-10 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
          </span>
          <h2 className="text-[11px] font-semibold text-text-primary uppercase tracking-[0.2em]">
            Activity Feed
          </h2>
          <span className="text-[10px] font-mono tabular-nums text-text-muted/45">
            {headerCount}
          </span>
        </div>

        {/* View controls: layout + side */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isSplit && (
            <SegGroup options={sideOptions} value={feedSide} onChange={setFeedSide} />
          )}
          <SegGroup
            options={[
              { value: "unified", label: "Unified" },
              { value: "split", label: "Split" },
              { value: "focus", label: "Focus" },
            ]}
            value={feedLayout}
            onChange={changeLayout}
          />

          {/* Collapse side panel (desktop only) */}
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? "Hide side panel" : "Show side panel"}
              title={sidebarOpen ? "Hide side panel" : "Show side panel"}
              className="hidden lg:inline-flex items-center justify-center w-7 h-7 rounded-md border border-white/[0.06] bg-white/[0.03] text-text-muted/70 hover:text-gold-primary hover:border-gold-primary/30 transition-colors"
            >
              {sidebarOpen ? <IconChevronsRight className="h-3.5 w-3.5" /> : <IconChevronsLeft className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {isSplit ? (
        <div className="mp-split-grid relative z-10">
          <div className="mp-split-col">
            <SplitColHeader dir="pump" count={pumpCount} />
            <div className="mp-feed-list pulse-feed-scroll">
              {loading && feed.length === 0 ? (
                <FeedSkeleton />
              ) : groupedPump.length === 0 ? (
                <FeedEmpty label="No pumps yet" />
              ) : (
                <FeedList grouped={groupedPump} keyPrefix="p" {...listProps} />
              )}
            </div>
          </div>
          <div className="mp-split-col">
            <SplitColHeader dir="dump" count={dumpCount} />
            <div className="mp-feed-list pulse-feed-scroll">
              {loading && feed.length === 0 ? (
                <FeedSkeleton />
              ) : groupedDump.length === 0 ? (
                <FeedEmpty label="No dumps yet" />
              ) : (
                <FeedList grouped={groupedDump} keyPrefix="d" {...listProps} />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mp-feed-list pulse-feed-scroll relative z-10">
          {loading && feed.length === 0 && <FeedSkeleton />}
          {!loading && groupedSide.length === 0 && (
            <FeedEmpty
              label={
                feedSide === "pump"
                  ? "No pumps match your filters"
                  : feedSide === "dump"
                  ? "No dumps match your filters"
                  : "No events match your filters"
              }
            />
          )}
          <FeedList grouped={groupedSide} keyPrefix="s" {...listProps} />
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-white/[0.06] text-center bg-white/[0.015] flex-shrink-0 relative z-10">
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-text-muted/45">
          Auto-refresh · 10s
        </span>
      </div>
    </div>
  );
};

// ── Feed Row (single event) ─────────────────────────────
const FeedRow = ({
  event, histogram, isSelected, onSelect, eventTagClass, eventLabel, timeAgo,
}) => {
  const symbol = stripQuote(event.pair);
  const isPositive = (event.pct_change || 0) >= 0;
  const magnitude = Math.min(Math.abs(event.pct_change || 0) / 10, 1);
  const statusCtx = useSignalStatus();
  const called = !!(statusCtx?.map && statusCtx.map[(event.pair || "").toUpperCase()]);
  return (
    <div
      onClick={onSelect}
      className={`relative grid grid-cols-[26px_minmax(0,1fr)_auto] md:grid-cols-[26px_minmax(0,1fr)_70px_22px_44px] items-center gap-3 px-4 py-2.5 hover:bg-white/[0.025] transition-colors cursor-pointer border-l-2 border-b border-white/[0.03] ${
        isSelected ? "bg-gold-primary/[0.04] border-l-gold-primary" : ""
      }`}
      style={{
        borderLeftColor: !isSelected
          ? isPositive
            ? `rgba(16,185,129,${0.18 + magnitude * 0.4})`
            : `rgba(239,68,68,${0.18 + magnitude * 0.4})`
          : undefined,
      }}
    >
      <CoinLogo pair={event.pair} size={26} />

      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-text-primary font-medium text-[12.5px] leading-none tracking-tight">
            {symbol}
          </span>
          <span
            className={`font-mono tabular-nums text-[12.5px] leading-none flex items-center gap-0.5 ${
              isPositive ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {isPositive ? <IconArrowUpTri /> : <IconArrowDownTri />}
            {isPositive ? "+" : ""}
            {event.pct_change}%
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-sm border font-mono uppercase tracking-[0.12em] hidden sm:inline-block ${eventTagClass(event)}`}
          >
            {eventLabel(event)}
          </span>
          {called && (
            <button
              onClick={(e) => { e.stopPropagation(); statusCtx?.openPair?.(event.pair); }}
              className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-sm border border-gold-primary/40 bg-gold-primary/10 text-gold-primary font-mono uppercase tracking-[0.12em] hover:bg-gold-primary/20 transition-colors"
              title="LuxQuant call — click for details"
            >
              <span className="w-1 h-1 rounded-full bg-gold-primary" /> Called
            </button>
          )}
        </div>
        <p className="text-text-muted/55 text-[10px] mt-1 font-mono tabular-nums">
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
        className={`hidden md:flex w-[22px] h-[22px] rounded-full items-center justify-center ${
          event.direction === "bullish"
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400"
        }`}
      >
        {event.direction === "bullish" ? <IconArrowUpTri /> : <IconArrowDownTri />}
      </div>

      <span className="text-text-muted/55 text-[10px] font-mono tabular-nums text-right">
        {timeAgo(event.created_at)}
      </span>
    </div>
  );
};

// ── Feed Group Header ───────────────────────────────────
const FeedGroupHeader = ({ group, avgPct, expanded, onToggle, isSelected, onSelectCoin }) => {
  const symbol = stripQuote(group.pair);
  const isPos = avgPct >= 0;
  const statusCtx = useSignalStatus();
  const called = !!(statusCtx?.map && statusCtx.map[(group.pair || "").toUpperCase()]);
  const groupHist = group.events
    .map((e) => ({ pct: e.pct_change || 0, bull: e.direction === "bullish" }))
    .reverse();
  return (
    <div
      onClick={onSelectCoin}
      className={`px-4 py-2 border-b border-white/[0.04] flex items-center gap-2.5 cursor-pointer transition-colors hover:bg-white/[0.025] ${
        isSelected ? "bg-gold-primary/[0.05]" : "bg-gold-primary/[0.015]"
      }`}
    >
      <CoinLogo pair={group.pair} size={26} />
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span className="text-text-primary text-[12.5px] font-medium tracking-tight">{symbol}</span>
        <span className="text-[9px] text-text-muted/55 px-1.5 py-0.5 bg-white/[0.04] rounded-sm font-mono uppercase tracking-wider">
          ×{group.events.length} events
        </span>
        {called && (
          <button
            onClick={(e) => { e.stopPropagation(); statusCtx?.openPair?.(group.pair); }}
            className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-sm border border-gold-primary/40 bg-gold-primary/10 text-gold-primary font-mono uppercase tracking-[0.12em] hover:bg-gold-primary/20 transition-colors"
            title="LuxQuant call — click for details"
          >
            <span className="w-1 h-1 rounded-full bg-gold-primary" /> Called
          </button>
        )}
      </div>
      <MiniSparkbar histogram={groupHist} height={16} gap={2} />
      <span
        className={`text-[11px] font-mono tabular-nums font-medium min-w-[60px] text-right flex items-center justify-end gap-1 ${
          isPos ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isPos ? <IconArrowUpTri /> : <IconArrowDownTri />}
        {isPos ? "+" : ""}
        {avgPct.toFixed(2)}%
      </span>
      <button
        onClick={onToggle}
        className="w-[22px] h-[22px] rounded-sm border border-white/[0.08] text-text-muted/60 hover:text-text-primary hover:border-white/20 transition-colors flex items-center justify-center"
      >
        {expanded ? <IconChevronUp className="h-2.5 w-2.5" /> : <IconChevronDown className="h-2.5 w-2.5" />}
      </button>
    </div>
  );
};

// ── Feed Sub Row ────────────────────────────────────────
const FeedSubRow = ({ event, eventTagClass, eventLabel, timeAgo, onSelect }) => {
  const isPos = (event.pct_change || 0) >= 0;
  return (
    <div
      onClick={onSelect}
      className="grid grid-cols-[12px_minmax(0,1fr)_22px_44px] items-center gap-3 px-4 py-2 pl-14 border-b border-white/[0.025] hover:bg-white/[0.02] transition-colors cursor-pointer border-l-2"
      style={{ borderLeftColor: "rgba(212,168,83,0.4)" }}
    >
      <span className="text-text-muted/35 text-[9px] font-mono">→</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-text-muted/80 text-[12px]">{event.event_type || "—"}</span>
          <span
            className={`font-mono tabular-nums text-[12px] flex items-center gap-0.5 ${
              isPos ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {isPos ? <IconArrowUpTri /> : <IconArrowDownTri />}
            {isPos ? "+" : ""}
            {event.pct_change}%
          </span>
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-sm border font-mono uppercase tracking-[0.12em] hidden sm:inline-block ${eventTagClass(event)}`}
          >
            {eventLabel(event)}
          </span>
        </div>
        <p className="text-text-muted/50 text-[10px] mt-0.5 font-mono tabular-nums">
          {event.pair} ·{" "}
          {event.source === "price_movement"
            ? `${event.move_seconds}s move`
            : `${event.timeframe || "—"} TF`}
        </p>
      </div>
      <div
        className={`w-[18px] h-[18px] rounded-full flex items-center justify-center ${
          event.direction === "bullish"
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400"
        }`}
      >
        {event.direction === "bullish" ? <IconArrowUpTri /> : <IconArrowDownTri />}
      </div>
      <span className="text-text-muted/50 text-[10px] font-mono tabular-nums text-right">
        {timeAgo(event.created_at)}
      </span>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// HEATMAP — Treemap (size scales with rank) — Flowscan card
// ════════════════════════════════════════════════════════

const heatFill = (isBull, pct) => {
  const intensity = Math.min(Math.abs(pct || 0) / 12, 0.85);
  return isBull
    ? `rgba(16,185,129,${0.12 + intensity * 0.42})`
    : `rgba(239,68,68,${0.12 + intensity * 0.42})`;
};

// Treemap cell — recharts SVG cell (same chart model as the Terminal
// Liquidations map) with a <foreignObject> so it can embed the real <CoinLogo>
// (logo + automatic initials-circle fallback; never a broken image). Sharp
// edges, tight seams. Gold border + CALL tag + click on LuxQuant calls.
function HeatCell(props) {
  const { x, y, width, height, name, pair, pct = 0, isBull, eventCount = 1, called, onPick } = props;
  if (!name || width <= 1 || height <= 1) return null;
  const sym = stripQuote(name);
  const med = width > 32 && height > 22;
  const big = width > 54 && height > 44;
  const logo = Math.min(30, Math.max(13, Math.min(width, height) * 0.3));
  return (
    <g style={{ cursor: "pointer" }} onClick={() => onPick?.(pair, called)}>
      <rect
        x={x} y={y} width={width} height={height}
        style={{
          fill: heatFill(isBull, pct),
          stroke: called ? "rgba(212,168,83,0.95)" : "#0a0806",
          strokeWidth: called ? 2 : 1.5,
        }}
      />
      {med && (
        <foreignObject x={x} y={y} width={width} height={height} style={{ pointerEvents: "none" }}>
          <div
            style={{
              width: "100%", height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2, padding: 2,
              overflow: "hidden", boxSizing: "border-box",
            }}
          >
            {big && <CoinLogo pair={pair} size={logo} />}
            <span style={{ color: "#fff", fontWeight: 700, fontSize: big ? 12.5 : 10.5, lineHeight: 1.05, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sym}
            </span>
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: big ? 12 : 9.5, lineHeight: 1.05, color: isBull ? "#6ee7b7" : "#fca5a5" }}>
              {pct >= 0 ? "+" : ""}{Number(pct).toFixed(1)}%
            </span>
          </div>
        </foreignObject>
      )}
      {med && (
        <text x={x + 4} y={y + 11} fill="rgba(255,255,255,0.5)" fontSize={8.5} fontFamily="ui-monospace, monospace">×{eventCount}</text>
      )}
      {called && med && (
        <text x={x + width - 4} y={y + 11} textAnchor="end" fill="#e8c877" fontSize={8} fontWeight={800} fontFamily="ui-monospace, monospace" letterSpacing="0.06em">CALL</text>
      )}
    </g>
  );
}

// Packed treemap (size = activity, color = direction) — recharts Treemap.
function HeatTreemap({ data, height, onPick }) {
  const nodes = useMemo(
    () =>
      (data || []).map((c) => {
        const upAbs = Math.abs(c.max_up || 0);
        const downAbs = Math.abs(c.max_down || 0);
        const pct = upAbs >= downAbs ? c.max_up || 0 : c.max_down || 0;
        const ev = Math.max(1, c.event_count || 1);
        return { name: c.pair, pair: c.pair, size: 3 + Math.pow(ev, 0.8), pct, isBull: pct >= 0, eventCount: ev, called: !!c.called };
      }),
    [data]
  );

  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload || {};
    if (!d.name) return null;
    return (
      <div className="rounded-md border border-white/10 bg-[#0c0a07]/95 px-3 py-2 text-[11px] shadow-xl">
        <div className="font-medium text-text-primary mb-0.5">{stripQuote(d.name)} {d.called && <span className="text-gold-primary">· CALL</span>}</div>
        <div className="font-mono" style={{ color: d.isBull ? "#6ee7b7" : "#fca5a5" }}>{d.pct >= 0 ? "+" : ""}{Number(d.pct).toFixed(2)}%</div>
        <div className="font-mono text-text-muted">{d.eventCount} events</div>
      </div>
    );
  };

  if (nodes.length === 0)
    return (
      <div className="flex items-center justify-center text-text-muted/50 text-xs font-mono uppercase tracking-[0.15em]" style={{ height }}>
        No activity yet
      </div>
    );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap data={nodes} dataKey="size" aspectRatio={4 / 3} stroke="#0a0806" isAnimationActive={false} content={<HeatCell onPick={onPick} />}>
        <RTooltip content={<Tip />} />
      </Treemap>
    </ResponsiveContainer>
  );
}

const HeatmapPanel = ({ heatmap, selectedCoin, onSelect, sortMode, onSortChange }) => {
  const [expanded, setExpanded] = useState(false);
  const statusCtx = useSignalStatus();
  const calledMap = statusCtx?.map;

  const withCalled = useMemo(
    () => (heatmap || []).map((c) => ({ ...c, called: !!(calledMap && calledMap[(c.pair || "").toUpperCase()]) })),
    [heatmap, calledMap]
  );
  const inlineData = withCalled.slice(0, 48);

  const pick = (pair, called) => {
    if (called && statusCtx?.openPair) statusCtx.openPair(pair);
    else onSelect(pair);
  };

  const SortToggle = ({ big = false }) => (
    <div className="flex bg-white/[0.03] rounded-md p-0.5 border border-white/[0.06]">
      {["events", "pct"].map((k) => (
        <button
          key={k}
          onClick={() => onSortChange(k)}
          className={`${big ? "px-2.5 py-1 text-[10px]" : "px-2 py-0.5 text-[9px]"} rounded-sm font-medium uppercase tracking-[0.15em] transition-all ${sortMode === k ? "bg-gold-primary/15 text-gold-primary" : "text-text-muted/60 hover:text-text-primary"}`}
        >
          {k === "events" ? "Events" : "% Change"}
        </button>
      ))}
    </div>
  );

  const Legend = () => (
    <div className="mt-3 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[9px] font-mono text-text-muted/50">
      <span className="uppercase tracking-[0.15em]">
        Size = activity · Color = direction · <span className="text-gold-primary/80">gold = LuxQuant call</span>
      </span>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-emerald-500/60" /> bull</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-red-500/60" /> bear</span>
      </div>
    </div>
  );

  return (
    <>
      <PanelShell>
        <PanelHeader
          title="Heatmap"
          subtitle="1h"
          right={
            <div className="flex items-center gap-1.5">
              <SortToggle />
              <button
                onClick={() => setExpanded(true)}
                title="Expand heatmap"
                className="flex items-center justify-center w-6 h-6 rounded-md border border-white/[0.06] bg-white/[0.03] text-text-muted/70 hover:text-gold-primary hover:border-gold-primary/30 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3m13 5h3a2 2 0 0 0 2-2v-3" />
                </svg>
              </button>
            </div>
          }
        />
        <HeatTreemap data={inlineData} height={392} onPick={pick} />
        <Legend />
      </PanelShell>

      {expanded && createPortal(
        <div
          className="fixed inset-0 z-[95] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Heatmap expanded"
        >
          <div
            className="relative flex h-[min(92dvh,100%)] w-full max-w-6xl flex-col rounded-t-3xl border-t border-white/10 bg-[#0c0a07] p-4 shadow-[0_-12px_40px_rgba(0,0,0,0.55)] animate-[mpsheet-in_.3s_cubic-bezier(.16,1,.3,1)] sm:h-[calc(100vh-3rem)] sm:rounded-2xl sm:border sm:border-gold-primary/25 sm:bg-[#0b0907] sm:p-6 sm:shadow-2xl sm:animate-[mppanel-in_.28s_cubic-bezier(.16,1,.3,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex justify-center sm:hidden" aria-hidden="true">
              <div className="h-1 w-10 rounded-full bg-white/20" />
            </div>
            <span className="pointer-events-none absolute inset-x-0 top-0 hidden h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent sm:block" />
            <div className="mb-3 flex shrink-0 items-center justify-between sm:mb-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-[15px] font-semibold text-text-primary">Heatmap</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted/60">
                  {withCalled.length} coins · 1h
                </span>
              </div>
              <div className="flex items-center gap-2">
                <SortToggle big />
                <button
                  onClick={() => setExpanded(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-text-muted hover:border-white/25 hover:text-text-primary"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <HeatTreemap data={withCalled} height="100%" onPick={pick} />
            </div>
            <div className="pb-[env(safe-area-inset-bottom)] sm:pb-0">
              <Legend />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

// ════════════════════════════════════════════════════════
// SIDEBAR PANEL SHELL (Flowscan card pattern)
// ════════════════════════════════════════════════════════

const PanelShell = ({ children, className = "" }) => (
  <div className={`relative overflow-hidden before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/[0.06] before:to-transparent bg-[#0a0805] border border-white/[0.06] rounded-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_1px_2px_0_rgba(0,0,0,0.12)] p-3.5 ${className}`}>
    <div className="relative z-10 h-full flex flex-col">{children}</div>
  </div>
);

const PanelHeader = ({ title, subtitle, right, icon }) => (
  <div className="flex items-center justify-between mb-3 gap-2 flex-shrink-0">
    <div className="flex items-center gap-2 min-w-0">
      {icon && <span className="text-gold-primary/70">{icon}</span>}
      <h3 className="text-[11px] font-semibold text-text-primary uppercase tracking-[0.2em]">
        {title}
      </h3>
      {subtitle && (
        <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted/45">
          {subtitle}
        </span>
      )}
    </div>
    {right && <div className="flex-shrink-0">{right}</div>}
  </div>
);

// ── Most Active Panel ───────────────────────────────────
const MostActivePanel = ({ movers, period, setPeriod, histograms, onSelect }) => (
  <PanelShell>
    <PanelHeader
      title="Most Active"
      right={
        <div className="flex gap-0.5 bg-white/[0.03] rounded-md p-0.5 border border-white/[0.06]">
          {["1h", "4h", "24h"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-1.5 py-0.5 rounded-sm text-[9px] font-mono uppercase tracking-wider transition-colors ${
                period === p
                  ? "bg-gold-primary/15 text-gold-primary"
                  : "text-text-muted/55 hover:text-text-primary"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      }
    />
    <div className="space-y-px">
      {(movers || []).slice(0, 6).map((coin, i) => {
        const symbol = stripQuote(coin.pair);
        const strongIsUp = (coin.best || 0) >= Math.abs(coin.worst || 0);
        const hist = histograms[coin.pair];
        return (
          <button
            key={coin.pair}
            onClick={() => onSelect(coin.pair)}
            className="w-full grid grid-cols-[14px_22px_minmax(0,1fr)_auto] items-center gap-2 py-1.5 px-1 rounded-sm hover:bg-white/[0.025] transition-colors text-left border-b border-white/[0.03] last:border-b-0"
          >
            <span className="text-[9px] text-text-muted/40 text-center font-mono tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <CoinLogo pair={coin.pair} size={22} />
            <div className="min-w-0">
              <p className="text-text-primary text-[11px] font-medium truncate leading-tight flex items-center gap-1.5 tracking-tight">
                {symbol}
                <span className="text-[9px] text-text-muted/50 font-mono font-normal tabular-nums">
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
              className={`text-[11px] font-mono tabular-nums font-medium text-right ${
                strongIsUp ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {strongIsUp ? `+${coin.best}%` : `${coin.worst}%`}
            </span>
          </button>
        );
      })}
      {(!movers || movers.length === 0) && (
        <p className="text-text-muted/50 text-[10px] text-center py-3 font-mono uppercase tracking-[0.15em]">
          No active coins yet
        </p>
      )}
    </div>
  </PanelShell>
);

// ── Flash Moves Panel ───────────────────────────────────
const FlashMovesPanel = ({ moves, onSelect }) => (
  <PanelShell>
    <PanelHeader
      title="Flash Moves"
      icon={<IconBolt className="h-3 w-3" />}
      right={
        <span className="text-[9px] font-mono tabular-nums text-text-muted/55">
          {(moves || []).length} active
        </span>
      }
    />
    <div className="space-y-px">
      {(moves || []).slice(0, 5).map((fm, i) => {
        const symbol = stripQuote(fm.pair);
        const opacity = Math.max(1 - (i / Math.max((moves || []).length, 1)) * 0.4, 0.55);
        return (
          <button
            key={i}
            onClick={() => onSelect(fm.pair)}
            className="w-full grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-2 py-1.5 px-1 rounded-sm hover:bg-white/[0.025] transition-colors text-left border-b border-white/[0.03] last:border-b-0"
            style={{ opacity }}
          >
            <CoinLogo pair={fm.pair} size={18} />
            <span className="text-text-primary text-[11px] font-medium truncate tracking-tight">
              {symbol}
            </span>
            <span
              className={`text-[11px] font-mono tabular-nums font-medium ${
                fm.pct_change >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {fm.pct_change >= 0 ? "+" : ""}
              {fm.pct_change}%
            </span>
            <span className="text-text-muted/55 text-[9px] font-mono tabular-nums w-7 text-right">
              {fm.move_seconds}s
            </span>
          </button>
        );
      })}
      {(!moves || moves.length === 0) && (
        <p className="text-text-muted/50 text-[10px] text-center py-3 font-mono uppercase tracking-[0.15em]">
          No flash moves yet
        </p>
      )}
    </div>
  </PanelShell>
);

// ── 24h Summary Panel ───────────────────────────────────
const SummaryPanel = ({ daily, className = "" }) => {
  const total = daily?.total_events || 0;
  const bull = daily?.bullish || 0;
  const bear = daily?.bearish || 0;
  const flash = daily?.flash_moves || 0;
  const bullPct = total > 0 ? Math.round((bull / (bull + bear || 1)) * 100) : 50;
  return (
    <PanelShell className={className}>
      <PanelHeader
        title="24h Summary"
        right={
          <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted/45">
            Rolling
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-1.5">
        <SummaryCell label="Events" value={daily?.total_events} accent="white" />
        <SummaryCell label="Coins" value={daily?.unique_coins} accent="white" />
        <SummaryCell label="Bullish" value={daily?.bullish} accent="emerald" />
        <SummaryCell label="Bearish" value={daily?.bearish} accent="red" />
      </div>

      {bull + bear > 0 && (
        <div className="mt-2">
          <div className="h-1 rounded-full overflow-hidden bg-white/[0.04] flex">
            <div
              className="bg-emerald-500/80"
              style={{ width: `${bullPct}%` }}
            />
            <div
              className="bg-red-500/80"
              style={{ width: `${100 - bullPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 font-mono tabular-nums">
            <span className="text-[9px] text-emerald-400">{bullPct}% bull</span>
            <span className="text-[9px] text-red-400">{100 - bullPct}% bear</span>
          </div>
        </div>
      )}

      <div className="mt-2 bg-amber-500/[0.05] border border-amber-500/15 rounded-sm p-2.5 flex items-center justify-between">
        <div>
          <div className="font-light text-[18px] text-amber-400 tabular-nums leading-none tracking-tight">
            {flash.toLocaleString()}
          </div>
          <div className="text-[9px] text-text-muted/55 mt-1.5 uppercase tracking-[0.18em] font-mono">
            Flash Moves
          </div>
        </div>
        <IconBolt className="h-4 w-4 text-amber-400" />
      </div>
    </PanelShell>
  );
};

const SummaryCell = ({ label, value, accent }) => {
  const colorMap = {
    white: "text-text-primary bg-white/[0.03] border-white/[0.04]",
    emerald: "text-emerald-400 bg-emerald-500/[0.05] border-emerald-500/15",
    red: "text-red-400 bg-red-500/[0.05] border-red-500/15",
  };
  return (
    <div className={`rounded-sm p-2.5 border ${colorMap[accent]}`}>
      <div className="font-light text-[18px] tabular-nums leading-none tracking-tight">
        {(value || 0).toLocaleString()}
      </div>
      <div className="text-[9px] text-text-muted/55 mt-1.5 uppercase tracking-[0.18em] font-mono">
        {label}
      </div>
    </div>
  );
};

// ── Feed Skeleton ───────────────────────────────────────
const FeedSkeleton = () => (
  <div className="lqsk-group space-y-0">
    <ShimmerStyles />
    {[...Array(8)].map((_, i) => (
      <div
        key={i}
        className="px-4 py-2.5 flex items-center gap-3 border-b border-white/[0.03]"
        style={{ opacity: 1 - i * 0.1 }}
      >
        <div className="w-[26px] h-[26px] rounded-full bg-white/[0.04]" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 bg-white/[0.04] rounded-sm w-1/3" />
          <div className="h-2 bg-white/[0.03] rounded-sm w-1/2" />
        </div>
        <div className="w-16 h-5 bg-white/[0.04] rounded-sm" />
      </div>
    ))}
  </div>
);

// ════════════════════════════════════════════════════════
// COIN CHART MODAL — TradingView embed (logic identical, UI redesigned)
// ════════════════════════════════════════════════════════

const CoinChartModal = ({ pair, onClose }) => {
  const symbol = stripQuote(pair);
  const tvSymbol = `BINANCE:${pair}.P`;

  const [tvInterval, setTvInterval] = useState("60");
  const [metrics, setMetrics] = useState({
    ticker: null,
    funding: null,
    openInterest: null,
    ratio: null,
  });
  const [isClosing, setIsClosing] = useState(false);

  const tvContainerRef = useRef(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

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

  // Fetch metrics — IDENTICAL logic (external Binance/Bybit public APIs,
  // tidak melalui backend kita, jadi tetap pakai fetch() biasa)
  useEffect(() => {
    let cancelled = false;
    setMetrics({ ticker: null, funding: null, openInterest: null, ratio: null });

    const setMetric = (key, value) => {
      if (cancelled) return;
      setMetrics((m) => ({ ...m, [key]: value }));
    };

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
      for (const cat of ["linear", "spot"]) {
        try {
          const r = await fetch(`https://api.bybit.com/v5/market/tickers?category=${cat}&symbol=${pair}`);
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

    const fetchFunding = async () => {
      try {
        const r = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`);
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
        const r = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${pair}`);
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

    const fetchOI = async () => {
      try {
        const r = await fetch(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${pair}&period=1h&limit=24`);
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

    const fetchRatio = async () => {
      try {
        const r = await fetch(`https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=${pair}&period=1h&limit=1`);
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

    fetchTicker();
    fetchFunding();
    fetchOI();
    fetchRatio();

    return () => {
      cancelled = true;
    };
  }, [pair]);

  // Mount TradingView widget — IDENTICAL logic
  useEffect(() => {
    const container = tvContainerRef.current;
    if (!container) return;

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
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: tvInterval,
      timezone: timezone,
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(10, 5, 6, 1)",
      gridColor: "rgba(212, 168, 83, 0.04)",
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

  const modalContent = (
    <div
      className={`fixed inset-0 z-[100000] flex justify-center ${
        isClosing
          ? "animate-[mpfade-out_.18s_ease-in_forwards]"
          : "animate-[mpfade-in_.22s_ease-out]"
      } items-end sm:items-start sm:px-6 md:px-8 sm:pt-[72px] sm:pb-6`}
      style={{ backgroundColor: "rgba(0,0,0,0.78)", backdropFilter: "blur(8px)" }}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${symbol} chart`}
    >
      {/* Mobile: bottom sheet (Top Gainers Filters grammar). Desktop: centered panel. */}
      <div
        className={`relative flex w-full max-w-[1180px] flex-col overflow-hidden bg-[#0c0a07] shadow-[0_-12px_40px_rgba(0,0,0,0.55)] min-h-0 ${
          isClosing
            ? "animate-[mpsheet-out_.2s_ease-in_forwards] sm:animate-[mppanel-out_.18s_ease-in_forwards]"
            : "animate-[mpsheet-in_.3s_cubic-bezier(.16,1,.3,1)] sm:animate-[mppanel-in_.28s_cubic-bezier(.16,1,.3,1)]"
        } h-[min(92dvh,100%)] max-h-[92dvh] rounded-t-3xl border-t border-white/10 sm:h-[calc(100dvh-110px)] sm:max-h-[920px] sm:rounded-2xl sm:border sm:border-white/[0.08] sm:bg-[#0a0805] sm:shadow-[0_24px_80px_-12px_rgba(0,0,0,0.8)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab handle — mobile only */}
        <div className="flex justify-center pt-2.5 pb-0.5 sm:hidden shrink-0" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Top accent line — desktop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-6 top-0 hidden h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent sm:block"
        />

        {/* Header */}
        <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-b border-white/[0.06] flex items-center justify-between gap-3 bg-white/[0.015] flex-shrink-0 relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            <CoinLogo pair={pair} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-text-primary text-base sm:text-lg font-semibold leading-none tracking-tight">
                  {symbol}
                </span>
                <span className="text-text-muted/55 text-[10px] font-mono tabular-nums">
                  {pair}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className="text-text-primary font-mono tabular-nums text-sm sm:text-base font-light leading-none tracking-tight">
                  {last != null ? `$${formatPrice(last)}` : "—"}
                </span>
                {change != null && (
                  <span
                    className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-sm border flex items-center gap-0.5 ${
                      isPos
                        ? "bg-emerald-500/[0.08] text-emerald-400 border-emerald-500/20"
                        : "bg-red-500/[0.08] text-red-400 border-red-500/20"
                    }`}
                  >
                    {isPos ? <IconArrowUpTri /> : <IconArrowDownTri />}
                    {isPos ? "+" : ""}
                    {change.toFixed(2)}%
                  </span>
                )}
                <span className="text-[9px] text-text-muted/45 font-mono uppercase tracking-[0.15em]">
                  24h
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-md bg-white/[0.03] border border-white/[0.08] hover:bg-red-500/10 hover:border-red-500/30 flex items-center justify-center text-text-muted hover:text-text-primary transition-all flex-shrink-0"
            aria-label="Close"
          >
            <IconClose />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-4 sm:px-5 py-2 border-b border-white/[0.04] flex items-center justify-between gap-3 bg-white/[0.01] flex-shrink-0 flex-wrap relative z-10">
          <div className="flex items-center gap-1 bg-white/[0.03] rounded-md p-0.5 border border-white/[0.06]">
            {intervals.map((it) => (
              <button
                key={it.v}
                onClick={() => setTvInterval(it.v)}
                className={`px-2.5 py-1 rounded-sm text-[10px] font-medium uppercase tracking-[0.12em] transition-all ${
                  tvInterval === it.v
                    ? "bg-gold-primary/15 text-gold-primary"
                    : "text-text-muted/60 hover:text-text-primary"
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
            className="px-2.5 py-1 rounded-md text-[10px] font-medium uppercase tracking-[0.12em] border bg-white/[0.03] text-text-muted border-white/[0.06] hover:text-text-primary hover:border-white/[0.14] transition-all flex items-center gap-1.5"
          >
            <IconExternal />
            <span>Open in TradingView</span>
          </a>
        </div>

        {/* Chart — Flowscan chart-surface bg */}
        <div className="relative flex-1 min-h-0 min-w-0 bg-[#0a0506] border-y border-white/[0.04] shadow-[inset_0_2px_6px_-2px_rgba(0,0,0,0.4)]">
          <div ref={tvContainerRef} className="w-full h-full" />
        </div>

        {/* Metrics footer — 4 cells */}
        <div className="border-t border-white/[0.06] bg-white/[0.015] px-4 sm:px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 flex-shrink-0 relative z-10">
          <Metric24h ticker={metrics.ticker} />
          <MetricFunding funding={metrics.funding} />
          <MetricOI oi={metrics.openInterest} />
          <MetricLS ratio={metrics.ratio} />
        </div>

        {/* Region-block fallback note — glowing VPN hint */}
        <div className="px-4 sm:px-5 py-2 border-t border-gold-primary/[0.07] bg-gradient-to-r from-gold-primary/[0.05] via-transparent to-transparent flex-shrink-0 relative z-10 overflow-hidden">
          <p className="mp-vpn-hint text-[9px] font-mono leading-relaxed flex items-center justify-center sm:justify-start gap-1.5">
            <svg className="mp-vpn-ico h-3 w-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2 4 5v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V5l-8-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span className="text-center sm:text-left">
              Metrics above are pulled from Binance/Bybit. If they show "—", the data may be blocked in your region — <span className="mp-vpn-key">try enabling a VPN and reopening</span>.
            </span>
          </p>
        </div>

        <div className="px-4 sm:px-5 py-2 border-t border-white/[0.04] flex items-center justify-between text-[9px] font-mono text-text-muted/40 bg-white/[0.01] flex-shrink-0 relative z-10 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-2">
          <span className="uppercase tracking-[0.15em]">
            Chart · TradingView · Metrics · Binance Futures
          </span>
          <span className="hidden uppercase tracking-[0.15em] sm:inline">ESC to close</span>
          <button
            type="button"
            onClick={handleClose}
            className="sm:hidden rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-text-primary/70 active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// ════════════════════════════════════════════════════════
// METRIC CELLS — flat hairline pattern
// ════════════════════════════════════════════════════════

const MetricCellShell = ({ label, children }) => (
  <div className="bg-[#120809] rounded-sm px-2.5 py-2 border border-white/[0.05] min-h-[64px] flex flex-col justify-between">
    <p className="text-text-muted/55 text-[9px] uppercase tracking-[0.18em] font-mono">
      {label}
    </p>
    {children}
  </div>
);

const Metric24h = ({ ticker }) => {
  if (!ticker) {
    return (
      <MetricCellShell label="24h Change">
        <p className="text-sm font-mono font-medium tabular-nums text-text-muted/40 leading-none mt-1">
          —
        </p>
        <p className="text-[9px] text-text-muted/30 font-mono mt-1 leading-tight uppercase tracking-wider">
          high / low
        </p>
      </MetricCellShell>
    );
  }
  const isPos = ticker.changePct >= 0;
  return (
    <MetricCellShell label="24h Change">
      <p
        className={`text-sm font-mono font-medium tabular-nums leading-none mt-1 flex items-center gap-1 ${
          isPos ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isPos ? <IconArrowUpTri /> : <IconArrowDownTri />}
        {isPos ? "+" : ""}
        {ticker.changePct.toFixed(2)}%
      </p>
      <p className="text-[9px] text-text-muted/60 font-mono mt-1 leading-tight tabular-nums">
        H ${formatPrice(ticker.high)} · L ${formatPrice(ticker.low)}
      </p>
    </MetricCellShell>
  );
};

const MetricFunding = ({ funding }) => {
  if (!funding) {
    return (
      <MetricCellShell label="Funding · perp">
        <p className="text-sm font-mono font-medium tabular-nums text-text-muted/40 leading-none mt-1">
          —
        </p>
        <p className="text-[9px] text-text-muted/30 font-mono mt-1 leading-tight uppercase tracking-wider">
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
        className={`text-sm font-mono font-medium tabular-nums leading-none mt-1 ${
          isPos ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isPos ? "+" : ""}
        {ratePct.toFixed(4)}%
      </p>
      <p className="text-[9px] text-text-muted/60 font-mono mt-1 leading-tight tabular-nums">
        {isPos ? "longs pay" : "shorts pay"} · in {hrs}h {mins}m
      </p>
    </MetricCellShell>
  );
};

const MetricOI = ({ oi }) => {
  if (!oi) {
    return (
      <MetricCellShell label="Open Interest">
        <p className="text-sm font-mono font-medium tabular-nums text-text-muted/40 leading-none mt-1">
          —
        </p>
        <p className="text-[9px] text-text-muted/30 font-mono mt-1 leading-tight uppercase tracking-wider">
          24h change
        </p>
      </MetricCellShell>
    );
  }
  const isPos = oi.changePct >= 0;
  return (
    <MetricCellShell label="Open Interest">
      <p className="text-sm font-mono font-medium tabular-nums text-text-primary leading-none mt-1">
        ${formatVolume(oi.current)}
      </p>
      <p
        className={`text-[9px] font-mono mt-1 leading-tight tabular-nums flex items-center gap-0.5 ${
          isPos ? "text-emerald-400" : "text-red-400"
        }`}
      >
        {isPos ? <IconArrowUpTri /> : <IconArrowDownTri />}
        {Math.abs(oi.changePct).toFixed(2)}% · 24h
      </p>
    </MetricCellShell>
  );
};

const MetricLS = ({ ratio }) => {
  if (!ratio) {
    return (
      <MetricCellShell label="L/S · top traders">
        <p className="text-sm font-mono font-medium tabular-nums text-text-muted/40 leading-none mt-1">
          —
        </p>
        <div className="h-1 mt-2 rounded-full bg-white/[0.04]" />
      </MetricCellShell>
    );
  }
  return (
    <MetricCellShell label="L/S · top traders">
      <p className="text-sm font-mono font-medium tabular-nums leading-none mt-1">
        <span className="text-emerald-400">{ratio.longPct.toFixed(0)}%</span>
        <span className="text-text-muted/35 mx-1">/</span>
        <span className="text-red-400">{ratio.shortPct.toFixed(0)}%</span>
      </p>
      <div className="h-1 mt-2 rounded-full overflow-hidden bg-white/[0.04] flex">
        <div className="bg-emerald-500/80" style={{ width: `${ratio.longPct}%` }} />
        <div className="bg-red-500/80" style={{ width: `${ratio.shortPct}%` }} />
      </div>
    </MetricCellShell>
  );
};

// ════════════════════════════════════════════════════════
// STYLES — CSS animations + responsive grid
// ════════════════════════════════════════════════════════

const PulseStyles = () => (
  <style>{`

    @keyframes mp-hint-glow {
      0%, 100% { opacity: 0.7;  text-shadow: 0 0 4px rgba(212,168,83,0.12); }
      50%      { opacity: 1;    text-shadow: 0 0 9px rgba(212,168,83,0.38), 0 0 16px rgba(212,168,83,0.18); }
    }
    @keyframes mp-hint-key-glow {
      0%, 100% { text-shadow: 0 0 5px rgba(212,168,83,0.45); }
      50%      { text-shadow: 0 0 11px rgba(243,210,138,0.95), 0 0 20px rgba(212,168,83,0.55); }
    }
    @keyframes mp-hint-ico {
      0%, 100% { filter: drop-shadow(0 0 2px rgba(212,168,83,0.3)); transform: scale(1); }
      50%      { filter: drop-shadow(0 0 6px rgba(212,168,83,0.75)); transform: scale(1.1); }
    }
    .mp-vpn-hint { color: rgba(212,168,83,0.62); animation: mp-hint-glow 3s ease-in-out infinite; }
    .mp-vpn-hint .mp-vpn-key { color: #f3d28a; font-weight: 600; animation: mp-hint-key-glow 3s ease-in-out infinite; }
    .mp-vpn-hint .mp-vpn-ico { color: #e8c073; animation: mp-hint-ico 3s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) {
      .mp-vpn-hint, .mp-vpn-hint .mp-vpn-key, .mp-vpn-hint .mp-vpn-ico { animation: none; }
      .mp-main-grid { transition: none; }
    }

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
    .pulse-feed-scroll::-webkit-scrollbar-thumb { background: rgba(212, 168, 83, 0.12); border-radius: 3px; }
    .pulse-feed-scroll::-webkit-scrollbar-thumb:hover { background: rgba(212, 168, 83, 0.25); }

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
    /* Mobile bottom-sheet (Top Gainers Filters grammar) */
    @keyframes mpsheet-in {
      from { opacity: 1; transform: translateY(100%); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes mpsheet-out {
      from { opacity: 1; transform: translateY(0); }
      to   { opacity: 1; transform: translateY(100%); }
    }
    @media (prefers-reduced-motion: reduce) {
      .animate-\\[mpsheet-in_\\.3s_cubic-bezier\\(\\.16\\,1\\,\\.3\\,1\\)\\],
      .animate-\\[mpsheet-out_\\.2s_ease-in_forwards\\] {
        animation: none !important;
      }
    }

    /* Split feed (Pumps | Dumps) */
    .mp-split-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: rgba(255,255,255,0.05);
    }
    .mp-split-col {
      display: flex;
      flex-direction: column;
      min-height: 0;
      background: #0a0805;
      overflow: hidden;
    }
    @media (max-width: 620px) {
      .mp-split-grid { grid-template-columns: 1fr; }
    }

    /* Equal-height main grid */
    .mp-main-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .mp-side-slot { min-width: 0; }
    .mp-sidebar-rail { display: none; }
    @media (min-width: 1024px) {
      .mp-main-grid {
        grid-template-columns: 1.7fr 1fr;
        align-items: stretch;
        min-height: 600px;
        transition: grid-template-columns .28s cubic-bezier(.4, 0, .2, 1);
      }
      .mp-main-grid.mp-sidebar-collapsed {
        grid-template-columns: minmax(0, 1fr) 40px;
      }
      .mp-side-slot { position: relative; min-height: 0; }
      .mp-main-grid.mp-sidebar-collapsed .mp-sidebar-col { display: none; }
      .mp-main-grid.mp-sidebar-collapsed .mp-sidebar-rail {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        gap: 14px;
        padding: 12px 0;
        position: absolute;
        inset: 0;
        cursor: pointer;
      }
      .mp-rail-label {
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        white-space: nowrap;
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
      .mp-split-grid {
        flex: 1;
        min-height: 0;
      }
      .mp-sidebar-col {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
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