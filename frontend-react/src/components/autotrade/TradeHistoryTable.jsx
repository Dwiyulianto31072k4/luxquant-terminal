// src/components/autotrade/TradeHistoryTable.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade Trade History Table v2 (Flowscan reskin)
// Closed orders with PnL, dense table + mobile card
// ════════════════════════════════════════════════════════════════

import CoinLogo from "../CoinLogo";

function fmtNum(n, d = 4) {
  if (n === null || n === undefined) return "—";
  return Number(n).toFixed(d);
}

function fmtPnl(n) {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

const sideStyle = (side) =>
  side === "buy"
    ? "bg-profit/10 text-profit border-profit/25"
    : "bg-red-500/10 text-loss border-red-500/25";

// ════════════════════════════════════════════════════════════════
// TABLE HEADER CELL
// ════════════════════════════════════════════════════════════════
const Th = ({ children, align = "left" }) => (
  <th
    className={`px-3 py-3 text-${align} text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted/80 font-normal`}
  >
    {children}
  </th>
);

export default function TradeHistoryTable({ orders = [], loading }) {
  // ── Loading ──
  if (loading) {
    return (
      <div className="relative overflow-hidden bg-surface-raised border border-ink/[0.06] rounded-md p-12 text-center">
        <div className="w-8 h-8 border-2 border-ink/10 border-t-accent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-text-muted text-[11px] font-mono uppercase tracking-[0.15em]">
          Loading…
        </p>
      </div>
    );
  }

  // ── Empty ──
  if (orders.length === 0) {
    return (
      <div className="relative overflow-hidden bg-surface-raised border border-ink/[0.06] rounded-md p-12 text-center">
        <p className="text-text-primary text-sm font-medium mb-1">No trade history yet</p>
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted">
          Closed trades will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-surface-raised border border-ink/[0.06] rounded-md">
      {/* ════════════════════════════════════ */}
      {/* DESKTOP (md+): Dense table */}
      {/* ════════════════════════════════════ */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ink/[0.06]">
              <Th>Date</Th>
              <Th>Pair</Th>
              <Th>Exchange</Th>
              <Th align="center">Side</Th>
              <Th align="right">Entry</Th>
              <Th align="right">Exit</Th>
              <Th align="right">PnL</Th>
              <Th align="center">Reason</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const pnl = Number(o.realized_pnl || 0);
              const pnlColor = pnl >= 0 ? "text-profit" : "text-loss";

              return (
                <tr
                  key={o.id}
                  className="border-b border-ink/[0.04] hover:bg-ink/[0.02] transition-colors"
                >
                  {/* Date */}
                  <td className="px-3 py-3 text-text-muted/70 text-[10px] font-mono tabular-nums whitespace-nowrap">
                    {o.closed_at
                      ? new Date(o.closed_at).toLocaleString()
                      : new Date(o.created_at).toLocaleString()}
                  </td>

                  {/* Pair */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <CoinLogo pair={o.pair} size={24} />
                      <span className="text-text-primary font-mono text-sm font-semibold">
                        {o.pair}
                      </span>
                    </div>
                  </td>

                  {/* Exchange */}
                  <td className="px-3 py-3">
                    <span className="text-text-muted text-[11px] font-mono uppercase tracking-[0.1em]">
                      {o.exchange_id}
                    </span>
                  </td>

                  {/* Side */}
                  <td className="px-3 py-3 text-center">
                    <span
                      className={`inline-flex items-center text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border ${sideStyle(o.side)}`}
                    >
                      {o.side}
                    </span>
                  </td>

                  {/* Entry */}
                  <td className="px-3 py-3 text-right text-text-primary/80 font-mono text-xs tabular-nums">
                    {fmtNum(o.entry_price, 6)}
                  </td>

                  {/* Exit */}
                  <td className="px-3 py-3 text-right text-text-primary/80 font-mono text-xs tabular-nums">
                    {fmtNum(o.sl_current, 6)}
                  </td>

                  {/* PnL */}
                  <td
                    className={`px-3 py-3 text-right font-mono text-sm font-semibold tabular-nums ${pnlColor}`}
                  >
                    ${fmtPnl(o.realized_pnl)}
                  </td>

                  {/* Reason */}
                  <td className="px-3 py-3 text-center">
                    <span className="text-text-muted/70 text-[10px] font-mono uppercase tracking-[0.1em]">
                      {o.close_reason || "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ════════════════════════════════════ */}
      {/* MOBILE: Card layout */}
      {/* ════════════════════════════════════ */}
      <div className="md:hidden divide-y divide-ink/[0.04]">
        {orders.map((o) => {
          const pnl = Number(o.realized_pnl || 0);
          const pnlColor = pnl >= 0 ? "text-profit" : "text-loss";

          return (
            <div key={o.id} className="p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CoinLogo pair={o.pair} size={28} />
                  <div className="min-w-0">
                    <p className="text-text-primary font-semibold text-sm font-mono">{o.pair}</p>
                    <p className="text-[10px] font-mono text-text-muted/70 mt-0.5">
                      <span className="uppercase tracking-wider">{o.exchange_id}</span>
                      <span className="text-text-muted/40 mx-1.5">·</span>
                      <span className="tabular-nums">
                        {new Date(o.closed_at || o.created_at).toLocaleDateString()}
                      </span>
                    </p>
                  </div>
                </div>

                <span
                  className={`shrink-0 text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border ${sideStyle(o.side)}`}
                >
                  {o.side}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/70">
                  {o.close_reason || "—"}
                </p>
                <p className={`font-mono text-sm font-semibold tabular-nums ${pnlColor}`}>
                  ${fmtPnl(o.realized_pnl)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
