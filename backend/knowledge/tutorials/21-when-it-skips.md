---
slug: when-it-skips
track: automation
order: 30
title: When it skips or stops
excerpt: A skip is one signal. A gate is the whole engine. The Activity tab tells you which, if you read the code and not just the silence.
level: intermediate
minutes: 4
---

"Why isn't it trading?" is almost always one of: paused, invalid key, signal failed your risk filter, no free USDT, a cap, or a gate. The [Agent](/agent) **Activity** tab names the reason. Silence in your head is not a reason.

## Skip vs gate

- A **skip** held **one** entry back — max open positions, daily trades, cooldown, `max_trade_notional`. Other signals may still fire.
- A **gate** pauses **every** new entry until it clears: `reconciliation_required`, `daily_loss_limit`, `max_live_bots`.

## `reconciliation_required` — the one people hit

The bot could not match a position against the exchange. Almost always the coin left the spot wallet **outside** the bot: a manual sell, a convert, or a transfer on the exchange, each of which cancels the protective order first. The reconciler notices the balance is gone, closes the position, and the gate lifts. This is the story people hit most on Binance spot.

If **force-sell** fails with *No free balance is available after cancelling protection*, there is nothing left to sell. Repeating it will not help, and a failed force-sell records no exit, so it cannot clear the position either. Wait for the reconciler.

Clearing the gate does not resume trading by itself. Spot entries still need **free USDT**. Coins already held do not count. Percent sizing also counts free USDT only.

## Other surprises, so they happen once

- Trailing stop is **futures-only**. On spot it silently becomes a fixed stop.
- Picking a TP/SL level the signal does not have **fails** the execution, it does not skip.
- Spot entries may be **auto-enlarged up to 2×** so the protective stop clears Binance's minimum, and skipped if even 2× is not enough — better skipped than unprotected.
- The per-trade cap **blocks, it does not shrink**.

When in doubt: Dry Run, then one small live fill, then look at Activity before you raise the cap.

**Open it:** [Agent](/agent)
