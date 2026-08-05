// One GET, however many components ask for it.
//
// Sections of the landing page are independent by design, which is right, but
// it means two of them can want the same endpoint at the same moment and each
// issue its own request. That was measured on the live page: edge-lab fetched
// twice, ~2.3s each, for one answer.
//
// Keyed by URL and held only while the request is in flight, plus a short
// window after, so this is a request de-duplicator and not a data cache — a
// later mount still gets fresh data.
const inflight = new Map();
const HOLD_MS = 30_000;

export function sharedGet(url) {
  const hit = inflight.get(url);
  if (hit) return hit;

  const p = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .finally(() => {
      // Keep it briefly so sections that mount a beat apart still share it,
      // then let it go so the data cannot go stale behind a long-lived page.
      setTimeout(() => inflight.delete(url), HOLD_MS);
    });

  inflight.set(url, p);
  return p;
}

export default sharedGet;
