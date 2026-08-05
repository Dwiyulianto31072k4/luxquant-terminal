// src/components/landing/v2/sections/FaqV2.jsx
// ════════════════════════════════════════════════════════════════
// FAQ — MEXC "Help Center" style: numbered, full-width accordion rows
// with a chevron, clean dividers, one open at a time. v2 colour system.
// ════════════════════════════════════════════════════════════════
import { useState } from "react";
import { LANDING_FAQ } from "../../../../content/faq";

const FAQ_DATA = LANDING_FAQ;

function Row({ index, q, a, open, onToggle }) {
  return (
    <div
      className={`overflow-hidden border-b border-ink/[0.07] transition-colors ${
        open ? "bg-ink/[0.02]" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-4 px-2 py-5 text-left focus:outline-none sm:px-4"
      >
        <span
          className={`w-5 flex-shrink-0 font-mono text-sm tabular-nums transition-colors ${
            open ? "text-accent" : "text-text-primary/35 group-hover:text-text-primary/60"
          }`}
        >
          {index}
        </span>
        <span
          className={`flex-1 text-[15px] font-medium transition-colors sm:text-base ${
            open ? "text-text-primary" : "text-text-primary/85 group-hover:text-text-primary"
          }`}
        >
          {q}
        </span>
        <svg
          className={`h-4 w-4 flex-shrink-0 transition-all duration-300 ${
            open
              ? "rotate-180 text-accent"
              : "text-text-primary/35 group-hover:text-text-primary/70"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p className="pb-5 pl-11 pr-6 text-sm leading-relaxed text-text-primary/55 sm:pl-13">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

const PREVIEW_COUNT = 5;

export default function FaqV2() {
  const [openIdx, setOpenIdx] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const hidden = Math.max(FAQ_DATA.length - PREVIEW_COUNT, 0);

  return (
    <section
      id="faq"
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-16 lg:px-8 lg:py-24"
    >
      <div className="mb-9 text-center lg:mb-12">
        <span className="inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-text-muted">
          <span className="h-px w-7 bg-gradient-to-r from-transparent to-accent/60" />
          Help Center
          <span className="h-px w-7 bg-gradient-to-l from-transparent to-accent/60" />
        </span>
        <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-text-primary lg:text-[2.6rem]">
          Frequently Asked{" "}
          <span className="bg-gradient-to-r from-accent via-ink to-accent-dark bg-clip-text text-transparent">
            Questions
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-text-primary/55 lg:text-base">
          How the algorithm thinks, how risk is defined, how the track record is audited — and how
          to start with a process you can actually verify.
        </p>
      </div>

      <div className="border-t border-ink/[0.07]">
        {FAQ_DATA.map((item, i) => (
          // Rendered, not unmounted: the answers stay in the markup a crawler
          // reads even while they are collapsed out of view.
          <div
            key={i}
            className={
              i < PREVIEW_COUNT || showAll
                ? ""
                : "pointer-events-none h-0 overflow-hidden opacity-0"
            }
            aria-hidden={i < PREVIEW_COUNT || showAll ? undefined : "true"}
          >
            <Row
              index={i + 1}
              q={item.q}
              a={item.a}
              open={openIdx === i}
              onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
            />
          </div>
        ))}
      </div>

      {hidden > 0 && (
        <div className="mt-7 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-ink/[0.12] px-5 text-[13px] font-medium text-text-primary/75 transition-colors hover:border-ink/20 hover:text-text-primary"
          >
            {showAll ? "Show fewer questions" : `Show all ${FAQ_DATA.length} questions`}
            <svg
              className={`h-3.5 w-3.5 transition-transform duration-300 ${showAll ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}
