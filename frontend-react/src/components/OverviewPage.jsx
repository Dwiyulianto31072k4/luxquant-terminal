import { useState, useEffect } from 'react';

/**
 * OverviewPage - Main dashboard with comprehensive market data
 */
const OverviewPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setError(null);
      
      // Fetch all data in parallel
      const [globalRes, coinsRes, fgRes] = await Promise.allSettled([
        fetch('https://api.coingecko.com/api/v3/global'),
        fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false&price_change_percentage=24h,7d'),
        fetch('https://api.alternative.me/fng/?limit=7')
      ]);

      // Process global data
      let globalData = null;
      if (globalRes.status === 'fulfilled' && globalRes.value.ok) {
        const json = await globalRes.value.json();
        globalData = json.data;
      }

      // Process coins data
      let coinsData = [];
      if (coinsRes.status === 'fulfilled' && coinsRes.value.ok) {
        coinsData = await coinsRes.value.json();
      }

      // Process Fear & Greed
      let fearGreed = { value: 50, label: 'Neutral', yesterday: 50, lastWeek: 50 };
      if (fgRes.status === 'fulfilled' && fgRes.value.ok) {
        const fgJson = await fgRes.value.json();
        if (fgJson.data && fgJson.data[0]) {
          fearGreed = {
            value: parseInt(fgJson.data[0].value),
            label: fgJson.data[0].value_classification,
            yesterday: parseInt(fgJson.data[1]?.value || 50),
            lastWeek: parseInt(fgJson.data[6]?.value || 50),
          };
        }
      }

      // Build data object
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
      {/* Page Title */}
      <div className="flex items-center gap-3">
        <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
        <h2 className="font-display text-2xl font-semibold text-white">Market Overview</h2>
      </div>

      {/* Key Metrics Row */}
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
          color="text-orange-400"
          icon="₿"
        />
        <MetricCard 
          label="Active Cryptos"
          value={data.activeCryptos.toLocaleString()}
          icon="🪙"
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Fear & Greed Index */}
        <FearGreedCard data={data.fearGreed} />

        {/* Market Indicators */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
            Key Indicators
          </h3>
          <div className="space-y-4">
            <IndicatorRow 
              label="BTC Dominance" 
              value={`${data.btcDominance.toFixed(1)}%`}
              hint={data.btcDominance > 55 ? 'BTC Season' : 'Altcoin Friendly'}
              hintColor={data.btcDominance > 55 ? 'text-orange-400' : 'text-green-400'}
            />
            <IndicatorRow 
              label="ETH/BTC Ratio" 
              value={data.ethBtcRatio.toFixed(4)}
              hint={data.ethBtcRatio > 0.05 ? 'ETH Strong' : 'ETH Weak'}
              hintColor={data.ethBtcRatio > 0.05 ? 'text-blue-400' : 'text-red-400'}
            />
            <IndicatorRow 
              label="Altcoin Market Cap" 
              value={formatLargeNumber(data.altcoinMarketCap)}
            />
            <IndicatorRow 
              label="Stablecoin Dom" 
              value={`${data.stablecoinDom.toFixed(1)}%`}
              hint={data.stablecoinDom > 8 ? 'Cash Heavy' : 'Deployed'}
              hintColor={data.stablecoinDom > 8 ? 'text-yellow-400' : 'text-green-400'}
            />
            <IndicatorRow 
              label="ETH Dominance" 
              value={`${data.ethDominance.toFixed(1)}%`}
            />
          </div>
        </div>

        {/* Quick Insights */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
            Market Insights
          </h3>
          <div className="space-y-3">
            <InsightItem 
              condition={data.fearGreed.value <= 25}
              positive="Extreme Fear - Potential buying opportunity"
              negative={data.fearGreed.value >= 75 ? "Extreme Greed - Consider taking profits" : null}
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
        {/* Top Gainers */}
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

        {/* Top Losers */}
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
        {change >= 0 ? '+' : ''}{change.toFixed(2)}% (24h)
      </p>
    )}
  </div>
);

const FearGreedCard = ({ data }) => {
  const getColor = (val) => {
    if (val <= 25) return '#EF4444';
    if (val <= 45) return '#F97316';
    if (val <= 55) return '#EAB308';
    if (val <= 75) return '#84CC16';
    return '#22C55E';
  };

  const angle = (data.value / 100) * 180 - 90;

  return (
    <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
      <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
        Fear & Greed Index
      </h3>
      
      {/* Gauge */}
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 200 110" className="w-48 h-24">
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EF4444" />
              <stop offset="25%" stopColor="#F97316" />
              <stop offset="50%" stopColor="#EAB308" />
              <stop offset="75%" stopColor="#84CC16" />
              <stop offset="100%" stopColor="#22C55E" />
            </linearGradient>
          </defs>
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gaugeGrad)" strokeWidth="12" strokeLinecap="round" />
          <g transform={`rotate(${angle}, 100, 100)`}>
            <line x1="100" y1="100" x2="100" y2="35" stroke={getColor(data.value)} strokeWidth="3" strokeLinecap="round" />
            <circle cx="100" cy="100" r="6" fill={getColor(data.value)} />
          </g>
        </svg>
        
        <p className="text-4xl font-display font-bold text-white mt-2">{data.value}</p>
        <p className="text-sm font-semibold" style={{ color: getColor(data.value) }}>{data.label}</p>
      </div>

      {/* History */}
      <div className="mt-4 pt-4 border-t border-gold-primary/10 grid grid-cols-2 gap-4 text-sm">
        <div className="text-center">
          <p className="text-text-muted text-xs">Yesterday</p>
          <p className="text-white font-semibold">{data.yesterday}</p>
        </div>
        <div className="text-center">
          <p className="text-text-muted text-xs">Last Week</p>
          <p className="text-white font-semibold">{data.lastWeek}</p>
        </div>
      </div>
    </div>
  );
};

const IndicatorRow = ({ label, value, hint, hintColor }) => (
  <div className="flex items-center justify-between">
    <span className="text-text-muted text-sm">{label}</span>
    <div className="text-right">
      <span className="text-white font-mono font-semibold">{value}</span>
      {hint && <p className={`text-xs ${hintColor}`}>{hint}</p>}
    </div>
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
      <img src={coin.image} alt={coin.symbol} className="w-8 h-8 rounded-full" />
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

// Utility
const formatLargeNumber = (num) => {
  if (!num) return '$0';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(0)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(0)}M`;
  return `$${num.toFixed(2)}`;
};

export default OverviewPage;