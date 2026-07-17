// src/components/edgelab/HourDowHeatmapTab.jsx
// ════════════════════════════════════════════════════════════════
// v4 UX: fluid full-width punchcard (DOW rows × 24 hour cols).
//   · CSS grid '40px repeat(24, 1fr)' → cells stretch to fill width
//     (same fluid approach as the Calendar tab) instead of fixed 30px
//   · aspect-square cells, WR% hero + small n (two-tier like calendar)
//   · Empty windows render faint (not dark "holes"); n<5 dimmed, no number
//   · Click any cell with signals → onDrill({dimension:'timing_cell'})
//   · Mobile: horizontal scroll preserved via min-width
// ════════════════════════════════════════════════════════════════
import { useMemo } from "react";
import { wrColor, WR_LEGEND, Panel, Methodology, InsightBand, EmptyState } from "./_shared";

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // PG DOW 0=Sun
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const pad = (h) => `${String(h).padStart(2, "0")}:00`;
const GRID_COLS = "40px repeat(24, minmax(0, 1fr))";

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

  return (
    <div className="space-y-4">
      <InsightBand items={insights} />

      <Methodology title="How to read this">
        Win rate by the hour (UTC) and weekday a signal was <span className="text-text-primary/85">created</span>. Rows are
        days, columns are hours. <span className="text-gold-primary/70">Click any cell</span> to open the signals in
        that window. Bright green = strong entry timing, red = avoid; faint cells have fewer than 5 signals.
      </Methodology>

      <Panel title="Hour × day-of-week timing" meta="UTC">
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[640px]">
            {/* hour header — same grid template so columns align exactly */}
            <div className="grid items-end mb-1.5" style={{ gridTemplateColumns: GRID_COLS, gap: 4 }}>
              <div />
              {HOURS.map((h) => (
                <div key={h} className="text-center text-[9px] font-mono tabular-nums text-text-primary/35 leading-none">
                  {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
                </div>
              ))}
            </div>

            {/* rows */}
            <div className="flex flex-col" style={{ gap: 4 }}>
              {DOW_NAMES.map((name, dow) => (
                <div key={dow} className="grid items-center" style={{ gridTemplateColumns: GRID_COLS, gap: 4 }}>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-text-primary/45 text-right pr-2 leading-none">
                    {name}
                  </div>
                  {HOURS.map((hour) => {
                    const cell = grid[dow][hour];
                    const total = cell?.count || 0;
                    const wr = cell?.win_rate ?? null;
                    const has = total > 0;
                    const dim = has && total < 5;

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
                        className={`relative aspect-square rounded-md flex flex-col items-center justify-center transition ${
                          has
                            ? "cursor-pointer hover:ring-1 hover:ring-gold-primary/60 hover:z-10"
                            : "cursor-default"
                        }`}
                        style={{
                          background: has ? wrColor(wr, total) : "rgb(var(--ink) / 0.015)",
                          opacity: dim ? 0.5 : 1,
                          border: has ? "1px solid rgb(var(--ink) / 0.06)" : "1px solid rgb(var(--ink) / 0.02)",
                        }}
                        title={
                          has
                            ? `${name} ${pad(hour)} UTC · ${cell.wins}/${cell.count} · ${wr?.toFixed(1)}%`
                            : `${name} ${pad(hour)} UTC · no data`
                        }
                      >
                        {total >= 5 && wr != null && (
                          <>
                            <span className="font-mono tabular-nums text-[13px] text-text-primary/95 leading-none">
                              {wr.toFixed(0)}
                            </span>
                            <span className="font-mono tabular-nums text-[8px] text-text-primary/45 leading-none mt-0.5">
                              {cell.count}
                            </span>
                          </>
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
        <div className="mt-5 pt-3.5 border-t border-ink/[0.05] flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase tracking-wider text-text-primary/40">
          {WR_LEGEND.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <span className="w-3.5 h-3 rounded-[2px] border border-ink/10" style={{ background: s.c }} />
              {s.l}
            </span>
          ))}
          <span className="ml-2 text-text-primary/25 normal-case tracking-normal">· big number = WR%, small = signals · shown when n ≥ 5 · click to drill</span>
        </div>
      </Panel>
    </div>
  );
};

export default HourDowHeatmapTab;
