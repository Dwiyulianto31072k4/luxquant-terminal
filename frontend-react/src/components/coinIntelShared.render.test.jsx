/**
 * The coin detail modal, rendered from the payload it is actually opened with.
 *
 * The desk list carries a trimmed coin (DESK_COIN_FIELDS in
 * backend/app/api/routes/signals.py) and the modal fetches the full one after
 * it is already on screen, so its FIRST paint always has the trimmed object.
 * A subscriber hit "Cannot read properties of undefined (reading 'score')"
 * there on 24 Sep 2026: the guard read `coin.entry_quality?.score !== "unknown"`,
 * which is true when the field is absent, so the body then read it unguarded.
 *
 * renderToString runs every branch without a DOM or a session.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

// The modal is a portal, and the server renderer refuses those. Rendering the
// content in place is enough: the bug lives in the body, not in where it hangs.
// `document.body` is still evaluated as the portal's argument, so it needs to
// exist — nothing reads it once createPortal ignores it.
vi.stubGlobal("document", { body: {} });
vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  createPortal: (node) => node,
}));

const { CoinDetailModal } = await import("./coinIntelShared");

/** Exactly what the desk view sends — nothing the detail fetch adds later. */
const DESK_COIN = {
  pair: "BTCUSDT",
  win_rate: 86.2,
  win_rate_shrunk: 84.9,
  win_rate_30d: 88.0,
  win_rate_30d_trend: "up",
  sl_rate: 13.8,
  closed_trades: 65,
  open_trades: 2,
  total_calls: 67,
  current_streak: { type: "win", length: 4 },
  outcome_dist: { tp1: 20, tp2: 18, tp3: 12, tp4: 6, sl: 9 },
  recent_outcomes: ["tp2", "tp1", "sl", "tp3", "tp4"],
  desk_band: "strong",
  verdict: "reliable",
  risk_score: 32,
  avg_outcome: 4.1,
  anomaly_flags: [],
  is_top: true,
  rank: 3,
  first_signal: "2026-03-04T00:00:00+00:00",
  last_signal: "2026-09-24T10:15:00+00:00",
  active_days: ["2026-09-23", "2026-09-24"],
  volatility: {
    profile: "steady",
    pl_stddev: 3.2,
    consistency: 71.4,
    avg_pl: 4.1,
    avg_win_pl: 6.8,
    avg_loss_pl: -4.5,
    rr_ratio: 1.51,
  },
};

const FULL_EXTRAS = {
  entry_quality: {
    score: "excellent",
    reaches_potential: 72.1,
    full_target_rate: 21.0,
    avg_tp_level: 2.4,
    tp1_only_pct: 27.9,
  },
  recovery: {
    avg_signals_to_recover: 2,
    fastest_recovery: 1,
    slowest_recovery: 5,
    total_recoveries: 7,
  },
  hour_analysis: { has_pattern: true, best_hour: 8, best_hour_wr: 91, best_block: "06-12 UTC", best_block_wr: 88 },
  dow_analysis: { breakdown: [{ day: "Mon", wr: 90, n: 10 }], best_day: "Mon", worst_day: "Fri" },
  correlated_pairs: [{ pair: "ETHUSDT", co_sl_count: 3 }],
  signal_history: [
    { date: "2026-09-20", entry: 62000, outcome: "tp3", pl_pct: "+9.4%", platform_wr: 85, flow: "bullish" },
  ],
};

// The pair is split across elements ("BTC" + "USDT"), so assertions read the
// visible text rather than the markup.
const render = (coin) =>
  renderToString(<CoinDetailModal coin={coin} currentFlow="bullish" deskWr={85} onClose={() => {}} />)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

describe("CoinDetailModal", () => {
  it("renders the trimmed coin the desk hands it, before the detail arrives", () => {
    const html = render(DESK_COIN);
    expect(html).toContain("BTC");
    // The sections that need the full payload simply wait for it.
    expect(html).not.toContain("Entry Quality Metrics");
  });

  it("renders the full coin with every section", () => {
    const html = render({ ...DESK_COIN, ...FULL_EXTRAS });
    expect(html).toContain("Entry Quality Metrics");
    expect(html).toContain("excellent");
    expect(html).toContain("Volatility Profile");
  });

  it("does not crash when a field the backend can null out is missing", () => {
    expect(() => render({ ...DESK_COIN, volatility: null, entry_quality: null })).not.toThrow();
  });

  it("hides the sections whose data says there is nothing to report", () => {
    const html = render({
      ...DESK_COIN,
      volatility: { ...DESK_COIN.volatility, profile: "unknown" },
      entry_quality: { score: "unknown", reaches_potential: 0, full_target_rate: 0, avg_tp_level: 0, tp1_only_pct: 0 },
    });
    expect(html).not.toContain("Entry Quality Metrics");
    expect(html).not.toContain("Volatility Profile");
  });
});
