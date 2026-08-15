import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestTelegramWriteAccess } from "./telegramWriteAccess";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
  };
}

describe("requestTelegramWriteAccess", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true }))
    );
    localStorage.setItem("access_token", "token");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("stays silent outside a signed Mini App", async () => {
    vi.stubGlobal("window", { location: { hash: "", pathname: "/performance" } });
    const result = await requestTelegramWriteAccess({ trigger: "proof_watch_saved" });
    expect(result.status).toBe("unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tracks the native prompt and verifies delivery after permission", async () => {
    const requestWriteAccess = vi.fn((callback) => callback(true));
    vi.stubGlobal("window", {
      location: { hash: "", pathname: "/performance" },
      Telegram: {
        WebApp: {
          initData: "signed-init-data",
          initDataUnsafe: { user: {} },
          requestWriteAccess,
        },
      },
    });

    const result = await requestTelegramWriteAccess({ trigger: "proof_watch_saved" });
    expect(requestWriteAccess).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "allowed", verified: true });
    const urls = fetch.mock.calls.map(([url]) => url);
    expect(urls.filter((url) => url === "/api/v1/growth/event")).toHaveLength(2);
    expect(urls).toContain("/api/v1/auth/telegram/write-access/confirm");
  });

  it("records cancellation without attempting a confirmation DM", async () => {
    vi.stubGlobal("window", {
      location: { hash: "", pathname: "/performance" },
      Telegram: {
        WebApp: {
          initData: "signed-init-data",
          initDataUnsafe: { user: {} },
          requestWriteAccess: (callback) => callback(false),
        },
      },
    });

    const result = await requestTelegramWriteAccess({ trigger: "entry_alert_armed" });
    expect(result).toEqual({ status: "cancelled", verified: false });
    const urls = fetch.mock.calls.map(([url]) => url);
    expect(urls).not.toContain("/api/v1/auth/telegram/write-access/confirm");
  });
});
