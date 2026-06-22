// src/components/admin/UserDetailDrawer.jsx
//
// Centered modal showing full user detail with 5 tabs:
//   • Overview   — hero, account info, subscription, referral credit
//   • Contact    — channels (TG/Discord/Email) + edit form + admin notes
//   • Payments   — payment history with summary cards
//   • Referral   — referred-by + referred-users lists
//   • Outreach   — QuickSendPopover inline (template-driven DM)
//
// Tab split rationale: original "Profile" tab packed 8 sections including
// the contact edit form. Splitting Overview/Contact keeps each tab focused
// and makes the contact-channel workflow more discoverable.
//
// Already modal-styled (max-w-3xl, rounded-2xl, fade-in zoom-in-95).

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { adminApi } from '../../services/adminApi';
import { growthApi } from '../../services/growthApi';
import { ContactBadge } from './ContactBadge';
import { QuickSendPopover } from './QuickSendPopover';
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
} from './Icons';
import { GoldButton, GhostButton } from '../autotrade/AutoTradeUI';

/* ════════════════════════════════════════
   Helpers
   ════════════════════════════════════════ */

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const relativeTime = (dateStr) => {
  if (!dateStr) return 'Never';
  const days = Math.floor(
    (new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24)
  );
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

const StatusBadge = ({ status }) => {
  const colors = {
    confirmed: {
      bg: 'rgba(52,211,153,0.10)',
      text: '#34d399',
      border: 'rgba(52,211,153,0.30)',
    },
    pending: {
      bg: 'rgba(251,191,36,0.10)',
      text: '#fbbf24',
      border: 'rgba(251,191,36,0.30)',
    },
    cancelled: {
      bg: 'rgba(107,92,82,0.10)',
      text: '#6b5c52',
      border: 'rgba(107,92,82,0.30)',
    },
    failed: {
      bg: 'rgba(248,113,113,0.10)',
      text: '#f87171',
      border: 'rgba(248,113,113,0.30)',
    },
    refunded: {
      bg: 'rgba(251,146,60,0.10)',
      text: '#fb923c',
      border: 'rgba(251,146,60,0.30)',
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
        {Icon && <Icon size={12} style={{ color: '#d4a853' }} />}
        <h4
          className="text-[10px] font-bold tracking-wider uppercase"
          style={{ color: 'rgba(255,255,255,0.5)' }}
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
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.04)',
    }}
  >
    <p
      className="text-[9px] uppercase tracking-wider font-semibold mb-0.5"
      style={{ color: 'rgba(255,255,255,0.35)' }}
    >
      {label}
    </p>
    <p
      className="text-[13px] font-medium tabular-nums tracking-tight truncate"
      style={{ color: accent || '#fff' }}
    >
      {value ?? '—'}
    </p>
  </div>
);

const EmptyState = ({ Icon, title, hint, accent = '#4a3f39' }) => (
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
    <p className="text-sm font-semibold text-white mb-1">{title}</p>
    {hint && (
      <p className="text-[11.5px]" style={{ color: '#6b5c52' }}>
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
        background: user.avatar_url
          ? 'transparent'
          : 'rgba(212,168,83,0.12)',
        color: '#d4a853',
        border: '1px solid rgba(212,168,83,0.22)',
      }}
    >
      {user.avatar_url ? (
        <img
          src={user.avatar_url}
          alt=""
          className="w-full h-full object-cover"
        />
      ) : (
        user.username?.charAt(0).toUpperCase()
      )}
    </div>

    <div className="flex-1 min-w-0 pt-0.5">
      <div className="flex items-center gap-2 mb-1">
        <h3 className="text-lg font-semibold text-white tracking-tight truncate">
          {user.username}
        </h3>
        <ProviderIcon provider={user.auth_provider} size={14} />
      </div>
      <p
        className="text-[11px] font-mono truncate"
        style={{ color: '#8a7a6e' }}
      >
        {user.email}
      </p>
      <div className="flex gap-1.5 mt-2 flex-wrap">
        <span
          className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
          style={{
            background:
              user.role === 'admin'
                ? 'rgba(168,85,247,0.12)'
                : user.role === 'subscriber'
                ? 'rgba(52,211,153,0.12)'
                : 'rgba(107,92,82,0.12)',
            color:
              user.role === 'admin'
                ? '#a855f7'
                : user.role === 'subscriber'
                ? '#34d399'
                : '#8a7a6e',
            border: `1px solid ${
              user.role === 'admin'
                ? 'rgba(168,85,247,0.3)'
                : user.role === 'subscriber'
                ? 'rgba(52,211,153,0.3)'
                : 'rgba(107,92,82,0.3)'
            }`,
          }}
        >
          {user.role}
        </span>
        <span
          className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            background: 'rgba(255,255,255,0.04)',
            color: '#8a7a6e',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {user.auth_provider}
        </span>
        {!user.is_active && (
          <span
            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(248,113,113,0.12)',
              color: '#f87171',
              border: '1px solid rgba(248,113,113,0.3)',
            }}
          >
            Banned
          </span>
        )}
        {user.subscription_source && (
          <span
            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              background: 'rgba(212,168,83,0.1)',
              color: '#d4a853',
              border: '1px solid rgba(212,168,83,0.22)',
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
  signals: 'Signals', autotrade: 'AutoTrade', markets: 'Markets',
  market_pulse: 'Market Pulse', ai_arena: 'AI Arena', tips: 'Tips',
  whale_alert: 'Whale Alert', onchain: 'On-chain', news: 'News', fx: 'FX',
  macro_calendar: 'Macro Calendar', watchlist: 'Watchlist',
  journal: 'Journal', referral: 'Referral', profile: 'Profile',
  analytics: 'Analytics',
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
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId]);

  if (loading) {
    return (
      <Section title="Activity Pulse" Icon={ClockIcon}>
        <div className="flex items-center justify-center py-6">
          <span
            className="inline-block w-4 h-4 rounded-full animate-spin"
            style={{ border: '2px solid rgba(45,212,191,0.25)', borderTopColor: '#2dd4bf' }}
          />
        </div>
      </Section>
    );
  }
  if (!data || data.error) return null;

  const spark = data.sparkline_30d || [];
  const maxC = spark.reduce((m, p) => Math.max(m, p.count), 0) || 1;
  const score = data.engagement_score ?? 0;
  const scoreColor = score >= 60 ? '#34d399' : score >= 30 ? '#fbbf24' : '#8a7a6e';

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
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Last 30 days
          </span>
          <span className="text-[9px]" style={{ color: '#4a3f39' }}>
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
                background: p.count > 0 ? '#2dd4bf' : 'rgba(255,255,255,0.05)',
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
              style={{ background: 'rgba(45,212,191,0.1)', color: '#2dd4bf' }}
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
  if (user.role === 'admin') return true;
  if (!['premium', 'subscriber'].includes(user.role)) return false;
  if (!user.subscription_expires_at) return true; // lifetime
  return new Date(user.subscription_expires_at) > new Date();
};

const computeVipDiagnosis = (user) => {
  const active = hasActiveAccess(user);
  const hasTg = !!user.telegram_id;
  const inGroup = !!user.telegram_in_group;
  const graceUntil = user.telegram_grace_until
    ? new Date(user.telegram_grace_until)
    : null;
  const inGrace = graceUntil && graceUntil > new Date();
  const expDate = user.subscription_expires_at
    ? formatDate(user.subscription_expires_at)
    : 'Lifetime';

  // healthy
  if (active && hasTg && inGroup) {
    return {
      tone: 'ok', color: '#34d399', icon: 'check',
      title: 'Healthy — akses aktif & di dalam VIP group',
      detail: 'Tidak ada tindakan diperlukan.',
      action: null,
      signals: { access: `Active · ${expDate}`, tg: 'Linked', group: 'Inside' },
    };
  }
  // active + linked + outside -> invite
  if (active && hasTg && !inGroup) {
    return {
      tone: 'warn', color: '#d4a853', icon: 'alert',
      title: 'Bayar aktif, link TG, tapi di luar group',
      detail: 'Sudah link Telegram & akses aktif, tapi belum join (atau keluar) VIP group. Generate invite link untuk mengundang ulang.',
      action: 'invite',
      signals: { access: `Active · ${expDate}`, tg: 'Linked', group: 'Outside' },
    };
  }
  // active + no telegram -> link first
  if (active && !hasTg) {
    return {
      tone: 'info', color: '#5aa9e6', icon: 'telegram',
      title: 'Bayar aktif, tapi belum link Telegram',
      detail: 'User login lewat Google/Discord & sudah bayar, tapi belum connect Telegram — jadi belum bisa di-invite ke VIP group. Minta user link TG dulu di profile.',
      action: 'email_link_tg',
      signals: { access: `Active · ${expDate}`, tg: 'Not linked', group: 'n/a' },
    };
  }
  // expired + in grace + inside
  if (!active && inGroup && inGrace) {
    return {
      tone: 'warn', color: '#fbbf24', icon: 'alert',
      title: 'Expired — dalam grace period',
      detail: `Langganan sudah lewat tapi masih dalam masa tenggang. Akan otomatis di-kick saat grace habis (${formatDate(user.telegram_grace_until)}).`,
      action: null,
      signals: { access: 'Expired (grace)', tg: hasTg ? 'Linked' : 'Not linked', group: 'Inside' },
    };
  }
  // expired + inside + no grace -> anomaly (should be kicked)
  if (!active && inGroup && !inGrace) {
    return {
      tone: 'danger', color: '#f87171', icon: 'alert',
      title: 'Expired tapi masih di dalam group',
      detail: 'Langganan sudah habis & di luar masa grace, tapi user masih ada di VIP group. Worker harusnya kick — cek subscription_worker, atau kick manual.',
      action: null,
      signals: { access: 'Expired', tg: hasTg ? 'Linked' : 'Not linked', group: 'Inside (anomaly)' },
    };
  }
  // free / no access, outside
  return {
    tone: 'neutral', color: '#6b5c52', icon: 'user',
    title: 'No active access',
    detail: 'User tidak punya akses aktif. Wajar berada di luar VIP group.',
    action: null,
    signals: { access: 'None', tg: hasTg ? 'Linked' : 'Not linked', group: inGroup ? 'Inside' : 'Outside' },
  };
};

const SignalCell = ({ label, value, good }) => (
  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '8px' }}>
    <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</div>
    <div className="text-[12px] font-medium" style={{ color: good === true ? '#34d399' : good === false ? '#f87171' : 'rgba(255,255,255,0.45)' }}>{value}</div>
  </div>
);

const VipDiagnostic = ({ user, onInvited, onToast }) => {
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
        onToast?.('User sudah jadi member VIP group.', 'success');
        onInvited?.();
      } else if (res.invite_link) {
        setInviteLink(res.invite_link);
        try { await navigator.clipboard.writeText(res.invite_link); } catch {}
        onToast?.('Invite link dibuat & disalin ke clipboard.', 'success');
      }
    } catch (e) {
      onToast?.(e.response?.data?.detail || 'Gagal membuat invite link', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyLinkTgMsg = async () => {
    const msg = `Hi! Langgananmu di LuxQuant sudah aktif. Untuk join VIP signal group di Telegram, silakan connect akun Telegram kamu dulu di halaman Profile (Settings → Connected Accounts → Telegram → Link), lalu klik "Join VIP Group". Terima kasih!`;
    try { await navigator.clipboard.writeText(msg); onToast?.('Pesan arahan disalin ke clipboard.', 'success'); }
    catch { onToast?.('Gagal menyalin', 'error'); }
  };

  const [fuBusy, setFuBusy] = useState(false);
  const handleFollowup = async () => {
    setFuBusy(true);
    try {
      const res = await adminApi.vipFollowup(user.id);
      if (res.ok) {
        onToast?.('Follow-up terkirim ke @' + (user.username || user.id) + ' via bot.', 'success');
        if (res.invite_link) setInviteLink(res.invite_link);
        onInvited?.();
      } else if (res.reason === 'dm_failed') {
        onToast?.('Bot tidak bisa DM user ini (belum /start bot). Link tetap dibuat.', 'error');
        if (res.invite_link) setInviteLink(res.invite_link);
      } else if (res.reason === 'already_member') {
        onToast?.('User sudah di VIP group.', 'success');
        onInvited?.();
      } else {
        onToast?.(res.message || 'Follow-up gagal.', 'error');
      }
    } catch (e) {
      onToast?.(e.response?.data?.detail || 'Follow-up gagal.', 'error');
    } finally {
      setFuBusy(false);
    }
  };

  return (
    <Section title="VIP Access Diagnostic" Icon={AlertTriangleIcon}>
      <div style={{ background: `${d.color}0f`, border: `1px solid ${d.color}4d`, borderRadius: 10, padding: 14 }}>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangleIcon size={16} style={{ color: d.color }} />
          <span className="text-[13px] font-medium" style={{ color: d.color }}>{d.title}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2.5">
          <SignalCell label="Paid access" value={d.signals.access} good={active} />
          <SignalCell label="Telegram" value={d.signals.tg} good={tg} />
          <SignalCell label="VIP group" value={d.signals.group} good={inGroup ? true : (d.signals.group === 'n/a' ? null : false)} />
        </div>
        <div className="text-[12px] leading-relaxed mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>{d.detail}</div>

        {d.action === 'invite' && !inviteLink && (
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleFollowup} disabled={fuBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold"
              style={{ background: '#34d39924', color: '#34d399', border: '1px solid #34d3994d', cursor: fuBusy ? 'wait' : 'pointer' }}>
              <SendIcon size={13} /> {fuBusy ? 'Sending…' : 'Send follow-up via bot'}
            </button>
            <button onClick={handleInvite} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold"
              style={{ background: `${d.color}24`, color: d.color, border: `1px solid ${d.color}4d`, cursor: busy ? 'wait' : 'pointer' }}>
              <ExternalLinkIcon size={13} /> {busy ? 'Generating…' : 'Just generate link'}
            </button>
          </div>
        )}
        {d.action === 'email_link_tg' && (
          <button onClick={handleCopyLinkTgMsg}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold"
            style={{ background: `${d.color}24`, color: d.color, border: `1px solid ${d.color}4d`, cursor: 'pointer' }}>
            <SendIcon size={13} /> Copy pesan "connect Telegram"
          </button>
        )}
        {inviteLink && (
          <div className="mt-2 p-2 rounded-md text-[11px] break-all" style={{ background: 'rgba(255,255,255,0.04)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
            <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Invite link (sudah disalin · valid 1 jam)</div>
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
      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `${color}1a`, border: `1px solid ${color}4d` }}>
        <Icon size={11} style={{ color }} />
      </div>
      {!last && <div className="w-px flex-1 my-1" style={{ background: 'rgba(255,255,255,0.08)' }} />}
    </div>
    <div className="pb-3 min-w-0">
      <div className="text-[12px] font-medium text-white/80">{label}</div>
      <div className="text-[10px] tabular-nums" style={{ color: 'rgba(255,255,255,0.4)' }}>{date}</div>
    </div>
  </div>
);

const AccountTimeline = ({ data }) => {
  const { user, payments } = data;
  const events = [];

  if (user.created_at)
    events.push({ ts: user.created_at, icon: SparklesIcon, color: '#d4a853', label: `Akun dibuat (via ${user.auth_provider || 'unknown'})` });
  if (user.first_login_at)
    events.push({ ts: user.first_login_at, icon: UserIcon, color: '#5aa9e6', label: 'Login pertama' });

  (payments || []).filter((p) => p.status === 'confirmed').forEach((p) => {
    events.push({ ts: p.verified_at || p.created_at, icon: StarIcon, color: '#34d399', label: `Pembayaran confirmed${p.plan_label ? ` · ${p.plan_label}` : ''} ($${p.final_amount || p.amount_usdt})` });
  });

  if (user.subscription_granted_at)
    events.push({ ts: user.subscription_granted_at, icon: StarIcon, color: '#fbbf24', label: `Subscription granted${user.subscription_source ? ` (${user.subscription_source})` : ''}` });
  if (user.subscription_expires_at)
    events.push({ ts: user.subscription_expires_at, icon: ClockIcon, color: new Date(user.subscription_expires_at) > new Date() ? '#34d399' : '#f87171', label: new Date(user.subscription_expires_at) > new Date() ? 'Subscription berlaku sampai' : 'Subscription expired' });

  events.sort((a, b) => new Date(a.ts) - new Date(b.ts));

  if (events.length === 0) return null;

  return (
    <Section title="Account Timeline" Icon={ClockIcon}>
      <div className="pl-0.5">
        {events.map((e, i) => (
          <TimelineRow key={i} icon={e.icon} color={e.color} label={e.label}
            date={formatDateTime(e.ts)} last={i === events.length - 1} />
        ))}
      </div>
    </Section>
  );
};

/* ════════════════════════════════════════
   Tab 1: Overview
   ════════════════════════════════════════ */

const OverviewTab = ({ data, onUserUpdated, onToast }) => {
  const { user } = data;
  return (
    <div className="space-y-6">
      <UserHero user={user} />

      <VipDiagnostic user={user} onInvited={onUserUpdated} onToast={onToast} />

      <Section title="Account Info" Icon={UserIcon}>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="User ID" value={`#${user.id}`} />
          <StatTile label="Created" value={formatDate(user.created_at)} />
          <StatTile label="First Login" value={formatDate(user.first_login_at)} />
          <StatTile
            label="Last Login"
            value={relativeTime(user.last_login_at)}
          />
          <StatTile label="Login Count" value={user.login_count || 0} />
          <StatTile label="Country" value={user.country_code || '—'} />
        </div>
      </Section>

      <ActivityPulse userId={user.id} />

      <AccountTimeline data={data} />

      {user.role === 'subscriber' && (
        <Section title="Subscription" Icon={StarIcon}>
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Expires"
              value={
                user.subscription_expires_at
                  ? formatDate(user.subscription_expires_at)
                  : 'Lifetime'
              }
              accent={
                user.subscription_expires_at ? '#34d399' : '#fbbf24'
              }
            />
            <StatTile
              label="Granted"
              value={formatDate(user.subscription_granted_at)}
            />
          </div>
        </Section>
      )}

      {user.referral_credit_usdt > 0 && (
        <Section title="Referral Credit" Icon={SparklesIcon}>
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Balance"
              value={`$${user.referral_credit_usdt}`}
              accent="#34d399"
            />
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

const ContactTab = ({ data, onContactUpdate }) => {
  const { user, reach, enriched_by_user } = data;

  const [editing, setEditing] = useState(false);
  const [adminTg, setAdminTg] = useState(user.admin_telegram_username || '');
  const [adminDc, setAdminDc] = useState(user.admin_discord_handle || '');
  const [adminNotes, setAdminNotes] = useState(user.admin_notes || '');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  useEffect(() => {
    setAdminTg(user.admin_telegram_username || '');
    setAdminDc(user.admin_discord_handle || '');
    setAdminNotes(user.admin_notes || '');
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
      setSaveErr(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setAdminTg(user.admin_telegram_username || '');
    setAdminDc(user.admin_discord_handle || '');
    setAdminNotes(user.admin_notes || '');
    setEditing(false);
    setSaveErr(null);
  };

  const hasUnsavedChanges =
    adminTg !== (user.admin_telegram_username || '') ||
    adminDc !== (user.admin_discord_handle || '') ||
    adminNotes !== (user.admin_notes || '');

  const hasAnyChannel =
    reach.telegram.available ||
    reach.discord.available ||
    reach.email.available;

  return (
    <div className="space-y-6">
      <Section
        title="Contact Channels"
        Icon={BroadcastIcon}
        action={
          !editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded font-semibold uppercase tracking-wider transition-colors hover:bg-amber-500/10"
              style={{
                color: '#d4a853',
                background: 'rgba(212,168,83,0.06)',
                border: '1px solid rgba(212,168,83,0.22)',
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
                  background: 'rgba(248,113,113,0.05)',
                  color: '#f87171',
                  border: '1px solid rgba(248,113,113,0.18)',
                }}
              >
                <AlertTriangleIcon
                  size={13}
                  className="shrink-0 mt-0.5"
                />
                <span>
                  No contact channels available. Click{' '}
                  <strong>Edit</strong> to add a Telegram or Discord
                  handle manually.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div
            className="space-y-3 rounded-lg p-3"
            style={{
              background: 'rgba(212,168,83,0.04)',
              border: '1px solid rgba(212,168,83,0.2)',
            }}
          >
            <div>
              <label
                className="text-[10px] uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5"
                style={{ color: '#d4a853' }}
              >
                <TelegramIcon size={11} colored />
                Admin Telegram Note
              </label>
              <input
                type="text"
                value={adminTg}
                onChange={(e) => setAdminTg(e.target.value)}
                placeholder="username (without @)"
                className="w-full px-2.5 py-1.5 rounded-md text-xs text-white focus:outline-none font-mono"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
              {user.telegram_username && (
                <p
                  className="text-[10px] mt-1 flex items-center gap-1"
                  style={{ color: '#34d399' }}
                >
                  <span style={{ color: '#6b5c52' }}>Real username (from login):</span>
                  <strong>@{user.telegram_username}</strong>
                </p>
              )}
              {!user.telegram_username && (
                <p className="text-[9px] mt-1" style={{ color: '#6b5c52' }}>
                  No login-linked Telegram yet — admin note used as fallback.
                </p>
              )}
            </div>

            <div>
              <label
                className="text-[10px] uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5"
                style={{ color: '#d4a853' }}
              >
                <DiscordIcon size={11} colored />
                Discord Handle
              </label>
              <input
                type="text"
                value={adminDc}
                onChange={(e) => setAdminDc(e.target.value)}
                placeholder="username or numeric ID"
                className="w-full px-2.5 py-1.5 rounded-md text-xs text-white focus:outline-none font-mono"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
              {user.discord_id && (
                <p
                  className="text-[9px] mt-1"
                  style={{ color: '#6b5c52' }}
                >
                  OAuth ID: {user.discord_id}
                </p>
              )}
            </div>

            <div>
              <label
                className="block text-[10px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: '#d4a853' }}
              >
                Admin Notes
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                placeholder="VIP customer, prefers TG. Pays annually on each renewal…"
                className="w-full px-2.5 py-1.5 rounded-md text-xs text-white focus:outline-none resize-none"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
            </div>

            {saveErr && (
              <div
                className="text-xs px-2 py-1.5 rounded flex items-start gap-2"
                style={{
                  background: 'rgba(248,113,113,0.1)',
                  color: '#f87171',
                  border: '1px solid rgba(248,113,113,0.3)',
                }}
              >
                <AlertTriangleIcon
                  size={12}
                  className="shrink-0 mt-0.5"
                />
                {saveErr}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <GhostButton onClick={handleCancel} disabled={saving} className="flex-1">
                Cancel
              </GhostButton>
              <GoldButton onClick={handleSave} disabled={saving || !hasUnsavedChanges} className="flex-1">
                {saving ? 'Saving…' : hasUnsavedChanges ? 'Save Changes' : 'No Changes'}
              </GoldButton>
            </div>
          </div>
        )}

        {/* Audit trail */}
        {user.admin_enriched_at && enriched_by_user && (
          <div
            className="mt-1.5 text-[10px] flex items-center gap-1.5"
            style={{ color: '#6b5c52' }}
          >
            <SparklesIcon size={10} style={{ color: '#d4a853' }} />
            <span>
              Enriched by{' '}
              <strong style={{ color: '#d4a853' }}>
                @{enriched_by_user.username}
              </strong>{' '}
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
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              color: '#c9b59e',
              lineHeight: '1.5',
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
    .filter((p) => p.status === 'confirmed')
    .reduce((sum, p) => sum + (p.final_amount || p.amount_usdt || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <div
          className="relative overflow-hidden rounded-lg p-3"
          style={{
            background: 'rgba(52,211,153,0.04)',
            border: '1px solid rgba(52,211,153,0.18)',
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background:
                'linear-gradient(to right, transparent, rgba(52,211,153,0.4), transparent)',
            }}
          />
          <p
            className="text-[10px] uppercase tracking-wider font-semibold mb-1"
            style={{ color: '#34d399' }}
          >
            Total Paid
          </p>
          <p
            className="text-xl font-light tabular-nums tracking-tight"
            style={{ color: '#34d399' }}
          >
            ${totalConfirmed.toFixed(2)}
          </p>
        </div>
        <div
          className="relative overflow-hidden rounded-lg p-3"
          style={{
            background: 'rgba(212,168,83,0.04)',
            border: '1px solid rgba(212,168,83,0.15)',
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background:
                'linear-gradient(to right, transparent, rgba(212,168,83,0.4), transparent)',
            }}
          />
          <p
            className="text-[10px] uppercase tracking-wider font-semibold mb-1"
            style={{ color: '#d4a853' }}
          >
            Records
          </p>
          <p
            className="text-xl font-light tabular-nums tracking-tight"
            style={{ color: '#d4a853' }}
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
                background: 'rgba(255,255,255,0.018)',
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    {p.plan_label || `Plan #${p.id}`}
                  </p>
                  <p
                    className="text-[11px] tabular-nums"
                    style={{ color: '#8a7a6e' }}
                  >
                    ${(p.final_amount || p.amount_usdt).toFixed(2)}
                    {p.credit_redeemed > 0 && (
                      <span
                        className="text-[10px] ml-1.5"
                        style={{ color: '#fbbf24' }}
                      >
                        (−${p.credit_redeemed.toFixed(2)} credit)
                      </span>
                    )}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div
                className="flex items-center gap-3 text-[10px] flex-wrap"
                style={{ color: '#6b5c52' }}
              >
                <span className="tabular-nums">
                  {formatDateTime(p.created_at)}
                </span>
                {p.tx_hash && (
                  <a
                    href={`https://bscscan.com/tx/${p.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline font-mono"
                    style={{ color: '#60a5fa' }}
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
              background: 'rgba(96,165,250,0.04)',
              border: '1px solid rgba(96,165,250,0.18)',
            }}
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                @{as_referred.referrer_username}
              </p>
              <p
                className="text-[10px] tabular-nums"
                style={{ color: '#6b5c52' }}
              >
                Joined via: {formatDate(as_referred.created_at)}
              </p>
            </div>
            <span
              className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded shrink-0"
              style={{
                background: 'rgba(96,165,250,0.15)',
                color: '#60a5fa',
                border: '1px solid rgba(96,165,250,0.3)',
              }}
            >
              {as_referred.status}
            </span>
          </div>
        </Section>
      )}

      {as_referrer && as_referrer.length > 0 && (
        <Section
          title={`Referred Users (${as_referrer.length})`}
          Icon={SparklesIcon}
        >
          <div className="space-y-1.5">
            {as_referrer.map((r) => (
              <div
                key={r.id}
                className="rounded-lg p-2.5 flex items-center justify-between"
                style={{
                  background: 'rgba(52,211,153,0.03)',
                  border: '1px solid rgba(52,211,153,0.15)',
                }}
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">
                    @{r.referee_username || 'unknown'}
                  </p>
                  <p
                    className="text-[10px] tabular-nums"
                    style={{ color: '#6b5c52' }}
                  >
                    {formatDate(r.created_at)} · {r.total_payments || 0}{' '}
                    payment(s)
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {r.total_commission_earned > 0 && (
                    <p
                      className="text-xs font-bold tabular-nums"
                      style={{ color: '#34d399' }}
                    >
                      ${r.total_commission_earned.toFixed(2)}
                    </p>
                  )}
                  <p
                    className="text-[9px] uppercase tracking-wider"
                    style={{ color: '#6b5c52' }}
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

const OutreachTab = ({ data, templates }) => {
  const { user, reach } = data;
  const hasAnyChannel =
    reach.telegram.available ||
    reach.discord.available ||
    reach.email.available;

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
      <p className="text-[11px] mb-3" style={{ color: '#8a7a6e' }}>
        Pick a template to DM{' '}
        <strong className="text-white">@{user.username}</strong>. Click{' '}
        <strong style={{ color: '#d4a853' }}>Send</strong> to copy the message
        and open the channel.
      </p>
      <QuickSendPopover
        user={user}
        templates={templates}
        reach={reach}
        inline
      />
    </div>
  );
};

/* ════════════════════════════════════════
   Main modal
   ════════════════════════════════════════ */

const TABS = [
  { id: 'overview', label: 'Overview', Icon: UserIcon },
  { id: 'contact', label: 'Contact', Icon: BroadcastIcon },
  { id: 'payments', label: 'Payments', Icon: StarIcon },
  { id: 'referral', label: 'Referral', Icon: SparklesIcon },
  { id: 'outreach', label: 'Outreach', Icon: SendIcon },
];

export const UserDetailDrawer = ({
  userId,
  onClose,
  onUserUpdated,
  onToast,
  templates,
}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setErr(null);
    try {
      const result = await adminApi.getUserFull(userId);
      setData(result);
    } catch (e) {
      setErr(e.response?.data?.detail || 'Failed to load user detail');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Lock body scroll while modal open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleContactUpdate = async (payload) => {
    const result = await adminApi.updateUserContact(userId, payload);
    await fetchData();
    if (onUserUpdated) onUserUpdated(result.user);
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-0 sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 2147483646,
      }}
    >
      <div
        className="w-full max-w-3xl h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-200"
        style={{
          background: '#0a0805',
          border: '1px solid rgba(212,168,83,0.25)',
          boxShadow:
            '0 25px 50px -12px rgba(0,0,0,0.9), 0 0 0 1px rgba(212,168,83,0.08), 0 0 80px -10px rgba(212,168,83,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── HEADER ── */}
        <div
          className="flex items-center justify-between px-5 py-3.5 shrink-0 relative"
          style={{
            background: '#0a0805',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background:
                'linear-gradient(to right, transparent, rgba(212,168,83,0.35), transparent)',
            }}
          />
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'rgba(212,168,83,0.1)',
                border: '1px solid rgba(212,168,83,0.22)',
              }}
            >
              <UserIcon size={14} style={{ color: '#d4a853' }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-white tracking-tight leading-tight">
                User Detail
              </h2>
              {data?.user && (
                <p
                  className="text-[10px] font-mono tabular-nums leading-tight"
                  style={{ color: '#6b5c52' }}
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
              color: '#d4a853',
              background: 'rgba(212,168,83,0.08)',
              border: '1px solid rgba(212,168,83,0.22)',
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
              background: '#0f070a',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
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
                    color: isActive ? '#fff' : '#6b5c52',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.color = '#a89888';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.color = '#6b5c52';
                  }}
                >
                  <Icon size={12} />
                  {label}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-3 right-3 h-0.5 rounded-t"
                      style={{
                        background:
                          'linear-gradient(90deg, transparent, #d4a853, transparent)',
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
                style={{ color: '#6b5c52' }}
              >
                <div
                  className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                  style={{
                    borderColor: 'rgba(212,168,83,0.3)',
                    borderTopColor: '#d4a853',
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
                background: 'rgba(248,113,113,0.08)',
                color: '#f87171',
                border: '1px solid rgba(248,113,113,0.25)',
              }}
            >
              <AlertTriangleIcon size={14} className="shrink-0 mt-0.5" />
              {err}
            </div>
          )}

          {data && !loading && (
            <>
              {activeTab === 'overview' && (
                <OverviewTab
                  data={data}
                  onUserUpdated={() => { fetchData(); onUserUpdated && onUserUpdated(); }}
                  onToast={onToast}
                />
              )}
              {activeTab === 'contact' && (
                <ContactTab
                  data={data}
                  onContactUpdate={handleContactUpdate}
                />
              )}
              {activeTab === 'payments' && <PaymentsTab data={data} />}
              {activeTab === 'referral' && <ReferralTab data={data} />}
              {activeTab === 'outreach' && (
                <OutreachTab data={data} templates={templates} />
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
