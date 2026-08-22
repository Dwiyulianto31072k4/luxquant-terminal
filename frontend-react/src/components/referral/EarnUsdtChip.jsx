import { useEffect, useRef, useState } from "react";
import { UsdtCoin } from "./UsdtCoin";

// The referral entry point, in the app header and the landing header.
//
// It used to wear the nav items' chrome — transparent border, secondary text —
// so it read as one more link and went unpressed. What makes it noticed is
// mostly that it now looks pressable; the motion below is a small second layer,
// and it is finite on purpose. See the .lq-earn block in styles/index.css for
// the three reasons (WCAG 2.2.2, habituation, banner blindness).

// Three breaths across the first half minute, then quiet for the session.
const CUE_COUNT = 3;
const CUE_FIRST_DELAY_MS = 1400;
const CUE_GAP_MS = 14000;
const CUE_DURATION_MS = 2400;
// Survives route changes, which remount this component; a fresh tab starts over.
const CUE_DONE_KEY = "lq-earn-cue-done";
// Someone who has opened the referral page knows it exists. Stop pitching.
const ENGAGED_KEY = "lq-earn-engaged";

function readFlag(storage, key) {
  try {
    return window[storage].getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(storage, key) {
  try {
    window[storage].setItem(key, "1");
  } catch {
    /* private mode — the cue simply replays, which is harmless */
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Runs the attention cue a few times, then stops for good.
 * Returns "on" while a burst is playing, otherwise "off".
 */
function useAttentionCue(enabled) {
  const [cue, setCue] = useState("off");
  const timers = useRef([]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (readFlag("sessionStorage", CUE_DONE_KEY)) return undefined;
    if (readFlag("localStorage", ENGAGED_KEY)) return undefined;

    const schedule = (fn, ms) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    for (let i = 0; i < CUE_COUNT; i += 1) {
      const start = CUE_FIRST_DELAY_MS + i * CUE_GAP_MS;
      schedule(() => setCue("on"), start);
      schedule(() => setCue("off"), start + CUE_DURATION_MS);
    }
    // Mark done as the last burst ends, so a mid-cycle navigation does not
    // restart the sequence from the top.
    schedule(
      () => writeFlag("sessionStorage", CUE_DONE_KEY),
      CUE_FIRST_DELAY_MS + (CUE_COUNT - 1) * CUE_GAP_MS + CUE_DURATION_MS
    );

    const running = timers.current;
    return () => {
      running.forEach(window.clearTimeout);
      timers.current = [];
    };
  }, [enabled]);

  return cue;
}

// Same chrome as header nav items (rounded-md, underline when active).
export default function EarnUsdtChip({ onClick, active = false, compact = false }) {
  const [reduced] = useState(prefersReducedMotion);
  // Don't pitch the page the user is already standing on.
  const cue = useAttentionCue(!active);

  useEffect(() => {
    if (active) writeFlag("localStorage", ENGAGED_KEY);
  }, [active]);

  const handleClick = (event) => {
    writeFlag("localStorage", ENGAGED_KEY);
    writeFlag("sessionStorage", CUE_DONE_KEY);
    onClick?.(event);
  };

  // Colour lives in .lq-earn rather than in utilities here: the gold has to
  // carry different weight on the white desk than on the two dark ones, and one
  // place to tune beats three sets of arbitrary alphas scattered through JSX.
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Invite friends and earn USDT"
      data-cue={cue}
      data-active={active ? "true" : "false"}
      className="lq-earn inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium"
    >
      {/* Purely decorative; the label above carries the meaning. */}
      {reduced ? null : <span className="lq-earn__sheen" aria-hidden="true" />}

      <span className="relative z-[2] inline-flex items-center gap-1.5">
        <UsdtCoin size={16} />
        {compact ? (
          <span>Earn USDT</span>
        ) : (
          <>
            <span className="hidden sm:inline">Invite</span>
            <span className="hidden sm:inline opacity-40">·</span>
            <span>Earn USDT</span>
          </>
        )}
      </span>

      {active && (
        <span className="absolute inset-x-3 -bottom-[17px] hidden h-[2.5px] rounded-full bg-accent lg:block" />
      )}
    </button>
  );
}
