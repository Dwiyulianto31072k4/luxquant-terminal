// src/components/autotrade/SignalsQueue.jsx
import { useState, useEffect } from "react";
import CoinLogo from "../CoinLogo";

function fmtNum(n, d = 4) {
  if (n === null || n === undefined) return "-";
  return Number(n).toFixed(d);
}

/**
 * Signals Queue — shows latest incoming signals from /api/v1/signals
 * Used to preview what the autotrade engine would evaluate.
 */
export default function SignalsQueue() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      // Reuse existing signals API
      const resp = await fetch("/api/v1/signals/bulk-7d?limit=50", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      // Latest 20 open signals
      const items = (data.items || data.signals || data || [])
        .filter((s) => (s.status || "").toLowerCase() === "open")
        .slice(0, 20);
      setSignals(items);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (loading && signals.length === 0) {
    return (
      <div className="text-center py-12 bg-bg-card rounded-xl border border-white/5">
        <div className="w-8 h-8 border-2 border-gold-primary/20 border-t-gold-primary rounded-full animate-spin mx-auto mb-2" />
        <p className="text-text-muted text-sm">Loading signals queue…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 bg-red-500/5 rounded-xl border border-red-500/20">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (signals.length === 0) {
    return (
      <div className="text-center py-12 bg-bg-card rounded-xl border border-white/5">
        <p className="text-text-muted text-sm">No pending signals</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-xs text-text-muted">
          Latest open signals · auto-refresh every 30s
        </p>
        <button
          onClick={load}
          className="text-xs text-gold-primary hover:text-gold-light flex items-center gap-1"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m0 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      <div className="grid gap-2">
        {signals.map((s) => (
          <div
            key={s.signal_id}
            className="bg-bg-card border border-white/5 rounded-xl p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3 min-w-0">
              <CoinLogo pair={s.pair} size={36} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-semibold text-sm truncate">{s.pair}</p>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase bg-green-500/15 text-green-400 border border-green-500/20">
                    BUY
                  </span>
                  {s.risk_level && (
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                        s.risk_level.toLowerCase() === "high"
                          ? "bg-red-500/15 text-red-400"
                          : s.risk_level.toLowerCase() === "medium"
                          ? "bg-yellow-500/15 text-yellow-400"
                          : "bg-green-500/15 text-green-400"
                      }`}
                    >
                      {s.risk_level}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-muted mt-0.5">
                  Entry: {fmtNum(s.entry, 6)} · SL: {fmtNum(s.stop1, 6)}
                </p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[10px] text-text-muted">
                {s.created_at ? new Date(s.created_at).toLocaleTimeString() : ""}
              </p>
              <p className="text-xs text-gold-primary font-semibold">
                TP1: {fmtNum(s.target1, 6)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
