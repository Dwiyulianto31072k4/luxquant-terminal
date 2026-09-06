import { describe, expect, it } from "vitest";

import { parseStartParam, startDestination, telegramAdVariant } from "./miniAppStart";

describe("Mini App campaign routing", () => {
  it("keeps each August paid-ad destination in place for an exact first screen", () => {
    expect(
      startDestination("lq1p_tg-proof-scale-aug26_proof-timestamps")
    ).toBeNull();
    expect(
      startDestination("lq1p_tg-proof-scale-aug26_signal-process")
    ).toBeNull();
    expect(
      startDestination("lq1p_tg-proof-scale-aug26_terminal-context")
    ).toBeNull();
  });

  it("recognises only the three reviewed paid-ad variants", () => {
    expect(
      telegramAdVariant("lq1p_tg-proof-scale-aug26_proof-timestamps")
    ).toBe("proof-timestamps");
    expect(
      telegramAdVariant("lq1p_tg-proof-scale-aug26_signal-process")
    ).toBe("signal-process");
    expect(
      telegramAdVariant("lq1p_tg-proof-scale-aug26_terminal-context")
    ).toBe("terminal-context");
    expect(
      telegramAdVariant("lq1c_tg-proof-scale-aug26_proof-timestamps")
    ).toBeNull();
    expect(telegramAdVariant("lq1p_other_proof-timestamps")).toBeNull();
  });

  it("routes paid Telegram Ads to proof before purchase intent", () => {
    expect(startDestination("lq1p_aug-growth_proof-a")).toBe("/performance");
    expect(parseStartParam("lq1p_aug-growth_proof-a")).toEqual({
      source: "telegram",
      medium: "paid_social",
      campaign: "aug-growth",
      content: "proof-a",
    });
  });

  it("routes popup rescue into the signed-in product", () => {
    expect(startDestination("lq1f_login_redirect")).toBe("/home");
  });

  it("routes referral Mini App arrivals to the public record", () => {
    expect(startDestination("lq1r_luxquantadmin")).toBe("/performance");
  });

  it("lands the entry-alert buttons on the free product they name", () => {
    // These are the labels "Get the entry alert" and "Alerts on your coins".
    // Unmapped keys fall through to the app's default screen, which would put
    // a reader who tapped a promise about alerts somewhere that never mentions
    // them, so the mapping is the button's promise.
    expect(startDestination("tp2_bome_alert_gen")).toBe("/watchlist");
    expect(startDestination("tp3_uai_alerts_gen")).toBe("/watchlist");
    expect(startDestination("closed_win_arb_alert_gen")).toBe("/watchlist");
  });

  it("separates vip_get from vip_gets rather than truncating one into the other", () => {
    // Longest-match-first exists for exactly this pair: a naive suffix test
    // would file both under whichever it checked first.
    expect(startDestination("tp2_bome_vip_get")).toBe("/pricing");
    expect(startDestination("tp2_bome_vip_gets")).toBe("/pricing");
    expect(parseStartParam("tp2_bome_vip_get").content).toBe("bome_vip_get");
    expect(parseStartParam("tp2_bome_vip_gets").content).toBe("bome_vip_gets");
  });

  it("routes both in-text brand links into the app", () => {
    expect(startDestination("tp2_bome_brand_link")).toBe("/home");
    expect(startDestination("tp2_bome_tail_link")).toBe("/home");
    expect(parseStartParam("tp2_bome_tail_link").content).toBe("bome_tail_link");
  });

  it("routes the remaining new free-row and VIP keys", () => {
    expect(startDestination("tp2_bome_try_free")).toBe("/home");
    expect(startDestination("tp3_uai_vip_sub")).toBe("/pricing");
    // Coin-named labels carry the ticker through, so the screen can prefill it.
    // Landing on an empty watchlist would break the promise the label made.
    expect(startDestination("tp2_bome_alert_coin")).toBe("/watchlist?add=BOME");
    expect(startDestination("tp2_bome_watch_coin")).toBe("/watchlist?add=BOME");
    expect(startDestination("closed_win_1inch_alert_coin")).toBe("/watchlist?add=1INCH");
  });

  it("drops a ticker it cannot trust rather than passing it to the screen", () => {
    // A malformed payload should still land somewhere useful; only the prefill
    // is abandoned, never the arrival.
    expect(startDestination("tp2__alert_coin")).toBe("/watchlist");
    expect(startDestination("tp2_alert_coin")).toBe("/watchlist");
  });

  it("keeps legacy channel payload grouping intact", () => {
    expect(startDestination("closed_win_btc_wr_coin")).toBe("/performance");
    expect(parseStartParam("closed_win_btc_wr_coin")).toEqual({
      campaign: "closed_win",
      content: "btc_wr_coin",
      medium: "miniapp",
    });
  });
});
