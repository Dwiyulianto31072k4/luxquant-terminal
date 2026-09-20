// SignalsCoinFlow — where money is turning over, and whether LuxQuant is on it.
//
// Collapsed: the busiest coins by name and face, not an abstract bar strip. A
// row of ten anonymous blocks stretched across a desktop is a colour band, not
// a chart, and it never said which coin was which.
// Open: the findings this snapshot supports, then a table that uses the whole
// width, then any row opens into the full picture of that coin.
//
// Rebuilt 2026-09-20. Three things were wrong and all three were measurable:
//
//  1. The table was capped at 1100px and centred, so a third of a wide desk was
//     empty. The old note said spreading six columns over 1900px puts a screen
//     between each number — true, and the answer is more columns, not less
//     table. The snapshot carries price, 7d, 30d, the turnover band and volume
//     against a week ago; none of it was on screen.
//  2. `vol_change_7d` was in every payload and drawn nowhere. It is the only
//     field here that says something CHANGED: 46 of 250 coins are trading at 3x
//     the volume they did a week ago, ZAMA at 35x. Turnover is a level; this is
//     the news.
//  3. The intensity bar was scaled to the busiest coin on screen, so the same
//     coin drew a different length at 10 rows and at 250 (14% of the rail, then
//     6%, for an unchanged number). It is now scaled to a fixed reference — the
//     backend's own 30%-of-market-cap "high turnover" line.
//
// Intensity = 24h volume / market cap — size-adjusted churn, descriptive only.

import { useMemo, useState } from "react";
import CoinLogo from "./CoinLogo";
import {
  SegGroup,
  DESK_SHELL,
  deskBadgeClass,
  deskGhostClass,
  deskSegClass,
} from "./ui/SegGroup";
import CoinDetailModal from "./signals/CoinDetailModal";
import CoinScatter, { CoinScatterLarge } from "./signals/CoinScatter";
import ChartModal from "./signals/ChartModal";
import useStickyOpen from "./signals/useStickyOpen";
import {
  BandTag,
  Delta,
  Finding,
  TurnoverCell,
  VolCell,
} from "./signals/FlowUI";
import {
  coinCounts,
  coinFindings,
  filterCoins,
  enrichCoins,
  price as fmtPrice,
  HIGH_TURNOVER,
  num,
  percentileRanker,
  sortCoins,
  statusMeta,
  usdShort,
} from "./signals/flowMetrics";

const COUNT_OPTS = [
  { key: "10", label: "10" },
  { key: "25", label: "25" },
  { key: "50", label: "50" },
  { key: "250", label: "All" },
];

/** The trait rail: toggles, not segments.
 *
 *  Same shell, same segment class and the same badge token as SegGroup, so it
 *  measures identically beside it — a hand-rolled badge without the shared
 *  token came out three pixels shorter and broke the one-height rule the whole
 *  desk console is built on. What differs is the semantics: aria-pressed, not
 *  a tablist, because any number of these can be on at once. */
function TraitRail({ options, flags, onToggle }) {
  return (
    <div role="group" aria-label="How the coin is trading" className={DESK_SHELL}>
      {options.map((o) => {
        const on = flags.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            title={o.title}
            onClick={() => onToggle(o.key)}
            className={deskSegClass(on)}
          >
            {o.label}
            <span className={deskBadgeClass(on)}>{o.badge}</span>
          </button>
        );
      })}
    </div>
  );
}

function timeAgo(iso) {
  if (!iso) return null;
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** The collapsed strip: who is busiest, by face and by name. */
function TopStrip({ rows, onPick }) {
  return (
    <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
      {rows.map((r) => {
        const c = r.c;
        const chg = c.price_change_24h;
        return (
          <button
            key={c.coin_id || c.symbol}
            type="button"
            title={`${c.symbol} · turnover ${c.flow_intensity?.toFixed(2) ?? "—"}${
              r.called ? " · LuxQuant call" : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onPick(r);
            }}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2 transition-colors ${
              r.called
                ? "border-accent/50 bg-accent/[0.08]"
                : "border-ink/[0.1] hover:bg-ink/[0.04]"
            }`}
          >
            <CoinLogo pair={`${c.symbol}USDT`} size={18} />
            <span className="max-w-[70px] truncate text-[11.5px] font-medium text-text-primary">
              {c.symbol}
            </span>
            <span
              className={`font-mono text-[10.5px] tabular-nums ${
                chg == null ? "text-text-muted" : chg >= 0 ? "text-profit" : "text-loss"
              }`}
            >
              {chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(1)}%`}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function SignalsCoinFlow({
  coins = [],
  signals = [],
  narratives = [],
  onOpenSignal,
  onPickNarrative,
  onMore,
  defaultOpen = false,
}) {
  const [open, setOpen] = useStickyOpen("lq:signals:coinflow-open", defaultOpen);
  const [count, setCount] = useState(25);
  // Two controls, because they are two questions. Scope is a state a coin is
  // IN and only one can be true; traits are things a coin is DOING and any
  // number can be. Folded into one exclusive control, the obvious question —
  // which of the coins we are on are also busy — could not be asked.
  const [scope, setScope] = useState("all"); // all | called | uncalled
  const [flags, setFlags] = useState([]); // surge, busy
  const [mapOpen, setMapOpen] = useState(false);
  const [sort, setSort] = useState({ key: "intensity", dir: "desc" });
  // Rows answer "rank them"; bubbles answer "where is the weight". Same data,
  // two questions, so it is a mode rather than a second panel.
  const [view, setView] = useState("rows");
  const [drill, setDrill] = useState(null);

  const signalBySymbol = useMemo(() => {
    const m = new Map();
    for (const s of signals) {
      const sym = (s.pair || "").replace(/USDT$/i, "").toUpperCase();
      // Keep the newest call per coin: the desk list can hold several.
      const prev = m.get(sym);
      if (!prev || new Date(s.created_at) > new Date(prev.created_at)) m.set(sym, s);
    }
    return m;
  }, [signals]);

  const enriched = useMemo(() => enrichCoins(coins, signalBySymbol), [coins, signalBySymbol]);
  const findings = useMemo(() => coinFindings(enriched), [enriched]);

  // Turnover rails are percentile ranks over the WHOLE snapshot, so a coin's
  // bar is the same length whether the table is showing ten rows or two
  // hundred and fifty, and whether it is filtered to the calls or not.
  const toggleFlag = (k) =>
    setFlags((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  const turnoverRank = useMemo(
    () => percentileRanker(enriched.map((r) => num(r.c.flow_intensity))),
    [enriched]
  );
  const busyRank = useMemo(() => turnoverRank(HIGH_TURNOVER), [turnoverRank]);

  // Every badge is the size of the result you would get, not of the trait in
  // isolation: a chip that promises 41 and hands over 6 is worse than no chip.
  const counts = useMemo(() => coinCounts(enriched, scope, flags), [enriched, scope, flags]);
  // The collapsed subtitle is a headline about the snapshot, so it counts the
  // whole snapshot — not whatever the panel happens to be filtered to.
  const snapshot = useMemo(() => coinCounts(enriched, "all", []), [enriched]);
  const total = enriched.length;

  const scopeOpts = [
    { key: "all", label: "All", badge: counts.scopes.all },
    { key: "called", label: "Called", badge: counts.scopes.called, title: "LuxQuant called this coin in the last 7 days" },
    { key: "uncalled", label: "No call", badge: counts.scopes.uncalled, title: "No LuxQuant call in the last 7 days" },
  ];
  const traitOpts = [
    { key: "surge", label: "Woke up", badge: counts.flags.surge, title: "Trading at 3x or more of last week's volume" },
    { key: "busy", label: "Busy", badge: counts.flags.busy, title: "24h volume above 30% of market cap" },
  ];

  const sorted = useMemo(
    () => sortCoins(filterCoins(enriched, scope, flags), sort.key, sort.dir),
    [enriched, scope, flags, sort]
  );

  const rows = sorted.slice(0, count);

  // The strip always shows the busiest coins overall, whatever the table is
  // filtered to: it is the headline, not a second copy of the table.
  const stripRows = useMemo(
    () => sortCoins(enriched, "intensity", "desc").slice(0, 12),
    [enriched]
  );
  const top = stripRows[0]?.c;
  // Columns that only ever hold a dash for uncalled coins.
  const showCallCols = scope !== "uncalled";
  const filtered = scope !== "all" || flags.length > 0;

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }
    );

  const openCoin = (r) => setDrill(r);

  const SortHead = ({ label, k, align = "right", className = "", title }) => (
    <th
      title={title}
      className={`whitespace-nowrap px-2 py-1.5 ${align === "left" ? "text-left" : "text-right"} ${className}`}
    >
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.12em] ${
          sort.key === k ? "text-text-primary" : "text-text-muted hover:text-text-primary"
        } ${align === "left" ? "" : "flex-row-reverse"}`}
      >
        {label}
        <span className="text-[8px] opacity-70">
          {sort.key === k ? (sort.dir === "desc" ? "↓" : "↑") : ""}
        </span>
      </button>
    </th>
  );

  const CallBadge = () => (
    <span className="rounded bg-accent/15 px-1 py-px font-mono text-[8px] uppercase tracking-wider text-accent">
      Call
    </span>
  );

  if (!coins.length) return null;

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
            <span className="block text-[13px] font-medium text-text-primary">Coin flow</span>
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted sm:block">
              {top ? `${top.symbol} ${Number(top.flow_intensity || 0).toFixed(2)}` : "turnover"}
              {snapshot.flags.surge ? ` · ${snapshot.flags.surge} woke up` : ""}
              {snapshot.scopes.called ? ` · ${snapshot.scopes.called} called` : ""}
              {/* Not "tap to filter": a coin chip here opens that coin.
                  Only the Narratives row filters the desk, and saying the same
                  thing on both would make one of them a lie. */}
              {top ? " · tap to open" : ""}
            </span>
          </span>
        </button>
        <TopStrip rows={stripRows} onPick={openCoin} />
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
          {/* What this snapshot says, before any table. Each one carries the
              filter that proves it, so reading a finding and checking it are
              the same click. */}
          {findings.length ? (
            <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {findings.map((f) => (
                <Finding
                  key={f.key}
                  headline={f.headline}
                  detail={f.detail}
                  count={f.count}
                  active={
                    f.filter.scope ? scope === f.filter.scope : flags.includes(f.filter.flag)
                  }
                  onClick={() =>
                    f.filter.scope
                      ? setScope((s) => (s === f.filter.scope ? "all" : f.filter.scope))
                      : toggleFlag(f.filter.flag)
                  }
                />
              ))}
            </div>
          ) : null}

          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <SegGroup
              size="sm"
              fill="mobile"
              aria-label="Which coins"
              value={scope}
              onChange={setScope}
              options={scopeOpts}
            />
            <TraitRail options={traitOpts} flags={flags} onToggle={toggleFlag} />
            {filtered ? (
              <button
                type="button"
                onClick={() => {
                  setScope("all");
                  setFlags([]);
                }}
                className={deskGhostClass()}
              >
                Reset
              </button>
            ) : null}
            <SegGroup
              size="sm"
              aria-label="How many coins"
              value={String(count)}
              onChange={(k) => setCount(Number(k))}
              options={COUNT_OPTS}
            />
            <SegGroup
              size="sm"
              aria-label="Rows or bubbles"
              value={view}
              onChange={setView}
              options={[
                { key: "rows", label: "Rows" },
                { key: "map", label: "Map" },
              ]}
            />
            <p className="w-full text-[11px] leading-snug text-text-muted sm:w-auto sm:flex-1">
              Turnover = 24h volume ÷ market cap. The rail is where the coin sits among all{" "}
              {total} in the snapshot and the tick is the 30% busy line. Vol 7d is
              today&apos;s volume against its own level a week ago.
            </p>
          </div>

          {!rows.length ? (
            <p className="py-6 text-center text-[12.5px] text-text-muted">
              No coin in this snapshot is{" "}
              {[scope !== "all" ? (scope === "called" ? "one we called" : "uncalled") : null]
                .concat(flags.map((f) => (f === "surge" ? "trading at 3× last week" : "busy")))
                .filter(Boolean)
                .join(" and ")}
              . Drop one of the filters.
            </p>
          ) : view === "map" ? (
            /* The whole filtered snapshot, not the table's page of it: the row
               limit is a reading aid for a list and a scatter has no rows to
               scroll. Twenty-five dots would also hide the thing the plot is
               for — where the rest of the market sits around them. */
            <CoinScatter rows={sorted} onOpen={openCoin} onExpand={() => setMapOpen(true)} />
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-1 sm:hidden">
                {rows.map((r, i) => {
                  const { c, sig, called, fromCall } = r;
                  const sm = sig ? statusMeta(sig.status) : null;
                  return (
                    <button
                      key={c.coin_id || c.symbol}
                      type="button"
                      onClick={() => openCoin(r)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${
                        called ? "bg-accent/[0.06]" : "hover:bg-ink/[0.03]"
                      }`}
                    >
                      <span className="w-4 shrink-0 text-center font-mono text-[10px] text-text-muted">
                        {i + 1}
                      </span>
                      <CoinLogo pair={`${c.symbol}USDT`} size={22} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-text-primary">
                            {c.symbol}
                          </span>
                          {called ? <CallBadge /> : null}
                          {sm ? (
                            <span className={`rounded px-1 py-px text-[9px] font-medium ${sm.c}`}>
                              {sm.l}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[10px] tabular-nums text-text-muted">
                          <span>
                            24h <Delta value={c.price_change_24h} digits={1} />
                          </span>
                          <span>
                            7d <Delta value={c.price_change_7d} digits={1} />
                          </span>
                          <span>
                            vol <VolCell x={r.volX} />
                          </span>
                          {fromCall != null ? (
                            <span>
                              from call <Delta value={fromCall} digits={1} />
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <TurnoverCell value={c.flow_intensity} band={r.band} compact />
                    </button>
                  );
                })}
              </div>

              {/* Desktop table — FULL WIDTH.
                  It was capped and centred because six narrow columns across a
                  wide desk read as dead space. The columns that were missing
                  are what fills it: price, three horizons, the turnover band
                  and volume against a week ago all live in the same payload. */}
              <div className="no-scrollbar -mx-1 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[620px] border-collapse">
                  <thead>
                    <tr className="border-b border-ink/[0.06]">
                      <th className="w-6 py-1.5 pl-2 text-left font-mono text-[9px] text-text-muted">
                        #
                      </th>
                      <SortHead label="Coin" k="coin" align="left" />
                      <SortHead label="Price" k="price" className="hidden md:table-cell" />
                      <SortHead label="24h" k="chg" />
                      <SortHead label="7d" k="chg7" />
                      <SortHead label="30d" k="chg30" className="hidden xl:table-cell" />
                      <SortHead label="Cap" k="cap" className="hidden xl:table-cell" />
                      <SortHead
                        label="Turnover"
                        k="intensity"
                        title="24h volume ÷ market cap — the rail fills at 30%"
                      />
                      <th className="hidden px-2 py-1.5 text-left font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted lg:table-cell">
                        Band
                      </th>
                      <SortHead
                        label="Vol 7d"
                        k="vol"
                        className="hidden md:table-cell"
                        title="Today's 24h volume against its own level seven days ago"
                      />
                      {showCallCols && <SortHead label="From call" k="fromcall" />}
                      {showCallCols && <SortHead label="Status" k="status" align="left" />}
                      {showCallCols && (
                        <SortHead label="Called" k="called" align="left" className="hidden lg:table-cell" />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const { c, sig, called, fromCall } = r;
                      const sm = sig ? statusMeta(sig.status) : null;
                      return (
                        <tr
                          key={c.coin_id || c.symbol}
                          onClick={() => openCoin(r)}
                          className={`cursor-pointer border-b border-ink/[0.04] last:border-0 hover:bg-ink/[0.03] ${
                            called ? "bg-accent/[0.04]" : ""
                          }`}
                        >
                          <td className="py-2 pl-2 font-mono text-[10px] tabular-nums text-text-muted">
                            {i + 1}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <CoinLogo pair={`${c.symbol}USDT`} size={20} />
                              <span className="text-[12.5px] font-medium text-text-primary">
                                {c.symbol}
                              </span>
                              {called ? <CallBadge /> : null}
                            </div>
                          </td>
                          <td className="hidden whitespace-nowrap px-2 py-2 text-right font-mono text-[12px] tabular-nums text-text-secondary md:table-cell">
                            {fmtPrice(c.price)}
                          </td>
                          <td className="px-2 py-2 text-right text-[12px]">
                            <Delta value={c.price_change_24h} className="font-medium" />
                          </td>
                          <td className="px-2 py-2 text-right text-[12px]">
                            <Delta value={c.price_change_7d} />
                          </td>
                          <td className="hidden px-2 py-2 text-right text-[12px] xl:table-cell">
                            <Delta value={c.price_change_30d} />
                          </td>
                          <td className="hidden whitespace-nowrap px-2 py-2 text-right font-mono text-[11.5px] tabular-nums text-text-muted xl:table-cell">
                            {usdShort(c.market_cap)}
                          </td>
                          <td className="px-2 py-2">
                            <TurnoverCell
                              value={c.flow_intensity}
                              band={r.band}
                              rank={turnoverRank(num(c.flow_intensity))}
                              busyRank={busyRank}
                            />
                          </td>
                          <td className="hidden px-2 py-2 lg:table-cell">
                            <BandTag band={r.band} />
                          </td>
                          <td className="hidden px-2 py-2 text-right md:table-cell">
                            <VolCell x={r.volX} />
                          </td>
                          {showCallCols && (
                            <td className="px-2 py-2 text-right text-[12px]">
                              <Delta value={fromCall} className="font-medium" />
                            </td>
                          )}
                          {showCallCols && (
                            <td className="px-2 py-2">
                              {sm ? (
                                <span
                                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${sm.c}`}
                                >
                                  {sm.l}
                                </span>
                              ) : (
                                <span className="text-[11px] text-text-muted">—</span>
                              )}
                            </td>
                          )}
                          {showCallCols && (
                            <td className="hidden whitespace-nowrap px-2 py-2 font-mono text-[11px] tabular-nums text-text-muted lg:table-cell">
                              {sig?.created_at ? timeAgo(sig.created_at) : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {sorted.length > rows.length ? (
                <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
                  {rows.length} of {sorted.length}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <ChartModal
        isOpen={mapOpen}
        onClose={() => setMapOpen(false)}
        eyebrow="Coin flow"
        title="Is the busy money buying or selling?"
        subtitle={`${sorted.length} of ${total} coins · turnover against the day's move · tap a coin to open it`}
        controls={
          <>
            <SegGroup
              size="sm"
              aria-label="Which coins"
              value={scope}
              onChange={setScope}
              options={scopeOpts}
            />
            <TraitRail options={traitOpts} flags={flags} onToggle={toggleFlag} />
            {filtered ? (
              <button
                type="button"
                onClick={() => {
                  setScope("all");
                  setFlags([]);
                }}
                className={deskGhostClass()}
              >
                Reset
              </button>
            ) : null}
          </>
        }
        footer={
          <p className="text-[11px] leading-snug text-text-muted">
            Up is a coin that traded more of itself today, right is a coin that rose. Dot size is
            the dollars traded and gold is a coin we have called. Turnover has no direction on its
            own; this is the chart that gives it one. Both axes are square-root scales — the ticks
            carry their real values.
          </p>
        }
      >
        <CoinScatterLarge
          rows={sorted}
          onOpen={(r) => {
            // One modal at a time: the map hands over to the coin rather than
            // stacking a sheet on top of a sheet.
            setMapOpen(false);
            openCoin(r);
          }}
        />
      </ChartModal>

      <CoinDetailModal
        row={drill}
        rows={enriched}
        narratives={narratives}
        signals={signals}
        isOpen={!!drill}
        onClose={() => setDrill(null)}
        onOpenSignal={onOpenSignal}
        onPickNarrative={onPickNarrative}
      />
    </div>
  );
}
