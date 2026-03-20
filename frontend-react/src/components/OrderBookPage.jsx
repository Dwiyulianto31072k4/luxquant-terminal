// src/components/OrderBookPage.jsx
// Redesigned: Compact layout, scrollable depth, integrated derivatives
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import orderbookApi from "../services/orderbookApi";
import api from "../services/api";

// ═══════════════════════════════════════
// Constants & Helpers
// ═══════════════════════════════════════
const SYMBOLS = [
  { key: "BTCUSDT", label: "BTC/USDT", icon: "₿", color: "#F7931A" },
  { key: "ETHUSDT", label: "ETH/USDT", icon: "Ξ", color: "#627EEA" },
];

const fmt = (v) => {
  if (!v) return "$0";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};

const fmtP = (v) => {
  if (!v) return "$0";
  return v >= 1000
    ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${v.toFixed(4)}`;
};

const fmtRate = (r) => {
  if (r == null) return "—";
  return `${(r * 100).toFixed(4)}%`;
};

const timeAgo = (ts) => {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

const SC = {
  strong_buy: { bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.25)", text: "#22c55e" },
  buy: { bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.18)", text: "#4ade80" },
  neutral: { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "#a1a1aa" },
  sell: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.18)", text: "#f87171" },
  strong_sell: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.25)", text: "#ef4444" },
};

// ═══════════════════════════════════════
// Main Component
// ═══════════════════════════════════════
export default function OrderBookPage() {
  const { t } = useTranslation();
  const [sym, setSym] = useState("BTCUSDT");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);

  // Derivatives state
  const [liq, setLiq] = useState(null);
  const [funding, setFunding] = useState(null);
  const [longShort, setLongShort] = useState(null);
  const [oi, setOi] = useState(null);
  const [oiHist, setOiHist] = useState(null);

  const fetchOB = useCallback(async (showLoad = false) => {
    if (showLoad) setLoading(true);
    try {
      const result = await orderbookApi.getAnalysis(sym);
      setData(result);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error("OB fetch error:", err);
      setError(t("orderbook.loading_ob"));
    } finally {
      setLoading(false);
    }
  }, [sym, t]);

  const fetchDeriv = useCallback(async () => {
    try {
      const [liqR, ovR, oiR] = await Promise.allSettled([
        api.get("/market/liquidations"),
        api.get("/market/overview"),
        api.get("/market/oi-history", { params: { symbol: "BTCUSDT", period: "1h", limit: 24 } }),
      ]);
      if (liqR.status === "fulfilled") setLiq(liqR.value.data);
      if (ovR.status === "fulfilled") {
        const ov = ovR.value.data;
        if (ov?.funding?.rates) setFunding(ov.funding.rates);
        if (ov?.long_short) setLongShort(ov.long_short);
        if (ov?.open_interest) setOi(ov.open_interest);
      }
      if (oiR.status === "fulfilled") setOiHist(oiR.value.data);
    } catch (e) {
      console.error("Deriv fetch error:", e);
    }
  }, []);

  useEffect(() => { fetchOB(true); }, [fetchOB]);
  useEffect(() => { fetchDeriv(); }, [fetchDeriv]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchOB(false);
        fetchDeriv();
      }, 15000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchOB, fetchDeriv]);

  const imb = data?.imbalance || {};
  const walls = data?.walls || { buy: [], sell: [] };
  const sr = data?.support_resistance || {};
  const depth = data?.depth || {};
  const sc = SC[imb.sentiment] || SC.neutral;

  const getSentiment = () => {
    if (!imb.sentiment) return "—";
    if (imb.sentiment === "strong_buy") return t("btc.strong_buy");
    if (imb.sentiment === "buy") return "Buy";
    if (imb.sentiment === "strong_sell") return t("btc.strong_sell");
    if (imb.sentiment === "sell") return "Sell";
    return t("btc.neutral");
  };

  return (
    <div className="space-y-4">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2" style={{ fontFamily: "Playfair Display, serif" }}>
              📊 {t("orderbook.title")}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#6b5c52" }}>{t("orderbook.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
            style={autoRefresh
              ? { background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }
              : { background: "rgba(255,255,255,0.03)", color: "#6b5c52", border: "1px solid rgba(255,255,255,0.06)" }}>
            {autoRefresh ? "● Live 15s" : "⏸ Paused"}
          </button>
          <button onClick={() => fetchOB(false)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.03)", color: "#6b5c52", border: "1px solid rgba(255,255,255,0.06)" }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ═══ SYMBOL TABS + PRICE ═══ */}
      <div className="flex items-center gap-2">
        {SYMBOLS.map((s) => (
          <button key={s.key} onClick={() => setSym(s.key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
            style={sym === s.key
              ? { background: `${s.color}12`, border: `1px solid ${s.color}35`, color: s.color }
              : { background: "rgba(255,255,255,0.02)", border: "1px solid transparent", color: "#6b5c52" }}>
            <span className="text-base">{s.icon}</span> {s.label}
          </button>
        ))}
        {data?.mid_price && (
          <div className="ml-auto text-right">
            <p className="text-lg font-mono font-bold text-white">{fmtP(data.mid_price)}</p>
            <p className="text-[10px]" style={{ color: "#5a4d42" }}>Spread: {data.spread_pct?.toFixed(4)}%</p>
          </div>
        )}
      </div>

      {/* ═══ LOADING / ERROR ═══ */}
      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-transparent rounded-full animate-spin" style={{ borderTopColor: "#d4a853" }} />
        </div>
      )}
      {error && !data && (
        <div className="rounded-xl p-5 text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <p className="text-red-400 text-sm mb-2">{error}</p>
          <button onClick={() => fetchOB(true)} className="px-3 py-1 rounded-lg text-xs font-semibold"
            style={{ background: "rgba(212,168,83,0.12)", color: "#d4a853", border: "1px solid rgba(212,168,83,0.25)" }}>
            {t("orderbook.retry")}
          </button>
        </div>
      )}

      {data && (
        <>
          {/* ═══ IMBALANCE BAR (compact) ═══ */}
          <div className="rounded-xl p-3.5" style={{ background: sc.bg, border: `1px solid ${sc.border}` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <p className="text-lg font-bold" style={{ color: sc.text }}>{getSentiment()}</p>
                <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "#5a4d42" }}>{t("orderbook.imbalance_title")}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white font-mono">{fmt(imb.bid_usd)} <span style={{ color: "#5a4d42" }}>/</span> {fmt(imb.ask_usd)}</p>
              </div>
            </div>
            <div className="relative h-5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="absolute left-0 top-0 bottom-0 rounded-l-full transition-all duration-700"
                style={{ width: `${imb.bid_pct || 50}%`, background: "linear-gradient(90deg, #166534, #22c55e)" }} />
              <div className="absolute right-0 top-0 bottom-0 rounded-r-full transition-all duration-700"
                style={{ width: `${imb.ask_pct || 50}%`, background: "linear-gradient(90deg, #ef4444, #991b1b)" }} />
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold gap-2">
                <span className="text-green-300">{(imb.bid_pct || 50).toFixed(1)}%</span>
                <span style={{ color: "#5a4d42" }}>|</span>
                <span className="text-red-300">{(imb.ask_pct || 50).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* ═══ MAIN GRID: Depth (left) + S/R + Walls (right) ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">

            {/* ── Left: Depth Chart (compact scrollable) ── */}
            <div className="lg:col-span-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-white">📈 {t("orderbook.depth_chart")}</h3>
                <span className="text-[10px]" style={{ color: "#5a4d42" }}>{data.total_levels} {t("orderbook.levels")}</span>
              </div>
              <CompactDepth depth={depth} t={t} />
            </div>

            {/* ── Right: S/R + Walls stacked ── */}
            <div className="lg:col-span-2 space-y-3">
              {/* S/R Levels */}
              <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
                <h3 className="text-xs font-semibold text-white mb-2">🎯 {t("orderbook.sup_res")}</h3>
                <CompactSR sr={sr} t={t} />
              </div>

              {/* Buy + Sell Walls side by side */}
              <div className="grid grid-cols-2 gap-2">
                <WallsCard walls={walls.buy} label={t("orderbook.buy_walls")} total={walls.buy_total_usd} type="buy" />
                <WallsCard walls={walls.sell} label={t("orderbook.sell_walls")} total={walls.sell_total_usd} type="sell" />
              </div>
            </div>
          </div>

          {/* ═══ DERIVATIVES INTELLIGENCE ═══ */}
          <div className="flex items-center gap-2 mt-2">
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              💥 Derivatives Intelligence
            </h2>
            <div className="flex-1 h-px" style={{ background: "rgba(212,168,83,0.12)" }} />
            <span className="text-[9px] uppercase tracking-wider" style={{ color: "#4a3f36" }}>LIVE · 15s</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <LiqCard data={liq} />
            <FundingCard data={funding} />
            <LSCard data={longShort} />
            <OICard data={oi} history={oiHist} />
          </div>
        </>
      )}

      {/* ═══ FOOTER ═══ */}
      <div className="flex items-center justify-center gap-3 text-[10px] py-2" style={{ color: "#3a3030" }}>
        <span>{t("orderbook.data_source")}</span>
        <span>·</span>
        <span>{autoRefresh ? "Live 15s" : t("orderbook.paused")}</span>
        {lastUpdate && <><span>·</span><span>{lastUpdate.toLocaleTimeString()}</span></>}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════
// Compact Depth Chart (scrollable, max-height)
// ═══════════════════════════════════════
const CompactDepth = ({ depth, t }) => {
  const bids = depth?.bids || [];
  const asks = depth?.asks || [];
  if (!bids.length && !asks.length) return <p className="text-center text-sm py-6" style={{ color: "#5a4d42" }}>{t("orderbook.no_depth")}</p>;

  const maxBid = bids.length ? bids[bids.length - 1].cumulative_usd : 0;
  const maxAsk = asks.length ? asks[asks.length - 1].cumulative_usd : 0;
  const maxVal = Math.max(maxBid, maxAsk) || 1;
  const rate = Math.max(1, Math.floor(bids.length / 18));
  const sBids = bids.filter((_, i) => i % rate === 0).slice(-18);
  const sAsks = asks.filter((_, i) => i % rate === 0).slice(0, 18);

  return (
    <div className="max-h-[420px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(212,168,83,0.12) transparent" }}>
      {/* Asks */}
      {[...sAsks].reverse().map((a, i) => {
        const pct = (a.cumulative_usd / maxVal) * 100;
        return (
          <div key={`a-${i}`} className="flex items-center gap-1.5 h-[18px] group">
            <span className="text-[9px] w-[72px] text-right font-mono truncate" style={{ color: "#5a4d42" }}>{fmtP(a.price)}</span>
            <div className="flex-1 h-2.5 rounded-sm relative" style={{ background: "rgba(255,255,255,0.015)" }}>
              <div className="absolute right-0 top-0 bottom-0 rounded-sm" style={{ width: `${pct}%`, background: "rgba(239,68,68,0.35)" }} />
            </div>
            <span className="text-[8px] w-12 text-right font-mono opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#ef4444" }}>{fmt(a.cumulative_usd)}</span>
          </div>
        );
      })}

      {/* Mid */}
      <div className="flex items-center gap-2 h-6 my-0.5">
        <div className="flex-1 h-px" style={{ background: "rgba(212,168,83,0.2)" }} />
        <span className="text-[10px] font-bold px-1.5" style={{ color: "#d4a853" }}>MID</span>
        <div className="flex-1 h-px" style={{ background: "rgba(212,168,83,0.2)" }} />
      </div>

      {/* Bids */}
      {sBids.map((b, i) => {
        const pct = (b.cumulative_usd / maxVal) * 100;
        return (
          <div key={`b-${i}`} className="flex items-center gap-1.5 h-[18px] group">
            <span className="text-[9px] w-[72px] text-right font-mono truncate" style={{ color: "#5a4d42" }}>{fmtP(b.price)}</span>
            <div className="flex-1 h-2.5 rounded-sm relative" style={{ background: "rgba(255,255,255,0.015)" }}>
              <div className="absolute left-0 top-0 bottom-0 rounded-sm" style={{ width: `${pct}%`, background: "rgba(34,197,94,0.35)" }} />
            </div>
            <span className="text-[8px] w-12 text-right font-mono opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#22c55e" }}>{fmt(b.cumulative_usd)}</span>
          </div>
        );
      })}
    </div>
  );
};


// ═══════════════════════════════════════
// Compact S/R Levels
// ═══════════════════════════════════════
const CompactSR = ({ sr, t }) => {
  const support = sr?.support || [];
  const resistance = sr?.resistance || [];
  return (
    <div className="space-y-2">
      <div>
        <p className="text-[9px] uppercase tracking-wider text-red-400 font-semibold mb-1">🔴 {t("orderbook.res_levels")}</p>
        {resistance.length ? resistance.map((r, i) => (
          <div key={i} className="flex justify-between py-1 text-[11px]">
            <span className="font-mono font-semibold text-white">{fmtP(r.price)}</span>
            <span className="text-red-400 font-semibold">{fmt(r.usd)}</span>
          </div>
        )) : <p className="text-[10px]" style={{ color: "#5a4d42" }}>{t("orderbook.no_res_walls")}</p>}
      </div>
      <div className="h-px" style={{ background: "rgba(255,255,255,0.03)" }} />
      <div>
        <p className="text-[9px] uppercase tracking-wider text-green-400 font-semibold mb-1">🟢 {t("orderbook.sup_levels")}</p>
        {support.length ? support.map((s, i) => (
          <div key={i} className="flex justify-between py-1 text-[11px]">
            <span className="font-mono font-semibold text-white">{fmtP(s.price)}</span>
            <span className="text-green-400 font-semibold">{fmt(s.usd)}</span>
          </div>
        )) : <p className="text-[10px]" style={{ color: "#5a4d42" }}>{t("orderbook.no_sup_walls")}</p>}
      </div>
    </div>
  );
};


// ═══════════════════════════════════════
// Compact Walls Card
// ═══════════════════════════════════════
const WallsCard = ({ walls, label, total, type }) => {
  const isB = type === "buy";
  const color = isB ? "#22c55e" : "#ef4444";
  const bg = isB ? "rgba(34,197,94,0.03)" : "rgba(239,68,68,0.03)";
  const border = isB ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)";
  const maxUsd = Math.max(...(walls || []).map(w => w.usd), 1);

  return (
    <div className="rounded-xl p-3" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-semibold" style={{ color }}>{isB ? "🟢" : "🔴"} {label}</h4>
        <span className="text-[10px] font-semibold" style={{ color: `${color}99` }}>{fmt(total)}</span>
      </div>
      {walls?.length ? (
        <div className="space-y-1.5">
          {walls.slice(0, 4).map((w, i) => (
            <div key={i}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="font-mono text-white">{fmtP(w.price)}</span>
                <span className="font-mono" style={{ color }}>{fmt(w.usd)}</span>
              </div>
              <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((w.usd / maxUsd) * 100, 100)}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
      ) : <p className="text-[10px] text-center py-3" style={{ color: "#5a4d42" }}>No walls</p>}
    </div>
  );
};


// ═══════════════════════════════════════
// Liquidation Card (compact)
// ═══════════════════════════════════════
const LiqCard = ({ data }) => {
  if (!data) return <MiniSkeleton label="💥 Liquidations" />;
  const { summary, recent } = data;
  const total = summary?.total_usd || 0;
  const longL = summary?.long_liquidated || 0;
  const shortL = summary?.short_liquidated || 0;
  const lPct = total > 0 ? (longL / total) * 100 : 50;

  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-semibold text-white">💥 Liquidations</h4>
        <span className="text-xs font-mono font-bold text-white">{fmt(total)}</span>
      </div>
      {/* Bar */}
      <div className="h-2 rounded-full overflow-hidden mb-1.5" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="h-full float-left" style={{ width: `${lPct}%`, background: "#22c55e" }} />
        <div className="h-full float-right" style={{ width: `${100 - lPct}%`, background: "#ef4444" }} />
      </div>
      <div className="flex justify-between text-[9px] mb-2">
        <span className="text-green-400">Longs {fmt(longL)}</span>
        <span className="text-red-400">Shorts {fmt(shortL)}</span>
      </div>
      {/* Recent */}
      <div className="space-y-0.5">
        {(recent || []).slice(0, 4).map((l, i) => {
          const isL = l.side === "SELL";
          return (
            <div key={i} className="flex items-center gap-1 text-[10px]">
              <span className={`font-bold px-1 rounded text-[8px] ${isL ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                {isL ? "L" : "S"}
              </span>
              <span className="text-white">{l.symbol}</span>
              <span className="font-mono ml-auto" style={{ color: "#d4a853" }}>{fmt(l.usd)}</span>
              <span className="text-[8px]" style={{ color: "#4a3f36" }}>{timeAgo(l.time)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ═══════════════════════════════════════
// Funding Card (compact)
// ═══════════════════════════════════════
const FundingCard = ({ data }) => {
  if (!data?.length) return <MiniSkeleton label="📊 Funding" />;
  const avg = data.reduce((s, d) => s + (d.rate || 0), 0) / data.length;
  const avgColor = avg > 0 ? "#22c55e" : avg < 0 ? "#ef4444" : "#6b5c52";

  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-semibold text-white">📊 Funding Rates</h4>
        <span className="text-[10px] font-mono font-bold" style={{ color: avgColor }}>avg {fmtRate(avg)}</span>
      </div>
      <div className="space-y-1.5">
        {data.map((item, i) => {
          const r = item.rate || 0;
          const c = r > 0 ? "#22c55e" : r < 0 ? "#ef4444" : "#6b5c52";
          const extreme = Math.abs(r) > 0.001;
          return (
            <div key={i} className="flex items-center justify-between py-1 px-2 rounded-lg" style={{ background: extreme ? (r > 0 ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)") : "transparent" }}>
              <span className="text-[11px] font-semibold text-white">{item.symbol}</span>
              <div className="flex items-center gap-1.5">
                {extreme && <span className="text-[7px] px-1 py-0.5 rounded font-bold" style={{ background: `${c}12`, color: c }}>{r > 0 ? "BULL" : "BEAR"}</span>}
                <span className="text-sm font-mono font-bold" style={{ color: c }}>{fmtRate(r)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ═══════════════════════════════════════
// Long/Short Card (compact)
// ═══════════════════════════════════════
const LSCard = ({ data }) => {
  if (!data) return <MiniSkeleton label="⚖️ Long/Short" />;
  const lPct = (data.long || data.longAccount || 0.5) * 100;
  const sPct = (data.short || data.shortAccount || 0.5) * 100;
  const ratio = data.ratio || data.longShortRatio || 1;
  const dom = lPct > sPct;

  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-semibold text-white">⚖️ Long/Short</h4>
        <span className="text-xs font-mono font-bold" style={{ color: dom ? "#22c55e" : "#ef4444" }}>{ratio.toFixed(2)}</span>
      </div>
      {/* Gauge */}
      <div className="h-4 rounded-full overflow-hidden flex mb-1.5" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="h-full flex items-center justify-center transition-all duration-700" style={{ width: `${lPct}%`, background: "linear-gradient(90deg, #166534, #22c55e)" }}>
          {lPct > 25 && <span className="text-[9px] font-bold text-white">{lPct.toFixed(1)}%</span>}
        </div>
        <div className="h-full flex items-center justify-center transition-all duration-700" style={{ width: `${sPct}%`, background: "linear-gradient(90deg, #ef4444, #991b1b)" }}>
          {sPct > 25 && <span className="text-[9px] font-bold text-white">{sPct.toFixed(1)}%</span>}
        </div>
      </div>
      <div className="flex justify-between text-[9px]">
        <span className="text-green-400">🟢 Long</span>
        <span className="text-red-400">Short 🔴</span>
      </div>
      <p className="text-[9px] mt-2 leading-relaxed" style={{ color: "#5a4d42" }}>
        {dom ? "Longs dominant — watch for squeeze if price drops." : "Shorts dominant — potential squeeze on price rise."}
      </p>
    </div>
  );
};


// ═══════════════════════════════════════
// Open Interest Card (compact + sparkline)
// ═══════════════════════════════════════
const OICard = ({ data, history }) => {
  if (!data) return <MiniSkeleton label="📈 Open Interest" />;
  const oiUsd = data.total_usd || data.openInterestUsd || 0;
  const oiBtc = data.btc || data.openInterest || 0;
  const hist = (history || []).map(h => h.sumOpenInterestValue || 0);
  const maxH = Math.max(...hist, 1);
  const minH = Math.min(...hist.filter(v => v > 0), maxH);
  const range = maxH - minH || 1;
  const trend = hist.length >= 2 ? ((hist[hist.length - 1] - hist[0]) / hist[0]) * 100 : 0;

  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-semibold text-white">📈 Open Interest</h4>
        {trend !== 0 && (
          <span className={`text-[10px] font-mono font-bold px-1 rounded ${trend > 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
            {trend > 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-lg font-mono font-bold text-white">{fmt(oiUsd)}</p>
      <p className="text-[9px] font-mono mb-2" style={{ color: "#5a4d42" }}>{oiBtc.toLocaleString()} BTC</p>

      {/* Sparkline */}
      {hist.length > 2 && (
        <svg viewBox={`0 0 ${hist.length} 32`} className="w-full h-8" preserveAspectRatio="none">
          <path d={`M0,${32 - ((hist[0] - minH) / range) * 28} ${hist.map((v, i) => `L${i},${32 - ((v - minH) / range) * 28}`).join(" ")} L${hist.length - 1},32 L0,32 Z`}
            fill="rgba(212,168,83,0.06)" />
          <polyline points={hist.map((v, i) => `${i},${32 - ((v - minH) / range) * 28}`).join(" ")}
            fill="none" stroke="#d4a853" strokeWidth="1.2" />
        </svg>
      )}
      <p className="text-[9px] mt-1" style={{ color: "#5a4d42" }}>
        {trend > 2 ? "OI rising — new positions, expect volatility." : trend < -2 ? "OI declining — positions closing." : "OI stable — consolidation."}
      </p>
    </div>
  );
};


// ═══════════════════════════════════════
// Mini Skeleton
// ═══════════════════════════════════════
const MiniSkeleton = ({ label }) => (
  <div className="rounded-xl p-3 animate-pulse" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.03)" }}>
    <div className="flex items-center gap-1.5 mb-3">
      <span className="text-[11px]">{label.split(" ")[0]}</span>
      <div className="h-3 w-20 rounded" style={{ background: "rgba(255,255,255,0.04)" }} />
    </div>
    <div className="space-y-2">
      <div className="h-5 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
      <div className="h-3 w-3/4 rounded" style={{ background: "rgba(255,255,255,0.025)" }} />
      <div className="h-3 w-1/2 rounded" style={{ background: "rgba(255,255,255,0.02)" }} />
    </div>
  </div>
);