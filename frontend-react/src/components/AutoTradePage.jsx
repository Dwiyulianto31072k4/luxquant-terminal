// src/components/AutoTradePage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade page shell
// Auth/load logic preserved verbatim; header, engine strip, tabs
// and setup states restyled to match the terminal design language.
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import {
  AUTOTRADE_TOKEN_KEY,
  CRYPTOBOT_TOKEN_KEY,
  LUXQUANT_CRYPTOBOT_TOKEN_KEY,
  clearAutotradeAuth,
  exchangeLuxquantToken,
  getExecutions,
  getHealth,
  getMe,
  getPortfolio,
  getSignals,
  getStrategyConfigs,
} from "../services/autotradeApi";
import { authApi } from "../services/authApi";

import ExchangeConnectModal from "./autotrade/ExchangeConnectModal";
import AccountsOverview from "./autotrade/AccountsOverview";
import ConfigurationStudio from "./autotrade/ConfigurationStudio";
import PositionsBoard from "./autotrade/PositionsBoard";
import SignalsQueue from "./autotrade/SignalsQueue";
import SignalQueue from "./autotrade/SignalQueue";
import PnLSummary from "./autotrade/PnLSummary";
import {
  Card,
  SectionHeader,
  StatusBadge,
  GoldButton,
  Notice,
} from "./autotrade/AutoTradeUI";

const TABS = [
  { id: "accounts", label: "Accounts" },
  { id: "config", label: "Configure" },
  { id: "positions", label: "Positions" },
  { id: "history", label: "Executions" },
  { id: "signals", label: "Signals" },
];

function getStoredAutotradeToken() {
  return (
    localStorage.getItem(AUTOTRADE_TOKEN_KEY) ||
    localStorage.getItem(CRYPTOBOT_TOKEN_KEY)
  );
}

function resolveLuxquantCryptobotToken(payload) {
  if (typeof payload === "string") return payload;
  return (
    payload?.cryptobot_token ||
    payload?.token ||
    payload?.luxquant_token ||
    payload?.jwt ||
    ""
  );
}

// ── Engine status strip ──
function EngineStatusStrip({ health, config }) {
  if (!health) return null;
  const active = Boolean(config?.is_active);
  const live = Boolean(health.live_orders_enabled);

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center gap-2 p-3">
        <StatusBadge tone={active ? "good" : "warn"} dot={active}>
          {active ? "Strategy active" : "Strategy paused"}
        </StatusBadge>
        <StatusBadge tone={live ? "good" : "warn"}>
          {live ? "Live orders" : `Mode ${health.trading_mode || "dry_run"}`}
        </StatusBadge>
        {health.binance_environment ? (
          <StatusBadge tone="info">
            Binance {health.binance_environment}
          </StatusBadge>
        ) : null}
        {health.market_data_market ? (
          <StatusBadge tone="neutral">
            {health.market_data_market}
          </StatusBadge>
        ) : null}
      </div>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="rounded-md border border-white/[0.06] bg-[#0a0805] p-5"
        >
          <div className="h-3 w-24 animate-pulse rounded bg-white/[0.05]" />
          <div className="mt-4 h-8 w-2/3 animate-pulse rounded bg-white/[0.06]" />
          <div className="mt-3 h-16 animate-pulse rounded bg-white/[0.03]" />
        </div>
      ))}
    </div>
  );
}

function SetupCard({ title, body, actionLabel, onAction, disabled = false }) {
  return (
    <Card className="border-gold-primary/20 bg-gold-primary/[0.03]">
      <div className="max-w-2xl space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary">
          AutoTrade Setup
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-white">
          {title}
        </h2>
        <p className="text-sm leading-6 text-text-muted">{body}</p>
        <div className="pt-1">
          <GoldButton onClick={onAction} disabled={disabled}>
            {actionLabel}
          </GoldButton>
        </div>
      </div>
    </Card>
  );
}

export default function AutoTradePage() {
  const [tab, setTab] = useState("accounts");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authActionLoading, setAuthActionLoading] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [health, setHealth] = useState(null);
  const [meData, setMeData] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [signalsById, setSignalsById] = useState({});
  const [strategyConfig, setStrategyConfig] = useState(null);
  const [hasAutotradeToken, setHasAutotradeToken] = useState(
    Boolean(getStoredAutotradeToken()),
  );

  const exchangeAccounts = meData?.exchange_accounts || [];
  const hasExchangeAccount = exchangeAccounts.length > 0;

  const resetAutotradeData = () => {
    setMeData(null);
    setPortfolio(null);
    setStrategyConfig(null);
    setExecutions([]);
    setSignalsById({});
  };

  const getLuxquantCryptobotToken = async () => {
    const storedToken = localStorage.getItem(LUXQUANT_CRYPTOBOT_TOKEN_KEY);
    if (storedToken) return storedToken;
    const response = await authApi.getCryptobotToken();
    return resolveLuxquantCryptobotToken(response);
  };

  const ensureAutotradeAccess = async () => {
    if (getStoredAutotradeToken()) return true;
    const luxquantToken = await getLuxquantCryptobotToken();
    if (!luxquantToken) {
      throw new Error("LuxQuant did not return a Cryptobot exchange token");
    }
    await exchangeLuxquantToken(luxquantToken);
    localStorage.removeItem(LUXQUANT_CRYPTOBOT_TOKEN_KEY);
    return true;
  };

  const load = async () => {
    setError("");
    setLoading(true);
    try {
      const healthResponse = await getHealth();
      setHealth(healthResponse);

      let tokenReady = hasAutotradeToken;
      if (!tokenReady) {
        try {
          tokenReady = await ensureAutotradeAccess();
          setHasAutotradeToken(tokenReady);
        } catch (authErr) {
          const message = authErr?.message || "";
          resetAutotradeData();
          setError(
            /404|not found/i.test(message)
              ? "AutoTrade access is not ready yet. Try logging out and back in to refresh your Cryptobot access token."
              : message ||
                  "Unable to connect this LuxQuant account to Cryptobot right now.",
          );
          return;
        }
      }

      const meResponse = await getMe();
      const connectedAccounts = meResponse?.exchange_accounts || [];
      setMeData(meResponse);

      if (connectedAccounts.length === 0) {
        setPortfolio(null);
        setStrategyConfig(null);
        setExecutions([]);
        setSignalsById({});
        setTab("accounts");
        return;
      }

      const [
        portfolioResponse,
        strategyResponse,
        executionsResponse,
        signalsResponse,
      ] = await Promise.all([
        getPortfolio(),
        getStrategyConfigs(),
        getExecutions(),
        getSignals(),
      ]);

      setPortfolio(portfolioResponse);
      setStrategyConfig(strategyResponse?.items?.[0] || null);
      setExecutions(executionsResponse?.items || []);
      setSignalsById(
        Object.fromEntries(
          (signalsResponse?.items || []).map((signal) => [signal.id, signal]),
        ),
      );
    } catch (err) {
      const unauthorized = /401|unauthorized|forbidden|invalid token/i.test(
        err?.message || "",
      );
      if (unauthorized) {
        clearAutotradeAuth();
        setHasAutotradeToken(false);
        resetAutotradeData();
        setError("");
      } else {
        setError(err.message || "Failed to load AutoTrade data");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [hasAutotradeToken]);

  useEffect(() => {
    if (!loading && hasAutotradeToken && !hasExchangeAccount) {
      setShowConnect(true);
    }
  }, [hasAutotradeToken, hasExchangeAccount, loading]);

  const summaryText = useMemo(() => {
    if (!hasAutotradeToken) return "Cryptobot access required";
    if (!hasExchangeAccount)
      return "Connect your Binance account to unlock AutoTrade";
    const totalAccounts = exchangeAccounts.length;
    const totalExecutions = executions.length;
    return `${totalAccounts} exchange${totalAccounts === 1 ? "" : "s"} connected · ${totalExecutions} execution job${totalExecutions === 1 ? "" : "s"}`;
  }, [
    exchangeAccounts.length,
    executions.length,
    hasAutotradeToken,
    hasExchangeAccount,
  ]);

  const handleAuthorizeAutotrade = async () => {
    setAuthActionLoading(true);
    setError("");
    try {
      const tokenReady = await ensureAutotradeAccess();
      setHasAutotradeToken(tokenReady);
      await load();
    } catch (err) {
      setError(
        err?.message ||
          "Unable to connect this LuxQuant account to Cryptobot right now.",
      );
    } finally {
      setAuthActionLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8">
      <SectionHeader label="AutoTrade" />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            AutoTrade
          </h1>
          <p className="mt-1.5 font-mono text-sm text-text-muted">
            {summaryText}
          </p>
        </div>
        {hasAutotradeToken ? (
          <GoldButton onClick={() => setShowConnect(true)}>
            {hasExchangeAccount ? "Update Binance" : "Connect Binance"}
          </GoldButton>
        ) : null}
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {!hasAutotradeToken ? (
        <SetupCard
          title="Connect AutoTrade access"
          body="AutoTrade links your LuxQuant account to the execution engine using a secure one-time token exchange. No password or exchange keys are shared in this step."
          actionLabel={authActionLoading ? "Connecting…" : "Connect AutoTrade"}
          onAction={handleAuthorizeAutotrade}
          disabled={authActionLoading}
        />
      ) : loading ? (
        <LoadingState />
      ) : !hasExchangeAccount ? (
        <SetupCard
          title="Connect Binance before using AutoTrade"
          body="Your AutoTrade access is ready, but exchange credentials are required first. After your Binance keys are saved and validated, portfolio, configuration, positions and execution history unlock."
          actionLabel="Connect Binance"
          onAction={() => setShowConnect(true)}
        />
      ) : (
        <>
          <EngineStatusStrip health={health} config={strategyConfig} />

          <PnLSummary portfolio={portfolio} executions={executions} />

          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-white/[0.06]">
            {TABS.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`relative whitespace-nowrap px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.15em] transition-colors ${
                    active
                      ? "text-gold-primary"
                      : "text-text-muted hover:text-white"
                  }`}
                >
                  {item.label}
                  {active ? (
                    <span className="absolute inset-x-2 bottom-0 h-px bg-gold-primary" />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="pt-2">
            {tab === "accounts" ? (
              <AccountsOverview
                user={meData?.user || null}
                health={health}
                exchangeAccounts={exchangeAccounts}
                portfolio={portfolio}
                onConnect={() => setShowConnect(true)}
              />
            ) : null}

            {tab === "config" ? (
              <ConfigurationStudio
                config={strategyConfig}
                hasConnectedAccount={hasExchangeAccount}
                onSaved={load}
              />
            ) : null}

            {tab === "positions" ? (
              <PositionsBoard portfolio={portfolio} />
            ) : null}

            {tab === "history" ? (
              <SignalsQueue
                executions={executions}
                signalsById={signalsById}
                onRetried={load}
              />
            ) : null}

            {tab === "signals" ? <SignalQueue /> : null}
          </div>
        </>
      )}

      <ExchangeConnectModal
        isOpen={showConnect && hasAutotradeToken}
        onClose={() => setShowConnect(false)}
        onSuccess={load}
      />
    </div>
  );
}
