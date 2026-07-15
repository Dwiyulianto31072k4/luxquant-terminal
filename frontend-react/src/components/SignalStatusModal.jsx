// ════════════════════════════════════════════════════════════════
// GlobalSignalModalHost — coin "called" status modal.
// Mobile: bottom sheet (handle + slide-up). Desktop: centered card.
// Footer actions always sticky so Open signal is never clipped by
// the app bottom nav or short viewports.
// ════════════════════════════════════════════════════════════════
import { useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CoinLogo from "./CoinLogo";
import { SignalStatusContext, STATUS_META, timeAgo } from "../context/SignalStatusContext";

const fmtPrice = (v) => {
  if (!v && v !== 0) return "—";
  const n = Number(v);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(4);
  return n.toPrecision(3);
};
const fmtPct0 = (v) => (v == null ? "—" : (v >= 0 ? "+" : "") + Number(v).toFixed(0) + "%");

/** Compact row: label left · value right (aligned columns in a 2-col grid). */
function Stat({ label, val, tone }) {
  return (
    <div className="flex min-h-[40px] items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-2">
      <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.14em] text-text-muted/80">
        {label}
      </span>
      <span className={`min-w-0 truncate text-right font-mono text-[12.5px] font-semibold tabular-nums ${tone || "text-white"}`}>
        {val}
      </span>
    </div>
  );
}

function SheetShell({ onClose, children, ariaLabel, footer }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className="relative flex w-full max-w-[420px] max-h-[min(88dvh,640px)] flex-col animate-[ssSheetIn_.3s_cubic-bezier(.16,1,.3,1)] rounded-t-3xl border-t border-white/10 bg-[#0c0a07] shadow-[0_-16px_48px_rgba(0,0,0,0.55)] sm:max-h-[min(85vh,640px)] sm:animate-[ssPanelIn_.28s_cubic-bezier(.16,1,.3,1)] sm:rounded-2xl sm:border sm:border-gold-primary/25 sm:bg-[#0a0805] sm:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-2.5 pb-0.5 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <span className="pointer-events-none absolute inset-x-0 top-0 hidden h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent sm:block" />

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {/* Sticky footer — always visible */}
        {footer && (
          <div className="shrink-0 border-t border-white/[0.08] bg-[#0c0a07]/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:bg-[#0a0805]/95 sm:px-5 sm:pb-4">
            {footer}
          </div>
        )}
      </div>
      <style>{`
        @keyframes ssSheetIn {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes ssPanelIn {
          from { opacity: 0; transform: translateY(12px) scale(.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

export default function GlobalSignalModalHost() {
  const ctx = useContext(SignalStatusContext);
  const navigate = useNavigate();
  if (!ctx?.modalPair) return null;

  const pair = ctx.modalPair;
  const sym = pair.replace(/USDT$/i, "");
  const info = ctx.map?.[pair];
  const close = () => ctx.closeModal();

  if (!info) {
    return (
      <SheetShell
        onClose={close}
        ariaLabel={`${sym} signal status`}
        footer={
          <button
            type="button"
            onClick={close}
            className="w-full rounded-xl bg-gold-primary py-3 font-mono text-[12px] font-bold uppercase tracking-wider text-[#1a1206] active:scale-[0.98]"
          >
            Done
          </button>
        }
      >
        <div className="px-4 pt-2 sm:px-5 sm:pt-4">
          <div className="flex items-center gap-3">
            <CoinLogo pair={pair} size={32} />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-white">{sym}</div>
              <div className="font-mono text-[10px] text-text-muted">{pair}</div>
            </div>
            <button
              onClick={close}
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-text-muted hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p className="mt-3 pb-3 text-[12px] leading-relaxed text-text-muted">
            No active LuxQuant call for this pair in the last 7 days.
          </p>
        </div>
      </SheetShell>
    );
  }

  const s = info.item || {};
  const st = STATUS_META[info.status] || { label: (info.status || "—").toUpperCase(), color: "#9ca3af", desc: "" };
  const ago = timeAgo(info.created);
  const calledAbs = info.created ? new Date(info.created).toLocaleString() : null;
  const dir = s.signal_direction || s.v3?.direction || null;
  const risk = s.risk_norm || s.risk_level || null;

  const openFull = () => {
    close();
    if (info.signal_id) navigate(`/signals?signal=${info.signal_id}`);
  };

  // Fixed 2-col compact stats (always even grid)
  const stats = [
    {
      label: "Max Target",
      val: s.max_target_pct == null ? "—" : "+" + Number(s.max_target_pct).toFixed(0) + "%",
      tone: "text-emerald-400",
    },
    {
      label: "Peak Reached",
      val: s.peak_pct == null ? "—" : fmtPct0(s.peak_pct),
      tone: s.peak_pct == null ? "text-white" : s.peak_pct >= 0 ? "text-positive" : "text-negative",
    },
    { label: "Entry", val: s.entry ? fmtPrice(s.entry) : "—", tone: "text-white" },
    s.vs_avwap_pct != null
      ? {
          label: "vs Call VWAP",
          val: fmtPct0(s.vs_avwap_pct),
          tone: s.vs_avwap_pct >= 0 ? "text-positive" : "text-negative",
        }
      : { label: "vs Call VWAP", val: "—", tone: "text-text-muted" },
    s.beta_30d != null
      ? { label: "Beta 30d", val: Number(s.beta_30d).toFixed(2), tone: "text-white" }
      : null,
    calledAbs
      ? { label: "Called At", val: new Date(info.created).toLocaleDateString(), tone: "text-white" }
      : null,
    info.n > 1 ? { label: "Active Calls", val: String(info.n), tone: "text-gold-primary" } : null,
  ].filter(Boolean);

  // Pad to even count so last row stays aligned
  if (stats.length % 2 === 1) {
    stats.push({ label: "—", val: "—", tone: "text-transparent" });
  }

  return (
    <SheetShell
      onClose={close}
      ariaLabel={`${sym} signal status`}
      footer={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openFull}
            className="flex-1 rounded-xl bg-gold-primary py-3 text-[13px] font-bold text-[#17110a] transition-colors hover:brightness-105 active:scale-[0.99]"
          >
            Open full signal →
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-xl border border-white/12 px-4 py-3 text-[13px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="px-4 pt-1 sm:px-5 sm:pt-4">
        {/* Header row — compact */}
        <div className="flex items-center gap-2.5">
          <CoinLogo pair={pair} size={34} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[16px] font-semibold leading-none text-white">{sym}</span>
              <span className="font-mono text-[10px] text-text-muted">{pair}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {dir && (
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider ${
                    dir === "BULLISH"
                      ? "border-positive/40 text-positive"
                      : dir === "BEARISH"
                        ? "border-negative/40 text-negative"
                        : "border-white/15 text-white/60"
                  }`}
                >
                  {dir}
                </span>
              )}
              {risk && (
                <span className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-white/55">
                  {risk} risk
                </span>
              )}
              {s.is_decoupled && (
                <span className="rounded border border-gold-primary/30 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-gold-primary">
                  btc-decoupled
                </span>
              )}
            </div>
          </div>
          <button
            onClick={close}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-text-muted hover:border-white/25 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Status banner — compact */}
        <div
          className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2.5"
          style={{ background: `${st.color}14`, border: `1px solid ${st.color}44` }}
        >
          <span className="font-mono text-[14px] font-bold tracking-wider" style={{ color: st.color }}>
            {st.label}
          </span>
          <span className="ml-auto text-right">
            <span className="block font-mono text-[7.5px] uppercase tracking-[0.15em] text-text-muted/70">called</span>
            <span className="font-mono text-[12px] text-white/90" title={calledAbs || ""}>
              {ago || "—"}
            </span>
          </span>
        </div>

        {/* Stats — 2 equal columns, label|value aligned */}
        <div className="mt-3 grid grid-cols-2 gap-1.5 pb-3">
          {stats.map((row, i) => (
            <Stat key={`${row.label}-${i}`} label={row.label} val={row.val} tone={row.tone} />
          ))}
        </div>
      </div>
    </SheetShell>
  );
}
