import { useState, useEffect, useCallback, useMemo } from 'react';
import SignalsTable from './SignalsTable';

const API_BASE = '/api/v1';

/**
 * SignalsPage - Potential Trades
 * Default: Last 7 days signals only
 * RESPONSIVE: collapsible filters on mobile
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

  // Mobile filter toggle
  const [showFilters, setShowFilters] = useState(false);

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
      const now = new Date();
      const localToday = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      
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

  useEffect(() => { fetchSignals(); }, [fetchSignals]);
  useEffect(() => { fetchQuickStats(); }, [fetchQuickStats]);
  useEffect(() => { setPage(1); }, [searchPair, statusFilter, riskFilter, sortBy, sortOrder]);

  // Handle sort
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Count active filters
  const activeFilterCount = [
    searchPair !== '',
    statusFilter !== 'all',
    riskFilter !== 'all',
  ].filter(Boolean).length;

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
    <div className="space-y-4 lg:space-y-5">
      {/* ═══════════════════════════════════ */}
      {/* PAGE HEADER                         */}
      {/* ═══════════════════════════════════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 lg:w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-xl lg:text-2xl font-semibold text-white">Potential Trades</h2>
        </div>
        <div className="text-text-muted text-xs lg:text-sm">
          Last 7 Days · {totalSignals} signals
        </div>
      </div>

      {/* ═══════════════════════════════════ */}
      {/* QUICK STATS - Responsive grid       */}
      {/* ═══════════════════════════════════ */}
      {quickStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {/* Today's Signals */}
          <div className="glass-card rounded-xl p-3 lg:p-4 border border-gold-primary/10">
            <p className="text-text-muted text-[10px] lg:text-xs uppercase tracking-wider">Today</p>
            <p className="text-white text-lg lg:text-xl font-bold font-mono mt-0.5">{quickStats.todaySignals}</p>
            <p className="text-text-muted text-[10px] mt-0.5">
              <span className="text-cyan-400">{quickStats.todayOpen} open</span>
              {quickStats.todayClosed > 0 && (
                <> · <span className="text-positive">{quickStats.todayWins}W</span> / <span className="text-negative">{quickStats.todayLosses}L</span></>
              )}
            </p>
          </div>
          {/* Today Win Rate */}
          <div className="glass-card rounded-xl p-3 lg:p-4 border border-gold-primary/10">
            <p className="text-text-muted text-[10px] lg:text-xs uppercase tracking-wider">Today WR</p>
            <p className={`text-lg lg:text-xl font-bold font-mono mt-0.5 ${quickStats.todayWinRate >= 50 ? 'text-positive' : 'text-negative'}`}>
              {quickStats.todayWinRate}%
            </p>
            <p className="text-text-muted text-[10px] mt-0.5">{quickStats.todayClosed} closed</p>
          </div>
          {/* Overall Win Rate */}
          <div className="glass-card rounded-xl p-3 lg:p-4 border border-gold-primary/10">
            <p className="text-text-muted text-[10px] lg:text-xs uppercase tracking-wider">Overall WR</p>
            <p className={`text-lg lg:text-xl font-bold font-mono mt-0.5 ${quickStats.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
              {quickStats.winRate}%
            </p>
            <p className="text-text-muted text-[10px] mt-0.5">{quickStats.totalSignals.toLocaleString()} total</p>
          </div>
          {/* This Week */}
          <div className="glass-card rounded-xl p-3 lg:p-4 border border-gold-primary/10">
            <p className="text-text-muted text-[10px] lg:text-xs uppercase tracking-wider">This Week</p>
            <p className="text-white text-lg lg:text-xl font-bold font-mono mt-0.5">{totalSignals}</p>
            <p className="text-text-muted text-[10px] mt-0.5">signals in view</p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════ */}
      {/* FILTERS BAR                         */}
      {/* ═══════════════════════════════════ */}
      <div className="glass-card rounded-xl border border-gold-primary/10">
        
        {/* Mobile: Filter toggle header */}
        <div className="lg:hidden">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full flex items-center justify-between p-3.5"
          >
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gold-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span className="text-white text-sm font-medium">Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-gold-primary text-bg-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <svg className={`w-4 h-4 text-text-muted transition-transform ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Filter content - always visible on desktop, collapsible on mobile */}
        <div className={`${showFilters ? 'block' : 'hidden'} lg:block p-3.5 lg:p-4 ${showFilters ? 'border-t border-gold-primary/10' : ''} lg:border-t-0`}>
          
          {/* Row 1: Search + Sort + Order */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Pair */}
            <div className="flex-1">
              <label className="text-gold-primary text-[10px] lg:text-xs font-semibold uppercase tracking-wider mb-1 lg:mb-1.5 block">
                Search Pair
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">🔍</span>
                <input
                  type="text"
                  placeholder="BTC, ETH, SOL..."
                  value={searchPair}
                  onChange={(e) => setSearchPair(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 lg:py-2.5 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm placeholder-text-muted focus:outline-none focus:border-gold-primary/50 transition-colors"
                />
              </div>
            </div>

            {/* Sort + Order row */}
            <div className="flex gap-2 sm:gap-3">
              {/* Sort By */}
              <div className="flex-1 sm:w-36 lg:w-40">
                <label className="text-gold-primary text-[10px] lg:text-xs font-semibold uppercase tracking-wider mb-1 lg:mb-1.5 block">
                  Sort By
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-3 py-2 lg:py-2.5 bg-bg-card border border-gold-primary/20 rounded-lg text-white text-sm focus:outline-none focus:border-gold-primary/50"
                >
                  <option value="created_at">Time</option>
                  <option value="pair">Pair</option>
                  <option value="entry">Entry Price</option>
                  <option value="risk_level">Risk Level</option>
                </select>
              </div>

              {/* Order */}
              <div className="w-28 lg:w-32">
                <label className="text-gold-primary text-[10px] lg:text-xs font-semibold uppercase tracking-wider mb-1 lg:mb-1.5 block">
                  Order
                </label>
                <button
                  onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                  className="w-full px-3 py-2 lg:py-2.5 bg-bg-card border border-gold-primary/20 rounded-lg text-white flex items-center justify-center gap-1.5 hover:border-gold-primary/40 transition-colors text-sm"
                >
                  <span>{sortOrder === 'desc' ? '↓' : '↑'}</span>
                  <span>{sortOrder === 'desc' ? 'Newest' : 'Oldest'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Status + Risk */}
          <div className="mt-3 lg:mt-4 pt-3 lg:pt-4 border-t border-gold-primary/10 space-y-3 lg:space-y-0 lg:flex lg:gap-6">
            {/* Status */}
            <div className="flex-1">
              <label className="text-gold-primary text-[10px] lg:text-xs font-semibold uppercase tracking-wider mb-1.5 lg:mb-2 block">
                Status
              </label>
              <div className="flex flex-wrap gap-1.5 lg:gap-2">
                {statusOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setStatusFilter(opt.value)}
                    className={`px-2.5 lg:px-3 py-1 lg:py-1.5 rounded-lg text-xs lg:text-sm font-medium flex items-center gap-1 lg:gap-1.5 transition-all ${
                      statusFilter === opt.value
                        ? 'bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-gold-glow'
                        : 'bg-bg-card border border-gold-primary/20 text-text-secondary hover:text-white hover:border-gold-primary/40'
                    }`}
                  >
                    <span className="hidden sm:inline">{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Risk Level */}
            <div className="lg:flex-shrink-0">
              <label className="text-gold-primary text-[10px] lg:text-xs font-semibold uppercase tracking-wider mb-1.5 lg:mb-2 block">
                Risk Level
              </label>
              <div className="flex flex-wrap gap-1.5 lg:gap-2">
                {riskOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setRiskFilter(opt.value)}
                    className={`px-2.5 lg:px-3 py-1 lg:py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-all border ${
                      riskFilter === opt.value
                        ? opt.value === 'all'
                          ? 'bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary border-transparent shadow-gold-glow'
                          : `${opt.color} border-current font-bold ring-1 ring-current`
                        : opt.value === 'all'
                          ? 'bg-bg-card border-gold-primary/20 text-text-secondary hover:text-white hover:border-gold-primary/40'
                          : 'bg-bg-card border-gold-primary/20 text-text-secondary hover:border-gold-primary/40 hover:text-white'
                    }`}
                  >
                    {opt.value !== 'all' && (
                      <span className={`inline-block w-2 h-2 rounded-full mr-1 lg:mr-1.5 ${
                        opt.value === 'low' ? 'bg-green-400' : opt.value === 'normal' ? 'bg-yellow-400' : 'bg-red-400'
                      }`} />
                    )}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile: Clear filters button */}
          {activeFilterCount > 0 && (
            <div className="mt-3 pt-3 border-t border-gold-primary/10 lg:hidden">
              <button
                onClick={() => {
                  setSearchPair('');
                  setStatusFilter('all');
                  setRiskFilter('all');
                  setSortBy('created_at');
                  setSortOrder('desc');
                }}
                className="w-full py-2 text-xs text-gold-primary border border-gold-primary/20 rounded-lg hover:bg-gold-primary/10 transition-colors"
              >
                Clear All Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════ */}
      {/* ERROR STATE                         */}
      {/* ═══════════════════════════════════ */}
      {error && (
        <div className="glass-card rounded-xl p-4 lg:p-6 border border-red-500/30 text-center">
          <p className="text-red-400 mb-3 text-sm">⚠️ {error}</p>
          <button 
            onClick={fetchSignals}
            className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {/* ═══════════════════════════════════ */}
      {/* SIGNALS TABLE                       */}
      {/* ═══════════════════════════════════ */}
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