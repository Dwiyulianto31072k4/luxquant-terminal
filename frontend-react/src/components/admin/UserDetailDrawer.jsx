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
// Gate/Home visual polish — Tailwind semantic tokens, no gold hairlines/glows.

import { useState, useEffect, useCallback } from "react";
import { AutoTradeTab } from "./users/AutoTradeTab";
import { ChatTab } from "./users/ChatTab";
import { ActivityTab } from "./users/ActivityTab";
import { createPortal } from "react-dom";
import { adminApi } from "../../services/adminApi";
import { adminChatApi } from "../../services/adminChatApi";
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

const countryName = (code) => {
  if (!code) return "—";
  try {
    return `${code} · ${new Intl.DisplayNames(["en"], { type: "region" }).of(code)}`;
  } catch {
    return code;
  }
};

const detectedLocation = (user) =>
  [user.geo_city, user.geo_region, countryName(user.geo_country || user.country_code)]
    .filter((value, index, list) => value && value !== "—" && list.indexOf(value) === index)
    .join(" · ") || "—";

const STATUS_BADGE = {
  confirmed: "border-profit/25 bg-profit/10 text-profit",
  pending: "border-accent/25 bg-accent/10 text-accent",
  cancelled: "border-ink/15 bg-ink/[0.05] text-text-muted",
  failed: "border-loss/25 bg-loss/10 text-loss",
  refunded: "border-accent/25 bg-accent/10 text-accent",
};

const StatusBadge = ({ status }) => (
  <span
    className={`rounded-lg border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
      STATUS_BADGE[status] || STATUS_BADGE.cancelled
    }`}
  >
    {status}
  </span>
);

/* ════════════════════════════════════════
 Layout primitives
 ════════════════════════════════════════ */

const Section = ({ title, Icon, action, children }) => (
  <section className="space-y-2.5">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={12} className="text-text-muted" />}
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          {title}
        </h4>
      </div>
      {action}
    </div>
    {children}
  </section>
);

const StatTile = ({ label, value, accentClass }) => (
  <div className="overflow-hidden rounded-xl border border-ink/[0.08] bg-ink/[0.02] px-3 py-2">
    <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
      {label}
    </p>
    <p
      title={value == null ? undefined : String(value)}
      className={`truncate text-[13px] font-medium tabular-nums tracking-tight ${
        accentClass || "text-text-primary"
      }`}
    >
      {value ?? "—"}
    </p>
  </div>
);

const EmptyState = ({ Icon, title, hint }) => (
  <div className="py-16 text-center">
    <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-ink/[0.08] bg-ink/[0.04] text-text-muted">
      {Icon && <Icon size={20} />}
    </div>
    <p className="mb-1 text-sm font-semibold text-text-primary">{title}</p>
    {hint && <p className="text-[11.5px] text-text-muted">{hint}</p>}
  </div>
);

/* ════════════════════════════════════════
 Hero — pinned at top of Overview tab
 ════════════════════════════════════════ */

const ROLE_BADGE = {
  admin: "border-ink/20 bg-ink/[0.08] text-text-muted",
  co_admin: "border-ink/15 bg-ink/[0.06] text-text-muted",
  founder: "border-accent/25 bg-accent/10 text-accent",
  subscriber: "border-profit/25 bg-profit/10 text-profit",
  premium: "border-profit/25 bg-profit/10 text-profit",
  free: "border-ink/15 bg-ink/[0.05] text-text-muted",
};

const UserHero = ({ user }) => (
  <div className="flex items-start gap-4">
    <div
      className={`flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ink/[0.08] text-xl font-bold ${
        user.avatar_url ? "bg-transparent" : "bg-ink/[0.04] text-accent"
      }`}
    >
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
      ) : (
        user.username?.charAt(0).toUpperCase()
      )}
    </div>

    <div className="min-w-0 flex-1 pt-0.5">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="truncate text-lg font-semibold tracking-tight text-text-primary">
          {user.username}
        </h3>
        <ProviderIcon provider={user.auth_provider} size={14} />
      </div>
      <p className="truncate font-mono text-[11px] text-text-muted">{user.email}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span
          className={`rounded-lg border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
            ROLE_BADGE[user.role] || ROLE_BADGE.free
          }`}
        >
          {user.role}
        </span>
        <span className="rounded-lg border border-ink/[0.08] bg-ink/[0.04] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-text-muted">
          {user.auth_provider}
        </span>
        {!user.is_active && (
          <span className="rounded-lg border border-loss/25 bg-loss/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-loss">
            Banned
          </span>
        )}
        {user.subscription_source && (
          <span className="rounded-lg border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-accent">
            via {user.subscription_source}
          </span>
        )}
      </div>
    </div>
  </div>
);

const FEATURE_LABEL = {
  signals: "Signals",
  autotrade: "Agent",
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
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink/60" />
        </div>
      </Section>
    );
  }
  if (!data || data.error) return null;

  const spark = data.sparkline_30d || [];
  const maxC = spark.reduce((m, p) => Math.max(m, p.count), 0) || 1;
  const score = data.engagement_score ?? 0;
  const scoreClass =
    score >= 60 ? "text-profit" : score >= 30 ? "text-accent" : "text-text-muted";

  return (
    <Section title="Activity Pulse" Icon={ClockIcon}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <StatTile label="Engagement" value={score} accentClass={scoreClass} />
        <StatTile label="Last seen" value={relativeTime(data.last_active_at)} />
        <StatTile label="Active days (30d)" value={data.active_days_30d ?? 0} />
        <StatTile label="Sessions" value={data.total_sessions ?? 0} />
      </div>

      {/* 30-day sparkline */}
      <div className="rounded-xl border border-ink/[0.08] bg-ink/[0.02] px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
            Last 30 days
          </span>
          <span className="text-[9px] text-text-muted">{data.events_30d ?? 0} actions</span>
        </div>
        <div className="flex h-9 items-end gap-[2px]">
          {spark.map((p, i) => (
            <div
              key={i}
              title={`${p.date}: ${p.count}`}
              className={`flex-1 rounded-sm ${
                p.count > 0 ? "bg-text-muted/80" : "bg-ink/[0.05]"
              }`}
              style={{ height: `${Math.max(6, (p.count / maxC) * 100)}%` }}
            />
          ))}
        </div>
      </div>

      {/* Top features */}
      {data.top_features && data.top_features.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {data.top_features.map((f) => (
            <span
              key={f.feature}
              className="inline-flex items-center rounded-lg border border-ink/[0.08] bg-ink/[0.06] px-2 py-0.5 text-[10px] font-medium text-text-muted"
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

const DIAG_SHELL = {
  ok: "border-profit/25 bg-profit/10",
  warn: "border-accent/25 bg-accent/10",
  info: "border-ink/[0.08] bg-ink/[0.03]",
  danger: "border-loss/25 bg-loss/10",
  neutral: "border-ink/[0.08] bg-ink/[0.02]",
};

const DIAG_TEXT = {
  ok: "text-profit",
  warn: "text-accent",
  info: "text-text-muted",
  danger: "text-loss",
  neutral: "text-text-muted",
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

  // healthy — still allow kick if admin needs to force-remove
  if (active && hasTg && inGroup) {
    return {
      tone: "ok",
      icon: "check",
      title: "Healthy — active access & inside the VIP group",
      detail:
        "No action needed. You can still kick them from VIP (soft remove — they can rejoin later with a new invite).",
      action: "kick",
      signals: { access: `Active · ${expDate}`, tg: "Linked", group: "Inside" },
    };
  }
  // active + linked + outside -> invite
  if (active && hasTg && !inGroup) {
    return {
      tone: "warn",
      icon: "alert",
      title: "Paid & Telegram linked, but outside the group",
      detail:
        "Telegram is linked and access is active, but they haven't joined (or were removed). Generate an invite to re-invite — works even after a previous kick.",
      action: "invite",
      signals: { access: `Active · ${expDate}`, tg: "Linked", group: "Outside" },
    };
  }
  // active + no telegram -> link first
  if (active && !hasTg) {
    return {
      tone: "info",
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
      icon: "alert",
      title: "Expired — in grace period",
      detail: `Subscription has lapsed but is still within the grace period. Auto-kick when grace ends (${formatDate(user.telegram_grace_until)}), or kick now.`,
      action: "kick",
      signals: { access: "Expired (grace)", tg: hasTg ? "Linked" : "Not linked", group: "Inside" },
    };
  }
  // expired + inside + no grace -> anomaly (should be kicked)
  if (!active && inGroup && !inGrace) {
    return {
      tone: "danger",
      icon: "alert",
      title: "Expired but still inside the group",
      detail:
        "Subscription has ended and grace has passed, yet the user is still in the VIP group. Kick them now — soft remove so they can rejoin if they renew.",
      action: "kick",
      signals: {
        access: "Expired",
        tg: hasTg ? "Linked" : "Not linked",
        group: "Inside (anomaly)",
      },
    };
  }
  // free / no access, outside — or free but still inside
  if (!active && inGroup) {
    return {
      tone: "danger",
      icon: "alert",
      title: "No active access but still inside VIP",
      detail: "Kick them from the VIP group. Soft remove (can re-invite later).",
      action: "kick",
      signals: {
        access: "None",
        tg: hasTg ? "Linked" : "Not linked",
        group: "Inside",
      },
    };
  }
  // free / no access, outside
  return {
    tone: "neutral",
    icon: "user",
    title: "No active access",
    detail: "User has no active access. Being outside the VIP group is expected.",
    action: hasTg ? "invite_only" : null,
    signals: {
      access: "None",
      tg: hasTg ? "Linked" : "Not linked",
      group: inGroup ? "Inside" : "Outside",
    },
  };
};

const SignalCell = ({ label, value, good }) => (
  <div className="rounded-xl border border-ink/[0.08] bg-ink/[0.03] p-2">
    <div className="mb-0.5 text-[9px] uppercase tracking-wider text-text-muted">{label}</div>
    <div
      className={`text-[12px] font-medium ${
        good === true ? "text-profit" : good === false ? "text-loss" : "text-text-muted"
      }`}
    >
      {value}
    </div>
  </div>
);

const VipDiagnostic = ({ user, onInvited, onToast, canWrite = true }) => {
  const [busy, setBusy] = useState(false);
  const [kickBusy, setKickBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const [confirmKick, setConfirmKick] = useState(false);
  const d = computeVipDiagnosis(user);

  const tg = !!user.telegram_id;
  const inGroup = !!user.telegram_in_group;
  const active = hasActiveAccess(user);
  const textClass = DIAG_TEXT[d.tone] || DIAG_TEXT.neutral;
  const shellClass = DIAG_SHELL[d.tone] || DIAG_SHELL.neutral;

  const handleInvite = async () => {
    setBusy(true);
    setInviteLink(null);
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
        onToast?.("Invite link created & copied. Soft re-join — works after a kick.", "success");
      } else {
        onToast?.(res.message || "No invite link returned.", "error");
      }
    } catch (e) {
      onToast?.(e.response?.data?.detail || "Failed to create invite link", "error");
    } finally {
      setBusy(false);
    }
  };

  const handleKick = async () => {
    setKickBusy(true);
    try {
      const res = await adminApi.kickVip(user.id);
      onToast?.(
        res.message ||
          (res.already_out
            ? "Already outside the group."
            : "Kicked from VIP. They can rejoin with a new invite."),
        "success"
      );
      setConfirmKick(false);
      setInviteLink(null);
      onInvited?.(); // refresh drawer user flags
    } catch (e) {
      onToast?.(e.response?.data?.detail || "Kick failed", "error");
    } finally {
      setKickBusy(false);
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

  const showKick = canWrite && tg && inGroup;

  return (
    <Section title="VIP Access Diagnostic" Icon={AlertTriangleIcon}>
      <div className={`rounded-xl border p-3.5 ${shellClass}`}>
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangleIcon size={16} className={textClass} />
          <span className={`text-[13px] font-medium ${textClass}`}>{d.title}</span>
        </div>
        <div className="mb-2.5 grid grid-cols-3 gap-2">
          <SignalCell label="Paid access" value={d.signals.access} good={active} />
          <SignalCell label="Telegram" value={d.signals.tg} good={tg} />
          <SignalCell
            label="VIP group"
            value={d.signals.group}
            good={inGroup ? true : d.signals.group === "n/a" ? null : false}
          />
        </div>
        <div className="mb-3 text-[12px] leading-relaxed text-text-muted">{d.detail}</div>

        {canWrite && d.action === "invite" && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleFollowup}
              disabled={fuBusy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-profit/25 bg-profit/10 px-3 py-1.5 text-[11px] font-semibold tracking-tight text-profit transition-colors hover:bg-profit/15 disabled:opacity-50"
              style={{ cursor: fuBusy ? "wait" : "pointer" }}
            >
              <SendIcon size={13} /> {fuBusy ? "Sending…" : "Send follow-up via bot"}
            </button>
            <button
              type="button"
              onClick={handleInvite}
              disabled={busy}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold tracking-tight transition-colors disabled:opacity-50 ${shellClass} ${textClass}`}
              style={{ cursor: busy ? "wait" : "pointer" }}
            >
              <ExternalLinkIcon size={13} /> {busy ? "Generating…" : "Generate invite link"}
            </button>
          </div>
        )}

        {canWrite && d.action === "invite_only" && (
          <div className="mb-2">
            <button
              type="button"
              onClick={handleInvite}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink/15 bg-ink/[0.04] px-3 py-1.5 text-[11px] font-semibold text-text-primary disabled:opacity-50"
            >
              <ExternalLinkIcon size={13} /> {busy ? "Generating…" : "Generate invite (no access)"}
            </button>
          </div>
        )}

        {/* Kick VIP — soft remove (ban→unban) so re-invite works later */}
        {showKick && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {!confirmKick ? (
              <button
                type="button"
                onClick={() => setConfirmKick(true)}
                disabled={kickBusy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-loss/30 bg-loss/10 px-3 py-1.5 text-[11px] font-semibold text-loss transition-colors hover:bg-loss/15 disabled:opacity-50"
              >
                Kick from VIP group
              </button>
            ) : (
              <>
                <span className="text-[11px] text-loss">
                  Soft remove — not permanently banned. Re-invite later OK.
                </span>
                <button
                  type="button"
                  onClick={handleKick}
                  disabled={kickBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-loss/40 bg-loss/20 px-3 py-1.5 text-[11px] font-bold text-loss disabled:opacity-50"
                >
                  {kickBusy ? "Kicking…" : "Confirm kick"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmKick(false)}
                  disabled={kickBusy}
                  className="rounded-xl border border-ink/10 px-3 py-1.5 text-[11px] text-text-muted"
                >
                  Cancel
                </button>
              </>
            )}
            {inGroup && d.action === "kick" && active && (
              <button
                type="button"
                onClick={handleInvite}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-ink/12 bg-ink/[0.03] px-3 py-1.5 text-[11px] font-semibold text-text-secondary disabled:opacity-50"
                title="Only needed after kick, or if they left and need a new link"
              >
                <ExternalLinkIcon size={13} /> {busy ? "…" : "New invite link"}
              </button>
            )}
          </div>
        )}

        {!canWrite && d.action && (
          <p className="text-[11px] text-text-muted">
            View-only — kick / invite actions are disabled.
          </p>
        )}
        {canWrite && d.action === "email_link_tg" && (
          <button
            type="button"
            onClick={handleCopyLinkTgMsg}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold tracking-tight ${shellClass} ${textClass}`}
          >
            <SendIcon size={13} /> Copy &quot;connect Telegram&quot; message
          </button>
        )}
        {inviteLink && (
          <div className="mt-2 break-all rounded-xl border border-profit/25 bg-ink/[0.03] p-2 text-[11px] text-profit">
            <div className="mb-1 text-[9px] uppercase tracking-wider text-text-muted">
              Invite link (copied · valid 1 hour · single use)
            </div>
            <a href={inviteLink} target="_blank" rel="noopener noreferrer" className="underline">
              {inviteLink}
            </a>
          </div>
        )}
        <p className="mt-2 text-[10px] leading-snug text-text-muted/80">
          Kick = remove from group without permanent ban. After kick, use{" "}
          <strong className="font-semibold text-text-muted">Generate invite</strong> so they can
          rejoin (Telegram would otherwise block rejoin if left banned).
        </p>
      </div>
    </Section>
  );
};

/* ════════════════════════════════════════
 Account Timeline — chronological lifecycle from existing data
 ════════════════════════════════════════ */

const TimelineRow = ({ icon: Icon, toneClass, label, date, last }) => (
  <div className="flex gap-3">
    <div className="flex flex-col items-center">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-xl border ${toneClass}`}
      >
        <Icon size={11} />
      </div>
      {!last && <div className="my-1 w-px flex-1 bg-ink/[0.08]" />}
    </div>
    <div className="min-w-0 pb-3">
      <div className="text-[12px] font-medium text-text-primary/80">{label}</div>
      <div className="text-[10px] tabular-nums text-text-muted">{date}</div>
    </div>
  </div>
);

const AccountTimeline = ({ data }) => {
  const { user, payments } = data;
  const events = [];

  if (user.created_at && user.acq_source) {
    const acquisition = [
      user.acq_source,
      user.acq_medium,
      user.acq_campaign,
      user.acq_content,
    ]
      .filter(Boolean)
      .join(" · ");
    events.push({
      ts: user.created_at,
      icon: SparklesIcon,
      toneClass: "border-accent/25 bg-accent/10 text-accent",
      label: `First-touch attribution claimed · ${acquisition}`,
    });
  }

  if (user.created_at)
    events.push({
      ts: user.created_at,
      icon: SparklesIcon,
      toneClass: "border-accent/25 bg-accent/10 text-accent",
      label: `Account created (via ${user.auth_provider || "unknown"})`,
    });
  if (user.first_login_at)
    events.push({
      ts: user.first_login_at,
      icon: UserIcon,
      toneClass: "border-ink/[0.08] bg-ink/[0.04] text-text-muted",
      label: "First login",
    });

  (payments || [])
    .filter((p) => p.status === "confirmed")
    .forEach((p) => {
      events.push({
        ts: p.verified_at || p.created_at,
        icon: StarIcon,
        toneClass: "border-profit/25 bg-profit/10 text-profit",
        label: `Payment confirmed${p.plan_label ? ` · ${p.plan_label}` : ""} ($${p.final_amount || p.amount_usdt})`,
      });
    });

  if (user.subscription_granted_at)
    events.push({
      ts: user.subscription_granted_at,
      icon: StarIcon,
      toneClass: "border-accent/25 bg-accent/10 text-accent",
      label: `Subscription granted${user.subscription_source ? ` (${user.subscription_source})` : ""}`,
    });
  if (user.subscription_expires_at)
    events.push({
      ts: user.subscription_expires_at,
      icon: ClockIcon,
      toneClass:
        new Date(user.subscription_expires_at) > new Date()
          ? "border-profit/25 bg-profit/10 text-profit"
          : "border-loss/25 bg-loss/10 text-loss",
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
            toneClass={e.toneClass}
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

const FU_STATUS = {
  pending: { className: "border-accent/25 bg-accent/10 text-accent", label: "Pending" },
  in_progress: { className: "border-ink/15 bg-ink/[0.05] text-text-muted", label: "In progress" },
  done: { className: "border-profit/25 bg-profit/10 text-profit", label: "Done" },
  cancelled: { className: "border-ink/15 bg-ink/[0.05] text-text-muted", label: "Cancelled" },
};

const FU_DOT = {
  pending: "bg-accent",
  in_progress: "bg-text-muted",
  done: "bg-profit",
  cancelled: "bg-text-muted",
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
                <div className="flex shrink-0 flex-col items-center">
                  <span
                    className={`mt-1 h-2.5 w-2.5 rounded-full ${FU_DOT[f.status] || FU_DOT.pending}`}
                  />
                  {!isLast && <span className="my-1 w-px flex-1 bg-ink/[0.08]" />}
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-text-primary">{f.title}</span>
                    <span
                      className={`rounded-lg border px-1.5 py-px text-[8px] font-bold uppercase tracking-wider ${st.className}`}
                    >
                      {st.label}
                    </span>
                    {f.priority === "urgent" && (
                      <span className="rounded-lg border border-loss/25 bg-loss/10 px-1.5 py-px text-[8px] font-bold uppercase tracking-wider text-loss">
                        Urgent
                      </span>
                    )}
                  </div>
                  {f.note && (
                    <p className="mt-1 text-[11px] leading-relaxed text-text-muted/60">{f.note}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-text-muted/40">
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
        <div className="flex items-center justify-between gap-3 rounded-xl border border-ink/[0.08] bg-ink/[0.03] px-3 py-2.5">
          <div>
            <p className="text-[11px] font-semibold text-text-primary/90">Staff / member role</p>
            <p className="text-[10px] text-text-muted">
              Current:{" "}
              <span className="font-bold uppercase tracking-wider text-text-primary/70">
                {user.role}
              </span>
              {" · "}admin full · co_admin/founder view-only
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSetRole(user)}
            className="shrink-0 rounded-xl border border-ink/[0.08] bg-ink/[0.04] px-3 py-1.5 text-[10px] font-semibold tracking-tight text-text-muted transition-colors hover:border-ink/15 hover:text-text-primary"
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
          <StatTile label="Profile Country" value={countryName(user.country_code)} />
        </div>
      </Section>

      <Section title="Detected Location · IP" Icon={ClockIcon}>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Current location" value={detectedLocation(user)} />
          <StatTile label="First country" value={countryName(user.geo_country_first)} />
          <StatTile label="Current IP network" value={user.geo_ip_prefix || "—"} />
          <StatTile label="First IP network" value={user.geo_ip_first_prefix || "—"} />
          <StatTile label="Location checked" value={relativeTime(user.geo_last_seen_at)} />
          <StatTile label="Timezone" value={user.geo_timezone || "—"} />
        </div>
        <p className="mt-2 rounded-xl border border-ink/[0.07] bg-ink/[0.02] px-3 py-2 text-[10px] leading-relaxed text-text-muted">
          Detected server-side from the trusted edge. IP is privacy-masked to /24 for IPv4 or /48 for IPv6; the raw address is never stored.
        </p>
      </Section>

      <Section title="Acquisition · First Touch" Icon={SparklesIcon}>
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Source"
            value={user.acq_source || "Unattributed"}
            accentClass={user.acq_source ? "text-accent" : "text-text-muted"}
          />
          <StatTile label="Medium" value={user.acq_medium || "—"} />
          <StatTile label="Campaign" value={user.acq_campaign || "—"} />
          <StatTile label="Content" value={user.acq_content || "—"} />
        </div>
        <div className="mt-2 rounded-xl border border-ink/[0.08] bg-ink/[0.02] px-3 py-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
            Entry path
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-text-primary/80">
            {user.acq_path || "—"}
          </p>
          <p className="mt-1.5 text-[10px] leading-snug text-text-muted">
            First-touch attribution is claimed once and is not overwritten by later visits.
          </p>
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
              accentClass={
                user.subscription_expires_at ? "text-profit" : "text-accent"
              }
            />
            <StatTile label="Granted" value={formatDate(user.subscription_granted_at)} />
          </div>
        </Section>
      )}

      {user.referral_credit_usdt > 0 && (
        <Section title="Referral Credit" Icon={SparklesIcon}>
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Balance"
              value={`$${user.referral_credit_usdt}`}
              accentClass="text-profit"
            />
            <StatTile
              label="Lifetime Earned"
              value={`$${user.lifetime_credit_earned}`}
              accentClass="text-accent"
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

/**
 * Explains what a Telegram numeric id can and can't get you, and hands over
 * the one link that does work. Telegram publishes no web profile for accounts
 * without a @username, so tg://user?id= (Telegram app) is the only door.
 */
const TelegramIdentityNote = ({ identity, resolving, onResolve, telegramId }) => {
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(String(telegramId));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const name = identity?.display_name;
  const hasUsername = !!identity?.username;
  const appLink = identity?.app_link || `tg://user?id=${telegramId}`;

  return (
    <div className="space-y-2 rounded-xl border border-ink/[0.08] bg-ink/[0.02] px-3 py-2 text-[11px] text-text-muted">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <TelegramIcon size={11} colored />
          {resolving ? (
            <span>Asking the bot who this is…</span>
          ) : name ? (
            <span className="truncate">
              Telegram name: <strong className="text-text-primary">{name}</strong>
              {hasUsername && <> · @{identity.username}</>}
            </span>
          ) : (
            <span>{identity?.message || "Telegram profile not resolved yet."}</span>
          )}
        </span>
        <button
          onClick={onResolve}
          disabled={resolving}
          className="shrink-0 rounded-xl border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-tight text-accent transition-colors hover:bg-accent/15 disabled:opacity-40"
        >
          {resolving ? "…" : "Re-check"}
        </button>
      </div>

      {!resolving && identity && !hasUsername && identity.message && name && (
        <p className="text-text-muted">{identity.message}</p>
      )}

      <div className="flex items-center gap-2">
        <a
          href={appLink}
          className="inline-flex items-center gap-1 rounded-xl border border-ink/[0.08] bg-ink/[0.04] px-2 py-1 font-semibold text-text-primary transition-colors hover:border-ink/15"
        >
          <ExternalLinkIcon size={10} />
          Open in Telegram app
        </a>
        <button
          onClick={copyId}
          className={`inline-flex items-center gap-1 rounded-xl border border-ink/[0.08] bg-ink/[0.03] px-2 py-1 font-mono transition-colors ${
            copied ? "text-profit" : "text-text-muted"
          }`}
        >
          {copied ? "Copied" : `Copy id ${telegramId}`}
        </button>
      </div>
    </div>
  );
};

const ContactTab = ({ data, onContactUpdate, canWrite = true }) => {
  const { user, reach, enriched_by_user } = data;

  // Telegram identity: the login widget only kept whatever the user had at
  // signup, which for many is nothing but a numeric id. Ask the bot who they
  // are now, so admins see a human name (and get a t.me link if they've since
  // set a @username).
  const [tgIdentity, setTgIdentity] = useState(null);
  const [tgResolving, setTgResolving] = useState(false);

  const resolveTelegram = useCallback(async () => {
    if (!user.telegram_id) return;
    setTgResolving(true);
    try {
      setTgIdentity(await adminApi.getUserTelegramIdentity(user.id));
    } catch (err) {
      setTgIdentity({
        resolvable: false,
        message: err.response?.data?.detail || "Couldn't reach the Telegram bot.",
      });
    } finally {
      setTgResolving(false);
    }
  }, [user.id, user.telegram_id]);

  useEffect(() => {
    setTgIdentity(null);
    // Auto-resolve only when there's nothing better to show than an id.
    if (user.telegram_id && !reach.telegram.deep_link) resolveTelegram();
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
              className="flex items-center gap-1.5 rounded-xl border border-accent/25 bg-accent/10 px-2 py-1 text-[10px] font-semibold tracking-tight text-accent transition-colors hover:bg-accent/15"
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
              <>
                <ContactBadge
                  channel="telegram"
                  value={tgIdentity?.username || reach.telegram.value}
                  deepLink={
                    tgIdentity?.profile_link || reach.telegram.deep_link
                  }
                  appLink={tgIdentity?.app_link || reach.telegram.app_link}
                  source={reach.telegram.source}
                  botReady={reach.telegram.bot_ready}
                />
                {/* Only for the id-only case — a working @username link needs
                    no explanation. */}
                {user.telegram_id && (!reach.telegram.deep_link || tgIdentity) && (
                  <TelegramIdentityNote
                    identity={tgIdentity}
                    resolving={tgResolving}
                    onResolve={resolveTelegram}
                    telegramId={user.telegram_id}
                  />
                )}
              </>
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
              <div className="flex items-start gap-2 rounded-xl border border-loss/20 bg-loss/10 p-3 text-xs text-loss">
                <AlertTriangleIcon size={13} className="mt-0.5 shrink-0" />
                <span>
                  No contact channels available. Click <strong>Edit</strong> to add a Telegram or
                  Discord handle manually.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-ink/[0.08] bg-surface-raised p-3.5">
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                <TelegramIcon size={11} colored />
                Admin Telegram Note
              </label>
              <input
                type="text"
                value={adminTg}
                onChange={(e) => setAdminTg(e.target.value)}
                placeholder="username (without @)"
                className="w-full rounded-xl border border-ink/[0.08] bg-ink/[0.03] px-2.5 py-1.5 font-mono text-xs text-text-primary outline-none transition-colors focus:border-ink/20"
              />
              {user.telegram_username && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-profit">
                  <span className="text-text-muted">Real username (from login):</span>
                  <strong>@{user.telegram_username}</strong>
                </p>
              )}
              {!user.telegram_username && (
                <p className="mt-1 text-[9px] text-text-muted">
                  No login-linked Telegram yet — admin note used as fallback.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                <DiscordIcon size={11} colored />
                Discord Handle
              </label>
              <input
                type="text"
                value={adminDc}
                onChange={(e) => setAdminDc(e.target.value)}
                placeholder="username or numeric ID"
                className="w-full rounded-xl border border-ink/[0.08] bg-ink/[0.03] px-2.5 py-1.5 font-mono text-xs text-text-primary outline-none transition-colors focus:border-ink/20"
              />
              {user.discord_id && (
                <p className="mt-1 text-[9px] text-text-muted">OAuth ID: {user.discord_id}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                Admin Notes
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                placeholder="VIP customer, prefers TG. Pays annually on each renewal…"
                className="w-full resize-none rounded-xl border border-ink/[0.08] bg-ink/[0.03] px-2.5 py-1.5 text-xs text-text-primary outline-none transition-colors focus:border-ink/20"
              />
            </div>

            {saveErr && (
              <div className="flex items-start gap-2 rounded-xl border border-loss/25 bg-loss/10 px-2 py-1.5 text-xs text-loss">
                <AlertTriangleIcon size={12} className="mt-0.5 shrink-0" />
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
          <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-text-muted">
            <SparklesIcon size={10} className="text-accent" />
            <span>
              Enriched by{" "}
              <strong className="text-accent">@{enriched_by_user.username}</strong> on{" "}
              {formatDateTime(user.admin_enriched_at)}
            </span>
          </div>
        )}
      </Section>

      {/* Admin notes (view-only when not editing) */}
      {!editing && user.admin_notes && (
        <Section title="Admin Notes" Icon={EditIcon}>
          <div className="whitespace-pre-wrap rounded-xl border border-ink/[0.08] bg-ink/[0.02] p-3 text-xs leading-relaxed text-text-secondary">
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
        <div className="rounded-xl border border-profit/25 bg-profit/10 p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-profit">
            Total Paid
          </p>
          <p className="text-xl font-light tabular-nums tracking-tight text-profit">
            ${totalConfirmed.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-ink/[0.08] bg-surface-raised p-3.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Records
          </p>
          <p className="text-xl font-light tabular-nums tracking-tight text-text-primary">
            {payments.length}
          </p>
        </div>
      </div>

      <Section title="Payment History" Icon={ClockIcon}>
        <div className="space-y-1.5">
          {payments.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-ink/[0.08] bg-ink/[0.02] p-2.5"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-text-primary">
                    {p.plan_label || `Plan #${p.id}`}
                  </p>
                  <p className="text-[11px] tabular-nums text-text-muted">
                    ${(p.final_amount || p.amount_usdt).toFixed(2)}
                    {p.credit_redeemed > 0 && (
                      <span className="ml-1.5 text-[10px] text-accent">
                        (−${p.credit_redeemed.toFixed(2)} credit)
                      </span>
                    )}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-text-muted">
                <span className="tabular-nums">{formatDateTime(p.created_at)}</span>
                {p.tx_hash && (
                  <a
                    href={`https://bscscan.com/tx/${p.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-text-muted hover:text-text-primary hover:underline"
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
          <div className="flex items-center justify-between rounded-xl border border-ink/[0.08] bg-ink/[0.02] p-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-text-primary">
                @{as_referred.referrer_username}
              </p>
              <p className="text-[10px] tabular-nums text-text-muted">
                Joined via: {formatDate(as_referred.created_at)}
              </p>
            </div>
            <span className="shrink-0 rounded-lg border border-ink/15 bg-ink/[0.05] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-text-muted">
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
                className="flex items-center justify-between rounded-xl border border-profit/20 bg-profit/10 p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-text-primary">
                    @{r.referee_username || "unknown"}
                  </p>
                  <p className="text-[10px] tabular-nums text-text-muted">
                    {formatDate(r.created_at)} · {r.total_payments || 0} payment(s)
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {r.total_commission_earned > 0 && (
                    <p className="text-xs font-bold tabular-nums text-profit">
                      ${r.total_commission_earned.toFixed(2)}
                    </p>
                  )}
                  <p className="text-[9px] uppercase tracking-wider text-text-muted">{r.status}</p>
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

/**
 * In-app chat composer. Deliberately the first thing in this tab and never
 * gated on contact channels: it is the only channel that reaches every
 * account. Most users here have no Telegram, no Discord and a placeholder
 * email, and used to show up as simply "unreachable".
 */
const InAppChatCard = ({ user }) => {
  const [thread, setThread] = useState(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    adminChatApi
      .getUserThread(user.id)
      .then((t) => alive && setThread(t))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user.id]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setErr("");
    try {
      await adminChatApi.startConversation(user.id, text);
      setBody("");
      setSent(true);
      setThread(await adminChatApi.getUserThread(user.id).catch(() => thread));
    } catch (e) {
      setErr(e?.response?.data?.detail || "Couldn't send.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-ink/[0.08] bg-surface-raised p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          In-app chat
        </span>
        <span className="text-[10px] text-text-muted">reaches every account</span>
        {thread?.exists && (
          <span className="ml-auto font-mono text-[10px] text-text-muted">
            {thread.message_count} message{thread.message_count === 1 ? "" : "s"}
            {thread.unread > 0 && ` · ${thread.unread} unread`}
          </span>
        )}
      </div>
      <textarea
        rows={3}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSent(false);
        }}
        placeholder={`Message @${user.username} in the app…`}
        className="w-full resize-none rounded-xl border border-ink/[0.08] bg-ink/[0.03] px-3 py-2 text-xs text-text-primary placeholder:text-text-primary/30 outline-none transition-colors focus:border-ink/20"
      />
      <div className="mt-2 flex items-center gap-2">
        {err && <span className="text-[11px] text-loss">{err}</span>}
        {sent && !err && (
          <span className="text-[11px] text-profit">
            Sent — they'll get a notification if they don't open it.
          </span>
        )}
        <button
          onClick={send}
          disabled={sending || !body.trim()}
          className="lq-cta-md ml-auto rounded-xl px-3 py-1.5 text-[11px] tracking-tight disabled:opacity-30"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
};

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

  return (
    <div>
      <InAppChatCard user={user} />
      {hasAnyChannel ? (
        <>
          <p className="mb-3 text-[11px] text-text-muted">
            Or pick a template to DM{" "}
            <strong className="text-text-primary">@{user.username}</strong>. Click{" "}
            <strong className="text-accent">Send</strong> to copy the message and open the channel.
          </p>
          <QuickSendPopover user={user} templates={templates} reach={reach} inline />
        </>
      ) : (
        <p className="text-[11px] text-text-muted">
          No Telegram, Discord or real email on file — in-app chat above is the way to reach this
          one. Add a handle on the Contact tab to unlock DM templates.
        </p>
      )}
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
  // Answering someone starts from their record, not from a second list — so the
  // thread lives here too, next to what they paid and whether their bot runs.
  { id: "chat", label: "Chat", Icon: SendIcon },
  { id: "activity", label: "Activity", Icon: UserIcon },
  { id: "autotrade", label: "Agent", Icon: BroadcastIcon },
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
 className="lq-modal-safe lq-scrim-bg fixed inset-0 z-[2147483646] flex items-end justify-center p-0 sm:items-center sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex h-[min(var(--lq-modal-maxh),100%)] max-h-[min(var(--lq-modal-maxh),100%)] w-full max-w-3xl animate-in flex-col overflow-hidden rounded-t-3xl border border-ink/[0.08] bg-surface-raised shadow-[0_24px_48px_-12px_rgb(var(--scrim)/0.4)] duration-200 fade-in slide-in-from-bottom-4 sm:h-auto sm:max-h-[var(--lq-modal-maxh)] sm:rounded-2xl sm:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pb-0 pt-2.5 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-ink/25" />
        </div>

        {/* ── HEADER ── */}
        <div className="relative flex shrink-0 items-center justify-between border-b border-ink/[0.07] bg-surface-raised px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-ink/[0.08] bg-ink/[0.04]">
              <UserIcon size={14} className="text-text-muted" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold leading-tight tracking-tight text-text-primary">
                User Detail
              </h2>
              {data?.user && (
                <p className="font-mono text-[10px] leading-tight tabular-nums text-text-muted">
                  @{data.user.username} · #{data.user.id}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-ink/[0.08] bg-ink/[0.04] text-text-muted transition-colors hover:border-ink/15 hover:text-text-primary"
            title="Close (Esc)"
            aria-label="Close modal"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* ── TABS ── */}
        {data && (
          <div className="flex shrink-0 overflow-x-auto border-b border-ink/[0.07] bg-surface-secondary px-2 pt-1.5">
            {TABS.map(({ id, label, Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`relative flex min-w-[80px] flex-1 items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold tracking-tight transition-colors ${
                    isActive
                      ? "text-text-primary"
                      : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  <Icon size={12} />
                  {label}
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-t bg-accent" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── BODY ── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="inline-flex items-center gap-2 text-xs text-text-muted">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink/20 border-t-ink/60" />
                Loading…
              </div>
            </div>
          )}

          {err && (
            <div className="flex items-start gap-2 rounded-xl border border-loss/25 bg-loss/10 p-3 text-xs text-loss">
              <AlertTriangleIcon size={14} className="mt-0.5 shrink-0" />
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
              {activeTab === "chat" && <ChatTab userId={userId} canWrite={canWrite} />}
              {activeTab === "activity" && <ActivityTab userId={userId} />}
              {activeTab === "autotrade" && <AutoTradeTab userId={userId} />}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
