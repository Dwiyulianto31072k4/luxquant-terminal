// src/components/admin/UserDetailDrawer.jsx
import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../../services/adminApi';
import { ContactBadge } from './ContactBadge';
import { QuickSendPopover } from './QuickSendPopover';

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
  const diff = new Date() - new Date(dateStr);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

const statusBadge = (status) => {
  const colors = {
    confirmed: { bg: 'rgba(52,211,153,0.1)', text: '#34d399', border: 'rgba(52,211,153,0.3)' },
    pending: { bg: 'rgba(251,191,36,0.1)', text: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
    cancelled: { bg: 'rgba(107,92,82,0.1)', text: '#6b5c52', border: 'rgba(107,92,82,0.3)' },
    failed: { bg: 'rgba(248,113,113,0.1)', text: '#f87171', border: 'rgba(248,113,113,0.3)' },
  };
  const c = colors[status] || colors.cancelled;
  return (
    <span
      className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {status}
    </span>
  );
};

// ════════════════════════════════════════
// Tab: Profile (with edit enrichment form)
// ════════════════════════════════════════

const ProfileTab = ({ data, onContactUpdate }) => {
  const { user, reach, enriched_by_user } = data;

  // Edit form state
  const [editing, setEditing] = useState(false);
  const [adminTg, setAdminTg] = useState(user.admin_telegram_username || '');
  const [adminDc, setAdminDc] = useState(user.admin_discord_handle || '');
  const [adminNotes, setAdminNotes] = useState(user.admin_notes || '');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  // Reset form when user changes
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
      const payload = {
        admin_telegram_username: adminTg.trim() || null,
        admin_discord_handle: adminDc.trim() || null,
        admin_notes: adminNotes.trim() || null,
      };
      await onContactUpdate(payload);
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
    (adminTg !== (user.admin_telegram_username || '')) ||
    (adminDc !== (user.admin_discord_handle || '')) ||
    (adminNotes !== (user.admin_notes || ''));

  return (
    <div className="space-y-5">
      {/* Profile header */}
      <div className="flex items-start gap-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shrink-0 overflow-hidden"
          style={{ background: 'rgba(212,168,83,0.15)', color: '#d4a853' }}
        >
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            user.username?.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-white">{user.username}</h3>
          <p className="text-sm" style={{ color: '#8a7a6e' }}>{user.email}</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            <span
              className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
              style={{
                background: user.role === 'admin' ? 'rgba(168,85,247,0.15)' :
                            user.role === 'subscriber' ? 'rgba(52,211,153,0.15)' :
                            'rgba(107,92,82,0.15)',
                color: user.role === 'admin' ? '#a855f7' :
                       user.role === 'subscriber' ? '#34d399' :
                       '#6b5c52',
              }}
            >
              {user.role}
            </span>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#8a7a6e' }}>
              {user.auth_provider}
            </span>
            {!user.is_active && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{ background: 'rgba(248,113,113,0.15)', color: '#f87171' }}>
                Banned
              </span>
            )}
            {user.subscription_source && (
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{ background: 'rgba(212,168,83,0.1)', color: '#d4a853' }}>
                via {user.subscription_source}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick info grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <InfoRow label="User ID" value={`#${user.id}`} />
        <InfoRow label="Created" value={formatDate(user.created_at)} />
        <InfoRow label="First Login" value={formatDate(user.first_login_at)} />
        <InfoRow label="Last Login" value={relativeTime(user.last_login_at)} />
        <InfoRow label="Login Count" value={user.login_count || 0} />
        <InfoRow label="Country" value={user.country_code || '—'} />
        {user.role === 'subscriber' && (
          <>
            <InfoRow
              label="Sub Expires"
              value={user.subscription_expires_at ? formatDate(user.subscription_expires_at) : 'Lifetime ♾️'}
            />
            <InfoRow label="Granted" value={formatDate(user.subscription_granted_at)} />
          </>
        )}
        {user.referral_credit_usdt > 0 && (
          <>
            <InfoRow label="Credit Balance" value={`$${user.referral_credit_usdt}`} />
            <InfoRow label="Lifetime Earned" value={`$${user.lifetime_credit_earned}`} />
          </>
        )}
      </div>

      {/* Contact channels (read-only, click-to-open) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-white">📡 Contact Channels</h4>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-[11px] px-2 py-1 rounded font-medium"
              style={{ color: '#d4a853', background: 'rgba(212,168,83,0.1)', border: '1px solid rgba(212,168,83,0.25)' }}
            >
              ✏️ Edit
            </button>
          )}
        </div>

        {!editing ? (
          <div className="space-y-2">
            {reach.telegram.available && (
              <ContactBadge channel="telegram" value={reach.telegram.value} deepLink={reach.telegram.deep_link} source={reach.telegram.source} />
            )}
            {reach.discord.available && (
              <ContactBadge channel="discord" value={reach.discord.value} deepLink={reach.discord.deep_link} source={reach.discord.source} />
            )}
            {reach.email.available && (
              <ContactBadge channel="email" value={reach.email.value} deepLink={reach.email.deep_link} source={reach.email.source} />
            )}
            {!reach.telegram.available && !reach.discord.available && !reach.email.available && (
              <div className="text-xs p-3 rounded-lg"
                   style={{ background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
                ⚠️ Tidak ada channel kontak yang bisa dipakai. Klik <strong>✏️ Edit</strong> untuk tambah TG/Discord manual.
              </div>
            )}
          </div>
        ) : (
          // Edit form
          <div className="space-y-3 rounded-lg p-3" style={{ background: 'rgba(212,168,83,0.04)', border: '1px solid rgba(212,168,83,0.2)' }}>
            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: '#d4a853' }}>
                ✈️ Telegram Username (admin override)
              </label>
              <input
                type="text"
                value={adminTg}
                onChange={(e) => setAdminTg(e.target.value)}
                placeholder="@username (without @)"
                className="w-full px-2.5 py-1.5 rounded-lg text-sm text-white focus:outline-none"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              {user.telegram_username && (
                <p className="text-[10px] mt-1" style={{ color: '#6b5c52' }}>
                  OAuth value: @{user.telegram_username}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: '#d4a853' }}>
                💬 Discord Handle (admin override)
              </label>
              <input
                type="text"
                value={adminDc}
                onChange={(e) => setAdminDc(e.target.value)}
                placeholder="username or numeric ID"
                className="w-full px-2.5 py-1.5 rounded-lg text-sm text-white focus:outline-none"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
              {user.discord_id && (
                <p className="text-[10px] mt-1" style={{ color: '#6b5c52' }}>
                  OAuth ID: {user.discord_id}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: '#d4a853' }}>
                📝 Admin Notes
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                placeholder="VIP customer, prefers TG. Bayar Annual tiap renewal..."
                className="w-full px-2.5 py-1.5 rounded-lg text-sm text-white focus:outline-none resize-none"
                style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>

            {saveErr && (
              <div className="text-xs px-2 py-1.5 rounded"
                   style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}>
                {saveErr}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="flex-1 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !hasUnsavedChanges}
                className="flex-1 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)', color: '#0a0506' }}
              >
                {saving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'No Changes'}
              </button>
            </div>
          </div>
        )}

        {/* Audit info */}
        {user.admin_enriched_at && enriched_by_user && (
          <div className="mt-2 text-[10px] flex items-center gap-1" style={{ color: '#6b5c52' }}>
            <span>✓</span>
            <span>Enriched by <strong>@{enriched_by_user.username}</strong> on {formatDateTime(user.admin_enriched_at)}</span>
          </div>
        )}
      </div>

      {/* Notes view (when not editing) */}
      {!editing && user.admin_notes && (
        <div>
          <h4 className="text-sm font-bold text-white mb-2">📝 Admin Notes</h4>
          <div className="text-xs p-3 rounded-lg whitespace-pre-wrap"
               style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', color: '#c9b59e' }}>
            {user.admin_notes}
          </div>
        </div>
      )}
    </div>
  );
};

const InfoRow = ({ label, value }) => (
  <div className="flex justify-between items-center px-2 py-1.5 rounded"
       style={{ background: 'rgba(255,255,255,0.02)' }}>
    <span className="text-[10px] uppercase tracking-wider" style={{ color: '#6b5c52' }}>{label}</span>
    <span className="text-xs text-white font-medium truncate ml-2">{value}</span>
  </div>
);

// ════════════════════════════════════════
// Tab: Payments
// ════════════════════════════════════════

const PaymentsTab = ({ data }) => {
  const { payments } = data;

  if (!payments || payments.length === 0) {
    return (
      <div className="text-center py-12 text-sm" style={{ color: '#6b5c52' }}>
        Belum ada history payment.
      </div>
    );
  }

  const totalConfirmed = payments
    .filter((p) => p.status === 'confirmed')
    .reduce((sum, p) => sum + (p.final_amount || p.amount_usdt || 0), 0);

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg p-3" style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
          <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#34d399' }}>Total Paid</p>
          <p className="text-lg font-bold mt-1" style={{ color: '#34d399' }}>${totalConfirmed.toFixed(2)}</p>
        </div>
        <div className="flex-1 rounded-lg p-3" style={{ background: 'rgba(212,168,83,0.05)', border: '1px solid rgba(212,168,83,0.15)' }}>
          <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#d4a853' }}>Total Records</p>
          <p className="text-lg font-bold mt-1" style={{ color: '#d4a853' }}>{payments.length}</p>
        </div>
      </div>

      {/* Payment list */}
      <div className="space-y-2">
        {payments.map((p) => (
          <div key={p.id} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div>
                <p className="text-sm font-semibold text-white">{p.plan_label || `Plan #${p.id}`}</p>
                <p className="text-xs" style={{ color: '#8a7a6e' }}>
                  ${(p.final_amount || p.amount_usdt).toFixed(2)}
                  {p.credit_redeemed > 0 && (
                    <span className="text-[10px] ml-1" style={{ color: '#fbbf24' }}>
                      (−${p.credit_redeemed.toFixed(2)} credit)
                    </span>
                  )}
                </p>
              </div>
              {statusBadge(p.status)}
            </div>
            <div className="flex items-center gap-3 text-[10px]" style={{ color: '#6b5c52' }}>
              <span>{formatDateTime(p.created_at)}</span>
              {p.tx_hash && (
                <a href={`https://bscscan.com/tx/${p.tx_hash}`} target="_blank" rel="noopener noreferrer"
                   className="hover:underline" style={{ color: '#60a5fa' }}>
                  {p.tx_hash.slice(0, 8)}...{p.tx_hash.slice(-6)} ↗
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// Tab: Referral
// ════════════════════════════════════════

const ReferralTab = ({ data }) => {
  const { as_referrer, as_referred } = data;

  if ((!as_referrer || as_referrer.length === 0) && !as_referred) {
    return (
      <div className="text-center py-12 text-sm" style={{ color: '#6b5c52' }}>
        Tidak ada aktivitas referral.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* As referred (this user was referred by someone) */}
      {as_referred && (
        <div className="rounded-lg p-3" style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)' }}>
          <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: '#60a5fa' }}>
            ← Referred By
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-white">@{as_referred.referrer_username}</p>
              <p className="text-[10px]" style={{ color: '#6b5c52' }}>
                Joined via: {formatDate(as_referred.created_at)}
              </p>
            </div>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded"
                  style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
              {as_referred.status}
            </span>
          </div>
        </div>
      )}

      {/* As referrer (this user referred others) */}
      {as_referrer && as_referrer.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: '#34d399' }}>
            → Referred ({as_referrer.length})
          </p>
          <div className="space-y-2">
            {as_referrer.map((r) => (
              <div key={r.id} className="rounded-lg p-2.5 flex items-center justify-between"
                   style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.15)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">@{r.referee_username || 'unknown'}</p>
                  <p className="text-[10px]" style={{ color: '#6b5c52' }}>
                    {formatDate(r.created_at)} · {r.total_payments || 0} payment(s)
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {r.total_commission_earned > 0 && (
                    <p className="text-sm font-bold" style={{ color: '#34d399' }}>
                      ${r.total_commission_earned.toFixed(2)}
                    </p>
                  )}
                  <p className="text-[10px]" style={{ color: '#6b5c52' }}>{r.status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════
// Tab: Outreach (Quick Send)
// ════════════════════════════════════════

const OutreachTab = ({ data, templates }) => {
  const { user, reach } = data;
  const hasAnyChannel = reach.telegram.available || reach.discord.available || reach.email.available;

  if (!hasAnyChannel) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-3">📡</p>
        <p className="text-sm font-medium text-white mb-1">Tidak ada channel kontak</p>
        <p className="text-xs" style={{ color: '#6b5c52' }}>
          Tambah Telegram/Discord username di tab Profile dulu.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: '#8a7a6e' }}>
        Pick template untuk DM <strong className="text-white">@{user.username}</strong>. Tekan
        <strong className="text-amber-400"> Send</strong> akan generate text + copy ke clipboard + buka tab channel.
      </p>
      <QuickSendPopover user={user} templates={templates} reach={reach} inline />
    </div>
  );
};

// ════════════════════════════════════════
// Main Drawer
// ════════════════════════════════════════

const TABS = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'payments', label: 'Payments', icon: '💳' },
  { id: 'referral', label: 'Referral', icon: '🔗' },
  { id: 'outreach', label: 'Outreach', icon: '📨' },
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

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleContactUpdate = async (payload) => {
    const result = await adminApi.updateUserContact(userId, payload);
    // Refresh drawer data with the updated user
    await fetchData();
    // Notify parent so list table updates too
    if (onUserUpdated) onUserUpdated(result.user);
  };

  return (
    <div className="fixed inset-0 z-[99998] flex justify-end" onClick={(e) => e.target === e.currentTarget && onClose()}
         style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-full max-w-2xl h-full overflow-hidden flex flex-col animate-in slide-in-from-right"
        style={{ background: '#0a0506', borderLeft: '1px solid rgba(212,168,83,0.2)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
             style={{ background: '#12090d', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-white">User Detail</h2>
            {data?.user && <span className="text-xs" style={{ color: '#6b5c52' }}>#{data.user.id}</span>}
          </div>
          <button onClick={onClose}
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
                  style={{ color: '#8a7a6e' }}
                  title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* Tabs */}
        {data && (
          <div className="flex shrink-0" style={{ background: '#0f070a', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-3 text-xs font-semibold transition-colors relative ${
                    isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}>
                  <span className="mr-1.5">{tab.icon}</span>
                  {tab.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5"
                          style={{ background: 'linear-gradient(90deg, transparent, #d4a853, transparent)' }} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="inline-flex items-center gap-2 text-sm" style={{ color: '#6b5c52' }}>
                <div className="w-4 h-4 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
                Loading...
              </div>
            </div>
          )}

          {err && (
            <div className="rounded-lg p-3 text-sm"
                 style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}>
              ⚠️ {err}
            </div>
          )}

          {data && !loading && (
            <>
              {activeTab === 'profile' && <ProfileTab data={data} onContactUpdate={handleContactUpdate} />}
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
