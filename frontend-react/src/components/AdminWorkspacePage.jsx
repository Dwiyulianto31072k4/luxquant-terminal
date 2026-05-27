// src/components/AdminWorkspacePage.jsx
//
// Top-level admin workspace with 5 tabs:
//   1. Users (existing UserManagementPage embedded)
//   2. Follow-ups
//   3. Marketing
//   4. Finance  ← NEW
//   5. TODOs
//
// Persists active tab via URL hash (e.g. /admin/workspace#finance).

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { workspaceApi } from '../services/workspaceApi';
import { financeApi } from '../services/financeApi';
import UserManagementPage from './UserManagementPage';
import { FollowupTab } from './admin/workspace/FollowupTab';
import { MarketingTab } from './admin/workspace/MarketingTab';
import { FinanceTab } from './admin/workspace/FinanceTab';
import { TodoTab } from './admin/workspace/TodoTab';
import {
  UsersIcon,
  ShieldIcon,
  ClockIcon,
  AlertTriangleIcon,
  SparklesIcon,
  TrendingUpIcon,
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
// Main Page
// ════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'users', label: 'Users', Icon: UsersIcon },
  { id: 'followups', label: 'Follow-ups', Icon: ClockIcon },
  { id: 'marketing', label: 'Marketing', Icon: SparklesIcon },
  { id: 'finance', label: 'Finance', Icon: TrendingUpIcon },
  { id: 'todos', label: 'TODOs', Icon: AlertTriangleIcon },
];

const AdminWorkspacePage = () => {
  const { user: currentUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [financeStats, setFinanceStats] = useState(null);

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

  const fetchFinanceStats = useCallback(async () => {
    try {
      const data = await financeApi.getStats();
      setFinanceStats(data);
    } catch (e) {
      console.error('Failed to load finance stats:', e);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchFinanceStats();
    const interval = setInterval(() => {
      fetchStats();
      fetchFinanceStats();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchFinanceStats]);

  // Listen for hash changes
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
    followups: stats?.followups_overdue || null,
    marketing: null,
    finance: financeStats?.stale_count || null, // stale pending = needs attention
    todos: stats?.todos_urgent || null,
  };

  const fmtUSDT = (v) => v != null ? `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';

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
            Kelola users, follow-up penagihan, marketing budget, finance, dan internal todos.
          </p>
        </div>

        {/* Mini stats summary */}
        <div className="flex flex-wrap gap-1.5">
          {stats?.followups_overdue > 0 && (
            <MiniStat
              label="Overdue"
              value={stats.followups_overdue}
              accent="#f87171"
            />
          )}
          {stats?.followups_today > 0 && (
            <MiniStat label="Today" value={stats.followups_today} accent="#fb923c" />
          )}
          {financeStats?.stale_count > 0 && (
            <MiniStat
              label="Stale Pay"
              value={financeStats.stale_count}
              accent="#f87171"
            />
          )}
          {financeStats?.revenue_today > 0 && (
            <MiniStat
              label="Today Rev"
              value={fmtUSDT(financeStats.revenue_today)}
              accent="#34d399"
            />
          )}
          {stats?.campaigns_active > 0 && (
            <MiniStat
              label="Campaigns"
              value={stats.campaigns_active}
              accent="#a78bfa"
            />
          )}
          {stats?.todos_urgent > 0 && (
            <MiniStat label="Urgent TODOs" value={stats.todos_urgent} accent="#f87171" />
          )}
        </div>
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
            <UserManagementPage />
          </div>
        )}
        {activeTab === 'followups' && <FollowupTab onRefreshStats={fetchStats} />}
        {activeTab === 'marketing' && <MarketingTab onRefreshStats={fetchStats} />}
        {activeTab === 'finance' && <FinanceTab onRefreshStats={fetchFinanceStats} />}
        {activeTab === 'todos' && <TodoTab onRefreshStats={fetchStats} />}
      </div>
    </div>
  );
};

export default AdminWorkspacePage;
