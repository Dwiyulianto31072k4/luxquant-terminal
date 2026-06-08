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

function SectionHeader({ label }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-8 bg-gold-primary/40" />
      <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-gold-primary/80">
        {label}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/20 to-transparent" />
    </div>
  );
}

function EngineStatusStrip({ health, config }) {
  if (!health) return null;

  const active = Boolean(config?.is_active);

  return (
    <div
      className={`rounded-md border px-4 py-3 ${
        active
          ? "border-emerald-500/20 bg-emerald-500/[0.04]"
          : "border-gold-primary/20 bg-gold-primary/[0.04]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono uppercase tracking-[0.15em]">
        <span className={active ? "text-emerald-400" : "text-gold-primary"}>
          Strategy {active ? "Active" : "Paused"}
        </span>
        <span className="text-text-muted">Mode {health.trading_mode || "-"}</span>
        <span className="text-text-muted">
          Binance {health.binance_environment || "-"}
        </span>
        <span className="text-text-muted">
          Market {health.market_data_market || "-"}
        </span>
      </div>
    </div>
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
    <div className="rounded-md border border-gold-primary/20 bg-gold-primary/[0.04] p-6">
      <div className="max-w-2xl space-y-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-gold-primary">
          AutoTrade Setup
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
        <p className="text-sm leading-6 text-text-muted">{body}</p>
        <button
          onClick={onAction}
          disabled={disabled}
          className="rounded-md px-4 py-2 text-[11px] font-mono uppercase tracking-[0.2em] text-black disabled:opacity-40"
          style={{
            background:
              "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
          }}
        >
          {actionLabel}
        </button>
      </div>
    </div>
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
              ? "AutoTrade access is not ready yet. LuxQuant must return `cryptobot_token` at login or expose `/me/cryptobot-token` for this account."
              : message || "Unable to connect this LuxQuant account to Cryptobot right now.",
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
    if (!hasExchangeAccount) return "Connect your Binance account to unlock AutoTrade";

    const totalAccounts = exchangeAccounts.length;
    const totalExecutions = executions.length;
    return `${totalAccounts} exchange${totalAccounts === 1 ? "" : "s"} connected • ${totalExecutions} execution jobs`;
  }, [exchangeAccounts.length, executions.length, hasAutotradeToken, hasExchangeAccount]);

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

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            AutoTrade
          </h1>
          <p className="mt-1.5 text-sm font-mono text-text-muted">{summaryText}</p>
        </div>

        {hasAutotradeToken ? (
          <button
            onClick={() => setShowConnect(true)}
            className="rounded-md px-4 py-2 text-[11px] font-mono uppercase tracking-[0.2em] text-black"
            style={{
              background:
                "linear-gradient(135deg, #f0d890 0%, #d4a853 50%, #b88a3e 100%)",
            }}
          >
            {hasExchangeAccount ? "Update Binance" : "Connect Binance"}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/25 bg-red-500/[0.05] p-3 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {!hasAutotradeToken ? (
        <SetupCard
          title="Connect AutoTrade access"
          body="AutoTrade now uses the LuxQuant to Cryptobot exchange flow. LuxQuant provides a short-lived signed token, then Cryptobot returns the bearer token used for AutoTrade API calls."
          actionLabel={authActionLoading ? "Connecting..." : "Connect Cryptobot"}
          onAction={handleAuthorizeAutotrade}
          disabled={authActionLoading}
        />
      ) : loading ? (
        <LoadingState />
      ) : !hasExchangeAccount ? (
        <SetupCard
          title="Connect Binance before using AutoTrade"
          body="Your AutoTrade Google login is complete, but exchange credentials are required first. After Binance keys are saved and validated, portfolio, configuration, positions, and execution history will unlock."
          actionLabel="Connect Binance"
          onAction={() => setShowConnect(true)}
        />
      ) : (
        <>
          <EngineStatusStrip health={health} config={strategyConfig} />

          <PnLSummary portfolio={portfolio} executions={executions} />

          <div className="flex items-center gap-1 border-b border-white/[0.06]">
            {TABS.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`relative px-4 py-2.5 text-[11px] font-mono uppercase tracking-[0.15em] ${
                    active ? "text-gold-primary" : "text-text-muted hover:text-white"
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

            {tab === "positions" ? <PositionsBoard portfolio={portfolio} /> : null}

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
