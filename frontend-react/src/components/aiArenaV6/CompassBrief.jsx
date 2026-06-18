import React, { useState } from "react";
import {
  directionArrow,
  directionColor,
  directionLabel,
  formatPrice,
  formatPriceRange,
} from "./constants";

const card =
  "rounded-2xl border border-white/[0.08] bg-[#0d0d12]/80 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]";
const mutedCard = "rounded-xl border border-white/[0.06] bg-white/[0.025]";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function badgeTone(status) {
  const value = String(status || "").toLowerCase();
  if (["healthy", "fresh", "supported", "approved", "bullish", "low"].includes(value)) {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }
  if (["critical", "unavailable", "conflicted", "high", "bearish"].includes(value)) {
    return "border-red-400/20 bg-red-400/10 text-red-300";
  }
  if (["degraded", "stale", "guarded", "limited", "elevated", "medium", "neutral"].includes(value)) {
    return "border-amber-300/20 bg-amber-300/10 text-amber-200";
  }
  return "border-white/10 bg-white/5 text-white/45";
}

function textTone(status) {
  const tone = badgeTone(status);
  if (tone.includes("emerald")) return "text-emerald-300";
  if (tone.includes("red")) return "text-red-300";
  if (tone.includes("amber")) return "text-amber-200";
  return "text-white/75";
}

function Badge({ children, tone = "neutral" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em]",
        badgeTone(tone),
      )}
    >
      {children}
    </span>
  );
}

function DetailButton({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-[#d4a853]/20 bg-[#d4a853]/10 px-3 py-2 text-[11px] font-medium text-[#f5c451] transition hover:border-[#d4a853]/40 hover:bg-[#d4a853]/15"
    >
      {children}
    </button>
  );
}

function SectionTitle({ eyebrow, title, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
          {eyebrow}
        </div>
        <h2 className="mt-1 text-xl font-medium text-white/90 md:text-2xl">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function formatRelative(value) {
  if (!value) return "not updated";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "not updated";
  const minutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function readable(value) {
  const label = String(value || "unknown").replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function numberPct(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${(number * 100).toFixed(digits)}%`;
}

function signedScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}`;
}

function getHorizon(report, key) {
  const verdict = report?.report?.verdict || {};
  const summary = report?.verdict_summary || {};
  if (key === "24h") return verdict.tactical_24h || summary.tactical_24h || null;
  if (key === "72h") return verdict.secondary_7d || summary.secondary_7d || null;
  return verdict.primary_30d || summary.primary_30d || null;
}

function getEvidenceMatrix(report) {
  return report?.report?.evidence_matrix || null;
}

function getRows(report) {
  return getEvidenceMatrix(report)?.rows || [];
}

function getRow(report, key) {
  return getRows(report).find((row) => row.key === key);
}

function rowScore(row, horizon = "24h") {
  return row?.horizons?.[horizon] || {};
}

function topRows(rows, horizon = "24h", limit = 4) {
  return [...(rows || [])]
    .filter((row) => row.role !== "context_only")
    .map((row) => ({ ...row, _score: rowScore(row, horizon) }))
    .filter((row) => row._score?.available !== false)
    .sort((a, b) => Math.abs(Number(b._score.weighted_score) || 0) - Math.abs(Number(a._score.weighted_score) || 0))
    .slice(0, limit);
}

function buildTraderHeadline(tactical, swing, cycle) {
  const shortDir = directionLabel(tactical?.direction);
  const swingDir = directionLabel(swing?.direction);
  const cycleDir = directionLabel(cycle?.direction);
  if (!tactical) return "Short-term read is not available yet.";
  if (tactical.direction === "bearish" && cycle?.direction === "bullish") {
    return `24h projected ${shortDir}, while long-term context remains ${cycleDir}`;
  }
  if (tactical.direction === "bullish" && cycle?.direction === "bullish") {
    return `24h leans ${shortDir}, with long-term context still ${cycleDir}`;
  }
  return `24h leans ${shortDir}; 72h context is ${swingDir}`;
}

function buildTraderSummary(tactical, swing, cycle, rows) {
  const strongest = topRows(rows, "24h", 3);
  const reasons = strongest
    .map((row) => `${row.label}: ${readable(rowScore(row, "24h").direction)}`)
    .join("; ");
  const holder = cycle?.direction
    ? `For longer-horizon holders, cycle context is still ${directionLabel(cycle.direction)} at ${cycle.confidence ?? "-"}%.`
    : "Longer-horizon context is not available.";
  return `${directionLabel(tactical?.direction)} 24h read at ${tactical?.confidence ?? "-"}% confidence. ${reasons || "Evidence detail is limited for this cycle."} ${holder}`;
}

function PrimaryTraderCard({ tactical, swing, cycle, rows, onDetail }) {
  const dir = String(tactical?.direction || "neutral").toLowerCase();
  const color = directionColor(dir);
  return (
    <section className={cx(card, "overflow-hidden")}>
      <div className="border-b border-white/[0.06] px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dir}>Trader focus: 24h</Badge>
            <Badge tone={swing?.direction}>72h {directionLabel(swing?.direction)}</Badge>
            <Badge tone={cycle?.direction}>Long-term {directionLabel(cycle?.direction)}</Badge>
          </div>
          <DetailButton onClick={onDetail}>Open full 24h breakdown</DetailButton>
        </div>
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-[1.3fr_0.7fr] md:p-6">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
            Short-term trader read
          </div>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight tracking-[-0.03em] text-white md:text-5xl">
            {buildTraderHeadline(tactical, swing, cycle)}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">
            {buildTraderSummary(tactical, swing, cycle, rows)}
          </p>
        </div>

        <div className={cx(mutedCard, "p-5")}>
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-white/35">
            24h stance
          </div>
          <div className="mt-5 flex items-center gap-4">
            <span className="text-5xl" style={{ color }}>{directionArrow(dir)}</span>
            <div>
              <div className="text-4xl font-semibold text-white/90">
                {directionLabel(dir)}
              </div>
              <div className="mt-1 font-mono text-xl text-[#d4a853]">
                {tactical?.confidence ?? "-"}% confidence
              </div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
              <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/30">72h</div>
              <div className={cx("mt-2 text-lg font-semibold", textTone(swing?.direction))}>
                {directionLabel(swing?.direction)} {swing?.confidence ?? "-"}%
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
              <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/30">Holder</div>
              <div className={cx("mt-2 text-lg font-semibold", textTone(cycle?.direction))}>
                {directionLabel(cycle?.direction)} {cycle?.confidence ?? "-"}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricPreviewCard({ row, horizon, onDetail }) {
  const score = rowScore(row, horizon);
  const metrics = row.evidence || [];
  return (
    <div className={cx(mutedCard, "p-4")}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white/85">{row.label}</div>
          <div className="mt-1 text-[10px] text-white/35">{row.rationale}</div>
        </div>
        <Badge tone={score.direction}>{readable(score.direction)}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {metrics.slice(0, 4).map((item, index) => (
          <div key={`${item.metric}-${index}`} className="rounded-lg border border-white/[0.05] bg-black/15 p-2.5">
            <div className="truncate text-[9px] font-mono uppercase tracking-[0.12em] text-white/30">
              {item.metric}
            </div>
            <div className="mt-1 truncate font-mono text-sm text-white/80">
              {item.value ?? "-"}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-white/35">
        <span>strength {numberPct(score.strength)}</span>
        <span>score {signedScore(score.weighted_score)}</span>
        <button type="button" onClick={onDetail} className="text-[#d4a853] hover:text-[#f5c451]">
          details
        </button>
      </div>
    </div>
  );
}

function NewsPreview({ eventRisk, onDetail }) {
  const headlines = eventRisk?.headlines || [];
  const events = eventRisk?.upcoming_events || [];
  const penalty = eventRisk?.confidence_adjustment?.penalty_points || 0;
  return (
    <section>
      <SectionTitle eyebrow="Risk tape" title="News and event risk">
        <DetailButton onClick={onDetail}>Open news detail</DetailButton>
      </SectionTitle>
      <div className={cx(card, "p-5")}>
        <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
          <div>
            <Badge tone={eventRisk?.risk_level || "low"}>
              {readable(eventRisk?.risk_level || "low")} risk
            </Badge>
            <p className="mt-3 text-sm leading-7 text-white/55">
              {eventRisk?.summary || "No major news/event warning is active for this read."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={cx(mutedCard, "p-3")}>
                <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/30">Next 24h</div>
                <div className="mt-2 text-lg font-semibold text-white/85">
                  {eventRisk?.windows?.next_24h?.event_count || 0} events
                </div>
              </div>
              <div className={cx(mutedCard, "p-3")}>
                <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/30">Confidence</div>
                <div className="mt-2 text-lg font-semibold text-amber-200">
                  {penalty ? `-${penalty} pts` : "No penalty"}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {headlines.slice(0, 3).map((headline, index) => (
              <div key={`${headline.title}-${index}`} className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm text-white/80">{headline.title}</div>
                  <Badge tone={headline.impact}>{headline.impact || "watch"}</Badge>
                </div>
                <div className="mt-1 text-[10px] font-mono text-white/35">
                  {headline.topic_label || "Market"} · {headline.age_seconds != null ? `${Math.round(Number(headline.age_seconds) / 60)}m ago` : "recent"}
                </div>
              </div>
            ))}
            {!headlines.length && !events.length && (
              <div className="rounded-xl border border-white/[0.06] bg-black/15 p-4 text-sm text-white/45">
                No headline or scheduled event detail is available in this cycle.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ZoneList({ zones, currentPrice, onDetail }) {
  if (!zones?.length) {
    return (
      <div className={cx(mutedCard, "p-4 text-sm text-white/45")}>
        Key price areas are not available for this update.
      </div>
    );
  }
  const order = { supply: 0, fair_value: 1, demand: 2 };
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {[...zones]
        .sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9))
        .slice(0, 3)
        .map((zone, index) => {
          const inside = currentPrice && currentPrice >= Number(zone.price_low) && currentPrice <= Number(zone.price_high);
          const kind = String(zone.kind || "zone").replaceAll("_", " ");
          return (
            <div key={`${zone.kind}-${index}`} className={cx(mutedCard, "p-4")}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-white/35">
                  {kind}
                </div>
                {inside && <Badge tone="healthy">current</Badge>}
              </div>
              <div className="font-mono text-base text-white/85">
                {formatPriceRange(zone.price_low, zone.price_high)}
              </div>
              {zone.why && (
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-white/45">
                  {zone.why}
                </p>
              )}
              <button type="button" onClick={onDetail} className="mt-3 text-[11px] font-medium text-[#d4a853] hover:text-[#f5c451]">
                open levels + liquidity
              </button>
            </div>
          );
        })}
    </div>
  );
}

function RiskList({ risks, onDetail }) {
  if (!risks?.length) {
    return (
      <div className={cx(mutedCard, "p-4 text-sm text-white/45")}>
        No major invalidation condition is highlighted in this update.
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {risks.slice(0, 3).map((risk, index) => (
        <div key={`${risk.title}-${index}`} className={cx(mutedCard, "p-4")}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-white/85">{risk.title}</h3>
            <Badge tone={risk.severity}>{risk.severity || "watch"}</Badge>
          </div>
          {risk.threshold && (
            <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 font-mono text-[11px] leading-relaxed text-white/65">
              {risk.threshold}
            </div>
          )}
          {risk.why_matters && (
            <p className="mt-2 text-xs leading-relaxed text-white/40">{risk.why_matters}</p>
          )}
          <button type="button" onClick={onDetail} className="mt-3 text-[11px] font-medium text-[#d4a853] hover:text-[#f5c451]">
            full risk logic
          </button>
        </div>
      ))}
    </div>
  );
}

function HolderContext({ cycle, swing, rows, onDetail }) {
  const cycleRows = topRows(rows, "72h", 3);
  return (
    <section>
      <SectionTitle eyebrow="Holder context" title="Longer-term view comes after the trade read">
        <DetailButton onClick={onDetail}>Open 72h / holder breakdown</DetailButton>
      </SectionTitle>
      <div className={cx(card, "p-5")}>
        <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
          <div className="grid grid-cols-2 gap-3">
            <div className={cx(mutedCard, "p-4")}>
              <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/30">72h</div>
              <div className={cx("mt-2 text-2xl font-semibold", textTone(swing?.direction))}>
                {directionLabel(swing?.direction)}
              </div>
              <div className="mt-1 font-mono text-[#d4a853]">{swing?.confidence ?? "-"}%</div>
            </div>
            <div className={cx(mutedCard, "p-4")}>
              <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/30">Cycle</div>
              <div className={cx("mt-2 text-2xl font-semibold", textTone(cycle?.direction))}>
                {directionLabel(cycle?.direction)}
              </div>
              <div className="mt-1 font-mono text-[#d4a853]">{cycle?.confidence ?? "-"}%</div>
            </div>
          </div>
          <div className="space-y-2">
            {cycleRows.map((row) => {
              const score = rowScore(row, "72h");
              return (
                <div key={row.key} className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-white/80">{row.label}</div>
                    <Badge tone={score.direction}>{readable(score.direction)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-white/40">{row.rationale}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Modal({ title, children, onClose }) {
  if (!title) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#09090d] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">Detail breakdown</div>
            <h3 className="mt-1 text-xl font-semibold text-white/90">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/65 hover:bg-white/[0.08]"
          >
            Close
          </button>
        </div>
        <div className="max-h-[72vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function EvidenceRowDetail({ row, horizon }) {
  const score = rowScore(row, horizon);
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-medium text-white/85">{row.label}</div>
          <p className="mt-1 text-xs leading-relaxed text-white/45">{row.rationale}</p>
        </div>
        <Badge tone={score.direction}>{readable(score.direction)}</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
          <div className="text-[9px] font-mono uppercase text-white/30">Strength</div>
          <div className="mt-1 font-mono text-white/80">{numberPct(score.strength)}</div>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
          <div className="text-[9px] font-mono uppercase text-white/30">Weight</div>
          <div className="mt-1 font-mono text-white/80">{Number(score.weight ?? 0).toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
          <div className="text-[9px] font-mono uppercase text-white/30">Weighted score</div>
          <div className={cx("mt-1 font-mono", textTone(score.direction))}>{signedScore(score.weighted_score)}</div>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
          <div className="text-[9px] font-mono uppercase text-white/30">Data health</div>
          <div className={cx("mt-1 font-mono", textTone(row.source_health?.status))}>{readable(row.source_health?.status)}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {(row.evidence || []).map((item, index) => (
          <div key={`${item.metric}-${index}`} className="rounded-lg border border-white/[0.05] bg-black/15 p-3">
            <div className="text-[10px] text-white/35">{item.metric}</div>
            <div className="mt-1 font-mono text-sm text-white/80">{item.value ?? "-"}</div>
            {item.note && <div className="mt-1 text-[10px] text-white/35">{item.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function EvidenceModalContent({ report, horizon = "24h" }) {
  const matrix = getEvidenceMatrix(report);
  const summary = matrix?.horizons?.[horizon] || {};
  const rows = getRows(report);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className={cx(mutedCard, "p-3")}> <div className="text-[9px] font-mono uppercase text-white/30">Evidence bias</div><div className={cx("mt-2 text-lg font-semibold", textTone(summary.bias))}>{readable(summary.bias)}</div></div>
        <div className={cx(mutedCard, "p-3")}> <div className="text-[9px] font-mono uppercase text-white/30">Score</div><div className="mt-2 font-mono text-white/80">{signedScore(summary.score)}</div></div>
        <div className={cx(mutedCard, "p-3")}> <div className="text-[9px] font-mono uppercase text-white/30">Coverage</div><div className="mt-2 font-mono text-white/80">{numberPct(summary.coverage)}</div></div>
        <div className={cx(mutedCard, "p-3")}> <div className="text-[9px] font-mono uppercase text-white/30">Conflicts</div><div className="mt-2 font-mono text-white/80">{summary.conflict_count || 0}</div></div>
      </div>
      {rows.map((row) => <EvidenceRowDetail key={row.key} row={row} horizon={horizon} />)}
    </div>
  );
}

function NewsModalContent({ eventRisk }) {
  const headlines = eventRisk?.headlines || [];
  const events = eventRisk?.upcoming_events || [];
  const topics = eventRisk?.topics || [];
  return (
    <div className="space-y-5">
      <div className={cx(mutedCard, "p-4")}>
        <Badge tone={eventRisk?.risk_level || "low"}>{readable(eventRisk?.risk_level || "low")} risk</Badge>
        <p className="mt-3 text-sm leading-7 text-white/55">{eventRisk?.summary || "No event-risk summary available."}</p>
      </div>
      <div>
        <h4 className="mb-3 text-sm font-semibold text-white/85">Relevant headlines</h4>
        <div className="space-y-2">
          {headlines.map((headline, index) => (
            <a
              key={`${headline.title}-${index}`}
              href={headline.url || undefined}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-white/[0.06] bg-black/15 p-4 hover:bg-white/[0.04]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-3xl text-sm text-white/85">{headline.title}</div>
                <Badge tone={headline.impact}>{headline.impact || "watch"}</Badge>
              </div>
              <div className="mt-2 text-[10px] font-mono text-white/35">
                {headline.source || "News"} · {headline.topic_label || "Market"} · {headline.age_seconds != null ? `${Math.round(Number(headline.age_seconds) / 60)}m ago` : "recent"}
              </div>
            </a>
          ))}
          {!headlines.length && <div className="text-sm text-white/45">No headline detail available.</div>}
        </div>
      </div>
      <div>
        <h4 className="mb-3 text-sm font-semibold text-white/85">Scheduled events</h4>
        <div className="grid gap-2 md:grid-cols-2">
          {events.map((event, index) => (
            <div key={`${event.title}-${index}`} className="rounded-xl border border-white/[0.06] bg-black/15 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm text-white/85">{event.title}</div>
                <Badge tone={event.impact}>{event.impact || "watch"}</Badge>
              </div>
              <div className="mt-2 text-[10px] font-mono text-white/35">
                {event.country || "Global"} · {event.scheduled_at ? new Date(event.scheduled_at).toLocaleString() : "time n/a"}
                {event.forecast ? ` · forecast ${event.forecast}` : ""}
              </div>
            </div>
          ))}
          {!events.length && <div className="text-sm text-white/45">No scheduled event detail available.</div>}
        </div>
      </div>
      {!!topics.length && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-white/85">Topic mix</h4>
          <div className="flex flex-wrap gap-2">
            {topics.map((topic) => (
              <Badge key={topic.topic} tone={topic.impact || "neutral"}>{topic.label} · {topic.article_count}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LiquidityModalContent({ report }) {
  const row = getRow(report, "liquidity");
  const liquidity = report?.report?.liquidity || {};
  const liquidityEntries = Object.entries(liquidity || {}).filter(([, value]) => value != null && value !== "");
  return (
    <div className="space-y-4">
      {row ? <EvidenceRowDetail row={row} horizon="24h" /> : <div className="text-sm text-white/45">Liquidity row is unavailable.</div>}
      {liquidityEntries.length > 0 && (
        <div className={cx(mutedCard, "p-4")}>
          <h4 className="mb-3 text-sm font-semibold text-white/85">Additional liquidity detail</h4>
          <div className="grid gap-2 md:grid-cols-2">
            {liquidityEntries.map(([key, value]) => (
              <div key={key} className="rounded-lg border border-white/[0.05] bg-black/15 p-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-white/30">{readable(key)}</div>
                <div className="mt-1 break-words font-mono text-sm text-white/75">
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CompassBrief({
  report,
  dashboardHealth,
  operationalHealth,
  eventRisk,
}) {
  const [modal, setModal] = useState(null);
  if (!report) return null;

  const inner = report.report || {};
  const verdict = inner.verdict || {};
  const tactical = getHorizon(report, "24h");
  const swing = getHorizon(report, "72h");
  const cycle = getHorizon(report, "cycle");
  const rows = getRows(report);
  const driverRows = topRows(rows, "24h", 4);
  const price = report.btc_price;
  const zones = verdict.zones_to_watch || [];
  const risks = verdict.risk_scenarios || [];
  const dataStatus =
    operationalHealth?.status === "healthy" && dashboardHealth?.status === "healthy"
      ? "healthy"
      : operationalHealth?.status || dashboardHealth?.status || "unknown";

  const modalTitle = {
    trader: "24h trader breakdown",
    allMetrics: "All metric evidence",
    news: "News and event detail",
    liquidity: "Liquidity and key levels",
    holder: "72h and holder context",
    risk: "Invalidation detail",
  }[modal];

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={dataStatus}>Market data {dataStatus === "healthy" ? "healthy" : "needs attention"}</Badge>
          <Badge tone={eventRisk?.risk_level || "low"}>Event risk {readable(eventRisk?.risk_level || "low")}</Badge>
        </div>
        <div className="text-[11px] font-mono text-white/35">Updated {formatRelative(report.timestamp)}</div>
      </section>

      <PrimaryTraderCard
        tactical={tactical}
        swing={swing}
        cycle={cycle}
        rows={rows}
        onDetail={() => setModal("trader")}
      />

      <section>
        <SectionTitle eyebrow="24h drivers" title="What is moving the short-term read">
          <DetailButton onClick={() => setModal("allMetrics")}>Open all metrics</DetailButton>
        </SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {driverRows.map((row) => (
            <MetricPreviewCard key={row.key} row={row} horizon="24h" onDetail={() => setModal(row.key === "liquidity" ? "liquidity" : "trader")} />
          ))}
        </div>
      </section>

      <NewsPreview eventRisk={eventRisk} onDetail={() => setModal("news")} />

      <section>
        <SectionTitle eyebrow="Price map" title="Levels to watch for the next move">
          <DetailButton onClick={() => setModal("liquidity")}>Open levels + liquidity</DetailButton>
        </SectionTitle>
        <ZoneList zones={zones} currentPrice={price} onDetail={() => setModal("liquidity")} />
      </section>

      <section>
        <SectionTitle eyebrow="Invalidation" title="What can break the short-term read">
          <DetailButton onClick={() => setModal("risk")}>Open risk detail</DetailButton>
        </SectionTitle>
        <RiskList risks={risks} onDetail={() => setModal("risk")} />
      </section>

      <HolderContext cycle={cycle} swing={swing} rows={rows} onDetail={() => setModal("holder")} />

      <Modal title={modalTitle} onClose={() => setModal(null)}>
        {modal === "trader" && <EvidenceModalContent report={report} horizon="24h" />}
        {modal === "allMetrics" && <EvidenceModalContent report={report} horizon="24h" />}
        {modal === "news" && <NewsModalContent eventRisk={eventRisk} />}
        {modal === "liquidity" && <LiquidityModalContent report={report} />}
        {modal === "holder" && <EvidenceModalContent report={report} horizon="72h" />}
        {modal === "risk" && (
          <div className="space-y-3">
            {risks.map((risk, index) => (
              <div key={`${risk.title}-${index}`} className={cx(mutedCard, "p-4")}>
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-base font-medium text-white/85">{risk.title}</h4>
                  <Badge tone={risk.severity}>{risk.severity || "watch"}</Badge>
                </div>
                {risk.threshold && <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 font-mono text-sm text-white/70">{risk.threshold}</div>}
                {risk.why_matters && <p className="mt-3 text-sm leading-7 text-white/50">{risk.why_matters}</p>}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
