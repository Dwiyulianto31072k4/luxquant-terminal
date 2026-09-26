/**
 * Memo for exchange reads that poll on one clock but change on many.
 *
 * SignalModal used to re-ask eleven endpoints every 15 s for as long as it was
 * open, although only the mark price, the ticker and open interest move that
 * fast — the long/short ratios are 5-minute buckets, OI history and daily
 * candles are hourly-or-slower, funding history changes every few hours. And a
 * pair a venue does not list (spot volume on a futures-only coin) answered 404
 * on every tick: 1,340 of the site's ~1,500 daily 404s were that one loop.
 *
 * `read(url, ttlMs)` serves a successful answer again until it is `ttlMs` old
 * (0 = always refetch) and remembers 400/404 for the memo's whole life — the
 * venue's listing does not change while a modal is open. Anything else (5xx,
 * 429, timeouts) is not remembered, so the next tick retries it as before.
 *
 * What it returns quacks like the Response the callers already use: `ok`,
 * `status` and a `json()` that yields the same parsed body — or rejects the
 * way a malformed body did.
 */
const PERMANENT = new Set([400, 404]);

export function createMarketMemo(fetcher, now = () => Date.now()) {
  const memo = new Map();

  const view = (entry) => ({
    ok: entry.ok,
    status: entry.status,
    json: () => (entry.parseError ? Promise.reject(entry.parseError) : Promise.resolve(entry.data)),
  });

  return async function read(url, ttlMs = 0) {
    const hit = memo.get(url);
    if (hit && (hit.permanent || now() - hit.at < ttlMs)) return view(hit);

    const res = await fetcher(url);
    const entry = { ok: res.ok, status: res.status, at: now(), data: null, parseError: null };
    if (res.ok) {
      try {
        entry.data = await res.json();
      } catch (err) {
        entry.parseError = err;
      }
      if (!entry.parseError && ttlMs > 0) memo.set(url, entry);
    } else if (PERMANENT.has(res.status)) {
      entry.permanent = true;
      memo.set(url, entry);
    }
    return view(entry);
  };
}
