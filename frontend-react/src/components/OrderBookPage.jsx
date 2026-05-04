// src/components/OrderBookPage.jsx
// v2: Fixed data fetching (derivatives-pulse), gold-standardized SVG icons, premium typography
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import orderbookApi from "../services/orderbookApi";
import api from "../services/api";

// ═══════════════════════════════════════
// Constants & Helpers
// ═══════════════════════════════════════
const SYMBOLS = [
  { key: "BTCUSDT", label: "BTC/USDT", icon: "₿" },
  { key: "ETHUSDT", label: "ETH/USDT", icon: "Ξ" },
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
  neutral: { bg: "rgba(212,168,83,0.06)", border: "rgba(212,168,83,0.18)", text: "#d4a853" },
  sell: { bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.18)", text: "#f87171" },
  strong_sell: { bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.25)", text: "#ef4444" },
};

// ═══════════════════════════════════════
// SVG Icons (gold-tinted, crafted)
// ═══════════════════════════════════════
const Icons = {
  orderbook: (
    <g>
      <rect x="3" y="4" width="8" height="16" rx="1" fill="currentColor" opacity="0.18" />
      <rect x="3" y="4" width="8" height="16" rx="1" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <rect x="13" y="4" width="8" height="16" rx="1" fill="currentColor" opacity="0.32" />
      <rect x="13" y="4" width="8" height="16" rx="1" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <line x1="5" y1="8" x2="9" y2="8" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="11" x2="8" y2="11" stroke="currentColor" strokeWidth="1.2" />
      <line x1="5" y1="14" x2="9" y2="14" stroke="currentColor" strokeWidth="1.2" />
      <line x1="15" y1="8" x2="19" y2="8" stroke="currentColor" strokeWidth="1.2" />
      <line x1="15" y1="11" x2="18" y2="11" stroke="currentColor" strokeWidth="1.2" />
      <line x1="15" y1="14" x2="19" y2="14" stroke="currentColor" strokeWidth="1.2" />
    </g>
  ),
  depth: (
    <g>
      <path d="M3 17 L8 12 L13 15 L21 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M3 17 L8 12 L13 15 L21 6 L21 21 L3 21 Z" fill="currentColor" opacity="0.15" />
      <circle cx="8" cy="12" r="1.4" fill="currentColor" />
      <circle cx="13" cy="15" r="1.4" fill="currentColor" />
      <circle cx="21" cy="6" r="1.4" fill="currentColor" />
    </g>
  ),
  target: (
    <g>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.3" fill="none" />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.55" fill="none" />
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.7" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </g>
  ),
  liquidation: (
    <g>
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.5" />
      <path d="M12 12 L6 6 M12 12 L18 6 M12 12 L6 18 M12 12 L18 18 M12 12 L12 4 M12 12 L12 20 M12 12 L4 12 M12 12 L20 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  ),
  funding: (
    <g>
      <rect x="5" y="13" width="3" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
      <rect x="5" y="13" width="3" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <rect x="10.5" y="9" width="3" height="10" rx="0.5" fill="currentColor" opacity="0.55" />
      <rect x="10.5" y="9" width="3" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <rect x="16" y="5" width="3" height="14" rx="0.5" fill="currentColor" opacity="0.7" />
      <rect x="16" y="5" width="3" height="14" rx="0.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <line x1="3" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </g>
  ),
  scale: (
    <g>
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6" y1="6" x2="18" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 12 L6 6 L9 12 Z" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M15 12 L18 6 L21 12 Z" fill="currentColor" opacity="0.3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="9" y1="20" x2="15" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </g>
  ),
  oi: (
    <g>
      <path d="M3 18 L9 12 L13 15 L21 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M3 18 L9 12 L13 15 L21 6 L21 21 L3 21 Z" fill="currentColor" opacity="0.15" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" />
      <circle cx="13" cy="15" r="1.4" fill="currentColor" />
      <circle cx="21" cy="6" r="1.4" fill="currentColor" />
    </g>
  ),
};

const IconBadge = ({ children, size = "default" }) => {
  const dims = size === "sm" ? "w-7 h-7" : "w-9 h-9";
  const icon = size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";
  return (
    <div
      className={`${dims} rounded-lg flex items-center justify-center flex-shrink-0`}
      style={{
        background: 'radial-gradient(circle at 30% 25%, rgba(253,230,168,0.18), transparent 65%), rgba(212,168,83,0.08)',
        border: '1px solid rgba(212,168,83,0.2)',
        color: '#f5d088',
      }}
    >
      <svg className={icon} viewBox="0 0 24 24" fill="none">
        {children}
      </svg>
    </div>
  );
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

  // Derivatives state — separated by feature
  const [liq, setLiq] = useState(null);
  const [funding, setFunding] = useState(null);
  const [longShort, setLongShort] = useState(null);
  const [oi, setOi] = useState(null);

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

  // ═══════════════════════════════════════
  // FIXED: Use /market/derivatives-pulse instead of /market/overview
  // ═══════════════════════════════════════
  const fetchDeriv = useCallback(async () => {
    try {
      const [liqR, dpR] = await Promise.allSettled([
        api.get("/market/liquidations"),
        api.get("/market/derivatives-pulse"),
      ]);

      if (liqR.status === "fulfilled") {
        setLiq(liqR.value.data);
      } else {
        console.warn("Liquidations fetch failed:", liqR.reason);
      }

      if (dpR.status === "fulfilled") {
        const dp = dpR.value.data;
        // Map response to state
        if (dp?.funding) setFunding(dp.funding);
        if (dp?.longShort) setLongShort(dp.longShort);
        if (dp?.openInterest) setOi(dp.openInterest);
      } else {
        console.warn("Derivatives-pulse fetch failed:", dpR.reason);
      }
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

  // Filter longShort to current symbol
  const currentLS = longShort && longShort[sym.replace("USDT", "")] || null;

  // Filter funding to relevant top picks (most active + extreme)
  const fundingDisplay = funding ? buildFundingDisplay(funding) : null;

  // Filter OI breakdown to display
  const oiDisplay = oi ? buildOIDisplay(oi) : null;

  return (
    <div className="space-y-5">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconBadge>{Icons.orderbook}</IconBadge>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight" style={{ fontFamily: "Playfair Display, serif" }}>
              {t("orderbook.title")}
            </h1>
            <p className="text-[12px] mt-0.5 text-text-muted">{t("orderbook.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
            style={autoRefresh
              ? { background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }
              : { background: "rgba(255,255,255,0.03)", color: "#a0a0a0", border: "1px solid rgba(255,255,255,0.08)" }}>
            {autoRefresh ? "● Live 15s" : "⏸ Paused"}
          </button>
          <button onClick={() => fetchOB(false)}
            className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.03)", color: "#a0a0a0", border: "1px solid rgba(255,255,255,0.08)" }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ═══ SYMBOL TABS + PRICE ═══ */}
      <div className="flex items-center gap-2">
        {SYMBOLS.map((s) => (
          <button key={s.key} onClick={() => setSym(s.key)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all"
            style={sym === s.key
              ? { background: "rgba(212,168,83,0.12)", border: "1px solid rgba(212,168,83,0.35)", color: "#d4a853" }
              : { background: "rgba(255,255,255,0.02)", border: "1px solid transparent", color: "#a0a0a0" }}>
            <span className="text-base">{s.icon}</span> {s.label}
          </button>
        ))}
        {data?.mid_price && (
          <div className="ml-auto text-right">
            <p className="text-2xl font-mono font-bold text-white tracking-tight">{fmtP(data.mid_price)}</p>
            <p className="text-[11px] text-text-muted">Spread: {data.spread_pct?.toFixed(4)}%</p>
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
          <p className="text-red-400 text-[14px] mb-3">{error}</p>
          <button onClick={() => fetchOB(true)} className="px-4 py-2 rounded-lg text-[13px] font-bold"
            style={{ background: "rgba(212,168,83,0.12)", color: "#d4a853", border: "1px solid rgba(212,168,83,0.25)" }}>
            {t("orderbook.retry")}
          </button>
        </div>
      )}

      {data && (
        <>
          {/* ═══ IMBALANCE BAR ═══ */}
          <div className="rounded-xl p-4" style={{ background: sc.bg, border: `1px solid ${sc.border}` }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <p className="text-xl font-bold tracking-tight" style={{ color: sc.text }}>{getSentiment()}</p>
                <span className="text-[11px] uppercase tracking-wider font-bold text-text-muted">{t("orderbook.imbalance_title")}</span>
              </div>
              <div className="text-right">
                <p className="text-[14px] font-bold text-white font-mono">
                  {fmt(imb.bid_usd)} <span className="text-text-muted">/</span> {fmt(imb.ask_usd)}
                </p>
              </div>
            </div>
            <div className="relative h-6 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
              <div className="absolute left-0 top-0 bottom-0 rounded-l-full transition-all duration-700"
                style={{ width: `${imb.bid_pct || 50}%`, background: "linear-gradient(90deg, #166534, #22c55e)" }} />
              <div className="absolute right-0 top-0 bottom-0 rounded-r-full transition-all duration-700"
                style={{ width: `${imb.ask_pct || 50}%`, background: "linear-gradient(90deg, #ef4444, #991b1b)" }} />
              <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold gap-2.5">
                <span className="text-green-300">{(imb.bid_pct || 50).toFixed(1)}%</span>
                <span className="text-text-muted">|</span>
                <span className="text-red-300">{(imb.ask_pct || 50).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* ═══ MAIN GRID: Depth (left) + S/R + Walls (right) ═══ */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            {/* ── Left: Depth Chart ── */}
            <div className="lg:col-span-3 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <IconBadge size="sm">{Icons.depth}</IconBadge>
                  <h3 className="text-[14px] font-bold text-white tracking-tight">{t("orderbook.depth_chart")}</h3>
                </div>
                <span className="text-[11px] text-text-muted font-semibold">{data.total_levels} {t("orderbook.levels")}</span>
              </div>
              <CompactDepth depth={depth} t={t} />
            </div>

            {/* ── Right: S/R + Walls stacked ── */}
            <div className="lg:col-span-2 space-y-3">
              {/* S/R Levels */}
              <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-2 mb-3">
                  <IconBadge size="sm">{Icons.target}</IconBadge>
                  <h3 className="text-[14px] font-bold text-white tracking-tight">{t("orderbook.sup_res")}</h3>
                </div>
                <CompactSR sr={sr} t={t} />
              </div>

              {/* Buy + Sell Walls */}
              <div className="grid grid-cols-2 gap-2">
                <WallsCard walls={walls.buy} label={t("orderbook.buy_walls")} total={walls.buy_total_usd} type="buy" />
                <WallsCard walls={walls.sell} label={t("orderbook.sell_walls")} total={walls.sell_total_usd} type="sell" />
              </div>
            </div>
          </div>

          {/* ═══ DERIVATIVES INTELLIGENCE ═══ */}
          <div className="flex items-center gap-3 mt-3">
            <IconBadge size="sm">{Icons.liquidation}</IconBadge>
            <h2 className="text-[15px] font-bold text-white tracking-tight">Derivatives Intelligence</h2>
            <div className="flex-1 h-px" style={{ background: "rgba(212,168,83,0.15)" }} />
            <span className="text-[11px] uppercase tracking-wider text-gold-primary/70 font-bold">LIVE · 15s</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <LiqCard data={liq} />
            <FundingCard data={fundingDisplay} />
            <LSCard data={currentLS} symbol={sym.replace("USDT", "")} />
            <OICard data={oiDisplay} />
          </div>
        </>
      )}

      {/* ═══ FOOTER ═══ */}
      <div className="flex items-center justify-center gap-3 text-[11px] py-3 text-text-muted">
        <span>{t("orderbook.data_source")}</span>
        <span>·</span>
        <span>{autoRefresh ? "Live 15s" : t("orderbook.paused")}</span>
        {lastUpdate && <><span>·</span><span>{lastUpdate.toLocaleTimeString()}</span></>}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════
// Helper: Build funding display from API response
// ═══════════════════════════════════════
function buildFundingDisplay(funding) {
  if (!funding) return null;
  const longs = (funding.most_long || []).slice(0, 3);
  const shorts = (funding.most_short || []).slice(0, 3);
  return {
    longs,
    shorts,
    avg: funding.avg_rate || 0,
    total: funding.total_symbols || 0,
  };
}

// ═══════════════════════════════════════
// Helper: Build OI display from API response
// ═══════════════════════════════════════
function buildOIDisplay(oi) {
  if (!oi) return null;
  return {
    total_usd: oi.total_usd || 0,
    breakdown: oi.breakdown || [],
  };
}


// ═══════════════════════════════════════
// Compact Depth Chart
// ═══════════════════════════════════════
const CompactDepth = ({ depth, t }) => {
  const bids = depth?.bids || [];
  const asks = depth?.asks || [];
  if (!bids.length && !asks.length) return <p className="text-center text-[13px] py-6 text-text-muted">{t("orderbook.no_depth")}</p>;

  const maxBid = bids.length ? bids[bids.length - 1].cumulative_usd : 0;
  const maxAsk = asks.length ? asks[asks.length - 1].cumulative_usd : 0;
  const maxVal = Math.max(maxBid, maxAsk) || 1;
  const rate = Math.max(1, Math.floor(bids.length / 18));
  const sBids = bids.filter((_, i) => i % rate === 0).slice(-18);
  const sAsks = asks.filter((_, i) => i % rate === 0).slice(0, 18);

  return (
    <div className="max-h-[440px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(212,168,83,0.15) transparent" }}>
      {/* Asks */}
      {[...sAsks].reverse().map((a, i) => {
        const pct = (a.cumulative_usd / maxVal) * 100;
        return (
          <div key={`a-${i}`} className="flex items-center gap-2 h-[20px] group">
            <span className="text-[11px] w-[80px] text-right font-mono truncate text-text-muted">{fmtP(a.price)}</span>
            <div className="flex-1 h-2.5 rounded-sm relative" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="absolute right-0 top-0 bottom-0 rounded-sm" style={{ width: `${pct}%`, background: "rgba(239,68,68,0.4)" }} />
            </div>
            <span className="text-[10px] w-14 text-right font-mono opacity-0 group-hover:opacity-100 transition-opacity text-red-400 font-semibold">{fmt(a.cumulative_usd)}</span>
          </div>
        );
      })}

      {/* Mid */}
      <div className="flex items-center gap-2 h-7 my-1">
        <div className="flex-1 h-px" style={{ background: "rgba(212,168,83,0.25)" }} />
        <span className="text-[11px] font-bold px-2 text-gold-primary tracking-wider">MID</span>
        <div className="flex-1 h-px" style={{ background: "rgba(212,168,83,0.25)" }} />
      </div>

      {/* Bids */}
      {sBids.map((b, i) => {
        const pct = (b.cumulative_usd / maxVal) * 100;
        return (
          <div key={`b-${i}`} className="flex items-center gap-2 h-[20px] group">
            <span className="text-[11px] w-[80px] text-right font-mono truncate text-text-muted">{fmtP(b.price)}</span>
            <div className="flex-1 h-2.5 rounded-sm relative" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="absolute left-0 top-0 bottom-0 rounded-sm" style={{ width: `${pct}%`, background: "rgba(34,197,94,0.4)" }} />
            </div>
            <span className="text-[10px] w-14 text-right font-mono opacity-0 group-hover:opacity-100 transition-opacity text-emerald-400 font-semibold">{fmt(b.cumulative_usd)}</span>
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
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <p className="text-[11px] uppercase tracking-wider text-red-400 font-bold">{t("orderbook.res_levels")}</p>
        </div>
        {resistance.length ? resistance.map((r, i) => (
          <div key={i} className="flex justify-between py-1 text-[12px]">
            <span className="font-mono font-bold text-white">{fmtP(r.price)}</span>
            <span className="text-red-400 font-bold">{fmt(r.usd)}</span>
          </div>
        )) : <p className="text-[11px] text-text-muted">{t("orderbook.no_res_walls")}</p>}
      </div>
      <div className="h-px" style={{ background: "rgba(255,255,255,0.05)" }} />
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <p className="text-[11px] uppercase tracking-wider text-emerald-400 font-bold">{t("orderbook.sup_levels")}</p>
        </div>
        {support.length ? support.map((s, i) => (
          <div key={i} className="flex justify-between py-1 text-[12px]">
            <span className="font-mono font-bold text-white">{fmtP(s.price)}</span>
            <span className="text-emerald-400 font-bold">{fmt(s.usd)}</span>
          </div>
        )) : <p className="text-[11px] text-text-muted">{t("orderbook.no_sup_walls")}</p>}
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
  const bg = isB ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)";
  const border = isB ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)";
  const maxUsd = Math.max(...(walls || []).map(w => w.usd), 1);

  return (
    <div className="rounded-xl p-3.5" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isB ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <h4 className="text-[12px] font-bold" style={{ color }}>{label}</h4>
        </div>
        <span className="text-[11px] font-bold" style={{ color: `${color}cc` }}>{fmt(total)}</span>
      </div>
      {walls?.length ? (
        <div className="space-y-2">
          {walls.slice(0, 4).map((w, i) => (
            <div key={i}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-mono font-semibold text-white">{fmtP(w.price)}</span>
                <span className="font-mono font-bold" style={{ color }}>{fmt(w.usd)}</span>
              </div>
              <div className="h-1 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((w.usd / maxUsd) * 100, 100)}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
      ) : <p className="text-[11px] text-center py-4 text-text-muted">No walls</p>}
    </div>
  );
};


// ═══════════════════════════════════════
// Liquidation Card
// ═══════════════════════════════════════
const LiqCard = ({ data }) => {
  if (!data) return <MiniSkeleton label="Liquidations" iconKey="liquidation" />;
  const { summary, recent } = data;
  const total = summary?.total_usd || 0;
  const longL = summary?.long_liquidated || 0;
  const shortL = summary?.short_liquidated || 0;
  const lPct = total > 0 ? (longL / total) * 100 : 50;

  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IconBadge size="sm">{Icons.liquidation}</IconBadge>
          <h4 className="text-[12px] font-bold text-white tracking-tight">Liquidations</h4>
        </div>
        <span className="text-[14px] font-mono font-bold text-white">{fmt(total)}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="h-full float-left" style={{ width: `${lPct}%`, background: "#22c55e" }} />
        <div className="h-full float-right" style={{ width: `${100 - lPct}%`, background: "#ef4444" }} />
      </div>
      <div className="flex justify-between text-[11px] mb-3 font-semibold">
        <span className="text-emerald-400">Longs {fmt(longL)}</span>
        <span className="text-red-400">Shorts {fmt(shortL)}</span>
      </div>
      <div className="space-y-1">
        {(recent || []).slice(0, 4).map((l, i) => {
          const isL = l.side === "SELL";
          return (
            <div key={i} className="flex items-center gap-1.5 text-[11px]">
              <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${isL ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                {isL ? "L" : "S"}
              </span>
              <span className="text-white font-semibold">{l.symbol}</span>
              <span className="font-mono ml-auto text-gold-primary font-semibold">{fmt(l.usd)}</span>
              <span className="text-[10px] text-text-muted">{timeAgo(l.time)}</span>
            </div>
          );
        })}
        {(!recent || recent.length === 0) && (
          <p className="text-[11px] text-center text-text-muted py-2">No recent</p>
        )}
      </div>
    </div>
  );
};


// ═══════════════════════════════════════
// Funding Card — adapted for derivatives-pulse format
// ═══════════════════════════════════════
const FundingCard = ({ data }) => {
  if (!data) return <MiniSkeleton label="Funding Rates" iconKey="funding" />;
  const { longs, shorts, avg, total } = data;

  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IconBadge size="sm">{Icons.funding}</IconBadge>
          <h4 className="text-[12px] font-bold text-white tracking-tight">Funding Rates</h4>
        </div>
        <span className="text-[11px] font-mono font-bold text-text-muted">avg {(avg * 100).toFixed(4)}%</span>
      </div>

      {/* Most Long */}
      <p className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-bold mb-1.5">Most Long</p>
      <div className="space-y-1 mb-2.5">
        {longs.map((f, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-white truncate max-w-[80px]">{f.symbol}</span>
            <span className="text-[12px] font-mono font-bold text-emerald-400">+{f.rate_pct?.toFixed(3)}%</span>
          </div>
        ))}
      </div>

      {/* Most Short */}
      <p className="text-[10px] uppercase tracking-wider text-red-400/80 font-bold mb-1.5">Most Short</p>
      <div className="space-y-1 mb-2">
        {shorts.map((f, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-[12px] font-bold text-white truncate max-w-[80px]">{f.symbol}</span>
            <span className="text-[12px] font-mono font-bold text-red-400">{f.rate_pct?.toFixed(3)}%</span>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-white/5">
        <p className="text-[10px] text-text-muted text-center">{total} pairs tracked</p>
      </div>
    </div>
  );
};


// ═══════════════════════════════════════
// Long/Short Card — adapted for new format
// ═══════════════════════════════════════
const LSCard = ({ data, symbol }) => {
  if (!data) return <MiniSkeleton label="Long/Short" iconKey="scale" />;
  const lPct = data.long || 0;
  const sPct = data.short || 0;
  const ratio = data.ratio || 0;
  const dom = lPct > sPct;

  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IconBadge size="sm">{Icons.scale}</IconBadge>
          <h4 className="text-[12px] font-bold text-white tracking-tight">L/S Ratio · {symbol}</h4>
        </div>
        <span className="text-[14px] font-mono font-bold" style={{ color: dom ? "#22c55e" : "#ef4444" }}>{ratio.toFixed(2)}</span>
      </div>

      <div className="h-5 rounded-full overflow-hidden flex mb-2" style={{ background: "rgba(255,255,255,0.04)" }}>
        <div className="h-full flex items-center justify-center transition-all duration-700" style={{ width: `${lPct}%`, background: "linear-gradient(90deg, #166534, #22c55e)" }}>
          {lPct > 25 && <span className="text-[10px] font-bold text-white">{lPct.toFixed(1)}%</span>}
        </div>
        <div className="h-full flex items-center justify-center transition-all duration-700" style={{ width: `${sPct}%`, background: "linear-gradient(90deg, #ef4444, #991b1b)" }}>
          {sPct > 25 && <span className="text-[10px] font-bold text-white">{sPct.toFixed(1)}%</span>}
        </div>
      </div>

      <div className="flex justify-between text-[11px] mb-3 font-semibold">
        <span className="text-emerald-400">Long</span>
        <span className="text-red-400">Short</span>
      </div>

      <p className="text-[11px] leading-relaxed text-text-muted">
        {dom
          ? "Longs dominant — watch for squeeze if price drops."
          : "Shorts dominant — potential squeeze on price rise."}
      </p>
    </div>
  );
};


// ═══════════════════════════════════════
// Open Interest Card — adapted for breakdown format
// ═══════════════════════════════════════
const OICard = ({ data }) => {
  if (!data) return <MiniSkeleton label="Open Interest" iconKey="oi" />;
  const { total_usd, breakdown } = data;
  const top3 = (breakdown || []).slice(0, 3);
  const maxOi = Math.max(...top3.map(b => b.oi_usd), 1);

  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IconBadge size="sm">{Icons.oi}</IconBadge>
          <h4 className="text-[12px] font-bold text-white tracking-tight">Open Interest</h4>
        </div>
      </div>

      <p className="text-xl font-mono font-bold text-white tracking-tight mb-3">{fmt(total_usd)}</p>

      {/* Breakdown */}
      <div className="space-y-2">
        {top3.map((b, i) => {
          const pct = (b.oi_usd / maxOi) * 100;
          return (
            <div key={i}>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="font-bold text-white">{b.symbol}</span>
                <span className="font-mono text-text-muted font-semibold">{fmt(b.oi_usd)}</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: "linear-gradient(90deg, #8b6914, #d4a853, #fde6a8)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] mt-3 text-text-muted leading-relaxed">
        Total notional across {breakdown?.length || 0} markets.
      </p>
    </div>
  );
};


// ═══════════════════════════════════════
// Mini Skeleton (with proper icon)
// ═══════════════════════════════════════
const MiniSkeleton = ({ label, iconKey }) => (
  <div className="rounded-xl p-4 animate-pulse" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)" }}>
    <div className="flex items-center gap-2 mb-3">
      {iconKey && <IconBadge size="sm">{Icons[iconKey]}</IconBadge>}
      <h4 className="text-[12px] font-bold text-white tracking-tight">{label}</h4>
    </div>
    <div className="space-y-2">
      <div className="h-6 rounded" style={{ background: "rgba(255,255,255,0.03)" }} />
      <div className="h-3 w-3/4 rounded" style={{ background: "rgba(255,255,255,0.025)" }} />
      <div className="h-3 w-1/2 rounded" style={{ background: "rgba(255,255,255,0.02)" }} />
    </div>
  </div>
);