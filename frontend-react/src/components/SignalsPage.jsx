import { useState, useEffect, useCallback, useMemo } from 'react';
import SignalsTable from './SignalsTable';

const API_BASE = '/api/v1';

/**
 * SignalsPage - Potential Trades
 * Default: Last 7 days signals only
 */
const SignalsPage = () => {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSignals, setTotalSignals] = useState(0);
  const pageSize = 20;

  // Filters
  const [searchPair, setSearchPair] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Quick Stats
  const [quickStats, setQuickStats] = useState(null);

  // Get date 7 days ago
  const dateFrom = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const year = weekAgo.getFullYear();
    const month = String(weekAgo.getMonth() + 1).padStart(2, '0');
    const day = String(weekAgo.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Fetch signals
  const fetchSignals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        sort_by: sortBy,
        sort_order: sortOrder,
        date_from: dateFrom,
      });

      if (searchPair) params.append('pair', searchPair.toUpperCase());
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (riskFilter !== 'all') params.append('risk_level', riskFilter);

      const url = `${API_BASE}/signals/?${params}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch signals');
      
      const data = await response.json();
      setSignals(data.items || []);
      setTotalPages(data.total_pages || 1);
      setTotalSignals(data.total || 0);
    } catch (err) {
      console.error('Error fetching signals:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, searchPair, statusFilter, riskFilter, sortBy, sortOrder, dateFrom]);

  // Fetch quick stats
  const fetchQuickStats = useCallback(async () => {
    try {
      // Use UTC-adjusted date to capture all "today" signals in any timezone
      // For WIB (UTC+7), signals created at 00:00-06:59 WIB are still "yesterday" in UTC
      // So we fetch from yesterday UTC to be safe, then filter by local date
      const now = new Date();
      const localToday = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      
      // Go back 1 day to account for timezone offset
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
      
      const [statsRes, todayRes] = await Promise.allSettled([
        fetch(`${API_BASE}/signals/stats`),
        fetch(`${API_BASE}/signals/?page=1&page_size=100&date_from=${yesterdayStr}&sort_by=created_at&sort_order=desc`),
      ]);

      const stats = statsRes.status === 'fulfilled' && statsRes.value.ok
        ? await statsRes.value.json() : null;

      const todayData = todayRes.status === 'fulfilled' && todayRes.value.ok
        ? await todayRes.value.json() : null;

      let todayWins = 0;
      let todayLosses = 0;
      let openCount = 0;
      let todaySignalsCount = 0;

      if (todayData?.items) {
        const todayDateNum = now.getDate();
        const todayMonth = now.getMonth();
        const todayYear = now.getFullYear();
        
        todayData.items.forEach(s => {
          if (!s.created_at) return;
          // Parse and compare using local date
          const d = new Date(s.created_at);
          if (d.getDate() !== todayDateNum || d.getMonth() !== todayMonth || d.getFullYear() !== todayYear) return;
          
          todaySignalsCount++;
          const st = s.status?.toLowerCase();
          if (st === 'open') {
            openCount++;
          } else if (['tp1', 'tp2', 'tp3', 'tp4', 'closed_win'].includes(st)) {
            todayWins++;
          } else if (['closed_loss', 'sl'].includes(st)) {
            todayLosses++;
          }
        });
      }

      const todayClosed = todayWins + todayLosses;
      const todayWinRate = todayClosed > 0 ? (todayWins / todayClosed * 100) : 0;

      setQuickStats({
        totalSignals: stats?.total_signals || 0,
        winRate: stats?.win_rate || 0,
        todayWinRate: Math.round(todayWinRate),
        todaySignals: todaySignalsCount,
        todayOpen: openCount,
        todayWins,
        todayLosses,
        todayClosed,
      });
    } catch (err) {
      console.error('Quick stats error:', err);
    }
  }, []);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  useEffect(() => {
    fetchQuickStats();
  }, [fetchQuickStats]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [searchPair, statusFilter, riskFilter, sortBy, sortOrder]);

  // Handle sort
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Status options
  const statusOptions = [
    { value: 'all', label: 'All', icon: '📋' },
    { value: 'open', label: 'Open', icon: '🔵' },
    { value: 'tp1', label: 'TP1', icon: '✅' },
    { value: 'tp2', label: 'TP2', icon: '✅' },
    { value: 'tp3', label: 'TP3', icon: '✅' },
    { value: 'closed_win', label: 'TP4', icon: '🏆' },
    { value: 'closed_loss', label: 'Loss', icon: '❌' },
  ];

  // Risk options
  const riskOptions = [
    { value: 'all', label: 'All Risk' },
    { value: 'low', label: 'Low', color: 'text-green-400 border-green-500/30 bg-green-500/10' },
    { value: 'normal', label: 'Normal', color: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' },
    { value: 'high', label: 'High', color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  ];

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">Recent Signals</h2>
          <span className="px-2 py-1 bg-gold-primary/10 text-gold-primary text-xs font-medium rounded">
            Last 7 Days
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-text-muted text-sm">
            Showing <span className="text-gold-primary font-semibold">{signals.length}</span> of <span className="text-white font-semibold">{totalSignals.toLocaleString()}</span> signals
          </span>
          
          <a 
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent('navigate', { detail: 'analytics' }));
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-gold-primary/10 border border-gold-primary/30 rounded-lg text-gold-primary text-sm hover:bg-gold-primary/20 transition-colors"
            title="View all signals from the beginning"
          >
            <span>📊</span>
            <span>Full History</span>
          </a>
        </div>
      </div>

      {/* Quick Stats Bar */}
      {quickStats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Today's Signals */}
          <div className="glass-card rounded-xl p-4 border border-gold-primary/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-text-muted text-xs uppercase tracking-wider">Today</span>
              <span className="text-gold-primary text-sm">📡</span>
            </div>
            <p className="text-2xl font-bold text-white">{quickStats.todaySignals}</p>
            <p className="text-text-muted text-xs mt-1">{quickStats.todayOpen} still open</p>
          </div>

          {/* Today Win Rate */}
          <div className="glass-card rounded-xl p-4 border border-green-500/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-text-muted text-xs uppercase tracking-wider">Today Win Rate</span>
              <span className="text-green-400 text-sm">📈</span>
            </div>
            <p className={`text-2xl font-bold ${quickStats.todayWinRate >= 50 ? 'text-green-400' : quickStats.todayClosed === 0 ? 'text-text-muted' : 'text-red-400'}`}>
              {quickStats.todayClosed > 0 ? `${quickStats.todayWinRate}%` : '—'}
            </p>
            <p className="text-text-muted text-xs mt-1">
              {quickStats.todayClosed > 0 
                ? `${quickStats.todayWins}W / ${quickStats.todayLosses}L`
                : 'No closed signals yet'
              }
            </p>
          </div>

          {/* Overall Win Rate */}
          <div className="glass-card rounded-xl p-4 border border-emerald-500/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-text-muted text-xs uppercase tracking-wider">Overall Win Rate</span>
              <span className="text-emerald-400 text-sm">🏆</span>
            </div>
            <p className={`text-2xl font-bold ${quickStats.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
              {quickStats.winRate}%
            </p>
            <p className="text-text-muted text-xs mt-1">{quickStats.totalSignals.toLocaleString()} total signals</p>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search Pair */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-1.5 block">
              Search Pair
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">🔍</span>
              <input
                type="text"
                placeholder="BTC, ETH, SOL..."
                value={searchPair}
                onChange={(e) => setSearchPair(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-bg-card border border-gold-primary/20 rounded-lg text-white placeholder-text-muted focus:outline-none focus:border-gold-primary/50 transition-colors"
              />
            </div>
          </div>

          {/* Sort By */}
          <div className="w-40">
            <label className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-1.5 block">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2.5 bg-bg-card border border-gold-primary/20 rounded-lg text-white focus:outline-none focus:border-gold-primary/50"
            >
              <option value="created_at">Time</option>
              <option value="pair">Pair</option>
              <option value="entry">Entry Price</option>
              <option value="risk_level">Risk Level</option>
            </select>
          </div>

          {/* Order */}
          <div className="w-32">
            <label className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-1.5 block">
              Order
            </label>
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="w-full px-3 py-2.5 bg-bg-card border border-gold-primary/20 rounded-lg text-white flex items-center justify-center gap-2 hover:border-gold-primary/40 transition-colors"
            >
              <span>{sortOrder === 'desc' ? '↓' : '↑'}</span>
              <span>{sortOrder === 'desc' ? 'Newest' : 'Oldest'}</span>
            </button>
          </div>
        </div>

        {/* Status + Risk Filters */}
        <div className="mt-4 pt-4 border-t border-gold-primary/10 flex flex-wrap gap-6">
          {/* Status */}
          <div className="flex-1 min-w-[300px]">
            <label className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-2 block">
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-all ${
                    statusFilter === opt.value
                      ? 'bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-gold-glow'
                      : 'bg-bg-card border border-gold-primary/20 text-text-secondary hover:text-white hover:border-gold-primary/40'
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Risk Level */}
          <div>
            <label className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-2 block">
              Risk Level
            </label>
            <div className="flex flex-wrap gap-2">
              {riskOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setRiskFilter(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                    riskFilter === opt.value
                      ? opt.value === 'all'
                        ? 'bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary border-transparent shadow-gold-glow'
                        : `${opt.color} border-current font-bold ring-1 ring-current`
                      : opt.value === 'all'
                        ? 'bg-bg-card border-gold-primary/20 text-text-secondary hover:text-white hover:border-gold-primary/40'
                        : `bg-bg-card border-gold-primary/20 text-text-secondary hover:border-gold-primary/40 hover:text-white`
                  }`}
                >
                  {opt.value !== 'all' && (
                    <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                      opt.value === 'low' ? 'bg-green-400' : opt.value === 'normal' ? 'bg-yellow-400' : 'bg-red-400'
                    }`} />
                  )}
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
            onClick={fetchSignals}
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
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
};

export default SignalsPage;