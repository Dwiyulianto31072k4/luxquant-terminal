// src/components/landing/v2/sections/FaqV2.jsx
// ════════════════════════════════════════════════════════════════
// FAQ — MEXC "Help Center" style: numbered, full-width accordion rows
// with a chevron, clean dividers, one open at a time. v2 colour system.
// ════════════════════════════════════════════════════════════════
import { useState } from "react";

const FAQ_DATA = [
  {
    q: "Is it suitable for beginners?",
    a: "Absolutely. Every signal ships with the full plan — exact entry, multiple profit targets (TP1–TP4) and a strict stop-loss (SL) — so you always know precisely what to do, even on day one.",
  },
  {
    q: "What is the recommended starting capital?",
    a: "There is no strict minimum, but we recommend starting with at least $100–$500 so you can size positions sensibly and keep risk per trade under control.",
  },
  {
    q: "What happens if the algorithm makes a wrong prediction (loss)?",
    a: "Trading always carries risk. That's why every single signal includes a strict Stop-Loss level to cap the downside — losses are small and pre-defined, and the edge plays out over the full sample.",
  },
  {
    q: "Do I need to monitor the screen 24/7?",
    a: "Not at all. The system runs 24/7 and pushes real-time alerts straight to your Telegram and dashboard, so you only act when there's something to act on.",
  },
  {
    q: "How is the track record verified?",
    a: "Every call is recorded and timestamped from day one — no hidden trades, no cherry-picking. You can audit win rate, peak gains and time-to-target across the entire history on the Performance page.",
  },
];

function Row({ index, q, a, open, onToggle }) {
  return (
    <div
      className={`overflow-hidden border-b border-white/[0.07] transition-colors ${
        open ? "bg-white/[0.02]" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-4 px-2 py-5 text-left focus:outline-none sm:px-4"
      >
        <span
          className={`w-5 flex-shrink-0 font-mono text-sm tabular-nums transition-colors ${
            open ? "text-gold-primary" : "text-white/35 group-hover:text-white/60"
          }`}
        >
          {index}
        </span>
        <span
          className={`flex-1 text-[15px] font-medium transition-colors sm:text-base ${
            open ? "text-white" : "text-white/85 group-hover:text-white"
          }`}
        >
          {q}
        </span>
        <svg
          className={`h-4 w-4 flex-shrink-0 transition-all duration-300 ${
            open ? "rotate-180 text-gold-primary" : "text-white/35 group-hover:text-white/70"
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
          <p className="pb-5 pl-11 pr-6 text-sm leading-relaxed text-white/55 sm:pl-13">
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FaqV2() {
  const [openIdx, setOpenIdx] = useState(0);

  return (
    <section id="faq" className="relative z-10 mx-auto w-full max-w-3xl px-4 py-16 lg:px-8 lg:py-24">
      <div className="mb-9 text-center lg:mb-12">
        <span className="inline-flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.3em] text-gold-primary/80">
          <span className="h-px w-7 bg-gradient-to-r from-transparent to-gold-primary/60" />
          Help Center
          <span className="h-px w-7 bg-gradient-to-l from-transparent to-gold-primary/60" />
        </span>
        <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-white lg:text-[2.6rem]">
          Frequently Asked{" "}
          <span className="bg-gradient-to-r from-gold-light via-gold-primary to-[#b8860b] bg-clip-text text-transparent">
            Questions
          </span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/55 lg:text-base">
          Everything you need to know about the LuxQuant algorithm.
        </p>
      </div>

      <div className="border-t border-white/[0.07]">
        {FAQ_DATA.map((item, i) => (
          <Row
            key={i}
            index={i + 1}
            q={item.q}
            a={item.a}
            open={openIdx === i}
            onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
          />
        ))}
      </div>
    </section>
  );
}
