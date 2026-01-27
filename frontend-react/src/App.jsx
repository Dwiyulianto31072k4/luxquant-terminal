import { useState, useEffect } from 'react';
import Header from './components/Header';
import StatsCards from './components/StatsCards';
import SignalsTable from './components/SignalsTable';
import { signalsApi, marketApi } from './services/api';

function App() {
  const [signals, setSignals] = useState([]);
  const [stats, setStats] = useState(null);
  const [market, setMarket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState('all');
  const [searchPair, setSearchPair] = useState('');

  // Fetch signals
  const fetchSignals = async () => {
    try {
      const statusFilter = filter === 'all' ? null : filter;
      const data = await signalsApi.getSignals(page, 20, statusFilter, searchPair || null);
      setSignals(data.items);
      setTotalPages(data.total_pages);
    } catch (error) {
      console.error('Error fetching signals:', error);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const data = await signalsApi.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  // Fetch market data
  const fetchMarket = async () => {
    try {
      const data = await marketApi.getOverview();
      setMarket(data);
    } catch (error) {
      console.error('Error fetching market:', error);
    }
  };

  // Initial fetch
  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      await Promise.all([fetchSignals(), fetchStats(), fetchMarket()]);
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
      fetchMarket();
    }, 30000);
    return () => clearInterval(interval);
  }, [page, filter, searchPair]);

  return (
    <div className="min-h-screen">
      {/* Background */}
      <div className="luxury-bg" />
      
      {/* Corner Ornaments */}
      <div className="corner-ornament top-left" />
      <div className="corner-ornament top-right" />
      <div className="corner-ornament bottom-left" />
      <div className="corner-ornament bottom-right" />

      {/* Main Content */}
      <div className="relative z-10 max-w-[1600px] mx-auto px-6 py-6">
        <Header market={market} />
        
        <StatsCards stats={stats} loading={loading} />

        {/* Filter Section */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
            <h2 className="font-display text-2xl font-semibold text-white">Trading Signals</h2>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Search */}
            <input
              type="text"
              placeholder="Search pair..."
              value={searchPair}
              onChange={(e) => {
                setSearchPair(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 bg-bg-card border border-gold-primary/20 rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-gold-primary/50 font-mono text-sm"
            />
            
            {/* Filter Pills */}
            <div className="flex gap-2">
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
    </div>
  );
}

export default App;
