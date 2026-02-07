import { useState, useEffect } from 'react';

const API_BASE = '/api/v1';

/**
 * MarketsPage - Comprehensive market listings
 */
const MarketsPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setError(null);
      
      // Fetch dari backend endpoint (lebih reliable karena pakai API key)
      const response = await fetch(`${API_BASE}/coingecko/markets?per_page=100&page=1`);
      
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

  const formatPrice = (price) => {
    if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(8)}`;
  };

  const formatMarketCap = (value) => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

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

  const currentData = data[activeTab] || [];

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center gap-3">
        <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
        <h2 className="font-display text-2xl font-semibold text-white">Markets</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-gold-primary/20 text-gold-primary border border-gold-primary/30'
                : 'bg-bg-card text-text-secondary hover:bg-gold-primary/10 border border-gold-primary/5'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Markets Table */}
      <div className="glass-card rounded-xl overflow-hidden border border-gold-primary/10">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gold-primary/10">
                <th className="text-left p-4 text-text-secondary font-medium">#</th>
                <th className="text-left p-4 text-text-secondary font-medium">Coin</th>
                <th className="text-right p-4 text-text-secondary font-medium">Price</th>
                <th className="text-right p-4 text-text-secondary font-medium">1h %</th>
                <th className="text-right p-4 text-text-secondary font-medium">24h %</th>
                <th className="text-right p-4 text-text-secondary font-medium">7d %</th>
                <th className="text-right p-4 text-text-secondary font-medium">Market Cap</th>
                <th className="text-right p-4 text-text-secondary font-medium">Volume (24h)</th>
              </tr>
            </thead>
            <tbody>
              {currentData.map((coin, index) => (
                <tr 
                  key={coin.id} 
                  className="border-b border-gold-primary/5 hover:bg-gold-primary/5 transition-colors"
                >
                  <td className="p-4 text-text-secondary">{coin.market_cap_rank || index + 1}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <img src={coin.image} alt={coin.name} className="w-8 h-8 rounded-full" />
                      <div>
                        <p className="text-white font-medium">{coin.name}</p>
                        <p className="text-text-secondary text-sm">{coin.symbol.toUpperCase()}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-right text-white font-medium">
                    {formatPrice(coin.current_price)}
                  </td>
                  <td className={`p-4 text-right font-medium ${
                    coin.price_change_percentage_1h_in_currency >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {coin.price_change_percentage_1h_in_currency != null 
                      ? `${coin.price_change_percentage_1h_in_currency >= 0 ? '+' : ''}${coin.price_change_percentage_1h_in_currency.toFixed(2)}%`
                      : 'N/A'
                    }
                  </td>
                  <td className={`p-4 text-right font-medium ${
                    coin.price_change_percentage_24h >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {coin.price_change_percentage_24h != null 
                      ? `${coin.price_change_percentage_24h >= 0 ? '+' : ''}${coin.price_change_percentage_24h.toFixed(2)}%`
                      : 'N/A'
                    }
                  </td>
                  <td className={`p-4 text-right font-medium ${
                    coin.price_change_percentage_7d_in_currency >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {coin.price_change_percentage_7d_in_currency != null 
                      ? `${coin.price_change_percentage_7d_in_currency >= 0 ? '+' : ''}${coin.price_change_percentage_7d_in_currency.toFixed(2)}%`
                      : 'N/A'
                    }
                  </td>
                  <td className="p-4 text-right text-white">
                    {formatMarketCap(coin.market_cap)}
                  </td>
                  <td className="p-4 text-right text-text-secondary">
                    {formatMarketCap(coin.total_volume)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MarketsPage;