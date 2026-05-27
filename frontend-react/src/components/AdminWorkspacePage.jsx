// src/components/AdminWorkspacePage.jsx
//
// LuxQuant Admin — Mission Control
// ──────────────────────────────────────────────────────────────────────
// Top-level admin workspace. Acts as the navigation shell + global
// urgency surface for the five operational tabs.
//
// Tabs:
//   1. Users       — UserManagementPage embedded
//   2. Follow-ups  — payment reminders & support tickets
//   3. Marketing   — campaign budgets & KPIs
//   4. Finance     — revenue, payments, subscriptions
//   5. TODOs       — internal task board
//
// State:
//   • Active tab persisted via URL hash (e.g. /admin/workspace#finance)
//   • Stats polled every 60s for live badge counters
//

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { workspaceApi } from '../services/workspaceApi';
import { financeApi } from '../services/financeApi';

// Tab content
import UserManagementPage from './UserManagementPage';
import { FollowupTab } from './admin/workspace/FollowupTab';
import { MarketingTab } from './admin/workspace/MarketingTab';
import { FinanceTab } from './admin/workspace/FinanceTab';
import { TodoTab } from './admin/workspace/TodoTab';

// Design system
import { palette, surface, tint, radius, motion } from './admin/designSystem';

// Icons
import {
  UsersIcon,
  ShieldIcon,
  ClockIcon,
  AlertTriangleIcon,
  SparklesIcon,
  TrendingUpIcon,
  ZapIcon,
  DollarIcon,
  TargetIcon,
  FlagIcon,
  AlertCircleIcon,
  CheckCircleIcon,
} from './admin/Icons';

// ════════════════════════════════════════════════════════════════════
// Tab definition
// ════════════════════════════════════════════════════════════════════

const TABS = [
  {
    id: 'users',
    label: 'Users',
    description: 'Members, roles, and access',
    Icon: UsersIcon,
    accent: palette.gold[300],
  },
  {
    id: 'followups',
    label: 'Follow-ups',
    description: 'Reminders & support queue',
    Icon: ClockIcon,
    accent: palette.blue[400],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Campaigns & budget tracking',
    Icon: SparklesIcon,
    accent: palette.violet[400],
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Revenue & payment ops',
    Icon: DollarIcon,
    accent: palette.green[400],
  },
  {
    id: 'todos',
    label: 'TODOs',
    description: 'Internal task board',
    Icon: FlagIcon,
    accent: palette.orange[400],
  },
];

// ════════════════════════════════════════════════════════════════════
// HeaderBrand — title + animated shield mark
// ════════════════════════════════════════════════════════════════════

const HeaderBrand = () => (
  <div>
    <p
      className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-2 flex items-center gap-2"
      style={{ color: 'rgba(255,255,255,0.4)' }}
    >
      <span
        className="inline-block w-1 h-1 rounded-full"
        style={{
          background: palette.gold[300],
          boxShadow: `0 0 8px ${palette.gold[300]}`,
        }}
      />
      Admin Operations
    </p>
    <h1 className="text-2xl sm:text-[28px] font-light tracking-tight text-white flex items-center gap-3 leading-none">
      <span className="relative inline-flex">
        {/* Glow halo */}
        <span
          className="absolute inset-0 rounded-full blur-md opacity-50"
          style={{ background: palette.gold[300] }}
        />
        <span
          className="relative inline-flex items-center justify-center w-9 h-9 rounded-lg"
          style={{
            background: `linear-gradient(135deg, ${tint(palette.gold[300], 0.2)}, ${tint(palette.gold[300], 0.05)})`,
            border: `1px solid ${tint(palette.gold[300], 0.35)}`,
          }}
        >
          <ShieldIcon size={18} style={{ color: palette.gold[300] }} />
        </span>
      </span>
      <span className="flex items-baseline gap-2">
        Mission Control
        <span
          className="text-xs font-medium tracking-wider uppercase"
          style={{ color: tint(palette.gold[300], 0.5) }}
        >
          v2
        </span>
      </span>
    </h1>
    <p className="text-[13px] mt-2.5 max-w-2xl" style={{ color: '#8a7a6e' }}>
      Manage users, chase payments, run marketing, oversee finance, and ship internal work — all from a single command surface.
    </p>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// UrgencyChip — surfaces a single high-priority metric in the header
// ════════════════════════════════════════════════════════════════════

const UrgencyChip = ({ label, value, accent, Icon, onClick, pulse = false }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-lg ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    style={{
      background: tint(accent, 0.06),
      border: `1px solid ${tint(accent, 0.22)}`,
      transition: motion.base,
    }}
    onMouseEnter={(e) => {
      if (onClick) {
        e.currentTarget.style.background = tint(accent, 0.12);
        e.currentTarget.style.borderColor = tint(accent, 0.4);
      }
    }}
    onMouseLeave={(e) => {
      if (onClick) {
        e.currentTarget.style.background = tint(accent, 0.06);
        e.currentTarget.style.borderColor = tint(accent, 0.22);
      }
    }}
  >
    <span className="relative inline-flex shrink-0">
      {pulse && (
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-40"
          style={{ background: accent }}
        />
      )}
      <Icon size={12} style={{ color: accent }} className="relative" />
    </span>
    <div className="flex items-baseline gap-1.5 leading-none">
      <span
        className="text-[9px] uppercase tracking-wider font-semibold"
        style={{ color: tint(accent, 0.8) }}
      >
        {label}
      </span>
      <span
        className="text-sm font-bold tabular-nums"
        style={{ color: accent }}
      >
        {value}
      </span>
    </div>
  </button>
);

// ════════════════════════════════════════════════════════════════════
// UrgencyBar — collapsible status bar, only renders when there's signal
// ════════════════════════════════════════════════════════════════════

const UrgencyBar = ({ stats, financeStats, onJumpTo }) => {
  // Only surface metrics that matter (non-zero urgency signals)
  const chips = [];

  if (stats?.followups_overdue > 0) {
    chips.push({
      label: 'Overdue',
      value: stats.followups_overdue,
      accent: palette.red[400],
      Icon: AlertTriangleIcon,
      pulse: true,
      onClick: () => onJumpTo('followups'),
    });
  }
  if (financeStats?.stale_count > 0) {
    chips.push({
      label: 'Stale Pay',
      value: financeStats.stale_count,
      accent: palette.red[400],
      Icon: AlertCircleIcon,
      pulse: true,
      onClick: () => onJumpTo('finance'),
    });
  }
  if (stats?.todos_urgent > 0) {
    chips.push({
      label: 'Urgent TODOs',
      value: stats.todos_urgent,
      accent: palette.orange[400],
      Icon: ZapIcon,
      onClick: () => onJumpTo('todos'),
    });
  }
  if (stats?.followups_today > 0) {
    chips.push({
      label: 'Due Today',
      value: stats.followups_today,
      accent: palette.amber[400],
      Icon: ClockIcon,
      onClick: () => onJumpTo('followups'),
    });
  }
  if (financeStats?.revenue_today > 0) {
    chips.push({
      label: 'Revenue Today',
      value: `$${Number(financeStats.revenue_today).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
      accent: palette.green[400],
      Icon: TrendingUpIcon,
      onClick: () => onJumpTo('finance'),
    });
  }
  if (stats?.campaigns_active > 0) {
    chips.push({
      label: 'Active Campaigns',
      value: stats.campaigns_active,
      accent: palette.violet[400],
      Icon: TargetIcon,
      onClick: () => onJumpTo('marketing'),
    });
  }

  if (chips.length === 0) {
    // Calm state — everything is fine
    return (
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
        style={{
          background: tint(palette.green[400], 0.06),
          border: `1px solid ${tint(palette.green[400], 0.18)}`,
        }}
      >
        <CheckCircleIcon size={11} style={{ color: palette.green[400] }} />
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: palette.green[400] }}
        >
          All clear
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {chips.map((chip, i) => (
        <UrgencyChip key={i} {...chip} />
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// TabBar — segmented control with sliding indicator
// ════════════════════════════════════════════════════════════════════

const TabBar = ({ tabs, activeId, badges, onChange }) => (
  <div
    className="relative flex p-1 rounded-xl overflow-x-auto"
    style={{
      background: surface.sunken.bg,
      border: `1px solid ${surface.base.border}`,
      scrollbarWidth: 'thin',
    }}
  >
    {tabs.map((tab) => {
      const isActive = activeId === tab.id;
      const badge = badges[tab.id];

      return (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="relative flex items-center gap-2 px-3.5 py-2 rounded-lg whitespace-nowrap shrink-0"
          style={{
            background: isActive ? tint(tab.accent, 0.12) : 'transparent',
            color: isActive ? tab.accent : '#8a7a6e',
            border: `1px solid ${isActive ? tint(tab.accent, 0.35) : 'transparent'}`,
            transition: motion.base,
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.025)';
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
          <tab.Icon size={13} />
          <span className="text-[11px] font-semibold uppercase tracking-wider">
            {tab.label}
          </span>
          {badge != null && badge > 0 && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full tabular-nums min-w-[18px] text-center"
              style={{
                background: isActive ? tint(tab.accent, 0.25) : tint(palette.red[400], 0.18),
                color: isActive ? tab.accent : palette.red[400],
                border: `1px solid ${isActive ? tint(tab.accent, 0.35) : tint(palette.red[400], 0.3)}`,
              }}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

// ════════════════════════════════════════════════════════════════════
// TabDescription — supplementary context line under the tab bar
// ════════════════════════════════════════════════════════════════════

const TabDescription = ({ tab }) => (
  <div
    className="flex items-center gap-2 px-1"
    style={{ color: '#6b5c52' }}
  >
    <span
      className="inline-block w-1 h-1 rounded-full"
      style={{ background: tab.accent, opacity: 0.6 }}
    />
    <span className="text-[11px] tracking-wide">{tab.description}</span>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Access Guard — non-admin lockout
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
          className="relative w-20 h-20 rounded-2xl flex items-center justify-center"
          style={{
            background: tint(palette.red[400], 0.06),
            border: `1px solid ${tint(palette.red[400], 0.2)}`,
          }}
        >
          <ShieldIcon size={36} style={{ color: palette.red[400], opacity: 0.8 }} />
        </div>
      </div>
      <h2 className="text-lg font-bold text-white mb-1.5 tracking-tight">
        Restricted Area
      </h2>
      <p className="text-xs" style={{ color: '#6b5c52' }}>
        Mission Control is reserved for administrators. If you believe this is an error, reach out to your team lead.
      </p>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════════════════

const AdminWorkspacePage = () => {
  const { user: currentUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [financeStats, setFinanceStats] = useState(null);

  // Read initial tab from URL hash, fallback to 'users' (static default)
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

  // Listen for hash changes (back/forward nav)
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

  // ── Guard ──
  if (currentUser?.role !== 'admin') return <AccessGuard />;

  // Compute badge counters per tab
  const badges = useMemo(
    () => ({
      users: null,
      followups: stats?.followups_overdue || null,
      marketing: null,
      finance: financeStats?.stale_count || null,
      todos: stats?.todos_urgent || null,
    }),
    [stats, financeStats]
  );

  const activeTabDef = TABS.find((t) => t.id === activeTab) || TABS[0];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
      {/* ─── Header ─── */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 mb-7">
        <HeaderBrand />

        {/* Urgency surface — only renders chips when there's signal */}
        <div className="lg:max-w-md lg:text-right">
          <p
            className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-2"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            Pulse
          </p>
          <div className="flex lg:justify-end">
            <UrgencyBar
              stats={stats}
              financeStats={financeStats}
              onJumpTo={changeTab}
            />
          </div>
        </div>
      </div>

      {/* ─── Tab Navigation ─── */}
      <div className="mb-3">
        <TabBar
          tabs={TABS}
          activeId={activeTab}
          badges={badges}
          onChange={changeTab}
        />
      </div>

      {/* Active tab description */}
      <div className="mb-6">
        <TabDescription tab={activeTabDef} />
      </div>

      {/* ─── Tab Content ─── */}
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
