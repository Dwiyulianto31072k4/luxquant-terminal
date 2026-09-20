// useZoomPan — drag to pan, wheel or pinch to zoom, on a plain SVG plot.
//
// Written rather than pulled from d3-zoom: the transform is three numbers and
// the gesture handling is the part that actually has to be right for this page,
// and d3-zoom would arrive with d3-selection, d3-drag, d3-interpolate and its
// own event system to fight React's.
//
// The model is the standard one: screen = k · data + offset. It is applied to
// POSITIONS, never as an SVG transform on a group, because a group transform
// scales stroke widths, font sizes and logos along with the layout — a chart
// zoomed to 4× would draw 4× type. Marks grow sub-linearly instead (see
// `markScale`), which de-clutters the cloud while still letting small dots
// cross the size threshold where they gain their logo.
//
// Two rules the gestures keep:
//
//  • A plain wheel over a chart that sits INSIDE a scrolling page must scroll
//    the page. Trapping the scroll is the behaviour everyone has been burned by
//    on an embedded map. So inline plots ask for a modifier and say so; the
//    expanded modal, where the page behind is already locked, takes the plain
//    wheel because there is nothing to steal it from.
//  • A drag must not turn into a click. Every mark here opens something, so a
//    pan that ends over a dot would open a coin the user was only sliding past.
//    Movement past a few pixels marks the gesture as a drag and the click is
//    swallowed.
//  • ONE FINGER ON A TOUCH SCREEN SCROLLS THE PAGE. The plot is most of a phone
//    viewport, and a chart that eats a one-finger drag is a chart the reader
//    cannot scroll past — the same trap as the stolen wheel, and worse, because
//    there is no modifier key to escape with. Two fingers pan and pinch, which
//    is the convention every embedded map already taught. `touch-action: pan-y`
//    keeps the browser's own vertical scrolling native rather than re-animating
//    it here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const IDENTITY = { k: 1, x: 0, y: 0 };

/** How much a mark grows with the zoom.
 *
 *  Not linearly — that would keep the cloud exactly as crowded as it started,
 *  which is the one thing zooming is for. The square root spreads the points
 *  faster than it grows them (mark AREA tracks the zoom, mark width does not),
 *  and still carries them over the threshold where a coin gets its own logo
 *  instead of a plain circle: a mid-sized 5px dot crosses the 7px line at 2x,
 *  the smallest 4px ones at 4x. The cap stops a deep zoom filling the plot
 *  with one coin. */
export const markScale = (k) => Math.min(2.6, Math.sqrt(k));

/** How much the TYPE grows with the zoom.
 *
 *  Not at all was wrong, and it read as a bug rather than as a choice: marks
 *  grow by the square root of the zoom, so type held at a fixed size looks
 *  smaller and smaller beside them until a name stops reading as the name OF
 *  the logo next to it. Not linearly either — that would undo the decluttering
 *  the zoom is for. A gentle exponent keeps the proportion without eating the
 *  space the zoom just bought. */
export const labelScale = (k) => Math.min(1.5, Math.pow(k, 0.3));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Keep the plot from being dragged off its own frame: at k the content is k
 *  times the frame, so the offset may range over the overhang and no further.
 *  Without this a flick sends the cloud into the margin and the only way back
 *  is Reset. */
function clampOffset(t, W, H) {
  const overX = W * (t.k - 1);
  const overY = H * (t.k - 1);
  return { k: t.k, x: clamp(t.x, -overX, 0), y: clamp(t.y, -overY, 0) };
}

/** Zoom about a fixed point — the pointer stays on the same datum. Zooming to
 *  the centre instead is the thing that makes a chart feel like it is fighting
 *  you. */
export function zoomAbout(t, factor, px, py, { min = 1, max = 16, W, H } = {}) {
  const k = clamp(t.k * factor, min, max);
  const f = k / t.k;
  return clampOffset({ k, x: px - (px - t.x) * f, y: py - (py - t.y) * f }, W, H);
}

export default function useZoomPan({ W, H, min = 1, max = 16, wheel = "modifier", onSettle }) {
  const [t, setT] = useState(IDENTITY);
  const [panning, setPanning] = useState(false);
  const hostRef = useRef(null);
  const drag = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const moved = useRef(false);
  const settleTimer = useRef(0);

  // Where a client point lands in viewBox units. The SVG scales to its box and
  // preserves its aspect ratio, so one measurement of the element is enough —
  // no getScreenCTM, which is a layout read on every wheel tick.
  const toLocal = useCallback(
    (clientX, clientY) => {
      const el = hostRef.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return { x: 0, y: 0 };
      return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
    },
    [W, H]
  );

  // Labels are re-placed when the gesture STOPS, not during it: the placer walks
  // every point against every label already down, which is not a per-frame job,
  // and text jumping around under a moving cursor reads as a fault anyway.
  const scheduleSettle = useCallback(() => {
    if (!onSettle) return;
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(onSettle, 140);
  }, [onSettle]);

  const apply = useCallback(
    (next) => {
      setT(next);
      scheduleSettle();
    },
    [scheduleSettle]
  );

  const zoomBy = useCallback(
    (factor, at) => {
      const p = at || { x: W / 2, y: H / 2 };
      apply(zoomAbout(t, factor, p.x, p.y, { min, max, W, H }));
    },
    [t, apply, W, H, min, max]
  );

  const reset = useCallback(() => apply(IDENTITY), [apply]);

  // Native listener, because React's onWheel is registered passive and a
  // passive handler cannot preventDefault — so the page would scroll anyway.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const wants = wheel === "direct" || e.ctrlKey || e.metaKey;
      if (!wants) return; // let the page scroll
      e.preventDefault();
      const p = toLocal(e.clientX, e.clientY);
      // deltaMode 1 is lines, 2 is pages; normalise so a trackpad and a mouse
      // wheel do not zoom at wildly different rates.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? H : 1;
      const factor = Math.exp((-e.deltaY * unit) / 420);
      setT((cur) => zoomAbout(cur, factor, p.x, p.y, { min, max, W, H }));
      scheduleSettle();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toLocal, wheel, min, max, W, H, scheduleSettle]);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button != null && e.button !== 0) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved.current = false;
      if (e.pointerType === "touch" && pointers.current.size === 1) {
        // Leave it to the browser: one finger is how the page scrolls.
        return;
      }
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        const mid = toLocal((a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), mid, k0: t.k, t0: t };
        drag.current = null;
        setPanning(false);
        return;
      }
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { x: e.clientX, y: e.clientY, t0: t };
      setPanning(true);
    },
    [t, toLocal]
  );

  const onPointerMove = useCallback(
    (e) => {
      if (pointers.current.has(e.pointerId)) {
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (pinch.current && pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.current.dist > 0) {
          moved.current = true;
          const factor = dist / pinch.current.dist;
          const { mid, t0, k0 } = pinch.current;
          const k = clamp(k0 * factor, min, max);
          const f = k / t0.k;
          apply(
            clampOffset({ k, x: mid.x - (mid.x - t0.x) * f, y: mid.y - (mid.y - t0.y) * f }, W, H)
          );
        }
        return;
      }
      if (!drag.current) return;
      const el = hostRef.current;
      const r = el?.getBoundingClientRect();
      if (!r?.width) return;
      const dx = ((e.clientX - drag.current.x) / r.width) * W;
      const dy = ((e.clientY - drag.current.y) / r.height) * H;
      if (Math.abs(e.clientX - drag.current.x) > 4 || Math.abs(e.clientY - drag.current.y) > 4) {
        moved.current = true;
      }
      const { t0 } = drag.current;
      apply(clampOffset({ k: t0.k, x: t0.x + dx, y: t0.y + dy }, W, H));
    },
    [apply, W, H, min, max]
  );

  const endPointer = useCallback((e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) {
      drag.current = null;
      setPanning(false);
    }
  }, []);

  const onDoubleClick = useCallback(
    (e) => {
      e.preventDefault();
      zoomBy(e.shiftKey ? 1 / 1.9 : 1.9, toLocal(e.clientX, e.clientY));
    },
    [zoomBy, toLocal]
  );

  // Keyboard, so the chart is not mouse-only (WCAG 2.1.1). Arrows pan by a
  // tenth of the frame, +/- zoom about the centre, 0 resets.
  const onKeyDown = useCallback(
    (e) => {
      const step = W / 10;
      const map = {
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
      };
      if (map[e.key]) {
        e.preventDefault();
        const [dx, dy] = map[e.key];
        apply(clampOffset({ k: t.k, x: t.x + dx, y: t.y + dy }, W, H));
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(1.4);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomBy(1 / 1.4);
      } else if (e.key === "0") {
        e.preventDefault();
        reset();
      }
    },
    [t, apply, zoomBy, reset, W, H]
  );

  /** A click that came at the end of a drag is not a click. */
  const swallowClick = useCallback(() => moved.current, []);

  const handlers = useMemo(
    () => ({
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onPointerLeave: endPointer,
      onDoubleClick,
      onKeyDown,
    }),
    [onPointerDown, onPointerMove, endPointer, onDoubleClick, onKeyDown]
  );

  return {
    t,
    hostRef,
    handlers,
    /** pan-y, not none: the browser keeps one-finger vertical scrolling and we
     *  take the two-finger gestures. */
    touchAction: "pan-y",
    panning,
    zoomed: t.k > 1.001,
    zoomBy,
    reset,
    swallowClick,
    /** data position -> screen position, for every mark on the plot */
    project: useCallback((x, y) => ({ x: t.k * x + t.x, y: t.k * y + t.y }), [t]),
    mark: markScale(t.k),
    label: labelScale(t.k),
  };
}
