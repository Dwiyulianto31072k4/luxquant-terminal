// SignalsNarrativeBoard — the overview half of the Narratives panel.
//
// Shneiderman's order: overview, then zoom and filter, then details on demand.
// The table is the detail; this is everything above it.
//
// Three questions, three shapes, each picked for what it is actually good at:
//
//   Market breadth  → HALF GAUGE. One ratio against a fixed range, read at a
//                     glance. Gauges are a bad way to compare things and a fine
//                     way to show a single share of a whole.
//   Outcome mix     → DONUT. Five parts of one whole, summing to 100%. This is
//                     the narrow case a donut is right for, and it works because
//                     the weights conserve (each call is split 1/k across its
//                     narratives, so the ring totals the call count).
//   Rotation vs us  → SCATTER. Two continuous variables across 40 items. No
//                     donut or gauge can hold this, and it is the only shape
//                     that shows the relationship rather than two rankings.
//
// The scatter is the point of the panel. Measured 2026-09-12 the correlation
// between capital rotating INTO a narrative and our calls running further there
// is 0.07 — effectively none, with the quadrants splitting 10/10/10/10. That is
// worth showing, not hiding: a hot narrative is not a reason to expect more from
// a call, and the chart says so honestly by refusing to form a trend.
//
// Drawn in plain SVG rather than a chart library: 40 points and two axes do not
// justify a bundle, and hand-drawn marks let the theme tokens apply directly.
//
// Added 2026-09-20 — the sentence that tells you how to read the table below.
// Win rate across narratives runs 83% to 94% with intervals of two to eight
// points: on the live 30-day window exactly ONE pair of 780 is separable, and at
// 90 days with three times the sample it is five. So a win-rate ranking of
// narratives is a ranking of noise. Typical peak is a different matter — 9.1% to
// 25.7%, and a bootstrap separates 17% of pairs. The desk can say where its
// calls run FURTHER; it cannot say where they win MORE OFTEN. The panel now says
// so out loud instead of quietly sorting on the flat column.

import { useMemo } from "react";
import { narrativeFinding } from "./signals/flowMetrics";
import { ToggleBox } from "./signals/FlowUI";
import NarrativeBoardCards from "./signals/NarrativeBoardCards";


/** Is there anything to draw? The board used to derive the gauge and the donut
 *  here too; that is the cards' own business now, and one derivation living in
 *  two places is how two numbers on one screen start disagreeing. */
function hasPlottable(narratives) {
  return narratives.some((x) => x.mcap_change_7d != null && x.median_peak != null);
}

/** How to read the table underneath, measured from the table's own numbers.
 *  Not a hardcoded claim: if a future window ever DOES separate win rates, this
 *  card changes its own wording. */
function HowToRead({ finding, onRankByPeak, ranked }) {
  if (!finding) return null;
  const flat = finding.wrSeparable <= Math.max(1, finding.wrPairs * 0.02);
  return (
    <button
      type="button"
      onClick={onRankByPeak}
      aria-pressed={ranked}
      className={`group mt-2 flex w-full cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
        ranked
          ? "border-accent/50 bg-accent/[0.06]"
          : "border-ink/[0.08] hover:border-accent/40 hover:bg-ink/[0.02]"
      }`}
    >
      {/* Same switch the findings above wear, for the same reason: without it
          the corner text reads as a caption rather than as the control it is. */}
      <ToggleBox active={ranked} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      {/* Phone: the state under the claim, not beside it — "Ranked by peak"
          is fourteen characters of mono and squeezed the sentence into a
          column three words wide. */}
      <span className="flex w-full min-w-0 flex-col items-start gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
        <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-text-primary sm:text-[12.5px]">
          {flat
            ? "Every narrative wins about as often. What differs is how far a call runs."
            : "Win rates do separate in this window — and so does how far a call runs."}
        </span>
        <span
          className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] ${
            ranked ? "text-accent" : "text-text-muted group-hover:text-accent"
          }`}
        >
          {ranked ? "Ranked by peak" : "Rank by peak"}
        </span>
      </span>
      {/* The numbers behind the claim are desk-only, as on the Coin flow
          findings: on a phone the headline is the claim and the table under
          it is the proof. */}
      <span className="hidden text-[11px] leading-snug text-text-muted sm:block">
        Win rate runs {finding.wrLo.toFixed(0)}–{finding.wrHi.toFixed(0)}% and the confidence
        bands overlap on {finding.wrPairs - finding.wrSeparable} of {finding.wrPairs} pairs, so
        that column cannot rank anything. Typical peak runs{" "}
        {finding.peakLo.toFixed(1)}% to {finding.peakHi.toFixed(1)}% — a{" "}
        {finding.peakSpread.toFixed(1)}× spread, and the one number here worth choosing on.
      </span>
      </span>
    </button>
  );
}

export default function SignalsNarrativeBoard({
  narratives = [],
  marketChange7d = null,
  days = 30,
  onRankByPeak,
  rankedByPeak = false,
}) {
  const finding = useMemo(() => narrativeFinding(narratives), [narratives]);

  if (!hasPlottable(narratives)) return null;

  return (
    <div>
      <NarrativeBoardCards
        narratives={narratives}
        marketChange7d={marketChange7d}
        days={days}
      />

      <HowToRead finding={finding} onRankByPeak={onRankByPeak} ranked={rankedByPeak} />
    </div>
  );
}
