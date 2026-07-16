// ════════════════════════════════════════════════════════════════
// SignalStatusContext — one shared pair→signal map for the whole
// terminal. Provided once at the terminal shell; consumed by CoinLogo so
// EVERY coin rendered anywhere in the terminal:
//   · shows a live status dot + hover tooltip (status + when it was called)
//   · is clickable → a global signal modal (status, called-ago, Open)
// Outside the terminal the context is null → CoinLogo is unchanged.
// ════════════════════════════════════════════════════════════════
import { createContext, useContext, useEffect, useState, useCallback } from "react";

export const SignalStatusContext = createContext(null);
export const useSignalStatus = () => useContext(SignalStatusContext);

const API_BASE = import.meta.env.VITE_API_URL || "";
const authHeaders = () => {
  const tk = localStorage.getItem("access_token");
  return tk ? { Authorization: `Bearer ${tk}` } : {};
};

// status → { label, color, desc } — matches the terminal detail modal
export const STATUS_META = {
  open: { label: "OPEN", color: "#60a5fa", desc: "Live — no target hit yet" },
  tp1: { label: "TP1 HIT", color: "rgb(var(--pos))", desc: "First target reached" },
  tp2: { label: "TP2 HIT", color: "rgb(var(--pos))", desc: "Second target reached" },
  tp3: { label: "TP3 HIT", color: "rgb(var(--pos))", desc: "Third target reached" },
  closed_win: { label: "TP4 / WIN", color: "rgb(var(--accent))", desc: "Final target — closed in profit" },
  closed_loss: { label: "STOPPED OUT", color: "rgb(var(--neg))", desc: "Hit stop loss" },
};

// compact relative time, e.g. "3h ago" / "2d ago"
export function timeAgo(ts) {
  if (!ts) return null;
  const then = typeof ts === "number" ? ts : Date.parse(ts);
  if (!then || isNaN(then)) return null;
  const s = Math.max(0, (Date.now() - then) / 1000);
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = h / 24;
  return `${Math.round(d)}d ago`;
}

export function SignalStatusProvider({ children }) {
  const [map, setMap] = useState(null);
  const [modalPair, setModalPair] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/terminal/screener?days=7&scope=all`, { headers: authHeaders() });
        if (!r.ok) return;
        const j = await r.json();
        const rows = j?.items || [];
        const m = {};
        for (const s of rows) {
          if (!s?.pair) continue;
          const key = s.pair.toUpperCase();
          const status = (s.status || "open").toLowerCase();
          const created = s.created_at || s.signal_time || "";
          const prev = m[key];
          if (!prev) {
            m[key] = { status, created, n: 1, signal_id: s.signal_id, item: s };
          } else {
            prev.n += 1;
            if (created > prev.created) {
              prev.status = status; prev.created = created;
              prev.signal_id = s.signal_id; prev.item = s;
            }
          }
        }
        if (alive) setMap(m);
      } catch (_) { /* silent — hover status is a nice-to-have overlay */ }
    };
    load();
    const iv = setInterval(load, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const openPair = useCallback((pair) => { if (pair) setModalPair(pair.toUpperCase()); }, []);
  const closeModal = useCallback(() => setModalPair(null), []);

  return (
    <SignalStatusContext.Provider value={{ map, openPair, closeModal, modalPair }}>
      {children}
    </SignalStatusContext.Provider>
  );
}
