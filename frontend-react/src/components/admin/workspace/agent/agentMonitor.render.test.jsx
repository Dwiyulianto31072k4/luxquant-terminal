/**
 * The Agent Monitor, rendered.
 *
 * Lint proves the names resolve and the build proves the imports exist; neither
 * runs a line, and this repo has already shipped a green build that
 * white-screened on a temporal dead zone. The view takes its data as props, so
 * renderToString executes every hook and every branch — with a full payload, an
 * empty window, and a database that is not there — without a DOM, an admin
 * session or a new dependency.
 *
 * The fixture's SHAPE is the real one, read from the production service.
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";

import { AgentMonitorView } from "../AutoTradeOpsTab";

const OVERVIEW = {
  available: true,
  window_hours: 24,
  totals: {
    signed_in: 171,
    never_linked: 158,
    configured: 5,
    linked: 13,
    active: 5,
    live: 4,
    errors: 4,
    warnings: 3,
    stuck_positions: 0,
    invalid_keys: 4,
    open_positions: 8,
    venues_live: 2,
    connect_rate: 7.6,
    live_rate: 30.8,
    signed_live: 13,
    unsigned: 0,
    unsigned_live: 0,
  },
  funnel: { opened: 171, connected: 13, live: 4, connect_rate: 7.6, live_rate: 30.8 },
  by_exchange: [
    { exchange: "binance", connected: 9, live: 3, dry_run: 1, invalid_keys: 2, active: 4 },
    { exchange: "bingx", connected: 2, live: 0, dry_run: 0, invalid_keys: 1, active: 2 },
  ],
  users: [
    {
      subject: "lq:186",
      luxquant_user_id: 186,
      username: "rfkiboss_5bef",
      status: "error",
      reasons: ["Exchange rejected the last order"],
      is_active: true,
      dry_run: false,
      markets: ["futures"],
      leverage: 3,
      venues: [{ exchange: "binance", connected: true }],
      has_account: true,
      has_live_ack: true,
      live_ack_id: 7,
      live_ack_at: "2026-08-29T10:00:00Z",
      key_status: "invalid",
      open_positions: 2,
      stuck_positions: 0,
      recent_errors: 3,
      errors_recovered: false,
      last_success_at: "2026-09-19T10:00:00Z",
      first_active_at: "2026-08-15T00:00:00Z",
      active_seconds: 90000,
      trades: 9,
      wins: 0,
      net: -0.7,
      best: -0.03,
      worst: -0.24,
      win_rate: 0,
    },
    {
      subject: "lq:521",
      luxquant_user_id: 521,
      username: "infinityloop00",
      status: "ok",
      reasons: [],
      is_active: true,
      dry_run: true,
      markets: ["futures"],
      venues: [{ exchange: "bingx", connected: true }],
      has_account: true,
      has_live_ack: false,
      key_status: "valid",
      open_positions: 0,
      stuck_positions: 0,
      recent_errors: 0,
      errors_recovered: true,
      bot_access_blocked: true,
      bot_access_blocked_reason: "asked us to stop",
      active_seconds: 3600,
    },
    { subject: "lq:999", luxquant_user_id: 999, status: "unlinked", has_account: false },
  ],
};

const ANALYTICS = {
  available: true,
  since: null,
  totals: {
    trades: 639,
    unpriced: 9,
    wins: 288,
    losses: 351,
    win_rate: 45.1,
    won: 667.54,
    lost: -1218.64,
    net: -551.1,
    avg_win: 2.32,
    avg_loss: -3.47,
    avg_hold_win_hours: 3.9,
    avg_hold_loss_hours: 6.8,
    profitable_users: 0,
    losing_users: 10,
    venues_traded: 4,
  },
  leaderboard: [
    { subject: "lq:186", luxquant_user_id: 186, trades: 9, wins: 0, net: -0.7, best: -0.03, worst: -0.24, win_rate: 0 },
  ],
  by_leverage: [
    { key: 4, trades: 289, wins: 119, net: -440.19, won: 512.23, lost: -952.43, win_rate: 41.2 },
    { key: 3, trades: 50, wins: 30, net: 12.4, won: 40, lost: -27.6, win_rate: 60 },
    { key: 10, trades: 2, wins: 0, net: -5, won: 0, lost: -5, win_rate: 0 },
  ],
  by_exit_reason: [
    { key: "stop_loss", trades: 195, wins: 0, net: -1041.53, won: 0, lost: -1041.53, win_rate: 0 },
    { key: "take_profit", trades: 300, wins: 300, net: 600.1, won: 600.1, lost: 0, win_rate: 100 },
    { key: "exchange_close", trades: 44, wins: 10, net: -12.4, won: 5, lost: -17.4, win_rate: 22.7 },
  ],
  by_exchange: [
    { key: "bingx", trades: 289, wins: 119, net: -440.19, won: 512.23, lost: -952.43, win_rate: 41.2 },
    { key: "binance", trades: 200, wins: 100, net: -27.21, won: 100, lost: -127.21, win_rate: 50 },
  ],
  by_market_type: [{ key: "futures", trades: 639, wins: 288, net: -551.1, win_rate: 45.1 }],
  by_symbol: [
    { key: "GIGGLEUSDT", trades: 2, wins: 0, net: -30.7, won: 0, lost: -30.7, win_rate: 0 },
    { key: "BTCUSDT", trades: 12, wins: 8, net: 18.2, won: 30, lost: -11.8, win_rate: 66.7 },
  ],
  curve: [
    { day: "2026-08-01", pnl: -13.89, cumulative: -13.89, btc_change_pct: -0.1 },
    { day: "2026-08-02", pnl: 20.5, cumulative: 6.61, btc_change_pct: 1.4 },
    { day: "2026-08-03", pnl: -60.2, cumulative: -53.59, btc_change_pct: -2.2 },
  ],
  manual: { trades: 12, net: -80.5, wins: 3, losses: 9, traders: 2 },
};

const POSITIONS = {
  available: true,
  totals: {
    open: 3,
    stuck: 0,
    spot: 0,
    futures: 3,
    users_holding: 2,
    live_unrealized_pnl: -1.56,
    by_exchange: [{ exchange: "binance", open: 3, stuck: 0 }],
  },
  positions: [
    {
      position_id: "p1",
      symbol: "ETHUSDT",
      market_type: "futures",
      side: "long",
      quantity: 0.4,
      entry_price: 2500,
      mark_price: 2490,
      unrealized_pnl: -4,
      unrealized_pnl_pct: -0.4,
      notional: 1000,
      exchange: "binance",
      venue: "binance",
      status: "open",
      leverage: 3,
      dry_run: false,
      unprotected: true,
      created_at: "2026-09-19T12:00:00Z",
      subject: "lq:186",
      username: "rfkiboss_5bef",
    },
    {
      position_id: "p2",
      symbol: "SOLUSDT",
      market_type: "futures",
      side: "short",
      quantity: 5,
      entry_price: 140,
      mark_price: null,
      unrealized_pnl: null,
      notional: 700,
      exchange: "binance",
      venue: "binance",
      status: "reconciliation_required",
      dry_run: false,
      created_at: "2026-09-18T12:00:00Z",
      subject: "lq:186",
    },
    {
      position_id: "p3",
      symbol: "XRPUSDT",
      market_type: "futures",
      side: "long",
      quantity: 100,
      entry_price: 0.5,
      notional: 50,
      exchange: "bingx",
      venue: "bingx",
      status: "open",
      dry_run: true,
      created_at: "2026-09-19T09:00:00Z",
      subject: "lq:521",
    },
  ],
};

const html = (props) => renderToString(<AgentMonitorView {...props} />);

describe("AgentMonitorView", () => {
  it("renders a full payload: incidents first, then money, then the rows", () => {
    const out = html({
      overview: OVERVIEW,
      analytics: ANALYTICS,
      positions: POSITIONS,
      waitlist: { counts: { okx: 3 } },
      loadedAt: Date.now(),
    });
    expect(out).toContain("Needs attention now");
    expect(out).toContain("Agent Monitor");
    // the incident strip counts what is actually wrong
    expect(out).toContain("invalid keys");
    expect(out).toContain("without a stop");
    // money section
    expect(out).toContain("Where the money went");
    expect(out).toContain("Profit factor");
    expect(out).toContain("The shape of a trade");
    expect(out).toContain("How positions ended");
    expect(out).toContain("Biggest movers by symbol");
    expect(out).toContain("Traded by hand, not by the bot");
    // the rows
    expect(out).toContain("rfkiboss_5bef");
    expect(out).toContain("Open positions");
    expect(out).toContain("no stop-loss");
    expect(out).toContain("needs reconciliation");
    expect(out).toContain("Live trading agreements");
  });

  it("says so plainly when nothing is wrong", () => {
    const clean = {
      ...OVERVIEW,
      totals: { ...OVERVIEW.totals, invalid_keys: 0, stuck_positions: 0 },
      users: [{ ...OVERVIEW.users[0], status: "ok", recent_errors: 0, key_status: "valid" }],
    };
    const out = html({
      overview: clean,
      analytics: ANALYTICS,
      positions: { ...POSITIONS, positions: [] },
    });
    expect(out).toContain("Nothing needs attention");
    expect(out).not.toContain("Needs attention now");
  });

  it("offers all time instead of a wall of zeros when the window is empty", () => {
    const out = html({
      overview: OVERVIEW,
      analytics: { available: true, totals: { trades: 0 }, curve: [] },
      positions: POSITIONS,
    });
    expect(out).toContain("No settled trades in this window");
    expect(out).toContain("Show all time");
    expect(out).not.toContain("Where the money went");
  });

  it("degrades to one sentence when the Agent database is unreachable", () => {
    const out = html({ overview: { available: false }, analytics: null, positions: null });
    expect(out).toContain("not reachable");
  });

  it("shows a loading line before the first payload, and survives empty data", () => {
    expect(html({ overview: null, analytics: null, positions: null, loading: true })).toContain(
      "Loading Agent"
    );
    const bare = html({
      overview: { available: true, totals: {}, users: [] },
      analytics: { available: true, totals: {} },
      positions: { available: true, totals: {}, positions: [] },
    });
    expect(bare).toContain("Agent Monitor");
    expect(bare).toContain("Nobody is holding anything right now.");
  });
});
