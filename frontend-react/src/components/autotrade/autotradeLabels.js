/** Shared Agent labels — keep Trade History, Positions, and Activity in sync. */

const EXIT_REASONS = {
  take_profit: "Take-profit",
  stop_loss: "Stop-loss",
  trailing_stop: "Trailing stop",
  exchange_close: "Closed on exchange",
  emergency_close_unprotected: "Emergency close",
  forced_sell: "Force-sold",
  liquidated: "Liquidated",
  auto_deleveraged: "Auto-deleveraged",
  ignored_manual: "Ignored (manual)",
  manual_exit: "Closed by hand",
};

const EXIT_MODES = {
  fixed_sl: "Fixed SL",
  trailing_stop: "Trailing stop",
};

export function formatExitReason(reason) {
  if (!reason) return "—";
  return EXIT_REASONS[reason] || String(reason).replaceAll("_", " ");
}

export function formatExitMode(mode) {
  if (!mode) return "—";
  return EXIT_MODES[mode] || String(mode).replaceAll("_", " ");
}

export function exitReasonTone(reason) {
  if (reason === "take_profit" || reason === "trailing_stop") return "good";
  if (reason === "stop_loss" || reason === "liquidated" || reason === "emergency_close_unprotected")
    return "bad";
  return "neutral";
}
