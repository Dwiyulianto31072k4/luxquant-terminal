// src/components/autotrade/PositionCard.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade Position Card v2 (Flowscan reskin)
// Open position display with TP progress, trailing status, close action
// ════════════════════════════════════════════════════════════════

import { useState } from "react";
import { closeOrderManually } from "../../services/autotradeApi";
import CoinLogo from "../CoinLogo";

function fmtNum(n, d = 4) {
  if (n === null || n === undefined) return "—";
  return Number(n).toFixed(d);
}

// ── Semantic styles ──
const sideStyle = (side) =>
  side === "buy"
    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
    : "bg-red-500/10 text-red-400 border-red-500/25";

const statusStyle = (status) => {
  const map = {
    filled: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    partial: "bg-gold-primary/10 text-gold-primary border-line/25",
    placed: "bg-white/[0.04] text-text-primary/70 border-white/[0.08]",
    pending: "bg-white/[0.04] text-text-muted border-white/[0.06]",
    error: "bg-red-500/10 text-red-400 border-red-500/25",
  };
  return map[status] || "bg-white/[0.04] text-text-primary/70 border-white/[0.08]";
};


export default function PositionCard({ order, onClosed }) {
  const [closing, setClosing] = useState(false);

  const handleClose = async () => {
    if (!confirm(`Close ${order.pair} ${order.side.toUpperCase()} at market?`)) return;
    setClosing(true);
    try {
      await closeOrderManually(order.id, "manual_from_ui");
      onClosed?.(order.id);
    } catch (e) {
      alert(e.message);
    } finally {
      setClosing(false);
    }
  };

  const tpHit = (order.tp_orders || []).filter((t) => t.filled).length;
  const tpTotal = (order.tp_orders || []).length;
  const canClose = ["filled", "partial", "placed"].includes(order.status);

  return (
    <div className="relative overflow-hidden bg-surface-raised border border-white/[0.06] rounded-md hover:border-white/[0.12] transition-all">
      {/* Top hairline accent */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

      <div className="relative p-4">
        {/* ── HEADER ── */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <CoinLogo pair={order.pair} size={36} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <h3 className="text-text-primary font-semibold text-sm font-mono">{order.pair}</h3>
                <span
                  className={`text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border ${sideStyle(order.side)}`}
                >
                  {order.side}
                </span>
                <span className="text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-white/[0.04] border-white/[0.08] text-text-muted">
                  {order.exchange_id}
                </span>
                <span className="text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-white/[0.04] border-white/[0.08] text-text-muted">
                  {order.market_type}
                </span>
              </div>
              <p className="text-[10px] font-mono text-text-muted/70 tabular-nums truncate">
                #{order.id}
                <span className="text-text-muted/40 mx-1.5">·</span>
                {new Date(order.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          <span className={`shrink-0 text-[9px] font-mono uppercase tracking-[0.1em] px-2 py-0.5 rounded border ${statusStyle(order.status)}`}>
            {order.status}
          </span>
        </div>

        {/* ── Price grid (4 cells) ── */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <PriceCell label="Entry" value={fmtNum(order.entry_price, 6)} />
          <PriceCell label="Qty" value={fmtNum(order.qty, 4)} />
          <PriceCell label="Leverage" value={`${order.leverage}×`} />
          <PriceCell label="SL" value={fmtNum(order.sl_current || order.sl_price, 6)} tone="danger" />
        </div>

        {/* ── TP Progress ── */}
        {tpTotal > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
              <span className="uppercase tracking-[0.2em] text-text-muted">TP Progress</span>
              <span className="text-gold-primary tabular-nums">
                {tpHit}<span className="text-text-muted/50"> / </span>{tpTotal}
              </span>
            </div>
            <div className="flex gap-1">
              {order.tp_orders.map((t, i) => (
                <div
                  key={i}
                  className={`flex-1 h-1 rounded-sm transition-all ${
                    t.filled ? "bg-gold-primary" : "bg-white/[0.06]"
                  }`}
                  title={`${t.level}: ${fmtNum(t.price, 6)} (${t.qty_pct}%)`}
                />
              ))}
            </div>
            <div className="flex gap-1 mt-1 font-mono">
              {order.tp_orders.map((t, i) => (
                <span
                  key={i}
                  className={`flex-1 text-center text-[8px] uppercase tracking-[0.1em] ${
                    t.filled ? "text-gold-primary/80" : "text-text-muted/50"
                  }`}
                >
                  {t.level}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Trailing status ── */}
        {order.trailing_enabled && (
          <div className="relative overflow-hidden bg-gold-primary/[0.04] border border-line/20 rounded mb-3 p-2.5">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/40 to-transparent" />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-1.5 h-1.5 rounded-full ${order.trailing_activated ? "bg-gold-primary animate-pulse" : "bg-gold-primary/40"}`} />
                <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-gold-primary/90">
                  Trailing {order.trailing_activated ? "Active" : "Pending"}
                </span>
              </div>
              <span className="text-[10px] font-mono text-gold-primary tabular-nums shrink-0">
                {order.trailing_value}{order.trailing_type === "percent" ? "%" : " USDT"}
              </span>
            </div>
            {order.trailing_activated && order.highest_price && (
              <p className="text-[10px] font-mono text-text-muted/70 mt-1.5 tabular-nums">
                Peak: <span className="text-text-primary/80">{fmtNum(order.highest_price, 6)}</span>
              </p>
            )}
          </div>
        )}

        {/* ── Error ── */}
        {order.error_message && (
          <div className="relative overflow-hidden bg-red-500/[0.05] border border-red-500/25 rounded mb-3 p-2.5">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
            <p className="text-[10px] font-mono text-red-400 leading-relaxed break-words">
              {order.error_message}
            </p>
          </div>
        )}

        {/* ── Close action ── */}
        {canClose && (
          <button
            onClick={handleClose}
            disabled={closing}
            className="w-full px-3 py-2 rounded-md border border-red-500/25 text-[10px] font-mono uppercase tracking-[0.2em] text-red-400 hover:bg-red-500/[0.08] hover:border-red-500/40 disabled:opacity-50 transition-all"
          >
            {closing ? "Closing…" : "Close at Market"}
          </button>
        )}
      </div>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// PRICE CELL (sub-component)
// ════════════════════════════════════════════════════════════════
const PriceCell = ({ label, value, tone = "neutral" }) => {
  const valueColor = {
    neutral: "text-text-primary",
    danger: "text-red-400/90",
    gold: "text-gold-primary",
  }[tone];

  return (
    <div className="bg-white/[0.02] border border-white/[0.04] rounded p-2">
      <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-text-muted mb-1">{label}</p>
      <p className={`font-mono text-xs tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
};
