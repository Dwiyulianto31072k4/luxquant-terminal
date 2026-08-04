// src/components/autotrade/EventExplainerModal.jsx
// ════════════════════════════════════════════════════════════════
// One modal for every Agent event: why an entry was skipped, why
// the bot is locked, how a position ended.
//
// Content lives in autotradeEventGuide.js so the inline hint in the
// timeline and this long form can never drift apart.
// ════════════════════════════════════════════════════════════════
import { useEffect } from "react";
import { explainEvent } from "./autotradeEventGuide";

const TONE = {
  critical: { label: "Critical", cls: "bg-rose-500/12 text-rose-400" },
  error: { label: "Error", cls: "bg-rose-500/12 text-rose-400" },
  high: { label: "Needs attention", cls: "bg-amber-500/12 text-amber-400" },
  warning: { label: "Warning", cls: "bg-amber-500/12 text-amber-400" },
  info: { label: "Information", cls: "bg-sky-500/12 text-sky-400" },
};

function Section({ heading, children }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {heading}
      </div>
      <p className="text-[13px] leading-relaxed text-text">{children}</p>
    </div>
  );
}

export default function EventExplainerModal({ code, onClose }) {
  const guide = explainEvent(code);

  // Escape closes, matching every other modal in the app.
  useEffect(() => {
    if (!guide) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [guide, onClose]);

  if (!guide) return null;
  const tone = TONE[guide.severity];

  return (
    <div
 className="lq-modal-safe lq-scrim-bg fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-ink/[0.08] bg-surface p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={guide.title}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-text">{guide.title}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {tone ? (
                <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-medium ${tone.cls}`}>
                  {tone.label}
                </span>
              ) : null}
              {guide.blocking ? (
                <span className="rounded-sm bg-rose-500/12 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
                  Stops all new entries
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-md px-2 py-1 text-lg leading-none text-text-muted hover:bg-ink/[0.06] hover:text-text"
          >
            ×
          </button>
        </div>

        <div className="space-y-3.5">
          <Section heading="What happened">{guide.what}</Section>
          <Section heading="Why">{guide.why}</Section>
          <Section heading="What to do">{guide.fix}</Section>
        </div>

        <div className="mt-4 border-t border-ink/[0.06] pt-2.5">
          <code className="text-[10px] text-text-muted">{code}</code>
        </div>
      </div>
    </div>
  );
}
