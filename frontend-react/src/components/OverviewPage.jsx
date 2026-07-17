import Seo from "./Seo";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import TopPerformers from "./TopPerformers";
import AssistantWidget from "./assistant/AssistantWidget";
import { ShimmerStyles } from "./ui/Loaders";
import { PageHeader } from "./ui/PageHeader";

const API_BASE = "/api/v1";

// ================================================================
// INLINE SVG ICONS (Lucide-style, no emoji)
// ================================================================

const IconWallet = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path
      d="M4 5.5A2.5 2.5 0 0 1 6.5 3H17a1 1 0 1 1 0 2H6.5a.5.5 0 0 0 0 1H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5.5z"
      opacity="0.55"
    />
    <path d="M21 11v4h-4a2 2 0 0 1 0-4h4zm-3.5 1.4a.6.6 0 1 0 0 1.2.6.6 0 0 0 0-1.2z" />
  </svg>
);

const IconChart = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <rect x="3" y="13" width="4" height="8" rx="1" opacity="0.5" />
    <rect x="10" y="8" width="4" height="13" rx="1" opacity="0.75" />
    <rect x="17" y="4" width="4" height="17" rx="1" />
  </svg>
);

const IconCrown = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M2.6 8.2l3.6 2.9L11.1 5a1.1 1.1 0 0 1 1.8 0l4.9 6.1 3.6-2.9c.7-.6 1.7 0 1.5.9l-1.7 8.1a1 1 0 0 1-1 .8H4.8a1 1 0 0 1-1-.8L2.1 9.1c-.2-.9.8-1.5 1.5-.9z" />
    <rect x="4.5" y="20" width="15" height="1.8" rx="0.9" opacity="0.6" />
  </svg>
);

const IconCoins = ({ className = "w-3.5 h-3.5" }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <ellipse cx="12" cy="16.5" rx="7" ry="2.8" opacity="0.45" />
    <ellipse cx="12" cy="12" rx="7" ry="2.8" opacity="0.7" />
    <ellipse cx="12" cy="7.5" rx="7" ry="2.8" />
  </svg>
);

const IconFlame = ({ className = "w-3.5 h-3.5" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

const IconArrowUp = ({ className = "w-3.5 h-3.5" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </svg>
);

const IconArrowDown = ({ className = "w-3.5 h-3.5" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </svg>
);

const IconActivity = ({ className = "w-3.5 h-3.5" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const IconPulse = ({ className = "w-3.5 h-3.5" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M3 12h4l3-9 4 18 3-9h4" />
  </svg>
);

const IconAlert = ({ className = "w-3.5 h-3.5" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconGauge = ({ className = "w-3.5 h-3.5" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
    <path d="m13.4 12.6 3.6-3.6" />
    <path d="M3.34 19a10 10 0 1 1 17.32 0" />
  </svg>
);

// ================================================================
// SHARED — card chrome + section header
// ================================================================

const CardShell = ({ children, className = "", hover = true }) => (
  <div
    className={`relative bg-surface-raised rounded-xl border border-ink/[0.06] overflow-hidden ${hover ? "hover:border-ink/[0.12] transition-colors" : ""} ${className}`}
  >
    {children}
  </div>
);

const CardHead = ({ icon, label, right }) => (
  <div className="px-4 sm:px-5 py-3.5 border-b border-ink/[0.06] bg-ink/[0.015] flex items-center justify-between gap-3 flex-wrap">
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-6 h-6 flex items-center justify-center rounded-md border border-ink/[0.08] bg-ink/[0.04] text-text-primary/65 flex-shrink-0">
        {icon}
      </span>
      <h3 className="font-mono text-[11px] uppercase tracking-[0.22em] text-text-primary truncate">
        {label}
      </h3>
    </div>
    {right}
  </div>
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

      if (globalRes.status === "fulfilled" && globalRes.value.ok) {
        const result = await globalRes.value.json();
        const globalData = result.global;
        const coinsData = result.coins || [];
        const fearGreed = result.fearGreed || {
          value: 50,
          label: "Neutral",
          yesterday: 50,
          lastWeek: 50,
        };

        if (globalData || coinsData.length > 0) {
          const btc = coinsData.find((c) => c.symbol === "btc");
          const eth = coinsData.find((c) => c.symbol === "eth");

          setData({
            totalMarketCap: globalData?.total_market_cap?.usd || 0,
            marketCapChange24h: globalData?.market_cap_change_percentage_24h_usd || 0,
            totalVolume24h: globalData?.total_volume?.usd || 0,
            btcDominance: globalData?.market_cap_percentage?.btc || 0,
            ethDominance: globalData?.market_cap_percentage?.eth || 0,
            altcoinMarketCap:
              (globalData?.total_market_cap?.usd || 0) *
              (1 - (globalData?.market_cap_percentage?.btc || 0) / 100),
            stablecoinDom:
              (globalData?.market_cap_percentage?.usdt || 0) +
              (globalData?.market_cap_percentage?.usdc || 0),
            activeCryptos: globalData?.active_cryptocurrencies || 0,
            ethBtcRatio: btc && eth ? eth.current_price / btc.current_price : 0,
            fearGreed,
            topCoins: coinsData.slice(0, 10),
            topGainers: [...coinsData]
              .filter((c) => c.price_change_percentage_24h != null)
              .sort(
                (a, b) =>
                  (b.price_change_percentage_24h || 0) - (a.price_change_percentage_24h || 0)
              )
              .slice(0, 5),
            topLosers: [...coinsData]
              .filter((c) => c.price_change_percentage_24h != null)
              .sort(
                (a, b) =>
                  (a.price_change_percentage_24h || 0) - (b.price_change_percentage_24h || 0)
              )
              .slice(0, 5),
          });
        } else if (!data) {
          setMarketError("Failed to fetch market data");
        }
      } else if (!data) {
        setMarketError("Failed to fetch market data");
      }

      if (catRes.status === "fulfilled" && catRes.value.ok)
        setCategories(await catRes.value.json());
      if (trendRes.status === "fulfilled" && trendRes.value.ok)
        setTrending(await trendRes.value.json());
      if (derivRes.status === "fulfilled" && derivRes.value.ok)
        setDerivPulse(await derivRes.value.json());
    } catch (err) {
      console.error("Failed to fetch overview data:", err);
      if (!data) setMarketError(err.message);
    } finally {
      setMarketLoading(false);
    }
  };

  return (
    <div className="space-y-5 lg:space-y-7">
      <Seo
        title="Market Overview — Live Crypto Data & Analytics | LuxQuant Terminal"
        description="Live crypto market overview: top movers, sector rotation, and quantitative analytics from LuxQuant Terminal. Real-time data, decided by you."
        path="/home"
        keywords="crypto market overview, live crypto data, market analytics, luxquant"
      />
      {/* PAGE HEADER — same voice as every other page (h1 + subtitle) */}
      <div>
        <PageHeader title="Home" />
        <p className="mt-2 text-sm text-text-secondary">
          Top calls, market state, and today&apos;s highlights in one view.
        </p>
      </div>

      <TopPerformers />

      {/* SECTION HEADER — Market Overview (consistent w/ Top Gainers) */}
      <div className="min-w-0">
        <h2 className="font-display text-lg sm:text-xl font-semibold text-text-primary leading-none tracking-tight">
          {t("overview.title")}
        </h2>
      </div>

      {marketLoading ? (
        <>
          <ShimmerStyles />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-surface-raised rounded-xl border border-ink/[0.06] p-4 lg:p-5"
              >
                <div className="lqsk h-2.5 w-20 mb-3"></div>
                <div className="h-px bg-ink/[0.06] mb-3"></div>
                <div className="lqsk h-7 w-28"></div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="lqsk rounded-xl h-56"></div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* ERROR BANNER */}
          {marketError && (
            <CardShell
              hover={false}
              className="border-loss/25 px-4 py-3 flex items-center justify-between"
            >
              <p className="text-loss text-xs font-mono uppercase tracking-wider flex items-center gap-2">
                <IconAlert className="w-3.5 h-3.5" />
                {t("overview.error_api")}
              </p>
              <button
                onClick={() => {
                  setMarketLoading(true);
                  fetchAll();
                }}
                className="px-3 py-1 bg-loss/10 text-loss border border-loss/20 hover:bg-loss/15 hover:border-loss/25 transition-all text-[10px] font-mono uppercase tracking-wider rounded"
              >
                {t("overview.retry")}
              </button>
            </CardShell>
          )}

          {/* KEY METRICS */}
          {data && (
            <div className="relative overflow-hidden rounded-xl border border-ink/[0.06] bg-surface-raised">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-ink/[0.04]">
                <MetricCard
                  label={t("overview.total_mcap")}
                  value={formatLargeNumber(data.totalMarketCap)}
                  change={data.marketCapChange24h}
                  icon={<IconWallet />}
                />
                <MetricCard
                  label={t("overview.vol_24h")}
                  value={formatLargeNumber(data.totalVolume24h)}
                  icon={<IconChart />}
                />
                <MetricCard
                  label={t("overview.btc_dom")}
                  value={`${data.btcDominance.toFixed(1)}%`}
                  icon={<IconCrown />}
                />
                <MetricCard
                  label={t("overview.active_crypto")}
                  value={data.activeCryptos.toLocaleString()}
                  icon={<IconCoins />}
                />
              </div>
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
                <CardShell>
                  <CardHead
                    icon={<IconActivity className="w-3.5 h-3.5" />}
                    label={t("overview.indicators")}
                  />
                  <div className="p-5 space-y-4">
                    <IndicatorRow
                      label={t("overview.eth_dom")}
                      value={`${data.ethDominance?.toFixed(1)}%`}
                      pct={data.ethDominance}
                      opacity={0.85}
                    />
                    <IndicatorRow
                      label={t("overview.btc_dom")}
                      value={`${data.btcDominance?.toFixed(1)}%`}
                      pct={data.btcDominance}
                      opacity={1.0}
                    />
                    <IndicatorRow
                      label={t("overview.stable_dom")}
                      value={`${data.stablecoinDom?.toFixed(2)}%`}
                      pct={data.stablecoinDom}
                      max={20}
                      opacity={0.55}
                    />
                    <div className="pt-3 border-t border-ink/[0.06] space-y-2.5">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                          {t("overview.alt_mcap")}
                        </span>
                        <span className="text-text-primary font-mono text-sm tabular-nums">
                          {formatLargeNumber(data.altcoinMarketCap)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                          {t("overview.eth_btc")}
                        </span>
                        <span className="text-text-primary font-mono text-sm tabular-nums">
                          {data.ethBtcRatio?.toFixed(5)}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardShell>

                {/* FEAR & GREED — speedometer gauge */}
                <CardShell>
                  <CardHead
                    icon={<IconGauge className="w-3.5 h-3.5" />}
                    label={t("overview.fg_index")}
                  />
                  <div className="p-5 flex flex-col items-center">
                    <div className="relative w-full max-w-[230px] mb-1">
                      <svg viewBox="0 0 200 118" className="w-full h-auto">
                        <path
                          d="M20 100 A80 80 0 0 1 35.28 52.98"
                          fill="none"
                          stroke="#e07288"
                          strokeWidth="12"
                          strokeLinecap="round"
                        />
                        <path
                          d="M35.28 52.98 A80 80 0 0 1 75.28 23.92"
                          fill="none"
                          stroke="#fbbf24"
                          strokeWidth="12"
                        />
                        <path
                          d="M75.28 23.92 A80 80 0 0 1 124.72 23.92"
                          fill="none"
                          stroke="rgb(var(--accent))"
                          strokeWidth="12"
                        />
                        <path
                          d="M124.72 23.92 A80 80 0 0 1 164.72 52.98"
                          fill="none"
                          stroke="#9bcf6b"
                          strokeWidth="12"
                        />
                        <path
                          d="M164.72 52.98 A80 80 0 0 1 180 100"
                          fill="none"
                          stroke="#56c996"
                          strokeWidth="12"
                          strokeLinecap="round"
                        />
                        <g
                          transform={`rotate(${(data.fearGreed.value - 50) * 1.8} 100 100)`}
                          style={{ transition: "transform 1s cubic-bezier(.16,1,.3,1)" }}
                        >
                          <line
                            x1="100"
                            y1="100"
                            x2="100"
                            y2="44"
                            stroke={fgStroke(data.fearGreed.value)}
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                          <circle cx="100" cy="44" r="3.5" fill={fgStroke(data.fearGreed.value)} />
                        </g>
                        <circle
                          cx="100"
                          cy="100"
                          r="7"
                          fill="rgb(var(--surface-raised))"
                          stroke={fgStroke(data.fearGreed.value)}
                          strokeWidth="2.5"
                        />
                      </svg>
                      <div className="absolute inset-x-2 bottom-0 flex justify-between font-mono text-[8px] uppercase tracking-[0.15em] text-text-muted/50 pointer-events-none">
                        <span>Fear</span>
                        <span>Greed</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-center mb-4">
                      <span
                        className="font-mono text-3xl lg:text-4xl font-light tabular-nums leading-none"
                        style={{ color: fgStroke(data.fearGreed.value) }}
                      >
                        {data.fearGreed.value}
                      </span>
                      <span
                        className="font-mono text-[9px] uppercase tracking-[0.2em] mt-1"
                        style={{ color: fgStroke(data.fearGreed.value) }}
                      >
                        {data.fearGreed.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 w-full">
                      <FGStat label={t("overview.yesterday")} value={data.fearGreed.yesterday} />
                      <FGStat label={t("overview.last_week")} value={data.fearGreed.lastWeek} />
                      <div className="text-center">
                        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted mb-1.5">
                          {t("overview.trend")}
                        </p>
                        <p
                          className="font-mono text-sm tabular-nums"
                          style={{
                            color:
                              data.fearGreed.value > data.fearGreed.lastWeek
                                ? "#4ade80"
                                : data.fearGreed.value < data.fearGreed.lastWeek
                                  ? "#f87171"
                                  : "#a59585",
                          }}
                        >
                          {data.fearGreed.value > data.fearGreed.lastWeek
                            ? t("overview.up")
                            : data.fearGreed.value < data.fearGreed.lastWeek
                              ? t("overview.down")
                              : t("overview.flat")}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardShell>
              </>
            )}

            {/* DERIVATIVES PULSE */}
            {derivPulse ? (
              <DerivativesPulseCard data={derivPulse} t={t} />
            ) : (
              <CardShell className="flex items-center justify-center min-h-[200px]">
                <span className="text-text-muted font-mono text-xs uppercase tracking-wider">
                  {t("overview.deriv_pending")}
                </span>
              </CardShell>
            )}
          </div>

          {/* GAINERS & LOSERS */}
          {data && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CoinListCard
                title={t("overview.top_gainers_24h")}
                icon={<IconArrowUp className="w-3.5 h-3.5" />}
                coins={data.topGainers}
                isLoser={false}
              />
              <CoinListCard
                title={t("overview.top_losers_24h")}
                icon={<IconArrowDown className="w-3.5 h-3.5" />}
                coins={data.topLosers}
                isLoser={true}
              />
            </div>
          )}
        </>
      )}

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="home" />
    </div>
  );
};

// ================================================================
// SECTOR PERFORMANCE
// ================================================================

const SectorPerformance = ({ categories, trending, t }) => {
  const gainers = categories.filter((c) => c.market_cap_change_24h > 0).slice(0, 5);
  const losers = categories
    .filter((c) => c.market_cap_change_24h < 0)
    .sort((a, b) => a.market_cap_change_24h - b.market_cap_change_24h)
    .slice(0, 5);

  const maxAbs = Math.max(
    1,
    ...gainers.map((c) => Math.abs(c.market_cap_change_24h || 0)),
    ...losers.map((c) => Math.abs(c.market_cap_change_24h || 0))
  );

  return (
    <CardShell>
      <CardHead
        icon={<IconFlame className="w-3.5 h-3.5" />}
        label={t("overview.sector_perf")}
        right={
          trending?.categories?.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {t("overview.trending")}
              </span>
              {trending.categories.slice(0, 3).map((cat, i) => (
                <a
                  key={i}
                  href={`https://www.coingecko.com/en/categories/${cat.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] px-2 py-0.5 bg-ink/[0.04] text-text-primary/70 border border-ink/[0.08] hover:bg-ink/[0.07] hover:border-ink/[0.14] hover:text-text-primary transition-all rounded-sm"
                >
                  {cat.name}
                </a>
              ))}
            </div>
          )
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-ink/[0.06]">
        {/* HOT */}
        <div className="p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-profit" />
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-profit">
              {t("overview.hot")}
            </p>
          </div>
          <div className="space-y-0.5">
            {gainers.length > 0 ? (
              gainers.map((cat, idx) => (
                <SectorRow key={idx} cat={cat} rank={idx + 1} maxAbs={maxAbs} />
              ))
            ) : (
              <p className="text-text-muted font-mono text-xs uppercase tracking-wider py-2">
                {t("overview.no_gain_sec")}
              </p>
            )}
          </div>
        </div>

        {/* COOL */}
        <div className="p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-negative" />
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-loss">
              {t("overview.cool")}
            </p>
          </div>
          <div className="space-y-0.5">
            {losers.length > 0 ? (
              losers.map((cat, idx) => (
                <SectorRow key={idx} cat={cat} rank={idx + 1} maxAbs={maxAbs} isNeg />
              ))
            ) : (
              <p className="text-text-muted font-mono text-xs uppercase tracking-wider py-2">
                {t("overview.no_lose_sec")}
              </p>
            )}
          </div>
        </div>
      </div>
    </CardShell>
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
    <CardShell>
      <CardHead icon={<IconPulse className="w-3.5 h-3.5" />} label={t("overview.deriv_pulse")} />
      <div className="p-5">
        {/* LONG/SHORT BARS */}
        {ls && (
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-3 font-mono text-[8px] uppercase tracking-wider text-text-muted/70">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-sm bg-profit" />
                Long
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-sm bg-negative" />
                Short
              </span>
            </div>
            {Object.entries(ls).map(([sym, val]) => {
              const longPct = Number(val.long) || 0;
              const shortPct = Number(val.short) || 0;
              const netLong = longPct >= shortPct;
              return (
                <div key={sym}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-text-primary font-semibold">{sym}</span>
                    <span
                      className={`font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${netLong ? "text-profit border-profit/25 bg-profit/10" : "text-loss border-loss/25 bg-loss/10"}`}
                    >
                      {netLong ? "Net Long" : "Net Short"}
                    </span>
                  </div>
                  <div className="relative flex h-3.5 overflow-hidden rounded-md bg-ink/[0.04]">
                    <div
                      className="bg-gradient-to-r from-positive to-positive flex items-center pl-1.5 transition-all duration-700"
                      style={{ width: `${longPct}%` }}
                    >
                      {longPct >= 16 && (
                        <span className="font-mono text-[9px] text-black/75 font-bold tabular-nums">
                          {longPct}%
                        </span>
                      )}
                    </div>
                    <div
                      className="bg-gradient-to-l from-negative to-negative flex items-center justify-end pr-1.5 transition-all duration-700"
                      style={{ width: `${shortPct}%` }}
                    >
                      {shortPct >= 16 && (
                        <span className="font-mono text-[9px] text-black/75 font-bold tabular-nums">
                          {shortPct}%
                        </span>
                      )}
                    </div>
                    <span className="absolute inset-y-0 left-1/2 w-px bg-ink/15 pointer-events-none" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* OPEN INTEREST */}
        {oi && (
          <div className="flex justify-between items-center py-2.5 px-3 bg-ink/[0.02] border border-ink/[0.06] mb-3 rounded-lg">
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              {t("overview.total_oi")}
            </span>
            <span className="text-text-primary font-mono text-base font-light tabular-nums">
              {formatLargeNumber(oi.total_usd)}
            </span>
          </div>
        )}

        {/* FUNDING */}
        {funding && (
          <div className="pt-2 border-t border-ink/[0.06]">
            <div className="flex items-center justify-between mb-2.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {t("overview.funding")}
              </span>
              <span
                className={`font-mono text-[10px] tabular-nums ${funding.avg_rate >= 0 ? "text-profit" : "text-loss"}`}
              >
                {t("overview.avg")} {funding.avg_rate >= 0 ? "+" : ""}
                {funding.avg_rate}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="space-y-1">
                {(funding.most_long || []).slice(0, 3).map((f, i) => (
                  <div
                    key={`l${i}`}
                    className="flex justify-between items-center text-[10px] py-1 px-1.5 bg-profit/[0.06] border border-profit/20 rounded-sm"
                  >
                    <span className="font-mono text-text-primary">{f.symbol}</span>
                    <span className="font-mono text-profit tabular-nums">+{f.rate_pct}%</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {(funding.most_short || []).slice(0, 3).map((f, i) => (
                  <div
                    key={`s${i}`}
                    className="flex justify-between items-center text-[10px] py-1 px-1.5 bg-negative/[0.06] border border-loss/20 rounded-sm"
                  >
                    <span className="font-mono text-text-primary">{f.symbol}</span>
                    <span className="font-mono text-loss tabular-nums">{f.rate_pct}%</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-text-muted font-mono text-[9px] uppercase tracking-wider mt-2.5 text-center opacity-50">
              {funding.total_symbols} {t("overview.pairs_tracked")}
            </p>
          </div>
        )}
      </div>
    </CardShell>
  );
};

// ================================================================
// COIN LIST CARD (Gainers / Losers)
// ================================================================

const CoinListCard = ({ title, icon, coins, isLoser }) => (
  <CardShell>
    <CardHead icon={icon} label={title} />
    <div className="divide-y divide-ink/[0.04]">
      {coins.map((coin, idx) => (
        <CoinRow key={idx} coin={coin} rank={idx + 1} isLoser={isLoser} />
      ))}
    </div>
  </CardShell>
);

// ================================================================
// HELPER COMPONENTS
// ================================================================

/** Indicator bar — neutral fill; colour is only for semantic PnL elsewhere */
const IndicatorRow = ({ label, value, pct, max = 100, opacity = 1 }) => (
  <div>
    <div className="flex justify-between items-baseline mb-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <span className="text-text-primary font-mono text-sm tabular-nums">{value}</span>
    </div>
    <div className="h-1.5 bg-ink/[0.04] overflow-hidden rounded-full">
      <div
        className="h-full transition-all duration-700 rounded-full bg-text-primary"
        style={{
          width: `${Math.min((pct / max) * 100, 100)}%`,
          opacity: Math.max(0.35, opacity * 0.7),
        }}
      />
    </div>
  </div>
);

const FGStat = ({ label, value }) => (
  <div className="text-center">
    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted mb-1.5">
      {label}
    </p>
    <p className="font-mono text-sm tabular-nums" style={{ color: fgStroke(value) }}>
      {value}
    </p>
  </div>
);

/**
 * Fear & Greed color scale — muted, not neon
 */
const fgStroke = (val) => {
  if (val >= 75) return "#4ade80"; // profit (extreme greed)
  if (val >= 50) return "rgb(var(--accent))"; // gold (greed/neutral high)
  if (val >= 25) return "#fbbf24"; // amber muted (fear)
  return "#f87171"; // loss (extreme fear)
};

/**
 * Metric Card — compact stat card with icon + change pill
 */
const TriUp = ({ className = "w-2 h-2" }) => (
  <svg viewBox="0 0 12 12" fill="currentColor" className={className} aria-hidden="true">
    <path d="M6 2.5l4.2 7.2a.5.5 0 0 1-.43.75H2.23a.5.5 0 0 1-.43-.75L6 2.5z" />
  </svg>
);
const TriDown = ({ className = "w-2 h-2" }) => (
  <svg viewBox="0 0 12 12" fill="currentColor" className={className} aria-hidden="true">
    <path d="M6 9.5L1.8 2.3a.5.5 0 0 1 .43-.75h7.54a.5.5 0 0 1 .43.75L6 9.5z" />
  </svg>
);

const MetricCard = ({ label, value, change, icon }) => (
  <div className="group bg-surface-raised flex items-center gap-3 px-4 py-3.5 hover:bg-ink/[0.02] transition-colors">
    <span className="w-8 h-8 flex items-center justify-center rounded-md border border-ink/[0.08] bg-ink/[0.04] text-text-primary/60 flex-shrink-0">
      {icon}
    </span>
    <div className="min-w-0">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted leading-tight truncate">
        {label}
      </p>
      <div className="flex items-baseline gap-2 mt-1.5">
        <p className="font-mono text-lg lg:text-xl font-semibold text-text-primary tabular-nums leading-none">
          {value}
        </p>
        {change !== undefined && (
          <span
            className={`font-mono text-[10px] tabular-nums inline-flex items-center gap-0.5 ${change >= 0 ? "text-profit" : "text-loss"}`}
          >
            {change >= 0 ? <TriUp /> : <TriDown />}
            {change >= 0 ? "+" : ""}
            {change?.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  </div>
);

const CoinRow = ({ coin, rank, isLoser }) => (
  <div className="flex items-center justify-between px-4 sm:px-5 py-3 hover:bg-ink/[0.02] transition-colors group">
    <div className="flex items-center gap-3 min-w-0">
      <span className="font-mono text-[10px] text-text-muted/50 tabular-nums w-4 text-right flex-shrink-0">
        {rank}
      </span>
      <img
        src={coin.image}
        alt={coin.symbol}
        className="w-7 h-7 rounded-full border border-ink/[0.06] flex-shrink-0"
        onError={(e) => {
          e.target.style.display = "none";
        }}
      />
      <div className="min-w-0">
        <p className="font-mono text-sm text-text-primary group-hover:text-text-primary transition-colors">
          {coin.symbol.toUpperCase()}
        </p>
        <p className="text-text-muted text-[10px] hidden sm:block truncate max-w-[140px]">
          {coin.name}
        </p>
      </div>
    </div>
    <div className="text-right flex-shrink-0">
      <p className="font-mono text-sm text-text-primary tabular-nums">
        ${coin.current_price?.toLocaleString()}
      </p>
      <p className={`font-mono text-[11px] tabular-nums ${isLoser ? "text-loss" : "text-profit"}`}>
        {(coin.price_change_percentage_24h || 0) >= 0 ? "+" : ""}
        {(coin.price_change_percentage_24h || 0).toFixed(2)}%
      </p>
    </div>
  </div>
);

const SectorRow = ({ cat, rank, isNeg, maxAbs = 1 }) => {
  const change = cat.market_cap_change_24h || 0;
  const cgUrl = `https://www.coingecko.com/en/categories/${cat.id}`;
  const fillPct = Math.max(4, Math.round((Math.abs(change) / maxAbs) * 100));
  return (
    <a
      href={cgUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="relative flex items-center justify-between py-2 px-2 hover:bg-ink/[0.02] transition-all cursor-pointer group rounded-md overflow-hidden"
    >
      <div
        className={`absolute inset-y-0 left-0 pointer-events-none ${isNeg ? "bg-negative/[0.05]" : "bg-profit/[0.05]"}`}
        style={{ width: `${fillPct}%` }}
      />
      <div className="relative flex items-center gap-3 min-w-0 flex-1">
        <span className="font-mono text-[10px] text-text-muted/60 w-4 text-right tabular-nums">
          {rank}
        </span>
        <div className="flex -space-x-1.5 flex-shrink-0">
          {(cat.top_3_coins || []).map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="w-4 h-4 rounded-full border border-surface-raised bg-surface-raised"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          ))}
        </div>
        <span className="text-text-primary text-sm truncate group-hover:text-text-primary transition-colors">
          {cat.name}
        </span>
      </div>
      <div className="relative flex items-center gap-3 flex-shrink-0">
        <span className="font-mono text-[10px] text-text-muted tabular-nums hidden sm:inline">
          {formatLargeNumber(cat.market_cap)}
        </span>
        <span
          className={`font-mono text-xs tabular-nums min-w-[56px] text-right ${isNeg ? "text-loss" : "text-profit"}`}
        >
          {change >= 0 ? "+" : ""}
          {change?.toFixed(2)}%
        </span>
      </div>
    </a>
  );
};

const formatLargeNumber = (num) => {
  if (!num) return "$0";
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(0)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(0)}M`;
  return `$${num.toFixed(2)}`;
};

export default OverviewPage;
