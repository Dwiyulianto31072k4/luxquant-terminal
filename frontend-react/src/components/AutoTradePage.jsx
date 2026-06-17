// src/components/AutoTradePage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade page shell
// Auth/load logic preserved verbatim; header, engine strip, tabs
// and setup states restyled to match the terminal design language.
// Activity + Logs are merged into a single compact Activity tab.
//
// Tabs follow the AWS Cloudscape "details page with tabs" pattern:
// a always-visible summary (engine strip) + self-contained task tabs,
// rendered as a single scrollable underline strip (Material spec):
// active tab auto-scrolls into view, scroll-snap, edge-fade hints.
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
import ActivityTimeline from "./autotrade/ActivityTimeline";
import SignalQueue from "./autotrade/SignalQueue";
import PnLSummary from "./autotrade/PnLSummary";
import TradeHistoryCalendar from "./autotrade/TradeHistoryCalendar";
import AutoTradeHelpModal from "./autotrade/AutoTradeHelpModal";
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
  { id: "signals", label: "Signals" },
  { id: "settings", label: "Settings" },
];

// ════════════════════════════════════════════════════════════════
// TabStrip — scrollable underline tabs (Cloudscape + Material spec)
//   • single horizontal row, never wraps
//   • active tab auto-scrolls into view (mobile-safe)
//   • scroll-snap + hidden scrollbar + left/right edge-fade hints
// ════════════════════════════════════════════════════════════════
function TabStrip({ tabs, value, onChange }) {
  const scrollerRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const updateEdges = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setEdges({
      left: scrollLeft > 2,
      right: scrollLeft + clientWidth < scrollWidth - 2,
    });
  };

  useEffect(() => {
    updateEdges();
    const el = scrollerRef.current;
    if (!el) return undefined;
    el.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  }, [tabs.length]);

  // keep the active tab visible whenever it changes
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const active = el.querySelector('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [value]);

  return (
    <div className="relative">
      {/* edge fades — only when there is more to scroll */}
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-8 transition-opacity duration-200 ${
          edges.left ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "linear-gradient(to right, #0a0506, transparent)" }}
      />
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-8 transition-opacity duration-200 ${
          edges.right ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "linear-gradient(to left, #0a0506, transparent)" }}
      />

      <div
        ref={scrollerRef}
        role="tablist"
        aria-label="AutoTrade sections"
        className="flex items-stretch gap-1 overflow-x-auto border-b border-white/[0.06] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch" }}
      >
        {tabs.map((item) => {
          const active = value === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-active={active}
              onClick={() => onChange(item.id)}
              style={{ scrollSnapAlign: "center" }}
              className={`relative shrink-0 whitespace-nowrap px-4 py-3 font-mono text-[11px] uppercase tracking-[0.15em] transition-colors ${
                active ? "text-gold-primary" : "text-text-muted hover:text-white"
              }`}
            >
              {item.label}
              {active ? (
                <span
                  className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-gold-primary"
                  style={{ boxShadow: "0 0 8px rgba(212,168,83,0.5)" }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SideNav — vertical section nav (Azure resource-menu pattern).
//   Desktop only; mobile uses the horizontal TabStrip instead.
//   Active item: gold pill + left rail accent (matches Performance Hub).
// ════════════════════════════════════════════════════════════════
function SideNav({ tabs, value, onChange }) {
  return (
    <nav className="sticky top-20 space-y-0.5" aria-label="AutoTrade sections">
      <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted/60">
        Sections
      </p>
      {tabs.map((item) => {
        const on = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={on ? "page" : undefined}
            className={`group relative w-full rounded-md px-3 py-2 text-left transition-colors ${
              on ? "" : "hover:bg-white/[0.03]"
            }`}
            style={on ? { background: "rgba(212,168,83,0.10)" } : undefined}
          >
            {on ? (
              <span
                className="absolute -left-[9px] top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full"
                style={{ background: "#d4a853", boxShadow: "0 0 6px rgba(212,168,83,0.6)" }}
              />
            ) : null}
            <span
              className={`font-mono text-[11px] uppercase tracking-[0.15em] transition-colors ${
                on ? "" : "text-text-muted group-hover:text-white"
              }`}
              style={on ? { color: "#ecd6a3" } : undefined}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

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
  const [showHelp, setShowHelp] = useState(false);
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
        <div className="flex items-center gap-3">
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
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="Open AutoTrade guide"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.08] text-text-muted transition-colors hover:border-gold-primary/30 hover:bg-gold-primary/[0.05] hover:text-gold-primary"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
          </button>
        </div>
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

          {/* Desktop: vertical side nav · Mobile: scrollable strip */}
          <div className="flex gap-6 lg:gap-8">
            <aside className="hidden lg:block w-48 flex-shrink-0">
              <SideNav tabs={TABS} value={tab} onChange={setTab} />
            </aside>
            <div className="min-w-0 flex-1">
              <div className="lg:hidden mb-4">
                <TabStrip tabs={TABS} value={tab} onChange={setTab} />
              </div>
              <div className="pt-1 lg:pt-0">
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
              <ActivityTimeline
                executions={liveExecutions}
                items={activityLogs}
              />
            ) : null}

            {tab === "signals" ? <SignalQueue /> : null}
              </div>
            </div>
          </div>
        </>
      )}

      <ExchangeConnectModal
        isOpen={showConnect && hasAutotradeToken}
        onClose={() => setShowConnect(false)}
        onSuccess={load}
      />
      <AutoTradeHelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </div>
  );
}
