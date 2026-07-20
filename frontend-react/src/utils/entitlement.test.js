// Pins the CALLED→signal paywall gate: who gets the signal modal, who gets
// the upgrade modal. This decision sits on the revenue path — a regression
// here either gives signals away or paywalls paying customers.
import { describe, it, expect } from "vitest";
import { isEntitled } from "./entitlement";

describe("isEntitled — the CALLED paywall decision", () => {
  it("anonymous and free users are not entitled", () => {
    expect(isEntitled(null)).toBe(false);
    expect(isEntitled(undefined)).toBe(false);
    expect(isEntitled({ role: "free" })).toBe(false);
  });

  it("server verdict is authoritative when present", () => {
    expect(isEntitled({ has_active_access: true, role: "free" })).toBe(true);
    // Explicit false must win even when the role LOOKS entitled — this is an
    // expired premium: role still 'premium', server already said no.
    expect(isEntitled({ has_active_access: false, role: "premium" })).toBe(false);
    expect(isEntitled({ has_active_access: false, role: "co_admin" })).toBe(false);
  });

  it("stale cached users (field missing) fall back to role", () => {
    for (const role of ["admin", "co_admin", "founder", "premium", "subscriber"]) {
      expect(isEntitled({ role })).toBe(true);
    }
    expect(isEntitled({ role: "free" })).toBe(false);
  });
});
