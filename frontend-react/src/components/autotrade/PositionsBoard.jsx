// src/components/autotrade/PositionsBoard.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · Positions tab
// Exchange-style portfolio view: spot balances + futures positions
// with coin logos, colored PnL and ROE%. Responsive (cards ↔ table).
// ════════════════════════════════════════════════════════════════

import CoinLogo from "../CoinLogo";
import { Card, SectionHeader, EmptyState, StatusBadge, fmtNum } from "./AutoTradeUI";

function pnlColor(value) {
  const n = Number(value || 0);
  if (n > 0) return "text-[#0ECB81]";
  if (n < 0) return "text-[#F6465D]";
  return "text-white/80";
}

function roe(position) {
  const pnl = Number(position.unrealizedProfit || 0);
  const entry = Number(position.entryPrice || 0);
  const amt = Math.abs(Number(position.positionAmt || 0));
  const lev = Number(position.leverage || 1) || 1;
  const notional = entry * amt;
  if (!notional) return null;
  return (pnl / (notional / lev)) * 100;
}

export default function PositionsBoard({ portfolio }) {
  const spotBalances = (portfolio?.spot?.balances || []).filter(
    (item) => Number(item.free || 0) > 0 || Number(item.locked || 0) > 0,
  );
  const futuresPositions = (portfolio?.futures?.positions || []).filter(
    (item) => Number(item.positionAmt || 0) !== 0,
  );

  return (
    <div className="space-y-6">
      {/* ── Futures positions ── */}
      <div className="space-y-3">
        <SectionHeader
          label="Futures Positions"
          hint={`${futuresPositions.length} open`}
        />

        {futuresPositions.length === 0 ? (
          <EmptyState
            icon="📈"
            title="No open futures positions"
            hint="Positions opened by AutoTrade will appear here in real time."
          />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2.5 lg:hidden">
              {futuresPositions.map((p) => {
                const long = Number(p.positionAmt || 0) > 0;
                const r = roe(p);
                return (
                  <Card key={p.symbol} hover>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <CoinLogo pair={p.symbol} size={32} />
                        <div>
                          <p className="font-mono text-sm font-semibold text-white">
                            {p.symbol}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <StatusBadge tone={long ? "good" : "bad"}>
                              {long ? "Long" : "Short"}
                            </StatusBadge>
                            <span className="font-mono text-[10px] text-text-muted">
                              {p.leverage}× {p.marginType}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-mono text-sm tabular-nums ${pnlColor(p.unrealizedProfit)}`}
                        >
                          {fmtNum(p.unrealizedProfit, 2)}
                        </p>
                        {r !== null ? (
                          <p
                            className={`font-mono text-[10px] tabular-nums ${pnlColor(p.unrealizedProfit)}`}
                          >
                            {r > 0 ? "+" : ""}
                            {r.toFixed(2)}%
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3">
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60">
                          Size
                        </p>
                        <p className="font-mono text-xs text-white/90 tabular-nums">
                          {fmtNum(p.positionAmt, 4)}
                        </p>
                      </div>
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60">
                          Entry
                        </p>
                        <p className="font-mono text-xs text-white/90 tabular-nums">
                          {fmtNum(p.entryPrice, 6)}
                        </p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Desktop table */}
            <Card padded={false} className="hidden lg:block">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {["Symbol", "Side", "Size", "Entry", "PnL", "ROE", "Leverage", "Margin"].map(
                        (h, i) => (
                          <th
                            key={h}
                            className={`px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/80 ${
                              i >= 2 && i <= 5 ? "text-right" : "text-left"
                            }`}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {futuresPositions.map((p) => {
                      const long = Number(p.positionAmt || 0) > 0;
                      const r = roe(p);
                      return (
                        <tr
                          key={p.symbol}
                          className="border-b border-white/[0.04] last:border-0 transition-colors hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <CoinLogo pair={p.symbol} size={26} />
                              <span className="font-mono font-medium text-white">
                                {p.symbol}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={long ? "good" : "bad"}>
                              {long ? "Long" : "Short"}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-white/90">
                            {fmtNum(p.positionAmt, 4)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-white/90">
                            {fmtNum(p.entryPrice, 6)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono tabular-nums ${pnlColor(p.unrealizedProfit)}`}
                          >
                            {fmtNum(p.unrealizedProfit, 2)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-mono tabular-nums ${pnlColor(p.unrealizedProfit)}`}
                          >
                            {r !== null ? `${r > 0 ? "+" : ""}${r.toFixed(2)}%` : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums text-white/80">
                            {p.leverage}×
                          </td>
                          <td className="px-4 py-3 font-mono text-white/80">
                            {p.marginType}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* ── Spot balances ── */}
      <div className="space-y-3">
        <SectionHeader
          label="Spot Balances"
          hint={`${spotBalances.length} asset${spotBalances.length === 1 ? "" : "s"}`}
        />

        {spotBalances.length === 0 ? (
          <EmptyState
            icon="💰"
            title="No funded spot balances"
            hint="Assets held in your Binance spot wallet will be listed here."
          />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2.5 lg:hidden">
              {spotBalances.map((b) => (
                <Card key={b.asset} hover>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <CoinLogo pair={`${b.asset}USDT`} size={32} />
                      <p className="font-mono text-sm font-semibold text-white">
                        {b.asset}
                      </p>
                    </div>
                    <p className="font-mono text-sm tabular-nums text-white/90">
                      {fmtNum(b.usdt, 2)} USDT
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/[0.06] pt-3">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60">
                        Free
                      </p>
                      <p className="font-mono text-xs text-white/90 tabular-nums">
                        {fmtNum(b.free, 6)}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60">
                        Locked
                      </p>
                      <p className="font-mono text-xs text-white/90 tabular-nums">
                        {fmtNum(b.locked, 6)}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Desktop table */}
            <Card padded={false} className="hidden lg:block">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      {["Asset", "Free", "Locked", "USDT Value"].map((h, i) => (
                        <th
                          key={h}
                          className={`px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/80 ${
                            i === 0 ? "text-left" : "text-right"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {spotBalances.map((b) => (
                      <tr
                        key={b.asset}
                        className="border-b border-white/[0.04] last:border-0 transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <CoinLogo pair={`${b.asset}USDT`} size={26} />
                            <span className="font-mono font-medium text-white">
                              {b.asset}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-white/90">
                          {fmtNum(b.free, 6)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-white/90">
                          {fmtNum(b.locked, 6)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-white/90">
                          {fmtNum(b.usdt, 2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
