// src/components/autotrade/PositionsBoard.jsx
// AutoTrade-managed spot positions are intentionally separated from unrelated
// Binance wallet balances so users can see what the strategy actually owns.

import CoinLogo from "../CoinLogo";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  EmptyState,
  SectionHeader,
  StatusBadge,
  fmtDateTime,
  fmtNum,
  fmtPct,
  fmtUsd,
} from "./AutoTradeUI";

function pnlColor(value) {
  const n = Number(value || 0);
  if (n > 0) return "text-[#0ECB81]";
  if (n < 0) return "text-[#F6465D]";
  return "text-white/80";
}

function protectionTone(position) {
  if (position.protection_status === "protected") return "good";
  if (position.protection_status === "attention_required") return "bad";
  return "warn";
}

function protectionLabel(position) {
  if (position.protection_status === "protected") return "OCO protected";
  if (position.protection_status === "attention_required") return "Attention required";
  return "Protection unknown";
}

const CHART_COLORS = ["#d4a853", "#0ECB81", "#5B8DEF", "#F6465D", "#9B7EDE", "#27A7E7"];

function PortfolioCharts({ trackedSpot, manualSpot, futures }) {
  const allocation = [
    ...trackedSpot.map((position) => ({
      name: position.symbol.replace(/USDT$/, ""),
      value: Number(position.current_value_usdt || 0),
      source: "AutoTrade",
    })),
    ...manualSpot.map((balance) => ({
      name: balance.asset,
      value: Number(balance.usdt || 0),
      source: "Wallet",
    })),
  ]
    .filter((item) => item.value > 0.005)
    .sort((a, b) => b.value - a.value);

  const exposure = [
    ...trackedSpot.map((position) => ({
      symbol: position.symbol,
      pnl: Number(position.unrealized_pnl_usdt || 0),
    })),
    ...futures.map((position) => ({
      symbol: position.symbol,
      pnl: Number(position.unrealizedProfit || 0),
    })),
  ];

  if (allocation.length === 0 && exposure.length === 0) return null;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-primary">
            Wallet allocation
          </p>
          <p className="mt-1 text-xs text-text-muted">Current USDT value by asset, including cash.</p>
        </div>
        <div className="grid items-center gap-3 md:grid-cols-[1fr_180px]">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2}>
                  {allocation.map((item, index) => (
                    <Cell key={`${item.name}-${item.source}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => fmtUsd(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {allocation.slice(0, 6).map((item, index) => (
              <div key={`${item.name}-${item.source}`} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2 text-text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                  {item.name}
                </span>
                <span className="font-mono text-white">{fmtUsd(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-primary">
          Open-position PnL
        </p>
        <p className="mt-1 text-xs text-text-muted">Unrealized PnL by tracked AutoTrade position.</p>
        {exposure.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-sm text-text-muted">
            No open AutoTrade exposure
          </div>
        ) : (
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={exposure} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#848E9C", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="symbol" type="category" tick={{ fill: "#848E9C", fontSize: 10 }} axisLine={false} tickLine={false} width={74} />
                <Tooltip formatter={(value) => fmtUsd(value)} />
                <Bar dataKey="pnl" radius={[0, 3, 3, 0]}>
                  {exposure.map((item) => <Cell key={item.symbol} fill={item.pnl >= 0 ? "#0ECB81" : "#F6465D"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}

function SpotPositionCard({ position }) {
  return (
    <Card hover>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CoinLogo pair={position.symbol} size={34} />
          <div>
            <p className="font-mono text-sm font-semibold text-white">
              {position.symbol}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusBadge tone="info">AutoTrade</StatusBadge>
              <StatusBadge tone={protectionTone(position)}>
                {protectionLabel(position)}
              </StatusBadge>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-mono text-sm tabular-nums ${pnlColor(position.unrealized_pnl_usdt)}`}>
            {fmtUsd(position.unrealized_pnl_usdt)}
          </p>
          <p className={`font-mono text-[10px] tabular-nums ${pnlColor(position.unrealized_pnl_usdt)}`}>
            {fmtPct(position.unrealized_pnl_pct)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.06] pt-3">
        <Metric label="Quantity" value={fmtNum(position.quantity, 8)} />
        <Metric label="Value" value={fmtUsd(position.current_value_usdt)} />
        <Metric label="Entry" value={fmtNum(position.entry_price, 8)} />
        <Metric label="Current" value={fmtNum(position.current_price, 8)} />
        <Metric label="Take profit" value={fmtNum(position.take_profit, 8)} tone="good" />
        <Metric label="Stop loss" value={fmtNum(position.stop_loss, 8)} tone="bad" />
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-white/[0.06] pt-3 font-mono text-[9px] text-text-muted">
        <span>OCO {position.oco_order_list_id || "not recorded"}</span>
        <span>Synced {fmtDateTime(position.last_synced_at)}</span>
      </div>
    </Card>
  );
}

function Metric({ label, value, tone = "neutral" }) {
  const tones = {
    good: "text-[#0ECB81]",
    bad: "text-[#F6465D]",
    neutral: "text-white/90",
  };
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted/60">
        {label}
      </p>
      <p className={`font-mono text-xs tabular-nums ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function SpotPositionsTable({ positions }) {
  return (
    <Card padded={false} className="hidden lg:block">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {[
                "Symbol",
                "Status",
                "Quantity",
                "Entry",
                "Current",
                "TP / SL",
                "PnL",
                "OCO",
                "Last sync",
              ].map((heading, index) => (
                <th
                  key={heading}
                  className={`px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted/80 ${
                    index >= 2 && index <= 6 ? "text-right" : "text-left"
                  }`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => (
              <tr
                key={position.id}
                className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <CoinLogo pair={position.symbol} size={27} />
                    <div>
                      <p className="font-mono font-medium text-white">{position.symbol}</p>
                      <p className="font-mono text-[9px] text-text-muted">AutoTrade spot</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge tone={protectionTone(position)}>
                    {protectionLabel(position)}
                  </StatusBadge>
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-white/90">
                  {fmtNum(position.quantity, 8)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-white/90">
                  {fmtNum(position.entry_price, 8)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-white/90">
                  {fmtNum(position.current_price, 8)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-[11px] tabular-nums">
                  <span className="text-[#0ECB81]">{fmtNum(position.take_profit, 8)}</span>
                  <span className="px-1 text-text-muted">/</span>
                  <span className="text-[#F6465D]">{fmtNum(position.stop_loss, 8)}</span>
                </td>
                <td className={`px-4 py-3 text-right font-mono tabular-nums ${pnlColor(position.unrealized_pnl_usdt)}`}>
                  <p>{fmtUsd(position.unrealized_pnl_usdt)}</p>
                  <p className="text-[10px]">{fmtPct(position.unrealized_pnl_pct)}</p>
                </td>
                <td className="px-4 py-3 font-mono text-[10px] text-white/75">
                  {position.oco_order_list_id || "—"}
                </td>
                <td className="px-4 py-3 font-mono text-[10px] text-text-muted">
                  {fmtDateTime(position.last_synced_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FuturesPositions({ positions }) {
  if (positions.length === 0) {
    return (
      <EmptyState
        icon="F"
        title="No open futures positions"
        hint="Futures positions opened by AutoTrade will appear here."
      />
    );
  }
  return (
    <Card padded={false}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Symbol", "Side", "Size", "Entry", "PnL", "Leverage", "Margin"].map((heading, index) => (
                <th
                  key={heading}
                  className={`px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/80 ${
                    index >= 2 && index <= 4 ? "text-right" : "text-left"
                  }`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => {
              const long = Number(position.positionAmt || 0) > 0;
              return (
                <tr key={position.symbol} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-4 py-3 font-mono text-white">{position.symbol}</td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={long ? "good" : "bad"}>{long ? "Long" : "Short"}</StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white/90">{fmtNum(position.positionAmt, 6)}</td>
                  <td className="px-4 py-3 text-right font-mono text-white/90">{fmtNum(position.entryPrice, 8)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${pnlColor(position.unrealizedProfit)}`}>
                    {fmtUsd(position.unrealizedProfit)}
                  </td>
                  <td className="px-4 py-3 font-mono text-white/80">{position.leverage}x</td>
                  <td className="px-4 py-3 font-mono text-white/80">{position.marginType}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ManualBalances({ balances }) {
  if (balances.length === 0) {
    return (
      <EmptyState
        icon="$"
        title="No other spot balances"
        hint="Balances managed by AutoTrade are listed above."
      />
    );
  }
  return (
    <Card padded={false}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Asset", "Source", "Free", "Locked", "USDT Value"].map((heading, index) => (
                <th
                  key={heading}
                  className={`px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/80 ${
                    index < 2 ? "text-left" : "text-right"
                  }`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {balances.map((balance) => (
              <tr key={balance.asset} className="border-b border-white/[0.04] last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <CoinLogo pair={`${balance.asset}USDT`} size={26} />
                    <span className="font-mono font-medium text-white">{balance.asset}</span>
                  </div>
                </td>
                <td className="px-4 py-3"><StatusBadge tone="neutral">Wallet / manual</StatusBadge></td>
                <td className="px-4 py-3 text-right font-mono text-white/90">{fmtNum(balance.free, 8)}</td>
                <td className="px-4 py-3 text-right font-mono text-white/90">{fmtNum(balance.locked, 8)}</td>
                <td className="px-4 py-3 text-right font-mono text-white/90">{fmtUsd(balance.usdt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function PositionsBoard({ portfolio }) {
  const trackedSpot = portfolio?.spot?.tracked_positions || [];
  const manualSpot = portfolio?.spot?.manual_balances || portfolio?.spot?.balances || [];
  const futures = (portfolio?.futures?.positions || []).filter(
    (position) => Number(position.positionAmt || 0) !== 0,
  );

  return (
    <div className="space-y-7">
      <PortfolioCharts trackedSpot={trackedSpot} manualSpot={manualSpot} futures={futures} />

      <section className="space-y-3">
        <SectionHeader label="AutoTrade Spot Positions" hint={`${trackedSpot.length} open`} />
        {trackedSpot.length === 0 ? (
          <EmptyState
            icon="AT"
            title="No tracked spot positions"
            hint="Live spot entries created by AutoTrade will appear here with their OCO protection."
          />
        ) : (
          <>
            <div className="space-y-2.5 lg:hidden">
              {trackedSpot.map((position) => (
                <SpotPositionCard key={position.id} position={position} />
              ))}
            </div>
            <SpotPositionsTable positions={trackedSpot} />
          </>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader label="Futures Positions" hint={`${futures.length} open`} />
        <FuturesPositions positions={futures} />
      </section>

      <section className="space-y-3">
        <SectionHeader
          label="Other Spot Balances"
          hint={`${manualSpot.length} asset${manualSpot.length === 1 ? "" : "s"}`}
        />
        <ManualBalances balances={manualSpot} />
      </section>
    </div>
  );
}
