---
slug: terminal
track: tools
order: 20
title: Terminal — screen, time, size
excerpt: Terminal never creates a call. It is a cockpit over the 7-day active set, with live market data joined to each plan.
level: intermediate
minutes: 5
---

[Terminal](/terminal) is Premium. It does **not** generate signals. Every view is the current 7-day active calls, joined to live price, derivatives, order flow, and klines, so you can pressure-test a plan that already exists.

To actually trade, you use your own exchange or the [Agent](/agent). Terminal is read-only.

## How to read any view here

- Hover a coin logo → status and "called X hours ago".
- Click a coin → a detail sheet, **vs Call VWAP**, and **Open full signal**.
- Status rings on scatter dots: OPEN / TP / SL, readable without opening anything.
- Pan, scroll-zoom, double-click to reset. Date window filter isolates a day inside the 7-day span (the session BTC dumped, for example).
- Green = buy-side / positive, red = sell-side / negative, gold = LuxQuant reference.
- **"Warming up"** means a worker has not filled that panel since restart. Wait a sweep; the data is not missing.

## Start at Confluence, not at the noisiest chart

**Confluence** ranks the highest-conviction calls: HTF strength, 4H / 1H / 15m alignment, entry tags, warnings, % from call. Chips: HTF strong, fully aligned, fresh (still near entry), golden setup, volume spike, no-warning.

**Coiled** is the honest sweet spot: quality setup, price still near entry, best remaining risk/reward. A call that is already extended has spent the easy R:R — that is what "room left" is telling you. The badge is *typical peak after a call, minus how far price has already run*. Green means there is still typical room. It is a historical habit, not a promise the rest of the move will print.

Then use RSI / vol squeeze / ATR to think about *when*, and the Risk Calculator to think about *how much*. Do not skip from a pretty heatmap to a market order.

Sidebar groups: **SIGNALS · DERIVATIVES · MARKET · SCREENERS · EDGE · MARKET MAP**. You do not need all of them. Confluence + one timing view + the calculator is a complete session.

**Open it:** [Terminal](/terminal)
