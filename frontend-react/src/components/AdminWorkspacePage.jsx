// src/components/AdminWorkspacePage.jsx
//
// LuxQuant Control — admin workspace shell.
// ──────────────────────────────────────────────────────────────────────
// Premium fintech aesthetic (Linear/Stripe minimalism):
//   • Stacked brand mark: "LUXQUANT" eyebrow + "Control" H1
//   • Lambda Λ monogram glyph
//   • Underline-style tab bar with thin glow accent
//   • Compact urgency chips with mono values
//   • Restrained gold — used only for brand mark + active states
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
import { ActivityTab } from './admin/workspace/ActivityTab';
import { ApiKeysTab } from './admin/workspace/ApiKeysTab';

// Design system
import { palette, surface, tint, motion } from './admin/designSystem';

// Icons
import {
  ShieldIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  ZapIcon,
  ClockIcon,
  TrendingUpIcon,
  TargetIcon,
  CheckCircleIcon,
  // New premium iconography (added in shell redesign)
  LambdaGlyph,
  UsersRingIcon,
  ArrowTargetIcon,
  BroadcastConeIcon,
  BarsChartIcon,
  CheckSquareIcon,
  ActivityIcon,
} from './admin/Icons';

// ════════════════════════════════════════════════════════════════════
// Tab definition
// ════════════════════════════════════════════════════════════════════

const TABS = [
  {
    id: 'users',
    label: 'Users',
    description: 'Members, roles, and access',
    Icon: UsersRingIcon,
    accent: palette.gold[300],
  },
  {
    id: 'followups',
    label: 'Follow-ups',
    description: 'Reminders & support queue',
    Icon: ArrowTargetIcon,
    accent: palette.blue[400],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Campaigns & budget tracking',
    Icon: BroadcastConeIcon,
    accent: palette.purple[400],
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Revenue & payment ops',
    Icon: BarsChartIcon,
    accent: palette.green[400],
  },
  {
    id: 'todos',
    label: 'TODOs',
    description: 'Internal task board',
    Icon: CheckSquareIcon,
    accent: palette.orange[400],
  },
  {
    id: 'activity',
    label: 'Activity',
    description: 'Engagement & growth analytics',
    Icon: ActivityIcon,
    accent: palette.teal[400],
  },
  {
    id: 'apikeys',
    label: 'API',
    description: 'Developer keys & abuse flags',
    Icon: ShieldIcon,
    accent: palette.gold[300],
  },
];

// ════════════════════════════════════════════════════════════════════
// BrandMark — stacked LUXQUANT eyebrow + Control H1 with Λ glyph
// ════════════════════════════════════════════════════════════════════

const BrandMark = () => (
  <div className="flex items-center gap-3.5">
    {/* Λ glyph in a refined container */}
    <div className="relative shrink-0">
      {/* Soft outer halo */}
      <div
        className="absolute inset-0 rounded-xl blur-md opacity-40"
        style={{ background: palette.gold[300] }}
      />
      <div
        className="relative w-11 h-11 rounded-xl flex items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${tint(palette.gold[300], 0.18)}, ${tint(palette.gold[300], 0.04)})`,
          border: `1px solid ${tint(palette.gold[300], 0.32)}`,
          boxShadow: `inset 0 1px 0 ${tint(palette.gold[300], 0.15)}`,
        }}
      >
        {/* Top hairline accent */}
        <div
          className="absolute inset-x-2 top-0 h-px pointer-events-none"
          style={{
            background: `linear-gradient(to right, transparent, ${tint(palette.gold[300], 0.6)}, transparent)`,
          }}
        />
        <LambdaGlyph size={20} style={{ color: palette.gold[300] }} />
      </div>
    </div>

    {/* Stacked wordmark */}
    <div className="min-w-0">
      <p
        className="text-[10px] uppercase tracking-[0.32em] font-semibold leading-none mb-1.5"
        style={{ color: tint(palette.gold[300], 0.55) }}
      >
        LuxQuant
      </p>
      <h1
        className="text-[26px] sm:text-[30px] font-light tracking-tight text-white leading-none"
        style={{ letterSpacing: '-0.02em' }}
      >
        Control
      </h1>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// UrgencyChip — single high-priority metric, fintech-style
// ════════════════════════════════════════════════════════════════════

const UrgencyChip = ({ label, value, accent, Icon, onClick, pulse = false }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={`group relative flex items-center gap-2 px-2.5 py-1.5 rounded-md ${
      onClick ? 'cursor-pointer' : 'cursor-default'
    }`}
    style={{
      background: tint(accent, 0.05),
      border: `1px solid ${tint(accent, 0.18)}`,
      transition: motion.base,
    }}
    onMouseEnter={(e) => {
      if (onClick) {
        e.currentTarget.style.background = tint(accent, 0.10);
        e.currentTarget.style.borderColor = tint(accent, 0.32);
      }
    }}
    onMouseLeave={(e) => {
      if (onClick) {
        e.currentTarget.style.background = tint(accent, 0.05);
        e.currentTarget.style.borderColor = tint(accent, 0.18);
      }
    }}
  >
    {/* Status dot (pulses when urgent) */}
    <span className="relative inline-flex shrink-0">
      {pulse && (
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-50"
          style={{ background: accent }}
        />
      )}
      <span
        className="relative inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: accent }}
      />
    </span>

    {/* Compact icon */}
    <Icon size={11} style={{ color: tint(accent, 0.85) }} />

    {/* Label — light lowercase tracking */}
    <span
      className="text-[10px] font-medium leading-none"
      style={{ color: tint(accent, 0.75), letterSpacing: '0.02em' }}
    >
      {label}
    </span>

    {/* Value — bold mono */}
    <span
      className="text-[12px] font-bold tabular-nums leading-none"
      style={{ color: accent, fontFeatureSettings: '"tnum"' }}
    >
      {value}
    </span>
  </button>
);

// ════════════════════════════════════════════════════════════════════
// PulseStrip — collapsible status row
// ════════════════════════════════════════════════════════════════════

const PulseStrip = ({ stats, financeStats, onJumpTo }) => {
  const chips = [];

  if (stats?.followups_overdue > 0) {
    chips.push({
      label: 'overdue',
      value: stats.followups_overdue,
      accent: palette.red[400],
      Icon: AlertTriangleIcon,
      pulse: true,
      onClick: () => onJumpTo('followups'),
    });
  }
  if (financeStats?.stale_count > 0) {
    chips.push({
      label: 'stale pay',
      value: financeStats.stale_count,
      accent: palette.red[400],
      Icon: AlertCircleIcon,
      pulse: true,
      onClick: () => onJumpTo('finance'),
    });
  }
  if (stats?.todos_urgent > 0) {
    chips.push({
      label: 'urgent todos',
      value: stats.todos_urgent,
      accent: palette.orange[400],
      Icon: ZapIcon,
      onClick: () => onJumpTo('todos'),
    });
  }
  if (stats?.followups_today > 0) {
    chips.push({
      label: 'due today',
      value: stats.followups_today,
      accent: palette.amber[400],
      Icon: ClockIcon,
      onClick: () => onJumpTo('followups'),
    });
  }
  if (financeStats?.revenue_today > 0) {
    chips.push({
      label: 'today',
      value: `$${Number(financeStats.revenue_today).toLocaleString('en-US', {
        maximumFractionDigits: 0,
      })}`,
      accent: palette.green[400],
      Icon: TrendingUpIcon,
      onClick: () => onJumpTo('finance'),
    });
  }
  if (stats?.campaigns_active > 0) {
    chips.push({
      label: 'campaigns',
      value: stats.campaigns_active,
      accent: palette.purple[400],
      Icon: TargetIcon,
      onClick: () => onJumpTo('marketing'),
    });
  }

  // Calm state — minimal "all clear" badge
  if (chips.length === 0) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md"
        style={{
          background: tint(palette.green[400], 0.05),
          border: `1px solid ${tint(palette.green[400], 0.15)}`,
        }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ background: palette.green[400] }}
        />
        <CheckCircleIcon size={11} style={{ color: palette.green[400] }} />
        <span
          className="text-[10px] font-medium leading-none"
          style={{
            color: tint(palette.green[400], 0.85),
            letterSpacing: '0.02em',
          }}
        >
          all clear
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
// TabBar — underline-style with subtle glow under active tab
// ════════════════════════════════════════════════════════════════════

const TabBar = ({ tabs, activeId, badges, onChange }) => (
  <div
    className="relative flex items-stretch overflow-x-auto"
    style={{
      borderBottom: `1px solid ${tint(palette.warm[500], 0.18)}`,
      scrollbarWidth: 'none',
    }}
  >
    <style>{`
      .lq-tabbar::-webkit-scrollbar { display: none; }
    `}</style>

    {tabs.map((tab) => {
      const isActive = activeId === tab.id;
      const badge = badges[tab.id];

      return (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="lq-tabbar relative flex items-center gap-2 px-4 py-3 whitespace-nowrap shrink-0"
          style={{
            color: isActive ? '#fff' : tint(palette.warm[100], 0.45),
            transition: motion.base,
          }}
          onMouseEnter={(e) => {
            if (!isActive)
              e.currentTarget.style.color = tint(palette.warm[100], 0.75);
          }}
          onMouseLeave={(e) => {
            if (!isActive)
              e.currentTarget.style.color = tint(palette.warm[100], 0.45);
          }}
        >
          {/* Icon */}
          <tab.Icon
            size={14}
            style={{
              color: isActive ? tab.accent : 'currentColor',
              transition: motion.base,
            }}
          />

          {/* Label */}
          <span
            className="text-[11px] font-semibold uppercase"
            style={{ letterSpacing: '0.08em' }}
          >
            {tab.label}
          </span>

          {/* Badge counter (rendered inline, tight) */}
          {badge != null && badge > 0 && (
            <span
              className="text-[9.5px] font-bold px-1.5 rounded-full tabular-nums min-w-[18px] h-[16px] inline-flex items-center justify-center"
              style={{
                background: isActive
                  ? tint(tab.accent, 0.18)
                  : tint(palette.red[400], 0.14),
                color: isActive ? tab.accent : palette.red[400],
                border: `1px solid ${
                  isActive
                    ? tint(tab.accent, 0.32)
                    : tint(palette.red[400], 0.24)
                }`,
                lineHeight: 1,
              }}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          )}

          {/* Underline — only on active tab, soft glow */}
          {isActive && (
            <>
              <span
                className="absolute left-2 right-2 bottom-[-1px] h-px"
                style={{
                  background: tab.accent,
                  boxShadow: `0 0 8px ${tab.accent}`,
                }}
              />
              <span
                className="absolute left-4 right-4 bottom-[-3px] h-1 blur-md opacity-60"
                style={{ background: tab.accent }}
              />
            </>
          )}
        </button>
      );
    })}
  </div>
);

// ════════════════════════════════════════════════════════════════════
// TabContext — small descriptor under the tab bar
// ════════════════════════════════════════════════════════════════════

const TabContext = ({ tab }) => (
  <div
    className="flex items-center gap-2 px-1 py-1"
    style={{ color: tint(palette.warm[400], 0.85) }}
  >
    <span
      className="inline-block w-1 h-1 rounded-full"
      style={{ background: tab.accent, opacity: 0.5 }}
    />
    <span
      className="text-[10.5px] tracking-wide"
      style={{ letterSpacing: '0.03em' }}
    >
      {tab.description}
    </span>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// AccessGuard — non-admin lockout
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
          <ShieldIcon
            size={36}
            style={{ color: palette.red[400], opacity: 0.8 }}
          />
        </div>
      </div>
      <h2 className="text-lg font-bold text-white mb-1.5 tracking-tight">
        Restricted Area
      </h2>
      <p className="text-xs" style={{ color: '#6b5c52' }}>
        LuxQuant Control is reserved for administrators. If you believe
        this is an error, reach out to your team lead.
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

  // Read initial tab from URL hash, fallback to 'users'
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

  // Listen for hash changes (back/forward navigation)
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

  // Guard non-admins
  if (currentUser?.role !== 'admin') return <AccessGuard />;

  // Per-tab badge counters
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
      {/* ─── Header row ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-2">
        <BrandMark />

        {/* Pulse strip on the right */}
        <div className="lg:max-w-md lg:text-right">
          <p
            className="text-[9px] uppercase tracking-[0.28em] font-semibold mb-2 leading-none"
            style={{ color: tint(palette.warm[100], 0.32) }}
          >
            Pulse
          </p>
          <div className="flex lg:justify-end">
            <PulseStrip
              stats={stats}
              financeStats={financeStats}
              onJumpTo={changeTab}
            />
          </div>
        </div>
      </div>

      {/* Subtitle — minimal Linear-style one-liner */}
      <p
        className="text-[12px] mb-7"
        style={{ color: tint(palette.warm[100], 0.4), letterSpacing: '0.01em' }}
      >
        Operations workspace.
      </p>

      {/* ─── Tab navigation ─── */}
      <div className="mb-2">
        <TabBar
          tabs={TABS}
          activeId={activeTab}
          badges={badges}
          onChange={changeTab}
        />
      </div>

      {/* Active tab descriptor */}
      <div className="mb-6">
        <TabContext tab={activeTabDef} />
      </div>

      {/* ─── Tab content ─── */}
      <div>
        {activeTab === 'users' && (
          <div className="-mx-4 md:-mx-6 lg:-mx-8 -my-6">
            <UserManagementPage />
          </div>
        )}
        {activeTab === 'followups' && (
          <FollowupTab onRefreshStats={fetchStats} />
        )}
        {activeTab === 'marketing' && (
          <MarketingTab onRefreshStats={fetchStats} />
        )}
        {activeTab === 'finance' && (
          <FinanceTab onRefreshStats={fetchFinanceStats} />
        )}
        {activeTab === 'todos' && <TodoTab onRefreshStats={fetchStats} />}
        {activeTab === 'activity' && <ActivityTab />}
        {activeTab === 'apikeys' && <ApiKeysTab />}
      </div>
    </div>
  );
};

export default AdminWorkspacePage;
