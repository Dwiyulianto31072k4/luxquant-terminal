import { useState, useEffect } from 'react';
import TopPerformers from './TopPerformers';

const API_BASE = '/api/v1';

/**
 * OverviewPage - Main dashboard with comprehensive market data
 * RESPONSIVE: All grids adapt to mobile/tablet/desktop
 */
const OverviewPage = () => {
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState(null);
  const [trending, setTrending] = useState(null);
  const [derivPulse, setDerivPulse] = useState(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState(null);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 120000);
    return () => clearInterval(interval);
  }, []);

  const fetchAll = async () => {
    try {
      setMarketError(null);
      const [globalRes, catRes, trendRes, derivRes] = await Promise.allSettled([
        fetch(`${API_BASE}/market/global`),
        fetch(`${API_BASE}/market/categories?limit=10`),
        fetch(`${API_BASE}/market/trending-categories`),
        fetch(`${API_BASE}/market/derivatives-pulse`),
      ]);

      if (globalRes.status === 'fulfilled' && globalRes.value.ok) {
        const result = await globalRes.value.json();
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
          setMarketError('Failed to fetch market data');
        }
      } else {
        setMarketError('Failed to fetch market data');
      }

      if (catRes.status === 'fulfilled' && catRes.value.ok) setCategories(await catRes.value.json());
      if (trendRes.status === 'fulfilled' && trendRes.value.ok) setTrending(await trendRes.value.json());
      if (derivRes.status === 'fulfilled' && derivRes.value.ok) setDerivPulse(await derivRes.value.json());
    } catch (err) {
      console.error('Failed to fetch overview data:', err);
      setMarketError(err.message);
    } finally {
      setMarketLoading(false);
    }
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* ============ TOP PERFORMERS — ALWAYS RENDERS (from DB) ============ */}
      <TopPerformers />

      {/* ============ MARKET OVERVIEW ============ */}
      <div className="flex items-center gap-3">
        <div className="w-10 lg:w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
        <h2 className="font-display text-xl lg:text-3xl font-bold text-white">Market Overview</h2>
      </div>

      {marketLoading ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass-card rounded-xl p-4 lg:p-6 animate-pulse border border-gold-primary/10">
                <div className="h-3 lg:h-4 bg-gold-primary/20 rounded w-20 lg:w-24 mb-2 lg:mb-3"></div>
                <div className="h-6 lg:h-8 bg-gold-primary/20 rounded w-24 lg:w-32"></div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="glass-card rounded-xl p-4 lg:p-6 h-48 lg:h-64 animate-pulse border border-gold-primary/10"></div>
            ))}
          </div>
        </>
      ) : marketError ? (
        <div className="glass-card rounded-xl p-6 lg:p-8 border border-red-500/30 text-center">
          <p className="text-red-400 mb-3 lg:mb-4 text-sm">⚠️ {marketError}</p>
          <button
            onClick={() => { setMarketLoading(true); fetchAll(); }}
            className="px-4 py-2 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      ) : data ? (
        <>
          {/* Key Metrics - 2 cols mobile, 4 cols desktop */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            <MetricCard label="Total Market Cap" value={formatLargeNumber(data.totalMarketCap)} change={data.marketCapChange24h} icon="💰" />
            <MetricCard label="24h Volume" value={formatLargeNumber(data.totalVolume24h)} icon="📊" />
            <MetricCard label="BTC Dominance" value={`${data.btcDominance.toFixed(1)}%`} icon="👑" color="text-orange-400" />
            <MetricCard label="Active Cryptos" value={data.activeCryptos.toLocaleString()} icon="🪙" />
          </div>

          {/* Sector Performance */}
          {categories && categories.length > 0 && (
            <SectorPerformance categories={categories} trending={trending} />
          )}

          {/* Fear & Greed + Derivatives Pulse + Market Indicators */}
          {/* Stack on mobile, 3 cols on desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
            {/* Market Indicators */}
            <div className="glass-card rounded-xl p-4 lg:p-5 border border-gold-primary/10">
              <h3 className="text-gold-primary text-[10px] lg:text-xs font-semibold uppercase tracking-wider mb-3 lg:mb-5">Market Indicators</h3>
              <div className="space-y-3 lg:space-y-4">
                <IndicatorRow label="ETH Dominance" value={`${data.ethDominance?.toFixed(1)}%`} pct={data.ethDominance} color="bg-blue-500" />
                <IndicatorRow label="BTC Dominance" value={`${data.btcDominance?.toFixed(1)}%`} pct={data.btcDominance} color="bg-orange-500" />
                <IndicatorRow label="Stablecoin Dom" value={`${data.stablecoinDom?.toFixed(2)}%`} pct={data.stablecoinDom} max={20} color="bg-emerald-500" />
                <div className="pt-2 border-t border-gold-primary/10">
                  <div className="flex justify-between items-center">
                    <span className="text-text-muted text-xs lg:text-sm">Altcoin MCap</span>
                    <span className="text-white font-mono text-xs lg:text-sm">{formatLargeNumber(data.altcoinMarketCap)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-muted text-xs lg:text-sm">ETH/BTC</span>
                  <span className="text-white font-mono text-xs lg:text-sm">{data.ethBtcRatio?.toFixed(5)}</span>
                </div>
              </div>
            </div>

            {/* Fear & Greed */}
            <div className="glass-card rounded-xl p-4 lg:p-5 border border-gold-primary/10">
              <h3 className="text-gold-primary text-[10px] lg:text-xs font-semibold uppercase tracking-wider mb-3 lg:mb-4">Fear & Greed Index</h3>
              <div className="flex flex-col items-center">
                {/* Circular gauge - smaller on mobile */}
                <div className="relative w-24 h-24 lg:w-32 lg:h-32 mb-2 lg:mb-3">
                  <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="50" fill="none"
                      stroke={
                        data.fearGreed.value >= 75 ? '#22c55e' :
                        data.fearGreed.value >= 50 ? '#84cc16' :
                        data.fearGreed.value >= 25 ? '#f97316' : '#ef4444'
                      }
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={`${data.fearGreed.value * 3.14} 314`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl lg:text-3xl font-bold text-white">{data.fearGreed.value}</span>
                    <span className={`text-[10px] lg:text-xs font-semibold ${
                      data.fearGreed.value >= 75 ? 'text-green-400' :
                      data.fearGreed.value >= 50 ? 'text-lime-400' :
                      data.fearGreed.value >= 25 ? 'text-orange-400' : 'text-red-400'
                    }`}>{data.fearGreed.label}</span>
                  </div>
                </div>
                <div className="flex gap-4 lg:gap-6 mt-1">
                  <div className="text-center">
                    <p className="text-text-muted text-[10px] lg:text-xs">Yesterday</p>
                    <p className={`text-xs lg:text-sm font-mono font-semibold ${fgColor(data.fearGreed.yesterday)}`}>{data.fearGreed.yesterday}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-text-muted text-[10px] lg:text-xs">Last Week</p>
                    <p className={`text-xs lg:text-sm font-mono font-semibold ${fgColor(data.fearGreed.lastWeek)}`}>{data.fearGreed.lastWeek}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-text-muted text-[10px] lg:text-xs">Trend</p>
                    <p className={`text-xs lg:text-sm font-semibold ${data.fearGreed.value > data.fearGreed.lastWeek ?
                      'text-green-400' : data.fearGreed.value < data.fearGreed.lastWeek ? 'text-red-400' : 'text-text-muted'}`}>
                      {data.fearGreed.value > data.fearGreed.lastWeek ? '↑ Up' : data.fearGreed.value < data.fearGreed.lastWeek ? '↓ Down' : '→ Flat'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Derivatives Pulse */}
            {derivPulse ? (
              <DerivativesPulseCard data={derivPulse} />
            ) : (
              <div className="glass-card rounded-xl p-4 lg:p-5 border border-gold-primary/10">
                <h3 className="text-gold-primary text-[10px] lg:text-xs font-semibold uppercase tracking-wider mb-4">Derivatives Pulse</h3>
                <div className="flex items-center justify-center h-24 lg:h-32 text-text-muted text-sm">Loading derivatives data...</div>
              </div>
            )}
          </div>

          {/* Gainers & Losers - stack on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-4">
            <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
              <div className="px-4 lg:px-5 py-3 lg:py-4 border-b border-gold-primary/10 flex items-center gap-2">
                <span>📈</span>
                <h3 className="text-white font-semibold text-sm lg:text-base">Top Gainers (24h)</h3>
              </div>
              <div className="divide-y divide-gold-primary/5">
                {data.topGainers.map((coin, idx) => (
                  <CoinRow key={idx} coin={coin} />
                ))}
              </div>
            </div>

            <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
              <div className="px-4 lg:px-5 py-3 lg:py-4 border-b border-gold-primary/10 flex items-center gap-2">
                <span>📉</span>
                <h3 className="text-white font-semibold text-sm lg:text-base">Top Losers (24h)</h3>
              </div>
              <div className="divide-y divide-gold-primary/5">
                {data.topLosers.map((coin, idx) => (
                  <CoinRow key={idx} coin={coin} isLoser />
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};


// ================================================================
// SECTOR PERFORMANCE SECTION
// ================================================================

const SectorPerformance = ({ categories, trending }) => {
  const gainers = categories.filter(c => c.market_cap_change_24h > 0).slice(0, 5);
  const losers = categories.filter(c => c.market_cap_change_24h < 0)
    .sort((a, b) => a.market_cap_change_24h - b.market_cap_change_24h).slice(0, 5);

  return (
    <div className="glass-card rounded-xl border border-gold-primary/10 overflow-hidden">
      <div className="px-4 lg:px-5 py-3 lg:py-4 border-b border-gold-primary/10 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span>🔥</span>
          <h3 className="text-white font-semibold text-sm lg:text-base">Sector Performance</h3>
          <span className="text-text-muted text-[10px] lg:text-xs ml-1 lg:ml-2">24h Change</span>
        </div>
        {trending?.categories?.length > 0 && (
          <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
            <span className="text-text-muted text-[10px] lg:text-xs">Trending:</span>
            {trending.categories.slice(0, 3).map((cat, i) => (
              <a
                key={i}
                href={`https://www.coingecko.com/en/categories/${cat.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] lg:text-xs px-1.5 lg:px-2 py-0.5 rounded-full bg-gold-primary/10 text-gold-primary border border-gold-primary/20 hover:bg-gold-primary/20 hover:border-gold-primary/40 transition-all cursor-pointer"
              >
                {cat.name}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gold-primary/10">
        <div className="p-3 lg:p-4">
          <p className="text-green-400 text-[10px] lg:text-xs font-semibold uppercase tracking-wider mb-2 lg:mb-3 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
            Hot Narratives
          </p>
          <div className="space-y-0.5 lg:space-y-1">
            {gainers.length > 0 ? gainers.map((cat, idx) => (
              <SectorRow key={idx} cat={cat} rank={idx + 1} />
            )) : (
              <p className="text-text-muted text-sm py-2">No gaining sectors</p>
            )}
          </div>
        </div>

        <div className="p-3 lg:p-4">
          <p className="text-red-400 text-[10px] lg:text-xs font-semibold uppercase tracking-wider mb-2 lg:mb-3 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
            Cooling Down
          </p>
          <div className="space-y-0.5 lg:space-y-1">
            {losers.length > 0 ? losers.map((cat, idx) => (
              <SectorRow key={idx} cat={cat} rank={idx + 1} isNeg />
            )) : (
              <p className="text-text-muted text-sm py-2">No losing sectors</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


// ================================================================
// DERIVATIVES PULSE CARD
// ================================================================

const DerivativesPulseCard = ({ data }) => {
  const funding = data?.funding;
  const ls = data?.longShort;
  const oi = data?.openInterest;

  return (
    <div className="glass-card rounded-xl p-4 lg:p-5 border border-gold-primary/10">
      <h3 className="text-gold-primary text-[10px] lg:text-xs font-semibold uppercase tracking-wider mb-3 lg:mb-4">Derivatives Pulse</h3>

      {ls && (
        <div className="mb-3 lg:mb-4 space-y-2 lg:space-y-3">
          {Object.entries(ls).map(([sym, val]) => (
            <div key={sym}>
              <div className="flex items-center justify-between mb-1 lg:mb-1.5">
                <span className="text-white text-[10px] lg:text-xs font-semibold">{sym}</span>
                <div className="flex items-center gap-1.5 lg:gap-2 text-[10px] lg:text-xs">
                  <span className="flex items-center gap-0.5 lg:gap-1">
                    <span className="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full bg-green-500"></span>
                    <span className="text-green-400 font-mono">{val.long}%</span>
                  </span>
                  <span className="text-text-muted">/</span>
                  <span className="flex items-center gap-0.5 lg:gap-1">
                    <span className="w-1 h-1 lg:w-1.5 lg:h-1.5 rounded-full bg-red-500"></span>
                    <span className="text-red-400 font-mono">{val.short}%</span>
                  </span>
                </div>
              </div>
              <div className="flex h-2 lg:h-2.5 rounded-full overflow-hidden bg-dark-card/50 border border-white/5">
                <div className="bg-gradient-to-r from-green-600 to-green-400 transition-all duration-700 rounded-l-full" style={{ width: `${val.long}%` }} />
                <div className="bg-gradient-to-r from-red-400 to-red-600 transition-all duration-700 rounded-r-full" style={{ width: `${val.short}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {oi && (
        <div className="flex justify-between items-center py-2 lg:py-2.5 px-2.5 lg:px-3 rounded-lg bg-white/[0.02] border border-white/5 mb-2 lg:mb-3">
          <span className="text-text-muted text-[10px] lg:text-xs">Total Open Interest</span>
          <span className="text-white font-mono text-xs lg:text-sm font-semibold">{formatLargeNumber(oi.total_usd)}</span>
        </div>
      )}

      {funding && (
        <div className="pt-2">
          <p className="text-text-muted text-[10px] lg:text-xs mb-2 lg:mb-2.5 flex items-center justify-between">
            <span>Funding Rates</span>
            <span className={`font-mono ${funding.avg_rate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              avg {funding.avg_rate >= 0 ? '+' : ''}{funding.avg_rate}%
            </span>
          </p>
          <div className="grid grid-cols-2 gap-1.5 lg:gap-2">
            <div className="space-y-1">
              {(funding.most_long || []).slice(0, 3).map((f, i) => (
                <div key={`l${i}`} className="flex justify-between items-center text-[10px] lg:text-xs py-1 px-1.5 lg:px-2 rounded bg-green-500/5 border border-green-500/10">
                  <span className="text-white font-medium">{f.symbol}</span>
                  <span className="text-green-400 font-mono">+{f.rate_pct}%</span>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              {(funding.most_short || []).slice(0, 3).map((f, i) => (
                <div key={`s${i}`} className="flex justify-between items-center text-[10px] lg:text-xs py-1 px-1.5 lg:px-2 rounded bg-red-500/5 border border-red-500/10">
                  <span className="text-white font-medium">{f.symbol}</span>
                  <span className="text-red-400 font-mono">{f.rate_pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-text-muted text-[10px] mt-1.5 lg:mt-2 text-center opacity-60">{funding.total_symbols} pairs tracked</p>
        </div>
      )}
    </div>
  );
};


// ================================================================
// HELPER COMPONENTS
// ================================================================

const IndicatorRow = ({ label, value, pct, max = 100, color = 'bg-blue-500' }) => (
  <div>
    <div className="flex justify-between items-center mb-1 lg:mb-1.5">
      <span className="text-text-muted text-xs lg:text-sm">{label}</span>
      <span className="text-white font-mono text-xs lg:text-sm">{value}</span>
    </div>
    <div className="h-1 lg:h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
      <div
        className={`h-full rounded-full ${color} transition-all duration-700`}
        style={{ width: `${Math.min((pct / max) * 100, 100)}%` }}
      />
    </div>
  </div>
);

const fgColor = (val) => {
  if (val >= 75) return 'text-green-400';
  if (val >= 50) return 'text-lime-400';
  if (val >= 25) return 'text-orange-400';
  return 'text-red-400';
};

const MetricCard = ({ label, value, change, icon, color = 'text-white' }) => (
  <div className="glass-card rounded-xl p-3.5 lg:p-5 border border-gold-primary/10">
    <div className="flex items-center justify-between mb-1 lg:mb-2">
      <p className="text-text-muted text-[10px] lg:text-xs uppercase tracking-wider">{label}</p>
      <span className="text-sm lg:text-lg">{icon}</span>
    </div>
    <p className={`text-lg lg:text-2xl font-display font-bold ${color}`}>{value}</p>
    {change !== undefined && (
      <p className={`text-xs lg:text-sm font-semibold mt-0.5 lg:mt-1 ${change >= 0 ? 'text-positive' : 'text-negative'}`}>
        {change >= 0 ? '+' : ''}{change?.toFixed(2)}%
      </p>
    )}
  </div>
);

const InsightItem = ({ condition, positive, negative }) => {
  const text = condition ? positive : negative;
  if (!text) return null;
  return (
    <div className={`p-2.5 lg:p-3 rounded-lg ${condition ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
      <p className={`text-xs lg:text-sm ${condition ? 'text-green-400' : 'text-red-400'}`}>
        {condition ? '✓' : '⚠'} {text}
      </p>
    </div>
  );
};

const CoinRow = ({ coin, isLoser }) => (
  <div className="flex items-center justify-between px-3.5 lg:px-5 py-2.5 lg:py-3 hover:bg-gold-primary/5 transition-colors">
    <div className="flex items-center gap-2 lg:gap-3">
      <img
        src={coin.image}
        alt={coin.symbol}
        className="w-6 h-6 lg:w-8 lg:h-8 rounded-full"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      <div>
        <p className="text-white font-semibold text-xs lg:text-base">{coin.symbol.toUpperCase()}</p>
        <p className="text-text-muted text-[10px] lg:text-xs hidden sm:block">{coin.name}</p>
      </div>
    </div>
    <div className="text-right">
      <p className="text-white font-mono text-xs lg:text-base">${coin.current_price?.toLocaleString()}</p>
      <p className={`text-[10px] lg:text-sm font-semibold ${isLoser ? 'text-negative' : 'text-positive'}`}>
        {(coin.price_change_percentage_24h || 0) >= 0 ? '+' : ''}{(coin.price_change_percentage_24h || 0).toFixed(2)}%
      </p>
    </div>
  </div>
);

const SectorRow = ({ cat, rank, isNeg }) => {
  const change = cat.market_cap_change_24h || 0;
  const cgUrl = `https://www.coingecko.com/en/categories/${cat.id}`;
  return (
    <a
      href={cgUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between py-2 lg:py-2.5 px-2 lg:px-3 rounded-lg hover:bg-gold-primary/8 transition-all cursor-pointer group border border-transparent hover:border-gold-primary/15"
    >
      <div className="flex items-center gap-2 lg:gap-3 min-w-0 flex-1">
        <span className="text-text-muted text-[10px] lg:text-xs w-3 lg:w-4 text-right font-mono">{rank}</span>
        <div className="flex -space-x-1 lg:-space-x-1.5 flex-shrink-0">
          {(cat.top_3_coins || []).map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="w-4 h-4 lg:w-5 lg:h-5 rounded-full border border-dark-card bg-dark-card"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ))}
        </div>
        <span className="text-white text-xs lg:text-sm truncate group-hover:text-gold-primary transition-colors">{cat.name}</span>
      </div>
      <div className="flex items-center gap-2 lg:gap-3 flex-shrink-0">
        <span className="text-text-muted text-[10px] lg:text-xs hidden sm:inline">
          {formatLargeNumber(cat.market_cap)}
        </span>
        <span className={`text-xs lg:text-sm font-mono font-semibold min-w-[50px] lg:min-w-[60px] text-right ${
          isNeg ? 'text-red-400' : 'text-green-400'
        }`}>
          {change >= 0 ? '+' : ''}{change?.toFixed(2)}%
        </span>
      </div>
    </a>
  );
};

const formatLargeNumber = (num) => {
  if (!num) return '$0';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(0)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(0)}M`;
  return `$${num.toFixed(2)}`;
};

export default OverviewPage;