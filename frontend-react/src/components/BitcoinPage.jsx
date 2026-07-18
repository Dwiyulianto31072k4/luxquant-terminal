import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import NewsPreviewModal from "./NewsPreviewModal";
import AssistantWidget from "./assistant/AssistantWidget";
import {
  getActiveTheme,
  getTradingViewTheme,
  mountTradingViewEmbed,
  subscribeTheme,
} from "../utils/themeColors";
import { PageHeader } from "./ui/PageHeader";

const API_BASE = "/api/v1";

/* ──────────────────────────────────────────────────────────────
 BitcoinPage — Terminal desk monochrome
 • Yellow accent for CTAs/rank only; profit/loss for PnL
 • Fast TradingView embed (not full tv.js widget)
 ────────────────────────────────────────────────────────────── */

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
  const NEWS_PER_PAGE = 12;

  // Modal berita URL-driven: ?news=<index dalam news.articles>
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedNewsIdx = searchParams.get("news");

  const openArticle = useCallback(
    (idx) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("news", String(idx));
        return next;
      });
    },
    [setSearchParams]
  );

  const closeArticle = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("news");
      return next;
    });
  }, [setSearchParams]);

  const selectedArticle = useMemo(() => {
    if (selectedNewsIdx == null) return null;
    return extra.news?.articles?.[Number(selectedNewsIdx)] ?? null;
  }, [selectedNewsIdx, extra.news]);

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
    if (!str) return "";
    const key = str.toLowerCase().replace(/ /g, "_");
    const translated = t(`btc.${key}`);
    return translated === `btc.${key}` ? str : translated;
  };

  const translateTimeAgo = (timeStr) => {
    if (!timeStr) return "";
    let res = timeStr.toLowerCase();
    res = res.replace("h ago", ` ${t("btc.h_ago")}`);
    res = res.replace("m ago", ` ${t("btc.m_ago")}`);
    res = res.replace("d ago", ` ${t("btc.d_ago")}`);
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

  const supplyPct = data.maxSupply > 0 ? (data.circulatingSupply / data.maxSupply) * 100 : 0;
  const { technical, network, onchain, news } = extra;

  return (
    <div className="space-y-5">
      {/* ── HERO ── */}
      <div className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised">
        <div className="relative flex flex-wrap items-center justify-between gap-5 p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-md flex-shrink-0 flex items-center justify-center bg-surface-secondary border border-ink/[0.06]">
              <img
                src="https://assets.coingecko.com/coins/images/1/standard/bitcoin.png"
                alt="Bitcoin"
                className="w-9 h-9 object-contain"
              />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight">
                  {t("btc.title")}
                </h1>
                <span className="px-2 py-0.5 bg-accent text-accent-fg text-[10px] font-mono font-semibold uppercase tracking-wider rounded-md border border-transparent">
                  Rank #{data.marketCapRank}
                </span>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted/70 mt-2">
                BTC · {t("btc.network")}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-4xl lg:text-5xl font-mono font-light text-text-primary tabular-nums leading-none">
              $
              {data.price?.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <div className="flex items-center gap-1.5 justify-end mt-3">
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
          label={t("btc.range_24h")}
          value={`$${fmtNum(data.low24h)} – $${fmtNum(data.high24h)}`}
          iconType="range"
        />
        <MetricCard label={t("btc.mcap")} value={`$${fmtLarge(data.marketCap)}`} iconType="mcap" />
        <MetricCard
          label={t("btc.vol_24h")}
          value={`$${fmtLarge(data.volume24h)}`}
          iconType="volume"
        />
        <MetricCard
          label={t("btc.dominance")}
          value={`${data.dominance?.toFixed(1)}%`}
          iconType="dominance"
        />
      </div>

      {/* ── SUPPLY / ATH / FEAR & GREED ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Supply */}
        <div className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised p-5">
          <div className="flex items-center gap-2 mb-4">
            <IconSupply />
            <SectionLabel>{t("btc.supply")}</SectionLabel>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {t("btc.circulating")}
              </span>
              <span className="text-text-primary font-mono text-base font-light tabular-nums">
                {(data.circulatingSupply / 1e6).toFixed(2)}M
              </span>
            </div>
            <div className="h-px bg-ink/[0.04]" />
            <div className="flex justify-between items-baseline">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {t("btc.max_supply")}
              </span>
              <span className="text-text-primary font-mono text-base font-light tabular-nums">
                21M
              </span>
            </div>
            <div className="pt-2">
              <div className="w-full bg-ink/[0.04] rounded-sm h-1.5 overflow-hidden">
                <div
                  className="bg-accent h-full transition-all duration-1000"
                  style={{ width: `${supplyPct}%` }}
                />
              </div>
              <div className="flex justify-between mt-2.5">
                <span className="font-mono text-[10px] text-text-muted/60 tabular-nums">0%</span>
                <span className="font-mono text-[10px] text-accent tabular-nums tracking-wider">
                  {supplyPct.toFixed(2)}% {t("btc.mined")}
                </span>
                <span className="font-mono text-[10px] text-text-muted/60 tabular-nums">100%</span>
              </div>
            </div>
          </div>
        </div>

        {/* ATH */}
        <div className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised p-5">
          <div className="flex items-center gap-2 mb-4">
            <IconAth />
            <SectionLabel>{t("btc.ath")}</SectionLabel>
          </div>
          <p className="text-3xl font-mono font-light text-text-primary tabular-nums tracking-tight">
            ${data.ath?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <div
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-mono tabular-nums border ${
                data.athChange >= 0
                  ? "bg-profit/10 text-profit border-profit/25"
                  : "bg-loss/10 text-loss border-loss/25"
              }`}
            >
              {data.athChange >= 0 ? <IconArrowUp /> : <IconArrowDown />}
              {Math.abs(data.athChange)?.toFixed(2)}%
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
              {t("btc.from_ath")}
            </span>
          </div>
        </div>

        {/* Fear & Greed */}
        <div className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised p-5">
          <div className="flex items-center gap-2 mb-4">
            <IconGauge />
            <SectionLabel>{t("btc.fg_index")}</SectionLabel>
          </div>
          {(() => {
            const v = data.fearGreed?.value ?? 0;
            const color =
              v >= 75
                ? "text-profit"
                : v >= 50
                  ? "text-accent"
                  : v >= 25
                    ? "text-accent"
                    : "text-loss";
            const dotColor =
              v >= 75 ? "bg-profit" : v >= 50 ? "bg-accent" : v >= 25 ? "bg-accent" : "bg-loss";
            return (
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 flex-shrink-0">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="rgb(var(--ink) / 0.06)"
                      strokeWidth="3"
                      fill="none"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      strokeDasharray={`${(v / 100) * 175.9} 175.9`}
                      strokeLinecap="round"
                      className={color}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`font-mono text-xl font-light tabular-nums ${color}`}>
                      {v}
                    </span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-mono text-sm uppercase tracking-wider ${color}`}>
                    {data.fearGreed?.label}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-1">
                    {t("btc.sentiment")}
                  </p>
                  <div className="flex items-center gap-0.5 mt-2">
                    {[...Array(10)].map((_, i) => {
                      const active = i < Math.ceil(v / 10);
                      return (
                        <div
                          key={i}
                          className={`w-3 h-0.5 rounded-sm ${active ? dotColor : "bg-ink/[0.06]"}`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── BTC CHART (TradingView) ── */}
      <div className="rounded-lg border border-ink/[0.08] bg-surface-raised overflow-hidden relative">
        <BtcTradingViewChart t={t} />
      </div>

      {/* ── TECHNICAL + NETWORK/ONCHAIN ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Technical Analysis */}
        <div className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised p-5">
          <div className="flex items-start justify-between mb-4 gap-3">
            <div className="flex items-center gap-2">
              <IconChart />
              <div>
                <h3 className="text-sm font-normal text-text-primary tracking-tight">
                  {t("btc.tech_analysis")}
                </h3>
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-0.5">
                  {t("btc.tech_desc")}
                </p>
              </div>
            </div>
            {technical?.summary && (
              <span
                className={`px-2.5 py-1 rounded-sm text-[10px] font-mono uppercase tracking-wider border whitespace-nowrap ${
                  technical.summary.includes("Strong Buy")
                    ? "bg-profit/15 text-profit border-profit/30"
                    : technical.summary.includes("Buy")
                      ? "bg-profit/10 text-profit border-profit/25"
                      : technical.summary.includes("Strong Sell")
                        ? "bg-loss/15 text-loss border-loss/30"
                        : technical.summary.includes("Sell")
                          ? "bg-loss/10 text-loss border-loss/25"
                          : "bg-accent/12 text-accent border-ink/12"
                }`}
              >
                {getApiTranslation(technical.summary)}
              </span>
            )}
          </div>
          {!technical ? (
            <EmptyState text={t("btc.loading_tech")} />
          ) : (
            <div className="space-y-4">
              {/* RSI */}
              <div>
                <SectionLabel>RSI (14)</SectionLabel>
                <div className="grid grid-cols-3 gap-2 mt-2.5">
                  {["1h", "4h", "1d"].map((tf) => {
                    const d = technical.timeframes?.[tf];
                    if (!d)
                      return (
                        <div
                          key={tf}
                          className="bg-surface-secondary rounded-sm p-3 text-center border border-ink/[0.04]"
                        >
                          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                            {tf}
                          </span>
                        </div>
                      );
                    const rsi = d.rsi,
                      over = rsi >= 70,
                      under = rsi <= 30;
                    const colorClass = under
                      ? "text-profit"
                      : over
                        ? "text-loss"
                        : "text-text-primary";
                    const borderClass = under
                      ? "border-profit/25 bg-profit/[0.04]"
                      : over
                        ? "border-loss/25 bg-loss/[0.04]"
                        : "border-ink/[0.04] bg-surface-secondary";
                    return (
                      <div key={tf} className={`rounded-sm p-3 text-center border ${borderClass}`}>
                        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1">
                          {tf.toUpperCase()}
                        </p>
                        <p className={`text-2xl font-mono font-light tabular-nums ${colorClass}`}>
                          {rsi?.toFixed(1)}
                        </p>
                        <p
                          className={`font-mono text-[9px] uppercase tracking-wider mt-0.5 ${colorClass}`}
                        >
                          {under
                            ? getApiTranslation("Oversold")
                            : over
                              ? getApiTranslation("Overbought")
                              : getApiTranslation("Neutral")}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* MACD */}
              <div>
                <SectionLabel>MACD (12,26,9)</SectionLabel>
                <div className="grid grid-cols-3 gap-2 mt-2.5">
                  {["1h", "4h", "1d"].map((tf) => {
                    const d = technical.timeframes?.[tf]?.macd;
                    if (!d)
                      return (
                        <div
                          key={tf}
                          className="bg-surface-secondary rounded-sm p-3 text-center border border-ink/[0.04]"
                        >
                          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                            {tf}
                          </span>
                        </div>
                      );
                    const bull = d.histogram > 0;
                    return (
                      <div
                        key={tf}
                        className={`rounded-sm p-3 text-center border ${
                          bull
                            ? "border-profit/20 bg-profit/[0.04]"
                            : "border-loss/20 bg-loss/[0.04]"
                        }`}
                      >
                        <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1">
                          {tf.toUpperCase()}
                        </p>
                        <div
                          className={`flex items-center justify-center gap-1 ${bull ? "text-profit" : "text-loss"}`}
                        >
                          {bull ? <IconArrowUp /> : <IconArrowDown />}
                          <p className="font-mono text-sm uppercase tracking-wider">
                            {bull ? getApiTranslation("Bullish") : getApiTranslation("Bearish")}
                          </p>
                        </div>
                        <p className="font-mono text-[10px] text-text-muted/70 tabular-nums mt-1">
                          H: {d.histogram?.toFixed(1)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Bollinger + EMA */}
              <div className="grid grid-cols-2 gap-2.5">
                {(() => {
                  const bb = technical.timeframes?.["4h"]?.bollinger,
                    pos = technical.timeframes?.["4h"]?.bb_position;
                  if (!bb)
                    return (
                      <div className="bg-surface-secondary rounded-sm p-3.5 border border-ink/[0.04]">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                          BB Loading...
                        </span>
                      </div>
                    );
                  return (
                    <div className="bg-surface-secondary rounded-sm p-3.5 border border-ink/[0.04]">
                      <SectionLabel>Bollinger (4H)</SectionLabel>
                      <div className="space-y-1.5 text-[11px] font-mono mt-2.5 tabular-nums">
                        <div className="flex justify-between">
                          <span className="text-text-muted uppercase tracking-wider text-[10px]">
                            {t("btc.upper")}
                          </span>
                          <span className="text-text-primary">${fmtNum(bb.upper)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted uppercase tracking-wider text-[10px]">
                            {t("btc.mid")}
                          </span>
                          <span className="text-text-primary">${fmtNum(bb.middle)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted uppercase tracking-wider text-[10px]">
                            {t("btc.lower")}
                          </span>
                          <span className="text-text-primary">${fmtNum(bb.lower)}</span>
                        </div>
                      </div>
                      <div
                        className={`mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider ${
                          pos === "near_lower"
                            ? "text-profit"
                            : pos === "near_upper"
                              ? "text-loss"
                              : "text-accent"
                        }`}
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
                  const ema = technical.timeframes?.["1d"] || technical.timeframes?.["4h"];
                  if (!ema?.ema50)
                    return (
                      <div className="bg-surface-secondary rounded-sm p-3.5 border border-ink/[0.04]">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                          EMA Loading...
                        </span>
                      </div>
                    );
                  const g = ema.ema_cross === "golden_cross";
                  return (
                    <div
                      className={`rounded-sm p-3.5 border ${
                        g ? "border-profit/20 bg-profit/[0.03]" : "border-loss/20 bg-loss/[0.03]"
                      }`}
                    >
                      <SectionLabel>EMA 50/200 (1D)</SectionLabel>
                      <div className="space-y-1.5 text-[11px] font-mono mt-2.5 tabular-nums">
                        <div className="flex justify-between">
                          <span className="text-text-muted uppercase tracking-wider text-[10px]">
                            EMA 50
                          </span>
                          <span className="text-text-primary">${fmtNum(ema.ema50)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted uppercase tracking-wider text-[10px]">
                            EMA 200
                          </span>
                          <span className="text-text-primary">${fmtNum(ema.ema200)}</span>
                        </div>
                      </div>
                      <div
                        className={`mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider ${
                          g ? "text-profit" : "text-loss"
                        }`}
                      >
                        <IconCross />
                        {g ? getApiTranslation("Golden Cross") : getApiTranslation("Death Cross")}
                      </div>
                    </div>
                  );
                })()}
              </div>
              {/* Signal Meter */}
              {technical.total_signals > 0 && (
                <div className="pt-4 border-t border-ink/[0.04]">
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-profit tabular-nums">
                      {t("btc.buy")} ({technical.buy_signals})
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
                      {t("btc.signal_meter")}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-loss tabular-nums">
                      {t("btc.sell")} ({technical.sell_signals})
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden flex bg-ink/[0.04] rounded-sm">
                    <div
                      className="h-full bg-profit/80 transition-all duration-700"
                      style={{
                        width: `${(technical.buy_signals / technical.total_signals) * 100}%`,
                      }}
                    />
                    <div
                      className="h-full bg-ink/[0.08] transition-all duration-700"
                      style={{
                        width: `${((technical.total_signals - technical.buy_signals - technical.sell_signals) / technical.total_signals) * 100}%`,
                      }}
                    />
                    <div
                      className="h-full bg-loss/80 transition-all duration-700"
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
        <div className="space-y-3">
          {/* Network Health */}
          <div className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised p-5">
            <div className="flex items-center gap-2 mb-1">
              <IconNetwork />
              <h3 className="text-sm font-normal text-text-primary tracking-tight">
                {t("btc.net_health")}
              </h3>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mb-4">
              {t("btc.net_desc")}
            </p>
            {!network ? (
              <EmptyState text={t("btc.loading_net")} />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label={t("btc.hashrate")} value={fmtHashrate(network.hashrate)} />
                  <MiniStat label={t("btc.difficulty")} value={fmtLarge(network.difficulty)} />
                  <MiniStat
                    label={t("btc.block_height")}
                    value={network.block_height?.toLocaleString()}
                  />
                  <MiniStat
                    label={t("btc.mempool")}
                    value={`${(network.mempool?.count || 0).toLocaleString()} tx`}
                  />
                </div>
                {network.fees && (
                  <div>
                    <SectionLabel>{t("btc.fees")}</SectionLabel>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      {[
                        { l: t("btc.fast"), v: network.fees.fastest },
                        { l: t("btc.min_30"), v: network.fees.half_hour },
                        { l: t("btc.hr_1"), v: network.fees.hour },
                        { l: t("btc.eco"), v: network.fees.economy },
                      ].map((f) => (
                        <div
                          key={f.l}
                          className="bg-surface-secondary rounded-sm p-2.5 text-center border border-ink/[0.04]"
                        >
                          <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
                            {f.l}
                          </p>
                          <p className="font-mono text-sm font-light text-text-primary tabular-nums mt-1">
                            {f.v}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {network.difficulty_adjustment && (
                  <div className="bg-surface-secondary rounded-sm p-3.5 border border-ink/[0.04]">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        {t("btc.next_adj")}
                      </span>
                      <span
                        className={`font-mono text-[11px] tabular-nums ${
                          network.difficulty_adjustment.change >= 0 ? "text-loss" : "text-profit"
                        }`}
                      >
                        {network.difficulty_adjustment.change >= 0 ? "+" : ""}
                        {network.difficulty_adjustment.change}%
                      </span>
                    </div>
                    <div className="h-1 rounded-sm bg-ink/[0.04] overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-700"
                        style={{
                          width: `${network.difficulty_adjustment.progress}%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-2 tabular-nums">
                      <span>
                        {network.difficulty_adjustment.progress}% {t("btc.complete")}
                      </span>
                      <span>
                        {network.difficulty_adjustment.remaining_blocks} {t("btc.blocks_left")}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* On-Chain */}
          <div className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised p-5">
            <div className="flex items-center gap-2 mb-1">
              <IconOnchain />
              <h3 className="text-sm font-normal text-text-primary tracking-tight">
                {t("btc.onchain")}
              </h3>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mb-4">
              {t("btc.onchain_desc")}
            </p>
            {!onchain ? (
              <EmptyState text={t("btc.loading_onchain")} />
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {onchain.mvrv && (
                  <OnChainCard
                    label={t("btc.mvrv")}
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
                        ? "text-loss"
                        : onchain.mvrv.value < 1
                          ? "text-profit"
                          : "text-accent"
                    }
                  />
                )}
                {onchain.nvt && (
                  <OnChainCard
                    label={t("btc.nvt")}
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
                        ? "text-loss"
                        : onchain.nvt.value < 45
                          ? "text-profit"
                          : "text-accent"
                    }
                  />
                )}
                {onchain.active_addresses && (
                  <OnChainCard
                    label={t("btc.active_add")}
                    value={fmtLarge(onchain.active_addresses.value)}
                    change={onchain.active_addresses.change_7d}
                  />
                )}
                {onchain.daily_transactions && (
                  <OnChainCard
                    label={t("btc.daily_tx")}
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
      <div className="relative overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised p-5">
        <div className="flex items-start justify-between mb-4 gap-3">
          <div className="flex items-center gap-2">
            <IconNews />
            <div>
              <h3 className="text-sm font-normal text-text-primary tracking-tight">
                {t("btc.latest_news")}
              </h3>
              <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70 mt-0.5">
                {t("btc.news_desc")}
              </p>
            </div>
          </div>
          {news?.total > 0 && (
            <span className="px-2.5 py-1 bg-accent/12 text-accent text-[10px] font-mono uppercase tracking-wider rounded-sm border border-ink/12 tabular-nums whitespace-nowrap">
              {news.total} {t("btc.articles")}
            </span>
          )}
        </div>
        {!news?.articles?.length ? (
          <EmptyState text={t("btc.loading_news")} />
        ) : (
          (() => {
            const restArticles = news.articles.slice(2);
            const totalPages = Math.ceil(restArticles.length / NEWS_PER_PAGE);
            const pagedArticles = restArticles.slice(
              newsPage * NEWS_PER_PAGE,
              (newsPage + 1) * NEWS_PER_PAGE
            );

            return (
              <div className="space-y-3">
                {/* Featured - top 2 */}
                {newsPage === 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {news.articles.slice(0, 2).map((a, i) => (
                      <div
                        key={i}
                        onClick={() => openArticle(i)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openArticle(i);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Read: ${a.title || "article"}`}
                        className="group cursor-pointer"
                      >
                        <div className="bg-surface-secondary rounded-md overflow-hidden border border-ink/[0.04] hover:border-ink/12 transition-all duration-200 h-full">
                          {a.image ? (
                            <div className="w-full overflow-hidden bg-scrim/40 flex items-center justify-center">
                              <img
                                src={a.image}
                                alt=""
                                className="w-full h-auto max-h-[460px] object-contain transition-transform duration-500 group-hover:scale-[1.02]"
                                onError={(e) => {
                                  e.target.parentElement.style.display = "none";
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-full aspect-video bg-surface-raised flex items-center justify-center border-b border-ink/[0.04]">
                              <IconBtcLarge />
                            </div>
                          )}
                          <div className="p-4">
                            <p className="text-text-primary text-sm group-hover:text-text-primary transition-colors line-clamp-2 leading-snug">
                              {a.title}
                            </p>
                            <p className="text-text-muted text-[12px] mt-2 line-clamp-2 leading-relaxed">
                              {a.description}
                            </p>
                            <div className="flex items-center gap-2 mt-3 font-mono text-[10px] uppercase tracking-wider">
                              <span className="text-text-secondary">{a.source}</span>
                              {a.author && <span className="text-text-muted/70">· {a.author}</span>}
                              <span className="text-text-muted/70">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {pagedArticles.map((a, i) => (
                    <div
                      key={i}
                      onClick={() => openArticle(2 + newsPage * NEWS_PER_PAGE + i)}
                      className="group cursor-pointer"
                    >
                      <div className="flex gap-3 bg-surface-secondary rounded-sm overflow-hidden border border-ink/[0.04] hover:border-ink/12 transition-all duration-200 h-full">
                        {a.image ? (
                          <div className="w-20 h-20 flex-shrink-0 overflow-hidden">
                            <img
                              src={a.image}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              onError={(e) => {
                                e.target.parentElement.innerHTML =
                                  '<div class="w-full h-full bg-surface-raised flex items-center justify-center"><span class="font-mono text-base text-text-muted/40">₿</span></div>';
                              }}
                            />
                          </div>
                        ) : (
                          <div className="w-20 h-20 flex-shrink-0 bg-surface-raised flex items-center justify-center">
                            <span className="font-mono text-base text-text-muted/40">₿</span>
                          </div>
                        )}
                        <div className="py-2.5 pr-3 flex flex-col justify-center min-w-0">
                          <p className="text-text-primary text-[12px] group-hover:text-text-primary transition-colors line-clamp-2 leading-snug">
                            {a.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1.5 font-mono text-[10px] uppercase tracking-wider">
                            <span className="text-text-secondary">{a.source}</span>
                            <span className="text-text-muted/70">
                              · {translateTimeAgo(a.time_ago)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination — desk pill pattern */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-ink/[0.04]">
                    <button
                      onClick={() => setNewsPage((p) => Math.max(0, p - 1))}
                      disabled={newsPage === 0}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-colors ${
                        newsPage === 0
                          ? "text-text-muted/30 cursor-not-allowed bg-ink/[0.02] border border-ink/[0.04]"
                          : "text-text-muted hover:text-text-primary bg-ink/[0.03] hover:bg-ink/[0.06] border border-ink/[0.06]"
                      }`}
                    >
                      <IconChevronLeft />
                      {t("btc.prev")}
                    </button>
                    <div className="flex items-center gap-1">
                      {[...Array(totalPages)].map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setNewsPage(i)}
                          className={`w-7 h-7 rounded-sm font-mono text-[10px] tabular-nums transition-colors ${
                            i === newsPage
                              ? "bg-ink/10 text-text-primary border border-ink/[0.08]"
                              : "text-text-muted hover:text-text-primary bg-ink/[0.03] hover:bg-ink/[0.06]"
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setNewsPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={newsPage === totalPages - 1}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm font-mono text-[10px] uppercase tracking-wider transition-colors ${
                        newsPage === totalPages - 1
                          ? "text-text-muted/30 cursor-not-allowed bg-ink/[0.02] border border-ink/[0.04]"
                          : "text-text-muted hover:text-text-primary bg-ink/[0.03] hover:bg-ink/[0.06] border border-ink/[0.06]"
                      }`}
                    >
                      {t("btc.next")}
                      <IconChevronRight />
                    </button>
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
      {selectedArticle && <NewsPreviewModal article={selectedArticle} onClose={closeArticle} />}

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="bitcoin" />
    </div>
  );
};

/* ── TradingView Chart (lightweight embed + loading/timeout UX) ──
 Old path: full tv.js + TradingView.widget every mount → slow / hung spinner.
 New path: cached embed script (same as Market Pulse modal), desk skeleton,
 iframe-ready detection, 12s timeout with Retry + open TradingView. */

const TV_SYMBOL = "BINANCE:BTCUSDT.P";
const TV_FULL_URL = "https://www.tradingview.com/chart/?symbol=BINANCE%3ABTCUSDT.P";

const BtcTradingViewChart = ({ t }) => {
  const hostRef = useRef(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [retryKey, setRetryKey] = useState(0);
  // Remount embed when app theme changes (dark / luxquant / bright)
  const [appTheme, setAppTheme] = useState(getActiveTheme);

  useEffect(() => subscribeTheme(setAppTheme), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let cancelled = false;
    setStatus("loading");

    const tv = getTradingViewTheme(appTheme);
    // Match host bg to theme so white flash never shows under iframe
    host.style.background = tv.backgroundColor;

    const unmount = mountTradingViewEmbed(host, {
      theme: appTheme,
      symbol: TV_SYMBOL,
      interval: "240",
      studies: ["STD;EMA"],
      save_image: false,
    });

    const markReady = () => {
      if (cancelled) return;
      setStatus("ready");
    };
    const obs = new MutationObserver(() => {
      if (host.querySelector("iframe")) {
        markReady();
        obs.disconnect();
      }
    });
    obs.observe(host, { childList: true, subtree: true });

    const poll = window.setInterval(() => {
      if (host.querySelector("iframe")) {
        markReady();
        window.clearInterval(poll);
      }
    }, 400);

    const timeout = window.setTimeout(() => {
      if (!cancelled) setStatus((s) => (s === "loading" ? "error" : s));
    }, 12000);

    return () => {
      cancelled = true;
      obs.disconnect();
      window.clearInterval(poll);
      window.clearTimeout(timeout);
      unmount();
    };
  }, [retryKey, appTheme]);

  const tvBg = getTradingViewTheme(appTheme).backgroundColor;

  return (
    <div className="relative">
      <div className="flex items-center justify-between border-b border-ink/[0.07] bg-surface-raised px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink/[0.1]">
            <img
              src="https://assets.coingecko.com/coins/images/1/small/bitcoin.png"
              alt="BTC"
              className="h-full w-full object-cover"
            />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-text-primary">
              BTC/USDT {t("btc.perp")}
            </h3>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
              Binance · Default 4H · EMA
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-50" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-profit" />
          </span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-profit">
            {t("btc.live_chart")}
          </span>
        </div>
      </div>

      <div className="relative h-[min(560px,70vh)] w-full" style={{ background: tvBg }}>
        {status === "loading" && (
          <div
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3"
            style={{ background: tvBg }}
          >
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink/15 border-t-accent" />
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Loading chart…
            </p>
          </div>
        )}

        {status === "error" && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-6 text-center"
            style={{ background: tvBg }}
          >
            <p className="text-sm font-medium text-text-primary">Chart took too long to load</p>
            <p className="max-w-sm font-mono text-[11px] text-text-muted">
              TradingView may be slow or blocked in your region. Retry or open the chart externally.
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                className="rounded-md border border-transparent bg-accent px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-fg transition-opacity hover:opacity-90"
              >
                Retry
              </button>
              <a
                href={TV_FULL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-ink/[0.12] bg-surface-secondary px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary transition-colors hover:border-ink/25 hover:text-text-primary"
              >
                Open TradingView ↗
              </a>
            </div>
          </div>
        )}

        <div ref={hostRef} className="h-full w-full" />
      </div>
    </div>
  );
};

/* ── SUB COMPONENTS ── */

const SectionLabel = ({ children }) => (
  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/80">{children}</p>
);

const PriceBadge = ({ label, value }) => {
  if (value == null) return null;
  const p = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm border tabular-nums ${
        p ? "bg-profit/10 text-profit border-profit/25" : "bg-loss/10 text-loss border-loss/25"
      }`}
    >
      <span className="opacity-70">{label}:</span> {p ? "+" : ""}
      {value?.toFixed(2)}%
    </span>
  );
};

const MetricCard = ({ label, value, iconType }) => (
  <div className="rounded-lg border border-ink/[0.08] bg-surface-raised p-4 relative overflow-hidden hover:-translate-y-0.5 hover:border-ink/12 transition-all duration-200">
    <div className="flex items-center justify-between mb-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/80">
        {label}
      </p>
      <div className="flex h-7 w-7 items-center justify-center rounded-md border border-ink/[0.1] bg-surface-secondary text-text-muted">
        <MetricIcon type={iconType} />
      </div>
    </div>
    <div className="h-px bg-ink/[0.04] mb-2.5" />
    <p className="font-mono text-base font-light text-text-primary tabular-nums tracking-tight">
      {value}
    </p>
  </div>
);

const MiniStat = ({ label, value }) => (
  <div className="bg-surface-secondary rounded-sm p-2.5 border border-ink/[0.04]">
    <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">{label}</p>
    <p className="font-mono text-sm font-light text-text-primary tabular-nums mt-1">
      {value || "-"}
    </p>
  </div>
);

const OnChainCard = ({ label, value, change, hint, hintColor = "text-text-muted" }) => (
  <div className="bg-surface-secondary rounded-sm p-3 border border-ink/[0.04]">
    <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1.5">{label}</p>
    <p className="font-mono text-base font-light text-text-primary tabular-nums">{value ?? "-"}</p>
    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap font-mono text-[10px] uppercase tracking-wider">
      {change != null && (
        <span
          className={`inline-flex items-center gap-0.5 tabular-nums ${
            change >= 0 ? "text-profit" : "text-loss"
          }`}
        >
          {change >= 0 ? <IconArrowUpMini /> : <IconArrowDownMini />}
          {Math.abs(change).toFixed(1)}% 7d
        </span>
      )}
      {hint && <span className={hintColor}>· {hint}</span>}
    </div>
  </div>
);

const EmptyState = ({ text }) => (
  <div className="flex items-center justify-center py-8">
    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-text-muted">
      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
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
  <div className="space-y-5">
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">
        Asset Overview
      </span>
    </div>
    <div className="bg-surface-raised rounded-md p-8 border border-loss/25 text-center relative overflow-hidden">
      <div className="w-12 h-12 mx-auto mb-4 rounded-md bg-loss/10 flex items-center justify-center border border-loss/25">
        <svg className="w-6 h-6 text-loss" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>
      <p className="font-mono text-[11px] uppercase tracking-wider text-loss mb-5">
        {t("btc.failed")}
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-accent/12 text-accent rounded-sm hover:bg-accent transition-colors font-mono text-[11px] uppercase tracking-wider border border-ink/12"
      >
        {t("btc.retry")}
      </button>
    </div>
  </div>
);

const LoadingSkeleton = () => (
  <div className="space-y-5">
    <style>{`@keyframes sp{0%,100%{opacity:.04}50%{opacity:.12}}.skel{animation:sp 2s ease-in-out infinite;background:rgb(var(--ink) / .06);border-radius:2px}`}</style>
    <div className="flex items-center gap-3">
      <div className="skel w-32 h-3" />
    </div>
    <div className="bg-surface-raised rounded-md p-6 border border-ink/[0.06]">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="skel w-12 h-12 rounded-md" />
          <div>
            <div className="skel w-32 h-6 mb-2" />
            <div className="skel w-20 h-3" />
          </div>
        </div>
        <div>
          <div className="skel w-56 h-10 mb-3" />
          <div className="skel w-44 h-4 ml-auto" />
        </div>
      </div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-surface-raised rounded-md p-4 border border-ink/[0.06]">
          <div className="skel w-20 h-3 mb-3" />
          <div className="skel w-28 h-5" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-surface-raised rounded-md p-5 h-36 border border-ink/[0.06]">
          <div className="skel w-16 h-3 mb-3" />
          <div className="skel w-full h-6 mb-2" />
          <div className="skel w-3/4 h-3" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="bg-surface-raised rounded-md p-5 h-80 border border-ink/[0.06]" />
      <div className="bg-surface-raised rounded-md p-5 h-80 border border-ink/[0.06]" />
    </div>
  </div>
);

/* ── SVG ICONS — Lucide-style minimal ── */

const MetricIcon = ({ type }) => {
  const icons = {
    range: (
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="14" width="4" height="7" />
        <rect x="10" y="9" width="4" height="12" />
        <rect x="17" y="5" width="4" height="16" />
      </svg>
    ),
    mcap: (
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M10 7 V17 M14 7 V17 M9 9 H14.5 a1.8 1.8 0 010 3.5 H9 M9 12.5 H15 a1.8 1.8 0 010 3.5 H9" />
      </svg>
    ),
    volume: (
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 17 L8 12 L13 15 L21 6" />
        <path d="M16 6 L21 6 L21 11" />
      </svg>
    ),
    dominance: (
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      >
        <path d="M12 3 L14.5 8.5 L20.5 9.3 L16 13.5 L17.2 19.5 L12 16.5 L6.8 19.5 L8 13.5 L3.5 9.3 L9.5 8.5 Z" />
      </svg>
    ),
  };
  return icons[type] || icons.range;
};

const IconSupply = () => (
  <svg
    className="w-3.5 h-3.5 text-text-muted"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <ellipse cx="12" cy="6" rx="8" ry="3" />
    <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
    <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </svg>
);

const IconAth = () => (
  <svg
    className="w-3.5 h-3.5 text-text-muted"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 9l6-6 6 6" />
    <path d="M12 3v18" />
    <path d="M4 21h16" />
  </svg>
);

const IconGauge = () => (
  <svg
    className="w-3.5 h-3.5 text-text-muted"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 14l4-4" />
    <path d="M3.34 19a10 10 0 1 1 17.32 0" />
  </svg>
);

const IconChart = () => (
  <svg
    className="w-3.5 h-3.5 text-text-muted"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 3v18h18" />
    <path d="M7 14l4-4 4 4 6-6" />
  </svg>
);

const IconNetwork = () => (
  <svg
    className="w-3.5 h-3.5 text-text-muted"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <circle cx="5" cy="5" r="2" />
    <circle cx="19" cy="5" r="2" />
    <circle cx="5" cy="19" r="2" />
    <circle cx="19" cy="19" r="2" />
    <path d="M6.5 6.5L10 10M17.5 6.5L14 10M6.5 17.5L10 14M17.5 17.5L14 14" />
  </svg>
);

const IconOnchain = () => (
  <svg
    className="w-3.5 h-3.5 text-text-muted"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <path d="M10 6.5h4M17.5 10v4M10 17.5h4M6.5 10v4" />
  </svg>
);

const IconNews = () => (
  <svg
    className="w-3.5 h-3.5 text-text-muted"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2" />
    <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6z" />
  </svg>
);

const IconArrowUp = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
  </svg>
);

const IconArrowDown = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
  </svg>
);

const IconArrowUpMini = () => (
  <svg
    className="w-2.5 h-2.5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
  </svg>
);

const IconArrowDownMini = () => (
  <svg
    className="w-2.5 h-2.5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2.5"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const IconCross = () => (
  <svg
    className="w-3 h-3"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
  >
    <path d="M12 4v16M4 12h16M6 6l12 12M18 6L6 18" />
  </svg>
);

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

const IconBtcLarge = () => <span className="font-mono text-5xl text-text-muted/15">₿</span>;

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
