import React from "react";
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
  if (["healthy", "fresh", "supported", "approved", "bullish"].includes(value)) {
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

function readableSupport(value) {
  const label = String(value || "unknown").replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getHorizon(report, key) {
  const verdict = report?.report?.verdict || {};
  const summary = report?.verdict_summary || {};
  if (key === "24h") {
    return verdict.tactical_24h || summary.tactical_24h || null;
  }
  if (key === "72h") {
    return verdict.secondary_7d || summary.secondary_7d || null;
  }
  return verdict.primary_30d || summary.primary_30d || null;
}

function StanceCard({ label, subtitle, verdict, health }) {
  const direction = String(verdict?.direction || "neutral").toLowerCase();
  const color = directionColor(direction);
  const confidence = verdict?.confidence;
  return (
    <div className={cx(mutedCard, "p-4")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-white/35">
            {label}
          </div>
          <div className="text-[10px] text-white/35">{subtitle}</div>
        </div>
        <Badge tone={health?.support || "neutral"}>
          {readableSupport(health?.support || "ok")}
        </Badge>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-2xl" style={{ color }}>
          {directionArrow(direction)}
        </span>
        <span className="text-2xl font-semibold text-white/90">
          {directionLabel(direction)}
        </span>
        <span className="ml-auto font-mono text-lg text-[#d4a853]">
          {confidence != null ? `${confidence}%` : "-"}
        </span>
      </div>
      {health?.coverage != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-[#d4a853]"
            style={{ width: `${Math.round(Number(health.coverage) * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function StepCard({ index, title, body, tone }) {
  return (
    <div className={cx(mutedCard, "p-4")}>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#d4a853]/20 bg-[#d4a853]/10 text-xs font-mono text-[#d4a853]">
          {index}
        </div>
        <div className="text-sm font-medium text-white/85">{title}</div>
      </div>
      <p className="text-xs leading-relaxed text-white/45">{body}</p>
      {tone && <div className="mt-3"><Badge tone={tone}>{tone}</Badge></div>}
    </div>
  );
}

function MiniMetric({ label, value, note, tone = "neutral" }) {
  return (
    <div className={cx(mutedCard, "p-3")}>
      <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/35">
        {label}
      </div>
      <div className={cx("mt-2 truncate text-base font-semibold", badgeTone(tone).includes("emerald") ? "text-emerald-300" : badgeTone(tone).includes("red") ? "text-red-300" : badgeTone(tone).includes("amber") ? "text-amber-200" : "text-white/85")}>
        {value}
      </div>
      {note && <div className="mt-1 text-[10px] text-white/35">{note}</div>}
    </div>
  );
}

function buildTrendSummary(tripleScreen) {
  if (!tripleScreen?.length) return "Trend alignment is not available yet.";
  const counts = tripleScreen.reduce(
    (acc, item) => {
      const state = String(item.state || "").toLowerCase();
      if (state.includes("bull") || state.includes("up")) acc.bull += 1;
      else if (state.includes("bear") || state.includes("down")) acc.bear += 1;
      else acc.mixed += 1;
      return acc;
    },
    { bull: 0, bear: 0, mixed: 0 },
  );
  if (counts.bull >= 2) return "Trend is leaning bullish across the main timeframes.";
  if (counts.bear >= 2) return "Trend is leaning bearish across the main timeframes.";
  return "Trend is mixed, so confidence should stay controlled.";
}

function nextZoneSummary(zones, currentPrice) {
  if (!zones?.length) return "No key price zones are available yet.";
  if (!currentPrice) return "Key price zones are available, but current price is missing.";
  const withDistance = zones
    .filter((zone) => zone.price_low != null && zone.price_high != null)
    .map((zone) => {
      const mid = (Number(zone.price_low) + Number(zone.price_high)) / 2;
      return { ...zone, mid, distance: Math.abs(mid - Number(currentPrice)) };
    })
    .sort((a, b) => a.distance - b.distance);
  const nearest = withDistance[0];
  if (!nearest) return "No key price zones are available yet.";
  const relation =
    currentPrice >= nearest.price_low && currentPrice <= nearest.price_high
      ? "inside"
      : nearest.mid > currentPrice
        ? "below"
        : "above";
  return `Price is ${relation} the nearest ${String(nearest.kind || "zone").replaceAll("_", " ")} area: ${formatPriceRange(nearest.price_low, nearest.price_high)}.`;
}

function ZoneList({ zones, currentPrice }) {
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
          const inside =
            currentPrice &&
            currentPrice >= Number(zone.price_low) &&
            currentPrice <= Number(zone.price_high);
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
            </div>
          );
        })}
    </div>
  );
}

function RiskList({ risks }) {
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
            <p className="mt-2 text-xs leading-relaxed text-white/40">
              {risk.why_matters}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ReasoningDetails({ steps, whatChanged }) {
  const visibleSteps = (steps || []).slice(0, 5);
  return (
    <div className={cx(card, "overflow-hidden")}>
      <details className="group border-b border-white/[0.06]" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-white/85">
          Why Compass reads it this way
          <span className="text-xs text-white/35 transition-transform group-open:rotate-180">v</span>
        </summary>
        <div className="space-y-3 px-5 pb-5">
          {visibleSteps.length ? (
            visibleSteps.map((step, index) => (
              <div key={`${step.title}-${index}`} className="rounded-xl border border-white/[0.05] bg-black/15 p-4">
                <div className="mb-1 text-sm font-medium text-white/80">
                  {step.title || `Reason ${index + 1}`}
                </div>
                <p className="text-xs leading-relaxed text-white/45">
                  {step.interpretation || step.observation || "No explanation available."}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-white/45">No reasoning summary is available.</p>
          )}
        </div>
      </details>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-white/85">
          What changed since the previous read
          <span className="text-xs text-white/35 transition-transform group-open:rotate-180">v</span>
        </summary>
        <div className="px-5 pb-5">
          <p className="text-sm leading-relaxed text-white/45">
            {whatChanged?.summary ||
              whatChanged?.headline ||
              "No material change is highlighted for this cycle."}
          </p>
        </div>
      </details>
    </div>
  );
}

export default function CompassBrief({
  report,
  dashboardHealth,
  operationalHealth,
  eventRisk,
}) {
  if (!report) return null;

  const inner = report.report || {};
  const verdict = inner.verdict || {};
  const tactical = getHorizon(report, "24h");
  const swing = getHorizon(report, "72h");
  const cycle = getHorizon(report, "cycle");
  const price = report.btc_price;
  const zones = verdict.zones_to_watch || [];
  const tripleScreen = verdict.triple_screen || [];
  const risks = verdict.risk_scenarios || [];
  const reasoning = verdict.reasoning_chain || [];
  const headline = verdict.headline || "Compass read is available.";
  const narrative = verdict.narrative || "BTC Compass has generated a new market read.";
  const dataStatus =
    operationalHealth?.status === "healthy" && dashboardHealth?.status === "healthy"
      ? "healthy"
      : operationalHealth?.status || dashboardHealth?.status || "unknown";
  const eventTone = eventRisk?.risk_level || "low";

  return (
    <div className="space-y-6">
      <section className={cx(card, "overflow-hidden")}>
        <div className="border-b border-white/[0.06] px-5 py-4 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={dataStatus}>
                Market data {dataStatus === "healthy" ? "healthy" : "needs attention"}
              </Badge>
              <Badge tone={eventTone}>Event risk {readableSupport(eventTone)}</Badge>
            </div>
            <div className="text-[11px] font-mono text-white/35">
              Updated {formatRelative(report.timestamp)}
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-5 md:grid-cols-[1.25fr_0.75fr] md:p-6">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#d4a853]/75">
              BTC Compass read
            </div>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.03em] text-white md:text-5xl">
              {headline}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/55">
              {narrative}
            </p>
          </div>

          <div className={cx(mutedCard, "p-4")}>
            <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-white/35">
              Reading path
            </div>
            <div className="mt-4 space-y-3">
              {[
                "1. Direction and confidence",
                "2. Why the market leans that way",
                "3. Price areas that matter",
                "4. Risks that can break the read",
              ].map((item) => (
                <div key={item} className="rounded-lg border border-white/[0.05] bg-black/15 px-3 py-2 text-xs text-white/55">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-t border-white/[0.06] p-5 md:grid-cols-3 md:p-6">
          <StanceCard
            label="Tactical"
            subtitle="Next 24 hours"
            verdict={tactical}
            health={dashboardHealth?.horizons?.["24h"]}
          />
          <StanceCard
            label="Swing"
            subtitle="Next 72 hours"
            verdict={swing}
            health={dashboardHealth?.horizons?.["72h"]}
          />
          <StanceCard
            label="Cycle"
            subtitle="Broad backdrop"
            verdict={cycle}
            health={{ support: "context" }}
          />
        </div>
      </section>

      <section>
        <SectionTitle eyebrow="Storyline" title="Why this read makes sense" />
        <div className="grid gap-3 md:grid-cols-4">
          <StepCard
            index="1"
            title="Bias first"
            body={`${directionLabel(tactical?.direction)} short-term, ${directionLabel(swing?.direction)} over 72 hours. Confidence stays visible so the read does not pretend to be certain.`}
            tone={dashboardHealth?.horizons?.["24h"]?.support}
          />
          <StepCard
            index="2"
            title="Trend context"
            body={buildTrendSummary(tripleScreen)}
            tone="neutral"
          />
          <StepCard
            index="3"
            title="Price map"
            body={nextZoneSummary(zones, price)}
            tone="neutral"
          />
          <StepCard
            index="4"
            title="Risk filter"
            body={eventRisk?.summary || "No major event warning is active for this read."}
            tone={eventTone}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <MiniMetric label="BTC price" value={formatPrice(price)} tone="neutral" />
        <MiniMetric
          label="24h read"
          value={`${directionLabel(tactical?.direction)} ${tactical?.confidence ?? "-"}%`}
          tone={tactical?.direction}
        />
        <MiniMetric
          label="72h read"
          value={`${directionLabel(swing?.direction)} ${swing?.confidence ?? "-"}%`}
          tone={swing?.direction}
        />
        <MiniMetric
          label="Read quality"
          value={dataStatus === "healthy" ? "Healthy" : "Check needed"}
          note="Simplified for readers"
          tone={dataStatus}
        />
      </section>

      <section>
        <SectionTitle eyebrow="Price areas" title="Where BTC gets interesting" />
        <ZoneList zones={zones} currentPrice={price} />
      </section>

      <section>
        <SectionTitle eyebrow="Invalidation" title="What can break the read" />
        <RiskList risks={risks} />
      </section>

      <ReasoningDetails steps={reasoning} whatChanged={verdict.what_changed} />
    </div>
  );
}
