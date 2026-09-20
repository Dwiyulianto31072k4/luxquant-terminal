import { describe, expect, it } from "vitest";

import {
  breakEvenWinRate,
  curveSeries,
  dur,
  exposure,
  expectancy,
  incidents,
  maxDrawdown,
  payoff,
  profitFactor,
  signed,
  topByAbs,
  usd,
  usdShort,
} from "./agentMetrics";

describe("money formatting", () => {
  it("keeps the minus outside the dollar sign and only signs a gain", () => {
    expect(usd(-482.055)).toBe("-$482.06");
    expect(usd(0)).toBe("$0.00");
    expect(signed(12.5)).toBe("+$12.50");
    expect(signed(-12.5)).toBe("-$12.50");
    expect(signed(null)).toBe("—");
  });

  it("shortens for an axis without losing the sign", () => {
    expect(usdShort(-1234)).toBe("-$1.2k");
    expect(usdShort(12345)).toBe("$12k");
    expect(usdShort(-430)).toBe("-$430");
    expect(usdShort(0)).toBe("$0");
  });
});

describe("desk ratios", () => {
  it("reads profit factor as dollars back per dollar lost", () => {
    expect(profitFactor(667.54, -1218.64)).toBeCloseTo(0.548, 3);
    expect(profitFactor(100, 0)).toBe(null); // nothing lost yet is not "infinite edge"
    expect(profitFactor(null, -10)).toBe(null);
  });

  it("gives expectancy per trade and the break-even win rate of a payoff", () => {
    expect(expectancy(-551.1, 639)).toBeCloseTo(-0.862, 3);
    expect(expectancy(10, 0)).toBe(null);
    expect(payoff(2.32, -3.47)).toBeCloseTo(0.669, 3);
    expect(breakEvenWinRate(1)).toBe(50);
    expect(breakEvenWinRate(0.669)).toBeCloseTo(59.9, 1);
    expect(breakEvenWinRate(0)).toBe(null);
  });
});

describe("curve", () => {
  const curve = [
    { day: "2026-08-01", pnl: -10, cumulative: -10, btc_change_pct: -0.1 },
    { day: "2026-08-02", pnl: 30, cumulative: 20, btc_change_pct: 1.2 },
    { day: "2026-08-03", pnl: -45, cumulative: -25, btc_change_pct: -2 },
  ];

  it("unpacks the days and counts green against red", () => {
    const s = curveSeries(curve);
    expect(s.n).toBe(3);
    expect(s.end).toBe(-25);
    expect(s.best).toBe(30);
    expect(s.worst).toBe(-45);
    expect(s.greenDays).toBe(1);
    expect(s.redDays).toBe(2);
    expect(curveSeries([])).toBe(null);
  });

  it("measures the worst peak-to-trough fall, not the final loss", () => {
    expect(maxDrawdown([-10, 20, -25])).toBe(45);
    expect(maxDrawdown([1, 2, 3])).toBe(0);
    expect(curveSeries(curve).maxDrawdown).toBe(45);
  });
});

describe("incidents", () => {
  const users = [
    { has_account: true, status: "error" },
    { has_account: true, status: "warn", errors_recovered: true },
    { has_account: true, status: "ok", bot_access_blocked: true },
    { has_account: false, status: "error" }, // never linked — not an incident
  ];

  it("lists only what is actually wrong, each with the rows behind it", () => {
    const list = incidents({
      totals: { invalid_keys: 2, stuck_positions: 0, unsigned_live: 1 },
      users,
      positions: { positions: [{ unprotected: true }, { unprotected: false }] },
    });
    const byKey = Object.fromEntries(list.map((i) => [i.key, i]));
    expect(byKey.errors.count).toBe(1);
    expect(byKey.keys.count).toBe(2);
    expect(byKey.stuck).toBeUndefined(); // zero is not an incident
    expect(byKey.unprotected.count).toBe(1);
    expect(byKey.unsigned.count).toBe(1);
    expect(byKey.blocked.count).toBe(1);
    expect(byKey.recovered.resolved).toBe(true);
    expect(byKey.errors.filter).toBe("problems");
  });

  it("is empty when the fleet is clean", () => {
    expect(incidents({ totals: {}, users: [{ has_account: true, status: "ok" }] })).toEqual([]);
    expect(incidents()).toEqual([]);
  });
});

describe("exposure", () => {
  const positions = {
    totals: { live_unrealized_pnl: -1.56, stuck: 0, users_holding: 2 },
    positions: [
      { venue: "binance", notional: 100, unrealized_pnl: -1, mark_price: 2, unprotected: true },
      { venue: "binance", notional: 50, unrealized_pnl: -0.56, mark_price: 3 },
      { venue: "bingx", notional: 400, unrealized_pnl: 0, dry_run: true },
    ],
  };

  it("counts only real money as exposure and keeps dry runs apart", () => {
    const e = exposure(positions);
    expect(e.open).toBe(3);
    expect(e.liveOpen).toBe(2);
    expect(e.dryRun).toBe(1);
    expect(e.notional).toBe(150);
    expect(e.unrealized).toBe(-1.56);
    expect(e.unprotected).toBe(1);
    expect(e.byVenue).toHaveLength(1);
    expect(e.byVenue[0]).toMatchObject({ venue: "binance", open: 2, notional: 150 });
  });

  it("survives an empty or missing payload", () => {
    expect(exposure(null).open).toBe(0);
    expect(exposure({ positions: [] }).notional).toBe(0);
  });
});

describe("ranking", () => {
  it("takes the biggest movers either way", () => {
    const rows = [{ net: -30 }, { net: 5 }, { net: 12 }, { net: null }];
    expect(topByAbs(rows, 2).map((r) => r.net)).toEqual([-30, 12]);
  });
});

describe("dur", () => {
  it("says switched-on time the way an operator reads it", () => {
    expect(dur(0)).toBe("—");
    expect(dur(1800)).toBe("30m");
    expect(dur(7200)).toBe("2h");
    expect(dur(90000)).toBe("1d 1h");
  });
});
