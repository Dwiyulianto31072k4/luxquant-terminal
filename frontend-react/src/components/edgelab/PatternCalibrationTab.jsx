// src/components/edgelab/PatternCalibrationTab.jsx
// v3 UX: insight band + collapsible methodology + sortable + clearer CI bars + drill
import { useState, useMemo } from "react";
import {
  TIER_COLORS, TIER_LABELS, Panel, Methodology, InsightBand,
  EmptyState, ReliabilityBadge,
} from "./_shared";

const TIER_DESC = {
  reliable: "n ≥ 30 and CI ≤ 5pp — robust evidence",
  moderate: "n ≥ 10 and CI ≤ 12pp — directional signal",
  unreliable: "small sample or wide CI — treat with caution",
};

const CalibrationRow = ({ row, onDrill }) => {
  const wr = row.win_rate ?? 0;
  const ciLo = row.win_rate_ci_lower ?? 0;
  const ciHi = row.win_rate_ci_upper ?? 100;
  const color = TIER_COLORS[row.reliability];

  return (
    <button
      type="button"
      onClick={() =>
        onDrill?.({
          dimension: "pattern",
          key: row.pattern,
          label: row.pattern,
          total: row.count,
          win_rate: row.win_rate,
        })
      }
      className="group block w-full text-left py-2.5 border-b border-ink/[0.04] last:border-b-0 hover:bg-ink/[0.02] hover:shadow-[inset_2px_0_0_0_rgba(212,168,83,0.5)] -mx-5 px-5 cursor-pointer transition"
    >
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-mono text-text-primary/90 truncate">{row.pattern}</span>
          <ReliabilityBadge tier={row.reliability} compact />
        </div>
        <div className="flex items-baseline gap-3 font-mono tabular-nums flex-shrink-0">
          <span className="text-[10px] text-text-primary/35">n={row.count}</span>
          <span className="text-[10px] text-text-primary/35">±{row.win_rate_ci_half_width?.toFixed(1)}pp</span>
          <span className="text-base font-semibold" style={{ color }}>{wr.toFixed(1)}%</span>
        </div>
      </div>

      <div className="relative h-4">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 bg-ink/[0.035] rounded-full" />
        <div className="absolute top-1/2 -translate-y-1/2 w-px h-3.5 bg-ink/12" style={{ left: "50%" }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full"
          style={{ left: `${ciLo}%`, width: `${Math.max(ciHi - ciLo, 0.5)}%`, background: `${color}33` }}
        />
        <div className="absolute top-1/2 -translate-y-1/2 w-px h-3" style={{ left: `${ciLo}%`, background: `${color}99` }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-px h-3" style={{ left: `${ciHi}%`, background: `${color}99` }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded-full transition-transform group-hover:scale-125"
          style={{ left: `calc(${wr}% - 4px)`, width: 8, height: 8, background: color, boxShadow: "0 0 0 2px rgb(var(--surface-raised))" }}
        />
      </div>
    </button>
  );
};

const PatternCalibrationTab = ({ data, onDrill }) => {
  const [tierFilter, setTierFilter] = useState("all");

  const tierCounts = useMemo(() => {
    const c = { reliable: 0, moderate: 0, unreliable: 0 };
    for (const d of data || []) c[d.reliability] = (c[d.reliability] || 0) + 1;
    return c;
  }, [data]);

  const filtered = useMemo(() => {
    if (!data?.length) return [];
    const arr = tierFilter === "all" ? data : data.filter((d) => d.reliability === tierFilter);
    const rank = { reliable: 0, moderate: 1, unreliable: 2 };
    return [...arr].sort(
      (a, b) =>
        rank[a.reliability] - rank[b.reliability] ||
        b.count - a.count ||
        (b.win_rate ?? 0) - (a.win_rate ?? 0)
    );
  }, [data, tierFilter]);

  const insights = useMemo(() => {
    if (!data?.length) return [];
    const reliable = data.filter((d) => d.reliability === "reliable");
    const out = [];
    const bestRel = [...reliable].sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0))[0];
    if (bestRel) {
      out.push({
        kind: "good",
        label: "Most reliable edge",
        value: `${bestRel.pattern}`,
        sub: `${bestRel.win_rate.toFixed(1)}% WR · n=${bestRel.count} · ±${bestRel.win_rate_ci_half_width?.toFixed(1)}pp`,
      });
    }
    const worstRel = [...reliable].sort((a, b) => (a.win_rate ?? 0) - (b.win_rate ?? 0))[0];
    if (worstRel && bestRel && worstRel.pattern !== bestRel.pattern && worstRel.win_rate < 70) {
      out.push({
        kind: "bad",
        label: "Weakest reliable pattern",
        value: `${worstRel.pattern}`,
        sub: `${worstRel.win_rate.toFixed(1)}% WR · n=${worstRel.count} — lowest among trusted`,
      });
    }
    const trap = [...(data || [])]
      .filter((d) => d.reliability === "unreliable" && (d.win_rate ?? 0) >= 90)
      .sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0))[0];
    if (trap) {
      out.push({
        kind: "neutral",
        label: "Looks great, low evidence",
        value: `${trap.pattern}`,
        sub: `${trap.win_rate.toFixed(1)}% but only n=${trap.count} (±${trap.win_rate_ci_half_width?.toFixed(1)}pp) — unconfirmed`,
      });
    }
    return out;
  }, [data]);

  if (!data?.length)
    return <EmptyState title="No calibration data available" hint="Need at least 5 signals per pattern in this date range" />;

  return (
    <div className="space-y-4">
      <InsightBand items={insights} />

      <Methodology title="How calibration works">
        Win rate alone misleads at small samples. We compute the{" "}
        <span className="text-text-primary/85 font-mono">Wilson 95% confidence interval</span> around each pattern's WR —
        the band where the true WR most likely sits given sample size. Narrow band + large n ={" "}
        <span className="text-emerald-400">reliable</span>; wide band ={" "}
        <span className="text-red-400">caution</span>. Tiers:{" "}
        {Object.entries(TIER_DESC).map(([t, d], i) => (
          <span key={t}>
            <span style={{ color: TIER_COLORS[t] }} className="font-mono">{TIER_LABELS[t]}</span> ({d})
            {i < 2 ? "; " : "."}
          </span>
        ))}{" "}
        <span className="text-gold-primary/70">Click a pattern</span> to open its signals.
      </Methodology>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTierFilter("all")}
          className={`px-3 py-1.5 rounded-md border text-[10px] font-mono uppercase tracking-wider transition ${
            tierFilter === "all"
              ? "border-line/40 bg-gold-primary/10 text-gold-primary"
              : "border-ink/[0.08] text-text-primary/55 hover:text-text-primary"
          }`}
        >
          All <span className="text-text-primary/30 ml-1">({data.length})</span>
        </button>
        {["reliable", "moderate", "unreliable"].map((t) => {
          const isActive = tierFilter === t;
          const color = TIER_COLORS[t];
          return (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className="px-3 py-1.5 rounded-md border text-[10px] font-mono uppercase tracking-wider transition"
              style={isActive
                ? { borderColor: `${color}66`, background: `${color}15`, color }
                : { borderColor: "rgb(var(--ink) / 0.08)", color: "rgb(var(--ink) / 0.55)" }}
              title={TIER_DESC[t]}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                {TIER_LABELS[t]} <span className="text-text-primary/30 ml-0.5">({tierCounts[t] || 0})</span>
              </span>
            </button>
          );
        })}
      </div>

      <Panel
        title="Win rate · 95% confidence interval"
        meta={`${filtered.length} of ${data.length} shown`}
        pad={false}
      >
        <div className="px-5 pt-4">
          <div className="relative h-4">
            {[0, 25, 50, 75, 100].map((v) => (
              <div
                key={v}
                className="absolute top-0 -translate-x-1/2 text-[9px] font-mono tabular-nums text-text-primary/30"
                style={{ left: `${v}%` }}
              >
                {v}%
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 pb-2 pt-1">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-text-primary/30 text-sm font-mono uppercase tracking-wider">
              No patterns match this tier
            </div>
          ) : (
            filtered.map((row) => <CalibrationRow key={row.pattern} row={row} onDrill={onDrill} />)
          )}
        </div>

        <div className="px-5 py-3 border-t border-ink/[0.05] flex items-center gap-4 text-[10px] text-text-primary/35 font-mono flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-full bg-ink/15" /> 95% CI band
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-ink/60" /> observed WR
          </span>
          <span className="text-text-primary/25">| vertical line = 50% breakeven · click a row to drill</span>
        </div>
      </Panel>
    </div>
  );
};

export default PatternCalibrationTab;
