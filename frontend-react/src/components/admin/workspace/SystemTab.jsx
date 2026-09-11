// src/components/admin/workspace/SystemTab.jsx
//
// LuxQuant — Management System › System tab.
// Live health of every LuxQuant systemd unit (services + timers) + core
// infra (postgres / redis / nginx) running on the VPS. Read the state,
// see error tails for anything unhealthy, and start/stop/restart a unit
// without SSHing into the box.
//
// Data: workspaceApi.getServices() / controlService(unit, action)
// Backend: /api/v1/workspace/services (admin-only)

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { workspaceApi } from "../../../services/workspaceApi";
import { palette, tint, motion } from "../designSystem";
import {
  ServerIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  XCircleIcon,
  RefreshIcon,
  LoaderIcon,
  BanIcon,
  ZapIcon,
  ClockIcon,
} from "../Icons";
import SystemMap from "./SystemMap";
import BackendHealthPanel from "./BackendHealthPanel";
import { CollectionPagination } from "../CollectionPagination";

const CARDS_PER_PAGE = 12;
const HEALTH_ORDER = { down: 0, warn: 1, unknown: 2, ok: 3, idle: 4 };

// ════════════════════════════════════════════════════════════════════
// Status vocabulary
// ════════════════════════════════════════════════════════════════════

const HEALTH = {
  ok: { label: "Running", color: palette.green[400], Icon: CheckCircleIcon },
  warn: { label: "Busy", color: palette.amber[400], Icon: LoaderIcon },
  down: { label: "Failed", color: palette.red[400], Icon: XCircleIcon },
  idle: { label: "Idle", color: "rgb(var(--fg-muted))", Icon: ClockIcon },
  unknown: { label: "Unknown", color: palette.orange[400], Icon: AlertTriangleIcon },
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
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
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
    <span className="text-[10px] font-medium" style={{ color: tint(color, 0.85) }}>
      {label}
    </span>
    <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
      {value}
    </span>
  </div>
);

const MetaPill = ({ children, color = "rgb(var(--fg-secondary))" }) => (
  <span
    className="text-[10px] px-1.5 py-0.5 rounded tabular-nums"
    style={{
      background: tint(color, 0.08),
      color: tint(color, 0.95),
      border: `1px solid ${tint(color, 0.15)}`,
    }}
  >
    {children}
  </span>
);

const ActionButton = ({ label, color, Icon, onClick, busy, disabled }) => (
  <button
    onClick={onClick}
    disabled={busy || disabled}
    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold disabled:opacity-40"
    style={{
      background: tint(color, 0.1),
      border: `1px solid ${tint(color, 0.28)}`,
      color,
      transition: motion.base,
    }}
    onMouseEnter={(e) => {
      if (!busy && !disabled) e.currentTarget.style.background = tint(color, 0.18);
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = tint(color, 0.1);
    }}
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
  const isTimer = svc.kind === "timer";
  const isActive = svc.active_state === "active";
  const uptime = fmtUptime(svc.uptime_seconds);
  const mem = fmtBytes(svc.memory_bytes);

  return (
    <div
      className="rounded-xl p-3.5 relative overflow-hidden"
      style={{
        background: "rgb(var(--surface-raised))",
        border: `1px solid ${tint(meta.color, svc.health === "down" ? 0.4 : 0.14)}`,
        boxShadow: "0 6px 20px rgb(var(--scrim) / 0.35)",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(to right, transparent, ${tint(meta.color, svc.health === "down" ? 0.5 : 0.28)}, transparent)`,
        }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-2.5">
          <span className="relative inline-flex mt-0.5 shrink-0">
            {svc.health === "down" && (
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-60"
                style={{ background: meta.color }}
              />
            )}
            <span
              className="relative inline-block w-2 h-2 rounded-full"
              style={{ background: meta.color }}
            />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold text-text-primary truncate">
                {svc.name}
              </span>
              {isTimer && (
                <span
                  className="text-[9px] uppercase tracking-wider px-1 rounded"
                  style={{ background: tint(palette.blue[400], 0.12), color: palette.blue[400] }}
                >
                  timer
                </span>
              )}
            </div>
            <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgb(var(--fg-muted))" }}>
              {svc.description || svc.unit}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <meta.Icon size={13} style={{ color: meta.color }} />
          <span className="text-[11px] font-semibold" style={{ color: meta.color }}>
            {meta.label}
          </span>
        </div>
      </div>

      {/* metrics */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2.5 pl-[18px]">
        <MetaPill color={meta.color}>
          {svc.active_state}
          {svc.sub_state ? ` · ${svc.sub_state}` : ""}
        </MetaPill>
        {uptime && <MetaPill color={palette.green[400]}>up {uptime}</MetaPill>}
        {svc.restarts > 0 && (
          <MetaPill color={palette.orange[400]}>
            {svc.restarts} restart{svc.restarts > 1 ? "s" : ""}
          </MetaPill>
        )}
        {mem && <MetaPill>{mem}</MetaPill>}
        {svc.main_pid && <MetaPill>pid {svc.main_pid}</MetaPill>}
        {svc.unit_file_state && (
          <MetaPill
            color={svc.unit_file_state === "enabled" ? palette.green[400] : "rgb(var(--fg-muted))"}
          >
            {svc.unit_file_state}
          </MetaPill>
        )}
      </div>

      {/* error tail */}
      {Array.isArray(svc.log_tail) && svc.log_tail.length > 0 && (
        <pre
          className="mt-2.5 ml-[18px] p-2 rounded text-[10px] leading-relaxed overflow-x-auto whitespace-pre-wrap"
          style={{
            background: "rgb(var(--surface-secondary))",
            border: `1px solid ${tint(palette.red[400], 0.2)}`,
            color: "rgb(var(--fg-secondary))",
            maxHeight: 140,
          }}
        >
          {svc.log_tail.join("\n")}
        </pre>
      )}

      {/* controls */}
      <div className="flex items-center gap-2 mt-3 pl-[18px]">
        <ActionButton
          label="Restart"
          color={palette.gold[300]}
          Icon={RefreshIcon}
          busy={busyAction === "restart"}
          onClick={() => onAction(svc, "restart")}
        />
        {isActive ? (
          <ActionButton
            label="Stop"
            color={palette.red[400]}
            Icon={BanIcon}
            busy={busyAction === "stop"}
            onClick={() => onAction(svc, "stop")}
          />
        ) : (
          <ActionButton
            label={isTimer ? "Trigger" : "Start"}
            color={palette.green[400]}
            Icon={ZapIcon}
            busy={busyAction === "start"}
            onClick={() => onAction(svc, "start")}
          />
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// Main tab
// ════════════════════════════════════════════════════════════════════

// systemd hands back its own formatted stamp ("Tue 2026-09-08 07:52:58 UTC").
// For a scheduled job the useful reading is not how long the unit has been up
// — it exits between runs — but whether it actually fired recently.
const fmtLastRun = (stamp) => {
  if (!stamp) return null;
  const t = Date.parse(stamp);
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return "just ran";
  if (s < 5400) return `ran ${Math.round(s / 60)}m ago`;
  if (s < 172800) return `ran ${Math.round(s / 3600)}h ago`;
  return `ran ${Math.round(s / 86400)}d ago`;
};

// Groups keep their worst-first order: a category holding a dead unit floats
// above one that is entirely healthy, so the eye lands on the section that
// needs it before reading a single name. "Other" is always last — it is the
// bucket for units nobody has classified, not a category anyone looks for.
const groupByCategory = (rows) => {
  const map = new Map();
  for (const r of rows) {
    const cat = r.category || "Other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(r);
  }
  const worst = (items) => Math.min(...items.map((i) => HEALTH_ORDER[i.health] ?? 9));
  return Array.from(map.entries()).sort((a, b) => {
    if ((a[0] === "Other") !== (b[0] === "Other")) return a[0] === "Other" ? 1 : -1;
    return worst(a[1]) - worst(b[1]) || a[0].localeCompare(b[0]);
  });
};

// ── One line per unit ────────────────────────────────────────────────────
// A hundred units, each carrying one line of information, is a scanning job.
// Cards are for browsing and lists are for scanning, and a card grid put twelve
// units on a screen behind nine pages of pagination — so finding the one that
// had failed meant clicking through the ninety that had not. A row is a fifth
// of the height, so the whole estate fits in one view and a red dot is visible
// without hunting for it.
//
// Detail is not lost, it is deferred: the row opens on click and brings its
// description, its log tail and its controls with it. Monitoring shows WHAT;
// the drill-down explains WHY, and mixing the two is what made the old view
// heavy enough to need paging.
const ServiceRow = ({ svc, onAction, busyAction, open, onToggle }) => {
  const meta = HEALTH[svc.health] || HEALTH.unknown;
  const isTimer = svc.kind === "timer";
  const isActive = svc.active_state === "active";
  const alarming = svc.health === "down";

  return (
    <div style={{ borderBottom: "1px solid rgb(var(--ink) / 0.05)" }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-3 py-2 text-left"
        style={{ background: open ? "rgb(var(--ink) / 0.02)" : "transparent" }}
      >
        <span className="relative inline-flex shrink-0">
          {alarming && (
            <span className="absolute inset-0 rounded-full animate-ping opacity-60"
                  style={{ background: meta.color }} />
          )}
          <span className="relative inline-block w-2 h-2 rounded-full"
                style={{ background: meta.color }} />
        </span>

        <span className="min-w-0" style={{ flex: "1 1 auto" }}>
          <span className="text-[12.5px] font-medium truncate block"
                style={{ color: alarming ? meta.color : "rgb(var(--fg-primary))" }}>
            {svc.name}
          </span>
          {/* A unit name is a filename, not an explanation. Reading a list of a
              hundred of them and knowing which matter takes knowledge nobody
              new to the box has, so each row says what the thing is for: the
              curated line where one exists, systemd's own Description
              otherwise. Between them they cover every unit. */}
          {(svc.fn || svc.description) && (
            <span className="text-[10.5px] truncate block"
                  style={{ color: "rgb(var(--fg-muted))" }}>
              {svc.fn || svc.description}
            </span>
          )}
        </span>

        {svc.scheduled && (
          <span className="text-[9.5px] px-1.5 py-0.5 rounded shrink-0"
                style={{ background: "rgb(var(--ink) / 0.05)", color: "rgb(var(--fg-muted))" }}>
            scheduled
          </span>
        )}

        {/* A long-running worker is judged on uptime and memory; a scheduled
            one on whether it last fired. Showing uptime for a job that exits
            between runs was a column of dashes, which is worse than empty —
            it looks like missing data rather than a question that does not
            apply. */}
        <span className="text-[11px] tabular-nums shrink-0 hidden sm:block w-24 text-right"
              style={{ color: "rgb(var(--fg-muted))" }}>
          {svc.scheduled
            ? fmtLastRun(svc.last_run) || "never run"
            : fmtUptime(svc.uptime_seconds) || ""}
        </span>
        <span className="text-[11px] tabular-nums shrink-0 hidden md:block w-16 text-right"
              style={{ color: "rgb(var(--fg-muted))" }}>
          {svc.scheduled ? "" : fmtBytes(svc.memory_bytes) || ""}
        </span>
        <span className="text-[11px] shrink-0 w-14 text-right"
              style={{ color: alarming ? meta.color : "rgb(var(--fg-muted))" }}>
          {svc.health}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1" style={{ background: "rgb(var(--ink) / 0.02)" }}>
          {svc.description && (
            <p className="text-[11.5px] mb-2" style={{ color: "rgb(var(--fg-secondary))" }}>
              {svc.description}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] mb-2"
               style={{ color: "rgb(var(--fg-muted))" }}>
            <span>{svc.unit}</span>
            {svc.timer_unit ? <span>{svc.timer_unit}</span> : null}
            {svc.scheduled && svc.last_run ? <span>last {svc.last_run}</span> : null}
            {svc.restarts ? <span>{svc.restarts} restarts</span> : null}
            {svc.main_pid ? <span>pid {svc.main_pid}</span> : null}
            <span>{svc.active_state}/{svc.sub_state}</span>
          </div>
          {svc.log_tail?.length ? (
            <pre className="text-[10.5px] leading-relaxed rounded p-2 mb-2 overflow-x-auto"
                 style={{ background: "rgb(var(--ink) / 0.04)", color: "rgb(var(--fg-secondary))" }}>
              {svc.log_tail.join("\n")}
            </pre>
          ) : null}
          {svc.read_only ? (
            // The far key cannot run systemctl, and widening it would let this
            // page stop the proxy everything else depends on, from a browser.
            <p className="text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
              Read-only — this unit lives on another machine.
            </p>
          ) : (
            <div className="flex gap-1.5">
              <ActionButton label="Restart" color={palette.gold[300]} Icon={RefreshIcon}
                            busy={busyAction === "restart"} onClick={() => onAction(svc, "restart")} />
              {isActive ? (
                <ActionButton label="Stop" color={palette.red[400]} Icon={BanIcon}
                              busy={busyAction === "stop"} onClick={() => onAction(svc, "stop")} />
              ) : (
                <ActionButton label={isTimer ? "Trigger" : "Start"} color={palette.green[400]}
                              Icon={ZapIcon} busy={busyAction === "start"}
                              onClick={() => onAction(svc, "start")} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── The one sentence worth reading first ─────────────────────────────────
// The old header was five equal chips: services, running, busy, failed, idle.
// Five numbers of equal weight is five things to read and compare before you
// know whether anything needs you. Aggregated health comes first and the
// breakdown second — and when nothing is wrong, saying so plainly is more
// useful than making someone verify it from a row of counters.
const Verdict = ({ summary, hosts }) => {
  const unreachable = (hosts || []).filter((h) => !h.reachable);
  const bad = summary.down + unreachable.length;
  const tone = bad ? palette.red[400] : summary.warn ? palette.amber[400] : palette.green[400];
  const headline = bad
    ? [summary.down ? `${summary.down} unit${summary.down > 1 ? "s" : ""} down` : null,
       unreachable.length ? `${unreachable.length} host unreachable` : null]
        .filter(Boolean).join(" · ")
    : summary.warn
      ? `${summary.warn} unit${summary.warn > 1 ? "s" : ""} busy`
      : "Everything is running";

  return (
    <div className="flex items-baseline gap-3 flex-wrap mb-3">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: tone }} />
      <span className="text-[17px] font-semibold" style={{ letterSpacing: "-.01em", color: tone }}>
        {headline}
      </span>
      <span className="text-[12px]" style={{ color: "rgb(var(--fg-muted))" }}>
        {summary.ok} running · {summary.idle} idle · {summary.total} total
      </span>
    </div>
  );
};

// ── The machines, not the units ──────────────────────────────────────────
// Everything below reads systemd on the box this API runs on. That box is in
// Mumbai and it is not the only one: a second VPS in Jakarta carries the SOCKS
// proxy every Telegram request leaves through, and the Binance flow worker that
// has to originate from an Indonesian address. Both are load-bearing and
// neither was visible here, so a failure there would have looked like a failure
// in Mumbai with nothing to tell them apart.
//
// The remote box is read over SSH with a key pinned to one read-only command on
// the far side, which is why its units carry no action buttons: the dashboard
// should not be able to stop the proxy that every other service depends on.
const HostStrip = ({ hosts }) => {
  if (!hosts?.length) return null;
  const gb = (n) => (n ? `${(n / 1073741824).toFixed(0)} GB` : "\u2014");
  return (
    <div
      className="grid gap-2.5 mb-4"
      style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}
    >
      {hosts.map((h) => {
        const down = (h.services || []).filter((s) => s.health === "down").length;
        const tone = !h.reachable ? "#dc2626" : down ? "#d97706" : "#16a34a";
        return (
          <div
            key={h.label}
            className="rounded-lg p-3.5"
            style={{
              border: "1px solid rgb(var(--ink) / 0.08)",
              background: "rgb(var(--ink) / 0.015)",
            }}
          >
            <div className="flex items-center gap-2">
              <span style={{ width: 8, height: 8, borderRadius: 999, background: tone }} />
              <span className="text-[13.5px] font-semibold">{h.label}</span>
              <span className="text-[11px] ml-auto" style={{ color: "rgb(var(--fg-muted))" }}>
                {h.local ? "this machine" : "remote, read-only"}
              </span>
            </div>
            <div className="text-[11.5px] mt-1" style={{ color: "rgb(var(--fg-muted))" }}>
              {h.note}
            </div>
            {h.reachable ? (
              <div
                className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[11.5px]"
                style={{ color: "rgb(var(--fg-secondary))" }}
              >
                <span><b>{(h.services || []).length}</b> units</span>
                {down ? <span style={{ color: "#dc2626" }}><b>{down}</b> down</span> : null}
                {h.uptime_seconds ? <span>up <b>{(h.uptime_seconds / 86400).toFixed(0)}d</b></span> : null}
                {h.disk ? <span>disk <b>{h.disk.used_pct}%</b> of {gb(h.disk.total)}</span> : null}
                {h.load ? <span>load <b>{h.load[0].toFixed(2)}</b></span> : null}
              </div>
            ) : (
              <div className="text-[11.5px] mt-2.5" style={{ color: "#dc2626" }}>
                unreachable \u2014 {h.reason}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const SystemTab = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState({}); // { [unit]: action }
  const [lastUpdated, setLastUpdated] = useState(null);
  // The map explains WHY things are connected; the list answers WHAT is wrong.
  // The second question is the one someone opens this tab to ask, so it opens
  // on the list and the map is a click away.
  const [view, setView] = useState("list"); // 'list' | 'cards' | 'map'
  const [openUnit, setOpenUnit] = useState(null);
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
      setError(e?.response?.data?.detail || e.message || "Failed to load services");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const handleAction = useCallback(
    async (svc, action) => {
      const verb = action === "restart" ? "Restart" : action === "stop" ? "Stop" : "Start";
      if (!window.confirm(`${verb} "${svc.unit}" on the VPS?`)) return;
      setBusy((b) => ({ ...b, [svc.unit]: action }));
      try {
        const res = await workspaceApi.controlService(svc.unit, action);
        if (!res.ok) {
          window.alert(`${verb} failed:\n${res.message || "unknown error"}`);
        }
        await load(true);
      } catch (e) {
        window.alert(`${verb} failed:\n${e?.response?.data?.detail || e.message}`);
      } finally {
        setBusy((b) => {
          const n = { ...b };
          delete n[svc.unit];
          return n;
        });
      }
    },
    [load]
  );

  const sortedAll = useMemo(
    () =>
      [...(data?.services || [])].sort(
        (a, b) => (HEALTH_ORDER[a.health] ?? 5) - (HEALTH_ORDER[b.health] ?? 5)
      ),
    [data]
  );
  const totalPages = Math.max(1, Math.ceil(sortedAll.length / CARDS_PER_PAGE));
  const grouped = useMemo(() => {
    const slice = sortedAll.slice((page - 1) * CARDS_PER_PAGE, page * CARDS_PER_PAGE);
    const map = new Map();
    for (const s of slice) {
      const cat = s.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(s);
    }
    return Array.from(map.entries());
  }, [sortedAll, page]);

  const summary = data?.summary || { total: 0, ok: 0, warn: 0, down: 0, idle: 0 };

  // ── systemctl unavailable (dev host) ──
  if (data && data.available === false) {
    return (
      <div
        className="rounded-lg p-6 text-center"
        style={{
          background: "rgb(var(--ink) / 0.02)",
          border: `1px solid ${tint(palette.amber[400], 0.2)}`,
        }}
      >
        <AlertTriangleIcon
          size={28}
          style={{ color: palette.amber[400] }}
          className="mx-auto mb-2"
        />
        <p className="text-sm text-text-primary font-semibold">Service monitor unavailable</p>
        <p className="text-xs mt-1" style={{ color: "rgb(var(--fg-muted))" }}>
          {data.reason || "systemctl not reachable from the API host."}
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* backend observability: timeouts / slow / DB / redis */}
      <BackendHealthPanel />

      {/* header row */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <Verdict summary={summary} hosts={data?.hosts} />
        <div className="flex items-center gap-2.5">
          {lastUpdated && view !== "map" && (
            <span className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
              updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <div
            className="inline-flex rounded-lg overflow-hidden"
            style={{ border: `1px solid ${tint(palette.warm[100], 0.12)}` }}
          >
            {["list", "cards", "map"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3.5 py-1.5 text-[11px] font-semibold capitalize"
                style={
                  view === v
                    ? { background: tint(palette.gold[300], 0.14), color: palette.gold[300] }
                    : { background: "transparent", color: "rgb(var(--fg-muted))" }
                }
              >
                {v}
              </button>
            ))}
          </div>
          {view !== "map" && (
            <button
              onClick={() => load()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold"
              style={{
                background: tint(palette.gold[300], 0.1),
                border: `1px solid ${tint(palette.gold[300], 0.28)}`,
                color: palette.gold[300],
              }}
            >
              <RefreshIcon size={12} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          className="rounded-lg p-3 mb-4 text-[12px]"
          style={{
            background: tint(palette.red[400], 0.08),
            border: `1px solid ${tint(palette.red[400], 0.25)}`,
            color: palette.red[300],
          }}
        >
          {error}
        </div>
      )}

      <HostStrip hosts={data?.hosts} />

      {view === "list" && data?.hosts?.length ? (
        <div className="space-y-4">
          {data.hosts.map((h) => {
            // Worst first inside each machine. Sorting the whole estate as one
            // list buries a dead unit on the quiet box among ninety live ones
            // on the busy box; grouping keeps "where" answerable at a glance.
            const rows = [...(h.services || [])].sort(
              (a, b) =>
                (HEALTH_ORDER[a.health] ?? 9) - (HEALTH_ORDER[b.health] ?? 9) ||
                String(a.category).localeCompare(String(b.category)) ||
                String(a.name).localeCompare(String(b.name))
            );
            return (
              <div key={h.label} className="rounded-lg overflow-hidden"
                   style={{ border: "1px solid rgb(var(--ink) / 0.07)" }}>
                <div className="flex items-center gap-2 px-3 py-2"
                     style={{ background: "rgb(var(--ink) / 0.025)" }}>
                  <ServerIcon size={12} style={{ color: "rgb(var(--fg-secondary))" }} />
                  <span className="text-[12px] font-semibold">{h.label}</span>
                  <span className="text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
                    {h.note}
                  </span>
                  <span className="ml-auto text-[11px]" style={{ color: "rgb(var(--fg-muted))" }}>
                    {h.reachable ? `${rows.length} units` : "unreachable"}
                  </span>
                </div>
                {h.reachable ? (
                  // Grouped by what the units do, not just listed. A hundred
                  // names in one run is a wall; "Distribution 28 · all ok" is a
                  // sentence you can skip past, which is the point — attention
                  // should be spent on the group that is not fine.
                  groupByCategory(rows).map(([cat, items]) => {
                    const bad = items.filter((x) => x.health === "down").length;
                    return (
                      <div key={cat}>
                        <div className="flex items-center gap-2 px-3 py-1.5"
                             style={{ background: "rgb(var(--ink) / 0.015)",
                                      borderTop: "1px solid rgb(var(--ink) / 0.05)" }}>
                          <span className="text-[10px] uppercase tracking-[0.1em] font-semibold"
                                style={{ color: "rgb(var(--fg-secondary))" }}>
                            {cat}
                          </span>
                          <span className="text-[10.5px]" style={{ color: "rgb(var(--fg-muted))" }}>
                            {items.length}
                          </span>
                          {bad ? (
                            <span className="text-[10.5px] font-semibold"
                                  style={{ color: palette.red[400] }}>
                              {bad} down
                            </span>
                          ) : null}
                        </div>
                        {items.map((svc) => (
                          <ServiceRow
                            key={`${h.label}:${svc.unit}`}
                            svc={svc}
                            onAction={handleAction}
                            busyAction={busy[svc.unit]}
                            open={openUnit === `${h.label}:${svc.unit}`}
                            onToggle={() =>
                              setOpenUnit(
                                openUnit === `${h.label}:${svc.unit}`
                                  ? null
                                  : `${h.label}:${svc.unit}`
                              )
                            }
                          />
                        ))}
                      </div>
                    );
                  })
                ) : (
                  <div className="px-3 py-3 text-[11.5px]" style={{ color: palette.red[400] }}>
                    Cannot reach this machine — {h.reason}. Its units are not
                    listed because "none running" and "cannot ask" mean
                    different things.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {view === "map" && <SystemMap />}

      {view === "cards" && (
        <>
          {loading && !data && (
            <div
              className="flex items-center justify-center py-16 gap-2"
              style={{ color: "rgb(var(--fg-muted))" }}
            >
              <LoaderIcon size={18} className="animate-spin" />
              <span className="text-sm">Reading systemd…</span>
            </div>
          )}

          {grouped.map(([category, svcs]) => (
            <div key={category} className="mb-5">
              <div className="flex items-center gap-2 mb-2.5">
                <ServerIcon size={12} style={{ color: "rgb(var(--fg-secondary))" }} />
                <span
                  className="text-[10px] uppercase tracking-[0.14em] font-semibold"
                  style={{ color: "rgb(var(--fg-secondary))" }}
                >
                  {category}
                </span>
                <span className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
                  · {svcs.length}
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {svcs.map((svc) => (
                  <ServiceCard
                    key={svc.unit}
                    svc={svc}
                    onAction={handleAction}
                    busyAction={busy[svc.unit]}
                  />
                ))}
              </div>
            </div>
          ))}

          <CollectionPagination
            page={page}
            totalPages={totalPages}
            total={sortedAll.length}
            pageSize={CARDS_PER_PAGE}
            onPageChange={setPage}
            itemLabel="services"
          />

          {!loading && data && (data.services || []).length === 0 && (
            <div className="text-center py-16 text-sm" style={{ color: "rgb(var(--fg-muted))" }}>
              No LuxQuant units discovered on this host.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SystemTab;
