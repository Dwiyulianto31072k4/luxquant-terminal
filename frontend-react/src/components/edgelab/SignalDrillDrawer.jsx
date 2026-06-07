// src/components/edgelab/SignalDrillDrawer.jsx
// ════════════════════════════════════════════════════════════════
// Level-2 drill — CENTERED MODAL (was a side drawer).
// Same export/props so EdgeLabPage needs no change.
//
// Layout follows an inverted-pyramid hierarchy:
//   ① header        → which bucket (dimension · label) + headline stats
//   ② analytics row → outcome distribution bar + median / best peak
//   ③ toolbar       → filter (All / Wins / SL) + sort (Peak / Recent)
//   ④ card grid     → one coin card per signal (1 col → 2 → 3 responsive)
//
// Card click → onOpenSignal(signalId, signalObj) → Level-3 SignalModal.
// ════════════════════════════════════════════════════════════════
import { useEffect, useState, useMemo, useCallback } from "react";
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
const DIST_ORDER = ["tp4", "tp3", "tp2", "tp1", "sl"];

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

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// Peak gains can be enormous (memecoins +5000%). Compact display:
//   >= 1000 → +5.2k%  ·  >= 100 → +529%  ·  else → +12.3%
const fmtPeak = (p) => {
  if (p == null) return null;
  const sign = p >= 0 ? "+" : "−";
  const a = Math.abs(p);
  let body;
  if (a >= 1000) body = `${(a / 1000).toFixed(1)}k`;
  else if (a >= 100) body = Math.round(a).toLocaleString();
  else body = a.toFixed(1);
  return `${sign}${body}%`;
};

// Holding time from entry → resolution.
const fmtHold = (createdAt, hitDate) => {
  if (!createdAt || !hitDate) return null;
  const a = new Date(createdAt), b = new Date(hitDate);
  if (isNaN(a) || isNaN(b)) return null;
  const ms = b - a;
  if (ms < 0) return null;
  const h = ms / 3.6e6;
  if (h < 1) return `${Math.max(1, Math.round(ms / 6e4))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
};

const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ─── Coin card ───────────────────────────────────────────────────
const CoinCard = ({ s, maxPeak, onClick }) => {
  const isWin = s.outcome && s.outcome !== "sl";
  const peak = fmtPeak(s.peak_pct);
  const peakPos = (s.peak_pct ?? 0) >= 0;
  const hold = fmtHold(s.created_at, s.hit_date);
  // log-compressed bar so memecoin outliers don't flatten everything
  const a = Math.abs(s.peak_pct ?? 0);
  const barPct = maxPeak > 0
    ? Math.min(100, Math.max(3, (Math.log10(a + 1) / Math.log10(maxPeak + 1)) * 100))
    : 3;
  const accent = isWin ? "#10b981" : "#ef4444";

  return (
    <button
      onClick={() => onClick?.(s.signal_id, s)}
      className="group relative text-left rounded-xl bg-white/[0.025] border border-white/[0.06] p-3.5 hover:border-gold-primary/35 hover:bg-white/[0.04] transition flex flex-col gap-3"
    >
      {/* ① identity */}
      <div className="flex items-center gap-2.5">
        <CoinLogo pair={s.pair} size={30} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm text-white/90 truncate leading-tight">{fmtPair(s.pair)}</div>
          <div className="text-[10px] font-mono text-white/35 leading-tight mt-0.5">{fmtDate(s.hit_date)}</div>
        </div>
        <OutcomeBadge outcome={s.outcome} />
      </div>

      {/* ② hero metric */}
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30 mb-0.5">Peak</div>
          <div className={`font-mono tabular-nums text-xl leading-none ${peakPos ? "text-emerald-400" : "text-red-400"}`}>
            {peak || "—"}
          </div>
        </div>
        {hold && (
          <div className="text-right">
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30 mb-0.5">Held</div>
            <div className="font-mono tabular-nums text-sm text-white/70 leading-none">{hold}</div>
          </div>
        )}
      </div>

      {/* ③ peak bar (log-scaled) */}
      <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: `${accent}aa` }} />
      </div>

      <span className="absolute top-3 right-3 text-white/0 group-hover:text-gold-primary/60 transition text-xs">↗</span>
    </button>
  );
};

const SignalDrillDrawer = ({ bucket, days, sector, onClose, onOpenSignal }) => {
  const open = !!bucket;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);
  const [filter, setFilter] = useState("all");   // all | win | sl
  const [sort, setSort] = useState("peak");       // peak | recent

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
    setFilter("all");
    setSort("peak");
    try {
      const res = await edgeLabApi.getDrill(bucket.dimension, bucket.key, days, sector);
      setPayload(res);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || "Couldn't load these signals — try again.");
    } finally {
      setLoading(false);
    }
  }, [bucket, days, sector]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const all = payload?.signals || [];

  const stats = useMemo(() => {
    const counts = { tp4: 0, tp3: 0, tp2: 0, tp1: 0, sl: 0 };
    const peaks = [];
    for (const s of all) {
      if (counts[s.outcome] != null) counts[s.outcome] += 1;
      if (s.peak_pct != null) peaks.push(s.peak_pct);
    }
    const wins = counts.tp4 + counts.tp3 + counts.tp2 + counts.tp1;
    return {
      counts,
      wins,
      total: all.length,
      medPeak: median(peaks),
      bestPeak: peaks.length ? Math.max(...peaks) : null,
      maxAbs: peaks.length ? Math.max(...peaks.map((p) => Math.abs(p))) : 0,
    };
  }, [all]);

  const view = useMemo(() => {
    let arr = all;
    if (filter === "win") arr = arr.filter((s) => s.outcome && s.outcome !== "sl");
    else if (filter === "sl") arr = arr.filter((s) => s.outcome === "sl");
    arr = [...arr];
    if (sort === "peak") arr.sort((a, b) => (b.peak_pct ?? -1e9) - (a.peak_pct ?? -1e9));
    else arr.sort((a, b) => new Date(b.hit_date) - new Date(a.hit_date));
    return arr;
  }, [all, filter, sort]);

  if (!open) return null;

  const returned = all.length;
  const aggTotal = bucket.total ?? payload?.count ?? returned;
  const capped = payload != null && returned < aggTotal;
  const wr = bucket.win_rate ?? payload?.win_rate ?? null;

  const FilterChip = ({ id, label, count }) => (
    <button
      onClick={() => setFilter(id)}
      className={`px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition border ${
        filter === id
          ? "border-gold-primary/40 bg-gold-primary/10 text-gold-primary"
          : "border-white/[0.08] text-white/45 hover:text-white/80"
      }`}
    >
      {label}{count != null && <span className="opacity-50 ml-1">{count}</span>}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[150000] flex items-center justify-center p-4 sm:p-6">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-[3px] animate-[dfadeIn_120ms_ease-out]"
        onClick={onClose}
      />

      {/* panel */}
      <div className="relative w-full max-w-5xl max-h-[88vh] bg-[#0a0805] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-[dpop_180ms_cubic-bezier(0.16,1,0.3,1)]">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-primary/45 to-transparent" />

        {/* ① header */}
        <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[9px] tracking-[0.22em] font-mono uppercase text-gold-primary/60 mb-1">
                Signals · {bucket.dimension.replace(/_/g, " ")}
              </div>
              <div className="text-lg sm:text-xl font-display text-white/95 leading-tight truncate">{bucket.label}</div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 rounded-md border border-white/[0.08] text-white/50 hover:text-white hover:border-white/25 transition flex items-center justify-center"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>

          {/* ② analytics row */}
          {!loading && !error && all.length > 0 && (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
              {/* outcome distribution */}
              <div>
                <div className="flex items-center gap-3 mb-1.5 text-[11px] font-mono tabular-nums">
                  <span className="text-white/55">{aggTotal.toLocaleString()} resolved</span>
                  {wr != null && (
                    <span className={wr >= 60 ? "text-emerald-400" : wr >= 50 ? "text-white/70" : "text-red-400"}>
                      {wr.toFixed(0)}% WR
                    </span>
                  )}
                  <span className="text-white/35">{stats.wins}W / {stats.counts.sl}L</span>
                  {capped && <span className="text-amber-400/70">first {returned} of {aggTotal}</span>}
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-white/[0.05]">
                  {DIST_ORDER.map((k) => {
                    const n = stats.counts[k];
                    if (!n) return null;
                    return (
                      <div
                        key={k}
                        style={{ width: `${(n / stats.total) * 100}%`, background: OUTCOME_STYLE[k].c }}
                        title={`${OUTCOME_STYLE[k].label}: ${n}`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* median / best peak */}
              <div className="flex items-center gap-5">
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">Median peak</div>
                  <div className="font-mono tabular-nums text-base text-white/85">{fmtPeak(stats.medPeak) || "—"}</div>
                </div>
                <div>
                  <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">Best</div>
                  <div className="font-mono tabular-nums text-base text-emerald-400/90">{fmtPeak(stats.bestPeak) || "—"}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ③ toolbar (filters above content) */}
        {!loading && !error && all.length > 0 && (
          <div className="px-5 sm:px-6 py-2.5 border-b border-white/[0.05] flex items-center justify-between gap-3 flex-wrap shrink-0">
            <div className="flex items-center gap-1.5">
              <FilterChip id="all" label="All" count={stats.total} />
              <FilterChip id="win" label="Wins" count={stats.wins} />
              <FilterChip id="sl" label="SL" count={stats.counts.sl} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-white/30">Sort</span>
              <button
                onClick={() => setSort("peak")}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition ${sort === "peak" ? "text-gold-primary" : "text-white/40 hover:text-white/70"}`}
              >Peak</button>
              <button
                onClick={() => setSort("recent")}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition ${sort === "recent" ? "text-gold-primary" : "text-white/40 hover:text-white/70"}`}
              >Recent</button>
            </div>
          </div>
        )}

        {/* ④ body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-[132px] rounded-xl bg-white/[0.02] border border-white/[0.05] animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-4 text-sm text-red-300">
              {error}
              <button onClick={load} className="block mt-2 text-[11px] font-mono uppercase tracking-wider text-red-300/70 hover:text-red-300">
                ↻ Retry
              </button>
            </div>
          )}

          {!loading && !error && view.length === 0 && (
            <div className="py-16 text-center text-white/30 text-sm font-mono uppercase tracking-wider">No signals</div>
          )}

          {!loading && !error && view.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {view.map((s) => (
                <CoinCard key={s.signal_id} s={s} maxPeak={stats.maxAbs} onClick={onOpenSignal} />
              ))}
            </div>
          )}
        </div>

        {/* footer hint */}
        {!loading && !error && view.length > 0 && (
          <div className="px-5 sm:px-6 py-2.5 border-t border-white/[0.05] text-[10px] font-mono text-white/30 shrink-0">
            Showing {view.length.toLocaleString()} · click a card for the full signal breakdown
          </div>
        )}
      </div>

      <style>{`
        @keyframes dpop { from { opacity: 0; transform: scale(0.97) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes dfadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>,
    document.body
  );
};

export default SignalDrillDrawer;