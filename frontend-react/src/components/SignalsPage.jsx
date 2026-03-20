import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import SignalsTable from "./SignalsTable";
import SignalModal from "./SignalModal";
import BtcDomAlert from "./BtcDomAlert";
import CoinIntelligence from './CoinIntelligence';

const API_BASE = import.meta.env.VITE_API_URL || "";

const SignalsPage = () => {
  const { t } = useTranslation();

  const [allSignals, setAllSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [stats, setStats] = useState(null);

  // Accordion / Collapsible States
  const [isIntelOpen, setIsIntelOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  const currentPricesRef = useRef({});
  const [priceVersion, setPriceVersion] = useState(0);

  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Filter States
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
    { value: "all", label: "All Status", icon: "📊" },
    { value: "updated", label: "Recently Hit", icon: "🔔" },
    { value: "open", label: "Open", icon: "🟢" },
    { value: "tp1", label: "TP1", icon: "✓" },
    { value: "tp2", label: "TP2", icon: "✓" },
    { value: "tp3", label: "TP3", icon: "✓" },
    { value: "closed_win", label: "TP4", icon: "🏆" },
    { value: "closed_loss", label: "Loss", icon: "✗" },
  ];

  const riskOptions = [
    { value: "all", label: "All Risk", color: "bg-gray-400" },
    { value: "low", label: "Low", color: "bg-green-500" },
    { value: "normal", label: "Normal", color: "bg-yellow-500" },
    { value: "high", label: "High", color: "bg-red-500" },
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
    <div className="space-y-8 pb-10">
      
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-1 bg-gradient-to-r from-gold-primary to-transparent rounded-full" />
            <h1 className="text-3xl font-display font-bold text-white tracking-wide">Terminal Signals</h1>
          </div>
          <p className="text-text-muted text-sm ml-15">
            Last 7 Days · <span className="text-white font-semibold">{allSignals.length}</span> Signals Generated
            {updatedCount > 0 && (
              <span className="ml-2 text-gold-primary">· <span className="font-semibold">{updatedCount}</span> Recently Updated</span>
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-3 bg-bg-secondary/50 px-4 py-2 rounded-full border border-white/5 shadow-inner">
          <span className="relative flex h-3 w-3">
            {loading && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${loading ? "bg-yellow-500" : "bg-green-500"}`}></span>
          </span>
          <span className="text-xs font-medium text-text-muted">
            {loading ? "Syncing data..." : lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : "Ready"}
          </span>
        </div>
      </div>

      {/* 2. Performance Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-2xl p-5 border border-white/5 shadow-md relative overflow-hidden group hover:border-gold-primary/30 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-blue-500/10"></div>
          <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Today's Activity</p>
          <p className="text-white text-3xl font-display font-bold relative z-10">{todayStats.total}</p>
          <div className="flex items-center gap-2 mt-2 text-xs font-medium relative z-10">
            <span className="bg-green-500/10 text-green-400 px-2 py-0.5 rounded-md">{todayStats.open} Open</span>
            <span className="text-text-muted">{todayStats.wins}W - {todayStats.losses}L</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-2xl p-5 border border-white/5 shadow-md relative overflow-hidden group hover:border-green-500/30 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-green-500/10"></div>
          <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Today's Win Rate</p>
          <div className="flex items-baseline gap-1 relative z-10">
            <p className="text-green-400 text-3xl font-display font-bold drop-shadow-[0_0_8px_rgba(74,222,128,0.3)]">{todayStats.wr}</p>
            <span className="text-green-400 text-lg font-bold">%</span>
          </div>
          <p className="text-text-muted text-xs mt-2 relative z-10">{todayStats.closedCount} Signals Closed</p>
        </div>

        <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-2xl p-5 border border-white/5 shadow-md relative overflow-hidden group hover:border-gold-primary/30 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gold-primary/5 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-gold-primary/10"></div>
          <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">Overall Win Rate</p>
          <div className="flex items-baseline gap-1 relative z-10">
            <p className="text-gold-primary text-3xl font-display font-bold drop-shadow-[0_0_8px_rgba(255,215,0,0.3)]">{stats?.win_rate ?? "—"}</p>
            <span className="text-gold-primary text-lg font-bold">%</span>
          </div>
          <p className="text-text-muted text-xs mt-2 relative z-10">{stats ? `${(stats.total_signals || 0).toLocaleString()} Total Signals` : "—"}</p>
        </div>

        <div className="bg-gradient-to-br from-[#140a0c] to-[#0a0506] rounded-2xl p-5 border border-white/5 shadow-md relative overflow-hidden group hover:border-purple-500/30 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl -mr-10 -mt-10 transition-all group-hover:bg-purple-500/10"></div>
          <p className="text-text-muted text-[10px] font-bold uppercase tracking-widest mb-1 relative z-10">This Week</p>
          <p className="text-white text-3xl font-display font-bold relative z-10">{allSignals.length}</p>
          <p className="text-text-muted text-xs mt-2 relative z-10">Signals in View</p>
        </div>
      </div>

      {/* 3. UX MAXIMIZED FILTER CONSOLE */}
      <div className="bg-gradient-to-b from-[#1a0f13] to-[#0a0506] rounded-2xl p-6 border border-white/[0.08] shadow-2xl relative overflow-hidden">
        
        {/* Header Filter Console */}
        <div className="relative z-10 flex items-center justify-between border-b border-white/[0.08] pb-4 mb-6">
          <h2 className="text-sm font-semibold text-gold-primary flex items-center gap-2 tracking-widest uppercase drop-shadow-[0_0_8px_rgba(212,168,83,0.5)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            Signal Scanner
          </h2>
          {hasActiveFilters && (
            <button 
              onClick={resetFilters}
              className="text-[11px] text-gray-400 hover:text-white font-medium transition-colors flex items-center gap-1.5 bg-white/[0.05] px-3 py-1.5 rounded-lg hover:bg-white/[0.1] active:scale-95 border border-transparent hover:border-white/10"
            >
              <span>✕</span> Reset All
            </button>
          )}
        </div>

        {/* Top Row: Search & Sort */}
        <div className="relative z-10 flex flex-col md:flex-row gap-5 items-start mb-8">
          <div className="flex-1 w-full md:w-auto">
            <div className="grid grid-cols-1 md:grid-cols-10 gap-4">
              {/* Search */}
              <div className="md:col-span-6 relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 transition-colors group-focus-within:text-gold-primary">🔍</span>
                <input type="text" placeholder="Search Pair (e.g. BTC, ETH, SOL)..." value={searchPair} onChange={(e) => setSearchPair(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-black/60 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:border-gold-primary/50 focus:ring-1 focus:ring-gold-primary/50 focus:outline-none transition-all text-sm shadow-inner" />
              </div>
              {/* Sort By */}
              <div className="md:col-span-3 relative">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-4 py-3 bg-black/60 border border-white/10 rounded-xl text-white text-sm focus:border-gold-primary/50 focus:ring-1 focus:ring-gold-primary/50 focus:outline-none appearance-none cursor-pointer transition-all shadow-inner">
                  {sortOptions.map((opt) => <option key={opt.value} value={opt.value} className="bg-[#0a0506]">{opt.label}</option>)}
                </select>
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none text-[10px]">▼</span>
              </div>
              {/* Order */}
              <div className="md:col-span-1">
                <button onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
                  className="w-full h-full min-h-[46px] flex items-center justify-center px-2 bg-black/60 border border-white/10 rounded-xl text-white text-sm hover:border-gold-primary/50 transition-all shadow-inner hover:bg-white/5 active:scale-95">
                  {getOrderLabel()}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row: Timeline, Status, & Risk */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Timeline - HIGH CONTRAST CHIPS */}
          <div className="lg:col-span-5">
            <h2 className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center justify-between">
              <span>Timeline Filters</span>
              <span className="text-gray-600 lowercase font-normal">(multi-select)</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {dateOptions.map((opt) => {
                const isActive = opt.value === "all" ? selectedDates.length === 0 : selectedDates.includes(opt.value);
                return (
                  <button key={opt.value} onClick={() => toggleDateFilter(opt.value)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs transition-all duration-300 border ${
                      isActive
                        ? "bg-gold-primary text-[#0a0506] font-bold border-gold-primary shadow-[0_0_15px_rgba(212,168,83,0.3)] scale-[1.03] z-10" // POP ACTIVE
                        : "bg-black/40 text-gray-400 border-white/10 font-medium hover:border-white/30 hover:text-white hover:bg-white/5" // AFFORDANCE INACTIVE
                    }`}>
                    <span>{opt.label}</span>
                    {opt.count != null && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isActive ? "bg-black/20 text-[#0a0506]" : "bg-white/10 text-gray-400"}`}>{opt.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status - HIGH CONTRAST CHIPS */}
          <div className="lg:col-span-4 lg:border-l lg:border-white/5 lg:pl-6">
            <h2 className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-3">
              Signal Status
            </h2>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((opt) => {
                const isActive = statusFilter === opt.value;
                const isUpdated = opt.value === "updated";
                return (
                  <button key={opt.value}
                    onClick={() => { setStatusFilter(opt.value); if (isUpdated && sortBy === "created_at") setSortBy("last_update"); }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs transition-all duration-300 border ${
                      isActive
                        ? isUpdated 
                          ? "bg-amber-500 text-black font-bold border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] scale-[1.03] z-10" 
                          : "bg-gold-primary/10 text-gold-primary font-bold border-gold-primary shadow-[0_0_15px_rgba(212,168,83,0.2)] scale-[1.03] z-10"
                        : "bg-black/40 text-gray-400 border-white/10 font-medium hover:border-white/30 hover:text-white hover:bg-white/5"
                    }`}>
                    <span className="opacity-90">{opt.icon}</span>
                    <span>{opt.label}</span>
                    {isUpdated && updatedCount > 0 && !isActive && (
                      <span className="ml-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-full">{updatedCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Risk Profile - PRO SEGMENTED CONTROL */}
          <div className="lg:col-span-3 lg:border-l lg:border-white/5 lg:pl-6">
            <h2 className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-3">
              Risk Profile
            </h2>
            <div className="flex bg-black/60 p-1.5 rounded-xl border border-white/10 shadow-inner relative">
              {riskOptions.map((opt) => {
                const isActive = riskFilter === opt.value;
                return (
                  <button key={opt.value} onClick={() => setRiskFilter(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all duration-300 relative z-10 ${
                      isActive
                        ? "text-white shadow-lg border border-white/10 bg-white/10" // Active Block
                        : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    }`}>
                    {opt.value !== 'all' && (
                      <span className={`w-2 h-2 rounded-full ${opt.color} ${isActive ? 'shadow-[0_0_8px_currentColor] animate-pulse' : 'opacity-40'}`}></span>
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          
        </div>
      </div>

      {/* 4. Intelligence & Alerts Containers */}
      <div className="flex flex-col gap-4">
        
        {/* Accordion: Coin Intelligence */}
        <div className="bg-[#140a0c] border border-white/10 rounded-2xl overflow-hidden shadow-md transition-all">
          <button 
            onClick={() => setIsIntelOpen(!isIntelOpen)}
            className="w-full flex items-center justify-between p-5 hover:bg-white/[0.03] transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gold-primary/10 border border-gold-primary/20 flex items-center justify-center text-gold-primary text-lg shadow-inner">
                🧠
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-white text-sm tracking-wide">Coin Intelligence</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">AI-Powered deep analysis & streaks</p>
              </div>
            </div>
            <div className={`w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-gray-400 transition-transform duration-300 ${isIntelOpen ? 'rotate-180 text-gold-primary border-gold-primary/50' : ''}`}>
              ▼
            </div>
          </button>
          
          <div className={`transition-all duration-500 ease-in-out ${isIntelOpen ? 'max-h-[2000px] opacity-100 p-5 border-t border-white/10 bg-[#0a0506]' : 'max-h-0 opacity-0 overflow-hidden'}`}>
             <CoinIntelligence selectedDates={selectedDates} />
          </div>
        </div>

        {/* Accordion: BTC Dominance Alert */}
        <div className="bg-[#140a0c] border border-white/10 rounded-2xl overflow-hidden shadow-md transition-all">
          <button 
            onClick={() => setIsAlertOpen(!isAlertOpen)}
            className="w-full flex items-center justify-between p-5 hover:bg-white/[0.03] transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500 text-lg shadow-inner">
                ⚠️
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-white text-sm tracking-wide">BTC Dominance Alert</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">Macro market condition warning</p>
              </div>
            </div>
            <div className={`w-8 h-8 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-gray-400 transition-transform duration-300 ${isAlertOpen ? 'rotate-180 text-orange-500 border-orange-500/50' : ''}`}>
              ▼
            </div>
          </button>

          <div className={`transition-all duration-500 ease-in-out ${isAlertOpen ? 'max-h-[1000px] opacity-100 p-5 border-t border-white/10 bg-[#0a0506]' : 'max-h-0 opacity-0 overflow-hidden'}`}>
            <BtcDomAlert allSignals={allSignals} onSignalClick={setSelectedSignal} />
          </div>
        </div>

      </div>

      {/* 5. Error & Data Table */}
      {error && (
        <div className="bg-red-500/10 rounded-2xl p-8 border border-red-500/30 text-center flex flex-col items-center justify-center">
          <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center text-2xl mb-4">⚠️</div>
          <h3 className="text-red-400 font-bold text-lg mb-2">Failed to load signals</h3>
          <p className="text-gray-400 mb-6">{error}</p>
          <button 
            onClick={() => fetchBulkSignals(true)} 
            className="px-6 py-2.5 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition-colors font-semibold"
          >
            Try Again
          </button>
        </div>
      )}

      {!error && (
        <div className="bg-[#0a0506] rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
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

      {/* 6. Modal */}
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