import { useState, useRef, useEffect, useId } from "react";

/**
 * The dropdown Gate uses everywhere a filter has more than three choices: a
 * quiet trigger showing the current value, and a panel where the active row
 * carries a check. Replaces strips of tabs and pill groups, which stop being
 * proportional the moment a label grows or the viewport shrinks.
 *
 * options: [{ value, label, hint? }]
 */
const GateSelect = ({
  value,
  onChange,
  options,
  label,
  align = "right",
  size = "md",
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pad = size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-[12px]";

  return (
    <div ref={wrapRef} className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={`flex items-center gap-1.5 rounded-lg border border-ink/[0.10] bg-surface-raised font-medium text-text-primary transition-colors hover:border-ink/25 ${pad}`}
      >
        {label ? <span className="text-text-muted">{label}</span> : null}
        <span className="whitespace-nowrap">{current?.label ?? "—"}</span>
        <svg
          viewBox="0 0 24 24"
          className={`h-3 w-3 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className={`absolute z-30 mt-1.5 min-w-[168px] overflow-hidden rounded-xl border border-ink/[0.10] bg-surface-raised py-1 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((o) => {
            const on = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-4 px-3.5 py-2 text-left text-[13px] transition-colors hover:bg-ink/[0.05] ${
                    on ? "text-text-primary" : "text-text-secondary"
                  }`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{o.label}</span>
                    {o.hint ? (
                      <span className="truncate text-[11px] text-text-muted">{o.hint}</span>
                    ) : null}
                  </span>
                  {on ? (
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5 shrink-0 text-accent"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default GateSelect;
