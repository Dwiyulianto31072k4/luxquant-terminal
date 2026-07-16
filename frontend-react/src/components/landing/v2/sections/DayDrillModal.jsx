// src/components/landing/v2/sections/DayDrillModal.jsx
// ════════════════════════════════════════════════════════════════
// Day drill → proof modal for the landing Performance "Win Rate × Bitcoin"
// chart. Click a day → list of that day's winning calls (left); click a call
// → full public proof (right): entry, TP1–4 targets with the exact price &
// timestamp each was hit, stop-loss, peak/realized/missed, plus the entry &
// outcome chart screenshots. All from public, non-redacted closed-signal data.
// ════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import CoinLogo from "../../../CoinLogo";
import ChartProof from "../../../ChartProof";

const C = { gold: "#e7c373", goldL: "#f0d890", gold4: "#8b6914", win: "#4ade80", loss: "#f87171", btc: "#f7931a", muted: "#8a8f9c" };
const WINS = ["tp1", "tp2", "tp3", "tp4"];

const sym = (p) => (p || "").replace(/USDT$/i, "");
const fmtP = (p) => (p == null ? "—" : p >= 1 ? Number(p).toLocaleString(undefined, { maximumFractionDigits: 4 }) : Number(p).toPrecision(4));
const fmtPct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const bigPct = (v) => {
  if (v == null) return "—";
  if (v >= 1000) return `+${(v / 1000).toFixed(1)}K%`;
  if (v >= 100) return `+${Math.round(v)}%`;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
};
const fmtWhen = (s) => {
  if (!s) return "";
  try { return new Date(s).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};

function Spinner() {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10" style={{ borderTopColor: C.gold }} />
    </div>
  );
}

// One row in the left call list.
function CallRow({ s, active, onClick }) {
  const isWin = WINS.includes(s.outcome);
  const color = isWin ? C.win : C.loss;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 border-l-2 px-3 py-2.5 text-left transition-colors ${active ? "bg-white/[0.05]" : "border-l-transparent hover:bg-white/[0.025]"}`}
      style={active ? { borderLeftColor: C.gold } : {}}
    >
      <CoinLogo pair={s.pair} size={24} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-text-primary">{sym(s.pair)}</p>
        <p className="font-mono text-[9px] text-text-muted">{fmtWhen(s.created_at)}</p>
      </div>
      <span className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase" style={{ color, background: `${color}1a` }}>{s.outcome}</span>
      <span className="w-14 text-right font-mono text-[12px] font-bold tabular-nums" style={{ color: (s.peak_pct ?? 0) >= 0 ? C.gold : C.loss }}>{bigPct(s.peak_pct)}</span>
    </button>
  );
}

// One TP/SL target line with hit price + timestamp (proof).
function TargetRow({ label, price, entry, hit, isStop }) {
  const movePct = entry ? ((price - entry) / entry) * 100 : null;
  const done = !!hit;
  const tone = isStop ? C.loss : done ? C.win : C.muted;
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="flex h-4 w-4 items-center justify-center rounded-full text-[8px]" style={{ color: tone, background: `${tone}1f` }}>
        {done ? "✓" : "·"}
      </span>
      <span className="w-9 font-mono text-[11px] font-bold" style={{ color: tone }}>{label}</span>
      <span className="font-mono text-[11px] text-text-primary">${fmtP(price)}</span>
      {movePct != null && (
        <span className="font-mono text-[10px]" style={{ color: isStop ? C.loss : C.muted }}>{fmtPct(movePct)}</span>
      )}
      <span className="ml-auto font-mono text-[9px] text-text-muted">{done ? `hit ${fmtWhen(hit.update_at)}` : ""}</span>
    </div>
  );
}

function Proof({ call, detail }) {
  const updates = detail?.updates || [];
  const upMap = {};
  updates.forEach((u) => { if (!upMap[u.update_type]) upMap[u.update_type] = u; });
  const isWin = WINS.includes(call.outcome);

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center gap-3">
        <CoinLogo pair={call.pair} size={34} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-text-primary">{sym(call.pair)}<span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">{detail?.risk_level} risk</span></p>
          <p className="font-mono text-[10px] text-text-muted">opened {fmtWhen(call.created_at)}</p>
        </div>
        <span className="rounded-md px-2 py-1 text-[10px] font-bold uppercase" style={{ color: isWin ? C.win : C.loss, background: `${isWin ? C.win : C.loss}1a` }}>{call.outcome}</span>
      </div>

      {/* peak / realized / missed proof strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Peak</p>
          <p className="text-[17px] font-bold tabular-nums" style={{ color: C.gold }}>{bigPct(call.peak_pct ?? call.mfe_pct)}</p>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Banked</p>
          <p className="text-[17px] font-bold tabular-nums text-text-primary">{fmtPct(call.realized_pct)}</p>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5">
          <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Worst dip</p>
          <p className="text-[17px] font-bold tabular-nums" style={{ color: C.loss }}>{fmtPct(call.mae_pct)}</p>
        </div>
      </div>

      {/* entry + targets + stops — the verifiable numbers */}
      <div className="rounded-xl border border-white/8 bg-white/[0.015] p-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Entry</span>
          <span className="font-mono text-[12px] font-semibold text-text-primary">${fmtP(detail?.entry)}</span>
        </div>
        <div className="border-t border-white/[0.06] pt-1.5">
          {[1, 2, 3, 4].map((i) => (
            <TargetRow key={i} label={`TP${i}`} price={detail?.[`target${i}`]} entry={detail?.entry} hit={upMap[`tp${i}`]} />
          ))}
        </div>
        {(detail?.stop1 != null || detail?.stop2 != null) && (
          <div className="mt-1 border-t border-white/[0.06] pt-1.5">
            {detail?.stop1 != null && <TargetRow label="SL1" price={detail.stop1} entry={detail?.entry} hit={upMap.sl} isStop />}
            {detail?.stop2 != null && <TargetRow label="SL2" price={detail.stop2} entry={detail?.entry} hit={null} isStop />}
          </div>
        )}
      </div>

      {/* chart screenshots — visual proof */}
      {(detail?.entry_chart_url || detail?.latest_chart_url) && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">Chart proof · entry → outcome</p>
          <ChartProof
            entryChartUrl={detail?.entry_chart_url}
            latestChartUrl={detail?.latest_chart_url}
            pair={call.pair}
            status={detail?.status}
            variant="card"
          />
        </div>
      )}

      {detail?.message_link && (
        <a href={detail.message_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-mono text-[10px] text-gold-primary/80 hover:text-gold-primary">
          View original call ↗
        </a>
      )}
    </div>
  );
}

export default function DayDrillModal({ date, data, loading, onClose }) {
  const calls = data?.signals || [];
  const winners = calls.filter((s) => WINS.includes(s.outcome));
  const list = winners.length ? winners : calls;
  const [selId, setSelId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // default-select the top call once the day's list arrives
  useEffect(() => { setSelId(list[0]?.signal_id || null); }, [data]); // eslint-disable-line

  useEffect(() => {
    if (!selId) { setDetail(null); return; }
    let alive = true;
    setDetail(null);
    setDetailLoading(true);
    fetch(`/api/v1/signals/detail/${selId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setDetail(j); setDetailLoading(false); } })
      .catch(() => alive && setDetailLoading(false));
    return () => { alive = false; };
  }, [selId]);

  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const sel = list.find((s) => s.signal_id === selId) || null;

  return (
    <div className="fixed inset-0 z-[100000] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-[ddFade_.2s_ease-out]" onClick={onClose} />
      {/* Mobile bottom sheet · desktop centered */}
      <div className="relative z-10 flex max-h-[min(92dvh,100%)] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border-t border-white/10 bg-surface-raised shadow-[0_-16px_48px_rgba(0,0,0,0.55)] animate-[ddSheetUp_.32s_cubic-bezier(.16,1,.3,1)] sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-white/12 sm:bg-surface-raised sm:shadow-[0_30px_80px_rgba(0,0,0,0.7)] sm:animate-none">
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.08] px-4 pb-3 pt-1 sm:p-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold-primary/80">Winning calls · proof</p>
            <h3 className="mt-0.5 text-[16px] font-bold text-text-primary">
              {new Date(date).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </h3>
            {data && (
              <p className="mt-0.5 font-mono text-[11px] text-text-muted">
                {(data.win_rate ?? 0).toFixed(1)}% WR · {data.wins}/{data.count} resolved · {winners.length} winners
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/10 text-text-muted transition-colors hover:border-white/25 hover:text-text-primary">✕</button>
        </div>

        {/* body */}
        {loading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center text-[12px] text-text-muted">No resolved calls recorded on this day.</div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden sm:grid-cols-[250px_1fr]">
            {/* list */}
            <div className="max-h-[32vh] overflow-y-auto border-b border-white/[0.08] sm:max-h-none sm:border-b-0 sm:border-r">
              {list.map((s) => (
                <CallRow key={s.signal_id} s={s} active={s.signal_id === selId} onClick={() => setSelId(s.signal_id)} />
              ))}
            </div>
            {/* detail */}
            <div className="min-h-0 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
              {detailLoading ? <Spinner /> : sel && detail ? <Proof call={sel} detail={detail} /> : <Spinner />}
            </div>
          </div>
        )}
      </div>
      <style>{`
        @keyframes ddFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ddSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}
