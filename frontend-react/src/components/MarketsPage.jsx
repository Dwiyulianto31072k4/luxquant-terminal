import { useState, useEffect, useMemo, useRef } from 'react';

const API_BASE = '/api/v1';

// ════════════════════════════════════════════
// MARKETS PAGE — Comprehensive Crypto Dashboard
// ════════════════════════════════════════════

const MarketsPage = () => {
  const [global, setGlobal] = useState(null);
  const [heatmap, setHeatmap] = useState(null);
  const [trending, setTrending] = useState(null);
  const [categories, setCategories] = useState(null);
  const [derivatives, setDerivatives] = useState(null);
  const [liquidations, setLiquidations] = useState(null);
  const [defi, setDefi] = useState(null);
  const [stablecoins, setStablecoins] = useState(null);
  const [etfFlows, setEtfFlows] = useState(null);
  const [news, setNews] = useState(null);
  const [coins, setCoins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Coin table state
  const [coinTab, setCoinTab] = useState('all');
  const [coinPage, setCoinPage] = useState(1);
  const COINS_PER_PAGE = 25;

  // News pagination
  const [newsPage, setNewsPage] = useState(0);
  const NEWS_PER_PAGE = 8;

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 90000);
    return () => clearInterval(iv);
  }, []);

  const fetchAll = async () => {
    try {
      setError(null);
      const [globalR, heatR, trendR, catR, derivR, liqR, defiR, stableR, etfR, newsR, coinsR] = await Promise.allSettled([
        fetch(`${API_BASE}/market/global`),
        fetch(`${API_BASE}/market/heatmap`),
        fetch(`${API_BASE}/market/trending-categories`),
        fetch(`${API_BASE}/market/categories?limit=10`),
        fetch(`${API_BASE}/market/derivatives-pulse`),
        fetch(`${API_BASE}/market/liquidations`),
        fetch(`${API_BASE}/market/defi`),
        fetch(`${API_BASE}/market/stablecoins`),
        fetch(`${API_BASE}/market/etf-flows`),
        fetch(`${API_BASE}/market/crypto-news`),
        fetch(`${API_BASE}/market/coins?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h,7d`),
      ]);
      const j = async (r) => r.status === 'fulfilled' && r.value.ok ? r.value.json() : null;
      setGlobal(await j(globalR));
      setHeatmap(await j(heatR));
      setTrending(await j(trendR));
      setCategories(await j(catR));
      setDerivatives(await j(derivR));
      setLiquidations(await j(liqR));
      setDefi(await j(defiR));
      setStablecoins(await j(stableR));
      setEtfFlows(await j(etfR));
      setNews(await j(newsR));
      const c = await j(coinsR);
      if (c) setCoins(Array.isArray(c) ? c : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Filtered coins for table ──
  const filteredCoins = useMemo(() => {
    let list = [...coins];
    if (coinTab === 'gainers') list.sort((a, b) => (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0));
    else if (coinTab === 'losers') list.sort((a, b) => (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0));
    else if (coinTab === 'volume') list.sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0));
    return list;
  }, [coins, coinTab]);

  const paginatedCoins = useMemo(() => {
    const start = (coinPage - 1) * COINS_PER_PAGE;
    return filteredCoins.slice(start, start + COINS_PER_PAGE);
  }, [filteredCoins, coinPage]);

  const totalCoinPages = Math.ceil(filteredCoins.length / COINS_PER_PAGE);

  if (loading) return <LoadingSkeleton />;
  if (error && !global) return <ErrorState error={error} onRetry={() => { setLoading(true); fetchAll(); }} />;

  const gd = global?.global;
  const fg = global?.fearGreed;

  return (
    <div className="space-y-5">
      <Styles />

      {/* ═══ SECTION 1: GLOBAL MARKET BAR ═══ */}
      <div className="relative glass-card rounded-2xl p-5 border border-gold-primary/15 overflow-hidden fade-in">
        <div className="absolute inset-0 bg-gradient-to-r from-gold-primary/[0.03] via-transparent to-blue-500/[0.02]" />
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-gold-primary animate-pulse" />
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-gold-primary font-bold">Global Market Overview</h2>
            <div className="flex-1 h-[1px] bg-gradient-to-r from-gold-primary/20 to-transparent" />
            <span className="text-[9px] text-text-muted">Live</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <GlobalStat
              label="Total Market Cap"
              value={gd ? `$${fmtLarge(gd.total_market_cap?.usd)}` : '-'}
              change={gd?.market_cap_change_percentage_24h_usd}
            />
            <GlobalStat
              label="24h Volume"
              value={gd ? `$${fmtLarge(gd.total_volume?.usd)}` : '-'}
            />
            <GlobalStat
              label="BTC Dominance"
              value={gd ? `${gd.market_cap_percentage?.btc?.toFixed(1)}%` : '-'}
              accent="text-orange-400"
            />
            <GlobalStat
              label="ETH Dominance"
              value={gd ? `${gd.market_cap_percentage?.eth?.toFixed(1)}%` : '-'}
              accent="text-blue-400"
            />
            <GlobalStat
              label="Active Coins"
              value={gd ? fmtNum(gd.active_cryptocurrencies) : '-'}
            />
            <FearGreedMini value={fg?.value} label={fg?.label} />
          </div>
        </div>
      </div>

      {/* ═══ SECTION 2: HEATMAP ═══ */}
      <div className="glass-card rounded-2xl p-5 border border-gold-primary/10 fade-in fade-in-1">
        <SectionHeader title="Market Heatmap" subtitle="Top 50 by Market Cap" icon="🗺️" />
        {heatmap?.coins?.length > 0 ? (
          <HeatmapGrid coins={heatmap.coins} />
        ) : (
          <EmptyState text="Loading heatmap data..." />
        )}
      </div>

      {/* ═══ SECTION 3: TRENDING & CATEGORIES ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-5 border border-gold-primary/10 fade-in fade-in-2">
          <SectionHeader title="Trending Coins" subtitle="Most searched" icon="🔥" />
          {trending?.coins?.length > 0 ? (
            <div className="space-y-2 mt-3">
              {trending.coins.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/5 hover:border-gold-primary/15 transition-all group">
                  <span className="text-text-muted text-[10px] font-bold w-4">#{i + 1}</span>
                  {c.thumb && <img src={c.thumb} alt="" className="w-6 h-6 rounded-full" />}
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-xs font-semibold group-hover:text-gold-primary transition-colors">{c.name}</span>
                    <span className="text-text-muted text-[10px] ml-1.5">{c.symbol?.toUpperCase()}</span>
                  </div>
                  {c.market_cap_rank && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted">#{c.market_cap_rank}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="Loading trending..." />
          )}
        </div>

        <div className="glass-card rounded-2xl p-5 border border-gold-primary/10 fade-in fade-in-2">
          <SectionHeader title="Top Categories" subtitle="Sectors by performance" icon="📊" />
          {categories?.length > 0 ? (
            <div className="space-y-2 mt-3">
              {(Array.isArray(categories) ? categories : []).slice(0, 8).map((cat) => (
                <div key={cat.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                  <div className="flex gap-1">
                    {cat.top_3_coins?.map((img, j) => (
                      <img key={j} src={img} alt="" className="w-4 h-4 rounded-full" onError={(e) => e.target.style.display = 'none'} />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-xs font-semibold truncate block">{cat.name}</span>
                  </div>
                  <span className="text-text-muted text-[10px]">${fmtLarge(cat.market_cap)}</span>
                  <PctBadge value={cat.market_cap_change_24h} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="Loading categories..." />
          )}
        </div>
      </div>

      {/* ═══ CRYPTO NEWS ═══ */}
      <div className="glass-card rounded-2xl p-5 border border-gold-primary/10 fade-in fade-in-2">
        <SectionHeader title="Crypto News" subtitle="Latest headlines" icon="📰" />
        {news?.articles?.length > 0 ? (() => {
          const allArticles = news.articles;
          const featured = allArticles.slice(0, 2);
          const rest = allArticles.slice(2);
          const totalPages = Math.ceil(rest.length / NEWS_PER_PAGE);
          const pageArticles = rest.slice(newsPage * NEWS_PER_PAGE, (newsPage + 1) * NEWS_PER_PAGE);

          return (
            <div className="mt-3">
              {/* Featured */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {featured.map((a, i) => (
                  <a key={i} href={a.link} target="_blank" rel="noopener noreferrer"
                    className="group news-featured block rounded-xl bg-white/[0.02] border border-white/5 overflow-hidden hover:border-gold-primary/20 transition-all">
                    {a.image && (
                      <div className="h-36 overflow-hidden">
                        <img src={a.image} alt="" className="w-full h-full object-cover news-img" onError={(e) => e.target.parentElement.style.display = 'none'} />
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-white text-xs font-semibold leading-snug group-hover:text-gold-primary transition-colors line-clamp-2">{a.title}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-gold-primary/10 text-gold-primary font-bold">{a.source}</span>
                        <span className="text-text-muted text-[9px]">{a.time_ago}</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>

              {/* Compact list with thumbnails */}
              <div className="space-y-1">
                {pageArticles.map((a, i) => (
                  <a key={i} href={a.link} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/[0.02] transition-colors group">
                    {a.image ? (
                      <div className="w-14 h-10 rounded-md overflow-hidden flex-shrink-0 bg-white/5">
                        <img src={a.image} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.parentElement.style.display = 'none'; }} />
                      </div>
                    ) : (
                      <div className="w-14 h-10 rounded-md bg-white/[0.03] flex-shrink-0 flex items-center justify-center">
                        <span className="text-text-muted text-[10px]">📰</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-[11px] font-medium group-hover:text-gold-primary transition-colors truncate">{a.title}</p>
                      {a.description && <p className="text-text-muted text-[9px] truncate mt-0.5">{a.description.slice(0, 80)}</p>}
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-text-muted whitespace-nowrap">{a.source}</span>
                    <span className="text-text-muted text-[9px] whitespace-nowrap">{a.time_ago}</span>
                  </a>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-white/5">
                  <button onClick={() => setNewsPage(p => Math.max(0, p - 1))} disabled={newsPage === 0}
                    className="text-[10px] px-2.5 py-1 rounded-md bg-white/5 text-text-muted hover:text-white disabled:opacity-30 transition-colors">
                    ← Prev
                  </button>
                  <div className="flex gap-1">
                    {[...Array(totalPages)].map((_, i) => (
                      <button key={i} onClick={() => setNewsPage(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${i === newsPage ? 'bg-gold-primary w-3' : 'bg-white/20'}`} />
                    ))}
                  </div>
                  <button onClick={() => setNewsPage(p => Math.min(totalPages - 1, p + 1))} disabled={newsPage >= totalPages - 1}
                    className="text-[10px] px-2.5 py-1 rounded-md bg-white/5 text-text-muted hover:text-white disabled:opacity-30 transition-colors">
                    Next →
                  </button>
                </div>
              )}
            </div>
          );
        })() : (
          <EmptyState text="Loading crypto news..." />
        )}
      </div>

      {/* ═══ DERIVATIVES ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 4a: Funding + Long/Short */}
        <div className="glass-card rounded-2xl p-5 border border-gold-primary/10 fade-in fade-in-3">
          <SectionHeader title="Derivatives" subtitle="Funding & Sentiment" icon="⚡" />
          {derivatives ? (
            <div className="space-y-4 mt-3">
              {/* Funding Rates */}
              <div>
                <p className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-2">Funding Rates</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[8px] uppercase tracking-wider text-green-400/70 font-bold mb-1">Most Long</p>
                    {derivatives.funding?.most_long?.slice(0, 3).map(f => (
                      <div key={f.symbol} className="flex justify-between items-center py-1">
                        <span className="text-white text-[11px] font-medium">{f.symbol}</span>
                        <span className="text-green-400 text-[10px] font-mono font-bold">+{f.rate_pct?.toFixed(4)}%</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-[8px] uppercase tracking-wider text-red-400/70 font-bold mb-1">Most Short</p>
                    {derivatives.funding?.most_short?.slice(0, 3).map(f => (
                      <div key={f.symbol} className="flex justify-between items-center py-1">
                        <span className="text-white text-[11px] font-medium">{f.symbol}</span>
                        <span className="text-red-400 text-[10px] font-mono font-bold">{f.rate_pct?.toFixed(4)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-white/5 flex justify-between">
                  <span className="text-text-muted text-[9px]">Avg Rate: <span className="text-white font-mono">{derivatives.funding?.avg_rate?.toFixed(4)}%</span></span>
                  <span className="text-text-muted text-[9px]">{derivatives.funding?.total_symbols} pairs</span>
                </div>
              </div>

              {/* Long/Short Ratio */}
              <div>
                <p className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-2">Long/Short Ratio</p>
                {Object.entries(derivatives.longShort || {}).map(([sym, d]) => (
                  <div key={sym} className="mb-2">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-white font-semibold">{sym}</span>
                      <span className="text-text-muted">Ratio: {d.ratio?.toFixed(2)}</span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden bg-white/5">
                      <div className="bg-gradient-to-r from-green-500 to-green-400 transition-all" style={{ width: `${d.long}%` }} />
                      <div className="bg-gradient-to-r from-red-400 to-red-500 transition-all" style={{ width: `${d.short}%` }} />
                    </div>
                    <div className="flex justify-between text-[9px] mt-0.5">
                      <span className="text-green-400">Long {d.long}%</span>
                      <span className="text-red-400">Short {d.short}%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Open Interest */}
              <div>
                <p className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-2">Open Interest</p>
                <p className="text-white text-lg font-bold font-mono mb-2">${fmtLarge(derivatives.openInterest?.total_usd)}</p>
                <div className="space-y-1">
                  {derivatives.openInterest?.breakdown?.map(oi => {
                    const pct = derivatives.openInterest.total_usd > 0 ? (oi.oi_usd / derivatives.openInterest.total_usd) * 100 : 0;
                    return (
                      <div key={oi.symbol} className="flex items-center gap-2">
                        <span className="text-white text-[10px] font-medium w-10">{oi.symbol}</span>
                        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-gold-primary to-amber-400 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-text-muted text-[10px] font-mono w-16 text-right">${fmtLarge(oi.oi_usd)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState text="Loading derivatives..." />
          )}
        </div>

        {/* 4b: Liquidations */}
        <div className="glass-card rounded-2xl p-5 border border-gold-primary/10 fade-in fade-in-3">
          <SectionHeader title="Liquidations" subtitle="Recent forced closures" icon="💥" />
          {liquidations && (liquidations.summary?.count > 0 || liquidations.recent?.length > 0) ? (
            <div className="mt-3">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-white/[0.03] rounded-lg p-3 text-center border border-white/5">
                  <p className="text-[9px] uppercase tracking-wider text-text-muted font-bold">Total</p>
                  <p className="text-white text-sm font-bold font-mono mt-1">${fmtLarge(liquidations.summary?.total_usd)}</p>
                </div>
                <div className="bg-green-500/[0.05] rounded-lg p-3 text-center border border-green-500/10">
                  <p className="text-[9px] uppercase tracking-wider text-green-400/70 font-bold">Longs Liq.</p>
                  <p className="text-green-400 text-sm font-bold font-mono mt-1">${fmtLarge(liquidations.summary?.long_liquidated)}</p>
                </div>
                <div className="bg-red-500/[0.05] rounded-lg p-3 text-center border border-red-500/10">
                  <p className="text-[9px] uppercase tracking-wider text-red-400/70 font-bold">Shorts Liq.</p>
                  <p className="text-red-400 text-sm font-bold font-mono mt-1">${fmtLarge(liquidations.summary?.short_liquidated)}</p>
                </div>
              </div>

              {/* Liq/Short bar */}
              {liquidations.summary?.total_usd > 0 && (
                <div className="mb-4">
                  <div className="flex h-2.5 rounded-full overflow-hidden bg-white/5">
                    <div
                      className="bg-gradient-to-r from-green-500 to-green-400"
                      style={{ width: `${(liquidations.summary.long_liquidated / liquidations.summary.total_usd) * 100}%` }}
                    />
                    <div
                      className="bg-gradient-to-r from-red-400 to-red-500"
                      style={{ width: `${(liquidations.summary.short_liquidated / liquidations.summary.total_usd) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Recent list */}
              <p className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-2">Recent Orders</p>
              <div className="space-y-1 max-h-[320px] overflow-y-auto scrollbar-thin">
                {liquidations.recent?.slice(0, 15).map((liq, i) => {
                  const isLong = liq.side === 'SELL';
                  return (
                    <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.02]">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isLong ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {isLong ? 'LONG' : 'SHORT'}
                      </span>
                      <span className="text-white text-[11px] font-medium w-10">{liq.symbol}</span>
                      <span className="text-text-muted text-[10px] font-mono flex-1">${fmtNum(liq.usd)}</span>
                      <span className="text-text-muted text-[9px]">{timeAgo(liq.time)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            liquidations ? (
              <div className="mt-3 flex flex-col items-center justify-center py-12 text-center">
                <p className="text-text-muted text-[11px]">No recent liquidations captured</p>
                <p className="text-text-muted/60 text-[9px] mt-1">Data updates every 30 seconds from OKX Futures</p>
              </div>
            ) : (
              <EmptyState text="Loading liquidations..." />
            )
          )}
        </div>
      </div>

      {/* ═══ SECTION 5 & 6: DEFI + MACRO ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 5: DeFi */}
        <div className="glass-card rounded-2xl p-5 border border-gold-primary/10 fade-in fade-in-4">
          <SectionHeader title="DeFi Overview" subtitle="Total Value Locked" icon="🏦" />
          {defi ? (
            <div className="mt-3 space-y-4">
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold font-mono text-white">${fmtLarge(defi.totalTvl)}</p>
                <span className="text-text-muted text-[10px]">Total TVL</span>
              </div>

              {/* Top Chains */}
              <div>
                <p className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-2">Top Chains</p>
                <div className="space-y-1.5">
                  {defi.chains?.slice(0, 8).map((chain, i) => {
                    const pct = defi.totalTvl > 0 ? (chain.tvl / defi.totalTvl) * 100 : 0;
                    return (
                      <div key={chain.name} className="flex items-center gap-2">
                        <span className="text-[10px] text-text-muted w-3">{i + 1}</span>
                        <span className="text-white text-[11px] font-medium w-20 truncate">{chain.name}</span>
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full chain-bar transition-all" style={{ width: `${Math.max(pct, 1)}%`, '--chain-hue': `${(i * 40) + 30}` }} />
                        </div>
                        <span className="text-text-muted text-[10px] font-mono w-14 text-right">${fmtLarge(chain.tvl)}</span>
                        <span className="text-text-muted text-[9px] w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Protocols */}
              <div>
                <p className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-2">Top Protocols</p>
                <div className="grid grid-cols-2 gap-2">
                  {defi.protocols?.slice(0, 6).map(p => (
                    <div key={p.name} className="bg-white/[0.02] rounded-lg p-2.5 border border-white/5 flex items-center gap-2">
                      {p.logo && <img src={p.logo} alt="" className="w-5 h-5 rounded-full" onError={(e) => e.target.style.display = 'none'} />}
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-[10px] font-semibold truncate">{p.name}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-text-muted text-[9px] font-mono">${fmtLarge(p.tvl)}</span>
                          {p.change_1d != null && <PctBadge value={p.change_1d} small />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState text="Loading DeFi data..." />
          )}
        </div>

        {/* 6: Stablecoins + ETF */}
        <div className="glass-card rounded-2xl p-5 border border-gold-primary/10 fade-in fade-in-4">
          <SectionHeader title="Macro & Stablecoins" subtitle="Stablecoin supply & ETF flows" icon="🏛️" />
          <div className="mt-3 space-y-4">
            {/* Stablecoins */}
            {stablecoins ? (
              <div>
                <div className="flex items-baseline gap-2 mb-3">
                  <p className="text-xl font-bold font-mono text-white">${fmtLarge(stablecoins.totalMcap)}</p>
                  <span className="text-text-muted text-[10px]">Stablecoin MCap</span>
                </div>

                {/* Donut-like bars */}
                <div className="space-y-1.5">
                  {stablecoins.stablecoins?.slice(0, 6).map(s => {
                    const pct = stablecoins.totalMcap > 0 ? (s.mcap / stablecoins.totalMcap) * 100 : 0;
                    return (
                      <div key={s.symbol} className="flex items-center gap-2">
                        <span className="text-white text-[10px] font-bold w-12">{s.symbol}</span>
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-400 transition-all" style={{ width: `${Math.max(pct, 0.5)}%` }} />
                        </div>
                        <span className="text-text-muted text-[10px] font-mono w-14 text-right">${fmtLarge(s.mcap)}</span>
                        <span className="text-text-muted text-[9px] w-10 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyState text="Loading stablecoins..." />
            )}

            {/* ETF Flows */}
            <div className="pt-3 border-t border-white/5">
              <p className="text-[9px] uppercase tracking-widest text-text-muted font-bold mb-2">ETF Net Flows</p>
              {etfFlows && !etfFlows.error ? (
                <div className="grid grid-cols-2 gap-3">
                  <EtfCard label="Bitcoin ETF" data={etfFlows.btc} />
                  <EtfCard label="Ethereum ETF" data={etfFlows.eth} />
                </div>
              ) : (
                <div className="bg-white/[0.02] rounded-lg p-4 border border-white/5 text-center">
                  <p className="text-text-muted text-[10px]">
                    {etfFlows?.error === 'SoSoValue API key not configured'
                      ? '🔑 ETF data requires SoSoValue API key configuration'
                      : etfFlows?.error || 'ETF data loading...'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ COIN TABLE ═══ */}
      <div className="glass-card rounded-2xl p-5 border border-gold-primary/10 fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <SectionHeader title="All Coins" subtitle="Top 100 by Market Cap" icon="💎" />
          <div className="flex gap-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'gainers', label: '🟢 Gainers' },
              { key: 'losers', label: '🔴 Losers' },
              { key: 'volume', label: '📊 Volume' },
            ].map(t => (
              <button key={t.key} onClick={() => { setCoinTab(t.key); setCoinPage(1); }}
                className={`text-[10px] px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  coinTab === t.key
                    ? 'bg-gold-primary/20 text-gold-primary border border-gold-primary/30'
                    : 'bg-white/5 text-text-muted border border-transparent hover:text-white'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                {['#', 'Coin', 'Price', '1h %', '24h %', '7d %', 'Market Cap', 'Volume'].map(h => (
                  <th key={h} className="text-[9px] uppercase tracking-wider text-text-muted font-bold py-2.5 px-2 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedCoins.map((c, i) => (
                <tr key={c.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-2 text-text-muted text-[10px]">{(coinPage - 1) * COINS_PER_PAGE + i + 1}</td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2">
                      <img src={c.image} alt="" className="w-5 h-5 rounded-full" />
                      <span className="text-white text-[11px] font-semibold">{c.name}</span>
                      <span className="text-text-muted text-[9px]">{c.symbol?.toUpperCase()}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-white text-[11px] font-mono font-semibold">${fmtPrice(c.current_price)}</td>
                  <td className="py-2.5 px-2"><PctText value={c.price_change_percentage_1h_in_currency} /></td>
                  <td className="py-2.5 px-2"><PctText value={c.price_change_percentage_24h} /></td>
                  <td className="py-2.5 px-2"><PctText value={c.price_change_percentage_7d_in_currency} /></td>
                  <td className="py-2.5 px-2 text-text-muted text-[10px] font-mono">${fmtLarge(c.market_cap)}</td>
                  <td className="py-2.5 px-2 text-text-muted text-[10px] font-mono">${fmtLarge(c.total_volume)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        {totalCoinPages > 1 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
            <span className="text-text-muted text-[10px]">
              Showing {(coinPage - 1) * COINS_PER_PAGE + 1}–{Math.min(coinPage * COINS_PER_PAGE, filteredCoins.length)} of {filteredCoins.length}
            </span>
            <div className="flex gap-1">
              <button onClick={() => setCoinPage(p => Math.max(1, p - 1))} disabled={coinPage === 1}
                className="text-[10px] px-2.5 py-1 rounded-md bg-white/5 text-text-muted hover:text-white disabled:opacity-30 transition-colors">←</button>
              {[...Array(totalCoinPages)].map((_, i) => (
                <button key={i} onClick={() => setCoinPage(i + 1)}
                  className={`text-[10px] px-2.5 py-1 rounded-md transition-all ${coinPage === i + 1 ? 'bg-gold-primary/20 text-gold-primary' : 'bg-white/5 text-text-muted hover:text-white'}`}>
                  {i + 1}
                </button>
              ))}
              <button onClick={() => setCoinPage(p => Math.min(totalCoinPages, p + 1))} disabled={coinPage === totalCoinPages}
                className="text-[10px] px-2.5 py-1 rounded-md bg-white/5 text-text-muted hover:text-white disabled:opacity-30 transition-colors">→</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


// ════════════════════════════════════════════
// SUB-COMPONENTS
// ════════════════════════════════════════════

const SectionHeader = ({ title, subtitle, icon }) => (
  <div className="flex items-center gap-2">
    <span className="text-sm">{icon}</span>
    <h3 className="text-white text-sm font-bold tracking-tight">{title}</h3>
    {subtitle && <span className="text-text-muted text-[10px]">· {subtitle}</span>}
  </div>
);

const GlobalStat = ({ label, value, change, accent }) => (
  <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
    <p className="text-text-muted text-[8px] uppercase tracking-[0.15em] font-bold">{label}</p>
    <p className={`text-sm font-bold font-mono mt-1 ${accent || 'text-white'}`}>{value}</p>
    {change != null && (
      <span className={`text-[9px] font-bold ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
      </span>
    )}
  </div>
);

const FearGreedMini = ({ value, label }) => {
  const v = value || 50;
  const color = v <= 25 ? 'text-red-400' : v <= 45 ? 'text-orange-400' : v <= 55 ? 'text-yellow-400' : v <= 75 ? 'text-lime-400' : 'text-green-400';
  const ring = v <= 25 ? 'fear-ring-red' : v <= 45 ? 'fear-ring-orange' : v <= 55 ? 'fear-ring-yellow' : v <= 75 ? 'fear-ring-lime' : 'fear-ring-green';
  return (
    <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
      <p className="text-text-muted text-[8px] uppercase tracking-[0.15em] font-bold">Fear & Greed</p>
      <div className="flex items-center gap-2 mt-1">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${ring}`}>
          <span className={`text-sm font-bold font-mono ${color}`}>{v}</span>
        </div>
        <span className={`text-[10px] font-semibold ${color}`}>{label || 'Neutral'}</span>
      </div>
    </div>
  );
};

const PctBadge = ({ value, small }) => {
  if (value == null) return null;
  const pos = value >= 0;
  return (
    <span className={`font-bold rounded px-1.5 py-0.5 border ${small ? 'text-[8px]' : 'text-[9px]'} ${
      pos ? 'bg-green-500/10 text-green-400 border-green-500/15' : 'bg-red-500/10 text-red-400 border-red-500/15'
    }`}>
      {pos ? '+' : ''}{value?.toFixed(2)}%
    </span>
  );
};

const PctText = ({ value }) => {
  if (value == null) return <span className="text-text-muted text-[10px]">-</span>;
  const pos = value >= 0;
  return (
    <span className={`text-[10px] font-mono font-bold ${pos ? 'text-green-400' : 'text-red-400'}`}>
      {pos ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
};

const EtfCard = ({ label, data }) => {
  if (!data || !data.records?.length) return (
    <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
      <p className="text-text-muted text-[9px] font-bold">{label}</p>
      <p className="text-text-muted text-[10px] mt-2">No data</p>
    </div>
  );
  const latest = data.records[0];
  const flow = latest?.netFlow;
  const pos = flow >= 0;
  return (
    <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
      <p className="text-text-muted text-[9px] font-bold uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold font-mono mt-1 ${pos ? 'text-green-400' : 'text-red-400'}`}>
        {pos ? '+' : ''}{flow != null ? `$${fmtLarge(Math.abs(flow))}` : '-'}
      </p>
      <p className="text-text-muted text-[9px] mt-0.5">{latest?.date || ''}</p>
      {latest?.totalAum && <p className="text-text-muted text-[9px]">AUM: ${fmtLarge(latest.totalAum)}</p>}
    </div>
  );
};


// ════════════════════════════════════════════
// HEATMAP COMPONENT — TradingView-style Treemap
// ════════════════════════════════════════════

const HeatmapGrid = ({ coins }) => {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setDims({ w: rect.width, h: Math.max(rect.width * 0.45, 300) });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Squarified treemap layout
  const rects = useMemo(() => {
    if (!dims.w || !dims.h || !coins.length) return [];
    const sorted = [...coins].sort((a, b) => (b.mcap || 0) - (a.mcap || 0));
    const totalArea = dims.w * dims.h;
    const totalMcap = sorted.reduce((s, c) => s + (c.mcap || 0), 0);
    if (totalMcap === 0) return [];

    // Assign area proportional to mcap
    const items = sorted.map(c => ({
      ...c,
      area: ((c.mcap || 0) / totalMcap) * totalArea,
    }));

    return squarify(items, { x: 0, y: 0, w: dims.w, h: dims.h });
  }, [coins, dims]);

  // Color based on 24h change
  const getColor = (pct) => {
    const abs = Math.abs(pct || 0);
    const t = Math.min(abs / 8, 1); // normalize to 0-1 over ±8%
    if (pct >= 0) {
      // green spectrum: dark green to bright green
      const r = Math.round(20 - t * 10);
      const g = Math.round(60 + t * 120);
      const b = Math.round(30 - t * 10);
      return `rgb(${r},${g},${b})`;
    } else {
      // red spectrum: dark red to bright red
      const r = Math.round(80 + t * 140);
      const g = Math.round(30 - t * 15);
      const b = Math.round(30 - t * 10);
      return `rgb(${r},${g},${b})`;
    }
  };

  const getBorderColor = (pct) => {
    const abs = Math.abs(pct || 0);
    const t = Math.min(abs / 8, 1);
    if (pct >= 0) return `rgba(34,197,94,${0.15 + t * 0.2})`;
    return `rgba(239,68,68,${0.15 + t * 0.2})`;
  };

  return (
    <div
      ref={containerRef}
      className="relative mt-3 rounded-lg overflow-hidden"
      style={{ height: dims.h || 300 }}
    >
      {rects.map((r) => {
        const pct = r.change_24h || 0;
        const isLarge = r.w > 70 && r.h > 55;
        const isMedium = r.w > 45 && r.h > 38;
        const textColor = pct >= 0 ? '#4ade80' : '#f87171';
        return (
          <div
            key={r.id}
            className="absolute flex flex-col items-center justify-center cursor-default group heatmap-cell"
            style={{
              left: r.x,
              top: r.y,
              width: r.w - 1.5,
              height: r.h - 1.5,
              backgroundColor: getColor(pct),
              borderRadius: '3px',
              border: `1px solid ${getBorderColor(pct)}`,
            }}
            title={`${r.name}: $${fmtPrice(r.price)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`}
          >
            {/* Coin logo for large cells */}
            {isLarge && r.image && (
              <img src={r.image} alt="" className="w-6 h-6 rounded-full mb-1 opacity-90 group-hover:opacity-100" />
            )}
            {isMedium && (
              <>
                <span className="text-white font-bold leading-none drop-shadow-sm" style={{ fontSize: isLarge ? '12px' : '9px' }}>
                  {r.symbol}
                </span>
                <span className="font-bold font-mono leading-none mt-0.5 drop-shadow-sm" style={{ fontSize: isLarge ? '11px' : '8px', color: textColor }}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                </span>
              </>
            )}
            {!isMedium && r.w > 25 && r.h > 18 && (
              <span className="text-white/80 font-bold leading-none" style={{ fontSize: '7px' }}>
                {r.symbol}
              </span>
            )}

            {/* Hover tooltip */}
            <div className="heatmap-tooltip opacity-0 group-hover:opacity-100 pointer-events-none absolute z-50 -top-16 left-1/2 -translate-x-1/2 bg-[#1a1a2e] border border-gold-primary/30 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
              <div className="flex items-center gap-2">
                {r.image && <img src={r.image} alt="" className="w-4 h-4 rounded-full" />}
                <span className="text-white text-[11px] font-bold">{r.name}</span>
                <span className="text-text-muted text-[9px]">{r.symbol}</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-white text-[10px] font-mono">${fmtPrice(r.price)}</span>
                <span className="font-mono font-bold text-[10px]" style={{ color: textColor }}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                </span>
                <span className="text-text-muted text-[9px]">MCap: ${fmtLarge(r.mcap)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};


// ── Squarified Treemap Algorithm ──
function squarify(items, rect) {
  if (!items.length) return [];
  if (items.length === 1) {
    return [{ ...items[0], x: rect.x, y: rect.y, w: rect.w, h: rect.h }];
  }

  const results = [];
  let remaining = [...items];

  while (remaining.length > 0) {
    const isWide = rect.w >= rect.h;
    const side = isWide ? rect.h : rect.w;
    const totalArea = remaining.reduce((s, it) => s + it.area, 0);

    // Find optimal row
    let row = [remaining[0]];
    let rowArea = remaining[0].area;

    for (let i = 1; i < remaining.length; i++) {
      const newRow = [...row, remaining[i]];
      const newArea = rowArea + remaining[i].area;
      if (worstRatio(newRow, side, newArea) <= worstRatio(row, side, rowArea)) {
        row = newRow;
        rowArea = newArea;
      } else {
        break;
      }
    }

    // Layout this row
    const rowFraction = rowArea / totalArea;
    const rowSize = isWide ? rect.w * rowFraction : rect.h * rowFraction;

    let offset = 0;
    for (const item of row) {
      const itemFraction = item.area / rowArea;
      const itemSize = side * itemFraction;

      if (isWide) {
        results.push({
          ...item,
          x: rect.x,
          y: rect.y + offset,
          w: rowSize,
          h: itemSize,
        });
      } else {
        results.push({
          ...item,
          x: rect.x + offset,
          y: rect.y,
          w: itemSize,
          h: rowSize,
        });
      }
      offset += itemSize;
    }

    // Update rect for remaining items
    remaining = remaining.slice(row.length);
    if (isWide) {
      rect = { x: rect.x + rowSize, y: rect.y, w: rect.w - rowSize, h: rect.h };
    } else {
      rect = { x: rect.x, y: rect.y + rowSize, w: rect.w, h: rect.h - rowSize };
    }
  }

  return results;
}

function worstRatio(row, side, totalArea) {
  const rowLen = totalArea / side;
  let worst = 0;
  for (const item of row) {
    const itemSize = (item.area / totalArea) * side;
    const ratio = Math.max(rowLen / itemSize, itemSize / rowLen);
    worst = Math.max(worst, ratio);
  }
  return worst;
}


// ════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════

const Styles = () => (
  <style>{`
    @keyframes pulseGlow{0%,100%{opacity:.4}50%{opacity:.8}}
    @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    .fade-in{animation:fadeInUp .5s ease-out forwards;opacity:0}
    .fade-in-1{animation-delay:.1s}.fade-in-2{animation-delay:.15s}
    .fade-in-3{animation-delay:.2s}.fade-in-4{animation-delay:.25s}
    .card-hover{transition:all .3s cubic-bezier(.4,0,.2,1)}
    .card-hover:hover{transform:translateY(-2px);border-color:rgba(212,175,55,.25);box-shadow:0 8px 32px rgba(0,0,0,.3),0 0 0 1px rgba(212,175,55,.1)}
    .chain-bar{background:linear-gradient(90deg,hsl(calc(var(--chain-hue)),70%,55%),hsl(calc(var(--chain-hue) + 20),60%,45%))}
    .fear-ring-red{box-shadow:0 0 12px rgba(239,68,68,.25),inset 0 0 8px rgba(239,68,68,.1)}
    .fear-ring-orange{box-shadow:0 0 12px rgba(249,115,22,.25),inset 0 0 8px rgba(249,115,22,.1)}
    .fear-ring-yellow{box-shadow:0 0 12px rgba(234,179,8,.25),inset 0 0 8px rgba(234,179,8,.1)}
    .fear-ring-lime{box-shadow:0 0 12px rgba(132,204,22,.25),inset 0 0 8px rgba(132,204,22,.1)}
    .fear-ring-green{box-shadow:0 0 12px rgba(34,197,94,.25),inset 0 0 8px rgba(34,197,94,.1)}
    .news-featured:hover .news-img{transform:scale(1.05)}
    .news-img{transition:transform .5s cubic-bezier(.4,0,.2,1)}
    .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .scrollbar-thin::-webkit-scrollbar{width:4px}
    .scrollbar-thin::-webkit-scrollbar-track{background:transparent}
    .scrollbar-thin::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}
    .scrollbar-thin::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.2)}
    .heatmap-cell{transition:filter .2s,transform .15s}
    .heatmap-cell:hover{filter:brightness(1.25);z-index:20;transform:scale(1.01)}
    .heatmap-tooltip{transition:opacity .15s ease-out}
  `}</style>
);


// ════════════════════════════════════════════
// SKELETON & ERROR
// ════════════════════════════════════════════

const EmptyState = ({ text }) => (
  <div className="flex items-center justify-center py-8">
    <div className="flex items-center gap-2 text-text-muted text-xs">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {text}
    </div>
  </div>
);

const ErrorState = ({ error, onRetry }) => (
  <div className="space-y-6">
    <div className="flex items-center gap-3">
      <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
      <h2 className="font-display text-2xl font-semibold text-white">Markets</h2>
    </div>
    <div className="glass-card rounded-xl p-8 border border-red-500/30 text-center">
      <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center">
        <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <p className="text-red-400 mb-4 text-sm">{error}</p>
      <button onClick={onRetry} className="px-5 py-2 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors text-sm font-semibold border border-gold-primary/20">Retry</button>
    </div>
  </div>
);

const LoadingSkeleton = () => (
  <div className="space-y-5">
    <style>{`@keyframes sp{0%,100%{opacity:.05}50%{opacity:.15}}.skel{animation:sp 2s ease-in-out infinite;background:rgba(212,175,55,.1);border-radius:8px}`}</style>
    {/* Global bar */}
    <div className="glass-card rounded-2xl p-5 border border-gold-primary/10">
      <div className="skel w-40 h-3 mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => <div key={i} className="bg-white/[0.02] rounded-lg p-3 border border-white/5"><div className="skel w-16 h-2.5 mb-2" /><div className="skel w-20 h-4" /></div>)}
      </div>
    </div>
    {/* Heatmap */}
    <div className="glass-card rounded-2xl p-5 h-48 border border-gold-primary/10">
      <div className="skel w-32 h-3 mb-3" />
      <div className="flex flex-wrap gap-1">{[...Array(20)].map((_, i) => <div key={i} className="skel" style={{ width: `${Math.random() * 60 + 30}px`, height: '36px' }} />)}</div>
    </div>
    {/* 2 cols */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[...Array(2)].map((_, i) => <div key={i} className="glass-card rounded-2xl p-5 h-64 border border-gold-primary/10"><div className="skel w-28 h-3 mb-3" />{[...Array(5)].map((_, j) => <div key={j} className="skel w-full h-6 mb-2" />)}</div>)}
    </div>
    {/* 2 cols */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[...Array(2)].map((_, i) => <div key={i} className="glass-card rounded-2xl p-5 h-80 border border-gold-primary/10"><div className="skel w-24 h-3 mb-3" />{[...Array(6)].map((_, j) => <div key={j} className="skel w-full h-5 mb-2" />)}</div>)}
    </div>
    {/* Table */}
    <div className="glass-card rounded-2xl p-5 border border-gold-primary/10">
      <div className="skel w-20 h-3 mb-4" />
      {[...Array(8)].map((_, i) => <div key={i} className="skel w-full h-8 mb-1.5" />)}
    </div>
  </div>
);


// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════

function fmtNum(n) {
  if (n == null) return '0';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtLarge(n) {
  if (!n) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number(n).toLocaleString();
}

function fmtPrice(n) {
  if (!n) return '0';
  if (n >= 1) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function timeAgo(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default MarketsPage;