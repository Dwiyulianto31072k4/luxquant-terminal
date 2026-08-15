import { describe, expect, it } from "vitest";
import { describeAppliedRules, describeExitPlan } from "./autotradeFieldGuide";
import { formatExitMode, formatExitReason } from "./autotradeLabels";

describe("describeExitPlan", () => {
  it("trailing does not place TP and warns when the callback is tight", () => {
    const plan = describeExitPlan({
      exitMode: "trailing_stop",
      tpLevel: 1,
      slLevel: 1,
      callbackRate: 1,
      futuresEnabled: true,
    });
    expect(plan.trailing).toBe(true);
    expect(plan.placed.join(" ")).toMatch(/TP1 is not placed/);
    expect(plan.placed.join(" ")).toMatch(/Hard stop at SL1/);
    expect(plan.ifSignalTp).toMatch(/stays open/);
    expect(plan.tight).toMatch(/1%/);
  });

  it("fixed SL places TP and SL", () => {
    const plan = describeExitPlan({
      exitMode: "fixed_sl",
      tpLevel: 2,
      slLevel: 1,
      futuresEnabled: true,
    });
    expect(plan.trailing).toBe(false);
    expect(plan.placed).toEqual(["Take-profit at TP2", "Hard stop at SL1"]);
    expect(plan.ifSignalTp).toMatch(/TP2/);
    expect(plan.tight).toBeNull();
  });

  it("humanizes exit labels", () => {
    expect(formatExitMode("trailing_stop")).toBe("Trailing stop");
    expect(formatExitReason("exchange_close")).toBe("Closed on exchange");
    expect(formatExitReason("trailing_stop")).toBe("Trailing stop");
  });

  it("applied rules for trailing 3% do not close on signal TP1", () => {
    const { headline, scenarios } = describeAppliedRules({
      exchange: "bingx",
      is_active: true,
      dry_run: false,
      futures_enabled: true,
      sizing: { method: "fixed", value: 20 },
      futures: { leverage: 3, margin_mode: "isolated" },
      exit: { mode: "trailing_stop", trailing_callback_rate: 3 },
      tp: { level: 1 },
      sl: { level: 1 },
      allowed_risk_levels: ["normal", "high"],
      risk_limits: {
        one_open_position_per_symbol: true,
        max_open_positions: 12,
        max_daily_trades: 100,
        max_trade_notional_usdt: 20,
        min_available_usdt: 100,
        daily_loss_limit_usdt: 40,
        cooldown_after_loss_minutes: 3,
        cooldown_after_error_minutes: 1,
      },
    });
    expect(headline).toMatch(/TP1 on the signal will not close the BingX position/);
    const byId = Object.fromEntries(scenarios.map((row) => [row.id, row]));
    expect(byId.live.then).toMatch(/\$20/);
    expect(byId.live.then).toMatch(/3×/);
    expect(byId.fill.then).toMatch(/3% trailing/);
    expect(byId.fill.then).toMatch(/TP1 is not placed/);
    expect(byId["signal-tp"].then).toMatch(/stays open/);
    expect(byId["max-open"].if).toMatch(/12 positions/);
    expect(byId["daily-loss"].if).toMatch(/\$40/);
  });

  it("applied rules for fixed SL TP2 say the exchange take-profit closes", () => {
    const { headline, scenarios } = describeAppliedRules({
      exchange: "binance",
      is_active: true,
      dry_run: false,
      futures_enabled: true,
      sizing_method: "fixed",
      sizing_value: 12,
      leverage: 5,
      exit_mode: "fixed_sl",
      tp_level: 2,
      sl_level: 1,
    });
    expect(headline).toMatch(/closes at TP2 or SL1 on Binance/);
    const tp = scenarios.find((row) => row.id === "signal-tp");
    expect(tp.then).toMatch(/TP2/);
    expect(tp.then).not.toMatch(/stays open/);
  });

  it("spot-only trailing is downgraded", () => {
    const plan = describeExitPlan({
      exitMode: "trailing_stop",
      spotEnabled: true,
      futuresEnabled: false,
    });
    expect(plan.trailing).toBe(false);
    expect(plan.spotNote).toMatch(/Fixed SL/);
  });
});
