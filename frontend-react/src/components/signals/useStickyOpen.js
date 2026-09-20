// useStickyOpen — a panel remembers whether you had it open.
//
// Both flow panels start collapsed, which is right the first time and wrong
// every time after: a trader who works out of Coin flow was re-opening it on
// every page load and after every refresh. The state is a single boolean per
// panel, it is worthless to anyone else, and it must survive a private window
// with storage blocked — so it lives in localStorage behind try/catch and the
// panel renders correctly when the read comes back empty.

import { useEffect, useState } from "react";

export default function useStickyOpen(key, fallback = false) {
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? fallback : raw === "1";
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, open ? "1" : "0");
    } catch {
      /* private window, blocked storage — the panel still works */
    }
  }, [key, open]);

  return [open, setOpen];
}
