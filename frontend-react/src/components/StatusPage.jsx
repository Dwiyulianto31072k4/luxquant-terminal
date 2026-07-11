// src/components/StatusPage.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — Public Status Page (status.anthropic.com style).
//
// Standalone (no login, no AppShell) but visually part of the product: same
// maroon canvas, gold-rail header, design-system tokens, and the full-bleed
// max-w-[1600px] rhythm every other page uses — NOT a narrow centered card.
//
// Resilience: this is a static asset. It probes the backend client-side, so if
// the API is down it still renders and says so ("Platform is not responding"),
// computed entirely in the browser.
// ════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from "react";
import { palette, tint, gradient } from "./admin/designSystem";

const REFRESH_MS = 30_000;
const PING_TIMEOUT_MS = 4_000;
const STATUS_TIMEOUT_MS = 6_000;

const STATUS_META = {
  operational: { label: "Operational", color: palette.green[400] },
  maintenance: { label: "Maintenance", color: palette.blue[400] },
  degraded: { label: "Degraded", color: palette.amber[400] },
  major_outage: { label: "Major Outage", color: palette.red[400] },
  unknown: { label: "Unknown", color: palette.warm[400] },
};
const meta = (s) => STATUS_META[s] || STATUS_META.unknown;

const LIFECYCLE_LABEL = {
  investigating: "Investigating", identified: "Identified", monitoring: "Monitoring",
  resolved: "Resolved", scheduled: "Scheduled", in_progress: "In progress", completed: "Completed",
};
const IMPACT_COLOR = {
  critical: palette.red[400], major: palette.red[400], minor: palette.amber[400], maintenance: palette.blue[400],
};
const OVERALL_LABEL = {
  operational: "All systems operational", maintenance: "Under maintenance",
  degraded: "Some systems degraded", major_outage: "Major outage", unknown: "Status unknown",
};

const fmtTime = (iso) => { if (!iso) return ""; try { return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; } };

const FALLBACK_COMPONENTS = [
  { key: "platform", name: "Website & Sign-in", description: "Loading the app and signing in to your account." },
  { key: "signals", name: "Signals", description: "Live signals and their status updates." },
  { key: "market_data", name: "Market Data & Charts", description: "Prices, charts and market analytics." },
  { key: "distribution", name: "Notifications & Alerts", description: "Alerts and notifications you receive." },
  { key: "autotrade", name: "AutoTrade", description: "Automated trade execution." },
  { key: "ai_research", name: "AI Research", description: "AI market analysis and insights." },
  { key: "community", name: "News & Updates", description: "Crypto news and community updates." },
];

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" }, cache: "no-store" }); }
  finally { clearTimeout(t); }
}

// ── atoms ─────────────────────────────────────────────────────────────
function Dot({ status, size = 9, ping = false }) {
  const c = meta(status).color;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {ping && <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: c }} />}
      <span className="relative inline-block rounded-full" style={{ width: size, height: size, background: c, boxShadow: `0 0 8px ${tint(c, 0.5)}` }} />
    </span>
  );
}

function StatusPill({ status }) {
  const c = meta(status).color;
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider" style={{ color: c }}>
      <Dot status={status} size={8} ping={status === "major_outage"} />
      {meta(status).label}
    </span>
  );
}

function OverallBanner({ overall, label }) {
  const c = meta(overall).color;
  return (
    <div className="relative rounded-xl border overflow-hidden" style={{ borderColor: tint(c, 0.28), background: `linear-gradient(180deg, ${tint(c, 0.08)}, transparent)` }}>
      <div className="absolute top-0 inset-x-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c}, transparent)` }} />
      <div className="flex items-center gap-4 px-5 py-6 sm:px-8 sm:py-7">
        <Dot status={overall} size={16} ping={overall === "major_outage"} />
        <div>
          <div className="text-lg sm:text-2xl font-light tracking-tight text-white" style={{ letterSpacing: "-0.01em" }}>{label || meta(overall).label}</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] mt-1.5" style={{ color: c }}>LuxQuant Terminal</div>
        </div>
      </div>
    </div>
  );
}

function ComponentRow({ c }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 sm:px-5 py-4 border-b last:border-b-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="min-w-0">
        <div className="text-[14px] text-white/90">{c.name}</div>
        {c.description && <div className="text-[12px] mt-0.5 truncate" style={{ color: palette.warm[400] }}>{c.description}</div>}
      </div>
      <StatusPill status={c.status} />
    </div>
  );
}

function IncidentCard({ inc, past = false }) {
  const accent = IMPACT_COLOR[inc.impact] || palette.warm[400];
  const closed = inc.status === "resolved" || inc.status === "completed";
  return (
    <div className="relative rounded-xl border overflow-hidden" style={{ borderColor: past ? "rgba(255,255,255,0.08)" : tint(accent, 0.28), background: past ? "transparent" : tint(accent, 0.05) }}>
      <div className="absolute top-0 inset-x-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${tint(accent, 0.4)}, transparent)` }} />
      <div className="px-4 sm:px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] text-white/95">{inc.title}</span>
              {inc.auto && <span className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: palette.warm[300], border: "1px solid rgba(255,255,255,0.08)" }}>Auto-detected</span>}
            </div>
            {inc.affected?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {inc.affected.map((k) => <span key={k} className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: palette.warm[400], border: "1px solid rgba(255,255,255,0.06)" }}>{k.replace(/_/g, " ")}</span>)}
              </div>
            )}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded flex-shrink-0" style={{ color: closed ? palette.green[400] : accent, background: `${tint(closed ? palette.green[400] : accent, 0.12)}` }}>
            {LIFECYCLE_LABEL[inc.status] || inc.status}
          </span>
        </div>

        {inc.is_maintenance && (inc.scheduled_for || inc.scheduled_until) && (
          <div className="mt-2 font-mono text-[10px]" style={{ color: palette.warm[400] }}>
            {inc.scheduled_for && `From ${fmtTime(inc.scheduled_for)}`}{inc.scheduled_until && ` → ${fmtTime(inc.scheduled_until)}`}
          </div>
        )}

        {inc.updates?.length > 0 && (
          <div className="mt-3 space-y-3 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            {inc.updates.slice().reverse().map((u, i) => (
              <div key={i} className="flex gap-3">
                <span className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: accent }} />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: accent }}>{LIFECYCLE_LABEL[u.status] || u.status}</span>
                    <span className="font-mono text-[10px]" style={{ color: palette.warm[500] }}>{fmtTime(u.created_at)}</span>
                  </div>
                  {u.body && <p className="text-[13px] mt-0.5" style={{ color: palette.warm[200] }}>{u.body}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SectionLabel = ({ children }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className="h-px w-4" style={{ background: tint(palette.gold[300], 0.4) }} />
    <span className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: tint(palette.gold[300], 0.8) }}>{children}</span>
    <span className="h-px flex-1" style={{ background: "rgba(255,255,255,0.06)" }} />
  </div>
);

// ── page ──────────────────────────────────────────────────────────────
export default function StatusPage() {
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [pingRes, statusRes] = await Promise.allSettled([
      fetchWithTimeout("/api/v1/status/ping", PING_TIMEOUT_MS),
      fetchWithTimeout("/api/v1/status", STATUS_TIMEOUT_MS),
    ]);
    const apiAlive = pingRes.status === "fulfilled" && pingRes.value.ok;
    let detail = null;
    if (statusRes.status === "fulfilled" && statusRes.value.ok) {
      try { detail = await statusRes.value.json(); } catch { detail = null; }
    }

    if (detail && Array.isArray(detail.components)) {
      setView({ overall: detail.overall || "operational", label: detail.overall_label || OVERALL_LABEL[detail.overall] || "", components: detail.components, incidents: detail.incidents || [], past: detail.past_incidents || [], updatedAt: detail.updated_at ? new Date(detail.updated_at) : new Date(), note: detail.note || "" });
    } else if (apiAlive) {
      setView({ overall: "degraded", label: "Running — detailed status temporarily unavailable", components: FALLBACK_COMPONENTS.map((c) => ({ ...c, status: c.key === "platform" ? "operational" : "unknown" })), incidents: [], past: [], updatedAt: new Date(), note: "The platform is responding, but the detailed component status couldn't be loaded right now." });
    } else {
      setView({ overall: "major_outage", label: "Platform is not responding", components: FALLBACK_COMPONENTS.map((c) => ({ ...c, status: c.key === "platform" ? "major_outage" : "unknown" })), incidents: [], past: [], updatedAt: new Date(), note: "We can't reach the platform from your browser. It may be down or undergoing maintenance. This page refreshes automatically." });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const counts = (() => {
    const c = { operational: 0, degraded: 0, major_outage: 0, maintenance: 0, unknown: 0 };
    (view?.components || []).forEach((x) => { c[x.status] = (c[x.status] || 0) + 1; });
    return c;
  })();
  const updatedText = view?.updatedAt ? fmtTime(view.updatedAt.toISOString()) : "";

  return (
    <div className="min-h-screen relative" style={{ background: palette.maroon[900] }}>
      <div className="luxury-bg" />

      {/* top bar */}
      <header className="relative z-10 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-sm overflow-hidden border" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <img src="/logo.png" alt="LuxQuant" className="w-full h-full object-cover" />
            </div>
            <span className="text-[14px] font-normal text-white tracking-tight group-hover:text-gold-primary transition-colors">LuxQuant Status</span>
          </a>
          <a href="/" className="font-mono text-[11px] uppercase tracking-wider transition-colors hover:text-white" style={{ color: palette.warm[400] }}>← Terminal</a>
        </div>
      </header>

      <main className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-28">
            <div className="w-6 h-6 rounded-full animate-spin" style={{ border: `1px solid ${tint(palette.gold[300], 0.2)}`, borderTopColor: palette.gold[300] }} />
          </div>
        ) : (
          <>
            {/* title block (Management-System language) */}
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
              <div className="flex items-stretch gap-3.5">
                <div className="w-[3px] shrink-0 rounded-full" style={{ background: `linear-gradient(to bottom, ${palette.gold[300]}, ${tint(palette.gold[300], 0.4)}, transparent)` }} />
                <div>
                  <p className="text-[10px] uppercase tracking-[0.32em] font-semibold leading-none mb-2" style={{ color: tint(palette.gold[300], 0.6) }}>LuxQuant</p>
                  <h1 className="text-[26px] sm:text-[30px] font-light tracking-tight leading-none" style={{ letterSpacing: "-0.02em" }}>
                    <span className="text-white">System </span>
                    <span style={{ background: gradient.goldText, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Status</span>
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-4 font-mono text-[11px]" style={{ color: palette.warm[400] }}>
                {updatedText && <span>Updated {updatedText}</span>}
                <button onClick={load} className="uppercase tracking-wider hover:text-white transition-colors">Refresh</button>
              </div>
            </div>

            <OverallBanner overall={view.overall} label={view.label} />

            {view.note && <p className="mt-4 text-[13px]" style={{ color: palette.warm[400] }}>{view.note}</p>}

            {/* active incidents — full width, readable timelines */}
            {view.incidents?.length > 0 && (
              <section className="mt-6 space-y-3">
                {view.incidents.map((inc) => <IncidentCard key={inc.id} inc={inc} />)}
              </section>
            )}

            {/* components (2/3) + summary rail (1/3) — fills the width */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-8">
              <section className="lg:col-span-2">
                <SectionLabel>Components</SectionLabel>
                <div className="rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
                  {view.components.map((c) => <ComponentRow key={c.key} c={c} />)}
                </div>
              </section>

              <aside className="lg:col-span-1">
                <SectionLabel>Summary</SectionLabel>
                <div className="rounded-xl border p-5" style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0a0805" }}>
                  <div className="flex items-center gap-3">
                    <Dot status={view.overall} size={12} />
                    <span className="text-[14px] text-white/90">{meta(view.overall).label}</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {[
                      ["operational", "Operational"],
                      ["degraded", "Degraded"],
                      ["major_outage", "Outage"],
                      ["maintenance", "Maintenance"],
                    ].filter(([k]) => counts[k] > 0).map(([k, lbl]) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-2 text-[12px]" style={{ color: palette.warm[300] }}>
                          <span className="inline-block w-2 h-2 rounded-full" style={{ background: meta(k).color }} />{lbl}
                        </span>
                        <span className="font-mono text-[13px] tabular-nums" style={{ color: meta(k).color }}>{counts[k]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 pt-4 border-t font-mono text-[10px]" style={{ borderColor: "rgba(255,255,255,0.06)", color: palette.warm[500] }}>
                    Auto-refreshes every 30s.
                  </div>
                </div>
              </aside>
            </div>

            {view.past?.length > 0 && (
              <section className="mt-10">
                <SectionLabel>Past Incidents</SectionLabel>
                <div className="space-y-3">
                  {view.past.map((inc) => <IncidentCard key={inc.id} inc={inc} past />)}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
