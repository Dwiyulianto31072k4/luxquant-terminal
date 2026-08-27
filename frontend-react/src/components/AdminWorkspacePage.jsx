// src/components/AdminWorkspacePage.jsx
//
// LuxQuant — Management System (admin workspace shell).
// ──────────────────────────────────────────────────────────────────────
// Terminal-style operating shell: grouped vertical navigation on desktop,
// collapsible icon rail, isolated navigation/content scroll, and a compact
// mobile tab strip. The URL hash remains the source of truth for deep links.
//
// State:
// • Active tab persisted via URL hash (e.g. /admin/workspace#finance)
// • Stats polled every 60s for live badge counters
//
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { workspaceApi } from "../services/workspaceApi";
import { adminChatApi } from "../services/adminChatApi";
import { financeApi } from "../services/financeApi";
import { isAdminStaff, isAdminViewOnly } from "../utils/roles";

// Tab content
import UserManagementPage from "./UserManagementPage";
import { FollowupTab } from "./admin/workspace/FollowupTab";
import { MarketingTab } from "./admin/workspace/MarketingTab";
import { FinanceTab } from "./admin/workspace/FinanceTab";
import { GrowthTab } from "./admin/workspace/GrowthTab";
import { ConversionTab } from "./admin/workspace/ConversionTab";
import { TodoTab } from "./admin/workspace/TodoTab";
import { ActivityTab } from "./admin/workspace/ActivityTab";
import { AutoTradeOpsTab } from "./admin/workspace/AutoTradeOpsTab";
import { AwaitingReplyNudge } from "./admin/AwaitingReplyNudge";
import { ApiKeysTab } from "./admin/workspace/ApiKeysTab";
import { AnnouncementsTab } from "./admin/workspace/AnnouncementsTab";
import { ChatTab } from "./admin/workspace/ChatTab";
import { SystemTab } from "./admin/workspace/SystemTab";
import { ProfitSharingTab } from "./admin/workspace/ProfitSharingTab";
import { AiCostTab } from "./admin/workspace/AiCostTab";
import { ApiHealthTab } from "./admin/workspace/ApiHealthTab";
import { XTrackerTab } from "./admin/workspace/XTrackerTab";
import { StatusTab } from "./admin/workspace/StatusTab";
import { ResourcesTab } from "./admin/workspace/ResourcesTab";
import SocialPostsAdminPage from "./SocialPostsAdminPage";
import SignalCardsAdminPage from "./SignalCardsAdminPage";

// Design system
import { palette, tint, motion, NEUTRAL } from "./admin/designSystem";
import { RouteErrorBoundary } from "./ErrorBoundary";
import "./admin/AdminWorkspacePage.css";

// Icons
import {
  ShieldIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  BellIcon,
  ZapIcon,
  ClockIcon,
  TrendingUpIcon,
  TargetIcon,
  CheckCircleIcon,
  UsersRingIcon,
  ArrowTargetIcon,
  CheckSquareIcon,
  ActivityIcon,
  ServerIcon,
  DollarIcon,
  MessageCircleIcon,
  WalletIcon,
  FunnelIcon,
  MegaphoneIcon,
  RocketIcon,
  SocialOrbitIcon,
  CardStackIcon,
  AnnouncementIcon,
  BookOpenIcon,
  BotIcon,
  KeyIcon,
  SplitCoinIcon,
  CpuChipIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "./admin/Icons";

// ════════════════════════════════════════════════════════════════════
// Tab definition
// ════════════════════════════════════════════════════════════════════

const TABS = [
  {
    id: "users",
    label: "Users",
    description: "Members, roles, and access",
    Icon: UsersRingIcon,
    group: "people",
  },
  {
    id: "conversion",
    label: "Conversion",
    description: "Login funnel & acquisition quality",
    Icon: FunnelIcon,
    group: "people",
  },
  {
    id: "chat",
    label: "Chat",
    description: "Live conversations with users",
    Icon: MessageCircleIcon,
    group: "people",
  },
  {
    id: "followups",
    label: "Follow-ups",
    description: "Reminders & support queue",
    Icon: ArrowTargetIcon,
    group: "people",
  },
  {
    id: "marketing",
    label: "Marketing",
    description: "Campaigns & budget tracking",
    Icon: MegaphoneIcon,
    group: "growth",
  },
  {
    id: "finance",
    label: "Finance",
    description: "Revenue & payment ops",
    Icon: WalletIcon,
    group: "operations",
  },
  {
    id: "autotrade",
    label: "Agent",
    description: "Bot health, errors & open positions",
    Icon: BotIcon,
    group: "operations",
  },
  {
    id: "growth",
    label: "Growth",
    description: "Revenue, retention & referrals",
    Icon: RocketIcon,
    group: "growth",
  },
  {
    id: "todos",
    label: "TODOs",
    description: "Internal task board",
    Icon: CheckSquareIcon,
    group: "operations",
  },
  {
    id: "activity",
    label: "Activity",
    description: "Engagement & growth analytics",
    Icon: ActivityIcon,
    group: "people",
  },
  {
    id: "apikeys",
    label: "API",
    description: "Developer keys & abuse flags",
    Icon: KeyIcon,
    group: "platform",
  },
  {
    id: "announcements",
    label: "Announcements",
    description: "In-app modal messages",
    Icon: AnnouncementIcon,
    group: "growth",
  },
  {
    id: "socialposts",
    label: "Social Posts",
    description: "AI-generated post drafts",
    Icon: SocialOrbitIcon,
    group: "growth",
  },
  {
    id: "signalcards",
    label: "Signal Cards",
    description: "Automated card scheduler & drafts",
    Icon: CardStackIcon,
    group: "growth",
  },
  {
    id: "resources",
    label: "Resources",
    description: "Research, guides, videos & links",
    Icon: BookOpenIcon,
    group: "growth",
  },
  {
    id: "system",
    label: "System",
    description: "VPS service health & control",
    Icon: ServerIcon,
    group: "platform",
  },
  {
    id: "status",
    label: "Status",
    description: "Public status page & incidents",
    Icon: BellIcon,
    group: "platform",
  },
  {
    id: "profitshare",
    label: "Profit Share",
    description: "Revenue split recap & export",
    Icon: SplitCoinIcon,
    group: "operations",
  },
  {
    id: "aicost",
    label: "AI Cost",
    description: "AI usage & spend tracking",
    Icon: CpuChipIcon,
    group: "platform",
  },
  {
    id: "apihealth",
    label: "API Health",
    description: "External keys, balance & quota",
    Icon: KeyIcon,
    group: "platform",
  },
  {
    id: "xtracker",
    label: "X Tracker",
    description: "What each post did afterwards",
    Icon: MegaphoneIcon,
    group: "growth",
  },
];

const TAB_GROUPS = [
  { id: "people", label: "People & CRM" },
  { id: "growth", label: "Growth & Content" },
  { id: "operations", label: "Revenue & Ops" },
  { id: "platform", label: "Platform & Control" },
];

const TAB_BY_ID = Object.fromEntries(TABS.map((t) => [t.id, t]));

// ════════════════════════════════════════════════════════════════════
// Compact workspace chrome — same navigation language as Terminal.
// ════════════════════════════════════════════════════════════════════

const WorkspaceTitle = ({ activeTab, collapsed, onToggle }) => {
  const tab = TAB_BY_ID[activeTab] || TABS[0];
  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-ink/[0.08] bg-ink/[0.025] text-text-muted transition hover:border-ink/[0.16] hover:bg-ink/[0.05] hover:text-text-primary lg:flex"
        title={`${collapsed ? "Expand" : "Collapse"} management navigation ([)`}
        aria-label={`${collapsed ? "Expand" : "Collapse"} management navigation`}
      >
        {collapsed ? (
          <ChevronRightIcon size={17} />
        ) : (
          <ChevronLeftIcon size={17} />
        )}
      </button>
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/[0.08] text-accent">
          <tab.Icon size={18} />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold tracking-tight text-text-primary sm:text-[14px]">
            <span className="hidden sm:inline">Management System</span>
            <span className="hidden text-text-muted/50 sm:inline">/</span>
            <span className="truncate">{tab.label}</span>
          </div>
          <p className="mt-0.5 truncate text-[10.5px] text-text-muted">
            {tab.description}
          </p>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// UrgencyChip + PulseStrip
// ════════════════════════════════════════════════════════════════════

const UrgencyChip = ({
  label,
  value,
  accent,
  Icon,
  onClick,
  pulse = false,
}) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={`group relative flex items-center gap-2 px-2.5 py-1.5 rounded-md ${onClick ? "cursor-pointer" : "cursor-default"}`}
    style={{
      background: tint(accent, 0.05),
      border: `1px solid ${tint(accent, 0.18)}`,
      transition: motion.base,
    }}
    onMouseEnter={(e) => {
      if (onClick) {
        e.currentTarget.style.background = tint(accent, 0.1);
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
    <Icon size={11} className="text-text-muted" />
    <span
      className="text-[10px] font-medium leading-none text-text-muted"
      style={{ letterSpacing: "0.02em" }}
    >
      {label}
    </span>
    <span
      className="text-[12px] font-bold tabular-nums leading-none text-text-primary"
      style={{ fontFeatureSettings: '"tnum"' }}
    >
      {value}
    </span>
  </button>
);

const PulseStrip = ({ stats, financeStats, servicesSummary, onJumpTo }) => {
  const chips = [];
  if (servicesSummary?.down > 0)
    chips.push({
      label: "service down",
      value: servicesSummary.down,
      accent: palette.red[400],
      Icon: ServerIcon,
      pulse: true,
      onClick: () => onJumpTo("system"),
    });
  if (stats?.followups_overdue > 0)
    chips.push({
      label: "overdue",
      value: stats.followups_overdue,
      accent: palette.red[400],
      Icon: AlertTriangleIcon,
      pulse: true,
      onClick: () => onJumpTo("followups"),
    });
  if (financeStats?.stale_count > 0)
    chips.push({
      label: "stale pay",
      value: financeStats.stale_count,
      accent: palette.red[400],
      Icon: AlertCircleIcon,
      pulse: true,
      onClick: () => onJumpTo("finance"),
    });
  if (financeStats?.payment_gap_pending > 0)
    chips.push({
      label: "pay gap",
      value: financeStats.payment_gap_pending,
      accent: palette.amber[400],
      Icon: DollarIcon,
      pulse: true,
      onClick: () => {
        try {
          sessionStorage.setItem("luxquant.openPaymentAudit", "1");
        } catch {
          /* ignore */
        }
        onJumpTo("finance");
      },
    });
  if (stats?.todos_urgent > 0)
    chips.push({
      label: "urgent todos",
      value: stats.todos_urgent,
      accent: palette.orange[400],
      Icon: ZapIcon,
      onClick: () => onJumpTo("todos"),
    });
  if (stats?.followups_today > 0)
    chips.push({
      label: "due today",
      value: stats.followups_today,
      accent: palette.amber[400],
      Icon: ClockIcon,
      onClick: () => onJumpTo("followups"),
    });
  if (financeStats?.revenue_today > 0)
    chips.push({
      label: "today",
      value: `$${Number(financeStats.revenue_today).toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
      accent: palette.green[400],
      Icon: TrendingUpIcon,
      onClick: () => onJumpTo("finance"),
    });
  if (stats?.agent_errors > 0)
    chips.push({
      label: "agent errors",
      value: stats.agent_errors,
      accent: palette.red[400],
      Icon: BotIcon,
      pulse: true,
      onClick: () => onJumpTo("autotrade"),
    });
  if (stats?.agent_invalid_keys > 0)
    chips.push({
      label: "bad keys",
      value: stats.agent_invalid_keys,
      accent: palette.amber[400],
      Icon: KeyIcon,
      pulse: true,
      onClick: () => onJumpTo("autotrade"),
    });
  if (stats?.agent_live > 0)
    chips.push({
      label: "live bots",
      value: stats.agent_live,
      accent: palette.green[400],
      Icon: BotIcon,
      onClick: () => onJumpTo("autotrade"),
    });
  if (stats?.campaigns_active > 0)
    chips.push({
      label: "campaigns",
      value: stats.campaigns_active,
      accent: palette.purple[400],
      Icon: TargetIcon,
      onClick: () => onJumpTo("marketing"),
    });

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
          className="text-[10px] font-medium leading-none text-text-muted"
          style={{ letterSpacing: "0.02em" }}
        >
          all clear
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5 items-center lg:justify-end">
      {chips.map((chip, i) => (
        <UrgencyChip key={i} {...chip} />
      ))}
    </div>
  );
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
    {count > 99 ? "99+" : count}
  </span>
);

// ════════════════════════════════════════════════════════════════════
// Grouped sidebar — sticky desktop rail with its own scroll context.
// ════════════════════════════════════════════════════════════════════

const WorkspaceSidebar = ({ activeTab, badges, collapsed, onSelect }) => (
  <aside
    className={`relative hidden min-h-0 shrink-0 border-r border-ink/[0.07] lg:flex lg:flex-col ${
      collapsed ? "w-[62px]" : "w-[214px] xl:w-[226px]"
    }`}
    style={{ transition: "width 180ms cubic-bezier(.4,0,.2,1)" }}
    aria-label="Management navigation"
  >
    <nav
      className={`admin-nav-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-5 pt-1 ${
        collapsed ? "px-2" : "pr-3"
      }`}
      role="tablist"
      aria-orientation="vertical"
    >
      {TAB_GROUPS.map((group, groupIndex) => (
        <div key={group.id} className={groupIndex === 0 ? "" : "mt-4"}>
          {collapsed ? (
            groupIndex > 0 && (
              <div
                className="mx-2 mb-3 h-px bg-ink/[0.08]"
                aria-hidden="true"
              />
            )
          ) : (
            <p className="mb-1.5 px-3 font-mono text-[8.5px] font-semibold uppercase tracking-[0.18em] text-text-muted/60">
              {group.label}
            </p>
          )}

          <div className="space-y-0.5">
            {TABS.filter((tab) => tab.group === group.id).map((tab) => {
              const on = tab.id === activeTab;
              const badge = badges[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-label={tab.label}
                  title={
                    collapsed
                      ? `${tab.label} — ${tab.description}`
                      : tab.description
                  }
                  onClick={() => onSelect(tab.id)}
                  className={`group relative flex h-10 w-full items-center rounded-lg transition-colors ${
                    collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
                  } ${
                    on
                      ? "bg-ink/[0.07] text-text-primary"
                      : "text-text-muted hover:bg-ink/[0.035] hover:text-text-primary"
                  }`}
                >
                  {on && (
                    <span
                      className={`absolute bottom-2 top-2 w-[3px] rounded-full bg-accent ${
                        collapsed ? "-left-2" : "left-0"
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition ${
                      on
                        ? "border-accent/25 bg-accent/[0.1] text-accent"
                        : "border-ink/[0.06] bg-ink/[0.025] text-text-muted group-hover:border-ink/[0.12] group-hover:bg-ink/[0.05] group-hover:text-text-primary"
                    }`}
                  >
                    <tab.Icon size={16} />
                    {collapsed && badge != null && badge > 0 && (
                      <span
                        className="absolute -right-1 -top-1 h-2.5 min-w-2.5 rounded-full border-2 px-0.5 text-[0px]"
                        style={{
                          background: "rgb(var(--neg))",
                          borderColor: "rgb(var(--surface))",
                        }}
                      />
                    )}
                  </span>
                  {!collapsed && (
                    <>
                      <span
                        className={`min-w-0 flex-1 truncate text-left text-[12px] ${on ? "font-semibold" : "font-medium"}`}
                      >
                        {tab.label}
                      </span>
                      {badge != null && badge > 0 && (
                        <BadgePill
                          count={badge}
                          accent={palette.red[400]}
                          active={on}
                        />
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>

    {!collapsed && (
      <div className="shrink-0 border-t border-ink/[0.07] py-3 pr-3">
        <div className="rounded-lg border border-ink/[0.07] bg-ink/[0.02] px-3 py-2.5">
          <p className="font-mono text-[8px] uppercase tracking-[0.16em] text-text-muted/60">
            Workspace
          </p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-text-muted">
            Press{" "}
            <kbd className="rounded border border-ink/10 bg-ink/[0.04] px-1 font-mono text-[9px]">
              [
            </kbd>{" "}
            to collapse navigation.
          </p>
        </div>
      </div>
    )}
  </aside>
);

const MobileTabBar = ({ activeTab, badges, onSelect }) => (
  <div className="no-scrollbar shrink-0 overflow-x-auto border-b border-ink/[0.07] py-2 lg:hidden">
    <div
      className="flex min-w-max items-center gap-1"
      role="tablist"
      aria-label="Management sections"
    >
      {TABS.map((tab) => {
        const on = activeTab === tab.id;
        const badge = badges[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(tab.id)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition ${
              on
                ? "border-accent/25 bg-accent/[0.1] text-text-primary"
                : "border-transparent text-text-muted hover:border-ink/[0.08] hover:bg-ink/[0.03]"
            }`}
          >
            <tab.Icon size={14} className={on ? "text-accent" : ""} />
            {tab.label}
            {badge != null && badge > 0 && (
              <BadgePill count={badge} accent={palette.red[400]} active={on} />
            )}
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
      <h2 className="text-lg font-bold text-text-primary mb-1.5 tracking-tight">
        Restricted Area
      </h2>
      <p className="text-xs" style={{ color: "rgb(var(--fg-muted))" }}>
        LuxQuant Management System is reserved for admin, co-admin, and founder.
        If you believe this is an error, reach out to your team lead.
      </p>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════════════════

const AdminWorkspacePage = () => {
  const { user: currentUser } = useAuth();
  const contentRef = useRef(null);
  const [stats, setStats] = useState(null);
  const [financeStats, setFinanceStats] = useState(null);
  const [servicesSummary, setServicesSummary] = useState(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem("lq_admin_workspace_nav_collapsed") === "1";
    } catch {
      return false;
    }
  });

  // "#finance" selects a tab; "#finance?q=alice" also hands it a filter.
  const parseHash = () => {
    const raw = window.location.hash.replace(/^#/, "");
    const [id, qs] = raw.split("?");
    let q = "";
    try {
      q = new URLSearchParams(qs || "").get("q") || "";
    } catch {
      q = "";
    }
    return { id: TAB_BY_ID[id] ? id : null, q };
  };

  const initial = parseHash();
  const [activeTab, setActiveTab] = useState(initial.id || "users");
  const [tabQuery, setTabQuery] = useState(initial.q);

  const changeTab = (id, q = "") => {
    setActiveTab(id);
    setTabQuery(q);
    window.location.hash = q ? `${id}?q=${encodeURIComponent(q)}` : id;
  };

  const toggleNavigation = useCallback(() => {
    setNavCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(
          "lq_admin_workspace_nav_collapsed",
          next ? "1" : "0",
        );
      } catch {
        /* localStorage can be unavailable in hardened browsers */
      }
      return next;
    });
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await workspaceApi.getStats());
    } catch (e) {
      console.error("Failed to load workspace stats:", e);
    }
  }, []);
  const fetchFinanceStats = useCallback(async () => {
    try {
      const [fin, audit] = await Promise.all([
        financeApi.getStats(),
        workspaceApi.getPaymentAudit().catch(() => null),
      ]);
      const gap = audit?.summary?.pending ?? audit?.users?.length ?? 0;
      setFinanceStats({ ...fin, payment_gap_pending: gap });
    } catch (e) {
      console.error("Failed to load finance stats:", e);
    }
  }, []);
  const fetchServicesSummary = useCallback(async () => {
    try {
      const r = await workspaceApi.getServices();
      setServicesSummary(r?.summary || null);
    } catch (e) {
      console.error("Failed to load services summary:", e);
    }
  }, []);
  const fetchChatUnread = useCallback(async () => {
    try {
      const r = await adminChatApi.getUnreadCount();
      setChatUnread(r?.unread_conversations || 0);
    } catch {
      // Silent: polled every 15s, and a missing badge is not worth log noise.
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchFinanceStats();
    fetchServicesSummary();
    const interval = setInterval(() => {
      fetchStats();
      fetchFinanceStats();
      fetchServicesSummary();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchFinanceStats, fetchServicesSummary]);

  // Chat runs on its own, faster clock: at 60s the badge could sit a full
  // minute behind an unanswered user, and response time is the metric that
  // decides whether this feature converts anyone.
  useEffect(() => {
    fetchChatUnread();
    const interval = setInterval(fetchChatUnread, 15000);
    return () => clearInterval(interval);
  }, [fetchChatUnread]);

  useEffect(() => {
    const handler = () => {
      const { id, q } = parseHash();
      if (id) {
        setActiveTab(id);
        setTabQuery(q);
      }
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      if (
        event.key !== "[" ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      )
        return;
      event.preventDefault();
      toggleNavigation();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleNavigation]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [activeTab]);

  // Chat is an immersive mobile workspace. The global product bottom-nav is
  // useful while browsing, but inside a live conversation it steals exactly
  // the composer-sized strip WhatsApp keeps for the thread. Scope the class to
  // this tab and always clean it up when navigating away/unmounting.
  useEffect(() => {
    const className = "lq-admin-chat-active";
    document.body.classList.toggle(className, activeTab === "chat");
    return () => document.body.classList.remove(className);
  }, [activeTab]);

  const badges = useMemo(
    () => ({
      users: null,
      chat: chatUnread || null,
      followups: stats?.followups_overdue || null,
      marketing: null,
      // Prefer stale payments; fall back to payment-gap backlog
      finance:
        financeStats?.stale_count || financeStats?.payment_gap_pending || null,
      autotrade: stats?.agent_errors || stats?.agent_invalid_keys || null,
      // Agent adoption belongs to the Agent operations desk. Growth is led by
      // signal activation, confirmed revenue, retention, and referrals.
      growth: null,
      todos: stats?.todos_urgent || null,
      activity: null,
      apikeys: null,
      announcements: null,
      system: servicesSummary?.down || null,
    }),
    [stats, financeStats, servicesSummary, chatUnread],
  );

  if (!isAdminStaff(currentUser)) return <AccessGuard />;

  const viewOnly = isAdminViewOnly(currentUser);

  return (
    <div className={`flex w-full min-w-0 flex-col px-4 py-4 lg:h-[calc(100vh-5.5rem)] lg:overflow-hidden lg:px-6 lg:py-3 ${activeTab === "chat" ? "admin-chat-workspace" : ""}`}>
      <header className="flex shrink-0 flex-col gap-3 border-b border-ink/[0.07] pb-3 sm:flex-row sm:items-center sm:justify-between">
        <WorkspaceTitle
          activeTab={activeTab}
          collapsed={navCollapsed}
          onToggle={toggleNavigation}
        />
        <div className="min-w-0 sm:max-w-[58%] lg:max-w-[52%]">
          <p className="mb-1.5 font-mono text-[8px] font-semibold uppercase tracking-[0.18em] text-text-muted/60 sm:text-right">
            Live pulse
          </p>
          <PulseStrip
            stats={stats}
            financeStats={financeStats}
            servicesSummary={servicesSummary}
            onJumpTo={changeTab}
          />
        </div>
      </header>

      <MobileTabBar
        activeTab={activeTab}
        badges={badges}
        onSelect={changeTab}
      />

      <div className="flex min-h-0 min-w-0 flex-1 pt-3 lg:gap-4">
        <WorkspaceSidebar
          activeTab={activeTab}
          badges={badges}
          collapsed={navCollapsed}
          onSelect={changeTab}
        />

        <main
          ref={contentRef}
          className={`admin-workspace-content min-w-0 flex-1 ${activeTab === "chat" ? "overflow-hidden" : ""} lg:overflow-y-auto lg:overscroll-contain`}
        >
          <div
            key={activeTab}
            className={`admin-workspace-view ${activeTab === "users" ? "pb-24" : activeTab === "chat" ? "h-full px-0 pb-0 lg:pr-2" : "px-0 pb-24 lg:pr-2"}`}
          >
            {viewOnly && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-ink/[0.1] bg-ink/[0.03] px-3.5 py-2.5">
                <ShieldIcon
                  size={14}
                  className="mt-0.5 shrink-0 text-text-muted"
                  style={{ color: NEUTRAL }}
                />
                <div>
                  <p className="text-[12px] font-semibold text-text-primary/90">
                    View-only mode (
                    {currentUser?.role === "founder" ? "Founder" : "Co-Admin"})
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    You can browse all management tabs. Create, edit, delete,
                    grant, and send actions are blocked by the server.
                  </p>
                </div>
              </div>
            )}

            <RouteErrorBoundary>
              {activeTab === "users" && <UserManagementPage />}
              {activeTab === "conversion" && <ConversionTab />}
              {activeTab === "chat" && (
                <ChatTab
                  canWrite={!viewOnly}
                  onRefreshUnread={fetchChatUnread}
                />
              )}
              {activeTab === "followups" && (
                <FollowupTab onRefreshStats={fetchStats} />
              )}
              {activeTab === "marketing" && (
                <MarketingTab onRefreshStats={fetchStats} />
              )}
              {activeTab === "finance" && (
                <FinanceTab
                  key={tabQuery}
                  initialSearch={tabQuery}
                  onRefreshStats={fetchFinanceStats}
                />
              )}
              {activeTab === "growth" && <GrowthTab />}
              {activeTab === "todos" && <TodoTab onRefreshStats={fetchStats} />}
              {activeTab === "activity" && <ActivityTab />}
              {activeTab === "autotrade" && <AutoTradeOpsTab />}
              {activeTab === "apikeys" && <ApiKeysTab />}
              {activeTab === "announcements" && <AnnouncementsTab />}
              {activeTab === "socialposts" && <SocialPostsAdminPage />}
              {activeTab === "signalcards" && <SignalCardsAdminPage />}
              {activeTab === "resources" && <ResourcesTab />}
              {activeTab === "system" && <SystemTab />}
              {activeTab === "status" && <StatusTab />}
              {activeTab === "profitshare" && <ProfitSharingTab />}
              {activeTab === "aicost" && <AiCostTab />}
              {activeTab === "apihealth" && <ApiHealthTab />}
              {activeTab === "xtracker" && <XTrackerTab />}
            </RouteErrorBoundary>
          </div>
        </main>
      </div>

      <AwaitingReplyNudge
        onOpenChat={() => {
          changeTab("chat");
          fetchChatUnread();
        }}
      />
    </div>
  );
};

export default AdminWorkspacePage;
