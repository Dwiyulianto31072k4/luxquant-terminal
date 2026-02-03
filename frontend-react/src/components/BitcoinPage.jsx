import { useState, useEffect } from 'react';

/**
 * BitcoinPage - Dedicated page for Bitcoin data & metrics
 */
const BitcoinPage = () => {
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
      
      const [btcRes, globalRes, fgRes] = await Promise.allSettled([
        fetch('https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false'),
        fetch('https://api.coingecko.com/api/v3/global'),
        fetch('https://api.alternative.me/fng/?limit=1')
      ]);

      let btcData = null;
      if (btcRes.status === 'fulfilled' && btcRes.value.ok) {
        btcData = await btcRes.value.json();
      }

      let globalData = null;
      if (globalRes.status === 'fulfilled' && globalRes.value.ok) {
        const json = await globalRes.value.json();
        globalData = json.data;
      }

      let fearGreed = { value: 50, label: 'Neutral' };
      if (fgRes.status === 'fulfilled' && fgRes.value.ok) {
        const fgJson = await fgRes.value.json();
        if (fgJson.data?.[0]) {
          fearGreed = {
            value: parseInt(fgJson.data[0].value),
            label: fgJson.data[0].value_classification,
          };
        }
      }

      if (btcData) {
        const md = btcData.market_data;
        setData({
          price: md?.current_price?.usd || 0,
          priceChange24h: md?.price_change_percentage_24h || 0,
          priceChange7d: md?.price_change_percentage_7d || 0,
          priceChange30d: md?.price_change_percentage_30d || 0,
          high24h: md?.high_24h?.usd || 0,
          low24h: md?.low_24h?.usd || 0,
          ath: md?.ath?.usd || 0,
          athChange: md?.ath_change_percentage?.usd || 0,
          marketCap: md?.market_cap?.usd || 0,
          marketCapRank: btcData.market_cap_rank || 1,
          volume24h: md?.total_volume?.usd || 0,
          circulatingSupply: md?.circulating_supply || 0,
          maxSupply: md?.max_supply || 21000000,
          dominance: globalData?.market_cap_percentage?.btc || 0,
          fearGreed,
        });
      } else {
        setError('Failed to fetch Bitcoin data');
      }
    } catch (err) {
      console.error('Failed to fetch Bitcoin data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="glass-card rounded-xl p-8 animate-pulse border border-gold-primary/10">
          <div className="h-12 bg-gold-primary/20 rounded w-48 mb-4"></div>
          <div className="h-8 bg-gold-primary/20 rounded w-32"></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-5 animate-pulse border border-gold-primary/10">
              <div className="h-4 bg-gold-primary/20 rounded w-20 mb-2"></div>
              <div className="h-6 bg-gold-primary/20 rounded w-24"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
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

  const supplyPercent = (data.circulatingSupply / data.maxSupply) * 100;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="glass-card rounded-xl p-6 border border-gold-primary/10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center text-3xl font-bold text-white shadow-lg">
              ₿
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-display font-bold text-white">Bitcoin</h1>
                <span className="px-2 py-0.5 bg-gold-primary/20 text-gold-primary text-xs font-semibold rounded">
                  Rank #{data.marketCapRank}
                </span>
              </div>
              <p className="text-text-muted">BTC</p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-4xl font-mono font-bold text-white">
              ${data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center justify-end gap-3 mt-1">
              <PriceChange value={data.priceChange24h} label="24h" />
              <PriceChange value={data.priceChange7d} label="7d" />
              <PriceChange value={data.priceChange30d} label="30d" />
            </div>
          </div>
        </div>
      </div>

      {/* Key Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Market Cap" value={formatLargeNumber(data.marketCap)} />
        <StatCard label="24h Volume" value={formatLargeNumber(data.volume24h)} />
        <StatCard label="BTC Dominance" value={`${data.dominance.toFixed(1)}%`} color="text-orange-400" />
        <StatCard 
          label="Fear & Greed" 
          value={data.fearGreed.value} 
          subValue={data.fearGreed.label}
          color={getFearGreedColor(data.fearGreed.value)}
        />
      </div>

      {/* Price Range & Supply */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 24h Range */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
            24h Price Range
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-negative">${data.low24h.toLocaleString()}</span>
              <span className="text-positive">${data.high24h.toLocaleString()}</span>
            </div>
            <div className="relative h-2 bg-bg-card rounded-full overflow-hidden">
              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-negative via-yellow-400 to-positive rounded-full w-full" />
              {data.high24h > data.low24h && (
                <div 
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg border-2 border-gold-primary"
                  style={{ 
                    left: `${Math.min(100, Math.max(0, ((data.price - data.low24h) / (data.high24h - data.low24h)) * 100))}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                />
              )}
            </div>
            <p className="text-center text-text-muted text-xs">Current: ${data.price.toLocaleString()}</p>
          </div>

          {/* ATH */}
          <div className="mt-6 pt-4 border-t border-gold-primary/10">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-text-muted text-xs uppercase">All-Time High</p>
                <p className="text-white font-mono font-bold text-lg">${data.ath.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-negative text-sm font-semibold">{data.athChange.toFixed(1)}%</p>
                <p className="text-text-muted text-xs">from ATH</p>
              </div>
            </div>
          </div>
        </div>

        {/* Supply */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
            Supply Information
          </h3>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-text-muted">Circulating Supply</span>
                <span className="text-white font-mono">{(data.circulatingSupply / 1e6).toFixed(2)}M BTC</span>
              </div>
              <div className="relative h-3 bg-bg-card rounded-full overflow-hidden">
                <div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-500 to-orange-400 rounded-full"
                  style={{ width: `${supplyPercent}%` }}
                />
              </div>
              <p className="text-right text-text-muted text-xs mt-1">{supplyPercent.toFixed(1)}% mined</p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gold-primary/10">
              <div>
                <p className="text-text-muted text-xs uppercase">Max Supply</p>
                <p className="text-white font-mono font-semibold">21,000,000 BTC</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase">Remaining</p>
                <p className="text-white font-mono font-semibold">
                  {((data.maxSupply - data.circulatingSupply) / 1e6).toFixed(2)}M BTC
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Market Analysis */}
      <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
        <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
          Market Analysis
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <AnalysisItem 
            label="Vol/MCap Ratio"
            value={`${((data.volume24h / data.marketCap) * 100).toFixed(2)}%`}
            hint={data.volume24h / data.marketCap > 0.1 ? 'High Activity' : 'Normal'}
          />
          <AnalysisItem 
            label="Market Cap Rank"
            value={`#${data.marketCapRank}`}
          />
          <AnalysisItem 
            label="Price vs ATH"
            value={`${(100 + data.athChange).toFixed(1)}%`}
            hint="of ATH"
          />
          <AnalysisItem 
            label="Supply Mined"
            value={`${supplyPercent.toFixed(1)}%`}
            hint={`${((data.maxSupply - data.circulatingSupply) / 1e6).toFixed(2)}M remaining`}
          />
        </div>
      </div>
    </div>
  );
};

// Helper Components
const StatCard = ({ label, value, subValue, color = 'text-white' }) => (
  <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
    <p className="text-text-muted text-xs uppercase tracking-wider mb-2">{label}</p>
    <p className={`text-xl font-display font-bold ${color}`}>{value}</p>
    {subValue && <p className="text-text-muted text-xs mt-1">{subValue}</p>}
  </div>
);

const PriceChange = ({ value, label }) => (
  <span className={`text-sm font-semibold px-2 py-0.5 rounded ${
    value >= 0 ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'
  }`}>
    {value >= 0 ? '+' : ''}{value.toFixed(2)}% {label}
  </span>
);

const AnalysisItem = ({ label, value, hint }) => (
  <div>
    <p className="text-text-muted text-xs uppercase">{label}</p>
    <p className="text-white font-mono font-bold text-lg">{value}</p>
    {hint && <p className="text-text-muted text-xs">{hint}</p>}
  </div>
);

// Utilities
const formatLargeNumber = (num) => {
  if (!num) return '$0';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
};

const getFearGreedColor = (val) => {
  if (val <= 25) return 'text-red-500';
  if (val <= 45) return 'text-orange-400';
  if (val <= 55) return 'text-yellow-400';
  if (val <= 75) return 'text-lime-400';
  return 'text-green-400';
};

export default BitcoinPage;