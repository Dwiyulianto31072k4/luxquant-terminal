import { useState, useEffect } from 'react';

/**
 * MarketHighlights Component
 * Displays market categories: Hot, Market Overview (expanded), Top Gainer, Top Volume
 */
const MarketHighlights = () => {
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchMarketData = async () => {
    try {
      // Fetch coins market data
      const coinsResponse = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h'
      );
      const coinsData = await coinsResponse.json();
      
      // Fetch global data
      const globalResponse = await fetch('https://api.coingecko.com/api/v3/global');
      const globalData = await globalResponse.json();

      // Fetch Fear & Greed Index
      let fearGreedData = { value: 50, value_classification: 'Neutral' };
      try {
        const fgResponse = await fetch('https://api.alternative.me/fng/?limit=1');
        const fgData = await fgResponse.json();
        if (fgData.data && fgData.data[0]) {
          fearGreedData = fgData.data[0];
        }
      } catch (e) {
        console.error('Fear & Greed fetch error:', e);
      }
      
      if (Array.isArray(coinsData) && globalData.data) {
        const global = globalData.data;
        
        // Find ETH and BTC for ratio calculation
        const btc = coinsData.find(c => c.symbol === 'btc');
        const eth = coinsData.find(c => c.symbol === 'eth');
        const ethBtcRatio = btc && eth ? (eth.current_price / btc.current_price) : 0;

        // Calculate stablecoin dominance (USDT + USDC)
        const stablecoinDom = (global.market_cap_percentage?.usdt || 0) + (global.market_cap_percentage?.usdc || 0);

        const processed = {
          // Hot - top by market cap
          hot: coinsData
            .slice(0, 3)
            .map(coin => ({
              symbol: coin.symbol.toUpperCase(),
              price: formatPrice(coin.current_price),
              change: coin.price_change_percentage_24h,
              logo: coin.image
            })),
          
          // Market Overview - comprehensive data for traders
          marketOverview: {
            // Total Market Cap
            totalMarketCap: global.total_market_cap?.usd || 0,
            marketCapChange24h: global.market_cap_change_percentage_24h_usd || 0,
            
            // BTC Dominance - KEY indicator
            btcDominance: global.market_cap_percentage?.btc || 0,
            
            // Altcoin Market Cap (Total - BTC)
            altcoinMarketCap: (global.total_market_cap?.usd || 0) * (1 - (global.market_cap_percentage?.btc || 0) / 100),
            
            // Total 24h Volume
            totalVolume24h: global.total_volume?.usd || 0,
            
            // ETH/BTC Ratio - altseason indicator
            ethBtcRatio: ethBtcRatio,
            ethDominance: global.market_cap_percentage?.eth || 0,
            
            // Stablecoin Dominance - cash on sidelines
            stablecoinDom: stablecoinDom,
            
            // Fear & Greed
            fearGreed: parseInt(fearGreedData.value),
            fearGreedLabel: fearGreedData.value_classification,
            
            // Active cryptocurrencies
            activeCryptos: global.active_cryptocurrencies || 0,
          },
          
          // Top Gainer
          topGainer: coinsData
            .filter(c => c.price_change_percentage_24h !== null && c.market_cap_rank <= 100)
            .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
            .slice(0, 3)
            .map(coin => ({
              symbol: coin.symbol.toUpperCase(),
              price: formatPrice(coin.current_price),
              change: coin.price_change_percentage_24h,
              logo: coin.image
            })),
          
          // Top Volume
          topVolume: coinsData
            .sort((a, b) => b.total_volume - a.total_volume)
            .slice(0, 3)
            .map(coin => ({
              symbol: coin.symbol.toUpperCase(),
              price: formatPrice(coin.current_price),
              change: coin.price_change_percentage_24h,
              logo: coin.image
            }))
        };
        
        setMarketData(processed);
      }
    } catch (error) {
      console.error('Failed to fetch market highlights:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    if (!price) return '$0.00';
    if (price >= 1000) return `$${(price / 1000).toFixed(2)}K`;
    if (price >= 1) return `$${price.toFixed(2)}`;
    return `$${price.toFixed(6)}`;
  };

  const formatLargeNumber = (num) => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(0)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(0)}M`;
    return `$${num.toFixed(2)}`;
  };

  const formatChange = (change) => {
    if (change === null || change === undefined) return '+0.00%';
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  // Get Fear & Greed color
  const getFearGreedColor = (value) => {
    if (value <= 25) return 'text-red-500';
    if (value <= 45) return 'text-orange-400';
    if (value <= 55) return 'text-yellow-400';
    if (value <= 75) return 'text-lime-400';
    return 'text-green-400';
  };

  const getFearGreedBg = (value) => {
    if (value <= 25) return 'bg-red-500/20';
    if (value <= 45) return 'bg-orange-400/20';
    if (value <= 55) return 'bg-yellow-400/20';
    if (value <= 75) return 'bg-lime-400/20';
    return 'bg-green-400/20';
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <div className="glass-card rounded-xl p-4 border border-gold-primary/10 animate-pulse">
          <div className="h-4 bg-bg-card rounded w-16 mb-3"></div>
          <div className="space-y-2">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="h-8 bg-bg-card rounded"></div>
            ))}
          </div>
        </div>
        <div className="md:col-span-2 glass-card rounded-xl p-4 border border-gold-primary/10 animate-pulse">
          <div className="h-4 bg-bg-card rounded w-32 mb-3"></div>
          <div className="grid grid-cols-2 gap-3">
            {[...Array(6)].map((_, j) => (
              <div key={j} className="h-12 bg-bg-card rounded"></div>
            ))}
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 border border-gold-primary/10 animate-pulse">
          <div className="h-4 bg-bg-card rounded w-16 mb-3"></div>
          <div className="space-y-2">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="h-8 bg-bg-card rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!marketData) return null;

  const overview = marketData.marketOverview;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
      {/* Hot */}
      <CategoryCard 
        icon="🔥" 
        label="Hot" 
        coins={marketData.hot}
        formatChange={formatChange}
      />

      {/* Market Overview - Expanded 2 columns */}
      <div className="md:col-span-2 glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gold-primary/10">
          <div className="flex items-center gap-2">
            <span className="text-sm">📊</span>
            <span className="text-white font-semibold text-sm">Market Overview</span>
          </div>
          <span className="text-text-muted text-xs">Live Data</span>
        </div>
        
        <div className="p-4">
          {/* Top Row - Big Numbers */}
          <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-gold-primary/10">
            {/* Total Market Cap */}
            <div>
              <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Total Market Cap</p>
              <p className="text-white font-mono text-lg font-bold">{formatLargeNumber(overview.totalMarketCap)}</p>
              <p className={`text-xs font-semibold ${overview.marketCapChange24h >= 0 ? 'text-positive' : 'text-negative'}`}>
                {formatChange(overview.marketCapChange24h)}
              </p>
            </div>
            
            {/* 24h Volume */}
            <div>
              <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">24h Volume</p>
              <p className="text-white font-mono text-lg font-bold">{formatLargeNumber(overview.totalVolume24h)}</p>
            </div>
            
            {/* Fear & Greed */}
            <div>
              <p className="text-text-muted text-[10px] uppercase tracking-wider mb-1">Fear & Greed</p>
              <div className="flex items-center gap-2">
                <span className={`font-mono text-lg font-bold ${getFearGreedColor(overview.fearGreed)}`}>
                  {overview.fearGreed}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${getFearGreedBg(overview.fearGreed)} ${getFearGreedColor(overview.fearGreed)}`}>
                  {overview.fearGreedLabel}
                </span>
              </div>
            </div>
          </div>
          
          {/* Bottom Row - Key Indicators */}
          <div className="grid grid-cols-4 gap-3">
            {/* BTC Dominance */}
            <div className="text-center p-2 rounded-lg bg-orange-500/5 border border-orange-500/20">
              <p className="text-text-muted text-[10px] uppercase mb-1">BTC Dom</p>
              <p className="text-orange-400 font-mono text-sm font-bold">{overview.btcDominance.toFixed(1)}%</p>
            </div>
            
            {/* ETH/BTC Ratio */}
            <div className="text-center p-2 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <p className="text-text-muted text-[10px] uppercase mb-1">ETH/BTC</p>
              <p className="text-blue-400 font-mono text-sm font-bold">{overview.ethBtcRatio.toFixed(4)}</p>
            </div>
            
            {/* Altcoin Cap */}
            <div className="text-center p-2 rounded-lg bg-gold-primary/5 border border-gold-primary/20">
              <p className="text-text-muted text-[10px] uppercase mb-1">Altcoin Cap</p>
              <p className="text-gold-primary font-mono text-sm font-bold">{formatLargeNumber(overview.altcoinMarketCap)}</p>
            </div>
            
            {/* Stablecoin Dominance */}
            <div className="text-center p-2 rounded-lg bg-green-500/5 border border-green-500/20">
              <p className="text-text-muted text-[10px] uppercase mb-1">Stable Dom</p>
              <p className="text-green-400 font-mono text-sm font-bold">{overview.stablecoinDom.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Top Gainer & Top Volume Combined */}
      <div className="space-y-3">
        {/* Top Gainer - Compact */}
        <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gold-primary/10">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">📈</span>
              <span className="text-white font-semibold text-xs">Top Gainer</span>
            </div>
            <button className="text-text-muted text-[10px] hover:text-gold-primary transition-colors">More</button>
          </div>
          <div className="divide-y divide-gold-primary/5">
            {marketData.topGainer?.slice(0, 2).map((coin, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-2 hover:bg-gold-primary/5 cursor-pointer transition-colors">
                <div className="flex items-center gap-2">
                  <img src={coin.logo} alt={coin.symbol} className="w-5 h-5 rounded-full" 
                    onError={(e) => { e.target.onerror = null; e.target.src = `https://ui-avatars.com/api/?name=${coin.symbol}&background=d4a853&color=0a0506&size=20&bold=true`; }}
                  />
                  <span className="text-white font-medium text-xs">{coin.symbol}</span>
                </div>
                <span className="text-positive text-xs font-semibold">{formatChange(coin.change)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Volume - Compact */}
        <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gold-primary/10">
            <div className="flex items-center gap-1.5">
              <span className="text-xs">💎</span>
              <span className="text-white font-semibold text-xs">Top Volume</span>
            </div>
            <button className="text-text-muted text-[10px] hover:text-gold-primary transition-colors">More</button>
          </div>
          <div className="divide-y divide-gold-primary/5">
            {marketData.topVolume?.slice(0, 2).map((coin, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-2 hover:bg-gold-primary/5 cursor-pointer transition-colors">
                <div className="flex items-center gap-2">
                  <img src={coin.logo} alt={coin.symbol} className="w-5 h-5 rounded-full"
                    onError={(e) => { e.target.onerror = null; e.target.src = `https://ui-avatars.com/api/?name=${coin.symbol}&background=d4a853&color=0a0506&size=20&bold=true`; }}
                  />
                  <span className="text-white font-medium text-xs">{coin.symbol}</span>
                </div>
                <span className={`text-xs font-semibold ${coin.change >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {formatChange(coin.change)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Reusable Category Card for coins list
const CategoryCard = ({ icon, label, coins, formatChange }) => (
  <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden group hover:border-gold-primary/30 transition-all">
    <div className="flex items-center justify-between px-4 py-3 border-b border-gold-primary/10">
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <span className="text-white font-semibold text-sm">{label}</span>
      </div>
      <button className="text-text-muted text-xs hover:text-gold-primary transition-colors flex items-center gap-1">
        More
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
    <div className="divide-y divide-gold-primary/5">
      {coins?.map((coin, idx) => (
        <div 
          key={idx}
          className="flex items-center justify-between px-4 py-2.5 hover:bg-gold-primary/5 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <img 
              src={coin.logo} 
              alt={coin.symbol}
              className="w-6 h-6 rounded-full"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = `https://ui-avatars.com/api/?name=${coin.symbol}&background=d4a853&color=0a0506&size=24&bold=true`;
              }}
            />
            <span className="text-white font-medium text-sm">{coin.symbol}</span>
          </div>
          <div className="text-right">
            <p className="text-white text-sm font-mono">{coin.price}</p>
            <p className={`text-xs font-semibold ${
              coin.change >= 0 ? 'text-positive' : 'text-negative'
            }`}>
              {formatChange(coin.change)}
            </p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default MarketHighlights;