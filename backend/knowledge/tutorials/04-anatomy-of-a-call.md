---
slug: anatomy-of-a-call
track: read-a-call
order: 10
title: Entry, targets, stop
excerpt: Every call is a ladder — one entry, four takes, one stop — published at a timestamp you can audit.
level: basic
minutes: 4
---

A LuxQuant **call** is a trade plan, not a vibe. The algorithm publishes a ladder and we keep the original numbers on the row, even after price has moved.

## The ladder

- **Entry** — the planned price. It is not "market buy the second you see this". By the time you open the terminal, live price may already be above or below it.
- **TP1, TP2, TP3, TP4** — staged take-profit levels. Higher TP means the move ran further. The system is long-only; targets sit above entry.
- **SL** (sometimes SL1 / SL2 on older copy) — the stop. Hit this and the call resolves as a loss.
- **Risk** — `LOW`, `NORMAL`, or `HIGH`. HIGH means the coin is more volatile / smaller / thinner, not "this one prints more". Small-caps are often HIGH even when the Verdict looks friendly.
- **Called time** — the publish timestamp. Every later percentage is measured from this plan, not from when you entered.

The planned reward-to-risk — (target − entry) / (entry − stop) — is roughly the same on every call, because the ladder is set at fixed ratios. That number is almost useless for choosing *between* two live calls. What differs is how far price has already travelled. That is why Compare uses **R:R from here**. Next lessons cover that.

## What "from call" means

On Terminal and on many charts you will see **% from call**. That is the move from the *entry of this call* to the current (or peak) price. It is not your P&L. You did not get the entry unless you actually filled there.

## Liquidity still matters

**MCap** is size. **Vol 24H** is whether you can actually trade it. A pretty ladder on a coin with no volume is a plan you may not be able to execute at the printed prices. Filter for healthy volume before you fall in love with a HIGH-risk small cap.

**Open it:** [Signals](/signals)
