import React from "react";

const statusTone = {
  healthy: {
    badge: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    text: "text-emerald-300",
    dot: "bg-emerald-300",
  },
  degraded: {
    badge: "border-amber-300/20 bg-amber-300/10 text-amber-200",
    text: "text-amber-200",
    dot: "bg-amber-300",
  },
  critical: {
    badge: "border-red-400/20 bg-red-400/10 text-red-300",
    text: "text-red-300",
    dot: "bg-red-400",
  },
  unknown: {
    badge: "border-white/15 bg-white/5 text-white/45",
    text: "text-white/45",
    dot: "bg-white/35",
  },
};

const severityTone = {
  info: "text-white/35",
  warning: "text-amber-200",
  critical: "text-red-300",
};

function normalizeStatus(value) {
  return String(value || "unknown").replaceAll("_", " ");
}

function statusLabel(value) {
  return normalizeStatus(value).toUpperCase();
}

function getCheck(data, key) {
  return (data?.checks || []).find((item) => item.key === key);
}

function formatTimestamp(value) {
  if (!value) return "not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CheckCard({ check }) {
  const tone = statusTone[check?.status] || statusTone.unknown;
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.06] bg-black/15 p-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
        <span className="truncate text-[11px] font-mono uppercase tracking-[0.12em] text-white/35">
          {check?.label || "Unknown check"}
        </span>
      </div>
      <div className={`mt-2 text-sm font-semibold ${tone.text}`}>
        {statusLabel(check?.status)}
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-white/35">
        {check?.detail || "No detail available."}
      </p>
    </div>
  );
}

function AlertRow({ alert }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-black/10 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[9px] font-mono uppercase tracking-wider ${severityTone[alert.severity] || severityTone.info}`}>
          {alert.severity || "info"}
        </span>
        <span className="text-xs text-white/75">{alert.title}</span>
        {alert.runbook && (
          <span className="ml-auto text-[9px] font-mono uppercase text-white/25">
            runbook: {alert.runbook}
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-white/35">
        {alert.detail}
      </p>
    </div>
  );
}

export default function OperationalStatusPanel({ data }) {
  if (!data) {
    return (
      <section className="min-w-0 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#f5c451]">
          Phase 7 / Monitoring
        </div>
        <p className="mt-2 text-sm text-white/45">
          Operational health is unavailable. Market data can still display, but
          runtime alerts could not be loaded.
        </p>
      </section>
    );
  }

  const tone = statusTone[data.status] || statusTone.unknown;
  const alerts = data.alerts || [];
  const keyChecks = [
    getCheck(data, "latest_report"),
    getCheck(data, "redis"),
    getCheck(data, "backend_service"),
    getCheck(data, "arena_timer"),
    getCheck(data, "evaluator_timer"),
    getCheck(data, "liquidation_stream"),
  ].filter(Boolean);

  return (
    <section className="min-w-0 rounded-2xl border border-[#f5c451]/15 bg-[#0f0b12]/90 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#f5c451]/75">
            Phase 7 / Monitoring and runbooks
          </div>
          <h2 className="mt-1 text-xl font-medium text-white/90 md:text-2xl">
            Operational Health
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-white/45">
            {data.summary}
          </p>
        </div>
        <span className={`rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider ${tone.badge}`}>
          {statusLabel(data.status)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {keyChecks.map((check) => (
          <CheckCard key={check.key} check={check} />
        ))}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-white/35">
              Active alerts
            </div>
            <span className="text-[9px] font-mono uppercase text-white/25">
              {alerts.length} open
            </span>
          </div>
          {alerts.length ? (
            <div className="space-y-2">
              {alerts.slice(0, 4).map((alert) => (
                <AlertRow key={`${alert.key}-${alert.severity}`} alert={alert} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-400/10 bg-emerald-400/[0.03] px-3 py-3 text-xs text-emerald-200/70">
              No active runtime alerts.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5">
          <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-white/35">
            Latest report
          </div>
          <div className="mt-3 space-y-2 text-[11px] font-mono text-white/45">
            <div className="flex justify-between gap-3">
              <span>Report ID</span>
              <span className="truncate text-white/70">
                {data.latest_report?.report_id || "-"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Captured</span>
              <span className="text-white/70">
                {formatTimestamp(data.latest_report?.timestamp)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Evidence status</span>
              <span className={tone.text}>
                {statusLabel(data.latest_report?.dashboard_health_status)}
              </span>
            </div>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-white/30">
            Phase 7 only checks runtime health. It cannot change market
            direction, confidence, entries, or thesis.
          </p>
        </div>
      </div>
    </section>
  );
}
