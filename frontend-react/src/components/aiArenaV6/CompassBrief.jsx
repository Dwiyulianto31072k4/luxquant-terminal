import React, { useState } from "react";
import {
  directionArrow,
  directionColor,
  directionLabel,
  formatPrice,
  formatPriceRange,
} from "./constants";

const card =
  "rounded-2xl border border-white/[0.08] bg-surface-secondary/80 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]";
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
  return "border-white/10 bg-white/5 text-text-primary/45";
}

function textTone(status) {
  const tone = badgeTone(status);
  if (tone.includes("emerald")) return "text-emerald-300";
  if (tone.includes("red")) return "text-red-300";
  if (tone.includes("amber")) return "text-amber-200";
  return "text-text-primary/75";
}

function Badge({ children, tone = "neutral" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-md border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em]",
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
      className="rounded-md border border-line/20 bg-accent/10 px-3 py-2 text-[11px] font-medium text-accent transition hover:border-line/40 hover:bg-accent/15"
    >
      {children}
    </button>
  );
}

function SectionTitle({ eyebrow, title, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-accent/75">
          {eyebrow}
        </div>
        <h2 className="mt-1 text-xl font-medium text-text-primary/90 md:text-2xl">
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

function tacticalRows(rows, horizon = "24h", limit = 4) {
  const tacticalKeys = new Set(["price_action", "liquidity", "derivatives", "smart_money"]);
  return topRows((rows || []).filter((row) => tacticalKeys.has(row.key)), horizon, limit);
}

function outlookRows(rows, limit = 4) {
  const outlookKeys = new Set(["macro", "onchain", "cycle_context"]);
  return (rows || []).filter((row) => outlookKeys.has(row.key)).slice(0, limit);
}

function getContract(report) {
  return report?.report?.verdict?.scenario_contract || null;
}

function marketModeCopy(mode) {
  const value = String(mode || "").toUpperCase();
  if (value === "ALTCOIN_FRIENDLY") {
    return {
      label: "Risk-on",
      tone: "bullish",
      text: "BTC backdrop allows stronger altcoin exposure after confirmation. Still avoid chasing into first resistance.",
    };
  }
  if (value === "SELECTIVE_RISK_ON") {
    return {
      label: "Selective risk-on",
      tone: "neutral",
      text: "Exposure is allowed, but only on the cleanest setups. Keep size controlled and wait for BTC to respect the active level.",
    };
  }
  if (value === "BTC_ONLY_RISK_ON") {
    return {
      label: "BTC-led only",
      tone: "neutral",
      text: "BTC is the cleaner expression. Keep altcoin exposure lighter unless alts confirm with relative strength.",
    };
  }
  if (value === "DEFENSIVE") {
    return {
      label: "Defensive",
      tone: "bearish",
      text: "Reduce fresh altcoin exposure. Wait for reclaim/confirmation before adding high-beta positions.",
    };
  }
  if (value === "EMERGENCY_DE_RISK") {
    return {
      label: "Protect capital",
      tone: "bearish",
      text: "No new high-beta exposure. Prioritize stops, cash, and waiting for the next stable structure.",
    };
  }
  if (value === "CHOPPY_RANGE") {
    return {
      label: "Range only",
      tone: "neutral",
      text: "Treat BTC as level-to-level. Use smaller size and avoid conviction entries until range acceptance breaks.",
    };
  }
  return {
    label: "Selective",
    tone: "neutral",
    text: "Keep exposure measured until BTC confirms the active projection or invalidates it.",
  };
}

function buildTraderHeadline(tactical) {
  const shortDir = directionLabel(tactical?.direction);
  if (!tactical) return "Short-term outlook is not available yet.";
  if (tactical.direction === "bearish") {
    return `Short-Term Outlook: ${shortDir} pressure until BTC reclaims structure`;
  }
  if (tactical.direction === "bullish") {
    return `Short-Term Outlook: ${shortDir} while BTC holds the active level`;
  }
  return "Short-Term Outlook: Range-bound, wait for level acceptance";
}

function buildTraderSummary(tactical, rows, contract) {
  const strongest = tacticalRows(rows, "24h", 3);
  const reasons = strongest
    .map((row) => `${row.label}: ${readable(rowScore(row, "24h").direction)}`)
    .join("; ");
  const projection = contract?.primary_touch?.level
    ? ` First projected touch: ${formatPrice(contract.primary_touch.level)}.`
    : "";
  const invalidation = contract?.invalidation?.level
    ? ` Read weakens at ${formatPrice(contract.invalidation.level)}.`
    : "";
  return `${directionLabel(tactical?.direction)} 24h outlook at ${tactical?.confidence ?? "-"}% confidence. ${reasons || "Evidence detail is limited for this cycle."}.${projection}${invalidation}`;
}

function PrimaryTraderCard({ tactical, swing, cycle, rows, contract, onDetail }) {
  const dir = String(tactical?.direction || "neutral").toLowerCase();
  const color = directionColor(dir);
  const exposure = marketModeCopy(contract?.market_mode);
  return (
    <section className={cx(card, "overflow-hidden")}>
      <div className="border-b border-white/[0.06] px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dir}>24h outlook</Badge>
            <Badge tone={exposure.tone}>Alt exposure · {exposure.label}</Badge>
            <Badge tone={swing?.direction}>72h context · {directionLabel(swing?.direction)}</Badge>
          </div>
          <DetailButton onClick={onDetail}>Open full 24h breakdown</DetailButton>
        </div>
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-[1.3fr_0.7fr] md:p-6">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-accent/75">
            Short-term market outlook
          </div>
          <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight tracking-[-0.03em] text-text-primary md:text-5xl">
            {buildTraderHeadline(tactical)}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-text-primary/55">
            {buildTraderSummary(tactical, rows, contract)}
          </p>
          <div className="mt-5 rounded-2xl border border-line/20 bg-accent/[0.055] p-4">
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-accent">
              Altcoin exposure guide
            </div>
            <p className="mt-2 text-sm leading-6 text-text-primary/65">{exposure.text}</p>
          </div>
        </div>

        <div className={cx(mutedCard, "p-5")}>
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-primary/35">
            24h stance
          </div>
          <div className="mt-5 flex items-center gap-4">
            <span className="text-5xl" style={{ color }}>{directionArrow(dir)}</span>
            <div>
              <div className="text-4xl font-semibold text-text-primary/90">
                {directionLabel(dir)}
              </div>
              <div className="mt-1 font-mono text-xl text-accent">
                {tactical?.confidence ?? "-"}% confidence
              </div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
              <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/30">72h</div>
              <div className={cx("mt-2 text-lg font-semibold", textTone(swing?.direction))}>
                {directionLabel(swing?.direction)} {swing?.confidence ?? "-"}%
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
              <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/30">Daily outlook</div>
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
          <div className="text-sm font-medium text-text-primary/85">{row.label}</div>
          <div className="mt-1 text-[10px] text-text-primary/35">{row.rationale}</div>
        </div>
        <Badge tone={score.direction}>{readable(score.direction)}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {metrics.slice(0, 4).map((item, index) => (
          <div key={`${item.metric}-${index}`} className="rounded-lg border border-white/[0.05] bg-black/15 p-2.5">
            <div className="truncate text-[9px] font-mono uppercase tracking-[0.12em] text-text-primary/30">
              {item.metric}
            </div>
            <div className="mt-1 truncate font-mono text-sm text-text-primary/80">
              {item.value ?? "-"}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-text-primary/35">
        <span>strength {numberPct(score.strength)}</span>
        <span>score {signedScore(score.weighted_score)}</span>
        <button type="button" onClick={onDetail} className="text-accent hover:text-accent">
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
            <p className="mt-3 text-sm leading-7 text-text-primary/55">
              {eventRisk?.summary || "No major news/event warning is active for this read."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className={cx(mutedCard, "p-3")}>
                <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/30">Next 24h</div>
                <div className="mt-2 text-lg font-semibold text-text-primary/85">
                  {eventRisk?.windows?.next_24h?.event_count || 0} events
                </div>
              </div>
              <div className={cx(mutedCard, "p-3")}>
                <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/30">Confidence</div>
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
                  <div className="text-sm text-text-primary/80">{headline.title}</div>
                  <Badge tone={headline.impact}>{headline.impact || "watch"}</Badge>
                </div>
                <div className="mt-1 text-[10px] font-mono text-text-primary/35">
                  {headline.topic_label || "Market"} · {headline.age_seconds != null ? `${Math.round(Number(headline.age_seconds) / 60)}m ago` : "recent"}
                </div>
              </div>
            ))}
            {!headlines.length && !events.length && (
              <div className="rounded-xl border border-white/[0.06] bg-black/15 p-4 text-sm text-text-primary/45">
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
      <div className={cx(mutedCard, "p-4 text-sm text-text-primary/45")}>
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
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-text-primary/35">
                  {kind}
                </div>
                {inside && <Badge tone="healthy">current</Badge>}
              </div>
              <div className="font-mono text-base text-text-primary/85">
                {formatPriceRange(zone.price_low, zone.price_high)}
              </div>
              {zone.why && (
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-text-primary/45">
                  {zone.why}
                </p>
              )}
              <button type="button" onClick={onDetail} className="mt-3 text-[11px] font-medium text-accent hover:text-accent">
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
      <div className={cx(mutedCard, "p-4 text-sm text-text-primary/45")}>
        No major invalidation condition is highlighted in this update.
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {risks.slice(0, 3).map((risk, index) => (
        <div key={`${risk.title}-${index}`} className={cx(mutedCard, "p-4")}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-text-primary/85">{risk.title}</h3>
            <Badge tone={risk.severity}>{risk.severity || "watch"}</Badge>
          </div>
          {risk.threshold && (
            <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 font-mono text-[11px] leading-relaxed text-text-primary/65">
              {risk.threshold}
            </div>
          )}
          {risk.why_matters && (
            <p className="mt-2 text-xs leading-relaxed text-text-primary/40">{risk.why_matters}</p>
          )}
          <button type="button" onClick={onDetail} className="mt-3 text-[11px] font-medium text-accent hover:text-accent">
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
              <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/30">72h</div>
              <div className={cx("mt-2 text-2xl font-semibold", textTone(swing?.direction))}>
                {directionLabel(swing?.direction)}
              </div>
              <div className="mt-1 font-mono text-accent">{swing?.confidence ?? "-"}%</div>
            </div>
            <div className={cx(mutedCard, "p-4")}>
              <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/30">Cycle</div>
              <div className={cx("mt-2 text-2xl font-semibold", textTone(cycle?.direction))}>
                {directionLabel(cycle?.direction)}
              </div>
              <div className="mt-1 font-mono text-accent">{cycle?.confidence ?? "-"}%</div>
            </div>
          </div>
          <div className="space-y-2">
            {cycleRows.map((row) => {
              const score = rowScore(row, "72h");
              return (
                <div key={row.key} className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-text-primary/80">{row.label}</div>
                    <Badge tone={score.direction}>{readable(score.direction)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-primary/40">{row.rationale}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function DailyOutlookPanel({ cycle, rows, dailyOutlook, onDetail }) {
  const items = outlookRows(rows, 4);
  const refreshed = dailyOutlook?.refreshed !== false;
  return (
    <section>
      <SectionTitle eyebrow="Daily outlook" title="Macro and holder context, separated from the trade call">
        <DetailButton onClick={onDetail}>Open daily context</DetailButton>
      </SectionTitle>
      <div className={cx(card, "p-5")}>
        <div className="grid gap-4 md:grid-cols-[0.75fr_1.25fr]">
          <div className={cx(mutedCard, "p-4")}>
            <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/30">
              Daily close model
            </div>
            <div className={cx("mt-3 text-3xl font-semibold", textTone(cycle?.direction))}>
              {directionLabel(cycle?.direction)}
            </div>
            <div className="mt-1 font-mono text-accent">
              {cycle?.confidence ?? "-"}% context confidence
            </div>
            <p className="mt-4 text-sm leading-6 text-text-primary/48">
              This block is the slow backdrop. It should help decide maximum exposure,
              not override the 24h tape. Daily outlook is best refreshed after the BTC
              daily candle closes.
            </p>
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-3">
              <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-text-primary/30">
                Cadence
              </div>
              <div className="mt-1 text-sm text-text-primary/68">
                {refreshed ? "Fresh daily outlook" : "Reused daily outlook"}
              </div>
              {dailyOutlook?.source_report_id && (
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-text-primary/35">
                  Source {dailyOutlook.source_report_id}
                </div>
              )}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((row) => (
              <div key={row.key} className="rounded-xl border border-white/[0.06] bg-black/15 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-text-primary/85">{row.label}</div>
                    <p className="mt-1 text-xs leading-5 text-text-primary/42">{row.rationale}</p>
                  </div>
                  <Badge tone={(row.source_health || {}).status || "neutral"}>
                    {readable((row.source_health || {}).status || "context")}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(row.evidence || []).slice(0, 4).map((item, index) => (
                    <div key={`${row.key}-${item.metric}-${index}`} className="rounded-lg border border-white/[0.05] bg-white/[0.025] p-2.5">
                      <div className="truncate text-[9px] font-mono uppercase tracking-[0.12em] text-text-primary/30">
                        {item.metric}
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-text-primary/75">
                        {item.value ?? "-"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailTabRail({ activeTab, onChange, tabs }) {
  return (
    <div className="border-b border-white/[0.06] bg-black/10 p-2">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={cx(
                "group flex min-h-[64px] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                active
                  ? "border-line/35 bg-accent/12 text-text-primary shadow-[0_0_0_1px_rgba(212,168,83,0.06)_inset]"
                  : "border-white/[0.06] bg-white/[0.018] text-text-primary/45 hover:border-white/[0.12] hover:bg-white/[0.045] hover:text-text-primary/75",
              )}
            >
              <span
                className={cx(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono text-[11px] font-semibold",
                  active
                    ? "border-line/35 bg-accent/14 text-accent"
                    : "border-white/[0.08] bg-black/15 text-text-primary/35 group-hover:text-text-primary/65",
                )}
              >
                {tab.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-primary/90">{tab.label}</span>
                <span className="mt-0.5 block text-[10px] leading-4 text-text-primary/38">{tab.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }) {
  if (!title) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center bg-black/75 p-0 sm:p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[min(92dvh,100%)] w-full max-w-5xl overflow-hidden rounded-t-3xl sm:rounded-2xl border-t border-white/10 sm:border bg-surface-raised shadow-[0_-20px_60px_rgba(0,0,0,0.65)] sm:shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-0 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-accent/75">Detail breakdown</div>
            <h3 className="mt-1 text-xl font-semibold text-text-primary/90">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-text-primary/65 hover:bg-white/[0.08]"
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
          <div className="text-base font-medium text-text-primary/85">{row.label}</div>
          <p className="mt-1 text-xs leading-relaxed text-text-primary/45">{row.rationale}</p>
        </div>
        <Badge tone={score.direction}>{readable(score.direction)}</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
          <div className="text-[9px] font-mono uppercase text-text-primary/30">Strength</div>
          <div className="mt-1 font-mono text-text-primary/80">{numberPct(score.strength)}</div>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
          <div className="text-[9px] font-mono uppercase text-text-primary/30">Weight</div>
          <div className="mt-1 font-mono text-text-primary/80">{Number(score.weight ?? 0).toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
          <div className="text-[9px] font-mono uppercase text-text-primary/30">Weighted score</div>
          <div className={cx("mt-1 font-mono", textTone(score.direction))}>{signedScore(score.weighted_score)}</div>
        </div>
        <div className="rounded-lg border border-white/[0.05] bg-black/20 p-3">
          <div className="text-[9px] font-mono uppercase text-text-primary/30">Data health</div>
          <div className={cx("mt-1 font-mono", textTone(row.source_health?.status))}>{readable(row.source_health?.status)}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {(row.evidence || []).map((item, index) => (
          <div key={`${item.metric}-${index}`} className="rounded-lg border border-white/[0.05] bg-black/15 p-3">
            <div className="text-[10px] text-text-primary/35">{item.metric}</div>
            <div className="mt-1 font-mono text-sm text-text-primary/80">{item.value ?? "-"}</div>
            {item.note && <div className="mt-1 text-[10px] text-text-primary/35">{item.note}</div>}
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
        <div className={cx(mutedCard, "p-3")}> <div className="text-[9px] font-mono uppercase text-text-primary/30">Evidence bias</div><div className={cx("mt-2 text-lg font-semibold", textTone(summary.bias))}>{readable(summary.bias)}</div></div>
        <div className={cx(mutedCard, "p-3")}> <div className="text-[9px] font-mono uppercase text-text-primary/30">Score</div><div className="mt-2 font-mono text-text-primary/80">{signedScore(summary.score)}</div></div>
        <div className={cx(mutedCard, "p-3")}> <div className="text-[9px] font-mono uppercase text-text-primary/30">Coverage</div><div className="mt-2 font-mono text-text-primary/80">{numberPct(summary.coverage)}</div></div>
        <div className={cx(mutedCard, "p-3")}> <div className="text-[9px] font-mono uppercase text-text-primary/30">Conflicts</div><div className="mt-2 font-mono text-text-primary/80">{summary.conflict_count || 0}</div></div>
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
        <p className="mt-3 text-sm leading-7 text-text-primary/55">{eventRisk?.summary || "No event-risk summary available."}</p>
      </div>
      <div>
        <h4 className="mb-3 text-sm font-semibold text-text-primary/85">Relevant headlines</h4>
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
                <div className="max-w-3xl text-sm text-text-primary/85">{headline.title}</div>
                <Badge tone={headline.impact}>{headline.impact || "watch"}</Badge>
              </div>
              <div className="mt-2 text-[10px] font-mono text-text-primary/35">
                {headline.source || "News"} · {headline.topic_label || "Market"} · {headline.age_seconds != null ? `${Math.round(Number(headline.age_seconds) / 60)}m ago` : "recent"}
              </div>
            </a>
          ))}
          {!headlines.length && <div className="text-sm text-text-primary/45">No headline detail available.</div>}
        </div>
      </div>
      <div>
        <h4 className="mb-3 text-sm font-semibold text-text-primary/85">Scheduled events</h4>
        <div className="grid gap-2 md:grid-cols-2">
          {events.map((event, index) => (
            <div key={`${event.title}-${index}`} className="rounded-xl border border-white/[0.06] bg-black/15 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm text-text-primary/85">{event.title}</div>
                <Badge tone={event.impact}>{event.impact || "watch"}</Badge>
              </div>
              <div className="mt-2 text-[10px] font-mono text-text-primary/35">
                {event.country || "Global"} · {event.scheduled_at ? new Date(event.scheduled_at).toLocaleString() : "time n/a"}
                {event.forecast ? ` · forecast ${event.forecast}` : ""}
              </div>
            </div>
          ))}
          {!events.length && <div className="text-sm text-text-primary/45">No scheduled event detail available.</div>}
        </div>
      </div>
      {!!topics.length && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-text-primary/85">Topic mix</h4>
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
      {row ? <EvidenceRowDetail row={row} horizon="24h" /> : <div className="text-sm text-text-primary/45">Liquidity row is unavailable.</div>}
      {liquidityEntries.length > 0 && (
        <div className={cx(mutedCard, "p-4")}>
          <h4 className="mb-3 text-sm font-semibold text-text-primary/85">Additional liquidity detail</h4>
          <div className="grid gap-2 md:grid-cols-2">
            {liquidityEntries.map(([key, value]) => (
              <div key={key} className="rounded-lg border border-white/[0.05] bg-black/15 p-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-text-primary/30">{readable(key)}</div>
                <div className="mt-1 break-words font-mono text-sm text-text-primary/75">
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
  const [activeTab, setActiveTab] = useState("drivers");
  if (!report) return null;

  const inner = report.report || {};
  const verdict = inner.verdict || {};
  const dailyOutlook = inner.daily_outlook || null;
  const tactical = getHorizon(report, "24h");
  const swing = getHorizon(report, "72h");
  const cycle = getHorizon(report, "cycle");
  const contract = getContract(report);
  const rows = getRows(report);
  const driverRows = tacticalRows(rows, "24h", 4);
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
  const detailTabs = [
    { key: "drivers", icon: "DR", label: "Market Drivers", description: "Price, liquidity, derivatives" },
    { key: "levels", icon: "LV", label: "Price Levels", description: "Magnets, zones, invalidation" },
    { key: "news", icon: "EV", label: "Events", description: "News and calendar risk" },
    { key: "risk", icon: "RK", label: "Risk Rules", description: "What breaks the read" },
    { key: "holder", icon: "DO", label: "Daily Outlook", description: "Macro, on-chain, holder context" },
  ];

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={dataStatus}>Market data {dataStatus === "healthy" ? "healthy" : "needs attention"}</Badge>
          <Badge tone={eventRisk?.risk_level || "low"}>Event risk {readable(eventRisk?.risk_level || "low")}</Badge>
        </div>
        <div className="text-[11px] font-mono text-text-primary/35">Updated {formatRelative(report.timestamp)}</div>
      </section>

      <PrimaryTraderCard
        tactical={tactical}
        swing={swing}
        cycle={cycle}
        rows={rows}
        contract={contract}
        onDetail={() => setModal("trader")}
      />

      <DailyOutlookPanel
        cycle={cycle}
        rows={rows}
        dailyOutlook={dailyOutlook}
        onDetail={() => setModal("holder")}
      />

      <section className={cx(card, "overflow-hidden")}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-accent/75">
              Detail workspace
            </div>
            <h2 className="mt-1 text-xl font-medium text-text-primary/90 md:text-2xl">
              Open only the layer you need
            </h2>
            <p className="mt-1 text-xs leading-5 text-text-primary/40">
              The main read stays short. Drill into drivers, levels, news, risk, or holder context only when needed.
            </p>
          </div>
          <DetailButton onClick={() => setModal("allMetrics")}>Open all metrics</DetailButton>
        </div>
        <DetailTabRail activeTab={activeTab} onChange={setActiveTab} tabs={detailTabs} />
        <div className="p-5">
          {activeTab === "drivers" && (
            <div>
              <SectionTitle eyebrow="Market drivers" title="Why the short-term outlook looks this way">
                <DetailButton onClick={() => setModal("allMetrics")}>Open all metrics</DetailButton>
              </SectionTitle>
              <div className="grid gap-3 md:grid-cols-2">
                {driverRows.map((row) => (
                  <MetricPreviewCard key={row.key} row={row} horizon="24h" onDetail={() => setModal(row.key === "liquidity" ? "liquidity" : "trader")} />
                ))}
              </div>
            </div>
          )}

          {activeTab === "levels" && (
            <div>
              <SectionTitle eyebrow="Price map" title="Levels to watch for the next move">
                <DetailButton onClick={() => setModal("liquidity")}>Open levels + liquidity</DetailButton>
              </SectionTitle>
              <ZoneList zones={zones} currentPrice={price} onDetail={() => setModal("liquidity")} />
            </div>
          )}

          {activeTab === "news" && <NewsPreview eventRisk={eventRisk} onDetail={() => setModal("news")} />}

          {activeTab === "risk" && (
            <div>
              <SectionTitle eyebrow="Invalidation" title="What can break the short-term read">
                <DetailButton onClick={() => setModal("risk")}>Open risk detail</DetailButton>
              </SectionTitle>
              <RiskList risks={risks} onDetail={() => setModal("risk")} />
            </div>
          )}

          {activeTab === "holder" && (
            <HolderContext cycle={cycle} swing={swing} rows={rows} onDetail={() => setModal("holder")} />
          )}
        </div>
      </section>

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
                  <h4 className="text-base font-medium text-text-primary/85">{risk.title}</h4>
                  <Badge tone={risk.severity}>{risk.severity || "watch"}</Badge>
                </div>
                {risk.threshold && <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 font-mono text-sm text-text-primary/70">{risk.threshold}</div>}
                {risk.why_matters && <p className="mt-3 text-sm leading-7 text-text-primary/50">{risk.why_matters}</p>}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
