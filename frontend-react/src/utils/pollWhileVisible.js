/** Poll `fn` every `ms` only while the tab is visible. Phones in a pocket
 * otherwise keep hitting Cloudflare SIN → 522 on unread/ingest endpoints. */
export function pollWhileVisible(fn, ms, { immediate = true } = {}) {
  if (typeof document === "undefined") return () => {};
  let id = null;
  const tick = () => {
    if (document.visibilityState === "visible") fn();
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
      fn();
      start();
    } else {
      stop();
    }
  };
  if (immediate) fn();
  if (document.visibilityState === "visible") start();
  document.addEventListener("visibilitychange", onVis);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVis);
  };
}
