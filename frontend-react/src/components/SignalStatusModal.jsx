// ════════════════════════════════════════════════════════════════
// GlobalSignalModalHost — the one modal opened when ANY coin in the
// terminal is clicked (via CoinLogo → context.openPair). Shows the
// coin's live signal status, WHEN it was called (relative + absolute),
// key stats, and an "Open full signal" action.
//
// Mobile: bottom sheet (Top Gainers Filters style — handle, slide up).
// Desktop: centered card.
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

function Stat({ label, val, tone }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="font-mono text-[8.5px] uppercase tracking-[0.15em] text-text-muted">{label}</div>
      <div className={`mt-1 font-mono text-[15px] tabular-nums ${tone || "text-white/90"}`}>{val}</div>
    </div>
  );
}

/** Shared shell: mobile bottom sheet / desktop centered. */
function SheetShell({ onClose, children, ariaLabel }) {
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
        className="relative w-full max-w-[540px] animate-[ssSheetIn_.3s_cubic-bezier(.16,1,.3,1)] rounded-t-3xl border-t border-white/10 bg-[#0c0a07] shadow-[0_-12px_40px_rgba(0,0,0,0.55)] sm:max-h-[min(85vh,720px)] sm:animate-[ssPanelIn_.28s_cubic-bezier(.16,1,.3,1)] sm:rounded-2xl sm:border sm:border-gold-primary/25 sm:bg-[#0a0805] sm:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        <span className="pointer-events-none absolute inset-x-0 top-0 hidden h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent sm:block" />
        {children}
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
      <SheetShell onClose={close} ariaLabel={`${sym} signal status`}>
        <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2 sm:p-5 sm:pb-5">
          <div className="flex items-center gap-3">
            <CoinLogo pair={pair} size={34} />
            <div>
              <div className="text-[16px] font-semibold text-white">{sym}</div>
              <div className="font-mono text-[11px] text-text-muted">{pair}</div>
            </div>
            <button
              onClick={close}
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-text-muted hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <div className="mt-4 text-[12px] leading-relaxed text-text-muted">
            No active LuxQuant call for this pair in the last 7 days.
          </div>
          <button
            type="button"
            onClick={close}
            className="mt-5 w-full rounded-xl bg-gold-primary py-3 font-mono text-[12px] font-bold uppercase tracking-wider text-[#1a1206] active:scale-[0.98] sm:hidden"
          >
            Done
          </button>
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

  return (
    <SheetShell onClose={close} ariaLabel={`${sym} signal status`}>
      <div className="max-h-[min(88dvh,720px)] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+8px)] sm:max-h-[min(85vh,720px)] sm:pb-0">
        <div className="flex items-center gap-3 px-5 pt-2 sm:pt-5">
          <CoinLogo pair={pair} size={38} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[18px] font-semibold leading-none text-white">{sym}</span>
              <span className="font-mono text-[11px] text-text-muted">{pair}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {dir && (
                <span
                  className={`rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
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
                <span className="rounded-sm border border-white/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/60">
                  {risk} risk
                </span>
              )}
              {s.is_decoupled && (
                <span className="rounded-sm border border-gold-primary/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-gold-primary">
                  btc-decoupled
                </span>
              )}
            </div>
          </div>
          <button
            onClick={close}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-text-muted hover:border-white/25 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div
          className="mx-5 mt-4 flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ background: `${st.color}14`, border: `1px solid ${st.color}44` }}
        >
          <span className="font-mono text-[15px] font-bold tracking-wider" style={{ color: st.color }}>
            {st.label}
          </span>
          <span className="hidden text-[11px] text-text-muted sm:block">{st.desc}</span>
          <span className="ml-auto text-right">
            <span className="block font-mono text-[8px] uppercase tracking-[0.15em] text-text-muted/70">called</span>
            <span className="font-mono text-[13px] text-white/90" title={calledAbs || ""}>
              {ago || "—"}
            </span>
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 px-5 sm:grid-cols-3">
          <Stat
            label="Max Target"
            val={s.max_target_pct == null ? "—" : "+" + Number(s.max_target_pct).toFixed(0) + "%"}
            tone="text-emerald-400"
          />
          <Stat
            label="Peak Reached"
            val={s.peak_pct == null ? "—" : fmtPct0(s.peak_pct)}
            tone={s.peak_pct >= 0 ? "text-positive" : "text-negative"}
          />
          <Stat label="Entry" val={s.entry ? fmtPrice(s.entry) : "—"} />
          {s.vs_avwap_pct != null && (
            <Stat
              label="vs Call VWAP"
              val={fmtPct0(s.vs_avwap_pct)}
              tone={s.vs_avwap_pct >= 0 ? "text-positive" : "text-negative"}
            />
          )}
          {s.beta_30d != null && <Stat label="Beta 30d" val={Number(s.beta_30d).toFixed(2)} />}
          {calledAbs && <Stat label="Called At" val={new Date(info.created).toLocaleDateString()} />}
          {info.n > 1 && <Stat label="Active Calls" val={`${info.n}`} tone="text-gold-primary" />}
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] px-5 py-4">
          <button
            onClick={openFull}
            className="flex-1 rounded-xl bg-gold-primary py-2.5 text-[13px] font-semibold text-[#17110a] transition-colors hover:brightness-105 active:scale-[0.99]"
          >
            Open full signal →
          </button>
          <button
            onClick={close}
            className="rounded-xl border border-white/12 px-4 py-2.5 text-[13px] text-white/70 transition-colors hover:border-white/25"
          >
            Close
          </button>
        </div>
      </div>
    </SheetShell>
  );
}
