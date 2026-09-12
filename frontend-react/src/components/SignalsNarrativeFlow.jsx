// SignalsNarrativeFlow — which narratives the desk is calling into, and how
// those narratives are trading right now.
//
// Sibling to SignalsCoinFlow. Coin flow answers "where is turnover"; this one
// answers "what story are we in". Collapsed: narrative chips with the faces of
// the coins we called there. Open: ranked table, sortable, click to filter the
// desk to that narrative.
//
// Grouped by CoinGecko narrative, not by our 10 coins.sector buckets. Measured
// 2026-09-12: rolling narratives up into the buckets flattens the 24h move to a
// 0.9pp spread across all ten, while a single coin's own categories disagree by
// 3.04pp — the noise inside one coin was three times the signal between sectors.
//
// A coin sits in ~4.8 narratives at once, so these are OVERLAPPING sets and a
// call is counted under each. "Coins" therefore reads "how much of this
// narrative we have called", never "share of the book" — the columns are not
// meant to sum to 100%.

import { useMemo, useState } from "react";
import CoinLogo from "./CoinLogo";
import { SegGroup } from "./ui/SegGroup";
import { InfoTip } from "./GuideInfo";
import SignalsNarrativeRotation from "./SignalsNarrativeRotation";
import SignalsNarrativeBoard, { NarrativeQuadrant } from "./SignalsNarrativeBoard";
import { useChartTokens } from "./charts/EChart";

// The TP ladder, ordinal: tp1 → tp4 is "ran further". One validated hue ramp.
const OUTCOMES = [
  { key: "tp4", label: "TP4", token: "viz-tp4" },
  { key: "tp3", label: "TP3", token: "viz-tp3" },
  { key: "tp2", label: "TP2", token: "viz-tp2" },
  { key: "tp1", label: "TP1", token: "viz-tp1" },
  { key: "sl", label: "SL", token: "neg" },
];

const WINDOW_OPTS = [
  { key: "30", label: "30d" },
  { key: "90", label: "90d" },
];

// No 7d window, deliberately. Measured over 7 days the thinnest narratives fall
// to single-digit n, which is the exact rate-on-nothing the desk keeps getting
// burned by. 30d is the shortest window every row survives.
const SORT_OPTS = [
  { key: "coins", label: "Our calls", title: "Coins we called inside this narrative" },
  { key: "move", label: "Live move", title: "Category market cap change, last 24h" },
  { key: "peak", label: "Typ. peak", title: "Median best-case move of our calls here" },
];

function snapAge(iso) {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Chg({ pct, className = "" }) {
  if (pct == null || Number.isNaN(Number(pct)))
    return <span className={`text-text-muted ${className}`}>—</span>;
  const n = Number(pct);
  return (
    <span className={`font-mono tabular-nums ${n >= 0 ? "text-profit" : "text-loss"} ${className}`}>
      {n >= 0 ? "+" : ""}
      {n.toFixed(2)}%
    </span>
  );
}

/** Up to three faces from the narrative, most-called first. */
function CoinStack({ pairs = [], size = 18 }) {
  const shown = pairs.slice(0, 3);
  if (!shown.length) return null;
  return (
    <span className="flex shrink-0 items-center">
      {shown.map((p, i) => (
        <span key={p} style={{ marginLeft: i ? -6 : 0, zIndex: 3 - i }} className="rounded-full">
          <CoinLogo pair={p} size={size} />
        </span>
      ))}
    </span>
  );
}

/** How those calls ended, as one stacked bar.
 *
 *  The bar here used to be coins-relative-to-the-largest — a ranking the row
 *  number already carries, drawn twice. It now shows the outcome mix, in the
 *  same TP ramp the flow chart uses, so a row and the Sankey beside it are the
 *  same statement at two scales. Widths are shares of that narrative's own
 *  resolved calls, so every bar is full width and rows stay comparable. */
function OutcomeMix({ flow, coins, tokens }) {
  const parts = OUTCOMES.map((o) => ({ ...o, w: Number(flow?.[o.key] || 0) })).filter((p) => p.w > 0);
  const total = parts.reduce((s, p) => s + p.w, 0);
  return (
    <div className="flex items-center justify-end gap-2">
      <span
        className="flex h-1.5 w-14 overflow-hidden rounded-full bg-ink/[0.07] sm:w-20"
        title={
          total
            ? parts.map((p) => `${p.label} ${Math.round((p.w / total) * 100)}%`).join(" · ")
            : "no resolved calls yet"
        }
      >
        {parts.map((p) => (
          <span
            key={p.key}
            style={{ width: `${(p.w / total) * 100}%`, background: tokens[p.token] || "currentColor" }}
          />
        ))}
      </span>
      <span className="w-7 text-right font-mono text-[11px] tabular-nums text-text-primary">
        {coins}
      </span>
    </div>
  );
}

/** WR beside the n it rests on. The n is not decoration: the top narratives sit
 *  inside two points of each other, so the sample is the only thing that tells
 *  a real gap from a wobble. */
function WrCell({ wr, n }) {
  if (wr == null) return <span className="text-text-muted">—</span>;
  return (
    <span className="whitespace-nowrap font-mono tabular-nums">
      <span className="text-[12px] text-text-primary">{wr.toFixed(1)}%</span>
      <span className="ml-1 text-[9.5px] text-text-muted">{n}</span>
    </span>
  );
}

const EXPLAIN =
  "Narratives are CoinGecko categories. A coin belongs to several at once, so a call is " +
  "counted under each one — these sets overlap and do not add up to the book.\n\n" +
  "Coins = how many coins we called inside that narrative in the window.\n" +
  "24h = the category's own market-cap move, from the 4-hourly snapshot.\n" +
  "WR = the highest level our calls there reached was TP1 or better. It is not profit, " +
  "and a call that tagged SL1 before running to target still counts as a win. The small " +
  "number beside it is the sample.\n" +
  "Typ. peak = the median best-case move of those calls — what the call reached at its " +
  "high, not what a trade returned.\n\n" +
  "Only narratives with 3+ coins we called are listed, and categories under $50M market " +
  "cap are excluded: below that a category's 24h change is usually a constituent change, " +
  "not a market move.";

export default function SignalsNarrativeFlow({
  data,
  loading = false,
  days = 30,
  onDaysChange,
  onPick,
  activeIds = [],
  onMore,
}) {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState("coins");
  // Phone only: the two halves are a toggle, not a stack. Stacked, the flow
  // panel sits under a 40-row table where nobody scrolls to it.
  const [view, setView] = useState("table");
  const tokens = useChartTokens();

  const narratives = useMemo(() => data?.narratives || [], [data]);

  const sorted = useMemo(() => {
    const val = (x) => {
      if (sort === "move") return x.mcap_change_24h ?? -Infinity;
      if (sort === "peak") return x.median_peak ?? -Infinity;
      return x.coins_called ?? -Infinity;
    };
    return [...narratives].sort((a, b) => val(b) - val(a));
  }, [narratives, sort]);

  // The strip always leads with where we are most invested, whatever the table
  // is sorted by: it is the headline, not a second copy of the table.
  const stripRows = useMemo(
    () => [...narratives].sort((a, b) => (b.coins_called ?? 0) - (a.coins_called ?? 0)).slice(0, 10),
    [narratives]
  );

  const lead = stripRows[0];
  const age = snapAge(data?.snapshot_at);
  // A Set, not .includes on an array: this is asked once per chip and once per
  // table row, on every render.
  const activeSet = useMemo(() => new Set(activeIds || []), [activeIds]);
  // Where each narrative sits in the table right now. The rotation panel prints
  // it so a row there can be found here instead of looking like another list.
  const rankOf = useMemo(() => {
    const m = new Map();
    sorted.forEach((x, i) => m.set(x.category_id, i + 1));
    return m;
  }, [sorted]);
  const activeNames = useMemo(
    () => narratives.filter((x) => activeSet.has(x.category_id)).map((x) => x.name),
    [narratives, activeSet]
  );

  const sortOpts = SORT_OPTS;
  const windowOpts = WINDOW_OPTS.map((o) => ({
    ...o,
    badge: String(o.key) === String(days) ? narratives.length : undefined,
  }));

  if (!loading && !narratives.length) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-ink/[0.07] bg-surface-raised">
      <div className="flex items-center gap-2.5 px-3 py-2 sm:px-3.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex shrink-0 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted ${
              open ? "" : "-rotate-90"
            }`}
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
          <span className="shrink-0">
            <span className="block text-[13px] font-medium text-text-primary">Narratives</span>
            {/* Collapsed, the subtitle is the only place that can say this row
                DOES something when tapped — the expanded panel's explanation is
                behind a click the user has no reason to make yet. When a
                narrative is on, it says so instead: a row that silently cut the
                table below it was the whole complaint. */}
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.12em] sm:block">
              {activeNames.length ? (
                <span className="text-accent">
                  Filtering ·{" "}
                  {activeNames.length === 1
                    ? activeNames[0]
                    : `${activeNames.length} narratives`}
                </span>
              ) : (
                <span className="text-text-muted">
                  {lead ? `${narratives.length} called` : "loading"}
                  {age ? ` · ${age}` : ""}
                  {lead ? " · tap to filter, pick several" : ""}
                </span>
              )}
            </span>
          </span>
        </button>

        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {stripRows.map((x) => {
            const active = activeSet.has(x.category_id);
            return (
              <button
                key={x.category_id}
                type="button"
                aria-pressed={active}
                title={`${x.name} · ${x.coins_called} coins called${
                  active ? " · picked" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPick?.(x);
                }}
                /* Solid gold when picked, the same "on" the day strip uses.
                   A tinted background was too close to the resting chip to
                   read as selected once several were on at once. */
                className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 transition-colors ${
                  active
                    ? "border-accent bg-accent shadow-sm"
                    : "border-ink/[0.1] hover:bg-ink/[0.04]"
                }`}
              >
                <CoinStack pairs={x.pairs} />
                <span
                  className={`max-w-[104px] truncate text-[11.5px] font-medium ${
                    active ? "text-accent-fg" : "text-text-primary"
                  }`}
                >
                  {x.name}
                </span>
                <span
                  className={`font-mono text-[10.5px] tabular-nums ${
                    active
                      ? "text-accent-fg/85"
                      : x.mcap_change_24h == null
                        ? "text-text-muted"
                        : x.mcap_change_24h >= 0
                          ? "text-profit"
                          : "text-loss"
                  }`}
                >
                  {x.mcap_change_24h == null
                    ? "—"
                    : `${x.mcap_change_24h >= 0 ? "+" : ""}${x.mcap_change_24h.toFixed(1)}%`}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onMore}
          className="shrink-0 rounded-md border border-ink/[0.12] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted hover:border-accent/40 hover:text-accent"
        >
          More
        </button>
      </div>

      {open ? (
        <div className="border-t border-ink/[0.06] px-3 pb-3 pt-2.5 sm:px-3.5">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <SegGroup
              size="sm"
              fill="mobile"
              aria-label="Sort narratives"
              value={sort}
              onChange={setSort}
              options={sortOpts}
            />
            <SegGroup
              size="sm"
              aria-label="Lookback window"
              value={String(days)}
              onChange={(k) => onDaysChange?.(Number(k))}
              options={windowOpts}
            />
            <SegGroup
              size="sm"
              className="lg:hidden"
              aria-label="Table or flow"
              value={view}
              onChange={setView}
              options={[
                { key: "table", label: "Table" },
                { key: "flow", label: "Rotation" },
              ]}
            />
            <span className="hidden items-center gap-2.5 lg:flex">
              {OUTCOMES.map((o) => (
                <span key={o.key} className="flex items-center gap-1">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: tokens[o.token] || "currentColor" }}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
                    {o.label}
                  </span>
                </span>
              ))}
            </span>
            <span className="flex items-center gap-1.5">
              <p className="text-[11px] leading-snug text-text-muted">
                Narratives we have 3+ calls in. Tap one to filter the desk.
              </p>
              <InfoTip side="bottom" title="Narratives" text={EXPLAIN} />
            </span>
          </div>

          {loading && !sorted.length ? (
            <p className="py-6 text-center text-[12.5px] text-text-muted">Loading narratives…</p>
          ) : (
            <>
              {/* Table and flow are one row on a desk and a toggle on a phone.
                  The table keeps the wider column: it is the thing you act on,
                  the Sankey is the thing you read. */}
              <SignalsNarrativeBoard
                narratives={narratives}
                marketChange7d={data?.market_change_7d ?? null}
              />

              <div
                className={`mt-3 grid gap-x-4 gap-y-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] ${
                  view === "table" ? "hidden lg:grid" : ""
                }`}
              >
                <NarrativeQuadrant
                  narratives={narratives}
                  marketChange7d={data?.market_change_7d ?? null}
                  activeIds={activeIds}
                  onPick={onPick}
                />
                <SignalsNarrativeRotation
                  narratives={narratives}
                  marketChange7d={data?.market_change_7d ?? null}
                  activeIds={activeIds}
                  rankOf={rankOf}
                  onPick={onPick}
                />
              </div>

              <div className={`mt-3 min-w-0 ${view === "flow" ? "hidden lg:block" : ""}`}>
              {/* Mobile cards */}
              <div className="space-y-1 sm:hidden">
                {sorted.map((x, i) => {
                  const active = activeSet.has(x.category_id);
                  return (
                    <button
                      key={x.category_id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onPick?.(x)}
                      /* A picked row carries a solid gold rail, not a wash:
                         several washes stacked down the list read as banding
                         rather than as a set of choices. */
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${
                        active
                          ? "border-l-2 border-accent bg-accent/[0.14]"
                          : "border-l-2 border-transparent hover:bg-ink/[0.03]"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-center font-mono text-[10px] text-text-muted">
                        {i + 1}
                      </span>
                      <CoinStack pairs={x.pairs} size={20} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-text-primary">
                          {x.name}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 font-mono text-[10px] tabular-nums text-text-muted">
                          <Chg pct={x.mcap_change_24h} />
                          <span>
                            WR <WrCell wr={x.wr} n={x.n} />
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <OutcomeMix flow={x.outcome_flow} coins={x.coins_called} tokens={tokens} />
                        <span className="mt-0.5 block font-mono text-[10.5px] tabular-nums text-profit">
                          {x.median_peak == null ? "—" : `+${x.median_peak.toFixed(1)}%`}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Desktop table — capped and CENTRED, same reason as Coin flow:
                  six narrow columns stretched across a 1900px desk put a third
                  of a screen between each number, and a capped block pinned
                  left just moves the dead space and looks half-loaded. */}
              <div className="no-scrollbar -mx-1 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b border-ink/[0.06]">
                      <th className="w-6 py-1.5 pl-2 text-left font-mono text-[9px] text-text-muted">
                        #
                      </th>
                      <th className="px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                        Narrative
                      </th>
                      <th className="px-2 py-1.5 text-right font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                        Mix · coins
                      </th>
                      <th className="px-2 py-1.5 text-right font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                        24h
                      </th>
                      <th className="px-2 py-1.5 text-right font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                        7d
                      </th>
                      <th className="px-2 py-1.5 text-right font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                        WR
                      </th>
                      <th className="px-2 py-1.5 text-right font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                        Typ. peak
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((x, i) => {
                      const active = activeSet.has(x.category_id);
                      return (
                        <tr
                          key={x.category_id}
                          onClick={() => onPick?.(x)}
                          aria-selected={active}
                          className={`cursor-pointer border-b border-ink/[0.04] last:border-0 hover:bg-ink/[0.03] ${
                            active ? "bg-accent/[0.14]" : ""
                          }`}
                        >
                          <td
                            className={`py-2 pl-2 font-mono text-[10px] tabular-nums ${
                              active ? "text-accent" : "text-text-muted"
                            }`}
                          >
                            {active ? "✓" : i + 1}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <CoinStack pairs={x.pairs} size={20} />
                              <span className="max-w-[240px] truncate text-[12.5px] font-medium text-text-primary">
                                {x.name}
                              </span>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <OutcomeMix flow={x.outcome_flow} coins={x.coins_called} tokens={tokens} />
                          </td>
                          <td className="px-2 py-2 text-right text-[12px]">
                            <Chg pct={x.mcap_change_24h} className="font-medium" />
                          </td>
                          <td className="px-2 py-2 text-right text-[12px]">
                            <Chg pct={x.mcap_change_7d} />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <WrCell wr={x.wr} n={x.n} />
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-[12px] tabular-nums text-profit">
                            {x.median_peak == null ? "—" : `+${x.median_peak.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
