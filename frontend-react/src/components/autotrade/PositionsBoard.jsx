function fmtNum(value, digits = 4) {
  const amount = Number(value || 0);
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function EmptyState({ title }) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-6 text-center text-sm text-text-muted">
      {title}
    </div>
  );
}

function TableCard({ title, subtitle, columns, rows, renderRow, emptyTitle }) {
  return (
    <div className="overflow-hidden rounded-md border border-white/[0.06] bg-[#0a0805]">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-1 text-xs text-text-muted">{subtitle}</p>
      </div>

      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState title={emptyTitle} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-black/20">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    className="px-4 py-3 text-left text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted/80"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{rows.map(renderRow)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PositionsBoard({ portfolio }) {
  const spotBalances = (portfolio?.spot?.balances || []).filter(
    (item) => Number(item.free || 0) > 0 || Number(item.locked || 0) > 0,
  );
  const futuresPositions = (portfolio?.futures?.positions || []).filter(
    (item) => Number(item.positionAmt || 0) !== 0,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-px w-8 bg-gold-primary/40" />
        <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-gold-primary/80">
          Portfolio Positions
        </span>
      </div>

      <TableCard
        title="Spot balances"
        subtitle="`GET /me/portfolio` returns balances, not per-trade spot position records."
        columns={["Asset", "Free", "Locked", "USDT Value"]}
        rows={spotBalances}
        emptyTitle="No funded spot balances."
        renderRow={(balance) => (
          <tr
            key={balance.asset}
            className="border-t border-white/[0.06] text-white/90"
          >
            <td className="px-4 py-3 font-mono">{balance.asset}</td>
            <td className="px-4 py-3 font-mono">{fmtNum(balance.free, 6)}</td>
            <td className="px-4 py-3 font-mono">{fmtNum(balance.locked, 6)}</td>
            <td className="px-4 py-3 font-mono">{fmtNum(balance.usdt, 2)}</td>
          </tr>
        )}
      />

      <TableCard
        title="Futures positions"
        subtitle="Live leveraged positions reported by Binance."
        columns={[
          "Symbol",
          "Size",
          "Entry",
          "PnL",
          "Leverage",
          "Margin",
        ]}
        rows={futuresPositions}
        emptyTitle="No open futures positions."
        renderRow={(position) => (
          <tr
            key={position.symbol}
            className="border-t border-white/[0.06] text-white/90"
          >
            <td className="px-4 py-3 font-mono">{position.symbol}</td>
            <td className="px-4 py-3 font-mono">{fmtNum(position.positionAmt, 4)}</td>
            <td className="px-4 py-3 font-mono">{fmtNum(position.entryPrice, 6)}</td>
            <td
              className={`px-4 py-3 font-mono ${
                Number(position.unrealizedProfit || 0) >= 0
                  ? "text-emerald-400"
                  : "text-red-400"
              }`}
            >
              {fmtNum(position.unrealizedProfit, 4)}
            </td>
            <td className="px-4 py-3 font-mono">{position.leverage}x</td>
            <td className="px-4 py-3 font-mono">{position.marginType}</td>
          </tr>
        )}
      />
    </div>
  );
}
