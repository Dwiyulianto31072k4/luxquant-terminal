// src/components/StatusPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — Public Status Page (status.anthropic.com style).
//
// WHY THIS PAGE IS DIFFERENT FROM EVERY OTHER PAGE
// ------------------------------------------------
// Feature pages need the backend to render their content, so when the backend
// is down they can't open. This page is the opposite: it is a STATIC asset
// (served by nginx, independent of the FastAPI process), and it never *depends*
// on the backend to render — its whole job is to REPORT on the backend.
//
// So instead of "fetch status, and if it fails show an error", the page probes
// the backend itself, entirely client-side, and turns the result into a verdict:
//   • /status/ping answers   → API is alive
//   • /status answers        → we also have the detailed per-component breakdown
//   • neither answers         → API is down → we SAY SO, confidently, in-browser
//
// The only thing that can stop this page from loading is nginx / the whole
// server going down — which no same-origin page can cover. For that layer you'd
// host a copy (or an external uptime monitor) on separate infra.
// ════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from "react";

const REFRESH_MS = 30_000;
const PING_TIMEOUT_MS = 4_000;
const STATUS_TIMEOUT_MS = 6_000;

// public state → visual language
const STATUS_META = {
  operational: { label: "Operational", color: "#22c55e", glow: "rgba(34,197,94,0.5)" },
  maintenance: { label: "Maintenance", color: "#3b82f6", glow: "rgba(59,130,246,0.5)" },
  degraded: { label: "Degraded", color: "#f5b301", glow: "rgba(245,179,1,0.5)" },
  major_outage: { label: "Major Outage", color: "#ef4444", glow: "rgba(239,68,68,0.55)" },
  unknown: { label: "Unknown", color: "#8a8a8a", glow: "rgba(138,138,138,0.35)" },
};
const meta = (s) => STATUS_META[s] || STATUS_META.unknown;

// incident lifecycle badge labels
const LIFECYCLE_LABEL = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
};
// impact → accent color for the incident card
const IMPACT_COLOR = {
  critical: "#ef4444",
  major: "#ef4444",
  minor: "#f5b301",
  maintenance: "#3b82f6",
};
const fmtTime = (iso) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "";
  }
};

function IncidentCard({ inc, past = false }) {
  const accent = IMPACT_COLOR[inc.impact] || "#8a8a8a";
  const badge = LIFECYCLE_LABEL[inc.status] || inc.status;
  const resolved = inc.status === "resolved" || inc.status === "completed";
  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: past ? "rgba(255,255,255,0.08)" : `${accent}40`, background: past ? "transparent" : `${accent}0d` }}
    >
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] text-white/95">{inc.title}</span>
              {inc.auto && (
                <span className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-white/[0.06] text-text-muted border border-white/[0.08]">
                  Auto-detected
                </span>
              )}
            </div>
            {inc.affected?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {inc.affected.map((k) => (
                  <span key={k} className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-white/[0.05] text-text-muted border border-white/[0.06]">
                    {k.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span
            className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm flex-shrink-0"
            style={{ color: resolved ? "#22c55e" : accent, background: `${resolved ? "#22c55e" : accent}1a` }}
          >
            {resolved ? LIFECYCLE_LABEL[inc.status] : badge}
          </span>
        </div>

        {inc.is_maintenance && (inc.scheduled_for || inc.scheduled_until) && (
          <div className="mt-2 font-mono text-[10px] text-text-muted">
            {inc.scheduled_for && `From ${fmtTime(inc.scheduled_for)}`}
            {inc.scheduled_until && ` → ${fmtTime(inc.scheduled_until)}`}
          </div>
        )}

        {inc.updates?.length > 0 && (
          <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
            {inc.updates.slice().reverse().map((u, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex-shrink-0 mt-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: accent }}>
                      {LIFECYCLE_LABEL[u.status] || u.status}
                    </span>
                    <span className="font-mono text-[10px] text-text-muted">{fmtTime(u.created_at)}</span>
                  </div>
                  {u.body && <p className="text-[13px] text-white/80 mt-0.5">{u.body}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// The component list we always want to show, even offline (so the page is never
// blank). When the backend answers, its richer list overrides this.
const FALLBACK_COMPONENTS = [
  { key: "platform", name: "Website & Sign-in", description: "Loading the app and signing in to your account." },
  { key: "signals", name: "Signals", description: "Live signals and their status updates." },
  { key: "market_data", name: "Market Data & Charts", description: "Prices, charts and market analytics." },
  { key: "distribution", name: "Notifications & Alerts", description: "Alerts and notifications you receive." },
  { key: "autotrade", name: "AutoTrade", description: "Automated trade execution." },
  { key: "ai_research", name: "AI Research", description: "AI market analysis and insights." },
  { key: "community", name: "News & Updates", description: "Crypto news and community updates." },
];

// fetch with a hard timeout — a hung request must not hang the probe.
async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" }, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

function StatusDot({ status, size = 9 }) {
  const m = meta(status);
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: size, height: size, background: m.color, boxShadow: `0 0 8px ${m.glow}` }}
    />
  );
}

function OverallBanner({ overall, label }) {
  const m = meta(overall);
  return (
    <div
      className="relative rounded-lg border overflow-hidden"
      style={{ borderColor: `${m.color}40`, background: `linear-gradient(180deg, ${m.color}14, transparent)` }}
    >
      <div className="absolute top-0 inset-x-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${m.color}, transparent)` }} />
      <div className="flex items-center gap-4 px-5 py-6 sm:px-7 sm:py-7">
        <StatusDot status={overall} size={16} />
        <div>
          <div className="text-lg sm:text-xl font-normal text-white tracking-tight">{label || m.label}</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] mt-1" style={{ color: m.color }}>
            LuxQuant Terminal
          </div>
        </div>
      </div>
    </div>
  );
}

function ComponentRow({ c }) {
  const m = meta(c.status);
  return (
    <div className="flex items-center justify-between gap-4 px-4 sm:px-5 py-4 border-b border-white/[0.06] last:border-b-0">
      <div className="min-w-0">
        <div className="text-[14px] text-white/90">{c.name}</div>
        {c.description && <div className="text-[12px] text-text-muted mt-0.5 truncate">{c.description}</div>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusDot status={c.status} />
        <span className="font-mono text-[11px] uppercase tracking-wider" style={{ color: m.color }}>
          {m.label}
        </span>
      </div>
    </div>
  );
}

const OVERALL_LABEL = {
  operational: "All systems operational",
  degraded: "Some systems degraded",
  major_outage: "Major outage",
  unknown: "Status unknown",
};

export default function StatusPage() {
  const [view, setView] = useState(null); // { overall, label, components, updatedAt, note }
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Two independent client-side probes. We never trust a single call.
    // 1) ping = "is the API alive at all?"  2) status = "detailed breakdown".
    const [pingRes, statusRes] = await Promise.allSettled([
      fetchWithTimeout("/api/v1/status/ping", PING_TIMEOUT_MS),
      fetchWithTimeout("/api/v1/status", STATUS_TIMEOUT_MS),
    ]);

    const apiAlive = pingRes.status === "fulfilled" && pingRes.value.ok;

    let detail = null;
    if (statusRes.status === "fulfilled" && statusRes.value.ok) {
      try {
        detail = await statusRes.value.json();
      } catch {
        detail = null;
      }
    }

    if (detail && Array.isArray(detail.components)) {
      // Backend answered fully — use its rich, authoritative breakdown.
      setView({
        overall: detail.overall || "operational",
        label: detail.overall_label || OVERALL_LABEL[detail.overall] || "",
        components: detail.components,
        incidents: detail.incidents || [],
        past: detail.past_incidents || [],
        updatedAt: detail.updated_at ? new Date(detail.updated_at) : new Date(),
        note: detail.note || "",
      });
    } else if (apiAlive) {
      // API is up but the detailed status didn't come back — partial view.
      setView({
        overall: "degraded",
        label: "Running — detailed status temporarily unavailable",
        components: FALLBACK_COMPONENTS.map((c) => ({
          ...c,
          status: c.key === "platform" ? "operational" : "unknown",
        })),
        updatedAt: new Date(),
        note: "The platform is responding, but the detailed component status couldn't be loaded right now.",
      });
    } else {
      // Neither probe answered → the platform is not responding. Say it plainly.
      // This verdict is computed entirely in the browser — no backend needed.
      setView({
        overall: "major_outage",
        label: "Platform is not responding",
        components: FALLBACK_COMPONENTS.map((c) => ({
          ...c,
          status: c.key === "platform" ? "major_outage" : "unknown",
        })),
        updatedAt: new Date(),
        note: "We can't reach the platform from your browser. It may be down or undergoing maintenance. This page refreshes automatically.",
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const updatedText = view?.updatedAt
    ? view.updatedAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "";

  return (
    <div className="min-h-screen bg-bg-primary text-white">
      <header className="border-b border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-sm overflow-hidden border border-white/[0.06]">
              <img src="/logo.png" alt="LuxQuant" className="w-full h-full object-cover" />
            </div>
            <span className="text-[14px] font-normal text-white tracking-tight group-hover:text-gold-primary transition-colors">
              LuxQuant Status
            </span>
          </a>
          <a href="/" className="font-mono text-[11px] uppercase tracking-wider text-text-muted hover:text-white transition-colors">
            ← Terminal
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border border-gold-primary/20 border-t-gold-primary rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <OverallBanner overall={view.overall} label={view.label} />

            {view.note && <p className="mt-4 text-[13px] text-text-muted">{view.note}</p>}

            {view.incidents?.length > 0 && (
              <section className="mt-6 space-y-3">
                {view.incidents.map((inc) => (
                  <IncidentCard key={inc.id} inc={inc} />
                ))}
              </section>
            )}

            {view.components?.length > 0 && (
              <section className="mt-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-px w-4 bg-gold-primary/40" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">Components</span>
                  <span className="h-px flex-1 bg-white/[0.06]" />
                </div>
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
                  {view.components.map((c) => (
                    <ComponentRow key={c.key} c={c} />
                  ))}
                </div>
              </section>
            )}

            {view.past?.length > 0 && (
              <section className="mt-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-px w-4 bg-white/20" />
                  <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">Past Incidents</span>
                  <span className="h-px flex-1 bg-white/[0.06]" />
                </div>
                <div className="space-y-3">
                  {view.past.map((inc) => (
                    <IncidentCard key={inc.id} inc={inc} past />
                  ))}
                </div>
              </section>
            )}

            <div className="mt-8 flex items-center justify-between font-mono text-[11px] text-text-muted">
              <span>{updatedText ? `Updated ${updatedText}` : ""}</span>
              <button onClick={load} className="uppercase tracking-wider hover:text-white transition-colors">
                Refresh
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
