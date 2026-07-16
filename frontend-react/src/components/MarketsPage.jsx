import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import NewsPreviewModal from "./NewsPreviewModal";
import AssistantWidget from "./assistant/AssistantWidget";

const API_BASE = '/api/v1';

/* ──────────────────────────────────────────────────────────────
   MarketsPage — Web3 Flowscan-minimal reskin
   • Gold accent retained (LuxQuant brand)
   • profit (#56c996) / loss (#e07288) muted functional only
   • Flat hairline cards, sharp rounded-md, font-mono font-light numbers
   • Line-label-line section headers + SVG icons (no decorative emoji)
   • Heatmap colors transitioned to muted profit/loss palette
   ────────────────────────────────────────────────────────────── */

const MarketsPage = () => {
  const { t } = useTranslation();

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

  const [coinTab, setCoinTab] = useState('all');
  const [coinPage, setCoinPage] = useState(1);
  const COINS_PER_PAGE = 25;

  const [newsPage, setNewsPage] = useState(0);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const NEWS_PER_PAGE = 8;

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 90000);
    return () => clearInterval(iv);
  }, []);

  const fetchAll = async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/market/markets-page`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();

      setGlobal(d.global || null);
      setHeatmap(d.heatmap || null);
      setTrending(d.trending || null);
      setCategories(d.categories ? (Array.isArray(d.categories) ? d.categories.slice(0, 10) : d.categories) : null);
      setDerivatives(d.derivativesPulse || null);
      setLiquidations(d.liquidations || null);
      setDefi(d.defi || null);
      setStablecoins(d.stablecoins || null);
      setEtfFlows(d.etfFlows || null);
      setNews(d.cryptoNews || null);
      if (d.coins) setCoins(Array.isArray(d.coins) ? d.coins : []);
    } catch (err) {
      console.error('Markets fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const translateTimeAgo = (timeStr) => {
    if (!timeStr) return '';
    let res = timeStr.toLowerCase();
    res = res.replace('h ago', ` ${t('markets.h_ago')}`);
    res = res.replace('m ago', ` ${t('markets.m_ago')}`);
    res = res.replace('d ago', ` ${t('markets.d_ago')}`);
    return res;
  };

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
  if (error && !global) return <ErrorState error={error} onRetry={() => { setLoading(true); fetchAll(); }} t={t} />;

  const gd = global?.global;
  const fg = global?.fearGreed;

  return (
    <div className="space-y-5">
      <Styles />

      {/* ── PAGE TITLE — line-label-line ── */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
          {t('markets.global_overview')}
        </span>
        <span className="h-px flex-1 bg-white/[0.06]" />
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted/70">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-profit opacity-50" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-profit" />
          </span>
          {t('markets.live')}
        </span>
      </div>

      {/* ── GLOBAL MARKET BAR ── */}
      <div className="relative bg-surface-raised rounded-md border border-white/[0.06] overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
        <div className="relative p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <GlobalStat
              label={t('markets.total_mcap')}
              value={gd ? `$${fmtLarge(gd.total_market_cap?.usd)}` : '-'}
              change={gd?.market_cap_change_percentage_24h_usd}
            />
            <GlobalStat
              label={t('markets.vol_24h')}
              value={gd ? `$${fmtLarge(gd.total_volume?.usd)}` : '-'}
            />
            <GlobalStat
              label={t('markets.btc_dom')}
              value={gd ? `${gd.market_cap_percentage?.btc?.toFixed(1)}%` : '-'}
              accent="text-gold-primary"
            />
            <GlobalStat
              label={t('markets.eth_dom')}
              value={gd ? `${gd.market_cap_percentage?.eth?.toFixed(1)}%` : '-'}
            />
            <GlobalStat
              label={t('markets.active_coins')}
              value={gd ? fmtNum(gd.active_cryptocurrencies) : '-'}
            />
            <FearGreedMini value={fg?.value} label={fg?.label} t={t} />
          </div>
        </div>
      </div>

      {/* ── HEATMAP ── */}
      <div className="bg-surface-raised rounded-md border border-white/[0.06] p-5 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <SectionHeader
          title={t('markets.heatmap')}
          subtitle={t('markets.top_50_mcap')}
          icon="heatmap"
        />
        {heatmap?.coins?.length > 0 ? (
          <HeatmapGrid coins={heatmap.coins} />
        ) : (
          <EmptyState text={t('markets.loading_heatmap')} />
        )}
      </div>

      {/* ── TRENDING & CATEGORIES ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-surface-raised rounded-md border border-white/[0.06] p-5 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <SectionHeader
            title={t('markets.trending')}
            subtitle={t('markets.most_searched')}
            icon="trending"
          />
          {trending?.coins?.length > 0 ? (
            <div className="space-y-1.5 mt-4">
              {trending.coins.map((c, i) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-2.5 rounded-sm bg-surface-secondary border border-white/[0.04] hover:border-line/20 hover:bg-white/[0.02] transition-all group"
                >
                  <span className="font-mono text-[10px] text-text-muted/70 tabular-nums w-5">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {c.thumb && <img src={c.thumb} alt="" className="w-6 h-6 rounded-full" />}
                  <div className="flex-1 min-w-0">
                    <span className="text-text-primary text-[12px] group-hover:text-gold-primary transition-colors">
                      {c.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 ml-2">
                      {c.symbol?.toUpperCase()}
                    </span>
                  </div>
                  {c.market_cap_rank && (
                    <span className="font-mono text-[10px] tabular-nums px-1.5 py-0.5 rounded-sm bg-white/[0.04] text-text-muted">
                      #{c.market_cap_rank}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text={t('markets.loading_trending')} />
          )}
        </div>

        <div className="bg-surface-raised rounded-md border border-white/[0.06] p-5 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <SectionHeader
            title={t('markets.top_categories')}
            subtitle={t('markets.sectors_perf')}
            icon="categories"
          />
          {categories?.length > 0 ? (
            <div className="space-y-1.5 mt-4">
              {(Array.isArray(categories) ? categories : []).slice(0, 8).map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-3 p-2.5 rounded-sm bg-surface-secondary border border-white/[0.04]"
                >
                  <div className="flex gap-1 flex-shrink-0">
                    {cat.top_3_coins?.map((img, j) => (
                      <img
                        key={j}
                        src={img}
                        alt=""
                        className="w-4 h-4 rounded-full"
                        onError={(e) => e.target.style.display = 'none'}
                      />
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-text-primary text-[12px] truncate block">{cat.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-text-muted tabular-nums">
                    ${fmtLarge(cat.market_cap)}
                  </span>
                  <PctBadge value={cat.market_cap_change_24h} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text={t('markets.loading_categories')} />
          )}
        </div>
      </div>

      {/* ── CRYPTO NEWS ── */}
      <div className="bg-surface-raised rounded-md border border-white/[0.06] p-5 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <SectionHeader title={t('markets.news_title')} subtitle={t('markets.news_sub')} icon="news" />
        {news?.articles?.length > 0 ? (() => {
          const allArticles = news.articles;
          const featured = allArticles.slice(0, 2);
          const rest = allArticles.slice(2);
          const totalPages = Math.ceil(rest.length / NEWS_PER_PAGE);
          const pageArticles = rest.slice(newsPage * NEWS_PER_PAGE, (newsPage + 1) * NEWS_PER_PAGE);

          return (
            <div className="mt-4">
              {/* Featured */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                {featured.map((a, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedArticle(a)}
                    className="group cursor-pointer"
                  >
                    <div className="bg-surface-secondary rounded-md overflow-hidden border border-white/[0.04] hover:border-line/25 transition-all duration-200 h-full">
                      {a.image && (
                        <div className="h-40 overflow-hidden">
                          <img
                            src={a.image}
                            alt=""
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            onError={(e) => e.target.parentElement.style.display = 'none'}
                          />
                        </div>
                      )}
                      <div className="p-4">
                        <p className="text-text-primary text-sm leading-snug group-hover:text-gold-primary transition-colors line-clamp-2">
                          {a.title}
                        </p>
                        <div className="flex items-center gap-2 mt-3 font-mono text-[10px] uppercase tracking-wider">
                          <span className="text-gold-primary">{a.source}</span>
                          <span className="text-text-muted/70">· {translateTimeAgo(a.time_ago)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* List */}
              <div className="space-y-1">
                {pageArticles.map((a, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedArticle(a)}
                    className="flex items-center gap-3 py-2 px-2.5 rounded-sm hover:bg-white/[0.02] transition-colors group cursor-pointer"
                  >
                    {a.image ? (
                      <div className="w-16 h-12 rounded-sm overflow-hidden flex-shrink-0 bg-surface-secondary">
                        <img
                          src={a.image}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.parentElement.style.display = 'none'; }}
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-12 rounded-sm bg-surface-secondary flex-shrink-0 flex items-center justify-center border border-white/[0.04]">
                        <IconNewsSmall />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary text-[12px] group-hover:text-gold-primary transition-colors truncate">
                        {a.title}
                      </p>
                      {a.description && (
                        <p className="text-text-muted text-[10px] truncate mt-0.5">
                          {a.description.slice(0, 80)}
                        </p>
                      )}
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-gold-primary whitespace-nowrap">
                      {a.source}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 whitespace-nowrap">
                      {translateTimeAgo(a.time_ago)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pagination — Flowscan pill */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.04]">
                  <button
                    onClick={() => setNewsPage(p => Math.max(0, p - 1))}
                    disabled={newsPage === 0}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-colors ${
                      newsPage === 0
                        ? "text-text-muted/30 cursor-not-allowed bg-white/[0.02] border border-white/[0.04]"
                        : "text-text-muted hover:text-text-primary bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06]"
                    }`}
                  >
                    <IconChevronLeft />
                    {t('markets.prev')}
                  </button>
                  <div className="flex items-center gap-1">
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setNewsPage(i)}
                        className={`w-7 h-7 rounded-sm font-mono text-[10px] tabular-nums transition-colors ${
                          i === newsPage
                            ? "bg-white/10 text-text-primary border border-white/[0.08]"
                            : "text-text-muted hover:text-text-primary bg-white/[0.03] hover:bg-white/[0.06]"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setNewsPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={newsPage >= totalPages - 1}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-colors ${
                      newsPage >= totalPages - 1
                        ? "text-text-muted/30 cursor-not-allowed bg-white/[0.02] border border-white/[0.04]"
                        : "text-text-muted hover:text-text-primary bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06]"
                    }`}
                  >
                    {t('markets.next')}
                    <IconChevronRight />
                  </button>
                </div>
              )}
            </div>
          );
        })() : (
          <EmptyState text={t('markets.loading_news')} />
        )}
      </div>

      {/* ── DERIVATIVES + LIQUIDATIONS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Derivatives */}
        <div className="bg-surface-raised rounded-md border border-white/[0.06] p-5 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <SectionHeader
            title={t('markets.derivatives')}
            subtitle={t('markets.funding_sentiment')}
            icon="bolt"
          />
          {derivatives ? (
            <div className="space-y-5 mt-4">
              {/* Funding Rates */}
              <div>
                <SectionLabel>{t('markets.funding_rates')}</SectionLabel>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-profit/80 mb-2">
                      {t('markets.most_long')}
                    </p>
                    {derivatives.funding?.most_long?.slice(0, 3).map(f => (
                      <div key={f.symbol} className="flex justify-between items-center py-1">
                        <span className="text-text-primary text-[12px] font-mono">{f.symbol}</span>
                        <span className="font-mono text-[11px] text-profit tabular-nums">
                          +{f.rate_pct?.toFixed(4)}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-loss/80 mb-2">
                      {t('markets.most_short')}
                    </p>
                    {derivatives.funding?.most_short?.slice(0, 3).map(f => (
                      <div key={f.symbol} className="flex justify-between items-center py-1">
                        <span className="text-text-primary text-[12px] font-mono">{f.symbol}</span>
                        <span className="font-mono text-[11px] text-loss tabular-nums">
                          {f.rate_pct?.toFixed(4)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/[0.04] flex justify-between font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  <span>
                    {t('markets.avg_rate')}{' '}
                    <span className="text-text-primary tabular-nums">
                      {derivatives.funding?.avg_rate?.toFixed(4)}%
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {derivatives.funding?.total_symbols} {t('markets.pairs')}
                  </span>
                </div>
              </div>

              {/* Long/Short Ratio */}
              <div>
                <SectionLabel>{t('markets.ls_ratio')}</SectionLabel>
                <div className="mt-3 space-y-3">
                  {Object.entries(derivatives.longShort || {}).map(([sym, d]) => (
                    <div key={sym}>
                      <div className="flex justify-between text-[11px] mb-1.5 font-mono">
                        <span className="text-text-primary">{sym}</span>
                        <span className="text-text-muted uppercase tracking-wider text-[10px]">
                          {t('markets.ratio')}{' '}
                          <span className="text-text-primary tabular-nums">{d.ratio?.toFixed(2)}</span>
                        </span>
                      </div>
                      <div className="flex h-1.5 rounded-sm overflow-hidden bg-white/[0.04]">
                        <div className="bg-profit/80 transition-all" style={{ width: `${d.long}%` }} />
                        <div className="bg-loss/80 transition-all" style={{ width: `${d.short}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] mt-1 font-mono uppercase tracking-wider tabular-nums">
                        <span className="text-profit">{t('markets.long')} {d.long}%</span>
                        <span className="text-loss">{t('markets.short')} {d.short}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Open Interest */}
              <div>
                <SectionLabel>{t('markets.open_interest')}</SectionLabel>
                <p className="text-text-primary text-2xl font-mono font-light tabular-nums my-2">
                  ${fmtLarge(derivatives.openInterest?.total_usd)}
                </p>
                <div className="space-y-1.5">
                  {derivatives.openInterest?.breakdown?.map(oi => {
                    const pct = derivatives.openInterest.total_usd > 0
                      ? (oi.oi_usd / derivatives.openInterest.total_usd) * 100
                      : 0;
                    return (
                      <div key={oi.symbol} className="flex items-center gap-2.5">
                        <span className="text-text-primary text-[11px] font-mono w-12">{oi.symbol}</span>
                        <div className="flex-1 h-1 bg-white/[0.04] rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-gold-primary/70 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] tabular-nums text-text-muted w-20 text-right">
                          ${fmtLarge(oi.oi_usd)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState text={t('markets.loading_deriv')} />
          )}
        </div>

        {/* Liquidations */}
        <div className="bg-surface-raised rounded-md border border-white/[0.06] p-5 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <SectionHeader
            title={t('markets.liquidations')}
            subtitle={t('markets.recent_closures')}
            icon="liquidation"
          />
          {liquidations && (liquidations.summary?.count > 0 || liquidations.recent?.length > 0) ? (
            <div className="mt-4">
              {/* Summary 3 boxes */}
              <div className="grid grid-cols-3 gap-2.5 mb-4">
                <div className="bg-surface-secondary rounded-sm p-3 text-center border border-white/[0.04]">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    {t('markets.total')}
                  </p>
                  <p className="font-mono text-sm font-light text-text-primary tabular-nums mt-1.5">
                    ${fmtLarge(liquidations.summary?.total_usd)}
                  </p>
                </div>
                <div className="bg-profit/[0.05] rounded-sm p-3 text-center border border-profit/15">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-profit/80">
                    {t('markets.longs_liq')}
                  </p>
                  <p className="font-mono text-sm font-light text-profit tabular-nums mt-1.5">
                    ${fmtLarge(liquidations.summary?.long_liquidated)}
                  </p>
                </div>
                <div className="bg-loss/[0.05] rounded-sm p-3 text-center border border-loss/15">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-loss/80">
                    {t('markets.shorts_liq')}
                  </p>
                  <p className="font-mono text-sm font-light text-loss tabular-nums mt-1.5">
                    ${fmtLarge(liquidations.summary?.short_liquidated)}
                  </p>
                </div>
              </div>

              {/* Split bar */}
              {liquidations.summary?.total_usd > 0 && (
                <div className="mb-4">
                  <div className="flex h-1.5 rounded-sm overflow-hidden bg-white/[0.04]">
                    <div
                      className="bg-profit/80"
                      style={{ width: `${(liquidations.summary.long_liquidated / liquidations.summary.total_usd) * 100}%` }}
                    />
                    <div
                      className="bg-loss/80"
                      style={{ width: `${(liquidations.summary.short_liquidated / liquidations.summary.total_usd) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <SectionLabel>{t('markets.recent_orders')}</SectionLabel>
              <div className="space-y-1 max-h-[340px] overflow-y-auto scrollbar-thin mt-3 pr-1">
                {liquidations.recent?.slice(0, 15).map((liq, i) => {
                  const isLong = liq.side === 'SELL';
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 py-1.5 px-2 rounded-sm hover:bg-white/[0.02] transition-colors"
                    >
                      <span
                        className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
                          isLong
                            ? 'bg-profit/10 text-profit border-profit/25'
                            : 'bg-loss/10 text-loss border-loss/25'
                        }`}
                      >
                        {isLong ? 'LONG' : 'SHORT'}
                      </span>
                      <span className="text-text-primary text-[11px] font-mono w-12">{liq.symbol}</span>
                      <span className="font-mono text-[11px] text-text-muted tabular-nums flex-1">
                        ${fmtNum(liq.usd)}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
                        {timeAgo(liq.time, t)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            liquidations ? (
              <div className="mt-4 flex flex-col items-center justify-center py-12 text-center">
                <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
                  {t('markets.no_liq')}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/60 mt-1">
                  {t('markets.liq_update')}
                </p>
              </div>
            ) : (
              <EmptyState text={t('markets.loading_liq')} />
            )
          )}
        </div>
      </div>

      {/* ── DEFI + MACRO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-surface-raised rounded-md border border-white/[0.06] p-5 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <SectionHeader
            title={t('markets.defi_overview')}
            subtitle={t('markets.total_tvl')}
            icon="defi"
          />
          {defi ? (
            <div className="mt-4 space-y-5">
              <div className="flex items-baseline gap-2.5">
                <p className="text-3xl font-mono font-light text-text-primary tabular-nums tracking-tight">
                  ${fmtLarge(defi.totalTvl)}
                </p>
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  {t('markets.tvl_label')}
                </span>
              </div>

              <div>
                <SectionLabel>{t('markets.top_chains')}</SectionLabel>
                <div className="space-y-2 mt-3">
                  {defi.chains?.slice(0, 8).map((chain, i) => {
                    const pct = defi.totalTvl > 0 ? (chain.tvl / defi.totalTvl) * 100 : 0;
                    return (
                      <div key={chain.name} className="flex items-center gap-2.5">
                        <span className="font-mono text-[10px] text-text-muted/70 tabular-nums w-4">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="text-text-primary text-[12px] w-24 truncate">{chain.name}</span>
                        <div className="flex-1 h-1 bg-white/[0.04] rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-gold-primary/70 transition-all"
                            style={{ width: `${Math.max(pct, 1)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] tabular-nums text-text-muted w-16 text-right">
                          ${fmtLarge(chain.tvl)}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-text-muted/70 w-12 text-right">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <SectionLabel>{t('markets.top_protocols')}</SectionLabel>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {defi.protocols?.slice(0, 6).map(p => (
                    <div
                      key={p.name}
                      className="bg-surface-secondary rounded-sm p-2.5 border border-white/[0.04] flex items-center gap-2.5"
                    >
                      {p.logo && (
                        <img
                          src={p.logo}
                          alt=""
                          className="w-5 h-5 rounded-full"
                          onError={(e) => e.target.style.display = 'none'}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-text-primary text-[11px] truncate">{p.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] tabular-nums text-text-muted">
                            ${fmtLarge(p.tvl)}
                          </span>
                          {p.change_1d != null && <PctBadge value={p.change_1d} small />}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState text={t('markets.loading_defi')} />
          )}
        </div>

        {/* Stablecoins + ETF */}
        <div className="bg-surface-raised rounded-md border border-white/[0.06] p-5 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <SectionHeader
            title={t('markets.macro_stable')}
            subtitle={t('markets.macro_sub')}
            icon="macro"
          />
          <div className="mt-4 space-y-5">
            {stablecoins ? (
              <div>
                <div className="flex items-baseline gap-2.5 mb-3.5">
                  <p className="text-2xl font-mono font-light text-text-primary tabular-nums tracking-tight">
                    ${fmtLarge(stablecoins.totalMcap)}
                  </p>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    {t('markets.stable_mcap')}
                  </span>
                </div>

                <div className="space-y-2">
                  {stablecoins.stablecoins?.slice(0, 6).map(s => {
                    const pct = stablecoins.totalMcap > 0 ? (s.mcap / stablecoins.totalMcap) * 100 : 0;
                    return (
                      <div key={s.symbol} className="flex items-center gap-2.5">
                        <span className="text-text-primary text-[11px] font-mono w-14">{s.symbol}</span>
                        <div className="flex-1 h-1 bg-white/[0.04] rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-gold-primary/60 transition-all"
                            style={{ width: `${Math.max(pct, 0.5)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] tabular-nums text-text-muted w-16 text-right">
                          ${fmtLarge(s.mcap)}
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-text-muted/70 w-12 text-right">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyState text={t('markets.loading_stable')} />
            )}

            <div className="pt-4 border-t border-white/[0.04]">
              <SectionLabel>{t('markets.etf_flows')}</SectionLabel>
              <div className="mt-3">
                {etfFlows && !etfFlows.error ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <EtfCard label={t('markets.btc_etf')} data={etfFlows.btc} t={t} />
                    <EtfCard label={t('markets.eth_etf')} data={etfFlows.eth} t={t} />
                  </div>
                ) : (
                  <div className="bg-surface-secondary rounded-sm p-4 border border-white/[0.04] text-center">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
                      {etfFlows?.error === 'SoSoValue API key not configured'
                        ? t('markets.etf_key_err')
                        : etfFlows?.error || t('markets.loading_etf')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── COIN TABLE ── */}
      <div className="bg-surface-raised rounded-md border border-white/[0.06] p-5 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <SectionHeader title={t('markets.all_coins')} subtitle={t('markets.top_100')} icon="coins" />
          <div className="flex gap-1">
            {[
              { key: 'all', label: t('markets.tab_all') },
              { key: 'gainers', label: t('markets.tab_gainers') },
              { key: 'losers', label: t('markets.tab_losers') },
              { key: 'volume', label: t('markets.tab_vol') },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => { setCoinTab(tab.key); setCoinPage(1); }}
                className={`font-mono text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-sm transition-colors ${
                  coinTab === tab.key
                    ? 'bg-white/10 text-text-primary border border-white/[0.08]'
                    : 'bg-white/[0.03] text-text-muted border border-transparent hover:bg-white/[0.06] hover:text-text-primary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['#', t('markets.th_coin'), t('markets.th_price'), '1h %', '24h %', '7d %', t('markets.th_mcap'), t('markets.th_vol')].map(h => (
                  <th
                    key={h}
                    className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/70 py-3 px-2 text-left whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedCoins.map((c, i) => (
                <tr
                  key={c.id}
                  className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-3 px-2 font-mono text-[11px] text-text-muted/70 tabular-nums">
                    {(coinPage - 1) * COINS_PER_PAGE + i + 1}
                  </td>
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2.5">
                      <img src={c.image} alt="" className="w-5 h-5 rounded-full" />
                      <span className="text-text-primary text-[12px]">{c.name}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        {c.symbol?.toUpperCase()}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-2 text-text-primary text-[12px] font-mono font-light tabular-nums">
                    ${fmtPrice(c.current_price)}
                  </td>
                  <td className="py-3 px-2"><PctText value={c.price_change_percentage_1h_in_currency} /></td>
                  <td className="py-3 px-2"><PctText value={c.price_change_percentage_24h} /></td>
                  <td className="py-3 px-2"><PctText value={c.price_change_percentage_7d_in_currency} /></td>
                  <td className="py-3 px-2 font-mono text-[11px] tabular-nums text-text-muted">
                    ${fmtLarge(c.market_cap)}
                  </td>
                  <td className="py-3 px-2 font-mono text-[11px] tabular-nums text-text-muted">
                    ${fmtLarge(c.total_volume)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalCoinPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.04]">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted tabular-nums">
              {t('markets.showing')} {(coinPage - 1) * COINS_PER_PAGE + 1}–{Math.min(coinPage * COINS_PER_PAGE, filteredCoins.length)} {t('markets.of')} {filteredCoins.length}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setCoinPage(p => Math.max(1, p - 1))}
                disabled={coinPage === 1}
                className={`inline-flex items-center justify-center w-7 h-7 rounded-sm transition-colors ${
                  coinPage === 1
                    ? 'text-text-muted/30 cursor-not-allowed bg-white/[0.02]'
                    : 'text-text-muted hover:text-text-primary bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06]'
                }`}
              >
                <IconChevronLeft />
              </button>
              {[...Array(totalCoinPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCoinPage(i + 1)}
                  className={`w-7 h-7 rounded-sm font-mono text-[10px] tabular-nums transition-colors ${
                    coinPage === i + 1
                      ? 'bg-white/10 text-text-primary border border-white/[0.08]'
                      : 'text-text-muted hover:text-text-primary bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                onClick={() => setCoinPage(p => Math.min(totalCoinPages, p + 1))}
                disabled={coinPage === totalCoinPages}
                className={`inline-flex items-center justify-center w-7 h-7 rounded-sm transition-colors ${
                  coinPage === totalCoinPages
                    ? 'text-text-muted/30 cursor-not-allowed bg-white/[0.02]'
                    : 'text-text-muted hover:text-text-primary bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06]'
                }`}
              >
                <IconChevronRight />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedArticle && (
        <NewsPreviewModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="markets" />
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   SECTION HEADER — Flowscan flat pattern
   ────────────────────────────────────────────────────────────── */

const SectionHeader = ({ title, subtitle, icon }) => (
  <div className="flex items-center gap-2.5">
    <div className="w-7 h-7 rounded-sm flex items-center justify-center flex-shrink-0 bg-gold-primary/[0.06] border border-line/15 text-gold-primary">
      <SectionIcon type={icon} />
    </div>
    <div>
      <h3 className="text-text-primary text-sm font-normal tracking-tight">{title}</h3>
      {subtitle && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-0.5">
          {subtitle}
        </p>
      )}
    </div>
  </div>
);

const SectionLabel = ({ children }) => (
  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/80">
    {children}
  </p>
);

/* ── SVG ICONS — Lucide-style minimal ── */

const SectionIcon = ({ type }) => {
  const icons = {
    heatmap: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="8" height="8" />
        <rect x="13" y="3" width="8" height="8" />
        <rect x="3" y="13" width="8" height="8" />
        <rect x="13" y="13" width="8" height="8" />
      </svg>
    ),
    trending: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17 L9 11 L13 14 L21 6" />
        <path d="M16 6 L21 6 L21 11" />
      </svg>
    ),
    categories: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="8" height="6" />
        <rect x="13" y="4" width="8" height="6" />
        <rect x="3" y="14" width="8" height="6" />
        <rect x="13" y="14" width="8" height="6" />
      </svg>
    ),
    news: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="14" height="15" />
        <path d="M17 8 H20 a1 1 0 011 1 V18 a2 2 0 01-2 2 H17" />
        <line x1="6" y1="9" x2="14" y2="9" />
        <line x1="6" y1="12" x2="14" y2="12" />
        <line x1="6" y1="15" x2="11" y2="15" />
      </svg>
    ),
    bolt: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 3 L4 14 H11 L9 21 L20 10 H13 L13 3 Z" />
      </svg>
    ),
    liquidation: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      </svg>
    ),
    defi: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="9" width="18" height="12" />
        <path d="M5 9 L12 3 L19 9" />
        <line x1="7" y1="14" x2="7" y2="18" />
        <line x1="12" y1="14" x2="12" y2="18" />
        <line x1="17" y1="14" x2="17" y2="18" />
      </svg>
    ),
    macro: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 20h18M5 20V10M9 20V10M15 20V10M19 20V10M3 10L12 4L21 10" />
      </svg>
    ),
    coins: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="7" rx="8" ry="3" />
        <path d="M4 7 V12 c0 1.7 3.6 3 8 3 c4.4 0 8-1.3 8-3 V7" />
        <path d="M4 12 V17 c0 1.7 3.6 3 8 3 c4.4 0 8-1.3 8-3 V12" />
      </svg>
    ),
  };
  return icons[type] || icons.coins;
};

const IconChevronLeft = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);

const IconChevronRight = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);

const IconArrowUpMini = () => (
  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
  </svg>
);

const IconArrowDownMini = () => (
  <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const IconNewsSmall = () => (
  <svg className="w-3.5 h-3.5 text-gold-primary/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="14" height="15" />
    <line x1="6" y1="9" x2="14" y2="9" />
    <line x1="6" y1="12" x2="14" y2="12" />
  </svg>
);

/* ──────────────────────────────────────────────────────────────
   STAT/BADGE COMPONENTS
   ────────────────────────────────────────────────────────────── */

const GlobalStat = ({ label, value, change, accent }) => (
  <div className="bg-surface-secondary rounded-sm p-3 border border-white/[0.04]">
    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted/80">{label}</p>
    <div className="h-px bg-white/[0.04] my-2" />
    <p className={`font-mono text-sm font-light tabular-nums tracking-tight ${accent || 'text-text-primary'}`}>
      {value}
    </p>
    {change != null && (
      <span
        className={`inline-flex items-center gap-0.5 font-mono text-[10px] tabular-nums mt-1 ${
          change >= 0 ? 'text-profit' : 'text-loss'
        }`}
      >
        {change >= 0 ? <IconArrowUpMini /> : <IconArrowDownMini />}
        {Math.abs(change).toFixed(2)}%
      </span>
    )}
  </div>
);

const FearGreedMini = ({ value, label, t }) => {
  const v = value || 50;
  const color =
    v <= 25 ? 'text-loss'
    : v <= 45 ? 'text-amber-500/80'
    : v <= 55 ? 'text-gold-primary'
    : v <= 75 ? 'text-profit/80'
    : 'text-profit';
  return (
    <div className="bg-surface-secondary rounded-sm p-3 border border-white/[0.04]">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted/80">
        {t('markets.fear_greed')}
      </p>
      <div className="h-px bg-white/[0.04] my-2" />
      <div className="flex items-center gap-2.5">
        <div className="relative w-9 h-9 flex-shrink-0">
          <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" fill="none" />
            <circle
              cx="18" cy="18" r="15"
              stroke="currentColor" strokeWidth="2.5" fill="none"
              strokeDasharray={`${(v / 100) * 94.2} 94.2`}
              strokeLinecap="round"
              className={color}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`font-mono text-[11px] tabular-nums ${color}`}>{v}</span>
          </div>
        </div>
        <span className={`font-mono text-[11px] uppercase tracking-wider ${color}`}>
          {label || t('markets.neutral')}
        </span>
      </div>
    </div>
  );
};

const PctBadge = ({ value, small }) => {
  if (value == null) return null;
  const pos = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono tabular-nums rounded-sm px-1.5 py-0.5 border ${
        small ? 'text-[9px]' : 'text-[10px]'
      } ${
        pos
          ? 'bg-profit/10 text-profit border-profit/20'
          : 'bg-loss/10 text-loss border-loss/20'
      }`}
    >
      {pos ? '+' : ''}{value?.toFixed(2)}%
    </span>
  );
};

const PctText = ({ value }) => {
  if (value == null) return <span className="font-mono text-[11px] text-text-muted">-</span>;
  const pos = value >= 0;
  return (
    <span
      className={`font-mono text-[11px] tabular-nums ${pos ? 'text-profit' : 'text-loss'}`}
    >
      {pos ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
};

const EtfCard = ({ label, data, t }) => {
  if (!data || !data.records?.length) return (
    <div className="bg-surface-secondary rounded-sm p-3 border border-white/[0.04]">
      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted/70 mt-2">
        {t('markets.no_data')}
      </p>
    </div>
  );
  const latest = data.records[0];
  const flow = latest?.netFlow;
  const pos = flow >= 0;
  return (
    <div className="bg-surface-secondary rounded-sm p-3 border border-white/[0.04]">
      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`font-mono text-sm font-light tabular-nums mt-1.5 ${pos ? 'text-profit' : 'text-loss'}`}>
        {pos ? '+' : ''}{flow != null ? `$${fmtLarge(Math.abs(flow))}` : '-'}
      </p>
      <p className="font-mono text-[10px] tabular-nums text-text-muted/70 mt-1">
        {latest?.date || ''}
      </p>
      {latest?.totalAum && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
          {t('markets.aum')} ${fmtLarge(latest.totalAum)}
        </p>
      )}
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────
   HEATMAP — Flowscan muted profit/loss palette
   ────────────────────────────────────────────────────────────── */

const HeatmapGrid = ({ coins }) => {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setDims({ w: rect.width, h: Math.max(rect.width * 0.45, 320) });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const rects = useMemo(() => {
    if (!dims.w || !dims.h || !coins.length) return [];
    const sorted = [...coins].sort((a, b) => (b.mcap || 0) - (a.mcap || 0));
    const totalArea = dims.w * dims.h;
    const totalMcap = sorted.reduce((s, c) => s + (c.mcap || 0), 0);
    if (totalMcap === 0) return [];

    const items = sorted.map(c => ({
      ...c,
      area: ((c.mcap || 0) / totalMcap) * totalArea,
    }));

    return squarify(items, { x: 0, y: 0, w: dims.w, h: dims.h });
  }, [coins, dims]);

  // Flowscan muted palette: profit #56c996, loss #e07288
  const getColor = (pct) => {
    const abs = Math.abs(pct || 0);
    const t = Math.min(abs / 8, 1);
    if (pct >= 0) {
      // muted green: from very dark to medium #56c996
      const intensity = 0.08 + t * 0.32; // 0.08 → 0.40 alpha
      return `rgba(86, 201, 150, ${intensity})`;
    } else {
      // muted rose: from very dark to medium #e07288
      const intensity = 0.08 + t * 0.32;
      return `rgba(224, 114, 136, ${intensity})`;
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative mt-4 rounded-sm overflow-hidden bg-surface"
      style={{ height: dims.h || 320 }}
    >
      {rects.map((r) => {
        const pct = r.change_24h || 0;
        const isLarge = r.w > 70 && r.h > 55;
        const isMedium = r.w > 45 && r.h > 38;
        const textColor = pct >= 0 ? '#56c996' : '#e07288';
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
              border: '1px solid rgba(255,255,255,0.04)',
            }}
            title={`${r.name}: $${fmtPrice(r.price)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`}
          >
            {isLarge && r.image && (
              <img src={r.image} alt="" className="w-6 h-6 rounded-full mb-1 opacity-90 group-hover:opacity-100" />
            )}
            {isMedium && (
              <>
                <span
                  className="text-text-primary font-mono leading-none"
                  style={{ fontSize: isLarge ? '12px' : '10px' }}
                >
                  {r.symbol}
                </span>
                <span
                  className="font-mono leading-none mt-1 tabular-nums"
                  style={{ fontSize: isLarge ? '11px' : '9px', color: textColor }}
                >
                  {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                </span>
              </>
            )}
            {!isMedium && r.w > 25 && r.h > 18 && (
              <span className="text-text-primary/85 font-mono leading-none" style={{ fontSize: '9px' }}>
                {r.symbol}
              </span>
            )}

            <div className="heatmap-tooltip opacity-0 group-hover:opacity-100 pointer-events-none absolute z-50 -top-16 left-1/2 -translate-x-1/2 bg-surface border border-white/[0.06] rounded-sm px-3 py-2 whitespace-nowrap shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
              <div className="flex items-center gap-2">
                {r.image && <img src={r.image} alt="" className="w-4 h-4 rounded-full" />}
                <span className="text-text-primary text-[11px]">{r.name}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  {r.symbol}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 font-mono text-[10px] tabular-nums">
                <span className="text-text-primary">${fmtPrice(r.price)}</span>
                <span style={{ color: textColor }}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                </span>
                <span className="text-text-muted/70 uppercase tracking-wider">
                  MCap: ${fmtLarge(r.mcap)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

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

/* ──────────────────────────────────────────────────────────────
   STYLES — minimal (strip pulseGlow, fadeIn, card-hover, fear-ring)
   ────────────────────────────────────────────────────────────── */

const Styles = () => (
  <style>{`
    .line-clamp-2{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .scrollbar-thin::-webkit-scrollbar{width:4px}
    .scrollbar-thin::-webkit-scrollbar-track{background:transparent}
    .scrollbar-thin::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
    .scrollbar-thin::-webkit-scrollbar-thumb:hover{background:rgba(212,168,83,0.25)}
    .heatmap-cell{transition:filter .15s,transform .12s}
    .heatmap-cell:hover{filter:brightness(1.4);z-index:20;transform:scale(1.005)}
    .heatmap-tooltip{transition:opacity .15s ease-out}
  `}</style>
);

/* ──────────────────────────────────────────────────────────────
   EMPTY / ERROR / SKELETON
   ────────────────────────────────────────────────────────────── */

const EmptyState = ({ text }) => (
  <div className="flex items-center justify-center py-8">
    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-text-muted">
      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {text}
    </div>
  </div>
);

const ErrorState = ({ error, onRetry, t }) => (
  <div className="space-y-5">
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
        Markets
      </span>
      <span className="h-px flex-1 bg-white/[0.06]" />
    </div>
    <div className="bg-surface-raised rounded-md p-8 border border-loss/25 text-center relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-loss/40 to-transparent" />
      <div className="w-12 h-12 mx-auto mb-4 rounded-md bg-loss/10 flex items-center justify-center border border-loss/25">
        <svg className="w-6 h-6 text-loss" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      </div>
      <p className="font-mono text-[11px] uppercase tracking-wider text-loss mb-5">{error}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-gold-primary/10 text-gold-primary rounded-sm hover:bg-gold-primary/15 transition-colors font-mono text-[11px] uppercase tracking-wider border border-line/25"
      >
        {t ? t('markets.retry') : 'Retry'}
      </button>
    </div>
  </div>
);

const LoadingSkeleton = () => (
  <div className="space-y-5">
    <style>{`@keyframes sp{0%,100%{opacity:.04}50%{opacity:.12}}.skel{animation:sp 2s ease-in-out infinite;background:rgba(255,255,255,.06);border-radius:2px}`}</style>
    <div className="flex items-center gap-3">
      <div className="skel w-40 h-3" />
      <span className="h-px flex-1 bg-white/[0.06]" />
    </div>
    <div className="bg-surface-raised rounded-md p-5 border border-white/[0.06]">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-surface-secondary rounded-sm p-3 border border-white/[0.04]">
            <div className="skel w-16 h-3 mb-2" />
            <div className="skel w-20 h-4" />
          </div>
        ))}
      </div>
    </div>
    <div className="bg-surface-raised rounded-md p-5 h-56 border border-white/[0.06]">
      <div className="skel w-32 h-4 mb-4" />
      <div className="flex flex-wrap gap-1">
        {[...Array(20)].map((_, i) => (
          <div key={i} className="skel" style={{ width: `${Math.random() * 60 + 30}px`, height: '38px' }} />
        ))}
      </div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="bg-surface-raised rounded-md p-5 h-72 border border-white/[0.06]">
          <div className="skel w-28 h-4 mb-4" />
          {[...Array(5)].map((_, j) => (
            <div key={j} className="skel w-full h-7 mb-2" />
          ))}
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="bg-surface-raised rounded-md p-5 h-80 border border-white/[0.06]">
          <div className="skel w-24 h-4 mb-4" />
          {[...Array(6)].map((_, j) => (
            <div key={j} className="skel w-full h-6 mb-2" />
          ))}
        </div>
      ))}
    </div>
    <div className="bg-surface-raised rounded-md p-5 border border-white/[0.06]">
      <div className="skel w-24 h-4 mb-5" />
      {[...Array(8)].map((_, i) => (
        <div key={i} className="skel w-full h-9 mb-2" />
      ))}
    </div>
  </div>
);

/* ── HELPERS ── */

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

function timeAgo(ts, t) {
  if (!ts) return '';
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return t ? t('markets.just_now') : 'just now';
  if (mins < 60) return `${mins} ${t ? t('markets.m_ago') : 'm ago'}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${t ? t('markets.h_ago') : 'h ago'}`;
  return `${Math.floor(hours / 24)} ${t ? t('markets.d_ago') : 'd ago'}`;
}

export default MarketsPage;