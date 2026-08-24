// src/components/charts/entryPrimitive.js
//
// The permanent "this is where the call was made" marker: a vertical line at
// the entry bar, a dot where the entry price crosses it, a flag in the pane and
// a matching stamp on the time axis.
//
// Why it exists
// -------------
// The chart had no entry-time marker at all. What looked like one was the
// crosshair: it was styled in the same accent gold as the ENTRY price line, so
// wherever the pointer happened to rest, its gold time label read as the moment
// the signal fired. Two people reported it as a clock bug — the chart was
// answering a question nobody asked, in the colour reserved for the answer they
// wanted.
//
// So gold now means entry and nothing else (the crosshair is neutral), and the
// stamp is drawn from `created_at` — the same field the side panel prints, so
// the two cannot disagree.
//
// Drawn as a series primitive rather than an SVG overlay for the reasons set
// out in fvgPrimitive.js: clipped to the pane by construction, and repainted on
// exactly the frames the chart paints.

const LABEL_FONT = "10px 'JetBrains Mono', ui-monospace, monospace";
const FLAG_TEXT = "ENTRY";

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

class EntryPaneRenderer {
  constructor(source) {
    this._source = source;
  }

  draw(target) {
    const src = this._source;
    const series = src._series;
    const chart = src._chart;
    if (!series || !chart || src._time == null) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const raw = chart.timeScale().timeToCoordinate(src._time);
      // An entry older than the loaded window still happened. Pin it to the
      // edge and let the flag say which way it is, rather than dropping the
      // only marker that tells the user when they were asked to act.
      const offLeft = raw == null || raw < 0;
      const offRight = raw != null && raw > mediaSize.width;
      const x = Math.round(Math.min(Math.max(raw ?? 0, 0.5), mediaSize.width - 0.5)) + 0.5;

      ctx.save();
      ctx.font = LABEL_FONT;
      ctx.textBaseline = "middle";

      // ── the line ────────────────────────────────────────────────────────
      ctx.strokeStyle = withAlpha(src._color, offLeft || offRight ? 0.45 : 0.85);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, mediaSize.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // ── the arrow at the entry point ────────────────────────────────────
      // Below the price pointing up for a long, above it pointing down for a
      // short — the marker traders already read on every other platform.
      // A dot was tried first and was the wrong shape for the job: it sits
      // exactly on the ENTRY price line, which is the same gold, so it read as
      // a thicker piece of the line rather than a mark of its own.
      const y = src._price == null ? null : series.priceToCoordinate(src._price);
      const up = src._dir !== "short";
      const sign = up ? 1 : -1;
      // Measured from the price outwards, so the arrow never covers the candle
      // it is pointing at.
      const tipY = y == null ? null : y + sign * 7;
      const headY = tipY == null ? null : tipY + sign * 8;
      const tailY = headY == null ? null : headY + sign * 7;

      if (y != null && !offLeft && !offRight) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, tipY);
        ctx.lineTo(x - 5.5, headY);
        ctx.lineTo(x - 1.75, headY);
        ctx.lineTo(x - 1.75, tailY);
        ctx.lineTo(x + 1.75, tailY);
        ctx.lineTo(x + 1.75, headY);
        ctx.lineTo(x + 5.5, headY);
        ctx.closePath();

        // Outline in the on-accent ink so the arrow keeps its shape against a
        // candle of any colour, including gold-on-gold over the entry line.
        ctx.fillStyle = src._color;
        ctx.strokeStyle = withAlpha(src._labelText, 0.9);
        ctx.lineWidth = 1.25;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      // ── the flag ────────────────────────────────────────────────────────
      // It used to sit at the top of the pane, which put the word ENTRY a
      // whole chart's height away from the point it names — on a tall pane the
      // two read as unrelated. It travels with the arrow instead: just past
      // the tail, so the label, the arrow and the price are one object.
      const text = offLeft ? `◀ ${FLAG_TEXT}` : offRight ? `${FLAG_TEXT} ▶` : FLAG_TEXT;
      const padX = 5;
      const boxW = ctx.measureText(text).width + padX * 2;
      const boxH = 15;

      // Centred on the line under the arrow; falls back to mid-pane only when
      // there is no price to anchor to.
      const anchorY = tailY == null ? mediaSize.height / 2 : tailY + sign * 4;
      const boxY = Math.min(
        Math.max(anchorY - (up ? 0 : boxH), 2),
        mediaSize.height - boxH - 2
      );
      const boxX = Math.min(Math.max(x - boxW / 2, 2), mediaSize.width - boxW - 2);

      ctx.fillStyle = src._color;
      panel(ctx, boxX, boxY, boxW, boxH, 2);
      ctx.fill();
      ctx.fillStyle = src._labelText;
      ctx.fillText(text, boxX + padX, boxY + boxH / 2 + 0.5);

      ctx.restore();
    });
  }
}

class EntryPaneView {
  constructor(source) {
    this._renderer = new EntryPaneRenderer(source);
  }
  renderer() {
    return this._renderer;
  }
  // Above the candles: this is the subject, not context.
  zOrder() {
    return "top";
  }
}

/**
 * The stamp on the time axis. This is the piece the bug report was really
 * asking for — a label that stays put and says when the call was made, instead
 * of a crosshair label that says where the pointer is.
 */
class EntryTimeAxisView {
  constructor(source) {
    this._source = source;
  }
  coordinate() {
    const chart = this._source._chart;
    if (!chart || this._source._time == null) return -1000;
    return chart.timeScale().timeToCoordinate(this._source._time) ?? -1000;
  }
  text() {
    return this._source._stamp || "";
  }
  textColor() {
    return this._source._labelText;
  }
  backColor() {
    return this._source._color;
  }
  visible() {
    return this._source._time != null && !!this._source._stamp;
  }
}

export class EntryPrimitive {
  constructor() {
    this._time = null;
    this._price = null;
    this._stamp = "";
    this._dir = "long";
    this._color = "rgb(240,185,11)";
    this._labelText = "#101010";
    this._paneViews = [new EntryPaneView(this)];
    this._timeAxisViews = [new EntryTimeAxisView(this)];
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

  /**
   * @param {{time: number|null, price: number|null, stamp: string, dir: "long"|"short"}} entry
   *   `time` is the candle bucket the entry falls in, not the raw timestamp:
   *   the chart can only place a coordinate on a bar it actually has, and the
   *   bar containing the entry is the honest answer at any timeframe.
   */
  setEntry(entry) {
    this._time = entry?.time ?? null;
    this._price = entry?.price ?? null;
    this._stamp = entry?.stamp || "";
    this._dir = entry?.dir === "short" ? "short" : "long";
    this._requestUpdate?.();
  }

  setColors({ color, labelText }) {
    if (color) this._color = color;
    if (labelText) this._labelText = labelText;
    this._requestUpdate?.();
  }

  updateAllViews() {}

  paneViews() {
    return this._paneViews;
  }

  timeAxisViews() {
    return this._timeAxisViews;
  }
}
