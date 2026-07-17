// src/components/admin/UserDetailDrawer.jsx
//
// Centered modal showing full user detail with 5 tabs:
// • Overview — hero, account info, subscription, referral credit
// • Contact — channels (TG/Discord/Email) + edit form + admin notes
// • Payments — payment history with summary cards
// • Referral — referred-by + referred-users lists
// • Outreach — QuickSendPopover inline (template-driven DM)
//
// Tab split rationale: original "Profile" tab packed 8 sections including
// the contact edit form. Splitting Overview/Contact keeps each tab focused
// and makes the contact-channel workflow more discoverable.
//
// Already modal-styled (max-w-3xl, rounded-2xl, fade-in zoom-in-95).

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { adminApi } from "../../services/adminApi";
import { workspaceApi } from "../../services/workspaceApi";
import { growthApi } from "../../services/growthApi";
import { ContactBadge } from "./ContactBadge";
import { QuickSendPopover } from "./QuickSendPopover";
import {
  CloseIcon,
  EditIcon,
  ExternalLinkIcon,
  UserIcon,
  StarIcon,
  TelegramIcon,
  DiscordIcon,
  SparklesIcon,
  AlertTriangleIcon,
  SendIcon,
  BroadcastIcon,
  ProviderIcon,
  ClockIcon,
} from "./Icons";
import { GoldButton, GhostButton } from "../autotrade/AutoTradeUI";

/* ════════════════════════════════════════
 Helpers
 ════════════════════════════════════════ */

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const relativeTime = (dateStr) => {
  if (!dateStr) return "Never";
  const days = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

const StatusBadge = ({ status }) => {
  const colors = {
    confirmed: {
      bg: "rgba(52,211,153,0.10)",
      text: "#34d399",
      border: "rgba(52,211,153,0.30)",
    },
    pending: {
      bg: "rgba(251,191,36,0.10)",
      text: "#fbbf24",
      border: "rgba(251,191,36,0.30)",
    },
    cancelled: {
      bg: "rgba(107,92,82,0.10)",
      text: "rgb(var(--fg-muted))",
      border: "rgba(107,92,82,0.30)",
    },
    failed: {
      bg: "rgba(248,113,113,0.10)",
      text: "#f87171",
      border: "rgba(248,113,113,0.30)",
    },
    refunded: {
      bg: "rgba(251,146,60,0.10)",
      text: "#fb923c",
      border: "rgba(251,146,60,0.30)",
    },
  };
  const c = colors[status] || colors.cancelled;
  return (
    <span
      className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}
    >
      {status}
    </span>
  );
};

/* ════════════════════════════════════════
 Layout primitives
 ════════════════════════════════════════ */

const Section = ({ title, Icon, action, children }) => (
  <section className="space-y-2.5">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={12} style={{ color: "rgb(var(--accent-text))" }} />}
        <h4
          className="text-[10px] font-bold tracking-wider uppercase"
          style={{ color: "rgb(var(--ink) / 0.5)" }}
        >
          {title}
        </h4>
      </div>
      {action}
    </div>
    {children}
  </section>
);

const StatTile = ({ label, value, accent }) => (
  <div
    className="relative overflow-hidden rounded-lg px-3 py-2"
    style={{
      background: "rgb(var(--ink) / 0.02)",
      border: "1px solid rgb(var(--ink) / 0.04)",
    }}
  >
    <p
      className="text-[9px] uppercase tracking-wider font-semibold mb-0.5"
      style={{ color: "rgb(var(--ink) / 0.35)" }}
    >
      {label}
    </p>
    <p
      className="text-[13px] font-medium tabular-nums tracking-tight truncate"
      style={{ color: accent || "rgb(var(--fg))" }}
    >
      {value ?? "—"}
    </p>
  </div>
);

const EmptyState = ({ Icon, title, hint, accent = "rgb(var(--fg-muted))" }) => (
  <div className="text-center py-16">
    <div
      className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3"
      style={{
        background: `${accent}15`,
        border: `1px solid ${accent}30`,
        color: accent,
      }}
    >
      {Icon && <Icon size={20} />}
    </div>
    <p className="text-sm font-semibold text-text-primary mb-1">{title}</p>
    {hint && (
      <p className="text-[11.5px]" style={{ color: "rgb(var(--fg-muted))" }}>
        {hint}
      </p>
    )}
  </div>
);

/* ════════════════════════════════════════
 Hero — pinned at top of Overview tab
 ════════════════════════════════════════ */

const UserHero = ({ user }) => (
  <div className="flex items-start gap-4">
    <div
      className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden"
      style={{
        background: user.avatar_url ? "transparent" : "rgb(var(--accent) / 0.12)",
        color: "rgb(var(--accent-text))",
        border: "1px solid rgb(var(--line) / 0.22)",
      }}
    >
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
      ) : (
        user.username?.charAt(0).toUpperCase()
      )}
    </div>

    <div className="flex-1 min-w-0 pt-0.5">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-lg font-semibold text-text-primary tracking-tight truncate">
          {user.username}
        </h3>
        <ProviderIcon provider={user.auth_provider} size={14} />
      </div>
      <p className="text-[11px] font-mono truncate" style={{ color: "rgb(var(--fg-muted))" }}>
        {user.email}
      </p>
      <div className="flex gap-1.5 mt-2 flex-wrap">
        <span
          className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
          style={{
            background:
              user.role === "admin"
                ? "rgba(168,85,247,0.12)"
                : user.role === "co_admin"
                  ? "rgba(138,138,147,0.12)"
                  : user.role === "founder"
                    ? "rgba(251,191,36,0.12)"
                    : user.role === "subscriber" || user.role === "premium"
                      ? "rgba(52,211,153,0.12)"
                      : "rgba(107,92,82,0.12)",
            color:
              user.role === "admin"
                ? "#a855f7"
                : user.role === "co_admin"
                  ? "#8a8a93"
                  : user.role === "founder"
                    ? "#fbbf24"
                    : user.role === "subscriber" || user.role === "premium"
                      ? "#34d399"
                      : "rgb(var(--fg-muted))",
            border: `1px solid ${
              user.role === "admin"
                ? "rgba(168,85,247,0.3)"
                : user.role === "co_admin"
                  ? "rgba(138,138,147,0.3)"
                  : user.role === "founder"
                    ? "rgba(251,191,36,0.3)"
                    : user.role === "subscriber" || user.role === "premium"
                      ? "rgba(52,211,153,0.3)"
                      : "rgba(107,92,82,0.3)"
            }`,
          }}
        >
          {user.role}
        </span>
        <span
          className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            background: "rgb(var(--ink) / 0.04)",
            color: "rgb(var(--fg-muted))",
            border: "1px solid rgb(var(--ink) / 0.06)",
          }}
        >
          {user.auth_provider}
        </span>
        {!user.is_active && (
          <span
            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: "rgba(248,113,113,0.12)",
              color: "rgb(var(--neg-text))",
              border: "1px solid rgba(248,113,113,0.3)",
            }}
          >
            Banned
          </span>
        )}
        {user.subscription_source && (
          <span
            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: "rgb(var(--accent) / 0.1)",
              color: "rgb(var(--accent-text))",
              border: "1px solid rgb(var(--line) / 0.22)",
            }}
          >
            via {user.subscription_source}
          </span>
        )}
      </div>
    </div>
  </div>
);

const FEATURE_LABEL = {
  signals: "Signals",
  autotrade: "AutoTrade",
  markets: "Markets",
  market_pulse: "Market Pulse",
  ai_arena: "AI Arena",
  tips: "Tips",
  whale_alert: "Whale Alert",
  onchain: "On-chain",
  news: "News",
  fx: "FX",
  macro_calendar: "Macro Calendar",
  watchlist: "Watchlist",
  journal: "Journal",
  referral: "Referral",
  profile: "Profile",
  analytics: "Analytics",
};
const featLabel = (f) => FEATURE_LABEL[f] || f;

const ActivityPulse = ({ userId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    growthApi
      .getUserActivity(userId)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  if (loading) {
    return (
      <Section title="Activity Pulse" Icon={ClockIcon}>
        <div className="flex items-center justify-center py-6">
          <span
            className="inline-block w-4 h-4 rounded-full animate-spin"
            style={{ border: "2px solid rgba(45,212,191,0.25)", borderTopColor: "#2dd4bf" }}
          />
        </div>
      </Section>
    );
  }
  if (!data || data.error) return null;

  const spark = data.sparkline_30d || [];
  const maxC = spark.reduce((m, p) => Math.max(m, p.count), 0) || 1;
  const score = data.engagement_score ?? 0;
  const scoreColor = score >= 60 ? "#34d399" : score >= 30 ? "#fbbf24" : "rgb(var(--fg-muted))";

  return (
    <Section title="Activity Pulse" Icon={ClockIcon}>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatTile label="Engagement" value={score} accent={scoreColor} />
        <StatTile label="Last seen" value={relativeTime(data.last_active_at)} />
        <StatTile label="Active days (30d)" value={data.active_days_30d ?? 0} />
        <StatTile label="Sessions" value={data.total_sessions ?? 0} />
      </div>

      {/* 30-day sparkline */}
      <div
        className="rounded-lg px-3 py-2.5"
        style={{ background: "rgb(var(--ink) / 0.02)", border: "1px solid rgb(var(--ink) / 0.04)" }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-[9px] uppercase tracking-wider font-semibold"
            style={{ color: "rgb(var(--ink) / 0.35)" }}
          >
            Last 30 days
          </span>
          <span className="text-[9px]" style={{ color: "rgb(var(--fg-muted))" }}>
            {data.events_30d ?? 0} actions
          </span>
        </div>
        <div className="flex items-end gap-[2px]" style={{ height: 36 }}>
          {spark.map((p, i) => (
            <div
              key={i}
              title={`${p.date}: ${p.count}`}
              className="flex-1 rounded-sm"
              style={{
                height: `${Math.max(6, (p.count / maxC) * 100)}%`,
                background: p.count > 0 ? "#2dd4bf" : "rgb(var(--ink) / 0.05)",
                opacity: p.count > 0 ? 0.85 : 1,
              }}
            />
          ))}
        </div>
      </div>

      {/* Top features */}
      {data.top_features && data.top_features.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
          {data.top_features.map((f) => (
            <span
              key={f.feature}
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium"
              style={{ background: "rgba(45,212,191,0.1)", color: "#2dd4bf" }}
            >
              {featLabel(f.feature)} ·{f.count}
            </span>
          ))}
        </div>
      )}
    </Section>
  );
};

/* ════════════════════════════════════════
 VIP Access Diagnostic — translates 5 raw columns into a verdict + action
 ════════════════════════════════════════ */

const hasActiveAccess = (user) => {
  if (["admin", "co_admin", "founder"].includes(user.role)) return true;
  if (!["premium", "subscriber"].includes(user.role)) return false;
  if (!user.subscription_expires_at) return true; // lifetime
  return new Date(user.subscription_expires_at) > new Date();
};

const computeVipDiagnosis = (user) => {
  const active = hasActiveAccess(user);
  const hasTg = !!user.telegram_id;
  const inGroup = !!user.telegram_in_group;
  const graceUntil = user.telegram_grace_until ? new Date(user.telegram_grace_until) : null;
  const inGrace = graceUntil && graceUntil > new Date();
  const expDate = user.subscription_expires_at
    ? formatDate(user.subscription_expires_at)
    : "Lifetime";

  // healthy
  if (active && hasTg && inGroup) {
    return {
      tone: "ok",
      color: "rgb(var(--pos-text))",
      icon: "check",
      title: "Healthy — active access & inside the VIP group",
      detail: "No action needed.",
      action: null,
      signals: { access: `Active · ${expDate}`, tg: "Linked", group: "Inside" },
    };
  }
  // active + linked + outside -> invite
  if (active && hasTg && !inGroup) {
    return {
      tone: "warn",
      color: "rgb(var(--accent-text))",
      icon: "alert",
      title: "Paid & Telegram linked, but outside the group",
      detail:
        "Telegram is linked and access is active, but they haven't joined (or have left) the VIP group. Generate an invite link to re-invite them.",
      action: "invite",
      signals: { access: `Active · ${expDate}`, tg: "Linked", group: "Outside" },
    };
  }
  // active + no telegram -> link first
  if (active && !hasTg) {
    return {
      tone: "info",
      color: "#5aa9e6",
      icon: "telegram",
      title: "Paid, but Telegram not linked yet",
      detail:
        "User signed in via Google/Discord and has paid, but hasn't connected Telegram — so they can't be invited to the VIP group yet. Ask them to link Telegram in their profile first.",
      action: "email_link_tg",
      signals: { access: `Active · ${expDate}`, tg: "Not linked", group: "n/a" },
    };
  }
  // expired + in grace + inside
  if (!active && inGroup && inGrace) {
    return {
      tone: "warn",
      color: "rgb(var(--warn))",
      icon: "alert",
      title: "Expired — in grace period",
      detail: `Subscription has lapsed but is still within the grace period. They'll be auto-kicked when grace ends (${formatDate(user.telegram_grace_until)}).`,
      action: null,
      signals: { access: "Expired (grace)", tg: hasTg ? "Linked" : "Not linked", group: "Inside" },
    };
  }
  // expired + inside + no grace -> anomaly (should be kicked)
  if (!active && inGroup && !inGrace) {
    return {
      tone: "danger",
      color: "rgb(var(--neg-text))",
      icon: "alert",
      title: "Expired but still inside the group",
      detail:
        "Subscription has ended and grace has passed, yet the user is still in the VIP group. The worker should have kicked them — check subscription_worker, or kick manually.",
      action: null,
      signals: {
        access: "Expired",
        tg: hasTg ? "Linked" : "Not linked",
        group: "Inside (anomaly)",
      },
    };
  }
  // free / no access, outside
  return {
    tone: "neutral",
    color: "rgb(var(--fg-muted))",
    icon: "user",
    title: "No active access",
    detail: "User has no active access. Being outside the VIP group is expected.",
    action: null,
    signals: {
      access: "None",
      tg: hasTg ? "Linked" : "Not linked",
      group: inGroup ? "Inside" : "Outside",
    },
  };
};

const SignalCell = ({ label, value, good }) => (
  <div style={{ background: "rgb(var(--ink) / 0.03)", borderRadius: 6, padding: "8px" }}>
    <div
      className="text-[9px] uppercase tracking-wider mb-0.5"
      style={{ color: "rgb(var(--ink) / 0.35)" }}
    >
      {label}
    </div>
    <div
      className="text-[12px] font-medium"
      style={{
        color: good === true ? "#34d399" : good === false ? "#f87171" : "rgb(var(--ink) / 0.45)",
      }}
    >
      {value}
    </div>
  </div>
);

const VipDiagnostic = ({ user, onInvited, onToast, canWrite = true }) => {
  const [busy, setBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const d = computeVipDiagnosis(user);

  const tg = !!user.telegram_id;
  const inGroup = !!user.telegram_in_group;
  const active = hasActiveAccess(user);

  const handleInvite = async () => {
    setBusy(true);
    try {
      const res = await adminApi.generateVipInvite(user.id);
      if (res.already_member) {
        onToast?.("User is already a member of the VIP group.", "success");
        onInvited?.();
      } else if (res.invite_link) {
        setInviteLink(res.invite_link);
        try {
          await navigator.clipboard.writeText(res.invite_link);
        } catch {}
        onToast?.("Invite link created & copied to clipboard.", "success");
      }
    } catch (e) {
      onToast?.(e.response?.data?.detail || "Failed to create invite link", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyLinkTgMsg = async () => {
    const msg = `Hi! Your LuxQuant subscription is active. To join the VIP signal group on Telegram, please connect your Telegram account first on the Profile page (Settings → Connected Accounts → Telegram → Link), then click "Join VIP Group". Thanks!`;
    try {
      await navigator.clipboard.writeText(msg);
      onToast?.("Instructions copied to clipboard.", "success");
    } catch {
      onToast?.("Failed to copy", "error");
    }
  };

  const [fuBusy, setFuBusy] = useState(false);
  const handleFollowup = async () => {
    setFuBusy(true);
    try {
      const res = await adminApi.vipFollowup(user.id);
      if (res.ok) {
        onToast?.("Follow-up sent to @" + (user.username || user.id) + " via bot.", "success");
        if (res.invite_link) setInviteLink(res.invite_link);
        onInvited?.();
      } else if (res.reason === "dm_failed") {
        onToast?.(
          "Bot could not DM this user (they haven't /started the bot). Link created anyway.",
          "error"
        );
        if (res.invite_link) setInviteLink(res.invite_link);
      } else if (res.reason === "already_member") {
        onToast?.("User is already in the VIP group.", "success");
        onInvited?.();
      } else {
        onToast?.(res.message || "Follow-up failed.", "error");
      }
    } catch (e) {
      onToast?.(e.response?.data?.detail || "Follow-up failed.", "error");
    } finally {
      setFuBusy(false);
    }
  };

  return (
    <Section title="VIP Access Diagnostic" Icon={AlertTriangleIcon}>
      <div
        style={{
          background: `${d.color}0f`,
          border: `1px solid ${d.color}4d`,
          borderRadius: 10,
          padding: 14,
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangleIcon size={16} style={{ color: d.color }} />
          <span className="text-[13px] font-medium" style={{ color: d.color }}>
            {d.title}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2.5">
          <SignalCell label="Paid access" value={d.signals.access} good={active} />
          <SignalCell label="Telegram" value={d.signals.tg} good={tg} />
          <SignalCell
            label="VIP group"
            value={d.signals.group}
            good={inGroup ? true : d.signals.group === "n/a" ? null : false}
          />
        </div>
        <div
          className="text-[12px] leading-relaxed mb-3"
          style={{ color: "rgb(var(--ink) / 0.6)" }}
        >
          {d.detail}
        </div>

        {canWrite && d.action === "invite" && !inviteLink && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleFollowup}
              disabled={fuBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold"
              style={{
                background: "#34d39924",
                color: "rgb(var(--pos-text))",
                border: "1px solid #34d3994d",
                cursor: fuBusy ? "wait" : "pointer",
              }}
            >
              <SendIcon size={13} /> {fuBusy ? "Sending…" : "Send follow-up via bot"}
            </button>
            <button
              onClick={handleInvite}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold"
              style={{
                background: `${d.color}24`,
                color: d.color,
                border: `1px solid ${d.color}4d`,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              <ExternalLinkIcon size={13} /> {busy ? "Generating…" : "Just generate link"}
            </button>
          </div>
        )}
        {!canWrite && d.action && (
          <p className="text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
            View-only — invite / follow-up actions are disabled.
          </p>
        )}
        {canWrite && d.action === "email_link_tg" && (
          <button
            onClick={handleCopyLinkTgMsg}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold"
            style={{
              background: `${d.color}24`,
              color: d.color,
              border: `1px solid ${d.color}4d`,
              cursor: "pointer",
            }}
          >
            <SendIcon size={13} /> Copy "connect Telegram" message
          </button>
        )}
        {inviteLink && (
          <div
            className="mt-2 p-2 rounded-md text-[11px] break-all"
            style={{
              background: "rgb(var(--ink) / 0.04)",
              color: "rgb(var(--pos-text))",
              border: "1px solid rgba(52,211,153,0.3)",
            }}
          >
            <div
              className="text-[9px] uppercase tracking-wider mb-1"
              style={{ color: "rgb(var(--ink) / 0.4)" }}
            >
              Invite link (copied · valid 1 hour)
            </div>
            {inviteLink}
          </div>
        )}
      </div>
    </Section>
  );
};

/* ════════════════════════════════════════
 Account Timeline — chronological lifecycle from existing data
 ════════════════════════════════════════ */

const TimelineRow = ({ icon: Icon, color, label, date, last }) => (
  <div className="flex gap-3">
    <div className="flex flex-col items-center">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${color}1a`, border: `1px solid ${color}4d` }}
      >
        <Icon size={11} style={{ color }} />
      </div>
      {!last && (
        <div className="w-px flex-1 my-1" style={{ background: "rgb(var(--ink) / 0.08)" }} />
      )}
    </div>
    <div className="pb-3 min-w-0">
      <div className="text-[12px] font-medium text-text-primary/80">{label}</div>
      <div className="text-[10px] tabular-nums" style={{ color: "rgb(var(--ink) / 0.4)" }}>
        {date}
      </div>
    </div>
  </div>
);

const AccountTimeline = ({ data }) => {
  const { user, payments } = data;
  const events = [];

  if (user.created_at)
    events.push({
      ts: user.created_at,
      icon: SparklesIcon,
      color: "rgb(var(--accent-text))",
      label: `Account created (via ${user.auth_provider || "unknown"})`,
    });
  if (user.first_login_at)
    events.push({
      ts: user.first_login_at,
      icon: UserIcon,
      color: "#5aa9e6",
      label: "First login",
    });

  (payments || [])
    .filter((p) => p.status === "confirmed")
    .forEach((p) => {
      events.push({
        ts: p.verified_at || p.created_at,
        icon: StarIcon,
        color: "rgb(var(--pos-text))",
        label: `Payment confirmed${p.plan_label ? ` · ${p.plan_label}` : ""} ($${p.final_amount || p.amount_usdt})`,
      });
    });

  if (user.subscription_granted_at)
    events.push({
      ts: user.subscription_granted_at,
      icon: StarIcon,
      color: "rgb(var(--warn))",
      label: `Subscription granted${user.subscription_source ? ` (${user.subscription_source})` : ""}`,
    });
  if (user.subscription_expires_at)
    events.push({
      ts: user.subscription_expires_at,
      icon: ClockIcon,
      color: new Date(user.subscription_expires_at) > new Date() ? "#34d399" : "#f87171",
      label:
        new Date(user.subscription_expires_at) > new Date()
          ? "Subscription valid until"
          : "Subscription expired",
    });

  events.sort((a, b) => new Date(a.ts) - new Date(b.ts));

  if (events.length === 0) return null;

  return (
    <Section title="Account Timeline" Icon={ClockIcon}>
      <div className="pl-0.5">
        {events.map((e, i) => (
          <TimelineRow
            key={i}
            icon={e.icon}
            color={e.color}
            label={e.label}
            date={formatDateTime(e.ts)}
            last={i === events.length - 1}
          />
        ))}
      </div>
    </Section>
  );
};

/* ════════════════════════════════════════
 Tab 1: Overview
 ════════════════════════════════════════ */

/* -- Follow-up history timeline (CRM) ------------------------------- */
// hex -> rgba helper (avoids external tint dependency)
const _fuRgba = (hex, a) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16),
    g = parseInt(h.slice(2, 4), 16),
    b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};
const FU_STATUS = {
  pending: { color: "rgb(var(--warn))", label: "Pending" },
  in_progress: { color: "#5aa9e6", label: "In progress" },
  done: { color: "rgb(var(--pos-text))", label: "Done" },
  cancelled: { color: "rgb(var(--fg-muted))", label: "Cancelled" },
};

const FollowupTimeline = ({ userId }) => {
  const [items, setItems] = useState(null);

  useEffect(() => {
    let alive = true;
    workspaceApi
      .listFollowups({ user_id: userId })
      .then((res) => {
        if (alive) setItems(res?.items || []);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  return (
    <Section title="Follow-up History" Icon={ClockIcon}>
      {items === null ? (
        <p className="text-[11px] text-text-muted/40">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-[11px] text-text-muted/40">No follow-ups for this user yet.</p>
      ) : (
        <div className="space-y-0">
          {items.map((f, idx) => {
            const st = FU_STATUS[f.status] || FU_STATUS.pending;
            const isLast = idx === items.length - 1;
            return (
              <div key={f.id} className="flex gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <span
                    className="rounded-full mt-1"
                    style={{
                      width: 9,
                      height: 9,
                      background: st.color,
                      boxShadow: `0 0 6px ${_fuRgba(st.color, 0.5)}`,
                    }}
                  />
                  {!isLast && (
                    <span
                      className="flex-1 w-px my-1"
                      style={{ background: "rgb(var(--ink) / 0.08)" }}
                    />
                  )}
                </div>
                <div className="pb-4 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-text-primary">{f.title}</span>
                    <span
                      className="text-[8px] uppercase font-bold tracking-wider px-1.5 py-px rounded"
                      style={{
                        background: _fuRgba(st.color, 0.12),
                        color: st.color,
                        border: `1px solid ${_fuRgba(st.color, 0.25)}`,
                      }}
                    >
                      {st.label}
                    </span>
                    {f.priority === "urgent" && (
                      <span
                        className="text-[8px] uppercase font-bold tracking-wider px-1.5 py-px rounded"
                        style={{
                          background: _fuRgba("#f87171", 0.12),
                          color: "rgb(var(--neg-text))",
                        }}
                      >
                        Urgent
                      </span>
                    )}
                  </div>
                  {f.note && (
                    <p className="text-[11px] text-text-muted/60 mt-1 leading-relaxed">{f.note}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-text-muted/40 flex-wrap">
                    {f.category && <span>{f.category}</span>}
                    {f.category && <span>{"·"}</span>}
                    <span>{formatDate(f.created_at)}</span>
                    {f.creator?.username && (
                      <>
                        <span>{"·"}</span>
                        <span>by {f.creator.username}</span>
                      </>
                    )}
                    {f.completed_at && (
                      <>
                        <span>{"·"}</span>
                        <span>done {relativeTime(f.completed_at)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
};

const OverviewTab = ({
  data,
  onUserUpdated,
  onToast,
  canWrite = true,
  canManageRoles = false,
  onSetRole,
}) => {
  const { user } = data;
  return (
    <div className="space-y-6">
      <UserHero user={user} />

      {canManageRoles && onSetRole && (
        <div
          className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5"
          style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.22)" }}
        >
          <div>
            <p className="text-[11px] font-semibold text-text-primary/90">Staff / member role</p>
            <p className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
              Current:{" "}
              <span className="uppercase font-bold tracking-wider text-text-primary/70">
                {user.role}
              </span>
              {" · "}admin full · co_admin/founder view-only
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSetRole(user)}
            className="shrink-0 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
            style={{
              background: "rgba(168,85,247,0.16)",
              color: "#c4b5fd",
              border: "1px solid rgba(168,85,247,0.35)",
            }}
          >
            Set role
          </button>
        </div>
      )}

      <VipDiagnostic user={user} onInvited={onUserUpdated} onToast={onToast} canWrite={canWrite} />

      <Section title="Account Info" Icon={UserIcon}>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="User ID" value={`#${user.id}`} />
          <StatTile label="Created" value={formatDate(user.created_at)} />
          <StatTile label="First Login" value={formatDate(user.first_login_at)} />
          <StatTile label="Last Login" value={relativeTime(user.last_login_at)} />
          <StatTile label="Login Count" value={user.login_count || 0} />
          <StatTile label="Country" value={user.country_code || "—"} />
        </div>
      </Section>

      <ActivityPulse userId={user.id} />
      <FollowupTimeline userId={user.id} />

      <AccountTimeline data={data} />

      {user.role === "subscriber" && (
        <Section title="Subscription" Icon={StarIcon}>
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Expires"
              value={
                user.subscription_expires_at ? formatDate(user.subscription_expires_at) : "Lifetime"
              }
              accent={user.subscription_expires_at ? "#34d399" : "#fbbf24"}
            />
            <StatTile label="Granted" value={formatDate(user.subscription_granted_at)} />
          </div>
        </Section>
      )}

      {user.referral_credit_usdt > 0 && (
        <Section title="Referral Credit" Icon={SparklesIcon}>
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Balance" value={`$${user.referral_credit_usdt}`} accent="#34d399" />
            <StatTile
              label="Lifetime Earned"
              value={`$${user.lifetime_credit_earned}`}
              accent="#fbbf24"
            />
          </div>
        </Section>
      )}
    </div>
  );
};

/* ════════════════════════════════════════
 Tab 2: Contact (channels + edit + admin notes)
 ════════════════════════════════════════ */

const ContactTab = ({ data, onContactUpdate, canWrite = true }) => {
  const { user, reach, enriched_by_user } = data;

  const [editing, setEditing] = useState(false);
  const [adminTg, setAdminTg] = useState(user.admin_telegram_username || "");
  const [adminDc, setAdminDc] = useState(user.admin_discord_handle || "");
  const [adminNotes, setAdminNotes] = useState(user.admin_notes || "");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  useEffect(() => {
    setAdminTg(user.admin_telegram_username || "");
    setAdminDc(user.admin_discord_handle || "");
    setAdminNotes(user.admin_notes || "");
    setEditing(false);
    setSaveErr(null);
  }, [user.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaveErr(null);
    try {
      await onContactUpdate({
        admin_telegram_username: adminTg.trim() || null,
        admin_discord_handle: adminDc.trim() || null,
        admin_notes: adminNotes.trim() || null,
      });
      setEditing(false);
    } catch (err) {
      setSaveErr(err.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setAdminTg(user.admin_telegram_username || "");
    setAdminDc(user.admin_discord_handle || "");
    setAdminNotes(user.admin_notes || "");
    setEditing(false);
    setSaveErr(null);
  };

  const hasUnsavedChanges =
    adminTg !== (user.admin_telegram_username || "") ||
    adminDc !== (user.admin_discord_handle || "") ||
    adminNotes !== (user.admin_notes || "");

  const hasAnyChannel =
    reach.telegram.available || reach.discord.available || reach.email.available;

  return (
    <div className="space-y-6">
      <Section
        title="Contact Channels"
        Icon={BroadcastIcon}
        action={
          canWrite &&
          !editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded font-semibold uppercase tracking-wider transition-colors hover:bg-accent/10"
              style={{
                color: "rgb(var(--accent-text))",
                background: "rgb(var(--accent) / 0.06)",
                border: "1px solid rgb(var(--line) / 0.22)",
              }}
            >
              <EditIcon size={11} />
              Edit
            </button>
          )
        }
      >
        {!editing ? (
          <div className="space-y-2">
            {reach.telegram.available && (
              <ContactBadge
                channel="telegram"
                value={reach.telegram.value}
                deepLink={reach.telegram.deep_link}
                source={reach.telegram.source}
                botReady={reach.telegram.bot_ready}
              />
            )}
            {reach.discord.available && (
              <ContactBadge
                channel="discord"
                value={reach.discord.value}
                deepLink={reach.discord.deep_link}
                source={reach.discord.source}
              />
            )}
            {reach.email.available && (
              <ContactBadge
                channel="email"
                value={reach.email.value}
                deepLink={reach.email.deep_link}
                source={reach.email.source}
              />
            )}
            {!hasAnyChannel && (
              <div
                className="text-xs p-3 rounded-lg flex items-start gap-2"
                style={{
                  background: "rgba(248,113,113,0.05)",
                  color: "rgb(var(--neg-text))",
                  border: "1px solid rgba(248,113,113,0.18)",
                }}
              >
                <AlertTriangleIcon size={13} className="shrink-0 mt-0.5" />
                <span>
                  No contact channels available. Click <strong>Edit</strong> to add a Telegram or
                  Discord handle manually.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div
            className="space-y-3 rounded-lg p-3"
            style={{
              background: "rgb(var(--accent) / 0.04)",
              border: "1px solid rgb(var(--line) / 0.2)",
            }}
          >
            <div>
              <label
                className="text-[10px] uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5"
                style={{ color: "rgb(var(--accent-text))" }}
              >
                <TelegramIcon size={11} colored />
                Admin Telegram Note
              </label>
              <input
                type="text"
                value={adminTg}
                onChange={(e) => setAdminTg(e.target.value)}
                placeholder="username (without @)"
                className="w-full px-2.5 py-1.5 rounded-md text-xs text-text-primary focus:outline-none font-mono"
                style={{
                  background: "rgb(var(--scrim) / 0.3)",
                  border: "1px solid rgb(var(--ink) / 0.1)",
                }}
              />
              {user.telegram_username && (
                <p
                  className="text-[10px] mt-1 flex items-center gap-1"
                  style={{ color: "rgb(var(--pos-text))" }}
                >
                  <span style={{ color: "rgb(var(--fg-muted))" }}>Real username (from login):</span>
                  <strong>@{user.telegram_username}</strong>
                </p>
              )}
              {!user.telegram_username && (
                <p className="text-[9px] mt-1" style={{ color: "rgb(var(--fg-muted))" }}>
                  No login-linked Telegram yet — admin note used as fallback.
                </p>
              )}
            </div>

            <div>
              <label
                className="text-[10px] uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5"
                style={{ color: "rgb(var(--accent-text))" }}
              >
                <DiscordIcon size={11} colored />
                Discord Handle
              </label>
              <input
                type="text"
                value={adminDc}
                onChange={(e) => setAdminDc(e.target.value)}
                placeholder="username or numeric ID"
                className="w-full px-2.5 py-1.5 rounded-md text-xs text-text-primary focus:outline-none font-mono"
                style={{
                  background: "rgb(var(--scrim) / 0.3)",
                  border: "1px solid rgb(var(--ink) / 0.1)",
                }}
              />
              {user.discord_id && (
                <p className="text-[9px] mt-1" style={{ color: "rgb(var(--fg-muted))" }}>
                  OAuth ID: {user.discord_id}
                </p>
              )}
            </div>

            <div>
              <label
                className="block text-[10px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "rgb(var(--accent-text))" }}
              >
                Admin Notes
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                placeholder="VIP customer, prefers TG. Pays annually on each renewal…"
                className="w-full px-2.5 py-1.5 rounded-md text-xs text-text-primary focus:outline-none resize-none"
                style={{
                  background: "rgb(var(--scrim) / 0.3)",
                  border: "1px solid rgb(var(--ink) / 0.1)",
                }}
              />
            </div>

            {saveErr && (
              <div
                className="text-xs px-2 py-1.5 rounded flex items-start gap-2"
                style={{
                  background: "rgba(248,113,113,0.1)",
                  color: "rgb(var(--neg-text))",
                  border: "1px solid rgba(248,113,113,0.3)",
                }}
              >
                <AlertTriangleIcon size={12} className="shrink-0 mt-0.5" />
                {saveErr}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <GhostButton onClick={handleCancel} disabled={saving} className="flex-1">
                Cancel
              </GhostButton>
              <GoldButton
                onClick={handleSave}
                disabled={saving || !hasUnsavedChanges}
                className="flex-1"
              >
                {saving ? "Saving…" : hasUnsavedChanges ? "Save Changes" : "No Changes"}
              </GoldButton>
            </div>
          </div>
        )}

        {/* Audit trail */}
        {user.admin_enriched_at && enriched_by_user && (
          <div
            className="mt-1.5 text-[10px] flex items-center gap-1.5"
            style={{ color: "rgb(var(--fg-muted))" }}
          >
            <SparklesIcon size={10} style={{ color: "rgb(var(--accent-text))" }} />
            <span>
              Enriched by{" "}
              <strong style={{ color: "rgb(var(--accent-text))" }}>
                @{enriched_by_user.username}
              </strong>{" "}
              on {formatDateTime(user.admin_enriched_at)}
            </span>
          </div>
        )}
      </Section>

      {/* Admin notes (view-only when not editing) */}
      {!editing && user.admin_notes && (
        <Section title="Admin Notes" Icon={EditIcon}>
          <div
            className="text-xs p-3 rounded-lg whitespace-pre-wrap"
            style={{
              background: "rgb(var(--ink) / 0.02)",
              border: "1px solid rgb(var(--ink) / 0.05)",
              color: "rgb(var(--fg-secondary))",
              lineHeight: "1.5",
            }}
          >
            {user.admin_notes}
          </div>
        </Section>
      )}
    </div>
  );
};

/* ════════════════════════════════════════
 Tab 3: Payments
 ════════════════════════════════════════ */

const PaymentsTab = ({ data }) => {
  const { payments } = data;

  if (!payments || payments.length === 0) {
    return (
      <EmptyState
        Icon={StarIcon}
        title="No payment history"
        hint="Confirmed and pending payments will appear here."
      />
    );
  }

  const totalConfirmed = payments
    .filter((p) => p.status === "confirmed")
    .reduce((sum, p) => sum + (p.final_amount || p.amount_usdt || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <div
          className="relative overflow-hidden rounded-lg p-3"
          style={{
            background: "rgba(52,211,153,0.04)",
            border: "1px solid rgba(52,211,153,0.18)",
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background:
                "linear-gradient(to right, transparent, rgba(52,211,153,0.4), transparent)",
            }}
          />
          <p
            className="text-[10px] uppercase tracking-wider font-semibold mb-1"
            style={{ color: "rgb(var(--pos-text))" }}
          >
            Total Paid
          </p>
          <p
            className="text-xl font-light tabular-nums tracking-tight"
            style={{ color: "rgb(var(--pos-text))" }}
          >
            ${totalConfirmed.toFixed(2)}
          </p>
        </div>
        <div
          className="relative overflow-hidden rounded-lg p-3"
          style={{
            background: "rgb(var(--accent) / 0.04)",
            border: "1px solid rgb(var(--line) / 0.15)",
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background:
                "linear-gradient(to right, transparent, rgb(var(--accent) / 0.4), transparent)",
            }}
          />
          <p
            className="text-[10px] uppercase tracking-wider font-semibold mb-1"
            style={{ color: "rgb(var(--accent-text))" }}
          >
            Records
          </p>
          <p
            className="text-xl font-light tabular-nums tracking-tight"
            style={{ color: "rgb(var(--accent-text))" }}
          >
            {payments.length}
          </p>
        </div>
      </div>

      <Section title="Payment History" Icon={ClockIcon}>
        <div className="space-y-1.5">
          {payments.map((p) => (
            <div
              key={p.id}
              className="rounded-lg p-2.5"
              style={{
                background: "rgb(var(--ink) / 0.018)",
                border: "1px solid rgb(var(--ink) / 0.04)",
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-text-primary truncate">
                    {p.plan_label || `Plan #${p.id}`}
                  </p>
                  <p className="text-[11px] tabular-nums" style={{ color: "rgb(var(--fg-muted))" }}>
                    ${(p.final_amount || p.amount_usdt).toFixed(2)}
                    {p.credit_redeemed > 0 && (
                      <span className="text-[10px] ml-1.5" style={{ color: "rgb(var(--warn))" }}>
                        (−${p.credit_redeemed.toFixed(2)} credit)
                      </span>
                    )}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div
                className="flex items-center gap-3 text-[10px] flex-wrap"
                style={{ color: "rgb(var(--fg-muted))" }}
              >
                <span className="tabular-nums">{formatDateTime(p.created_at)}</span>
                {p.tx_hash && (
                  <a
                    href={`https://bscscan.com/tx/${p.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline font-mono"
                    style={{ color: "#8a8a93" }}
                  >
                    {p.tx_hash.slice(0, 8)}…{p.tx_hash.slice(-6)}
                    <ExternalLinkIcon size={10} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
};

/* ════════════════════════════════════════
 Tab 4: Referral
 ════════════════════════════════════════ */

const ReferralTab = ({ data }) => {
  const { as_referrer, as_referred } = data;

  if ((!as_referrer || as_referrer.length === 0) && !as_referred) {
    return (
      <EmptyState
        Icon={SparklesIcon}
        title="No referral activity"
        hint="This user hasn't referred anyone, and wasn't referred either."
      />
    );
  }

  return (
    <div className="space-y-4">
      {as_referred && (
        <Section title="Referred By" Icon={SparklesIcon}>
          <div
            className="rounded-lg p-3 flex items-center justify-between"
            style={{
              background: "rgba(138,138,147,0.04)",
              border: "1px solid rgba(138,138,147,0.18)",
            }}
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-text-primary truncate">
                @{as_referred.referrer_username}
              </p>
              <p className="text-[10px] tabular-nums" style={{ color: "rgb(var(--fg-muted))" }}>
                Joined via: {formatDate(as_referred.created_at)}
              </p>
            </div>
            <span
              className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded shrink-0"
              style={{
                background: "rgba(138,138,147,0.15)",
                color: "#8a8a93",
                border: "1px solid rgba(138,138,147,0.3)",
              }}
            >
              {as_referred.status}
            </span>
          </div>
        </Section>
      )}

      {as_referrer && as_referrer.length > 0 && (
        <Section title={`Referred Users (${as_referrer.length})`} Icon={SparklesIcon}>
          <div className="space-y-1.5">
            {as_referrer.map((r) => (
              <div
                key={r.id}
                className="rounded-lg p-2.5 flex items-center justify-between"
                style={{
                  background: "rgba(52,211,153,0.03)",
                  border: "1px solid rgba(52,211,153,0.15)",
                }}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-primary truncate">
                    @{r.referee_username || "unknown"}
                  </p>
                  <p className="text-[10px] tabular-nums" style={{ color: "rgb(var(--fg-muted))" }}>
                    {formatDate(r.created_at)} · {r.total_payments || 0} payment(s)
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {r.total_commission_earned > 0 && (
                    <p
                      className="text-xs font-bold tabular-nums"
                      style={{ color: "rgb(var(--pos-text))" }}
                    >
                      ${r.total_commission_earned.toFixed(2)}
                    </p>
                  )}
                  <p
                    className="text-[9px] uppercase tracking-wider"
                    style={{ color: "rgb(var(--fg-muted))" }}
                  >
                    {r.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

/* ════════════════════════════════════════
 Tab 5: Outreach
 ════════════════════════════════════════ */

const OutreachTab = ({ data, templates, canWrite = true }) => {
  const { user, reach } = data;
  const hasAnyChannel =
    reach.telegram.available || reach.discord.available || reach.email.available;

  if (!canWrite) {
    return (
      <EmptyState
        Icon={BroadcastIcon}
        title="View-only"
        hint="Outreach send actions are disabled for co-admin / founder."
      />
    );
  }

  if (!hasAnyChannel) {
    return (
      <EmptyState
        Icon={BroadcastIcon}
        title="No contact channels"
        hint="Add a Telegram or Discord handle on the Contact tab first."
      />
    );
  }

  return (
    <div>
      <p className="text-[11px] mb-3" style={{ color: "rgb(var(--fg-muted))" }}>
        Pick a template to DM <strong className="text-text-primary">@{user.username}</strong>. Click{" "}
        <strong style={{ color: "rgb(var(--accent-text))" }}>Send</strong> to copy the message and
        open the channel.
      </p>
      <QuickSendPopover user={user} templates={templates} reach={reach} inline />
    </div>
  );
};

/* ════════════════════════════════════════
 Main modal
 ════════════════════════════════════════ */

const TABS = [
  { id: "overview", label: "Overview", Icon: UserIcon },
  { id: "contact", label: "Contact", Icon: BroadcastIcon },
  { id: "payments", label: "Payments", Icon: StarIcon },
  { id: "referral", label: "Referral", Icon: SparklesIcon },
  { id: "outreach", label: "Outreach", Icon: SendIcon },
];

export const UserDetailDrawer = ({
  userId,
  onClose,
  onUserUpdated,
  onToast,
  templates,
  canWrite = true,
  canManageRoles = false,
  onSetRole,
}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setErr(null);
    try {
      const result = await adminApi.getUserFull(userId);
      setData(result);
    } catch (e) {
      setErr(e.response?.data?.detail || "Failed to load user detail");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll while modal open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleContactUpdate = async (payload) => {
    if (!canWrite) throw new Error("View-only staff cannot edit contact");
    const result = await adminApi.updateUserContact(userId, payload);
    await fetchData();
    if (onUserUpdated) onUserUpdated(result.user);
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center p-0 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        background: "rgb(var(--scrim) / 0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 2147483646,
      }}
    >
      <div
        className="w-full max-w-3xl max-h-[min(92dvh,100%)] h-[min(92dvh,100%)] sm:h-auto sm:max-h-[90vh] rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 fade-in duration-200"
        style={{
          background: "rgb(var(--surface-raised))",
          border: "1px solid rgb(var(--line) / 0.25)",
          boxShadow:
            "0 -20px 60px rgb(var(--scrim) / 0.35), 0 0 0 1px rgb(var(--accent) / 0.08), 0 0 80px -10px rgb(var(--accent) / 0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-0 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>
        {/* ── HEADER ── */}
        <div
          className="flex items-center justify-between px-5 py-3.5 shrink-0 relative"
          style={{
            background: "rgb(var(--surface-raised))",
            borderBottom: "1px solid rgb(var(--ink) / 0.05)",
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background:
                "linear-gradient(to right, transparent, rgb(var(--accent) / 0.35), transparent)",
            }}
          />
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: "rgb(var(--accent) / 0.1)",
                border: "1px solid rgb(var(--line) / 0.22)",
              }}
            >
              <UserIcon size={14} style={{ color: "rgb(var(--accent-text))" }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-text-primary tracking-tight leading-tight">
                User Detail
              </h2>
              {data?.user && (
                <p
                  className="text-[10px] font-mono tabular-nums leading-tight"
                  style={{ color: "rgb(var(--fg-muted))" }}
                >
                  @{data.user.username} · #{data.user.id}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:scale-105 shrink-0"
            style={{
              color: "rgb(var(--accent-text))",
              background: "rgb(var(--accent) / 0.08)",
              border: "1px solid rgb(var(--line) / 0.22)",
            }}
            title="Close (Esc)"
            aria-label="Close modal"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* ── TABS ── */}
        {data && (
          <div
            className="flex shrink-0 px-2 pt-1.5 overflow-x-auto"
            style={{
              background: "rgb(var(--surface-secondary))",
              borderBottom: "1px solid rgb(var(--ink) / 0.05)",
            }}
          >
            {TABS.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className="flex-1 min-w-[80px] py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors relative flex items-center justify-center gap-1.5"
                  style={{
                    color: isActive ? "rgb(var(--fg))" : "rgb(var(--fg-muted))",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.color = "#a89888";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.color = "rgb(var(--fg-muted))";
                  }}
                >
                  <Icon size={12} />
                  {label}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-3 right-3 h-0.5 rounded-t"
                      style={{
                        background:
                          "linear-gradient(90deg, transparent, rgb(var(--accent)), transparent)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto px-5 py-5 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div
                className="inline-flex items-center gap-2 text-xs"
                style={{ color: "rgb(var(--fg-muted))" }}
              >
                <div
                  className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                  style={{
                    borderColor: "rgb(var(--accent) / 0.3)",
                    borderTopColor: "rgb(var(--accent))",
                  }}
                />
                Loading…
              </div>
            </div>
          )}

          {err && (
            <div
              className="rounded-lg p-3 text-xs flex items-start gap-2"
              style={{
                background: "rgba(248,113,113,0.08)",
                color: "rgb(var(--neg-text))",
                border: "1px solid rgba(248,113,113,0.25)",
              }}
            >
              <AlertTriangleIcon size={14} className="shrink-0 mt-0.5" />
              {err}
            </div>
          )}

          {data && !loading && (
            <>
              {activeTab === "overview" && (
                <OverviewTab
                  data={data}
                  onUserUpdated={() => {
                    fetchData();
                    onUserUpdated && onUserUpdated();
                  }}
                  onToast={onToast}
                  canWrite={canWrite}
                  canManageRoles={canManageRoles}
                  onSetRole={onSetRole}
                />
              )}
              {activeTab === "contact" && (
                <ContactTab data={data} onContactUpdate={handleContactUpdate} canWrite={canWrite} />
              )}
              {activeTab === "payments" && <PaymentsTab data={data} />}
              {activeTab === "referral" && <ReferralTab data={data} />}
              {activeTab === "outreach" && (
                <OutreachTab data={data} templates={templates} canWrite={canWrite} />
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
