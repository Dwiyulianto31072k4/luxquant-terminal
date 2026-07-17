// src/components/edgelab/PatternBtcHeatmapTab.jsx
// v3 UX: insight band (regime-dependent patterns) + full-width heatmap grid + drill
import { useMemo } from "react";
import { wrColor, WR_LEGEND, Panel, Methodology, InsightBand, EmptyState } from "./_shared";

const BTC_CONTEXTS = ["BULLISH", "RANGING", "BEARISH", "UNKNOWN"];
const CTX_SHORT = { BULLISH: "BULL", RANGING: "RANGE", BEARISH: "BEAR", UNKNOWN: "UNK" };

const PatternBtcHeatmapTab = ({ data, onDrill }) => {
  const { patterns } = useMemo(() => {
    if (!data?.length) return { patterns: [] };
    const map = {};
    for (const row of data) {
      const p = row.pattern;
      if (!map[p]) map[p] = { pattern: p, total: 0, cells: {} };
      map[p].cells[row.btc_context] = row;
      map[p].total += row.count;
    }
    return { patterns: Object.values(map).sort((a, b) => b.total - a.total) };
  }, [data]);

  // surface regime-dependent patterns: largest WR spread across contexts (with enough n)
  const insights = useMemo(() => {
    if (!patterns.length) return [];
    const out = [];
    const spreads = patterns
      .map((p) => {
        const cells = BTC_CONTEXTS.map((c) => p.cells[c]).filter((c) => c && c.count >= 5);
        if (cells.length < 2) return null;
        const wrs = cells.map((c) => ({ ctx: c.btc_context, wr: c.win_rate, n: c.count }));
        const hi = wrs.reduce((a, b) => (b.wr > a.wr ? b : a));
        const lo = wrs.reduce((a, b) => (b.wr < a.wr ? b : a));
        return { pattern: p.pattern, hi, lo, spread: hi.wr - lo.wr };
      })
      .filter(Boolean)
      .sort((a, b) => b.spread - a.spread);

    const top = spreads[0];
    if (top && top.spread >= 15) {
      out.push({
        kind: "neutral",
        label: "Most regime-dependent",
        value: top.pattern,
        sub: `${top.hi.wr.toFixed(0)}% in ${top.hi.ctx} vs ${top.lo.wr.toFixed(0)}% in ${top.lo.ctx} (${top.spread.toFixed(0)}pp gap)`,
      });
    }

    // best single cell with strong sample
    const allCells = patterns.flatMap((p) =>
      BTC_CONTEXTS.map((c) => p.cells[c]).filter((c) => c && c.count >= 10)
    );
    const bestCell = [...allCells].sort((a, b) => b.win_rate - a.win_rate)[0];
    if (bestCell) {
      out.push({
        kind: "good",
        label: "Best regime combo",
        value: `${bestCell.pattern} · ${CTX_SHORT[bestCell.btc_context]}`,
        sub: `${bestCell.win_rate.toFixed(1)}% WR · n=${bestCell.count}`,
      });
    }
    const worstCell = [...allCells].sort((a, b) => a.win_rate - b.win_rate)[0];
    if (worstCell && bestCell && worstCell.win_rate < 60) {
      out.push({
        kind: "bad",
        label: "Avoid this combo",
        value: `${worstCell.pattern} · ${CTX_SHORT[worstCell.btc_context]}`,
        sub: `${worstCell.win_rate.toFixed(1)}% WR · n=${worstCell.count}`,
      });
    }
    return out;
  }, [patterns]);

  if (!patterns.length)
    return <EmptyState title="No heatmap data available" hint="Need at least 3 signals per (pattern × BTC context)" />;

  return (
    <div className="space-y-4">
      <InsightBand items={insights} />

      <Methodology title="How to read this">
        Win rate for each pattern split by BTC market regime at signal time. Brighter green ={" "}
        <span className="text-emerald-400">stronger</span>, red ={" "}
        <span className="text-red-400">weaker</span>. A big color shift across a row means that pattern is
        regime-dependent — only trade it in the regimes where it's green.{" "}
        <span className="text-gold-primary/70">Click a cell</span> to open its signals.
      </Methodology>

      <Panel title="WR by pattern × BTC context" meta={`${patterns.length} patterns`} pad={false}>
        {/* header row */}
        <div className="grid items-center px-5 py-2.5 border-b border-ink/[0.05]"
             style={{ gridTemplateColumns: "minmax(150px,1.4fr) repeat(4,1fr) 56px", gap: "6px" }}>
          <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-text-primary/40">Pattern</div>
          {BTC_CONTEXTS.map((c) => (
            <div key={c} className="text-[10px] tracking-[0.15em] font-mono uppercase text-text-primary/40 text-center">
              {c}
            </div>
          ))}
          <div className="text-[10px] tracking-[0.15em] font-mono uppercase text-text-primary/40 text-right">N</div>
        </div>

        <div className="px-5 py-2">
          {patterns.map((p) => (
            <div
              key={p.pattern}
              className="grid items-stretch py-[3px]"
              style={{ gridTemplateColumns: "minmax(150px,1.4fr) repeat(4,1fr) 56px", gap: "6px" }}
            >
              <div className="flex items-center font-mono text-xs text-text-primary/85 truncate pr-2">{p.pattern}</div>
              {BTC_CONTEXTS.map((ctx) => {
                const cell = p.cells[ctx];
                if (!cell)
                  return (
                    <div key={ctx} className="flex items-center justify-center rounded-md min-h-[40px] bg-ink/[0.015]">
                      <span className="text-text-primary/12 text-xs">·</span>
                    </div>
                  );
                const dim = cell.count < 5;
                return (
                  <button
                    key={ctx}
                    type="button"
                    onClick={() =>
                      onDrill?.({
                        dimension: "pattern_btc",
                        key: `${p.pattern}|${ctx}`,
                        label: `${p.pattern} · ${ctx}`,
                        total: cell.count,
                        wins: cell.wins,
                        win_rate: cell.win_rate,
                      })
                    }
                    className="flex min-h-[40px] cursor-pointer flex-col items-center justify-center rounded-md transition hover:ring-1 hover:ring-white/30"
                    style={{ background: wrColor(cell.win_rate, cell.count), opacity: dim ? 0.5 : 1, border: "1px solid rgba(0,0,0,0.22)" }}
                    title={`${p.pattern} · ${ctx} · ${cell.wins}/${cell.count} · ${cell.win_rate?.toFixed(1)}%`}
                  >
                    <span className="font-mono text-[13px] font-bold tabular-nums leading-none text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
                      {cell.win_rate?.toFixed(0)}%
                    </span>
                    <span className="mt-0.5 font-mono text-[9px] tabular-nums text-white/80" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.45)" }}>n={cell.count}</span>
                  </button>
                );
              })}
              <div className="flex items-center justify-end font-mono tabular-nums text-xs text-text-primary/55">
                {p.total}
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-ink/[0.05] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase tracking-wider text-text-primary/40">
            {WR_LEGEND.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <span className="w-4 h-3 rounded-sm border border-ink/10" style={{ background: s.c }} />
                {s.l}
              </span>
            ))}
          </div>
          <span className="text-[10px] font-mono text-text-primary/25">faint cells = n &lt; 5 · click to drill</span>
        </div>
      </Panel>
    </div>
  );
};

export default PatternBtcHeatmapTab;
