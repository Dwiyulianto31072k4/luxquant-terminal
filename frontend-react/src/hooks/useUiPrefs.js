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
let inflight = null; // de-dupes concurrent first loads
const subs = new Set();

const notify = () => subs.forEach((fn) => fn(cache));

const authHeaders = () => {
  const t = localStorage.getItem("access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
};

async function load() {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/v1/profile/ui-prefs", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        cache = d && typeof d === "object" ? d : {};
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
    fetch("/api/v1/profile/ui-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
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
