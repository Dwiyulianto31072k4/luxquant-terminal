// src/components/edgelab/SignalDrillDrawer.jsx
// ════════════════════════════════════════════════════════════════
// Reusable Level-2 drill drawer for Edge Lab.
//   · Slides in from the right (portal → document.body, high z-index)
//   · Fetches edgeLabApi.getDrill(bucket.dimension, bucket.key, days, sector)
//   · Lists each signal: pair, outcome badge, peak%, resolved date
//   · Row click → onOpenSignal(signalId)  (Level 3 = SignalModal, owned by parent)
//
// Used by all 5 tabs — only the bucket {dimension, key, label} differs.
// ════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import CoinLogo from "../CoinLogo";
import edgeLabApi from "../../services/edgeLabApi";

const OUTCOME_STYLE = {
  tp4: { label: "TP4", c: "#10b981", bg: "rgba(16,185,129,0.16)" },
  tp3: { label: "TP3", c: "#34d399", bg: "rgba(16,185,129,0.13)" },
  tp2: { label: "TP2", c: "#6ee7b7", bg: "rgba(16,185,129,0.10)" },
  tp1: { label: "TP1", c: "#a7f3d0", bg: "rgba(16,185,129,0.08)" },
  sl:  { label: "SL",  c: "#ef4444", bg: "rgba(239,68,68,0.15)" },
};

const OutcomeBadge = ({ outcome }) => {
  const s = OUTCOME_STYLE[outcome] || { label: outcome || "—", c: "#888", bg: "rgba(255,255,255,0.06)" };
  return (
    <span
      className="inline-flex items-center rounded-sm font-mono uppercase tracking-wider"
      style={{ color: s.c, background: s.bg, border: `1px solid ${s.c}40`, padding: "1px 7px", fontSize: 9 }}
    >
      {s.label}
    </span>
  );
};

const fmtPair = (pair) => (pair || "").replace(/USDT$/i, "");
const fmtTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const SignalDrillDrawer = ({ bucket, days, sector, onClose, onOpenSignal }) => {
  const open = !!bucket;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const load = useCallback(async () => {
    if (!bucket) return;
    setLoading(true);
    setError(null);
    setPayload(null);
    try {
      const res = await edgeLabApi.getDrill(bucket.dimension, bucket.key, days, sector);
      setPayload(res);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Failed to load signals");
    } finally {
      setLoading(false);
    }
  }, [bucket, days, sector]);

  useEffect(() => { if (open) load(); }, [open, load]);

  if (!open) return null;

  const signals = payload?.signals || [];
  const total = payload?.count ?? bucket.total ?? signals.length;
  const wins = payload?.wins ?? bucket.wins;
  const wr = bucket.win_rate ?? payload?.win_rate ?? null;

  return createPortal(
    <div className="fixed inset-0 z-[150000]">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-[fadeIn_120ms_ease-out]"
        onClick={onClose}
      />

      {/* panel */}
      <div className="absolute top-0 right-0 h-full w-full sm:w-[440px] bg-[#0a0805] border-l border-white/[0.08] shadow-2xl flex flex-col animate-[slideInRight_180ms_cubic-bezier(0.16,1,0.3,1)]">
        <div className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-gold-primary/40 to-transparent" />

        {/* header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] tracking-[0.22em] font-mono uppercase text-gold-primary/60 mb-1">
                Signals · {bucket.dimension.replace(/_/g, " ")}
              </div>
              <div className="text-base font-display text-white/95 leading-tight truncate">{bucket.label}</div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-7 h-7 rounded-md border border-white/[0.08] text-white/50 hover:text-white hover:border-white/25 transition flex items-center justify-center text-sm"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-3 mt-3 text-[11px] font-mono tabular-nums">
            <span className="text-white/55">{total} resolved</span>
            {wr != null && (
              <span className={wr >= 60 ? "text-emerald-400" : wr >= 50 ? "text-white/70" : "text-red-400"}>
                {wr.toFixed(0)}% WR
              </span>
            )}
            {wins != null && <span className="text-white/35">{wins}W</span>}
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-4 space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-[52px] rounded-lg bg-white/[0.02] border border-white/[0.05] animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="m-4 rounded-lg border border-red-500/20 bg-red-500/[0.04] p-4 text-sm text-red-300">
              {error}
              <button onClick={load} className="block mt-2 text-[11px] font-mono uppercase tracking-wider text-red-300/70 hover:text-red-300">
                ↻ Retry
              </button>
            </div>
          )}

          {!loading && !error && signals.length === 0 && (
            <div className="py-16 text-center text-white/30 text-sm font-mono uppercase tracking-wider">No signals</div>
          )}

          {!loading && !error && signals.length > 0 && (
            <div className="p-3 space-y-1.5">
              {signals.map((s) => {
                const peak = s.peak_pct;
                return (
                  <button
                    key={s.signal_id}
                    onClick={() => onOpenSignal?.(s.signal_id, s)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-gold-primary/25 transition text-left group"
                  >
                    <CoinLogo pair={s.pair} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-white/90 truncate">{fmtPair(s.pair)}</span>
                        <OutcomeBadge outcome={s.outcome} />
                      </div>
                      <div className="text-[10px] font-mono text-white/35 mt-0.5">{fmtTime(s.hit_date)}</div>
                    </div>
                    {peak != null && (
                      <span className={`font-mono tabular-nums text-sm shrink-0 ${peak >= 0 ? "text-emerald-400/90" : "text-red-400/90"}`}>
                        {peak >= 0 ? "+" : ""}{peak.toFixed(1)}%
                      </span>
                    )}
                    <span className="text-white/20 group-hover:text-gold-primary/60 transition text-xs shrink-0">›</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>,
    document.body
  );
};

export default SignalDrillDrawer;
