// src/components/AutoTradePage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — Agent page shell
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
  setStrategyActive,
} from "../services/autotradeApi";
import { authApi, getMyAgentDisclaimerAcks } from "../services/authApi";
import { LIVE_FORM } from "./autotrade/agentDisclaimerCopy";

import AppliedRulesCard from "./autotrade/AppliedRulesCard";
import ExchangeConnectModal from "./autotrade/ExchangeConnectModal";
import ExchangePicker from "./autotrade/ExchangePicker";
import AgentDisclaimer, { AgentReminderStrip } from "./autotrade/AgentDisclaimer";
import LiveRiskAckModal from "./autotrade/LiveRiskAckModal";
import AutoTradeSettings from "./autotrade/AutoTradeSettings";
import PositionsBoard from "./autotrade/PositionsBoard";
import ActivityTimeline from "./autotrade/ActivityTimeline";
import SignalQueue from "./autotrade/SignalQueue";
import PnLSummary from "./autotrade/PnLSummary";
import TradeHistoryCalendar from "./autotrade/TradeHistoryCalendar";
import AutoTradeHelpModal from "./autotrade/AutoTradeHelpModal";
import AssistantWidget from "./assistant/AssistantWidget";
import { TelegramIcon, SettingsIcon } from "./autotrade/BrandIcons";
import { EXCHANGE_VENUES, VenueLogo } from "./autotrade/exchangeVenues";
import {
  Card,
  SectionHeader,
  StatusBadge,
  StatusDot,
  GhostButton,
  GoldButton,
  Notice,
} from "./autotrade/AutoTradeUI";
import { PageHeader } from "./ui/PageHeader";
import { useUiPrefs } from "../hooks/useUiPrefs";

const TABS = [
  {
    id: "overview",
    label: "Overview",
    hint: "Wallet, connection, and the rules that are live right now.",
  },
  {
    id: "positions",
    label: "Positions",
    hint: "What Agent is holding on the exchange — not every coin in your wallet.",
  },
  { id: "trades", label: "Trade History", hint: "Closed Agent trades only. A skip is not a loss." },
  {
    id: "history",
    label: "Activity",
    hint: "Every fill, skip, and block with the reason in plain language.",
  },
  {
    id: "signals",
    label: "Signals",
    hint: "Open desk signals. Agent may skip any of these if your rules say so.",
  },
  {
    id: "settings",
    label: "Settings",
    hint: "Trading rules, exchange keys, and Telegram. Changes apply to the next signal.",
  },
];

function venueMeta(exchange) {
  return EXCHANGE_VENUES[exchange] || { name: exchange ? String(exchange) : "Exchange" };
}

function pickStrategyConfig(items = [], accounts = []) {
  if (!items.length) return null;
  const active = items.find((item) => item.is_active);
  if (active) return active;
  const valid = new Set(
    accounts.filter((account) => account.key_status === "valid").map((account) => account.exchange)
  );
  const matched = items.filter((item) => valid.has(item.exchange));
  return (
    matched.find((item) => item.exchange === "bingx") ||
    matched.find((item) => item.exchange === "bitget") ||
    matched[0] ||
    items.find((item) => item.exchange === "bingx") ||
    items.find((item) => item.exchange === "bitget") ||
    items[0]
  );
}

// ════════════════════════════════════════════════════════════════
// MobileSectionPicker — tap-activated dropdown (mobile only).
// Best practice for 6+ sections on narrow screens (Setproduct rule;
// matches Django's "desktop tabs / mobile dropdown" fix). Tap, not
// hover (mobile has no hover) — closes on select, outside tap, Esc.
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
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-ink/[0.1] bg-surface-raised px-4 py-3 text-left transition-colors active:bg-ink/[0.04]"
      >
        <span className="min-w-0">
          <span className="block font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            Section · tap to switch
          </span>
          <span className="mt-0.5 block font-mono text-[13px] font-semibold uppercase tracking-[0.12em] text-text-primary">
            {current.label}
          </span>
        </span>
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-ink/[0.1] bg-surface-secondary">
          <svg
            className={`h-4 w-4 text-text-secondary transition-transform duration-200 ${
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
          className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-md border border-ink/10 bg-surface-raised shadow-2xl"
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
                className={`flex w-full items-center gap-2.5 px-4 py-3 text-left font-mono text-[12px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  on ? "bg-accent/12 text-accent" : "text-text-muted active:bg-ink/[0.04]"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    on ? "bg-accent" : "bg-ink/20"
                  }`}
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
// Desktop only; mobile uses a tap dropdown (MobileSectionPicker).
// Active item: gold pill + left rail accent (matches Performance Hub).
// ════════════════════════════════════════════════════════════════
function SideNav({ tabs, value, onChange }) {
  return (
    <nav className="sticky top-20 space-y-0.5" aria-label="Agent sections">
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
            className={`group relative w-full rounded-lg px-3 py-2 text-left transition-colors ${
              on ? "bg-accent/12" : "hover:bg-ink/[0.04]"
            }`}
          >
            {on ? (
              <span className="absolute -left-[9px] top-1/2 h-4 w-[2.5px] -translate-y-1/2 rounded-full bg-accent" />
            ) : null}
            <span
              className={`font-mono text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                on ? "text-accent" : "text-text-muted group-hover:text-text-primary"
              }`}
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
  return localStorage.getItem(AUTOTRADE_TOKEN_KEY) || localStorage.getItem(CRYPTOBOT_TOKEN_KEY);
}

function resolveLuxquantCryptobotToken(payload) {
  if (typeof payload === "string") return payload;
  return (
    payload?.cryptobot_token || payload?.token || payload?.luxquant_token || payload?.jwt || ""
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
  const [ackOpen, setAckOpen] = useState(false);
  const { prefs, setPref } = useUiPrefs({ agent_live_ack: false });
  if (!health || !config) return null;

  const active = Boolean(config?.is_active);
  const globalLive = Boolean(health.live_orders_enabled);
  const isDryRun = config?.dry_run !== false;
  const venue = config?.exchange || "binance";
  const venueName = venueMeta(venue).name;
  const accountValid = exchangeAccounts.some(
    (account) => account.exchange === venue && account.key_status === "valid"
  );
  const marketLabel = [config.spot_enabled ? "Spot" : "", config.futures_enabled ? "Futures" : ""]
    .filter(Boolean)
    .join(" + ");

  let state = {
    eyebrow: "PAUSED",
    title: "Assistant is off — no new entries",
    description: "Your rules are saved. Start Agent only when you can supervise it. Pause anytime.",
    tone: "warn",
    panel: "border-ink/[0.1] bg-surface-raised",
  };
  if (active && isDryRun) {
    state = {
      eyebrow: "DRY RUN",
      title: `Simulating ${venueName} — no real orders`,
      description:
        "Useful while you learn the assistant. Turn off Dry run in Settings only when you accept live risk.",
      tone: "info",
      panel: "border-[#5B8DEF]/30 bg-[#5B8DEF]/[0.06]",
    };
  } else if (active && globalLive && !isDryRun) {
    state = {
      eyebrow: "LIVE",
      title: `Assistant can place real ${venueName} orders`,
      description:
        "Not a guarantee of profit. Pause if you cannot watch it. Risk limits still apply.",
      tone: "good",
      panel: "border-[#0ECB81]/30 bg-[#0ECB81]/[0.06]",
    };
  } else if (active && !globalLive && !isDryRun) {
    state = {
      eyebrow: "LIVE LOCKED",
      title: "Server live switch is off",
      description:
        "Your strategy is saved. No new live orders can be placed until the engine is unlocked.",
      tone: "warn",
      panel: "border-accent/30 bg-accent/[0.06]",
    };
  }

  const applyToggle = async () => {
    setWorking(true);
    setActionError("");
    try {
      await setStrategyActive(venue, !active);
      await onChanged?.();
    } catch (err) {
      setActionError(err.message || "Failed to change Agent status");
    } finally {
      setWorking(false);
    }
  };

  const toggle = async () => {
    if (active) {
      await applyToggle();
      return;
    }
    if (isDryRun) {
      const confirmed = window.confirm(
        "Start DRY-RUN? Agent will follow signals and log what it would do. No real exchange orders."
      );
      if (!confirmed) return;
      await applyToggle();
      return;
    }
    setAckOpen(true);
  };

  const confirmLive = async () => {
    setPref("agent_live_ack", true);
    setAckOpen(false);
    await applyToggle();
  };

  return (
    <div className={`overflow-hidden rounded-lg border ${state.panel}`}>
      <LiveRiskAckModal
        open={ackOpen}
        firstTime={!prefs.agent_live_ack}
        onCancel={() => setAckOpen(false)}
        onConfirm={confirmLive}
      />
      {/* Control row — status + primary action in one compact bar */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <VenueLogo venue={venue} className="h-9 w-9" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
                Assistant
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
            {working ? "Updating…" : active ? "Pause assistant" : "Start assistant"}
          </GoldButton>
        </div>
      </div>

      {/* Status chips — inline, scannable; long guidance only shows when not live */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink/[0.07] px-4 py-2.5 lg:px-5">
        <button type="button" onClick={onManageAccount} className="text-left">
          <StatusDot tone={accountValid ? "good" : "bad"}>
            {venueName} {accountValid ? "connected" : "needs attention"}
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
          <span className="w-full text-xs leading-5 text-text-muted sm:w-auto sm:border-l sm:border-ink/[0.08] sm:pl-5">
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
  const primary =
    exchangeAccounts.find((account) => account.exchange === config?.exchange) ||
    exchangeAccounts.find((account) => account.key_status === "valid") ||
    exchangeAccounts[0];
  const primaryMeta = venueMeta(primary?.exchange || config?.exchange || "binance");
  const telegram = alertStatus?.telegram || {};
  const alertsEnabled = alertStatus?.preferences?.enabled !== false;

  const exitMode = config?.exit?.mode || config?.exit_mode;
  const callback = config?.exit?.trailing_callback_rate;

  return (
    <div className="space-y-5">
      <AppliedRulesCard config={config} />
      <PnLSummary portfolio={portfolio} executions={executions} tradeSummary={tradeSummary} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card hover className="border-accent/20">
          <div className="flex items-start justify-between gap-4">
            <VenueLogo venue={primaryMeta} className="h-10 w-10" />
            <StatusBadge tone={primary?.key_status === "valid" ? "good" : "warn"}>
              {primary?.key_status === "valid" ? "Connected" : "Check required"}
            </StatusBadge>
          </div>
          <h3 className="mt-4 text-base font-semibold text-text-primary">
            {primary?.label || `${primaryMeta.name} account`}
          </h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            API credentials, permissions and account validation.
          </p>
          <button
            type="button"
            onClick={() => onOpenSettings("connections")}
            className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-accent hover:text-accent-light"
          >
            Manage connection →
          </button>
        </Card>

        <Card hover className="border-[#229ED9]/20">
          <div className="flex items-start justify-between gap-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-[#229ED9]/10 text-[#229ED9]">
              <TelegramIcon className="h-6 w-6" />
            </span>
            <StatusBadge tone={telegram.linked && alertsEnabled ? "good" : "warn"}>
              {telegram.linked ? (alertsEnabled ? "Alerts on" : "Alerts off") : "Not linked"}
            </StatusBadge>
          </div>
          <h3 className="mt-4 text-base font-semibold text-text-primary">Telegram notifications</h3>
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
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent/12 text-accent">
              <SettingsIcon className="h-5 w-5" />
            </span>
            <StatusBadge tone="good">Live rules</StatusBadge>
          </div>
          <h3 className="mt-4 text-base font-semibold text-text-primary">Trading policy</h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {config?.spot_enabled ? "Spot" : ""}
            {config?.spot_enabled && config?.futures_enabled ? " + " : ""}
            {config?.futures_enabled ? "Futures" : ""}
            {exitMode === "trailing_stop"
              ? ` · Trailing${callback ? ` ${callback}%` : ""}`
              : " · Fixed SL"}{" "}
            ·{" "}
            {config?.sizing?.method === "fixed"
              ? `${config?.sizing?.value || 0} USDT`
              : `${config?.sizing?.value || 0}%`}{" "}
            per trade
          </p>
          <button
            type="button"
            onClick={() => onOpenSettings("strategy")}
            className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-accent hover:text-accent"
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
        <div key={item} className="rounded-md border border-ink/[0.06] bg-surface-raised p-5">
          <div className="h-3 w-24 rounded bg-ink/[0.05]" />
          <div className="mt-4 h-8 w-2/3 rounded bg-ink/[0.06]" />
          <div className="mt-3 h-16 rounded bg-ink/[0.03]" />
        </div>
      ))}
    </div>
  );
}

function SetupCard({
  title,
  body,
  actionLabel,
  onAction,
  disabled = false,
  secondaryLabel,
  onSecondary,
  tertiaryLabel,
  onTertiary,
}) {
  return (
    <Card className="border-ink/[0.1]">
      <div className="max-w-2xl space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
          Next step
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-text-primary">{title}</h2>
        <p className="text-sm leading-6 text-text-muted">{body}</p>
        <div className="flex flex-wrap gap-3 pt-1">
          <GoldButton onClick={onAction} disabled={disabled}>
            {actionLabel}
          </GoldButton>
          {secondaryLabel ? (
            <GhostButton onClick={onSecondary} disabled={disabled}>
              {secondaryLabel}
            </GhostButton>
          ) : null}
          {tertiaryLabel ? (
            <GhostButton onClick={onTertiary} disabled={disabled}>
              {tertiaryLabel}
            </GhostButton>
          ) : null}
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
  const [connectExchange, setConnectExchange] = useState("binance");
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
  const [hasAutotradeToken, setHasAutotradeToken] = useState(Boolean(getStoredAutotradeToken()));
  const [rereadDisclaimer, setRereadDisclaimer] = useState(false);
  const [hasSignedAssistantForm, setHasSignedAssistantForm] = useState(false);
  const [hasSignedLiveForm, setHasSignedLiveForm] = useState(false);
  const [acksReady, setAcksReady] = useState(false);
  const {
    prefs,
    setPref,
    ready: prefsReady,
  } = useUiPrefs({
    agent_assistant_ack: false,
    agent_live_ack: false,
  });
  const identityRefreshAttempted = useRef(false);
  // Pause auto-refresh while Binance REST circuit is open (rate limit / IP ban).
  const binanceBackOffUntilRef = useRef(0);

  const exchangeAccounts = meData?.exchange_accounts || [];
  const hasExchangeAccount = exchangeAccounts.length > 0;
  const liveExecutions = useMemo(
    () => executions.filter((execution) => execution.dry_run !== true),
    [executions]
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
              ? "Agent access is not ready yet. Try logging out and back in to refresh your Cryptobot access token."
              : message || "Unable to connect this LuxQuant account to Cryptobot right now."
          );
          return;
        }
      } else if (!identityRefreshAttempted.current) {
        identityRefreshAttempted.current = true;
        try {
          await ensureAutotradeAccess({ refreshIdentity: true });
        } catch (identityError) {
          console.warn("Agent identity refresh failed:", identityError);
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
      setStrategyConfig(pickStrategyConfig(strategyResponse?.items || [], connectedAccounts));
      setExecutions(executionsResponse?.items || []);
      setActivityLogs(activityLogsResponse?.items || []);
      setAlertStatus(alertResult.data);
      setAlertStatusError(alertResult.error);
      setSignalsById(
        Object.fromEntries((signalsResponse?.items || []).map((signal) => [signal.id, signal]))
      );
      setLastUpdatedAt(new Date());
      setError("");
      binanceBackOffUntilRef.current = 0;
    } catch (err) {
      const unauthorized = /401|unauthorized|forbidden|invalid token/i.test(err?.message || "");
      if (unauthorized) {
        clearAutotradeAuth();
        setHasAutotradeToken(false);
        resetAutotradeData();
        setError("");
      } else {
        // Structured rate-limit / circuit-open from Cryptobot P0 API.
        if (err instanceof AutoTradeApiError && err.isRateLimited) {
          const wait = err.retryAfterSeconds || 120;
          binanceBackOffUntilRef.current = Date.now() + wait * 1000;
          setError(
            err.message || `Binance rate-limited this server. Pausing Agent refresh ~${wait}s.`
          );
        } else {
          setError(err.message || "Failed to load Agent data");
        }
      }
    } finally {
      if (!background) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [hasAutotradeToken]);

  useEffect(() => {
    let alive = true;
    getMyAgentDisclaimerAcks()
      .then((data) => {
        if (!alive) return;
        const items = data?.items || [];
        setHasSignedAssistantForm(items.some((row) => row.kind === "assistant"));
        setHasSignedLiveForm(items.some((row) => row.kind === "live"));
        setAcksReady(true);
      })
      .catch(() => {
        if (!alive) return;
        setAcksReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

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

  const summaryText = useMemo(() => {
    if (!prefs.agent_assistant_ack)
      return "Read the assistant disclaimer before connecting anything";
    if (!hasAutotradeToken) return "Link this LuxQuant account to the execution helper";
    if (!hasSignedLiveForm) return "Sign the live trading agreement before connecting a key";
    if (!hasExchangeAccount) return "One venue. Spot and futures. You turn it off.";
    const totalAccounts = exchangeAccounts.length;
    const totalExecutions = liveExecutions.length;
    return `${totalAccounts} exchange${totalAccounts === 1 ? "" : "s"} connected · ${totalExecutions} execution job${totalExecutions === 1 ? "" : "s"}`;
  }, [
    exchangeAccounts.length,
    liveExecutions.length,
    hasAutotradeToken,
    hasExchangeAccount,
    prefs.agent_assistant_ack,
    hasSignedLiveForm,
  ]);

  const handleAuthorizeAutotrade = async () => {
    setAuthActionLoading(true);
    setError("");
    try {
      const tokenReady = await ensureAutotradeAccess();
      setHasAutotradeToken(tokenReady);
      await load();
    } catch (err) {
      setError(err?.message || "Unable to connect this LuxQuant account to Cryptobot right now.");
    } finally {
      setAuthActionLoading(false);
    }
  };

  const openSettings = (section = "strategy") => {
    setSettingsSection(section);
    setTab("settings");
  };

  const openConnect = (exchange = "binance") => {
    if (!hasSignedLiveForm) {
      setError("Sign the live trading agreement before connecting an exchange.");
      return;
    }
    setConnectExchange(exchange);
    setShowConnect(true);
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 overflow-x-hidden px-4 py-8 pb-28">
      <SectionHeader label="Agent" />

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <PageHeader title="Agent" />
          <p className="mt-2 text-sm text-text-secondary">{summaryText}</p>
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
            aria-label="Open Agent guide"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-ink/[0.08] text-text-muted transition-colors hover:border-ink/12 hover:bg-accent/12 hover:text-accent"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
          </button>
        </div>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {!prefsReady || !acksReady ? (
        <LoadingState />
      ) : !prefs.agent_assistant_ack || !hasSignedAssistantForm || rereadDisclaimer ? (
        <AgentDisclaimer
          compact={rereadDisclaimer && hasSignedAssistantForm}
          onCollapse={() => setRereadDisclaimer(false)}
          onAccept={() => {
            setPref("agent_assistant_ack", true);
            setHasSignedAssistantForm(true);
            setRereadDisclaimer(false);
          }}
        />
      ) : !hasSignedLiveForm ? (
        <AgentDisclaimer
          form={LIVE_FORM}
          onAccept={() => {
            setPref("agent_live_ack", true);
            setHasSignedLiveForm(true);
          }}
        />
      ) : !hasAutotradeToken ? (
        <SetupCard
          title="Link the execution helper"
          body="This only exchanges a short-lived token between LuxQuant and the helper. No exchange keys, no password. You can stop here — nothing trades until you connect a venue and start it yourself."
          actionLabel={authActionLoading ? "Linking…" : "Link helper"}
          onAction={handleAuthorizeAutotrade}
          disabled={authActionLoading}
        />
      ) : loading ? (
        <LoadingState />
      ) : !hasExchangeAccount ? (
        <ExchangePicker onPick={openConnect} />
      ) : (
        <>
          <AgentReminderStrip onReread={() => setRereadDisclaimer(true)} />
          <AutoTradeControlCenter
            health={health}
            config={strategyConfig}
            exchangeAccounts={exchangeAccounts}
            onChanged={() => load({ background: true })}
            onConfigure={() => openSettings("strategy")}
            onManageAccount={() => openSettings("connections")}
          />

          {/* Desktop: vertical side nav · Mobile: scrollable strip */}
          <div className="flex items-start gap-6 lg:gap-8">
            <aside className="sticky top-24 hidden w-48 shrink-0 lg:block">
              <SideNav tabs={TABS} value={tab} onChange={setTab} />
            </aside>
            <div className="min-w-0 flex-1 overflow-visible">
              <div className="lg:hidden mb-4">
                <MobileSectionPicker tabs={TABS} value={tab} onChange={setTab} />
              </div>
              <div className="pt-1 lg:pt-0">
                {TABS.find((item) => item.id === tab)?.hint ? (
                  <p className="mb-4 text-xs leading-5 text-text-muted">
                    {TABS.find((item) => item.id === tab).hint}
                  </p>
                ) : null}
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
                    onConnect={openConnect}
                    alertStatus={alertStatus}
                    alertStatusError={alertStatusError}
                    onAlertUpdated={(updated) => {
                      if (updated) setAlertStatus(updated);
                      else load({ background: true });
                    }}
                  />
                ) : null}

                {tab === "positions" ? (
                  <PositionsBoard
                    portfolio={portfolio}
                    onChanged={() => load({ background: true })}
                  />
                ) : null}

                {tab === "trades" ? <TradeHistoryCalendar history={tradeHistory} /> : null}

                {tab === "history" ? (
                  <ActivityTimeline executions={liveExecutions} items={activityLogs} />
                ) : null}

                {tab === "signals" ? <SignalQueue /> : null}
              </div>
            </div>
          </div>
        </>
      )}

      <ExchangeConnectModal
        isOpen={showConnect && hasAutotradeToken && hasSignedLiveForm}
        exchange={connectExchange}
        onClose={() => setShowConnect(false)}
        onSuccess={load}
      />
      <AutoTradeHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="autotrade" />
    </div>
  );
}
