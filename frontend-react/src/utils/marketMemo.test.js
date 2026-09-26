import { describe, it, expect } from "vitest";
import { createMarketMemo } from "./marketMemo";

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => (typeof body === "string" ? Promise.reject(new SyntaxError(body)) : Promise.resolve(body)),
});

function setup(answers) {
  let t = 0;
  const calls = [];
  const read = createMarketMemo(
    (url) => {
      calls.push(url);
      const a = answers[url];
      return typeof a === "function" ? a() : Promise.resolve(a);
    },
    () => t
  );
  return { read, calls, advance: (ms) => (t += ms) };
}

describe("createMarketMemo", () => {
  it("refetches ttl 0 reads on every call", async () => {
    const { read, calls } = setup({ mark: reply(200, { markPrice: "1.5" }) });
    await read("mark", 0);
    await read("mark", 0);
    expect(calls).toEqual(["mark", "mark"]);
  });

  it("serves a fresh answer until it is ttl old", async () => {
    const { read, calls, advance } = setup({ ratio: reply(200, [{ longShortRatio: "1.2" }]) });
    const first = await read("ratio", 60_000);
    expect(await first.json()).toEqual([{ longShortRatio: "1.2" }]);
    advance(45_000);
    const again = await read("ratio", 60_000);
    expect(again.ok).toBe(true);
    expect(await again.json()).toEqual([{ longShortRatio: "1.2" }]);
    expect(calls).toHaveLength(1);
    advance(15_000);
    await read("ratio", 60_000);
    expect(calls).toHaveLength(2);
  });

  it("remembers an unlisted pair for the memo's life, even at ttl 0", async () => {
    const { read, calls, advance } = setup({ spot: reply(404, { detail: "Symbol not listed" }) });
    const first = await read("spot", 0);
    expect(first.ok).toBe(false);
    expect(first.status).toBe(404);
    advance(3_600_000);
    await read("spot", 0);
    expect(calls).toEqual(["spot"]);
  });

  it("retries transient failures on the next call", async () => {
    let n = 0;
    const { read, calls } = setup({
      oi: () => Promise.resolve(++n === 1 ? reply(502, {}) : reply(200, { openInterest: "10" })),
    });
    expect((await read("oi", 300_000)).status).toBe(502);
    const second = await read("oi", 300_000);
    expect(await second.json()).toEqual({ openInterest: "10" });
    expect(calls).toEqual(["oi", "oi"]);
  });

  it("passes network errors through untouched", async () => {
    const { read } = setup({ mark: () => Promise.reject(new TypeError("Failed to fetch")) });
    await expect(read("mark", 0)).rejects.toThrow("Failed to fetch");
  });

  it("rejects json() like the malformed body did, and does not keep it", async () => {
    const { read, calls } = setup({ fund: reply(200, "Unexpected token <") });
    const res = await read("fund", 1_800_000);
    expect(res.ok).toBe(true);
    await expect(res.json()).rejects.toThrow("Unexpected token <");
    await read("fund", 1_800_000);
    expect(calls).toHaveLength(2);
  });
});
