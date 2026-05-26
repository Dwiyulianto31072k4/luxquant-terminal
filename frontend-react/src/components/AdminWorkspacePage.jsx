// src/components/AdminWorkspacePage.jsx
//
// Top-level admin workspace with 4 tabs:
//   1. Users (existing UserManagementPage embedded)
//   2. Follow-ups
//   3. Marketing
//   4. TODOs
//
// Persists active tab via URL hash (e.g. /admin/workspace#followups).

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { workspaceApi } from '../services/workspaceApi';
import UserManagementPage from './UserManagementPage';
import { FollowupTab } from './admin/workspace/FollowupTab';
import {
  UsersIcon,
  ShieldIcon,
  ClockIcon,
  AlertTriangleIcon,
  SparklesIcon,
} from './admin/Icons';

// ════════════════════════════════════════════════════════════════════
// Tab Pill — top navigation
// ════════════════════════════════════════════════════════════════════

const TabPill = ({ id, label, Icon, isActive, badge, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-all whitespace-nowrap"
    style={{
      background: isActive ? 'rgba(212,168,83,0.12)' : 'transparent',
      color: isActive ? '#d4a853' : '#8a7a6e',
      border: `1px solid ${isActive ? 'rgba(212,168,83,0.35)' : 'rgba(255,255,255,0.04)'}`,
    }}
    onMouseEnter={(e) => {
      if (!isActive) {
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
        e.currentTarget.style.color = '#c9b59e';
      }
    }}
    onMouseLeave={(e) => {
      if (!isActive) {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = '#8a7a6e';
      }
    }}
  >
    <Icon size={13} />
    {label}
    {badge !== undefined && badge !== null && badge > 0 && (
      <span
        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums min-w-[18px] text-center"
        style={{
          background: isActive ? 'rgba(212,168,83,0.25)' : 'rgba(248,113,113,0.2)',
          color: isActive ? '#d4a853' : '#f87171',
        }}
      >
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

// ════════════════════════════════════════════════════════════════════
// Mini stat tile (header summary)
// ════════════════════════════════════════════════════════════════════

const MiniStat = ({ label, value, accent }) => (
  <div
    className="px-3 py-1.5 rounded-md flex items-center gap-2"
    style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.04)',
    }}
  >
    <span
      className="text-[9px] uppercase tracking-wider font-semibold"
      style={{ color: 'rgba(255,255,255,0.4)' }}
    >
      {label}
    </span>
    <span
      className="text-xs font-semibold tabular-nums"
      style={{ color: accent || '#fff' }}
    >
      {value}
    </span>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Placeholder tabs (Marketing, TODO) — filled in Batch 2B
// ════════════════════════════════════════════════════════════════════

const PlaceholderTab = ({ name }) => (
  <div
    className="rounded-xl p-16 text-center"
    style={{
      background: 'rgba(255,255,255,0.015)',
      border: '1px solid rgba(255,255,255,0.05)',
    }}
  >
    <SparklesIcon size={32} className="mx-auto mb-3" style={{ color: '#4a3f39' }} />
    <p className="text-sm font-medium text-white mb-1">{name}</p>
    <p className="text-[11px]" style={{ color: '#6b5c52' }}>
      Coming in next batch — fitur ini lagi di-build.
    </p>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'users', label: 'Users', Icon: UsersIcon },
  { id: 'followups', label: 'Follow-ups', Icon: ClockIcon },
  { id: 'marketing', label: 'Marketing', Icon: SparklesIcon },
  { id: 'todos', label: 'TODOs', Icon: AlertTriangleIcon },
];

const AdminWorkspacePage = () => {
  const { user: currentUser } = useAuth();
  const [stats, setStats] = useState(null);

  // Read initial tab from URL hash
  const initialTab = (() => {
    const hash = window.location.hash.replace('#', '');
    return TABS.find((t) => t.id === hash) ? hash : 'users';
  })();

  const [activeTab, setActiveTab] = useState(initialTab);

  const changeTab = (id) => {
    setActiveTab(id);
    window.location.hash = id;
  };

  const fetchStats = useCallback(async () => {
    try {
      const data = await workspaceApi.getStats();
      setStats(data);
    } catch (e) {
      console.error('Failed to load workspace stats:', e);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.replace('#', '');
      if (TABS.find((t) => t.id === hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

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

  // Compute badge counts per tab
  const badges = {
    users: null,
    followups: stats?.followups_overdue || null, // show overdue as urgent badge
    marketing: null,
    todos: stats?.todos_urgent || null, // show urgent todos
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
        <div>
          <p
            className="text-[10px] uppercase tracking-wider font-semibold mb-1.5"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            Admin
          </p>
          <h1 className="text-2xl sm:text-3xl font-light tracking-tight text-white flex items-center gap-2.5">
            <ShieldIcon size={24} style={{ color: '#d4a853' }} />
            Workspace
          </h1>
          <p className="text-xs mt-1.5" style={{ color: '#6b5c52' }}>
            Kelola users, follow-up penagihan, marketing budget, dan internal todos.
          </p>
        </div>

        {/* Mini stats summary */}
        {stats && (
          <div className="flex flex-wrap gap-1.5">
            {stats.followups_overdue > 0 && (
              <MiniStat
                label="Overdue"
                value={stats.followups_overdue}
                accent="#f87171"
              />
            )}
            {stats.followups_today > 0 && (
              <MiniStat label="Today" value={stats.followups_today} accent="#fb923c" />
            )}
            {stats.campaigns_active > 0 && (
              <MiniStat
                label="Active Campaigns"
                value={stats.campaigns_active}
                accent="#34d399"
              />
            )}
            {stats.todos_urgent > 0 && (
              <MiniStat label="Urgent TODOs" value={stats.todos_urgent} accent="#f87171" />
            )}
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <div
        className="flex gap-1.5 mb-6 overflow-x-auto pb-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {TABS.map((t) => (
          <TabPill
            key={t.id}
            id={t.id}
            label={t.label}
            Icon={t.Icon}
            isActive={activeTab === t.id}
            badge={badges[t.id]}
            onClick={() => changeTab(t.id)}
          />
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'users' && (
          <div className="-mx-4 md:-mx-6 lg:-mx-8 -my-6">
            {/* UserManagementPage already has its own container; offset our padding */}
            <UserManagementPage />
          </div>
        )}
        {activeTab === 'followups' && <FollowupTab onRefreshStats={fetchStats} />}
        {activeTab === 'marketing' && <PlaceholderTab name="Marketing Budget" />}
        {activeTab === 'todos' && <PlaceholderTab name="Brand TODOs" />}
      </div>
    </div>
  );
};

export default AdminWorkspacePage;
