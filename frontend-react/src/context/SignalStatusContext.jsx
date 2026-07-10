// ════════════════════════════════════════════════════════════════
// SignalStatusContext — one shared pair→status map for the whole
// terminal. Provided once at the terminal shell; consumed by CoinLogo
// so EVERY coin rendered anywhere in the terminal shows its live signal
// status on hover (open / tp1-3 / tp4-win / sl) without each view having
// to wire it. Outside the terminal the context is null → CoinLogo is
// unchanged.
// ════════════════════════════════════════════════════════════════
import { createContext, useContext, useEffect, useState } from "react";

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
  tp1: { label: "TP1 HIT", color: "#34d399", desc: "First target reached" },
  tp2: { label: "TP2 HIT", color: "#34d399", desc: "Second target reached" },
  tp3: { label: "TP3 HIT", color: "#2dd4a0", desc: "Third target reached" },
  closed_win: { label: "TP4 / WIN", color: "#d4a853", desc: "Final target — closed in profit" },
  closed_loss: { label: "STOPPED OUT", color: "#f87171", desc: "Hit stop loss" },
};

export function SignalStatusProvider({ children }) {
  const [map, setMap] = useState(null);

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
          const created = s.created_at || "";
          const prev = m[key];
          if (!prev) {
            m[key] = { status, created, n: 1, signal_id: s.signal_id, max_target: s.max_target_pct ?? null };
          } else {
            prev.n += 1;
            if (created > prev.created) {
              prev.status = status; prev.created = created;
              prev.signal_id = s.signal_id; prev.max_target = s.max_target_pct ?? null;
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

  return <SignalStatusContext.Provider value={map}>{children}</SignalStatusContext.Provider>;
}
