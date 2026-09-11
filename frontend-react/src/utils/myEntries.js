// Your own fill per call, remembered in this browser.
//
// It is one person's position: it never leaves the device, and no account owns
// it. That also means it can vanish — a private window, cleared site data, a
// different browser — so every read is wrapped and every caller must render
// correctly with nothing stored.
//
// The modal writes it and the desk reads it, so a plain localStorage write is
// not enough: `storage` only fires in OTHER tabs, never the one that wrote.
// A same-tab event carries the change to the table beside it.

const PREFIX = "lq:signal:my-entry:";
export const MY_ENTRY_EVENT = "lq:my-entry-changed";

const key = (signalId) => `${PREFIX}${signalId}`;

export function readMyEntry(signalId) {
  if (!signalId) return null;
  try {
    const raw = localStorage.getItem(key(signalId));
    if (!raw) return null;
    const n = Number(String(raw).replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeMyEntry(signalId, value) {
  if (!signalId) return;
  try {
    const trimmed = String(value ?? "").trim();
    if (trimmed) localStorage.setItem(key(signalId), trimmed);
    else localStorage.removeItem(key(signalId));
  } catch {
    /* storage unavailable — the figure still works for this session */
  }
  try {
    window.dispatchEvent(new CustomEvent(MY_ENTRY_EVENT, { detail: { signalId } }));
  } catch {
    /* no window (SSR / tests) */
  }
}

/** Every saved fill, as { [signalId]: number }. */
export function readAllMyEntries() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      const n = Number(String(localStorage.getItem(k)).replace(",", "."));
      if (Number.isFinite(n) && n > 0) out[k.slice(PREFIX.length)] = n;
    }
  } catch {
    /* storage unavailable */
  }
  return out;
}

/** Price change from your fill, in percent. Short calls invert, exactly as the
 *  modal's own badge does — a short that fell is up. */
export function myEntryPnl(myEntry, livePrice, isShort = false) {
  if (!(myEntry > 0) || !(livePrice > 0)) return null;
  const raw = ((livePrice - myEntry) / myEntry) * 100;
  return isShort ? -raw : raw;
}
