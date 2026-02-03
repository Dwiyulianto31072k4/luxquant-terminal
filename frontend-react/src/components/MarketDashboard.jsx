import { useState, useEffect, useCallback } from 'react';
import { freeMarketApi } from '../services/marketApi';
import CoinLogo from './CoinLogo';

// Fear & Greed Gauge Component
const FearGreedGauge = ({ value, classification }) => {
  // Calculate rotation angle (-90 to 90 degrees for half circle)
  const rotation = ((value / 100) * 180) - 90;
  
  const getColor = (val) => {
    if (val <= 25) return '#ef4444'; // Extreme Fear - Red
    if (val <= 45) return '#f97316'; // Fear - Orange
    if (val <= 55) return '#eab308'; // Neutral - Yellow
    if (val <= 75) return '#84cc16'; // Greed - Light Green
    return '#22c55e'; // Extreme Greed - Green
  };

  const color = getColor(value);

  return (
    <div className="flex flex-col items-center">
      {/* Gauge */}
      <div className="relative w-48 h-24 overflow-hidden">
        {/* Background arc */}
        <div 
          className="absolute bottom-0 left-1/2 w-48 h-48 -translate-x-1/2 rounded-full"
          style={{
            background: `conic-gradient(
              from 180deg,
              #ef4444 0deg 36deg,
              #f97316 36deg 72deg,
              #eab308 72deg 108deg,
              #84cc16 108deg 144deg,
              #22c55e 144deg 180deg,
              transparent 180deg
            )`,
            clipPath: 'polygon(0 50%, 100% 50%, 100% 100%, 0 100%)'
          }}
        />
        
        {/* Inner dark circle */}
        <div 
          className="absolute bottom-0 left-1/2 w-36 h-36 -translate-x-1/2 rounded-full bg-[#1a0a0a]"
          style={{ clipPath: 'polygon(0 50%, 100% 50%, 100% 100%, 0 100%)' }}
        />
        
        {/* Needle */}
        <div 
          className="absolute bottom-0 left-1/2 w-1 h-20 origin-bottom"
          style={{ 
            transform: `translateX(-50%) rotate(${rotation}deg)`,
            background: `linear-gradient(to top, ${color}, ${color}88)`
          }}
        >
          <div 
            className="absolute -top-1 left-1/2 w-3 h-3 rounded-full -translate-x-1/2"
            style={{ backgroundColor: color }}
          />
        </div>
        
        {/* Center dot */}
        <div className="absolute bottom-0 left-1/2 w-4 h-4 -translate-x-1/2 translate-y-1/2 rounded-full bg-[#d4a853]" />
      </div>
      
      {/* Value */}
      <div className="text-center mt-2">
        <div className="text-3xl font-bold" style={{ color }}>{value}</div>
        <div className="text-sm text-gray-400">{classification}</div>
      </div>
    </div>
  );
};

// Mini Stat Card
const MiniStatCard = ({ label, value, subValue, color = 'text-white' }) => (
  <div className="bg-[#1a0a0a]/50 rounded-lg p-3">
    <div className="text-xs text-gray-500 mb-1">{label}</div>
    <div className={`text-lg font-bold ${color}`}>{value}</div>
    {subValue && <div className="text-xs text-gray-500">{subValue}</div>}
  </div>
);

// Ratio Bar Component
const RatioBar = ({ long, short, label }) => (
  <div>
    <div className="flex justify-between text-xs text-gray-400 mb-1">
      <span>Long {(long * 100).toFixed(1)}%</span>
      <span className="text-gray-500">{label}</span>
      <span>Short {(short * 100).toFixed(1)}%</span>
    </div>
    <div className="h-2 bg-[#1a0a0a] rounded-full overflow-hidden flex">
      <div 
        className="bg-green-500 h-full"
        style={{ width: `${long * 100}%` }}
      />
      <div 
        className="bg-red-500 h-full"
        style={{ width: `${short * 100}%` }}
      />
    </div>
  </div>
);

const MarketDashboard = () => {
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchMarketData = useCallback(async () => {
    try {
      setError(null);
      const data = await freeMarketApi.getAllMarketData();
      if (data) {
        setMarketData(data);
        setLastUpdate(new Date());
      }
    } catch (err) {
      console.error('Error fetching market data:', err);
      setError('Failed to fetch market data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarketData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchMarketData, 30000);
    return () => clearInterval(interval);
  }, [fetchMarketData]);

  const formatNumber = (num, decimals = 2) => {
    if (!num && num !== 0) return '--';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(num);
  };

  const formatLargeNumber = (num) => {
    if (!num && num !== 0) return '--';
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${formatNumber(num)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#d4a853]" />
      </div>
    );
  }

  const btc = marketData?.btc;
  const global = marketData?.global;
  const fearGreed = marketData?.fearGreed;
  const longShort = marketData?.longShortRatio;
  const openInterest = marketData?.openInterest;
  const fundingRates = marketData?.fundingRates || [];

  return (
    <div className="space-y-6">
      {/* BTC Overview Card */}
      <div className="bg-gradient-to-br from-[#2a1a1a] to-[#1a0a0a] rounded-xl p-6 border border-[#3a2a2a]">
        <div className="flex items-center gap-4 mb-6">
          <CoinLogo pair="BTCUSDT" size={56} />
          <div>
            <h2 className="text-2xl font-bold text-white">Bitcoin</h2>
            <p className="text-gray-400">BTC/USDT</p>
          </div>
          <div className="ml-auto text-right">
            <div className="text-3xl font-bold text-white">
              ${btc?.price ? formatNumber(btc.price, 2) : '--'}
            </div>
            <div className={`text-lg ${btc?.price_change_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {btc?.price_change_pct >= 0 ? '+' : ''}{btc?.price_change_pct?.toFixed(2) || '0.00'}%
            </div>
          </div>
        </div>

        {/* BTC Stats Grid */}
        <div className="grid grid-cols-4 gap-4">
          <MiniStatCard 
            label="24H HIGH" 
            value={btc?.high_24h ? `$${formatNumber(btc.high_24h, 2)}` : '--'}
          />
          <MiniStatCard 
            label="24H LOW" 
            value={btc?.low_24h ? `$${formatNumber(btc.low_24h, 2)}` : '--'}
          />
          <MiniStatCard 
            label="24H VOLUME" 
            value={btc?.volume_24h ? formatLargeNumber(btc.volume_24h) : '--'}
          />
          <MiniStatCard 
            label="DOMINANCE" 
            value={global?.btc_dominance ? `${global.btc_dominance.toFixed(1)}%` : '--'}
          />
        </div>
      </div>

      {/* Market Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Fear & Greed Index */}
        <div className="bg-gradient-to-br from-[#2a1a1a] to-[#1a0a0a] rounded-xl p-6 border border-[#3a2a2a]">
          <h3 className="text-lg font-semibold text-[#d4a853] mb-4">Fear & Greed Index</h3>
          {fearGreed ? (
            <FearGreedGauge 
              value={fearGreed.value} 
              classification={fearGreed.classification}
            />
          ) : (
            <div className="text-center text-gray-500">Loading...</div>
          )}
          {fearGreed && (
            <div className="flex justify-between mt-4 text-xs text-gray-500">
              <span>Yesterday: {fearGreed.yesterday}</span>
              <span>Last Week: {fearGreed.last_week}</span>
            </div>
          )}
        </div>

        {/* Long/Short Ratio */}
        <div className="bg-gradient-to-br from-[#2a1a1a] to-[#1a0a0a] rounded-xl p-6 border border-[#3a2a2a]">
          <h3 className="text-lg font-semibold text-[#d4a853] mb-4">Long/Short Ratio</h3>
          {longShort ? (
            <div className="space-y-4">
              <RatioBar 
                long={longShort.longAccount} 
                short={longShort.shortAccount}
                label="All Traders"
              />
              <div className="text-center">
                <span className="text-2xl font-bold text-white">
                  {longShort.longShortRatio?.toFixed(2)}
                </span>
                <span className="text-gray-500 ml-2">Ratio</span>
              </div>

            </div>
          ) : (
            <div className="text-center text-gray-500">Loading...</div>
          )}
        </div>

        {/* Open Interest */}
        <div className="bg-gradient-to-br from-[#2a1a1a] to-[#1a0a0a] rounded-xl p-6 border border-[#3a2a2a]">
          <h3 className="text-lg font-semibold text-[#d4a853] mb-4">Open Interest</h3>
          {openInterest ? (
            <div className="text-center">
              <div className="text-3xl font-bold text-white">
                {formatLargeNumber(openInterest.openInterestUsd)}
              </div>
              <div className="text-gray-500 mt-1">
                {formatNumber(openInterest.openInterest, 0)} BTC
              </div>

            </div>
          ) : (
            <div className="text-center text-gray-500">Loading...</div>
          )}
        </div>
      </div>

      {/* Funding Rates */}
      <div className="bg-gradient-to-br from-[#2a1a1a] to-[#1a0a0a] rounded-xl p-6 border border-[#3a2a2a]">
        <h3 className="text-lg font-semibold text-[#d4a853] mb-4">Funding Rates</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {fundingRates.map((fr) => (
            <div key={fr.symbol} className="bg-[#1a0a0a]/50 rounded-lg p-3 text-center">
              <div className="text-sm text-gray-400 mb-1">{fr.symbol}</div>
              <div className={`text-lg font-bold ${fr.rate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {(fr.rate * 100).toFixed(4)}%
              </div>
            </div>
          ))}
        </div>

      </div>

      {/* Last Update */}
      <div className="text-center text-gray-500 text-sm">
        Last updated: {lastUpdate?.toLocaleTimeString() || '--'} • Auto-refresh every 30s
      </div>
    </div>
  );
};

export default MarketDashboard;