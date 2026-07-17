import React from "react";

const statusTone = {
  healthy: {
    badge: "border-profit/20 bg-profit/10 text-profit",
    accent: "text-profit",
  },
  degraded: {
    badge: "border-accent/20 bg-accent/10 text-accent",
    accent: "text-accent",
  },
  limited: {
    badge: "border-accent/20 bg-accent/10 text-accent",
    accent: "text-accent",
  },
  unavailable: {
    badge: "border-negative/20 bg-negative/10 text-loss",
    accent: "text-loss",
  },
};

const sourceTone = {
  fresh: "bg-profit",
  stale: "bg-accent",
  unavailable: "bg-negative",
};

const supportTone = {
  supported: "text-profit",
  guarded: "text-accent",
  conflicted: "text-loss",
  limited: "text-accent",
  unavailable: "text-loss",
};

const directionTone = {
  bullish: "text-profit",
  bearish: "text-loss",
  neutral: "text-accent",
};

function formatPct(value) {
  if (value == null) return "-";
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "-";
}

function formatAge(seconds) {
  if (seconds == null) return "age unknown";
  const number = Number(seconds);
  if (!Number.isFinite(number)) return "age unknown";
  if (number < 60) return `${Math.round(number)}s`;
  if (number < 3600) return `${Math.round(number / 60)}m`;
  return `${(number / 3600).toFixed(1)}h`;
}

function directionLabel(value) {
  return String(value || "unavailable")
    .replaceAll("_", " ")
    .toUpperCase();
}

function SummaryCard({ label, value, note, tone = "text-text-primary/85" }) {
  return (
    <div className="min-w-0 rounded-xl border border-ink/[0.06] bg-scrim/15 p-3.5">
      <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/35">
        {label}
      </div>
      <div className={`mt-2 truncate text-lg font-mono font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 text-[10px] leading-relaxed text-text-primary/35">{note}</div>
    </div>
  );
}

function HorizonCard({ horizon, data }) {
  const support = data?.support || "unavailable";
  const comparison = data?.comparison || "unavailable";
  return (
    <div className="min-w-0 rounded-xl border border-ink/[0.07] bg-ink/[0.02] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-primary/35">
            {horizon} outlook
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span
              className={`text-xl font-semibold ${directionTone[data?.verdict_direction] || "text-text-primary/70"}`}
            >
              {directionLabel(data?.verdict_direction)}
            </span>
            <span className="font-mono text-sm text-accent">
              {data?.verdict_confidence != null ? `${data.verdict_confidence}%` : "-"}
            </span>
          </div>
        </div>
        <span
          className={`text-[9px] font-mono uppercase tracking-wider ${supportTone[support] || supportTone.unavailable}`}
        >
          {support}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-ink/[0.05] bg-scrim/15 p-3">
          <div className="text-[9px] font-mono uppercase text-text-primary/30">Evidence bias</div>
          <div
            className={`mt-1 text-sm font-mono ${directionTone[data?.evidence_bias] || "text-text-primary/55"}`}
          >
            {directionLabel(data?.evidence_bias)}
          </div>
        </div>
        <div className="rounded-lg border border-ink/[0.05] bg-scrim/15 p-3">
          <div className="text-[9px] font-mono uppercase text-text-primary/30">Coverage</div>
          <div className="mt-1 text-sm font-mono text-text-primary/75">
            {formatPct(data?.coverage)}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-text-primary/40">
        <span>
          {comparison === "aligned"
            ? "verdict aligned"
            : comparison === "conflict"
              ? "verdict conflict"
              : "neutral comparison"}
        </span>
        <span>{data?.conflict_count || 0} opposing layer(s)</span>
        <span>{data?.unavailable_rows || 0} unavailable</span>
      </div>
    </div>
  );
}

function SourceCard({ source }) {
  const status = source?.status || "unavailable";
  return (
    <div className="min-w-0 rounded-lg border border-ink/[0.05] bg-scrim/10 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${sourceTone[status] || sourceTone.unavailable}`}
        />
        <span className="truncate text-[11px] text-text-primary/65">{source.label}</span>
        <span className="ml-auto shrink-0 text-[9px] font-mono uppercase text-text-primary/30">
          {status}
        </span>
      </div>
      <div className="mt-1 truncate pl-3.5 text-[9px] font-mono text-text-primary/25">
        {source.provider} / {formatAge(source.age_seconds)}
      </div>
    </div>
  );
}

function ChangeText({ change }) {
  const parts = [];
  if (
    change.source_status_from &&
    change.source_status_to &&
    change.source_status_from !== change.source_status_to
  ) {
    parts.push(`${change.source_status_from} to ${change.source_status_to}`);
  }
  Object.entries(change.horizons || {}).forEach(([horizon, detail]) => {
    if (
      detail.direction_from &&
      detail.direction_to &&
      detail.direction_from !== detail.direction_to
    ) {
      parts.push(`${horizon} ${detail.direction_from} to ${detail.direction_to}`);
    } else if (detail.strength_delta != null && Math.abs(Number(detail.strength_delta)) >= 0.1) {
      const delta = Math.round(Number(detail.strength_delta) * 100);
      parts.push(`${horizon} strength ${delta > 0 ? "+" : ""}${delta}`);
    }
  });
  return parts.length ? parts.join(" / ") : "material evidence change";
}

export default function DecisionContextPanel({ data }) {
  if (!data) {
    return (
      <section className="min-w-0 rounded-2xl border border-ink/[0.06] bg-ink/[0.015] p-5">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-accent">
          Phase 6 / Evidence-first dashboard
        </div>
        <p className="mt-2 text-sm text-text-primary/45">
          Decision-context health is unavailable for this report.
        </p>
      </section>
    );
  }

  const tone = statusTone[data.status] || statusTone.unavailable;
  const counts = data.source_counts || {};
  const issues = data.issues || [];
  const changes = data.changes?.items || [];

  return (
    <section className="min-w-0 rounded-2xl border border-ink/10 bg-surface-secondary/90 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-accent/75">
            Phase 6 / Evidence-first dashboard
          </div>
          <h2 className="mt-1 text-xl font-medium text-text-primary/90 md:text-2xl">
            Decision Context
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-text-primary/45">
            {data.summary}
          </p>
        </div>
        <span
          className={`rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider ${tone.badge}`}
        >
          {data.status}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="Report freshness"
          value={String(data.report?.status || "unavailable").toUpperCase()}
          note={`${formatAge(data.report?.age_seconds)} since capture`}
          tone={tone.accent}
        />
        <SummaryCard
          label="Source health"
          value={`${counts.fresh || 0}/${counts.total || 0}`}
          note={`${counts.stale || 0} stale / ${counts.unavailable || 0} unavailable`}
        />
        <SummaryCard
          label="Material changes"
          value={String(data.changes?.count || 0)}
          note={data.changes?.has_previous ? "since previous report" : "no previous comparison"}
        />
        <SummaryCard
          label="Decision authority"
          value="DISPLAY ONLY"
          note="health status cannot change direction"
          tone="text-accent"
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <HorizonCard horizon="24h" data={data.horizons?.["24h"]} />
        <HorizonCard horizon="72h" data={data.horizons?.["72h"]} />
      </div>

      <div className="mt-4 rounded-xl border border-ink/[0.06] bg-scrim/10 p-3.5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-primary/35">
            Source health at this report cycle
          </div>
          <div className="text-[9px] font-mono text-text-primary/25">
            current age includes report age
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(data.sources || []).map((source) => (
            <SourceCard key={source.key} source={source} />
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-ink/[0.06] bg-scrim/10 p-4">
          <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-primary/35">
            Attention required
          </div>
          {issues.length ? (
            <div className="mt-2 divide-y divide-ink/[0.05]">
              {issues.slice(0, 5).map((issue) => (
                <div key={issue.key} className="py-2.5">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                        issue.severity === "high" ? "bg-negative" : "bg-accent"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="text-xs text-text-primary/70">{issue.title}</div>
                      <div className="mt-1 break-words text-[10px] leading-relaxed text-text-primary/35">
                        {issue.detail}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-xs text-profit/70">No active data-quality warning.</div>
          )}
        </div>

        <div className="min-w-0 rounded-xl border border-ink/[0.06] bg-scrim/10 p-4">
          <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-text-primary/35">
            Changed since previous report
          </div>
          {changes.length ? (
            <div className="mt-2 divide-y divide-ink/[0.05]">
              {changes.slice(0, 5).map((change) => (
                <div key={change.key} className="py-2.5">
                  <div className="text-xs text-text-primary/70">{change.label}</div>
                  <div className="mt-1 break-words text-[10px] font-mono leading-relaxed text-accent/65">
                    <ChangeText change={change} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-xs text-text-primary/35">
              No material evidence change was recorded.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
