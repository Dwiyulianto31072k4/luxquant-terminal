// src/components/autotrade/autotradeFieldGuide.js
// ════════════════════════════════════════════════════════════════
// LuxQuant — Agent · one explanation per setting, in one place.
//
// Rendered twice: inline on the Configure tab (the "?" next to each
// field) and as the long-form reference in the help modal. Keeping a
// single source means the two can never drift apart.
//
// Every `example` is a worked case with real numbers, and every
// `watch` describes behaviour that is real but invisible in the UI —
// checked against cryptobot's app/domains/strategies/service.py,
// app/domains/execution/{service,risk}.py and app/exchanges/binance_spot.py.
// If you change the engine, change these.
// ════════════════════════════════════════════════════════════════

export const MIN_LIVE_ENTRY_USDT = 5;

export const FIELD_GUIDE = {
  // ── Markets ──────────────────────────────────────────────────
  spot_enabled: {
    title: "Spot trading",
    what: "Buys the actual coin with your USDT. No leverage, no liquidation — the worst case is the coin going to zero.",
    example:
      "12 USDT entry on a coin at 0.50 buys 24 coins. If it doubles you hold 24 USDT of coin; if it halves you hold 6. You own the coin either way.",
    watch:
      "Spot can only go long. Short signals are skipped on spot — they need futures.",
  },
  futures_enabled: {
    title: "Futures trading",
    what: "Trades a leveraged contract instead of the coin. Lets you take short signals, and multiplies both gains and losses.",
    example:
      "12 USDT of margin at 10× opens a 120 USDT position. A 5% move is ±6 USDT — half your margin — not ±0.6.",
    watch:
      "Liquidation is real here. At 10× isolated, roughly a 10% move against you wipes the margin before your stop loss is ever reached.",
  },
  dry_run: {
    title: "Dry run (simulation)",
    what: "The bot follows every signal and records what it would have done, but sends nothing to Binance.",
    example:
      "A signal arrives, you see a simulated entry in Activity, and your Binance balance does not move.",
    watch:
      "Dry run sizes percent-based trades off a fixed 1,000 USDT, not your real balance. A 2% setting always simulates 20 USDT no matter what you actually hold, so treat simulated position sizes as illustrative.",
  },

  // ── Position sizing ──────────────────────────────────────────
  sizing_method: {
    title: "Sizing method",
    what: "Fixed USDT uses the same amount every trade. Percent of balance scales with your free USDT, so trades shrink after losses and grow after wins.",
    example:
      "With 400 USDT free: Fixed 20 always trades 20. Percent 5% trades 20 now, then 19 after a 20 USDT loss.",
    watch:
      "Percent is measured against free USDT only. Money already tied up in open positions does not count toward it.",
  },
  sizing_value: {
    title: "Amount",
    what: "How much capital each entry uses. This is margin, not position size — on futures, leverage multiplies it.",
    example:
      "Fixed 12 USDT at 10× leverage opens a 120 USDT position. On spot the same 12 USDT buys 12 USDT of coin.",
    watch: `Anything below ${MIN_LIVE_ENTRY_USDT} USDT is raised to ${MIN_LIVE_ENTRY_USDT} — Binance rejects smaller orders. On spot, budget 10–15 USDT: the protective stop leg has its own minimum (see Per trade cap).`,
  },
  leverage: {
    title: "Leverage",
    what: "Multiplies your margin into position size on futures. It does not change how much you put in — it changes how fast that amount moves.",
    example:
      "12 USDT at 3× is a 36 USDT position: a 10% coin move is ±3.6 USDT. The same 12 USDT at 20× is 240 USDT: that same 10% move is ±24 USDT, more than your margin.",
    watch:
      "Rough rule: at N× leverage, a 100/N percent move against you liquidates the position. At 20× that is about 5% — closer than most stop losses.",
  },
  leverage_fallback: {
    title: "If a coin caps leverage",
    what: "Binance sets a maximum leverage per coin, often well below what you configured. This decides what the bot does when your setting does not fit.",
    example:
      "You run 25x and a signal arrives on a coin capped at 10x. Trade at the coin's maximum: 12 USDT still, but the position is 120 instead of 300. Keep position size: margin rises to 30 USDT to reach the same 300. Skip: no trade.",
    watch:
      "Measured across the coins traded here: at 10x nothing is capped, at 25x about 1 coin in 6, at 50x nearly a third. Keeping position size is safer per trade — the same exposure at lower leverage sits further from liquidation — but it commits more of your balance, so your per-trade cap and minimum reserve still apply and can block it.",
  },
  margin_mode: {
    title: "Margin mode",
    what: "Isolated risks only the margin assigned to that one position. Cross lets a losing position draw on your whole futures balance to stay alive.",
    example:
      "A trade going badly with 12 USDT isolated can lose at most 12. The same trade on cross can keep pulling from your balance until the account is at risk.",
    watch:
      "Isolated is the safer default and the one to keep while you are learning. Cross avoids some liquidations but turns one bad trade into an account-level problem.",
  },

  // ── Take profit / stop loss ──────────────────────────────────
  tp_level: {
    title: "Take profit target",
    what: "Which take-profit price from the signal to aim at. TP1 is nearest the entry, TP4 is furthest. Whether that price is actually sent to the exchange depends on Exit mode.",
    example:
      "A signal with TP1 1.05, TP2 1.12, TP3 1.20: choosing TP1 exits often for small wins; TP3 wins bigger but far more trades come back to the stop first.",
    watch:
      "If a signal does not contain the level you picked, that execution FAILS rather than skipping. Choose TP4 and every signal that only publishes three targets errors out. TP1–TP2 are the safe choices. In Trailing stop mode this level is the planned target in Agent — it is not placed as a live take-profit order.",
  },
  sl_level: {
    title: "Stop loss level",
    what: "Which stop-loss price from the signal to use. SL1 is tighter, SL2 gives the trade more room. A hard stop at this price is always placed — including when Exit mode is Trailing stop.",
    example:
      "Entry 1.00 with SL1 0.95 and SL2 0.90: SL1 caps the loss at 5% but gets hit by ordinary noise; SL2 risks 10% for a better chance of surviving the dip.",
    watch:
      "Same rule as TP: if the signal has no SL2 and you selected it, the execution fails. A wider stop also needs a larger spot entry (the stop leg has its own minimum order value).",
  },
  exit_mode: {
    title: "Exit mode",
    what: "Fixed SL places a take-profit and a hard stop and leaves both. Trailing stop places a hard stop at your SL level plus a trailing close that follows price — it does not place a take-profit. Trailing is not “after TP is hit”; it is live from the fill.",
    example:
      "DOT long 0.7744, signal TP1 0.7778 (+0.4%), SL1 0.7645, trailing 1%. Fixed SL would close at 0.7778. Trailing leaves the position open when LuxQuant marks TP1 — the exchange only exits at 0.7645 or after a 1% pullback from the high.",
    watch:
      "Trailing is FUTURES ONLY. Spot silently uses Fixed SL. Your exchange often labels the hard stop as “TP/SL” even though it is not a take-profit — that is why Trailing can look like two stop-losses. There is no trailing-only option: the hard SL stays as a floor.",
    scenarios: [
      {
        title: "Two close orders on the exchange",
        body: "Expected on Trailing. One is STOP (your SL). One is TRAILING. BingX / Binance often name the stop “Close Long TP/SL”. That label is theirs, not a second take-profit from us.",
      },
      {
        title: "LuxQuant says TP1, the position is still open",
        body: "Expected on Trailing. TP1 is the signal status. No take-profit order sits on the exchange, so the poster hitting TP1 does not reduce or close the position.",
      },
      {
        title: "Position panel shows TP/SL as empty",
        body: "We place standalone close orders, not TP/SL attached to the position row. Check Current / Open orders — the stop and the trail live there.",
      },
      {
        title: "Price reaches TP then comes back",
        body: "Fixed SL would already be flat. Trailing stays in until the callback pullback or the hard SL. A TP1 only 0.4% above entry can never be “locked” by a 1% trail.",
      },
      {
        title: "A 1% dip right after entry",
        body: "Trailing 1% can close before the hard SL if the SL is further away. That looks like a tiny loss plus fees — it is the trail, not a broken SL.",
      },
      {
        title: "A strong run past TP",
        body: "Trailing can exit above your TP level and keep more of the move. Fixed SL would have been flat at the target.",
      },
      {
        title: "Trailing is rejected by the venue",
        body: "The engine falls back to Fixed SL for that fill (TP + hard stop). One trade can therefore show a take-profit order even if the strategy says Trailing.",
      },
      {
        title: "Spot-only account",
        body: "Trailing is ignored. The fill is protected with a normal TP + SL pair and Activity will not warn that the choice was downgraded.",
      },
    ],
  },
  trailing_callback_rate: {
    title: "Trailing callback",
    what: "How far price must fall back from its high (longs) or bounce from its low (shorts) before the trailing order exits. The trail arms at the fill — it does not wait for TP.",
    example:
      "2.5% on a run to 1.30 exits near 1.27. A 1% callback exits near 1.29 — more of the peak kept, but ordinary wobble ends the trade. On a 0.4% TP1 the 1% trail sits below entry, so it cannot lock that target.",
    watch:
      "Venues accept roughly 0.1% to 10%. 0.5–1% is tight for crypto noise and will often close before your hard SL. 2–3% is the usual swing range. Compare the callback to the distance from entry to TP1: if the callback is larger than that distance, Trailing cannot harvest TP1.",
  },

  // ── Risk filter ──────────────────────────────────────────────
  allowed_risk_levels: {
    title: "Risk filter",
    what: "Only trade signals whose risk level is in this list. Selecting nothing trades every level.",
    example:
      "Select only Low and a High-risk signal is skipped before any order is built — it never touches your balance or your daily quota.",
    watch:
      "A signal that arrives with NO risk level is never filtered out — the bot will not block on information the source did not provide. So 'Low only' is not a guarantee that nothing else trades.",
  },

  // ── Risk limits ──────────────────────────────────────────────
  one_open_position_per_symbol: {
    title: "One position per symbol",
    what: "Stops the bot opening a second position on a coin it already holds.",
    example:
      "You hold BTC and a second BTC signal arrives: it is skipped instead of doubling your exposure to one asset.",
    watch:
      "Positions waiting on reconciliation still count as held. Turn this off only if you deliberately want to stack entries on the same coin.",
  },
  max_open_positions: {
    title: "Open positions",
    what: "The most positions the bot may hold at once, across spot and futures together.",
    example:
      "Set to 3, holding 3: every new signal is skipped until one closes. With 400 USDT that keeps roughly 130 USDT per position.",
    watch:
      "Positions stuck in reconciliation occupy a slot too, so a single unresolved position permanently shrinks your limit until it clears.",
  },
  max_trade_notional_usdt: {
    title: "Per trade cap",
    what: "A hard ceiling on the margin any single entry may use — the backstop if a percent setting or a large balance produces an unexpectedly big trade.",
    example:
      "Percent sizing 5% on 1,000 USDT wants 50. A 30 USDT cap blocks that entry rather than trimming it to 30.",
    watch:
      "The cap BLOCKS, it does not shrink. Set it below your Amount and every single signal skips as max_trade_notional. Always keep the cap above the amount you actually trade.",
  },
  max_daily_trades: {
    title: "Trades per day",
    what: "How many entries the bot may open per day. Resets at 00:00 UTC.",
    example:
      "Set to 5 and the sixth signal of the day is skipped, even if everything else passes.",
    watch:
      "Only opened trades count. Signals skipped by any other rule do not consume the quota.",
  },
  daily_loss_limit_usdt: {
    title: "Loss limit",
    what: "Total realised loss for the day that pauses all new entries until 00:00 UTC.",
    example:
      "Set to 20: after closing trades at -12 and -9 USDT the day's total is -21, and everything pauses.",
    watch:
      "This is a blocking gate, not a per-signal skip. Open positions keep their TP/SL — the pause only stops NEW entries. Counts realised (closed) losses only; an open position 30 USDT down does not trigger it.",
  },
  min_available_usdt: {
    title: "Minimum reserve",
    what: "Free USDT that must still remain after an entry is placed. Keeps a buffer for fees, funding, and margin top-ups.",
    example:
      "Balance 50, reserve 20, entry 12: allowed, 38 remains. If the entry were 35 it would be blocked, since only 15 would be left.",
    watch:
      "On futures this buffer is what absorbs funding fees and gives a position room before liquidation. Setting it to 0 means one bad trade can leave nothing to defend the rest.",
  },
  cooldown_after_loss_minutes: {
    title: "After loss",
    what: "How long to wait after a losing trade before taking another entry.",
    example:
      "Set to 60: a stop-out at 14:00 means the next signal before 15:00 is skipped.",
    watch:
      "This exists to stop the bot chasing a bad market down. Set it to 0 and a sharp sell-off can fill every position slot in minutes.",
  },
  cooldown_after_error_minutes: {
    title: "After error",
    what: "How long to wait after a failed execution before trying another entry.",
    example:
      "Set to 15: an order rejected by Binance at 14:00 pauses new entries until 14:15.",
    watch:
      "Only genuine trade failures count. Exchange rate limits, IP bans and API-key errors are excluded on purpose, so one infrastructure hiccup does not freeze your bot for 15 minutes.",
  },
  is_active: {
    title: "Engine",
    what: "The master switch. Paused means signals are recorded but nothing is executed.",
    example:
      "Pausing does not touch open positions — their take-profit and stop-loss stay live on Binance.",
    watch:
      "Pausing stops NEW entries only. To exit a position you still need to close it, on the Positions tab or on Binance.",
  },
};

// Rules the engine enforces that are not settings — the reasons an entry
// can be blocked even when every field above is configured correctly.
export const ENGINE_RULES = [
  {
    title: "A stuck position pauses everything",
    body: "If a position cannot be matched against Binance it is flagged for reconciliation, and that blocks every new entry — not just the one coin. It usually means the asset left your wallet outside the bot (a manual sell, convert or transfer, each of which cancels the protective order first). The reconciler now resolves this on its own once it confirms the balance is gone.",
  },
  {
    title: "Spot entries get resized to fit their protection",
    body: "On spot, the stop-loss leg is a separate order that must independently clear Binance's 5 USDT minimum — and it sits below your entry, so it is always the binding constraint. The engine automatically raises your entry up to 2× your configured amount to make that fit. If even 2× is not enough, or it exceeds your balance, the signal is skipped rather than opened without protection.",
  },
  {
    title: "Live entries need free USDT",
    body: "The bot buys with USDT. Coins you already hold do not count, so a wallet full of tokens and no USDT cannot open anything — which looks exactly like the bot being broken.",
  },
  {
    title: "Your subscription is re-checked per trade",
    body: "Entitlement is verified before each live entry, not just at login. If a subscription lapses, new entries pause — open positions keep their take-profit and stop-loss.",
  },
  {
    title: "A LuxQuant TP does not close a Trailing position",
    body: "Signal status (TP1–TP4) is the desk’s view of price versus the published targets. In Trailing stop mode Agent never places that target as an exchange order, so the position stays open until the hard SL or the trailing pullback fills. Switch to Fixed SL if you want the chosen TP to actually take profit on the venue.",
  },
  {
    title: "An invalid API key stops execution",
    body: "Keys are validated when saved, and marked invalid automatically if Binance rejects them later (wrong permissions, or an IP allow-list that is missing either 187.127.135.84 or the backup 103.197.189.58). Restrict the key to both IPs — Agent fails over if the primary is rate-limited. Reconnect the key to resume.",
  },
  {
    title: "Rate limits are shared",
    body: "All accounts trade through one server IP, so a per-account throttle protects everyone. It clears within a minute on its own.",
  },
];

/** Live preview for the Configure tab — same rules the engine uses. */
export function describeExitPlan({
  exitMode = "fixed_sl",
  tpLevel = 1,
  slLevel = 1,
  callbackRate = 1,
  spotEnabled = false,
  futuresEnabled = true,
} = {}) {
  const trailingWanted = exitMode === "trailing_stop";
  const spotOnly = spotEnabled && !futuresEnabled;
  const trailing = trailingWanted && !spotOnly;
  const callback = Math.max(0.1, Number(callbackRate) || 1);
  const tp = `TP${tpLevel || 1}`;
  const sl = `SL${slLevel || 1}`;
  return {
    trailing,
    trailingWanted,
    spotOnly,
    callback,
    tp,
    sl,
    title: trailing ? "Trailing stop — what the exchange actually gets" : "Fixed SL — what the exchange actually gets",
    placed: trailing
      ? [
          `Hard stop at ${sl} — always placed`,
          `Trailing close at ${callback}% from the high — live from the fill`,
          `${tp} is not placed as an order`,
        ]
      : [`Take-profit at ${tp}`, `Hard stop at ${sl}`],
    youSee: trailing
      ? "Two close orders. The one labelled “TP/SL” on BingX or Binance is the hard stop, not a take-profit. Position-row TP/SL is often blank — the orders sit under Current / Open orders."
      : "One take-profit and one stop. When LuxQuant marks the chosen TP, the exchange order should already be filling.",
    ifSignalTp: trailing
      ? `When LuxQuant marks ${tp} hit, this position stays open. Only ${sl} or a ${callback}% pullback from the high will close it.`
      : `When price reaches ${tp}, the take-profit order on the exchange closes the position.`,
    tight:
      trailing && callback <= 1.2
        ? `${callback}% is tighter than most signal TP1 distances. Ordinary noise can close the trade before ${sl}, and the trail cannot lock a target smaller than ${callback}%.`
        : null,
    spotNote: trailingWanted && spotOnly
      ? "Trailing is futures-only. With only spot enabled, this fill uses Fixed SL instead."
      : trailingWanted && spotEnabled
        ? "Spot fills still use Fixed SL. Only futures fills trail."
        : null,
  };
}
