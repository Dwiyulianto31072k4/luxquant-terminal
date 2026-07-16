// src/components/StatusAdminPage.jsx
// ════════════════════════════════════════════════════════════════
// Admin — Status Incident Manager.
//
// This is the "how do I change it to investigating / monitoring / resolved"
// control room, modelled on Atlassian Statuspage / GitHub / Cloudflare:
//   1. Create an incident (title, impact, affected components, first update).
//   2. Post updates that move it through the lifecycle:
//        Investigating → Identified → Monitoring → Resolved
//      (or maintenance: Scheduled → In progress → Completed).
//   3. Every update is timestamped and shows on the public /status page.
//
// Admin-only route (/admin/status). Talks to /api/v1/status/admin/* using the
// shared authed axios instance.
// ════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from "react";
import api from "../services/api";

const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved"];
const MAINTENANCE_STATUSES = ["scheduled", "in_progress", "completed"];
const IMPACTS = [
  { v: "minor", label: "Minor (degraded)" },
  { v: "major", label: "Major (outage)" },
  { v: "critical", label: "Critical (outage)" },
  { v: "maintenance", label: "Maintenance (planned)" },
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
const IMPACT_COLOR = { critical: "#ef4444", major: "#ef4444", minor: "#f5b301", maintenance: "#3b82f6" };
const isClosed = (s) => s === "resolved" || s === "completed";
const statusesFor = (impact) => (impact === "maintenance" ? MAINTENANCE_STATUSES : INCIDENT_STATUSES);

const inputCls =
  "w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold-primary/40";
const btnCls =
  "px-4 py-2 rounded-md font-mono text-[11px] uppercase tracking-wider transition-colors disabled:opacity-40";

export default function StatusAdminPage() {
  const [incidents, setIncidents] = useState([]);
  const [components, setComponents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // create form
  const [title, setTitle] = useState("");
  const [impact, setImpact] = useState("minor");
  const [status, setStatus] = useState("investigating");
  const [affected, setAffected] = useState([]);
  const [message, setMessage] = useState("");
  const [schedFor, setSchedFor] = useState("");
  const [schedUntil, setSchedUntil] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/status/admin/incidents");
      setIncidents(data.incidents || []);
      setComponents(data.components || []);
      setErr("");
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to load incidents. Are you an admin?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // keep the status option valid when impact switches to/from maintenance
  useEffect(() => {
    const allowed = statusesFor(impact);
    if (!allowed.includes(status)) setStatus(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impact]);

  const toggleAffected = (key) =>
    setAffected((a) => (a.includes(key) ? a.filter((k) => k !== key) : [...a, key]));

  const create = async () => {
    if (!title.trim()) return setErr("Title is required.");
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
      setTitle(""); setMessage(""); setAffected([]); setSchedFor(""); setSchedUntil("");
      setImpact("minor"); setStatus("investigating");
      await load();
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to create incident.");
    } finally {
      setBusy(false);
    }
  };

  const postUpdate = async (id, newStatus, body) => {
    setBusy(true);
    try {
      await api.post(`/status/admin/incidents/${id}/updates`, { status: newStatus, message: body || "" });
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

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-semibold text-text-primary tracking-tight">Status — Incident Manager</h1>
          <p className="text-[12px] text-text-muted mt-1">
            Post & update incidents shown on the public{" "}
            <a href="/status" target="_blank" rel="noreferrer" className="text-gold-primary hover:underline">/status</a> page.
          </p>
        </div>
        <button onClick={load} className={`${btnCls} bg-white/[0.05] text-text-secondary hover:text-text-primary`}>
          Refresh
        </button>
      </div>

      {err && (
        <div className="mb-4 rounded-md border border-loss/30 bg-loss/10 px-3 py-2 text-[13px] text-red-300">{err}</div>
      )}

      {/* ── Create incident ─────────────────────────────── */}
      <section className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5 mb-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80 mb-4">New Incident</div>

        <label className="block text-[11px] text-text-muted mb-1">Title</label>
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Signals delivery delayed" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-[11px] text-text-muted mb-1">Impact</label>
            <select className={inputCls} value={impact} onChange={(e) => setImpact(e.target.value)}>
              {IMPACTS.map((i) => <option key={i.v} value={i.v}>{i.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-text-muted mb-1">Starting status</label>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              {statusesFor(impact).map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
            </select>
          </div>
        </div>

        {impact === "maintenance" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Scheduled from</label>
              <input type="datetime-local" className={inputCls} value={schedFor} onChange={(e) => setSchedFor(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">Until</label>
              <input type="datetime-local" className={inputCls} value={schedUntil} onChange={(e) => setSchedUntil(e.target.value)} />
            </div>
          </div>
        )}

        <label className="block text-[11px] text-text-muted mb-1 mt-3">Affected components</label>
        <div className="flex flex-wrap gap-2">
          {components.map((c) => (
            <button
              key={c.key}
              onClick={() => toggleAffected(c.key)}
              className={`px-2.5 py-1.5 rounded-md text-[12px] border transition-colors ${
                affected.includes(c.key)
                  ? "bg-gold-primary/15 text-gold-primary border-gold-primary/30"
                  : "bg-white/[0.03] text-text-secondary border-white/[0.08] hover:text-text-primary"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <label className="block text-[11px] text-text-muted mb-1 mt-3">First update (what users see)</label>
        <textarea
          className={`${inputCls} min-h-[70px]`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. We're investigating delays in signal delivery and will update shortly."
        />

        <div className="mt-4">
          <button onClick={create} disabled={busy} className={`${btnCls} bg-gold-primary/15 text-gold-primary border border-gold-primary/30 hover:bg-gold-primary/20`}>
            Publish incident
          </button>
        </div>
      </section>

      {/* ── Existing incidents ─────────────────────────── */}
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80 mb-3">All Incidents</div>
      {loading ? (
        <div className="py-10 text-center text-text-muted text-[13px]">Loading…</div>
      ) : incidents.length === 0 ? (
        <div className="py-10 text-center text-text-muted text-[13px]">No incidents yet. All clear.</div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <IncidentAdminCard key={inc.id} inc={inc} busy={busy} onUpdate={postUpdate} onDelete={remove} />
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentAdminCard({ inc, busy, onUpdate, onDelete }) {
  const accent = IMPACT_COLOR[inc.impact] || "#8a8a8a";
  const closed = isClosed(inc.status);
  const [newStatus, setNewStatus] = useState(inc.status);
  const [body, setBody] = useState("");

  const options = statusesFor(inc.impact);

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: closed ? "rgba(255,255,255,0.08)" : `${accent}40` }}>
      <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ background: closed ? "transparent" : `${accent}0d` }}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-text-primary/95 truncate">{inc.title}</span>
            {inc.auto && (
              <span className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-white/[0.06] text-text-muted border border-white/[0.08] flex-shrink-0">
                Auto
              </span>
            )}
          </div>
          <div className="font-mono text-[10px] text-text-muted mt-0.5">
            {inc.impact} · {(inc.affected || []).join(", ") || "no components"}
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm flex-shrink-0"
          style={{ color: closed ? "#22c55e" : accent, background: `${closed ? "#22c55e" : accent}1a` }}>
          {LABEL[inc.status] || inc.status}
        </span>
      </div>

      <div className="px-4 py-3 border-t border-white/[0.06]">
        {!closed ? (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              <select className={`${inputCls} sm:w-48`} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                {options.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
              </select>
              <input className={inputCls} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Update message (optional)" />
              <button
                onClick={() => { onUpdate(inc.id, newStatus, body); setBody(""); }}
                disabled={busy}
                className={`${btnCls} bg-gold-primary/15 text-gold-primary border border-gold-primary/30 hover:bg-gold-primary/20 whitespace-nowrap`}
              >
                Post update
              </button>
            </div>
            <p className="text-[11px] text-text-muted mt-2">
              Tip: post <b>Resolved</b> (or <b>Completed</b> for maintenance) to close it and move it to Past Incidents.
            </p>
          </>
        ) : (
          <p className="text-[12px] text-text-muted">Closed. Shown under “Past Incidents” on the public page.</p>
        )}

        {inc.updates?.length > 0 && (
          <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
            {inc.updates.slice().reverse().map((u, i) => (
              <div key={i} className="text-[12px]">
                <span className="font-mono text-[10px] uppercase tracking-wider mr-2" style={{ color: accent }}>{LABEL[u.status] || u.status}</span>
                <span className="font-mono text-[10px] text-text-muted mr-2">{u.created_at ? new Date(u.created_at).toLocaleString() : ""}</span>
                {u.body && <span className="text-text-primary/70">{u.body}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="mt-3">
          <button onClick={() => onDelete(inc.id)} disabled={busy} className="font-mono text-[10px] uppercase tracking-wider text-red-400/70 hover:text-red-400">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
