// ModeGuideModal — short briefing for the ONE mode that was just pressed.
//
// It used to carry a rail of all four modes at the top, which read as "press
// one, get all four" — and worse, that rail applied the mode as well as
// switching the reading, so the list changed underneath the sheet you were
// still reading. One press, one briefing. Runners can show live closed-call
// results; the deep RecipeExplainModal stays one tap behind.

import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import { HuntResults } from "./RecipeExplainModal";

const MUTE_KEY = "lq:signals:mode-guide:mute";

/** How far back the Runner numbers are counted. Kept from the old panel — the
 *  window is part of reading the figure, not a detail to bury. */
const HUNT_WINDOWS = [
  { key: "7", label: "7d" },
  { key: "30", label: "30d" },
  { key: "0", label: "All time" },
];

export function isModeGuideMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setModeGuideMuted(on) {
  try {
    if (on) localStorage.setItem(MUTE_KEY, "1");
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* ignore */
  }
}

const ICONS = {
  all: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="7" height="7" rx="1" />
      <rect x="14" y="4" width="7" height="7" rx="1" />
      <rect x="3" y="13" width="7" height="7" rx="1" />
      <rect x="14" y="13" width="7" height="7" rx="1" />
    </svg>
  ),
  full_tp: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" />
      <path d="M5 10l7-7 7 7" />
    </svg>
  ),
  watchlist: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 3 14.9 9.2 21.6 9.8 16.6 14.4 18.2 21 12 17.5 5.8 21 7.4 14.4 2.4 9.8 9.1 9.2" />
    </svg>
  ),
};

export const MODE_GUIDES = {
  all: {
    key: "all",
    label: "All",
    eyebrow: "Default desk",
    title: "All calls",
    oneLiner: "The full tape for the day you picked. No extra shortlist.",
    does: "Shows every call in the selected day, newest first. Runner tags and Watchlist are off.",
    see: "Today’s list if you left the day tab on Today — or the whole 7-day tape if you chose All days.",
    not: "Not a quality filter. Weak and strong setups sit together. Use Runners when you want a shortlist.",
    changes: "Clears Runners and Watchlist. Keeps the day tab and anything you typed in search.",
    steps: [
      { n: "1", t: "Pick a day", d: "Today is the default. All days is the last week." },
      { n: "2", t: "Open or Hit", d: "Optional. Open = has not hit TP or SL yet. Hit = just moved." },
      { n: "3", t: "Tap a row", d: "Chart, proof, research and history are in the call." },
    ],
  },
  full_tp: {
    key: "full_tp",
    label: "Runners",
    eyebrow: "Narrows the board",
    title: "Runners",
    oneLiner: "The day\u2019s board narrowed to calls that clear two bars at once: a runner tag, and the top fifth of Edge scores.",
    does: "Keeps calls that wore a runner tag at publish AND sit in the top 20% of Edge scores on the board. Runner tags are recalculated from closed calls since 10 Mar 2026, so the list changes on its own as the record grows. Sorts by Edge, then newest.",
    see: "A shorter list — about one call in five on a typical day. They stay here after TP1; Open (hasn’t hit yet) is a chip, not this mode.",
    not: "Not a list of calls that already ran, and not a high chance of TP3. The tag is stamped when the call goes out. Walk-forward on 17,093 closed calls: this combination came in at 90.7% win / 52.2% TP3+ / 9.3% SL against a desk at 86.2% / 44.9% / 13.8% — better, not certain.",
    changes: "Runner tags (any) · top 20% Edge · sort Edge → Called. Status, search and the day tab stay.",
    steps: [
      { n: "1", t: "Two bars, not one", d: "A runner tag alone keeps half the board and adds almost nothing. The Edge cut is what makes it a shortlist." },
      { n: "2", t: "Why the tag stays", d: "The Edge cut on its own buys upside and no protection — win rate and stop rate both land on the board average. Adding the tag is what moves them." },
      { n: "3", t: "Open a row", d: "Edge is a ranking prior. The stop is still the stop." },
    ],
  },
  watchlist: {
    key: "watchlist",
    label: "Watchlist",
    eyebrow: "Your list",
    title: "Watchlist",
    oneLiner: "Calls you starred — any day, including older than the 7-day desk.",
    does: "Switches the source to your stars. Day tabs do not apply until you leave Watchlist.",
    see: "Only what you starred. Star sits on every row. Count on the mode rail is how many you keep.",
    not: "Not a quality score. Star anything you want to revisit. It is not Runners.",
    changes: "Leaves Runners. Ignores the day tab. Search still filters inside the list.",
    steps: [
      { n: "1", t: "Star a call", d: "The star on a row adds it. Works on days you have already left." },
      { n: "2", t: "Come back here", d: "Watchlist is a mode, not a day. The day strip dims on purpose." },
      { n: "3", t: "Leave via a day", d: "Tap Today (or All) to return to the desk tape." },
    ],
  },
};

/** Reading order for the stepper. Matches the rail, left to right. */
const BROWSE_ORDER = ["all", "full_tp", "watchlist"];

export default function ModeGuideModal({
  mode,
  isOpen,
  onClose,
  /** Opened from the Mode label rather than by pressing a mode: let the reader
   *  step through every mode's briefing. Reading only — it never applies a
   *  mode, which is what made the old in-modal rail a trap. */
  browse = false,
  showRecipes = true,
  huntStats = null,
  huntLoading = false,
  huntError = false,
  huntDays = "0",
  onHuntDays,
  onMoreDetail,
  onDeskGuide,
  onTutorials,
}) {
  const [mute, setMute] = useState(() => isModeGuideMuted());
  const [reading, setReading] = useState(null);

  const order = BROWSE_ORDER.filter(
    (k) => showRecipes || k !== "full_tp"
  );
  const opened = MODE_GUIDES[mode] ? mode : "all";
  const key = browse && reading && MODE_GUIDES[reading] ? reading : opened;
  const g = MODE_GUIDES[key];
  const at = order.indexOf(key);

  useEffect(() => {
    if (isOpen) {
      setMute(isModeGuideMuted());
      // Always start on the mode the desk is actually in, then let them walk.
      setReading(null);
    }
  }, [isOpen, opened]);

  const step = (delta) => {
    if (at < 0) return;
    const next = order[(at + delta + order.length) % order.length];
    setReading(next);
  };

  const toggleMute = (next) => {
    setMute(next);
    setModeGuideMuted(next);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      eyebrow={`Desk mode · ${g.eyebrow}`}
      title={g.title}
      subtitle={g.oneLiner}
      icon={
        <span className="flex h-10 w-10 items-center justify-center rounded-md border border-accent/25 bg-accent/12 text-accent">
          {ICONS[key]}
        </span>
      }
      footer={() => (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Muting has to say how to undo itself. Someone who ticks this and
              then wants the briefing back a month later has no reason to guess
              that the word MODE is a button — so the moment they tick it, the
              answer appears in the same place. */}
          <div className="flex flex-col gap-1">
            <label className="flex w-fit cursor-pointer items-center gap-2 text-[12.5px] text-text-muted">
              <input
                type="checkbox"
                checked={mute}
                onChange={(e) => toggleMute(e.target.checked)}
                className="h-3.5 w-3.5 rounded-sm border-ink/30 accent-[rgb(var(--accent))]"
              />
              Don’t explain each time
            </label>
            <p
              className={`flex items-center gap-1.5 text-[11.5px] leading-snug text-text-muted transition-opacity ${
                mute ? "opacity-100" : "opacity-0"
              }`}
              aria-hidden={!mute}
            >
              <svg
                className="h-3 w-3 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
              Reopen it any time from <span className="text-text-primary">Mode</span> above the rail.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {key === "full_tp" && onMoreDetail ? (
              <button
                type="button"
                onClick={onMoreDetail}
                className="inline-flex h-10 items-center rounded-md border border-ink/[0.1] bg-surface-secondary px-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-text-muted transition-colors hover:text-text-primary"
              >
                Full results
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-md bg-accent px-4 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-accent-fg shadow-sm"
            >
              See the list
            </button>
          </div>
        </div>
      )}
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-3">
          {g.steps.map((s) => (
            <div
              key={s.n}
              className="rounded-md border border-ink/[0.08] bg-surface-secondary/80 px-3 py-3"
            >
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                {s.n} · {s.t}
              </p>
              <p className="mt-1.5 text-[12.5px] leading-snug text-text-primary/90">{s.d}</p>
            </div>
          ))}
        </div>

        <dl className="space-y-3 rounded-md border border-ink/[0.08] bg-ink/[0.02] px-3.5 py-3.5">
          {[
            ["What it does", g.does],
            ["What you’ll see", g.see],
            ["What it is not", g.not],
            ["What changes on the desk", g.changes],
          ].map(([dt, dd]) => (
            <div key={dt}>
              <dt className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                {dt}
              </dt>
              <dd className="mt-1 text-[13px] leading-relaxed text-text-primary">{dd}</dd>
            </div>
          ))}
        </dl>

        {/* Reading navigation, deliberately NOT shaped like the mode rail.
            The rail this replaced applied the mode as well as switching the
            reading, so glancing at another mode rearranged the list behind the
            sheet. Names on the buttons rather than bare arrows, and one line
            saying plainly that nothing changes. */}
        {browse && order.length > 1 && at >= 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/[0.06] pt-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                Reading {at + 1} of {order.length}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-text-muted">
                Reading only — your list does not change.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {[-1, 1].map((d) => {
                const target = order[(at + d + order.length) % order.length];
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => step(d)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-ink/[0.1] bg-surface-secondary px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted transition-colors hover:border-ink/20 hover:text-text-primary sm:h-8"
                  >
                    {d < 0 ? <span aria-hidden>←</span> : null}
                    {MODE_GUIDES[target]?.label}
                    {d > 0 ? <span aria-hidden>→</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {onDeskGuide || onTutorials ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink/[0.06] pt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-text-muted">
            <span>More</span>
            {onDeskGuide ? (
              <button type="button" onClick={onDeskGuide} className="text-accent hover:underline">
                Desk guide
              </button>
            ) : null}
            {onTutorials ? (
              <button type="button" onClick={onTutorials} className="text-accent hover:underline">
                Tutorials
              </button>
            ) : null}
          </p>
        ) : null}

        {/* The window belongs to the numbers, so it now lives in the results
            header rather than floating above the card as a second heading. */}
        {key === "full_tp" ? (
          <HuntResults
            stats={huntStats}
            loading={huntLoading}
            error={huntError}
            windowValue={huntDays}
            onWindow={onHuntDays}
            windowOptions={HUNT_WINDOWS}
          />
        ) : null}
      </div>
    </Modal>
  );
}
