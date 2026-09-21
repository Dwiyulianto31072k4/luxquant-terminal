// useControlsReserve — how much of the plot the floating zoom controls cover,
// in the plot's own units, measured.
//
// The controls are a fixed ~120 CSS px; the plot is drawn in SVG units that
// scale with its width. A fixed fraction of W (0.11) was right on a 1900px
// desk, where 120px is 40 units, and wrong on a phone, where it is 126 — so
// the top-right caption printed under the buttons and read "BU…".

import { useEffect, useRef, useState } from "react";

export default function useControlsReserve(hostRef, W, fallbackW = 0) {
  const controlsRef = useRef(null);
  const [reserve, setReserve] = useState({ w: fallbackW, h: 0 });

  useEffect(() => {
    const svg = hostRef.current;
    const ctl = controlsRef.current;
    if (!svg || !ctl || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const plot = svg.getBoundingClientRect();
      const box = ctl.getBoundingClientRect();
      if (!plot.width) return;
      const k = W / plot.width;
      // From the plot's right edge to the controls' left edge, plus a gap —
      // and from the plot's top to the controls' bottom.
      const w = Math.round((plot.right - box.left + 8) * k);
      const h = Math.round((box.bottom - plot.top + 4) * k);
      setReserve((r) => (r.w === w && r.h === h ? r : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    ro.observe(ctl);
    return () => ro.disconnect();
  }, [hostRef, W]);

  return [controlsRef, reserve];
}
