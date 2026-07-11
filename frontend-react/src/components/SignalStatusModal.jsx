// ════════════════════════════════════════════════════════════════
// GlobalSignalModalHost — the one modal opened when ANY coin in the
// terminal is clicked (via CoinLogo → context.openPair). Shows the
// coin's live signal status, WHEN it was called (relative + absolute),
// key stats, and an "Open full signal" action. Rendered once inside the
// terminal shell's SignalStatusProvider.
// ════════════════════════════════════════════════════════════════
import { useContext } from "react";
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
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-3 py-2.5">
      <div className="font-mono text-[8.5px] uppercase tracking-[0.15em] text-text-muted">{label}</div>
      <div className={`font-mono tabular-nums text-[15px] mt-1 ${tone || "text-white/90"}`}>{val}</div>
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

  // pair is shown somewhere in the terminal but has no active call in 7d
  if (!info) {
    return (
      <div className="fixed inset-x-0 bottom-0 top-16 z-[90] bg-black/80 backdrop-blur-sm flex items-start md:items-center justify-center p-3 md:p-6" onClick={close}>
        <div className="relative w-[92vw] max-w-[420px] rounded-2xl bg-[#0a0805] border border-white/[0.1] shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
          <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />
          <div className="flex items-center gap-3">
            <CoinLogo pair={pair} size={34} />
            <div><div className="text-[16px] text-white font-semibold">{sym}</div><div className="font-mono text-[11px] text-text-muted">{pair}</div></div>
            <button onClick={close} className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-white/10 text-text-muted hover:text-white">✕</button>
          </div>
          <div className="mt-4 text-[12px] text-text-muted leading-relaxed">No active LuxQuant call for this pair in the last 7 days.</div>
        </div>
      </div>
    );
  }

  const s = info.item || {};
  const st = STATUS_META[info.status] || { label: (info.status || "—").toUpperCase(), color: "#9ca3af", desc: "" };
  const ago = timeAgo(info.created);
  const calledAbs = info.created ? new Date(info.created).toLocaleString() : null;
  const dir = s.signal_direction || s.v3?.direction || null;
  const risk = s.risk_norm || s.risk_level || null;

  const openFull = () => { close(); if (info.signal_id) navigate(`/signals?signal=${info.signal_id}`); };

  return (
    <div className="fixed inset-x-0 bottom-0 top-16 z-[90] bg-black/80 backdrop-blur-sm flex items-start md:items-center justify-center p-3 md:p-6" onClick={close}>
      <div className="relative w-[94vw] max-w-[540px] max-h-[calc(100vh-6rem)] overflow-auto rounded-2xl bg-[#0a0805] border border-gold-primary/25 shadow-2xl shadow-black/60" onClick={(e) => e.stopPropagation()}>
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />

        <div className="flex items-center gap-3 px-5 pt-5">
          <CoinLogo pair={pair} size={38} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[18px] text-white font-semibold leading-none">{sym}</span>
              <span className="font-mono text-[11px] text-text-muted">{pair}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              {dir && <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${dir === "BULLISH" ? "text-positive border-positive/40" : dir === "BEARISH" ? "text-negative border-negative/40" : "text-white/60 border-white/15"}`}>{dir}</span>}
              {risk && <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-white/15 text-white/60">{risk} risk</span>}
              {s.is_decoupled && <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-gold-primary/30 text-gold-primary">btc-decoupled</span>}
            </div>
          </div>
          <button onClick={close} className="ml-auto w-7 h-7 flex items-center justify-center rounded-md border border-white/10 text-text-muted hover:text-white hover:border-white/25">✕</button>
        </div>

        {/* status + when called */}
        <div className="mx-5 mt-4 rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: `${st.color}14`, border: `1px solid ${st.color}44` }}>
          <span className="font-mono text-[15px] font-bold tracking-wider" style={{ color: st.color }}>{st.label}</span>
          <span className="text-[11px] text-text-muted hidden sm:block">{st.desc}</span>
          <span className="ml-auto text-right">
            <span className="block font-mono text-[8px] uppercase tracking-[0.15em] text-text-muted/70">called</span>
            <span className="font-mono text-[13px] text-white/90" title={calledAbs || ""}>{ago || "—"}</span>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 px-5 mt-3">
          <Stat label="Max Target" val={s.max_target_pct == null ? "—" : "+" + Number(s.max_target_pct).toFixed(0) + "%"} tone="text-emerald-400" />
          <Stat label="Peak Reached" val={s.peak_pct == null ? "—" : fmtPct0(s.peak_pct)} tone={s.peak_pct >= 0 ? "text-positive" : "text-negative"} />
          <Stat label="Entry" val={s.entry ? fmtPrice(s.entry) : "—"} />
          {s.vs_avwap_pct != null && <Stat label="vs Call VWAP" val={fmtPct0(s.vs_avwap_pct)} tone={s.vs_avwap_pct >= 0 ? "text-positive" : "text-negative"} />}
          {s.beta_30d != null && <Stat label="Beta 30d" val={Number(s.beta_30d).toFixed(2)} />}
          {calledAbs && <Stat label="Called At" val={new Date(info.created).toLocaleDateString()} />}
          {info.n > 1 && <Stat label="Active Calls" val={`${info.n}`} tone="text-gold-primary" />}
        </div>

        <div className="px-5 py-4 mt-4 border-t border-white/[0.06] flex items-center gap-2">
          <button onClick={openFull} className="flex-1 rounded-xl bg-gold-primary text-[#17110a] font-semibold text-[13px] py-2.5 hover:brightness-105 transition-colors">Open full signal →</button>
          <button onClick={close} className="rounded-xl border border-white/12 text-white/70 text-[13px] px-4 py-2.5 hover:border-white/25 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}
