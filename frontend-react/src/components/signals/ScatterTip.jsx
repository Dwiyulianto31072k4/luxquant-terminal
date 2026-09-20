// ScatterTip — the hover layer both flow scatters ship with.
//
// An SVG <title> is not a hover layer. It waits about a second, it is styled by
// the operating system, it cannot hold two figures side by side, and on a touch
// screen it never appears at all. With a few hundred dots and only the ones
// that fit carrying a label, that left most of the plot anonymous — which is
// the first thing anyone asks about it.
//
// So: an HTML card positioned over the plot. The SVG keeps its viewBox and
// scales to the container, and preserveAspectRatio maps that box exactly onto
// the element, so a point at (cx, cy) in viewBox units sits at cx/W and cy/H of
// the rendered box — percentages place the card with no measuring and no
// resize listener.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function ScatterTip({ point, W, H, title, rows = [], note }) {
  if (!point) return null;
  const left = clamp((point.cx / W) * 100, 6, 94);
  const above = point.cy / H > 0.28;
  const top = ((point.cy + (above ? -point.r - 6 : point.r + 6)) / H) * 100;
  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[210px] rounded-lg border border-ink/[0.12] bg-surface-raised px-2.5 py-1.5 shadow-lg"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        transform: `translate(-50%, ${above ? "-100%" : "0"})`,
      }}
      role="tooltip"
    >
      <p className="truncate text-[12px] font-medium leading-tight text-text-primary">{title}</p>
      <div className="mt-1 space-y-0.5">
        {rows.map((r) => (
          <p key={r.label} className="flex items-baseline gap-2 whitespace-nowrap text-[10.5px]">
            <span className="text-text-muted">{r.label}</span>
            <span className={`ml-auto font-mono tabular-nums ${r.tone || "text-text-primary"}`}>
              {r.value}
            </span>
          </p>
        ))}
      </div>
      {note ? <p className="mt-1 text-[10px] leading-snug text-accent">{note}</p> : null}
    </div>
  );
}
