// src/components/edgelab/ExpectedValueTab.jsx
import { useState, useMemo } from "react";

const TIER_COLORS = {
  reliable: "#10b981",
  moderate: "#f59e0b",
  unreliable: "#ef4444",
};

const ExpectedValueTab = ({ data }) => {
  const [sortBy, setSortBy] = useState("expected_value");
  const [sortDir, setSortDir] = useState("desc");

  const sorted = useMemo(() => {
    if (!data?.length) return [];
    const arr = [...data];
    arr.sort((a, b) => {
      const va = a[sortBy] ?? -Infinity;
      const vb = b[sortBy] ?? -Infinity;
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return arr;
  }, [data, sortBy, sortDir]);

  const toggleSort = (key) => {
    if (sortBy === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const SortHeader = ({ id, label, align = "right" }) => {
    const isActive = sortBy === id;
    return (
      <th
        onClick={() => toggleSort(id)}
        className={`px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase font-normal cursor-pointer hover:text-white transition ${
          isActive ? "text-gold-primary" : "text-white/40"
        } text-${align}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {isActive && <span className="text-[8px]">{sortDir === "desc" ? "▼" : "▲"}</span>}
        </span>
      </th>
    );
  };

  if (!data?.length) {
    return (
      <div className="rounded-md bg-[#0a0805] border border-white/[0.06] p-10 text-center">
        <div className="text-white/30 text-sm font-mono uppercase tracking-wider">
          No EV data available
        </div>
        <div className="text-white/20 text-xs font-mono mt-2 normal-case">
          Need at least 5 signals per pattern in this date range
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
          · Expected Value per Trade ·
        </div>
        <p className="text-xs text-white/65 leading-relaxed">
          EV ={" "}
          <span className="font-mono text-white/85">
            (WR × avg_win_peak) + (LR × avg_loss_peak)
          </span>{" "}
          — the expected % return per signal of this pattern. Positive EV ={" "}
          <span className="text-emerald-400">edge exists</span>, negative ={" "}
          <span className="text-red-400">losing pattern</span>. Click column headers to sort.
        </p>
      </div>

      {/* Table */}
      <div className="relative rounded-md bg-[#0a0805] border border-white/[0.06] overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />

        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <div className="text-[10px] tracking-[0.2em] font-mono uppercase text-white/40">
            Pattern Expected Value — sorted by {sortBy.replace(/_/g, " ")}
          </div>
          <div className="text-[9px] font-mono uppercase tracking-wider text-white/30">
            {sorted.length} patterns
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal">
                  Pattern
                </th>
                <SortHeader id="count" label="N" />
                <SortHeader id="win_rate" label="WR %" />
                <SortHeader id="avg_win_peak" label="Avg Win" />
                <SortHeader id="avg_loss_peak" label="Avg Loss" />
                <SortHeader id="expected_value" label="EV" />
                <th className="px-3 py-3 text-[10px] tracking-[0.2em] font-mono uppercase text-white/40 font-normal text-center">
                  Tier
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const tierColor = TIER_COLORS[p.reliability];
                const ev = p.expected_value;
                return (
                  <tr
                    key={p.pattern}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition"
                  >
                    <td className="px-4 py-2.5 font-mono text-sm text-white/85 whitespace-nowrap">
                      {p.pattern}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-white/80">
                      {p.count}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                        p.win_rate >= 75
                          ? "text-emerald-400"
                          : p.win_rate >= 50
                          ? "text-white/75"
                          : "text-red-400"
                      }`}
                    >
                      {p.win_rate?.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-400/80">
                      {p.avg_win_peak !== null && p.avg_win_peak !== undefined
                        ? `+${p.avg_win_peak.toFixed(2)}%`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-red-400/80">
                      {p.avg_loss_peak !== null && p.avg_loss_peak !== undefined
                        ? `${p.avg_loss_peak.toFixed(2)}%`
                        : "—"}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums font-medium ${
                        ev === null
                          ? "text-white/30"
                          : ev > 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {ev === null
                        ? "—"
                        : `${ev > 0 ? "+" : ""}${ev.toFixed(2)}`}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ background: tierColor }}
                        title={p.reliability}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-white/[0.05] text-[10px] text-white/35 leading-relaxed">
          EV in % units per trade. Tier dot: green = reliable, amber = moderate, red = unreliable.
        </div>
      </div>
    </div>
  );
};

export default ExpectedValueTab;
