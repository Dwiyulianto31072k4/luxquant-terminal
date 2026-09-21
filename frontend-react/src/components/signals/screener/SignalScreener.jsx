// SignalScreener — the filtered calls, side by side, on the numbers that decide
// whether a published trade is still on offer.
//
// The table is a list: it is exact, and it is read one row at a time. Past
// twenty or thirty rows that stops being a way to choose. This is the other
// half — the same calls as a field you can sort, screen and look at, with every
// mark opening the call it stands for.
//
// It leads with the measurement rather than a chart, because the measurement is
// what makes one axis matter more than the others. See screenMetrics for the
// numbers and how they were taken.

import { useMemo, useState } from "react";
import Modal from "../../ui/Modal";
import { SegGroup, DESK_SHELL, deskBadgeClass, deskGhostClass, deskSegClass } from "../../ui/SegGroup";
import { InfoTip } from "../../GuideInfo";
import ScreenMap from "./ScreenMap";
import Shortlist from "./Shortlist";
import MetricSelect from "./MetricSelect";
import {
  CHASE_LINE,
  CHASE_TABLE,
  METRICS,
  METRIC_LIST,
  SCREEN_LIST,
  applyScreens,
  fmt,
  planSummary,
  screenCounts,
  screenRow,
} from "./screenMetrics";

// Sorting is ranking, and every one of these is "best first". `distEntry` and
// `ageH` invert because for those two the good end is the small end.
const SORTS = [
  { key: "rr", label: "Reward ÷ risk", get: (r) => r.rr },
  { key: "roomTp3", label: "Room left", get: (r) => r.roomTp3 },
  { key: "distEntry", label: "Nearest the entry", get: (r) => (r.distEntry == null ? null : -Math.abs(r.distEntry)) },
  { key: "ageH", label: "Newest first", get: (r) => (r.ageH == null ? null : -r.ageH) },
  { key: "vol24", label: "Deepest book", get: (r) => r.vol24 },
];

const EXPLAIN =
  "Every number here is measured from the price you can actually pay right now, not from the " +
  "entry the call was published at. That is the whole point of the tool: the reward and the risk " +
  "of a trade change the moment the price moves away from the plan.\n\n" +
  "Past the call = the live price against the published entry.\n" +
  "Room to target = from the live price up to the desk's target. Negative means it is behind you.\n" +
  "Reward ÷ risk = room to target divided by the fall to the stop, both from the live price.\n\n" +
  "Measured over 10,003 calls since 10 June 2026: the desk's TP3 sits a median of 5.9% above " +
  "entry while the typical call peaks 22.4% above it. So a coin that has already run keeps " +
  "running about as often as one that has not — but the PUBLISHED TRADE is gone. Enter 10% above " +
  "the call and TP3 is already behind you 86% of the time, while the stop that was 2.7% away is " +
  "now 12.7% away: the same reward against four times the risk.\n\n" +
  "None of this predicts anything. It is arithmetic about where a price sits inside a plan " +
  "somebody already published.";

function Finding({ summary }) {
  const [why, setWhy] = useState(false);
  if (!summary) return null;
  const { total, atPlan, passed, chased } = summary;
  return (
    <div className="rounded-lg border border-ink/[0.08] bg-ink/[0.02] px-3 py-2.5">
      <p className="text-[13px] font-medium leading-snug text-text-primary sm:text-[12.5px]">
        {atPlan} of {total} are still at the plan — target ahead and price within {CHASE_LINE}% of
        the entry.
      </p>
      {/* On a phone the reasoning is one tap away rather than six lines in the
          way: the headline and the table below it are the finding, and the
          list the reader came for starts on the first screen. */}
      <button
        type="button"
        onClick={() => setWhy((v) => !v)}
        aria-expanded={why}
        className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-accent sm:hidden"
      >
        Why {CHASE_LINE}%?
        <svg className={`h-3 w-3 transition-transform ${why ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <p className={`mt-0.5 text-[11px] leading-snug text-text-muted ${why ? "block" : "hidden"} sm:block`}>
        {passed} have already passed the target and {chased} have run more than {CHASE_LINE}% past
        the entry. Measured over 10,003 calls, entering {CHASE_LINE}% above the call leaves TP3
        ahead only 65% of the time and puts the stop 7.7% away instead of 2.7% — the coin may well
        keep running, but the trade the desk published is not the one you would be taking.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {CHASE_TABLE.map((c) => (
          <span key={c.at} className="flex items-baseline gap-1.5">
            <span className="font-mono text-[10px] tabular-nums text-text-muted">+{c.at}%</span>
            <span
              className={`font-mono text-[11.5px] tabular-nums ${
                c.tp3Ahead >= 60 ? "text-profit" : c.tp3Ahead >= 20 ? "text-text-secondary" : "text-loss"
              }`}
            >
              {c.tp3Ahead}%
            </span>
            <span className="text-[10px] text-text-muted">tp3 ahead</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** What the two axes mean together, in one line, so a reader never has to work
 *  out what the corner they are looking at represents. */
const METRICS_HINT = (x, y) => {
  if (x === "distEntry" && y === "roomTp3")
    return "Top left is the corner to look at: still near the entry, still room to the target.";
  return `Right is more ${METRICS[x].label.toLowerCase()}, up is more ${METRICS[y].label.toLowerCase()}.`;
};

export default function SignalScreener({
  isOpen,
  onClose,
  signals = [],
  priceOf,
  volumeOf,
  edgeScoreMap = {},
  topRunnerIds = null,
  onOpenSignal,
  countLabel,
}) {
  // The list leads. A scatter is how you explore a relationship across a
  // cloud; nobody picks a trade out of a cloud. Picking is ranking.
  const [view, setView] = useState("list");
  const [screens, setScreens] = useState([]);
  const [xKey, setXKey] = useState("distEntry");
  const [yKey, setYKey] = useState("roomTp3");
  const [sizeKey, setSizeKey] = useState("vol24");
  const [sortKey, setSortKey] = useState("rr");

  const rows = useMemo(
    () =>
      signals.map((s) =>
        screenRow(s, {
          price: priceOf?.(s.pair),
          volume: volumeOf?.(s.pair),
          edge: edgeScoreMap?.[s.signal_id]?.score,
          isTop: topRunnerIds?.has?.(String(s.signal_id)),
        })
      ),
    [signals, priceOf, volumeOf, edgeScoreMap, topRunnerIds]
  );

  const counts = useMemo(() => screenCounts(rows, screens), [rows, screens]);
  const screened = useMemo(() => applyScreens(rows, screens), [rows, screens]);
  const summary = useMemo(() => planSummary(screened), [screened]);

  const sorted = useMemo(() => {
    const get = SORTS.find((s) => s.key === sortKey)?.get || (() => null);
    return [...screened].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return vb - va;
    });
  }, [screened, sortKey]);

  const toggle = (k) => setScreens((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  const axisOpts = METRIC_LIST.map((m) => ({ key: m.key, label: m.label, title: m.hint }));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="desk"
      eyebrow="Signals desk"
      title="Which of these is still worth taking?"
      subtitle={`${screened.length} of ${rows.length} calls${countLabel ? ` · ${countLabel}` : ""} · every number measured from the live price`}
    >
      <div className="space-y-3">
        <Finding summary={summary} />

        {/* ONE toolbar row, not five.
            This was three segmented rails of eight options stacked over a row
            of screens and a row of sorts — twenty-four buttons before the first
            call, and the plot got whatever was left. A segmented control earns
            its width at two or three choices; past that it is a menu wearing
            the wrong clothes, so the axis pickers are selects and they only
            appear for the view that has axes. */}
        {/* Phone: the view switch and the ⓘ share line one; the screens get
            line two to themselves as a rail that runs off the sheet's edge and
            scrolls, which is how a phone says "there is more this way". Five
            segments forced into a 358px shell overflowed its border instead.
            From sm up it is the one row it always was — `order` rearranges,
            the DOM and the tab order do not move. */}
        <div className="flex flex-wrap items-center gap-2">
          <SegGroup
            size="sm"
            aria-label="How to look at these"
            value={view}
            onChange={setView}
            options={[
              { key: "list", label: "Shortlist", title: "Ranked, with where the price sits inside each published plan" },
              { key: "map", label: "Map", title: "Every call on two axes you choose" },
            ]}
          />

          <div className="relative order-3 -mx-4 w-[calc(100%+2rem)] min-w-0 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-8 after:bg-gradient-to-l after:from-surface-raised after:content-[''] sm:order-none sm:mx-0 sm:w-auto sm:after:hidden">
            <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 pr-10 sm:overflow-visible sm:p-0">
              <div role="group" aria-label="Quick screens" className={`${DESK_SHELL} shrink-0 max-sm:max-w-none`}>
                {SCREEN_LIST.map((sc) => {
                  const on = screens.includes(sc.key);
                  return (
                    <button
                      key={sc.key}
                      type="button"
                      aria-pressed={on}
                      title={sc.hint}
                      onClick={() => toggle(sc.key)}
                      className={`${deskSegClass(on)} max-sm:h-9`}
                    >
                      {sc.label}
                      <span className={deskBadgeClass(on)}>{counts[sc.key]}</span>
                    </button>
                  );
                })}
              </div>

              {screens.length ? (
                <button type="button" className={`${deskGhostClass()} shrink-0`} onClick={() => setScreens([])}>
                  Reset
                </button>
              ) : null}
            </div>
          </div>

          <span className="order-2 ml-auto flex items-center gap-2 sm:order-none">
            {view === "list" ? (
              <span className="hidden sm:inline-flex">
                <MetricSelect
                  label="Rank by"
                  value={sortKey}
                  onChange={setSortKey}
                  options={SORTS}
                  title="Best first, whichever you pick"
                />
              </span>
            ) : null}
            <InfoTip side="bottom" title="Reading this" text={EXPLAIN} />
          </span>
        </div>

        {view === "map" ? (
          // Phone: the two axes side by side as equal columns — three across
          // a 343px line cut every value to "PAST THE …" — and dot size, the
          // lesser choice, on a line of its own under them.
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
            <MetricSelect stack label="Across" value={xKey} onChange={setXKey} options={axisOpts} />
            <MetricSelect stack label="Up" value={yKey} onChange={setYKey} options={axisOpts} />
            <div className="col-span-2 sm:contents">
              <MetricSelect
                label="Dot size"
                value={sizeKey}
                onChange={setSizeKey}
                options={[
                  { key: "vol24", label: "24h volume" },
                  { key: "rr", label: "Reward ÷ risk" },
                  { key: "roomTp3", label: "Room left" },
                ]}
              />
            </div>
            <span className="col-span-2 text-[11px] leading-snug text-text-muted">{METRICS_HINT(xKey, yKey)}</span>
          </div>
        ) : (
          // Phone: the ranking control sits on the list it ranks, the way
          // every sorted list on a phone does.
          <div className="flex items-center justify-between gap-2 sm:hidden">
            <MetricSelect
              label="Rank by"
              value={sortKey}
              onChange={setSortKey}
              options={SORTS}
              title="Best first, whichever you pick"
            />
            <span className="font-mono text-[10px] tabular-nums text-text-muted">
              {screened.length} call{screened.length === 1 ? "" : "s"}
            </span>
          </div>
        )}

        {view === "map" ? (
          <ScreenMap
            rows={screened}
            xKey={xKey}
            yKey={yKey}
            sizeKey={sizeKey}
            onOpen={(sig) => {
              onClose?.();
              onOpenSignal?.(sig);
            }}
          />
        ) : (
          <Shortlist
            rows={sorted}
            sortKey={sortKey}
            onSort={setSortKey}
            onOpen={(sig) => {
              onClose?.();
              onOpenSignal?.(sig);
            }}
          />
        )}

        {!screened.length ? (
          <p className="py-8 text-center text-[12.5px] text-text-muted">
            No call in this set passes every screen you have on. Drop one.
          </p>
        ) : null}

        <p className="border-t border-ink/[0.06] pt-2.5 text-[11px] leading-snug text-text-muted">
          Prices refresh while this is open, so the numbers move. Nothing here is advice or a
          prediction — it is where each live price sits inside a plan the desk already published,
          and roughly {fmt.pct(-CHASE_LINE, 0).replace("−", "")} is the point past which that plan
          stops being the trade on offer.
        </p>
      </div>
    </Modal>
  );
}
