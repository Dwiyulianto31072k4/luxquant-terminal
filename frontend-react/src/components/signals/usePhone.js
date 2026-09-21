// usePhone — is this a phone-width viewport, live.
//
// The charts here draw in SVG user units, so a desktop geometry squeezed into a
// 358px column shrinks every label and mark to a third of its size. Rendering
// both geometries and hiding one with CSS works for a 40-point panel and not
// for a 700-row screen, so the few places that need a different DRAWING (not a
// different layout) ask this instead.
//
// Tailwind's `sm` is 640px; below it is a phone. Server render and the test
// renderer have no window, and they get the desktop answer.

import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 639.98px)";

function subscribe(cb) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}

function snapshot() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export default function usePhone() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
