import { useState, useEffect } from 'react';

/**
 * BitcoinPage - Dedicated page for Bitcoin data & metrics
 * Uses backend API with caching to avoid rate limits
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const BitcoinPage = () => {
  const [data, setData] = useState(null);
  const [derivativesData, setDerivativesData] = useState(null);
  const [networkData, setNetworkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    try {
      setError(null);
      
      // Fetch all data from BACKEND (with caching)
      const [btcRes, derivRes, networkRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/v1/coingecko/bitcoin`),
        fetch(`${API_BASE}/api/v1/market/overview`),
        fetch(`${API_BASE}/api/v1/bitcoin/extended`)
      ]);

      // Process Bitcoin data from backend
      if (btcRes.status === 'fulfilled' && btcRes.value.ok) {
        const btcData = await btcRes.value.json();
        setData({
          price: btcData.price || 0,
          priceChange24h: btcData.price_change_24h || 0,
          priceChange7d: btcData.price_change_7d || 0,
          priceChange30d: btcData.price_change_30d || 0,
          high24h: btcData.high_24h || 0,
          low24h: btcData.low_24h || 0,
          ath: btcData.ath || 0,
          athChange: btcData.ath_change || 0,
          marketCap: btcData.market_cap || 0,
          marketCapRank: btcData.market_cap_rank || 1,
          volume24h: btcData.volume_24h || 0,
          circulatingSupply: btcData.circulating_supply || 0,
          maxSupply: btcData.max_supply || 21000000,
          dominance: btcData.dominance || 0,
          fearGreed: {
            value: btcData.fear_greed_value || 50,
            label: btcData.fear_greed_label || 'Neutral',
          },
        });
      } else {
        setError('Failed to fetch Bitcoin data');
      }

      // Process Derivatives data
      if (derivRes.status === 'fulfilled' && derivRes.value.ok) {
        const derivJson = await derivRes.value.json();
        setDerivativesData(derivJson);
      }

      // Process Network data
      if (networkRes.status === 'fulfilled' && networkRes.value.ok) {
        const netJson = await networkRes.value.json();
        setNetworkData(netJson);
      }

    } catch (err) {
      console.error('Failed to fetch data:', err);
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
          {[...Array(8)].map((_, i) => (
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
            onClick={() => { setLoading(true); fetchAllData(); }}
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
              ${data.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <div className="flex items-center justify-end gap-2 mt-1">
              <PriceChange value={data.priceChange24h} label="24h" />
              <PriceChange value={data.priceChange7d} label="7d" />
              <PriceChange value={data.priceChange30d} label="30d" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard 
          label="Market Cap" 
          value={formatLargeNumber(data.marketCap)} 
        />
        <StatCard 
          label="24H Volume" 
          value={formatLargeNumber(data.volume24h)} 
        />
        <StatCard 
          label="BTC Dominance" 
          value={`${data.dominance.toFixed(1)}%`}
          valueColor="text-orange-400"
        />
        <StatCard 
          label="Fear & Greed" 
          value={data.fearGreed.value}
          subValue={data.fearGreed.label}
          valueColor={getFearGreedColor(data.fearGreed.value)}
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Price Range & ATH */}
        <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
          <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
            24H Price Range
          </h3>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-negative">${data.low24h.toLocaleString()}</span>
            <span className="text-positive">${data.high24h.toLocaleString()}</span>
          </div>
          <div className="relative h-2 bg-bg-tertiary rounded-full overflow-hidden">
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
          <p className="text-center text-text-muted text-xs mt-2">Current: ${data.price.toLocaleString()}</p>

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
              <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-gold-dark to-gold-primary rounded-full transition-all duration-500"
                  style={{ width: `${supplyPercent}%` }}
                />
              </div>
              <p className="text-right text-text-muted text-xs mt-1">{supplyPercent.toFixed(1)}% mined</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <p className="text-text-muted text-xs uppercase">Max Supply</p>
                <p className="text-white font-mono font-bold">21,000,000 BTC</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase">Remaining</p>
                <p className="text-white font-mono font-bold">
                  {((data.maxSupply - data.circulatingSupply) / 1e6).toFixed(2)}M BTC
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== DERIVATIVES DATA ==================== */}
      <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
        <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
          <span>📊</span> Derivatives Data
          <span className="text-text-muted font-normal normal-case">(Binance Futures)</span>
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Open Interest */}
          <div className="bg-bg-tertiary/50 rounded-lg p-4">
            <p className="text-text-muted text-xs uppercase mb-1">Open Interest</p>
            <p className="text-white font-mono font-bold text-lg">
              {derivativesData?.open_interest?.usd 
                ? formatLargeNumber(derivativesData.open_interest.usd)
                : '--'}
            </p>
            <p className="text-text-muted text-xs">
              {derivativesData?.open_interest?.btc 
                ? `${derivativesData.open_interest.btc.toLocaleString()} BTC`
                : ''}
            </p>
          </div>

          {/* Funding Rate */}
          <div className="bg-bg-tertiary/50 rounded-lg p-4">
            <p className="text-text-muted text-xs uppercase mb-1">Funding Rate</p>
            <p className={`font-mono font-bold text-lg ${
              derivativesData?.funding?.rate >= 0 ? 'text-positive' : 'text-negative'
            }`}>
              {derivativesData?.funding?.rate !== undefined
                ? `${derivativesData.funding.rate >= 0 ? '+' : ''}${derivativesData.funding.rate.toFixed(4)}%`
                : '--'}
            </p>
            <p className="text-text-muted text-xs">per 8h</p>
          </div>

          {/* Long/Short Ratio */}
          <div className="bg-bg-tertiary/50 rounded-lg p-4">
            <p className="text-text-muted text-xs uppercase mb-1">Long/Short</p>
            {derivativesData?.long_short ? (
              <>
                <div className="flex gap-2 items-baseline">
                  <span className="text-positive font-mono font-bold text-lg">
                    {derivativesData.long_short.long_pct.toFixed(1)}%
                  </span>
                  <span className="text-text-muted">/</span>
                  <span className="text-negative font-mono font-bold text-lg">
                    {derivativesData.long_short.short_pct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden flex mt-2">
                  <div 
                    className="bg-positive transition-all"
                    style={{ width: `${derivativesData.long_short.long_pct}%` }}
                  />
                  <div 
                    className="bg-negative transition-all"
                    style={{ width: `${derivativesData.long_short.short_pct}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-white font-mono font-bold text-lg">--</p>
            )}
          </div>

          {/* Liquidations */}
          <div className="bg-bg-tertiary/50 rounded-lg p-4">
            <p className="text-text-muted text-xs uppercase mb-1">Liquidations 24H</p>
            <p className="text-white font-mono font-bold text-lg">
              {networkData?.liquidations?.total_24h 
                ? formatLargeNumber(networkData.liquidations.total_24h)
                : '--'}
            </p>
            {networkData?.liquidations && (
              <div className="flex gap-2 text-xs mt-1">
                <span className="text-positive">L: {formatLargeNumber(networkData.liquidations.long_24h)}</span>
                <span className="text-negative">S: {formatLargeNumber(networkData.liquidations.short_24h)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== NETWORK DATA ==================== */}
      <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
        <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
          <span>⛓️</span> Network & On-Chain Data
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Hash Rate */}
          <div className="bg-bg-tertiary/50 rounded-lg p-4">
            <p className="text-text-muted text-xs uppercase mb-1">Hash Rate</p>
            <p className="text-white font-mono font-bold text-lg">
              {networkData?.hashrate 
                ? `${networkData.hashrate.hashrate_formatted} ${networkData.hashrate.unit}`
                : '--'}
            </p>
            <p className="text-text-muted text-xs">Network security</p>
          </div>

          {/* Difficulty */}
          <div className="bg-bg-tertiary/50 rounded-lg p-4">
            <p className="text-text-muted text-xs uppercase mb-1">Difficulty</p>
            <p className="text-white font-mono font-bold text-lg">
              {networkData?.difficulty?.difficulty_formatted || '--'}
            </p>
            <p className="text-text-muted text-xs">Mining difficulty</p>
          </div>

          {/* Mempool Fees */}
          <div className="bg-bg-tertiary/50 rounded-lg p-4">
            <p className="text-text-muted text-xs uppercase mb-1">Mempool Fees</p>
            <p className="text-white font-mono font-bold text-lg">
              {networkData?.mempool_fees 
                ? `${networkData.mempool_fees.fastest} sat/vB`
                : '--'}
            </p>
            {networkData?.mempool_fees && (
              <div className="flex gap-2 text-xs mt-1 text-text-muted">
                <span>Med: {networkData.mempool_fees.half_hour}</span>
                <span>Low: {networkData.mempool_fees.economy}</span>
              </div>
            )}
          </div>

          {/* Transaction Count */}
          <div className="bg-bg-tertiary/50 rounded-lg p-4">
            <p className="text-text-muted text-xs uppercase mb-1">Transactions 24H</p>
            <p className="text-white font-mono font-bold text-lg">
              {networkData?.transactions?.count_24h 
                ? networkData.transactions.count_24h.toLocaleString()
                : '--'}
            </p>
            <p className="text-text-muted text-xs">Confirmed txs</p>
          </div>
        </div>
      </div>

      {/* Market Analysis */}
      <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
        <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
          Market Analysis
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AnalysisItem 
            label="Vol/MCap Ratio" 
            value={`${((data.volume24h / data.marketCap) * 100).toFixed(2)}%`}
            hint={data.volume24h / data.marketCap > 0.05 ? "High" : "Normal"}
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

// ============ Sub-Components ============

const PriceChange = ({ value, label }) => (
  <span className={`text-xs px-2 py-0.5 rounded ${
    value >= 0 ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'
  }`}>
    {value >= 0 ? '+' : ''}{value.toFixed(2)}% {label}
  </span>
);

const StatCard = ({ label, value, subValue, valueColor = "text-white" }) => (
  <div className="glass-card rounded-xl p-4 border border-gold-primary/10">
    <p className="text-text-muted text-xs uppercase tracking-wider mb-1">{label}</p>
    <p className={`font-mono font-bold text-xl ${valueColor}`}>{value}</p>
    {subValue && <p className="text-text-muted text-xs mt-0.5">{subValue}</p>}
  </div>
);

const AnalysisItem = ({ label, value, hint }) => (
  <div>
    <p className="text-text-muted text-xs uppercase">{label}</p>
    <p className="text-white font-mono font-bold text-lg">{value}</p>
    {hint && <p className="text-text-muted text-xs">{hint}</p>}
  </div>
);

// ============ Utilities ============

const formatLargeNumber = (num) => {
  if (!num) return '$0';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
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