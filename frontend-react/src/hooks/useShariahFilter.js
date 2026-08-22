// src/hooks/useShariahFilter.js
// ════════════════════════════════════════════════════════════════
// One place that answers "may this pair be shown?" for Signals and the
// Terminal, so the two can never disagree about a coin.
//
// The map is fetched once per session and shared, the same shape useUiPrefs
// uses: drawing a 900-row list must not become 900 requests.
//
// Fail OPEN, deliberately. If the map cannot be loaded the lists render in
// full rather than empty. An empty desk looks like a broken product and would
// hide signals the user is paying for; showing everything is the honest
// fallback, and the banner tells them the filter is not applied.
// ════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from "react";
import useUiPrefs from "./useUiPrefs";

// What each mode is willing to show.
//   moderate — passed screening, plus disputed. `unrated` is included: the
//              engine never looked at it, and hiding a coin we have no finding
//              on would be asserting something we did not establish.
//   strict   — only what passed. Nothing else, including unrated.
const ALLOWED_MODERATE = new Set(["halal", "mashbooh", "unrated", "not_applicable"]);
const ALLOWED_STRICT = new Set(["halal"]);

let cache = null; // { statuses, counts, total }
let inflight = null;
const subs = new Set();
const notify = () => subs.forEach((fn) => fn(cache));

async function load() {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/v1/coins/shariah/map")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        cache = d && d.statuses ? d : { statuses: {}, counts: {}, total: 0 };
        notify();
        return cache;
      })
      .catch(() => {
        cache = { statuses: {}, counts: {}, total: 0 };
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
 * @returns {{
 *   enabled: boolean, strict: boolean, ready: boolean,
 *   statusOf: (pair: string) => string|null,
 *   allows: (pair: string) => boolean,
 *   filter: <T>(rows: T[], getPair: (row: T) => string) => T[],
 * }}
 */
export default function useShariahFilter() {
  const { prefs } = useUiPrefs({ shariah_mode: false, shariah_strict: false });
  const [map, setMap] = useState(cache);

  const enabled = prefs.shariah_mode === true;
  const strict = prefs.shariah_strict === true;

  useEffect(() => {
    if (!enabled) return undefined; // don't spend a request on a filter nobody turned on
    let alive = true;
    const onChange = (next) => alive && setMap({ ...next });
    subs.add(onChange);
    load();
    return () => {
      alive = false;
      subs.delete(onChange);
    };
  }, [enabled]);

  const statusOf = useCallback(
    (pair) => (map?.statuses ? map.statuses[String(pair || "").toUpperCase()] || null : null),
    [map]
  );

  const allows = useCallback(
    (pair) => {
      if (!enabled) return true;
      const status = statusOf(pair);
      // No entry at all → show it. Same reasoning as failing open: absence of
      // a finding is not a finding.
      if (!status) return true;
      return (strict ? ALLOWED_STRICT : ALLOWED_MODERATE).has(status);
    },
    [enabled, strict, statusOf]
  );

  const filter = useCallback(
    (rows, getPair) => {
      if (!enabled || !Array.isArray(rows)) return rows;
      return rows.filter((row) => allows(getPair(row)));
    },
    [enabled, allows]
  );

  return {
    enabled,
    strict,
    ready: !enabled || map !== null,
    statusOf,
    allows,
    filter,
  };
}
