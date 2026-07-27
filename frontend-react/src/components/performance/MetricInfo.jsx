// src/components/performance/MetricInfo.jsx
//
// The little "i" that explains a metric, and the copy behind it.
//
// The page was full of figures with no stated definition — "Avg R:R (TP4)",
// "Not Hit", "Closed Trades of 54,882" — each of which reads three different
// ways depending on what the reader assumes. A number nobody can define is a
// number nobody can trust, and this is the page whose entire job is proof.
//
// Rule for the copy: one line saying what it is, one saying how to read it or
// where it can mislead. No line is decoration.

import { useState } from "react";

export function InfoTip({ info, align = "left" }) {
  const [open, setOpen] = useState(false);
  if (!info) return null;
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={`What is ${info.title}?`}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="flex h-[14px] w-[14px] items-center justify-center rounded-full border border-ink/25 font-mono text-[8px] font-bold leading-none text-text-muted transition-colors hover:border-ink/70 hover:text-text-primary"
      >
        i
      </button>
      {open && (
        <div
          className={`absolute top-5 z-40 w-64 rounded-xl border border-ink/15 bg-surface-secondary/[0.98] p-3 text-left shadow-[0_16px_40px_rgb(var(--scrim)/0.35)] backdrop-blur-md ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <p className="mb-1.5 text-[11px] font-semibold text-text-primary">{info.title}</p>
          {info.lines.map((ln, i) => (
            <p key={i} className="mb-1.5 text-[11px] leading-snug text-text-primary/60 last:mb-0">
              {ln}
            </p>
          ))}
        </div>
      )}
    </span>
  );
}

/* ── KPI strip ────────────────────────────────────────────────── */

export const KPI_INFO = {
  win_rate: {
    title: "Win rate",
    lines: [
      "Share of resolved calls that reached at least TP1 before hitting the stop.",
      "On its own it decides nothing — a 90% rate on targets smaller than the stop still loses money. Read it next to expectancy in the R section below.",
    ],
  },
  closed_trades: {
    title: "Closed trades",
    lines: [
      "Calls that have a final outcome: a take-profit or a stop-loss.",
      "The larger number beside it is every call ever published, including the ones still running. The gap is the 'Not hit' tile.",
    ],
  },
  winners: {
    title: "Winners",
    lines: [
      "Closed calls that reached at least TP1.",
      "It does not say how far they ran — a TP1 win and a TP4 win both count once here. The outcome distribution below splits them.",
    ],
  },
  losses: {
    title: "Losses",
    lines: [
      "Closed calls that hit the stop without reaching any target.",
      "Every one of these is exactly −1R by definition, because the stop is what defines 1R.",
    ],
  },
  avg_rr: {
    title: "Avg R:R (TP4)",
    lines: [
      "Average reward-to-risk of the final target: how many multiples of the stop distance TP4 sits away from entry.",
      "It is the shape the calls promise, not what they returned — reaching TP4 is what turns it into a result.",
    ],
  },
  not_hit: {
    title: "Not hit",
    lines: [
      "Published calls with no target and no stop reached yet.",
      "They are excluded from win rate entirely, in either direction — counting them as losses would be as wrong as counting them as wins.",
    ],
  },
};

/* ── section headers ──────────────────────────────────────────── */

export const SECTION_INFO = {
  outcome: {
    title: "Outcome distribution",
    lines: [
      "Where closed calls finished: TP1–TP4, or the stop.",
      "The back targets are the ones that carry the book — most of the total return comes from TP3 and TP4, not from the far more numerous TP1s.",
    ],
  },
  rr: {
    title: "Risk : Reward",
    lines: [
      "How far each target sits from entry, measured in multiples of the stop distance (1R).",
      "TP1 and TP2 pay less than 1R, so hitting them alone does not cover a stop. That is why win rate needs expectancy beside it.",
    ],
  },
  risk_level: {
    title: "Risk level",
    lines: [
      "The tag attached to each call when it was published: low, medium, normal or high.",
      "Measured across the whole book the tag barely separates outcomes — expectancy sits within a narrow band across every rung, so treat it as context rather than a filter.",
    ],
  },
  top_pairs: {
    title: "Top performing pairs",
    lines: [
      "Pairs ranked by win rate, with a minimum sample so a single lucky call cannot top the table.",
      "A 100% rate on 9 calls is a small sample, not a better coin — check the trade count in the same row before reading anything into it.",
    ],
  },
  wr_btc: {
    title: "Win rate × Bitcoin",
    lines: [
      "Daily win rate drawn over BTC candles, so the edge is judged against the market rather than in isolation.",
      "The line underneath is the real test: if the up-day and down-day win rates sit close together, the edge is not simply riding the market.",
      "Correlation r near 0 means the win rate moves independently of BTC's daily direction; near +1 means it rises and falls with it.",
    ],
  },
  r_section: {
    title: "Risk-adjusted performance",
    lines: [
      "Everything here is measured in R, where 1R is the distance from entry to the stop — the risk each call sets for itself.",
      "That is what makes a Bitcoin call and a micro-cap call comparable: both risk exactly 1R regardless of price or volatility.",
      "Each tile carries its own reading underneath, and the block at the bottom defines every ratio.",
    ],
  },
  signal_history: {
    title: "Signal history",
    lines: [
      "Every call ever published, with its entry, targets and stop exactly as they were sent.",
      "Calls still running from the last 7 days are held back for subscribers — those are the live ones. Anything resolved shows immediately at any age, and anything older than 7 days shows even if it is still open.",
    ],
  },
};
