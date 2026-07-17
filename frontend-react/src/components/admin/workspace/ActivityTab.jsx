// ════════════════════════════════════════════════════════════════════
// ActivityTab — Activity Monitoring & Growth dashboard
//
// Reads /api/v1/workspace/growth/* (Batch 2a) and renders:
// • Header (teal glow, matches Finance Hub style)
// • KPI grid: DAU / WAU / MAU / Stickiness / Active subs / Power users
// • Feature funnel (horizontal bars, subscriber vs free reach)
// • Hot Leads panel (engaged free users -> upgrade candidates)
// • At-Risk panel (dormant / expiring subscribers, with churn vs
// never-activated distinction)
//
// Read-only dashboard. Outreach is wired via window-level events the
// parent can listen to later; for now the contact chips are display-only.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { growthApi } from '../../../services/growthApi';
import { palette, tint, surface, motion, semantic } from '../designSystem';
import { StatTile, Surface, Avatar, EmptyState, Spinner, IconBadge } from '../primitives';
import {
 ActivityIcon,
 TrendingUpIcon,
 UsersIcon,
 FlameIcon,
 AlertTriangleIcon,
 ClockIcon,
 ZapIcon,
 RefreshIcon,
 TelegramIcon,
 DiscordIcon,
 EmailIcon,
 SparklesIcon,
} from '../Icons';

// ── Feature display labels (bucketed names -> human) ──
const FEATURE_LABELS = {
 signals: 'Signals',
 autotrade: 'AutoTrade',
 markets: 'Markets',
 market_pulse: 'Market Pulse',
 bitcoin: 'Bitcoin',
 ai_arena: 'AI Arena',
 tips: 'Tips',
 whale_alert: 'Whale Alert',
 onchain: 'On-chain',
 news: 'News',
 fx: 'FX',
 macro_calendar: 'Macro Calendar',
 watchlist: 'Watchlist',
 journal: 'Journal',
 referral: 'Referral',
 profile: 'Profile',
 analytics: 'Analytics',
};

const featureLabel = (f) => FEATURE_LABELS[f] || f;

// Deterministic accent per feature (cycles the semantic palette)
const FEATURE_ACCENTS = [
 palette.gold[300],
 palette.blue[400],
 palette.green[400],
 palette.purple[400],
 palette.orange[400],
 palette.teal[400],
 palette.amber[400],
];
const featureAccent = (feature) => {
 let h = 0;
 for (let i = 0; i < feature.length; i++) h = (h * 31 + feature.charCodeAt(i)) >>> 0;
 return FEATURE_ACCENTS[h % FEATURE_ACCENTS.length];
};

// ── time helpers ──
const relativeTime = (iso) => {
 if (!iso) return 'never';
 const then = new Date(iso).getTime();
 const diff = Date.now() - then;
 const m = Math.floor(diff / 60000);
 if (m < 1) return 'just now';
 if (m < 60) return `${m}m ago`;
 const h = Math.floor(m / 60);
 if (h < 24) return `${h}h ago`;
 const d = Math.floor(h / 24);
 if (d < 30) return `${d}d ago`;
 const mo = Math.floor(d / 30);
 return `${mo}mo ago`;
};

// ════════════════════════════════════════════════════════════════════
// Header — teal glow, sibling to FinanceHeader
// ════════════════════════════════════════════════════════════════════

const ActivityHeader = ({ onRefresh, refreshing, generatedAt }) => (
 <div className="flex flex-wrap items-start justify-between gap-3">
 <div className="flex min-w-0 items-start gap-3">
 <IconBadge Icon={ActivityIcon} color="rgb(var(--ink) / 0.45)" size={38} iconSize={18} />

 <div className="min-w-0">
 <p className="font-mono text-[9.5px] font-medium uppercase tracking-[0.16em] text-text-muted">
 Activity · Engagement & growth analytics
 </p>
 <h2 className="font-display text-lg font-semibold tracking-tight text-text-primary">
 Growth Dashboard
 </h2>
 <p className="mt-0.5 max-w-md text-[12px] text-text-muted">
 Engagement, retention signals, and outreach targets across the platform.
 </p>
 </div>
 </div>

 <div className="flex items-center gap-2">
 {generatedAt && (
 <span className="text-[10px] text-text-muted">
 updated {relativeTime(generatedAt)}
 </span>
 )}
 <button
 type="button"
 onClick={onRefresh}
 disabled={refreshing}
 className="flex items-center gap-1.5 rounded-lg border border-ink/[0.1] bg-ink/[0.04] px-3 py-2 text-[11px] font-semibold text-text-primary transition hover:bg-ink/[0.08] disabled:opacity-50"
 >
 {refreshing ? <Spinner size={12} /> : <RefreshIcon size={12} />}
 Refresh
 </button>
 </div>
 </div>
);

// ════════════════════════════════════════════════════════════════════
// Feature funnel — horizontal bars
// ════════════════════════════════════════════════════════════════════

const FeatureFunnel = ({ funnel, loading }) => {
 if (loading) {
 return (
 <Surface variant="premium" hover={false} padding="p-5">
 <div className="flex items-center justify-center py-10">
 <Spinner size={16} tone={palette.teal[400]} />
 </div>
 </Surface>
 );
 }

 const features = funnel?.features || [];
 const maxUsers = features.reduce((m, f) => Math.max(m, f.users_total), 0) || 1;

 return (
 <Surface variant="premium" hover={false} padding="p-5">
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-2">
 <TrendingUpIcon size={14} style={{ color: palette.teal[400] }} />
 <h3 className="text-sm font-semibold text-text-primary tracking-tight">
 Feature Reach
 </h3>
 <span className="text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>
 last {funnel?.days ?? 30}d
 </span>
 </div>
 <span className="text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>
 {funnel?.subscriber_base ?? 0} subs · {funnel?.free_base ?? 0} free
 </span>
 </div>

 {features.length === 0 ? (
 <p className="text-xs py-6 text-center" style={{ color: 'rgb(var(--fg-muted))' }}>
 No feature activity recorded yet in this window.
 </p>
 ) : (
 <div className="space-y-3">
 {features.map((f) => {
 const accent = featureAccent(f.feature);
 const widthPct = Math.max(3, (f.users_total / maxUsers) * 100);
 return (
 <div key={f.feature}>
 <div className="flex items-center justify-between mb-1">
 <span className="text-[12px] font-medium text-text-primary">
 {featureLabel(f.feature)}
 </span>
 <span className="text-[10px] tabular-nums" style={{ color: 'rgb(var(--fg-muted))' }}>
 {f.users_total} {f.users_total === 1 ? 'user' : 'users'} · {f.hits} hits
 </span>
 </div>
 <div
 className="relative h-6 rounded-md overflow-hidden"
 style={{ background: surface.sunken.bg }}
 >
 {/* subscriber portion */}
 <div
 className="absolute inset-y-0 left-0 flex items-center"
 style={{
 width: `${widthPct}%`,
 background: `linear-gradient(90deg, ${tint(accent, 0.35)}, ${tint(accent, 0.12)})`,
 borderRight: `2px solid ${accent}`,
 transition: motion.slow,
 }}
 />
 <div className="absolute inset-0 flex items-center justify-between px-2.5">
 <span
 className="text-[10px] font-semibold tabular-nums"
 style={{ color: accent }}
 >
 {f.pct_of_subscribers}% of subs
 </span>
 {f.users_free > 0 && (
 <span className="text-[10px] tabular-nums" style={{ color: 'rgb(var(--fg-muted))' }}>
 {f.users_free} free
 </span>
 )}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </Surface>
 );
};

// ════════════════════════════════════════════════════════════════════
// Contact chips (display only)
// ════════════════════════════════════════════════════════════════════

const ContactChips = ({ telegram, discord, email }) => {
 const chips = [];
 if (telegram) chips.push({ Icon: TelegramIcon, label: `@${telegram}`, color: palette.channels.telegram });
 else if (discord) chips.push({ Icon: DiscordIcon, label: discord, color: palette.channels.discord });
 if (email && !email.includes('@telegram.luxquant') && !email.includes('@discord.luxquant') && !email.includes('@manual.luxquant')) {
 chips.push({ Icon: EmailIcon, label: email, color: palette.channels.email });
 }
 if (chips.length === 0) {
 return (
 <span className="text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>
 no contact
 </span>
 );
 }
 return (
 <div className="flex items-center gap-1.5 flex-wrap">
 {chips.map((c, i) => (
 <span
 key={i}
 className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-medium truncate max-w-[160px]"
 style={{ background: tint(c.color, 0.1), color: c.color, border: `1px solid ${tint(c.color, 0.22)}` }}
 title={c.label}
 >
 <c.Icon size={9} />
 {c.label}
 </span>
 ))}
 </div>
 );
};

const TopFeatureTags = ({ features }) => {
 if (!features || features.length === 0) return null;
 return (
 <div className="flex items-center gap-1 flex-wrap mt-1">
 {features.map((f) => {
 const accent = featureAccent(f.feature);
 return (
 <span
 key={f.feature}
 className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium"
 style={{ background: tint(accent, 0.1), color: accent }}
 >
 {featureLabel(f.feature)} ·{f.count}
 </span>
 );
 })}
 </div>
 );
};

// ════════════════════════════════════════════════════════════════════
// Hot Leads panel
// ════════════════════════════════════════════════════════════════════

const ScoreBadge = ({ score }) => {
 const tone =
 score >= 60 ? palette.green[400] : score >= 30 ? palette.amber[400] : 'rgb(var(--fg-muted))';
 return (
 <div className="flex flex-col items-center shrink-0">
 <span className="text-base font-light tabular-nums leading-none" style={{ color: tone }}>
 {score}
 </span>
 <span className="text-[8px] uppercase tracking-wider" style={{ color: 'rgb(var(--fg-muted))' }}>
 score
 </span>
 </div>
 );
};

const HotLeadsPanel = ({ data, loading }) => {
 const items = data?.items || [];
 return (
 <Surface variant="premium" hover={false} padding="p-5" className="h-full">
 <div className="flex items-center gap-2 mb-1">
 <FlameIcon size={14} style={{ color: palette.orange[400] }} />
 <h3 className="text-sm font-semibold text-text-primary tracking-tight">Hot Leads</h3>
 </div>
 <p className="text-[11px] mb-4" style={{ color: 'rgb(var(--fg-muted))' }}>
 Engaged free users — prime upgrade targets.
 </p>

 {loading ? (
 <div className="flex items-center justify-center py-10">
 <Spinner size={16} tone={palette.orange[400]} />
 </div>
 ) : items.length === 0 ? (
 <EmptyState
 Icon={SparklesIcon}
 tone={palette.orange[400]}
 title="No hot leads yet"
 description="Free users who actively engage over several days will surface here as upgrade candidates."
 />
 ) : (
 <div className="space-y-2.5">
 {items.map((u) => (
 <div
 key={u.id}
 className="flex items-center gap-3 p-2.5 rounded-lg"
 style={{ background: surface.base.bg, border: `1px solid ${surface.base.border}` }}
 >
 <Avatar src={u.avatar_url} name={u.username} size="sm" tone={palette.orange[400]} />
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2">
 <span className="text-[12px] font-semibold text-text-primary truncate">
 @{u.username}
 </span>
 <span className="text-[9px]" style={{ color: 'rgb(var(--fg-muted))' }}>
 joined {u.joined_days_ago != null ? `${u.joined_days_ago}d ago` : '—'}
 </span>
 </div>
 <div className="text-[10px] mt-0.5" style={{ color: 'rgb(var(--fg-muted))' }}>
 {u.active_days_30d}d active · {u.events_30d} actions · seen {relativeTime(u.last_active_at)}
 </div>
 <TopFeatureTags features={u.top_features} />
 <div className="mt-1.5">
 <ContactChips telegram={u.telegram} discord={u.discord} email={u.email} />
 </div>
 </div>
 <ScoreBadge score={u.engagement_score} />
 </div>
 ))}
 </div>
 )}
 </Surface>
 );
};

// ════════════════════════════════════════════════════════════════════
// At-Risk panel
// ════════════════════════════════════════════════════════════════════

const RiskTag = ({ item }) => {
 // Never activated = has access but never touched the web app
 if (item.last_active_at == null) {
 return (
 <span
 className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider"
 style={{ background: tint(palette.warm[400], 0.1), color: 'rgb(var(--fg-secondary))', border: `1px solid ${tint(palette.warm[400], 0.2)}` }}
 >
 never logged in
 </span>
 );
 }
 // Expiring soon = churn-recoverable, highest urgency
 if (item.days_until_expiry != null && item.days_until_expiry <= 14) {
 return (
 <span
 className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider"
 style={{ background: tint(palette.red[400], 0.12), color: palette.red[400], border: `1px solid ${tint(palette.red[400], 0.28)}` }}
 >
 <span className="animate-pulse"><AlertTriangleIcon size={9} /></span>
 {item.days_until_expiry}d left
 </span>
 );
 }
 return (
 <span
 className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider"
 style={{ background: tint(palette.amber[400], 0.1), color: palette.amber[400], border: `1px solid ${tint(palette.amber[400], 0.24)}` }}
 >
 dormant {item.days_inactive != null ? `${item.days_inactive}d` : ''}
 </span>
 );
};

const AtRiskPanel = ({ data, loading }) => {
 const items = data?.items || [];
 return (
 <Surface variant="premium" hover={false} padding="p-5" className="h-full">
 <div className="flex items-center gap-2 mb-1">
 <AlertTriangleIcon size={14} style={{ color: palette.red[400] }} />
 <h3 className="text-sm font-semibold text-text-primary tracking-tight">At-Risk Subscribers</h3>
 </div>
 <p className="text-[11px] mb-4" style={{ color: 'rgb(var(--fg-muted))' }}>
 Active subscribers gone quiet — re-engage before they churn.
 </p>

 {loading ? (
 <div className="flex items-center justify-center py-10">
 <Spinner size={16} tone={palette.red[400]} />
 </div>
 ) : items.length === 0 ? (
 <EmptyState
 Icon={ZapIcon}
 tone={palette.green[400]}
 title="No one at risk"
 description="All active subscribers have been seen recently. Nice."
 />
 ) : (
 <div className="space-y-2.5">
 {items.map((u) => (
 <div
 key={u.id}
 className="flex items-center gap-3 p-2.5 rounded-lg"
 style={{ background: surface.base.bg, border: `1px solid ${surface.base.border}` }}
 >
 <Avatar src={u.avatar_url} name={u.username} size="sm" tone={palette.red[400]} />
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="text-[12px] font-semibold text-text-primary truncate">
 @{u.username}
 </span>
 <RiskTag item={u} />
 </div>
 <div className="text-[10px] mt-0.5" style={{ color: 'rgb(var(--fg-muted))' }}>
 {u.role}
 {u.last_active_at
 ? ` · last seen ${relativeTime(u.last_active_at)}`
 : ' · no web activity'}
 {u.subscription_expires_at && u.days_until_expiry != null
 ? ` · expires in ${u.days_until_expiry}d`
 : u.subscription_expires_at == null
 ? ' · lifetime'
 : ''}
 </div>
 <div className="mt-1.5">
 <ContactChips telegram={u.telegram} discord={u.discord} email={u.email} />
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </Surface>
 );
};

// ════════════════════════════════════════════════════════════════════
// Live Activity Feed — global stream (who touched which feature, when)
// ════════════════════════════════════════════════════════════════════

const FEED_FILTERS = [
 { value: null, label: 'All' },
 { value: 'signals', label: 'Signals' },
 { value: 'fx', label: 'FX' },
 { value: 'watchlist', label: 'Watchlist' },
 { value: 'markets', label: 'Markets' },
 { value: 'autotrade', label: 'AutoTrade' },
];

const LiveActivityFeed = ({ events, loading, feature, onFilter, lastHour }) => (
 <Surface variant="premium" hover={false} padding="p-5" className="h-full">
 <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
 <div className="flex items-center gap-2">
 <ActivityIcon size={14} style={{ color: palette.teal[400] }} />
 <h3 className="text-sm font-semibold text-text-primary tracking-tight">Live Activity</h3>
 {lastHour != null && (
 <span
 className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full"
 style={{ background: tint(palette.teal[400], 0.1), color: palette.teal[400] }}
 >
 <span className="w-1 h-1 rounded-full animate-pulse" style={{ background: palette.teal[400] }} />
 {lastHour} last hour
 </span>
 )}
 </div>
 <div className="flex items-center gap-1 flex-wrap">
 {FEED_FILTERS.map((f) => {
 const active = feature === f.value;
 return (
 <button
 key={f.label}
 onClick={() => onFilter(f.value)}
 className="text-[9.5px] px-2 py-0.5 rounded font-medium"
 style={{
 background: active ? tint(palette.gold[300], 0.12) : surface.base.bg,
 color: active ? palette.gold[300] : 'rgb(var(--fg-muted))',
 border: `1px solid ${active ? tint(palette.gold[300], 0.25) : 'transparent'}`,
 }}
 >
 {f.label}
 </button>
 );
 })}
 </div>
 </div>
 <p className="text-[11px] mb-3" style={{ color: 'rgb(var(--fg-muted))' }}>
 Feature touches across the platform, newest first (hourly granularity).
 </p>

 {loading ? (
 <div className="flex items-center justify-center py-10">
 <Spinner size={16} tone={palette.teal[400]} />
 </div>
 ) : !events || events.length === 0 ? (
 <EmptyState Icon={ActivityIcon} tone={palette.teal[400]} title="No activity yet" description="Feature touches will stream in here." />
 ) : (
 <div className="space-y-0.5 max-h-[420px] overflow-y-auto pr-1">
 {events.map((e) => {
 const accent = featureAccent(e.feature);
 return (
 <div key={e.id} className="flex items-center gap-2.5 py-1.5 px-1.5 rounded-md hover:bg-ink/[0.02]">
 <Avatar src={e.avatar_url} name={e.username} size="xs" tone={accent} />
 <div className="min-w-0 flex-1 text-[11.5px]">
 <span className="font-medium text-text-primary truncate">{e.username || `#${e.user_id}`}</span>
 <span style={{ color: 'rgb(var(--fg-muted))' }}> · </span>
 <span style={{ color: accent }}>{featureLabel(e.feature)}</span>
 </div>
 <span className="text-[9.5px] tabular-nums shrink-0" style={{ color: 'rgb(var(--fg-muted))' }}>
 {relativeTime(e.occurred_at)}
 </span>
 </div>
 );
 })}
 </div>
 )}
 </Surface>
);

// ════════════════════════════════════════════════════════════════════
// Most Active Users — sortable summary table
// ════════════════════════════════════════════════════════════════════

const USER_SORTS = [
 { value: 'last_seen', label: 'Last seen' },
 { value: 'event_count', label: 'Most events' },
 { value: 'feature', label: 'Feature' },
];
const USER_WINDOWS = [
 { value: '7d', label: '7d' },
 { value: '30d', label: '30d' },
 { value: 'all', label: 'All' },
];

const ActiveUsersTable = ({ users, loading, sortBy, window: win, onSort, onWindow }) => (
 <Surface variant="premium" hover={false} padding="p-5" className="h-full">
 <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
 <div className="flex items-center gap-2">
 <FlameIcon size={14} style={{ color: palette.orange[400] }} />
 <h3 className="text-sm font-semibold text-text-primary tracking-tight">Most Active Users</h3>
 </div>
 <div className="flex items-center gap-2 flex-wrap">
 <div className="flex items-center gap-1">
 {USER_WINDOWS.map((wv) => {
 const active = win === wv.value;
 return (
 <button key={wv.value} onClick={() => onWindow(wv.value)}
 className="text-[9.5px] px-1.5 py-0.5 rounded font-medium"
 style={{ background: active ? tint(palette.teal[400], 0.12) : surface.base.bg, color: active ? palette.teal[400] : 'rgb(var(--fg-muted))' }}>
 {wv.label}
 </button>
 );
 })}
 </div>
 <div className="flex items-center gap-1">
 {USER_SORTS.map((s) => {
 const active = sortBy === s.value;
 return (
 <button key={s.value} onClick={() => onSort(s.value)}
 className="text-[9.5px] px-2 py-0.5 rounded font-medium"
 style={{ background: active ? tint(palette.gold[300], 0.12) : surface.base.bg, color: active ? palette.gold[300] : 'rgb(var(--fg-muted))', border: `1px solid ${active ? tint(palette.gold[300], 0.25) : 'transparent'}` }}>
 {s.label}
 </button>
 );
 })}
 </div>
 </div>
 </div>
 <p className="text-[11px] mb-3" style={{ color: 'rgb(var(--fg-muted))' }}>
 Who is active, when they were last seen, and their latest feature.
 </p>

 {loading ? (
 <div className="flex items-center justify-center py-10">
 <Spinner size={16} tone={palette.orange[400]} />
 </div>
 ) : !users || users.length === 0 ? (
 <EmptyState Icon={UsersIcon} tone={palette.orange[400]} title="No active users" description="Activity in this window will appear here." />
 ) : (
 <div className="max-h-[420px] overflow-y-auto pr-1">
 <div className="grid grid-cols-[1.6fr_1fr_1fr_auto] gap-2 px-2 pb-1.5 text-[8.5px] uppercase tracking-wider sticky top-0"
 style={{ color: 'rgb(var(--fg-muted))', background: surface.raised.bg }}>
 <span>User</span><span>Last seen</span><span>Feature</span><span className="text-right">Events</span>
 </div>
 <div className="space-y-0.5">
 {users.map((u) => {
 const accent = featureAccent(u.last_feature || 'x');
 return (
 <div key={u.user_id} className="grid grid-cols-[1.6fr_1fr_1fr_auto] gap-2 items-center px-2 py-1.5 rounded-md hover:bg-ink/[0.02]">
 <div className="flex items-center gap-2 min-w-0">
 <Avatar src={u.avatar_url} name={u.username} size="xs" tone={accent} />
 <span className="text-[11.5px] font-medium text-text-primary truncate">{u.username || `#${u.user_id}`}</span>
 </div>
 <span className="text-[10.5px] tabular-nums" style={{ color: 'rgb(var(--fg-secondary))' }}>{relativeTime(u.last_seen)}</span>
 <span className="text-[10.5px] truncate" style={{ color: accent }}>{u.last_feature ? featureLabel(u.last_feature) : '—'}</span>
 <span className="text-[11px] tabular-nums text-right text-text-primary">{u.event_count}</span>
 </div>
 );
 })}
 </div>
 </div>
 )}
 </Surface>
);

// ════════════════════════════════════════════════════════════════════
// Main
// ════════════════════════════════════════════════════════════════════

export const ActivityTab = () => {
 const [overview, setOverview] = useState(null);
 const [funnel, setFunnel] = useState(null);
 const [hotLeads, setHotLeads] = useState(null);
 const [atRisk, setAtRisk] = useState(null);
 const [feed, setFeed] = useState(null);
 const [feedFeature, setFeedFeature] = useState(null);
 const [activeUsers, setActiveUsers] = useState(null);
 const [auSort, setAuSort] = useState('last_seen');
 const [auWindow, setAuWindow] = useState('30d');

 const [loading, setLoading] = useState(true);
 const [refreshing, setRefreshing] = useState(false);
 const [error, setError] = useState(null);

 const fetchAll = useCallback(async (isRefresh = false) => {
 if (isRefresh) setRefreshing(true);
 else setLoading(true);
 setError(null);
 try {
 const [ov, fn, hl, ar, fd, au] = await Promise.all([
 growthApi.getOverview(),
 growthApi.getFeatureFunnel(30),
 growthApi.getHotLeads({ minActiveDays: 3, limit: 25 }),
 growthApi.getAtRisk({ dormantDays: 14, limit: 25 }),
 growthApi.getActivityFeed({ feature: feedFeature, limit: 40 }),
 growthApi.getActiveUsers({ sortBy: auSort, window: auWindow, limit: 30 }),
 ]);
 setOverview(ov);
 setFunnel(fn);
 setHotLeads(hl);
 setAtRisk(ar);
 setFeed(fd);
 setActiveUsers(au);
 } catch (e) {
 console.error('Failed to load growth data:', e);
 setError('Failed to load growth analytics. Try refreshing.');
 } finally {
 setLoading(false);
 setRefreshing(false);
 }
 }, [feedFeature, auSort, auWindow]);

 useEffect(() => {
 fetchAll(false);
 }, [fetchAll]);

 // Auto-refresh every 30s (live feel)
 useEffect(() => {
 const t = setInterval(() => fetchAll(true), 30000);
 return () => clearInterval(t);
 }, [fetchAll]);

 return (
 <div className="space-y-5">
 <ActivityHeader
 onRefresh={() => fetchAll(true)}
 refreshing={refreshing}
 generatedAt={overview?.generated_at}
 />

 {error && (
 <Surface tone={palette.red[400]} padding="p-3">
 <p className="text-xs" style={{ color: palette.red[400] }}>{error}</p>
 </Surface>
 )}

 {/* KPI grid */}
 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
 <StatTile
 label="DAU"
 value={overview?.dau ?? '—'}
 sub="active today"
 accent="teal"
 Icon={ActivityIcon}
 loading={loading}
 />
 <StatTile
 label="WAU"
 value={overview?.wau ?? '—'}
 sub="last 7 days"
 accent="blue"
 Icon={UsersIcon}
 loading={loading}
 />
 <StatTile
 label="MAU"
 value={overview?.mau ?? '—'}
 sub="last 30 days"
 accent="purple"
 Icon={UsersIcon}
 loading={loading}
 />
 <StatTile
 label="Stickiness"
 value={overview ? `${overview.stickiness_pct}%` : '—'}
 sub="DAU / MAU"
 accent="gold"
 Icon={TrendingUpIcon}
 loading={loading}
 />
 <StatTile
 label="Active subs"
 value={overview?.active_subscribers ?? '—'}
 sub={overview ? `${overview.dormant_subscribers} dormant` : ''}
 accent="green"
 Icon={UsersIcon}
 loading={loading}
 />
 <StatTile
 label="Power users"
 value={overview?.power_users ?? '—'}
 sub="5+ active days/wk"
 accent="orange"
 Icon={FlameIcon}
 loading={loading}
 />
 </div>

 {/* Signups strip */}
 {overview && (
 <Surface variant="base" padding="p-3.5">
 <div className="flex items-center gap-6 flex-wrap text-[11px]" style={{ color: 'rgb(var(--fg-secondary))' }}>
 <span className="inline-flex items-center gap-1.5">
 <ClockIcon size={11} style={{ color: palette.teal[400] }} />
 Signups:
 </span>
 <span><strong className="text-text-primary tabular-nums">{overview.signups_today}</strong> today</span>
 <span><strong className="text-text-primary tabular-nums">{overview.signups_7d}</strong> this week</span>
 <span><strong className="text-text-primary tabular-nums">{overview.signups_30d}</strong> this month</span>
 <span className="ml-auto" style={{ color: 'rgb(var(--fg-muted))' }}>
 <strong className="tabular-nums" style={{ color: 'rgb(var(--fg-secondary))' }}>{overview.total_users}</strong> total users
 </span>
 </div>
 </Surface>
 )}

 {/* Live activity + most active users */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
 <LiveActivityFeed
 events={feed?.events}
 loading={loading}
 feature={feedFeature}
 onFilter={setFeedFeature}
 lastHour={overview?.dau != null ? feed?.count : null}
 />
 <ActiveUsersTable
 users={activeUsers?.users}
 loading={loading}
 sortBy={auSort}
 window={auWindow}
 onSort={setAuSort}
 onWindow={setAuWindow}
 />
 </div>

 {/* Feature funnel */}
 <FeatureFunnel funnel={funnel} loading={loading} />

 {/* Hot leads + At-risk side by side */}
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
 <HotLeadsPanel data={hotLeads} loading={loading} />
 <AtRiskPanel data={atRisk} loading={loading} />
 </div>
 </div>
 );
};

export default ActivityTab;
