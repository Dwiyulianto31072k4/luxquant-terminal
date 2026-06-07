// src/components/edgelab/HourDowHeatmapTab.jsx
// ════════════════════════════════════════════════════════════════
// v3 UX: larger, legible punchcard (DOW rows × hour cols) + drill.
//   · Click any cell with signals → onDrill({dimension:'timing_cell', key:'H|DOW'})
//   · WR number shown when n ≥ 5; gold hover ring marks clickable cells
//   · Reuses wrColor / WR_LEGEND for scale consistency
// ════════════════════════════════════════════════════════════════
import { useMemo } from "react";
import { wrColor, WR_LEGEND, Panel, Methodology, InsightBand, EmptyState } from "./_shared";

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // PG DOW 0=Sun
const pad = (h) => `${String(h).padStart(2, "0")}:00`;

const HourDowHeatmapTab = ({ data, onDrill }) => {
  const { grid, insights } = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array(24).fill(null));
    if (data?.length) {
      for (const c of data) {
        if (c.dow >= 0 && c.dow < 7 && c.hour >= 0 && c.hour < 24) g[c.dow][c.hour] = c;
      }
    }
    const ins = [];
    if (data?.length) {
      const sized = data.filter((c) => c.count >= 5 && c.win_rate != null);
      if (sized.length) {
        const sorted = [...sized].sort((a, b) => b.win_rate - a.win_rate);
        const best = sorted[0], worst = sorted[sorted.length - 1];
        ins.push({ kind: "good", label: "Best window", value: `${DOW_NAMES[best.dow]} ${pad(best.hour)} UTC`, sub: `${best.win_rate.toFixed(1)}% WR · ${best.wins}/${best.count}` });
        if (worst.win_rate < best.win_rate)
          ins.push({ kind: "bad", label: "Worst window", value: `${DOW_NAMES[worst.dow]} ${pad(worst.hour)} UTC`, sub: `${worst.win_rate.toFixed(1)}% WR · ${worst.wins}/${worst.count}` });

        const byDow = DOW_NAMES.map((name, dow) => {
          const cells = data.filter((c) => c.dow === dow);
          const w = cells.reduce((s, c) => s + c.wins, 0);
          const t = cells.reduce((s, c) => s + c.count, 0);
          return { name, wr: t ? (w / t) * 100 : null, t };
        }).filter((d) => d.t >= 10);
        const bestDay = [...byDow].sort((a, b) => (b.wr ?? 0) - (a.wr ?? 0))[0];
        if (bestDay) ins.push({ kind: "neutral", label: "Strongest weekday", value: bestDay.name, sub: `${bestDay.wr.toFixed(1)}% WR across ${bestDay.t} signals` });
      }
    }
    return { grid: g, insights: ins };
  }, [data]);

  if (!data?.length) return <EmptyState title="No timing data" />;

  const HOUR_W = 30, ROW_H = 30, GAP = 3, LABEL_W = 42;

  return (
    <div className="space-y-4">
      <InsightBand items={insights} />

      <Methodology title="How to read this">
        Win rate by the hour (UTC) and weekday a signal was <span className="text-white/85">created</span>. Rows are
        days, columns are hours. <span className="text-gold-primary/70">Click any cell</span> to open the signals in
        that window. Bright green = strong entry timing, red = avoid; faint cells have fewer than 5 signals.
      </Methodology>

      <Panel title="Hour × day-of-week timing" meta="UTC">
        <div className="overflow-x-auto pb-1">
          <div style={{ minWidth: 24 * (HOUR_W + GAP) + LABEL_W }}>
            {/* hour header */}
            <div className="flex items-end" style={{ gap: GAP, marginLeft: LABEL_W }}>
              {Array.from({ length: 24 }).map((_, h) => (
                <div
                  key={h}
                  className="text-[9px] font-mono tabular-nums text-white/35 text-center"
                  style={{ width: HOUR_W }}
                >
                  {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                </div>
              ))}
            </div>

            {/* rows */}
            <div className="flex flex-col mt-1.5" style={{ gap: GAP }}>
              {DOW_NAMES.map((name, dow) => (
                <div key={dow} className="flex items-center" style={{ gap: GAP }}>
                  <div
                    className="text-[10px] font-mono uppercase tracking-wider text-white/45 text-right pr-2.5"
                    style={{ width: LABEL_W }}
                  >
                    {name}
                  </div>
                  {Array.from({ length: 24 }).map((_, hour) => {
                    const cell = grid[dow][hour];
                    const total = cell?.count || 0;
                    const wr = cell?.win_rate ?? null;
                    const dim = total > 0 && total < 5;
                    const has = total > 0;

                    return (
                      <button
                        key={hour}
                        type="button"
                        disabled={!has}
                        onClick={() =>
                          has &&
                          onDrill?.({
                            dimension: "timing_cell",
                            key: `${hour}|${dow}`,
                            label: `${name} ${pad(hour)} UTC`,
                            total,
                            wins: cell.wins,
                            win_rate: wr,
                          })
                        }
                        className={`rounded-[4px] flex items-center justify-center transition ${
                          has
                            ? "cursor-pointer hover:ring-1 hover:ring-gold-primary/60 hover:z-10"
                            : "cursor-default"
                        }`}
                        style={{
                          width: HOUR_W,
                          height: ROW_H,
                          background: wrColor(wr, total),
                          opacity: dim ? 0.45 : 1,
                          border: has ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(255,255,255,0.02)",
                        }}
                        title={
                          cell
                            ? `${name} ${pad(hour)} UTC · ${cell.wins}/${cell.count} · ${wr?.toFixed(1)}%`
                            : `${name} ${pad(hour)} UTC · no data`
                        }
                      >
                        {total >= 5 && wr != null && (
                          <span className="font-mono tabular-nums text-[9px] text-white/85 leading-none">
                            {wr.toFixed(0)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* legend */}
        <div className="mt-5 pt-3.5 border-t border-white/[0.05] flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase tracking-wider text-white/40">
          {WR_LEGEND.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <span className="w-3.5 h-3 rounded-[2px] border border-white/10" style={{ background: s.c }} />
              {s.l}
            </span>
          ))}
          <span className="ml-2 text-white/25 normal-case tracking-normal">· number shown when n ≥ 5 · click a cell to drill</span>
        </div>
      </Panel>
    </div>
  );
};

export default HourDowHeatmapTab;
