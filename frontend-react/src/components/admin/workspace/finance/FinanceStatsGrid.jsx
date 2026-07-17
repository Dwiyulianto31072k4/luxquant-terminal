// ════════════════════════════════════════════════════════════════════
// Finance Stats Grid
// 4 primary KPI tiles (click-to-filter) + secondary info strip.
// Falls back to inline styles if StatTile primitive isn't available.
// ════════════════════════════════════════════════════════════════════

import {
 TrendingUpIcon,
 ClockIcon,
 AlertTriangleIcon,
} from '../../Icons';
import { XCircleIcon } from './icons-supplement';
import { formatUSDT, formatUSDTCompact } from './helpers';

/* ── Self-contained KPI tile ──────────────────────────────────────── */

const KpiTile = ({
 label,
 value,
 sub,
 accent = 'rgb(var(--accent))',
 Icon,
 active,
 onClick,
 loading,
 alert,
}) => {
 const isClickable = !!onClick;
 return (
 <button
 onClick={onClick}
 disabled={!isClickable || loading}
 className={`relative overflow-hidden text-left rounded-xl px-3.5 py-3 transition-all ${
 isClickable && !loading ? 'cursor-pointer' : 'cursor-default'
 }`}
 style={{
 background: 'rgb(var(--surface-raised))',
 border: `1px solid ${active ? `${accent}80` : 'rgb(var(--ink) / 0.07)'}`,
 }}
 onMouseEnter={(e) => { if (isClickable && !active) e.currentTarget.style.borderColor = 'rgb(var(--accent) / 0.25)'; }}
 onMouseLeave={(e) => { if (isClickable && !active) e.currentTarget.style.borderColor = 'rgb(var(--ink) / 0.07)'; }}
 >
 {/* Top hairline (subtle gold) */}
 <div
 className="absolute inset-x-0 top-0 h-px pointer-events-none"
 style={{
 background: `linear-gradient(to right, transparent, rgb(var(--accent) / ${active ? 0.4 : 0.2}), transparent)`,
 }}
 />

 <div className="relative flex items-center justify-between mb-1.5">
 <span
 className="text-[10px] uppercase tracking-wider font-semibold"
 style={{ color: 'rgb(var(--ink) / 0.42)' }}
 >
 {label}
 </span>
 {Icon && (
 <span
 className={`flex items-center justify-center rounded-md ${alert ? 'animate-pulse' : ''}`}
 style={{
 width: 22,
 height: 22,
 background: `${accent}14`,
 color: accent,
 }}
 >
 <Icon size={12} />
 </span>
 )}
 </div>

 <p
 className="relative text-2xl font-bold tracking-tight tabular-nums leading-none"
 style={{ color: loading ? '#4a3f39' : alert ? accent : '#fff' }}
 >
 {loading ? '—' : value ?? '—'}
 </p>

 {sub && (
 <p
 className="relative text-[10px] mt-1 tabular-nums truncate"
 style={{ color: 'rgb(var(--ink) / 0.42)' }}
 >
 {sub}
 </p>
 )}
 </button>
 );
};

/* ── Main grid ────────────────────────────────────────────────────── */

export const FinanceStatsGrid = ({
 stats,
 statusFilter,
 onFilterToggle,
 loading,
}) => {
 return (
 <div className="space-y-3">
 {/* Primary KPIs */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
 <KpiTile
 label="Total Revenue"
 value={stats ? formatUSDT(stats.total_revenue) : '—'}
 sub={
 stats?.revenue_this_month != null
 ? `+${formatUSDTCompact(stats.revenue_this_month)} this month`
 : null
 }
 accent="#34d399"
 Icon={TrendingUpIcon}
 loading={loading && !stats}
 />
 <KpiTile
 label="Pending Value"
 value={stats ? formatUSDT(stats.pending_value) : '—'}
 sub={
 stats?.pending_count != null
 ? `${stats.pending_count} payment${stats.pending_count === 1 ? '' : 's'}`
 : null
 }
 accent="#fbbf24"
 Icon={ClockIcon}
 active={statusFilter === 'pending'}
 onClick={() => onFilterToggle('pending')}
 loading={loading && !stats}
 />
 <KpiTile
 label="Stale > 24h"
 value={stats?.stale_count ?? '—'}
 sub={
 stats?.stale_value > 0
 ? `${formatUSDTCompact(stats.stale_value)} locked`
 : 'All clear'
 }
 accent="#f87171"
 Icon={AlertTriangleIcon}
 active={statusFilter === 'stale'}
 onClick={() => onFilterToggle('stale')}
 loading={loading && !stats}
 alert={(stats?.stale_count ?? 0) > 0}
 />
 <KpiTile
 label="Failed"
 value={stats?.failed_count ?? '—'}
 sub={
 stats?.failed_value > 0
 ? formatUSDTCompact(stats.failed_value)
 : 'No failures'
 }
 accent="#8a8a93"
 Icon={XCircleIcon}
 active={statusFilter === 'failed'}
 onClick={() => onFilterToggle('failed')}
 loading={loading && !stats}
 />
 </div>

 {/* Secondary info strip */}
 {stats && (
 <div
 className="px-3.5 py-2.5 rounded-lg"
 style={{
 background: 'rgb(var(--ink) / 0.18)',
 border: '1px solid rgb(var(--ink) / 0.04)',
 }}
 >
 <div className="flex items-center gap-x-5 gap-y-2 flex-wrap text-[10.5px]">
 <InfoStat
 label="Today"
 value={formatUSDT(stats.revenue_today ?? 0)}
 accent="#34d399"
 />
 <Divider />
 <InfoStat
 label="Total Payments"
 value={(stats.total_count ?? 0).toLocaleString()}
 />
 <Divider />
 <InfoStat
 label="Cancelled"
 value={(stats.cancelled_count ?? 0).toLocaleString()}
 accent="#8a7a6e"
 />
 {(stats.expired_count ?? 0) > 0 && (
 <>
 <Divider />
 <InfoStat
 label="Expired"
 value={stats.expired_count.toLocaleString()}
 accent="#8a8a93"
 />
 </>
 )}
 {(stats.total_credit_redeemed ?? 0) > 0 && (
 <>
 <Divider />
 <InfoStat
 label="Credit Redeemed"
 value={formatUSDT(stats.total_credit_redeemed)}
 accent="rgb(var(--accent))"
 />
 </>
 )}
 </div>
 </div>
 )}
 </div>
 );
};

const InfoStat = ({ label, value, accent }) => (
 <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
 <span
 className="uppercase tracking-wider font-semibold"
 style={{ color: 'rgb(var(--ink) / 0.4)', fontSize: '9.5px' }}
 >
 {label}
 </span>
 <span
 className="tabular-nums font-semibold"
 style={{ color: accent || '#c9b59e' }}
 >
 {value}
 </span>
 </span>
);

const Divider = () => (
 <span
 aria-hidden
 className="h-3 w-px"
 style={{ background: 'rgb(var(--ink) / 0.08)' }}
 />
);
