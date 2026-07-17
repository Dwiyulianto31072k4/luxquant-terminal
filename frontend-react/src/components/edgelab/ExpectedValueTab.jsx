// src/components/edgelab/ExpectedValueTab.jsx
// v3 UX: insight band + inline diverging EV bar + tier badge + sortable + drill
import { useState, useMemo } from "react";
import {
  TIER_COLORS,
  Panel,
  Methodology,
  InsightBand,
  EmptyState,
  ReliabilityBadge,
} from "./_shared";

const ExpectedValueTab = ({ data, onDrill }) => {
  const [sortBy, setSortBy] = useState("expected_value");
  const [sortDir, setSortDir] = useState("desc");

  const maxAbsEV = useMemo(() => {
    if (!data?.length) return 1;
    return Math.max(...data.map((d) => Math.abs(d.expected_value ?? 0)), 1);
  }, [data]);

  const sorted = useMemo(() => {
    if (!data?.length) return [];
    return [...data].sort((a, b) => {
      const va = a[sortBy] ?? -Infinity;
      const vb = b[sortBy] ?? -Infinity;
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [data, sortBy, sortDir]);

  const insights = useMemo(() => {
    if (!data?.length) return [];
    const out = [];
    const reliable = data.filter((d) => d.reliability !== "unreliable" && d.expected_value != null);
    const topEV = [...reliable].sort((a, b) => b.expected_value - a.expected_value)[0];
    if (topEV) {
      out.push({
        kind: "good",
        label: "Highest EV (trusted)",
        value: `${topEV.pattern}`,
        sub: `+${topEV.expected_value.toFixed(2)}% / trade · ${topEV.win_rate?.toFixed(0)}% WR · n=${topEV.count}`,
      });
    }
    const neg = [...data]
      .filter((d) => (d.expected_value ?? 0) < 0)
      .sort((a, b) => a.expected_value - b.expected_value)[0];
    if (neg) {
      out.push({
        kind: "bad",
        label: "Negative EV — skip",
        value: `${neg.pattern}`,
        sub: `${neg.expected_value.toFixed(2)}% / trade · loses money on average`,
      });
    }
    const posCount = data.filter((d) => (d.expected_value ?? 0) > 0).length;
    out.push({
      kind: "neutral",
      label: "Edge breadth",
      value: `${posCount} / ${data.length}`,
      sub: `patterns with positive expected value`,
    });
    return out;
  }, [data]);

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const SortHeader = ({ id, label, align = "right", w }) => {
    const isActive = sortBy === id;
    return (
      <th
        onClick={() => toggleSort(id)}
        style={w ? { width: w } : undefined}
        className={`px-3 py-3 text-[10px] tracking-[0.18em] font-mono uppercase font-normal cursor-pointer hover:text-text-primary transition ${
          isActive ? "text-accent" : "text-text-primary/40"
        } text-${align}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {isActive && <span className="text-[8px]">{sortDir === "desc" ? "▼" : "▲"}</span>}
        </span>
      </th>
    );
  };

  if (!data?.length)
    return (
      <EmptyState
        title="No EV data available"
        hint="Need at least 5 signals per pattern in this date range"
      />
    );

  return (
    <div className="space-y-4">
      <InsightBand items={insights} />

      <Methodology title="How EV is computed">
        EV ={" "}
        <span className="font-mono text-text-primary/85">
          (WR × avg_win_peak) + (LR × avg_loss_peak)
        </span>{" "}
        — the expected % return per signal. Positive ={" "}
        <span className="text-profit">edge exists</span>, negative ={" "}
        <span className="text-loss">losing pattern</span>. The bar shows EV magnitude; the dot shows
        tier confidence. A high EV on an <span className="text-loss">unreliable</span> tier is not
        yet trustworthy. <span className="text-text-muted">Click a row</span> to open the signals
        behind it.
      </Methodology>

      <Panel
        title={`Pattern expected value — sorted by ${sortBy.replace(/_/g, " ")}`}
        meta={`${sorted.length} patterns`}
        pad={false}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/[0.06]">
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.18em] font-mono uppercase text-text-primary/40 font-normal">
                  Pattern
                </th>
                <SortHeader id="count" label="N" w={56} />
                <SortHeader id="win_rate" label="WR" w={70} />
                <SortHeader id="avg_win_peak" label="Avg Win" w={90} />
                <SortHeader id="avg_loss_peak" label="Avg Loss" w={90} />
                <SortHeader id="expected_value" label="EV" w={80} />
                <th
                  className="px-3 py-3 text-[10px] tracking-[0.18em] font-mono uppercase text-text-primary/40 font-normal text-left"
                  style={{ minWidth: 160 }}
                >
                  EV magnitude
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const ev = p.expected_value;
                const tierColor = TIER_COLORS[p.reliability];
                const barPct = ev == null ? 0 : (Math.abs(ev) / maxAbsEV) * 50; // half-width max
                const pos = (ev ?? 0) >= 0;
                return (
                  <tr
                    key={p.pattern}
                    onClick={() =>
                      onDrill?.({
                        dimension: "pattern",
                        key: p.pattern,
                        label: p.pattern,
                        total: p.count,
                        wins: p.wins,
                        win_rate: p.win_rate,
                      })
                    }
                    className="border-b border-ink/[0.03] hover:bg-ink/[0.03] hover:shadow-[inset_2px_0_0_0_rgb(var(--accent) / 0.5)] cursor-pointer transition"
                  >
                    <td className="px-4 py-2.5 font-mono text-[13px] text-text-primary/85 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ background: tierColor }}
                          title={p.reliability}
                        />
                        {p.pattern}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary/70">
                      {p.count}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums ${p.win_rate >= 75 ? "text-profit" : p.win_rate >= 50 ? "text-text-primary/75" : "text-loss"}`}
                    >
                      {p.win_rate?.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-profit/80">
                      {p.avg_win_peak != null ? `+${p.avg_win_peak.toFixed(1)}%` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-loss/70">
                      {p.avg_loss_peak != null ? `${p.avg_loss_peak.toFixed(1)}%` : "—"}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums font-semibold ${ev == null ? "text-text-primary/30" : pos ? "text-profit" : "text-loss"}`}
                    >
                      {ev == null ? "—" : `${pos ? "+" : ""}${ev.toFixed(2)}`}
                    </td>
                    {/* diverging bar */}
                    <td className="px-3 py-2.5">
                      <div className="relative h-3 w-full">
                        <div
                          className="absolute top-0 bottom-0 w-px bg-ink/15"
                          style={{ left: "50%" }}
                        />
                        {ev != null && (
                          <div
                            className="absolute top-1/2 -translate-y-1/2 h-2 rounded-sm transition-all duration-500"
                            style={{
                              left: pos ? "50%" : `${50 - barPct}%`,
                              width: `${barPct}%`,
                              background: pos ? "rgba(16,185,129,0.65)" : "rgba(239,68,68,0.6)",
                            }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-ink/[0.05] flex items-center gap-4 text-[10px] text-text-primary/35 font-mono flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: TIER_COLORS.reliable }} />{" "}
            reliable
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: TIER_COLORS.moderate }} />{" "}
            moderate
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: TIER_COLORS.unreliable }} />{" "}
            unreliable
          </span>
          <span className="text-text-primary/25">
            | bar centered at 0 · right = +EV, left = −EV · click a row to drill
          </span>
        </div>
      </Panel>
    </div>
  );
};

export default ExpectedValueTab;
