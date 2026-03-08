import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next"; // <-- 1. Import i18next
import SignalsTable from "./SignalsTable";
import SignalModal from "./SignalModal";
import BtcDomAlert from "./BtcDomAlert";

const API_BASE = import.meta.env.VITE_API_URL || "";

/**
 * SignalsPage - Client-side pagination for zero delay
 * * Strategy:
 * 1. Fetch ALL 7-day signals in one call (/signals/bulk-7d) — pre-cached by backend
 * 2. Sort, filter, paginate entirely on client-side
 * 3. Page changes = instant (no network request)
 * 4. Auto-refresh every 90s to match cache worker interval
 * * NEW: "Recently Updated" sort + "Has Update" filter
 * - sort_by=last_update sorts by last_update_at DESC (most recent update first)
 * - statusFilter="updated" shows only signals that have at least one update
 */
const SignalsPage = () => {
  const { t } = useTranslation(); // <-- 2. Panggil hook i18n

  // Raw data from backend (all 7d signals)
  const [allSignals, setAllSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Stats (fetched separately for the header cards)
  const [stats, setStats] = useState(null);

  // Client-side pagination
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Client-side filters
  const [searchPair, setSearchPair] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("desc");

  // ─── Fetch ALL 7d signals once ───
  const fetchBulkSignals = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError(null);

      // Fetch bulk signals + stats in parallel
      const [signalsRes, statsRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/v1/signals/bulk-7d`),
        fetch(`${API_BASE}/api/v1/signals/stats`),
      ]);

      // Process signals
      if (signalsRes.status === "fulfilled" && signalsRes.value.ok) {
        const data = await signalsRes.value.json();
        setAllSignals(data.items || []);
      } else {
        throw new Error("Failed to fetch signals");
      }

      // Process stats
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

  // Initial fetch + auto-refresh every 90s
  useEffect(() => {
    fetchBulkSignals(true);
    const interval = setInterval(() => fetchBulkSignals(false), 90000);
    return () => clearInterval(interval);
  }, [fetchBulkSignals]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchPair, statusFilter, riskFilter, sortBy, sortOrder]);

  // ─── Count signals with updates (for badge) ───
  const updatedCount = useMemo(() => {
    return allSignals.filter((s) => s.last_update_at).length;
  }, [allSignals]);

  // ─── Compute today's stats from allSignals ───
  const todayStats = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const todaySignals = allSignals.filter((s) => {
      if (!s.created_at) return false;
      return s.created_at.slice(0, 10) === todayStr;
    });

    const total = todaySignals.length;
    const open = todaySignals.filter((s) => s.status === "open").length;
    const closed = todaySignals.filter((s) => s.status !== "open");
    const wins = closed.filter(
      (s) => !["closed_loss", "sl"].includes(s.status),
    ).length;
    const losses = closed.filter((s) =>
      ["closed_loss", "sl"].includes(s.status),
    ).length;
    const closedCount = closed.length;
    const wr = closedCount > 0 ? Math.round((wins / closedCount) * 100) : 0;

    return { total, open, wins, losses, closedCount, wr };
  }, [allSignals]);

  // ─── Client-side filter + sort + paginate ───
  const { signals, totalPages, totalSignals } = useMemo(() => {
    let filtered = [...allSignals];

    // Filter by search pair
    if (searchPair) {
      const search = searchPair.toUpperCase();
      filtered = filtered.filter(
        (s) => s.pair && s.pair.toUpperCase().includes(search),
      );
    }

    // Filter by status — NEW: "updated" filter shows only signals with updates
    if (statusFilter === "updated") {
      filtered = filtered.filter((s) => s.last_update_at);
    } else if (statusFilter !== "all") {
      filtered = filtered.filter((s) => {
        const st = (s.status || "").toLowerCase();
        switch (statusFilter) {
          case "open":
            return st === "open";
          case "tp1":
            return st === "tp1";
          case "tp2":
            return st === "tp2";
          case "tp3":
            return st === "tp3";
          case "tp4":
          case "closed_win":
            return st === "closed_win" || st === "tp4";
          case "sl":
          case "closed_loss":
            return st === "closed_loss" || st === "sl";
          default:
            return true;
        }
      });
    }

    // Filter by risk
    if (riskFilter !== "all") {
      filtered = filtered.filter((s) => {
        const r = (s.risk_level || "").toLowerCase();
        switch (riskFilter) {
          case "low":
            return r.startsWith("low");
          case "normal":
            return r.startsWith("med") || r.startsWith("nor");
          case "high":
            return r.startsWith("high");
          default:
            return true;
        }
      });
    }

    // Sort — NEW: last_update sorts by last_update_at
    filtered.sort((a, b) => {
      let valA, valB;
      switch (sortBy) {
        case "pair":
          valA = (a.pair || "").toLowerCase();
          valB = (b.pair || "").toLowerCase();
          return sortOrder === "asc"
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        case "entry":
          valA = parseFloat(a.entry) || 0;
          valB = parseFloat(b.entry) || 0;
          break;
        case "status":
          const statusRank = {
            open: 0,
            tp1: 1,
            tp2: 2,
            tp3: 3,
            closed_win: 4,
            tp4: 4,
            closed_loss: 5,
            sl: 5,
          };
          valA = statusRank[(a.status || "").toLowerCase()] ?? 9;
          valB = statusRank[(b.status || "").toLowerCase()] ?? 9;
          break;
        case "risk_level":
          const riskRank = (r) => {
            const rl = (r || "").toLowerCase();
            if (rl.startsWith("low")) return 1;
            if (rl.startsWith("med") || rl.startsWith("nor")) return 2;
            if (rl.startsWith("high")) return 3;
            return 4;
          };
          valA = riskRank(a.risk_level);
          valB = riskRank(b.risk_level);
          break;
        case "market_cap":
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
          valA = parseMcap(a.market_cap);
          valB = parseMcap(b.market_cap);
          break;
        case "last_update":
          // Signals with no update go to the bottom
          const tsA = a.last_update_at
            ? new Date(a.last_update_at).getTime()
            : 0;
          const tsB = b.last_update_at
            ? new Date(b.last_update_at).getTime()
            : 0;
          // If one has update and other doesn't, the one with update goes first (DESC)
          if (tsA === 0 && tsB !== 0) return 1;
          if (tsA !== 0 && tsB === 0) return -1;
          valA = tsA;
          valB = tsB;
          break;
        case "created_at":
        default:
          valA = a.call_message_id || 0;
          valB = b.call_message_id || 0;
          break;
      }
      if (sortBy !== "pair") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }
      return 0; // pair already handled above
    });

    // Paginate
    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, pages);
    const start = (safePage - 1) * pageSize;
    const paged = filtered.slice(start, start + pageSize);

    return { signals: paged, totalPages: pages, totalSignals: total };
  }, [
    allSignals,
    searchPair,
    statusFilter,
    riskFilter,
    sortBy,
    sortOrder,
    page,
    pageSize,
  ]);

  // Handle sort toggle
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  // Status filter options — NEW: added "Updated" option
  const statusOptions = [
    { value: "all", label: t("signals.all"), icon: "📊" },
    { value: "updated", label: t("signals.newest_hit"), icon: "🔔" },
    { value: "open", label: t("signals.open"), icon: "🟢" },
    { value: "tp1", label: "TP1", icon: "✓" },
    { value: "tp2", label: "TP2", icon: "✓" },
    { value: "tp3", label: "TP3", icon: "✓" },
    { value: "closed_win", label: "TP4", icon: "🏆" },
    { value: "closed_loss", label: t("signals.loss"), icon: "✗" },
  ];

  // Risk filter options
  const riskOptions = [
    { value: "all", label: "All Risk" },
    { value: "low", label: "Low" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "High" },
  ];

  // Sort options — NEW: added "Last Update"
  const sortOptions = [
    { value: "created_at", label: t("signals.time") },
    { value: "last_update", label: t("signals.last_update") },
    { value: "pair", label: t("signals.pair") },
    { value: "status", label: t("signals.status") },
    { value: "risk_level", label: t("signals.risk_level") },
    { value: "market_cap", label: t("signals.mcap") },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
            <h1 className="text-2xl font-display font-bold text-white">
              {t("signals.title")}
            </h1>
          </div>
        </div>

        {/* Right side info */}
        <div className="flex items-center gap-4">
          <span className="text-text-muted text-sm">
            {t("signals.last_7d")} ·{" "}
            <span className="text-white font-semibold">
              {allSignals.length}
            </span>{" "}
            {t("signals.signals")}
            {updatedCount > 0 && (
              <span className="ml-2 text-gold-primary">
                · <span className="font-semibold">{updatedCount}</span>{" "}
                {t("signals.updated")}
              </span>
            )}
          </span>
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <span
              className={`w-2 h-2 rounded-full ${loading ? "bg-yellow-400 animate-pulse" : "bg-green-400"}`}
            />
            <span>
              {loading
                ? "Loading..."
                : lastUpdated
                  ? `${lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
                  : "Ready"}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
          <p className="text-text-muted text-xs uppercase tracking-wider">
            {t("signals.today")}
          </p>
          <p className="text-white text-2xl font-bold mt-1">
            {todayStats.total}
          </p>
          <p className="text-text-muted text-xs mt-1">
            <span className="text-green-400">
              {todayStats.open} {t("signals.open")}
            </span>{" "}
            · {todayStats.wins}W / {todayStats.losses}L
          </p>
        </div>
        <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
          <p className="text-text-muted text-xs uppercase tracking-wider">
            {t("signals.today")} WR
          </p>
          <p className="text-green-400 text-2xl font-bold mt-1">
            {todayStats.wr}%
          </p>
          <p className="text-text-muted text-xs mt-1">
            {todayStats.closedCount} {t("signals.closed")}
          </p>
        </div>
        <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
          <p className="text-text-muted text-xs uppercase tracking-wider">
            {t("signals.overall_wr")}
          </p>
          <p className="text-green-400 text-2xl font-bold mt-1">
            {stats?.win_rate ?? "—"}%
          </p>
          <p className="text-text-muted text-xs mt-1">
            {stats
              ? `${(stats.total_signals || 0).toLocaleString()} ${t("signals.total")}`
              : "—"}
          </p>
        </div>
        <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
          <p className="text-text-muted text-xs uppercase tracking-wider">
            {t("signals.this_week")}
          </p>
          <p className="text-white text-2xl font-bold mt-1">
            {allSignals.length}
          </p>
          <p className="text-text-muted text-xs mt-1">{t("signals.in_view")}</p>
        </div>
      </div>

      <BtcDomAlert allSignals={allSignals} onSignalClick={setSelectedSignal} />

      {/* Filters */}
      <div className="glass-card rounded-xl p-4 border border-gold-primary/10 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <p className="text-green-400 text-xs font-semibold uppercase tracking-wider mb-2">
              {t("signals.search_pair")}
            </p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                🔍
              </span>
              <input
                type="text"
                placeholder="BTC, ETH, SOL..."
                value={searchPair}
                onChange={(e) => setSearchPair(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-bg-primary border border-gold-primary/20 rounded-xl text-white placeholder-text-muted focus:border-gold-primary/50 focus:outline-none transition-colors text-sm"
              />
            </div>
          </div>

          {/* Sort By + Order */}
          <div className="flex gap-3">
            <div>
              <p className="text-green-400 text-xs font-semibold uppercase tracking-wider mb-2">
                {t("signals.sort_by")}
              </p>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2.5 bg-bg-primary border border-gold-primary/20 rounded-xl text-white text-sm focus:border-gold-primary/50 focus:outline-none appearance-none cursor-pointer"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-green-400 text-xs font-semibold uppercase tracking-wider mb-2">
                {t("signals.order")}
              </p>
              <button
                onClick={() =>
                  setSortOrder(sortOrder === "desc" ? "asc" : "desc")
                }
                className="px-4 py-2.5 bg-bg-primary border border-gold-primary/20 rounded-xl text-white text-sm hover:border-gold-primary/40 transition-colors"
              >
                {sortOrder === "desc" ? "↓ Newest" : "↑ Oldest"}
              </button>
            </div>
          </div>
        </div>

        {/* Status + Risk Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              {t("signals.status")}
            </p>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setStatusFilter(opt.value);
                    // Auto-switch to last_update sort when clicking "Updated"
                    if (opt.value === "updated" && sortBy === "created_at") {
                      setSortBy("last_update");
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                    statusFilter === opt.value
                      ? opt.value === "updated"
                        ? "bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-lg shadow-amber-500/20"
                        : "bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-gold-glow"
                      : "bg-bg-primary border border-gold-primary/20 text-text-secondary hover:text-white hover:border-gold-primary/40"
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                  {/* Show count badge for "Updated" */}
                  {opt.value === "updated" &&
                    updatedCount > 0 &&
                    statusFilter !== "updated" && (
                      <span className="ml-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-full">
                        {updatedCount}
                      </span>
                    )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-2">
              {t("signals.risk_level")}
            </p>
            <div className="flex flex-wrap gap-2">
              {riskOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRiskFilter(opt.value)}
                  className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-all ${
                    riskFilter === opt.value
                      ? "bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-gold-glow"
                      : "bg-bg-primary border border-gold-primary/20 text-text-secondary hover:text-white hover:border-gold-primary/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="glass-card rounded-xl p-6 border border-red-500/30 text-center">
          <p className="text-red-400 mb-3">⚠️ {error}</p>
          <button
            onClick={() => fetchBulkSignals(true)}
            className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Signals Table */}
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
        />
      )}

      {/* Signal Detail Modal */}
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
