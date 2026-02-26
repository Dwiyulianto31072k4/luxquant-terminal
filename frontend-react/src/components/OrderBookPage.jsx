// src/components/OrderBookPage.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next"; // <-- 1. Import i18n
import orderbookApi from "../services/orderbookApi";

// ═══════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════
const SYMBOLS = [
  { key: "BTCUSDT", label: "BTC/USDT", icon: "₿", color: "#F7931A" },
  { key: "ETHUSDT", label: "ETH/USDT", icon: "Ξ", color: "#627EEA" },
];

const REFRESH_INTERVAL = 15000; // 15 seconds

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════
const fmt = (val) => {
  if (!val) return "$0";
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
};

const fmtPrice = (val) => {
  if (!val) return "$0";
  return val >= 1000 ? `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${val.toFixed(4)}`;
};

const sentimentColors = {
  strong_buy: { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.3)", text: "#22c55e", glow: "0 0 20px rgba(34,197,94,0.2)" },
  buy: { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.2)", text: "#4ade80", glow: "none" },
  neutral: { bg: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.1)", text: "#a1a1aa", glow: "none" },
  sell: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", text: "#f87171", glow: "none" },
  strong_sell: { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.3)", text: "#ef4444", glow: "0 0 20px rgba(239,68,68,0.2)" },
};

// ═══════════════════════════════════════════
// Imbalance Gauge Component
// ═══════════════════════════════════════════
const ImbalanceGauge = ({ data, t }) => {
  const { bid_pct, ask_pct, bid_usd, ask_usd, sentiment } = data || {};
  const sc = sentimentColors[sentiment] || sentimentColors.neutral;

  // Terjemahkan sentimen menggunakan kamus btc yang sudah ada
  const getTranslatedSentiment = () => {
    if (!sentiment) return t('orderbook.loading');
    if (sentiment === 'strong_buy') return t('btc.strong_buy');
    if (sentiment === 'buy') return t('btc.buy');
    if (sentiment === 'strong_sell') return t('btc.strong_sell');
    if (sentiment === 'sell') return t('btc.sell');
    return t('btc.neutral');
  };

  return (
    <div className="rounded-2xl p-5" style={{ background: sc.bg, border: `1px solid ${sc.border}`, boxShadow: sc.glow }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-text-muted uppercase tracking-wider font-semibold">{t('orderbook.imbalance_title')}</p>
          <p className="text-xl font-bold mt-1" style={{ color: sc.text }}>{getTranslatedSentiment()}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-muted">{t('orderbook.bid_ask_vol')}</p>
          <p className="text-sm font-semibold text-white">{fmt(bid_usd)} <span className="text-text-muted">/</span> {fmt(ask_usd)}</p>
        </div>
      </div>

      {/* Bar */}
      <div className="relative h-8 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div
          className="absolute left-0 top-0 bottom-0 rounded-l-full transition-all duration-700"
          style={{ width: `${bid_pct || 50}%`, background: "linear-gradient(90deg, #166534, #22c55e)" }}
        />
        <div
          className="absolute right-0 top-0 bottom-0 rounded-r-full transition-all duration-700"
          style={{ width: `${ask_pct || 50}%`, background: "linear-gradient(90deg, #ef4444, #991b1b)" }}
        />
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="text-green-400">🟢 {(bid_pct || 50).toFixed(1)}%</span>
            <span className="text-text-muted">|</span>
            <span className="text-red-400">{(ask_pct || 50).toFixed(1)}% 🔴</span>
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-2 text-[11px] text-text-muted">
        <span>{t('orderbook.buyers_bids')}</span>
        <span>{t('orderbook.sellers_asks')}</span>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// Wall Card Component
// ═══════════════════════════════════════════
const WallCard = ({ wall, type, maxUsd }) => {
  const isSupport = type === "buy";
  const barColor = isSupport ? "#22c55e" : "#ef4444";
  const barPct = maxUsd > 0 ? Math.min((wall.usd / maxUsd) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg transition-colors hover:bg-white/[0.03]">
      <div className="flex-shrink-0 w-2 h-2 rounded-full" style={{ background: barColor }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-mono font-semibold text-white">{fmtPrice(wall.price)}</span>
          <span className="text-sm font-semibold" style={{ color: barColor }}>{fmt(wall.usd)}</span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barPct}%`, background: barColor }} />
        </div>
      </div>
      <span className="text-[10px] text-text-muted font-semibold flex-shrink-0">{wall.strength}x</span>
    </div>
  );
};

// ═══════════════════════════════════════════
// Depth Chart Component (visual bars)
// ═══════════════════════════════════════════
const DepthChart = ({ depth, t }) => {
  const bids = depth?.bids || [];
  const asks = depth?.asks || [];

  if (!bids.length && !asks.length) {
    return <div className="text-center text-text-muted py-8 text-sm">{t('orderbook.no_depth')}</div>;
  }

  // Get max cumulative for scaling
  const maxBid = bids.length ? bids[bids.length - 1].cumulative_usd : 0;
  const maxAsk = asks.length ? asks[asks.length - 1].cumulative_usd : 0;
  const maxVal = Math.max(maxBid, maxAsk) || 1;

  // Sample every Nth for display (show ~25 levels each side)
  const sampleRate = Math.max(1, Math.floor(bids.length / 25));
  const sampledBids = bids.filter((_, i) => i % sampleRate === 0).slice(-25);
  const sampledAsks = asks.filter((_, i) => i % sampleRate === 0).slice(0, 25);

  return (
    <div className="flex flex-col gap-0">
      {/* Asks (reversed - highest first) */}
      {[...sampledAsks].reverse().map((a, i) => {
        const pct = (a.cumulative_usd / maxVal) * 100;
        return (
          <div key={`a-${i}`} className="flex items-center gap-2 h-5 group">
            <span className="text-[10px] text-text-muted w-20 text-right font-mono truncate">{fmtPrice(a.price)}</span>
            <div className="flex-1 h-3 rounded-sm overflow-hidden relative" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div
                className="absolute right-0 top-0 bottom-0 rounded-sm transition-all duration-300"
                style={{ width: `${pct}%`, background: "linear-gradient(270deg, rgba(239,68,68,0.5), rgba(239,68,68,0.1))" }}
              />
            </div>
            <span className="text-[10px] text-red-400/70 w-16 text-right font-mono opacity-0 group-hover:opacity-100 transition-opacity">{fmt(a.cumulative_usd)}</span>
          </div>
        );
      })}

      {/* Mid price divider */}
      <div className="flex items-center gap-2 h-7 my-1">
        <div className="flex-1 h-px bg-gold-primary/30" />
        <span className="text-xs font-bold text-gold-primary px-2">{t('orderbook.mid')}</span>
        <div className="flex-1 h-px bg-gold-primary/30" />
      </div>

      {/* Bids */}
      {sampledBids.map((b, i) => {
        const pct = (b.cumulative_usd / maxVal) * 100;
        return (
          <div key={`b-${i}`} className="flex items-center gap-2 h-5 group">
            <span className="text-[10px] text-text-muted w-20 text-right font-mono truncate">{fmtPrice(b.price)}</span>
            <div className="flex-1 h-3 rounded-sm overflow-hidden relative" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div
                className="absolute left-0 top-0 bottom-0 rounded-sm transition-all duration-300"
                style={{ width: `${pct}%`, background: "linear-gradient(90deg, rgba(34,197,94,0.1), rgba(34,197,94,0.5))" }}
              />
            </div>
            <span className="text-[10px] text-green-400/70 w-16 text-right font-mono opacity-0 group-hover:opacity-100 transition-opacity">{fmt(b.cumulative_usd)}</span>
          </div>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════
// S/R Levels Component
// ═══════════════════════════════════════════
const SRLevels = ({ data, t }) => {
  const support = data?.support || [];
  const resistance = data?.resistance || [];

  return (
    <div className="space-y-3">
      {/* Resistance */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-red-400 font-semibold mb-2">🔴 {t('orderbook.res_levels')}</p>
        {resistance.length ? resistance.map((r, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-red-500/5">
            <span className="text-sm font-mono font-semibold text-white">{fmtPrice(r.price)}</span>
            <span className="text-xs text-red-400 font-semibold">{fmt(r.usd)} {t('orderbook.wall')}</span>
          </div>
        )) : <p className="text-xs text-text-muted px-2">{t('orderbook.no_res_walls')}</p>}
      </div>

      <div className="h-px bg-white/[0.05]" />

      {/* Support */}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-green-400 font-semibold mb-2">🟢 {t('orderbook.sup_levels')}</p>
        {support.length ? support.map((s, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-green-500/5">
            <span className="text-sm font-mono font-semibold text-white">{fmtPrice(s.price)}</span>
            <span className="text-xs text-green-400 font-semibold">{fmt(s.usd)} {t('orderbook.wall')}</span>
          </div>
        )) : <p className="text-xs text-text-muted px-2">{t('orderbook.no_sup_walls')}</p>}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════
export default function OrderBookPage() {
  const { t } = useTranslation(); // <-- 2. Panggil hook i18n
  const [activeSymbol, setActiveSymbol] = useState("BTCUSDT");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const result = await orderbookApi.getAnalysis(activeSymbol);
      setData(result);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error("OrderBook fetch error:", err);
      setError(t('orderbook.loading_ob')); // Reuse string from dict
    } finally {
      setLoading(false);
    }
  }, [activeSymbol, t]);

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => fetchData(false), REFRESH_INTERVAL);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchData]);

  const symbolConfig = SYMBOLS.find(s => s.key === activeSymbol) || SYMBOLS[0];

  // Derived data
  const imbalance = data?.imbalance || {};
  const walls = data?.walls || { buy: [], sell: [] };
  const sr = data?.support_resistance || {};
  const depth = data?.depth || {};

  const maxWallUsd = Math.max(
    ...((walls.buy || []).map(w => w.usd)),
    ...((walls.sell || []).map(w => w.usd)),
    1
  );

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            📊 {t('orderbook.title')}
          </h1>
          <p className="text-sm text-text-muted mt-1">{t('orderbook.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              autoRefresh
                ? "bg-green-500/15 text-green-400 border border-green-500/30"
                : "bg-white/5 text-text-muted border border-white/10"
            }`}
          >
            {autoRefresh ? t('orderbook.live_15s') : t('orderbook.paused_dot')}
          </button>

          {/* Manual refresh */}
          <button
            onClick={() => fetchData(false)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-text-secondary border border-white/10 hover:bg-white/10 transition-all"
          >
            {t('orderbook.refresh')}
          </button>
        </div>
      </div>

      {/* ── Symbol Tabs ── */}
      <div className="flex items-center gap-2">
        {SYMBOLS.map((sym) => (
          <button
            key={sym.key}
            onClick={() => setActiveSymbol(sym.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeSymbol === sym.key
                ? "text-white border"
                : "bg-white/[0.03] text-text-secondary border border-transparent hover:bg-white/[0.06]"
            }`}
            style={activeSymbol === sym.key ? {
              background: `${sym.color}15`,
              borderColor: `${sym.color}40`,
              color: sym.color,
            } : {}}
          >
            <span className="text-lg">{sym.icon}</span>
            <span>{sym.label}</span>
          </button>
        ))}

        {/* Price display */}
        {data?.mid_price ? (
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-lg font-mono font-bold text-white">{fmtPrice(data.mid_price)}</p>
              <p className="text-[11px] text-text-muted">{t('orderbook.spread')} {data.spread_pct?.toFixed(4)}%</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Loading / Error ── */}
      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
            <p className="text-sm text-text-muted">{t('orderbook.loading_ob')}</p>
          </div>
        </div>
      )}

      {error && !data && (
        <div className="rounded-xl p-6 text-center" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <p className="text-red-400">{error}</p>
          <button onClick={() => fetchData(true)} className="mt-3 px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
            {t('orderbook.retry')}
          </button>
        </div>
      )}

      {data && (
        <>
          {/* ── Imbalance Gauge ── */}
          <ImbalanceGauge data={imbalance} t={t} />

          {/* ── Main Grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: Depth Chart */}
            <div className="lg:col-span-2 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">📈 {t('orderbook.depth_chart')}</h3>
                <span className="text-[11px] text-text-muted">{data.total_levels} {t('orderbook.levels')}</span>
              </div>
              <DepthChart depth={depth} t={t} />
            </div>

            {/* Right: S/R Levels */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-sm font-semibold text-white mb-3">🎯 {t('orderbook.sup_res')}</h3>
              <SRLevels data={sr} t={t} />
            </div>
          </div>

          {/* ── Walls Grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Buy Walls */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(34,197,94,0.03)", border: "1px solid rgba(34,197,94,0.1)" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-green-400">🟢 {t('orderbook.buy_walls')}</h3>
                <span className="text-xs text-green-400/70 font-semibold">{fmt(walls.buy_total_usd)}</span>
              </div>
              {walls.buy?.length ? (
                <div className="space-y-0.5">
                  {walls.buy.map((w, i) => <WallCard key={i} wall={w} type="buy" maxUsd={maxWallUsd} />)}
                </div>
              ) : (
                <p className="text-sm text-text-muted text-center py-4">{t('orderbook.no_buy_walls')}</p>
              )}
            </div>

            {/* Sell Walls */}
            <div className="rounded-2xl p-4" style={{ background: "rgba(239,68,68,0.03)", border: "1px solid rgba(239,68,68,0.1)" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-red-400">🔴 {t('orderbook.sell_walls')}</h3>
                <span className="text-xs text-red-400/70 font-semibold">{fmt(walls.sell_total_usd)}</span>
              </div>
              {walls.sell?.length ? (
                <div className="space-y-0.5">
                  {walls.sell.map((w, i) => <WallCard key={i} wall={w} type="sell" maxUsd={maxWallUsd} />)}
                </div>
              ) : (
                <p className="text-sm text-text-muted text-center py-4">{t('orderbook.no_sell_walls')}</p>
              )}
            </div>
          </div>

          {/* ── Footer Info ── */}
          <div className="flex items-center justify-center gap-4 text-[11px] text-text-muted py-2">
            <span>{t('orderbook.data_source')}</span>
            <span>·</span>
            <span>{t('orderbook.cache_10s')}</span>
            <span>·</span>
            <span>{t('orderbook.auto_refresh')} {autoRefresh ? "15s" : t('orderbook.paused')}</span>
            {lastUpdate && (
              <>
                <span>·</span>
                <span>{t('orderbook.updated')} {lastUpdate.toLocaleTimeString()}</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}