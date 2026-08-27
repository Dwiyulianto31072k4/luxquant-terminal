---
slug: what-the-agent-does
track: automation
order: 10
title: What the Agent does — and does not
excerpt: The Agent places real orders on your exchange account, using LuxQuant calls and your risk settings. It does not guarantee profit, and it does not trade until you say live.
level: basic
minutes: 4
---

The **Agent** (the [Agent](/agent) page, historically also called AutoTrade) is optional execution. The terminal and the signals work without it.

When it is **LIVE**, it can place **real orders with real funds** on the exchange key you connected, following the strategy you saved. LuxQuant does not hold the money. You do.

## The contract, in one screen

Before a key will connect, you sign an acknowledgement: you own the size, the leverage, and any losses. Unsigned keys are disconnected. That is not theatre — no key is stored until it is signed.

Live desks: **Binance, BingX, Bitget, Bybit, OKX, Gate** — spot and USDT-M. **One venue at a time**; connecting another pauses the current one. Funds never leave that exchange. Withdraw permission is never requested.

A skip is not a bug. A fill is not a gift.

## What it will not do

- It will not invent calls. It only acts on LuxQuant signals that pass **your** filters.
- It will not resize a trade down to fit a cap. A cap below the entry size **skips** the signal (`max_trade_notional`). It does not shrink it.
- It will not silently protect a spot position with a futures-only trailing stop. Pick trailing on spot and it uses a fixed stop instead, with no error toast.
- It will not guarantee that TP4 exists on every call. Pick TP4 as the exit and every signal that only published three targets **errors**, it does not skip.
- It will not make you diversified. Five Agent fills on high-ρ alts is still one BTC bet.

## Engine states

- **BOT PAUSED** — not taking new entries.
- **Dry Run** — follows signals, **no real orders**. Start here.
- **LIVE** — real orders on the connected venue; your limits are checked before every entry.
- **LIVE ENGINE LOCKED** — a safety gate is up; new live entries are blocked until it clears.

Tabs: Overview, Positions, Trade History, Activity (the log of entries, exits, skips, errors), Signals, Settings.

If you never want this, skip the rest of the module. The product is complete without it.

**Open it:** [Agent](/agent)
