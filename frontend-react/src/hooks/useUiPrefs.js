// src/hooks/useUiPrefs.js
// ════════════════════════════════════════════════════════════════
// Per-user UI preferences, persisted server-side in users.ui_prefs (JSONB)
// via GET/PUT /api/v1/profile/ui-prefs. The backend whitelists every key
// (UI_PREF_DEFAULTS in profile.py), so unknown keys are simply ignored.
//
// Shared module-level cache: the Terminal renders many components that each
// want prefs, and we only ever want ONE fetch per session. Subscribers are
// notified on change so every consumer stays in sync.
// ════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from "react";

let cache = null; // last known prefs object (null = not loaded yet)
let cacheFor = null; // the access token `cache` was loaded with
let inflight = null; // de-dupes concurrent first loads
const subs = new Set();

const notify = () => subs.forEach((fn) => fn(cache));

const storedToken = () => localStorage.getItem("access_token");

// The endpoint is signed-in only, so a visitor gets the defaults without
// asking — every signed-out /performance view used to spend a 403 on it. The
// cache is keyed to the token, so signing in (or switching account) loads the
// real prefs instead of keeping the visitor's defaults for the session.
async function load() {
  const token = storedToken();
  if (cache && cacheFor === token) return cache;
  if (!token) {
    cache = {};
    cacheFor = null;
    notify();
    return cache;
  }
  if (!inflight) {
    inflight = fetch("/api/v1/profile/ui-prefs", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        cache = d && typeof d === "object" ? d : {};
        cacheFor = token;
        notify();
        return cache;
      })
      .catch(() => {
        cache = {}; // fail open — defaults apply, UI still renders
        notify();
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * @param {Record<string, boolean>} defaults local fallbacks until load resolves
 * @returns {{prefs: object, setPref: (k: string, v: boolean) => void, ready: boolean}}
 */
export function useUiPrefs(defaults = {}) {
  const [prefs, setPrefs] = useState(cache);

  useEffect(() => {
    let alive = true;
    const onChange = (next) => alive && setPrefs({ ...next });
    subs.add(onChange);
    load();
    return () => {
      alive = false;
      subs.delete(onChange);
    };
  }, []);

  // Optimistic: flip locally first so the toggle feels instant, then persist.
  // A failed write leaves the optimistic value — the next load corrects it.
  const setPref = useCallback((key, value) => {
    cache = { ...(cache || {}), [key]: value };
    notify();
    const token = storedToken();
    if (!token) return; // a visitor's toggle lives for the visit
    fetch("/api/v1/profile/ui-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {});
  }, []);

  return {
    prefs: { ...defaults, ...(prefs || {}) },
    setPref,
    ready: prefs !== null,
  };
}

export default useUiPrefs;
