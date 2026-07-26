// src/components/landing/v2/sections/shared/LockedPct.jsx
//
// A per-target average that the marketing pages show as locked.
//
// Why these specific cells: the ladder chart hides how the targets compare, but
// the avg P/L column gave the same shape away without needing any conversion.
// TP1 +1.7%, TP2 +3.4%, TP3 +8.1% is a 1 : 2 : 4.8 ladder, and the real R ladder
// is 1 : 2 : 5. The ratios alone are the reveal — no stop distance required.
//
// TP4 and SL stay readable on purpose. TP4's figure is the average PEAK rather
// than its target level, so it does not sit on the same ladder, and SL on its own
// is a denominator with nothing left to divide.
//
// Placeholder text is rendered rather than the real value blurred, so the numbers
// are not sitting in the DOM. They do still arrive in the journey-insights
// response, which is public — this gates reading the page, not calling the API.
// Closing that needs optional auth on the endpoint and would change what
// logged-in in-app views receive, so it is a deliberate separate decision.

const LOCKED_TARGETS = new Set(["TP1", "TP2", "TP3"]);

export const isLockedTarget = (label) => LOCKED_TARGETS.has(label);

export default function LockedPct({ className = "" }) {
  return (
    <span
      aria-label="Average P/L — sign in to view"
      className={`select-none tabular-nums ${className}`}
      style={{ filter: "blur(4px)", color: "rgb(var(--fg) / 0.45)" }}
    >
      <span aria-hidden="true">+0.0%</span>
    </span>
  );
}
