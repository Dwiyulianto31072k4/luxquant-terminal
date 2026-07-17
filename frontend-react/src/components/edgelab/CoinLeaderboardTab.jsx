// src/components/edgelab/CoinLeaderboardTab.jsx
// ════════════════════════════════════════════════════════════════
// Per-coin leaderboard — the "which coins are worth following" view.
// · Two metrics that BOTH vary across coins (verified):
// WR 40–98%
// median peak 25–575% (peak potential, entry→high — NOT realized)
// · Sortable columns + inline bars; sector filter chips
// · Click a row → onDrill({dimension:'coin', key:pair}) → SignalDrillDrawer
// · n ≥ 10 enforced server-side; median (not avg) tames outliers
// ════════════════════════════════════════════════════════════════
import { useState, useMemo } from "react";
import CoinLogo from "../CoinLogo";
import { Panel, Methodology, InsightBand, EmptyState } from "./_shared";

const fmtPeak = (p) => {
  if (p == null) return "—";
  const a = Math.abs(p);
  if (a >= 1000) return `${(a / 1000).toFixed(1)}k%`;
  if (a >= 100) return `${Math.round(a).toLocaleString()}%`;
  return `${a.toFixed(1)}%`;
};
const fmtPair = (p) => (p || "").replace(/USDT$/i, "");
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00Z");
  return isNaN(d)
    ? String(iso).slice(5, 10)
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

const SECTORS = [
  "all",
  "infrastructure",
  "defi",
  "ai",
  "hype",
  "gamefi",
  "rwa",
  "payments",
  "privacy",
  "socialfi",
  "other",
];

const wrColorCls = (wr) =>
  wr >= 85
    ? "text-profit"
    : wr >= 70
      ? "text-text-primary/85"
      : wr >= 50
        ? "text-amber-400/90"
        : "text-loss";

const CoinLeaderboardTab = ({ data, onDrill }) => {
  const [sortBy, setSortBy] = useState("median_peak");
  const [sortDir, setSortDir] = useState("desc");
  const [sectorF, setSectorF] = useState("all");

  const maxMedian = useMemo(
    () => Math.max(...(data || []).map((d) => d.median_peak ?? 0), 1),
    [data]
  );

  const filtered = useMemo(() => {
    if (!data?.length) return [];
    let arr = sectorF === "all" ? data : data.filter((d) => d.sector === sectorF);
    arr = [...arr].sort((a, b) => {
      const va = a[sortBy] ?? -Infinity,
        vb = b[sortBy] ?? -Infinity;
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return arr;
  }, [data, sectorF, sortBy, sortDir]);

  const insights = useMemo(() => {
    if (!data?.length) return [];
    const out = [];
    const byMedian = [...data].sort((a, b) => (b.median_peak ?? 0) - (a.median_peak ?? 0))[0];
    if (byMedian)
      out.push({
        kind: "good",
        label: "Biggest upside",
        value: fmtPair(byMedian.pair),
        sub: `${fmtPeak(byMedian.median_peak)} median peak · ${byMedian.win_rate}% WR · n=${byMedian.count}`,
      });
    const byWr = [...data].filter((d) => d.count >= 15).sort((a, b) => b.win_rate - a.win_rate)[0];
    if (byWr)
      out.push({
        kind: "neutral",
        label: "Highest win rate",
        value: fmtPair(byWr.pair),
        sub: `${byWr.win_rate}% WR · ${fmtPeak(byWr.median_peak)} median · n=${byWr.count}`,
      });
    // sweet spot: high WR AND high median peak
    const sweet = [...data]
      .filter((d) => d.win_rate >= 85 && d.count >= 12)
      .sort((a, b) => (b.median_peak ?? 0) - (a.median_peak ?? 0))[0];
    if (sweet && sweet.pair !== byMedian?.pair)
      out.push({
        kind: "good",
        label: "Sweet spot (wins + size)",
        value: fmtPair(sweet.pair),
        sub: `${sweet.win_rate}% WR & ${fmtPeak(sweet.median_peak)} median peak`,
      });
    return out;
  }, [data]);

  if (!data?.length)
    return (
      <EmptyState
        title="No coin data"
        hint="Need at least 10 resolved signals per coin in this range"
      />
    );

  const toggleSort = (k) => {
    if (sortBy === k) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortBy(k);
      setSortDir("desc");
    }
  };

  const SortTh = ({ id, label, w }) => {
    const active = sortBy === id;
    return (
      <th
        onClick={() => toggleSort(id)}
        style={w ? { width: w } : undefined}
        className={`px-3 py-3 text-[10px] tracking-[0.18em] font-mono uppercase font-normal cursor-pointer hover:text-text-primary transition text-right ${active ? "text-accent" : "text-text-primary/40"}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && <span className="text-[8px]">{sortDir === "desc" ? "▼" : "▲"}</span>}
        </span>
      </th>
    );
  };

  return (
    <div className="space-y-4">
      <InsightBand items={insights} />

      <Methodology title="How to read this">
        Every coin with ≥ 10 resolved signals in range.{" "}
        <span className="text-text-primary/85">WR</span> = how often it wins;{" "}
        <span className="text-text-primary/85">median peak</span> = the typical highest gain from
        entry (entry → high,{" "}
        <span className="text-text-primary/60">peak potential, not realized PnL</span>). Median is
        used so a few moonshots don't skew the picture.{" "}
        <span className="text-text-muted">Click a coin</span> to open its signals.
      </Methodology>

      {/* sector filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {SECTORS.map((s) => (
          <button
            key={s}
            onClick={() => setSectorF(s)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider border transition ${
              sectorF === s
                ? "border-ink/15 bg-accent/12 text-accent"
                : "border-ink/[0.08] text-text-primary/45 hover:text-text-primary/80"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <Panel title="Coin leaderboard" meta={`${filtered.length} coins`} pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/[0.06]">
                <th className="text-left px-4 py-3 text-[10px] tracking-[0.18em] font-mono uppercase text-text-primary/40 font-normal">
                  Coin
                </th>
                <th className="text-left px-3 py-3 text-[10px] tracking-[0.18em] font-mono uppercase text-text-primary/40 font-normal">
                  Sector
                </th>
                <SortTh id="count" label="N" w={56} />
                <SortTh id="win_rate" label="WR" w={72} />
                <SortTh id="median_peak" label="Median peak" w={150} />
                <SortTh id="best_peak" label="Best" w={84} />
                <th
                  className="px-3 py-3 text-[10px] tracking-[0.18em] font-mono uppercase text-text-primary/40 font-normal text-right"
                  style={{ width: 80 }}
                >
                  Last
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const barPct =
                  c.median_peak != null && maxMedian > 0
                    ? Math.min(
                        100,
                        Math.max(
                          3,
                          (Math.log10(Math.abs(c.median_peak) + 1) / Math.log10(maxMedian + 1)) *
                            100
                        )
                      )
                    : 0;
                return (
                  <tr
                    key={c.pair}
                    onClick={() =>
                      onDrill?.({
                        dimension: "coin",
                        key: c.pair,
                        label: fmtPair(c.pair),
                        total: c.count,
                        wins: c.wins,
                        win_rate: c.win_rate,
                      })
                    }
                    className="border-b border-ink/[0.03] hover:bg-ink/[0.03] hover:shadow-[inset_2px_0_0_0_rgb(var(--accent) / 0.5)] cursor-pointer transition"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2.5">
                        <CoinLogo pair={c.pair} size={22} />
                        <span className="font-mono text-[13px] text-text-primary/90">
                          {fmtPair(c.pair)}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono uppercase tracking-wider text-text-primary/45">
                      {c.sector}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary/70">
                      {c.count}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums ${wrColorCls(c.win_rate)}`}
                    >
                      {c.win_rate}%
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="font-mono tabular-nums text-profit/90 text-[13px]">
                          {fmtPeak(c.median_peak)}
                        </span>
                        <div className="h-1.5 w-16 rounded-full bg-ink/[0.05] overflow-hidden shrink-0">
                          <div
                            className="h-full rounded-full bg-profit/50"
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary/45">
                      {fmtPeak(c.best_peak)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-text-primary/35 text-[11px]">
                      {fmtDate(c.last_signal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-ink/[0.05] text-[10px] text-text-primary/35 font-mono">
          n ≥ 10 signals · median peak = entry→high potential (not realized) · click a coin to drill
        </div>
      </Panel>
    </div>
  );
};

export default CoinLeaderboardTab;
