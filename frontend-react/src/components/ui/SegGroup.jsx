// src/components/ui/SegGroup.jsx
//
// Desk segmented control — Binance/exchange Pro·Lite pattern.
// Solid accent + accent-fg for the active segment (works dark + bright).
// Use for mode switches, filter rails, and calendar/news type tabs.

/**
 * @typedef {Object} SegOption
 * @property {string} key
 * @property {import('react').ReactNode} label
 * @property {import('react').ReactNode} [icon]
 * @property {import('react').ReactNode} [badge]
 * @property {string} [badgeClass]
 * @property {string} [title]
 * @property {boolean} [disabled]
 */

/**
 * @param {{
 *   options: SegOption[],
 *   value: string,
 *   onChange: (key: string) => void,
 *   size?: 'sm' | 'md',
 *   className?: string,
 *   'aria-label'?: string,
 *   wrap?: boolean,
 * }} props
 */
/** Outer track — same shell for mode, days, Open/Hit, sort, More. */
export const DESK_SHELL =
  "inline-flex max-w-full items-center gap-0.5 rounded-md border border-ink/[0.1] bg-surface-secondary p-0.5";

// One shape language, three roles. Everything below is rounded, mono, uppercase
// and uses the same gold for "on" — but the roles must stay distinguishable:
//
//   deskSegClass  — a segment INSIDE a shell. Picking one of a few exclusive
//                   states. Gold fill = the state you are in.
//   deskChipClass — a standalone, scrollable option. Same look, no shell,
//                   because a rail that scrolls is not a segmented control.
//   deskGhostClass — an ACTION (Reset, Tutorials, help). Never gold: gold is
//                   reserved for state, and an action is not a state you sit in.
//
// Making all three literally identical is what made the desk unreadable — every
// control looked equally important and none looked scrollable.

/** ONE height for every desk control, so a row of them lines up without any
 *  call site guessing: 44px on a phone — Apple's tap-target minimum and WCAG
 *  2.5.5 — and 32px from sm up, the dense toolbar height an exchange desk uses
 *  where there is a pointer (and still four times WCAG 2.5.8's 24px floor).
 *  A control that needs a different height overrides it here, not inline. */
export const DESK_H = "h-11 sm:h-8";

/** Keyboard focus has to be visible on every one of these (WCAG 2.4.7), and it
 *  has to be the SAME ring everywhere or the desk looks like three widgets.
 *  The offset is NEGATIVE on purpose: both the mode shell and the day rail are
 *  overflow-x-auto scroll containers, which clip anything drawn outside a
 *  child, so an outset ring would lose its left edge on the first control. */
const DESK_FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent";

/** Segment sizes. `touch` is phone-first: a 40px control inside a 44px rail,
 *  which is Apple's minimum tap target, collapsing to the dense desk size from
 *  sm up where there is a pointer and no 44pt floor. */
// Tracking lives here rather than in the shared base: the touch size has to
// buy back the width that a 40px-tall segment costs, and four equal segments on
// a 360px phone only fit "STRONGEST" if the letter-spacing gives a little.
const SEG_SIZE = {
  sm: "px-2.5 py-1 text-[10px] tracking-[0.1em]",
  md: "px-3.5 py-1.5 text-[11px] tracking-[0.1em]",
  touch: "h-10 px-1.5 text-[10px] tracking-[0.04em] sm:h-7 sm:px-2.5 sm:tracking-[0.1em]",
};

/** Inner segment — gold fill when active. size sm matches the Signals desk.
 *  `fill` splits the track evenly; `fill: "mobile"` does that only on a phone,
 *  where a control the thumb has to find should own the full width, and lets
 *  the rail shrink back to its content on a desk, where a stretched four-up
 *  bar of ten-pixel labels just looks unfinished. */
export function deskSegClass(active, { fill = false, size = "sm" } = {}) {
  const pad = SEG_SIZE[size] || SEG_SIZE.sm;
  const grow =
    fill === "mobile"
      ? "min-w-0 flex-1 basis-0 justify-center sm:flex-none sm:basis-auto sm:shrink-0"
      : fill
        ? "min-w-0 flex-1 basis-0 justify-center"
        : "shrink-0";
  return `inline-flex ${grow} ${DESK_FOCUS} items-center gap-1.5 whitespace-nowrap rounded-sm font-mono font-semibold uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${pad} ${
    active ? "bg-accent text-accent-fg shadow-sm" : "text-text-muted hover:text-text-primary"
  }`;
}

/** Standalone option in a scrolling rail (the day strip). Carries its own
 *  border because it has no shell to sit in, breathes wider than a segment
 *  because nothing else separates it from its neighbour, and snaps so a
 *  half-cut label is never where the strip comes to rest. */
export function deskChipClass(active) {
  return `snap-start inline-flex ${DESK_H} ${DESK_FOCUS} shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] transition-colors sm:px-2.5 ${
    active
      ? "border-accent bg-accent text-accent-fg shadow-sm"
      : "border-ink/[0.1] bg-surface-secondary text-text-muted hover:text-text-primary"
  }`;
}

/** Count that rides inside a segment or chip. */
export function deskBadgeClass(active) {
  return `rounded-sm px-1.5 py-0.5 font-mono text-[9px] tabular-nums ${
    active ? "bg-black/15 text-accent-fg" : "bg-ink/[0.06] text-text-muted"
  }`;
}

/** An action, not a state. Quiet until hovered, and never gold.
 *  `bordered` gives it a resting edge — needed when it stands on its own
 *  rather than in a toolbar, or it reads as stray text rather than a control.
 *  (Do not try to add the edge by appending a border-* class at the call site:
 *  both it and the transparent default are border-color utilities, so which
 *  one wins is decided by stylesheet order, not by the class list.) */
export function deskGhostClass({ square = false, bordered = false } = {}) {
  const box = square ? `${DESK_H} w-11 justify-center sm:w-8` : `${DESK_H} px-2 sm:px-2.5`;
  const edge = bordered ? "border-ink/[0.08]" : "border-transparent";
  return `inline-flex ${DESK_FOCUS} shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border ${edge} font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted transition-colors hover:border-ink/[0.1] hover:bg-surface-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 ${box}`;
}

export function SegGroup({
  options = [],
  value,
  onChange,
  size = "md",
  className = "",
  "aria-label": ariaLabel = "Options",
  wrap = false,
  /** Stretch to the container and split the width evenly between options.
   *  Pass "mobile" to do that only below the sm breakpoint. */
  fill = false,
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`${
        fill === "mobile"
          ? "flex w-full sm:inline-flex sm:w-auto"
          : fill
            ? "flex w-full"
            : "inline-flex"
      } ${DESK_SHELL} ${
        wrap && !fill ? "flex-wrap" : fill ? "" : "overflow-x-auto no-scrollbar"
      } ${className}`}
    >
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            title={opt.title}
            disabled={opt.disabled}
            onClick={() => {
              if (!opt.disabled && onChange) onChange(opt.key);
            }}
            className={deskSegClass(active, { fill, size })}
          >
            {opt.icon ? (
              <span
                className={`inline-flex shrink-0 ${active ? "text-accent-fg" : "text-text-muted"}`}
                aria-hidden
              >
                {opt.icon}
              </span>
            ) : null}
            {opt.label}
            {opt.badge != null && opt.badge !== false ? (
              <span className={`${deskBadgeClass(active)} ${opt.badgeClass || ""}`}>
                {opt.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export default SegGroup;
