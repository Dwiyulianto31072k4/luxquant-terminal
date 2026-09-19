// Agent · Connections
// Linked venue + unlink / switch / replace keys. One desk at a time.

import { useState } from "react";
import { checkExchangeKeys } from "../../services/autotradeApi";
import {
  Card,
  SectionHeader,
  StatusBadge,
  StatusDot,
  GoldButton,
  GhostButton,
  Notice,
  fmtDateTime,
} from "./AutoTradeUI";
import ExchangeRoadmap from "./ExchangeRoadmap";
import ExchangePicker from "./ExchangePicker";
import { EXCHANGE_VENUES, VenueLogo } from "./exchangeVenues";
import { pickLinkedAccount } from "./exchangeLinking";

function venueName(exchange) {
  return EXCHANGE_VENUES[exchange]?.name || exchange || "Exchange";
}

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
  config,
  onConnect,
  onSwitch,
  onUnlink,
  onRefresh,
}) {
  const [checking, setChecking] = useState("");
  const [checkError, setCheckError] = useState("");
  const [checkOk, setCheckOk] = useState("");

  const futuresValue = Number(portfolio?.futures?.portfolio_usdt || 0);
  const spotValue = Number(portfolio?.spot?.portfolio_usdt || 0);
  const liveOrders = Boolean(health?.live_orders_enabled);
  const primary =
    pickLinkedAccount(exchangeAccounts, config) ||
    exchangeAccounts.find((account) => account.key_status === "valid") ||
    exchangeAccounts[0];
  const primaryExchange = primary?.exchange || portfolio?.exchange || "binance";
  const primaryLabel = venueName(primaryExchange);
  const hasValidKey = exchangeAccounts.some((a) => a.key_status === "valid");
  const showWalletHint = hasValidKey && futuresValue === 0 && spotValue === 0;
  const engineOn = Boolean(config?.is_active);
  const isDryRun = config?.dry_run !== false;

  const revalidate = async (exchange) => {
    setChecking(exchange);
    setCheckError("");
    setCheckOk("");
    try {
      const result = await checkExchangeKeys(exchange);
      if (result?.valid) {
        setCheckOk(`${venueName(exchange)} accepted the key.`);
      } else {
        setCheckError(result?.message || `${venueName(exchange)} rejected the key.`);
      }
      await onRefresh?.();
    } catch (err) {
      setCheckError(err.message || `Could not check ${venueName(exchange)}`);
    } finally {
      setChecking("");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <VenueLogo venue={primaryExchange} className="h-12 w-12" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
                Exchange Connection
              </p>
              <h2 className="mt-1 text-xl font-semibold text-text-primary lg:text-2xl">
                {exchangeAccounts.length ? primaryLabel : "No exchange yet"}
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                Connected for {user?.email || "this LuxQuant account"} · one venue at a time
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
              <StatusDot tone={engineOn ? "good" : "neutral"}>
                {engineOn ? (isDryRun ? "Dry-run" : "Live") : "Paused"}
              </StatusDot>
            </div>
            {exchangeAccounts.length === 0 ? (
              <GoldButton onClick={() => onConnect?.(primaryExchange)}>Connect exchange</GoldButton>
            ) : (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <GhostButton tone="danger" onClick={() => onUnlink?.(primaryExchange)} className="w-full sm:w-auto">
                  Unlink {primaryLabel}
                </GhostButton>
              </div>
            )}
          </div>
        </div>

        {exchangeAccounts.length > 0 ? (
          <div className="mt-4 rounded-md border-l-2 border-accent/40 bg-accent/[0.06] py-2.5 pl-3 pr-4">
            <p className="text-sm leading-5 text-text-secondary">
              One venue at a time. To use another desk, tap{" "}
              <span className="font-medium text-text-primary">Unlink {primaryLabel}</span> first,
              then connect the next key. Connecting a second exchange without unlinking is blocked.
            </p>
          </div>
        ) : null}

        {showWalletHint ? (
          <div className="mt-4 rounded-md border-l-2 border-ink/15 bg-surface-secondary py-2.5 pl-3 pr-4">
            <p className="text-sm text-accent/85">
              Keys are valid but this wallet reads $0. Agent trades the{" "}
              <span className="font-medium text-accent">USDT-M Futures</span> wallet on{" "}
              {primaryLabel} — if your funds sit in Spot or Funding, transfer them there first.
            </p>
          </div>
        ) : null}
      </Card>

      <SectionHeader label="Linked Accounts" hint="Unlink before switching desks" />

      {checkError ? <Notice tone="error">{checkError}</Notice> : null}
      {checkOk ? <Notice tone="success">{checkOk}</Notice> : null}

      {exchangeAccounts.length === 0 ? (
        <ExchangePicker onPick={(id) => onConnect?.(id)} />
      ) : (
        <div className="space-y-3">
          {exchangeAccounts.map((account) => {
            const tone = keyStatusTone(account.key_status);
            const name = venueName(account.exchange);
            const activeHere = config?.exchange === account.exchange;
            return (
              <Card key={`${account.exchange}-${account.label || "default"}`}>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <VenueLogo venue={account.exchange} className="h-8 w-8" />
                        <span className="text-sm font-semibold text-text-primary">
                          {account.label || `Primary ${name} account`}
                        </span>
                        <StatusBadge tone="neutral">{name}</StatusBadge>
                        {activeHere ? (
                          <StatusBadge tone={engineOn ? "good" : "warn"}>
                            {engineOn ? "Running here" : "Paused here"}
                          </StatusBadge>
                        ) : null}
                      </div>
                      <p className="mt-1.5 font-mono text-[11px] text-text-muted">
                        API key {account.has_api_key ? "saved" : "missing"} · Secret{" "}
                        {account.has_api_secret ? "saved" : "missing"}
                        {account.has_passphrase ? " · passphrase saved" : ""}
                        {account.last_checked_at
                          ? ` · checked ${fmtDateTime(account.last_checked_at)}`
                          : ""}
                      </p>
                      {account.exchange === "binance" ? (
                        <p className="mt-1.5 text-[12px] leading-5 text-text-secondary">
                          IP-restricted keys need both{" "}
                          <span className="select-all font-mono text-text-primary">
                            187.127.135.84
                          </span>{" "}
                          and{" "}
                          <span className="select-all font-mono text-text-primary">
                            103.197.189.58
                          </span>
                          . Agent uses the second if the first is rate-limited.
                        </p>
                      ) : null}
                    </div>
                    <StatusDot tone={tone} pulse={tone === "good"}>
                      <span className="capitalize">{account.key_status || "unchecked"}</span>
                    </StatusDot>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <GhostButton
                      tone="danger"
                      onClick={() => onUnlink?.(account.exchange)}
                      className="w-full sm:w-auto"
                    >
                      Unlink {name}
                    </GhostButton>
                    <GhostButton
                      onClick={() => revalidate(account.exchange)}
                      disabled={checking === account.exchange}
                      className="w-full sm:w-auto"
                    >
                      {checking === account.exchange ? "Checking…" : "Revalidate"}
                    </GhostButton>
                    <GhostButton
                      onClick={() => onConnect?.(account.exchange)}
                      className="w-full sm:w-auto"
                    >
                      Replace keys
                    </GhostButton>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ExchangeRoadmap
        onConnect={(id) => {
          const current = primary?.exchange;
          if (current && current !== id) onSwitch?.(current, id);
          else onConnect?.(id);
        }}
        exclude={exchangeAccounts.map((account) => account.exchange)}
        linkedName={primaryLabel}
      />
    </div>
  );
}
