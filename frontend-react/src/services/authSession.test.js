import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import axios, { AxiosError } from "axios";

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let events;
let refreshCalls;
let refreshAnswer;
let seen;

// The server: /auth/refresh answers `refreshAnswer`; every other /api/ path
// accepts only the token "new", /public/ answers 401 to anyone.
function server(input, init = {}) {
  const url = new URL(typeof input === "string" ? input : input.url, "https://luxquant.tw");
  const auth = new Headers(init.headers).get("Authorization");
  seen.push(`${url.pathname} ${auth || "-"}`);
  if (url.pathname === "/api/v1/auth/refresh") {
    refreshCalls += 1;
    return Promise.resolve(refreshAnswer());
  }
  if (url.pathname.startsWith("/cryptobot/")) return Promise.resolve(json(401, {}));
  return Promise.resolve(auth === "Bearer new" ? json(200, { ok: true }) : json(401, {}));
}

async function load(tokens = { access_token: "old", refresh_token: "r1" }) {
  vi.resetModules();
  vi.stubGlobal("localStorage", memoryStorage(tokens));
  vi.stubGlobal("location", { href: "https://luxquant.tw/signals", origin: "https://luxquant.tw" });
  vi.stubGlobal("dispatchEvent", (e) => events.push(e.type));
  const target = { fetch: vi.fn(server) };
  const mod = await import("./authSession");
  mod.installFetchAuthRefresh(target);
  return { mod, fetch: (...a) => target.fetch(...a) };
}

beforeEach(() => {
  events = [];
  refreshCalls = 0;
  seen = [];
  refreshAnswer = () => json(200, { access_token: "new", refresh_token: "r2" });
});
afterEach(() => vi.unstubAllGlobals());

describe("fetch wrapper", () => {
  it("refreshes an expired session once and retries the request", async () => {
    const { fetch } = await load();
    const res = await fetch("/api/v1/terminal/screener", { headers: { Authorization: "Bearer old" } });
    expect(res.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(localStorage.getItem("access_token")).toBe("new");
    expect(localStorage.getItem("refresh_token")).toBe("r2");
    expect(seen.at(-1)).toBe("/api/v1/terminal/screener Bearer new");
  });

  it("shares one refresh between a burst of 401s", async () => {
    const { fetch } = await load();
    const h = { headers: { Authorization: "Bearer old" } };
    const all = await Promise.all(
      ["/api/v1/workspace/growth/overview", "/api/v1/workspace/growth/at-risk", "/api/v1/watchlist/ids"].map(
        (u) => fetch(u, h)
      )
    );
    expect(all.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(refreshCalls).toBe(1);
  });

  it("reuses a token another request already refreshed", async () => {
    const { fetch } = await load({ access_token: "new", refresh_token: "r2" });
    const res = await fetch("/api/v1/chat/unread-count", { headers: { Authorization: "Bearer old" } });
    expect(res.status).toBe(200);
    expect(refreshCalls).toBe(0);
  });

  it("leaves anonymous and non-API requests alone", async () => {
    const { fetch } = await load();
    expect((await fetch("/api/public/v1/signals")).status).toBe(401);
    expect(
      (await fetch("/cryptobot/api/v1/me", { headers: { Authorization: "Bearer bot" } })).status
    ).toBe(401);
    expect(refreshCalls).toBe(0);
    expect(localStorage.getItem("access_token")).toBe("old");
  });

  it("never retries the sign-in and refresh endpoints", async () => {
    const { fetch } = await load();
    const res = await fetch("/api/v1/auth/logout", {
      method: "POST",
      headers: { Authorization: "Bearer old" },
    });
    expect(res.status).toBe(401);
    expect(refreshCalls).toBe(0);
  });

  it("ends the session once when the server rejects the refresh", async () => {
    refreshAnswer = () => json(401, { detail: "Refresh token is invalid or expired" });
    const { fetch } = await load();
    const h = { headers: { Authorization: "Bearer old" } };
    const all = await Promise.all([
      fetch("/api/v1/auth/me", h),
      fetch("/api/v1/notifications/unread-count", h),
      fetch("/api/v1/chat/unread-count", h),
    ]);
    expect(all.map((r) => r.status)).toEqual([401, 401, 401]);
    expect(refreshCalls).toBe(1);
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(events).toEqual(["lq:session-expired"]);
  });

  it("keeps the session when the refresh call itself fails", async () => {
    refreshAnswer = () => json(502, {});
    const { fetch } = await load();
    const res = await fetch("/api/v1/auth/me", { headers: { Authorization: "Bearer old" } });
    expect(res.status).toBe(401);
    expect(localStorage.getItem("refresh_token")).toBe("r1");
    expect(events).toEqual([]);
  });

  it("does not revive a session the user signed out of mid-refresh", async () => {
    let release;
    refreshAnswer = () =>
      new Promise((r) => {
        release = () => r(json(200, { access_token: "new", refresh_token: "r2" }));
      });
    const { fetch } = await load();
    const pending = fetch("/api/v1/auth/me", { headers: { Authorization: "Bearer old" } });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    release();
    expect((await pending).status).toBe(401);
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(events).toEqual([]);
  });
});

describe("axios instances", () => {
  async function client(tokens) {
    const { mod } = await load(tokens);
    const instance = axios.create({
      baseURL: "/api/v1",
      adapter: (config) => {
        const auth = config.headers.get("Authorization");
        seen.push(`${config.url} ${auth || "-"}`);
        if (auth === "Bearer new") {
          return Promise.resolve({ data: { ok: true }, status: 200, statusText: "OK", headers: {}, config });
        }
        const response = { data: {}, status: 401, statusText: "Unauthorized", headers: {}, config };
        return Promise.reject(new AxiosError("401", "ERR_BAD_REQUEST", config, null, response));
      },
    });
    instance.interceptors.request.use((c) => {
      const t = localStorage.getItem("access_token");
      if (t) c.headers.Authorization = `Bearer ${t}`;
      return c;
    });
    mod.attachAuthRefresh(instance);
    return instance;
  }

  it("retries once after a shared refresh", async () => {
    const api = await client();
    const res = await api.get("/signals/coin-intel");
    expect(res.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(seen.filter((s) => s.startsWith("/signals/"))).toEqual([
      "/signals/coin-intel Bearer old",
      "/signals/coin-intel Bearer new",
    ]);
  });

  it("does not refresh for a caller that sent no token", async () => {
    const api = await client({});
    await expect(api.get("/watchlist/ids")).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls).toBe(0);
    expect(events).toEqual([]);
  });
});
