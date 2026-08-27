// Layered copy for Quick path — Simple first, Expert behind a drill.
// English product language. A win is TP1. Hunt tags are as-of-entry.

export const RECIPE_EXPLAIN = {
  quick: {
    id: "quick",
    label: "Quick path",
    oneLiner:
      "Three optional shortlists. The full table stays open until you tap one. Reset restores everything.",
    simple: [
      "These buttons do not trade for you. They shrink the list so you can study fewer calls.",
      "Tap a recipe, read the Edge column, open a pair. Reset anytime.",
    ],
    drills: [
      {
        id: "what",
        title: "What this is",
        hint: "Optional shortlists, not a bot",
        simple:
          "Quick path sits above the table. Each recipe is a saved combination of filters and sort. Nothing is hidden from you until you opt in.",
        expert:
          "Recipes write the same filter state as the chips (tags, Worth, status, sort chain). They are client-side views over the loaded desk + tag history. Saved views live in this browser only.",
      },
      {
        id: "win",
        title: "What counts as a win",
        hint: "TP1 or further",
        simple:
          "A call is a win if price reached at least TP1 before the stop. TP2, TP3 and TP4 are still wins — they just went further. Hitting the stop without TP1 is a loss.",
        expert:
          "Final outcome is the highest target reached (or SL). Win rate = share of resolved calls with outcome in {tp1, tp2, tp3, tp4}. Full TP = {tp3, tp4}. Peak % is how far price ran, not booked P&L. Member results differ with size, fees, and when you exit.",
      },
      {
        id: "edge",
        title: "Edge Score",
        hint: "A ranking prior, not a guarantee",
        simple:
          "Edge Score ranks setups using how similar tags behaved after past calls. Higher usually meant a slightly better hit rate. Use it to order the list, not as a buy button.",
        expert:
          "Walk-forward on the tag era (from 10 Mar 2026): top quintile win ~90% vs bottom ~83% (about +7pp), full TP about +6.5pp. Mean score of wins vs losses is close — ranking is a soft prior. Tag filters (Hunt) separate more than sort alone.",
      },
      {
        id: "limits",
        title: "Limits",
        hint: "Past ≠ future",
        simple:
          "Crypto regimes change. A shortlist that looked strong last month can cool off. Size your own risk. Nothing here is a signal to skip the stop.",
        expert:
          "Tags overlap (one call can wear several). Runner tags are chosen from the same history as the stats (in-sample). Confound tags like LATE_ENTRY print high win rates because the coin was already flying — that is why they are excluded from Hunt, not because they “lose.”",
      },
    ],
  },
  strongest: {
    id: "strongest",
    label: "Strongest setups",
    oneLiner:
      "Open calls marked Worth, sorted by pair verdict then Edge. A clean desk — not a special tag filter.",
    simple: [
      "Shows calls that are still running, on pairs whose own history looks solid (Worth).",
      "Sorts the strongest pair records first. It does not hunt extra tags.",
    ],
    drills: [
      {
        id: "does",
        title: "What the button does",
        hint: "Open · Worth · Verdict → Edge → Called",
        simple:
          "Keeps open calls only. Hides Avoid. Sorts by the pair’s Worth score, then Edge Score, then newest.",
        expert:
          "Worth comes from classifyCoin on that pair’s closed history (as-of-entry / leave-one-out on resolved rows). Baseline win rate across tagged calls is already high, so Worth is a wide net. No runner tags are applied.",
      },
      {
        id: "worth",
        title: "What Worth means",
        hint: "The pair’s track record, not this tag",
        simple:
          "Worth means this coin’s past LuxQuant calls mostly reached TP1, without danger flags. Avoid is the opposite.",
        expert:
          "Typical gate: win rate ≥ 80% with at least 5 closed trades, or a positive flag without danger. SL rate ≥ 30% with 5+ trades is Avoid. Orthogonal to Hunt’s tags — you can be Worth on a weak tag, or Avoid on a runner tag.",
      },
      {
        id: "limits",
        title: "Limits",
        hint: "Close to the default good list",
        simple:
          "If most pairs on the desk are already Worth, this shortlist will look a lot like “open calls, best pairs first.” Use Hunt when you want a tighter setup filter.",
        expert:
          "No exclusion of LATE_ENTRY / PARABOLIC. A Worth pair that has already run far can still appear. Combine with Hunt or drop confound tags in the graph if you want “still near entry.”",
      },
    ],
  },
  full_tp: {
    id: "full_tp",
    label: "Hunt full TP",
    oneLiner:
      "Calls whose entry tags historically reached TP3/TP4 more often — classified at call time, not after they already won.",
    simple: [
      "This is a filter for setups that more often filled the later targets, not a collector of trades that already hit TP.",
      "The bars below are closed calls only (hit TP or SL) that wore today’s Hunt tags when they were published, versus every closed call in the same window. Open calls are not counted.",
    ],
    drills: [
      {
        id: "does",
        title: "What the button does",
        hint: "Runner tags · Worth · Edge → Called",
        simple:
          "Keeps Worth pairs that carry at least one “runner” tag. Sorts by Edge Score. Includes open and closed, so you can study how those setups finished.",
        expert:
          "selectedTags = top 4 runner tags (OR). verdictFilter = worth_it. statusFilter = all. sort = edge_score desc, then called time. Live Worth is pair-level and is NOT baked into the historical bars — those bars are the tag union only.",
      },
      {
        id: "asof",
        title: "As-of-entry (no leak)",
        hint: "Tags from the snapshot at call time",
        simple:
          "Every tag used here was on the call when it was published. We do not add “winner” tags after TP3 hits. Closed rows in the table are here so you can audit the filter, not because we mined finished trades.",
        expert:
          "Tags = important names on signal_enrichment.entry_snapshot. Open calls are scored with resolved-only tag-WR (this call is not in the rates). Closed rows use leave-one-out so the badge cannot see its own outcome. Hunt stats below are still in-sample vs the current top-4 list — honest as a description, not a walk-forward paper trade of the button.",
      },
      {
        id: "pick",
        title: "How runner tags are chosen",
        hint: "Clean tags that ran further",
        simple:
          "We look at closed history since tags exist (from 10 Mar 2026). A tag qualifies if it has enough samples, a solid win rate, and it reached later targets (or ran a high peak) more often. Late / parabolic / overextended tags are excluded — they look strong because the coin was already flying.",
        expert:
          "Eligibility: not in {LATE_ENTRY, PARABOLIC, OVEREXTENDED, EXHAUSTION_CANDLE}, n≥150, WR≥78%, and (full_tp_rate≥12% or tp4_rate≥5% or median peak on wins ≥18%). Ranked by full_tp_rate, keep top 4. full_tp = outcome ∈ {tp3, tp4}. Many tags pass the loose gate; the top-4 cap is what makes Hunt a shortlist.",
      },
      {
        id: "read",
        title: "How to read SL / TP1–TP4",
        hint: "Final mix sums to 100%",
        simple:
          "Final mix: each closed call is counted once, at the furthest target it reached — or SL if it never hit TP1. So TP4% is “finished at TP4,” not “touched TP4 then came back.” Reached-at-least is the other view: TP1% there is the win rate, because TP2/TP3/TP4 also reached TP1.",
        expert:
          "Final shares are mutually exclusive and sum to ~100%. Reached TP k = share with outcome ≥ that target. Win rate = reached TP1. Full TP = reached TP3. A TP4 win also passed TP1–TP3; it is not double-counted in the final mix. These are call outcomes, not your R-multiple after fees.",
      },
      {
        id: "limits",
        title: "Limits",
        hint: "Shortlist, not a promise of TP4",
        simple:
          "Hunt raises the chance of a deeper run versus all calls. It does not mean this open call will hit TP4. Stops still exist. Size yourself.",
        expert:
          "Overlap: a call with two runner tags is one row in the union (not counted twice). RSI_OVERBOUGHT_H1 often dominates sample size. BTC_VOLATILE can have a huge full-TP rate and zero live names. Worth on the live desk may drop some of these rows. Peak ≠ realised. Regime can shift; refresh the bars, don’t freeze them as a brand claim.",
      },
    ],
  },
  caution: {
    id: "caution",
    label: "Caution first",
    oneLiner:
      "Open calls that look extended or exhausted, weakest Edge first. A review list — not a place to hunt entries.",
    simple: [
      "These tags often show a high win rate because the move already happened. The easy risk/reward is usually gone.",
      "Use this to see what to skip or size down, not as a buy shortlist.",
    ],
    drills: [
      {
        id: "does",
        title: "What the button does",
        hint: "Open · confound tags · Edge weakest first",
        simple:
          "Shows still-open calls tagged late, parabolic, overextended, or exhaustion. Sorts the lowest Edge scores to the top so the weakest sit first.",
        expert:
          "selectedTags = LATE_ENTRY, PARABOLIC, OVEREXTENDED, EXHAUSTION_CANDLE (OR). status = open. verdict = all. sort edge_score ascending. EXHAUSTION is the only one that actually underperforms on win rate; the other three print high WR and high full-TP because selection is conditional on a move already underway.",
      },
      {
        id: "why",
        title: "Why high win rate is misleading here",
        hint: "Already flying ≠ still a good entry",
        simple:
          "If a coin has already run far, of course many of those calls eventually print TP1 — the move was in progress. You would be entering late, with the stop far away and little room left.",
        expert:
          "Product rule: we do not rank the desk by raw tag win rate for this reason. LATE_ENTRY / PARABOLIC can beat Hunt tags on WR and still be the worst R:R. Caution is pedagogic. Prefer Hunt or a clean-entry filter when you want trades.",
      },
      {
        id: "limits",
        title: "Limits",
        hint: "Teaching tool",
        simple:
          "If you came here looking for something to take, go back to Hunt full TP. This list is the warning pile.",
        expert:
          "Confound set is hard-coded, not fit from WR. Overlap with Hunt exists when a runner tag co-occurs with LATE_ENTRY. Sorting Edge ascending is for review, not expected-value.",
      },
    ],
  },
};

export const OUTCOME_LABELS = [
  {
    key: "sl",
    short: "SL",
    title: "Stop",
    final:
      "Closed at the stop without reaching TP1. Counted as a loss. This is the share of Hunt calls that never made it to the first target.",
    reached:
      "Same as the final SL share — calls that did not reach TP1.",
  },
  {
    key: "tp1",
    short: "TP1",
    title: "Target 1",
    final:
      "Furthest target reached was TP1. Still a win. They did not continue to TP2–TP4.",
    reached:
      "Share that reached at least TP1 — this is the win rate. TP2, TP3 and TP4 are included.",
  },
  {
    key: "tp2",
    short: "TP2",
    title: "Target 2",
    final: "Furthest target reached was TP2. A win that went one step past TP1.",
    reached: "Share that reached TP2 or further (TP2 + TP3 + TP4).",
  },
  {
    key: "tp3",
    short: "TP3",
    title: "Target 3",
    final:
      "Furthest target reached was TP3. Together with TP4 this is “full TP” in Edge language.",
    reached:
      "Share that reached TP3 or TP4 — the full-TP rate Hunt is built to raise.",
  },
  {
    key: "tp4",
    short: "TP4",
    title: "Target 4",
    final: "The call filled the last target. Also a win, and the deepest run we record as an outcome.",
    reached: "Share that reached TP4. Same number as the final TP4 share.",
  },
];
