// src/components/autotrade/SignalsQueue.jsx
// ════════════════════════════════════════════════════════════════
// LuxQuant — AutoTrade Signals Queue v2 (Flowscan reskin)
// Latest open signals that engine evaluates
// ════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import CoinLogo from "../CoinLogo";

function fmtNum(n, d = 4) {
  if (n === null || n === undefined) return "—";
  return Number(n).toFixed(d);
}

const riskStyle = (risk) => {
  const r = (risk || "").toLowerCase();
  if (r.startsWith("high")) return "bg-red-500/10 text-red-400 border-red-500/25";
  if (r.startsWith("med") || r.startsWith("nor")) return "bg-gold-primary/10 text-gold-primary border-gold-primary/25";
  if (r.startsWith("low")) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
  return "bg-white/[0.04] text-white/70 border-white/[0.08]";
};

const riskLabel = (risk) => {
  const r = (risk || "").toLowerCase();
  if (r.startsWith("high")) return "High";
  if (r.startsWith("med") || r.startsWith("nor")) return "Normal";
  if (r.startsWith("low")) return "Low";
  return risk || "—";
};


// ════════════════════════════════════════════════════════════════
// SECTION HEADER
// ════════════════════════════════════════════════════════════════
const SectionHeader = ({ label }) => (
  <div className="flex items-center gap-3">
    <span className="h-px w-6 bg-gold-primary/40" />
    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">
      {label}
    </span>
    <span className="h-px flex-1 bg-gradient-to-r from-gold-primary/20 to-transparent" />
  </div>
);


export default function SignalsQueue() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch("/api/v1/signals/bulk-7d?limit=50", {
        headers: { Authorization: `Bearer ${localStorage.getItem("access_token") || ""}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
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

  // ── Loading ──
  if (loading && signals.length === 0) {
    return (
      <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-12 text-center">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <div className="w-8 h-8 border-2 border-gold-primary/20 border-t-gold-primary rounded-full animate-spin mx-auto mb-3" />
        <p className="text-text-muted text-[11px] font-mono uppercase tracking-[0.15em]">
          Loading signals queue…
        </p>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="relative overflow-hidden bg-red-500/[0.05] border border-red-500/25 rounded-md p-12 text-center">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
        <p className="text-red-400 text-sm font-medium mb-1">Failed to load</p>
        <p className="text-[10px] font-mono text-red-400/70">{error}</p>
      </div>
    );
  }

  // ── Empty ──
  if (signals.length === 0) {
    return (
      <div className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md p-12 text-center">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold-primary/30 to-transparent" />
        <p className="text-white text-sm font-medium mb-1">No pending signals</p>
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-text-muted">
          Engine waiting for next signal
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Header bar ── */}
      <SectionHeader label="Signals Queue" />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted">Live</span>
          </span>
          <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-muted/70">
            Auto-refresh <span className="text-white tabular-nums">30s</span>
          </span>
        </div>

        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/[0.06] text-[10px] font-mono uppercase tracking-[0.15em] text-gold-primary/80 hover:text-gold-primary hover:border-gold-primary/30 transition-all"
        >
          <svg className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m0 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Signal rows ── */}
      <div className="space-y-1.5">
        {signals.map((s) => (
          <div
            key={s.signal_id}
            className="relative overflow-hidden bg-[#0a0805] border border-white/[0.06] rounded-md hover:border-white/[0.12] transition-all"
          >
            <div className="flex items-center gap-3 p-3">
              {/* Logo */}
              <CoinLogo pair={s.pair} size={32} />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <p className="text-white font-semibold text-sm font-mono truncate">{s.pair}</p>
                  <span className="text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                    Buy
                  </span>
                  {s.risk_level && (
                    <span className={`text-[9px] font-mono uppercase tracking-[0.1em] px-1.5 py-0.5 rounded border ${riskStyle(s.risk_level)}`}>
                      {riskLabel(s.risk_level)}
                    </span>
                  )}
                </div>
                <p className="text-[10px] font-mono text-text-muted/70 tabular-nums">
                  <span className="uppercase tracking-wider text-[9px]">Entry</span>
                  <span className="ml-1 text-white/80">{fmtNum(s.entry, 6)}</span>
                  <span className="text-text-muted/40 mx-1.5">·</span>
                  <span className="uppercase tracking-wider text-[9px]">SL</span>
                  <span className="ml-1 text-red-400/80">{fmtNum(s.stop1, 6)}</span>
                </p>
              </div>

              {/* Right: TP1 + time */}
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                <p className="text-[11px] font-mono text-gold-primary font-semibold tabular-nums">
                  <span className="text-gold-primary/60 text-[9px] uppercase tracking-wider mr-1">TP1</span>
                  {fmtNum(s.target1, 6)}
                </p>
                <p className="text-[10px] font-mono text-text-muted/60 tabular-nums uppercase tracking-wider">
                  {s.created_at ? new Date(s.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
