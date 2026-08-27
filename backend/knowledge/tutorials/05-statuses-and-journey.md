---
slug: statuses-and-journey
track: read-a-call
order: 20
title: Statuses and the journey
excerpt: OPEN, TP1–TP4, WIN, LOSS — and why a call that tagged TP1 then stopped out is still a win on our books.
level: basic
minutes: 3
---

Status is the life of the call, not a mood.

- **OPEN** — live. No target and no stop has printed yet.
- **TP1 / TP2 / TP3** — that take-profit printed. The row can still run further, or later hit the stop.
- **WIN** (stored as `closed_win`) — **TP4 printed**. The badge "WIN" means the last target, not "any target".
- **LOSS** — the stop printed and no TP4 had printed. Status never goes backwards: a call that already won TP4 is not overwritten by a later stop.

A call is active for a **maximum of seven days**. Terminal views are scoped to that rolling window. After that the plan is history. Free accounts still only open the **fully won** ladder (the WIN / TP4 receipt). Age does not unlock a live plan.

## The journey rail

Open any row. The vertical **Signal Journey** is SL → Entry → TP1 → TP2 → TP3 → TP4. Each stage shows whether it printed, at what time, at what price, and the percent from entry. The connecting rail brightens as later stages are reached. This is the audit trail for *this* call.

The **History** tab is the same story as a log: every TP / SL update with time and price.

## The outcome rule you must learn once

When we resolve a call, we keep the **highest level reached**. Order is `tp4 > tp3 > tp2 > tp1 > sl`.

That means a call that tagged **TP1** and later printed the stop is recorded as **TP1 — a win in the win rate**. The row may still show **TP1**, not the WIN badge. WIN on the table is reserved for TP4.

So: a row can read TP1 and still count as a win in the headline number. The headline win rate is "how many calls reached at least the first target", not "how many rows say WIN", and not "how many positions members closed in profit".

If you only remember one sentence from this course, remember that one. The next module exists to make sure it sticks.

**Open it:** [Signals](/signals)
