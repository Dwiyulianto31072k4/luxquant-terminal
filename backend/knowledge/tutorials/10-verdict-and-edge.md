---
slug: verdict-and-edge
track: numbers
order: 30
title: Verdict, streak, and Edge
excerpt: Worth It / Avoid is a historical label on the coin, not a command to click buy. On a resolved row it is computed as-of-entry, so the row cannot grade itself.
level: intermediate
minutes: 4
---

**Verdict** sits on the Signals table and inside Deep Analysis. It is Coin Intelligence looking at *this coin's* closed history — not a crystal ball for the row you are staring at.

## The three labels

- **Worth It** — generally when win rate is strong (**≥ 80%** with at least 5 closed trades, or **≥ 85%** overall), the coin is on a hot streak of **≥ 5** closed wins, or positive flags are present with no danger flags.
- **Avoid** — a danger flag, **SL rate ≥ 30%** with enough closed trades, a declining win rate below 70%, a flow-underperformer flag, or win rate **below ~65%** with enough history.
- **Neutral** — not clearly either.

These thresholds are descriptive. A Worth It coin can still stop out today. An Avoid coin can still tag TP1. The label is a prior, not an order.

## Neighbouring numbers

- **WR / Streak** — this coin's historical hit rate, plus the current run (`▲2W` = two wins in a row, `▼1L` = one loss). WR colour: green ≥ 70%, yellow 50–69%, red below 50%.
- **SL Rate** — share of this coin's trades that ended at stop. Lower is better; ≥ 30% is the Avoid tripwire.
- **R:R** — reward-to-risk on the *plan*. ≥ 2× strong, ≥ 1× acceptable, below 1× weak — and remember Compare uses R:R *from here*, which is the one that changes.
- **Risk score (0–100)** — Excellent ≥ 80, Good ≥ 65, Average ≥ 45, Poor ≥ 25, then Very Poor.
- **Entry quality** — how often price runs past TP1, and how often it reaches the final target.

## Edge

**Edge** on the Signals page is a ranking score over the open set (win rate, tags, freshness). Recipes like "worth_it + hot streak" are filters, not a second algorithm. Clearing filters returns you to the raw list.

## A resolved row cannot grade itself

Pair-level stats include every closed trade. Showing Avoid on a row *because that row stopped out* would leak the outcome into the label. So: open rows use the coin's prior history; **closed rows leave themselves out** and re-classify. That is why a loss is not automatically stamped Avoid on the same line.

**Open it:** [Signals](/signals)
