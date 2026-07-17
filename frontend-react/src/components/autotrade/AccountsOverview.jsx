// src/components/autotrade/AccountsOverview.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · Accounts tab
// Account identity + engine/health status + linked exchange keys.
// Balance figures live in the top PnLSummary strip; this panel is
// about WHO is connected and WHETHER the keys are healthy.
// ════════════════════════════════════════════════════════════════

import {
 Card,
 SectionHeader,
 StatusBadge,
 StatusDot,
 GoldButton,
 EmptyState,
 fmtDateTime,
} from "./AutoTradeUI";
import { BinanceIcon } from "./BrandIcons";

function keyStatusTone(status) {
 if (status === "valid") return "good";
 if (status === "invalid") return "bad";
 return "warn";
}

export default function AccountsOverview({
 user,
 health,
 exchangeAccounts = [],
 portfolio,
 onConnect,
}) {
 const futuresValue = Number(portfolio?.futures?.portfolio_usdt || 0);
 const spotValue = Number(portfolio?.spot?.portfolio_usdt || 0);
 const liveOrders = Boolean(health?.live_orders_enabled);

 // Wallet-context hint: keys valid but the relevant wallet reads zero.
 const hasValidKey = exchangeAccounts.some((a) => a.key_status === "valid");
 const showWalletHint =
 hasValidKey && futuresValue === 0 && spotValue === 0;

 return (
 <div className="space-y-4">
 {/* ── Connection summary ── */}
 <Card>
 <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
 <div className="flex min-w-0 items-start gap-4">
 <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-[#F3BA2F]/10 text-[#F3BA2F]">
 <BinanceIcon className="h-7 w-7" />
 </span>
 <div>
 <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#F3BA2F]">
 Exchange Connection
 </p>
 <h2 className="mt-1 text-xl font-semibold text-text-primary lg:text-2xl">
 Binance
 </h2>
 <p className="mt-1 text-xs text-text-muted">
 Connected for {user?.email || "this LuxQuant account"}
 </p>
 </div>
 </div>

 <div className="flex flex-col items-start gap-3 lg:items-end">
 <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
 <StatusDot tone={health?.ok ? "good" : "bad"} pulse={health?.ok}>
 {health?.ok ? "API healthy" : "API down"}
 </StatusDot>
 <StatusDot tone={liveOrders ? "good" : "warn"}>
 {liveOrders ? "Live engine ready" : "Live engine locked"}
 </StatusDot>
 {health?.binance_environment ? (
 <span className="text-xs text-text-muted">
 <span className="text-text-secondary capitalize">
 {health.binance_environment}
 </span>
 </span>
 ) : null}
 </div>
 <GoldButton onClick={onConnect}>
 {exchangeAccounts.length > 0 ? "Manage API keys" : "Connect Binance"}
 </GoldButton>
 </div>
 </div>

 {showWalletHint ? (
 <div className="mt-4 rounded-md border-l-2 border-ink/15 bg-surface-secondary py-2.5 pl-3 pr-4">
 <p className="text-sm text-accent/85">
 Keys are valid but this wallet reads $0. AutoTrade trades the{" "}
 <span className="font-medium text-accent">Futures</span>{" "}
 wallet — if your funds sit in Spot or Funding, transfer them to
 USD-M Futures in Binance to use them here.
 </p>
 </div>
 ) : null}
 </Card>

 {/* ── Linked exchange accounts ── */}
 <SectionHeader label="Linked Accounts" />

 {exchangeAccounts.length === 0 ? (
 <EmptyState
 icon="🔑"
 title="No exchange connected"
 hint="Save your Binance API keys to unlock portfolio, configuration, positions and execution history."
 action={
 <div className="mt-1">
 <GoldButton onClick={onConnect}>Connect Binance</GoldButton>
 </div>
 }
 />
 ) : (
 <div className="space-y-3">
 {exchangeAccounts.map((account) => {
 const tone = keyStatusTone(account.key_status);
 return (
 <Card
 key={`${account.exchange}-${account.label || "default"}`}
 hover
 >
 <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
 <div className="min-w-0">
 <div className="flex items-center gap-2">
 <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#F3BA2F]/10 text-[#F3BA2F]">
 <BinanceIcon className="h-5 w-5" />
 </span>
 <span className="text-sm font-semibold text-text-primary">
 {account.label || "Primary Binance account"}
 </span>
 <StatusBadge tone="neutral">
 {account.exchange}
 </StatusBadge>
 </div>
 <p className="mt-1.5 font-mono text-[11px] text-text-muted">
 API key {account.has_api_key ? "saved" : "missing"} ·
 Secret {account.has_api_secret ? "saved" : "missing"}
 {account.last_checked_at
 ? ` · checked ${fmtDateTime(account.last_checked_at)}`
 : ""}
 </p>
 </div>
 <div className="flex-shrink-0">
 <StatusDot tone={tone} pulse={tone === "good"}>
 <span className="capitalize">
 {account.key_status || "unchecked"}
 </span>
 </StatusDot>
 </div>
 </div>
 </Card>
 );
 })}
 </div>
 )}
 </div>
 );
}
