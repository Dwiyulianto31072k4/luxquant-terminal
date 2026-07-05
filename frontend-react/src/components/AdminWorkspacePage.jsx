// src/components/AdminWorkspacePage.jsx
//
// LuxQuant — Management System (admin workspace shell).
// ──────────────────────────────────────────────────────────────────────
// Full-bleed workspace (edge-to-edge, same rhythm as the Delistings /
// Terminal pages — no centered "card in a card"):
//   • Logo-less title block: "LUXQUANT" eyebrow + "Management System" H1
//     (gold-gradient accent on "System"), thin gold accent rail.
//   • Horizontal underline tab-bar (Delistings-style) groups every view.
//     Scrolls horizontally on small screens; active tab gets a gold rail.
//   • Right of the header: live "Pulse" urgency chips.
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
import { GrowthTab } from './admin/workspace/GrowthTab';
import { TodoTab } from './admin/workspace/TodoTab';
import { ActivityTab } from './admin/workspace/ActivityTab';
import { ApiKeysTab } from './admin/workspace/ApiKeysTab';
import { AnnouncementsTab } from './admin/workspace/AnnouncementsTab';
import { SystemTab } from './admin/workspace/SystemTab';
import { ProfitSharingTab } from './admin/workspace/ProfitSharingTab';

// Design system
import { palette, tint, motion, gradient } from './admin/designSystem';

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
  UsersRingIcon,
  ArrowTargetIcon,
  BroadcastConeIcon,
  BarsChartIcon,
  CheckSquareIcon,
  ActivityIcon,
  ServerIcon,
  DollarIcon,
} from './admin/Icons';

// ════════════════════════════════════════════════════════════════════
// Tab definition
// ════════════════════════════════════════════════════════════════════

const TABS = [
  { id: 'users',         label: 'Users',         description: 'Members, roles, and access',     Icon: UsersRingIcon,     accent: palette.gold[300] },
  { id: 'followups',     label: 'Follow-ups',    description: 'Reminders & support queue',       Icon: ArrowTargetIcon,   accent: palette.blue[400] },
  { id: 'marketing',     label: 'Marketing',     description: 'Campaigns & budget tracking',     Icon: BroadcastConeIcon, accent: palette.purple[400] },
  { id: 'finance',       label: 'Finance',       description: 'Revenue & payment ops',           Icon: BarsChartIcon,     accent: palette.green[400] },
  { id: 'growth',        label: 'Growth',        description: 'Revenue, retention & attribution', Icon: TrendingUpIcon,    accent: palette.green[400] },
  { id: 'todos',         label: 'TODOs',         description: 'Internal task board',             Icon: CheckSquareIcon,   accent: palette.orange[400] },
  { id: 'activity',      label: 'Activity',      description: 'Engagement & growth analytics',   Icon: ActivityIcon,      accent: palette.teal[400] },
  { id: 'apikeys',       label: 'API',           description: 'Developer keys & abuse flags',    Icon: ShieldIcon,        accent: palette.gold[300] },
  { id: 'announcements', label: 'Announcements', description: 'In-app modal messages',           Icon: BroadcastConeIcon, accent: palette.purple[400] },
  { id: 'system',        label: 'System',        description: 'VPS service health & control',    Icon: ServerIcon,        accent: palette.teal[400] },
  { id: 'profitshare',   label: 'Profit Share',  description: 'Revenue split recap & export',     Icon: DollarIcon,        accent: palette.green[400] },
];

const TAB_BY_ID = Object.fromEntries(TABS.map((t) => [t.id, t]));

// ════════════════════════════════════════════════════════════════════
// BrandHeader — logo-less title block
// ════════════════════════════════════════════════════════════════════

const BrandHeader = () => (
  <div className="flex items-stretch gap-3.5">
    {/* thin gold accent rail (replaces the logo) */}
    <div
      className="w-[3px] shrink-0 rounded-full"
      style={{ background: `linear-gradient(to bottom, ${palette.gold[300]}, ${tint(palette.gold[300], 0.4)}, transparent)` }}
    />
    <div className="min-w-0">
      <p
        className="text-[10px] uppercase tracking-[0.32em] font-semibold leading-none mb-2"
        style={{ color: tint(palette.gold[300], 0.6) }}
      >
        LuxQuant
      </p>
      <h1 className="text-[26px] sm:text-[30px] font-light tracking-tight leading-none" style={{ letterSpacing: '-0.02em' }}>
        <span className="text-white">Management </span>
        <span
          style={{
            background: gradient.goldText,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          System
        </span>
      </h1>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// UrgencyChip + PulseStrip
// ════════════════════════════════════════════════════════════════════

const UrgencyChip = ({ label, value, accent, Icon, onClick, pulse = false }) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={`group relative flex items-center gap-2 px-2.5 py-1.5 rounded-md ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    style={{ background: tint(accent, 0.05), border: `1px solid ${tint(accent, 0.18)}`, transition: motion.base }}
    onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.background = tint(accent, 0.10); e.currentTarget.style.borderColor = tint(accent, 0.32); } }}
    onMouseLeave={(e) => { if (onClick) { e.currentTarget.style.background = tint(accent, 0.05); e.currentTarget.style.borderColor = tint(accent, 0.18); } }}
  >
    <span className="relative inline-flex shrink-0">
      {pulse && <span className="absolute inset-0 rounded-full animate-ping opacity-50" style={{ background: accent }} />}
      <span className="relative inline-block w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
    </span>
    <Icon size={11} style={{ color: tint(accent, 0.85) }} />
    <span className="text-[10px] font-medium leading-none" style={{ color: tint(accent, 0.75), letterSpacing: '0.02em' }}>{label}</span>
    <span className="text-[12px] font-bold tabular-nums leading-none" style={{ color: accent, fontFeatureSettings: '"tnum"' }}>{value}</span>
  </button>
);

const PulseStrip = ({ stats, financeStats, servicesSummary, onJumpTo }) => {
  const chips = [];
  if (servicesSummary?.down > 0) chips.push({ label: 'service down', value: servicesSummary.down, accent: palette.red[400], Icon: ServerIcon, pulse: true, onClick: () => onJumpTo('system') });
  if (stats?.followups_overdue > 0) chips.push({ label: 'overdue', value: stats.followups_overdue, accent: palette.red[400], Icon: AlertTriangleIcon, pulse: true, onClick: () => onJumpTo('followups') });
  if (financeStats?.stale_count > 0) chips.push({ label: 'stale pay', value: financeStats.stale_count, accent: palette.red[400], Icon: AlertCircleIcon, pulse: true, onClick: () => onJumpTo('finance') });
  if (stats?.todos_urgent > 0) chips.push({ label: 'urgent todos', value: stats.todos_urgent, accent: palette.orange[400], Icon: ZapIcon, onClick: () => onJumpTo('todos') });
  if (stats?.followups_today > 0) chips.push({ label: 'due today', value: stats.followups_today, accent: palette.amber[400], Icon: ClockIcon, onClick: () => onJumpTo('followups') });
  if (financeStats?.revenue_today > 0) chips.push({ label: 'today', value: `$${Number(financeStats.revenue_today).toLocaleString('en-US', { maximumFractionDigits: 0 })}`, accent: palette.green[400], Icon: TrendingUpIcon, onClick: () => onJumpTo('finance') });
  if (stats?.campaigns_active > 0) chips.push({ label: 'campaigns', value: stats.campaigns_active, accent: palette.purple[400], Icon: TargetIcon, onClick: () => onJumpTo('marketing') });

  if (chips.length === 0) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md" style={{ background: tint(palette.green[400], 0.05), border: `1px solid ${tint(palette.green[400], 0.15)}` }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: palette.green[400] }} />
        <CheckCircleIcon size={11} style={{ color: palette.green[400] }} />
        <span className="text-[10px] font-medium leading-none" style={{ color: tint(palette.green[400], 0.85), letterSpacing: '0.02em' }}>all clear</span>
      </div>
    );
  }
  return <div className="flex flex-wrap gap-1.5 items-center lg:justify-end">{chips.map((chip, i) => <UrgencyChip key={i} {...chip} />)}</div>;
};

// ════════════════════════════════════════════════════════════════════
// Badge pill (tab counter)
// ════════════════════════════════════════════════════════════════════

const BadgePill = ({ count, accent, active }) => (
  <span
    className="text-[9.5px] font-bold px-1.5 rounded-full tabular-nums min-w-[18px] h-[16px] inline-flex items-center justify-center"
    style={{
      background: active ? tint(accent, 0.18) : tint(palette.red[400], 0.14),
      color: active ? accent : palette.red[400],
      border: `1px solid ${active ? tint(accent, 0.32) : tint(palette.red[400], 0.24)}`,
      lineHeight: 1,
    }}
  >
    {count > 99 ? '99+' : count}
  </span>
);

// ════════════════════════════════════════════════════════════════════
// TabBar — horizontal underline tabs (Delistings/Terminal language)
// ════════════════════════════════════════════════════════════════════

const TabBar = ({ activeTab, badges, onSelect }) => (
  <div className="border-b border-white/[0.07] mb-5">
    <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar">
      {TABS.map((t) => {
        const on = t.id === activeTab;
        const badge = badges[t.id];
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`group relative whitespace-nowrap pb-3 pt-1 -mb-px border-b-2 transition-colors ${on ? 'border-gold-primary' : 'border-transparent hover:border-white/15'}`}
            style={on ? { borderColor: palette.gold[300] } : undefined}
          >
            <span className="inline-flex items-center gap-2">
              <t.Icon size={14} style={{ color: on ? t.accent : 'rgba(255,255,255,0.4)', transition: motion.base }} />
              <span
                className="text-[13.5px] tracking-tight transition-colors"
                style={{ color: on ? '#fff' : 'rgba(255,255,255,0.55)', fontWeight: on ? 600 : 500 }}
              >
                {t.label}
              </span>
              {badge != null && badge > 0 && <BadgePill count={badge} accent={t.accent} active={on} />}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// AccessGuard — non-admin lockout
// ════════════════════════════════════════════════════════════════════

const AccessGuard = () => (
  <div className="flex items-center justify-center min-h-[60vh] px-4">
    <div className="text-center max-w-sm">
      <div className="relative inline-flex mb-5">
        <div className="absolute inset-0 rounded-full blur-2xl opacity-20" style={{ background: palette.red[400] }} />
        <div className="relative w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: tint(palette.red[400], 0.06), border: `1px solid ${tint(palette.red[400], 0.2)}` }}>
          <ShieldIcon size={36} style={{ color: palette.red[400], opacity: 0.8 }} />
        </div>
      </div>
      <h2 className="text-lg font-bold text-white mb-1.5 tracking-tight">Restricted Area</h2>
      <p className="text-xs" style={{ color: '#6b5c52' }}>
        LuxQuant Management System is reserved for administrators. If you believe this is an error, reach out to your team lead.
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
  const [servicesSummary, setServicesSummary] = useState(null);

  const initialTab = (() => {
    const hash = window.location.hash.replace('#', '');
    return TAB_BY_ID[hash] ? hash : 'users';
  })();
  const [activeTab, setActiveTab] = useState(initialTab);

  const changeTab = (id) => {
    setActiveTab(id);
    window.location.hash = id;
  };

  const fetchStats = useCallback(async () => {
    try { setStats(await workspaceApi.getStats()); } catch (e) { console.error('Failed to load workspace stats:', e); }
  }, []);
  const fetchFinanceStats = useCallback(async () => {
    try { setFinanceStats(await financeApi.getStats()); } catch (e) { console.error('Failed to load finance stats:', e); }
  }, []);
  const fetchServicesSummary = useCallback(async () => {
    try { const r = await workspaceApi.getServices(); setServicesSummary(r?.summary || null); }
    catch (e) { console.error('Failed to load services summary:', e); }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchFinanceStats();
    fetchServicesSummary();
    const interval = setInterval(() => { fetchStats(); fetchFinanceStats(); fetchServicesSummary(); }, 60000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchFinanceStats, fetchServicesSummary]);

  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.replace('#', '');
      if (TAB_BY_ID[hash]) setActiveTab(hash);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const badges = useMemo(() => ({
    users: null,
    followups: stats?.followups_overdue || null,
    marketing: null,
    finance: financeStats?.stale_count || null,
    growth: null,
    todos: stats?.todos_urgent || null,
    activity: null,
    apikeys: null,
    announcements: null,
    system: servicesSummary?.down || null,
  }), [stats, financeStats, servicesSummary]);

  if (currentUser?.role !== 'admin') return <AccessGuard />;

  const activeTabDef = TAB_BY_ID[activeTab] || TABS[0];

  return (
    <div className="w-full px-4 lg:px-8 py-6">
      {/* ─── Header row ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-2">
        <BrandHeader />
        <div className="lg:max-w-md">
          <p className="text-[9px] uppercase tracking-[0.28em] font-semibold mb-2 leading-none lg:text-right" style={{ color: tint(palette.warm[100], 0.32) }}>Pulse</p>
          <PulseStrip stats={stats} financeStats={financeStats} servicesSummary={servicesSummary} onJumpTo={changeTab} />
        </div>
      </div>

      <p className="text-[12px] mb-6" style={{ color: tint(palette.warm[100], 0.4), letterSpacing: '0.01em' }}>
        Unified operations workspace
      </p>

      {/* ─── Horizontal tab-bar ─── */}
      <TabBar activeTab={activeTab} badges={badges} onSelect={changeTab} />

      {/* active tab descriptor */}
      <div className="hidden sm:flex items-center gap-2 mb-5">
        <activeTabDef.Icon size={13} style={{ color: activeTabDef.accent }} />
        <span className="text-[11px] uppercase font-semibold tracking-[0.08em] text-white/80">{activeTabDef.label}</span>
        <span className="inline-block w-1 h-1 rounded-full" style={{ background: tint(palette.warm[400], 0.5) }} />
        <span className="text-[10.5px]" style={{ color: tint(palette.warm[400], 0.85), letterSpacing: '0.03em' }}>{activeTabDef.description}</span>
      </div>

      {/* ─── Active tab content ─── */}
      {activeTab === 'users' && (
        <div className="-mx-4 lg:-mx-8">
          <UserManagementPage />
        </div>
      )}
      {activeTab === 'followups' && <FollowupTab onRefreshStats={fetchStats} />}
      {activeTab === 'marketing' && <MarketingTab onRefreshStats={fetchStats} />}
      {activeTab === 'finance' && <FinanceTab onRefreshStats={fetchFinanceStats} />}
      {activeTab === 'growth' && <GrowthTab />}
      {activeTab === 'todos' && <TodoTab onRefreshStats={fetchStats} />}
      {activeTab === 'activity' && <ActivityTab />}
      {activeTab === 'apikeys' && <ApiKeysTab />}
      {activeTab === 'announcements' && <AnnouncementsTab />}
      {activeTab === 'system' && <SystemTab />}
      {activeTab === 'profitshare' && <ProfitSharingTab />}
    </div>
  );
};

export default AdminWorkspacePage;
