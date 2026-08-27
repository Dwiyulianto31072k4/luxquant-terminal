---
slug: dry-run-then-live
track: automation
order: 20
title: Dry run, then live
excerpt: Connect a valid exchange key, configure the ladder and the caps, simulate, then — and only then — confirm LIVE.
level: intermediate
minutes: 4
---

Order of operations on [Agent](/agent). Skipping a step is how people get surprised.

1. **Connect Agent access** on the account.
2. **Connect an exchange** — Binance, BingX, Bitget, Bybit, OKX, or Gate. API key with trading permission, `key_status: valid`. No valid key, no live. One venue at a time.
3. **Settings** — TP / SL source, spot vs futures, which risk levels to allow, the safety caps.
4. **Dry Run** until the Activity tab looks like the bot you thought you configured.
5. **LIVE** — confirm that you own the size, the leverage, and the losses.

## Settings that actually change outcomes

- **TP source** — `signal_level` (the call's own TP1–TP4; pick the level) or `custom_pct`. **SL source** is the same idea. TP1–TP2 are the safe picks; TP4 fails on calls that did not publish four targets.
- **Futures** — off by default in spirit: leverage and isolated vs cross only apply when futures is on. Higher leverage magnifies both sides.
- **Allowed risk levels** — e.g. NORMAL only. A signal **with no risk level is never filtered out**. "Low only" does not guarantee nothing else trades.
- **One open position per symbol**, **Max open positions** (default 3), **Max daily trades** (default 5), **Max trade notional in USDT** (default 50, live floor 5), **Min available USDT** (default 5).

## Sizing, because this one generates tickets

**Amount is margin, not position size.** On futures, 5 USDT at 10× is a 50 USDT position.

The live floor is **5 USDT of margin** (Binance `MIN_NOTIONAL`). There is no 20 USDT minimum.

**Spot needs more than the floor.** The binding constraint is the protective stop leg: quantity × stop-limit price must also clear 5 USDT, and the stop sits below entry. Budget **10–15 USDT** per spot trade, and keep the per-trade cap **above** the amount or every signal skips.

Dry run sizes percent trades off a **fixed 1,000 USDT**, not your real balance. A 2% setting always simulates 20 USDT. Treat simulated size as illustrative.

Every field has a **?** on the Configure tab, and the in-page Guide lists them all.

**Open it:** [Agent](/agent)
