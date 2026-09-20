import { describe, expect, it } from "vitest";

import { accountRows, concentration, exitShape, topAccount, worstDays } from "./agentInsights";

// The production window, trimmed: 26 days where two of them carry the loss.
const CURVE = [
  ...Array.from({ length: 10 }, (_, i) => ({
    day: `2026-08-${String(14 + i).padStart(2, "0")}`,
    pnl: i === 9 ? 29.73 : -1,
    cumulative: 0,
    btc_change_pct: 0.2,
  })),
  { day: "2026-08-24", pnl: -205.3, cumulative: -175.57, btc_change_pct: 1.62 },
  { day: "2026-08-25", pnl: -184.21, cumulative: -359.78, btc_change_pct: -0.57 },
  { day: "2026-08-26", pnl: -82.15, cumulative: -441.93, btc_change_pct: 0.62 },
  ...Array.from({ length: 13 }, (_, i) => ({
    day: `2026-09-${String(1 + i).padStart(2, "0")}`,
    pnl: -2,
    cumulative: -460,
    btc_change_pct: -0.1,
  })),
];

const LEADERBOARD = [
  { subject: "lq:1", trades: 9, net: -0.7, win_rate: 0, leverage: 3 },
  { subject: "lq:2", trades: 14, net: -3.92, win_rate: 42.9, leverage: 7 },
  { subject: "lq:3", trades: 283, net: -438.01, win_rate: 41.7, leverage: 4 },
  { subject: "lq:4", trades: 19, net: -16.52, win_rate: 36.8, leverage: 10 },
];

const EXITS = [
  { key: "stop_loss", trades: 92, net: -876.99, win_rate: 0 },
  { key: "exchange_close", trades: 133, net: -75.85, win_rate: 30.1 },
  { key: "take_profit", trades: 116, net: 470.98, win_rate: 87.9 },
  { key: "trailing_stop", trades: 4, net: 0.85, win_rate: 100 },
];

const ANALYTICS = {
  totals: { net: -482.06, trades: 356 },
  curve: CURVE,
  leaderboard: LEADERBOARD,
  by_exit_reason: EXITS,
};

describe("worstDays", () => {
  it("finds the two days that carry the loss and their share of it", () => {
    const w = worstDays(CURVE);
    expect(w.days.map((d) => d.day)).toEqual(["2026-08-24", "2026-08-25"]);
    expect(Math.round(w.share)).toBe(82); // -389.51 of the -476.93 this fixture loses
    expect(w.of).toBe(26);
  });

  it("explains nothing when the desk is up, or the window is too short", () => {
    expect(worstDays([{ day: "a", pnl: 5 }, { day: "b", pnl: 5 }, { day: "c", pnl: 5 }])).toBe(null);
    expect(worstDays([{ day: "a", pnl: -5 }])).toBe(null);
    expect(worstDays(null)).toBe(null);
  });
});

describe("topAccount", () => {
  it("ranks by money moved, not by row order", () => {
    const a = topAccount(LEADERBOARD, -482.06);
    expect(a.row.subject).toBe("lq:3");
    expect(Math.round(a.share)).toBe(91);
    expect(Math.round(a.tradeShare)).toBe(87);
    expect(a.accounts).toBe(4);
  });

  it("says nothing with one account or no net", () => {
    expect(topAccount([LEADERBOARD[0]], -10)).toBe(null);
    expect(topAccount(LEADERBOARD, 0)).toBe(null);
  });
});

describe("exitShape", () => {
  it("shares add to 100 and the unattributed slice is called out", () => {
    const e = exitShape(EXITS, -1013.97);
    expect(e.trades).toBe(345);
    expect(e.rows.reduce((a, r) => a + r.share, 0)).toBeCloseTo(100);
    expect(Math.round(e.unattributed)).toBe(39);
    expect(e.rows[e.rows.length - 1].key).toBe("exchange_close"); // pinned last
    expect(e.stopped.trades).toBe(92);
    expect(e.target.net).toBe(470.98);
    // 877 of the 1014 the desk lost left through a stop — its own denominator
    expect(Math.round(e.stopShareOfLoss)).toBe(86);
  });
});

describe("concentration", () => {
  it("orders the findings by how much of the loss each explains", () => {
    const c = concentration({
      analytics: ANALYTICS,
      rows: [{ subject: "lq:3", venues: [{ exchange: "bingx", connected: true }], leverage: 4 }],
    });
    expect(c.map((x) => x.key)).toEqual(["account", "days"]);
    expect(Math.round(c[0].share)).toBe(91);
    expect(c[0].detail).toContain("bingx");
    expect(c[0].detail).toContain("4×");
    expect(c[1].headline).toContain("2 days");
  });

  it("is empty when there is no loss to explain", () => {
    expect(concentration({ analytics: { totals: { net: 12 } } })).toEqual([]);
    expect(concentration({})).toEqual([]);
  });
});

describe("accountRows", () => {
  it("keeps connected accounts, ranked by money moved", () => {
    const rows = accountRows(
      [
        { subject: "lq:3", has_account: true, is_active: true },
        { subject: "lq:1", has_account: true, is_active: true },
        { subject: "lq:9", has_account: false, is_active: true },
      ],
      LEADERBOARD
    );
    expect(rows.map((r) => r.subject)).toEqual(["lq:3", "lq:1"]);
    expect(rows[0].trades).toBe(283);
  });
});
