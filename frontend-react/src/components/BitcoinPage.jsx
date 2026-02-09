import { useState, useEffect } from 'react';

const API_BASE = '/api/v1';

/**
 * BitcoinPage - Dedicated page for Bitcoin data & metrics
 * Now fetches via backend proxy to bypass CORS
 */
const BitcoinPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000); // 2 min (match backend cache)
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setError(null);
      
      // Fetch via backend proxy (bypass CORS)
      const response = await fetch(`${API_BASE}/market/bitcoin`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch Bitcoin data');
      }
      
      const result = await response.json();
      setData(result);
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
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">Bitcoin</h2>
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
            <p className="text-4xl font-display font-bold text-white">
              ${data.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center gap-3 justify-end mt-1">
              <PriceChange label="24h" value={data.priceChange24h} />
              <PriceChange label="7d" value={data.priceChange7d} />
              <PriceChange label="30d" value={data.priceChange30d} />
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard 
          label="24h Range" 
          value={`$${data.low24h?.toLocaleString()} - $${data.high24h?.toLocaleString()}`}
          icon="📊"
        />
        <MetricCard 
          label="Market Cap" 
          value={`$${formatLargeNumber(data.marketCap)}`}
          icon="💰"
        />
        <MetricCard 
          label="24h Volume" 
          value={`$${formatLargeNumber(data.volume24h)}`}
          icon="📈"
        />
        <MetricCard 
          label="BTC Dominance" 
          value={`${data.dominance?.toFixed(1)}%`}
          icon="👑"
        />
      </div>

      {/* Secondary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Supply Card */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-muted text-xs uppercase tracking-wider mb-3">Supply</p>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">Circulating</span>
              <span className="text-white font-mono text-sm">{(data.circulatingSupply / 1e6).toFixed(2)}M BTC</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted text-sm">Max Supply</span>
              <span className="text-white font-mono text-sm">21M BTC</span>
            </div>
            <div className="w-full bg-bg-card rounded-full h-2.5 mt-2">
              <div 
                className="bg-gradient-to-r from-orange-400 to-gold-primary h-2.5 rounded-full transition-all"
                style={{ width: `${supplyPercent}%` }}
              ></div>
            </div>
            <p className="text-text-muted text-xs text-right">{supplyPercent.toFixed(2)}% mined</p>
          </div>
        </div>

        {/* ATH Card */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-muted text-xs uppercase tracking-wider mb-3">All-Time High</p>
          <p className="text-2xl font-display font-bold text-white">
            ${data.ath?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className={`text-sm mt-1 ${data.athChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {data.athChange >= 0 ? '↑' : '↓'} {Math.abs(data.athChange)?.toFixed(2)}% from ATH
          </p>
        </div>

        {/* Fear & Greed */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-muted text-xs uppercase tracking-wider mb-3">Fear & Greed Index</p>
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white ${
              data.fearGreed.value >= 75 ? 'bg-green-500' :
              data.fearGreed.value >= 50 ? 'bg-lime-500' :
              data.fearGreed.value >= 25 ? 'bg-orange-500' :
              'bg-red-500'
            }`}>
              {data.fearGreed.value}
            </div>
            <div>
              <p className="text-white font-semibold">{data.fearGreed.label}</p>
              <p className="text-text-muted text-xs">Current sentiment</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper Components
const PriceChange = ({ label, value }) => {
  if (value == null) return null;
  const isPositive = value >= 0;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
      isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
    }`}>
      {label}: {isPositive ? '+' : ''}{value?.toFixed(2)}%
    </span>
  );
};

const MetricCard = ({ label, value, icon }) => (
  <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
    <div className="flex items-center justify-between mb-2">
      <p className="text-text-muted text-xs uppercase tracking-wider">{label}</p>
      <span className="text-lg">{icon}</span>
    </div>
    <p className="text-white font-semibold text-sm">{value}</p>
  </div>
);

function formatLargeNumber(num) {
  if (!num) return '0';
  if (num >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toLocaleString();
}

export default BitcoinPage;