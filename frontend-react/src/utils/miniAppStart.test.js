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

  it("keeps legacy channel payload grouping intact", () => {
    expect(startDestination("closed_win_btc_wr_coin")).toBe("/performance");
    expect(parseStartParam("closed_win_btc_wr_coin")).toEqual({
      campaign: "closed_win",
      content: "btc_wr_coin",
      medium: "miniapp",
    });
  });
});
