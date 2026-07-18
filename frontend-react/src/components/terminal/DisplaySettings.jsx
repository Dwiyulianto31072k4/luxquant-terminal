// src/components/terminal/DisplaySettings.jsx
// ════════════════════════════════════════════════════════════════
// "What do you want to see?" — lets a trader switch off layers of the
// Confluence desk they don't use. The desk is deliberately dense; this is the
// escape hatch so density stays a choice rather than a tax.
//
// Prefs persist per-user (users.ui_prefs) via useUiPrefs.
// ════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from "react";
import { useUiPrefs } from "../../hooks/useUiPrefs";

export const TERMINAL_DISPLAY_DEFAULTS = {
  term_room: true,
  term_flow: true,
  term_mtf: true,
  term_reasons: true,
  term_warnings: true,
  term_fng: true,
  term_kpis: true,
};

const ITEMS = [
  ["term_room", "Room left", "Typical peak vs distance already travelled"],
  ["term_mtf", "Timeframe alignment", "The 4H · 1H · 15m row"],
  ["term_reasons", "Setup reasons", "Why this setup fired"],
  ["term_warnings", "Warnings", "Late entry, parabolic, thin liquidity…"],
  ["term_flow", "Flow context", "Liquidations & spot accumulation"],
  ["term_fng", "Fear & Greed", "Market sentiment gauge"],
  ["term_kpis", "KPI strip", "Counters above the grid"],
];

const Switch = ({ on }) => (
  <span
    className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
      on ? "bg-accent" : "bg-ink/15"
    }`}
  >
    <span
      className={`absolute h-3 w-3 rounded-full bg-white shadow transition-transform ${
        on ? "translate-x-3.5" : "translate-x-0.5"
      }`}
    />
  </span>
);

export function DisplaySettings() {
  const { prefs, setPref } = useUiPrefs(TERMINAL_DISPLAY_DEFAULTS);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hiddenCount = ITEMS.filter(([k]) => prefs[k] === false).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Choose what to show on the desk"
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors ${
          open || hiddenCount
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-ink/10 text-text-muted hover:border-ink/25 hover:text-text-primary"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        Display
        {hiddenCount > 0 && <span className="font-semibold">{hiddenCount} off</span>}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-[260px] rounded-xl border border-ink/[0.1] bg-surface-raised p-1.5 shadow-2xl shadow-black/40">
          <div className="px-2 pb-1.5 pt-1 font-mono text-[8.5px] uppercase tracking-[0.16em] text-text-muted">
            Show on cards
          </div>
          {ITEMS.map(([key, label, desc]) => {
            const on = prefs[key] !== false;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPref(key, !on)}
                className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-ink/[0.04]"
              >
                <span className="mt-0.5">
                  <Switch on={on} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] text-text-primary">{label}</span>
                  <span className="block text-[10px] leading-snug text-text-muted">{desc}</span>
                </span>
              </button>
            );
          })}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => ITEMS.forEach(([k]) => setPref(k, true))}
              className="mt-1 w-full rounded-lg border border-ink/10 px-2 py-1.5 font-mono text-[9px] uppercase tracking-wider text-text-muted transition-colors hover:border-ink/25 hover:text-text-primary"
            >
              Show everything
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default DisplaySettings;
