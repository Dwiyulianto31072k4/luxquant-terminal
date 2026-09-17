import { describe, it, expect } from "vitest";
import { AGENT_TIERS, planAllowsAgent } from "./agentPlan";

describe("who the Agent is available to", () => {
  const on = (tier, role = "subscriber") => planAllowsAgent({ subscription_tier: tier, role });

  it("admits Annual, Lifetime and admin-granted custom plans", () => {
    expect(on("yearly")).toBe(true);
    expect(on("lifetime")).toBe(true);
    // A bespoke grant; the one account holding it runs to 2027.
    expect(on("custom")).toBe(true);
  });

  it("refuses Monthly — this is the whole point of the gate", () => {
    expect(on("monthly")).toBe(false);
  });

  it("refuses a missing or unknown tier rather than guessing", () => {
    expect(on(null)).toBe(false);
    expect(on("")).toBe(false);
    expect(on("weekly")).toBe(false);
    expect(planAllowsAgent(null)).toBe(false);
  });

  it("lets staff through so they can support the feature", () => {
    expect(on("monthly", "admin")).toBe(true);
    expect(on(null, "co_admin")).toBe(true);
  });

  it("keeps the list in step with the backend's BOT_TIERS", () => {
    // If this changes, backend/app/api/routes/autotrade_auth.py must change too.
    expect([...AGENT_TIERS].sort()).toEqual(["custom", "lifetime", "yearly"]);
  });
});
