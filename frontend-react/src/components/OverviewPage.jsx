import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import TopPerformers from './TopPerformers';

const API_BASE = '/api/v1';

// ================================================================
// INLINE SVG ICONS (Lucide-style, no emoji)
// ================================================================

const IconWallet = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
  </svg>
);

const IconChart = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M3 3v18h18" />
    <path d="m7 14 4-4 4 4 5-5" />
  </svg>
);

const IconCrown = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7Z" />
    <path d="M2 20h20" />
  </svg>
);

const IconCoins = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="8" cy="8" r="6" />
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
    <path d="M7 6h1v4" />
    <path d="m16.71 13.88.7.71-2.82 2.82" />
  </svg>
);

const IconFlame = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

const IconArrowUp = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </svg>
);

const IconArrowDown = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </svg>
);

const IconActivity = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const IconPulse = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M3 12h4l3-9 4 18 3-9h4" />
  </svg>
);

const IconAlert = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

// ================================================================
// MAIN COMPONENT
// ================================================================

const OverviewPage = () => {
  const { t } = useTranslation();
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
        } else if (!data) {
          setMarketError('Failed to fetch market data');
        }
      } else if (!data) {
        setMarketError('Failed to fetch market data');
      }

      if (catRes.status === 'fulfilled' && catRes.value.ok) setCategories(await catRes.value.json());
      if (trendRes.status === 'fulfilled' && trendRes.value.ok) setTrending(await trendRes.value.json());
      if (derivRes.status === 'fulfilled' && derivRes.value.ok) setDerivPulse(await derivRes.value.json());
    } catch (err) {
      console.error('Failed to fetch overview data:', err);
      if (!data) setMarketError(err.message);
    } finally {
      setMarketLoading(false);
    }
  };

  return (
    <div className="space-y-5 lg:space-y-7">
      <TopPerformers />

      {/* PAGE TITLE — Flowscan style: line-label-line */}
      <div className="flex items-center gap-3">
        <span className="h-px w-8 bg-gold-primary/40" />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
          {t('overview.title')}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/40 via-white/[0.06] to-transparent" />
      </div>

      {marketLoading ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-[#0a0805] rounded-md border border-white/[0.06] p-4 lg:p-5 animate-pulse">
                <div className="h-2.5 bg-white/[0.06] rounded w-20 mb-3"></div>
                <div className="h-px bg-white/[0.06] mb-3"></div>
                <div className="h-7 bg-white/[0.06] rounded w-28"></div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-[#0a0805] rounded-md border border-white/[0.06] p-5 h-56 animate-pulse"></div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* ERROR BANNER */}
          {marketError && (
            <div className="bg-[#0a0805] rounded-md border border-loss/30 px-4 py-3 flex items-center justify-between relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-loss/40 to-transparent" />
              <p className="text-loss text-xs font-mono uppercase tracking-wider flex items-center gap-2">
                <IconAlert className="w-3.5 h-3.5" />
                {t('overview.error_api')}
              </p>
              <button
                onClick={() => { setMarketLoading(true); fetchAll(); }}
                className="px-3 py-1 bg-loss/10 text-loss border border-loss/20 hover:bg-loss/15 hover:border-loss/30 transition-all text-[10px] font-mono uppercase tracking-wider rounded"
              >
                {t('overview.retry')}
              </button>
            </div>
          )}

          {/* KEY METRICS */}
          {data && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label={t('overview.total_mcap')} value={formatLargeNumber(data.totalMarketCap)} change={data.marketCapChange24h} icon={<IconWallet />} />
              <MetricCard label={t('overview.vol_24h')} value={formatLargeNumber(data.totalVolume24h)} icon={<IconChart />} />
              <MetricCard label={t('overview.btc_dom')} value={`${data.btcDominance.toFixed(1)}%`} icon={<IconCrown />} />
              <MetricCard label={t('overview.active_crypto')} value={data.activeCryptos.toLocaleString()} icon={<IconCoins />} />
            </div>
          )}

          {/* SECTOR PERFORMANCE */}
          {categories && categories.length > 0 && (
            <SectorPerformance categories={categories} trending={trending} t={t} />
          )}

          {/* GRID 3 KOLOM: Indicators / Fear & Greed / Derivatives */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data && (
              <>
                {/* INDICATORS CARD */}
                <div className="bg-[#0a0805] rounded-md border border-white/[0.06] p-5 relative overflow-hidden hover:border-gold-primary/20 transition-colors">
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
                  <div className="flex items-center gap-2 mb-5">
                    <IconActivity className="w-3 h-3 text-gold-primary/70" />
                    <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
                      {t('overview.indicators')}
                    </h3>
                  </div>
                  <div className="space-y-4">
                    <IndicatorRow label={t('overview.eth_dom')} value={`${data.ethDominance?.toFixed(1)}%`} pct={data.ethDominance} opacity={0.85} />
                    <IndicatorRow label={t('overview.btc_dom')} value={`${data.btcDominance?.toFixed(1)}%`} pct={data.btcDominance} opacity={1.0} />
                    <IndicatorRow label={t('overview.stable_dom')} value={`${data.stablecoinDom?.toFixed(2)}%`} pct={data.stablecoinDom} max={20} opacity={0.55} />
                    <div className="pt-3 border-t border-white/[0.06] space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{t('overview.alt_mcap')}</span>
                        <span className="text-white font-mono text-sm tabular-nums">{formatLargeNumber(data.altcoinMarketCap)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{t('overview.eth_btc')}</span>
                        <span className="text-white font-mono text-sm tabular-nums">{data.ethBtcRatio?.toFixed(5)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* FEAR & GREED GAUGE */}
                <div className="bg-[#0a0805] rounded-md border border-white/[0.06] p-5 relative overflow-hidden hover:border-gold-primary/20 transition-colors">
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
                  <div className="flex items-center gap-2 mb-5">
                    <IconPulse className="w-3 h-3 text-gold-primary/70" />
                    <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
                      {t('overview.fg_index')}
                    </h3>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="relative w-28 h-28 lg:w-32 lg:h-32 mb-4">
                      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                        <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                        <circle
                          cx="60" cy="60" r="50" fill="none"
                          stroke={fgStroke(data.fearGreed.value)}
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={`${data.fearGreed.value * 3.14} 314`}
                          className="transition-all duration-1000"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="font-mono text-3xl lg:text-4xl font-light text-white tabular-nums">{data.fearGreed.value}</span>
                        <span className="font-mono text-[9px] uppercase tracking-[0.2em] mt-0.5" style={{ color: fgStroke(data.fearGreed.value) }}>
                          {data.fearGreed.label}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 w-full">
                      <FGStat label={t('overview.yesterday')} value={data.fearGreed.yesterday} />
                      <FGStat label={t('overview.last_week')} value={data.fearGreed.lastWeek} />
                      <div className="text-center">
                        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted mb-1.5">{t('overview.trend')}</p>
                        <p className="font-mono text-sm tabular-nums" style={{
                          color: data.fearGreed.value > data.fearGreed.lastWeek ? '#56c996'
                            : data.fearGreed.value < data.fearGreed.lastWeek ? '#e07288' : '#6b5c52'
                        }}>
                          {data.fearGreed.value > data.fearGreed.lastWeek ? `↑ ${t('overview.up')}` : data.fearGreed.value < data.fearGreed.lastWeek ? `↓ ${t('overview.down')}` : `— ${t('overview.flat')}`}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* DERIVATIVES PULSE */}
            {derivPulse ? (
              <DerivativesPulseCard data={derivPulse} t={t} />
            ) : (
              <div className="bg-[#0a0805] rounded-md border border-white/[0.06] p-5 flex items-center justify-center min-h-[200px] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/20 to-transparent" />
                <span className="text-text-muted font-mono text-xs uppercase tracking-wider">{t('overview.deriv_pending')}</span>
              </div>
            )}
          </div>

          {/* GAINERS & LOSERS */}
          {data && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CoinListCard
                title={t('overview.top_gainers_24h')}
                icon={<IconArrowUp className="w-3 h-3 text-gold-primary/70" />}
                coins={data.topGainers}
                isLoser={false}
              />
              <CoinListCard
                title={t('overview.top_losers_24h')}
                icon={<IconArrowDown className="w-3 h-3 text-gold-primary/70" />}
                coins={data.topLosers}
                isLoser={true}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ================================================================
// SECTOR PERFORMANCE
// ================================================================

const SectorPerformance = ({ categories, trending, t }) => {
  const gainers = categories.filter(c => c.market_cap_change_24h > 0).slice(0, 5);
  const losers = categories.filter(c => c.market_cap_change_24h < 0)
    .sort((a, b) => a.market_cap_change_24h - b.market_cap_change_24h).slice(0, 5);

  return (
    <div className="bg-[#0a0805] rounded-md border border-white/[0.06] overflow-hidden relative">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

      {/* HEADER */}
      <div className="px-5 py-4 border-b border-white/[0.06] bg-white/[0.015] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <IconFlame className="w-3.5 h-3.5 text-gold-primary/70" />
          <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">
            {t('overview.sector_perf')}
          </h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            · {t('overview.change_24h')}
          </span>
        </div>
        {trending?.categories?.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{t('overview.trending')}</span>
            {trending.categories.slice(0, 3).map((cat, i) => (
              <a
                key={i}
                href={`https://www.coingecko.com/en/categories/${cat.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] px-2 py-0.5 bg-gold-primary/10 text-gold-primary border border-gold-primary/20 hover:bg-gold-primary/15 hover:border-gold-primary/40 transition-all rounded-sm"
              >
                {cat.name}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
        {/* HOT */}
        <div className="p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-profit" />
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-profit">
              {t('overview.hot')}
            </p>
            <span className="h-px flex-1 bg-gradient-to-r from-profit/30 to-transparent" />
          </div>
          <div className="space-y-1">
            {gainers.length > 0 ? gainers.map((cat, idx) => (
              <SectorRow key={idx} cat={cat} rank={idx + 1} />
            )) : (
              <p className="text-text-muted font-mono text-xs uppercase tracking-wider py-2">{t('overview.no_gain_sec')}</p>
            )}
          </div>
        </div>

        {/* COOL */}
        <div className="p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-loss" />
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-loss">
              {t('overview.cool')}
            </p>
            <span className="h-px flex-1 bg-gradient-to-r from-loss/30 to-transparent" />
          </div>
          <div className="space-y-1">
            {losers.length > 0 ? losers.map((cat, idx) => (
              <SectorRow key={idx} cat={cat} rank={idx + 1} isNeg />
            )) : (
              <p className="text-text-muted font-mono text-xs uppercase tracking-wider py-2">{t('overview.no_lose_sec')}</p>
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

const DerivativesPulseCard = ({ data, t }) => {
  const funding = data?.funding;
  const ls = data?.longShort;
  const oi = data?.openInterest;

  return (
    <div className="bg-[#0a0805] rounded-md border border-white/[0.06] p-5 relative overflow-hidden hover:border-gold-primary/20 transition-colors">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

      <div className="flex items-center gap-2 mb-5">
        <IconPulse className="w-3 h-3 text-gold-primary/70" />
        <h3 className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
          {t('overview.deriv_pulse')}
        </h3>
      </div>

      {/* LONG/SHORT BARS */}
      {ls && (
        <div className="mb-4 space-y-3">
          {Object.entries(ls).map(([sym, val]) => (
            <div key={sym}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-xs text-white">{sym}</span>
                <div className="flex items-center gap-2 font-mono text-[10px] tabular-nums">
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-profit" />
                    <span className="text-profit">{val.long}%</span>
                  </span>
                  <span className="text-text-muted">/</span>
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-loss" />
                    <span className="text-loss">{val.short}%</span>
                  </span>
                </div>
              </div>
              <div className="flex h-1 overflow-hidden bg-white/[0.04]">
                <div className="bg-profit transition-all duration-700" style={{ width: `${val.long}%` }} />
                <div className="bg-loss transition-all duration-700" style={{ width: `${val.short}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* OPEN INTEREST */}
      {oi && (
        <div className="flex justify-between items-center py-2.5 px-3 bg-white/[0.02] border border-white/[0.06] mb-3 rounded-sm">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{t('overview.total_oi')}</span>
          <span className="text-white font-mono text-sm tabular-nums">{formatLargeNumber(oi.total_usd)}</span>
        </div>
      )}

      {/* FUNDING */}
      {funding && (
        <div className="pt-2 border-t border-white/[0.06]">
          <div className="flex items-center justify-between mb-2.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{t('overview.funding')}</span>
            <span className={`font-mono text-[10px] tabular-nums ${funding.avg_rate >= 0 ? 'text-profit' : 'text-loss'}`}>
              {t('overview.avg')} {funding.avg_rate >= 0 ? '+' : ''}{funding.avg_rate}%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="space-y-1">
              {(funding.most_long || []).slice(0, 3).map((f, i) => (
                <div key={`l${i}`} className="flex justify-between items-center text-[10px] py-1 px-1.5 bg-profit/[0.06] border border-profit/15 rounded-sm">
                  <span className="font-mono text-white">{f.symbol}</span>
                  <span className="font-mono text-profit tabular-nums">+{f.rate_pct}%</span>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              {(funding.most_short || []).slice(0, 3).map((f, i) => (
                <div key={`s${i}`} className="flex justify-between items-center text-[10px] py-1 px-1.5 bg-loss/[0.06] border border-loss/15 rounded-sm">
                  <span className="font-mono text-white">{f.symbol}</span>
                  <span className="font-mono text-loss tabular-nums">{f.rate_pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-text-muted font-mono text-[9px] uppercase tracking-wider mt-2.5 text-center opacity-50">
            {funding.total_symbols} {t('overview.pairs_tracked')}
          </p>
        </div>
      )}
    </div>
  );
};

// ================================================================
// COIN LIST CARD (Gainers / Losers)
// ================================================================

const CoinListCard = ({ title, icon, coins, isLoser }) => (
  <div className="bg-[#0a0805] rounded-md border border-white/[0.06] overflow-hidden relative hover:border-gold-primary/20 transition-colors">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.015] flex items-center gap-2.5">
      {icon}
      <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-white">{title}</h3>
    </div>
    <div className="divide-y divide-white/[0.04]">
      {coins.map((coin, idx) => (
        <CoinRow key={idx} coin={coin} isLoser={isLoser} />
      ))}
    </div>
  </div>
);

// ================================================================
// HELPER COMPONENTS
// ================================================================

/**
 * Indicator bar — uses gold opacity gradient instead of multi-color
 * opacity prop: 1.0 = full gold, 0.85 = light, 0.55 = mid, 0.4 = dark
 */
const IndicatorRow = ({ label, value, pct, max = 100, opacity = 1 }) => (
  <div>
    <div className="flex justify-between items-baseline mb-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</span>
      <span className="text-white font-mono text-sm tabular-nums">{value}</span>
    </div>
    <div className="h-1 bg-white/[0.04] overflow-hidden">
      <div
        className="h-full transition-all duration-700"
        style={{
          width: `${Math.min((pct / max) * 100, 100)}%`,
          backgroundColor: '#d4a853',
          opacity,
        }}
      />
    </div>
  </div>
);

const FGStat = ({ label, value }) => (
  <div className="text-center">
    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted mb-1.5">{label}</p>
    <p className="font-mono text-sm tabular-nums" style={{ color: fgStroke(value) }}>{value}</p>
  </div>
);

/**
 * Fear & Greed color scale — muted, not neon
 * Adopted from Flowscan profit/loss palette + amber for warning
 */
const fgStroke = (val) => {
  if (val >= 75) return '#56c996'; // profit (extreme greed)
  if (val >= 50) return '#d4a853'; // gold (greed/neutral high)
  if (val >= 25) return '#fbbf24'; // amber muted (fear)
  return '#e07288'; // loss (extreme fear)
};

/**
 * Metric Card — Flowscan stat card style
 * - flat bg-card-secondary
 * - hairline border + inset top highlight
 * - font-light large numbers (Flowscan signature)
 * - hover translate-y, no scale
 */
const MetricCard = ({ label, value, change, icon }) => (
  <div className="bg-[#0a0805] rounded-md border border-white/[0.06] p-4 lg:p-5 relative overflow-hidden hover:border-gold-primary/25 hover:-translate-y-0.5 transition-all duration-200 group">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="flex items-center justify-between mb-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">{label}</p>
      <span className="text-gold-primary/60 group-hover:text-gold-primary/80 transition-colors">{icon}</span>
    </div>
    <div className="h-px bg-white/[0.06] mb-3" />
    <p className="font-mono text-2xl lg:text-3xl font-light text-white tabular-nums leading-none">{value}</p>
    {change !== undefined && (
      <p className={`font-mono text-xs tabular-nums mt-2 ${change >= 0 ? 'text-profit' : 'text-loss'}`}>
        {change >= 0 ? '+' : ''}{change?.toFixed(2)}%
      </p>
    )}
  </div>
);

const CoinRow = ({ coin, isLoser }) => (
  <div className="flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors group">
    <div className="flex items-center gap-3">
      <img
        src={coin.image}
        alt={coin.symbol}
        className="w-7 h-7 rounded-full border border-white/[0.06]"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      <div>
        <p className="font-mono text-sm text-white group-hover:text-gold-primary transition-colors">{coin.symbol.toUpperCase()}</p>
        <p className="text-text-muted text-[10px] hidden sm:block truncate max-w-[140px]">{coin.name}</p>
      </div>
    </div>
    <div className="text-right">
      <p className="font-mono text-sm text-white tabular-nums">${coin.current_price?.toLocaleString()}</p>
      <p className={`font-mono text-[11px] tabular-nums ${isLoser ? 'text-loss' : 'text-profit'}`}>
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
      className="flex items-center justify-between py-2 px-2 hover:bg-white/[0.02] transition-all cursor-pointer group rounded-sm"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="font-mono text-[10px] text-text-muted w-4 text-right tabular-nums">{rank}</span>
        <div className="flex -space-x-1.5 flex-shrink-0">
          {(cat.top_3_coins || []).map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="w-4 h-4 rounded-full border border-[#0a0805] bg-[#0a0805]"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ))}
        </div>
        <span className="text-white text-sm truncate group-hover:text-gold-primary transition-colors">{cat.name}</span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="font-mono text-[10px] text-text-muted tabular-nums hidden sm:inline">
          {formatLargeNumber(cat.market_cap)}
        </span>
        <span className={`font-mono text-xs tabular-nums min-w-[56px] text-right ${
          isNeg ? 'text-loss' : 'text-profit'
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