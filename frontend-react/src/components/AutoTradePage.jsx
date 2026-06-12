// src/components/AutoTradePage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade page shell
// Auth/load logic preserved verbatim; header, engine strip, tabs
// and setup states restyled to match the terminal design language.
// ════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AUTOTRADE_TOKEN_KEY,
  CRYPTOBOT_TOKEN_KEY,
  LUXQUANT_CRYPTOBOT_TOKEN_KEY,
  clearAutotradeAuth,
  exchangeLuxquantToken,
  getExecutions,
  getActivityLogs,
  getAlertStatus,
  getHealth,
  getMe,
  getPortfolio,
  getTradeHistory,
  getSignals,
  getStrategyConfigs,
  setBinanceStrategyActive,
  updateBinanceStrategyConfig,
} from "../services/autotradeApi";
import { authApi } from "../services/authApi";

import ExchangeConnectModal from "./autotrade/ExchangeConnectModal";
import AutoTradeSettings from "./autotrade/AutoTradeSettings";
import PositionsBoard from "./autotrade/PositionsBoard";
import SignalsQueue from "./autotrade/SignalsQueue";
import SignalQueue from "./autotrade/SignalQueue";
import PnLSummary from "./autotrade/PnLSummary";
import TradeHistoryCalendar from "./autotrade/TradeHistoryCalendar";
import ActivityLogs from "./autotrade/ActivityLogs";
import {
  BinanceIcon,
  TelegramIcon,
  SettingsIcon,
} from "./autotrade/BrandIcons";
import {
  Card,
  SectionHeader,
  StatusBadge,
  StatusDot,
  GhostButton,
  GoldButton,
  Notice,
} from "./autotrade/AutoTradeUI";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "positions", label: "Positions" },
  { id: "trades", label: "Trade History" },
  { id: "history", label: "Activity" },
  { id: "logs", label: "Logs" },
  { id: "signals", label: "Signals" },
  { id: "settings", label: "Settings" },
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

function AutoTradeControlCenter({
  health,
  config,
  exchangeAccounts,
  onChanged,
  onConfigure,
  onManageAccount,
}) {
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState("");
  if (!health || !config) return null;

  const active = Boolean(config?.is_active);
  const globalLive = Boolean(health.live_orders_enabled);
  const accountValid = exchangeAccounts.some(
    (account) =>
      account.exchange === "binance" && account.key_status === "valid",
  );
  const marketLabel = [
    config.spot_enabled ? "Spot" : "",
    config.futures_enabled ? "Futures" : "",
  ]
    .filter(Boolean)
    .join(" + ");

  let state = {
    eyebrow: "BOT PAUSED",
    title: "AutoTrade is not processing new entries",
    description:
      "Your configuration is saved. Start the bot when you want it to process incoming signals.",
    tone: "warn",
    panel: "border-gold-primary/25 bg-gold-primary/[0.035]",
  };
  if (active && globalLive) {
    state = {
      eyebrow: "LIVE TRADING",
      title: "AutoTrade can place real Binance orders",
      description:
        "Risk limits and your saved strategy are enforced before every live entry.",
      tone: "good",
      panel: "border-[#0ECB81]/35 bg-[#0ECB81]/[0.045]",
    };
  } else if (!globalLive) {
    state = {
      eyebrow: "LIVE ENGINE LOCKED",
      title: "AutoTrade cannot start live trading yet",
      description:
        "The server-wide live order switch is disabled. Your strategy remains saved and no new orders can be placed.",
      tone: "warn",
      panel: "border-gold-primary/25 bg-gold-primary/[0.035]",
    };
  }

  const liveConfigPayload = {
    spot_enabled: Boolean(config.spot_enabled),
    futures_enabled: Boolean(config.futures_enabled),
    is_active: false,
    dry_run: false,
    sizing_method: config.sizing?.method || "fixed",
    sizing_value: Number(config.sizing?.value || 0),
    tp_source: config.tp?.source || "signal_level",
    tp_level: Number(config.tp?.level || 1),
    tp_custom_pct: config.tp?.custom_pct ?? null,
    sl_source: config.sl?.source || "signal_level",
    sl_level: Number(config.sl?.level || 1),
    sl_custom_pct: config.sl?.custom_pct ?? null,
    exit_mode: config.exit?.mode || "fixed_sl",
    trailing_callback_rate: config.exit?.trailing_callback_rate ?? null,
    leverage: config.futures_enabled
      ? Number(config.futures?.leverage || 1)
      : null,
    margin_mode: config.futures_enabled
      ? config.futures?.margin_mode || "isolated"
      : null,
    allowed_risk_levels: config.allowed_risk_levels?.length
      ? config.allowed_risk_levels
      : null,
    one_open_position_per_symbol:
      config.risk_limits?.one_open_position_per_symbol ?? true,
    max_open_positions: Number(config.risk_limits?.max_open_positions ?? 3),
    max_daily_trades: Number(config.risk_limits?.max_daily_trades ?? 5),
    max_trade_notional_usdt: Number(
      config.risk_limits?.max_trade_notional_usdt ?? 10,
    ),
    min_available_usdt: Number(config.risk_limits?.min_available_usdt ?? 5),
    daily_loss_limit_usdt: Number(
      config.risk_limits?.daily_loss_limit_usdt ?? 10,
    ),
    cooldown_after_loss_minutes: Number(
      config.risk_limits?.cooldown_after_loss_minutes ?? 60,
    ),
    cooldown_after_error_minutes: Number(
      config.risk_limits?.cooldown_after_error_minutes ?? 15,
    ),
  };

  const toggle = async () => {
    if (!active) {
      const confirmed = window.confirm(
        "Start LIVE AutoTrade? New matching signals may place real Binance orders.",
      );
      if (!confirmed) return;
    }
    setWorking(true);
    setActionError("");
    try {
      if (!active && config.dry_run !== false) {
        await updateBinanceStrategyConfig(liveConfigPayload);
      }
      await setBinanceStrategyActive(!active);
      await onChanged?.();
    } catch (err) {
      setActionError(err.message || "Failed to change AutoTrade status");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className={`rounded-md border p-4 lg:p-5 ${state.panel}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className={`mt-1 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border ${
              active
                ? state.tone === "good"
                  ? "border-[#0ECB81]/35 bg-[#0ECB81]/10 text-[#0ECB81]"
                  : "border-[#5B8DEF]/35 bg-[#5B8DEF]/10 text-[#7da4ff]"
                : "border-gold-primary/30 bg-gold-primary/10 text-gold-primary"
            }`}
          >
            <BinanceIcon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-text-muted">
                AutoTrade Engine
              </p>
              <StatusBadge tone={state.tone}>{state.eyebrow}</StatusBadge>
            </div>
            <h2 className="mt-1.5 text-lg font-semibold text-white">
              {state.title}
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-text-muted">
              {state.description}
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-wrap gap-2">
          <GhostButton onClick={onConfigure}>
            <span className="inline-flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              Settings
            </span>
          </GhostButton>
          <GoldButton
            onClick={toggle}
            disabled={working || !accountValid}
          >
            {working
              ? "Updating…"
              : active
                ? "Pause AutoTrade"
                : "Start AutoTrade"}
          </GoldButton>
        </div>
      </div>

      <div className="mt-4 grid gap-2 border-t border-white/[0.07] pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <button type="button" onClick={onManageAccount} className="text-left">
          <StatusDot tone={accountValid ? "good" : "bad"}>
            Binance {accountValid ? "connected" : "needs attention"}
          </StatusDot>
        </button>
        <StatusDot tone={active ? "good" : "neutral"}>
          Strategy {active ? "enabled" : "paused"}
        </StatusDot>
        <StatusDot tone={globalLive ? "good" : "warn"}>
          Orders {globalLive ? "live enabled" : "live locked"}
        </StatusDot>
        <StatusDot tone={marketLabel ? "good" : "bad"}>
          Market {marketLabel || "disabled"}
        </StatusDot>
      </div>

      {actionError ? (
        <div className="mt-4">
          <Notice tone="error">{actionError}</Notice>
        </div>
      ) : null}
    </div>
  );
}

function AutoTradeOverview({
  portfolio,
  executions,
  tradeSummary,
  exchangeAccounts,
  alertStatus,
  config,
  onOpenSettings,
}) {
  const binance = exchangeAccounts.find(
    (account) => account.exchange === "binance",
  );
  const telegram = alertStatus?.telegram || {};
  const alertsEnabled = alertStatus?.preferences?.enabled !== false;

  return (
    <div className="space-y-5">
      <PnLSummary
        portfolio={portfolio}
        executions={executions}
        tradeSummary={tradeSummary}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card hover className="border-[#F3BA2F]/20">
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#F3BA2F]/10 text-[#F3BA2F]">
              <BinanceIcon className="h-6 w-6" />
            </span>
            <StatusBadge tone={binance?.key_status === "valid" ? "good" : "warn"}>
              {binance?.key_status === "valid" ? "Connected" : "Check required"}
            </StatusBadge>
          </div>
          <h3 className="mt-4 text-base font-semibold text-white">
            {binance?.label || "Binance account"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            API credentials, permissions and account validation.
          </p>
          <button
            type="button"
            onClick={() => onOpenSettings("connections")}
            className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[#F3BA2F] hover:text-[#ffd75e]"
          >
            Manage connection →
          </button>
        </Card>

        <Card hover className="border-[#229ED9]/20">
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#229ED9]/10 text-[#229ED9]">
              <TelegramIcon className="h-6 w-6" />
            </span>
            <StatusBadge
              tone={telegram.linked && alertsEnabled ? "good" : "warn"}
            >
              {telegram.linked
                ? alertsEnabled
                  ? "Alerts on"
                  : "Alerts off"
                : "Not linked"}
            </StatusBadge>
          </div>
          <h3 className="mt-4 text-base font-semibold text-white">
            Telegram notifications
          </h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {telegram.linked
              ? `Delivering to @${telegram.username || "linked account"}.`
              : "Link Telegram to receive execution and risk alerts."}
          </p>
          <button
            type="button"
            onClick={() => onOpenSettings("notifications")}
            className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[#42b7ee] hover:text-[#78cef5]"
          >
            Notification settings →
          </button>
        </Card>

        <Card hover>
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gold-primary/10 text-gold-primary">
              <SettingsIcon className="h-5 w-5" />
            </span>
            <StatusBadge tone="good">Live rules</StatusBadge>
          </div>
          <h3 className="mt-4 text-base font-semibold text-white">
            Trading policy
          </h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {config?.spot_enabled ? "Spot" : ""}
            {config?.spot_enabled && config?.futures_enabled ? " + " : ""}
            {config?.futures_enabled ? "Futures" : ""} ·{" "}
            {config?.sizing?.method === "fixed"
              ? `${config?.sizing?.value || 0} USDT`
              : `${config?.sizing?.value || 0}%`}{" "}
            per trade
          </p>
          <button
            type="button"
            onClick={() => onOpenSettings("strategy")}
            className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-gold-primary hover:text-gold-light"
          >
            Review trading rules →
          </button>
        </Card>
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
  const [tab, setTab] = useState("overview");
  const [settingsSection, setSettingsSection] = useState("strategy");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authActionLoading, setAuthActionLoading] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [health, setHealth] = useState(null);
  const [meData, setMeData] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [tradeHistory, setTradeHistory] = useState({ items: [], summary: {} });
  const [executions, setExecutions] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [signalsById, setSignalsById] = useState({});
  const [strategyConfig, setStrategyConfig] = useState(null);
  const [alertStatus, setAlertStatus] = useState(null);
  const [alertStatusError, setAlertStatusError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [hasAutotradeToken, setHasAutotradeToken] = useState(
    Boolean(getStoredAutotradeToken()),
  );
  const identityRefreshAttempted = useRef(false);

  const exchangeAccounts = meData?.exchange_accounts || [];
  const hasExchangeAccount = exchangeAccounts.length > 0;
  const liveExecutions = useMemo(
    () => executions.filter((execution) => execution.dry_run !== true),
    [executions],
  );

  const resetAutotradeData = () => {
    setMeData(null);
    setPortfolio(null);
    setTradeHistory({ items: [], summary: {} });
    setStrategyConfig(null);
    setExecutions([]);
    setActivityLogs([]);
    setSignalsById({});
    setAlertStatus(null);
    setAlertStatusError("");
  };

  const getLuxquantCryptobotToken = async ({ fresh = false } = {}) => {
    const storedToken = localStorage.getItem(LUXQUANT_CRYPTOBOT_TOKEN_KEY);
    if (storedToken && !fresh) return storedToken;
    const response = await authApi.getCryptobotToken();
    return resolveLuxquantCryptobotToken(response);
  };

  const ensureAutotradeAccess = async ({ refreshIdentity = false } = {}) => {
    if (getStoredAutotradeToken() && !refreshIdentity) return true;
    const luxquantToken = await getLuxquantCryptobotToken({
      fresh: refreshIdentity,
    });
    if (!luxquantToken) {
      throw new Error("LuxQuant did not return a Cryptobot exchange token");
    }
    await exchangeLuxquantToken(luxquantToken);
    localStorage.removeItem(LUXQUANT_CRYPTOBOT_TOKEN_KEY);
    return true;
  };

  const load = async ({ background = false } = {}) => {
    setError("");
    if (!background) setLoading(true);
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
      } else if (!identityRefreshAttempted.current) {
        identityRefreshAttempted.current = true;
        try {
          await ensureAutotradeAccess({ refreshIdentity: true });
        } catch (identityError) {
          console.warn("AutoTrade identity refresh failed:", identityError);
        }
      }

      const meResponse = await getMe();
      const connectedAccounts = meResponse?.exchange_accounts || [];
      setMeData(meResponse);

      if (connectedAccounts.length === 0) {
        setPortfolio(null);
        setTradeHistory({ items: [], summary: {} });
        setStrategyConfig(null);
        setExecutions([]);
        setActivityLogs([]);
        setSignalsById({});
        setTab("settings");
        setSettingsSection("connections");
        setLastUpdatedAt(new Date());
        return;
      }

      const alertRequest = getAlertStatus()
        .then((data) => ({ data, error: "" }))
        .catch((alertError) => ({
          data: null,
          error: alertError?.message || "Failed to load Telegram alert status",
        }));
      const [
        portfolioResponse,
        strategyResponse,
        executionsResponse,
        activityLogsResponse,
        signalsResponse,
        alertResult,
        tradeHistoryResponse,
      ] = await Promise.all([
        getPortfolio(),
        getStrategyConfigs(),
        getExecutions(),
        getActivityLogs(),
        getSignals(),
        alertRequest,
        getTradeHistory(),
      ]);

      setPortfolio(portfolioResponse);
      setTradeHistory(tradeHistoryResponse || { items: [], summary: {} });
      setStrategyConfig(strategyResponse?.items?.[0] || null);
      setExecutions(executionsResponse?.items || []);
      setActivityLogs(activityLogsResponse?.items || []);
      setAlertStatus(alertResult.data);
      setAlertStatusError(alertResult.error);
      setSignalsById(
        Object.fromEntries(
          (signalsResponse?.items || []).map((signal) => [signal.id, signal]),
        ),
      );
      setLastUpdatedAt(new Date());
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
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [hasAutotradeToken]);

  useEffect(() => {
    if (!hasAutotradeToken) return undefined;
    const refresh = () => {
      if (document.visibilityState === "visible") {
        load({ background: true });
      }
    };
    const interval = window.setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
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
    const totalExecutions = liveExecutions.length;
    return `${totalAccounts} exchange${totalAccounts === 1 ? "" : "s"} connected · ${totalExecutions} execution job${totalExecutions === 1 ? "" : "s"}`;
  }, [
    exchangeAccounts.length,
    liveExecutions.length,
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

  const openSettings = (section = "strategy") => {
    setSettingsSection(section);
    setTab("settings");
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8">
      <SectionHeader label="AutoTrade" />

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            AutoTrade
          </h1>
          <p className="mt-1.5 font-mono text-sm text-text-muted">
            {summaryText}
          </p>
        </div>
        {lastUpdatedAt ? (
          <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
            Auto-refresh 30s · Updated{" "}
            {lastUpdatedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
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
          <AutoTradeControlCenter
            health={health}
            config={strategyConfig}
            exchangeAccounts={exchangeAccounts}
            onChanged={() => load({ background: true })}
            onConfigure={() => openSettings("strategy")}
            onManageAccount={() => openSettings("connections")}
          />

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
            {tab === "overview" ? (
              <AutoTradeOverview
                portfolio={portfolio}
                executions={liveExecutions}
                tradeSummary={tradeHistory.summary}
                exchangeAccounts={exchangeAccounts}
                alertStatus={alertStatus}
                config={strategyConfig}
                onOpenSettings={openSettings}
              />
            ) : null}

            {tab === "settings" ? (
              <AutoTradeSettings
                section={settingsSection}
                onSectionChange={setSettingsSection}
                config={strategyConfig}
                hasConnectedAccount={hasExchangeAccount}
                onSaved={load}
                user={meData?.user || null}
                health={health}
                exchangeAccounts={exchangeAccounts}
                portfolio={portfolio}
                onConnect={() => setShowConnect(true)}
                alertStatus={alertStatus}
                alertStatusError={alertStatusError}
                onAlertUpdated={(updated) => {
                  if (updated) setAlertStatus(updated);
                  else load({ background: true });
                }}
              />
            ) : null}

            {tab === "positions" ? (
              <PositionsBoard portfolio={portfolio} onChanged={() => load({ background: true })} />
            ) : null}

            {tab === "trades" ? (
              <TradeHistoryCalendar history={tradeHistory} />
            ) : null}

            {tab === "history" ? (
              <SignalsQueue
                executions={liveExecutions}
                signalsById={signalsById}
                onRetried={load}
              />
            ) : null}

            {tab === "signals" ? <SignalQueue /> : null}

            {tab === "logs" ? <ActivityLogs items={activityLogs} /> : null}
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
