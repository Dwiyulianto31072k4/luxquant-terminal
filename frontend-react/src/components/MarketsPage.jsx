import { useState, useEffect } from 'react';

const API_BASE = '/api/v1';

/**
 * MarketsPage - Comprehensive market listings
 * Now fetches via backend proxy to bypass CORS
 */
const MarketsPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000); // 2 min (match backend cache)
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setError(null);
      
      // Fetch via backend proxy (bypass CORS)
      const response = await fetch(`${API_BASE}/market/coins?per_page=100&page=1`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch market data');
      }
      
      const coins = await response.json();

      if (Array.isArray(coins)) {
        setData({
          all: coins,
          gainers: [...coins]
            .filter(c => c.price_change_percentage_24h != null)
            .sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0))
            .slice(0, 20),
          losers: [...coins]
            .filter(c => c.price_change_percentage_24h != null)
            .sort((a, b) => (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0))
            .slice(0, 20),
          volume: [...coins]
            .sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0))
            .slice(0, 20),
        });
      }
    } catch (err) {
      console.error('Failed to fetch markets:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { key: 'all', label: 'All Coins', icon: '🪙' },
    { key: 'gainers', label: 'Top Gainers', icon: '📈' },
    { key: 'losers', label: 'Top Losers', icon: '📉' },
    { key: 'volume', label: 'Top Volume', icon: '💎' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">Markets</h2>
        </div>
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 w-28 bg-bg-card rounded-xl animate-pulse"></div>
          ))}
        </div>
        <div className="glass-card rounded-xl overflow-hidden border border-gold-primary/10">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="p-4 border-b border-gold-primary/5 animate-pulse">
              <div className="h-8 bg-gold-primary/20 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">Markets</h2>
        </div>
        <div className="glass-card rounded-xl p-8 border border-red-500/30 text-center">
          <p className="text-red-400 mb-4">⚠️ {error}</p>
          <button 
            onClick={() => { setLoading(true); fetchData(); }}
            className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const currentData = data[activeTab] || data.all;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
        <h2 className="font-display text-2xl font-semibold text-white">Markets</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.key
                ? 'bg-gradient-to-r from-gold-primary/20 to-gold-primary/10 text-gold-primary border border-gold-primary/30'
                : 'bg-bg-card text-text-muted hover:text-white border border-gold-primary/5'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="glass-card rounded-xl overflow-hidden border border-gold-primary/10">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-gold-primary/10 bg-gold-primary/5">
          <div className="col-span-1 text-gold-primary/70 text-xs font-semibold uppercase">#</div>
          <div className="col-span-3 text-gold-primary/70 text-xs font-semibold uppercase">Name</div>
          <div className="col-span-2 text-gold-primary/70 text-xs font-semibold uppercase text-right">Price</div>
          <div className="col-span-1 text-gold-primary/70 text-xs font-semibold uppercase text-right">1h</div>
          <div className="col-span-1 text-gold-primary/70 text-xs font-semibold uppercase text-right">24h</div>
          <div className="col-span-1 text-gold-primary/70 text-xs font-semibold uppercase text-right">7d</div>
          <div className="col-span-2 text-gold-primary/70 text-xs font-semibold uppercase text-right">Volume</div>
          <div className="col-span-1 text-gold-primary/70 text-xs font-semibold uppercase text-right">MCap</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-gold-primary/5">
          {currentData.map((coin, idx) => (
            <div 
              key={coin.id}
              className="grid grid-cols-12 gap-4 px-5 py-4 hover:bg-gold-primary/5 cursor-pointer transition-colors items-center"
            >
              <div className="col-span-1 text-text-muted text-sm">
                {coin.market_cap_rank || idx + 1}
              </div>

              <div className="col-span-3 flex items-center gap-3">
                <img 
                  src={coin.image} 
                  alt={coin.symbol} 
                  className="w-8 h-8 rounded-full" 
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div>
                  <p className="text-white font-semibold">{coin.name}</p>
                  <p className="text-text-muted text-xs">{coin.symbol?.toUpperCase()}</p>
                </div>
              </div>

              <div className="col-span-2 text-right">
                <p className="text-white font-mono">
                  ${coin.current_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                </p>
              </div>

              <div className="col-span-1 text-right">
                <ChangePercent value={coin.price_change_percentage_1h_in_currency} />
              </div>

              <div className="col-span-1 text-right">
                <ChangePercent value={coin.price_change_percentage_24h} />
              </div>

              <div className="col-span-1 text-right">
                <ChangePercent value={coin.price_change_percentage_7d_in_currency} />
              </div>

              <div className="col-span-2 text-right">
                <p className="text-text-secondary font-mono text-sm">
                  {formatLargeNumber(coin.total_volume)}
                </p>
              </div>

              <div className="col-span-1 text-right">
                <p className="text-text-secondary font-mono text-sm">
                  {formatLargeNumber(coin.market_cap)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <QuickStat label="Biggest Gainer" coin={data.gainers[0]} type="gainer" />
        <QuickStat label="Biggest Loser" coin={data.losers[0]} type="loser" />
        <QuickStat label="Highest Volume" coin={data.volume[0]} type="volume" />
        <QuickStat label="Top Market Cap" coin={data.all[0]} type="cap" />
      </div>
    </div>
  );
};

// Helper Components
const ChangePercent = ({ value }) => {
  if (value == null) {
    return <span className="text-text-muted text-sm">-</span>;
  }
  const isPositive = value >= 0;
  return (
    <span className={`text-sm font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
      {isPositive ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
};

const QuickStat = ({ label, coin, type }) => {
  if (!coin) return null;
  
  const getValue = () => {
    switch (type) {
      case 'gainer':
      case 'loser':
        return `${coin.price_change_percentage_24h >= 0 ? '+' : ''}${coin.price_change_percentage_24h?.toFixed(2)}%`;
      case 'volume':
        return `$${formatLargeNumber(coin.total_volume)}`;
      case 'cap':
        return `$${formatLargeNumber(coin.market_cap)}`;
      default:
        return '';
    }
  };

  const getColor = () => {
    switch (type) {
      case 'gainer': return 'text-green-400';
      case 'loser': return 'text-red-400';
      default: return 'text-gold-primary';
    }
  };

  return (
    <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
      <p className="text-text-muted text-xs uppercase tracking-wider mb-2">{label}</p>
      <div className="flex items-center gap-2">
        <img 
          src={coin.image} 
          alt={coin.symbol} 
          className="w-6 h-6 rounded-full"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <span className="text-white font-semibold text-sm">{coin.symbol?.toUpperCase()}</span>
      </div>
      <p className={`text-sm font-bold mt-1 ${getColor()}`}>{getValue()}</p>
    </div>
  );
};

function formatLargeNumber(num) {
  if (!num) return '0';
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toLocaleString();
}

export default MarketsPage;