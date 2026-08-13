// EdgeAdvancedSection — progressive disclosure wrapper for expert tools.
// Default collapsed so awam stays on recipes + table. One click for power users.

import { useEffect, useState } from "react";

const OPEN_KEY = "lq:edge-advanced-open:v1";

export default function EdgeAdvancedSection({
  children,
  activeChipCount = 0,
  openSignal,
  onOpenChange,
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });

  // External open request (e.g. "Pelajari / Advanced" from recipes bar)
  useEffect(() => {
    if (openSignal == null) return;
    setOpen(true);
    try {
      localStorage.setItem(OPEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [openSignal]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-ink/[0.09] bg-surface-raised">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink/[0.02] sm:px-5"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold tracking-tight text-text-primary">
              Pelajari Edge · Advanced
            </span>
            <span className="rounded-md border border-ink/[0.08] bg-ink/[0.03] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted">
              graph · multi-filter · 90d learn
            </span>
            {activeChipCount > 0 && (
              <span className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-accent">
                {activeChipCount} filter active
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-text-muted">
            {open
              ? "Graph, multi-filter, prefer/caution, and validation vs 7d desk."
              : "Untuk yang mau drill dalam — default tertutup. Awam cukup pakai Cara cepat di atas."}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {/* Always mount children so edge-correlation keeps fetching for Edge Score
          even when Advanced is collapsed (hidden only). */}
      <div
        className={
          open
            ? "space-y-4 border-t border-ink/[0.06] px-3 pb-4 pt-3.5 sm:px-5"
            : "hidden"
        }
        aria-hidden={!open}
      >
        {children}
      </div>
    </section>
  );
}
