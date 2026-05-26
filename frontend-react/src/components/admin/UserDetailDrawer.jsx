// src/components/admin/UserDetailDrawer.jsx
import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/adminApi';
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

// ════════════════════════════════════════
// Helpers
// ════════════════════════════════════════

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const relativeTime = (dateStr) => {
  if (!dateStr) return 'Never';
  const days = Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

const StatusBadge = ({ status }) => {
  const colors = {
    confirmed: { bg: 'rgba(52,211,153,0.1)', text: '#34d399', border: 'rgba(52,211,153,0.3)' },
    pending: { bg: 'rgba(251,191,36,0.1)', text: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
    cancelled: { bg: 'rgba(107,92,82,0.1)', text: '#6b5c52', border: 'rgba(107,92,82,0.3)' },
    failed: { bg: 'rgba(248,113,113,0.1)', text: '#f87171', border: 'rgba(248,113,113,0.3)' },
  };
  const c = colors[status] || colors.cancelled;
  return (
    <span
      className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {status}
    </span>
  );
};

// ════════════════════════════════════════
// Section wrapper — consistent grouping
// ════════════════════════════════════════

const Section = ({ title, Icon, action, children }) => (
  <section className="space-y-2.5">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon size={12} style={{ color: '#d4a853' }} />}
        <h4 className="text-[10px] font-bold tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {title}
        </h4>
      </div>
      {action}
    </div>
    {children}
  </section>
);

// ════════════════════════════════════════
// Mini Stat tile — used in hero grid
// ════════════════════════════════════════

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

// ════════════════════════════════════════
// Profile Tab
// ════════════════════════════════════════

const ProfileTab = ({ data, onContactUpdate }) => {
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
      setSaveErr(err.response?.data?.detail || 'Gagal save');
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

  return (
    <div className="space-y-6">
      {/* ── HERO: Avatar + Name + Badges ── */}
      <div className="flex items-start gap-4">
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold shrink-0 overflow-hidden"
          style={{
            background: user.avatar_url ? 'transparent' : 'rgba(212,168,83,0.12)',
            color: '#d4a853',
            border: '1px solid rgba(212,168,83,0.2)',
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
            <h3 className="text-lg font-semibold text-white tracking-tight truncate">
              {user.username}
            </h3>
            <ProviderIcon provider={user.auth_provider} size={14} />
          </div>
          <p className="text-[11px] font-mono truncate" style={{ color: '#8a7a6e' }}>
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

      {/* ── ACCOUNT INFO grid ── */}
      <Section title="Account Info" Icon={UserIcon}>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="User ID" value={`#${user.id}`} />
          <StatTile label="Created" value={formatDate(user.created_at)} />
          <StatTile label="First Login" value={formatDate(user.first_login_at)} />
          <StatTile label="Last Login" value={relativeTime(user.last_login_at)} />
          <StatTile label="Login Count" value={user.login_count || 0} />
          <StatTile label="Country" value={user.country_code || '—'} />
        </div>
      </Section>

      {/* ── SUBSCRIPTION info (subscriber only) ── */}
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
              accent={user.subscription_expires_at ? '#34d399' : '#fbbf24'}
            />
            <StatTile label="Granted" value={formatDate(user.subscription_granted_at)} />
          </div>
        </Section>
      )}

      {/* ── REFERRAL CREDIT info ── */}
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

      {/* ── CONTACT CHANNELS section ── */}
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
            {!reach.telegram.available && !reach.discord.available && !reach.email.available && (
              <div
                className="text-xs p-3 rounded-lg flex items-start gap-2"
                style={{
                  background: 'rgba(248,113,113,0.05)',
                  color: '#f87171',
                  border: '1px solid rgba(248,113,113,0.18)',
                }}
              >
                <AlertTriangleIcon size={13} className="shrink-0 mt-0.5" />
                <span>
                  Tidak ada channel kontak. Klik <strong>Edit</strong> untuk tambah TG/Discord manual.
                </span>
              </div>
            )}
          </div>
        ) : (
          // ── EDIT FORM ──
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
                Telegram Username
              </label>
              <input
                type="text"
                value={adminTg}
                onChange={(e) => setAdminTg(e.target.value)}
                placeholder="username (tanpa @)"
                className="w-full px-2.5 py-1.5 rounded-md text-xs text-white focus:outline-none font-mono"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
              {user.telegram_username && (
                <p className="text-[9px] mt-1" style={{ color: '#6b5c52' }}>
                  OAuth value: @{user.telegram_username}
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
                placeholder="username atau numeric ID"
                className="w-full px-2.5 py-1.5 rounded-md text-xs text-white focus:outline-none font-mono"
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              />
              {user.discord_id && (
                <p className="text-[9px] mt-1" style={{ color: '#6b5c52' }}>
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
                placeholder="VIP customer, prefers TG. Bayar Annual tiap renewal..."
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
                <AlertTriangleIcon size={12} className="shrink-0 mt-0.5" />
                {saveErr}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="flex-1 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider disabled:opacity-50"
                style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasUnsavedChanges}
                className="flex-1 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #d4a853, #8b6914)',
                  color: '#0a0506',
                }}
              >
                {saving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'No Changes'}
              </button>
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
              <strong style={{ color: '#d4a853' }}>@{enriched_by_user.username}</strong> on{' '}
              {formatDateTime(user.admin_enriched_at)}
            </span>
          </div>
        )}
      </Section>

      {/* ── ADMIN NOTES (view-only) ── */}
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

// ════════════════════════════════════════
// Payments Tab
// ════════════════════════════════════════

const PaymentsTab = ({ data }) => {
  const { payments } = data;

  if (!payments || payments.length === 0) {
    return (
      <div className="text-center py-16">
        <StarIcon size={32} className="mx-auto mb-3" style={{ color: '#4a3f39' }} />
        <p className="text-xs" style={{ color: '#6b5c52' }}>
          Belum ada history payment.
        </p>
      </div>
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

      {/* Payment list */}
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
                <div>
                  <p className="text-xs font-semibold text-white">
                    {p.plan_label || `Plan #${p.id}`}
                  </p>
                  <p className="text-[11px] tabular-nums" style={{ color: '#8a7a6e' }}>
                    ${(p.final_amount || p.amount_usdt).toFixed(2)}
                    {p.credit_redeemed > 0 && (
                      <span className="text-[10px] ml-1.5" style={{ color: '#fbbf24' }}>
                        (−${p.credit_redeemed.toFixed(2)} credit)
                      </span>
                    )}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div
                className="flex items-center gap-3 text-[10px]"
                style={{ color: '#6b5c52' }}
              >
                <span className="tabular-nums">{formatDateTime(p.created_at)}</span>
                {p.tx_hash && (
                  <a
                    href={`https://bscscan.com/tx/${p.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:underline font-mono"
                    style={{ color: '#60a5fa' }}
                  >
                    {p.tx_hash.slice(0, 8)}...{p.tx_hash.slice(-6)}
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

// ════════════════════════════════════════
// Referral Tab
// ════════════════════════════════════════

const ReferralTab = ({ data }) => {
  const { as_referrer, as_referred } = data;

  if ((!as_referrer || as_referrer.length === 0) && !as_referred) {
    return (
      <div className="text-center py-16">
        <SparklesIcon size={32} className="mx-auto mb-3" style={{ color: '#4a3f39' }} />
        <p className="text-xs" style={{ color: '#6b5c52' }}>
          Tidak ada aktivitas referral.
        </p>
      </div>
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
            <div>
              <p className="text-xs font-semibold text-white">@{as_referred.referrer_username}</p>
              <p className="text-[10px] tabular-nums" style={{ color: '#6b5c52' }}>
                Joined via: {formatDate(as_referred.created_at)}
              </p>
            </div>
            <span
              className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
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
        <Section title={`Referred Users (${as_referrer.length})`} Icon={SparklesIcon}>
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
                  <p className="text-[10px] tabular-nums" style={{ color: '#6b5c52' }}>
                    {formatDate(r.created_at)} · {r.total_payments || 0} payment(s)
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {r.total_commission_earned > 0 && (
                    <p className="text-xs font-bold tabular-nums" style={{ color: '#34d399' }}>
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

// ════════════════════════════════════════
// Outreach Tab
// ════════════════════════════════════════

const OutreachTab = ({ data, templates }) => {
  const { user, reach } = data;
  const hasAnyChannel =
    reach.telegram.available || reach.discord.available || reach.email.available;

  if (!hasAnyChannel) {
    return (
      <div className="text-center py-16">
        <BroadcastIcon size={32} className="mx-auto mb-3" style={{ color: '#4a3f39' }} />
        <p className="text-sm font-medium text-white mb-1">No contact channels</p>
        <p className="text-xs" style={{ color: '#6b5c52' }}>
          Tambah Telegram/Discord username di tab Profile dulu.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] mb-3" style={{ color: '#8a7a6e' }}>
        Pick template untuk DM <strong className="text-white">@{user.username}</strong>. Klik{' '}
        <strong style={{ color: '#d4a853' }}>Send</strong> untuk generate text + copy + buka tab
        channel.
      </p>
      <QuickSendPopover user={user} templates={templates} reach={reach} inline />
    </div>
  );
};

// ════════════════════════════════════════
// Main Drawer
// ════════════════════════════════════════

const TABS = [
  { id: 'profile', label: 'Profile', Icon: UserIcon },
  { id: 'payments', label: 'Payments', Icon: StarIcon },
  { id: 'referral', label: 'Referral', Icon: SparklesIcon },
  { id: 'outreach', label: 'Outreach', Icon: SendIcon },
];

export const UserDetailDrawer = ({ userId, onClose, onUserUpdated, templates }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setErr(null);
    try {
      const result = await adminApi.getUserFull(userId);
      setData(result);
    } catch (e) {
      setErr(e.response?.data?.detail || 'Gagal load user detail');
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

  // Lock body scroll while drawer open
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

  return (
    <div
      className="fixed top-16 sm:top-20 bottom-0 left-0 right-0 flex justify-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
      }}
    >
      <div
        className="w-full max-w-2xl h-full overflow-hidden flex flex-col animate-in slide-in-from-right rounded-tl-xl"
        style={{
          background: '#0a0506',
          borderLeft: '1px solid rgba(212,168,83,0.18)',
          borderTop: '1px solid rgba(212,168,83,0.18)',
          boxShadow: '-20px 0 50px -10px rgba(0,0,0,0.5)',
        }}
      >
        {/* ── HEADER ── */}
        <div
          className="flex items-center justify-between px-5 py-3.5 shrink-0 relative"
          style={{
            background: 'linear-gradient(180deg, #14080d, #12090d)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background:
                'linear-gradient(to right, transparent, rgba(212,168,83,0.3), transparent)',
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
              <h2 className="text-sm font-bold text-white tracking-tight">User Detail</h2>
              {data?.user && (
                <p
                  className="text-[10px] font-mono tabular-nums"
                  style={{ color: '#6b5c52' }}
                >
                  #{data.user.id} · {data.user.username}
                </p>
              )}
            </div>
          </div>

          {/* Big clickable close button — independent z-index */}
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:bg-white/10 shrink-0 relative"
            style={{
              color: '#d4a853',
              background: 'rgba(212,168,83,0.08)',
              border: '1px solid rgba(212,168,83,0.22)',
              zIndex: 1,
            }}
            title="Close (Esc)"
            aria-label="Close drawer"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* ── TABS ── */}
        {data && (
          <div
            className="flex shrink-0 px-2 pt-1.5"
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
                  className="flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors relative flex items-center justify-center gap-1.5"
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
        <div className="flex-1 overflow-y-auto px-5 py-5">
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
                Loading...
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
              {activeTab === 'profile' && (
                <ProfileTab data={data} onContactUpdate={handleContactUpdate} />
              )}
              {activeTab === 'payments' && <PaymentsTab data={data} />}
              {activeTab === 'referral' && <ReferralTab data={data} />}
              {activeTab === 'outreach' && <OutreachTab data={data} templates={templates} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
