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
import { isAdminFull, isAdminStaff, isAdminViewOnly, isStaffRole } from '../utils/roles';

// Domain sub-components
import { UsersStatGrid } from './admin/users/UsersStatGrid';
import { ContactReachPanel } from './admin/users/ContactReachPanel';
import { ExpiringSoonPanel } from './admin/users/ExpiringSoonPanel';
import { UsersSearchBar } from './admin/users/UsersSearchBar';
import { UsersTable } from './admin/users/UsersTable';
import { UsersPagination } from './admin/users/UsersPagination';
import { GrantModal } from './admin/users/GrantModal';
import { SendMessageModal } from './admin/users/SendMessageModal';
import { ConfirmModal } from './admin/users/ConfirmModal';
import { SetRoleModal } from './admin/users/SetRoleModal';
import { OpsQueueBar } from './admin/users/OpsQueueBar';

// Shared admin pieces
import { FilterPanel } from './admin/FilterPanel';
import { SegmentStrip } from './admin/users/SegmentStrip';
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
  plan: null,
  crm: null,
  status: null,
  provider: null,
  activity: null,
  reach: null,
  vipState: null,
  anomaly: null,
  source: null,
  exSubscriber: null,   // ← past subscribers, now free/expired
  sortBy: 'created_at',
  sortOrder: 'desc',
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
      <h2 className="text-lg font-bold text-text-primary mb-1.5 tracking-tight">Staff Only</h2>
      <p className="text-xs" style={{ color: '#6b5c52' }}>
        This page is restricted to admin, co-admin, and founder roles.
      </p>
    </div>
  </div>
);

const ViewOnlyBanner = () => (
  <div
    className="rounded-lg px-3.5 py-2.5 flex items-start gap-2.5"
    style={{
      background: 'rgba(96,165,250,0.08)',
      border: '1px solid rgba(96,165,250,0.25)',
    }}
  >
    <ShieldIcon size={14} style={{ color: '#60a5fa', marginTop: 2, flexShrink: 0 }} />
    <div>
      <p className="text-[12px] font-semibold text-text-primary/90">View-only access</p>
      <p className="text-[11px] mt-0.5" style={{ color: '#8a7a6e' }}>
        As co-admin / founder you can browse users and stats, but grant, revoke, ban, send, and role changes are disabled.
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
      <h1 className="text-2xl sm:text-[26px] font-light tracking-tight text-text-primary flex items-center gap-2.5">
        <UsersIcon size={24} style={{ color: palette.gold[300] }} />
        User Management
      </h1>
      <p className="text-xs mt-1.5" style={{ color: '#6b5c52' }}>
        Manage members, subscriptions, contact enrichment, and outreach.
      </p>
    </div>
    {onCleanup && stats?.expired_not_downgraded > 0 && (
      <CleanupButton count={stats.expired_not_downgraded} onClick={onCleanup} />
    )}
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════════════════

const UserManagementPage = () => {
  const { user: currentUser } = useAuth();
  const canWrite = isAdminFull(currentUser);
  const canManageRoles = isAdminFull(currentUser);
  const viewOnly = isAdminViewOnly(currentUser);

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
  const [roleModal, setRoleModal] = useState(null);
  const [drawerUserId, setDrawerUserId] = useState(null);
  const [sendMsgUser, setSendMsgUser] = useState(null);
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
        plan: filters.plan || undefined,
        crm: filters.crm || undefined,
        status: filters.status || undefined,
        provider: filters.provider || undefined,
        activity: filters.activity || undefined,
        reach: filters.reach || undefined,
        vipState: filters.vipState || undefined,
        anomaly: filters.anomaly || undefined,
        source: filters.source || undefined,
        exSubscriber: filters.exSubscriber || undefined,
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

  // ── Send custom message via bot ──
  const handleSendMessage = async ({ text, withInvite }) => {
    if (!sendMsgUser) return;
    try {
      const res = await adminApi.sendMessage(sendMsgUser.id, { text, withInvite });
      if (res.ok) {
        showToast(`Message sent to @${sendMsgUser.username} via bot`);
      } else if (res.reason === 'dm_failed') {
        showToast('Bot could not DM this user (they may not have started the bot).', 'error');
      } else {
        showToast(res.message || 'Failed to send', 'error');
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to send message', 'error');
      throw err;
    }
  };

  // ── Set staff / member role (full admin only) ──
  const handleSetRole = async (userId, role) => {
    try {
      const result = await adminApi.setUserRole(userId, role);
      showToast(result.message || `Role updated to ${role}`);
      fetchUsers();
      fetchStats();
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to set role', 'error');
      throw err;
    }
  };

  // ── Bulk actions ──
  const handleBulkExport = () => {
    const filename = `users_${new Date().toISOString().slice(0, 10)}.csv`;
    exportUsersToCsv(selectedUsers, filename);
    showToast(`Exported ${selectedUsers.length} users to CSV`);
  };

  const handleBulkGrant = async (duration) => {
    const targets = selectedUsers.filter((u) => !isStaffRole(u.role));
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
  if (!isAdminStaff(currentUser)) return <AccessGuard />;

  // ── Render ──
  // ERP layout zones:
  //   1. Command header + KPI (drill-down)
  //   2. Ops queues (cross-domain link + anomalies/CRM + expiring)
  //   3. Directory workspace (segment → search/filter → table)
  return (
    <div className="w-full px-4 lg:px-8 space-y-4 pb-24">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* ── Zone 1: Command ── */}
      <PageHeader stats={stats} onCleanup={canWrite ? handleCleanup : undefined} />

      {viewOnly && <ViewOnlyBanner />}

      <UsersStatGrid
        stats={stats}
        filters={filters}
        defaults={DEFAULT_FILTERS}
        onFilter={setFilters}
      />

      {/* ── Zone 2: Ops queues (progressive disclosure) ── */}
      <OpsQueueBar
        stats={stats}
        anomaly={filters.anomaly}
        crm={filters.crm}
        onAnomalyToggle={(key) =>
          setFilters({ ...DEFAULT_FILTERS, anomaly: key })
        }
        onCrmToggle={(key) =>
          setFilters({ ...DEFAULT_FILTERS, crm: key })
        }
      />

      <ExpiringSoonPanel
        expiringUsers={expiringUsers}
        onExtend={canWrite ? (u) => setGrantModal(u) : undefined}
        onDm={canWrite ? (u) => setSendMsgUser(u) : undefined}
      />

      <ContactReachPanel
        contactStats={contactStats}
        filterReach={filters.reach}
        onFilterReach={(reach) => setFilters({ ...filters, reach })}
        defaultOpen={false}
      />

      {/* ── Zone 3: Directory workspace ── */}
      <div className="space-y-3 pt-1">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p
            className="text-[9.5px] uppercase tracking-[0.16em] font-semibold"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            Member directory
          </p>
          <SegmentStrip
            filters={filters}
            stats={stats}
            defaults={DEFAULT_FILTERS}
            onSelect={setFilters}
          />
        </div>

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
            canWrite={canWrite}
            canManageRoles={canManageRoles}
            onView={(id) => setDrawerUserId(id)}
            onGrant={(u) => setGrantModal(u)}
            onRevoke={handleRevoke}
            onToggleActive={handleToggleActive}
            onSendMessage={(u) => setSendMsgUser(u)}
            onSetRole={(u) => setRoleModal(u)}
            onResetFilters={() => setFilters(DEFAULT_FILTERS)}
          />
          <UsersPagination
            page={page}
            totalPages={totalPages}
            total={total}
            onChange={setPage}
          />
        </div>
      </div>

      {/* Floating bulk action bar — write actions only for full admin */}
      {canWrite && (
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
      )}

      {/* Modals */}
      {grantModal && canWrite && (
        <GrantModal
          user={grantModal}
          onClose={() => setGrantModal(null)}
          onGrant={handleGrant}
        />
      )}
      {sendMsgUser && canWrite && (
        <SendMessageModal
          user={sendMsgUser}
          onClose={() => setSendMsgUser(null)}
          onSend={handleSendMessage}
        />
      )}
      {roleModal && canManageRoles && (
        <SetRoleModal
          user={roleModal}
          onClose={() => setRoleModal(null)}
          onSetRole={handleSetRole}
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
          onUserUpdated={() => { fetchUsers(); fetchContactStats(); fetchStats(); }}
          onToast={showToast}
          templates={templates}
          canWrite={canWrite}
          canManageRoles={canManageRoles}
          onSetRole={canManageRoles ? (u) => setRoleModal(u) : undefined}
        />
      )}
    </div>
  );
};

export default UserManagementPage;
