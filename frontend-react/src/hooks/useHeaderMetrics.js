// src/hooks/useHeaderMetrics.js
// Publishes the app header's real height to CSS as --lq-header-h.
//
// Every overlay in the app has to keep its card clear of the header, and until
// now that clearance was two hard-coded numbers in index.css (57px, 65px at the
// lg breakpoint). Those numbers are right on exactly the devices they were
// measured on. They are wrong when the browser's minimum font size is raised,
// when a banner rides above the bar, when iOS paints a safe-area inset into it,
// and on any future header edit that forgets this file exists — and being wrong
// by even a few pixels shows, because the strip it guards is the one the user
// is looking straight at while a sheet is open.
//
// So measure it instead. The CSS values stay as the pre-hydration fallback.

import { useEffect } from "react";

export default function useHeaderMetrics(ref) {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const root = document.documentElement;
    let frame = 0;
    let last = -1;

    const publish = () => {
      frame = 0;
      const header = ref?.current;
      if (!header) return;
      // `bottom`, not `height`: what an overlay must clear is where the bar
      // ends on screen. The two agree while the header is pinned at the top and
      // disagree whenever something above it is still scrolling past.
      const clearance = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
      const next = `${clearance}px`;
      // Compare against what is actually on the element, not only against the
      // last value we wrote: caching alone means that if the property is ever
      // cleared or overwritten from outside, every later measurement matches
      // the stale cache and the hook silently stops correcting it.
      if (clearance === last && root.style.getPropertyValue("--lq-header-h") === next) return;
      last = clearance;
      root.style.setProperty("--lq-header-h", next);
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(publish);
    };

    publish();

    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    if (ro && ref?.current) ro.observe(ref.current);

    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.addEventListener("scroll", schedule, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("scroll", schedule);
      // Leave no stale override behind for a route that has no chrome.
      root.style.removeProperty("--lq-header-h");
    };
  }, [ref]);
}
