// ════════════════════════════════════════════════════════════════
// GlobalSignalModalHost — coin "called" status sheet.
// ALWAYS portaled to document.body so app bottom-nav (z-50) never covers CTAs.
// Mobile: bottom sheet from bottom. Desktop: centered card.
// ════════════════════════════════════════════════════════════════
import { useContext, useEffect } from "react";
import { createPortal } from "react-dom";
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
    <div className="flex min-h-[38px] items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5">
      <span className="shrink-0 font-mono text-[8px] uppercase tracking-[0.12em] text-text-muted/75">
        {label}
      </span>
      <span className={`min-w-0 truncate text-right font-mono text-[12px] font-semibold tabular-nums ${tone || "text-white"}`}>
        {val}
      </span>
    </div>
  );
}

/**
 * Bottom-anchored sheet (mobile) / centered (sm+).
 * Uses absolute bottom-0 so the footer is always on-screen above the home indicator.
 * Portaled to body — never trapped under bottom nav stacking context.
 */
function SheetShell({ onClose, children, footer, ariaLabel }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 isolate"
      style={{ zIndex: 200000 }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-[ssFade_.2s_ease-out]"
        onClick={onClose}
        aria-label="Close overlay"
      />

      {/* Sheet: pinned to bottom on mobile so CTAs never sit under tab bar */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-[440px] flex-col rounded-t-3xl border-t border-white/12 bg-[#0c0a07] shadow-[0_-20px_60px_rgba(0,0,0,0.65)] animate-[ssSheetUp_.32s_cubic-bezier(.16,1,.3,1)] sm:bottom-auto sm:top-1/2 sm:max-h-[min(85vh,620px)] sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-gold-primary/30 sm:bg-[#0a0805] sm:shadow-2xl sm:animate-[ssPanelIn_.28s_cubic-bezier(.16,1,.3,1)]"
        style={{ maxHeight: "min(90dvh, 640px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex shrink-0 justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>

        {/* Scroll body */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

        {/* ALWAYS-visible action bar */}
        {footer && (
          <div
            className="shrink-0 border-t border-white/10 bg-[#0c0a07] px-4 pt-3 sm:bg-[#0a0805] sm:px-5 sm:pb-4"
            style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
          >
            {footer}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ssFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ssSheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes ssPanelIn {
          from { opacity: 0; transform: translateY(calc(-50% + 16px)) scale(.98); }
          to { opacity: 1; transform: translateY(-50%) scale(1); }
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

  const empty = !info;

  const openFull = () => {
    close();
    if (info?.signal_id) navigate(`/signals?signal=${info.signal_id}`);
  };

  let body = null;
  let footer = null;

  if (empty) {
    body = (
      <div className="px-4 pt-1 sm:px-5 sm:pt-4">
        <div className="flex items-center gap-3">
          <CoinLogo pair={pair} size={32} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-white">{sym}</div>
            <div className="font-mono text-[10px] text-text-muted">{pair}</div>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-text-muted"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="mt-3 pb-2 text-[12px] leading-relaxed text-text-muted">
          No active LuxQuant call for this pair in the last 7 days.
        </p>
      </div>
    );
    footer = (
      <button
        type="button"
        onClick={close}
        className="w-full rounded-xl bg-gold-primary py-3.5 text-[13px] font-bold text-[#1a1206] active:scale-[0.99]"
      >
        Done
      </button>
    );
  } else {
    const s = info.item || {};
    const st = STATUS_META[info.status] || { label: (info.status || "—").toUpperCase(), color: "#9ca3af", desc: "" };
    const ago = timeAgo(info.created);
    const calledAbs = info.created ? new Date(info.created).toLocaleString() : null;
    const dir = s.signal_direction || s.v3?.direction || null;
    const risk = s.risk_norm || s.risk_level || null;

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
      {
        label: "vs Call VWAP",
        val: s.vs_avwap_pct != null ? fmtPct0(s.vs_avwap_pct) : "—",
        tone:
          s.vs_avwap_pct == null
            ? "text-text-muted"
            : s.vs_avwap_pct >= 0
              ? "text-positive"
              : "text-negative",
      },
    ];
    if (s.beta_30d != null) stats.push({ label: "Beta 30d", val: Number(s.beta_30d).toFixed(2), tone: "text-white" });
    if (calledAbs) stats.push({ label: "Called At", val: new Date(info.created).toLocaleDateString(), tone: "text-white" });
    if (info.n > 1) stats.push({ label: "Active Calls", val: String(info.n), tone: "text-gold-primary" });

    body = (
      <div className="px-4 pt-1 sm:px-5 sm:pt-4">
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
            type="button"
            onClick={close}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 text-text-muted"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

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

        <div className="mt-2.5 grid grid-cols-2 gap-1.5 pb-3">
          {stats.map((row) => (
            <Stat key={row.label} label={row.label} val={row.val} tone={row.tone} />
          ))}
        </div>
      </div>
    );

    footer = (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={openFull}
          className="flex-1 rounded-xl bg-gold-primary py-3.5 text-[13px] font-bold text-[#17110a] shadow-[0_4px_16px_rgba(212,168,83,0.3)] active:scale-[0.99]"
        >
          Open full signal →
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-xl border border-white/15 px-4 py-3.5 text-[13px] font-medium text-white/75 active:scale-[0.99]"
        >
          Close
        </button>
      </div>
    );
  }

  return createPortal(
    <SheetShell onClose={close} footer={footer} ariaLabel={`${sym} signal status`}>
      {body}
    </SheetShell>,
    document.body,
  );
}
