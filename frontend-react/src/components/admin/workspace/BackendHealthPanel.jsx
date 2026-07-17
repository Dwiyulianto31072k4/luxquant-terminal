// src/components/admin/workspace/BackendHealthPanel.jsx
//
// LuxQuant — Management System › System tab › Backend Health.
// Observability for the API backend, surfaced from journald + Postgres + Redis:
// • WORKER TIMEOUT bursts (1h / 24h + hourly sparkline)
// • SLOW requests (top endpoints)
// • DB connection pressure (pg_stat_activity)
// • Redis memory
// Data: workspaceApi.getBackendHealth() → /api/v1/workspace/backend-health
// (cached 60s server-side; journald parse is subprocess-heavy).

import { useState, useEffect, useCallback, useRef } from 'react';
import { workspaceApi } from '../../../services/workspaceApi';
import { palette, tint, motion } from '../designSystem';
import {
 AlertTriangleIcon, ClockIcon, ServerIcon, ZapIcon,
 RefreshIcon, LoaderIcon, CheckCircleIcon, XCircleIcon,
} from '../Icons';

const REFRESH_MS = 60000; // matches server-side cache TTL

// ── formatters ──
const fmtAgo = (iso) => {
 if (!iso) return null;
 const diff = (Date.now() - new Date(iso).getTime()) / 1000;
 if (diff < 60) return `${Math.floor(diff)}s ago`;
 if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
 if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
 return `${Math.floor(diff / 86400)}d ago`;
};
const fmtUptime = (secs) => {
 if (secs == null) return null;
 const d = Math.floor(secs / 86400);
 const h = Math.floor((secs % 86400) / 3600);
 const m = Math.floor((secs % 3600) / 60);
 if (d > 0) return `${d}d ${h}h`;
 if (h > 0) return `${h}h ${m}m`;
 return `${m}m`;
};
// pct → traffic-light colour
const gauge = (pct) =>
 pct >= 85 ? palette.red[400] : pct >= 70 ? palette.amber[400] : palette.green[400];

// ── building blocks ──
const Tile = ({ color, Icon, label, children }) => (
 <div
 className="rounded-xl p-3 flex-1 min-w-[150px]"
 style={{ background: 'rgb(var(--surface-raised))', border: `1px solid ${tint(color, 0.16)}`, boxShadow: '0 4px 14px rgb(var(--scrim) / 0.3)' }}
 >
 <div className="flex items-center gap-1.5 mb-1.5">
 <Icon size={12} style={{ color }} />
 <span className="text-[9px] uppercase tracking-[0.14em] font-semibold" style={{ color: tint(color, 0.85) }}>
 {label}
 </span>
 </div>
 {children}
 </div>
);

const Bar = ({ pct, color }) => (
 <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: 'rgb(var(--ink) / 0.06)' }}>
 <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color, transition: motion.base }} />
 </div>
);

// 24-bucket hourly sparkline for WORKER TIMEOUT
const Sparkline = ({ hourly, color }) => {
 const max = Math.max(1, ...hourly);
 return (
 <div className="flex items-end gap-[2px] h-8 mt-1.5">
 {hourly.map((v, i) => (
 <div
 key={i}
 title={`${v} timeout${v === 1 ? '' : 's'} · ${23 - i}h ago`}
 className="flex-1 rounded-[1px]"
 style={{
 height: `${Math.max(6, (v / max) * 100)}%`,
 background: v > 0 ? color : 'rgb(var(--ink) / 0.05)',
 }}
 />
 ))}
 </div>
 );
};

export const BackendHealthPanel = () => {
 const [d, setD] = useState(null);
 const [err, setErr] = useState(null);
 const [loading, setLoading] = useState(true);
 const [open, setOpen] = useState(false); // details expander
 const timer = useRef(null);

 const load = useCallback(async (silent = false) => {
 if (!silent) setLoading(true);
 try {
 const res = await workspaceApi.getBackendHealth();
 setD(res);
 setErr(null);
 } catch (e) {
 setErr(e?.response?.data?.detail || e.message || 'Failed to load backend health');
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 load();
 timer.current = setInterval(() => load(true), REFRESH_MS);
 return () => clearInterval(timer.current);
 }, [load]);

 if (loading && !d) {
 return (
 <div className="rounded-xl p-4 mb-4 flex items-center gap-2" style={{ background: 'rgb(var(--ink) / 0.02)', border: `1px solid ${tint(palette.warm[100], 0.1)}`, color: 'rgb(var(--fg-muted))' }}>
 <LoaderIcon size={14} className="animate-spin" />
 <span className="text-[12px]">Reading backend telemetry…</span>
 </div>
 );
 }
 if (err && !d) {
 return (
 <div className="rounded-xl p-3 mb-4 text-[12px]" style={{ background: tint(palette.red[400], 0.08), border: `1px solid ${tint(palette.red[400], 0.25)}`, color: palette.red[300] }}>
 {err}
 </div>
 );
 }
 if (!d) return null;

 const to = d.worker_timeout || {};
 const slow = d.slow || {};
 const db = d.db || {};
 const redis = d.redis || {};
 const toColor = (to.count_1h > 0) ? palette.red[400] : (to.count_24h > 0 ? palette.amber[400] : palette.green[400]);
 const dbColor = db.error ? palette.red[400] : gauge(db.pct || 0);
 const redisColor = redis.ok === false ? palette.red[400] : gauge(redis.pct || 0);
 const uptime = fmtUptime(d.uptime_seconds);

 return (
 <div className="mb-4">
 {/* header */}
 <div className="flex items-center justify-between gap-3 mb-2.5 flex-wrap">
 <div className="flex items-center gap-2">
 <ServerIcon size={13} style={{ color: palette.gold[300] }} />
 <span className="text-[11px] uppercase tracking-[0.16em] font-semibold" style={{ color: palette.gold[300] }}>
 Backend Health
 </span>
 <span className="text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>· last 24h</span>
 </div>
 <div className="flex items-center gap-2.5">
 {uptime && (
 <span className="text-[10px] px-2 py-0.5 rounded tabular-nums" style={{ background: tint(palette.green[400], 0.1), color: palette.green[400], border: `1px solid ${tint(palette.green[400], 0.2)}` }}>
 up {uptime}
 </span>
 )}
 <button
 onClick={() => load()}
 className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold"
 style={{ background: tint(palette.gold[300], 0.1), border: `1px solid ${tint(palette.gold[300], 0.25)}`, color: palette.gold[300] }}
 >
 <RefreshIcon size={11} className={loading ? 'animate-spin' : ''} />
 Refresh
 </button>
 </div>
 </div>

 {/* tiles */}
 <div className="flex gap-2.5 flex-wrap">
 {/* WORKER TIMEOUT */}
 <Tile color={toColor} Icon={AlertTriangleIcon} label="Worker Timeout">
 <div className="flex items-baseline gap-1.5">
 <span className="text-[22px] font-bold tabular-nums" style={{ color: toColor }}>{to.count_24h ?? 0}</span>
 <span className="text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>/ 24h</span>
 </div>
 <div className="flex items-center gap-2 text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>
 <span>1h: <b style={{ color: to.count_1h > 0 ? palette.red[400] : 'rgb(var(--fg-secondary))' }}>{to.count_1h ?? 0}</b></span>
 {to.last && <span>· last {fmtAgo(to.last)}</span>}
 </div>
 {Array.isArray(to.hourly) && <Sparkline hourly={to.hourly} color={toColor} />}
 </Tile>

 {/* SLOW */}
 <Tile color={palette.amber[400]} Icon={ClockIcon} label="Slow Requests">
 <div className="flex items-baseline gap-1.5">
 <span className="text-[22px] font-bold tabular-nums" style={{ color: palette.amber[400] }}>{slow.count_24h ?? 0}</span>
 <span className="text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>/ 24h</span>
 </div>
 {slow.top && slow.top[0] ? (
 <p className="text-[10px] mt-1 truncate" style={{ color: 'rgb(var(--fg-muted))' }}>
 worst: <span style={{ color: 'rgb(var(--fg-secondary))' }}>{slow.top[0].path}</span> ({slow.top[0].max_s}s)
 </p>
 ) : (
 <p className="text-[10px] mt-1" style={{ color: palette.green[400] }}>none</p>
 )}
 </Tile>

 {/* DB CONNECTIONS */}
 <Tile color={dbColor} Icon={ServerIcon} label="DB Connections">
 {db.error ? (
 <p className="text-[11px]" style={{ color: palette.red[300] }}>{db.error}</p>
 ) : (
 <>
 <div className="flex items-baseline gap-1.5">
 <span className="text-[22px] font-bold tabular-nums" style={{ color: dbColor }}>{db.used ?? '–'}</span>
 <span className="text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>/ {db.max ?? '?'} ({db.pct ?? 0}%)</span>
 </div>
 <Bar pct={db.pct || 0} color={dbColor} />
 <div className="text-[10px] mt-1" style={{ color: 'rgb(var(--fg-muted))' }}>
 active {db.active ?? 0} · idle {db.idle ?? 0}
 {db.idle_in_tx > 0 && <span style={{ color: palette.amber[400] }}> · idle-tx {db.idle_in_tx}</span>}
 </div>
 </>
 )}
 </Tile>

 {/* REDIS */}
 <Tile color={redisColor} Icon={ZapIcon} label="Redis Memory">
 {redis.ok === false ? (
 <p className="text-[11px]" style={{ color: palette.red[300] }}>down</p>
 ) : (
 <>
 <div className="flex items-baseline gap-1.5">
 <span className="text-[22px] font-bold tabular-nums" style={{ color: redisColor }}>{redis.used_mb ?? '–'}</span>
 <span className="text-[10px]" style={{ color: 'rgb(var(--fg-muted))' }}>
 MB{redis.max_mb ? ` / ${redis.max_mb} (${redis.pct}%)` : ''}
 </span>
 </div>
 {redis.max_mb ? <Bar pct={redis.pct || 0} color={redisColor} /> : null}
 {redis.policy && <div className="text-[10px] mt-1" style={{ color: 'rgb(var(--fg-muted))' }}>{redis.policy}</div>}
 </>
 )}
 </Tile>
 </div>

 {/* details expander: top slow endpoints + recent errors */}
 {((slow.top && slow.top.length) || (d.errors && d.errors.count_24h > 0)) && (
 <div className="mt-2">
 <button
 onClick={() => setOpen((o) => !o)}
 className="text-[10px] font-semibold"
 style={{ color: 'rgb(var(--fg-muted))' }}
 >
 {open ? '▾ hide details' : '▸ show details'}
 {d.errors?.count_24h > 0 && (
 <span className="ml-1.5" style={{ color: palette.red[400] }}>· {d.errors.count_24h} error{d.errors.count_24h === 1 ? '' : 's'}/24h</span>
 )}
 </button>

 {open && (
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mt-2">
 {/* top slow */}
 <div className="rounded-xl p-3" style={{ background: 'rgb(var(--surface-raised))', border: `1px solid ${tint(palette.amber[400], 0.14)}` }}>
 <div className="flex items-center gap-1.5 mb-2">
 <ClockIcon size={11} style={{ color: palette.amber[400] }} />
 <span className="text-[9px] uppercase tracking-[0.14em] font-semibold" style={{ color: tint(palette.amber[400], 0.85) }}>Top slow endpoints</span>
 </div>
 {slow.top && slow.top.length ? (
 <div className="space-y-1">
 {slow.top.map((s, i) => (
 <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
 <span className="truncate" style={{ color: 'rgb(var(--fg-secondary))' }}>
 <span style={{ color: 'rgb(var(--fg-muted))' }}>{s.method}</span> {s.path}
 </span>
 <span className="tabular-nums shrink-0" style={{ color: 'rgb(var(--fg-muted))' }}>
 {s.count}× · <b style={{ color: palette.amber[400] }}>{s.max_s}s</b>
 </span>
 </div>
 ))}
 </div>
 ) : (
 <p className="text-[11px]" style={{ color: palette.green[400] }}>No slow requests in the last 24h.</p>
 )}
 </div>

 {/* recent errors */}
 <div className="rounded-xl p-3" style={{ background: 'rgb(var(--surface-raised))', border: `1px solid ${tint(palette.red[400], 0.14)}` }}>
 <div className="flex items-center gap-1.5 mb-2">
 {d.errors?.count_24h > 0
 ? <XCircleIcon size={11} style={{ color: palette.red[400] }} />
 : <CheckCircleIcon size={11} style={{ color: palette.green[400] }} />}
 <span className="text-[9px] uppercase tracking-[0.14em] font-semibold" style={{ color: tint(palette.red[400], 0.85) }}>Recent errors</span>
 </div>
 {d.errors?.recent?.length ? (
 <div className="space-y-1.5">
 {d.errors.recent.map((e, i) => (
 <div key={i} className="text-[10px] leading-snug">
 <span className="tabular-nums" style={{ color: 'rgb(var(--fg-muted))' }}>{fmtAgo(e.ts)}</span>
 <span className="ml-1.5" style={{ color: 'rgb(var(--fg-secondary))' }}>{e.msg}</span>
 </div>
 ))}
 </div>
 ) : (
 <p className="text-[11px]" style={{ color: palette.green[400] }}>No errors in the last 24h. ✓</p>
 )}
 </div>
 </div>
 )}
 </div>
 )}
 </div>
 );
};

export default BackendHealthPanel;
