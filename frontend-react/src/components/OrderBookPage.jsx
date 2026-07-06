// src/components/OrderBookPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant Terminal — OrderBook Page v2 (Flowscan reskin)
// 100% aligned with backend /api/v1/orderbook/analysis + /market/{liquidations,derivatives-pulse}
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import orderbookApi from "../services/orderbookApi";
import api from "../services/api";
import AssistantWidget from "./assistant/AssistantWidget";

// ═══════════════════════════════════════════
// Config
// ═══════════════════════════════════════════
const SYMBOLS = [
  { key: "BTCUSDT", label: "BTC/USDT", short: "BTC" },
  { key: "ETHUSDT", label: "ETH/USDT", short: "ETH" },
];

const REFRESH_INTERVAL = 15000;

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════
const fmt = (v) => {
  if (!v && v !== 0) return "—";
  const n = Number(v);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

const fmtP = (v) => {
  if (!v && v !== 0) return "—";
  const n = Number(v);
  return n >= 1000
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toFixed(4);
};

const timeAgo = (ts) => {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

// ── Sentiment style ──
const sentimentColor = (s) => {
  if (s === "strong_buy" || s === "buy") return "text-emerald-400";
  if (s === "strong_sell" || s === "sell") return "text-red-400";
  return "text-gold-primary";
};

const sentimentDot = (s) => {
  if (s === "strong_buy" || s === "buy") return "bg-emerald-400";
  if (s === "strong_sell" || s === "sell") return "bg-red-400";
  return "bg-gold-primary";
};


// ════════════════════════════════════════════════════════════════
// SECTION HEADER — — · LABEL · —
// ════════════════════════════════════════════════════════════════
const SectionHeader = ({ label, small = false, suffix }) => (
  <div className="flex items-center gap-3">
    <span className="h-px w-8 bg-gold-primary/40" />
    <span
      className={`font-mono uppercase tracking-[0.25em] text-gold-primary/80 ${
        small ? "text-[10px]" : "text-[11px]"
      }`}
    >
      {label}
    </span>
    <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/20 to-transparent" />
    {suffix && (
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary/70 shrink-0">
        {suffix}
      </span>
    )}
  </div>
);


// ════════════════════════════════════════════════════════════════
// IMBALANCE STRIP — compact flat indicator (replaces giant gradient bar)
// ════════════════════════════════════════════════════════════════
const ImbalanceStrip = ({ imb }) => {
  if (!imb) return null;

  const sentimentLabel = imb.sentiment_label || (
    imb.sentiment === "strong_buy" ? "Strong Buy" :
    imb.sentiment === "buy" ? "Buy" :
    imb.sentiment === "strong_sell" ? "Strong Sell" :
    imb.sentiment === "sell" ? "Sell" :
    "Balanced"
  );

  return (
    <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

      <div className="relative px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        {/* Sentiment indicator */}
        <div className="flex items-center gap-2.5">
          <span className={`w-1.5 h-1.5 rounded-full ${sentimentDot(imb.sentiment)} animate-pulse`} />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
            Imbalance
          </span>
          <span className={`font-mono text-[11px] uppercase tracking-[0.2em] font-semibold ${sentimentColor(imb.sentiment)}`}>
            {sentimentLabel}
          </span>
        </div>

        <span className="hidden sm:inline h-3 w-px bg-white/[0.08]" />

        {/* Bid */}
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-text-muted/70 uppercase tracking-[0.15em] text-[10px]">Bid</span>
          <span className="text-emerald-400 tabular-nums font-semibold">{fmt(imb.bid_usd)}</span>
          <span className="text-emerald-400/60 tabular-nums">{(imb.bid_pct || 0).toFixed(1)}%</span>
        </div>

        {/* Visual flow indicator */}
        <span className="text-text-muted/40 font-mono">↔</span>

        {/* Ask */}
        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="text-text-muted/70 uppercase tracking-[0.15em] text-[10px]">Ask</span>
          <span className="text-red-400 tabular-nums font-semibold">{fmt(imb.ask_usd)}</span>
          <span className="text-red-400/60 tabular-nums">{(imb.ask_pct || 0).toFixed(1)}%</span>
        </div>

        {/* Subtle bar visualization on right (compact) */}
        <div className="ml-auto hidden md:flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/50">
            Ratio
          </span>
          <div className="w-24 h-1 rounded-sm overflow-hidden flex bg-white/[0.04]">
            <div
              className="h-full bg-emerald-400/60 transition-all duration-700"
              style={{ width: `${imb.bid_pct || 50}%` }}
            />
            <div
              className="h-full bg-red-400/60 transition-all duration-700"
              style={{ width: `${imb.ask_pct || 50}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// DEPTH CHART — subdued red/green bars
// ════════════════════════════════════════════════════════════════
const DepthChart = ({ depth, t }) => {
  const bids = depth?.bids || [];
  const asks = depth?.asks || [];

  if (!bids.length && !asks.length) {
    return (
      <div className="p-8 text-center">
        <p className="text-text-muted text-[11px] font-mono uppercase tracking-[0.15em]">
          {t("orderbook.no_depth") || "No depth data"}
        </p>
      </div>
    );
  }

  const maxBid = bids.length ? bids[bids.length - 1].cumulative_usd : 0;
  const maxAsk = asks.length ? asks[asks.length - 1].cumulative_usd : 0;
  const maxVal = Math.max(maxBid, maxAsk) || 1;
  const rate = Math.max(1, Math.floor(bids.length / 20));
  const sBids = bids.filter((_, i) => i % rate === 0).slice(-20);
  const sAsks = asks.filter((_, i) => i % rate === 0).slice(0, 20);

  return (
    <div className="max-h-[480px] overflow-y-auto px-2 py-1" style={{ scrollbarWidth: "thin" }}>
      {/* Asks (resistance) — top */}
      {[...sAsks].reverse().map((a, i) => {
        const pct = (a.cumulative_usd / maxVal) * 100;
        return (
          <div key={`a-${i}`} className="flex items-center gap-2 h-5 group">
            <span className="font-mono text-[10px] w-[88px] text-right tabular-nums text-text-muted/80 truncate">
              {fmtP(a.price)}
            </span>
            <div className="flex-1 h-[3px] rounded-sm relative bg-white/[0.02]">
              <div
                className="absolute right-0 top-0 bottom-0 rounded-sm bg-red-400/25 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-[10px] w-16 text-right tabular-nums text-red-400/70 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              {fmt(a.cumulative_usd)}
            </span>
          </div>
        );
      })}

      {/* MID divider */}
      <div className="flex items-center gap-2 h-7 my-1">
        <div className="flex-1 h-px bg-gold-primary/25" />
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] px-2 text-gold-primary font-semibold">
          Mid
        </span>
        <div className="flex-1 h-px bg-gold-primary/25" />
      </div>

      {/* Bids (support) — bottom */}
      {sBids.map((b, i) => {
        const pct = (b.cumulative_usd / maxVal) * 100;
        return (
          <div key={`b-${i}`} className="flex items-center gap-2 h-5 group">
            <span className="font-mono text-[10px] w-[88px] text-right tabular-nums text-text-muted/80 truncate">
              {fmtP(b.price)}
            </span>
            <div className="flex-1 h-[3px] rounded-sm relative bg-white/[0.02]">
              <div
                className="absolute left-0 top-0 bottom-0 rounded-sm bg-emerald-400/25 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="font-mono text-[10px] w-16 text-right tabular-nums text-emerald-400/70 font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              {fmt(b.cumulative_usd)}
            </span>
          </div>
        );
      })}
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// SUPPORT / RESISTANCE LEVELS
// ════════════════════════════════════════════════════════════════
const SRLevels = ({ sr, t }) => {
  const support = sr?.support || [];
  const resistance = sr?.resistance || [];

  return (
    <div className="space-y-3">
      {/* Resistance */}
      <div>
        <p className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-red-400/80 font-semibold mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
          Resistance
        </p>
        {resistance.length ? (
          <div className="space-y-1.5">
            {resistance.map((r, i) => (
              <div key={i} className="flex justify-between items-center font-mono">
                <span className="text-xs text-white tabular-nums">{fmtP(r.price)}</span>
                <span className="text-[11px] text-red-400 tabular-nums">{fmt(r.usd)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] font-mono text-text-muted/50 uppercase tracking-[0.15em]">
            {t("orderbook.no_res_walls") || "No resistance"}
          </p>
        )}
      </div>

      <div className="h-px bg-white/[0.04]" />

      {/* Support */}
      <div>
        <p className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400/80 font-semibold mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Support
        </p>
        {support.length ? (
          <div className="space-y-1.5">
            {support.map((s, i) => (
              <div key={i} className="flex justify-between items-center font-mono">
                <span className="text-xs text-white tabular-nums">{fmtP(s.price)}</span>
                <span className="text-[11px] text-emerald-400 tabular-nums">{fmt(s.usd)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] font-mono text-text-muted/50 uppercase tracking-[0.15em]">
            {t("orderbook.no_sup_walls") || "No support"}
          </p>
        )}
      </div>
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// WALLS CARD — Buy / Sell stacked
// ════════════════════════════════════════════════════════════════
const WallsCard = ({ walls, total, type }) => {
  const isB = type === "buy";
  const color = isB ? "emerald" : "red";
  const maxUsd = Math.max(...(walls || []).map((w) => w.usd), 1);

  const label = isB ? "Buy Walls" : "Sell Walls";
  const sublabel = isB ? "Support" : "Resistance";

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full bg-${color}-400`} />
          <span className={`text-[10px] font-mono uppercase tracking-[0.2em] text-${color}-400/80 font-semibold`}>
            {label}
          </span>
          <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted/50">
            · {sublabel}
          </span>
        </div>
        <span className={`text-[11px] font-mono tabular-nums text-${color}-400 font-semibold`}>
          {fmt(total)}
        </span>
      </div>

      {walls?.length ? (
        <div className="space-y-1.5">
          {walls.slice(0, 4).map((w, i) => {
            const pct = Math.min((w.usd / maxUsd) * 100, 100);
            return (
              <div key={i} className="relative">
                <div className="flex justify-between items-center gap-2 mb-0.5">
                  <span className="font-mono text-[11px] text-white tabular-nums">
                    {fmtP(w.price)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {/* Strength badge (NEW — using backend field) */}
                    {w.strength && (
                      <span className="text-[8px] font-mono tabular-nums px-1 py-0.5 rounded border bg-gold-primary/[0.08] text-gold-primary/80 border-gold-primary/20">
                        {w.strength.toFixed(1)}
                      </span>
                    )}
                    <span className={`font-mono text-[11px] tabular-nums text-${color}-400 font-semibold`}>
                      {fmt(w.usd)}
                    </span>
                  </div>
                </div>
                <div className="h-[2px] rounded-sm bg-white/[0.03]">
                  <div
                    className={`h-full rounded-sm bg-${color}-400/60 transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[10px] font-mono text-text-muted/50 uppercase tracking-[0.15em] text-center py-2">
          No walls
        </p>
      )}
    </div>
  );
};


// ════════════════════════════════════════════════════════════════
// DERIVATIVES CARD (base wrapper)
// ════════════════════════════════════════════════════════════════
const DerivCard = ({ label, value, children, headerRight }) => (
  <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-4">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-mono">
          {label}
        </span>
        {headerRight}
      </div>
      {value !== undefined && (
        <div className="text-xl sm:text-2xl font-mono tabular-nums text-white mb-3 truncate">
          {value}
        </div>
      )}
      {children}
    </div>
  </div>
);


// ════════════════════════════════════════════════════════════════
// LIQUIDATIONS CARD — compute summary frontend
// ════════════════════════════════════════════════════════════════
const LiqCard = ({ data }) => {
  const recent = data?.recent || [];

  // Compute summary frontend (backend doesn't provide summary)
  // Must be called before any conditional return (Rules of Hooks)
  const summary = useMemo(() => {
    let total = 0;
    let longL = 0;
    let shortL = 0;
    recent.forEach((l) => {
      const usd = Number(l.usd || 0);
      total += usd;
      if (l.posSide === "long") longL += usd;
      else if (l.posSide === "short") shortL += usd;
    });
    return { total, longL, shortL };
  }, [recent]);

  if (!data || !data.recent) return <SkeletonCard label="Liquidations" />;

  const total = summary.total;
  const lPct = total > 0 ? (summary.longL / total) * 100 : 50;

  // Show top 4 by USD value
  const top = [...recent]
    .filter((l) => l.usd > 0.5) // filter dust
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 4);

  return (
    <DerivCard
      label="Liquidations"
      value={fmt(total)}
    >
      {/* Bar */}
      <div className="h-[3px] rounded-sm overflow-hidden flex mb-2 bg-white/[0.03]">
        <div className="h-full bg-emerald-400/70" style={{ width: `${lPct}%` }} />
        <div className="h-full bg-red-400/70" style={{ width: `${100 - lPct}%` }} />
      </div>

      <div className="flex justify-between font-mono text-[10px] mb-3">
        <span className="text-emerald-400">
          <span className="uppercase tracking-wider text-[9px]">Longs</span>
          <span className="ml-1 tabular-nums">{fmt(summary.longL)}</span>
        </span>
        <span className="text-red-400">
          <span className="uppercase tracking-wider text-[9px]">Shorts</span>
          <span className="ml-1 tabular-nums">{fmt(summary.shortL)}</span>
        </span>
      </div>

      {/* Recent rows */}
      <div className="space-y-1">
        {top.length > 0 ? top.map((l, i) => {
          const isLong = l.posSide === "long";
          return (
            <div key={i} className="flex items-center gap-1.5 font-mono text-[10px]">
              <span className={`text-[9px] uppercase tracking-[0.1em] px-1 py-0.5 rounded border ${
                isLong
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                  : "bg-red-500/10 text-red-400 border-red-500/25"
              }`}>
                {isLong ? "Long" : "Short"}
              </span>
              <span className="text-white font-semibold">{l.symbol}</span>
              <span className="ml-auto text-gold-primary tabular-nums">{fmt(l.usd)}</span>
              <span className="text-text-muted/60 tabular-nums">{timeAgo(l.time)}</span>
            </div>
          );
        }) : (
          <p className="text-[10px] font-mono text-text-muted/50 uppercase tracking-[0.15em] text-center py-2">
            No recent
          </p>
        )}
      </div>
    </DerivCard>
  );
};


// ════════════════════════════════════════════════════════════════
// FUNDING RATES CARD
// ════════════════════════════════════════════════════════════════
const FundingCard = ({ data }) => {
  if (!data) return <SkeletonCard label="Funding Rates" />;

  const longs = (data.most_long || []).slice(0, 3);
  const shorts = (data.most_short || []).slice(0, 3);
  const avg = (data.avg_rate || 0) * 100;
  const total = data.total_symbols || 0;

  return (
    <DerivCard
      label="Funding Rates"
      headerRight={
        <span className="text-[10px] font-mono tabular-nums text-text-muted/70">
          avg {avg.toFixed(4)}%
        </span>
      }
    >
      {/* Most Long */}
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-emerald-400/80 font-semibold mb-1.5">
        Most Long
      </p>
      <div className="space-y-1 mb-3">
        {longs.map((f, i) => (
          <div key={i} className="flex items-center justify-between font-mono">
            <span className="text-[11px] text-white font-semibold truncate max-w-[90px]">
              {f.symbol}
            </span>
            <span className="text-[11px] text-emerald-400 tabular-nums">
              +{f.rate_pct?.toFixed(3)}%
            </span>
          </div>
        ))}
      </div>

      {/* Most Short */}
      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-red-400/80 font-semibold mb-1.5">
        Most Short
      </p>
      <div className="space-y-1 mb-3">
        {shorts.map((f, i) => (
          <div key={i} className="flex items-center justify-between font-mono">
            <span className="text-[11px] text-white font-semibold truncate max-w-[90px]">
              {f.symbol}
            </span>
            <span className="text-[11px] text-red-400 tabular-nums">
              {f.rate_pct?.toFixed(3)}%
            </span>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-white/[0.04]">
        <p className="text-[10px] font-mono text-text-muted/60 text-center tabular-nums">
          {total.toLocaleString()} pairs tracked
        </p>
      </div>
    </DerivCard>
  );
};


// ════════════════════════════════════════════════════════════════
// LONG/SHORT RATIO CARD
// ════════════════════════════════════════════════════════════════
const LSCard = ({ data, symbol }) => {
  if (!data) return <SkeletonCard label={`L/S Ratio · ${symbol}`} />;

  const lPct = data.long || 0;
  const sPct = data.short || 0;
  const ratio = data.ratio || 0;
  const dom = lPct > sPct;

  return (
    <DerivCard
      label={`L/S Ratio · ${symbol}`}
      value={ratio.toFixed(2)}
    >
      {/* Compact bar */}
      <div className="h-[3px] rounded-sm overflow-hidden flex mb-2 bg-white/[0.03]">
        <div
          className="h-full bg-emerald-400/70 transition-all duration-700"
          style={{ width: `${lPct}%` }}
        />
        <div
          className="h-full bg-red-400/70 transition-all duration-700"
          style={{ width: `${sPct}%` }}
        />
      </div>

      <div className="flex justify-between font-mono text-[10px] mb-3">
        <span className="text-emerald-400">
          <span className="uppercase tracking-wider text-[9px]">Long</span>
          <span className="ml-1 tabular-nums font-semibold">{lPct.toFixed(1)}%</span>
        </span>
        <span className="text-red-400">
          <span className="uppercase tracking-wider text-[9px]">Short</span>
          <span className="ml-1 tabular-nums font-semibold">{sPct.toFixed(1)}%</span>
        </span>
      </div>

      <p className="text-[10px] font-mono text-text-muted/70 leading-relaxed">
        {dom
          ? "Longs dominant — squeeze risk on drop"
          : "Shorts dominant — squeeze risk on rise"}
      </p>
    </DerivCard>
  );
};


// ════════════════════════════════════════════════════════════════
// OPEN INTEREST CARD
// ════════════════════════════════════════════════════════════════
const OICard = ({ data }) => {
  if (!data) return <SkeletonCard label="Open Interest" />;

  const total = data.total_usd || 0;
  const breakdown = data.breakdown || [];
  const top3 = breakdown.slice(0, 3);
  const maxOi = Math.max(...top3.map((b) => b.oi_usd), 1);

  return (
    <DerivCard label="Open Interest" value={fmt(total)}>
      <div className="space-y-2">
        {top3.map((b, i) => {
          const pct = (b.oi_usd / maxOi) * 100;
          return (
            <div key={i}>
              <div className="flex justify-between items-center font-mono text-[10px] mb-1">
                <span className="text-white font-semibold">{b.symbol}</span>
                <span className="text-text-muted tabular-nums">{fmt(b.oi_usd)}</span>
              </div>
              <div className="h-[2px] rounded-sm bg-white/[0.03]">
                <div
                  className="h-full rounded-sm bg-gold-primary/70 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] font-mono text-text-muted/60 mt-3 tabular-nums">
        Across {breakdown.length} markets
      </p>
    </DerivCard>
  );
};


// ════════════════════════════════════════════════════════════════
// SKELETON
// ════════════════════════════════════════════════════════════════
const SkeletonCard = ({ label }) => (
  <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-4">
    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/20 to-transparent" />
    <div className="text-[10px] uppercase tracking-[0.2em] text-text-muted font-mono mb-3">
      {label}
    </div>
    <div className="space-y-2">
      <div className="h-6 bg-white/[0.05] rounded animate-pulse" />
      <div className="h-2 bg-white/[0.03] rounded animate-pulse" />
      <div className="h-2 bg-white/[0.03] rounded w-3/4 animate-pulse" />
      <div className="h-2 bg-white/[0.03] rounded w-1/2 animate-pulse" />
    </div>
  </div>
);


// ════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════
export default function OrderBookPage() {
  const { t } = useTranslation();
  const [sym, setSym] = useState("BTCUSDT");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);

  const [liq, setLiq] = useState(null);
  const [funding, setFunding] = useState(null);
  const [longShort, setLongShort] = useState(null);
  const [oi, setOi] = useState(null);

  const fetchOB = useCallback(
    async (showLoad = false) => {
      if (showLoad) setLoading(true);
      try {
        const result = await orderbookApi.getAnalysis(sym);
        setData(result);
        setLastUpdate(new Date());
        setError(null);
      } catch (err) {
        console.error("OB fetch error:", err);
        setError(t("orderbook.loading_ob") || "Failed to load orderbook");
      } finally {
        setLoading(false);
      }
    },
    [sym, t]
  );

  const fetchDeriv = useCallback(async () => {
    try {
      const [liqR, dpR] = await Promise.allSettled([
        api.get("/market/liquidations"),
        api.get("/market/derivatives-pulse"),
      ]);

      if (liqR.status === "fulfilled") setLiq(liqR.value.data);
      if (dpR.status === "fulfilled") {
        const dp = dpR.value.data;
        if (dp?.funding) setFunding(dp.funding);
        if (dp?.longShort) setLongShort(dp.longShort);
        if (dp?.openInterest) setOi(dp.openInterest);
      }
    } catch (e) {
      console.error("Deriv fetch error:", e);
    }
  }, []);

  useEffect(() => {
    fetchOB(true);
  }, [fetchOB]);

  useEffect(() => {
    fetchDeriv();
  }, [fetchDeriv]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        fetchOB(false);
        fetchDeriv();
      }, REFRESH_INTERVAL);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, fetchOB, fetchDeriv]);

  const imb = data?.imbalance || {};
  const walls = data?.walls || { buy: [], sell: [] };
  const sr = data?.support_resistance || {};
  const depth = data?.depth || {};

  // Filter L/S to current symbol
  const symShort = sym.replace("USDT", "");
  const currentLS = longShort?.[symShort] || null;

  // ════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-6">
      {/* Section Header */}
      <SectionHeader label="Order Book" />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
            {t("orderbook.title") || "Order Book"}
          </h1>
          <p className="text-text-muted text-sm mt-1.5 font-mono">
            {t("orderbook.subtitle") || "Real-time buy/sell wall detection & imbalance analysis"}
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md border transition-all ${
              autoRefresh
                ? "bg-emerald-500/[0.08] border-emerald-500/25 text-emerald-400"
                : "bg-white/[0.03] border-white/[0.06] text-text-muted hover:text-white hover:border-white/[0.12]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-text-muted"
              }`}
            />
            <span className="uppercase tracking-[0.15em]">
              {autoRefresh ? "Live 15s" : t("orderbook.paused") || "Paused"}
            </span>
          </button>

          <button
            onClick={() => fetchOB(false)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-white/[0.06] bg-white/[0.03] text-text-muted hover:text-white hover:border-white/[0.12] transition-all"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m0 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            <span className="uppercase tracking-[0.15em] text-[10px]">
              {t("orderbook.refresh") || "Refresh"}
            </span>
          </button>
        </div>
      </div>

      {/* Symbol pill chips + Price */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          {SYMBOLS.map((s) => {
            const active = sym === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSym(s.key)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-[0.1em] transition-all border whitespace-nowrap ${
                  active
                    ? "bg-gold-primary/15 text-gold-primary border-gold-primary/40"
                    : "bg-white/[0.02] text-text-muted border-white/[0.06] hover:text-white hover:border-white/[0.12]"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {data?.mid_price && (
          <div className="ml-auto text-right">
            <p className="font-mono text-2xl tabular-nums text-white tracking-tight">
              ${fmtP(data.mid_price)}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-text-muted/70 tabular-nums">
              Spread {data.spread_pct?.toFixed(4)}%
            </p>
          </div>
        )}
      </div>

      {/* Loading / Error */}
      {loading && !data && (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
        </div>
      )}

      {error && !data && (
        <div className="relative overflow-hidden bg-red-500/[0.05] border border-red-500/25 rounded-md p-5 text-center">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
          <p className="text-red-400 text-sm mb-3 font-mono">{error}</p>
          <button
            onClick={() => fetchOB(true)}
            className="px-4 py-2 rounded-md text-[11px] font-mono uppercase tracking-[0.2em] border border-gold-primary/25 text-gold-primary hover:bg-gold-primary/[0.08] transition-all"
          >
            {t("orderbook.retry") || "Retry"} →
          </button>
        </div>
      )}

      {data && (
        <>
          {/* Imbalance Strip */}
          <ImbalanceStrip imb={imb} />

          {/* Main Grid: Depth + Sidebar (S/R + Walls) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Depth Chart */}
            <div className="lg:col-span-7 space-y-3">
              <SectionHeader
                label="Depth Chart"
                small
                suffix={data.total_levels ? `${data.total_levels} levels` : null}
              />
              <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md">
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
                <DepthChart depth={depth} t={t} />
              </div>
            </div>

            {/* Sidebar: S/R + Walls */}
            <div className="lg:col-span-5 space-y-3">
              {/* S/R Levels */}
              <div>
                <SectionHeader label="Support / Resistance" small />
                <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-4 mt-3">
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
                  <SRLevels sr={sr} t={t} />
                </div>
              </div>

              {/* Walls */}
              <div>
                <SectionHeader label="Liquidity Walls" small />
                <div className="grid grid-cols-1 gap-3 mt-3">
                  <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-4">
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
                    <WallsCard
                      walls={walls.buy}
                      total={walls.buy_total_usd}
                      type="buy"
                    />
                  </div>
                  <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-4">
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-400/30 to-transparent" />
                    <WallsCard
                      walls={walls.sell}
                      total={walls.sell_total_usd}
                      type="sell"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Derivatives Intelligence */}
          <div className="pt-2 space-y-3">
            <SectionHeader
              label="Derivatives Intelligence"
              suffix={autoRefresh ? "Live · 15s" : "Paused"}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <LiqCard data={liq} />
              <FundingCard data={funding} />
              <LSCard data={currentLS} symbol={symShort} />
              <OICard data={oi} />
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="flex items-center justify-center gap-2 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/50">
        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
        <span>{autoRefresh ? "Auto-refresh 15s" : t("orderbook.paused") || "Paused"}</span>
        {lastUpdate && (
          <>
            <span className="text-text-muted/30">·</span>
            <span className="tabular-nums">{lastUpdate.toLocaleTimeString()}</span>
          </>
        )}
      </div>

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="orderbook" />
    </div>
  );
}
