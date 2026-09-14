// Pan and zoom for the canvas boards, in one place so the boards cannot drift.
//
// THE BUG THIS EXISTS TO FIX: both scatters declared ONE `inside` dataZoom
// listing xAxisIndex AND yAxisIndex. A dataZoom carries a single start/end pair,
// so one component driving two axes gives them one shared window — drag
// sideways and the view slides diagonally, because the same percentage is
// applied to y as well. Measured in a harness: from a 30-70 window, one purely
// horizontal drag moved x to -11.28..1.42 AND y to 2.88..10.886. That is why
// panning "never goes where you drag". Two components, one per axis, is the
// whole fix; each then owns its own window.
//
// filterMode is the other half. It defaults to "filter", which runs a predicate
// over every data item on every pan frame and DELETES the ones outside the
// window — 400+ points re-filtered per frame to decide something the renderer
// clips anyway. "none" only moves the axis extent, which is what a pan is.

const SHARED = {
  type: "inside",
  // The wheel belongs to the page; zoom asks for a modifier. "ctrl" also covers
  // a macOS trackpad pinch, which arrives as ctrl+wheel.
  zoomOnMouseWheel: "ctrl",
  moveOnMouseWheel: false,
  moveOnMouseMove: true,
  preventDefaultMouseMove: true,
  filterMode: "none",
};

/** One roam component per axis — see the note above on why this is not one. */
export const roamDataZoom = () => [
  { ...SHARED, xAxisIndex: 0 },
  { ...SHARED, yAxisIndex: 0 },
];

const AXES = [0, 1];

/**
 * Drive the card's +/- /reset buttons.
 *
 * Each axis is zoomed around ITS OWN centre and dispatched as a batch. A single
 * indexless dispatch would reach both components (it does — measured), but it
 * would hand them one identical window and re-couple exactly what splitting the
 * components just separated.
 */
export function makeZoomApi(chart) {
  const winOf = (i) => {
    const z = (chart.getOption()?.dataZoom || [])[i] || {};
    return [z.start ?? 0, z.end ?? 100];
  };
  const zoomBy = (factor) =>
    chart.dispatchAction({
      type: "dataZoom",
      batch: AXES.map((i) => {
        const [a, b] = winOf(i);
        const mid = (a + b) / 2;
        const half = Math.min(50, Math.max(0.5, ((b - a) / 2) * factor));
        return {
          dataZoomIndex: i,
          start: Math.max(0, mid - half),
          end: Math.min(100, mid + half),
        };
      }),
    });

  return {
    zoomIn: () => zoomBy(1 / 1.4),
    zoomOut: () => zoomBy(1.4),
    reset: () =>
      chart.dispatchAction({
        type: "dataZoom",
        batch: AXES.map((i) => ({ dataZoomIndex: i, start: 0, end: 100 })),
      }),
    // Either axis being off its rails counts: after a sideways drag the reset
    // button has something to undo even though y never moved.
    isZoomed: () => AXES.some((i) => winOf(i)[0] > 0.5 || winOf(i)[1] < 99.5),
  };
}
