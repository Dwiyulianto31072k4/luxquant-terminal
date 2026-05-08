import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import SignalsTable from "./SignalsTable";
import SignalModal from "./SignalModal";
import BtcDomAlert from "./BtcDomAlert";
import CoinIntelligence from "./CoinIntelligence";

const API_BASE = import.meta.env.VITE_API_URL || "";

/* ============================================================
   Inline SVG icons — pengganti emoji, style Lucide line.
   Kalau mau pakai library: npm i lucide-react, lalu import { Filter, Search, ... }
   ============================================================ */
const Icon = {
  Filter: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  Search: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  ChevronDown: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  X: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  Brain: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  ),
  AlertTriangle: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Trophy: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  ),
  Bell: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  BarChart: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  Dot: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <circle cx="12" cy="12" r="6" />
    </svg>
  ),
};

const SignalsPage = () => {
  const { t } = useTranslation();

  const [allSignals, setAllSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [stats, setStats] = useState(null);

  const [isIntelOpen, setIsIntelOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const currentPricesRef = useRef({});
  const [priceVersion, setPriceVersion] = useState(0);

  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [searchPair, setSearchPair] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [selectedDates, setSelectedDates] = useState([]);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  const fetchBulkSignals = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      const [signalsRes, statsRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/v1/signals/bulk-7d`),
        fetch(`${API_BASE}/api/v1/signals/stats`),
      ]);

      if (signalsRes.status === "fulfilled" && signalsRes.value.ok) {
        const data = await signalsRes.value.json();
        setAllSignals(data.items || []);
      } else {
        throw new Error("Failed to fetch signals.");
      }

      if (statsRes.status === "fulfilled" && statsRes.value.ok) {
        const statsData = await statsRes.value.json();
        setStats(statsData);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error fetching signals:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBulkSignals(true);
    const interval = setInterval(() => fetchBulkSignals(false), 90000);
    return () => clearInterval(interval);
  }, [fetchBulkSignals]);

  useEffect(() => {
    setPage(1);
  }, [searchPair, statusFilter, riskFilter, selectedDates, sortBy, sortOrder]);

  const updatedCount = useMemo(
    () => allSignals.filter((s) => s.last_update_at).length,
    [allSignals]
  );

  const todayStats = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const todaySignals = allSignals.filter(
      (s) => s.created_at && s.created_at.slice(0, 10) === todayStr
    );
    const total = todaySignals.length;
    const open = todaySignals.filter((s) => s.status === "open").length;
    const closed = todaySignals.filter((s) => s.status !== "open");
    const wins = closed.filter((s) => !["closed_loss", "sl"].includes(s.status)).length;
    const losses = closed.filter((s) => ["closed_loss", "sl"].includes(s.status)).length;
    const closedCount = closed.length;
    const wr = closedCount > 0 ? Math.round((wins / closedCount) * 100) : 0;
    return { total, open, wins, losses, closedCount, wr };
  }, [allSignals]);

  const dateOptions = useMemo(() => {
    const options = [{ value: "all", label: "All Days" }];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel =
        i === 0 ? "Today"
        : i === 1 ? "Yesterday"
        : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      const count = allSignals.filter(
        (s) => s.created_at && s.created_at.slice(0, 10) === dateStr
      ).length;
      if (count > 0) options.push({ value: dateStr, label: dayLabel, count });
    }
    return options;
  }, [allSignals]);

  const handlePricesUpdate = useCallback((priceMap) => {
    currentPricesRef.current = priceMap;
    setPriceVersion((v) => v + 1);
  }, []);

  const getPriceVal = (pair) => {
    const data = currentPricesRef.current[pair];
    if (!data) return 0;
    if (typeof data === "number") return data;
    return data.price || 0;
  };

  const getVolVal = (pair) => {
    const data = currentPricesRef.current[pair];
    if (!data || typeof data === "number") return 0;
    return data.volume || 0;
  };

  const getOrderLabel = () => {
    const isTime = ["created_at", "last_update"].includes(sortBy);
    const isAlpha = sortBy === "pair";
    const isRisk = sortBy === "risk_level";
    const isStatus = sortBy === "status";
    if (sortOrder === "desc") {
      if (isTime) return "↓ Newest";
      if (isAlpha) return "↓ Z-A";
      if (isRisk) return "↓ High";
      if (isStatus) return "↓ Latest";
      return "↓ Highest";
    } else {
      if (isTime) return "↑ Oldest";
      if (isAlpha) return "↑ A-Z";
      if (isRisk) return "↑ Low";
      if (isStatus) return "↑ Early";
      return "↑ Lowest";
    }
  };

  const hasActiveFilters =
    searchPair ||
    statusFilter !== "all" ||
    riskFilter !== "all" ||
    selectedDates.length > 0 ||
    sortBy !== "created_at";

  const resetFilters = () => {
    setSearchPair("");
    setStatusFilter("all");
    setRiskFilter("all");
    setSelectedDates([]);
    setSortBy("created_at");
    setSortOrder("desc");
  };

  const toggleDateFilter = (dateVal) => {
    if (dateVal === "all") {
      setSelectedDates([]);
    } else {
      setSelectedDates((prev) =>
        prev.includes(dateVal) ? prev.filter((d) => d !== dateVal) : [...prev, dateVal]
      );
    }
  };

  const { signals, totalPages, totalSignals } = useMemo(() => {
    let filtered = [...allSignals];

    if (searchPair) {
      const search = searchPair.toUpperCase();
      filtered = filtered.filter((s) => s.pair && s.pair.toUpperCase().includes(search));
    }

    if (selectedDates.length > 0) {
      filtered = filtered.filter(
        (s) => s.created_at && selectedDates.includes(s.created_at.slice(0, 10))
      );
    }

    if (statusFilter === "updated") {
      filtered = filtered.filter((s) => s.last_update_at);
    } else if (statusFilter !== "all") {
      filtered = filtered.filter((s) => {
        const st = (s.status || "").toLowerCase();
        switch (statusFilter) {
          case "open": return st === "open";
          case "tp1": return st === "tp1";
          case "tp2": return st === "tp2";
          case "tp3": return st === "tp3";
          case "tp4":
          case "closed_win": return st === "closed_win" || st === "tp4";
          case "sl":
          case "closed_loss": return st === "closed_loss" || st === "sl";
          default: return true;
        }
      });
    }

    if (riskFilter !== "all") {
      filtered = filtered.filter((s) => {
        const r = (s.risk_level || "").toLowerCase();
        switch (riskFilter) {
          case "low": return r.startsWith("low");
          case "normal": return r.startsWith("med") || r.startsWith("nor");
          case "high": return r.startsWith("high");
          default: return true;
        }
      });
    }

    filtered.sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
        case "pair":
          valA = (a.pair || "").toLowerCase();
          valB = (b.pair || "").toLowerCase();
          return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case "current_price":
          valA = getPriceVal(a.pair); valB = getPriceVal(b.pair); break;
        case "entry":
          valA = parseFloat(a.entry) || 0; valB = parseFloat(b.entry) || 0; break;
        case "max_target": {
          const getMaxPct = (s) => {
            const targets = [s.target4, s.target3, s.target2, s.target1].filter(Boolean);
            if (targets.length === 0 || !s.entry) return 0;
            const maxT = Math.max(...targets.map(Number));
            const entry = parseFloat(s.entry);
            return entry > 0 ? ((maxT - entry) / entry) * 100 : 0;
          };
          valA = getMaxPct(a); valB = getMaxPct(b); break;
        }
        case "stop_loss":
          valA = parseFloat(a.stop1) || 0; valB = parseFloat(b.stop1) || 0; break;
        case "status": {
          const statusRank = { open: 0, tp1: 1, tp2: 2, tp3: 3, closed_win: 4, tp4: 4, closed_loss: 5, sl: 5 };
          valA = statusRank[(a.status || "").toLowerCase()] ?? 9;
          valB = statusRank[(b.status || "").toLowerCase()] ?? 9; break;
        }
        case "risk_level": {
          const riskRank = (r) => {
            const rl = (r || "").toLowerCase();
            if (rl.startsWith("low")) return 1;
            if (rl.startsWith("med") || rl.startsWith("nor")) return 2;
            if (rl.startsWith("high")) return 3;
            return 4;
          };
          valA = riskRank(a.risk_level); valB = riskRank(b.risk_level); break;
        }
        case "market_cap": {
          const parseMcap = (mcap) => {
            if (!mcap) return 0;
            const str = mcap.toString().toUpperCase();
            const num = parseFloat(str.replace(/[^0-9.]/g, "")) || 0;
            if (str.includes("T")) return num * 1e12;
            if (str.includes("B")) return num * 1e9;
            if (str.includes("M")) return num * 1e6;
            if (str.includes("K")) return num * 1e3;
            return num;
          };
          valA = parseMcap(a.market_cap); valB = parseMcap(b.market_cap); break;
        }
        case "volume":
          valA = getVolVal(a.pair); valB = getVolVal(b.pair); break;
        case "last_update": {
          const tsA = a.last_update_at ? new Date(a.last_update_at).getTime() : 0;
          const tsB = b.last_update_at ? new Date(b.last_update_at).getTime() : 0;
          if (tsA === 0 && tsB !== 0) return 1;
          if (tsA !== 0 && tsB === 0) return -1;
          valA = tsA; valB = tsB; break;
        }
        case "created_at":
        default:
          valA = a.call_message_id || 0; valB = b.call_message_id || 0; break;
      }
      if (sortBy !== "pair") return sortOrder === "asc" ? valA - valB : valB - valA;
      return 0;
    });

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pages);
    const start = (safePage - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);
    return { signals: paged, totalPages: pages, totalSignals: total };
  }, [allSignals, searchPair, statusFilter, riskFilter, selectedDates, sortBy, sortOrder, page, pageSize, priceVersion]);

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortOrder("desc"); }
  };

  const statusOptions = [
    { value: "all", label: "All Status", icon: <Icon.BarChart className="w-3.5 h-3.5" /> },
    { value: "updated", label: "Recently Hit", icon: <Icon.Bell className="w-3.5 h-3.5" /> },
    { value: "open", label: "Open", icon: <Icon.Dot className="w-2 h-2 text-emerald-400" /> },
    { value: "tp1", label: "TP1", icon: <Icon.Check className="w-3 h-3" /> },
    { value: "tp2", label: "TP2", icon: <Icon.Check className="w-3 h-3" /> },
    { value: "tp3", label: "TP3", icon: <Icon.Check className="w-3 h-3" /> },
    { value: "closed_win", label: "TP4", icon: <Icon.Trophy className="w-3.5 h-3.5" /> },
    { value: "closed_loss", label: "Loss", icon: <Icon.X className="w-3 h-3" /> },
  ];

  const riskOptions = [
    { value: "all", label: "All Risk" },
    { value: "low", label: "Low", dot: "bg-emerald-400" },
    { value: "normal", label: "Normal", dot: "bg-amber-400" },
    { value: "high", label: "High", dot: "bg-rose-400" },
  ];

  const sortOptions = [
    { value: "created_at", label: "Called Time" },
    { value: "last_update", label: "Last Update" },
    { value: "pair", label: "Pair Name" },
    { value: "current_price", label: "Current Price" },
    { value: "entry", label: "Entry Price" },
    { value: "max_target", label: "Max Target %" },
    { value: "stop_loss", label: "Stop Loss %" },
    { value: "status", label: "Signal Status" },
    { value: "risk_level", label: "Risk Level" },
    { value: "market_cap", label: "Market Cap" },
    { value: "volume", label: "Volume 24H" },
  ];

  /* ===================== RENDER =====================
     Wrapper paling luar pakai font-grotesk + bg-flow-bg supaya page ini
     pakai font Space Grotesk meski di luar masih font-body (Plus Jakarta). */
  return (
    <div className="font-grotesk text-flow-fg bg-flow-bg -mx-4 md:-mx-6 -my-4 md:-my-6 px-4 md:px-6 py-6 space-y-6 min-h-full">
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="flow-h-page">Terminal Signals</h1>
          <p className="text-sm text-flow-muted mt-1">
            Last 7 Days ·{" "}
            <span className="text-flow-fg font-medium font-mono tabular-nums">
              {allSignals.length}
            </span>{" "}
            Signals Generated
            {updatedCount > 0 && (
              <>
                {" · "}
                <span className="text-flow-accent font-medium font-mono tabular-nums">
                  {updatedCount}
                </span>{" "}
                Recently Updated
              </>
            )}
          </p>
        </div>

        {/* Sync indicator */}
        <span className={`${loading ? "flow-badge-warn" : "flow-badge"} w-fit`}>
          <span className="relative flex h-2 w-2">
            {loading && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${loading ? "bg-amber-400" : "bg-emerald-400"}`} />
          </span>
          <span className="font-mono">
            {loading
              ? "Syncing"
              : lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
              : "Ready"}
          </span>
        </span>
      </div>

      {/* 2. Performance Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flow-card !p-5">
          <p className="flow-th mb-2">Today's Activity</p>
          <p className="text-flow-fg text-3xl font-medium font-mono tabular-nums">
            {todayStats.total}
          </p>
          <div className="flex items-center gap-2 mt-3 text-xs">
            <span className="flow-badge-success">{todayStats.open} Open</span>
            <span className="text-flow-muted font-mono tabular-nums">
              {todayStats.wins}W · {todayStats.losses}L
            </span>
          </div>
        </div>

        <div className="flow-card !p-5">
          <p className="flow-th mb-2">Today's Win Rate</p>
          <div className="flex items-baseline gap-1">
            <p className="text-emerald-400 text-3xl font-medium font-mono tabular-nums">
              {todayStats.wr}
            </p>
            <span className="text-emerald-400 text-lg font-medium">%</span>
          </div>
          <p className="text-flow-muted text-xs mt-3 font-mono tabular-nums">
            {todayStats.closedCount} Signals Closed
          </p>
        </div>

        <div className="flow-card !p-5">
          <p className="flow-th mb-2">Overall Win Rate</p>
          <div className="flex items-baseline gap-1">
            <p className="text-flow-accent text-3xl font-medium font-mono tabular-nums">
              {stats?.win_rate ?? "—"}
            </p>
            <span className="text-flow-accent text-lg font-medium">%</span>
          </div>
          <p className="text-flow-muted text-xs mt-3 font-mono tabular-nums">
            {stats ? `${(stats.total_signals || 0).toLocaleString()} Total Signals` : "—"}
          </p>
        </div>

        <div className="flow-card !p-5">
          <p className="flow-th mb-2">This Week</p>
          <p className="text-flow-fg text-3xl font-medium font-mono tabular-nums">
            {allSignals.length}
          </p>
          <p className="text-flow-muted text-xs mt-3">Signals in View</p>
        </div>
      </div>

      {/* 3. Filter Console */}
      <div className="flow-card">
        <div className="relative z-10 flex items-center justify-between border-b border-flow-border/60 pb-4 mb-5">
          <h2 className="flow-h-section flex items-center gap-2">
            <Icon.Filter className="w-4 h-4 text-flow-accent" />
            Signal Scanner
          </h2>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flow-btn-ghost flex items-center gap-1.5 !text-[12px]"
            >
              <Icon.X className="w-3 h-3" /> Reset All
            </button>
          )}
        </div>

        {/* Top Row: Search & Sort */}
        <div className="grid grid-cols-1 md:grid-cols-10 gap-3 mb-6">
          <div className="md:col-span-6 relative">
            <Icon.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-flow-muted" />
            <input
              type="text"
              placeholder="Search Pair (e.g. BTC, ETH, SOL)..."
              value={searchPair}
              onChange={(e) => setSearchPair(e.target.value)}
              className="flow-input w-full pl-10 pr-3 py-2.5"
            />
          </div>
          <div className="md:col-span-3 relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="flow-input w-full px-3 py-2.5 appearance-none cursor-pointer pr-9"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-flow-surface text-flow-fg">
                  {opt.label}
                </option>
              ))}
            </select>
            <Icon.ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-flow-muted pointer-events-none" />
          </div>
          <div className="md:col-span-1">
            <button
              onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
              className="flow-input w-full h-full min-h-[42px] flex items-center justify-center px-2 hover:border-flow-accent/40 cursor-pointer"
              title="Toggle sort order"
            >
              <span className="font-mono text-flow-fg">{getOrderLabel()}</span>
            </button>
          </div>
        </div>

        {/* Bottom Row: Timeline / Status / Risk */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Timeline */}
          <div className="lg:col-span-5">
            <div className="flow-th mb-3 flex items-center justify-between">
              <span>Timeline Filters</span>
              <span className="normal-case text-flow-muted/70 tracking-normal">multi-select</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {dateOptions.map((opt) => {
                const isActive =
                  opt.value === "all"
                    ? selectedDates.length === 0
                    : selectedDates.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleDateFilter(opt.value)}
                    className={`flow-chip ${isActive ? "flow-chip-active" : ""}`}
                  >
                    <span>{opt.label}</span>
                    {opt.count != null && (
                      <span
                        className={`text-[10px] font-mono tabular-nums px-1.5 ${
                          isActive ? "text-flow-accent" : "text-flow-muted"
                        }`}
                      >
                        {opt.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status */}
          <div className="lg:col-span-4 lg:border-l lg:border-flow-border/60 lg:pl-6">
            <div className="flow-th mb-3">Signal Status</div>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((opt) => {
                const isActive = statusFilter === opt.value;
                const isUpdated = opt.value === "updated";
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setStatusFilter(opt.value);
                      if (isUpdated && sortBy === "created_at") setSortBy("last_update");
                    }}
                    className={`flow-chip ${
                      isActive
                        ? isUpdated
                          ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
                          : "flow-chip-active"
                        : ""
                    }`}
                  >
                    <span className="opacity-90">{opt.icon}</span>
                    <span>{opt.label}</span>
                    {isUpdated && updatedCount > 0 && !isActive && (
                      <span className="ml-0.5 px-1.5 text-[10px] font-mono tabular-nums text-amber-400">
                        {updatedCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Risk — segmented control */}
          <div className="lg:col-span-3 lg:border-l lg:border-flow-border/60 lg:pl-6">
            <div className="flow-th mb-3">Risk Profile</div>
            <div className="flex bg-flow-surface-2 border border-flow-border/60 p-1 relative">
              {riskOptions.map((opt) => {
                const isActive = riskFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setRiskFilter(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-flow-accent/15 text-flow-accent"
                        : "text-flow-muted hover:text-flow-fg hover:bg-white/[0.03]"
                    }`}
                  >
                    {opt.dot && <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Intelligence & Alerts Accordions */}
      <div className="flex flex-col gap-3">
        <div className="flow-card !p-0">
          <button
            onClick={() => setIsIntelOpen(!isIntelOpen)}
            className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 bg-flow-accent/10 border border-flow-accent/20 flex items-center justify-center text-flow-accent">
                <Icon.Brain className="w-4 h-4" />
              </div>
              <div className="text-left">
                <h3 className="flow-h-section">Coin Intelligence</h3>
                <p className="text-[11px] text-flow-muted mt-0.5">
                  AI-powered deep analysis &amp; streaks
                </p>
              </div>
            </div>
            <Icon.ChevronDown
              className={`w-4 h-4 text-flow-muted transition-transform duration-200 ${
                isIntelOpen ? "rotate-180 text-flow-accent" : ""
              }`}
            />
          </button>
          <div
            className={`transition-all duration-300 ease-in-out ${
              isIntelOpen
                ? "max-h-[2000px] opacity-100 p-5 border-t border-flow-border/60"
                : "max-h-0 opacity-0 overflow-hidden"
            }`}
          >
            <CoinIntelligence selectedDates={selectedDates} />
          </div>
        </div>

        <div className="flow-card !p-0">
          <button
            onClick={() => setIsAlertOpen(!isAlertOpen)}
            className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Icon.AlertTriangle className="w-4 h-4" />
              </div>
              <div className="text-left">
                <h3 className="flow-h-section">BTC Dominance Alert</h3>
                <p className="text-[11px] text-flow-muted mt-0.5">
                  Macro market condition warning
                </p>
              </div>
            </div>
            <Icon.ChevronDown
              className={`w-4 h-4 text-flow-muted transition-transform duration-200 ${
                isAlertOpen ? "rotate-180 text-amber-400" : ""
              }`}
            />
          </button>
          <div
            className={`transition-all duration-300 ease-in-out ${
              isAlertOpen
                ? "max-h-[1000px] opacity-100 p-5 border-t border-flow-border/60"
                : "max-h-0 opacity-0 overflow-hidden"
            }`}
          >
            <BtcDomAlert allSignals={allSignals} onSignalClick={setSelectedSignal} />
          </div>
        </div>
      </div>

      {/* 5. Error & Data Table */}
      {error && (
        <div className="flow-card text-center">
          <div className="w-10 h-10 mx-auto bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-3">
            <Icon.AlertTriangle className="w-5 h-5" />
          </div>
          <h3 className="flow-h-section text-rose-400 mb-1">Failed to load signals</h3>
          <p className="text-sm text-flow-muted mb-4">{error}</p>
          <button
            onClick={() => fetchBulkSignals(true)}
            className="flow-badge-danger px-4 py-2 cursor-pointer hover:bg-rose-500/25"
          >
            Try Again
          </button>
        </div>
      )}

      {!error && (
        <div className="flow-card !p-0 overflow-hidden">
          {/* SignalsTable masih pakai style lama-nya sendiri.
              Konsekuensi: tabel di dalam akan keliatan kontras sama wrapper Flowscan-nya.
              Kalau mau matching, restyle SignalsTable.jsx terpisah. */}
          <SignalsTable
            signals={signals}
            loading={loading}
            onRowClick={setSelectedSignal}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            onPricesUpdate={handlePricesUpdate}
          />
        </div>
      )}

      {/* 6. Modal — masih pakai style lama */}
      {selectedSignal && (
        <SignalModal
          key={selectedSignal.signal_id}
          signal={selectedSignal}
          isOpen={!!selectedSignal}
          onClose={() => setSelectedSignal(null)}
          onSwitchSignal={(newSignal) => {
            setSelectedSignal(null);
            setTimeout(() => setSelectedSignal(newSignal), 100);
          }}
        />
      )}
    </div>
  );
};

export default SignalsPage;
