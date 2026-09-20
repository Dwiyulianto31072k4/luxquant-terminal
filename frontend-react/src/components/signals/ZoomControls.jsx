// ZoomControls — the visible half of useZoomPan.
//
// A chart that only responds to gestures is a chart most people never find out
// is interactive, and one that cannot be driven without a trackpad at all. The
// buttons are the discoverable path and the keyboard one; the hint line says
// which gesture the wheel is bound to here, because it differs between the
// inline plot (which must leave the page's scroll alone) and the modal.

const BTN =
  "flex h-7 w-7 items-center justify-center rounded-md border border-ink/[0.12] bg-surface-raised text-text-muted transition-colors hover:border-accent/40 hover:text-accent disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-ink/[0.12] disabled:hover:text-text-muted";

export default function ZoomControls({ zoomed, zoomBy, reset, k, className = "" }) {
  return (
    /* Its own surface: the controls float over the plot, and at a deep zoom a
       mark can end up directly beneath them. */
    <span
      className={`flex items-center gap-1 rounded-lg bg-surface-raised/85 p-0.5 backdrop-blur-sm ${className}`}
    >
      {zoomed ? (
        <span className="px-1 font-mono text-[9.5px] tabular-nums text-text-muted">
          {k.toFixed(1)}×
        </span>
      ) : null}
      <button type="button" className={BTN} onClick={() => zoomBy(1 / 1.45)} disabled={!zoomed} aria-label="Zoom out">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 8h8" />
        </svg>
      </button>
      <button type="button" className={BTN} onClick={() => zoomBy(1.45)} aria-label="Zoom in">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M8 4v8M4 8h8" />
        </svg>
      </button>
      <button type="button" className={BTN} onClick={reset} disabled={!zoomed} aria-label="Reset the view">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 8a5 5 0 1 1-1.6-3.7M13 3v3h-3" />
        </svg>
      </button>
    </span>
  );
}

/** One line, so nobody has to guess which gesture the wheel is bound to. */
export function ZoomHint({ wheel }) {
  return (
    <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-muted">
      drag to pan ·{" "}
      {wheel === "direct" ? "scroll to zoom" : `${navigatorMod()}+scroll to zoom`} · double-click in
    </span>
  );
}

function navigatorMod() {
  if (typeof navigator === "undefined") return "ctrl";
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "") ? "⌘" : "ctrl";
}
