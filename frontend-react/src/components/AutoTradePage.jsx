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
import { ShimmerStyles } from "./ui/Loaders";


import {
  AUTOTRADE_TOKEN_KEY,
  CRYPTOBOT_TOKEN_KEY,
  LUXQUANT_CRYPTOBOT_TOKEN_KEY,
  AutoTradeApiError,
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
import AssistantWidget from "./assistant/AssistantWidget";
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
// MobileSectionPicker — tap-activated dropdown (mobile only).
//   Best practice for 6+ sections on narrow screens (Setproduct rule;
//   matches Django's "desktop tabs / mobile dropdown" fix). Tap, not
//   hover (mobile has no hover) — closes on select, outside tap, Esc.
// ════════════════════════════════════════════════════════════════
function MobileSectionPicker({ tabs, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = tabs.find((t) => t.id === value) || tabs[0];

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-gold-primary/35 bg-gold-primary/[0.07] px-4 py-3 text-left transition-colors active:bg-gold-primary/[0.12]"
      >
        <span className="min-w-0">
          <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-gold-primary/80">
            Section · tap to switch
          </span>
          <span className="mt-0.5 block font-mono text-[13px] uppercase tracking-[0.15em] text-gold-light">
            {current.label}
          </span>
        </span>
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-gold-primary/30 bg-gold-primary/15">
          <svg
            className={`h-4 w-4 text-gold-primary transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-md border border-gold-primary/20 bg-surface-raised shadow-2xl"
        >
          {tabs.map((item) => {
            const on = item.id === value;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-4 py-3 text-left font-mono text-[12px] uppercase tracking-[0.15em] transition-colors ${
                  on ? "" : "text-text-muted active:bg-white/[0.04]"
                }`}
                style={on ? { background: "rgba(212,168,83,0.10)", color: "#ecd6a3" } : undefined}
              >
                <span
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={
                    on
                      ? { background: "#d4a853", boxShadow: "0 0 6px rgba(212,168,83,0.6)" }
                      : { background: "rgba(255,255,255,0.15)" }
                  }
                />
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// SideNav — vertical section nav (Azure resource-menu pattern).
//   Desktop only; mobile uses a tap dropdown (MobileSectionPicker).
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
                on ? "" : "text-text-muted group-hover:text-text-primary"
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
  const isDryRun = config?.dry_run !== false;
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
  if (active && isDryRun) {
    state = {
      eyebrow: "DRY RUN",
      title: "Simulation mode — no real Binance orders",
      description:
        "The bot will follow signals and log activity, but will not place live orders. Turn off Dry run in Settings for live trading.",
      tone: "info",
      panel: "border-[#5B8DEF]/35 bg-[#5B8DEF]/[0.06]",
    };
  } else if (active && globalLive && !isDryRun) {
    state = {
      eyebrow: "LIVE TRADING",
      title: "AutoTrade can place real Binance orders",
      description:
        "Risk limits and your saved strategy are enforced before every live entry.",
      tone: "good",
      panel: "border-[#0ECB81]/35 bg-[#0ECB81]/[0.045]",
    };
  } else if (active && !globalLive && !isDryRun) {
    state = {
      eyebrow: "LIVE ENGINE LOCKED",
      title: "AutoTrade cannot start live trading yet",
      description:
        "The server-wide live order switch is disabled. Your strategy remains saved and no new orders can be placed.",
      tone: "warn",
      panel: "border-gold-primary/25 bg-gold-primary/[0.035]",
    };
  }

  const toggle = async () => {
    if (!active) {
      const confirmed = window.confirm(
        isDryRun
          ? "Start DRY-RUN AutoTrade? The bot will process signals but place no real Binance orders."
          : "Start LIVE AutoTrade? New matching signals may place real Binance orders.",
      );
      if (!confirmed) return;
    }
    setWorking(true);
    setActionError("");
    try {
      // Do not force dry_run:false on start — mode is controlled in Settings.
      await setBinanceStrategyActive(!active);
      await onChanged?.();
    } catch (err) {
      setActionError(err.message || "Failed to change AutoTrade status");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className={`overflow-hidden rounded-lg border ${state.panel}`}>
      {/* Control row — status + primary action in one compact bar */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border ${
              active
                ? state.tone === "good"
                  ? "border-[#0ECB81]/35 bg-[#0ECB81]/10 text-[#0ECB81]"
                  : "border-[#5B8DEF]/35 bg-[#5B8DEF]/10 text-[#7da4ff]"
                : "border-gold-primary/30 bg-gold-primary/10 text-gold-primary"
            }`}
          >
            <BinanceIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
                AutoTrade engine
              </span>
              <StatusBadge tone={state.tone}>{state.eyebrow}</StatusBadge>
            </div>
            <h2 className="mt-0.5 truncate text-sm font-semibold text-text-primary sm:text-base">
              {state.title}
            </h2>
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <GhostButton onClick={onConfigure}>
            <span className="inline-flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              Settings
            </span>
          </GhostButton>
          <GoldButton onClick={toggle} disabled={working || !accountValid}>
            {working
              ? "Updating…"
              : active
                ? "Pause AutoTrade"
                : "Start AutoTrade"}
          </GoldButton>
        </div>
      </div>

      {/* Status chips — inline, scannable; long guidance only shows when not live */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.07] px-4 py-2.5 lg:px-5">
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
        {state.tone !== "good" ? (
          <span className="w-full text-xs leading-5 text-text-muted sm:w-auto sm:border-l sm:border-white/[0.08] sm:pl-5">
            {state.description}
          </span>
        ) : null}
      </div>

      {actionError ? (
        <div className="px-4 pb-4 lg:px-5">
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
          <h3 className="mt-4 text-base font-semibold text-text-primary">
            {binance?.label || "Binance account"}
          </h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            API credentials, permissions and account validation.
          </p>
          <button
            type="button"
            onClick={() => onOpenSettings("connections")}
            className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-[#F3BA2F] hover:text-accent-light"
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
          <h3 className="mt-4 text-base font-semibold text-text-primary">
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
          <h3 className="mt-4 text-base font-semibold text-text-primary">
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
    <div className="lqsk-group grid grid-cols-1 gap-4 md:grid-cols-3">
      <ShimmerStyles />
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="rounded-md border border-white/[0.06] bg-surface-raised p-5"
        >
          <div className="h-3 w-24 rounded bg-white/[0.05]" />
          <div className="mt-4 h-8 w-2/3 rounded bg-white/[0.06]" />
          <div className="mt-3 h-16 rounded bg-white/[0.03]" />
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
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary">
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
  // Pause auto-refresh while Binance REST circuit is open (rate limit / IP ban).
  const binanceBackOffUntilRef = useRef(0);

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
      setError("");
      binanceBackOffUntilRef.current = 0;
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
        // Structured rate-limit / circuit-open from Cryptobot P0 API.
        if (err instanceof AutoTradeApiError && err.isRateLimited) {
          const wait = err.retryAfterSeconds || 120;
          binanceCooldownOffUntilRef.current = Date.now() + wait * 1000;
          setError(
            err.message ||
              `Binance rate-limited this server. Pausing AutoTrade refresh ~${wait}s.`,
          );
        } else {
          setError(err.message || "Failed to load AutoTrade data");
        }
      }
    } finally {
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [hasAutotradeToken]);

  // Poll portfolio/activity, but back off hard while Binance circuit is open
  // so we do not extend IP bans with 30s hammering.
  useEffect(() => {
    if (!hasAutotradeToken) return undefined;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() < binanceBackOffUntilRef.current) return;
      load({ background: true });
    };
    // 60s default (was 30s) — portfolio is server-cached ~20s; halves REST load.
    const interval = window.setInterval(refresh, 60000);
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
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            AutoTrade
          </h1>
          <p className="mt-1.5 font-mono text-sm text-text-muted">
            {summaryText}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdatedAt ? (
            <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted/70">
              Auto-refresh 60s · Updated{" "}
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
                <MobileSectionPicker tabs={TABS} value={tab} onChange={setTab} />
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

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="autotrade" />
    </div>
  );
}
