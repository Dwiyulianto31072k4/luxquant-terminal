import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import SignalsTable from "./SignalsTable";
import SignalModal from "./SignalModal";
import BtcDomAlert from "./BtcDomAlert";
import CoinIntelligence from './CoinIntelligence';

const API_BASE = import.meta.env.VITE_API_URL || "";

// ================================================================
// INLINE SVG ICONS (Lucide-style) — unchanged
// ================================================================
const Icon = {
  filter: (className = 'w-3.5 h-3.5') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  search: (className = 'w-3.5 h-3.5') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  chevronDown: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
  arrowUp: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 7-7 7 7" />
      <path d="M12 19V5" />
    </svg>
  ),
  arrowDown: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  ),
  close: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  brain: (className = 'w-4 h-4') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  ),
  alert: (className = 'w-4 h-4') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  bell: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  check: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  trophy: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  ),
  x: (className = 'w-3 h-3') => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
};

// ================================================================
// SECTION HEADER — unchanged
// ================================================================
const SectionHeader = ({ label, hint }) => (
  <div className="flex items-center gap-3 mb-4">
    <span className="h-px w-8 bg-gold-primary/40" />
    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">{label}</span>
    <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/40 via-white/[0.06] to-transparent" />
    {hint && <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{hint}</span>}
  </div>
);

// ================================================================
// STAT CARD — enhanced colors
// ================================================================
const StatCard = ({ label, value, valueColor = 'text-white', sub }) => (
  <div className="bg-[#0a0805] rounded-md border border-white/[0.06] p-4 lg:p-5 relative overflow-hidden hover:border-gold-primary/25 hover:-translate-y-0.5 transition-all duration-200">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted mb-2">{label}</p>
    <div className="h-px bg-white/[0.06] mb-3" />
    <p className={`font-mono text-2xl lg:text-3xl font-light tabular-nums leading-none ${valueColor}`}>{value}</p>
    {sub && <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-2">{sub}</p>}
  </div>
);

// ================================================================
// MAIN PAGE — REVISED COLORS ONLY
// ================================================================
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

  const updatedCount = useMemo(() => {
    return allSignals.filter((s) => s.last_update_at).length;
  }, [allSignals]);

  const todayStats = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const todaySignals = allSignals.filter((s) => s.created_at && s.created_at.slice(0, 10) === todayStr);
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
      const dayLabel = i === 0 ? "Today" : i === 1 ? "Yesterday" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      const count = allSignals.filter((s) => s.created_at && s.created_at.slice(0, 10) === dateStr).length;
      if (count > 0) {
        options.push({ value: dateStr, label: dayLabel, count });
      }
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
      if (isTime) return "Newest";
      if (isAlpha) return "Z–A";
      if (isRisk) return "High";
      if (isStatus) return "Latest";
      return "Highest";
    } else {
      if (isTime) return "Oldest";
      if (isAlpha) return "A–Z";
      if (isRisk) return "Low";
      if (isStatus) return "Early";
      return "Lowest";
    }
  };

  const hasActiveFilters = searchPair || statusFilter !== "all" || riskFilter !== "all" || selectedDates.length > 0 || sortBy !== "created_at";

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
      setSelectedDates((prev) => {
        if (prev.includes(dateVal)) return prev.filter((d) => d !== dateVal);
        return [...prev, dateVal];
      });
    }
  };

  const { signals, totalPages, totalSignals } = useMemo(() => {
    let filtered = [...allSignals];

    if (searchPair) {
      const search = searchPair.toUpperCase();
      filtered = filtered.filter((s) => s.pair && s.pair.toUpperCase().includes(search));
    }

    if (selectedDates.length > 0) {
      filtered = filtered.filter((s) => s.created_at && selectedDates.includes(s.created_at.slice(0, 10)));
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
          case "tp4": case "closed_win": return st === "closed_win" || st === "tp4";
          case "sl": case "closed_loss": return st === "closed_loss" || st === "sl";
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
            return entry > 0 ? ((maxT - entry) / entry * 100) : 0;
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
          const riskRank = (r) => { const rl = (r || "").toLowerCase(); if (rl.startsWith("low")) return 1; if (rl.startsWith("med") || rl.startsWith("nor")) return 2; if (rl.startsWith("high")) return 3; return 4; };
          valA = riskRank(a.risk_level); valB = riskRank(b.risk_level); break;
        }
        case "market_cap": {
          const parseMcap = (mcap) => { if (!mcap) return 0; const str = mcap.toString().toUpperCase(); const num = parseFloat(str.replace(/[^0-9.]/g, "")) || 0; if (str.includes("T")) return num * 1e12; if (str.includes("B")) return num * 1e9; if (str.includes("M")) return num * 1e6; if (str.includes("K")) return num * 1e3; return num; };
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
        case "created_at": default:
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
    { value: "all", label: "All Status" },
    { value: "updated", label: "Recently Hit", icon: Icon.bell, accent: 'gold' },
    { value: "open", label: "Open" },
    { value: "tp1", label: "TP1", icon: Icon.check, accent: 'emerald' },
    { value: "tp2", label: "TP2", icon: Icon.check, accent: 'emerald' },
    { value: "tp3", label: "TP3", icon: Icon.check, accent: 'emerald' },
    { value: "closed_win", label: "TP4", icon: Icon.trophy, accent: 'emerald' },
    { value: "closed_loss", label: "Loss", icon: Icon.x, accent: 'red' },
  ];

  const riskOptions = [
    { value: "all", label: "All" },
    { value: "low", label: "Low", dotColor: 'bg-emerald-400' },
    { value: "normal", label: "Normal", dotColor: 'bg-amber-400' },
    { value: "high", label: "High", dotColor: 'bg-red-400' },
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

  return (
    <div className="space-y-6 pb-10">
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 mb-3">
            <span className="h-px w-8 bg-gold-primary/40" />
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">Terminal Signals</span>
            <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/40 via-white/[0.06] to-transparent" />
          </div>
          <h1 className="font-display text-2xl lg:text-3xl font-normal text-white tracking-tight">Last 7 Days Activity</h1>
          <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mt-1.5">
            <span className="text-white tabular-nums">{allSignals.length}</span> signals generated
            {updatedCount > 0 && (
              <>
                <span className="mx-2 text-text-muted/40">·</span>
                <span className="text-gold-primary tabular-nums">{updatedCount}</span> recently updated
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5 bg-[#0a0805] px-3.5 py-2 rounded-sm border border-white/[0.06] relative overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: loading ? '#fbbf24' : '#10b981',
              boxShadow: loading
                ? '0 0 6px rgba(251,191,36,0.7), 0 0 12px rgba(251,191,36,0.35)'
                : '0 0 6px rgba(16,185,129,0.7), 0 0 12px rgba(16,185,129,0.35)',
            }}
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {loading
              ? 'Syncing'
              : lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`
              : 'Ready'}
          </span>
        </div>
      </div>

      {/* PERFORMANCE STATS — enhanced colors */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Today's Activity"
          value={todayStats.total}
          sub={`${todayStats.open} open · ${todayStats.wins}W · ${todayStats.losses}L`}
        />
        <StatCard
          label="Today's Win Rate"
          value={`${todayStats.wr}%`}
          valueColor="text-emerald-400"
          sub={`${todayStats.closedCount} signals closed`}
        />
        <StatCard
          label="Overall Win Rate"
          value={stats?.win_rate ? `${stats.win_rate}%` : '—'}
          valueColor="text-amber-400"
          sub={stats ? `${(stats.total_signals || 0).toLocaleString()} total signals` : '—'}
        />
        <StatCard
          label="This Week"
          value={allSignals.length}
          sub="signals in view"
        />
      </div>

      {/* FILTER CONSOLE — stronger colors */}
      <div className="bg-[#0a0805] rounded-md border border-white/[0.06] p-5 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

        <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-5">
          <div className="flex items-center gap-2.5">
            {Icon.filter('w-3.5 h-3.5 text-gold-primary/70')}
            <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">Signal Scanner</h2>
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 px-3 py-1 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] transition-all rounded-sm font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-white"
            >
              {Icon.close('w-3 h-3')}
              Reset All
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-5">
          <div className="md:col-span-7 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted/60 pointer-events-none">
              {Icon.search('w-3.5 h-3.5')}
            </span>
            <input
              type="text"
              placeholder="Search pair (e.g. BTC, ETH, SOL)..."
              value={searchPair}
              onChange={(e) => setSearchPair(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-[#0a0506] border border-white/[0.08] rounded-sm text-white placeholder-text-muted/40 font-mono text-xs focus:border-gold-primary/40 focus:outline-none focus:bg-white/[0.02] transition-all"
            />
          </div>

          <div className="md:col-span-3 relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full pl-3 pr-9 py-2.5 bg-[#0a0506] border border-white/[0.08] rounded-sm text-white font-mono text-xs focus:border-gold-primary/40 focus:outline-none appearance-none cursor-pointer transition-all"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#0a0506]">{opt.label}</option>
              ))}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              {Icon.chevronDown('w-3 h-3')}
            </span>
          </div>

          <div className="md:col-span-2">
            <button
              onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
              className="w-full h-full min-h-[42px] flex items-center justify-center gap-1.5 px-3 bg-[#0a0506] border border-white/[0.08] hover:border-gold-primary/30 transition-all rounded-sm font-mono text-[10px] uppercase tracking-wider text-white"
            >
              {sortOrder === 'desc' ? Icon.arrowDown('w-3 h-3') : Icon.arrowUp('w-3 h-3')}
              <span>{getOrderLabel()}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Timeline */}
          <div className="lg:col-span-5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Timeline Filters</span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted/50">multi-select</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dateOptions.map((opt) => {
                const isActive = opt.value === "all" ? selectedDates.length === 0 : selectedDates.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleDateFilter(opt.value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                      isActive
                        ? 'bg-white/10 border border-white/[0.08] text-white'
                        : 'bg-white/[0.03] border border-transparent text-text-muted hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {opt.count != null && (
                      <span className={`px-1 py-0 font-mono text-[9px] tabular-nums rounded-sm ${
                        isActive ? 'bg-gold-primary/20 text-gold-primary' : 'bg-white/[0.06] text-text-muted/70'
                      }`}>
                        {opt.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status — stronger active colors */}
          <div className="lg:col-span-4 lg:border-l lg:border-white/[0.06] lg:pl-5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Signal Status</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((opt) => {
                const isActive = statusFilter === opt.value;
                const accentColor =
                  opt.accent === 'emerald' ? 'text-emerald-400' :
                  opt.accent === 'red' ? 'text-red-400' :
                  opt.accent === 'gold' ? 'text-gold-primary' :
                  'text-text-muted';
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setStatusFilter(opt.value);
                      if (opt.value === "updated" && sortBy === "created_at") setSortBy("last_update");
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                      isActive
                        ? 'bg-white/10 border border-white/[0.08] text-white'
                        : 'bg-white/[0.03] border border-transparent text-text-muted hover:bg-white/[0.06] hover:text-white'
                    }`}
                  >
                    {opt.icon && <span className={isActive ? accentColor : 'opacity-70'}>{opt.icon('w-3 h-3')}</span>}
                    <span>{opt.label}</span>
                    {opt.value === "updated" && updatedCount > 0 && !isActive && (
                      <span className="px-1 py-0 bg-gold-primary/10 text-gold-primary text-[9px] tabular-nums rounded-sm">
                        {updatedCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Risk — stronger dots */}
          <div className="lg:col-span-3 lg:border-l lg:border-white/[0.06] lg:pl-5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Risk Profile</span>
            </div>
            <div className="flex bg-white/[0.02] border border-white/[0.06] rounded-sm p-0.5">
              {riskOptions.map((opt) => {
                const isActive = riskFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setRiskFilter(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-all ${
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-text-muted hover:text-white hover:bg-white/[0.03]'
                    }`}
                  >
                    {opt.dotColor && (
                      <span className={`w-1.5 h-1.5 rounded-full ${opt.dotColor} ${isActive ? '' : 'opacity-50'}`} />
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ACCORDIONS — enhanced open state */}
      <div className="space-y-3">
        {/* Coin Intelligence */}
        <div className="bg-[#0a0805] rounded-md border border-white/[0.06] overflow-hidden relative">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <button
            onClick={() => setIsIntelOpen(!isIntelOpen)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-sm bg-gold-primary/[0.06] border border-gold-primary/20 flex items-center justify-center text-gold-primary/80">
                {Icon.brain('w-4 h-4')}
              </div>
              <div className="text-left">
                <h3 className="font-mono text-sm text-white">Coin Intelligence</h3>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mt-0.5">AI-powered deep analysis & streaks</p>
              </div>
            </div>
            <div className={`w-7 h-7 rounded-sm bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-text-muted transition-all ${isIntelOpen ? 'rotate-180 text-gold-primary border-gold-primary/30' : ''}`}>
              {Icon.chevronDown('w-3 h-3')}
            </div>
          </button>
          <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isIntelOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="p-5 border-t border-white/[0.06]">
              <CoinIntelligence selectedDates={selectedDates} />
            </div>
          </div>
        </div>

        {/* BTC Dominance Alert */}
        <div className="bg-[#0a0805] rounded-md border border-white/[0.06] overflow-hidden relative">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <button
            onClick={() => setIsAlertOpen(!isAlertOpen)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-sm bg-red-500/[0.06] border border-red-500/20 flex items-center justify-center text-red-400/80">
                {Icon.alert('w-4 h-4')}
              </div>
              <div className="text-left">
                <h3 className="font-mono text-sm text-white">BTC Dominance Alert</h3>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mt-0.5">Macro market condition warning</p>
              </div>
            </div>
            <div className={`w-7 h-7 rounded-sm bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-text-muted transition-all ${isAlertOpen ? 'rotate-180 text-red-400 border-red-500/30' : ''}`}>
              {Icon.chevronDown('w-3 h-3')}
            </div>
          </button>
          <div className={`transition-all duration-500 ease-in-out overflow-hidden ${isAlertOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="p-5 border-t border-white/[0.06]">
              <BtcDomAlert allSignals={allSignals} onSignalClick={setSelectedSignal} />
            </div>
          </div>
        </div>
      </div>

      {/* ERROR / TABLE */}
      {error && (
        <div className="bg-[#0a0805] rounded-md p-6 border border-red-500/30 text-center relative overflow-hidden">
          <span className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-red-500/[0.06] border border-red-500/20 flex items-center justify-center text-red-400">
              {Icon.alert('w-5 h-5')}
            </div>
            <h3 className="font-mono text-sm text-white">Failed to load signals</h3>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{error}</p>
            <button
              onClick={() => fetchBulkSignals(true)}
              className="px-4 py-2 mt-1 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 hover:border-red-500/30 transition-all rounded-sm font-mono text-[10px] uppercase tracking-wider"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {!error && (
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
      )}

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