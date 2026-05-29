// src/components/edgelab/PatternBtcHeatmapTab.jsx
import { useMemo } from "react";

// Sequential green gradient — darker = higher WR
const wrColor = (wr) => {
  if (wr === null || wr === undefined) return "rgba(255,255,255,0.04)";
  if (wr >= 90) return "rgba(16,185,129,0.55)";
  if (wr >= 75) return "rgba(16,185,129,0.4)";
  if (wr >= 60) return "rgba(16,185,129,0.25)";
  if (wr >= 50) return "rgba(255,255,255,0.08)";
  if (wr >= 35) return "rgba(239,68,68,0.25)";
  return "rgba(239,68,68,0.45)";
};

const BTC_CONTEXTS = ["BULLISH", "RANGING", "BEARISH", "UNKNOWN"];

const PatternBtcHeatmapTab = ({ data }) => {
  const { patterns, lookup } = useMemo(() => {
    if (!data?.length) return { patterns: [], lookup: {} };

    // Aggregate per pattern: total count + per-context cell
    const map = {};
    for (const row of data) {
      const p = row.pattern;
      if (!map[p]) map[p] = { pattern: p, total: 0, cells: {} };
      map[p].cells[row.btc_context] = row;
      map[p].total += row.count;
    }
    const sorted = Object.values(map).sort((a, b) => b.total - a.total);
    return { patterns: sorted, lookup: map };
  }, [data]);

  if (!patterns.length) {
    return (
      <div className="rounded-md bg-[#0a0805] border border-white/[0.06] p-10 text-center">
        <div className="text-white/30 text-sm font-mono uppercase tracking-wider">
          No heatmap data available
        </div>
        <div className="text-white/20 text-xs font-mono mt-2 normal-case">
          Need at least 3 signals per (pattern × BTC context) combination
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Methodology */}
      <div className="rounded-md bg-[#0a0805] border border-white/[0.06] p-4 relative">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="text-[10px] tracking-[0.25em] font-mono uppercase text-gold-primary/70 mb-2">
          · Pattern × BTC Context ·
        </div>
        <p className="text-xs text-white/65 leading-relaxed">
          Win rate for each pattern broken down by the BTC market regime at signal time. Cells
          show which combinations are <span className="text-emerald-400">overperforming</span> vs{" "}
          <span className="text-red-400">underperforming</span> the baseline. Hover to see counts.
        </p>
      </div>

      {/* Heatmap table */}
      <div className="relative rounded-md bg-[#0a0805] border border-white/[0.06] overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
            WR by Pattern × BTC Context
          </div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-white/30">
            {patterns.length} patterns
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                  Pattern
                </th>
                {BTC_CONTEXTS.map((ctx) => (
                  <th
                    key={ctx}
                    className="px-2 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal text-center"
                  >
                    BTC {ctx}
                  </th>
                ))}
                <th className="text-right px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {patterns.map((p) => (
                <tr key={p.pattern} className="border-b border-white/[0.03]">
                  <td className="px-4 py-2 font-mono text-xs text-white/85 whitespace-nowrap">
                    {p.pattern}
                  </td>
                  {BTC_CONTEXTS.map((ctx) => {
                    const cell = p.cells[ctx];
                    if (!cell) {
                      return (
                        <td key={ctx} className="px-2 py-2 text-center">
                          <span className="text-white/15 text-xs">·</span>
                        </td>
                      );
                    }
                    const bg = wrColor(cell.win_rate);
                    return (
                      <td key={ctx} className="px-2 py-2">
                        <div
                          className="rounded-sm px-2 py-2 text-center min-w-[70px]"
                          style={{ background: bg }}
                          title={`${cell.wins}/${cell.count} signals`}
                        >
                          <div className="font-mono tabular-nums text-xs text-white/95">
                            {cell.win_rate?.toFixed(0)}%
                          </div>
                          <div className="font-mono tabular-nums text-[9px] text-white/55">
                            n={cell.count}
                          </div>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-xs text-white/55">
                    {p.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-5 py-3 border-t border-white/[0.05] flex items-center gap-3 flex-wrap text-[10px] font-mono uppercase tracking-wider text-white/45">
          <span>Color scale:</span>
          {[
            { l: "<35", c: "rgba(239,68,68,0.45)" },
            { l: "35-50", c: "rgba(239,68,68,0.25)" },
            { l: "50-60", c: "rgba(255,255,255,0.08)" },
            { l: "60-75", c: "rgba(16,185,129,0.25)" },
            { l: "75-90", c: "rgba(16,185,129,0.4)" },
            { l: "≥90", c: "rgba(16,185,129,0.55)" },
          ].map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <span
                className="w-4 h-3 rounded-sm border border-white/10"
                style={{ background: s.c }}
              />
              {s.l}%
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PatternBtcHeatmapTab;
