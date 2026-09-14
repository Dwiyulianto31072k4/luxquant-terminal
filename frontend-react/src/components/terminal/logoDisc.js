// Coin logos as round discs on the canvas boards.
//
// ECharts draws `symbol: image://…` as the raw bitmap, so a mark was only ever
// as round as whoever exported the PNG. On one Anomaly screen LSK, CVC and TRX
// came back circles while PUNDIX, LAB, MTL, KMNO, AWE and STABLE came back
// squares — the same board in two different design languages, decided by the
// CDN. The SVG boards never had this problem: BubbleField and the vs-BTC end
// labels each clip with <clipPath><circle>. This is that rule for canvas.
//
// Compositing the circle ourselves into an offscreen canvas is the obvious
// route and is NOT available. Of the three logo CDNs only OKX sends
// Access-Control-Allow-Origin (measured 2026-09-14); LiveCoinWatch — the widest
// source at 88.7% — and CoinCap send none, so drawing them into a canvas taints
// it and `toDataURL()` throws SecurityError. Every local file would convert and
// most CDN logos would silently stay square, which is the bug we started with.
// A zrender clipPath only ever DRAWS, never reads a pixel back, so it is
// CORS-free and works the same for a local file and a no-CORS CDN.
//
// Drawn as its own `custom` series sitting under the scatter rather than
// replacing it: the scatter above still owns label ranking, hideOverlap, the
// tooltip and click-through. None of that needed changing, so none of it moved.
import { getLogoSources } from "../CoinLogo";

const symOf = (pair) => String(pair || "").replace(/USDT$/i, "");

/**
 * A ring of the page's own colour drawn outside the disc. It is what separates
 * a logo from the field of dots behind it — without it a mark sitting in the
 * dense middle reads as one blob with a picture in it. Same trick, same reason,
 * as the ring in BubbleField.
 */
const HALO = 2.5;

/**
 * @param marks  [{ pair, value: [x, y], ring }] — ring is the accent drawn
 *               around the disc (status colour, else the point's own colour).
 * @param size   disc diameter in px, matching the scatter's symbolSize.
 */
export function logoDiscSeries({ marks = [], size = 28, tokens = {}, z = 4 }) {
  const r = size / 2;
  // A logo that 404s leaves this well showing rather than a hole. It is not
  // backed by initials on purpose — see the image element below.
  const well = tokens["surface-hover"] || tokens["surface-raised"] || "transparent";
  const page = tokens["surface-raised"] || "transparent";
  const ink = tokens.fg || "#888";

  return {
    type: "custom",
    // Match the scatter's own default: a mark half past the rail is drawn half,
    // not floating over the axis labels.
    clip: true,
    silent: true,
    z,
    data: marks.map((m) => ({ value: m.value, name: m.pair })),
    renderItem: (params, api) => {
      const m = marks[params.dataIndex];
      if (!m) return null;
      const pt = api.coord([api.value(0), api.value(1)]);
      if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) return null;

      // clampRange pins an outlier to the rail deliberately, so its disc sits
      // exactly ON the boundary and `clip` takes half of it — LSK and LAB
      // shipped as half-moons. Tuck a disc that lands on the edge just inside
      // it: still reads as "pinned at the limit", and it is round. A point
      // genuinely off-screen (panned past) is dropped rather than dragged back.
      const box = params.coordSys;
      let [cx, cy] = pt;
      if (box) {
        const edge = r + HALO;
        if (cx < box.x - edge || cx > box.x + box.width + edge) return null;
        if (cy < box.y - edge || cy > box.y + box.height + edge) return null;
        cx = Math.min(Math.max(cx, box.x + edge), box.x + box.width - edge);
        cy = Math.min(Math.max(cy, box.y + edge), box.y + box.height - edge);
      }
      const ring = m.ring || ink;

      return {
        type: "group",
        children: [
          { type: "circle", shape: { cx, cy, r: r + HALO }, style: { fill: page } },
          { type: "circle", shape: { cx, cy, r }, style: { fill: well } },
          {
            type: "image",
            style: {
              image: getLogoSources(symOf(m.pair))[0],
              x: cx - r,
              y: cy - r,
              width: r * 2,
              height: r * 2,
            },
            // The whole point of the file.
            clipPath: { type: "circle", shape: { cx, cy, r } },
          },
          {
            type: "circle",
            shape: { cx, cy, r },
            style: { fill: "none", stroke: ring, lineWidth: 2 },
          },
        ],
      };
    },
  };
}

export { symOf as logoSym };
