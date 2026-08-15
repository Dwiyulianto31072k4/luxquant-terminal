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
    what: "The bot follows every signal and records what it would have done, but sends nothing to your exchange.",
    example:
      "A signal arrives, you see a simulated entry in Activity, and your exchange balance does not move.",
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
    watch: `Anything below ${MIN_LIVE_ENTRY_USDT} USDT is raised to ${MIN_LIVE_ENTRY_USDT} — venues reject smaller live orders. On spot, budget 10–15 USDT: the protective stop leg has its own minimum (see Per trade cap).`,
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
    what: "Each exchange sets a maximum leverage per coin, often well below what you configured. This decides what the bot does when your setting does not fit.",
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
      "Set to 15: an order rejected by the exchange at 14:00 pauses new entries until 14:15.",
    watch:
      "Only genuine trade failures count. Exchange rate limits, IP bans and API-key errors are excluded on purpose, so one infrastructure hiccup does not freeze your bot for 15 minutes.",
  },
  is_active: {
    title: "Engine",
    what: "The master switch. Paused means signals are recorded but nothing is executed.",
    example:
      "Pausing does not touch open positions — their protective orders stay live on the exchange.",
    watch:
      "Pausing stops NEW entries only. To exit a position you still need to close it, on the Positions tab or on the exchange.",
  },
};

// Rules the engine enforces that are not settings — the reasons an entry
// can be blocked even when every field above is configured correctly.
export const ENGINE_RULES = [
  {
    title: "A stuck position pauses everything",
    body: "If a position cannot be matched against the exchange it is flagged for reconciliation, and that blocks every new entry — not just the one coin. It usually means the asset left your wallet outside the bot (a manual sell, convert or transfer, each of which cancels the protective order first). The reconciler now resolves this on its own once it confirms the balance is gone.",
  },
  {
    title: "Spot entries get resized to fit their protection",
    body: "On spot, the stop-loss leg is a separate order that must independently clear the venue's minimum — and it sits below your entry, so it is always the binding constraint. The engine automatically raises your entry up to 2× your configured amount to make that fit. If even 2× is not enough, or it exceeds your balance, the signal is skipped rather than opened without protection.",
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
    body: "Keys are validated when saved, and marked invalid automatically if the exchange rejects them later (wrong permissions, or an IP allow-list that is missing either 187.127.135.84 or the backup 103.197.189.58). Restrict the key to both IPs — Agent fails over if the primary is rate-limited. Reconnect the key to resume.",
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

const VENUE_LABEL = {
  binance: "Binance",
  bingx: "BingX",
  bitget: "Bitget",
  bybit: "Bybit",
  okx: "OKX",
  gate: "Gate",
};

/** Accept the API nest or the Configure draft so one template covers both. */
export function flattenStrategy(config = {}) {
  const risk = config.risk_limits || {};
  const futures = config.futures || {};
  const sizing = config.sizing || {};
  const tp = config.tp || {};
  const sl = config.sl || {};
  const exit = config.exit || {};
  const levels = Array.isArray(config.allowed_risk_levels)
    ? config.allowed_risk_levels.filter(Boolean)
    : [];
  return {
    exchange: config.exchange || "binance",
    is_active: Boolean(config.is_active),
    dry_run: config.dry_run !== false,
    spot_enabled: Boolean(config.spot_enabled),
    futures_enabled:
      config.futures_enabled === undefined ? !config.spot_enabled : Boolean(config.futures_enabled),
    sizing_method: sizing.method || config.sizing_method || "fixed",
    sizing_value: Number(sizing.value ?? config.sizing_value ?? 0),
    leverage: Math.max(1, Number(futures.leverage ?? config.leverage ?? 1)),
    margin_mode: futures.margin_mode || config.margin_mode || "isolated",
    leverage_fallback: futures.leverage_fallback || config.leverage_fallback || "clamp",
    exit_mode: exit.mode || config.exit_mode || "fixed_sl",
    trailing_callback_rate: Number(
      exit.trailing_callback_rate ?? config.trailing_callback_rate ?? 1
    ),
    tp_level: Math.max(1, Number(tp.level ?? config.tp_level ?? 1)),
    sl_level: Math.max(1, Number(sl.level ?? config.sl_level ?? 1)),
    allowed_risk_levels: levels,
    one_open_position_per_symbol:
      risk.one_open_position_per_symbol ?? config.one_open_position_per_symbol ?? true,
    max_open_positions: Math.max(
      1,
      Number(risk.max_open_positions ?? config.max_open_positions ?? 3)
    ),
    max_daily_trades: Math.max(
      1,
      Number(risk.max_daily_trades ?? config.max_daily_trades ?? 5)
    ),
    max_trade_notional_usdt: Number(
      risk.max_trade_notional_usdt ?? config.max_trade_notional_usdt ?? 0
    ),
    min_available_usdt: Number(risk.min_available_usdt ?? config.min_available_usdt ?? 0),
    daily_loss_limit_usdt: Number(
      risk.daily_loss_limit_usdt ?? config.daily_loss_limit_usdt ?? 0
    ),
    cooldown_after_loss_minutes: Number(
      risk.cooldown_after_loss_minutes ?? config.cooldown_after_loss_minutes ?? 0
    ),
    cooldown_after_error_minutes: Number(
      risk.cooldown_after_error_minutes ?? config.cooldown_after_error_minutes ?? 0
    ),
  };
}

function usd(n) {
  const x = Number(n) || 0;
  const abs = Math.abs(x);
  const body = abs >= 100 ? abs.toFixed(0) : abs.toFixed(2).replace(/\.00$/, "");
  return `${x < 0 ? "-" : ""}$${body}`;
}

function listLevels(levels) {
  if (!levels.length) return "every risk level";
  if (levels.length === 1) return `${levels[0]}-risk`;
  const last = levels[levels.length - 1];
  return `${levels.slice(0, -1).join(", ")} or ${last}-risk`;
}

/**
 * If-then copy for the rules this person actually saved.
 * Templates only — numbers come from their config, never invented prices.
 */
export function describeAppliedRules(config = {}) {
  const s = flattenStrategy(config);
  const venue = VENUE_LABEL[s.exchange] || s.exchange;
  const exit = describeExitPlan({
    exitMode: s.exit_mode,
    tpLevel: s.tp_level,
    slLevel: s.sl_level,
    callbackRate: s.trailing_callback_rate,
    spotEnabled: s.spot_enabled,
    futuresEnabled: s.futures_enabled,
  });
  const markets = [
    s.futures_enabled ? "futures" : null,
    s.spot_enabled ? "spot" : null,
  ].filter(Boolean);
  const marketPhrase = markets.length ? markets.join(" and ") : "no market";
  const margin =
    s.sizing_method === "percent"
      ? null
      : Math.max(MIN_LIVE_ENTRY_USDT, s.sizing_value);
  const notional = margin && s.futures_enabled ? margin * s.leverage : margin;
  const tenPct = notional ? notional * 0.1 : null;
  const cap = s.max_trade_notional_usdt;
  const capBlocks = margin && cap > 0 && cap + 1e-9 < margin;

  const scenarios = [];

  if (!s.is_active) {
    scenarios.push({
      id: "paused",
      if: "A matching signal arrives while Agent is paused",
      then: "It is recorded only. No new order is sent. Open positions keep the protection already on the exchange.",
      tone: "warn",
    });
  } else if (s.dry_run) {
    scenarios.push({
      id: "dry",
      if: `A ${listLevels(s.allowed_risk_levels)} ${marketPhrase} signal arrives`,
      then: `Agent logs what it would have done on ${venue}. Nothing is sent to the exchange.`,
    });
  } else {
    scenarios.push({
      id: "live",
      if: `A ${listLevels(s.allowed_risk_levels)} ${marketPhrase} signal arrives on ${venue}`,
      then: capBlocks
        ? `Every entry is skipped — the per-trade cap (${usd(cap)}) is below the ${usd(margin)} amount.`
        : s.sizing_method === "percent"
          ? `Agent uses ${s.sizing_value}% of free USDT as margin${
              s.futures_enabled ? ` at ${s.leverage}× ${s.margin_mode}` : ""
            }, then places a market order if every risk gate passes.`
          : `Agent uses ${usd(margin)} of margin${
              s.futures_enabled
                ? ` at ${s.leverage}× ${s.margin_mode} — about ${usd(notional)} on the book. A 10% coin move is ${usd(tenPct)}.`
                : ` to buy about ${usd(margin)} of the coin.`
            }`,
      tone: capBlocks ? "warn" : undefined,
    });
  }

  if (s.spot_enabled && !s.futures_enabled) {
    scenarios.push({
      id: "shorts",
      if: "A short signal arrives",
      then: "It is skipped. Spot can only go long.",
    });
  }

  scenarios.push({
    id: "fill",
    if: "The entry fills",
    then: exit.trailing
      ? `${venue} gets a hard stop at ${exit.sl} and a ${exit.callback}% trailing close. ${exit.tp} is not placed as an order.`
      : `${venue} gets a take-profit at ${exit.tp} and a hard stop at ${exit.sl}.`,
  });

  scenarios.push({
    id: "signal-tp",
    if: `LuxQuant marks ${exit.tp} hit`,
    then: exit.ifSignalTp,
    tone: exit.trailing ? "warn" : undefined,
  });

  if (exit.tight) {
    scenarios.push({
      id: "tight-trail",
      if: `Price only moves a little after the fill`,
      then: exit.tight,
      tone: "warn",
    });
  }

  if (exit.spotNote) {
    scenarios.push({
      id: "spot-trail",
      if: "The fill is on spot",
      then: exit.spotNote,
    });
  }

  if (s.one_open_position_per_symbol) {
    scenarios.push({
      id: "same-coin",
      if: "You already hold this coin",
      then: "The new signal is skipped. One open position per symbol.",
    });
  }

  scenarios.push({
    id: "max-open",
    if: `You already have ${s.max_open_positions} positions open`,
    then: "New entries wait until one closes.",
  });

  scenarios.push({
    id: "max-daily",
    if: `${s.max_daily_trades} entries have already filled today`,
    then: "Further signals are skipped until 00:00 UTC.",
  });

  if (s.daily_loss_limit_usdt > 0) {
    scenarios.push({
      id: "daily-loss",
      if: `Realised losses today reach ${usd(s.daily_loss_limit_usdt)}`,
      then: "New entries pause until 00:00 UTC. Open positions keep their stops.",
      tone: "warn",
    });
  }

  if (s.min_available_usdt > 0) {
    scenarios.push({
      id: "reserve",
      if: `The entry would leave less than ${usd(s.min_available_usdt)} free USDT`,
      then: "It is skipped so the reserve stays intact.",
    });
  }

  if (s.cooldown_after_loss_minutes > 0) {
    scenarios.push({
      id: "loss-cd",
      if: "A trade closes at a loss",
      then: `The next entry waits ${s.cooldown_after_loss_minutes} minute${
        s.cooldown_after_loss_minutes === 1 ? "" : "s"
      }.`,
    });
  }

  if (s.cooldown_after_error_minutes > 0) {
    scenarios.push({
      id: "error-cd",
      if: "An order fails",
      then: `The next entry waits ${s.cooldown_after_error_minutes} minute${
        s.cooldown_after_error_minutes === 1 ? "" : "s"
      }.`,
    });
  }

  const headline = s.dry_run
    ? "With these rules Agent only simulates"
    : exit.trailing
      ? `With these rules ${exit.tp} on the signal will not close the ${venue} position`
      : `With these rules a fill closes at ${exit.tp} or ${exit.sl} on ${venue}`;

  return { headline, venue, exit, scenarios, strategy: s };
}
