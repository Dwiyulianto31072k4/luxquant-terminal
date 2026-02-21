import { useState, useEffect, useCallback } from 'react';

/**
 * MarketDashboard - Market Overview Dashboard
 * Uses backend API with caching (same pattern as BitcoinPage)
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const MarketDashboard = () => {
  const [marketData, setMarketData] = useState(null);
  const [bitcoinData, setBitcoinData] = useState(null);
  const [fundingRates, setFundingRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      
      // Use Promise.allSettled like BitcoinPage - doesn't crash if one fails
      const [overviewRes, bitcoinRes, fundingRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/v1/market/overview`),
        fetch(`${API_BASE}/api/v1/coingecko/bitcoin`),
        fetch(`${API_BASE}/api/v1/market/funding-rates?symbols=BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,ADAUSDT,DOGEUSDT,AVAXUSDT,DOTUSDT,MATICUSDT,LINKUSDT,LTCUSDT,ATOMUSDT,UNIUSDT,ETCUSDT`)
      ]);

      // Process market overview
      if (overviewRes.status === 'fulfilled' && overviewRes.value.ok) {
        const data = await overviewRes.value.json();
        setMarketData(data);
      }

      // Process Bitcoin data (for dominance, fear/greed)
      if (bitcoinRes.status === 'fulfilled' && bitcoinRes.value.ok) {
        const data = await bitcoinRes.value.json();
        setBitcoinData(data);
      }

      // Process funding rates
      if (fundingRes.status === 'fulfilled' && fundingRes.value.ok) {
        const data = await fundingRes.value.json();
        if (Array.isArray(data)) {
          // Sort by absolute rate
          const sorted = data
            .map(item => ({
              symbol: item.symbol,
              fundingRate: item.rate,
              markPrice: 0,
              indexPrice: 0,
            }))
            .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate))
            .slice(0, 15);
          setFundingRates(sorted);
        }
      }

      setLastUpdate(new Date());
      
      // Only set error if ALL requests failed
      if (overviewRes.status === 'rejected' && bitcoinRes.status === 'rejected') {
        setError('Failed to load market data');
      }
      
    } catch (err) {
      console.error('Market data fetch error:', err);
      setError('Failed to load market data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  // Format number with suffix (K, M, B)
  const formatNumber = (num) => {
    if (!num) return '--';
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
  };

  // Format price
  const formatPrice = (price) => {
    if (!price) return '$--';
    return '$' + price.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  // Get Fear & Greed color
  const getFearGreedColor = (value) => {
    if (!value) return 'text-gray-400';
    if (value <= 25) return 'text-red-500';
    if (value <= 45) return 'text-orange-500';
    if (value <= 55) return 'text-yellow-500';
    if (value <= 75) return 'text-lime-500';
    return 'text-green-500';
  };

  // Get funding rate color
  const getFundingColor = (rate) => {
    if (!rate) return 'text-gray-400';
    return rate >= 0 ? 'text-green-400' : 'text-red-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin"></div>
          <p className="text-text-muted">Loading market data...</p>
        </div>
      </div>
    );
  }

  // Get combined data
  const btcPrice = marketData?.btc?.price || bitcoinData?.price || 0;
  const btcChange = marketData?.btc?.price_change_pct || bitcoinData?.price_change_24h || 0;
  const btcHigh = marketData?.btc?.high_24h || bitcoinData?.high_24h || 0;
  const btcLow = marketData?.btc?.low_24h || bitcoinData?.low_24h || 0;
  const btcVolume = marketData?.btc?.volume_24h || bitcoinData?.volume_24h || 0;
  const dominance = bitcoinData?.dominance || 0;
  const fearGreedValue = bitcoinData?.fear_greed_value || 50;
  const fearGreedLabel = bitcoinData?.fear_greed_label || 'Neutral';

  return (
    <div className="space-y-6">
      {/* Bitcoin Hero Card */}
      <div className="bg-gradient-to-br from-orange-500/10 to-yellow-500/5 rounded-2xl p-6 border border-orange-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center text-3xl font-bold text-white shadow-lg shadow-orange-500/30">
              ₿
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-white">Bitcoin</h2>
              <p className="text-text-muted">BTC/USDT</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl font-mono font-bold text-white">
              {formatPrice(btcPrice)}
            </p>
            <p className={`text-xl font-mono ${btcChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {btcChange >= 0 ? '+' : ''}{btcChange?.toFixed(2) || '--'}%
            </p>
          </div>
        </div>

        {/* BTC Stats */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-bg-primary/50 rounded-xl p-4">
            <p className="text-text-muted text-xs uppercase tracking-wider">24H High</p>
            <p className="text-white font-mono text-lg mt-1">
              {formatPrice(btcHigh)}
            </p>
          </div>
          <div className="bg-bg-primary/50 rounded-xl p-4">
            <p className="text-text-muted text-xs uppercase tracking-wider">24H Low</p>
            <p className="text-white font-mono text-lg mt-1">
              {formatPrice(btcLow)}
            </p>
          </div>
          <div className="bg-bg-primary/50 rounded-xl p-4">
            <p className="text-text-muted text-xs uppercase tracking-wider">24H Volume</p>
            <p className="text-white font-mono text-lg mt-1">
              ${formatNumber(btcVolume)}
            </p>
          </div>
          <div className="bg-bg-primary/50 rounded-xl p-4">
            <p className="text-text-muted text-xs uppercase tracking-wider">Dominance</p>
            <p className="text-white font-mono text-lg mt-1">
              {dominance > 0 ? `${dominance.toFixed(1)}%` : '--'}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Fear & Greed */}
        <div className="bg-bg-card rounded-xl p-5 border border-gold-primary/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gold-primary font-semibold">Fear & Greed Index</h3>
            <span className="text-xs text-text-muted">alternative.me</span>
          </div>
          
          <div className="text-center">
            <div className={`text-5xl font-display font-bold ${getFearGreedColor(fearGreedValue)}`}>
              {fearGreedValue}
            </div>
            <p className={`text-lg font-medium mt-2 ${getFearGreedColor(fearGreedValue)}`}>
              {fearGreedLabel}
            </p>
            {/* Progress bar */}
            <div className="mt-4 h-2 bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full relative">
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2 border-gray-800 shadow-lg"
                style={{ left: `${fearGreedValue}%`, transform: 'translate(-50%, -50%)' }}
              />
            </div>
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>Extreme Fear</span>
              <span>Extreme Greed</span>
            </div>
          </div>
        </div>

        {/* Long/Short Ratio */}
        <div className="bg-bg-card rounded-xl p-5 border border-gold-primary/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gold-primary font-semibold">Long/Short Ratio</h3>
            <span className="text-xs text-text-muted">Binance/Bybit</span>
          </div>
          
          {marketData?.long_short ? (
            <div>
              <div className="flex justify-between items-end mb-4">
                <div>
                  <p className="text-3xl font-bold text-green-400">
                    {marketData.long_short.long_pct?.toFixed(1) || '--'}%
                  </p>
                  <p className="text-text-muted text-sm">Long</p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-red-400">
                    {marketData.long_short.short_pct?.toFixed(1) || '--'}%
                  </p>
                  <p className="text-text-muted text-sm">Short</p>
                </div>
              </div>
              {/* Visual bar */}
              <div className="h-4 rounded-full overflow-hidden flex">
                <div 
                  className="bg-gradient-to-r from-green-600 to-green-400 transition-all duration-500"
                  style={{ width: `${marketData.long_short.long_pct || 50}%` }}
                />
                <div 
                  className="bg-gradient-to-r from-red-400 to-red-600 transition-all duration-500"
                  style={{ width: `${marketData.long_short.short_pct || 50}%` }}
                />
              </div>
              <p className="text-center text-text-muted text-xs mt-2">
                Ratio: {marketData.long_short.ratio?.toFixed(2) || '--'}
              </p>
            </div>
          ) : (
            <div className="text-center py-6">
              <p className="text-text-muted text-sm">Data unavailable</p>
              <p className="text-text-muted text-xs mt-1">API may be rate limited</p>
            </div>
          )}
        </div>

        {/* Open Interest */}
        <div className="bg-bg-card rounded-xl p-5 border border-gold-primary/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gold-primary font-semibold">Open Interest</h3>
            <span className="text-xs text-text-muted">BTC Futures</span>
          </div>
          
          {marketData?.open_interest ? (
            <div className="text-center">
              <p className="text-4xl font-mono font-bold text-white">
                ${formatNumber(marketData.open_interest.usd)}
              </p>
              <p className="text-text-muted text-sm mt-2">
                {formatNumber(marketData.open_interest.btc)} BTC
              </p>
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-text-muted text-sm">Funding Rate:</span>
                  <span className={`font-mono font-semibold ${getFundingColor(marketData.funding?.rate)}`}>
                    {marketData.funding?.rate !== undefined 
                      ? `${marketData.funding.rate >= 0 ? '+' : ''}${marketData.funding.rate.toFixed(4)}%`
                      : '--'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-text-muted py-8">Loading...</p>
          )}
        </div>
      </div>

      {/* Top Funding Rates Table */}
      <div className="bg-bg-card rounded-xl border border-gold-primary/10 overflow-hidden">
        <div className="p-4 border-b border-gold-primary/10 flex items-center justify-between">
          <h3 className="text-gold-primary font-semibold">💰 Top Funding Rates</h3>
          <span className="text-xs text-text-muted">Sorted by highest absolute rate</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-4 py-3 text-left text-xs text-gold-primary/70 uppercase tracking-wider">Symbol</th>
                <th className="px-4 py-3 text-right text-xs text-gold-primary/70 uppercase tracking-wider">Funding Rate</th>
              </tr>
            </thead>
            <tbody>
              {fundingRates.length > 0 ? (
                fundingRates.map((item, idx) => (
                  <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-white">
                        {item.symbol.replace('USDT', '')}
                      </span>
                      <span className="text-text-muted">/USDT</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono font-semibold ${getFundingColor(item.fundingRate)}`}>
                        {item.fundingRate >= 0 ? '+' : ''}{item.fundingRate?.toFixed(4) || '--'}%
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-text-muted">
                    Loading funding rates...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Last Updated */}
      <div className="text-center text-text-muted text-sm">
        Last updated: {lastUpdate?.toLocaleTimeString() || '--'} • Auto-refresh every 30s
      </div>

      {/* Error message if any */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
          <p className="text-red-400">{error}</p>
          <button 
            onClick={fetchData}
            className="mt-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 text-sm"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default MarketDashboard;