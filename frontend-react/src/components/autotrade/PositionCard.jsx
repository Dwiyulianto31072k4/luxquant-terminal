// src/components/autotrade/PositionCard.jsx
import { useState } from "react";
import { closeOrderManually } from "../../services/autotradeApi";
import CoinLogo from "../CoinLogo";

function fmtNum(n, d = 4) {
  if (n === null || n === undefined) return "-";
  return Number(n).toFixed(d);
}

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

  const sideColor = order.side === "buy" ? "#10b981" : "#ef4444";
  const statusColors = {
    filled: "#10b981",
    partial: "#d4a853",
    placed: "#3b82f6",
    pending: "#6b7280",
    error: "#ef4444",
  };
  const statusColor = statusColors[order.status] || "#6b7280";

  const tpHit = (order.tp_orders || []).filter((t) => t.filled).length;
  const tpTotal = (order.tp_orders || []).length;

  return (
    <div className="bg-bg-card border border-white/5 rounded-xl p-4 hover:border-gold-primary/20 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <CoinLogo pair={order.pair} size={40} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-white font-semibold">{order.pair}</h3>
              <span
                className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                style={{ background: `${sideColor}20`, color: sideColor, border: `1px solid ${sideColor}40` }}
              >
                {order.side}
              </span>
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/5 text-text-muted">
                {order.exchange_id}
              </span>
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/5 text-text-muted">
                {order.market_type}
              </span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">
              #{order.id} · {new Date(order.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div
          className="text-[10px] font-bold px-2 py-1 rounded uppercase"
          style={{ background: `${statusColor}20`, color: statusColor }}
        >
          {order.status}
        </div>
      </div>

      {/* Price grid */}
      <div className="grid grid-cols-4 gap-2 mb-3 text-xs">
        <div className="bg-white/[0.02] rounded-lg p-2">
          <p className="text-text-muted mb-0.5">Entry</p>
          <p className="text-white font-mono">{fmtNum(order.entry_price, 6)}</p>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2">
          <p className="text-text-muted mb-0.5">Qty</p>
          <p className="text-white font-mono">{fmtNum(order.qty, 4)}</p>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2">
          <p className="text-text-muted mb-0.5">Leverage</p>
          <p className="text-white font-mono">{order.leverage}x</p>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-2">
          <p className="text-text-muted mb-0.5">SL</p>
          <p className="text-white font-mono">{fmtNum(order.sl_current || order.sl_price, 6)}</p>
        </div>
      </div>

      {/* TP Progress */}
      {tpTotal > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-text-muted">TP Progress</span>
            <span className="text-gold-primary font-mono">
              {tpHit}/{tpTotal}
            </span>
          </div>
          <div className="flex gap-1">
            {order.tp_orders.map((t, i) => (
              <div
                key={i}
                className={`flex-1 h-1.5 rounded-full ${
                  t.filled ? "bg-gold-primary" : "bg-white/10"
                }`}
                title={`${t.level}: ${fmtNum(t.price, 6)} (${t.qty_pct}%)`}
              />
            ))}
          </div>
          <div className="flex gap-1 mt-1 text-[9px] text-text-muted font-mono">
            {order.tp_orders.map((t, i) => (
              <span key={i} className="flex-1 text-center">
                {t.level.toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Trailing status */}
      {order.trailing_enabled && (
        <div className="mb-3 bg-gold-primary/5 border border-gold-primary/20 rounded-lg p-2 text-xs">
          <div className="flex justify-between">
            <span className="text-gold-primary">
              Trailing {order.trailing_activated ? "✓ Active" : "Pending"}
            </span>
            <span className="text-text-muted font-mono">
              {order.trailing_value}{order.trailing_type === "percent" ? "%" : " USDT"}
            </span>
          </div>
          {order.trailing_activated && order.highest_price && (
            <p className="text-[10px] text-text-muted mt-1">
              Peak: {fmtNum(order.highest_price, 6)}
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {order.error_message && (
        <div className="mb-3 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
          <p className="text-xs text-red-400 font-mono">{order.error_message}</p>
        </div>
      )}

      {/* Actions */}
      {["filled", "partial", "placed"].includes(order.status) && (
        <button
          onClick={handleClose}
          disabled={closing}
          className="w-full px-3 py-2 rounded-lg border border-red-500/20 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
        >
          {closing ? "Closing…" : "Close at Market"}
        </button>
      )}
    </div>
  );
}
