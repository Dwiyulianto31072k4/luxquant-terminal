// src/components/admin/workspace/SystemTab.jsx
//
// LuxQuant — Management System › System tab.
// Live health of every LuxQuant systemd unit (services + timers) + core
// infra (postgres / redis / nginx) running on the VPS. Read the state,
// see error tails for anything unhealthy, and start/stop/restart a unit
// without SSHing into the box.
//
// Data: workspaceApi.getServices() / controlService(unit, action)
//       Backend: /api/v1/workspace/services (admin-only)

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { workspaceApi } from '../../../services/workspaceApi';
import { palette, tint, motion } from '../designSystem';
import {
  ServerIcon, CheckCircleIcon, AlertTriangleIcon, XCircleIcon,
  RefreshIcon, LoaderIcon, BanIcon, ZapIcon, ClockIcon,
} from '../Icons';
import SystemMap from './SystemMap';
import BackendHealthPanel from './BackendHealthPanel';

const CARDS_PER_PAGE = 12;
const HEALTH_ORDER = { down: 0, warn: 1, unknown: 2, ok: 3, idle: 4 };

// ════════════════════════════════════════════════════════════════════
// Status vocabulary
// ════════════════════════════════════════════════════════════════════

const HEALTH = {
  ok:      { label: 'Running',  color: palette.green[400],  Icon: CheckCircleIcon },
  warn:    { label: 'Busy',     color: palette.amber[400],  Icon: LoaderIcon },
  down:    { label: 'Failed',   color: palette.red[400],    Icon: XCircleIcon },
  idle:    { label: 'Idle',     color: palette.warm[400],   Icon: ClockIcon },
  unknown: { label: 'Unknown',  color: palette.orange[400], Icon: AlertTriangleIcon },
};

const REFRESH_MS = 30000;

// ════════════════════════════════════════════════════════════════════
// Formatters
// ════════════════════════════════════════════════════════════════════

const fmtUptime = (secs) => {
  if (secs == null) return null;
  const s = Math.floor(secs);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
};

const fmtBytes = (n) => {
  if (n == null) return null;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
};

// ════════════════════════════════════════════════════════════════════
// Small building blocks
// ════════════════════════════════════════════════════════════════════

const SummaryChip = ({ label, value, color }) => (
  <div
    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md"
    style={{ background: tint(color, 0.06), border: `1px solid ${tint(color, 0.18)}` }}
  >
    <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: color }} />
    <span className="text-[10px] font-medium" style={{ color: tint(color, 0.85) }}>{label}</span>
    <span className="text-[12px] font-bold tabular-nums" style={{ color }}>{value}</span>
  </div>
);

const MetaPill = ({ children, color = palette.warm[300] }) => (
  <span
    className="text-[10px] px-1.5 py-0.5 rounded tabular-nums"
    style={{ background: tint(color, 0.08), color: tint(color, 0.95), border: `1px solid ${tint(color, 0.15)}` }}
  >
    {children}
  </span>
);

const ActionButton = ({ label, color, Icon, onClick, busy, disabled }) => (
  <button
    onClick={onClick}
    disabled={busy || disabled}
    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold disabled:opacity-40"
    style={{ background: tint(color, 0.1), border: `1px solid ${tint(color, 0.28)}`, color, transition: motion.base }}
    onMouseEnter={(e) => { if (!busy && !disabled) e.currentTarget.style.background = tint(color, 0.18); }}
    onMouseLeave={(e) => { e.currentTarget.style.background = tint(color, 0.1); }}
  >
    {busy ? <LoaderIcon size={11} className="animate-spin" /> : <Icon size={11} />}
    {label}
  </button>
);

// ════════════════════════════════════════════════════════════════════
// Service card
// ════════════════════════════════════════════════════════════════════

const ServiceCard = ({ svc, onAction, busyAction }) => {
  const meta = HEALTH[svc.health] || HEALTH.unknown;
  const isTimer = svc.kind === 'timer';
  const isActive = svc.active_state === 'active';
  const uptime = fmtUptime(svc.uptime_seconds);
  const mem = fmtBytes(svc.memory_bytes);

  return (
    <div
      className="rounded-xl p-3.5 relative overflow-hidden"
      style={{ background: '#0a0805', border: `1px solid ${tint(meta.color, svc.health === 'down' ? 0.4 : 0.14)}`, boxShadow: '0 6px 20px rgba(0,0,0,0.35)' }}
    >
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(to right, transparent, ${tint(meta.color, svc.health === 'down' ? 0.5 : 0.28)}, transparent)` }} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-2.5">
          <span className="relative inline-flex mt-0.5 shrink-0">
            {svc.health === 'down' && <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: meta.color }} />}
            <span className="relative inline-block w-2 h-2 rounded-full" style={{ background: meta.color }} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-white truncate">{svc.name}</span>
              {isTimer && <span className="text-[9px] uppercase tracking-wider px-1 rounded" style={{ background: tint(palette.blue[400], 0.12), color: palette.blue[400] }}>timer</span>}
            </div>
            <p className="text-[11px] mt-0.5 truncate" style={{ color: palette.warm[400] }}>
              {svc.description || svc.unit}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <meta.Icon size={13} style={{ color: meta.color }} />
          <span className="text-[11px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
        </div>
      </div>

      {/* metrics */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2.5 pl-[18px]">
        <MetaPill color={meta.color}>{svc.active_state}{svc.sub_state ? ` · ${svc.sub_state}` : ''}</MetaPill>
        {uptime && <MetaPill color={palette.green[400]}>up {uptime}</MetaPill>}
        {svc.restarts > 0 && <MetaPill color={palette.orange[400]}>{svc.restarts} restart{svc.restarts > 1 ? 's' : ''}</MetaPill>}
        {mem && <MetaPill>{mem}</MetaPill>}
        {svc.main_pid && <MetaPill>pid {svc.main_pid}</MetaPill>}
        {svc.unit_file_state && <MetaPill color={svc.unit_file_state === 'enabled' ? palette.green[400] : palette.warm[400]}>{svc.unit_file_state}</MetaPill>}
      </div>

      {/* error tail */}
      {Array.isArray(svc.log_tail) && svc.log_tail.length > 0 && (
        <pre
          className="mt-2.5 ml-[18px] p-2 rounded text-[10px] leading-relaxed overflow-x-auto whitespace-pre-wrap"
          style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${tint(palette.red[400], 0.2)}`, color: palette.warm[200], maxHeight: 140 }}
        >
          {svc.log_tail.join('\n')}
        </pre>
      )}

      {/* controls */}
      <div className="flex items-center gap-2 mt-3 pl-[18px]">
        <ActionButton
          label="Restart" color={palette.gold[300]} Icon={RefreshIcon}
          busy={busyAction === 'restart'} onClick={() => onAction(svc, 'restart')}
        />
        {isActive ? (
          <ActionButton
            label="Stop" color={palette.red[400]} Icon={BanIcon}
            busy={busyAction === 'stop'} onClick={() => onAction(svc, 'stop')}
          />
        ) : (
          <ActionButton
            label={isTimer ? 'Trigger' : 'Start'} color={palette.green[400]} Icon={ZapIcon}
            busy={busyAction === 'start'} onClick={() => onAction(svc, 'start')}
          />
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// Main tab
// ════════════════════════════════════════════════════════════════════

export const SystemTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState({}); // { [unit]: action }
  const [lastUpdated, setLastUpdated] = useState(null);
  const [view, setView] = useState('map'); // 'map' | 'cards'
  const [page, setPage] = useState(1);
  const timerRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await workspaceApi.getServices();
      setData(res);
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Failed to load services');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const handleAction = useCallback(async (svc, action) => {
    const verb = action === 'restart' ? 'Restart' : action === 'stop' ? 'Stop' : 'Start';
    if (!window.confirm(`${verb} "${svc.unit}" on the VPS?`)) return;
    setBusy((b) => ({ ...b, [svc.unit]: action }));
    try {
      const res = await workspaceApi.controlService(svc.unit, action);
      if (!res.ok) {
        window.alert(`${verb} failed:\n${res.message || 'unknown error'}`);
      }
      await load(true);
    } catch (e) {
      window.alert(`${verb} failed:\n${e?.response?.data?.detail || e.message}`);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[svc.unit]; return n; });
    }
  }, [load]);

  const sortedAll = useMemo(
    () => [...(data?.services || [])].sort((a, b) => (HEALTH_ORDER[a.health] ?? 5) - (HEALTH_ORDER[b.health] ?? 5)),
    [data],
  );
  const totalPages = Math.max(1, Math.ceil(sortedAll.length / CARDS_PER_PAGE));
  const grouped = useMemo(() => {
    const slice = sortedAll.slice((page - 1) * CARDS_PER_PAGE, page * CARDS_PER_PAGE);
    const map = new Map();
    for (const s of slice) {
      const cat = s.category || 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(s);
    }
    return Array.from(map.entries());
  }, [sortedAll, page]);

  const summary = data?.summary || { total: 0, ok: 0, warn: 0, down: 0, idle: 0 };

  // ── systemctl unavailable (dev host) ──
  if (data && data.available === false) {
    return (
      <div className="rounded-lg p-6 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${tint(palette.amber[400], 0.2)}` }}>
        <AlertTriangleIcon size={28} style={{ color: palette.amber[400] }} className="mx-auto mb-2" />
        <p className="text-sm text-white font-semibold">Service monitor unavailable</p>
        <p className="text-xs mt-1" style={{ color: palette.warm[400] }}>{data.reason || 'systemctl not reachable from the API host.'}</p>
      </div>
    );
  }

  return (
    <div>
      {/* backend observability: timeouts / slow / DB / redis */}
      <BackendHealthPanel />

      {/* header row */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <SummaryChip label="services" value={summary.total} color={palette.gold[300]} />
          <SummaryChip label="running" value={summary.ok} color={palette.green[400]} />
          {summary.warn > 0 && <SummaryChip label="busy" value={summary.warn} color={palette.amber[400]} />}
          {summary.down > 0 && <SummaryChip label="failed" value={summary.down} color={palette.red[400]} />}
          <SummaryChip label="idle" value={summary.idle} color={palette.warm[400]} />
        </div>
        <div className="flex items-center gap-2.5">
          {lastUpdated && view === 'cards' && (
            <span className="text-[10px]" style={{ color: palette.warm[500] }}>
              updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <div className="inline-flex rounded-lg overflow-hidden" style={{ border: `1px solid ${tint(palette.warm[100], 0.12)}` }}>
            {['map', 'cards'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3.5 py-1.5 text-[11px] font-semibold capitalize"
                style={view === v
                  ? { background: tint(palette.gold[300], 0.14), color: palette.gold[300] }
                  : { background: 'transparent', color: palette.warm[400] }}
              >
                {v}
              </button>
            ))}
          </div>
          {view === 'cards' && (
            <button
              onClick={() => load()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold"
              style={{ background: tint(palette.gold[300], 0.1), border: `1px solid ${tint(palette.gold[300], 0.28)}`, color: palette.gold[300] }}
            >
              <RefreshIcon size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg p-3 mb-4 text-[12px]" style={{ background: tint(palette.red[400], 0.08), border: `1px solid ${tint(palette.red[400], 0.25)}`, color: palette.red[300] }}>
          {error}
        </div>
      )}

      {view === 'map' && <SystemMap />}

      {view === 'cards' && (
        <>
          {loading && !data && (
            <div className="flex items-center justify-center py-16 gap-2" style={{ color: palette.warm[400] }}>
              <LoaderIcon size={18} className="animate-spin" />
              <span className="text-sm">Reading systemd…</span>
            </div>
          )}

          {grouped.map(([category, svcs]) => (
            <div key={category} className="mb-5">
              <div className="flex items-center gap-2 mb-2.5">
                <ServerIcon size={12} style={{ color: palette.warm[300] }} />
                <span className="text-[10px] uppercase tracking-[0.14em] font-semibold" style={{ color: palette.warm[300] }}>{category}</span>
                <span className="text-[10px]" style={{ color: palette.warm[500] }}>· {svcs.length}</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {svcs.map((svc) => (
                  <ServiceCard key={svc.unit} svc={svc} onAction={handleAction} busyAction={busy[svc.unit]} />
                ))}
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-md text-[12px] disabled:opacity-40"
                style={{ background: 'transparent', border: `1px solid ${tint(palette.warm[100], 0.14)}`, color: palette.warm[300] }}
              >
                ← Prev
              </button>
              <span className="text-[12px]" style={{ color: palette.warm[400] }}>
                Page <b style={{ color: palette.gold[300] }}>{page}</b> / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-md text-[12px] disabled:opacity-40"
                style={{ background: 'transparent', border: `1px solid ${tint(palette.warm[100], 0.14)}`, color: palette.warm[300] }}
              >
                Next →
              </button>
            </div>
          )}

          {!loading && data && (data.services || []).length === 0 && (
            <div className="text-center py-16 text-sm" style={{ color: palette.warm[400] }}>
              No LuxQuant units discovered on this host.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SystemTab;
