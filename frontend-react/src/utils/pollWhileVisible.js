/** Poll `fn` every `ms` only while the tab is visible. Phones in a pocket
 * otherwise keep hitting Cloudflare SIN → 522 on unread/ingest endpoints.
 *
 * `onFocus` also polls when the window regains focus (a window beside another
 * one never goes hidden). Coming back to a tab can fire three triggers in the
 * same instant — visibilitychange, focus and, after a laptop sleeps, the
 * overdue interval tick — and each used to send its own request: the logs
 * showed unread-count three times in one second. One call answers them all. */
export function pollWhileVisible(fn, ms, { immediate = true, onFocus = false } = {}) {
  if (typeof document === "undefined") return () => {};
  const minGap = Math.min(2000, ms);
  let last = -Infinity;
  let id = null;
  const run = () => {
    const now = Date.now();
    if (now - last < minGap) return;
    last = now;
    fn();
  };
  const tick = () => {
    if (document.visibilityState === "visible") run();
  };
  const start = () => {
    if (id != null) return;
    id = setInterval(tick, ms);
  };
  const stop = () => {
    if (id == null) return;
    clearInterval(id);
    id = null;
  };
  const onVis = () => {
    if (document.visibilityState === "visible") {
      run();
      start();
    } else {
      stop();
    }
  };
  if (immediate) run();
  if (document.visibilityState === "visible") start();
  document.addEventListener("visibilitychange", onVis);
  if (onFocus) window.addEventListener("focus", tick);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVis);
    if (onFocus) window.removeEventListener("focus", tick);
  };
}
