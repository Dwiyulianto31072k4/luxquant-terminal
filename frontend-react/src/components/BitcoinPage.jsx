import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import NewsPreviewModal from "./NewsPreviewModal";

const API_BASE = "/api/v1";

const BitcoinPage = () => {
  const { t } = useTranslation();

  const [data, setData] = useState(null);
  const [extra, setExtra] = useState({
    technical: null,
    network: null,
    onchain: null,
    news: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newsPage, setNewsPage] = useState(0);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const NEWS_PER_PAGE = 12;

  useEffect(() => {
    fetchAll();
    const i1 = setInterval(fetchAll, 60000);
    return () => clearInterval(i1);
  }, []);

  const fetchAll = async () => {
    try {
      setError(null);
      const [btcRes, fullRes] = await Promise.all([
        fetch(`${API_BASE}/market/bitcoin`),
        fetch(`${API_BASE}/market/bitcoin/full`),
      ]);
      if (btcRes.ok) setData(await btcRes.json());
      if (fullRes.ok) {
        const f = await fullRes.json();
        setExtra({
          technical: f.technical,
          network: f.network,
          onchain: f.onchain,
          news: f.news,
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getApiTranslation = (str) => {
    if (!str) return '';
    const key = str.toLowerCase().replace(/ /g, '_');
    const translated = t(`btc.${key}`);
    return translated === `btc.${key}` ? str : translated;
  };

  const translateTimeAgo = (timeStr) => {
    if (!timeStr) return '';
    let res = timeStr.toLowerCase();
    res = res.replace('h ago', ` ${t('btc.h_ago')}`);
    res = res.replace('m ago', ` ${t('btc.m_ago')}`);
    res = res.replace('d ago', ` ${t('btc.d_ago')}`);
    return res;
  };

  if (loading) return <LoadingSkeleton />;
  if (error)
    return (
      <ErrorState
        error={error}
        onRetry={() => {
          setLoading(true);
          fetchAll();
        }}
        t={t}
      />
    );
  if (!data) return null;

  const supplyPct =
    data.maxSupply > 0 ? (data.circulatingSupply / data.maxSupply) * 100 : 0;
  const { technical, network, onchain, news } = extra;

  return (
    <div className="space-y-6">
      <style>{`
        @keyframes pulseGlow{0%,100%{opacity:.4}50%{opacity:.8}}
        @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .hero-glow{position:absolute;top:-60px;right:-60px;width:280px;height:280px;background:radial-gradient(circle,rgba(212,168,83,.15) 0%,transparent 70%);pointer-events:none;animation:pulseGlow 4s ease-in-out infinite}
        .hero-glow-left{position:absolute;bottom:-40px;left:-40px;width:200px;height:200px;background:radial-gradient(circle,rgba(212,168,83,.08) 0%,transparent 70%);pointer-events:none}
        .card-hover{transition:all .3s cubic-bezier(.4,0,.2,1)}
        .card-hover:hover{transform:translateY(-2px);border-color:rgba(212,168,83,.3);box-shadow:0 8px 32px rgba(0,0,0,.3),0 0 0 1px rgba(212,168,83,.1)}
        .fade-in{animation:fadeInUp .5s ease-out forwards;opacity:0}
        .fade-in-1{animation-delay:.05s}.fade-in-2{animation-delay:.1s}.fade-in-3{animation-delay:.15s}.fade-in-4{animation-delay:.2s}
        .fear-ring{box-shadow:0 0 24px rgba(239,68,68,.35),inset 0 0 18px rgba(239,68,68,.1)}
        .fear-ring-green{box-shadow:0 0 24px rgba(34,197,94,.35),inset 0 0 18px rgba(34,197,94,.1)}
        .fear-ring-lime{box-shadow:0 0 24px rgba(132,204,22,.35),inset 0 0 18px rgba(132,204,22,.1)}
        .fear-ring-orange{box-shadow:0 0 24px rgba(212,168,83,.4),inset 0 0 18px rgba(212,168,83,.12)}
        .btc-icon-glow{box-shadow:0 0 30px rgba(212,168,83,.5),0 0 60px rgba(212,168,83,.25)}
        .price-glow{text-shadow:0 0 40px rgba(255,255,255,.15)}
        .supply-bar-glow{box-shadow:0 0 12px rgba(212,168,83,.5),0 0 4px rgba(212,168,83,.6)}
        .ath-gradient{background:linear-gradient(135deg,rgba(212,168,83,.06) 0%,rgba(212,168,83,.02) 100%)}
        .news-featured:hover .news-img{transform:scale(1.05)}
        .news-img{transition:transform .5s cubic-bezier(.4,0,.2,1)}
        .icon-tile{
          background:radial-gradient(circle at 30% 25%, rgba(253,230,168,.18), transparent 65%), rgba(212,168,83,.08);
          border:1px solid rgba(212,168,83,.2);
          color:#f5d088;
        }
      `}</style>

      {/* ── HERO ── */}
      <div className="relative glass-card rounded-2xl p-7 border border-gold-primary/20 overflow-hidden fade-in">
        <div className="hero-glow" />
        <div className="hero-glow-left" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />

        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            <div className="btc-icon-glow w-16 h-16 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-gold-light/20 to-gold-dark/20 border border-gold-primary/30">
              <img
                src="https://assets.coingecko.com/coins/images/1/standard/bitcoin.png"
                alt="Bitcoin"
                className="w-12 h-12 object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-display font-bold text-white tracking-tight">
                  {t('btc.title')}
                </h1>
                <span className="px-2.5 py-1 bg-gold-primary/15 text-gold-primary text-[11px] font-bold rounded-md border border-gold-primary/25 tracking-wide">
                  {t('btc.rank')} #{data.marketCapRank}
                </span>
              </div>
              <p className="text-text-muted text-[13px] mt-1.5 tracking-wide">
                BTC · {t('btc.network')}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-5xl font-display font-bold text-white price-glow tracking-tight leading-none">
              $
              {data.price?.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <div className="flex items-center gap-2 justify-end mt-3">
              <PriceBadge label="24h" value={data.priceChange24h} />
              <PriceBadge label="7d" value={data.priceChange7d} />
              <PriceBadge label="30d" value={data.priceChange30d} />
            </div>
          </div>
        </div>
      </div>

      {/* ── KEY METRICS ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label={t('btc.range_24h')}
          value={`$${fmtNum(data.low24h)} – $${fmtNum(data.high24h)}`}
          iconType="range"
          delay="1"
        />
        <MetricCard
          label={t('btc.mcap')}
          value={`$${fmtLarge(data.marketCap)}`}
          iconType="mcap"
          delay="2"
        />
        <MetricCard
          label={t('btc.vol_24h')}
          value={`$${fmtLarge(data.volume24h)}`}
          iconType="volume"
          delay="3"
        />
        <MetricCard
          label={t('btc.dominance')}
          value={`${data.dominance?.toFixed(1)}%`}
          iconType="dominance"
          delay="4"
        />
      </div>

      {/* ── SUPPLY / ATH / FEAR & GREED ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Supply */}
        <div className="glass-card rounded-xl p-6 border border-gold-primary/12 card-hover fade-in fade-in-1 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <SectionLabel>{t('btc.supply')}</SectionLabel>
          <div className="space-y-3 mt-3">
            <div className="flex justify-between items-baseline">
              <span className="text-text-muted text-[13px]">{t('btc.circulating')}</span>
              <span className="text-white font-mono text-base font-bold">
                {(data.circulatingSupply / 1e6).toFixed(2)}M
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-text-muted text-[13px]">{t('btc.max_supply')}</span>
              <span className="text-white font-mono text-base font-bold">
                21M
              </span>
            </div>
            <div className="relative pt-1">
              <div className="w-full bg-white/5 rounded-full h-2.5">
                <div
                  className="bg-gradient-to-r from-gold-dark via-gold-primary to-gold-light h-2.5 rounded-full supply-bar-glow transition-all duration-1000"
                  style={{ width: `${supplyPct}%` }}
                />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-text-muted text-[11px]">0%</span>
                <span className="text-gold-primary text-[12px] font-bold">
                  {supplyPct.toFixed(2)}% {t('btc.mined')}
                </span>
                <span className="text-text-muted text-[11px]">100%</span>
              </div>
            </div>
          </div>
        </div>

        {/* ATH */}
        <div className="glass-card rounded-xl p-6 border border-gold-primary/12 card-hover fade-in fade-in-2 relative overflow-hidden ath-gradient">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
          <SectionLabel>{t('btc.ath')}</SectionLabel>
          <p className="text-3xl font-display font-bold text-white tracking-tight mt-3">
            ${data.ath?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-bold ${data.athChange >= 0 ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "bg-red-500/15 text-red-400 border border-red-500/25"}`}
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                {data.athChange >= 0 ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                )}
              </svg>
              {Math.abs(data.athChange)?.toFixed(2)}%
            </div>
            <span className="text-text-muted text-[12px]">{t('btc.from_ath')}</span>
          </div>
        </div>

        {/* Fear & Greed */}
        <div className="glass-card rounded-xl p-6 border border-gold-primary/12 card-hover fade-in fade-in-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <SectionLabel>{t('btc.fg_index')}</SectionLabel>
          <div className="flex items-center gap-4 mt-3">
            {(() => {
              const v = data.fearGreed?.value ?? 0;
              const ring =
                v >= 75
                  ? "fear-ring-green"
                  : v >= 50
                    ? "fear-ring-lime"
                    : v >= 25
                      ? "fear-ring-orange"
                      : "fear-ring";
              const bg =
                v >= 75
                  ? "from-emerald-500 to-emerald-600"
                  : v >= 50
                    ? "from-lime-500 to-lime-600"
                    : v >= 25
                      ? "from-gold-primary to-gold-dark"
                      : "from-red-500 to-red-600";
              return (
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white bg-gradient-to-br ${bg} ${ring}`}
                >
                  {v}
                </div>
              );
            })()}
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-lg">
                {data.fearGreed?.label}
              </p>
              <p className="text-text-muted text-[12px] mt-0.5">
                {t('btc.sentiment')}
              </p>
              <div className="flex items-center gap-0.5 mt-2">
                {[...Array(10)].map((_, i) => {
                  const v = data.fearGreed?.value ?? 0;
                  const active = i < Math.ceil(v / 10);
                  const c =
                    v >= 75
                      ? "bg-emerald-500"
                      : v >= 50
                        ? "bg-lime-500"
                        : v >= 25
                          ? "bg-gold-primary"
                          : "bg-red-500";
                  return (
                    <div
                      key={i}
                      className={`w-3 h-1 rounded-full ${active ? c : "bg-white/10"}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BTC CHART (TradingView Advanced) ── */}
      <div className="glass-card rounded-xl border border-gold-primary/12 overflow-hidden fade-in">
        <div className="relative">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent z-10" />
          <BtcTradingViewChart t={t} />
        </div>
      </div>

      {/* ── TECHNICAL + NETWORK/ONCHAIN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Technical Analysis */}
        <div className="glass-card rounded-xl p-6 border border-gold-primary/12 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-white font-bold text-lg tracking-tight">
                {t('btc.tech_analysis')}
              </h3>
              <p className="text-text-muted text-[12px] mt-1">
                {t('btc.tech_desc')}
              </p>
            </div>
            {technical?.summary && (
              <span
                className={`px-3 py-1.5 rounded-lg text-[12px] font-bold ${technical.summary.includes("Strong Buy") ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(34,197,94,.15)]" : technical.summary.includes("Buy") ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : technical.summary.includes("Strong Sell") ? "bg-red-500/20 text-red-400 border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,.15)]" : technical.summary.includes("Sell") ? "bg-red-500/15 text-red-400 border border-red-500/25" : "bg-gold-primary/15 text-gold-primary border border-gold-primary/25"}`}
              >
                {getApiTranslation(technical.summary)}
              </span>
            )}
          </div>
          {!technical ? (
            <EmptyState text={t('btc.loading_tech')} />
          ) : (
            <div className="space-y-4">
              {/* RSI */}
              <div>
                <SectionLabel>RSI (14)</SectionLabel>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {["1h", "4h", "1d"].map((tf) => {
                    const d = technical.timeframes?.[tf];
                    if (!d)
                      return (
                        <div
                          key={tf}
                          className="bg-white/[0.02] rounded-lg p-3 text-center border border-white/5"
                        >
                          <span className="text-text-muted text-[12px]">
                            {tf}
                          </span>
                        </div>
                      );
                    const rsi = d.rsi,
                      over = rsi >= 70,
                      under = rsi <= 30;
                    const c = under
                      ? "text-emerald-400"
                      : over
                        ? "text-red-400"
                        : "text-white";
                    const bc = under
                      ? "border-emerald-500/25"
                      : over
                        ? "border-red-500/25"
                        : "border-white/5";
                    const bgc = under
                      ? "bg-emerald-500/[0.06]"
                      : over
                        ? "bg-red-500/[0.06]"
                        : "bg-white/[0.02]";
                    return (
                      <div
                        key={tf}
                        className={`rounded-lg p-3 text-center border ${bc} ${bgc}`}
                      >
                        <p className="text-text-muted text-[11px] mb-1 font-semibold tracking-wider">
                          {tf.toUpperCase()}
                        </p>
                        <p className={`text-2xl font-bold font-mono ${c}`}>
                          {rsi?.toFixed(1)}
                        </p>
                        <p
                          className={`text-[10px] font-bold uppercase tracking-wide mt-0.5 ${c}`}
                        >
                          {under ? getApiTranslation("Oversold") : over ? getApiTranslation("Overbought") : getApiTranslation("Neutral")}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* MACD */}
              <div>
                <SectionLabel>MACD (12,26,9)</SectionLabel>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {["1h", "4h", "1d"].map((tf) => {
                    const d = technical.timeframes?.[tf]?.macd;
                    if (!d)
                      return (
                        <div
                          key={tf}
                          className="bg-white/[0.02] rounded-lg p-3 text-center border border-white/5"
                        >
                          <span className="text-text-muted text-[12px]">
                            {tf}
                          </span>
                        </div>
                      );
                    const bull = d.histogram > 0;
                    return (
                      <div
                        key={tf}
                        className={`rounded-lg p-3 text-center border ${bull ? "border-emerald-500/20 bg-emerald-500/[0.05]" : "border-red-500/20 bg-red-500/[0.05]"}`}
                      >
                        <p className="text-text-muted text-[11px] mb-1 font-semibold tracking-wider">
                          {tf.toUpperCase()}
                        </p>
                        <p
                          className={`text-base font-bold ${bull ? "text-emerald-400" : "text-red-400"}`}
                        >
                          {bull ? `▲ ${getApiTranslation("Bullish")}` : `▼ ${getApiTranslation("Bearish")}`}
                        </p>
                        <p className="text-text-muted text-[10px] font-mono mt-1">
                          H: {d.histogram?.toFixed(1)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Bollinger + EMA */}
              <div className="grid grid-cols-2 gap-3">
                {(() => {
                  const bb = technical.timeframes?.["4h"]?.bollinger,
                    pos = technical.timeframes?.["4h"]?.bb_position;
                  if (!bb)
                    return (
                      <div className="bg-white/[0.02] rounded-lg p-3.5 border border-white/5">
                        <span className="text-text-muted text-[12px]">
                          BB Loading...
                        </span>
                      </div>
                    );
                  return (
                    <div className="bg-white/[0.02] rounded-lg p-3.5 border border-white/5">
                      <SectionLabel>Bollinger (4H)</SectionLabel>
                      <div className="space-y-1.5 text-[12px] font-mono mt-2">
                        <div className="flex justify-between">
                          <span className="text-red-400/80">{t('btc.upper')}</span>
                          <span className="text-white font-semibold">
                            ${fmtNum(bb.upper)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gold-primary/80">{t('btc.mid')}</span>
                          <span className="text-white font-semibold">
                            ${fmtNum(bb.middle)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-emerald-400/80">{t('btc.lower')}</span>
                          <span className="text-white font-semibold">
                            ${fmtNum(bb.lower)}
                          </span>
                        </div>
                      </div>
                      <div
                        className={`mt-2.5 flex items-center gap-1.5 text-[11px] font-bold ${pos === "near_lower" ? "text-emerald-400" : pos === "near_upper" ? "text-red-400" : "text-gold-primary"}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current" />
                        {pos === "near_lower"
                          ? getApiTranslation("Near Lower Band")
                          : pos === "near_upper"
                            ? getApiTranslation("Near Upper Band")
                            : getApiTranslation("Middle Range")}
                      </div>
                    </div>
                  );
                })()}
                {(() => {
                  const ema =
                    technical.timeframes?.["1d"] ||
                    technical.timeframes?.["4h"];
                  if (!ema?.ema50)
                    return (
                      <div className="bg-white/[0.02] rounded-lg p-3.5 border border-white/5">
                        <span className="text-text-muted text-[12px]">
                          EMA Loading...
                        </span>
                      </div>
                    );
                  const g = ema.ema_cross === "golden_cross";
                  return (
                    <div
                      className={`rounded-lg p-3.5 border ${g ? "border-emerald-500/20 bg-emerald-500/[0.03]" : "border-red-500/20 bg-red-500/[0.03]"}`}
                    >
                      <SectionLabel>EMA 50/200 (1D)</SectionLabel>
                      <div className="space-y-1.5 text-[12px] font-mono mt-2">
                        <div className="flex justify-between">
                          <span className="text-text-muted">EMA 50</span>
                          <span className="text-white font-semibold">
                            ${fmtNum(ema.ema50)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gold-primary/80">EMA 200</span>
                          <span className="text-white font-semibold">
                            ${fmtNum(ema.ema200)}
                          </span>
                        </div>
                      </div>
                      <div
                        className={`mt-2.5 flex items-center gap-1.5 text-[11px] font-bold ${g ? "text-emerald-400" : "text-red-400"}`}
                      >
                        <span className="text-base">✦</span>
                        {g ? getApiTranslation("Golden Cross") : getApiTranslation("Death Cross")}
                      </div>
                    </div>
                  );
                })()}
              </div>
              {/* Signal Meter */}
              {technical.total_signals > 0 && (
                <div className="pt-4 border-t border-white/5">
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="text-emerald-400 font-bold text-[13px]">
                      {t('btc.buy')} ({technical.buy_signals})
                    </span>
                    <span className="text-text-muted text-[11px] uppercase tracking-wider font-bold">
                      {t('btc.signal_meter')}
                    </span>
                    <span className="text-red-400 font-bold text-[13px]">
                      {t('btc.sell')} ({technical.sell_signals})
                    </span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden flex bg-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                      style={{
                        width: `${(technical.buy_signals / technical.total_signals) * 100}%`,
                      }}
                    />
                    <div
                      className="h-full bg-gray-600/50 transition-all duration-700"
                      style={{
                        width: `${((technical.total_signals - technical.buy_signals - technical.sell_signals) / technical.total_signals) * 100}%`,
                      }}
                    />
                    <div
                      className="h-full bg-gradient-to-r from-red-400 to-red-500 transition-all duration-700"
                      style={{
                        width: `${(technical.sell_signals / technical.total_signals) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Network Health */}
          <div className="glass-card rounded-xl p-6 border border-gold-primary/12 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
            <h3 className="text-white font-bold text-lg tracking-tight">
              {t('btc.net_health')}
            </h3>
            <p className="text-text-muted text-[12px] mt-1 mb-4">
              {t('btc.net_desc')}
            </p>
            {!network ? (
              <EmptyState text={t('btc.loading_net')} />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat
                    label={t('btc.hashrate')}
                    value={fmtHashrate(network.hashrate)}
                  />
                  <MiniStat
                    label={t('btc.difficulty')}
                    value={fmtLarge(network.difficulty)}
                  />
                  <MiniStat
                    label={t('btc.block_height')}
                    value={network.block_height?.toLocaleString()}
                  />
                  <MiniStat
                    label={t('btc.mempool')}
                    value={`${(network.mempool?.count || 0).toLocaleString()} tx`}
                  />
                </div>
                {network.fees && (
                  <div>
                    <SectionLabel>{t('btc.fees')}</SectionLabel>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {[
                        {
                          l: t('btc.fast'),
                          v: network.fees.fastest,
                        },
                        {
                          l: t('btc.min_30'),
                          v: network.fees.half_hour,
                        },
                        {
                          l: t('btc.hr_1'),
                          v: network.fees.hour,
                        },
                        {
                          l: t('btc.eco'),
                          v: network.fees.economy,
                        },
                      ].map((f) => (
                        <div
                          key={f.l}
                          className="bg-white/[0.02] rounded-lg p-2.5 text-center border border-white/5"
                        >
                          <p className="text-text-muted text-[11px] font-medium">{f.l}</p>
                          <p className="text-base font-bold font-mono text-gold-primary mt-0.5">
                            {f.v}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {network.difficulty_adjustment && (
                  <div className="bg-white/[0.02] rounded-lg p-3.5 border border-white/5">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-text-muted text-[11px] uppercase tracking-wider font-bold">
                        {t('btc.next_adj')}
                      </span>
                      <span
                        className={`font-bold text-[13px] ${network.difficulty_adjustment.change >= 0 ? "text-red-400" : "text-emerald-400"}`}
                      >
                        {network.difficulty_adjustment.change >= 0 ? "+" : ""}
                        {network.difficulty_adjustment.change}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-gold-dark via-gold-primary to-gold-light transition-all duration-700"
                        style={{
                          width: `${network.difficulty_adjustment.progress}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-text-muted mt-2">
                      <span>
                        {network.difficulty_adjustment.progress}% {t('btc.complete')}
                      </span>
                      <span>
                        {network.difficulty_adjustment.remaining_blocks} {t('btc.blocks_left')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* On-Chain */}
          <div className="glass-card rounded-xl p-6 border border-gold-primary/12 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
            <h3 className="text-white font-bold text-lg tracking-tight">
              {t('btc.onchain')}
            </h3>
            <p className="text-text-muted text-[12px] mt-1 mb-4">
              {t('btc.onchain_desc')}
            </p>
            {!onchain ? (
              <EmptyState text={t('btc.loading_onchain')} />
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {onchain.mvrv && (
                  <OnChainCard
                    label={t('btc.mvrv')}
                    value={onchain.mvrv.value?.toFixed(2)}
                    change={onchain.mvrv.change_7d}
                    hint={
                      onchain.mvrv.value > 3.5
                        ? getApiTranslation("Overvalued")
                        : onchain.mvrv.value < 1
                          ? getApiTranslation("Undervalued")
                          : getApiTranslation("Fair Value")
                    }
                    hintColor={
                      onchain.mvrv.value > 3.5
                        ? "text-red-400"
                        : onchain.mvrv.value < 1
                          ? "text-emerald-400"
                          : "text-gold-primary"
                    }
                  />
                )}
                {onchain.nvt && (
                  <OnChainCard
                    label={t('btc.nvt')}
                    value={onchain.nvt.value?.toFixed(1)}
                    change={onchain.nvt.change_7d}
                    hint={
                      onchain.nvt.value > 150
                        ? getApiTranslation("Overvalued")
                        : onchain.nvt.value < 45
                          ? getApiTranslation("Undervalued")
                          : getApiTranslation("Normal")
                    }
                    hintColor={
                      onchain.nvt.value > 150
                        ? "text-red-400"
                        : onchain.nvt.value < 45
                          ? "text-emerald-400"
                          : "text-gold-primary"
                    }
                  />
                )}
                {onchain.active_addresses && (
                  <OnChainCard
                    label={t('btc.active_add')}
                    value={fmtLarge(onchain.active_addresses.value)}
                    change={onchain.active_addresses.change_7d}
                  />
                )}
                {onchain.daily_transactions && (
                  <OnChainCard
                    label={t('btc.daily_tx')}
                    value={fmtLarge(onchain.daily_transactions.value)}
                    change={onchain.daily_transactions.change_7d}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── NEWS ── */}
      <div className="glass-card rounded-xl p-6 border border-gold-primary/12 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-white font-bold text-lg tracking-tight">
              {t('btc.latest_news')}
            </h3>
            <p className="text-text-muted text-[12px] mt-1">
              {t('btc.news_desc')}
            </p>
          </div>
          {news?.total > 0 && (
            <span className="px-3 py-1.5 bg-gold-primary/10 text-gold-primary text-[12px] font-bold rounded-lg border border-gold-primary/20">
              {news.total} {t('btc.articles')}
            </span>
          )}
        </div>
        {!news?.articles?.length ? (
          <EmptyState text={t('btc.loading_news')} />
        ) : (
          (() => {
            const restArticles = news.articles.slice(2);
            const totalPages = Math.ceil(restArticles.length / NEWS_PER_PAGE);
            const pagedArticles = restArticles.slice(
              newsPage * NEWS_PER_PAGE,
              (newsPage + 1) * NEWS_PER_PAGE,
            );

            return (
              <div className="space-y-4">
                {/* Featured - top 2 */}
                {newsPage === 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {news.articles.slice(0, 2).map((a, i) => (
                      <div
                        key={i}
                        onClick={() => setSelectedArticle(a)}
                        className="group block news-featured cursor-pointer"
                      >
                        <div className="bg-white/[0.02] rounded-xl overflow-hidden border border-white/5 hover:border-gold-primary/30 transition-all duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,.3)] h-full">
                          {a.image ? (
                            <div className="w-full h-44 overflow-hidden">
                              <img
                                src={a.image}
                                alt=""
                                className="w-full h-full object-cover news-img"
                                onError={(e) => {
                                  e.target.parentElement.style.display = "none";
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-full h-44 bg-gradient-to-br from-gold-primary/10 to-gold-dark/10 flex items-center justify-center">
                              <span className="text-6xl opacity-20 text-gold-primary">₿</span>
                            </div>
                          )}
                          <div className="p-4">
                            <p className="text-white font-bold text-[15px] group-hover:text-gold-primary transition-colors line-clamp-2 leading-snug">
                              {a.title}
                            </p>
                            <p className="text-text-muted text-[12px] mt-2 line-clamp-2 leading-relaxed">
                              {a.description}
                            </p>
                            <div className="flex items-center gap-2 mt-3">
                              <span className="text-gold-primary text-[11px] font-bold">
                                {a.source}
                              </span>
                              {a.author && (
                                <span className="text-text-muted text-[11px]">
                                  · {a.author}
                                </span>
                              )}
                              <span className="text-text-muted text-[11px]">
                                · {translateTimeAgo(a.time_ago)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Paged compact list */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pagedArticles.map((a, i) => (
                    <div
                      key={i}
                      onClick={() => setSelectedArticle(a)}
                      className="group block cursor-pointer"
                    >
                      <div className="flex gap-3 bg-white/[0.015] rounded-lg overflow-hidden border border-white/5 hover:border-gold-primary/25 transition-all duration-300 h-full">
                        {a.image ? (
                          <div className="w-20 h-20 flex-shrink-0 overflow-hidden">
                            <img
                              src={a.image}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              onError={(e) => {
                                e.target.parentElement.innerHTML =
                                  '<div class="w-full h-full bg-gradient-to-br from-gold-primary/10 to-gold-dark/10 flex items-center justify-center"><span class="text-base text-gold-primary/30">₿</span></div>';
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-20 h-20 flex-shrink-0 bg-gradient-to-br from-gold-primary/10 to-gold-dark/10 flex items-center justify-center">
                            <span className="text-base text-gold-primary/30">₿</span>
                          </div>
                        )}
                        <div className="py-2.5 pr-3 flex flex-col justify-center min-w-0">
                          <p className="text-white text-[12px] font-semibold group-hover:text-gold-primary transition-colors line-clamp-2 leading-snug">
                            {a.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className="text-gold-primary text-[10px] font-bold">
                              {a.source}
                            </span>
                            <span className="text-text-muted text-[10px]">
                              · {translateTimeAgo(a.time_ago)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <button
                      onClick={() => setNewsPage((p) => Math.max(0, p - 1))}
                      disabled={newsPage === 0}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all ${newsPage === 0 ? "text-text-muted/30 cursor-not-allowed" : "text-gold-primary hover:bg-gold-primary/10 border border-gold-primary/25"}`}
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                      {t('btc.prev')}
                    </button>
                    <div className="flex items-center gap-1">
                      {[...Array(totalPages)].map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setNewsPage(i)}
                          className={`w-8 h-8 rounded-lg text-[12px] font-bold transition-all ${i === newsPage ? "bg-gold-primary/20 text-gold-primary border border-gold-primary/30" : "text-text-muted hover:text-white hover:bg-white/5"}`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() =>
                        setNewsPage((p) => Math.min(totalPages - 1, p + 1))
                      }
                      disabled={newsPage === totalPages - 1}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all ${newsPage === totalPages - 1 ? "text-text-muted/30 cursor-not-allowed" : "text-gold-primary hover:bg-gold-primary/10 border border-gold-primary/25"}`}
                    >
                      {t('btc.next')}
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
      {selectedArticle && (
        <NewsPreviewModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}
    </div>
  );
};

const BtcTradingViewChart = ({ t }) => {
  const chartRef = useRef(null);
  const widgetRef = useRef(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const containerId = "btc-tv-advanced-chart";
    chartRef.current.innerHTML = "";
    const el = document.createElement("div");
    el.id = containerId;
    el.style.width = "100%";
    el.style.height = "100%";
    chartRef.current.appendChild(el);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (!window.TradingView || !document.getElementById(containerId)) return;

      widgetRef.current = new window.TradingView.widget({
        container_id: containerId,
        autosize: true,
        symbol: "BINANCE:BTCUSDT.P",
        interval: "240",
        timezone: "Asia/Jakarta",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#0a0a0f",
        enable_publishing: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        save_image: true,
        backgroundColor: "#0a0a0f",
        gridColor: "rgba(212, 168, 83, 0.04)",
        hide_top_toolbar: false,
        hide_legend: false,
        withdateranges: true,
        details: false,
        hotlist: false,
        calendar: false,
        studies: ["MACD@tv-basicstudies", "StochasticRSI@tv-basicstudies"],
        overrides: {
          "paneProperties.background": "#0a0a0f",
          "paneProperties.backgroundType": "solid",
          "paneProperties.vertGridProperties.color": "rgba(212, 168, 83, 0.04)",
          "paneProperties.horzGridProperties.color": "rgba(212, 168, 83, 0.04)",
          "scalesProperties.textColor": "#a0a0a0",
          "scalesProperties.lineColor": "rgba(212, 168, 83, 0.1)",
          "mainSeriesProperties.candleStyle.upColor": "#22c55e",
          "mainSeriesProperties.candleStyle.downColor": "#ef4444",
          "mainSeriesProperties.candleStyle.borderUpColor": "#22c55e",
          "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
          "mainSeriesProperties.candleStyle.wickUpColor": "#22c55e",
          "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
        },
      });
    };

    document.head.appendChild(script);
    return () => {
      try {
        document.head.removeChild(script);
      } catch {}
      widgetRef.current = null;
    };
  }, []);

  return (
    <div className="relative">
      <div className="flex items-center justify-between px-5 py-3.5 bg-bg-primary/80 border-b border-gold-primary/15">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
            <img
              src="https://assets.coingecko.com/coins/images/1/small/bitcoin.png"
              alt="BTC"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h3 className="text-white font-bold text-[14px]">
              BTC/USDT {t('btc.perp')}
            </h3>
            <p className="text-text-muted text-[11px]">
              Binance · Default 4H · MACD + Stoch RSI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-emerald-400 text-[11px] font-bold uppercase tracking-wider">
            {t('btc.live_chart')}
          </span>
        </div>
      </div>
      <div ref={chartRef} className="w-full h-[560px] bg-[#0a0a0f]" />
    </div>
  );
};

/* ── SUB COMPONENTS ── */

const SectionLabel = ({ children }) => (
  <p className="text-text-muted text-[11px] uppercase tracking-wider font-bold">
    {children}
  </p>
);

const PriceBadge = ({ label, value }) => {
  if (value == null) return null;
  const p = value >= 0;
  return (
    <span
      className={`text-[12px] font-bold px-2.5 py-1 rounded-md border ${p ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" : "bg-red-500/15 text-red-400 border-red-500/25"}`}
    >
      {label}: {p ? "+" : ""}
      {value?.toFixed(2)}%
    </span>
  );
};

const MetricIcon = ({ type }) => {
  const icons = {
    range: (
      <g>
        <rect x="3" y="13" width="4" height="8" rx="1" fill="currentColor" opacity="0.25" />
        <rect x="3" y="13" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <rect x="10" y="9" width="4" height="12" rx="1" fill="currentColor" opacity="0.4" />
        <rect x="10" y="9" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <rect x="17" y="5" width="4" height="16" rx="1" fill="currentColor" opacity="0.55" />
        <rect x="17" y="5" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </g>
    ),
    mcap: (
      <g>
        <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.18" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <path d="M10 7 V17 M14 7 V17 M9 9 H14.5 a1.8 1.8 0 010 3.5 H9 M9 12.5 H15 a1.8 1.8 0 010 3.5 H9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    ),
    volume: (
      <g>
        <path d="M3 17 L8 12 L13 15 L21 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M16 6 L21 6 L21 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="8" cy="12" r="1.5" fill="currentColor" />
        <circle cx="13" cy="15" r="1.5" fill="currentColor" />
        <circle cx="21" cy="6" r="1.5" fill="currentColor" />
      </g>
    ),
    dominance: (
      <g>
        <path d="M12 3 L14.5 8.5 L20.5 9.3 L16 13.5 L17.2 19.5 L12 16.5 L6.8 19.5 L8 13.5 L3.5 9.3 L9.5 8.5 Z" fill="currentColor" opacity="0.3" />
        <path d="M12 3 L14.5 8.5 L20.5 9.3 L16 13.5 L17.2 19.5 L12 16.5 L6.8 19.5 L8 13.5 L3.5 9.3 L9.5 8.5 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      </g>
    ),
  };
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
      {icons[type] || icons.range}
    </svg>
  );
};

const MetricCard = ({ label, value, iconType, delay }) => (
  <div
    className={`glass-card rounded-xl p-5 border border-gold-primary/12 card-hover fade-in fade-in-${delay} relative overflow-hidden`}
  >
    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold-primary/20 to-transparent" />
    <div className="flex items-center justify-between mb-3">
      <p className="text-text-muted text-[11px] uppercase tracking-wider font-bold">
        {label}
      </p>
      <div className="icon-tile w-9 h-9 rounded-lg flex items-center justify-center">
        <MetricIcon type={iconType} />
      </div>
    </div>
    <p className="text-white font-bold text-[15px] tracking-tight">{value}</p>
  </div>
);

const MiniStat = ({ label, value }) => (
  <div className="bg-white/[0.02] rounded-lg p-3 border border-white/5">
    <p className="text-text-muted text-[11px] uppercase tracking-wider font-bold">
      {label}
    </p>
    <p className="text-base font-bold font-mono text-white mt-1">
      {value || "-"}
    </p>
  </div>
);

const OnChainCard = ({
  label,
  value,
  change,
  hint,
  hintColor = "text-text-muted",
}) => (
  <div className="bg-white/[0.02] rounded-lg p-3.5 border border-white/5">
    <p className="text-text-muted text-[11px] uppercase tracking-wider font-bold mb-1">
      {label}
    </p>
    <p className="text-white text-lg font-bold font-mono">{value ?? "-"}</p>
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
      {change != null && (
        <span
          className={`text-[11px] font-bold ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}
        >
          {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}% 7d
        </span>
      )}
      {hint && <span className={`text-[11px] ${hintColor}`}>· {hint}</span>}
    </div>
  </div>
);

const EmptyState = ({ text }) => (
  <div className="flex items-center justify-center py-10">
    <div className="flex items-center gap-2.5 text-text-muted text-[13px]">
      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      {text}
    </div>
  </div>
);

const ErrorState = ({ error, onRetry, t }) => (
  <div className="space-y-6">
    <div className="flex items-center gap-3">
      <div className="w-16 h-0.5 bg-gradient-to-r from-gold-primary to-transparent" />
      <h2 className="font-display text-2xl font-bold text-white">
        Bitcoin
      </h2>
    </div>
    <div className="glass-card rounded-xl p-8 border border-red-500/30 text-center">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center">
        <svg
          className="w-7 h-7 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>
      <p className="text-red-400 mb-5 text-[14px]">{t('btc.failed')}</p>
      <button
        onClick={onRetry}
        className="px-6 py-2.5 bg-gold-primary/20 text-gold-primary rounded-lg hover:bg-gold-primary/30 transition-colors text-[13px] font-bold border border-gold-primary/25"
      >
        {t('btc.retry')}
      </button>
    </div>
  </div>
);

const LoadingSkeleton = () => (
  <div className="space-y-6">
    <style>{`@keyframes sp{0%,100%{opacity:.05}50%{opacity:.15}}.skel{animation:sp 2s ease-in-out infinite;background:rgba(212,168,83,.1);border-radius:8px}`}</style>
    <div className="glass-card rounded-2xl p-7 border border-gold-primary/15">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-5">
          <div className="skel w-16 h-16 rounded-full" />
          <div>
            <div className="skel w-32 h-7 mb-2" />
            <div className="skel w-20 h-4" />
          </div>
        </div>
        <div>
          <div className="skel w-56 h-12 mb-3" />
          <div className="skel w-44 h-5 ml-auto" />
        </div>
      </div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="glass-card rounded-xl p-5 border border-gold-primary/12"
        >
          <div className="skel w-20 h-3 mb-3" />
          <div className="skel w-28 h-5" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="glass-card rounded-xl p-6 h-36 border border-gold-primary/12"
        >
          <div className="skel w-16 h-3 mb-3" />
          <div className="skel w-full h-7 mb-2" />
          <div className="skel w-3/4 h-4" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="glass-card rounded-xl p-6 h-80 border border-gold-primary/12" />
      <div className="glass-card rounded-xl p-6 h-80 border border-gold-primary/12" />
    </div>
  </div>
);

/* ── HELPERS ── */
function fmtNum(n) {
  if (!n) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function fmtLarge(n) {
  if (!n) return "0";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}
function fmtHashrate(h) {
  if (!h) return "-";
  if (h >= 1e18) return `${(h / 1e18).toFixed(1)} EH/s`;
  if (h >= 1e15) return `${(h / 1e15).toFixed(1)} PH/s`;
  if (h >= 1e12) return `${(h / 1e12).toFixed(1)} TH/s`;
  return `${(h / 1e9).toFixed(1)} GH/s`;
}

export default BitcoinPage;