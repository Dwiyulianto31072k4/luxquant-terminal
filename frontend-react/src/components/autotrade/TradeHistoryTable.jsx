// src/components/autotrade/TradeHistoryTable.jsx
import CoinLogo from "../CoinLogo";

function fmtNum(n, d = 4) {
  if (n === null || n === undefined) return "-";
  return Number(n).toFixed(d);
}

function fmtPnl(n) {
  if (n === null || n === undefined) return "-";
  const v = Number(n);
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
}

export default function TradeHistoryTable({ orders = [], loading }) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-2 border-gold-primary/20 border-t-gold-primary rounded-full animate-spin mx-auto mb-2" />
        <p className="text-text-muted text-sm">Loading…</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 bg-bg-card rounded-xl border border-white/5">
        <p className="text-text-muted text-sm">No trade history yet</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-white/5 rounded-xl overflow-hidden">
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs text-text-muted uppercase">
              <th className="text-left px-4 py-3 font-semibold">Date</th>
              <th className="text-left px-4 py-3 font-semibold">Pair</th>
              <th className="text-left px-4 py-3 font-semibold">Exchange</th>
              <th className="text-center px-4 py-3 font-semibold">Side</th>
              <th className="text-right px-4 py-3 font-semibold">Entry</th>
              <th className="text-right px-4 py-3 font-semibold">Exit</th>
              <th className="text-right px-4 py-3 font-semibold">PnL</th>
              <th className="text-center px-4 py-3 font-semibold">Reason</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const pnl = Number(o.realized_pnl || 0);
              return (
                <tr key={o.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-text-secondary text-xs font-mono whitespace-nowrap">
                    {o.closed_at ? new Date(o.closed_at).toLocaleString() : new Date(o.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CoinLogo pair={o.pair} size={24} />
                      <span className="text-white font-semibold">{o.pair}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary capitalize">{o.exchange_id}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                        o.side === "buy"
                          ? "bg-green-500/15 text-green-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {o.side}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-text-secondary font-mono text-xs">
                    {fmtNum(o.entry_price, 6)}
                  </td>
                  <td className="px-4 py-3 text-right text-text-secondary font-mono text-xs">
                    {fmtNum(o.sl_current, 6)}
                  </td>
                  <td
                    className="px-4 py-3 text-right font-mono font-semibold"
                    style={{ color: pnl >= 0 ? "#10b981" : "#ef4444" }}
                  >
                    ${fmtPnl(o.realized_pnl)}
                  </td>
                  <td className="px-4 py-3 text-center text-text-muted text-[11px] uppercase">
                    {o.close_reason || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden divide-y divide-white/5">
        {orders.map((o) => {
          const pnl = Number(o.realized_pnl || 0);
          return (
            <div key={o.id} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <CoinLogo pair={o.pair} size={32} />
                  <div>
                    <p className="text-white font-semibold">{o.pair}</p>
                    <p className="text-xs text-text-muted">
                      {o.exchange_id} · {new Date(o.closed_at || o.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    o.side === "buy" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                  }`}
                >
                  {o.side}
                </span>
              </div>
              <div className="flex justify-between">
                <p className="text-xs text-text-muted uppercase">{o.close_reason || "-"}</p>
                <p
                  className="font-mono font-semibold text-sm"
                  style={{ color: pnl >= 0 ? "#10b981" : "#ef4444" }}
                >
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
