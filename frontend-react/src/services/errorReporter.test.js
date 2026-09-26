import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { describeError, reportClientError, _resetReporter } from "./errorReporter";

const crash = (message, frame = "at SignalModal (https://luxquant.tw/assets/SignalModal-Ab12Cd34.js:1:2)") => {
  const e = new TypeError(message);
  e.stack = `TypeError: ${message}\n    ${frame}`;
  return e;
};

beforeEach(() => {
  _resetReporter();
  vi.stubGlobal("location", { href: "https://luxquant.tw/signals?signal=abc" });
  vi.stubGlobal("localStorage", { getItem: () => "tok" });
});
afterEach(() => vi.unstubAllGlobals());

describe("describeError", () => {
  it("describes a render crash with its component stack", () => {
    const r = describeError(crash("Cannot read properties of undefined (reading 'toFixed')"), {
      kind: "boundary",
      componentStack: "\n    at SignalModal\n    at App",
    });
    expect(r).toMatchObject({
      kind: "boundary",
      message: "Cannot read properties of undefined (reading 'toFixed')",
      url: "https://luxquant.tw/signals?signal=abc",
    });
    expect(r.component_stack).toContain("SignalModal");
  });

  it("skips what is noise or already handled elsewhere", () => {
    const axiosErr = Object.assign(new Error("Request failed with status code 403"), { isAxiosError: true });
    const abort = Object.assign(new Error("The user aborted a request."), { name: "AbortError" });
    const chunk = new TypeError("Failed to fetch dynamically imported module: https://luxquant.tw/assets/x.js");
    const ext = crash("boom", "at x (chrome-extension://abcdef/content.js:1:1)");
    for (const e of [
      axiosErr,
      abort,
      chunk,
      ext,
      new TypeError("Failed to fetch"),
      new Error("ResizeObserver loop completed with undelivered notifications."),
      "Script error.",
      null,
      "",
    ]) {
      expect(describeError(e)).toBeNull();
    }
  });

  it("keeps a thrown string", () => {
    expect(describeError("chart state missing").message).toBe("chart state missing");
  });
});

describe("reportClientError", () => {
  it("posts each distinct crash once, with the session token", () => {
    const send = vi.fn(() => Promise.resolve());
    expect(reportClientError(crash("a"), { kind: "boundary", force: true }, send)).toBe(true);
    expect(reportClientError(crash("a"), { kind: "boundary", force: true }, send)).toBe(false);
    expect(reportClientError(crash("b"), { kind: "boundary", force: true }, send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    const [url, init] = send.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/client-errors$/);
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toMatchObject({ kind: "boundary", message: "a" });
  });

  it("stops after ten reports on one page", () => {
    const send = vi.fn(() => Promise.resolve());
    for (let i = 0; i < 25; i++) reportClientError(crash(`e${i}`), { force: true }, send);
    expect(send).toHaveBeenCalledTimes(10);
  });

  it("never throws, even when sending does", () => {
    const send = () => {
      throw new Error("offline");
    };
    expect(() => reportClientError(crash("c"), { force: true }, send)).not.toThrow();
  });

  it("stays quiet in development", () => {
    const send = vi.fn();
    expect(reportClientError(crash("d"), {}, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
