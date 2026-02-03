import { useState, useEffect, useCallback, useMemo } from 'react';
import SignalsTable from './SignalsTable';
import SignalModal from './SignalModal';

const API_BASE = '/api/v1';

/**
 * SignalsPage - Simplified version
 * Default: Last 7 days signals only
 */
const SignalsPage = () => {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  
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

      if (searchPair) {
        params.append('pair', searchPair.toUpperCase());
      }
      
      // Status filter - map to database values
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      
      if (riskFilter !== 'all') {
        params.append('risk_level', riskFilter);
      }

      const url = `${API_BASE}/signals/?${params}`;
      console.log('Fetching:', url);
      
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

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

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

  // Status options - TP4 maps to closed_win, Loss maps to closed_loss
  const statusOptions = [
    { value: 'all', label: 'All', icon: '📋' },
    { value: 'open', label: 'Open', icon: '🔵' },
    { value: 'tp1', label: 'TP1', icon: '✅' },
    { value: 'tp2', label: 'TP2', icon: '✅' },
    { value: 'tp3', label: 'TP3', icon: '✅' },
    { value: 'closed_win', label: 'TP4', icon: '🏆' },
    { value: 'closed_loss', label: 'Loss', icon: '❌' },
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
          >
            <span>📊</span>
            <span>Full Analysis</span>
          </a>
        </div>
      </div>

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

          {/* Risk Filter */}
          <div className="w-32">
            <label className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-1.5 block">
              Risk
            </label>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-bg-card border border-gold-primary/20 rounded-lg text-white focus:outline-none focus:border-gold-primary/50"
            >
              <option value="all">All Risk</option>
              <option value="low">Low</option>
              <option value="med">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="mt-4 pt-4 border-t border-gold-primary/10">
          <label className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-2 block">
            Status
          </label>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
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
          signal={selectedSignal} 
          onClose={() => setSelectedSignal(null)} 
        />
      )}
    </div>
  );
};

export default SignalsPage;