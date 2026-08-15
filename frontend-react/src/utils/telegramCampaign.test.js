import { describe, expect, it } from "vitest";

import {
  __TEST__,
  buildTelegramFallbackUrl,
  buildTelegramMiniAppUrl,
  buildTelegramStartParam,
  buildTelegramWebCampaignUrl,
  parseLuxQuantStartParam,
  telegramCampaignSlug,
} from "./telegramCampaign";

describe("telegram campaign payloads", () => {
  it("encodes paid campaign and creative into a signed startapp payload", () => {
    const payload = buildTelegramStartParam({
      medium: "paid_social",
      campaign: "Proof Scale August",
      content: "Winner Card A",
    });
    expect(payload).toBe("lq1p_proof-scale-august_winner-card-a");
    expect(parseLuxQuantStartParam(payload)).toEqual({
      source: "telegram",
      medium: "paid_social",
      campaign: "proof-scale-august",
      content: "winner-card-a",
    });
  });

  it("keeps Telegram start_param within the platform limit", () => {
    const payload = buildTelegramStartParam({
      medium: "paid_social",
      campaign: "campaign-".repeat(20),
      content: "creative-".repeat(20),
    });
    expect(payload.length).toBeLessThanOrEqual(__TEST__.MAX_START_PARAM);
    expect(payload).toMatch(/^[a-z0-9_-]+$/);
  });

  it("preserves paid Telegram attribution in the popup rescue link", () => {
    const url = buildTelegramFallbackUrl({
      source: "telegram",
      medium: "paid_social",
      campaign: "aug-growth",
      content: "proof-a",
    });
    expect(url).toContain("startapp=lq1p_aug-growth_proof-a");
  });

  it("uses a measurable auth fallback for untagged traffic", () => {
    expect(buildTelegramFallbackUrl(null)).toContain(
      "startapp=lq1f_login_redirect"
    );
    expect(buildTelegramMiniAppUrl({ medium: "channel", campaign: "post", content: "proof" }))
      .toContain("startapp=lq1c_post_proof");
  });

  it("sends normal-browser paid traffic to public proof before login", () => {
    const url = buildTelegramWebCampaignUrl({
      campaign: "Proof Scale",
      content: "Signals A",
    });

    expect(url).toBe(
      "https://luxquant.tw/?utm_source=telegram&utm_medium=paid_social&utm_campaign=proof-scale&utm_content=signals-a#performance"
    );
    expect(url).not.toContain("luxquant.tw/performance?");
  });

  it("normalizes labels for links and dashboards", () => {
    expect(telegramCampaignSlug("  VIP / Proof #1  ")).toBe("vip-proof-1");
  });
});
