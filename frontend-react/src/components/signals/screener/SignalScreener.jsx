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
import PlanLadder from "./PlanLadder";
import {
  CHASE_LINE,
  CHASE_TABLE,
  METRIC_LIST,
  SCREEN_LIST,
  applyScreens,
  fmt,
  planSummary,
  screenCounts,
  screenRow,
} from "./screenMetrics";

const SORTS = [
  { key: "rr", label: "Reward ÷ risk", get: (r) => r.rr },
  { key: "roomTp3", label: "Room left", get: (r) => r.roomTp3 },
  { key: "distEntry", label: "Nearest the entry", get: (r) => (r.distEntry == null ? null : -Math.abs(r.distEntry)) },
  { key: "ageH", label: "Newest", get: (r) => (r.ageH == null ? null : -r.ageH) },
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
  if (!summary) return null;
  const { total, atPlan, passed, chased } = summary;
  return (
    <div className="rounded-lg border border-ink/[0.08] bg-ink/[0.02] px-3 py-2.5">
      <p className="text-[12.5px] font-medium leading-snug text-text-primary">
        {atPlan} of {total} are still at the plan — target ahead and price within {CHASE_LINE}% of
        the entry.
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
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
  const [view, setView] = useState("map");
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

        {/* One-click screens. Each badge is what the screen would LEAVE, given
            whatever else is already on — a chip that promises 30 and hands over
            4 is worse than no chip. */}
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Quick screens" className={DESK_SHELL}>
            {SCREEN_LIST.map((s) => {
              const on = screens.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={on}
                  title={s.hint}
                  onClick={() => toggle(s.key)}
                  className={deskSegClass(on)}
                >
                  {s.label}
                  <span className={deskBadgeClass(on)}>{counts[s.key]}</span>
                </button>
              );
            })}
          </div>
          {screens.length ? (
            <button type="button" className={deskGhostClass()} onClick={() => setScreens([])}>
              Reset
            </button>
          ) : null}
          <SegGroup
            size="sm"
            aria-label="Map or ladder"
            value={view}
            onChange={setView}
            options={[
              { key: "map", label: "Map", title: "Every call on two axes you choose" },
              { key: "ladder", label: "Ladder", title: "Where the price sits inside each published plan" },
            ]}
          />
          <span className="ml-auto flex items-center gap-2">
            <SegGroup
              size="sm"
              aria-label="Order"
              value={sortKey}
              onChange={setSortKey}
              options={SORTS.map((s) => ({ key: s.key, label: s.label }))}
              className="hidden lg:inline-flex"
            />
            <InfoTip side="bottom" title="Reading this" text={EXPLAIN} />
          </span>
        </div>

        {view === "map" ? (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <label className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                  Across
                </span>
                <SegGroup size="sm" aria-label="Horizontal axis" value={xKey} onChange={setXKey} options={axisOpts} />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                  Up
                </span>
                <SegGroup size="sm" aria-label="Vertical axis" value={yKey} onChange={setYKey} options={axisOpts} />
              </label>
              <label className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
                  Size
                </span>
                <SegGroup
                  size="sm"
                  aria-label="Mark size"
                  value={sizeKey}
                  onChange={setSizeKey}
                  options={[
                    { key: "vol24", label: "Volume" },
                    { key: "rr", label: "Reward ÷ risk" },
                    { key: "roomTp3", label: "Room left" },
                  ]}
                />
              </label>
            </div>
            <ScreenMap
              rows={screened}
              xKey={xKey}
              yKey={yKey}
              sizeKey={sizeKey}
              onOpen={(s) => {
                onClose?.();
                onOpenSignal?.(s);
              }}
            />
          </>
        ) : (
          <PlanLadder
            rows={sorted}
            onOpen={(s) => {
              onClose?.();
              onOpenSignal?.(s);
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
