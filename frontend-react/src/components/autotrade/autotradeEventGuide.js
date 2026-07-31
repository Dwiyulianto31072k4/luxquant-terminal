// src/components/autotrade/autotradeEventGuide.js
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade · one explanation per *event*, in one place.
//
// The sibling of autotradeFieldGuide.js, which explains settings. This
// explains things that happen to you: why an entry was skipped, why the
// bot is locked, why a position closed the way it did.
//
// Every entry answers the same three questions, because "your entry was
// skipped: max_open_positions" answers none of them:
//   what  — what actually happened, in one sentence
//   why   — the reason it happened, including the part the UI cannot show
//   fix   — what to do about it, or plainly that there is nothing to do
//
// `blocking: true` means every new live entry stops until it is resolved,
// as opposed to one signal being held back.
//
// Checked against cryptobot: app/domains/execution/{risk,service}.py,
// app/domains/portfolio/reconciliation.py and app/domains/monitoring/*.
// If you change the engine, change these.
// ════════════════════════════════════════════════════════════════

// ── Risk gates ───────────────────────────────────────────────────
// Codes from evaluate_live_entry_risk. Sent as execution.skip_risk_limit.<code>
export const RISK_EVENTS = {
  telegram_not_connected: {
    title: "Telegram is not connected",
    blocking: true,
    what: "Live entries are stopped because this account has no Telegram connected.",
    why: "Every warning AutoTrade can give you arrives by Telegram — a position that lost its stop-loss, an exchange key that stopped working, a trade closing. Without it there is no way to reach you when something goes wrong with real money, so live trading is not allowed.",
    fix: "Connect Telegram from the alerts card, then live entries resume on the next signal. Dry-run keeps working meanwhile, and any position you already hold is still being managed and watched.",
  },
  reconciliation_required: {
    title: "A position needs reconciliation",
    blocking: true,
    what: "One of your positions could not be matched against Binance, so every new entry is paused until it clears.",
    why: "Usually the coin left your spot wallet outside the bot — a manual sell, a convert, or a transfer. All of those cancel the protective OCO first, which leaves the position unguarded and its real state unknown.",
    fix: "The reconciler closes these on its own once it confirms the balance is gone. If it persists for more than a few cycles, contact support.",
  },
  subscription_inactive: {
    title: "LuxQuant subscription is not active",
    blocking: true,
    what: "Live entries are paused until the subscription is renewed.",
    why: "Live trading is a paid feature and entitlement is re-checked before every live entry, not just at login.",
    fix: "Renew the subscription. Open positions are untouched either way — their take-profit and stop-loss keep running.",
  },
  max_open_positions: {
    title: "Maximum open positions reached",
    what: "You already hold as many positions as your settings allow, so this signal was skipped.",
    why: "This counts everything the account holds, including positions awaiting reconciliation and any trade you opened by hand on the same exchange account. Exposure is exposure whoever opened it.",
    fix: "Raise the limit in Risk settings, or wait for a position to close.",
  },
  symbol_position_exists: {
    title: "Already holding this coin",
    what: "One open position per symbol is enforced, and you already hold this one.",
    why: "On a one-way-mode account a second entry on the same coin merges into the existing position rather than opening its own, which would quietly change the size and average price of a trade already running.",
    fix: "Turn off 'one position per symbol' in Risk settings if you want to stack entries deliberately.",
  },
  max_trade_notional: {
    title: "Trade is larger than your per-trade cap",
    what: "The size this signal needs is above the cap you set.",
    why: "The live minimum is 5 USDT of margin, so a cap below that skips every signal rather than some of them.",
    fix: "Raise the per-trade cap, or lower Amount so the required size fits under it.",
  },
  minimum_available_balance: {
    title: "Minimum reserve would be breached",
    what: "Taking this trade would leave less free USDT than the reserve you set.",
    why: "The reserve is checked against what would remain after the entry, not what you hold now.",
    fix: "Top up USDT, lower Amount, or reduce the reserve.",
  },
  max_daily_trades: {
    title: "Daily trade limit reached",
    what: "You have taken as many entries today as your settings allow.",
    why: "Counts only entries AutoTrade placed, not trades you made by hand. Resets at 00:00 UTC.",
    fix: "Raise the limit in Risk settings if this is tighter than you intended.",
  },
  daily_loss_limit: {
    title: "Daily loss limit reached",
    blocking: true,
    what: "Losses on trades AutoTrade placed hit your limit, so trading is paused until 00:00 UTC.",
    why: "This counts only what the bot itself lost. Trades you opened by hand on the same account are excluded — they used to count, which meant a bad day of manual trading could switch off a bot that was making money.",
    fix: "Nothing, if the limit is set where you want it. This is the guardrail working. Raise it only deliberately.",
  },
  loss_cooldown: {
    title: "Cooling down after a loss",
    what: "A pause after a losing trade, before the next entry is allowed.",
    why: "Counts only losses on trades AutoTrade placed, so your own hand-trading cannot hold the bot in a permanent cooldown.",
    fix: "Shorten or disable it under 'Cooldown after loss'.",
  },
  error_cooldown: {
    title: "Cooling down after a failed trade",
    what: "A pause after an entry failed at the exchange.",
    why: "Only genuine trade failures trigger this. Exchange bans, key errors and circuit breakers are deliberately excluded so one infrastructure hiccup does not freeze your bot.",
    fix: "Wait it out, or shorten it under 'Cooldown after error'.",
  },
  max_live_bots: {
    title: "Server live-bot capacity reached",
    blocking: true,
    what: "The platform is running as many live bots as it can serve.",
    why: "All live bots share one exchange IP with a fixed request budget. This is a platform cap, not one of your settings.",
    fix: "Nothing you can change. Capacity frees up as other bots stop; dry-run works meanwhile.",
  },
  user_order_throttle: {
    title: "Too many live orders in a short window",
    what: "This account sent more orders in a short period than the throttle allows.",
    why: "A per-account rate limit that keeps one busy account from exhausting the shared exchange IP for everyone.",
    fix: "Nothing — it clears on its own, usually within a minute.",
  },
};

// ── Skips before the risk gates ──────────────────────────────────
// Sent as their own actions with their own metadata.
export const SKIP_EVENTS = {
  "execution.skip_missing_exchange_account": {
    title: "No exchange account connected",
    blocking: true,
    what: "The signal was skipped because this account has no usable exchange key.",
    why: "Either no key was ever connected, or the key stopped working — a revoked key, a missing trading permission, or an IP allow-list that no longer includes our server.",
    fix: "Connect or reconnect the Binance key. Any position you already hold cannot be managed by the bot until you do.",
  },
  "execution.skip_spot_min_notional": {
    title: "Below Binance's minimum order size",
    what: "The order was smaller than the minimum Binance accepts for this coin.",
    why: "Each symbol has its own minimum notional, and it is set by the exchange rather than by us.",
    fix: "Raise Amount, or accept that the smallest coins will be skipped.",
  },
  "execution.skip_risk_level_filtered": {
    title: "Signal filtered by risk level",
    what: "This signal's risk level is outside the range you accept.",
    why: "You chose which risk levels to trade in settings; this one did not match.",
    fix: "Widen the accepted risk levels if you want these.",
  },
  "execution.skip_market_not_selected": {
    title: "That market is switched off",
    what: "The signal was for a market you have not enabled.",
    why: "Spot and futures are enabled separately.",
    fix: "Enable the market in settings if you want these signals.",
  },
  "execution.skip_no_supported_market": {
    title: "Coin not available on your markets",
    what: "The coin is not tradable on the markets you have enabled.",
    why: "Not every coin exists on both spot and futures.",
    fix: "Enable the other market, or accept the skip.",
  },
  "execution.skip_price_outside_entry_window": {
    title: "Price already moved past the entry",
    what: "By the time the signal was processed, price was outside the entry range.",
    why: "Entering after price has already reached the take-profit or the stop-loss would mean buying a trade that is effectively over.",
    fix: "Nothing — this protects you from chasing a move that has already happened.",
  },
  "execution.skip_leverage_cap": {
    title: "Coin caps leverage below your setting",
    what: "Binance allows less leverage on this coin than you have configured, and your fallback is set to skip.",
    why: "Maximum leverage is per-symbol and set by the exchange.",
    fix: "Change the leverage fallback to 'clamp' to trade at the highest allowed leverage instead of skipping.",
  },
};

// ── Alerts ───────────────────────────────────────────────────────
// Categories from the monitoring worker, delivered by Telegram.
export const ALERT_EVENTS = {
  position_unprotected: {
    title: "This position has no stop-loss",
    severity: "critical",
    what: "A position is open on the exchange with no stop order resting under it, so its downside is uncapped.",
    why: "Most often this is a position AutoTrade did not open — the reconciler adopts whatever it finds on your account, including trades you place by hand, and those never carried a stop from us. A take-profit alone does not count: it caps the gain while leaving the loss open.",
    fix: "Set a stop on Binance, or close the position. AutoTrade will not place one for you, because it has no recorded signal for a trade it did not make and would have to invent the level.",
  },
  exchange_key_invalid: {
    title: "Exchange key stopped working",
    severity: "error",
    what: "AutoTrade can no longer use this Binance key.",
    why: "Usually a revoked key, a missing trading permission, or an IP allow-list that no longer includes our server.",
    fix: "Reconnect the key. Until then no new entries are placed and existing positions cannot be managed.",
  },
  account_unreadable_with_open_positions: {
    title: "Open positions we can no longer read",
    severity: "critical",
    what: "Positions are still recorded as open, but the key stopped working, so their real state is unknown and the bot cannot close them.",
    why: "Once a key is unusable the account is skipped entirely, so the position rows freeze at whatever they last showed. The date in the alert is when they were genuinely last seen — not now.",
    fix: "Reconnect the key so the real state can be read, or manage the positions directly on the exchange.",
  },
  execution_failed: {
    title: "An entry failed",
    severity: "high",
    what: "An order was attempted and did not complete.",
    why: "Exchange rejection, insufficient balance, or a network failure mid-request. If an entry reached Binance but the response was lost, it is detected and flagged rather than assumed away.",
    fix: "Check the reason on the event. Repeated failures usually mean balance or key permissions.",
  },
  risk_limit: {
    title: "A risk limit stopped an entry",
    severity: "warning",
    what: "One of your configured limits held a signal back.",
    why: "These are your own guardrails doing their job.",
    fix: "See the specific limit for what to change, if anything.",
  },
  position_closed: {
    title: "A position closed",
    severity: "info",
    what: "A position finished and its result was recorded.",
    why: "Sent so you learn the outcome without watching the exchange.",
    fix: "Nothing to do.",
  },
};

// ── How a position ended ─────────────────────────────────────────
export const EXIT_EVENTS = {
  take_profit: {
    title: "Take-profit hit",
    what: "Price reached the target and the position closed in profit.",
    why: "The take-profit order we placed triggered.",
    fix: "Nothing — this is the intended outcome.",
  },
  stop_loss: {
    title: "Stop-loss hit",
    what: "Price reached the stop and the position closed at a loss.",
    why: "The stop we placed triggered. This means the signal went the wrong way — it does not mean the leverage was too high.",
    fix: "Nothing on this trade. A run of these is a signal-quality question, not a leverage one.",
  },
  trailing_stop: {
    title: "Trailing stop closed the position",
    what: "The trailing stop followed price up and then closed the position when it turned.",
    why: "The trailing stop armed once price reached its activation level.",
    fix: "Nothing to do.",
  },
  liquidated: {
    title: "Liquidated by the exchange",
    what: "Binance force-closed the position because the margin ran out.",
    why: "The leverage was too high for the distance to the stop, so margin was exhausted before the stop could ever trigger. This is a different failure from a stop-loss and points at position sizing rather than at the signal.",
    fix: "Lower leverage, or widen the gap between entry and stop so the stop is reached before the margin is.",
  },
  auto_deleveraged: {
    title: "Auto-deleveraged by the exchange",
    what: "Binance closed the position as the counterparty to someone else's liquidation.",
    why: "This is the exchange managing its own risk. It is not a liquidation of your account and not something you did.",
    fix: "Nothing — it is outside your control and outside ours.",
  },
  forced_sell: {
    title: "Force-closed",
    what: "The position was closed by an operator or an emergency action rather than by a stop.",
    why: "Emergency close cancels the protective orders first, on purpose.",
    fix: "Nothing to do.",
  },
  manual_exit: {
    title: "Closed outside AutoTrade",
    what: "The position was closed somewhere other than the bot.",
    why: "Usually closed by hand in the Binance app.",
    fix: "Nothing to do.",
  },
  exchange_close: {
    title: "Closed, but we could not identify how",
    what: "The position is gone from the exchange, but the closing order could not be matched to any stop or target we placed.",
    why: "Most often this is a trade you opened by hand, which never carried our orders. It can also happen if the position was closed manually on Binance.",
    fix: "Nothing. It is recorded honestly as unidentified rather than guessed at, because reporting it as a stop-loss when it was not would be worse than saying we do not know.",
  },
};

// Alerts arrive as `alert_key`, which is "<name>:<id>" and hyphenated, and the
// name does not always match the category. Mapped explicitly rather than
// guessed at, so a rename in the engine fails loudly here instead of silently
// showing no explanation.
const ALERT_KEY_ALIASES = {
  "futures-position-unprotected": "position_unprotected",
  "position-unprotected": "position_unprotected",
  "unprotected-entry": "position_unprotected",
  "entry-landed-unprotected": "execution_failed",
  "account-unreadable-with-open-positions": "account_unreadable_with_open_positions",
  "exchange-key-invalid": "exchange_key_invalid",
  "position-closed": "position_closed",
};

// One lookup for any event code, whatever family it belongs to.
export function explainEvent(code) {
  if (!code) return null;
  const key = String(code);
  const name = key.split(":")[0];
  return (
    RISK_EVENTS[key] ||
    SKIP_EVENTS[key] ||
    ALERT_EVENTS[key] ||
    EXIT_EVENTS[key] ||
    ALERT_EVENTS[ALERT_KEY_ALIASES[name]] ||
    ALERT_EVENTS[name] ||
    null
  );
}
