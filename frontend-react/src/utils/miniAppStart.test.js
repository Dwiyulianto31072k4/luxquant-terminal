import { describe, expect, it } from "vitest";

import { parseStartParam, startDestination } from "./miniAppStart";

describe("Mini App campaign routing", () => {
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
