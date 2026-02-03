import { useState, useEffect } from 'react';
import StatsCards from './StatsCards';
import SignalsTable from './SignalsTable';

// API base URL
const API_BASE = '/api/v1';

/**
 * SignalsPage - Trading signals dashboard
 */
const SignalsPage = () => {
  const [signals, setSignals] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState('all');
  const [searchPair, setSearchPair] = useState('');

  // Fetch signals
  const fetchSignals = async () => {
    try {
      const params = new URLSearchParams({ page, page_size: 20 });
      if (filter !== 'all') params.append('status', filter);
      if (searchPair) params.append('pair', searchPair);
      
      const response = await fetch(`${API_BASE}/signals/?${params}`);
      if (response.ok) {
        const data = await response.json();
        setSignals(data.items || []);
        setTotalPages(data.total_pages || 1);
      }
    } catch (error) {
      console.error('Error fetching signals:', error);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/signals/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // Initial fetch
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      await Promise.all([fetchSignals(), fetchStats()]);
      setLoading(false);
    };
    fetchAll();
  }, []);

  // Refetch when filter or page changes
  useEffect(() => {
    fetchSignals();
  }, [page, filter, searchPair]);

  // Auto refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchSignals();
      fetchStats();
    }, 30000);
    return () => clearInterval(interval);
  }, [page, filter, searchPair]);

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center gap-3">
        <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
        <h2 className="font-display text-2xl font-semibold text-white">Trading Signals</h2>
      </div>

      {/* Stats Cards */}
      <StatsCards stats={stats} loading={loading} />

      {/* Filter Section */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Search */}
        <input
          type="text"
          placeholder="Search pair..."
          value={searchPair}
          onChange={(e) => {
            setSearchPair(e.target.value);
            setPage(1);
          }}
          className="px-4 py-2.5 bg-bg-card border border-gold-primary/20 rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-gold-primary/50 font-mono text-sm min-w-[200px]"
        />
        
        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {['all', 'open', 'tp1', 'tp2', 'tp3', 'closed_win', 'closed_loss'].map((f) => (
            <button
              key={f}
              onClick={() => {
                setFilter(f);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-gold-glow'
                  : 'bg-transparent border border-gold-primary/20 text-text-secondary hover:border-gold-primary/40 hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : f.toUpperCase().replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Signals Table */}
      <SignalsTable 
        signals={signals} 
        loading={loading} 
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
};

export default SignalsPage;