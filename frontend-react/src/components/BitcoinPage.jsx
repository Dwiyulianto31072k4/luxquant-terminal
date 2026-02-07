import { useState, useEffect } from 'react';

const API_BASE = '/api/v1';

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
      
      // Fetch dari backend endpoint (lebih reliable karena pakai API key)
      const [btcRes, globalRes, fgRes] = await Promise.allSettled([
        fetch(`${API_BASE}/coingecko/bitcoin`),
        fetch(`${API_BASE}/coingecko/global`),
        fetch(`${API_BASE}/coingecko/fear-greed`)
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
        <div className="flex items-center gap-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
          <h2 className="font-display text-2xl font-semibold text-white">Bitcoin</h2>
        </div>
        <div className="glass-card rounded-xl p-8 animate-pulse border border-gold-primary/10">
          <div className="h-12 bg-gold-primary/20 rounded w-48 mb-4"></div>
          <div className="h-8 bg-gold-primary/20 rounded w-32"></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-5 animate-pulse border border-gold-primary/10">
              <div className="h-4 bg-gold-primary/20 rounded w-24 mb-3"></div>
              <div className="h-8 bg-gold-primary/20 rounded w-32"></div>
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

  const formatCurrency = (value) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatSupply = (value) => {
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const getFearGreedColor = (value) => {
    if (value <= 25) return 'text-red-400';
    if (value <= 45) return 'text-orange-400';
    if (value <= 55) return 'text-yellow-400';
    if (value <= 75) return 'text-green-400';
    return 'text-emerald-400';
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex items-center gap-3">
        <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
        <h2 className="font-display text-2xl font-semibold text-white">Bitcoin</h2>
      </div>

      {/* Main Price Card */}
      <div className="glass-card rounded-xl p-8 border border-gold-primary/10">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-3xl">
            ₿
          </div>
          <div>
            <h3 className="text-text-secondary text-sm">Bitcoin (BTC)</h3>
            <p className="text-4xl font-bold text-white">{formatCurrency(data.price)}</p>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-text-secondary text-sm mb-1">24h Change</p>
            <p className={`text-lg font-semibold ${data.priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {data.priceChange24h >= 0 ? '+' : ''}{data.priceChange24h.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-text-secondary text-sm mb-1">7d Change</p>
            <p className={`text-lg font-semibold ${data.priceChange7d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {data.priceChange7d >= 0 ? '+' : ''}{data.priceChange7d.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-text-secondary text-sm mb-1">30d Change</p>
            <p className={`text-lg font-semibold ${data.priceChange30d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {data.priceChange30d >= 0 ? '+' : ''}{data.priceChange30d.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-secondary text-sm mb-2">Market Cap</p>
          <p className="text-xl font-semibold text-white">{formatCurrency(data.marketCap)}</p>
          <p className="text-text-secondary text-xs mt-1">Rank #{data.marketCapRank}</p>
        </div>

        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-secondary text-sm mb-2">24h Volume</p>
          <p className="text-xl font-semibold text-white">{formatCurrency(data.volume24h)}</p>
        </div>

        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-secondary text-sm mb-2">24h High/Low</p>
          <p className="text-xl font-semibold text-green-400">{formatCurrency(data.high24h)}</p>
          <p className="text-sm text-red-400">{formatCurrency(data.low24h)}</p>
        </div>

        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-secondary text-sm mb-2">All-Time High</p>
          <p className="text-xl font-semibold text-white">{formatCurrency(data.ath)}</p>
          <p className={`text-sm ${data.athChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {data.athChange.toFixed(1)}% from ATH
          </p>
        </div>

        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-secondary text-sm mb-2">Circulating Supply</p>
          <p className="text-xl font-semibold text-white">{formatSupply(data.circulatingSupply)}</p>
          <p className="text-text-secondary text-xs mt-1">
            {((data.circulatingSupply / data.maxSupply) * 100).toFixed(1)}% of max
          </p>
        </div>

        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-secondary text-sm mb-2">Max Supply</p>
          <p className="text-xl font-semibold text-white">{formatSupply(data.maxSupply)}</p>
        </div>

        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-secondary text-sm mb-2">BTC Dominance</p>
          <p className="text-xl font-semibold text-gold-primary">{data.dominance.toFixed(2)}%</p>
        </div>

        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <p className="text-text-secondary text-sm mb-2">Fear & Greed</p>
          <p className={`text-2xl font-bold ${getFearGreedColor(data.fearGreed.value)}`}>
            {data.fearGreed.value}
          </p>
          <p className="text-text-secondary text-xs mt-1">{data.fearGreed.label}</p>
        </div>
      </div>
    </div>
  );
};

export default BitcoinPage;