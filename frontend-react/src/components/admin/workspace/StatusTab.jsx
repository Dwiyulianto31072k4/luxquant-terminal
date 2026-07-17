// src/components/admin/workspace/StatusTab.jsx
//
// LuxQuant — Management System › Status tab.
// Incident control room for the public /status page. Create incidents, move
// them through the lifecycle (Investigating → Identified → Monitoring →
// Resolved, or maintenance Scheduled → In progress → Completed), and delete.
// Auto-detected incidents show up here too and can be narrated / closed early.
//
// Data: /api/v1/status/admin/* (admin-only) via the shared authed axios.

import { useState, useEffect, useCallback } from "react";
import api from "../../../services/api";
import { palette, tint, motion } from "../designSystem";
import {
  PlusIcon,
  TrashIcon,
  RefreshIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  LoaderIcon,
  ExternalLinkIcon,
  BellIcon,
} from "../Icons";

const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved"];
const MAINTENANCE_STATUSES = ["scheduled", "in_progress", "completed"];
const IMPACTS = [
  { v: "minor", label: "Minor — degraded" },
  { v: "major", label: "Major — outage" },
  { v: "critical", label: "Critical — outage" },
  { v: "maintenance", label: "Maintenance — planned" },
];
const LABEL = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
};
const IMPACT_COLOR = {
  critical: palette.red[400],
  major: palette.red[400],
  minor: palette.amber[400],
  maintenance: palette.blue[400],
};
const isClosed = (s) => s === "resolved" || s === "completed";
const statusesFor = (impact) =>
  impact === "maintenance" ? MAINTENANCE_STATUSES : INCIDENT_STATUSES;
const fmt = (iso) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "";
  }
};

// ── shared field styling ──────────────────────────────────────────────
const fieldStyle = {
  background: "rgb(var(--scrim) / 0.3)",
  border: "1px solid rgb(var(--ink) / 0.08)",
  color: "rgb(var(--fg))",
};
const Field = (props) => (
  <input
    {...props}
    className="w-full rounded-md px-3 py-2 text-[13px] focus:outline-none placeholder:text-text-primary/30"
    style={fieldStyle}
  />
);
const Select = ({ children, ...props }) => (
  <select
    {...props}
    className="w-full rounded-md px-3 py-2 text-[13px] focus:outline-none"
    style={fieldStyle}
  >
    {children}
  </select>
);

function Badge({ status }) {
  const closed = isClosed(status);
  const color = closed
    ? palette.green[400]
    : status === "monitoring"
      ? palette.blue[400]
      : palette.amber[400];
  return (
    <span
      className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded"
      style={{ color, background: tint(color, 0.12), border: `1px solid ${tint(color, 0.28)}` }}
    >
      {LABEL[status] || status}
    </span>
  );
}

// ════════════════════════════════════════════════════════════════════
// Create form
// ════════════════════════════════════════════════════════════════════
function CreateForm({ components, onCreated, onError }) {
  const [title, setTitle] = useState("");
  const [impact, setImpact] = useState("minor");
  const [status, setStatus] = useState("investigating");
  const [affected, setAffected] = useState([]);
  const [message, setMessage] = useState("");
  const [schedFor, setSchedFor] = useState("");
  const [schedUntil, setSchedUntil] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const allowed = statusesFor(impact);
    if (!allowed.includes(status)) setStatus(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impact]);

  const toggle = (k) => setAffected((a) => (a.includes(k) ? a.filter((x) => x !== k) : [...a, k]));

  const submit = async () => {
    if (!title.trim()) return onError("Title is required.");
    setBusy(true);
    try {
      await api.post("/status/admin/incidents", {
        title: title.trim(),
        impact,
        status,
        affected,
        message: message.trim(),
        scheduled_for: schedFor || null,
        scheduled_until: schedUntil || null,
      });
      setTitle("");
      setMessage("");
      setAffected([]);
      setSchedFor("");
      setSchedUntil("");
      setImpact("minor");
      setStatus("investigating");
      onCreated();
    } catch (e) {
      onError(e?.response?.data?.detail || "Failed to create incident.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-xl p-4 sm:p-5 relative overflow-hidden mb-6"
      style={{
        background: "rgb(var(--surface-raised))",
        border: "1px solid rgb(var(--ink) / 0.07)",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(to right, transparent, ${tint(palette.gold[300], 0.4)}, transparent)`,
        }}
      />
      <div className="flex items-center gap-2 mb-4">
        <PlusIcon size={13} style={{ color: palette.gold[300] }} />
        <span className="text-[11px] uppercase font-semibold tracking-[0.08em] text-text-primary/80">
          New Incident
        </span>
      </div>

      <label className="block text-[11px] mb-1" style={{ color: "rgb(var(--fg-muted))" }}>
        Title
      </label>
      <Field
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Signals delivery delayed"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <div>
          <label className="block text-[11px] mb-1" style={{ color: "rgb(var(--fg-muted))" }}>
            Impact
          </label>
          <Select value={impact} onChange={(e) => setImpact(e.target.value)}>
            {IMPACTS.map((i) => (
              <option key={i.v} value={i.v}>
                {i.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-[11px] mb-1" style={{ color: "rgb(var(--fg-muted))" }}>
            Starting status
          </label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {statusesFor(impact).map((s) => (
              <option key={s} value={s}>
                {LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {impact === "maintenance" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-[11px] mb-1" style={{ color: "rgb(var(--fg-muted))" }}>
              Scheduled from
            </label>
            <Field
              type="datetime-local"
              value={schedFor}
              onChange={(e) => setSchedFor(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] mb-1" style={{ color: "rgb(var(--fg-muted))" }}>
              Until
            </label>
            <Field
              type="datetime-local"
              value={schedUntil}
              onChange={(e) => setSchedUntil(e.target.value)}
            />
          </div>
        </div>
      )}

      <label className="block text-[11px] mb-1 mt-3" style={{ color: "rgb(var(--fg-muted))" }}>
        Affected components
      </label>
      <div className="flex flex-wrap gap-2">
        {components.map((c) => {
          const on = affected.includes(c.key);
          return (
            <button
              key={c.key}
              onClick={() => toggle(c.key)}
              className="px-2.5 py-1.5 rounded-md text-[12px] transition-colors"
              style={{
                background: on ? tint(palette.gold[300], 0.15) : "rgb(var(--ink) / 0.03)",
                border: `1px solid ${on ? tint(palette.gold[300], 0.3) : "rgb(var(--ink) / 0.08)"}`,
                color: on ? palette.gold[300] : "rgb(var(--fg-secondary))",
                transition: motion.base,
              }}
            >
              {c.name}
            </button>
          );
        })}
      </div>

      <label className="block text-[11px] mb-1 mt-3" style={{ color: "rgb(var(--fg-muted))" }}>
        First update (what users see)
      </label>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full rounded-md px-3 py-2 text-[13px] min-h-[70px] focus:outline-none placeholder:text-text-primary/30"
        style={fieldStyle}
        placeholder="e.g. We're investigating delays in signal delivery and will update shortly."
      />

      <div className="mt-4">
        <button
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-semibold disabled:opacity-40"
          style={{
            background: tint(palette.gold[300], 0.15),
            border: `1px solid ${tint(palette.gold[300], 0.3)}`,
            color: palette.gold[300],
          }}
        >
          {busy ? <LoaderIcon size={13} className="animate-spin" /> : <PlusIcon size={13} />}
          Publish incident
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Incident card (admin)
// ════════════════════════════════════════════════════════════════════
function IncidentCard({ inc, busy, onUpdate, onDelete }) {
  const accent = IMPACT_COLOR[inc.impact] || "rgb(var(--fg-muted))";
  const closed = isClosed(inc.status);
  const [newStatus, setNewStatus] = useState(inc.status);
  const [body, setBody] = useState("");
  const options = statusesFor(inc.impact);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "rgb(var(--surface-raised))",
        border: `1px solid ${closed ? "rgb(var(--ink) / 0.07)" : tint(accent, 0.3)}`,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(to right, transparent, ${tint(accent, 0.3)}, transparent)`,
        }}
      />
      <div
        className="px-4 py-3 flex items-center justify-between gap-3"
        style={{ background: closed ? "transparent" : tint(accent, 0.05) }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold text-text-primary truncate">
              {inc.title}
            </span>
            {inc.auto && (
              <span
                className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  background: "rgb(var(--ink) / 0.06)",
                  color: "rgb(var(--fg-secondary))",
                  border: "1px solid rgb(var(--ink) / 0.08)",
                }}
              >
                Auto
              </span>
            )}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: "rgb(var(--fg-muted))" }}>
            {inc.impact} · {(inc.affected || []).join(", ") || "no components"}
          </div>
        </div>
        <Badge status={inc.status} />
      </div>

      <div className="px-4 py-3 border-t" style={{ borderColor: "rgb(var(--ink) / 0.06)" }}>
        {!closed ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="sm:w-44 shrink-0">
              <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                {options.map((s) => (
                  <option key={s} value={s}>
                    {LABEL[s]}
                  </option>
                ))}
              </Select>
            </div>
            <Field
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Update message (optional)"
            />
            <button
              onClick={() => {
                onUpdate(inc.id, newStatus, body);
                setBody("");
              }}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[12px] font-semibold disabled:opacity-40 whitespace-nowrap"
              style={{
                background: tint(palette.gold[300], 0.15),
                border: `1px solid ${tint(palette.gold[300], 0.3)}`,
                color: palette.gold[300],
              }}
            >
              {busy ? (
                <LoaderIcon size={12} className="animate-spin" />
              ) : (
                <CheckCircleIcon size={12} />
              )}{" "}
              Post update
            </button>
          </div>
        ) : (
          <p className="text-[12px]" style={{ color: "rgb(var(--fg-muted))" }}>
            Closed — shown under “Past Incidents” on the public page.
          </p>
        )}

        {inc.updates?.length > 0 && (
          <div
            className="mt-3 space-y-2 border-t pt-3"
            style={{ borderColor: "rgb(var(--ink) / 0.06)" }}
          >
            {inc.updates
              .slice()
              .reverse()
              .map((u, i) => (
                <div key={i} className="text-[12px] flex flex-wrap items-baseline gap-x-2">
                  <span
                    className="text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color: accent }}
                  >
                    {LABEL[u.status] || u.status}
                  </span>
                  <span className="text-[10px]" style={{ color: "rgb(var(--fg-muted))" }}>
                    {fmt(u.created_at)}
                  </span>
                  {u.body && <span style={{ color: "rgb(var(--fg-secondary))" }}>{u.body}</span>}
                </div>
              ))}
          </div>
        )}

        <div className="mt-3">
          <button
            onClick={() => onDelete(inc.id)}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: tint(palette.red[400], 0.8) }}
          >
            <TrashIcon size={11} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Tab
// ════════════════════════════════════════════════════════════════════
export function StatusTab() {
  const [incidents, setIncidents] = useState([]);
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/status/admin/incidents");
      setIncidents(data.incidents || []);
      setComponents(data.components || []);
      setErr("");
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to load incidents.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const postUpdate = async (id, status, message) => {
    setBusy(true);
    try {
      await api.post(`/status/admin/incidents/${id}/updates`, { status, message: message || "" });
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to post update.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this incident permanently?")) return;
    setBusy(true);
    try {
      await api.delete(`/status/admin/incidents/${id}`);
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to delete.");
    } finally {
      setBusy(false);
    }
  };

  const active = incidents.filter((i) => !isClosed(i.status));
  const past = incidents.filter((i) => isClosed(i.status));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div
          className="flex items-center gap-2 text-[12px]"
          style={{ color: "rgb(var(--fg-secondary))" }}
        >
          <BellIcon size={13} style={{ color: palette.gold[300] }} />
          <span>Incidents shown on the public</span>
          <a
            href="/status"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold"
            style={{ color: palette.gold[300] }}
          >
            /status <ExternalLinkIcon size={11} />
          </a>
          <span>page.</span>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold"
          style={{
            background: "rgb(var(--ink) / 0.04)",
            border: "1px solid rgb(var(--ink) / 0.08)",
            color: "rgb(var(--fg-secondary))",
          }}
        >
          <RefreshIcon size={12} /> Refresh
        </button>
      </div>

      {err && (
        <div
          className="mb-4 rounded-md px-3 py-2 text-[13px] flex items-center gap-2"
          style={{
            background: tint(palette.red[400], 0.1),
            border: `1px solid ${tint(palette.red[400], 0.3)}`,
            color: palette.red[300],
          }}
        >
          <AlertTriangleIcon size={13} /> {err}
        </div>
      )}

      <CreateForm components={components} onCreated={load} onError={setErr} />

      {/* Active */}
      <div
        className="text-[11px] uppercase font-semibold tracking-[0.08em] mb-3"
        style={{ color: "rgb(var(--fg-secondary))" }}
      >
        Active{" "}
        {active.length > 0 && <span style={{ color: palette.amber[400] }}>· {active.length}</span>}
      </div>
      {loading ? (
        <div className="py-8 text-center text-[13px]" style={{ color: "rgb(var(--fg-muted))" }}>
          Loading…
        </div>
      ) : active.length === 0 ? (
        <div
          className="rounded-xl py-8 text-center text-[13px] mb-6"
          style={{
            background: "rgb(var(--ink) / 0.015)",
            border: "1px solid rgb(var(--ink) / 0.06)",
            color: "rgb(var(--fg-muted))",
          }}
        >
          <CheckCircleIcon
            size={18}
            style={{
              color: palette.green[400],
              display: "inline",
              marginRight: 8,
              verticalAlign: "middle",
            }}
          />
          No active incidents — all clear.
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {active.map((inc) => (
            <IncidentCard
              key={inc.id}
              inc={inc}
              busy={busy}
              onUpdate={postUpdate}
              onDelete={remove}
            />
          ))}
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <>
          <div
            className="text-[11px] uppercase font-semibold tracking-[0.08em] mb-3"
            style={{ color: "rgb(var(--fg-muted))" }}
          >
            Past
          </div>
          <div className="space-y-3">
            {past.map((inc) => (
              <IncidentCard
                key={inc.id}
                inc={inc}
                busy={busy}
                onUpdate={postUpdate}
                onDelete={remove}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default StatusTab;
