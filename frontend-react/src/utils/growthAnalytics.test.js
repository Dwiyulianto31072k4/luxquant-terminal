import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { trackGrowth } from "./growthAnalytics";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

describe("trackGrowth", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { location: { pathname: "/pricing" } });
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
    localStorage.setItem("access_token", "test-token");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends an authenticated, user-linked milestone", () => {
    trackGrowth("plan_selected", {
      source: "pricing_page:onchain",
      entity_type: "subscription_plan",
      entity_id: 2,
      meta: { plan_name: "yearly" },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, request] = fetch.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(url).toBe("/api/v1/growth/event");
    expect(request.headers.Authorization).toBe("Bearer test-token");
    expect(body.event).toBe("plan_selected");
    expect(body.entity_id).toBe("2");
    expect(body.session_id).toBeTruthy();
  });

  it("does not emit authenticated milestones before login", () => {
    localStorage.removeItem("access_token");
    trackGrowth("pricing_viewed", { source: "pricing_page" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deduplicates session-scoped page milestones", () => {
    trackGrowth("checkout_viewed", { once: "checkout:42", entity_id: 42 });
    trackGrowth("checkout_viewed", { once: "checkout:42", entity_id: 42 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("drops events outside the canonical allowlist", () => {
    trackGrowth("made_up_event", {});
    expect(fetch).not.toHaveBeenCalled();
  });
});
