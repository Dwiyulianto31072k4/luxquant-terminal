// src/components/AdminWorkspacePage.jsx
//
// LuxQuant — Management System (admin workspace shell).
// ──────────────────────────────────────────────────────────────────────
// Premium fintech aesthetic, Stripe/Vercel sub-sidebar layout:
//   • Logo-less title block: "LUXQUANT" eyebrow + "Management System" H1
//     (gold-gradient accent on "System"), thin gold accent rail.
//   • Left sub-sidebar groups every tab — Members · Operations ·
//     Finance · System. Active group is always expanded; multi-item
//     groups collapse on chevron click. Active item gets a gold rail.
//   • Mobile (<lg): sidebar collapses to a bottom-sheet picker.
//   • Right: active tab content.
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
  { id: 'users',      label: 'Users',      description: 'Members, roles, and access',   Icon: UsersRingIcon,     accent: palette.gold[300] },
  { id: 'followups',  label: 'Follow-ups', description: 'Reminders & support queue',     Icon: ArrowTargetIcon,   accent: palette.blue[400] },
  { id: 'marketing',  label: 'Marketing',  description: 'Campaigns & budget tracking',   Icon: BroadcastConeIcon, accent: palette.purple[400] },
  { id: 'finance',    label: 'Finance',    description: 'Revenue & payment ops',         Icon: BarsChartIcon,     accent: palette.green[400] },
  { id: 'todos',      label: 'TODOs',      description: 'Internal task board',           Icon: CheckSquareIcon,   accent: palette.orange[400] },
  { id: 'activity',   label: 'Activity',   description: 'Engagement & growth analytics', Icon: ActivityIcon,      accent: palette.teal[400] },
  { id: 'apikeys',    label: 'API',        description: 'Developer keys & abuse flags',  Icon: ShieldIcon,        accent: palette.gold[300] },
];

const TAB_BY_ID = Object.fromEntries(TABS.map((t) => [t.id, t]));

// Sidebar groups — each references tab ids. Single-item groups don't collapse.
const NAV_GROUPS = [
  { id: 'members',    label: 'Members',    note: 'Directory & access', tabIds: ['users'] },
  { id: 'operations', label: 'Operations', note: 'Day-to-day ops',     tabIds: ['followups', 'marketing', 'todos'] },
  { id: 'finance',    label: 'Finance',    note: 'Revenue & payments', tabIds: ['finance'] },
  { id: 'system',     label: 'System',     note: 'Analytics & dev',    tabIds: ['activity', 'apikeys'] },
];

// ════════════════════════════════════════════════════════════════════
// Inline icons
// ════════════════════════════════════════════════════════════════════

const Chevron = ({ className = '', style }) => (
  <svg className={className} style={style} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 6l6 6-6 6" />
  </svg>
);
const ChevronDown = ({ className = '', style }) => (
  <svg className={className} style={style} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const CloseGlyph = ({ className = '' }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);
const CheckGlyph = ({ className = '' }) => (
  <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

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
            background: 'linear-gradient(135deg, #ecd6a3, #d4a853)',
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
// UrgencyChip + PulseStrip (unchanged behavior)
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

const PulseStrip = ({ stats, financeStats, onJumpTo }) => {
  const chips = [];
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
// Badge pill (sidebar)
// ════════════════════════════════════════════════════════════════════

const BadgePill = ({ count, accent, active }) => (
  <span
    className="ml-auto text-[9.5px] font-bold px-1.5 rounded-full tabular-nums min-w-[18px] h-[16px] inline-flex items-center justify-center"
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
// Sidebar (desktop)
// ════════════════════════════════════════════════════════════════════

const Sidebar = ({ activeTab, badges, openGroups, onToggleGroup, onSelect }) => (
  <aside className="hidden lg:block w-52 flex-shrink-0">
    <nav className="sticky top-20 space-y-1">
      {NAV_GROUPS.map((g) => {
        const single = g.tabIds.length === 1;
        const isActiveGroup = g.tabIds.includes(activeTab);
        const expanded = single || openGroups.includes(g.id);
        return (
          <div key={g.id}>
            {/* group header */}
            <div className={`group/header w-full flex items-center gap-1.5 pr-2 rounded-md transition-colors ${isActiveGroup ? '' : 'hover:bg-white/[0.03]'}`}>
              {!single ? (
                <button
                  onClick={() => onToggleGroup(g.id)}
                  className="flex items-center justify-center w-6 h-7 flex-shrink-0 -mr-1"
                  aria-label={expanded ? 'Collapse' : 'Expand'}
                >
                  <Chevron
                    className={`transition-all duration-200 ${expanded ? 'rotate-90' : ''}`}
                    style={{ color: isActiveGroup ? tint(palette.gold[300], 0.7) : 'rgba(255,255,255,0.3)' }}
                  />
                </button>
              ) : (
                <span className="w-5 flex-shrink-0" />
              )}
              <div className="flex-1 py-1.5 text-left select-none">
                <span
                  className="font-mono text-[11px] uppercase tracking-[0.18em] font-semibold transition-colors"
                  style={{ color: isActiveGroup ? tint(palette.gold[300], 0.9) : 'rgba(255,255,255,0.45)' }}
                >
                  {g.label}
                </span>
              </div>
            </div>

            {/* items */}
            {expanded && (
              <div className="mt-0.5 mb-2 ml-[19px] pl-[11px] border-l border-white/[0.08] flex flex-col gap-0.5">
                {g.tabIds.map((tid) => {
                  const t = TAB_BY_ID[tid];
                  const on = tid === activeTab;
                  const badge = badges[tid];
                  return (
                    <button
                      key={tid}
                      onClick={() => onSelect(tid)}
                      className={`group relative w-full text-left flex items-center gap-2 px-2.5 py-[7px] rounded-md transition-colors ${on ? '' : 'hover:bg-white/[0.04]'}`}
                      style={on ? { background: tint(palette.gold[300], 0.1) } : undefined}
                    >
                      {on && (
                        <span
                          className="absolute -left-[12px] top-[7px] bottom-[7px] w-[2px] rounded-full"
                          style={{ background: palette.gold[300], boxShadow: `0 0 6px ${tint(palette.gold[300], 0.6)}` }}
                        />
                      )}
                      <t.Icon size={13} style={{ color: on ? t.accent : 'rgba(255,255,255,0.35)', transition: motion.base }} />
                      <span
                        className="text-[13px] tracking-tight transition-colors"
                        style={{ color: on ? '#e6c989' : 'rgba(255,255,255,0.55)', fontWeight: on ? 500 : 400 }}
                      >
                        {t.label}
                      </span>
                      {badge != null && badge > 0 && <BadgePill count={badge} accent={t.accent} active={on} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  </aside>
);

// ════════════════════════════════════════════════════════════════════
// Mobile picker (trigger + bottom sheet)
// ════════════════════════════════════════════════════════════════════

const MobilePicker = ({ activeTab, badges, onSelect }) => {
  const [open, setOpen] = useState(false);
  const active = TAB_BY_ID[activeTab] || TABS[0];
  const activeGroup = NAV_GROUPS.find((g) => g.tabIds.includes(activeTab));

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <div className="lg:hidden mb-5">
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 bg-[#15100a] border border-gold-primary/25 rounded-xl px-4 py-3 text-left active:border-gold-primary/40 transition-colors"
        style={{ borderColor: tint(palette.gold[300], 0.25) }}
      >
        <active.Icon size={16} style={{ color: active.accent }} />
        <div className="min-w-0">
          <div className="font-mono text-[9px] uppercase tracking-[0.18em]" style={{ color: tint(palette.gold[300], 0.7) }}>{activeGroup?.label}</div>
          <div className="text-[15px] font-semibold text-white truncate mt-0.5">{active.label}</div>
        </div>
        <ChevronDown className="ml-auto flex-shrink-0" style={{ color: tint(palette.gold[300], 0.7) }} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 bottom-0 max-h-[82%] flex flex-col bg-[#0c0908] border-t rounded-t-[18px] overflow-hidden shadow-2xl" style={{ borderColor: tint(palette.gold[300], 0.2) }}>
            <div className="mx-auto mt-2.5 mb-1 h-1 w-9 rounded-full bg-white/20" />
            <div className="px-[18px] pt-1.5 pb-3 border-b border-white/[0.06] flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Jump to section</span>
              <button onClick={() => setOpen(false)} aria-label="Close" className="-mr-1.5 flex items-center justify-center w-8 h-8 rounded-full text-white/45 active:bg-white/[0.06] active:text-white transition-colors">
                <CloseGlyph className="w-4 h-4" />
              </button>
            </div>
            <div
              className="overflow-y-auto px-2.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}
            >
              {NAV_GROUPS.map((g) => (
                <div key={g.id}>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] font-semibold px-2.5 pt-3.5 pb-1.5" style={{ color: tint(palette.gold[300], 0.6) }}>{g.label}</div>
                  {g.tabIds.map((tid) => {
                    const t = TAB_BY_ID[tid];
                    const on = tid === activeTab;
                    const badge = badges[tid];
                    return (
                      <button
                        key={tid}
                        onClick={() => { onSelect(tid); setOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-[10px] text-left transition-colors ${on ? '' : 'active:bg-white/[0.04]'}`}
                        style={on ? { background: tint(palette.gold[300], 0.1) } : undefined}
                      >
                        <t.Icon size={16} style={{ color: on ? t.accent : 'rgba(255,255,255,0.4)' }} />
                        <span className={`text-[15px] ${on ? 'font-semibold' : ''}`} style={{ color: on ? '#e6c989' : 'rgba(255,255,255,0.75)' }}>{t.label}</span>
                        {badge != null && badge > 0 && <BadgePill count={badge} accent={t.accent} active={on} />}
                        {on && <CheckGlyph className="ml-auto w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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

  const initialTab = (() => {
    const hash = window.location.hash.replace('#', '');
    return TAB_BY_ID[hash] ? hash : 'users';
  })();
  const [activeTab, setActiveTab] = useState(initialTab);

  const changeTab = (id) => {
    setActiveTab(id);
    window.location.hash = id;
  };

  // group expand state — multi-item groups; active group always open
  const [openGroups, setOpenGroups] = useState(() => NAV_GROUPS.filter((g) => g.tabIds.length > 1).map((g) => g.id));
  const toggleGroup = (id) => setOpenGroups((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((g) => g.tabIds.includes(activeTab));
    if (activeGroup && activeGroup.tabIds.length > 1) {
      setOpenGroups((prev) => (prev.includes(activeGroup.id) ? prev : [...prev, activeGroup.id]));
    }
  }, [activeTab]);

  const fetchStats = useCallback(async () => {
    try { setStats(await workspaceApi.getStats()); } catch (e) { console.error('Failed to load workspace stats:', e); }
  }, []);
  const fetchFinanceStats = useCallback(async () => {
    try { setFinanceStats(await financeApi.getStats()); } catch (e) { console.error('Failed to load finance stats:', e); }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchFinanceStats();
    const interval = setInterval(() => { fetchStats(); fetchFinanceStats(); }, 60000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchFinanceStats]);

  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.replace('#', '');
      if (TAB_BY_ID[hash]) setActiveTab(hash);
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (currentUser?.role !== 'admin') return <AccessGuard />;

  const badges = useMemo(() => ({
    users: null,
    followups: stats?.followups_overdue || null,
    marketing: null,
    finance: financeStats?.stale_count || null,
    todos: stats?.todos_urgent || null,
    activity: null,
    apikeys: null,
  }), [stats, financeStats]);

  const activeTabDef = TAB_BY_ID[activeTab] || TABS[0];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 lg:px-8">
      {/* ─── Header row ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 mb-2">
        <BrandHeader />
        <div className="lg:max-w-md">
          <p className="text-[9px] uppercase tracking-[0.28em] font-semibold mb-2 leading-none lg:text-right" style={{ color: tint(palette.warm[100], 0.32) }}>Pulse</p>
          <PulseStrip stats={stats} financeStats={financeStats} onJumpTo={changeTab} />
        </div>
      </div>

      <p className="text-[12px] mb-7" style={{ color: tint(palette.warm[100], 0.4), letterSpacing: '0.01em' }}>
        Unified operations workspace
      </p>

      {/* mobile picker */}
      <MobilePicker activeTab={activeTab} badges={badges} onSelect={changeTab} />

      {/* ─── Sidebar + content ─── */}
      <div className="flex gap-6 lg:gap-8">
        <Sidebar
          activeTab={activeTab}
          badges={badges}
          openGroups={openGroups}
          onToggleGroup={toggleGroup}
          onSelect={changeTab}
        />

        <div className="min-w-0 flex-1">
          {/* active tab descriptor */}
          <div className="hidden lg:flex items-center gap-2 mb-5">
            <activeTabDef.Icon size={13} style={{ color: activeTabDef.accent }} />
            <span className="text-[11px] uppercase font-semibold tracking-[0.08em] text-white/80">{activeTabDef.label}</span>
            <span className="inline-block w-1 h-1 rounded-full" style={{ background: tint(palette.warm[400], 0.5) }} />
            <span className="text-[10.5px]" style={{ color: tint(palette.warm[400], 0.85), letterSpacing: '0.03em' }}>{activeTabDef.description}</span>
          </div>

          {activeTab === 'users' && (
            <div className="-mx-4 md:-mx-6 lg:mx-0">
              <UserManagementPage />
            </div>
          )}
          {activeTab === 'followups' && <FollowupTab onRefreshStats={fetchStats} />}
          {activeTab === 'marketing' && <MarketingTab onRefreshStats={fetchStats} />}
          {activeTab === 'finance' && <FinanceTab onRefreshStats={fetchFinanceStats} />}
          {activeTab === 'todos' && <TodoTab onRefreshStats={fetchStats} />}
          {activeTab === 'activity' && <ActivityTab />}
          {activeTab === 'apikeys' && <ApiKeysTab />}
        </div>
      </div>
    </div>
  );
};

export default AdminWorkspacePage;
