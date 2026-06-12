// src/components/autotrade/PositionsBoard.jsx
// AutoTrade-managed spot positions are intentionally separated from unrelated
// Binance wallet balances so users can see what the strategy actually owns.

import { useState } from "react";
import CoinLogo from "../CoinLogo";
import SignalModal from "../SignalModal";
import {
  convertSpotAssetsToUsdt,
  forceSellAllSpotPositions,
  forceSellSpotPosition,
} from "../../services/autotradeApi";
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

function firstValue(values) {
  return Array.isArray(values) && values.length ? values[0] : null;
}

function signalModalPayload(position) {
  const signal = position.signal;
  if (!signal?.luxquant_signal_id) return null;
  return {
    signal_id: signal.luxquant_signal_id,
    pair: signal.symbol || position.symbol,
    entry: firstValue(signal.entries) || position.entry_price,
    target1: signal.tps?.[0],
    target2: signal.tps?.[1],
    target3: signal.tps?.[2],
    target4: signal.tps?.[3],
    stop_loss: signal.sls?.[0],
    risk_level: signal.risk_level,
    created_at: signal.created_at,
    status: "OPEN",
  };
}

function distancePct(current, target) {
  const price = Number(current || 0);
  const level = Number(target || 0);
  if (!price || !level) return null;
  return ((level - price) / price) * 100;
}

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

function EmergencyButton({ children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-[#F6465D]/35 bg-[#F6465D]/10 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#ff7a8b] transition hover:bg-[#F6465D]/20 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SpotPositionCard({ position, onOpen, onForceSell, busy }) {
  return (
    <Card hover>
      <button type="button" className="block w-full text-left" onClick={() => onOpen(position)}>
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
          <Metric label="Invested" value={fmtUsd(position.entry_notional_usdt)} />
          <Metric label="Value now" value={fmtUsd(position.current_value_usdt)} />
          <Metric label="Entry" value={fmtNum(position.entry_price, 8)} />
          <Metric label="Current" value={fmtNum(position.current_price, 8)} />
          <Metric label="Take profit" value={fmtNum(position.take_profit, 8)} tone="good" />
          <Metric label="Stop loss" value={fmtNum(position.stop_loss, 8)} tone="bad" />
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-white/[0.06] pt-3 font-mono text-[9px] text-text-muted">
          <span>Click for signal and execution detail</span>
          <span>Synced {fmtDateTime(position.last_synced_at)}</span>
        </div>
      </button>
      <div className="mt-3 flex justify-end border-t border-white/[0.06] pt-3">
        <EmergencyButton disabled={busy} onClick={() => onForceSell(position)}>
          Force sell
        </EmergencyButton>
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

function SpotPositionsTable({ positions, onOpen, onForceSell, busy }) {
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
                "Invested",
                "Value now",
                "Entry / Current",
                "TP / SL",
                "PnL",
                "Last sync",
                "Emergency",
              ].map((heading, index) => (
                <th
                  key={heading}
                  className={`px-4 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted/80 ${
                    index >= 2 && index <= 7 ? "text-right" : "text-left"
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
                role="button"
                tabIndex={0}
                onClick={() => onOpen(position)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onOpen(position);
                }}
                className="cursor-pointer border-b border-white/[0.04] last:border-0 hover:bg-white/[0.035] focus:bg-white/[0.035] focus:outline-none"
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
                  {fmtUsd(position.entry_notional_usdt)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-white/90">
                  {fmtUsd(position.current_value_usdt)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-[10px] tabular-nums text-white/90">
                  <p>{fmtNum(position.entry_price, 8)}</p>
                  <p className="text-text-muted">{fmtNum(position.current_price, 8)}</p>
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
                <td className="px-4 py-3 font-mono text-[10px] text-text-muted">
                  {fmtDateTime(position.last_synced_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <EmergencyButton
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      onForceSell(position);
                    }}
                  >
                    Force sell
                  </EmergencyButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DetailRow({ label, value, tone = "" }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] py-2.5 last:border-0">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`max-w-[65%] text-right font-mono text-xs text-white/90 ${tone}`}>{value ?? "—"}</span>
    </div>
  );
}

function DetailPanel({ title, children }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] p-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-gold-primary">{title}</p>
      {children}
    </div>
  );
}

function PositionDetailModal({ position, onClose, onOpenSignal, onForceSell, busy }) {
  if (!position) return null;
  const signal = position.signal || {};
  const execution = position.execution || {};
  const config = execution.config_snapshot || {};
  const tpDistance = distancePct(position.current_price, position.take_profit);
  const slDistance = distancePct(position.current_price, position.stop_loss);
  const canOpenSignal = Boolean(signal.luxquant_signal_id);

  return (
    <div className="fixed inset-0 z-[100000] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center py-8">
        <div className="w-full max-w-5xl overflow-hidden rounded-xl border border-white/[0.09] bg-[#0a0805] shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] p-5">
            <div className="flex items-center gap-3">
              <CoinLogo pair={position.symbol} size={42} />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-mono text-lg font-semibold text-white">{position.symbol}</h3>
                  <StatusBadge tone={protectionTone(position)}>{protectionLabel(position)}</StatusBadge>
                  <StatusBadge tone="info">Live spot</StatusBadge>
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  Signal called {fmtDateTime(signal.created_at)} · executed {fmtDateTime(position.executed_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <EmergencyButton disabled={busy} onClick={() => onForceSell(position)}>
                Force sell
              </EmergencyButton>
              <button
                type="button"
                disabled={!canOpenSignal}
                onClick={() => onOpenSignal(position)}
                className="rounded-md border border-gold-primary/30 bg-gold-primary/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.15em] text-gold-primary hover:bg-gold-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Open full signal
              </button>
              <button type="button" onClick={onClose} className="h-9 w-9 rounded-full text-text-muted hover:bg-white/[0.06] hover:text-white">×</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px border-b border-white/[0.06] bg-white/[0.04] md:grid-cols-4">
            <div className="bg-[#0a0805] p-4"><Metric label="Capital at entry" value={fmtUsd(position.entry_notional_usdt)} /></div>
            <div className="bg-[#0a0805] p-4"><Metric label="Value now" value={fmtUsd(position.current_value_usdt)} /></div>
            <div className="bg-[#0a0805] p-4"><Metric label="Quantity" value={fmtNum(position.quantity, 8)} /></div>
            <div className="bg-[#0a0805] p-4"><Metric label="Unrealized PnL" value={`${fmtUsd(position.unrealized_pnl_usdt)} · ${fmtPct(position.unrealized_pnl_pct)}`} tone={Number(position.unrealized_pnl_usdt) >= 0 ? "good" : "bad"} /></div>
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-2">
            <DetailPanel title="Current condition">
              <DetailRow label="Entry price" value={fmtNum(position.entry_price, 8)} />
              <DetailRow label="Current price" value={fmtNum(position.current_price, 8)} />
              <DetailRow label="Take profit" value={`${fmtNum(position.take_profit, 8)}${tpDistance === null ? "" : ` · ${fmtPct(tpDistance)} away`}`} tone="text-[#0ECB81]" />
              <DetailRow label="Stop loss" value={`${fmtNum(position.stop_loss, 8)}${slDistance === null ? "" : ` · ${fmtPct(slDistance)} away`}`} tone="text-[#F6465D]" />
              <DetailRow label="OCO list" value={position.oco_order_list_id || "Not recorded"} />
              <DetailRow label="Last exchange sync" value={fmtDateTime(position.last_synced_at)} />
            </DetailPanel>

            <DetailPanel title="Signal snapshot">
              <DetailRow label="Signal time" value={fmtDateTime(signal.created_at)} />
              <DetailRow label="Side / risk" value={`${signal.side || position.side || "—"} · ${signal.risk_level || "—"}`} />
              <DetailRow label="Entry levels" value={(signal.entries || []).map((value) => fmtNum(value, 8)).join(", ") || "—"} />
              <DetailRow label="Take-profit levels" value={(signal.tps || []).map((value) => fmtNum(value, 8)).join(", ") || "—"} />
              <DetailRow label="Stop-loss levels" value={(signal.sls || []).map((value) => fmtNum(value, 8)).join(", ") || "—"} />
              <DetailRow label="Signal ID" value={signal.luxquant_signal_id || signal.id || "Unavailable"} />
            </DetailPanel>

            <DetailPanel title="Execution">
              <DetailRow label="Execution time" value={fmtDateTime(position.executed_at)} />
              <DetailRow label="Job status" value={execution.status || "—"} />
              <DetailRow label="Binance order" value={position.entry_order?.exchange_order_id || "—"} />
              <DetailRow label="Filled quantity" value={fmtNum(position.entry_order?.executed_quantity || position.initial_quantity, 8)} />
              <DetailRow label="Average fill" value={fmtNum(position.entry_order?.average_price || position.entry_price, 8)} />
              <DetailRow label="Mode" value={execution.dry_run ? "Simulation" : "Live"} />
            </DetailPanel>

            <DetailPanel title="Strategy used">
              <DetailRow label="Sizing" value={`${config.spot_sizing_method || config.sizing_method || "—"} ${config.spot_sizing_value ?? config.sizing_value ?? ""}`} />
              <DetailRow label="TP level" value={`TP${config.spot_tp_level ?? config.tp_level ?? "—"}`} />
              <DetailRow label="SL level" value={`SL${config.spot_sl_level ?? config.sl_level ?? "—"}`} />
              <DetailRow label="Exit mode" value={config.spot_exit_mode || config.exit_mode || position.exit_mode || "—"} />
              <DetailRow label="Protection" value={protectionLabel(position)} />
              <DetailRow label="Monitoring" value="Auto-refreshes with the AutoTrade dashboard" />
            </DetailPanel>
          </div>
        </div>
      </div>
    </div>
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

function ManualBalances({ balances, selectedAssets, onToggleAsset, busy }) {
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
              {["", "Asset", "Source", "Free", "Locked", "USDT Value"].map((heading, index) => (
                <th
                  key={heading}
                  className={`px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted/80 ${
                    index < 3 ? "text-left" : "text-right"
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
                  {balance.asset !== "USDT" ? (
                    <input
                      type="checkbox"
                      disabled={busy || Number(balance.free || 0) <= 0}
                      checked={selectedAssets.includes(balance.asset)}
                      onChange={() => onToggleAsset(balance.asset)}
                      className="accent-gold-primary"
                      aria-label={`Select ${balance.asset}`}
                    />
                  ) : null}
                </td>
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

function DangerConfirmModal({ action, onClose, onConfirm, busy }) {
  const [confirmation, setConfirmation] = useState("");
  if (!action) return null;
  const matches = confirmation.trim().toUpperCase() === action.phrase;
  return (
    <div className="fixed inset-0 z-[100010] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-[#F6465D]/30 bg-[#0a0805] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#F6465D]">Irreversible exchange action</p>
        <h3 className="mt-2 text-xl font-semibold text-white">{action.title}</h3>
        <p className="mt-2 text-sm leading-6 text-text-muted">{action.description}</p>
        <div className="mt-4 rounded-lg border border-[#F6465D]/20 bg-[#F6465D]/5 p-3 text-xs leading-5 text-[#ff9aa7]">
          AutoTrade will be paused before this operation. Market execution can have slippage, and failed items may require manual reconciliation.
        </div>
        <label className="mt-4 block text-xs text-text-muted">
          Type <span className="font-mono text-white">{action.phrase}</span> to confirm
          <input
            autoFocus
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="mt-2 w-full rounded-md border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-[#F6465D]/50"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-md border border-white/10 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted hover:text-white">
            Cancel
          </button>
          <EmergencyButton disabled={!matches || busy} onClick={() => onConfirm(confirmation)}>
            {busy ? "Processing…" : action.confirmLabel}
          </EmergencyButton>
        </div>
      </div>
    </div>
  );
}

export default function PositionsBoard({ portfolio, onChanged }) {
  const [selectedPositionId, setSelectedPositionId] = useState(null);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [openingSignal, setOpeningSignal] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [dangerAction, setDangerAction] = useState(null);
  const [operationBusy, setOperationBusy] = useState(false);
  const [operationMessage, setOperationMessage] = useState("");
  const trackedSpot = portfolio?.spot?.tracked_positions || [];
  const selectedPosition = trackedSpot.find((position) => position.id === selectedPositionId) || null;
  const manualSpot = portfolio?.spot?.manual_balances || portfolio?.spot?.balances || [];
  const futures = (portfolio?.futures?.positions || []).filter(
    (position) => Number(position.positionAmt || 0) !== 0,
  );
  const convertibleAssets = manualSpot
    .filter((balance) => balance.asset !== "USDT" && Number(balance.free || 0) > 0)
    .map((balance) => balance.asset);

  const toggleAsset = (asset) => {
    setSelectedAssets((current) =>
      current.includes(asset)
        ? current.filter((item) => item !== asset)
        : [...current, asset],
    );
  };

  const runDangerAction = async (confirmation) => {
    if (!dangerAction) return;
    setOperationBusy(true);
    setOperationMessage("");
    try {
      let result;
      if (dangerAction.kind === "position") {
        result = await forceSellSpotPosition(dangerAction.position.id, {
          confirmation,
          reason: "Emergency force sell requested from AutoTrade Positions",
        });
        setOperationMessage(`${result.symbol} sold for approximately ${fmtUsd(result.received_usdt)}.`);
      } else if (dangerAction.kind === "all-positions") {
        result = await forceSellAllSpotPositions({
          confirmation,
          reason: "Emergency sell all requested from AutoTrade Positions",
        });
        const completed = (result.items || []).filter((item) => item.ok).length;
        const failed = (result.items || []).length - completed;
        setOperationMessage(`Emergency close finished: ${completed} sold, ${failed} need attention.`);
      } else {
        result = await convertSpotAssetsToUsdt({
          confirmation,
          assets: selectedAssets,
        });
        const completed = (result.items || []).filter((item) => item.status === "submitted").length;
        const failed = (result.items || []).length - completed;
        setOperationMessage(`Conversion submitted: ${completed} asset${completed === 1 ? "" : "s"}, ${failed} skipped or failed.`);
        setSelectedAssets([]);
      }
      setDangerAction(null);
      await onChanged?.();
    } catch (error) {
      setOperationMessage(error?.message || "The emergency operation failed.");
    } finally {
      setOperationBusy(false);
    }
  };

  const openFullSignal = async (position) => {
    const partial = signalModalPayload(position);
    if (!partial) return;
    setOpeningSignal(true);
    try {
      const token = localStorage.getItem("access_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await fetch(`/api/v1/signals/detail/${partial.signal_id}`, { headers });
      setSelectedSignal(response.ok ? { ...partial, ...(await response.json()) } : partial);
      setSelectedPositionId(null);
    } catch {
      setSelectedSignal(partial);
      setSelectedPositionId(null);
    } finally {
      setOpeningSignal(false);
    }
  };

  return (
    <div className="space-y-7">
      {operationMessage ? (
        <div className="rounded-lg border border-gold-primary/20 bg-gold-primary/[0.05] px-4 py-3 text-sm text-gold-primary">
          {operationMessage}
        </div>
      ) : null}
      <PortfolioCharts trackedSpot={trackedSpot} manualSpot={manualSpot} futures={futures} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader label="AutoTrade Spot Positions" hint={`${trackedSpot.length} open`} />
          {trackedSpot.length > 0 ? (
            <EmergencyButton
              disabled={operationBusy}
              onClick={() => setDangerAction({
                kind: "all-positions",
                phrase: "SELL ALL",
                title: "Emergency sell every AutoTrade spot position?",
                description: `This cancels protection and submits market sells for ${trackedSpot.length} tracked position${trackedSpot.length === 1 ? "" : "s"}.`,
                confirmLabel: "Sell all now",
              })}
            >
              Emergency sell all
            </EmergencyButton>
          ) : null}
        </div>
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
                <SpotPositionCard
                  key={position.id}
                  position={position}
                  busy={operationBusy}
                  onOpen={(item) => setSelectedPositionId(item.id)}
                  onForceSell={(item) => setDangerAction({
                    kind: "position",
                    position: item,
                    phrase: item.symbol.toUpperCase(),
                    title: `Force sell ${item.symbol}?`,
                    description: "Its OCO protection will be cancelled first, then the available tracked quantity will be sold at market.",
                    confirmLabel: "Force sell now",
                  })}
                />
              ))}
            </div>
            <SpotPositionsTable
              positions={trackedSpot}
              busy={operationBusy}
              onOpen={(item) => setSelectedPositionId(item.id)}
              onForceSell={(item) => setDangerAction({
                kind: "position",
                position: item,
                phrase: item.symbol.toUpperCase(),
                title: `Force sell ${item.symbol}?`,
                description: "Its OCO protection will be cancelled first, then the available tracked quantity will be sold at market.",
                confirmLabel: "Force sell now",
              })}
            />
          </>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader label="Futures Positions" hint={`${futures.length} open`} />
        <FuturesPositions positions={futures} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHeader
            label="Other Spot Balances"
            hint={`${manualSpot.length} asset${manualSpot.length === 1 ? "" : "s"}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            {convertibleAssets.length > 0 ? (
              <button
                type="button"
                disabled={operationBusy}
                onClick={() => setSelectedAssets(
                  selectedAssets.length === convertibleAssets.length ? [] : convertibleAssets,
                )}
                className="rounded-md border border-white/10 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted hover:text-white"
              >
                {selectedAssets.length === convertibleAssets.length ? "Clear selection" : "Select all assets"}
              </button>
            ) : null}
            <EmergencyButton
              disabled={operationBusy || selectedAssets.length === 0}
              onClick={() => setDangerAction({
                kind: "convert",
                phrase: "CONVERT TO USDT",
                title: `Convert ${selectedAssets.length} wallet asset${selectedAssets.length === 1 ? "" : "s"} to USDT?`,
                description: `Binance Convert quotes will be requested for: ${selectedAssets.join(", ")}. Unsupported or below-minimum assets will be reported separately.`,
                confirmLabel: "Convert selected",
              })}
            >
              Convert selected to USDT
            </EmergencyButton>
          </div>
        </div>
        <ManualBalances
          balances={manualSpot}
          selectedAssets={selectedAssets}
          onToggleAsset={toggleAsset}
          busy={operationBusy}
        />
      </section>

      <PositionDetailModal
        position={selectedPosition}
        onClose={() => setSelectedPositionId(null)}
        onOpenSignal={openFullSignal}
        busy={operationBusy}
        onForceSell={(item) => setDangerAction({
          kind: "position",
          position: item,
          phrase: item.symbol.toUpperCase(),
          title: `Force sell ${item.symbol}?`,
          description: "Its OCO protection will be cancelled first, then the available tracked quantity will be sold at market.",
          confirmLabel: "Force sell now",
        })}
      />
      <DangerConfirmModal
        action={dangerAction}
        busy={operationBusy}
        onClose={() => {
          if (!operationBusy) setDangerAction(null);
        }}
        onConfirm={runDangerAction}
      />
      {openingSignal && (
        <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/70 font-mono text-xs uppercase tracking-[0.16em] text-gold-primary">
          Loading full signal…
        </div>
      )}
      <SignalModal
        signal={selectedSignal}
        isOpen={!!selectedSignal}
        onClose={() => setSelectedSignal(null)}
      />
    </div>
  );
}
