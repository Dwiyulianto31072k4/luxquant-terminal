import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import freeMarketApi from '../services/marketApi';

const MarketDashboard = () => {
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchMarketData = useCallback(async () => {
    try {
      const data = await freeMarketApi.getAllMarketData();
      setMarketData(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch market data:', error);
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

  // Format currency
  const formatCurrency = (value, decimals = 2) => {
    if (!value) return '--';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  // Format large numbers
  const formatLargeNumber = (value) => {
    if (!value) return '--';
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return formatCurrency(value);
  };

  // Format percentage
  const formatPercent = (value, decimals = 4) => {
    if (value === null || value === undefined) return '--';
    const pct = value * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(decimals)}%`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-bg-card rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 bg-bg-card rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { btc, global, fearGreed, longShortRatio, topTraderRatio, openInterest, fundingRates, oiHistory } = marketData || {};

  return (
    <div className="space-y-6">
      {/* BTC Header */}
      <div className="glass-card rounded-xl p-6 border border-gold-primary/10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* BTC Info */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-orange-600 rounded-full flex items-center justify-center text-2xl font-bold text-white">
              ₿
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold text-white">Bitcoin</h2>
              <p className="text-text-muted text-sm">BTC/USDT</p>
            </div>
          </div>

          {/* Price */}
          <div className="text-right">
            <p className="text-4xl font-mono font-bold text-white">
              {formatCurrency(btc?.price)}
            </p>
            <span className={`font-mono text-lg font-semibold px-3 py-1 rounded-lg inline-block mt-1 ${
              btc?.price_change_pct >= 0 
                ? 'bg-positive/10 text-positive' 
                : 'bg-negative/10 text-negative'
            }`}>
              {btc?.price_change_pct >= 0 ? '+' : ''}{btc?.price_change_pct?.toFixed(2)}%
            </span>
          </div>
        </div>

        {/* 24H Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gold-primary/10">
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wider">24H High</p>
            <p className="text-xl font-mono text-white">{formatCurrency(btc?.high_24h)}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wider">24H Low</p>
            <p className="text-xl font-mono text-white">{formatCurrency(btc?.low_24h)}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wider">24H Volume</p>
            <p className="text-xl font-mono text-white">{formatLargeNumber(btc?.volume_24h)}</p>
          </div>
          <div>
            <p className="text-text-muted text-xs uppercase tracking-wider">Dominance</p>
            <p className="text-xl font-mono text-white">{global?.btc_dominance?.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Fear & Greed Gauge */}
        <FearGreedGauge data={fearGreed} />

        {/* Long/Short Ratio */}
        <LongShortCard 
          longShortRatio={longShortRatio} 
          topTraderRatio={topTraderRatio} 
        />

        {/* Open Interest */}
        <OpenInterestCard 
          openInterest={openInterest} 
          oiHistory={oiHistory}
        />
      </div>

      {/* Funding Rates */}
      <FundingRatesCard fundingRates={fundingRates} />

      {/* Last Update */}
      <div className="text-center text-text-muted text-xs">
        Last updated: {lastUpdate?.toLocaleTimeString()} • Auto-refresh every 30s
      </div>
    </div>
  );
};

// Fear & Greed Gauge Component
const FearGreedGauge = ({ data }) => {
  if (!data) return null;

  const value = data.value;
  const classification = data.classification;
  
  // Calculate rotation angle (-90 to 90 degrees for half circle)
  const angle = (value / 100) * 180 - 90;
  
  // Get color based on value
  const getColor = (val) => {
    if (val <= 25) return '#EF4444'; // Extreme Fear - Red
    if (val <= 45) return '#F97316'; // Fear - Orange
    if (val <= 55) return '#EAB308'; // Neutral - Yellow
    if (val <= 75) return '#84CC16'; // Greed - Lime
    return '#22C55E'; // Extreme Greed - Green
  };

  const getLabel = (val) => {
    if (val <= 25) return 'EXTREME FEAR';
    if (val <= 45) return 'FEAR';
    if (val <= 55) return 'NEUTRAL';
    if (val <= 75) return 'GREED';
    return 'EXTREME GREED';
  };

  return (
    <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
      <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider mb-4">
        Market Sentiment
      </h3>
      
      {/* Gauge */}
      <div className="relative flex flex-col items-center">
        <svg viewBox="0 0 200 120" className="w-48 h-28">
          {/* Background arc */}
          <defs>
            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#EF4444" />
              <stop offset="25%" stopColor="#F97316" />
              <stop offset="50%" stopColor="#EAB308" />
              <stop offset="75%" stopColor="#84CC16" />
              <stop offset="100%" stopColor="#22C55E" />
            </linearGradient>
          </defs>
          
          {/* Gauge background */}
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          
          {/* Needle */}
          <g transform={`rotate(${angle}, 100, 100)`}>
            <line
              x1="100"
              y1="100"
              x2="100"
              y2="35"
              stroke={getColor(value)}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="100" cy="100" r="8" fill={getColor(value)} />
          </g>
        </svg>
        
        {/* Value */}
        <div className="text-center -mt-2">
          <p className="text-4xl font-display font-bold text-white">{value}</p>
          <p className={`text-sm font-semibold`} style={{ color: getColor(value) }}>
            {getLabel(value)}
          </p>
        </div>
      </div>

      {/* History */}
      <div className="mt-4 pt-4 border-t border-gold-primary/10 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Yesterday</span>
          <span className={data.yesterday > value ? 'text-positive' : data.yesterday < value ? 'text-negative' : 'text-white'}>
            {data.yesterday}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Last Week</span>
          <span className={data.last_week > value ? 'text-positive' : data.last_week < value ? 'text-negative' : 'text-white'}>
            {data.last_week}
          </span>
        </div>
      </div>
    </div>
  );
};

// Long/Short Ratio Card
const LongShortCard = ({ longShortRatio, topTraderRatio }) => {
  if (!longShortRatio) return null;

  const longPct = (longShortRatio.longAccount * 100).toFixed(0);
  const shortPct = (longShortRatio.shortAccount * 100).toFixed(0);

  return (
    <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider">
          Long/Short Ratio
        </h3>
        <span className="text-text-muted text-xs">Binance</span>
      </div>

      {/* Ratio Bar */}
      <div className="mb-4">
        <div className="h-4 rounded-full overflow-hidden flex">
          <div 
            className="bg-gradient-to-r from-green-500 to-green-400 transition-all"
            style={{ width: `${longPct}%` }}
          />
          <div 
            className="bg-gradient-to-r from-red-400 to-red-500 transition-all"
            style={{ width: `${shortPct}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-text-secondary">Long</span>
            <span className="text-green-400 font-semibold">{longPct}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-semibold">{shortPct}%</span>
            <span className="text-text-secondary">Short</span>
            <span className="w-2 h-2 rounded-full bg-red-500" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-3 pt-4 border-t border-gold-primary/10">
        <div className="flex justify-between">
          <span className="text-text-muted text-sm">Ratio</span>
          <span className="text-white font-mono">{longShortRatio.longShortRatio?.toFixed(2)}</span>
        </div>
        {topTraderRatio && (
          <div className="flex justify-between">
            <span className="text-text-muted text-sm">Top Traders</span>
            <span className={`font-mono ${topTraderRatio.longAccount > 0.5 ? 'text-green-400' : 'text-red-400'}`}>
              {(topTraderRatio.longAccount * 100).toFixed(0)}% Long
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// Open Interest Card with Chart
const OpenInterestCard = ({ openInterest, oiHistory }) => {
  if (!openInterest) return null;

  // Format OI history for chart
  const chartData = oiHistory?.slice(-12).map((item, index) => ({
    time: index,
    value: item.sumOpenInterestValue / 1e9 // Convert to billions
  })) || [];

  // Calculate change
  const firstValue = chartData[0]?.value || 0;
  const lastValue = chartData[chartData.length - 1]?.value || 0;
  const change = firstValue > 0 ? ((lastValue - firstValue) / firstValue * 100).toFixed(2) : 0;

  return (
    <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider">
          Open Interest
        </h3>
        <span className={`text-sm font-semibold ${parseFloat(change) >= 0 ? 'text-positive' : 'text-negative'}`}>
          {parseFloat(change) >= 0 ? '+' : ''}{change}%
        </span>
      </div>

      {/* Value */}
      <p className="text-3xl font-display font-bold text-white mb-4">
        ${(openInterest.openInterestUsd / 1e9).toFixed(2)}B
      </p>

      {/* Mini Chart */}
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-bg-primary border border-gold-primary/30 rounded px-2 py-1">
                      <p className="text-white text-xs">${payload[0].value.toFixed(2)}B</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="value" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={index === chartData.length - 1 ? '#d4a853' : '#8b6914'} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-text-muted text-xs text-center mt-2">Last 12 hours</p>
    </div>
  );
};

// Funding Rates Card
const FundingRatesCard = ({ fundingRates }) => {
  if (!fundingRates || fundingRates.length === 0) return null;

  // Calculate average
  const avgRate = fundingRates.reduce((sum, r) => sum + r.rate, 0) / fundingRates.length;

  return (
    <div className="glass-card rounded-xl p-5 border border-gold-primary/10">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gold-primary text-xs font-semibold uppercase tracking-wider">
          Funding Rates
        </h3>
        <span className="text-text-muted text-xs">8h</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {fundingRates.map((item) => (
          <div key={item.symbol} className="text-center p-3 bg-bg-card/50 rounded-lg">
            <p className="text-text-muted text-sm mb-1">{item.symbol}</p>
            <p className={`font-mono text-lg font-semibold ${
              item.rate >= 0 ? 'text-positive' : 'text-negative'
            }`}>
              {item.rate >= 0 ? '+' : ''}{(item.rate * 100).toFixed(4)}%
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gold-primary/10 flex justify-between items-center">
        <span className="text-text-muted text-sm">Avg:</span>
        <span className={`font-mono font-semibold ${avgRate >= 0 ? 'text-positive' : 'text-negative'}`}>
          {avgRate >= 0 ? '+' : ''}{(avgRate * 100).toFixed(4)}%
        </span>
      </div>
    </div>
  );
};

export default MarketDashboard;