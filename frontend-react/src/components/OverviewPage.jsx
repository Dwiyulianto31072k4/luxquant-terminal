import Seo from "./Seo";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import TopPerformers from "./TopPerformers";
import GateMarketTable from "./market/GateMarketTable";
import GateSnapshotRow from "./market/GateSnapshotRow";
import SectorCoinsModal from "./SectorCoinsModal";
import AssistantWidget from "./assistant/AssistantWidget";
import { ShimmerStyles } from "./ui/Loaders";

const API_BASE = "/api/v1";

// ================================================================
// INLINE SVG ICONS (Lucide-style, no emoji)
// ================================================================






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

const CardHead = ({ label, right }) => (
  // Sentence case, no icon tile, no tinted band. The tables on this page label
  // themselves with plain text; a panel that shouts ITS NAME IN CAPS beside
  // them reads as a different product. `icon` is accepted and ignored so the
  // call sites stay unchanged.
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/[0.06] px-4 py-3 sm:px-5">
    <h3 className="min-w-0 truncate text-[13px] font-semibold tracking-tight text-text-primary">
      {label}
    </h3>
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
  // fetchAll only asks "is anything on screen yet?" — via a ref so the answer is
  // current, rather than whatever it was on first render.
  const dataRef = useRef(null);
  dataRef.current = data;

  const fetchAll = useCallback(async () => {
    try {
      setMarketError(null);
      const [globalRes, catRes, trendRes, derivRes] = await Promise.allSettled([
        fetch(`${API_BASE}/market/global`),
        fetch(`${API_BASE}/market/categories?limit=30`),
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
            volumeChange24h: globalData?.volume_change_percentage_24h_usd ?? null,
            markets: globalData?.markets || 0,
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
        } else if (!dataRef.current) {
          setMarketError("Failed to fetch market data");
        }
      } else if (!dataRef.current) {
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
      if (!dataRef.current) setMarketError(err.message);
    } finally {
      setMarketLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 120000);
    return () => clearInterval(interval);
  }, [fetchAll]);


  return (
    <div className="space-y-5 lg:space-y-7">
      <Seo
        title="Market Overview — Live Crypto Data & Analytics | LuxQuant Terminal"
        description="Live crypto market overview: top movers, sector rotation, and quantitative analytics from LuxQuant Terminal. Real-time data, decided by you."
        path="/home"
        keywords="crypto market overview, live crypto data, market analytics, luxquant"
      />
      

      <TopPerformers />

      {/* Gate's four-card strip. Fed entirely from state already fetched above,
          so it adds no request of its own. */}
      <GateSnapshotRow hot={data?.topCoins} gainers={data?.topGainers} />

      {/* MARKET TABLE — the Gate /price anchor: quick filters, sortable columns,
          a 24h sparkline per row and a dumbbell for where price sits in range.
          Sits below Top Gainers, which stays the first thing on the page. */}
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold leading-none tracking-tight text-text-primary sm:text-xl">
          Crypto Market Data
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
          Live prices, 24h movement, volume and market cap across the top 100 pairs.
        </p>
      </div>
      <GateMarketTable pageSize={10} />

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
                />
                <MetricCard
                  label={t("overview.vol_24h")}
                  value={formatLargeNumber(data.totalVolume24h)}
                  change={data.volumeChange24h}
                />
                <MetricCard
                  label={t("overview.btc_dom")}
                  value={`${data.btcDominance.toFixed(1)}%`}
                  sub={`ETH ${data.ethDominance?.toFixed(1)}%`}
                />
                <MetricCard
                  label={t("overview.active_crypto")}
                  value={data.activeCryptos.toLocaleString()}
                  sub={data.markets ? `${data.markets.toLocaleString()} markets` : undefined}
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
                        <span className="text-[11px] text-text-muted">{t("overview.alt_mcap")}</span>
                        <span className="text-text-primary font-mono text-sm tabular-nums">
                          {formatLargeNumber(data.altcoinMarketCap)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[11px] text-text-muted">{t("overview.eth_btc")}</span>
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
                      <div className="pointer-events-none absolute inset-x-2 bottom-0 flex justify-between text-[10px] text-text-muted">
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
                        className="mt-1 text-[11px]"
                        style={{ color: fgStroke(data.fearGreed.value) }}
                      >
                        {data.fearGreed.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 w-full">
                      <FGStat label={t("overview.yesterday")} value={data.fearGreed.yesterday} />
                      <FGStat label={t("overview.last_week")} value={data.fearGreed.lastWeek} />
                      <div className="text-center">
                        <p className="mb-1.5 text-[11px] text-text-muted">{t("overview.trend")}</p>
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
                <span className="text-[11px] text-text-muted">
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
  // Same drill-down Money Flow uses — one component, so the two pages cannot
  // drift apart.
  const [drillSector, setDrillSector] = useState(null);

  // ONE ranked list, not two columns. The old layout kept a "cooling down"
  // column that was empty nearly every day — the page asked for the ten
  // biggest movers, and on any green day all ten are gainers, so the column
  // was empty by construction rather than by market. Ranked top-down, the
  // sign of each row does that job, and a day with no fallers simply has no
  // red rows instead of a panel half-filled with "NO LOSING SECTORS".
  const rows = [...categories]
    .sort((a, b) => (b.market_cap_change_24h || 0) - (a.market_cap_change_24h || 0))
    .slice(0, 8);

  const maxAbs = Math.max(1, ...rows.map((c) => Math.abs(c.market_cap_change_24h || 0)));

  return (
    <>
      <CardShell>
        <CardHead
          label={t("overview.sector_perf")}
          right={
            trending?.categories?.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-text-muted">{t("overview.trending")}</span>
                {trending.categories.slice(0, 3).map((cat, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setDrillSector(cat)}
                    className="rounded-md bg-ink/[0.04] px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-ink/[0.08] hover:text-text-primary"
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )
          }
        />

        <div className="hidden items-center gap-3 border-b border-ink/[0.06] px-4 py-2 text-[11px] text-text-muted sm:flex sm:px-5">
          <span className="w-4" />
          <span className="flex-1">Narrative</span>
          <span className="w-[150px] text-center">24h move</span>
          <span className="w-24 text-right">Market cap</span>
          <span className="w-24 text-right">24h volume</span>
          <span className="w-3.5" />
        </div>

        <div className="divide-y divide-ink/[0.04]">
          {rows.map((cat, idx) => (
            <SectorRow
              key={cat.id || idx}
              cat={cat}
              rank={idx + 1}
              maxAbs={maxAbs}
              onOpen={setDrillSector}
            />
          ))}
        </div>
        <p className="border-t border-ink/[0.06] px-4 py-2.5 text-[11px] text-text-muted sm:px-5">
          Sectors above $25M market cap, ranked by 24h change. Tap one for its coins.
        </p>
      </CardShell>
      <SectorCoinsModal
        sector={drillSector}
        isOpen={!!drillSector}
        onClose={() => setDrillSector(null)}
      />
    </>
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
            <div className="flex items-center gap-3 text-[11px] text-text-muted">
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
                      className={`rounded-md px-1.5 py-0.5 text-[10.5px] ${netLong ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"}`}
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
            <span className="text-[11px] text-text-muted">
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
              <span className="text-[11px] text-text-muted">
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
            <p className="mt-2.5 text-center text-[11px] text-text-muted">
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

const CoinListCard = ({ title, icon, coins, isLoser }) => {
  // A "top loser" at half a percent is not a loser, it is a flat tape. Saying
  // so costs one line and stops the card implying a sell-off that is not
  // there — the same reason the gainers side says it when nothing is running.
  const extreme = Math.max(
    0,
    ...(coins || []).map((c) => Math.abs(c.price_change_percentage_24h || 0))
  );
  const quiet = extreme < 2;
  return (
    <CardShell>
      <CardHead icon={icon} label={title} />
      <div className="divide-y divide-ink/[0.04]">
        {coins.map((coin, idx) => (
          <CoinRow key={idx} coin={coin} rank={idx + 1} isLoser={isLoser} />
        ))}
      </div>
      {quiet && coins?.length > 0 ? (
        <p className="border-t border-ink/[0.06] px-4 py-2.5 text-[11px] text-text-muted sm:px-5">
          {isLoser
            ? "Nothing fell more than 2% today — the market is flat, not selling off."
            : "Nothing ran more than 2% today — a quiet tape."}
        </p>
      ) : null}
    </CardShell>
  );
};

// ================================================================
// HELPER COMPONENTS
// ================================================================

/** Indicator bar — neutral fill; colour is only for semantic PnL elsewhere */
const IndicatorRow = ({ label, value, pct, max = 100, opacity = 1 }) => (
  <div>
    <div className="flex justify-between items-baseline mb-1.5">
      <span className="text-[11px] text-text-muted">{label}</span>
      <span className="font-mono text-sm tabular-nums text-text-primary">{value}</span>
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
    <p className="mb-1.5 text-[11px] text-text-muted">{label}</p>
    <p className="font-mono text-sm tabular-nums" style={{ color: fgStroke(value) }}>
      {value}
    </p>
  </div>
);

/**
 * Live market ribbon item — a single stat in the top context strip.
 * Hairline left divider (except the first), muted label + primary value, with
 * an optional 24h change or a coloured tag (e.g. Fear & Greed label).
 */
/** Signed compact money for daily ETF net flow (e.g. -$49.8M, +$226.9M). */

/** Tiny inline sparkline (points oldest→newest). Pure SVG — no per-card chart instance. */

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

const MetricCard = ({ label, value, change, sub }) => (
  // Label, number, and its change — in that order, left aligned, one per tile.
  // The old tile spent a third of its width on a grey icon square that carried
  // no information, then had to shrink the number that did.
  <div className="bg-surface-raised px-4 py-3.5 transition-colors hover:bg-ink/[0.02]">
    <p className="truncate text-[11px] leading-tight text-text-muted">{label}</p>
    <div className="mt-1.5 flex items-baseline gap-2">
      <p className="font-mono text-lg font-semibold leading-none tabular-nums text-text-primary lg:text-xl">
        {value}
      </p>
      {change !== undefined && change !== null && (
        <span
          className={`inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums ${
            change >= 0 ? "text-profit" : "text-loss"
          }`}
        >
          {change >= 0 ? <TriUp /> : <TriDown />}
          {change >= 0 ? "+" : ""}
          {change?.toFixed(2)}%
        </span>
      )}
    </div>
    {sub ? <p className="mt-1 truncate text-[11px] text-text-muted">{sub}</p> : null}
  </div>
);

const CoinRow = ({ coin, rank, isLoser }) => (
  // Identity left, price right, change under the price — the same shape the
  // two tables on this page use, so a reader learns one row and reads all of
  // them.
  <div className="group flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-ink/[0.02] sm:px-5">
    <div className="flex min-w-0 items-center gap-3">
      <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-text-muted">
        {rank}
      </span>
      <img
        src={coin.image}
        alt=""
        className="h-7 w-7 shrink-0 rounded-full border border-ink/[0.06]"
        onError={(e) => {
          e.target.style.display = "none";
        }}
      />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-medium text-text-primary">
          {coin.symbol.toUpperCase()}
        </p>
        <p className="hidden max-w-[140px] truncate text-[11px] text-text-muted sm:block">
          {coin.name}
        </p>
      </div>
    </div>
    <div className="shrink-0 text-right leading-tight">
      <p className="font-mono text-[13px] tabular-nums text-text-primary">
        ${coin.current_price?.toLocaleString()}
      </p>
      <p className={`font-mono text-[11px] tabular-nums ${isLoser ? "text-loss" : "text-profit"}`}>
        {(coin.price_change_percentage_24h || 0) >= 0 ? "+" : ""}
        {(coin.price_change_percentage_24h || 0).toFixed(2)}%
      </p>
    </div>
  </div>
);

const SectorRow = ({ cat, rank, maxAbs, onOpen }) => {
  const change = cat.market_cap_change_24h || 0;
  const up = change >= 0;
  // A bar that grows from the centre: right for a sector that rose, left for
  // one that fell, every row on the same scale. Two separate lists could only
  // be compared by reading the numbers.
  const width = `${Math.min(50, (Math.abs(change) / maxAbs) * 50)}%`;
  return (
    <button
      type="button"
      onClick={() => onOpen?.(cat)}
      className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink/[0.02] sm:px-5"
    >
      <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-text-muted">
        {rank}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <div className="flex shrink-0 -space-x-1.5">
          {(cat.top_3_coins || []).slice(0, 3).map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="h-4 w-4 rounded-full border border-surface-raised bg-surface-raised"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          ))}
        </div>
        <span className="truncate text-[13px] text-text-primary">{cat.name}</span>
      </div>

      <div className="hidden w-[150px] shrink-0 items-center sm:flex">
        <div className="relative h-[6px] w-full rounded-full bg-ink/[0.04]">
          <span className="absolute inset-y-0 left-1/2 w-px bg-ink/[0.10]" />
          <span
            className={`absolute top-0 h-full rounded-full ${up ? "bg-positive" : "bg-negative"}`}
            style={up ? { left: "50%", width } : { right: "50%", width }}
          />
        </div>
      </div>

      <span
        className={`w-[70px] shrink-0 text-right font-mono text-[12.5px] tabular-nums ${
          up ? "text-profit" : "text-loss"
        }`}
      >
        {up ? "+" : ""}
        {change.toFixed(2)}%
      </span>
      <span className="hidden w-24 shrink-0 text-right font-mono text-[12px] tabular-nums text-text-secondary sm:inline">
        {formatLargeNumber(cat.market_cap)}
      </span>
      <span className="hidden w-24 shrink-0 text-right font-mono text-[12px] tabular-nums text-text-muted sm:inline">
        {cat.volume_24h ? formatLargeNumber(cat.volume_24h) : "—"}
      </span>
      <svg
        className="hidden h-3.5 w-3.5 shrink-0 text-text-muted/40 transition-colors group-hover:text-text-primary/70 sm:block"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
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
