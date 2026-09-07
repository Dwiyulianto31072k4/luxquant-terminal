// ModeGuideModal — short briefing for the ONE mode that was just pressed.
//
// It used to carry a rail of all four modes at the top, which read as "press
// one, get all four" — and worse, that rail applied the mode as well as
// switching the reading, so the list changed underneath the sheet you were
// still reading. One press, one briefing. Runners can show live closed-call
// results; the deep RecipeExplainModal stays one tap behind.

import { useEffect, useState } from "react";
import Modal from "./ui/Modal";
import { SegGroup } from "./ui/SegGroup";
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
  strongest: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 3 15.1 9.3 22 10.2 17 15 18.2 22 12 18.7 5.8 22 7 15 2 10.2 8.9 9.3" />
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
    does: "Shows every call in the selected day, newest first. Runner tags, Worth and Watchlist are off.",
    see: "Today’s list if you left the day tab on Today — or the whole 7-day tape if you chose All days.",
    not: "Not a quality filter. Weak and strong setups sit together. Use Runners or Top rated when you want a slice.",
    changes: "Clears Runners / Top rated / Watchlist. Keeps the day tab and anything you typed in search.",
    steps: [
      { n: "1", t: "Pick a day", d: "Today is the default. All days is the last week." },
      { n: "2", t: "Open or Hit", d: "Optional. Open = still running. Hit = just moved." },
      { n: "3", t: "Tap a row", d: "Chart, proof, research and history are in the call." },
    ],
  },
  full_tp: {
    key: "full_tp",
    label: "Runners",
    eyebrow: "Optional shortlist",
    title: "Runners",
    oneLiner: "Calls whose entry tags historically ran past TP3 more often than the rest.",
    does: "Keeps Worth calls that wore runner tags at publish — tags that reached TP3/TP4 more often on closed history. The tag list is recalculated from closed calls since 10 Mar 2026, so it changes on its own as the record grows. Sorts by Edge, then newest.",
    see: "A shorter list, and the Runner badge on the rows that earned it. The day tab still slices: Runners + Today is the usual view.",
    not: "Not a list of calls that already ran. The tag is stamped when the call goes out and describes the setup’s history, not this call’s fate — and a qualifying tag reaches TP3+ more often than others, not most of the time.",
    changes: "Worth · runner tags (any) · sort Edge → Called. Search and the day tab stay.",
    steps: [
      { n: "1", t: "Read the mix", d: "Closed Runner calls vs all closed. Open rows are not in those bars." },
      { n: "2", t: "Keep the day", d: "Today still means today. Runners does not wipe the tab." },
      { n: "3", t: "Open a row", d: "Edge is a ranking prior. The stop is still the stop." },
    ],
  },
  strongest: {
    key: "strongest",
    label: "Top rated",
    eyebrow: "Optional shortlist",
    title: "Top rated",
    oneLiner: "Calls still running, ranked by the pair’s own track record — not by runner tags.",
    does: "Keeps calls that are still running on pairs marked Worth. Sorts by verdict, then Edge, then newest.",
    see: "A quiet open book: coins whose past LuxQuant calls usually reached at least TP1.",
    not: "Not Runners. A quiet pair with a strong record can sit above a loud runner. Worth is the pair’s history, not this call’s tag.",
    changes: "Open · Worth · sort Verdict → Edge → Called. No runner-tag filter.",
    steps: [
      { n: "1", t: "Still running", d: "Closed calls drop out. This is the live book." },
      { n: "2", t: "Worth first", d: "Avoid pairs are hidden. The score is as-of-entry on closed history." },
      { n: "3", t: "Then Edge", d: "Among Worth, higher Edge ranks first. Still not a buy." },
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
    not: "Not a quality score. Star anything you want to revisit. It is not Runners and not Top rated.",
    changes: "Leaves Runners / Top rated. Ignores the day tab. Search still filters inside the list.",
    steps: [
      { n: "1", t: "Star a call", d: "The star on a row adds it. Works on days you have already left." },
      { n: "2", t: "Come back here", d: "Watchlist is a mode, not a day. The day strip dims on purpose." },
      { n: "3", t: "Leave via a day", d: "Tap Today (or All) to return to the desk tape." },
    ],
  },
};

export default function ModeGuideModal({
  mode,
  isOpen,
  onClose,
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
  const key = MODE_GUIDES[mode] ? mode : "all";
  const g = MODE_GUIDES[key];

  useEffect(() => {
    if (isOpen) setMute(isModeGuideMuted());
  }, [isOpen]);

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
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-text-muted">
            <input
              type="checkbox"
              checked={mute}
              onChange={(e) => toggleMute(e.target.checked)}
              className="h-3.5 w-3.5 rounded-sm border-ink/30 accent-[rgb(var(--accent))]"
            />
            Don’t explain each time
          </label>
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

        {key === "full_tp" ? (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                Closed calls only
              </p>
              {onHuntDays ? (
                <SegGroup
                  size="sm"
                  aria-label="Runner results window"
                  value={huntDays}
                  onChange={onHuntDays}
                  options={HUNT_WINDOWS}
                />
              ) : null}
            </div>
            <HuntResults stats={huntStats} loading={huntLoading} error={huntError} />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
