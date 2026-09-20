// CoinDisc — a coin's own mark as the point on the plot.
//
// A field of identical circles makes you read a label to know what you are
// looking at, and only about thirty of two hundred dots can carry one. A logo
// is recognised without reading, so the dots big enough to hold one get one,
// and the ring around it keeps carrying the state the colour encodes.
//
// SVG <image> has no cascade: getLogoSources exists precisely for this, and
// CoinLogo's own comment says so — a chart must pick one source outright rather
// than rebuild the rule.
//
// The image is PROBED with an HTMLImageElement before it is drawn, rather than
// rendered with an error handler. An <image> that 404s inside an SVG leaves a
// broken-image glyph in some engines and gives React nothing reliable to catch,
// and probing also lets the answer be cached per symbol for the life of the
// page — a scatter re-renders on every hover, and 223 dots must not re-ask.
//
// Only marks above the size threshold probe at all. At 223 points a logo per
// dot would be 223 requests for pictures three pixels wide.

import { useEffect, useState } from "react";
import { getLogoSources } from "../CoinLogo";

const probed = new Map(); // symbol -> url | null

function useLogo(symbol, enabled) {
  const key = String(symbol || "").toUpperCase();
  const [url, setUrl] = useState(() => (enabled ? probed.get(key) ?? undefined : undefined));

  useEffect(() => {
    if (!enabled || !key) return undefined;
    if (probed.has(key)) {
      setUrl(probed.get(key));
      return undefined;
    }
    const src = getLogoSources(key)[0];
    if (!src) {
      probed.set(key, null);
      setUrl(null);
      return undefined;
    }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      probed.set(key, src);
      if (alive) setUrl(src);
    };
    img.onerror = () => {
      probed.set(key, null);
      if (alive) setUrl(null);
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [key, enabled]);

  return url || null;
}

export default function CoinDisc({ symbol, cx, cy, r, ring, fill, ringWidth = 1.4, minLogo = 7 }) {
  const big = r >= minLogo;
  const url = useLogo(symbol, big);
  const clip = `disc-${String(symbol).replace(/[^a-zA-Z0-9]/g, "")}-${Math.round(cx)}-${Math.round(cy)}`;

  if (!url) {
    return <circle cx={cx} cy={cy} r={r} fill={fill} stroke={ring} strokeWidth={ringWidth} />;
  }
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <circle cx={cx} cy={cy} r={r - ringWidth / 2} />
        </clipPath>
      </defs>
      {/* The tinted disc stays underneath: a logo with transparency would
          otherwise sit on the page background and lose its direction colour. */}
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      <image
        href={url}
        x={cx - r}
        y={cy - r}
        width={r * 2}
        height={r * 2}
        clipPath={`url(#${clip})`}
        preserveAspectRatio="xMidYMid slice"
      />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={ring} strokeWidth={ringWidth} />
    </g>
  );
}
