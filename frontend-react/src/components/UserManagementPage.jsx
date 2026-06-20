// src/components/UserManagementPage.jsx
//
// LuxQuant Admin — User Management (orchestrator)
//
// Wires together the sub-components in src/components/admin/users/.
// All visual concerns live in those sub-components; this file owns
// state, data fetching, and action handlers only.
//

import { useState, useEffect, useCallback, useMemo } from 'react';
import { adminApi } from '../services/adminApi';
import { useAuth } from '../context/AuthContext';

// Domain sub-components
import { UsersStatGrid } from './admin/users/UsersStatGrid';
import { ContactReachPanel } from './admin/users/ContactReachPanel';
import { ExpiringSoonPanel } from './admin/users/ExpiringSoonPanel';
import { UsersSearchBar } from './admin/users/UsersSearchBar';
import { UsersTable } from './admin/users/UsersTable';
import { UsersPagination } from './admin/users/UsersPagination';
import { GrantModal } from './admin/users/GrantModal';
import { ConfirmModal } from './admin/users/ConfirmModal';

// Shared admin pieces
import { FilterPanel } from './admin/FilterPanel';
import { BulkActionBar, exportUsersToCsv } from './admin/BulkActionBar';
import { UserDetailDrawer } from './admin/UserDetailDrawer';

// Primitives
import { Toast } from './admin/primitives';
import { isReachable } from './admin/users/helpers';

// Icons
import {
  UsersIcon,
  ShieldIcon,
  AlertTriangleIcon,
} from './admin/Icons';
import { palette, tint } from './admin/designSystem';

// ════════════════════════════════════════════════════════════════════
// Defaults
// ════════════════════════════════════════════════════════════════════

const DEFAULT_FILTERS = {
  role: null,
  status: null,
  provider: null,
  activity: null,
  reach: null,
  vipState: null,
  anomaly: null,
  source: null,
  sortBy: 'created_at',
  sortOrder: 'desc',
};

// ════════════════════════════════════════════════════════════════════
// Anomaly quick-filter chips — one-click drift detection
// ════════════════════════════════════════════════════════════════════

const ANOMALY_CHIPS = [
  {
    key: 'paid_outside',
    statKey: 'anomaly_paid_outside',
    label: 'Paid, outside group',
    hint: 'Active access + linked Telegram, but not in VIP group → send invite',
    color: palette.gold[300],
  },
  {
    key: 'paid_no_tg',
    statKey: 'anomaly_paid_no_tg',
    label: 'Paid, no Telegram',
    hint: 'Active access but no Telegram linked → ask them to connect TG',
    color: '#5aa9e6',
  },
  {
    key: 'expired_inside',
    statKey: 'anomaly_expired_inside',
    label: 'Expired, still in group',
    hint: 'Subscription expired but still inside VIP group → should be kicked',
    color: palette.red[400],
  },
];

const AnomalyChips = ({ stats, active, onToggle }) => {
  if (!stats) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="text-[10px] uppercase tracking-[0.15em] font-semibold mr-1"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        Anomalies
      </span>
      {ANOMALY_CHIPS.map((chip) => {
        const count = stats[chip.statKey] ?? 0;
        const isActive = active === chip.key;
        const isEmpty = count === 0;
        return (
          <button
            key={chip.key}
            onClick={() => onToggle(isActive ? null : chip.key)}
            disabled={isEmpty}
            title={chip.hint}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: isActive ? tint(chip.color, 0.18) : tint(chip.color, 0.06),
              color: chip.color,
              border: `1px solid ${tint(chip.color, isActive ? 0.5 : 0.2)}`,
              opacity: isEmpty ? 0.4 : 1,
              cursor: isEmpty ? 'default' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <AlertTriangleIcon size={12} />
            <span>{chip.label}</span>
            <span
              className="tabular-nums font-bold px-1.5 py-0.5 rounded-full text-[10px]"
              style={{ background: tint(chip.color, 0.2) }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// Access guard
// ════════════════════════════════════════════════════════════════════

const AccessGuard = () => (
  <div className="flex items-center justify-center min-h-[60vh] px-4">
    <div className="text-center max-w-sm">
      <div className="relative inline-flex mb-5">
        <div
          className="absolute inset-0 rounded-full blur-2xl opacity-20"
          style={{ background: palette.red[400] }}
        />
        <div
          className="relative w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: tint(palette.red[400], 0.06),
            border: `1px solid ${tint(palette.red[400], 0.2)}`,
          }}
        >
          <ShieldIcon size={28} style={{ color: palette.red[400], opacity: 0.8 }} />
        </div>
      </div>
      <h2 className="text-lg font-bold text-white mb-1.5 tracking-tight">Admin Only</h2>
      <p className="text-xs" style={{ color: '#6b5c52' }}>
        This page is restricted to administrators.
      </p>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Cleanup CTA — surfaces only when there's expired-but-not-downgraded
// ════════════════════════════════════════════════════════════════════

const CleanupButton = ({ count, onClick }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider"
    style={{
      background: tint(palette.red[400], 0.08),
      color: palette.red[400],
      border: `1px solid ${tint(palette.red[400], 0.25)}`,
    }}
    onMouseEnter={(e) => (e.currentTarget.style.background = tint(palette.red[400], 0.16))}
    onMouseLeave={(e) => (e.currentTarget.style.background = tint(palette.red[400], 0.08))}
  >
    <AlertTriangleIcon size={12} />
    Cleanup {count} expired
  </button>
);

// ════════════════════════════════════════════════════════════════════
// Page header
// ════════════════════════════════════════════════════════════════════

const PageHeader = ({ stats, onCleanup }) => (
  <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-2">
    <div>
      <p
        className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1.5 flex items-center gap-2"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        <span
          className="inline-block w-1 h-1 rounded-full"
          style={{
            background: palette.gold[300],
            boxShadow: `0 0 8px ${palette.gold[300]}`,
          }}
        />
        User Directory
      </p>
      <h1 className="text-2xl sm:text-[26px] font-light tracking-tight text-white flex items-center gap-2.5">
        <UsersIcon size={24} style={{ color: palette.gold[300] }} />
        User Management
      </h1>
      <p className="text-xs mt-1.5" style={{ color: '#6b5c52' }}>
        Manage members, subscriptions, contact enrichment, and outreach.
      </p>
    </div>
    {stats?.expired_not_downgraded > 0 && (
      <CleanupButton count={stats.expired_not_downgraded} onClick={onCleanup} />
    )}
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════════════════

const UserManagementPage = () => {
  const { user: currentUser } = useAuth();

  // ── Data ──
  const [stats, setStats] = useState(null);
  const [contactStats, setContactStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expiringUsers, setExpiringUsers] = useState([]);
  const [templates, setTemplates] = useState([]);

  // ── UI ──
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // ── Modals ──
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

  // ── Fetchers ──
  const fetchStats = useCallback(async () => {
    try { setStats(await adminApi.getStats()); }
    catch (e) { console.error('Failed to fetch stats:', e); }
  }, []);

  const fetchContactStats = useCallback(async () => {
    try { setContactStats(await adminApi.getContactStats()); }
    catch (e) { console.error('Failed to fetch contact stats:', e); }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try { const data = await adminApi.getOutreachTemplates(); setTemplates(data.templates || []); }
    catch (e) { console.error('Failed to fetch templates:', e); }
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
        vipState: filters.vipState || undefined,
        anomaly: filters.anomaly || undefined,
        source: filters.source || undefined,
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
      showToast('Failed to load users', 'error');
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

  // ── Effects ──
  useEffect(() => {
    fetchStats();
    fetchContactStats();
    fetchExpiring();
    fetchTemplates();
  }, [fetchStats, fetchContactStats, fetchExpiring, fetchTemplates]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [search, filters]);

  // ── Derived ──
  const selectedUsers = useMemo(
    () => users.filter((u) => selectedIds.has(u.id)),
    [users, selectedIds]
  );
  const allVisibleSelected = users.length > 0 && users.every((u) => selectedIds.has(u.id));

  // ── Selection ──
  const toggleSelect = (userId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) users.forEach((u) => next.delete(u.id));
      else users.forEach((u) => next.add(u.id));
      return next;
    });
  };

  // ── Single user actions ──
  const handleGrant = async (userId, duration, note, startDate, endDate) => {
    try {
      const result = await adminApi.grantSubscription(userId, duration, note, startDate, endDate);
      showToast(result.message);
      fetchUsers(); fetchStats(); fetchExpiring();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to grant', 'error');
      throw err;
    }
  };

  const handleRevoke = (userId, username) => {
    setConfirmModal({
      title: 'Revoke subscription',
      message: `Are you sure you want to revoke the subscription for ${username}? They will be downgraded to free immediately.`,
      confirmText: 'Revoke',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const result = await adminApi.revokeSubscription(userId);
          showToast(result.message);
          fetchUsers(); fetchStats(); fetchExpiring();
        } catch (err) {
          showToast(err.response?.data?.detail || 'Failed to revoke', 'error');
        }
      },
    });
  };

  const handleToggleActive = (userId, username, isActive) => {
    setConfirmModal({
      title: isActive ? 'Ban user' : 'Unban user',
      message: isActive
        ? `Are you sure you want to ban ${username}? They won't be able to log in.`
        : `Reactivate ${username}'s account?`,
      confirmText: isActive ? 'Ban' : 'Unban',
      variant: isActive ? 'danger' : 'default',
      onConfirm: async () => {
        try {
          const result = await adminApi.toggleUserActive(userId);
          showToast(result.message);
          fetchUsers(); fetchStats();
        } catch (err) {
          showToast(err.response?.data?.detail || 'Failed to update', 'error');
        }
      },
    });
  };

  const handleCleanup = () => {
    setConfirmModal({
      title: 'Cleanup expired subscriptions',
      message: 'Downgrade all subscribers whose subscription has expired to free?',
      confirmText: 'Run cleanup',
      onConfirm: async () => {
        try {
          const result = await adminApi.cleanupExpired();
          showToast(result.message);
          fetchUsers(); fetchStats(); fetchExpiring();
        } catch (e) {
          showToast('Cleanup failed', 'error');
        }
      },
    });
  };

  // ── Bulk actions ──
  const handleBulkExport = () => {
    const filename = `users_${new Date().toISOString().slice(0, 10)}.csv`;
    exportUsersToCsv(selectedUsers, filename);
    showToast(`Exported ${selectedUsers.length} users to CSV`);
  };

  const handleBulkGrant = async (duration) => {
    const targets = selectedUsers.filter((u) => u.role !== 'admin');
    if (targets.length === 0) {
      showToast('No eligible users (admins are skipped)', 'error');
      return;
    }
    const ok = window.confirm(
      `Grant ${duration.replace('_', ' ')} subscription to ${targets.length} user(s)?\n\nAdmins will be skipped. Proceed?`
    );
    if (!ok) return;
    let s = 0, f = 0;
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
    fetchUsers(); fetchStats(); fetchExpiring();
  };

  const handleBulkRevoke = async () => {
    const targets = selectedUsers.filter((u) => u.role === 'subscriber');
    let s = 0, f = 0;
    for (const u of targets) {
      try { await adminApi.revokeSubscription(u.id); s++; }
      catch (err) { f++; console.error(`Failed for ${u.username}:`, err); }
    }
    showToast(`✓ ${s} revoked${f > 0 ? `, ✗ ${f} failed` : ''}`);
    setSelectedIds(new Set());
    fetchUsers(); fetchStats();
  };

  const handleBulkSendTemplate = async (templateId) => {
    const reachable = selectedUsers.filter(isReachable);
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
      try { await navigator.clipboard.writeText(texts.join('\n')); } catch {}
    }
    showToast(
      `✓ Opened ${opened} tab(s). Messages copied to clipboard${
        reachable.length > 10 ? ` (${reachable.length - 10} skipped, cap=10)` : ''
      }`
    );
    setSelectedIds(new Set());
  };

  // ── Guard ──
  if (currentUser?.role !== 'admin') return <AccessGuard />;

  // ── Render ──
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8 space-y-6 pb-24">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <PageHeader stats={stats} onCleanup={handleCleanup} />

      <UsersStatGrid stats={stats} />

      <ContactReachPanel
        contactStats={contactStats}
        filterReach={filters.reach}
        onFilterReach={(reach) => setFilters({ ...filters, reach })}
      />

      <ExpiringSoonPanel
        expiringUsers={expiringUsers}
        onExtend={(u) => setGrantModal(u)}
      />

      <AnomalyChips
        stats={stats}
        active={filters.anomaly}
        onToggle={(key) => setFilters({ ...DEFAULT_FILTERS, anomaly: key })}
      />

      <UsersSearchBar
        search={search}
        onSearchChange={setSearch}
        total={total}
        selectedCount={selectedIds.size}
      />

      <FilterPanel
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        stats={contactStats}
      />

      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.012)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <UsersTable
          users={users}
          loading={loading}
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
          toggleSelectAll={toggleSelectAll}
          onView={(id) => setDrawerUserId(id)}
          onGrant={(u) => setGrantModal(u)}
          onRevoke={handleRevoke}
          onToggleActive={handleToggleActive}
          onResetFilters={() => setFilters(DEFAULT_FILTERS)}
        />
        <UsersPagination
          page={page}
          totalPages={totalPages}
          total={total}
          onChange={setPage}
        />
      </div>

      {/* Floating bulk action bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        selectedUsers={selectedUsers}
        onClear={() => setSelectedIds(new Set())}
        onBulkGrant={handleBulkGrant}
        onBulkRevoke={handleBulkRevoke}
        onBulkExport={handleBulkExport}
        onBulkSendTemplate={handleBulkSendTemplate}
        templates={templates}
        onRequestConfirm={setConfirmModal}
      />

      {/* Modals */}
      {grantModal && (
        <GrantModal
          user={grantModal}
          onClose={() => setGrantModal(null)}
          onGrant={handleGrant}
        />
      )}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          variant={confirmModal.variant}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}
      {drawerUserId && (
        <UserDetailDrawer
          userId={drawerUserId}
          onClose={() => setDrawerUserId(null)}
          onUserUpdated={() => { fetchUsers(); fetchContactStats(); }}
          templates={templates}
        />
      )}
    </div>
  );
};

export default UserManagementPage;
