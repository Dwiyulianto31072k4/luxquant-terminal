// src/components/UserManagementPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { adminApi } from '../services/adminApi';
import { useAuth } from '../context/AuthContext';

// ════════════════════════════════════════
// Helper Functions
// ════════════════════════════════════════

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const RoleBadge = ({ role }) => {
  const styles = {
    admin: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    subscriber: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    free: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${styles[role] || styles.free}`}>
      {role?.toUpperCase()}
    </span>
  );
};

const ProviderIcon = ({ provider }) => {
  const icons = {
    google: '🔵',
    telegram: '✈️',
    local: '✉️',
  };
  return <span title={provider}>{icons[provider] || '❓'}</span>;
};

const SubscriptionBadge = ({ user }) => {
  if (user.role === 'admin') return <span className="text-[11px] text-purple-400">∞ Admin</span>;
  if (user.role !== 'subscriber') return <span className="text-[11px] text-zinc-500">—</span>;
  
  if (!user.subscription_expires_at) {
    return <span className="text-[11px] text-amber-400 font-semibold">♾️ Lifetime</span>;
  }
  
  const days = daysUntil(user.subscription_expires_at);
  if (days <= 0) {
    return <span className="text-[11px] text-red-400 font-semibold">⚠️ Expired</span>;
  }
  if (days <= 7) {
    return <span className="text-[11px] text-orange-400 font-semibold">⏰ {days}d left</span>;
  }
  return <span className="text-[11px] text-emerald-400">{days}d left</span>;
};


// ════════════════════════════════════════
// Stat Card Component
// ════════════════════════════════════════

const StatCard = ({ label, value, icon, color = 'gold', subtext }) => {
  const colorMap = {
    gold: { bg: 'rgba(212,168,83,0.08)', border: 'rgba(212,168,83,0.2)', text: '#d4a853' },
    green: { bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.2)', text: '#34d399' },
    red: { bg: 'rgba(248,113,113,0.08)', border: 'rgba(248,113,113,0.2)', text: '#f87171' },
    purple: { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.2)', text: '#a855f7' },
    blue: { bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)', text: '#60a5fa' },
    orange: { bg: 'rgba(251,146,60,0.08)', border: 'rgba(251,146,60,0.2)', text: '#fb923c' },
  };
  const c = colorMap[color] || colorMap.gold;
  
  return (
    <div className="rounded-xl p-4" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-2xl font-bold" style={{ color: c.text }}>{value ?? '—'}</p>
      {subtext && <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{subtext}</p>}
    </div>
  );
};


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

  // Preview expiry date
  const getPreviewExpiry = () => {
    if (duration === 'lifetime') return 'Tidak ada batas waktu';
    const start = startDate ? new Date(startDate) : new Date();
    const days = duration === '1_month' ? 30 : 365;
    const expiry = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    return `Expires: ${expiry.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: '#12090d', border: '1px solid rgba(212,168,83,0.25)' }}>
        <h3 className="text-lg font-bold text-white mb-1">Grant Subscription</h3>
        <p className="text-sm mb-5" style={{ color: '#8a7a6e' }}>
          User: <span className="text-white font-medium">{user.username}</span>
          {user.role === 'subscriber' && user.subscription_expires_at && !startDate && (
            <span className="ml-2 text-orange-400 text-xs">(extends existing)</span>
          )}
        </p>

        {/* Start Date (optional) */}
        <div className="mb-4">
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#8a7a6e' }}>
            Tanggal Mulai
            <span className="text-zinc-600 ml-1">(opsional — untuk user lama)</span>
          </label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl text-sm text-white focus:outline-none transition-all"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(212,168,83,0.15)', colorScheme: 'dark' }}
            onFocus={e => e.target.style.borderColor = 'rgba(212,168,83,0.4)'}
            onBlur={e => e.target.style.borderColor = 'rgba(212,168,83,0.15)'}
          />
          {!startDate && (
            <p className="text-[10px] mt-1" style={{ color: '#4a3f39' }}>Kosongkan = mulai dari hari ini</p>
          )}
        </div>

        {/* Duration Selection */}
        <div className="space-y-2 mb-3">
          {durationOptions.map(opt => (
            <button key={opt.value} onClick={() => setDuration(opt.value)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                duration === opt.value
                  ? 'border-gold-primary/50 bg-gold-primary/10'
                  : 'border-white/5 bg-white/[0.02] hover:border-white/10'
              }`}>
              <div className="text-left">
                <span className={`text-sm font-semibold ${duration === opt.value ? 'text-gold-primary' : 'text-white'}`}>{opt.label}</span>
                <p className="text-[11px]" style={{ color: '#6b5c52' }}>{opt.desc}</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                duration === opt.value ? 'border-gold-primary bg-gold-primary' : 'border-white/20'
              }`}>
                {duration === opt.value && (
                  <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="mb-4 px-3 py-2 rounded-lg" style={{ background: 'rgba(212,168,83,0.06)', border: '1px solid rgba(212,168,83,0.1)' }}>
          <p className="text-[11px] text-gold-primary font-medium">
            {startDate && `Mulai: ${new Date(startDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} → `}
            {getPreviewExpiry()}
          </p>
        </div>

        {/* Note */}
        <div className="mb-5">
          <label className="block text-xs font-medium mb-1.5" style={{ color: '#8a7a6e' }}>Catatan (opsional)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Contoh: Payment via BCA, promo code XYZ"
            className="w-full px-3 py-2.5 rounded-xl text-sm text-white focus:outline-none transition-all"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(212,168,83,0.15)' }}
            onFocus={e => e.target.style.borderColor = 'rgba(212,168,83,0.4)'}
            onBlur={e => e.target.style.borderColor = 'rgba(212,168,83,0.15)'}
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.08)' }}>
            Batal
          </button>
          <button onClick={handleGrant} disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #d4a853, #8b6914)', color: '#0a0506' }}>
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
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#12090d', border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-sm mb-5" style={{ color: '#8a7a6e' }}>{message}</p>
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium"
            style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.08)' }}>
            Batal
          </button>
          <button onClick={handleConfirm} disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 ${
              danger ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
              : 'text-white border border-white/10 hover:bg-white/5'
            }`}>
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

const UserManagementPage = () => {
  const { user: currentUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expiringUsers, setExpiringUsers] = useState([]);

  // Filters
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);

  // Modals
  const [grantModal, setGrantModal] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [toast, setToast] = useState(null);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (message, type = 'success') => setToast({ message, type });

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const data = await adminApi.getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsers({
        search: search || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        page,
        pageSize,
        sortBy: 'created_at',
        sortOrder: 'desc',
      });
      setUsers(data.users);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, page, pageSize]);

  // Fetch expiring
  const fetchExpiring = useCallback(async () => {
    try {
      const data = await adminApi.getExpiringSubscriptions(7);
      setExpiringUsers(data.expiring_users || []);
    } catch (err) {
      console.error('Failed to fetch expiring:', err);
    }
  }, []);

  useEffect(() => { fetchStats(); fetchExpiring(); }, [fetchStats, fetchExpiring]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter]);

  // Actions
  const handleGrant = async (userId, duration, note, startDate) => {
    try {
      const result = await adminApi.grantSubscription(userId, duration, note, startDate);
      showToast(result.message);
      fetchUsers();
      fetchStats();
      fetchExpiring();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Gagal grant subscription', 'error');
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
      }
    });
  };

  const handleToggleActive = async (userId, username, isActive) => {
    setConfirmModal({
      title: isActive ? 'Ban User' : 'Unban User',
      message: isActive
        ? `Yakin ingin menonaktifkan akun ${username}? User tidak akan bisa login.`
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
          showToast(err.response?.data?.detail || 'Gagal update status', 'error');
        }
      }
    });
  };

  const handleCleanup = () => {
    setConfirmModal({
      title: 'Cleanup Expired',
      message: 'Downgrade semua subscriber yang sudah expired ke free?',
      confirmText: 'Cleanup',
      danger: false,
      onConfirm: async () => {
        try {
          const result = await adminApi.cleanupExpired();
          showToast(result.message);
          fetchUsers();
          fetchStats();
          fetchExpiring();
        } catch (err) {
          showToast('Gagal cleanup', 'error');
        }
      }
    });
  };

  // Access guard
  if (currentUser?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p className="text-4xl mb-3">🔒</p>
          <p className="text-lg font-semibold text-white mb-1">Admin Only</p>
          <p className="text-sm" style={{ color: '#6b5c52' }}>Halaman ini hanya bisa diakses oleh admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100000] px-4 py-3 rounded-xl text-sm font-medium shadow-2xl animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'error'
            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
            : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-2xl">👥</span> User Management
          </h1>
          <p className="text-xs mt-1" style={{ color: '#6b5c52' }}>Kelola users, subscription, dan akses platform.</p>
        </div>
        <div className="flex gap-2">
          {stats?.expired_not_downgraded > 0 && (
            <button onClick={handleCleanup}
              className="px-3 py-2 rounded-xl text-xs font-semibold transition-all bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20">
              🧹 Cleanup {stats.expired_not_downgraded} Expired
            </button>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Users" value={stats?.total_users} icon="👥" color="blue" />
        <StatCard label="Subscribers" value={stats?.active_subscribers} icon="⭐" color="green"
          subtext={stats?.lifetime_subscribers ? `${stats.lifetime_subscribers} lifetime` : undefined} />
        <StatCard label="Free Users" value={stats?.free_users} icon="👤" color="gold" />
        <StatCard label="Admins" value={stats?.admin_count} icon="🛡️" color="purple" />
        <StatCard label="Expiring Soon" value={stats?.expiring_soon} icon="⏰" color="orange"
          subtext="Dalam 7 hari" />
        <StatCard label="New (30d)" value={stats?.new_users_30d} icon="📈" color="blue"
          subtext="User baru" />
      </div>

      {/* Expiring Alert */}
      {expiringUsers.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.15)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚠️</span>
            <h3 className="text-sm font-bold text-orange-400">Subscription Akan Berakhir ({expiringUsers.length})</h3>
          </div>
          <div className="space-y-2">
            {expiringUsers.slice(0, 5).map(({ user: u, days_remaining }) => (
              <div key={u.id} className="flex items-center justify-between py-2 px-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: 'rgba(251,146,60,0.15)', color: '#fb923c' }}>
                    {u.username?.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{u.username}</p>
                    <p className="text-[10px]" style={{ color: '#6b5c52' }}>{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold ${days_remaining <= 3 ? 'text-red-400' : 'text-orange-400'}`}>
                    {days_remaining}d left
                  </span>
                  <button onClick={() => setGrantModal(u)}
                    className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
                    Extend
                  </button>
                </div>
              </div>
            ))}
            {expiringUsers.length > 5 && (
              <p className="text-[11px] text-center" style={{ color: '#6b5c52' }}>+{expiringUsers.length - 5} more</p>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[200px]">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari username, email, telegram..."
            className="w-full px-3 py-2.5 rounded-xl text-sm text-white focus:outline-none transition-all"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            onFocus={e => e.target.style.borderColor = 'rgba(212,168,83,0.3)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
          />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm text-white focus:outline-none cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <option value="">All Roles</option>
          <option value="free">Free</option>
          <option value="subscriber">Subscriber</option>
          <option value="admin">Admin</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl text-sm text-white focus:outline-none cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Banned</option>
          <option value="expiring">Expiring Soon</option>
          <option value="expired">Expired</option>
        </select>
        <span className="text-[11px] ml-1" style={{ color: '#6b5c52' }}>
          {total} user{total !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Users Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#6b5c52' }}>User</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider hidden sm:table-cell" style={{ color: '#6b5c52' }}>Provider</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#6b5c52' }}>Role</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider hidden md:table-cell" style={{ color: '#6b5c52' }}>Subscription</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider hidden lg:table-cell" style={{ color: '#6b5c52' }}>Joined</th>
                <th className="text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#6b5c52' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12">
                  <div className="inline-flex items-center gap-2 text-sm" style={{ color: '#6b5c52' }}>
                    <div className="w-4 h-4 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
                    Loading...
                  </div>
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12">
                  <p className="text-sm" style={{ color: '#6b5c52' }}>Tidak ada user ditemukan</p>
                </td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-t transition-colors hover:bg-white/[0.015]" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  {/* User Info */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          background: u.avatar_url ? 'transparent' : 'rgba(212,168,83,0.15)',
                          color: '#d4a853',
                        }}>
                        {u.avatar_url
                          ? <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          : u.username?.charAt(0).toUpperCase()
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                          {u.username}
                          {!u.is_active && <span className="text-[9px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">BANNED</span>}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: '#6b5c52' }}>{u.email}</p>
                        {u.telegram_username && (
                          <p className="text-[10px] text-blue-400">@{u.telegram_username}</p>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Provider */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <ProviderIcon provider={u.auth_provider} />
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} />
                  </td>

                  {/* Subscription */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    <SubscriptionBadge user={u} />
                    {u.subscription_expires_at && u.role === 'subscriber' && (
                      <p className="text-[10px] mt-0.5" style={{ color: '#4a3f39' }}>{formatDate(u.subscription_expires_at)}</p>
                    )}
                  </td>

                  {/* Joined */}
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-[11px]" style={{ color: '#6b5c52' }}>{formatDate(u.created_at)}</span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {u.role !== 'admin' && (
                        <>
                          <button onClick={() => setGrantModal(u)} title="Grant Subscription"
                            className="p-1.5 rounded-lg text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                          {u.role === 'subscriber' && (
                            <button onClick={() => handleRevoke(u.id, u.username)} title="Revoke Subscription"
                              className="p-1.5 rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors border border-red-500/20">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                              </svg>
                            </button>
                          )}
                          <button onClick={() => handleToggleActive(u.id, u.username, u.is_active)} title={u.is_active ? 'Ban' : 'Unban'}
                            className={`p-1.5 rounded-lg transition-colors border ${
                              u.is_active
                                ? 'text-orange-400 bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20'
                                : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20'
                            }`}>
                            {u.is_active ? (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <p className="text-[11px]" style={{ color: '#6b5c52' }}>
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-1.5">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-30 transition-colors"
                style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.06)' }}>
                ← Prev
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-30 transition-colors"
                style={{ color: '#8a7a6e', border: '1px solid rgba(255,255,255,0.06)' }}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
};

export default UserManagementPage;