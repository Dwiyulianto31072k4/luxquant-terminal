# Agent — Bitget & BingX (Cryptobot spec)

Live execution today is **Binance only**. Users have asked, in order:

1. **Bitget** (Canada / global futures users)
2. **BingX** (India — Binance is hard or blocked)

This spec is for the Cryptobot engine. LuxQuant already collects a waitlist
at `POST /api/v1/agent/exchange-waitlist` and shows Coming cards on `/agent`.

## Product rules (same as Binance)

- Spot and/or USDT-M futures, isolated default.
- Same strategy contract: sizing, TP/SL from signal levels, risk gates.
- Entitlement re-checked before every live entry.
- Telegram required for live.
- Dry-run first. LIVE requires the in-app risk acknowledgement.
- Do not take withdrawal permission. Reject keys that have it.
- One venue per user to start (do not dual-run Binance + Bitget on the same
  signal — that doubles size silently).

## Bitget (priority)

- Auth: API key + secret + **passphrase**.
- Docs: Mix (USDT-M) place order, set leverage, isolated margin, plan orders
  for TP/SL (or chase with reduce-only).
- Map LuxQuant pair `BTCUSDT` → Bitget `BTCUSDT` (mix). Confirm symbol
  book once; some alts differ.
- Permissions needed: read + trade futures (and spot if we enable it).
- Test on demo / paper if still offered; otherwise a dedicated sub-account.
- Rate limits: one shared executor IP — reuse the Binance throttle pattern.

## BingX (India)

- Auth: API key + secret (HMAC). Confirm whether a passphrase is required
  on the current key type.
- Swap (USDT-M perpetual) first; spot second.
- India users often cannot complete Binance KYC — this is the venue that
  unblocks them, not a nice-to-have.
- Watch: symbol suffixes and contract IDs are not always `BTC-USDT`.
- Same IP whitelist story as Binance — publish the Agent server IP in the
  connect modal.

## Out of scope for this slice

- MEXC, Bybit, OKX
- Telegram command that places a live order
- Copy-trading / leader accounts
- Hedge mode

## Suggested Cryptobot work

1. `exchange` enum gains `bitget`, `bingx`.
2. Adapter interface already implied by Binance spot/futures modules —
   implement `place_entry`, `place_protection`, `cancel`, `balances`,
   `validate_key`.
3. Strategy config stays per-user; add `exchange` on `strategy_configs`
   (today it is hard-coded `'binance'`).
4. LuxQuant UI already has the connect shell — swap in the extra fields
   (passphrase) when Cryptobot exposes `POST /me/exchange-accounts/{id}`.

## Success

A user on the waitlist can connect Bitget, start dry-run, then LIVE, and a
LuxQuant signal produces a Bitget order with the same risk gates as Binance.
Nothing about sizing or entitlement is forked per venue.
