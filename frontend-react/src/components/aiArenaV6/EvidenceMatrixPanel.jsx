import React, { useMemo, useState } from "react";

const directionTone = {
  bullish: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  bearish: "border-red-400/20 bg-red-400/10 text-red-300",
  neutral: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  unavailable: "border-ink/10 bg-ink/5 text-text-primary/35",
};

const healthTone = {
  fresh: "text-emerald-300",
  stale: "text-amber-200",
  unavailable: "text-red-300",
};

const comparisonLabel = {
  aligned: "Aligned with verdict",
  conflict: "Conflicts with verdict",
  neutral_evidence: "Evidence remains neutral",
};

function formatPct(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${(number * 100).toFixed(digits)}%`;
}

function formatScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(2)}`;
}

function formatAge(seconds) {
  const number = Number(seconds);
  if (!Number.isFinite(number)) return "age unknown";
  if (number < 60) return `${Math.round(number)}s`;
  if (number < 3600) return `${Math.round(number / 60)}m`;
  return `${(number / 3600).toFixed(1)}h`;
}

function DirectionBadge({ row, horizon }) {
  const evidence = row?.horizons?.[horizon] || {};
  const direction = evidence.direction || "unavailable";
  let label = direction;
  if (row.role === "context_only") label = "context";
  if (row.role === "confidence_guardrail") label = "guardrail";
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider ${directionTone[direction] || directionTone.unavailable}`}>
      {label}
    </span>
  );
}

function StrengthBar({ value, direction }) {
  const safe = Math.max(0, Math.min(1, Number(value) || 0));
  const color = direction === "bullish"
    ? "#34d399"
    : direction === "bearish"
      ? "#f87171"
      : "#f5c451";
  return (
    <div className="min-w-[92px]">
      <div className="flex items-center justify-between text-[10px] font-mono text-text-primary/45 mb-1">
        <span>{formatPct(safe)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink/5 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${safe * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function EvidenceList({ evidence }) {
  if (!evidence?.length) return <span className="text-text-primary/30">No usable evidence</span>;
  return (
    <div className="space-y-1">
      {evidence.slice(0, 3).map((item, index) => (
        <div key={`${item.metric}-${index}`} className="text-[11px] leading-relaxed">
          <span className="text-text-primary/40">{item.metric}: </span>
          <span className="font-mono text-text-primary/75">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function SourceHealth({ source, health }) {
  const status = health?.status || "unavailable";
  return (
    <div>
      <div className="text-[11px] text-text-primary/60">{source}</div>
      <div className={`mt-1 text-[9px] font-mono uppercase ${healthTone[status] || healthTone.unavailable}`}>
        {status}
        {health?.age_seconds != null ? ` · ${formatAge(health.age_seconds)}` : ""}
      </div>
    </div>
  );
}

function ChangeNote({ changes, horizon }) {
  const detail = changes?.horizons?.[horizon];
  if (!changes?.changed || !detail) {
    return <span className="text-[9px] font-mono text-text-primary/25">unchanged</span>;
  }
  const parts = [];
  if (detail.direction_from) parts.push(`${detail.direction_from} →`);
  if (detail.strength_delta != null && Math.abs(detail.strength_delta) >= 0.1) {
    const sign = detail.strength_delta > 0 ? "+" : "";
    parts.push(`${sign}${Math.round(detail.strength_delta * 100)} strength`);
  }
  return (
    <span className="text-[9px] font-mono text-sky-300">
      changed{parts.length ? ` · ${parts.join(" ")}` : ""}
    </span>
  );
}

function SummaryCard({ label, value, note, tone = "text-text-primary" }) {
  return (
    <div className="rounded-xl border border-ink/5 bg-scrim/10 p-3.5">
      <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/35">
        {label}
      </div>
      <div className={`mt-2 text-lg font-mono font-semibold ${tone}`}>{value}</div>
      <div className="mt-1 text-[10px] text-text-primary/35">{note}</div>
    </div>
  );
}

export default function EvidenceMatrixPanel({ data }) {
  const [horizon, setHorizon] = useState("24h");
  const rows = data?.rows || [];
  const summary = data?.horizons?.[horizon] || {};
  const changedRows = data?.changes?.changed_rows || 0;

  const biasTone = summary.bias === "bullish"
    ? "text-emerald-300"
    : summary.bias === "bearish"
      ? "text-red-300"
      : "text-amber-200";

  const conflicts = useMemo(
    () => new Set((summary.conflicts || []).map((item) => item.key)),
    [summary.conflicts],
  );

  if (!data) {
    return (
      <section className="rounded-xl border border-ink/5 bg-ink/[0.02] p-5">
        <p className="text-sm text-text-primary/50">
          Evidence matrix will appear after the next Compass report.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-ink/5 bg-ink/[0.015] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-violet-300/70 mb-1">
            Phase 4 · Evidence audit
          </div>
          <h2 className="text-xl text-text-primary/90 font-medium">
            Transparent Evidence Matrix
          </h2>
          <p className="text-xs text-text-primary/45 mt-1 max-w-2xl">
            Deterministic evidence by horizon, including source health,
            conflicts, and changes. This matrix audits the verdict and cannot
            override it.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-ink/5 bg-scrim/20 p-1">
          {["24h", "72h"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setHorizon(item)}
              className={`rounded-md px-3 py-1.5 text-[10px] font-mono uppercase transition-colors ${
                horizon === item
                  ? "bg-violet-400/15 text-violet-200"
                  : "text-text-primary/35 hover:text-text-primary/60"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <SummaryCard
          label="Evidence bias"
          value={(summary.bias || "unavailable").toUpperCase()}
          note={`weighted score ${formatScore(summary.score)}`}
          tone={biasTone}
        />
        <SummaryCard
          label="Source coverage"
          value={formatPct(summary.coverage)}
          note={`${summary.unavailable_rows || 0} unavailable · ${summary.stale_rows || 0} stale`}
        />
        <SummaryCard
          label="Conflicts"
          value={String(summary.conflict_count || 0)}
          note="directional layers opposing the bias"
          tone={summary.conflict_count ? "text-amber-200" : "text-emerald-300"}
        />
        <SummaryCard
          label="Verdict comparison"
          value={
            summary.verdict_comparison === "conflict"
              ? "CONFLICT"
              : summary.verdict_comparison === "neutral_evidence"
                ? "NEUTRAL"
                : "ALIGNED"
          }
          note={comparisonLabel[summary.verdict_comparison] || "Comparison unavailable"}
          tone={
            summary.verdict_comparison === "conflict"
              ? "text-red-300"
              : summary.verdict_comparison === "neutral_evidence"
                ? "text-amber-200"
                : "text-emerald-300"
          }
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
        <span className="text-text-primary/35">
          {changedRows} of {rows.length} layers changed materially since the previous report
        </span>
        <span className="text-violet-200/60">
          decision authority: disabled
        </span>
      </div>

      <div className="hidden md:block overflow-x-auto rounded-xl border border-ink/5">
        <table className="w-full min-w-[920px] text-left">
          <thead className="bg-ink/[0.025] text-[9px] font-mono uppercase tracking-wider text-text-primary/35">
            <tr>
              <th className="px-4 py-3">Layer</th>
              <th className="px-4 py-3">Condition</th>
              <th className="px-4 py-3">Strength</th>
              <th className="px-4 py-3">Source health</th>
              <th className="px-4 py-3">Key evidence</th>
              <th className="px-4 py-3">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const item = row.horizons?.[horizon] || {};
              return (
                <tr
                  key={row.key}
                  className={`border-t border-ink/5 align-top ${
                    conflicts.has(row.key) ? "bg-amber-300/[0.025]" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="text-sm text-text-primary/80">{row.label}</div>
                    <div className="mt-1 text-[9px] font-mono uppercase text-text-primary/30">
                      {row.role.replaceAll("_", " ")}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <DirectionBadge row={row} horizon={horizon} />
                    {conflicts.has(row.key) && (
                      <div className="mt-1 text-[9px] font-mono text-amber-200">
                        opposes matrix bias
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StrengthBar value={item.strength} direction={item.direction} />
                    <div className="mt-1 text-[9px] font-mono text-text-primary/25">
                      weight {Number(item.weight || 0).toFixed(2)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <SourceHealth source={row.source} health={row.source_health} />
                  </td>
                  <td className="px-4 py-3 max-w-[280px]">
                    <EvidenceList evidence={row.evidence} />
                    <div className="mt-2 text-[10px] text-text-primary/35 leading-relaxed">
                      {row.rationale}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ChangeNote changes={row.changes} horizon={horizon} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-3">
        {rows.map((row) => {
          const item = row.horizons?.[horizon] || {};
          return (
            <div
              key={row.key}
              className={`rounded-xl border p-4 ${
                conflicts.has(row.key)
                  ? "border-amber-300/15 bg-amber-300/[0.025]"
                  : "border-ink/5 bg-scrim/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-text-primary/80">{row.label}</div>
                  <div className="mt-1 text-[9px] font-mono uppercase text-text-primary/30">
                    {row.role.replaceAll("_", " ")}
                  </div>
                </div>
                <DirectionBadge row={row} horizon={horizon} />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <StrengthBar value={item.strength} direction={item.direction} />
                <SourceHealth source={row.source} health={row.source_health} />
              </div>
              <div className="mt-4">
                <EvidenceList evidence={row.evidence} />
              </div>
              <div className="mt-3 text-[10px] text-text-primary/35 leading-relaxed">
                {row.rationale}
              </div>
              <div className="mt-3">
                <ChangeNote changes={row.changes} horizon={horizon} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
