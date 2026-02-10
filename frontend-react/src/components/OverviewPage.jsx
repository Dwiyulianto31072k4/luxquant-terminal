import { useState, useEffect } from 'react';
import TopPerformers from './TopPerformers';

const API_BASE = '/api/v1';

/**
 * OverviewPage - Main dashboard with comprehensive market data
 * Now fetches via backend proxy to bypass CORS & use caching
 */
const OverviewPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE}/market/global`);
      if (!response.ok) throw new Error('Failed to fetch market data');
      
      const result = await response.json();
      const globalData = result.global;
      const coinsData = result.coins || [];
      const fearGreed = result.fearGreed || { value: 50, label: 'Neutral', yesterday: 50, lastWeek: 50 };

      if (globalData || coinsData.length > 0) {
        const btc = coinsData.find(c => c.symbol === 'btc');
        const eth = coinsData.find(c => c.symbol === 'eth');

        setData({
          totalMarketCap: globalData?.total_market_cap?.usd || 0,
          marketCapChange24h: globalData?.market_cap_change_percentage_24h_usd || 0,
          totalVolume24h: globalData?.total_volume?.usd || 0,
          btcDominance: globalData?.market_cap_percentage?.btc || 0,
          ethDominance: globalData?.market_cap_percentage?.eth || 0,
          altcoinMarketCap: (globalData?.total_market_cap?.usd || 0) * (1 - (globalData?.market_cap_percentage?.btc || 0) / 100),
          stablecoinDom: (globalData?.market_cap_percentage?.usdt || 0) + (globalData?.market_cap_percentage?.usdc || 0),
          activeCryptos: globalData?.active_cryptocurrencies || 0,
          ethBtcRatio: btc && eth ? eth.current_price / btc.current_price : 0,
          fearGreed,
          topCoins: coinsData.slice(0, 10),
          topGainers: [...coinsData]
            .filter(c => c.price_change_percentage_24h != null)
            .sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0))
            .slice(0, 5),
          topLosers: [...coinsData]
            .filter(c => c.price_change_percentage_24h != null)
            .sort((a, b) => (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0))
            .slice(0, 5),
        });
      } else {
        setError('Failed to fetch market data');
      }
    } catch (err) {
      console.error('Failed to fetch overview data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">Market Overview</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-6 animate-pulse border border-gold-primary/10">
              <div className="h-4 bg-gold-primary/20 rounded w-24 mb-3"></div>
              <div className="h-8 bg-gold-primary/20 rounded w-32"></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-6 h-64 animate-pulse border border-gold-primary/10"></div>
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
          <h2 className="font-display text-2xl font-semibold text-white">Market Overview</h2>
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

  return (
    <div className="space-y-6">
      {/* Top Performers Section */}
      <TopPerformers />

      {/* Page Title */}
      <div className="flex items-center gap-3">
        <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
        <h2 className="font-display text-2xl font-semibold text-white">Market Overview</h2>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard 
          label="Total Market Cap" 
          value={formatLargeNumber(data.totalMarketCap)} 
          change={data.marketCapChange24h}
          icon="💰"
        />
        <MetricCard 
          label="24h Volume" 
          value={formatLargeNumber(data.totalVolume24h)} 
          icon="📊"
        />
        <MetricCard 
          label="BTC Dominance" 
          value={`${data.btcDominance.toFixed(1)}%`} 
          icon="👑"
          color="text-orange-400"
        />
        <MetricCard 
          label="Active Cryptos" 
          value={data.activeCryptos.toLocaleString()} 
          icon="🪙"
        />
      </div>

      {/* Secondary Metrics + Fear & Greed + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Altcoin & Stablecoin Metrics */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">Market Indicators</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">ETH Dominance</span>
              <span className="text-white font-mono">{data.ethDominance?.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">Altcoin MCap</span>
              <span className="text-white font-mono">{formatLargeNumber(data.altcoinMarketCap)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">Stablecoin Dom</span>
              <span className="text-white font-mono">{data.stablecoinDom?.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">ETH/BTC Ratio</span>
              <span className="text-white font-mono">{data.ethBtcRatio?.toFixed(5)}</span>
            </div>
          </div>
        </div>

        {/* Fear & Greed */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">Fear & Greed Index</h3>
          <div className="flex items-center justify-center gap-6">
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold text-white shadow-lg ${
              data.fearGreed.value >= 75 ? 'bg-green-500' :
              data.fearGreed.value >= 50 ? 'bg-lime-500' :
              data.fearGreed.value >= 25 ? 'bg-orange-500' :
              'bg-red-500'
            }`}>
              {data.fearGreed.value}
            </div>
            <div>
              <p className="text-white font-semibold text-lg">{data.fearGreed.label}</p>
              <p className="text-text-muted text-xs mt-1">Yesterday: {data.fearGreed.yesterday}</p>
              <p className="text-text-muted text-xs">Last week: {data.fearGreed.lastWeek}</p>
            </div>
          </div>
        </div>

        {/* Trading Insights */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">Trading Insights</h3>
          <div className="space-y-2">
            <InsightItem 
              condition={data.fearGreed.value < 25}
              positive="Extreme Fear - Potential buying opportunity"
              negative={data.fearGreed.value > 75 ? 
                "Extreme Greed - Consider taking profits" : null}
            />
            <InsightItem 
              condition={data.btcDominance < 50}
              positive="BTC Dom below 50% - Altcoin season active"
              negative="BTC Dom high - Focus on BTC"
            />
            <InsightItem 
              condition={data.marketCapChange24h > 3}
              positive="Strong market momentum (+3%)"
              negative={data.marketCapChange24h < -3 ? "Market under pressure" : null}
            />
            <InsightItem 
              condition={data.stablecoinDom < 6}
              positive="Low stablecoin dom - Money deployed"
              negative="High stablecoin dom - Sidelined capital"
            />
          </div>
        </div>
      </div>

      {/* Gainers & Losers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-gold-primary/10 flex items-center gap-2">
            <span>📈</span>
            <h3 className="text-white font-semibold">Top Gainers (24h)</h3>
          </div>
          <div className="divide-y divide-gold-primary/5">
            {data.topGainers.map((coin, idx) => (
              <CoinRow key={idx} coin={coin} />
            ))}
          </div>
        </div>

        <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-gold-primary/10 flex items-center gap-2">
            <span>📉</span>
            <h3 className="text-white font-semibold">Top Losers (24h)</h3>
          </div>
          <div className="divide-y divide-gold-primary/5">
            {data.topLosers.map((coin, idx) => (
              <CoinRow key={idx} coin={coin} isLoser />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper Components
const MetricCard = ({ label, value, change, icon, color = 'text-white' }) => (
  <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
    <div className="flex items-center justify-between mb-2">
      <p className="text-text-muted text-xs uppercase tracking-wider">{label}</p>
      <span className="text-lg">{icon}</span>
    </div>
    <p className={`text-2xl font-display font-bold ${color}`}>{value}</p>
    {change !== undefined && (
      <p className={`text-sm font-semibold mt-1 ${change >= 0 ? 'text-positive' : 'text-negative'}`}>
        {change >= 0 ? '+' : ''}{change?.toFixed(2)}%
      </p>
    )}
  </div>
);

const InsightItem = ({ condition, positive, negative }) => {
  const text = condition ? positive : negative;
  if (!text) return null;
  return (
    <div className={`p-3 rounded-lg ${condition ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
      <p className={`text-sm ${condition ? 'text-green-400' : 'text-red-400'}`}>
        {condition ? '✓' : '⚠'} {text}
      </p>
    </div>
  );
};

const CoinRow = ({ coin, isLoser }) => (
  <div className="flex items-center justify-between px-5 py-3 hover:bg-gold-primary/5 transition-colors">
    <div className="flex items-center gap-3">
      <img 
        src={coin.image} 
        alt={coin.symbol} 
        className="w-8 h-8 rounded-full"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      <div>
        <p className="text-white font-semibold">{coin.symbol.toUpperCase()}</p>
        <p className="text-text-muted text-xs">{coin.name}</p>
      </div>
    </div>
    <div className="text-right">
      <p className="text-white font-mono">${coin.current_price?.toLocaleString()}</p>
      <p className={`text-sm font-semibold ${isLoser ? 'text-negative' : 'text-positive'}`}>
        {(coin.price_change_percentage_24h || 0) >= 0 ? '+' : ''}{(coin.price_change_percentage_24h || 0).toFixed(2)}%
      </p>
    </div>
  </div>
);

const formatLargeNumber = (num) => {
  if (!num) return '$0';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(0)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(0)}M`;
  return `$${num.toFixed(2)}`;
};

export default OverviewPage;