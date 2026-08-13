// src/components/OrderBookPage.jsx
// LuxQuant Terminal — Order Book desk (depth ladder · walls · derivatives)
// Data: /api/v1/orderbook/analysis + /overview + market liquidations/derivatives

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import orderbookApi from "../services/orderbookApi";
import api from "../services/api";
import CoinLogo from "./CoinLogo";
import AssistantWidget from "./assistant/AssistantWidget";
import { PageHeader } from "./ui/PageHeader";

const SYMBOLS = [
  { key: "BTCUSDT", base: "BTC", label: "BTC" },
  { key: "ETHUSDT", base: "ETH", label: "ETH" },
  { key: "SOLUSDT", base: "SOL", label: "SOL" },
  { key: "BNBUSDT", base: "BNB", label: "BNB" },
  { key: "XRPUSDT", base: "XRP", label: "XRP" },
  { key: "DOGEUSDT", base: "DOGE", label: "DOGE" },
];

const REFRESH_MS = 12000;

// ── formatters ──────────────────────────────────────────
const fmtUsd = (v) => {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

const fmtPrice = (v, dec = 2) => {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  if (n >= 1000)
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(Math.min(dec, 4));
  return n.toFixed(Math.max(dec, 4));
};

const fmtQty = (v) => {
  if (v == null) return "—";
  const n = Number(v);
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(4);
};

const timeAgo = (ts) => {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
};

const sentimentMeta = (s) => {
  if (s === "strong_buy" || s === "buy")
    return { tone: "text-profit", dot: "bg-profit", bar: "bg-profit" };
  if (s === "strong_sell" || s === "sell")
    return { tone: "text-loss", dot: "bg-loss", bar: "bg-loss" };
  return { tone: "text-accent", dot: "bg-accent", bar: "bg-accent" };
};

// ── Card shell ──────────────────────────────────────────
const Card = ({ children, className = "", pad = true }) => (
  <div
    className={`overflow-hidden rounded-lg border border-ink/[0.08] bg-surface-raised ${
      pad ? "p-4" : ""
    } ${className}`}
  >
    {children}
  </div>
);

const CardLabel = ({ children, right }) => (
  <div className="mb-3 flex items-center justify-between gap-2">
    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
      {children}
    </span>
    {right}
  </div>
);

// ════════════════════════════════════════════════════════
// IMBALANCE HERO
// ════════════════════════════════════════════════════════
const ImbalanceHero = ({ imb, mid, spreadPct, venue, liveWs }) => {
  if (!imb) return null;
  const meta = sentimentMeta(imb.sentiment);
  const bid = imb.bid_pct ?? 50;
  const ask = imb.ask_pct ?? 50;

  return (
    <Card className="relative">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${meta.dot} animate-pulse`} />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              Book imbalance
            </span>
            <span className={`font-mono text-[12px] font-semibold uppercase tracking-[0.12em] ${meta.tone}`}>
              {imb.sentiment_label || "—"}
            </span>
            {venue && (
              <span className="rounded-sm border border-ink/10 bg-ink/[0.04] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-muted">
                {String(venue).replace(/_/g, " ")}
              </span>
            )}
            {liveWs?.imb != null && (
              <span
                className="rounded-sm border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-accent"
                title="Live WS snapshot (call-universe worker)"
              >
                WS {liveWs.imb > 0 ? "+" : ""}
                {liveWs.imb}%
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">Bid depth</p>
              <p className="font-mono text-lg font-semibold tabular-nums text-profit">{fmtUsd(imb.bid_usd)}</p>
              <p className="font-mono text-[11px] tabular-nums text-profit/70">{bid.toFixed(1)}%</p>
            </div>
            <div className="hidden h-10 w-px bg-ink/[0.08] sm:block" />
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">Ask depth</p>
              <p className="font-mono text-lg font-semibold tabular-nums text-loss">{fmtUsd(imb.ask_usd)}</p>
              <p className="font-mono text-[11px] tabular-nums text-loss/70">{ask.toFixed(1)}%</p>
            </div>
            <div className="hidden h-10 w-px bg-ink/[0.08] sm:block" />
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">Mid · spread</p>
              <p className="font-mono text-lg font-semibold tabular-nums text-text-primary">
                ${fmtPrice(mid)}
              </p>
              <p className="font-mono text-[11px] tabular-nums text-text-muted">
                {spreadPct != null ? `${Number(spreadPct).toFixed(4)}%` : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Dual ratio bar */}
        <div className="w-full max-w-sm shrink-0 space-y-2 lg:w-72">
          <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.12em]">
            <span className="text-profit">Bids</span>
            <span className="text-loss">Asks</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-md bg-ink/[0.06]">
            <div
              className="h-full bg-profit transition-all duration-700"
              style={{ width: `${bid}%` }}
            />
            <div
              className="h-full bg-loss transition-all duration-700"
              style={{ width: `${ask}%` }}
            />
          </div>
          <p className="text-center font-mono text-[10px] text-text-muted">
            Ratio {(imb.ratio ?? 0) >= 0 ? "+" : ""}
            {((imb.ratio ?? 0) * 100).toFixed(1)}% bid-heavy when positive
          </p>
        </div>
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════
// LADDER — classic bid | ask book
// ════════════════════════════════════════════════════════
const BookLadder = ({ ladder, dec = 2 }) => {
  const bids = ladder?.bids || [];
  const asks = ladder?.asks || [];
  const maxUsd = Math.max(ladder?.max_usd || 1, 1);

  if (!bids.length && !asks.length) {
    return (
      <div className="px-4 py-12 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-text-muted">
        No ladder data
      </div>
    );
  }

  const Row = ({ side, row }) => {
    const isBid = side === "bid";
    const pct = Math.min(100, (row.usd / maxUsd) * 100);
    return (
      <div className="relative grid grid-cols-[1fr_1fr_1fr] items-center gap-1 px-3 py-1 font-mono text-[11px] tabular-nums">
        <div
          className={`pointer-events-none absolute inset-y-0 ${isBid ? "left-0 bg-profit/12" : "right-0 bg-loss/12"}`}
          style={{ width: `${pct}%` }}
        />
        {isBid ? (
          <>
            <span className="relative z-[1] text-left text-text-muted/80">{fmtQty(row.qty)}</span>
            <span className="relative z-[1] text-center text-profit font-medium">
              {fmtPrice(row.price, dec)}
            </span>
            <span className="relative z-[1] text-right text-profit/80">{fmtUsd(row.usd)}</span>
          </>
        ) : (
          <>
            <span className="relative z-[1] text-left text-loss/80">{fmtUsd(row.usd)}</span>
            <span className="relative z-[1] text-center text-loss font-medium">
              {fmtPrice(row.price, dec)}
            </span>
            <span className="relative z-[1] text-right text-text-muted/80">{fmtQty(row.qty)}</span>
          </>
        )}
      </div>
    );
  };

  // Show asks reversed (high → mid), then mid, then bids (mid → low)
  const askRows = [...asks].reverse();

  return (
    <div className="select-none">
      <div className="grid grid-cols-2 border-b border-ink/[0.06] bg-ink/[0.02]">
        <div className="border-r border-ink/[0.06] px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-profit">
          Bids · support
        </div>
        <div className="px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-loss">
          Asks · resistance
        </div>
      </div>
      <div className="grid grid-cols-2">
        {/* Bids column */}
        <div className="border-r border-ink/[0.06]">
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-1 border-b border-ink/[0.04] px-3 py-1 font-mono text-[8px] uppercase tracking-wider text-text-muted/50">
            <span>Size</span>
            <span className="text-center">Price</span>
            <span className="text-right">USD</span>
          </div>
          {bids.map((r, i) => (
            <Row key={`b-${i}`} side="bid" row={r} />
          ))}
        </div>
        {/* Asks column */}
        <div>
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-1 border-b border-ink/[0.04] px-3 py-1 font-mono text-[8px] uppercase tracking-wider text-text-muted/50">
            <span>USD</span>
            <span className="text-center">Price</span>
            <span className="text-right">Size</span>
          </div>
          {asks.map((r, i) => (
            <Row key={`a-${i}`} side="ask" row={r} />
          ))}
        </div>
      </div>
      {/* compact stacked view for very small screens is same grid */}
      <div className="sr-only">{askRows.length} ask levels</div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// DEPTH PROFILE — cumulative bars (butterfly)
// ════════════════════════════════════════════════════════
const DepthProfile = ({ depth, dec = 2 }) => {
  const bids = depth?.bids || [];
  const asks = depth?.asks || [];
  if (!bids.length && !asks.length) {
    return (
      <div className="px-4 py-10 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-text-muted">
        No depth
      </div>
    );
  }

  const maxBid = bids.length ? bids[bids.length - 1].cumulative_usd : 0;
  const maxAsk = asks.length ? asks[asks.length - 1].cumulative_usd : 0;
  const maxVal = Math.max(maxBid, maxAsk, 1);

  // sample for readability
  const stepB = Math.max(1, Math.floor(bids.length / 16));
  const stepA = Math.max(1, Math.floor(asks.length / 16));
  const sBids = bids.filter((_, i) => i % stepB === 0).slice(0, 16);
  const sAsks = asks.filter((_, i) => i % stepA === 0).slice(0, 16);

  return (
    <div className="space-y-0.5 px-3 py-3">
      {[...sAsks].reverse().map((a, i) => {
        const pct = (a.cumulative_usd / maxVal) * 100;
        return (
          <div key={`da-${i}`} className="group flex items-center gap-2">
            <span className="w-[4.5rem] shrink-0 text-right font-mono text-[10px] tabular-nums text-text-muted">
              {fmtPrice(a.price, dec)}
            </span>
            <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-ink/[0.04]">
              <div
                className="absolute inset-y-0 left-0 rounded-sm bg-loss/45 transition-all duration-300 group-hover:bg-loss/65"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-loss opacity-80 group-hover:opacity-100">
              {fmtUsd(a.cumulative_usd)}
            </span>
          </div>
        );
      })}

      <div className="flex items-center gap-2 py-2">
        <div className="h-px flex-1 bg-accent/30" />
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-accent">
          Mid
        </span>
        <div className="h-px flex-1 bg-accent/30" />
      </div>

      {sBids.map((b, i) => {
        const pct = (b.cumulative_usd / maxVal) * 100;
        return (
          <div key={`db-${i}`} className="group flex items-center gap-2">
            <span className="w-[4.5rem] shrink-0 text-right font-mono text-[10px] tabular-nums text-text-muted">
              {fmtPrice(b.price, dec)}
            </span>
            <div className="relative h-4 flex-1 overflow-hidden rounded-sm bg-ink/[0.04]">
              <div
                className="absolute inset-y-0 left-0 rounded-sm bg-profit/45 transition-all duration-300 group-hover:bg-profit/65"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-profit opacity-80 group-hover:opacity-100">
              {fmtUsd(b.cumulative_usd)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ════════════════════════════════════════════════════════
// WALLS + S/R
// ════════════════════════════════════════════════════════
const WallsPanel = ({ walls, type }) => {
  const isBuy = type === "buy";
  const list = walls || [];
  const maxUsd = Math.max(...list.map((w) => w.usd), 1);

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${isBuy ? "bg-profit" : "bg-loss"}`} />
          <span
            className={`font-mono text-[10px] font-semibold uppercase tracking-[0.14em] ${
              isBuy ? "text-profit" : "text-loss"
            }`}
          >
            {isBuy ? "Buy walls" : "Sell walls"}
          </span>
        </div>
        <span
          className={`font-mono text-[11px] font-semibold tabular-nums ${
            isBuy ? "text-profit" : "text-loss"
          }`}
        >
          {fmtUsd(list.reduce((s, w) => s + (w.usd || 0), 0))}
        </span>
      </div>
      {list.length ? (
        <div className="space-y-2">
          {list.slice(0, 5).map((w, i) => {
            const pct = Math.min(100, (w.usd / maxUsd) * 100);
            return (
              <div key={i}>
                <div className="mb-0.5 flex items-center justify-between gap-2 font-mono text-[11px]">
                  <span className="tabular-nums text-text-primary">{fmtPrice(w.price)}</span>
                  <div className="flex items-center gap-1.5">
                    {w.dist_pct != null && (
                      <span className="text-[9px] tabular-nums text-text-muted">
                        {w.dist_pct > 0 ? "+" : ""}
                        {w.dist_pct.toFixed(2)}%
                      </span>
                    )}
                    {w.strength != null && (
                      <span className="rounded border border-ink/10 bg-ink/[0.04] px-1 py-0.5 text-[8px] text-text-muted">
                        ×{w.strength.toFixed(1)}
                      </span>
                    )}
                    <span
                      className={`font-semibold tabular-nums ${isBuy ? "text-profit" : "text-loss"}`}
                    >
                      {fmtUsd(w.usd)}
                    </span>
                  </div>
                </div>
                <div className="h-1 overflow-hidden rounded-sm bg-ink/[0.05]">
                  <div
                    className={`h-full rounded-sm transition-all duration-500 ${
                      isBuy ? "bg-profit/70" : "bg-loss/70"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="py-3 text-center font-mono text-[10px] uppercase tracking-wider text-text-muted/50">
          No significant walls
        </p>
      )}
    </div>
  );
};

const SRPanel = ({ sr }) => {
  const support = sr?.support || [];
  const resistance = sr?.resistance || [];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-loss">
          <span className="h-1.5 w-1.5 rounded-full bg-loss" /> Resistance
        </p>
        {resistance.length ? (
          resistance.map((r, i) => (
            <div key={i} className="mb-1.5 flex justify-between font-mono text-[12px]">
              <span className="tabular-nums text-text-primary">{fmtPrice(r.price)}</span>
              <span className="tabular-nums text-loss">{fmtUsd(r.usd)}</span>
            </div>
          ))
        ) : (
          <p className="font-mono text-[10px] text-text-muted/50">None detected</p>
        )}
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-profit">
          <span className="h-1.5 w-1.5 rounded-full bg-profit" /> Support
        </p>
        {support.length ? (
          support.map((s, i) => (
            <div key={i} className="mb-1.5 flex justify-between font-mono text-[12px]">
              <span className="tabular-nums text-text-primary">{fmtPrice(s.price)}</span>
              <span className="tabular-nums text-profit">{fmtUsd(s.usd)}</span>
            </div>
          ))
        ) : (
          <p className="font-mono text-[10px] text-text-muted/50">None detected</p>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════
// OVERVIEW STRIP (multi-pair from WS)
// ════════════════════════════════════════════════════════
const OverviewStrip = ({ pairs, onPick, active }) => {
  if (!pairs?.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
      {pairs.slice(0, 16).map((p) => {
        const sym = p.symbol;
        const imb = p.imb ?? 0;
        const isActive = active === sym;
        const pos = imb >= 0;
        return (
          <button
            key={sym}
            type="button"
            onClick={() => onPick?.(sym)}
            className={`flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${
              isActive
                ? "border-accent/40 bg-accent/10"
                : "border-ink/[0.08] bg-surface-raised hover:border-ink/15"
            }`}
          >
            <CoinLogo pair={sym} size={18} />
            <span className="font-mono text-[11px] font-semibold text-text-primary">
              {sym.replace("USDT", "")}
            </span>
            <span
              className={`font-mono text-[10px] tabular-nums font-semibold ${
                pos ? "text-profit" : "text-loss"
              }`}
            >
              {pos ? "+" : ""}
              {imb}%
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ════════════════════════════════════════════════════════
// DERIV CARDS (compact, logos where useful)
// ════════════════════════════════════════════════════════
const LiqCard = ({ data }) => {
  const recent = useMemo(() => data?.recent || [], [data]);
  const summary = useMemo(() => {
    let total = 0,
      longL = 0,
      shortL = 0;
    recent.forEach((l) => {
      const usd = Number(l.usd || 0);
      total += usd;
      if (l.posSide === "long") longL += usd;
      else shortL += usd;
    });
    return { total, longL, shortL };
  }, [recent]);

  if (!data) return <Skeleton label="Liquidations" />;
  const lPct = summary.total > 0 ? (summary.longL / summary.total) * 100 : 50;
  const top = [...recent]
    .filter((l) => l.usd > 0.5)
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 4);

  return (
    <Card>
      <CardLabel right={<span className="font-mono text-[10px] text-text-muted">Recent</span>}>
        Liquidations
      </CardLabel>
      <p className="mb-2 font-mono text-xl font-semibold tabular-nums text-text-primary">
        {fmtUsd(summary.total)}
      </p>
      <div className="mb-2 flex h-1.5 overflow-hidden rounded-sm bg-ink/[0.05]">
        <div className="h-full bg-profit" style={{ width: `${lPct}%` }} />
        <div className="h-full bg-loss" style={{ width: `${100 - lPct}%` }} />
      </div>
      <div className="mb-3 flex justify-between font-mono text-[10px]">
        <span className="text-profit">Long {fmtUsd(summary.longL)}</span>
        <span className="text-loss">Short {fmtUsd(summary.shortL)}</span>
      </div>
      <div className="space-y-1.5">
        {top.map((l, i) => {
          const isLong = l.posSide === "long";
          return (
            <div key={i} className="flex items-center gap-1.5 font-mono text-[10px]">
              <CoinLogo pair={l.symbol} size={16} />
              <span
                className={`rounded px-1 py-0.5 text-[8px] uppercase ${
                  isLong ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"
                }`}
              >
                {isLong ? "L" : "S"}
              </span>
              <span className="font-semibold text-text-primary">{String(l.symbol || "").replace(/USDT$/, "")}</span>
              <span className="ml-auto tabular-nums text-accent">{fmtUsd(l.usd)}</span>
              <span className="text-text-muted/60">{timeAgo(l.time)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

const FundingCard = ({ data }) => {
  if (!data) return <Skeleton label="Funding" />;
  const longs = (data.most_long || []).slice(0, 3);
  const shorts = (data.most_short || []).slice(0, 3);
  const avg = (data.avg_rate || 0) * 100;
  return (
    <Card>
      <CardLabel
        right={
          <span className="font-mono text-[10px] tabular-nums text-text-muted">
            avg {avg.toFixed(4)}%
          </span>
        }
      >
        Funding rates
      </CardLabel>
      <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-profit">
        Most long
      </p>
      <div className="mb-3 space-y-1">
        {longs.map((f, i) => (
          <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
            <CoinLogo pair={f.symbol} size={16} />
            <span className="font-semibold text-text-primary">{String(f.symbol || "").replace(/USDT$/, "")}</span>
            <span className="ml-auto tabular-nums text-profit">+{f.rate_pct?.toFixed(3)}%</span>
          </div>
        ))}
      </div>
      <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-loss">
        Most short
      </p>
      <div className="space-y-1">
        {shorts.map((f, i) => (
          <div key={i} className="flex items-center gap-2 font-mono text-[11px]">
            <CoinLogo pair={f.symbol} size={16} />
            <span className="font-semibold text-text-primary">{String(f.symbol || "").replace(/USDT$/, "")}</span>
            <span className="ml-auto tabular-nums text-loss">{f.rate_pct?.toFixed(3)}%</span>
          </div>
        ))}
      </div>
    </Card>
  );
};

const LSCard = ({ data, symbol }) => {
  if (!data) return <Skeleton label={`L/S · ${symbol}`} />;
  const lPct = data.long || 0;
  const sPct = data.short || 0;
  return (
    <Card>
      <CardLabel>Long / short · {symbol}</CardLabel>
      <p className="mb-2 font-mono text-xl font-semibold tabular-nums text-text-primary">
        {(data.ratio || 0).toFixed(2)}
      </p>
      <div className="mb-2 flex h-1.5 overflow-hidden rounded-sm bg-ink/[0.05]">
        <div className="h-full bg-profit" style={{ width: `${lPct}%` }} />
        <div className="h-full bg-loss" style={{ width: `${sPct}%` }} />
      </div>
      <div className="flex justify-between font-mono text-[10px]">
        <span className="text-profit">Long {lPct.toFixed(1)}%</span>
        <span className="text-loss">Short {sPct.toFixed(1)}%</span>
      </div>
    </Card>
  );
};

const OICard = ({ data }) => {
  if (!data) return <Skeleton label="Open interest" />;
  const top3 = (data.breakdown || []).slice(0, 3);
  const maxOi = Math.max(...top3.map((b) => b.oi_usd), 1);
  return (
    <Card>
      <CardLabel>Open interest</CardLabel>
      <p className="mb-3 font-mono text-xl font-semibold tabular-nums text-text-primary">
        {fmtUsd(data.total_usd)}
      </p>
      <div className="space-y-2">
        {top3.map((b, i) => (
          <div key={i}>
            <div className="mb-0.5 flex items-center gap-2 font-mono text-[10px]">
              <CoinLogo pair={b.symbol} size={16} />
              <span className="font-semibold text-text-primary">
                {String(b.symbol || "").replace(/USDT$/, "")}
              </span>
              <span className="ml-auto tabular-nums text-text-muted">{fmtUsd(b.oi_usd)}</span>
            </div>
            <div className="h-1 rounded-sm bg-ink/[0.05]">
              <div
                className="h-full rounded-sm bg-accent/70"
                style={{ width: `${(b.oi_usd / maxOi) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

const Skeleton = ({ label }) => (
  <Card>
    <CardLabel>{label}</CardLabel>
    <div className="space-y-2">
      <div className="h-6 animate-pulse rounded bg-ink/[0.06]" />
      <div className="h-2 animate-pulse rounded bg-ink/[0.04]" />
      <div className="h-2 w-2/3 animate-pulse rounded bg-ink/[0.04]" />
    </div>
  </Card>
);

// ════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════
export default function OrderBookPage() {
  const { t } = useTranslation();
  const [sym, setSym] = useState("BTCUSDT");
  const [data, setData] = useState(null);
  const [overview, setOverview] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [view, setView] = useState("ladder"); // ladder | depth
  const intervalRef = useRef(null);

  const [liq, setLiq] = useState(null);
  const [funding, setFunding] = useState(null);
  const [longShort, setLongShort] = useState(null);
  const [oi, setOi] = useState(null);

  const fetchOB = useCallback(
    async (showLoad = false) => {
      if (showLoad) setLoading(true);
      try {
        const [result, ov] = await Promise.all([
          orderbookApi.getAnalysis(sym),
          orderbookApi.getOverview().catch(() => null),
        ]);
        setData(result);
        if (ov?.pairs) setOverview(ov.pairs);
        setError(null);
      } catch (err) {
        console.error("OB fetch error:", err);
        setError("Failed to load order book");
      } finally {
        setLoading(false);
      }
    },
    [sym]
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
    if (!autoRefresh) return undefined;
    intervalRef.current = setInterval(() => {
      fetchOB(false);
      fetchDeriv();
    }, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, fetchOB, fetchDeriv]);

  const imb = data?.imbalance || {};
  const walls = data?.walls || { buy: [], sell: [] };
  const sr = data?.support_resistance || {};
  const depth = data?.depth || {};
  const ladder = data?.ladder || {};
  const dec = data?.price_decimals ?? 2;
  const ticker = data?.ticker || {};
  const chg = ticker.change_pct;
  const symShort = sym.replace("USDT", "");
  const currentLS = longShort?.[symShort] || null;
  const activeMeta = SYMBOLS.find((s) => s.key === sym) || { base: symShort, label: symShort };

  const pickSymbol = (s) => {
    const key = String(s || "").toUpperCase();
    if (!key) return;
    setSym(key.endsWith("USDT") ? key : `${key}USDT`);
  };

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-8">
      <PageHeader
        eyebrow="Markets"
        title={t("orderbook.title") || "Order Book"}
        subtitle={
          t("orderbook.subtitle") ||
          "Live depth, liquidity walls, and imbalance — Binance futures first, enriched with call-universe flow"
        }
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
                autoRefresh
                  ? "border-profit/30 bg-profit/10 text-profit"
                  : "border-ink/10 bg-surface-secondary text-text-muted"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? "bg-profit animate-pulse" : "bg-text-muted"}`} />
              {autoRefresh ? "Live 12s" : "Paused"}
            </button>
            <button
              type="button"
              onClick={() => fetchOB(false)}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-surface-secondary px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted hover:text-text-primary"
            >
              Refresh
            </button>
          </div>
        }
      />

      {/* Symbol selector + price */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {SYMBOLS.map((s) => {
            const active = sym === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSym(s.key)}
                className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
                  active
                    ? "border-accent/40 bg-accent text-accent-fg"
                    : "border-ink/[0.08] bg-surface-raised text-text-muted hover:border-ink/15 hover:text-text-primary"
                }`}
              >
                <CoinLogo pair={s.key} size={20} />
                {s.label}
              </button>
            );
          })}
        </div>

        {data?.mid_price ? (
          <div className="flex items-center gap-3 sm:text-right">
            <CoinLogo pair={sym} size={36} />
            <div>
              <p className="font-display text-2xl font-semibold tabular-nums tracking-tight text-text-primary">
                ${fmtPrice(ticker.last || data.mid_price, dec)}
              </p>
              <p className="font-mono text-[11px] text-text-muted">
                {activeMeta.base}/USDT
                {chg != null && (
                  <span className={`ml-2 font-semibold ${chg >= 0 ? "text-profit" : "text-loss"}`}>
                    {chg >= 0 ? "+" : ""}
                    {Number(chg).toFixed(2)}% 24h
                  </span>
                )}
                {ticker.volume_usd != null && (
                  <span className="ml-2 text-text-muted/70">Vol {fmtUsd(ticker.volume_usd)}</span>
                )}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Hot books from WS worker */}
      {overview.length > 0 && (
        <div className="space-y-2">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            Call-universe books · live imbalance
          </p>
          <OverviewStrip pairs={overview} onPick={pickSymbol} active={sym} />
        </div>
      )}

      {loading && !data && (
        <div className="flex justify-center py-20">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-ink/10 border-t-accent" />
        </div>
      )}

      {error && !data && (
        <Card className="border-loss/25 bg-loss/[0.04] text-center">
          <p className="mb-3 font-mono text-sm text-loss">{error}</p>
          <button
            type="button"
            onClick={() => fetchOB(true)}
            className="rounded-md border border-ink/12 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-accent"
          >
            Retry
          </button>
        </Card>
      )}

      {data && (
        <>
          <ImbalanceHero
            imb={imb}
            mid={data.mid_price}
            spreadPct={data.spread_pct}
            venue={data.venue}
            liveWs={data.live_ws}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            {/* Main book */}
            <div className="space-y-3 xl:col-span-7">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Order book · {data.total_levels || 0} levels
                </p>
                <div className="flex rounded-md border border-ink/10 bg-surface-secondary p-0.5">
                  {[
                    { k: "ladder", label: "Ladder" },
                    { k: "depth", label: "Depth" },
                  ].map((o) => (
                    <button
                      key={o.k}
                      type="button"
                      onClick={() => setView(o.k)}
                      className={`rounded-sm px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        view === o.k
                          ? "bg-accent text-accent-fg"
                          : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <Card pad={false} className="min-h-[420px]">
                {view === "ladder" ? (
                  <BookLadder ladder={ladder} dec={dec} />
                ) : (
                  <DepthProfile depth={depth} dec={dec} />
                )}
              </Card>
            </div>

            {/* Side: S/R + walls */}
            <div className="space-y-3 xl:col-span-5">
              <Card>
                <CardLabel>Support / resistance</CardLabel>
                <SRPanel sr={sr} />
              </Card>
              <Card>
                <CardLabel>Liquidity walls</CardLabel>
                <div className="space-y-5">
                  <WallsPanel walls={walls.buy} type="buy" />
                  <div className="h-px bg-ink/[0.06]" />
                  <WallsPanel walls={walls.sell} type="sell" />
                </div>
              </Card>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Derivatives context
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <LiqCard data={liq} />
              <FundingCard data={funding} />
              <LSCard data={currentLS} symbol={symShort} />
              <OICard data={oi} />
            </div>
          </div>
        </>
      )}

      <AssistantWidget />
    </div>
  );
}
