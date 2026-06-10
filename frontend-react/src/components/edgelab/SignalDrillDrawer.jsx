// src/components/edgelab/SignalDrillDrawer.jsx
// ════════════════════════════════════════════════════════════════
// Level-2 drill — MASTER-DETAIL MODAL (v2, Kiyotaka-style).
// Same export/props as v1 — EdgeLabPage needs no change.
//
// Layout:
//   ① header       → bucket label + WR + outcome distribution + median/best
//   ② left pane    → filter/sort toolbar + compact signal list (scrollable)
//   ③ right pane   → detail of the selected signal + "open full breakdown"
//
// Desktop: two panes side by side. Mobile: list → tap → detail (back button).
// Keyboard: ↑/↓ moves selection · Enter opens full breakdown · Esc closes.
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

const OutcomeBadge = ({ outcome, size = 9 }) => {
  const s = OUTCOME_STYLE[outcome] || { label: outcome || "—", c: "#888", bg: "rgba(255,255,255,0.06)" };
  return (
    <span
      className="inline-flex items-center rounded-sm font-mono uppercase tracking-wider"
      style={{ color: s.c, background: s.bg, border: `1px solid ${s.c}40`, padding: "1px 7px", fontSize: size }}
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

const fmtDateTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return String(iso).slice(0, 16);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
};

// Peak gains can be enormous (memecoins +5000%). Compact display.
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

// log-compressed bar so memecoin outliers don't flatten everything
const logBarPct = (peak, maxPeak) => {
  const a = Math.abs(peak ?? 0);
  return maxPeak > 0
    ? Math.min(100, Math.max(3, (Math.log10(a + 1) / Math.log10(maxPeak + 1)) * 100))
    : 3;
};

// ─── ② list row (left pane) ──────────────────────────────────────
const SignalRow = ({ s, selected, onSelect }) => {
  const isWin = s.outcome && s.outcome !== "sl";
  const peak = fmtPeak(s.peak_pct);
  return (
    <button
      onClick={() => onSelect(s.signal_id)}
      className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 border-l-2 transition ${
        selected
          ? "border-gold-primary bg-white/[0.045]"
          : "border-transparent hover:bg-white/[0.03]"
      }`}
    >
      <CoinLogo pair={s.pair} size={24} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[13px] truncate leading-tight ${selected ? "text-white" : "text-white/85"}`}>
            {fmtPair(s.pair)}
          </span>
          <OutcomeBadge outcome={s.outcome} size={8} />
        </div>
        <div className="text-[10px] font-mono text-white/30 leading-tight mt-0.5">{fmtDate(s.hit_date)}</div>
      </div>
      <span className={`font-mono tabular-nums text-[12px] shrink-0 ${isWin ? "text-emerald-400" : "text-red-400"}`}>
        {peak || "—"}
      </span>
    </button>
  );
};

// ─── ③ detail pane (right) ───────────────────────────────────────
const DetailPane = ({ s, rank, total, maxPeak, opening, onOpenSignal, onBack }) => {
  if (!s) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/25 text-xs font-mono uppercase tracking-wider">
        Select a signal
      </div>
    );
  }
  const isWin = s.outcome && s.outcome !== "sl";
  const accent = isWin ? "#10b981" : "#ef4444";
  const peak = fmtPeak(s.peak_pct);
  const hold = fmtHold(s.created_at, s.hit_date);
  const barPct = logBarPct(s.peak_pct, maxPeak);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* mobile back */}
      {onBack && (
        <button
          onClick={onBack}
          className="md:hidden self-start mx-4 mt-3 px-2.5 py-1 rounded-md border border-white/[0.08] text-[10px] font-mono uppercase tracking-wider text-white/50 hover:text-white"
        >
          ← List
        </button>
      )}

      <div className="px-5 py-5 flex flex-col gap-5">
        {/* identity */}
        <div className="flex items-center gap-3.5">
          <CoinLogo pair={s.pair} size={46} />
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl text-white/95 leading-tight truncate">{fmtPair(s.pair)}</div>
            <div className="text-[10px] font-mono text-white/35 mt-1">
              {rank != null && total != null ? `#${rank} of ${total} by peak` : ""}
            </div>
          </div>
          <OutcomeBadge outcome={s.outcome} size={10} />
        </div>

        {/* hero: peak + held */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30 mb-1">Peak</div>
            <div
              className="font-mono tabular-nums text-4xl leading-none"
              style={{ color: (s.peak_pct ?? 0) >= 0 ? "#34d399" : "#f87171" }}
            >
              {peak || "—"}
            </div>
          </div>
          {hold && (
            <div className="text-right">
              <div className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30 mb-1">Held</div>
              <div className="font-mono tabular-nums text-xl text-white/80 leading-none">{hold}</div>
            </div>
          )}
        </div>

        {/* peak bar */}
        <div className="h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: `${accent}aa` }} />
        </div>

        {/* timeline facts */}
        <div className="rounded-lg border border-white/[0.06] divide-y divide-white/[0.04]">
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">Created</span>
            <span className="font-mono tabular-nums text-[12px] text-white/75">{fmtDateTime(s.created_at)}</span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">Resolved</span>
            <span className="font-mono tabular-nums text-[12px] text-white/75">{fmtDate(s.hit_date)}</span>
          </div>
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/30">Outcome</span>
            <OutcomeBadge outcome={s.outcome} size={9} />
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => !opening && onOpenSignal?.(s.signal_id, s)}
          disabled={opening}
          className={`w-full py-2.5 rounded-lg border text-[11px] font-mono uppercase tracking-[0.18em] transition flex items-center justify-center gap-2 ${
            opening
              ? "border-white/[0.08] text-white/30 cursor-wait"
              : "border-gold-primary/35 bg-gold-primary/[0.07] text-gold-primary hover:bg-gold-primary/[0.14]"
          }`}
        >
          {opening ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-gold-primary/30 border-t-gold-primary rounded-full animate-spin" />
              Opening
            </>
          ) : (
            <>Open full breakdown ↗</>
          )}
        </button>
      </div>
    </div>
  );
};

const SignalDrillDrawer = ({ bucket, days, sector, hidden, openingId, onClose, onOpenSignal }) => {
  const open = !!bucket;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);
  const [filter, setFilter] = useState("all");   // all | win | sl
  const [sort, setSort] = useState("peak");      // peak | recent
  const [selectedId, setSelectedId] = useState(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const load = useCallback(async () => {
    if (!bucket) return;
    setLoading(true);
    setError(null);
    setPayload(null);
    setFilter("all");
    setSort("peak");
    setSelectedId(null);
    setMobileDetail(false);
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

  // rank lookup: position by peak within the whole bucket
  const rankById = useMemo(() => {
    const byPeak = [...all].sort((a, b) => (b.peak_pct ?? -1e9) - (a.peak_pct ?? -1e9));
    const m = new Map();
    byPeak.forEach((s, i) => m.set(s.signal_id, i + 1));
    return m;
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

  // keep a valid selection whenever the visible list changes
  useEffect(() => {
    if (!view.length) {
      setSelectedId(null);
      return;
    }
    if (!view.some((s) => s.signal_id === selectedId)) {
      setSelectedId(view[0].signal_id);
    }
  }, [view, selectedId]);

  const selected = view.find((s) => s.signal_id === selectedId) || null;

  // keyboard: Esc close · ↑/↓ move selection · Enter open full breakdown
  useEffect(() => {
    if (!open || hidden) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose?.();
        return;
      }
      if (!view.length) return;
      const idx = view.findIndex((s) => s.signal_id === selectedId);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedId(view[Math.min(view.length - 1, idx + 1)].signal_id);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedId(view[Math.max(0, idx - 1)].signal_id);
      } else if (e.key === "Enter" && selected) {
        onOpenSignal?.(selected.signal_id, selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hidden, view, selectedId, selected, onClose, onOpenSignal]);

  // While a signal modal is open we hide (but do NOT unmount) so the fetched
  // payload persists and the list is restored instantly on return.
  if (!open || hidden) return null;

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
      <div className="relative w-full max-w-5xl h-[88vh] bg-[#0a0805] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-[dpop_180ms_cubic-bezier(0.16,1,0.3,1)]">
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

          {!loading && !error && all.length > 0 && (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-center">
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

        {/* body: master-detail */}
        <div className="flex-1 flex min-h-0">
          {loading && (
            <div className="flex-1 p-5 sm:p-6 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
              <div className="space-y-2">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-white/[0.02] border border-white/[0.05] animate-pulse" />
                ))}
              </div>
              <div className="hidden md:block rounded-lg bg-white/[0.02] border border-white/[0.05] animate-pulse" />
            </div>
          )}

          {error && (
            <div className="flex-1 p-5 sm:p-6">
              <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] p-4 text-sm text-red-300">
                {error}
                <button onClick={load} className="block mt-2 text-[11px] font-mono uppercase tracking-wider text-red-300/70 hover:text-red-300">
                  ↻ Retry
                </button>
              </div>
            </div>
          )}

          {!loading && !error && all.length === 0 && (
            <div className="flex-1 flex items-center justify-center text-white/30 text-sm font-mono uppercase tracking-wider">
              No signals
            </div>
          )}

          {!loading && !error && all.length > 0 && (
            <>
              {/* ② left: toolbar + list */}
              <div
                className={`w-full md:w-[300px] md:border-r border-white/[0.06] flex-col min-h-0 ${
                  mobileDetail ? "hidden md:flex" : "flex"
                }`}
              >
                <div className="px-3 py-2.5 border-b border-white/[0.05] flex items-center justify-between gap-2 flex-wrap shrink-0">
                  <div className="flex items-center gap-1.5">
                    <FilterChip id="all" label="All" count={stats.total} />
                    <FilterChip id="win" label="Wins" count={stats.wins} />
                    <FilterChip id="sl" label="SL" count={stats.counts.sl} />
                  </div>
                  <button
                    onClick={() => setSort(sort === "peak" ? "recent" : "peak")}
                    className="px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider text-gold-primary/80 hover:text-gold-primary"
                    title="Toggle sort"
                  >
                    ⇅ {sort}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-white/[0.03]">
                  {view.length === 0 ? (
                    <div className="py-12 text-center text-white/25 text-xs font-mono uppercase tracking-wider">
                      No signals
                    </div>
                  ) : (
                    view.map((s) => (
                      <SignalRow
                        key={s.signal_id}
                        s={s}
                        selected={s.signal_id === selectedId}
                        onSelect={(id) => {
                          setSelectedId(id);
                          setMobileDetail(true);
                        }}
                      />
                    ))
                  )}
                </div>
                <div className="px-3 py-2 border-t border-white/[0.05] text-[9px] font-mono text-white/25 shrink-0 hidden md:block">
                  ↑↓ navigate · Enter opens full breakdown
                </div>
              </div>

              {/* ③ right: detail */}
              <div className={`flex-1 min-h-0 flex-col ${mobileDetail ? "flex" : "hidden md:flex"}`}>
                <DetailPane
                  s={selected}
                  rank={selected ? rankById.get(selected.signal_id) : null}
                  total={stats.total}
                  maxPeak={stats.maxAbs}
                  opening={selected && openingId === selected.signal_id}
                  onOpenSignal={onOpenSignal}
                  onBack={() => setMobileDetail(false)}
                />
              </div>
            </>
          )}
        </div>
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
