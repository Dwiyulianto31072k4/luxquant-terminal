import { useState, useEffect } from 'react';
import Header from './components/Header';
import StatsCards from './components/StatsCards';
import SignalsTable from './components/SignalsTable';
import MarketDashboard from './components/MarketDashboard';
import { signalsApi, marketApi } from './services/api';

function App() {
  const [activeTab, setActiveTab] = useState('signals'); // 'signals' or 'market'
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
    if (activeTab === 'signals') {
      fetchSignals();
    }
  }, [page, filter, searchPair, activeTab]);

  // Auto refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'signals') {
        fetchSignals();
        fetchStats();
      }
      fetchMarket();
    }, 30000);
    return () => clearInterval(interval);
  }, [page, filter, searchPair, activeTab]);

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
        {/* Header with Navigation */}
        <header className="flex items-center justify-between py-4 mb-6 flex-wrap gap-4">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-gold-light via-gold-primary to-gold-dark rounded-2xl flex items-center justify-center shadow-gold-glow">
              <span className="font-display font-bold text-xl text-bg-primary">LQ</span>
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold text-white tracking-wide">LuxQuant</h1>
              <p className="text-xs text-text-muted uppercase tracking-[3px]">Trading Terminal</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 bg-bg-card/50 p-1.5 rounded-xl border border-gold-primary/20">
            <button
              onClick={() => setActiveTab('signals')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'signals'
                  ? 'bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-gold-glow'
                  : 'text-text-secondary hover:text-white hover:bg-white/5'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('market')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'market'
                  ? 'bg-gradient-to-r from-gold-dark to-gold-primary text-bg-primary shadow-gold-glow'
                  : 'text-text-secondary hover:text-white hover:bg-white/5'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              Market
            </button>
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-4">
            {/* BTC Price Mini */}
            {market && (
              <div className="hidden lg:flex items-center gap-3 px-4 py-2 glass-card rounded-xl">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center">
                  <span className="font-bold text-white text-sm">₿</span>
                </div>
                <div>
                  <p className="font-mono text-lg font-bold text-white">
                    ${market.btc_price?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <span className={`font-mono text-sm font-semibold px-2 py-0.5 rounded ${
                  market.btc_change_24h >= 0 
                    ? 'bg-positive/10 text-positive' 
                    : 'bg-negative/10 text-negative'
                }`}>
                  {market.btc_change_24h >= 0 ? '+' : ''}{market.btc_change_24h?.toFixed(2)}%
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 px-4 py-2 bg-positive/10 border border-positive/30 rounded-full">
              <span className="w-2 h-2 bg-positive rounded-full live-dot" />
              <span className="text-xs font-semibold text-positive uppercase tracking-wider">Live</span>
            </div>
            <LiveClock />
          </div>
        </header>

        {/* Content based on active tab */}
        {activeTab === 'signals' ? (
          <>
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
          </>
        ) : (
          <MarketDashboard />
        )}
      </div>
    </div>
  );
}

// Live Clock Component
const LiveClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="font-mono text-sm text-text-secondary px-4 py-2 bg-bg-card border border-gold-primary/15 rounded-xl">
      {formatTime(time)}
    </div>
  );
};

export default App;