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
  GoldButton,
  EmptyState,
  fmtDateTime,
} from "./AutoTradeUI";

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
      {/* ── Account identity + status ── */}
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold-primary/80">
              Account
            </p>
            <h2 className="mt-2 truncate text-xl font-semibold text-white lg:text-2xl">
              {user?.email || "Connected user"}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone="neutral">
                {user?.role || "user"}
              </StatusBadge>
              <span className="font-mono text-[11px] text-text-muted">
                {exchangeAccounts.length} exchange
                {exchangeAccounts.length === 1 ? "" : "s"} linked
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={health?.ok ? "good" : "bad"} dot>
              {health?.ok ? "API healthy" : "API down"}
            </StatusBadge>
            <StatusBadge tone={liveOrders ? "good" : "warn"}>
              {liveOrders ? "Live orders" : "Dry run"}
            </StatusBadge>
            {health?.binance_environment ? (
              <StatusBadge tone="info">
                {health.binance_environment}
              </StatusBadge>
            ) : null}
            <GoldButton onClick={onConnect}>
              {exchangeAccounts.length > 0 ? "Update keys" : "Connect Binance"}
            </GoldButton>
          </div>
        </div>

        {showWalletHint ? (
          <div className="mt-4 rounded-md border border-gold-primary/20 bg-gold-primary/[0.04] p-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-gold-primary mb-1">
              Wallet check
            </p>
            <p className="text-sm text-gold-primary/80">
              Your keys are valid but this wallet reads $0. AutoTrade trades the{" "}
              <span className="font-semibold">Futures</span> wallet — if your
              funds sit in Spot or Funding, transfer them to USD-M Futures in
              Binance to make them available here.
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
                      <span className="text-sm font-semibold text-white">
                        {account.label || "Binance account"}
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
                    <StatusBadge tone={tone} dot={tone === "good"}>
                      {account.key_status || "unchecked"}
                    </StatusBadge>
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
