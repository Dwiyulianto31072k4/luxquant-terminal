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
import Seo from "./Seo";

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
// per-update colour so the timeline reads state at a glance
const UPDATE_COLOR = (status) => {
  if (status === "resolved" || status === "completed") return palette.green[400];
  if (status === "monitoring" || status === "scheduled" || status === "in_progress") return palette.blue[400];
  if (status === "identified" || status === "investigating") return palette.amber[400];
  return palette.warm[400];
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
  { key: "other", name: "Other Features", description: "Pulse, Markets, On-Chain, Journal, Portfolio & more." },
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

function OverallBanner({ overall, label, counts = {} }) {
  const c = meta(overall).color;
  const chips = [
    ["operational", "Operational"], ["degraded", "Degraded"],
    ["major_outage", "Outage"], ["maintenance", "Maintenance"],
  ].filter(([k]) => (counts[k] || 0) > 0);
  return (
    <div className="relative rounded-2xl border overflow-hidden shadow-2xl shadow-black/40" style={{ borderColor: tint(c, 0.3), background: "rgb(var(--surface-raised))" }}>
      <div className="absolute top-0 inset-x-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${c}, transparent)` }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(130% 120% at 0% 0%, ${tint(c, 0.1)}, transparent 55%)` }} />
      <div className="relative flex flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-7">
        <div className="flex items-center gap-4">
          <Dot status={overall} size={16} ping={overall === "major_outage"} />
          <div>
            <div className="text-lg sm:text-2xl font-light tracking-tight text-text-primary" style={{ letterSpacing: "-0.01em" }}>{label || meta(overall).label}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] mt-1.5" style={{ color: c }}>LuxQuant Terminal</div>
          </div>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {chips.map(([k, lbl]) => (
              <span key={k} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5" style={{ borderColor: tint(meta(k).color, 0.25), background: tint(meta(k).color, 0.08) }}>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: meta(k).color, boxShadow: `0 0 6px ${tint(meta(k).color, 0.6)}` }} />
                <span className="font-mono text-[13px] tabular-nums font-semibold" style={{ color: meta(k).color }}>{counts[k]}</span>
                <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: palette.warm[300] }}>{lbl}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ComponentRow({ c }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 sm:px-5 py-4 border-b last:border-b-0" style={{ borderColor: "rgb(var(--ink) / 0.06)" }}>
      <div className="min-w-0">
        <div className="text-[14px] text-text-primary/90">{c.name}</div>
        {c.description && <div className="text-[12px] mt-0.5 truncate" style={{ color: palette.warm[400] }}>{c.description}</div>}
      </div>
      <StatusPill status={c.status} />
    </div>
  );
}

function IncidentCard({ inc, past = false }) {
  const accent = IMPACT_COLOR[inc.impact] || palette.warm[400];
  const closed = inc.status === "resolved" || inc.status === "completed";
  const headColor = closed ? palette.green[400] : accent;
  const updates = inc.updates?.length > 0 ? inc.updates.slice().reverse() : [];
  return (
    <div className="relative rounded-2xl border overflow-hidden shadow-xl shadow-black/30" style={{ borderColor: past ? "rgb(var(--ink) / 0.07)" : tint(accent, 0.3), background: "rgb(var(--surface-raised))" }}>
      <div className="absolute top-0 inset-x-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${tint(headColor, 0.5)}, transparent)` }} />
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] sm:text-[15px] text-text-primary/95 font-medium">{inc.title}</span>
              {inc.auto && <span className="font-mono text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-md" style={{ background: "rgb(var(--ink) / 0.05)", color: palette.warm[300], border: "1px solid rgb(var(--ink) / 0.08)" }}>Auto-detected</span>}
            </div>
            {inc.affected?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {inc.affected.map((k) => <span key={k} className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-md" style={{ background: "rgb(var(--ink) / 0.04)", color: palette.warm[400], border: "1px solid rgb(var(--ink) / 0.06)" }}>{k.replace(/_/g, " ")}</span>)}
              </div>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-md flex-shrink-0" style={{ color: headColor, background: tint(headColor, 0.12), border: `1px solid ${tint(headColor, 0.25)}` }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: headColor, boxShadow: `0 0 6px ${tint(headColor, 0.6)}` }} />
            {LIFECYCLE_LABEL[inc.status] || inc.status}
          </span>
        </div>

        {inc.is_maintenance && (inc.scheduled_for || inc.scheduled_until) && (
          <div className="mt-2 font-mono text-[10px]" style={{ color: palette.warm[400] }}>
            {inc.scheduled_for && `From ${fmtTime(inc.scheduled_for)}`}{inc.scheduled_until && ` → ${fmtTime(inc.scheduled_until)}`}
          </div>
        )}

        {/* ── timeline: each update is a dated node on a connecting rail ── */}
        {updates.length > 0 && (
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "rgb(var(--ink) / 0.06)" }}>
            <div className="relative">
              {updates.length > 1 && (
                <span className="absolute left-[6px] top-2 bottom-2 w-px" style={{ background: "rgb(var(--ink) / 0.1)" }} />
              )}
              <div className="space-y-4">
                {updates.map((u, i) => {
                  const uc = UPDATE_COLOR(u.status);
                  return (
                    <div key={i} className="relative pl-6">
                      <span className="absolute left-[1px] top-[3px] w-[11px] h-[11px] rounded-full" style={{ background: uc, boxShadow: `0 0 8px ${tint(uc, 0.55)}`, border: "2px solid rgb(var(--surface-raised))" }} />
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider" style={{ color: uc }}>{LIFECYCLE_LABEL[u.status] || u.status}</span>
                        <span className="font-mono text-[10px] tabular-nums" style={{ color: palette.warm[500] }}>{fmtTime(u.created_at)}</span>
                      </div>
                      {u.body && <p className="text-[13px] leading-relaxed mt-1" style={{ color: palette.warm[200] }}>{u.body}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
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
    <span className="h-px flex-1" style={{ background: "rgb(var(--ink) / 0.06)" }} />
  </div>
);

// ── page ──────────────────────────────────────────────────────────────
const PAST_PER_PAGE = 5;

export default function StatusPage() {
  const [view, setView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pastPage, setPastPage] = useState(0);

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

  // Past incidents: paginate so the page never grows unbounded (status-page best practice)
  const pastAll = view?.past || [];
  const pastPages = Math.max(1, Math.ceil(pastAll.length / PAST_PER_PAGE));
  const safePage = Math.min(pastPage, pastPages - 1);
  const pastSlice = pastAll.slice(safePage * PAST_PER_PAGE, safePage * PAST_PER_PAGE + PAST_PER_PAGE);

  return (
    <div className="min-h-screen relative" style={{ background: palette.maroon[900] }}>
      <Seo
        title="LuxQuant Status — Platform & API Uptime"
        description="Live operational status for the LuxQuant Terminal platform, API, and data services. Real-time uptime and incident history."
        path="/status"
        keywords="luxquant status, luxquant uptime, luxquant api status"
      />
      <div className="luxury-bg" />

      {/* top bar */}
      <header className="relative z-10 border-b" style={{ borderColor: "rgb(var(--ink) / 0.06)" }}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-sm overflow-hidden border" style={{ borderColor: "rgb(var(--ink) / 0.06)" }}>
              <img src="/logo-512.png" alt="LuxQuant" className="w-full h-full object-cover" />
            </div>
            <span className="text-[14px] font-normal text-text-primary tracking-tight group-hover:text-gold-primary transition-colors">LuxQuant Status</span>
          </a>
          <a href="/" className="font-mono text-[11px] uppercase tracking-wider transition-colors hover:text-text-primary" style={{ color: palette.warm[400] }}>← Terminal</a>
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
                    <span className="text-text-primary">System </span>
                    <span style={{ background: gradient.goldText, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Status</span>
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-4 font-mono text-[11px]" style={{ color: palette.warm[400] }}>
                {updatedText && <span>Updated {updatedText}</span>}
                <span className="hidden sm:inline" style={{ color: palette.warm[500] }}>· Auto 30s</span>
                <button onClick={load} className="uppercase tracking-wider hover:text-text-primary transition-colors">Refresh</button>
              </div>
            </div>

            <OverallBanner overall={view.overall} label={view.label} counts={counts} />

            {view.note && <p className="mt-4 text-[13px]" style={{ color: palette.warm[400] }}>{view.note}</p>}

            {/* active incidents — full width, readable timelines */}
            {view.incidents?.length > 0 && (
              <section className="mt-6 space-y-3">
                {view.incidents.map((inc) => <IncidentCard key={inc.id} inc={inc} />)}
              </section>
            )}

            {/* full-width single column — status-page convention, no empty side rail */}
            <section className="mt-8">
              <SectionLabel>Components</SectionLabel>
              <div className="relative rounded-2xl border overflow-hidden shadow-xl shadow-black/30" style={{ borderColor: "rgb(var(--ink) / 0.07)", background: "rgb(var(--surface-raised))" }}>
                <div className="absolute top-0 inset-x-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${tint(palette.gold[300], 0.45)}, transparent)` }} />
                {view.components.map((c) => <ComponentRow key={c.key} c={c} />)}
              </div>
            </section>

            {pastAll.length > 0 && (
              <section className="mt-8">
                <div className="flex items-center gap-2 mb-3">
                  <span className="h-px w-4" style={{ background: tint(palette.gold[300], 0.4) }} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: tint(palette.gold[300], 0.8) }}>Past Incidents</span>
                  <span className="h-px flex-1" style={{ background: "rgb(var(--ink) / 0.06)" }} />
                  <span className="font-mono text-[10px] tabular-nums whitespace-nowrap" style={{ color: palette.warm[500] }}>{pastAll.length} total</span>
                </div>
                <div className="space-y-3">
                  {pastSlice.map((inc) => <IncidentCard key={inc.id} inc={inc} past />)}
                </div>

                {pastPages > 1 && (
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                      onClick={() => setPastPage((p) => Math.max(0, p - 1))}
                      disabled={safePage <= 0}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors disabled:opacity-25 disabled:cursor-not-allowed hover:text-text-primary"
                      style={{ borderColor: "rgb(var(--ink) / 0.1)", background: "rgb(var(--surface-raised))", color: palette.warm[300] }}
                    >
                      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                      Prev
                    </button>
                    <span className="font-mono text-[10px] uppercase tracking-wider tabular-nums" style={{ color: palette.warm[400] }}>Page {safePage + 1} / {pastPages}</span>
                    <button
                      onClick={() => setPastPage((p) => Math.min(pastPages - 1, p + 1))}
                      disabled={safePage >= pastPages - 1}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors disabled:opacity-25 disabled:cursor-not-allowed hover:text-text-primary"
                      style={{ borderColor: "rgb(var(--ink) / 0.1)", background: "rgb(var(--surface-raised))", color: palette.warm[300] }}
                    >
                      Next
                      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
