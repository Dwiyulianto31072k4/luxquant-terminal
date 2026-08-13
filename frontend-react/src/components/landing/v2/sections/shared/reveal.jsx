// src/components/landing/v2/sections/shared/reveal.jsx
// ════════════════════════════════════════════════════════════════
// Scroll choreography for the landing page.
//
// One rule decides everything here: REVEAL EARLY, RESET LATE. A section is
// shown the moment any part of it approaches the viewport, and is only put
// back to its hidden state once it has left the screen completely. Anything
// stricter means content fades out while someone is still reading it, which
// is the failure that makes scroll animation feel broken rather than alive.
//
// Timing constants are lifted from stripe.com's own `.dom-graphic` system —
// `cubic-bezier(0.25, 1, 0.5, 1)` (ease-out-quart: leaves fast, lands soft).
// ════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";

export const LP_EASE = "cubic-bezier(0.25, 1, 0.5, 1)";

export function prefersStill() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * True while the element is on (or near) screen, false once it has fully left.
 * Re-fires on every pass, so an element animates again each time it is
 * returned to.
 */
export function useInView(ref, { margin = "0px 0px -10% 0px" } = {}) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (prefersStill() || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }

    // Seed synchronously from geometry. IntersectionObserver delivers its
    // first record on a later frame, and without this an element that is
    // already on screen flashes hidden for that frame.
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || 0;
    setInView(r.top < vh * 0.92 && r.bottom > 0);

    const io = new IntersectionObserver(
      ([e]) => setInView(e.isIntersecting || e.intersectionRatio > 0),
      { rootMargin: margin, threshold: [0, 0.05] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);

  return inView;
}

/**
 * Counts a formatted figure up from zero, keeping its formatting.
 *
 * It takes the FINISHED string ("+3.58M%", "85.6%", "1,204") rather than a raw
 * number, so callers do not have to unpick their own formatters: the numeric
 * middle is animated and the prefix, suffix, decimals and thousands separators
 * are put back exactly as they were. A value with no number in it (an em dash
 * while data loads) is passed straight through.
 */
export function CountUp({ text, duration = 1750, easing = "quart", className = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  const [shown, setShown] = useState(null);

  const raw = String(text ?? "");
  const m = raw.match(/^(\D*?)(-?[\d,]*\.?\d+)(.*)$/s);

  useEffect(() => {
    if (!m) return undefined;
    if (!inView || prefersStill()) {
      setShown(null);
      return undefined;
    }
    const target = Number(m[2].replace(/,/g, ""));
    if (!Number.isFinite(target)) return undefined;

    const decimals = (m[2].split(".")[1] || "").length;
    const grouped = m[2].includes(",");
    const fmt = (v) =>
      grouped
        ? v.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })
        : v.toFixed(decimals);

    let frame = 0;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      // Headline figures can opt into smooth-step so their whole count is
      // legible instead of jumping through most of the range on frame one.
      const eased = easing === "smooth" ? p * p * (3 - 2 * p) : 1 - Math.pow(1 - p, 4);
      setShown(fmt(target * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, m && m[2], duration, easing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span ref={ref} className={className}>
      {m && shown !== null ? `${m[1]}${shown}${m[3]}` : raw}
    </span>
  );
}
