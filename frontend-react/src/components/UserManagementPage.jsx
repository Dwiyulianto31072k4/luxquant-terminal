// src/components/UserManagementPage.jsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminApi } from '../services/adminApi';
import { useAuth } from '../context/AuthContext';
import { ContactBadgeRow } from './admin/ContactBadge';
import { FilterPanel } from './admin/FilterPanel';
import { BulkActionBar, exportUsersToCsv } from './admin/BulkActionBar';
import { UserDetailDrawer } from './admin/UserDetailDrawer';
import {
  TelegramIcon,
  DiscordIcon,
  EmailIcon,
  ExternalLinkIcon,
  SearchIcon,
  UsersIcon,
  UserIcon,
  ShieldIcon,
  StarIcon,
  ClockIcon,
  TrendingUpIcon,
  BroadcastIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  SparklesIcon,
  EyeIcon,
  PlusIcon,
  MinusIcon,
  BanIcon,
  ProviderIcon,
} from './admin/Icons';

// ════════════════════════════════════════
// Helpers
// ════════════════════════════════════════

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const daysSince = (dateStr) => {
  if (!dateStr) return null;
  return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
};

const relativeTime = (dateStr) => {
  if (!dateStr) return 'Never';
  const days = daysSince(dateStr);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

const RoleBadge = ({ role }) => {
  const styles = {
    admin: { bg: 'rgba(168,85,247,0.12)', color: '#a855f7', border: 'rgba(168,85,247,0.3)' },
    subscriber: { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.3)' },
    free: { bg: 'rgba(107,92,82,0.12)', color: '#8a7a6e', border: 'rgba(107,92,82,0.3)' },
  };
  const s = styles[role] || styles.free;
  return (
    <span
      className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {role}
    </span>
  );
};

const SubscriptionBadge = ({ user }) => {
  if (user.role === 'admin') return <span className="text-[10px]" style={{ color: '#a855f7' }}>∞ Admin</span>;
  if (user.role !== 'subscriber') return <span className="text-[10px]" style={{ color: '#4a3f39' }}>—</span>;

  if (!user.subscription_expires_at) {
    return <span className="text-[10px] font-semibold" style={{ color: '#fbbf24' }}>Lifetime</span>;
  }

  const days = daysUntil(user.subscription_expires_at);
  if (days <= 0) return <span className="text-[10px] font-semibold" style={{ color: '#f87171' }}>Expired</span>;
  if (days <= 7) return <span className="text-[10px] font-semibold" style={{ color: '#fb923c' }}>{days}d left</span>;
  return <span className="text-[10px]" style={{ color: '#34d399' }}>{days}d left</span>;
};

// ════════════════════════════════════════
// Flowscan-style Stat Card
// ════════════════════════════════════════

const StatCard = ({ label, value, Icon, accent, subtext }) => {
  const colorMap = {
    blue: '#60a5fa',
    green: '#34d399',
    gold: '#d4a853',
    purple: '#a855f7',
    orange: '#fb923c',
    red: '#f87171',
  };
  const c = colorMap[accent] || '#d4a853';

  return (
    <div
      className="relative overflow-hidden rounded-xl px-4 py-3.5"
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Subtle top gradient line */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none"
        style={{
          background: `linear-gradient(to right, transparent, ${c}40, transparent)`,
        }}
      />
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          {label}
        </span>
        {Icon && <Icon size={13} style={{ color: c, opacity: 0.7 }} />}
      </div>
      <p
        className="text-2xl font-light tracking-tight tabular-nums leading-none"
        style={{ color: c }}
      >
        {value ?? '—'}
      </p>
      {subtext && (
        <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {subtext}
        </p>
      )}
    </div>
  );
};

// ════════════════════════════════════════
// Reach Card (interactive, click to filter)
// ════════════════════════════════════════

const ReachCard = ({ Icon, label, value, color, onClick, active }) => (
  <button
    onClick={onClick}
    className="relative overflow-hidden text-left rounded-lg px-3 py-2.5 transition-all hover:scale-[1.02]"
    style={{
      background: active ? `${color}18` : `${color}0a`,
      border: `1px solid ${active ? color + '50' : color + '22'}`,
    }}
  >
    <div className="flex items-center justify-between mb-1.5">
      <span className="flex items-center gap-1.5">
        <Icon size={12} colored />
        <span
          className="text-[9px] uppercase tracking-wider font-semibold"
          style={{ color: color }}
        >
          {label}
        </span>
      </span>
    </div>
    <p
      className="text-xl font-light tracking-tight tabular-nums leading-none"
      style={{ color: color }}
    >
      {value}
    </p>
  </button>
);

// ════════════════════════════════════════
// Grant Modal
// ════════════════════════════════════════

const GrantModal = ({ user, onClose, onGrant }) => {
  const [duration, setDuration] = useState('1_month');
  const [note, setNote] = useState('');
  const [startDate, setStartDate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGrant = async () => {
    setLoading(true);
    try {
      await onGrant(user.id, duration, note || null, startDate || null);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const durationOptions = [
    { value: '1_month', label: '1 Bulan', desc: '30 hari' },
    { value: '1_year', label: '1 Tahun', desc: '365 hari' },
    { value: 'lifetime', label: 'Lifetime', desc: 'Tidak ada batas waktu' },
  ];

  const getPreviewExpiry = () => {
    if (duration === 'lifetime') return 'Tidak ada batas waktu';
    const start = startDate ? new Date(startDate) : new Date();
    const days = duration === '1_month' ? 30 : 365;
    const expiry = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    return `Expires: ${expiry.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: '#12090d', border: '1px solid rgba(212,168,83,0.25)' }}
      >
        <h3 className="text-base font-bold text-white mb-1 tracking-tight">Grant Subscription</h3>
        <p className="text-xs mb-5" style={{ color: '#8a7a6e' }}>
          User: <span className="text-white font-medium">{user.username}</span>
          {user.role === 'subscriber' && user.subscription_expires_at && !startDate && (
            <span className="ml-2 text-orange-400 text-[10px]">(extends existing)</span>
          )}
        </p>

        <div className="mb-4">
          <label
            className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
            style={{ color: '#8a7a6e' }}
          >
            Tanggal Mulai
            <span className="text-zinc-600 ml-1 normal-case tracking-normal">(opsional)</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(212,168,83,0.15)',
              colorScheme: 'dark',
            }}
          />
          {!startDate && (
            <p className="text-[10px] mt-1" style={{ color: '#4a3f39' }}>
              Kosongkan = mulai dari hari ini
            </p>
          )}
        </div>

        <div className="space-y-2 mb-3">
          {durationOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDuration(opt.value)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                duration === opt.value
                  ? 'bg-amber-500/10'
                  : 'bg-white/[0.02] hover:bg-white/[0.04]'
              }`}
              style={{
                borderColor: duration === opt.value ? 'rgba(212,168,83,0.5)' : 'rgba(255,255,255,0.05)',
              }}
            >
              <div className="text-left">
                <span
                  className={`text-sm font-semibold ${duration === opt.value ? 'text-amber-400' : 'text-white'}`}
                >
                  {opt.label}
                </span>
                <p className="text-[10px]" style={{ color: '#6b5c52' }}>
                  {opt.desc}
                </p>
              </div>
              <div
                className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
                style={{
                  borderColor: duration === opt.value ? '#d4a853' : 'rgba(255,255,255,0.2)',
                  background: duration === opt.value ? '#d4a853' : 'transparent',
                }}
              >
                {duration === opt.value && (
                  <svg
                    className="w-3 h-3"
                    style={{ color: '#000' }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>

        <div
          className="mb-4 px-3 py-2 rounded-lg"
          style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.1)' }}
        >
          <p className="text-[10px] font-medium" style={{ color: '#d4a853' }}>
            {startDate &&
              `Mulai: ${new Date(startDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} → `}
            {getPreviewExpiry()}
          </p>
        </div>

        <div className="mb-5">
          <label
            className="block text-[10px] uppercase tracking-wider font-semibold mb-1.5"
            style={{ color: '#8a7a6e' }}
          >
            Catatan (opsional)
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Contoh: Payment via BCA, promo code XYZ"
            className="w-full px-3 py-2 rounded-lg text-xs text-white focus:outline-none"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(212,168,83,0.15)' }}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider"
            style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Batal
          </button>
          <button
            onClick={handleGrant}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)', color: '#0a0506' }}
          >
            {loading ? 'Processing...' : 'Grant Access'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// Confirm Modal
// ════════════════════════════════════════

const ConfirmModal = ({ title, message, onConfirm, onClose, confirmText = 'Confirm', danger = false }) => {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: '#12090d', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <h3 className="text-base font-bold text-white mb-2 tracking-tight">{title}</h3>
        <p className="text-xs mb-5 whitespace-pre-line" style={{ color: '#8a7a6e' }}>
          {message}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider"
            style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            Batal
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            style={{
              background: danger ? 'rgba(248,113,113,0.18)' : 'rgba(255,255,255,0.05)',
              color: danger ? '#f87171' : '#fff',
              border: `1px solid ${danger ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            {loading ? '...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════
// Main Page
// ════════════════════════════════════════

const DEFAULT_FILTERS = {
  role: null,
  status: null,
  provider: null,
  activity: null,
  reach: null,
  sortBy: 'created_at',
  sortOrder: 'desc',
};

const UserManagementPage = () => {
  const { user: currentUser } = useAuth();

  // Data
  const [stats, setStats] = useState(null);
  const [contactStats, setContactStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expiringUsers, setExpiringUsers] = useState([]);
  const [templates, setTemplates] = useState([]);

  // UI
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Modals
  const [grantModal, setGrantModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [drawerUserId, setDrawerUserId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const fetchStats = useCallback(async () => {
    try {
      const data = await adminApi.getStats();
      setStats(data);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  }, []);

  const fetchContactStats = useCallback(async () => {
    try {
      const data = await adminApi.getContactStats();
      setContactStats(data);
    } catch (e) {
      console.error('Failed to fetch contact stats:', e);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const data = await adminApi.getOutreachTemplates();
      setTemplates(data.templates || []);
    } catch (e) {
      console.error('Failed to fetch templates:', e);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsers({
        search: search || undefined,
        role: filters.role || undefined,
        status: filters.status || undefined,
        provider: filters.provider || undefined,
        activity: filters.activity || undefined,
        reach: filters.reach || undefined,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder,
        page,
        pageSize,
      });
      setUsers(data.users);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (e) {
      console.error('Failed to fetch users:', e);
      showToast('Gagal load users', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, filters, page, pageSize]);

  const fetchExpiring = useCallback(async () => {
    try {
      const data = await adminApi.getExpiringSubscriptions(7);
      setExpiringUsers(data.expiring_users || []);
    } catch (e) {
      console.error('Failed to fetch expiring:', e);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchContactStats();
    fetchExpiring();
    fetchTemplates();
  }, [fetchStats, fetchContactStats, fetchExpiring, fetchTemplates]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [search, filters]);

  const selectedUsers = useMemo(
    () => users.filter((u) => selectedIds.has(u.id)),
    [users, selectedIds]
  );
  const allVisibleSelected = users.length > 0 && users.every((u) => selectedIds.has(u.id));

  const toggleSelect = (userId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        users.forEach((u) => next.delete(u.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        users.forEach((u) => next.add(u.id));
        return next;
      });
    }
  };

  // ── Single actions ──
  const handleGrant = async (userId, duration, note, startDate) => {
    try {
      const result = await adminApi.grantSubscription(userId, duration, note, startDate);
      showToast(result.message);
      fetchUsers();
      fetchStats();
      fetchExpiring();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Gagal grant', 'error');
      throw err;
    }
  };

  const handleRevoke = async (userId, username) => {
    setConfirmModal({
      title: 'Revoke Subscription',
      message: `Yakin ingin mencabut subscription ${username}? User akan di-downgrade ke free.`,
      confirmText: 'Revoke',
      danger: true,
      onConfirm: async () => {
        try {
          const result = await adminApi.revokeSubscription(userId);
          showToast(result.message);
          fetchUsers();
          fetchStats();
          fetchExpiring();
        } catch (err) {
          showToast(err.response?.data?.detail || 'Gagal revoke', 'error');
        }
      },
    });
  };

  const handleToggleActive = async (userId, username, isActive) => {
    setConfirmModal({
      title: isActive ? 'Ban User' : 'Unban User',
      message: isActive
        ? `Yakin ingin menonaktifkan akun ${username}?`
        : `Aktifkan kembali akun ${username}?`,
      confirmText: isActive ? 'Ban' : 'Unban',
      danger: isActive,
      onConfirm: async () => {
        try {
          const result = await adminApi.toggleUserActive(userId);
          showToast(result.message);
          fetchUsers();
          fetchStats();
        } catch (err) {
          showToast(err.response?.data?.detail || 'Gagal update', 'error');
        }
      },
    });
  };

  const handleCleanup = () => {
    setConfirmModal({
      title: 'Cleanup Expired',
      message: 'Downgrade semua subscriber yang sudah expired ke free?',
      confirmText: 'Cleanup',
      onConfirm: async () => {
        try {
          const result = await adminApi.cleanupExpired();
          showToast(result.message);
          fetchUsers();
          fetchStats();
          fetchExpiring();
        } catch (e) {
          showToast('Gagal cleanup', 'error');
        }
      },
    });
  };

  // ── Bulk ──
  const handleBulkExport = () => {
    const filename = `users_${new Date().toISOString().slice(0, 10)}.csv`;
    exportUsersToCsv(selectedUsers, filename);
    showToast(`Exported ${selectedUsers.length} users to CSV`);
  };

  const handleBulkGrant = async (duration) => {
    const targets = selectedUsers.filter((u) => u.role !== 'admin');
    if (targets.length === 0) {
      showToast('Tidak ada user yang bisa di-grant (admin di-skip)', 'error');
      return;
    }
    const ok = window.confirm(
      `Grant ${duration.replace('_', ' ')} subscription ke ${targets.length} user?\n\nAdmin akan di-skip otomatis. Proceed?`
    );
    if (!ok) return;
    let s = 0;
    let f = 0;
    for (const u of targets) {
      try {
        await adminApi.grantSubscription(u.id, duration, `Bulk grant ${duration}`, null);
        s++;
      } catch (err) {
        f++;
        console.error(`Failed for ${u.username}:`, err);
      }
    }
    showToast(`✓ ${s} granted${f > 0 ? `, ✗ ${f} failed` : ''}`);
    setSelectedIds(new Set());
    fetchUsers();
    fetchStats();
    fetchExpiring();
  };

  const handleBulkRevoke = async () => {
    const targets = selectedUsers.filter((u) => u.role === 'subscriber');
    let s = 0;
    let f = 0;
    for (const u of targets) {
      try {
        await adminApi.revokeSubscription(u.id);
        s++;
      } catch (err) {
        f++;
        console.error(`Failed for ${u.username}:`, err);
      }
    }
    showToast(`✓ ${s} revoked${f > 0 ? `, ✗ ${f} failed` : ''}`);
    setSelectedIds(new Set());
    fetchUsers();
    fetchStats();
  };

  const handleBulkSendTemplate = async (templateId) => {
    const reachable = selectedUsers.filter((u) => {
      const hasTG = u.admin_telegram_username || u.telegram_username;
      const hasDC = u.admin_discord_handle || u.discord_id;
      const hasReal =
        u.email && !u.email.endsWith('@telegram.luxquant.tw') && !u.email.endsWith('@discord.luxquant.tw');
      return hasTG || hasDC || hasReal;
    });

    const targets = reachable.slice(0, 10);
    let opened = 0;
    const texts = [];

    for (const u of targets) {
      try {
        const r = await adminApi.renderOutreachTemplate(templateId, u.id);
        texts.push(`=== ${u.username} (${r.channel}) ===\n${r.body}\n`);
        if (r.deep_link) {
          window.open(r.deep_link, '_blank', 'noopener,noreferrer');
          opened++;
        }
      } catch (err) {
        console.error(`Failed to render for ${u.username}:`, err);
      }
    }

    if (texts.length > 0) {
      try {
        await navigator.clipboard.writeText(texts.join('\n'));
      } catch {}
    }
    showToast(
      `✓ Opened ${opened} tab(s). Messages copied to clipboard${
        reachable.length > 10 ? ` (${reachable.length - 10} skipped, cap=10)` : ''
      }`
    );
    setSelectedIds(new Set());
  };

  // ── Access guard ──
  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <ShieldIcon size={48} className="mx-auto mb-3" style={{ color: '#6b5c52' }} />
          <p className="text-base font-semibold text-white mb-1">Admin Only</p>
          <p className="text-xs" style={{ color: '#6b5c52' }}>
            Halaman ini hanya bisa diakses oleh admin.
          </p>
        </div>
      </div>
    );
  }

  const reachPct = contactStats
    ? Math.round(((contactStats.total - contactStats.unreachable) / contactStats.total) * 100)
    : 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8 space-y-6 pb-24">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100000] px-4 py-2.5 rounded-xl text-xs font-medium shadow-2xl animate-in fade-in slide-in-from-top-2 ${
            toast.type === 'error'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5"
             style={{ color: 'rgba(255,255,255,0.4)' }}>
            Admin
          </p>
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-white flex items-center gap-2.5">
            <UsersIcon size={24} style={{ color: '#d4a853' }} />
            User Management
          </h1>
          <p className="text-xs mt-1.5" style={{ color: '#6b5c52' }}>
            Kelola users, subscription, contact enrichment, dan outreach.
          </p>
        </div>
        {stats?.expired_not_downgraded > 0 && (
          <button
            onClick={handleCleanup}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider"
            style={{
              background: 'rgba(248,113,113,0.08)',
              color: '#f87171',
              border: '1px solid rgba(248,113,113,0.22)',
            }}
          >
            <AlertTriangleIcon size={13} />
            Cleanup {stats.expired_not_downgraded} Expired
          </button>
        )}
      </div>

      {/* Stats grid (Flowscan style) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Users" value={stats?.total_users} Icon={UsersIcon} accent="blue" />
        <StatCard
          label="Subscribers"
          value={stats?.active_subscribers}
          Icon={StarIcon}
          accent="green"
          subtext={stats?.lifetime_subscribers ? `${stats.lifetime_subscribers} lifetime` : undefined}
        />
        <StatCard label="Free Users" value={stats?.free_users} Icon={UserIcon} accent="gold" />
        <StatCard label="Admins" value={stats?.admin_count} Icon={ShieldIcon} accent="purple" />
        <StatCard
          label="Expiring Soon"
          value={stats?.expiring_soon}
          Icon={ClockIcon}
          accent="orange"
          subtext="Dalam 7 hari"
        />
        <StatCard
          label="New (30d)"
          value={stats?.new_users_30d}
          Icon={TrendingUpIcon}
          accent="blue"
          subtext="User baru"
        />
      </div>

      {/* Contact Reach section */}
      {contactStats && (
        <div
          className="relative overflow-hidden rounded-xl p-4"
          style={{
            background: 'rgba(212,168,83,0.025)',
            border: '1px solid rgba(212,168,83,0.12)',
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background:
                'linear-gradient(to right, transparent, rgba(212,168,83,0.3), transparent)',
            }}
          />
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="text-xs font-bold text-white flex items-center gap-2 tracking-tight">
              <BroadcastIcon size={14} style={{ color: '#d4a853' }} />
              Contact Reach
            </h3>
            <p
              className="text-[10px] tabular-nums"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              {reachPct}% of {contactStats.total} reachable
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <ReachCard
              Icon={TelegramIcon}
              label="Telegram"
              value={contactStats.telegram_reachable}
              color="#229ED9"
              active={filters.reach === 'has_tg'}
              onClick={() =>
                setFilters({ ...filters, reach: filters.reach === 'has_tg' ? null : 'has_tg' })
              }
            />
            <ReachCard
              Icon={DiscordIcon}
              label="Discord"
              value={contactStats.discord_reachable}
              color="#5865F2"
              active={filters.reach === 'has_dc'}
              onClick={() =>
                setFilters({ ...filters, reach: filters.reach === 'has_dc' ? null : 'has_dc' })
              }
            />
            <ReachCard
              Icon={EmailIcon}
              label="Email"
              value={contactStats.email_reachable}
              color="#fbbf24"
              active={filters.reach === 'has_email'}
              onClick={() =>
                setFilters({ ...filters, reach: filters.reach === 'has_email' ? null : 'has_email' })
              }
            />
            <ReachCard
              Icon={SparklesIcon}
              label="Enriched"
              value={contactStats.admin_enriched}
              color="#d4a853"
              active={filters.reach === 'admin_enriched'}
              onClick={() =>
                setFilters({
                  ...filters,
                  reach: filters.reach === 'admin_enriched' ? null : 'admin_enriched',
                })
              }
            />
            <ReachCard
              Icon={AlertTriangleIcon}
              label="Unreachable"
              value={contactStats.unreachable}
              color="#f87171"
              active={filters.reach === 'unreachable'}
              onClick={() =>
                setFilters({
                  ...filters,
                  reach: filters.reach === 'unreachable' ? null : 'unreachable',
                })
              }
            />
          </div>
        </div>
      )}

      {/* Expiring Alert (compact) */}
      {expiringUsers.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{
            background: 'rgba(251,146,60,0.05)',
            border: '1px solid rgba(251,146,60,0.18)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangleIcon size={14} style={{ color: '#fb923c' }} />
            <h3 className="text-xs font-bold tracking-tight" style={{ color: '#fb923c' }}>
              Subscription Akan Berakhir ({expiringUsers.length})
            </h3>
          </div>
          <div className="space-y-1.5">
            {expiringUsers.slice(0, 5).map(({ user: u, days_remaining }) => (
              <div
                key={u.id}
                className="flex items-center justify-between py-1.5 px-3 rounded-lg"
                style={{ background: 'rgba(0,0,0,0.18)' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: 'rgba(251,146,60,0.18)', color: '#fb923c' }}
                  >
                    {u.username?.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">{u.username}</p>
                    <p className="text-[10px]" style={{ color: '#6b5c52' }}>
                      {u.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-[11px] font-bold tabular-nums"
                    style={{ color: days_remaining <= 3 ? '#f87171' : '#fb923c' }}
                  >
                    {days_remaining}d left
                  </span>
                  <button
                    onClick={() => setGrantModal(u)}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      background: 'rgba(52,211,153,0.1)',
                      color: '#34d399',
                      border: '1px solid rgba(52,211,153,0.22)',
                    }}
                  >
                    Extend
                  </button>
                </div>
              </div>
            ))}
            {expiringUsers.length > 5 && (
              <p className="text-[10px] text-center pt-1" style={{ color: '#6b5c52' }}>
                +{expiringUsers.length - 5} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <SearchIcon
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: '#6b5c52' }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari username, email, telegram, discord, atau admin enrichment..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-xs text-white focus:outline-none transition-colors"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          />
        </div>
        <span
          className="text-[10px] whitespace-nowrap tabular-nums px-2"
          style={{ color: '#6b5c52' }}
        >
          {total} user{total !== 1 ? 's' : ''}
          {selectedIds.size > 0 && (
            <span style={{ color: '#d4a853' }}> · {selectedIds.size} selected</span>
          )}
        </span>
      </div>

      {/* Filter panel */}
      <FilterPanel
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        stats={contactStats}
      />

      {/* Users table */}
      <div
        className="relative overflow-hidden rounded-xl"
        style={{
          background: 'rgba(255,255,255,0.015)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.04)',
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-px pointer-events-none"
          style={{
            background:
              'linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)',
          }}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.015)' }}>
                <th
                  className="px-3 py-2.5 w-10"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded cursor-pointer accent-amber-500"
                  />
                </th>
                <th
                  className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  User
                </th>
                <th
                  className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider hidden md:table-cell"
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  Contact
                </th>
                <th
                  className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  Role
                </th>
                <th
                  className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider hidden md:table-cell"
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  Subscription
                </th>
                <th
                  className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider hidden lg:table-cell"
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  Last Login
                </th>
                <th
                  className="text-right px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    color: 'rgba(255,255,255,0.4)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <div
                      className="inline-flex items-center gap-2 text-xs"
                      style={{ color: '#6b5c52' }}
                    >
                      <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
                           style={{ borderColor: 'rgba(212,168,83,0.3)', borderTopColor: '#d4a853' }} />
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <p className="text-xs" style={{ color: '#6b5c52' }}>
                      Tidak ada user ditemukan
                    </p>
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelected = selectedIds.has(u.id);
                  return (
                    <tr
                      key={u.id}
                      className="transition-colors hover:bg-white/[0.015]"
                      style={{
                        background: isSelected ? 'rgba(212,168,83,0.04)' : 'transparent',
                        borderTop: '1px solid rgba(255,255,255,0.03)',
                      }}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(u.id)}
                          className="w-3.5 h-3.5 rounded cursor-pointer accent-amber-500"
                        />
                      </td>

                      {/* User cell — click to open drawer */}
                      <td className="px-3 py-2.5 cursor-pointer" onClick={() => setDrawerUserId(u.id)}>
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 overflow-hidden"
                            style={{
                              background: u.avatar_url ? 'transparent' : 'rgba(212,168,83,0.15)',
                              color: '#d4a853',
                            }}
                          >
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt=""
                                className="w-7 h-7 rounded-full object-cover"
                              />
                            ) : (
                              u.username?.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-white truncate flex items-center gap-1.5">
                              {u.username}
                              <ProviderIcon provider={u.auth_provider} size={11} />
                              {!u.is_active && (
                                <span
                                  className="text-[8px] uppercase font-bold tracking-wider px-1 py-px rounded"
                                  style={{
                                    background: 'rgba(248,113,113,0.12)',
                                    color: '#f87171',
                                  }}
                                >
                                  Banned
                                </span>
                              )}
                              {u.admin_enriched_at && (
                                <span title="Admin-enriched contact info">
                                  <SparklesIcon size={10} style={{ color: '#d4a853' }} />
                                </span>
                              )}
                            </p>
                            <p
                              className="text-[10px] truncate font-mono"
                              style={{ color: '#6b5c52' }}
                            >
                              {u.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Contact badges */}
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <ContactBadgeRow user={u} />
                      </td>

                      {/* Role */}
                      <td className="px-3 py-2.5">
                        <RoleBadge role={u.role} />
                      </td>

                      {/* Subscription */}
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <SubscriptionBadge user={u} />
                        {u.subscription_expires_at && u.role === 'subscriber' && (
                          <p
                            className="text-[9px] mt-0.5 tabular-nums"
                            style={{ color: '#4a3f39' }}
                          >
                            {formatDate(u.subscription_expires_at)}
                          </p>
                        )}
                      </td>

                      {/* Last login */}
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <span
                          className="text-[10px]"
                          style={{ color: u.last_login_at ? '#8a7a6e' : '#4a3f39' }}
                        >
                          {relativeTime(u.last_login_at)}
                        </span>
                        {u.login_count > 0 && (
                          <p
                            className="text-[9px] tabular-nums"
                            style={{ color: '#4a3f39' }}
                          >
                            {u.login_count}× total
                          </p>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setDrawerUserId(u.id)}
                            title="View Detail"
                            className="p-1.5 rounded-md transition-colors"
                            style={{
                              color: '#60a5fa',
                              background: 'rgba(96,165,250,0.08)',
                              border: '1px solid rgba(96,165,250,0.2)',
                            }}
                          >
                            <EyeIcon size={12} />
                          </button>
                          {u.role !== 'admin' && (
                            <>
                              <button
                                onClick={() => setGrantModal(u)}
                                title="Grant Subscription"
                                className="p-1.5 rounded-md transition-colors"
                                style={{
                                  color: '#34d399',
                                  background: 'rgba(52,211,153,0.08)',
                                  border: '1px solid rgba(52,211,153,0.2)',
                                }}
                              >
                                <PlusIcon size={12} />
                              </button>
                              {u.role === 'subscriber' && (
                                <button
                                  onClick={() => handleRevoke(u.id, u.username)}
                                  title="Revoke Subscription"
                                  className="p-1.5 rounded-md transition-colors"
                                  style={{
                                    color: '#f87171',
                                    background: 'rgba(248,113,113,0.08)',
                                    border: '1px solid rgba(248,113,113,0.2)',
                                  }}
                                >
                                  <MinusIcon size={12} />
                                </button>
                              )}
                              <button
                                onClick={() => handleToggleActive(u.id, u.username, u.is_active)}
                                title={u.is_active ? 'Ban' : 'Unban'}
                                className="p-1.5 rounded-md transition-colors"
                                style={{
                                  color: u.is_active ? '#fb923c' : '#34d399',
                                  background: u.is_active
                                    ? 'rgba(251,146,60,0.08)'
                                    : 'rgba(52,211,153,0.08)',
                                  border: `1px solid ${
                                    u.is_active ? 'rgba(251,146,60,0.2)' : 'rgba(52,211,153,0.2)'
                                  }`,
                                }}
                              >
                                {u.is_active ? <BanIcon size={12} /> : <CheckCircleIcon size={12} />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-3 py-2.5"
            style={{
              borderTop: '1px solid rgba(255,255,255,0.04)',
              background: 'rgba(255,255,255,0.015)',
            }}
          >
            <p className="text-[10px] tabular-nums" style={{ color: '#6b5c52' }}>
              Page {page} of {totalPages} · {total} total
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page <= 1}
                className="px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-30"
                style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                ⟪
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-30"
                style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-30"
                style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                Next
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                className="px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wider disabled:opacity-30"
                style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                ⟫
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating bulk bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        selectedUsers={selectedUsers}
        onClear={() => setSelectedIds(new Set())}
        onBulkGrant={handleBulkGrant}
        onBulkRevoke={handleBulkRevoke}
        onBulkExport={handleBulkExport}
        onBulkSendTemplate={handleBulkSendTemplate}
        templates={templates}
      />

      {/* Modals */}
      {grantModal && <GrantModal user={grantModal} onClose={() => setGrantModal(null)} onGrant={handleGrant} />}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          danger={confirmModal.danger}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {drawerUserId && (
        <UserDetailDrawer
          userId={drawerUserId}
          onClose={() => setDrawerUserId(null)}
          onUserUpdated={() => {
            fetchUsers();
            fetchContactStats();
          }}
          templates={templates}
        />
      )}
    </div>
  );
};

export default UserManagementPage;
