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
import { skipSummary } from "./autotrade/autotradeEventGuide";
import {
  AGENT_PLAN_LABEL,
  DRC_AGENT_PARAGRAPHS,
  DRC_AGENT_TITLE,
  agentBlockedByDrc,
  planAllowsAgent,
  planName,
  planRefusalReason,
} from "../utils/agentPlan";
import { useAuth } from "../context/AuthContext";
import ExchangeConnectModal from "./autotrade/ExchangeConnectModal";
import ExchangeUnlinkModal from "./autotrade/ExchangeUnlinkModal";
import ExchangePicker from "./autotrade/ExchangePicker";
import { pickLinkedAccount, pickStrategyConfig } from "./autotrade/exchangeLinking";
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
    hint: "Trading rules, exchange keys (link / unlink / switch), and Telegram. Changes apply to the next signal.",
  },
];

function venueMeta(exchange) {
  return EXCHANGE_VENUES[exchange] || { name: exchange ? String(exchange) : "Exchange" };
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
  const linkedAccount = pickLinkedAccount(exchangeAccounts, config);
  const venue = linkedAccount?.exchange || config?.exchange || "binance";
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
          <GhostButton onClick={onManageAccount}>
            {venueName} keys
          </GhostButton>
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
  activityLogs,
  onOpenSettings,
  onUnlink,
}) {
  const primary =
    pickLinkedAccount(exchangeAccounts, config) ||
    exchangeAccounts.find((account) => account.key_status === "valid") ||
    exchangeAccounts[0];
  const primaryMeta = venueMeta(primary?.exchange || config?.exchange || "binance");
  const telegram = alertStatus?.telegram || {};
  const alertsEnabled = alertStatus?.preferences?.enabled !== false;

  const exitMode = config?.exit?.mode || config?.exit_mode;
  const callback = config?.exit?.trailing_callback_rate;

  const recentSkips = [];
  const seenSkips = new Set();
  for (const row of activityLogs || []) {
    const skip = skipSummary(row.action, row.metadata || {});
    if (!skip) continue;
    const key = `${skip.symbol}:${skip.title}`;
    if (seenSkips.has(key)) continue;
    seenSkips.add(key);
    recentSkips.push({ ...skip, at: row.created_at });
    if (recentSkips.length >= 6) break;
  }

  return (
    <div className="space-y-5">
      <AppliedRulesCard config={config} />
      {recentSkips.length ? (
        <div className="rounded-lg border border-ink/[0.08] bg-surface-raised px-4 py-3.5">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
            Signals not taken
          </p>
          <p className="mt-1 text-[12px] text-text-secondary">
            Agent skipped these on purpose. Open Activity for the full list.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {recentSkips.map((row) => (
              <li key={`${row.symbol}-${row.title}-${row.at}`} className="text-[12px] leading-5">
                <span className="font-medium text-text-primary">{row.symbol || "Signal"}</span>
                <span className="text-text-muted"> — {row.title}</span>
                {row.blocking ? (
                  <span className="ml-1 text-warn">· pausing new entries</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
            One venue at a time. Unlink {primaryMeta.name} before connecting another desk.
          </p>
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => onOpenSettings("connections")}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent hover:text-accent-light"
            >
              Manage keys →
            </button>
            {primary?.exchange ? (
              <button
                type="button"
                onClick={() => onOpenSettings("connections")}
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-secondary hover:text-text-primary"
              >
                Switch venue
              </button>
            ) : null}
            {primary?.exchange ? (
              <button
                type="button"
                onClick={() => onUnlink?.(primary.exchange)}
                className="font-mono text-[10px] uppercase tracking-[0.18em] text-negative hover:text-negative"
              >
                Unlink {primaryMeta.name}
              </button>
            ) : null}
          </div>
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

/* The Agent is an Annual/Lifetime feature. This sits ahead of the disclaimers
   on purpose: there is no sense asking somebody to sign a live trading
   agreement for something their plan cannot run.

   It names the plan they are ON and why that plan cannot run it. "Upgrade to
   continue" with no subject leaves the reader working out which of their
   plans, which limit, and whether it is a bug — and that is the message people
   send screenshots about. */
function UpgradeForAgent({ user }) {
  const current = planName(user);
  const reason = planRefusalReason(user);
  const expires = user?.subscription_expires_at
    ? new Date(user.subscription_expires_at).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
      })
    : null;
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-ink/10 bg-surface-raised p-6 text-center">
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/15 text-accent">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </span>
      <h2 className="font-display text-[17px] font-semibold text-text-primary">
        Agent is available on {AGENT_PLAN_LABEL}
      </h2>

      <div className="mt-4 rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3 text-left">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">
            Your plan
          </span>
          <span className="text-[13px] font-bold text-text-primary">{current}</span>
        </div>
        {expires && (
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">
              Renews / ends
            </span>
            <span className="text-[12.5px] text-text-secondary">{expires}</span>
          </div>
        )}
        <p className="mt-2.5 border-t border-ink/10 pt-2.5 text-[12.5px] leading-relaxed text-text-secondary">
          {reason}
        </p>
      </div>

      <p className="mx-auto mt-3 text-[12px] leading-relaxed text-text-muted">
        Nothing is lost by waiting — your keys, settings and any open position stay
        exactly as they are. Upgrade and the Agent is available again within about
        two minutes, with nothing to reconnect.
      </p>
      <a
        href="/pricing"
        className="mt-5 inline-block rounded-xl bg-accent px-5 py-2.5 text-[13px] font-bold text-accent-fg transition hover:brightness-[1.04]"
      >
        See Annual &amp; Lifetime
      </a>
    </div>
  );
}

/* Daily Rekom Crypto members: the partner asked that its members get no
   automated execution, so this is not an upsell. No price, no button to a
   plan, because no purchase changes it. The last line is ours, not the
   partner's: somebody with a position the Agent opened before this rule needs
   to know it is still protected. */
export function DrcAgentNotice() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-ink/10 bg-surface-raised p-6">
      <div className="flex items-center gap-3">
        {/* DRC's lockup is drawn for a dark ground: its wordmark is white and
            vanished on the Bright card, leaving a lone "C". It sits on its own
            dark plate in every theme, the way a partner logo is shown. */}
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl"
          style={{ background: "#0b0d12" }}
        >
          <img
            src="/DRC%20LOGO.webp"
            alt="Daily Rekom Crypto"
            width={40}
            height={40}
            className="h-10 w-10 object-cover"
          />
        </span>
        <h2 className="font-display text-[17px] font-semibold leading-snug text-text-primary">
          {DRC_AGENT_TITLE}
        </h2>
      </div>
      <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-text-secondary">
        {DRC_AGENT_PARAGRAPHS.map((p) => (
          <p key={p.slice(0, 24)}>{p}</p>
        ))}
      </div>
      <p className="mt-4 border-t border-ink/10 pt-3 text-[12px] leading-relaxed text-text-muted">
        Any position the Agent already opened keeps its take-profit and stop-loss
        until it closes, and you can follow it on your exchange.
      </p>
    </div>
  );
}

export default function AutoTradePage() {
  const { user } = useAuth();
  // The backend re-checks this before every live entry, so this is the page
  // being honest rather than the page enforcing anything.
  const planOk = planAllowsAgent(user);
  const drcBlocked = agentBlockedByDrc(user);
  const [tab, setTab] = useState("overview");
  const [settingsSection, setSettingsSection] = useState("strategy");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authActionLoading, setAuthActionLoading] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [connectExchange, setConnectExchange] = useState("binance");
  const [unlinkState, setUnlinkState] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [health, setHealth] = useState(null);
  const [meData, setMeData] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [tradeHistory, setTradeHistory] = useState({ items: [], summary: {} });
  const [executions, setExecutions] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [, setSignalsById] = useState({});
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

  // The login token is stored for an exchange that normally happens at once,
  // but it lives one hour and embeds the entitlement of that moment. When the
  // exchange at login failed — a free account that was upgraded later is the
  // common case — the dead token stayed in storage and was reused here, so
  // opening Agent answered "LuxQuant token has expired" until the user logged
  // out and in again (2026-09-18, six 401s in a row for one new Lifetime user).
  const storedTokenUsable = (token) => {
    try {
      const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return claims.has_active_access === true && claims.exp * 1000 - Date.now() > 60_000;
    } catch {
      return false;
    }
  };

  const getLuxquantCryptobotToken = async ({ fresh = false } = {}) => {
    const storedToken = localStorage.getItem(LUXQUANT_CRYPTOBOT_TOKEN_KEY);
    if (storedToken && !fresh && storedTokenUsable(storedToken)) return storedToken;
    localStorage.removeItem(LUXQUANT_CRYPTOBOT_TOKEN_KEY);
    const response = await authApi.getCryptobotToken();
    return resolveLuxquantCryptobotToken(response);
  };

  const ensureAutotradeAccess = async ({ refreshIdentity = false } = {}) => {
    if (getStoredAutotradeToken() && !refreshIdentity) return true;
    let luxquantToken = await getLuxquantCryptobotToken({
      fresh: refreshIdentity,
    });
    if (!luxquantToken) {
      throw new Error("LuxQuant did not return a Cryptobot exchange token");
    }
    try {
      await exchangeLuxquantToken(luxquantToken);
    } catch (err) {
      // One retry with a freshly minted token covers anything the local check
      // cannot see (clock skew, a token the server has already refused).
      if (!(err instanceof AutoTradeApiError) || ![401, 403].includes(err.status)) throw err;
      luxquantToken = await getLuxquantCryptobotToken({ fresh: true });
      if (!luxquantToken) throw err;
      await exchangeLuxquantToken(luxquantToken);
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is rebuilt each render; the only state it reads is hasAutotradeToken
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same: re-arming on each render would reset the 60 s poll
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
    const other = exchangeAccounts.find((account) => account.exchange !== exchange);
    const alreadyThis = exchangeAccounts.some((account) => account.exchange === exchange);
    if (other && !alreadyThis) {
      setUnlinkState({ exchange: other.exchange, target: exchange });
      return;
    }
    setConnectExchange(exchange);
    setShowConnect(true);
  };

  const openUnlink = (exchange) => {
    if (!exchange) return;
    setUnlinkState({ exchange, target: null });
  };

  const openSwitch = (from, to) => {
    if (!from || !to) return;
    setUnlinkState({ exchange: from, target: to });
  };

  const handleUnlinked = async ({ targetExchange }) => {
    setUnlinkState(null);
    await load({ background: true });
    if (targetExchange) {
      setConnectExchange(targetExchange);
      setShowConnect(true);
    }
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

      {drcBlocked ? (
        <DrcAgentNotice />
      ) : !planOk ? (
        <UpgradeForAgent user={user} />
      ) : !prefsReady || !acksReady ? (
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
                    activityLogs={activityLogs}
                    onOpenSettings={openSettings}
                    onUnlink={openUnlink}
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
                    onSwitch={openSwitch}
                    onUnlink={openUnlink}
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
        linkedExchanges={exchangeAccounts.map((account) => account.exchange)}
        onClose={() => setShowConnect(false)}
        onSuccess={load}
        onNeedUnlink={(from, to) => {
          setShowConnect(false);
          openSwitch(from, to);
        }}
      />
      <ExchangeUnlinkModal
        isOpen={Boolean(unlinkState?.exchange)}
        exchange={unlinkState?.exchange}
        targetExchange={unlinkState?.target || null}
        onClose={() => setUnlinkState(null)}
        onUnlinked={handleUnlinked}
        onOpenPositions={() => {
          setUnlinkState(null);
          setTab("positions");
        }}
      />
      <AutoTradeHelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Context-aware help assistant */}
      <AssistantWidget pageId="autotrade" />
    </div>
  );
}
