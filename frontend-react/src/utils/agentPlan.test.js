import { describe, it, expect } from "vitest";
import { planAllowsAgent, planName, planRefusalReason, planSpanDays } from "./agentPlan";

const days = (n) => ({
  subscription_granted_at: "2026-01-01T00:00:00Z",
  subscription_expires_at: new Date(Date.parse("2026-01-01T00:00:00Z") + n * 86400000).toISOString(),
});

describe("who the Agent is available to", () => {
  it("admits Annual and Lifetime", () => {
    expect(planAllowsAgent({ subscription_tier: "yearly", role: "subscriber" })).toBe(true);
    expect(planAllowsAgent({ subscription_tier: "lifetime", role: "subscriber" })).toBe(true);
  });

  it("refuses Monthly — the whole point of the gate", () => {
    expect(planAllowsAgent({ subscription_tier: "monthly", role: "subscriber" })).toBe(false);
  });

  it("judges a custom plan on its SPAN, not its label", () => {
    // The real account: granted 2026-07-18, expires 2027-05-02 = 288 days.
    expect(planAllowsAgent({ subscription_tier: "custom", role: "subscriber", ...days(288) })).toBe(false);
    expect(planAllowsAgent({ subscription_tier: "custom", role: "subscriber", ...days(365) })).toBe(true);
    expect(planAllowsAgent({ subscription_tier: "custom", role: "subscriber", ...days(400) })).toBe(true);
    // No end date on a custom grant = never expires = at least a year.
    expect(planAllowsAgent({ subscription_tier: "custom", role: "subscriber" })).toBe(true);
  });

  it("refuses a missing or unknown tier rather than guessing", () => {
    expect(planAllowsAgent({ subscription_tier: null, role: "free" })).toBe(false);
    expect(planAllowsAgent({ subscription_tier: "weekly", role: "subscriber" })).toBe(false);
    expect(planAllowsAgent(null)).toBe(false);
  });

  it("lets staff through so they can support the feature", () => {
    expect(planAllowsAgent({ subscription_tier: "monthly", role: "admin" })).toBe(true);
    expect(planAllowsAgent({ subscription_tier: null, role: "co_admin" })).toBe(true);
  });
});

describe("what the refusal tells the user", () => {
  it("names the plan they are actually on", () => {
    expect(planName({ subscription_tier: "monthly" })).toBe("Monthly");
    expect(planName({ subscription_tier: "lifetime" })).toBe("Lifetime");
    expect(planName({ subscription_tier: "custom", ...days(288) })).toBe("Custom (288 days)");
    expect(planName({ role: "free" })).toBe("Free");
  });

  it("says why, in terms of that plan", () => {
    expect(planRefusalReason({ subscription_tier: "monthly" })).toMatch(/Monthly covers/);
    expect(planRefusalReason({ subscription_tier: "custom", ...days(288) })).toMatch(/288 days/);
  });

  it("measures the span from grant to expiry", () => {
    expect(planSpanDays(days(288))).toBe(288);
    expect(planSpanDays({})).toBe(null);
  });
});
