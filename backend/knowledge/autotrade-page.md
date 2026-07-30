# Guide: AutoTrade

AutoTrade is LuxQuant's automated trading engine. When enabled, it can place **real
orders on your connected Binance account** based on LuxQuant signals and your saved
strategy. This guide explains setup, the tabs, and every setting.

> Important: AutoTrade places REAL orders with REAL funds when live. Always understand
> a setting before enabling it. LuxQuant provides the tooling; trading decisions and
> risk settings are yours.

## Getting started (setup steps)

1. **Connect AutoTrade access** — enable the feature on your account.
2. **Connect Binance** — add a Binance API key. AutoTrade needs a **valid** key
   (`key_status: valid`) with trading permission. It will not go live without one.
3. **Configure your strategy** in the Settings tab (TP/SL, risk limits, etc.).
4. **Activate** the engine. You can start in **Dry Run** first (simulation, no real
   orders) before going fully live.

## Engine states

- **BOT PAUSED** — AutoTrade is not processing new entries.
- **LIVE** — AutoTrade can place real Binance orders; your risk limits and saved
  strategy are enforced before every entry.
- **LIVE ENGINE LOCKED** — live trading is temporarily locked (e.g. a safety/guard
  condition); new live entries are blocked until resolved.
- **Dry Run** — a simulation mode: the engine follows signals but does not place real
  orders, so you can test your settings safely.

## Tabs

- **Overview** — a summary of the engine status, your active strategy, and current
  activity at a glance.
- **Positions** — positions the bot currently has open.
- **Trade History** — past trades the bot has executed.
- **Activity** — the engine's event log (entries, exits, skips, errors).
- **Signals** — the signals the bot is watching / acting on based on your filters.
- **Settings** — where you configure the strategy and risk limits (below).

## Settings — Take Profit & Stop Loss

- **TP source** — where the take-profit comes from:
  - `signal_level` — use the signal's own TP levels (TP1–TP4). Pick which with
    **TP level**.
  - `custom_pct` — use your own fixed take-profit percentage.
- **SL source** — the stop loss, same idea: `signal_level` (the signal's SL) or a
  custom percentage.
- **Exit mode** — how positions are closed (e.g. a fixed stop loss).

## Settings — Spot vs Futures

- **Futures enabled** — trade on Binance Futures instead of Spot.
- **Leverage** — the multiplier used on futures (only when futures is enabled).
  Higher leverage magnifies both gains and losses.
- **Margin mode** — `isolated` (risk limited to the position's margin) or `cross`
  (shared account margin).

## Settings — which signals to trade

- **Allowed risk levels** — restrict the bot to certain signal risk levels
  (e.g. only `NORMAL`, or include `HIGH`). This controls which signals it acts on.

## Settings — Risk limits (safety guards)

These caps are enforced before every live entry:

- **One open position per symbol** — prevents stacking multiple positions on the same
  coin.
- **Max open positions** — the most positions the bot may hold at once (default 3).
- **Max daily trades** — the most trades the bot may open per day (default 5).
- **Max trade notional (USDT)** — the largest margin per trade in USDT (default 50) —
  effectively your per-trade position cap. Live configs must keep it at 5 USDT or
  above; anything lower makes every signal skip as `max_trade_notional`.
- **Min available (USDT)** — the minimum free balance required before opening a trade
  (default 5); below this the bot won't enter.

## Minimum trade size

- **Amount is margin, not position size.** On futures, leverage multiplies it: 5 USDT
  at 10× opens a 50 USDT position.
- **The live floor is 5 USDT of margin**, which is Binance's own `MIN_NOTIONAL`. There
  is no 20 USDT minimum — that number was ours by mistake and has been removed.
- **Spot needs more than the floor.** The binding constraint on spot is the protective
  stop leg, not the entry: quantity × stop-limit price must also clear 5 USDT, and the
  stop sits below the entry. An entry right at 5 USDT therefore fails as soon as the
  stop is more than a few percent away. Budget 10–15 USDT per spot trade.
- **Keep the per-trade cap above the amount.** A cap below the entry size skips every
  signal as `max_trade_notional`.

## When entries are blocked

Two different things look similar in the Activity tab:

- A **per-signal skip** held one entry back (max open positions, daily trades, cooldown,
  trade notional). Others may still go through.
- A **gate** pauses every new entry until it clears: `reconciliation_required`,
  `daily_loss_limit`, `max_live_bots`.

`reconciliation_required` is the one users hit most. It means a position could not be
matched against Binance — almost always because the coin left the spot wallet outside
the bot (manual sell, convert or transfer on Binance directly, each of which cancels
the protective OCO first). The reconciler detects this automatically: once it confirms
the balance is genuinely gone, it closes the position and the gate lifts.

If **force-sell** fails with *No free balance is available after cancelling protection*,
that is the same situation — there is nothing left to sell. Repeating it will not help,
and a failed force-sell records no exit, so it cannot clear the position either. Wait
for the reconciler.

Clearing the gate does not by itself resume trading: spot entries also need free USDT
in the wallet. Coins already held do not count.

## Common questions

- **Why isn't it trading?** — Check: engine not paused, Binance key valid, the signal
  passes your allowed risk levels, free USDT available, and you haven't hit max open
  positions / max daily trades / min-balance limits or a blocking gate (see above).
- **How do I test safely?** — Use **Dry Run** to simulate before going live.
- **How do I limit risk?** — Lower **Max trade notional**, cap **Max open positions**
  and **Max daily trades**, keep leverage low (or use Spot), and restrict **Allowed
  risk levels** to NORMAL.

## Important note

AutoTrade executes real orders when live. LuxQuant does not tell you what leverage,
size, or coins to trade — those are your decisions. Configure conservatively and
understand each setting first.
