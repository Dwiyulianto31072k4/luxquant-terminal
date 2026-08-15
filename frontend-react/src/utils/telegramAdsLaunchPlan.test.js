import { describe, expect, it } from "vitest";

import {
  TELEGRAM_AD_CAMPAIGN,
  TELEGRAM_AD_CREATIVES,
  TELEGRAM_AD_PLACEMENTS,
} from "./telegramAdsLaunchPlan";
import { buildTelegramStartParam, parseLuxQuantStartParam } from "./telegramCampaign";

describe("Telegram Ads launch plan", () => {
  it("keeps all sponsored messages within Telegram's 160-character limit", () => {
    expect(TELEGRAM_AD_CREATIVES).toHaveLength(6);
    for (const creative of TELEGRAM_AD_CREATIVES) {
      expect(creative.text.length, creative.id).toBeLessThanOrEqual(160);
      expect(creative.text).not.toMatch(/guaranteed|best|profit|win rate|insider/i);
    }
  });

  it("gives every creative a unique signed attribution payload", () => {
    const payloads = TELEGRAM_AD_CREATIVES.map((creative) =>
      buildTelegramStartParam({
        medium: "paid_social",
        campaign: TELEGRAM_AD_CAMPAIGN,
        content: creative.id,
      })
    );
    expect(new Set(payloads).size).toBe(TELEGRAM_AD_CREATIVES.length);
    for (const payload of payloads) {
      expect(payload.length).toBeLessThanOrEqual(64);
      expect(parseLuxQuantStartParam(payload)).toMatchObject({
        source: "telegram",
        medium: "paid_social",
        campaign: TELEGRAM_AD_CAMPAIGN,
      });
    }
  });

  it("uses public channel handles that Telegram Ads can validate at launch", () => {
    expect(TELEGRAM_AD_PLACEMENTS.length).toBeGreaterThanOrEqual(6);
    for (const placement of TELEGRAM_AD_PLACEMENTS) {
      expect(placement.handle).toMatch(/^@[A-Za-z0-9_]{5,}$/);
    }
  });
});
