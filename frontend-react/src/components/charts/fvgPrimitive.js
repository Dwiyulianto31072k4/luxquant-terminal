// src/components/charts/fvgPrimitive.js
//
// Draws FVG zones on the chart's OWN canvas as a lightweight-charts series
// primitive, rather than as an SVG layer above it.
//
// The first version used the SVG overlay the drawing tools use. Two things went
// wrong that no amount of patching the overlay would fix:
//
//   · The overlay is `overflow-visible` so pen strokes can carry labels past
//     the plot. A zone whose price sits outside the visible range therefore
//     spilled over the toolbar and out of the modal.
//   · It re-projected only when the time scale emitted a range change, so
//     dragging the price axis — or any repaint the chart did for its own
//     reasons — left the bands behind at stale pixels.
//
// A primitive is clipped to the pane by construction and is asked to paint on
// exactly the frames the chart paints, so both problems disappear rather than
// being chased.

const LABEL_FONT = "10px 'JetBrains Mono', ui-monospace, monospace";

/** Round-rect that degrades gracefully on engines without roundRect. */
function panel(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.rect(x, y, w, h);
}

class FvgPaneRenderer {
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const src = this._source;
    const series = src._series;
    const chart = src._chart;
    if (!series || !chart) return;

    const rows = src._rows();
    if (!rows.length) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const rightEdge = mediaSize.width;
      ctx.save();
      ctx.font = LABEL_FONT;
      ctx.textBaseline = "middle";

      for (const { zone, flipped } of rows) {
        const yTop = series.priceToCoordinate(zone.top);
        const yBottom = series.priceToCoordinate(zone.bottom);
        if (yTop == null || yBottom == null) continue;

        const top = Math.min(yTop, yBottom);
        const height = Math.abs(yBottom - yTop);
        // Sub-pixel bands read as a stray line rather than a zone; give them a
        // floor so a tight gap is still legible.
        const h = Math.max(height, 2);

        // A zone that formed before the visible range still applies, so clamp
        // it to the left edge instead of dropping it.
        const rawX = chart.timeScale().timeToCoordinate(zone.time);
        const x = rawX == null ? 0 : Math.max(rawX, 0);
        const w = rightEdge - x;
        if (w <= 0) continue;

        // Colour by what the zone does NOW: a bullish gap that price closed
        // through has stopped being support and started acting as resistance.
        const acts = flipped ? (zone.dir === "bull" ? "bear" : "bull") : zone.dir;
        const base = acts === "bull" ? src._colors.bull : src._colors.bear;

        ctx.fillStyle = withAlpha(base, flipped ? 0.07 : 0.13);
        ctx.fillRect(x, top, w, h);

        // Edges carry the zone's boundaries, which is what a trader actually
        // reacts to — the fill alone leaves them guessing where it ends.
        ctx.strokeStyle = withAlpha(base, flipped ? 0.5 : 0.75);
        ctx.lineWidth = 1;
        ctx.setLineDash(flipped ? [4, 3] : []);
        ctx.beginPath();
        ctx.moveTo(x, top + 0.5);
        ctx.lineTo(rightEdge, top + 0.5);
        ctx.moveTo(x, top + h - 0.5);
        ctx.lineTo(rightEdge, top + h - 0.5);
        ctx.stroke();

        // Midpoint — ICT's consequent encroachment, the level most people enter
        // against. Only drawn when the band is tall enough to tell apart.
        if (h >= 10) {
          ctx.setLineDash([2, 4]);
          ctx.strokeStyle = withAlpha(base, 0.45);
          ctx.beginPath();
          ctx.moveTo(x, top + h / 2);
          ctx.lineTo(rightEdge, top + h / 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        if (h >= 12 && src._showLabels) {
          const text = flipped ? "IFVG" : "FVG";
          const tw = ctx.measureText(text).width;
          const padX = 4;
          const boxW = tw + padX * 2;
          const boxH = 13;
          const boxX = Math.max(x + 4, 4);
          const boxY = top + h / 2 - boxH / 2;
          if (boxX + boxW < rightEdge) {
            ctx.fillStyle = withAlpha(base, 0.9);
            panel(ctx, boxX, boxY, boxW, boxH, 2);
            ctx.fill();
            ctx.fillStyle = src._colors.labelText;
            ctx.fillText(text, boxX + padX, boxY + boxH / 2 + 0.5);
          }
        }
      }
      ctx.restore();
    });
  }
}

/** Accepts "rgb(r, g, b)" or "#rrggbb" and returns it at the given alpha. */
function withAlpha(colour, alpha) {
  if (!colour) return `rgba(128,128,128,${alpha})`;
  const m = String(colour).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
  const hex = String(colour).match(/^#?([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  return colour;
}

class FvgPaneView {
  constructor(source) {
    this._renderer = new FvgPaneRenderer(source);
  }
  renderer() {
    return this._renderer;
  }
  // Behind the candles: the zones are context, not the subject.
  zOrder() {
    return "bottom";
  }
}

export class FvgPrimitive {
  constructor() {
    this._zones = { open: [], inverted: [] };
    this._colors = { bull: "rgb(14,203,129)", bear: "rgb(246,70,93)", labelText: "#fff" };
    this._showLabels = true;
    this._paneViews = [new FvgPaneView(this)];
  }

  attached({ chart, series, requestUpdate }) {
    this._chart = chart;
    this._series = series;
    this._requestUpdate = requestUpdate;
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  /** Flattened draw order: live gaps first, flipped zones over them. */
  _rows() {
    const out = [];
    for (const zone of this._zones.open || []) out.push({ zone, flipped: false });
    for (const zone of this._zones.inverted || []) out.push({ zone, flipped: true });
    return out;
  }

  setZones(zones) {
    this._zones = zones || { open: [], inverted: [] };
    this._requestUpdate?.();
  }

  setColors(colors) {
    this._colors = { ...this._colors, ...colors };
    this._requestUpdate?.();
  }

  setShowLabels(on) {
    this._showLabels = !!on;
    this._requestUpdate?.();
  }

  updateAllViews() {}

  paneViews() {
    return this._paneViews;
  }
}
