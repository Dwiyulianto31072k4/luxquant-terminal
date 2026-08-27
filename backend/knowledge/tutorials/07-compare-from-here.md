---
slug: compare-from-here
track: read-a-call
order: 40
title: Compare from the live price
excerpt: Tick 2–5 calls. The number that matters is R:R from here — not the planned 4.5 on every ladder.
level: intermediate
minutes: 4
---

Every row on [Signals](/signals) has a checkbox on the far left. Tick **2 to 5** calls. A bar appears at the bottom; press **Compare**.

## Why "from here"

The planned reward-to-risk — target minus entry, over entry minus stop — is roughly **4.5 on every call**, because the algorithm sets the ladder at fixed ratios. Comparing that number is comparing rounding noise.

What actually differs between two live calls is how far price has already travelled. So the headline row is **R:R from here**: remaining upside to the target, divided by remaining downside to the stop, **both from the current price**.

- **Above 1×** — from here, you stand to make more than you risk.
- **Below 1×** — remaining upside is smaller than the drop to the stop.
- **"below stop"** — price has already broken invalidation. It is not a trade.

Near-zero distance from the original entry means you can still get in close to the called price. A call that has already run halfway to TP3 is a different trade from the one that was published.

## Other rows

Room to target, risk to stop, live price, entry, stop, target, 24h liquidity, BTC correlation, age. The best value in each row is highlighted.

At the top, a **verdict** names the strongest of the selection and says why — and says plainly when **none** of them is worth taking rather than inventing a winner.

## Concentration

If the coins you picked all track Bitcoin closely (correlation **≥ 0.70**), taking several of them is one larger BTC bet, not a spread of risk. No single-row view can tell you that. Compare can.

This is the lesson that stops people from "diversifying" into five versions of the same move.

**Open it:** [Signals](/signals)
