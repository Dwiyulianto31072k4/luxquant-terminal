// src/services/chatTransport.js
//
// The swap seam between "how messages arrive" and "what the UI does with
// them". Today this is polling. A WebSocket implementation slots in behind the
// same createTransport() contract without the panel or the hook changing.
//
// Contract:
//   createTransport({ fetchSince, onBatch, onError })
//     fetchSince(cursor) -> Promise<{ messages, last_seq }>   (caller-supplied)
//     onBatch(messages, meta)                                 (called by us)
//   returns { start(cursorFn), stop(), poke() }
//
// The caller owns the cursor. We ask for it on every tick rather than caching
// it, so an optimistic send that advances the cursor mid-flight can't make us
// re-request messages the UI already has.

// Poll only as fast as a human notices. Hidden tabs slow down instead of
// stopping so a background tab still has a warm thread when you return.
const VISIBLE_MS = 4000;
const HIDDEN_MS = 30000;

export function createTransport({ fetchSince, onBatch, onError }) {
  let timer = null;
  let running = false;
  let inFlight = false;
  let getCursor = () => 0;

  const interval = () =>
    typeof document !== "undefined" && document.visibilityState === "hidden"
      ? HIDDEN_MS
      : VISIBLE_MS;

  const tick = async () => {
    // Never stack requests: a slow response on a bad connection would
    // otherwise queue up a burst that all lands at once.
    if (!running || inFlight) return;
    inFlight = true;
    try {
      const data = await fetchSince(getCursor());
      if (!running) return;
      const messages = data?.messages || [];
      if (messages.length) {
        onBatch(messages, { last_seq: data.last_seq, status: data.status });
      } else if (data?.status) {
        onBatch([], { last_seq: data.last_seq, status: data.status });
      }
    } catch (e) {
      if (onError) onError(e);
    } finally {
      inFlight = false;
    }
  };

  const schedule = () => {
    clearTimeout(timer);
    if (!running) return;
    timer = setTimeout(async () => {
      await tick();
      schedule();
    }, interval());
  };

  // Coming back to the tab should feel instant, not "up to 30s stale".
  const onVisibility = () => {
    if (!running) return;
    if (document.visibilityState === "visible") poke();
    else schedule();
  };

  function start(cursorFn) {
    if (typeof cursorFn === "function") getCursor = cursorFn;
    if (running) return;
    running = true;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    schedule();
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    timer = null;
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", onVisibility);
  }

  // Fetch now and restart the clock — used after sending, and on refocus.
  function poke() {
    if (!running) return;
    clearTimeout(timer);
    tick().finally(schedule);
  }

  return { start, stop, poke };
}

export default createTransport;
