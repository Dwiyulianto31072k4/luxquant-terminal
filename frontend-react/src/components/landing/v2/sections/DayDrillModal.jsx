// src/components/landing/v2/sections/DayDrillModal.jsx
// ════════════════════════════════════════════════════════════════
// Day drill → proof desk for landing "Win Rate × Bitcoin".
// Click a day → full list of that day's resolved calls; click a call
// → complete public proof (entry, targets, peak/banked/MAE, charts).
// Data from edge-lab drill (resolved-only, not redacted) + optional
// /signals/detail for update timestamps / extra charts when allowed.
// Portaled to body so landing HeaderV2 never sits on top.
// ════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CoinLogo from "../../../CoinLogo";
import ChartProof from "../../../ChartProof";

const C = {
  win: "#4ade80",
  loss: "#f87171",
  muted: "#8a8f9c",
  peak: "#e7c373",
};
const WINS = ["tp1", "tp2", "tp3", "tp4"];

const sym = (p) => (p || "").replace(/USDT$/i, "");
const fmtP = (p) => {
  if (p == null || Number.isNaN(Number(p))) return "—";
  const n = Number(p);
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toPrecision(4);
};
const fmtPct = (v) => (v == null || Number.isNaN(Number(v)) ? "—" : `${v >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`);
const bigPct = (v) => {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  if (n >= 1000) return `+${(n / 1000).toFixed(1)}K%`;
  if (n >= 100) return `+${Math.round(n)}%`;
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
};
const fmtWhen = (s) => {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};
const authHeaders = () => {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

function Spinner() {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
    </div>
  );
}

function CallRow({ s, active, onClick }) {
  const isWin = WINS.includes(s.outcome);
  const color = isWin ? C.win : C.loss;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 border-l-2 px-3 py-2.5 text-left transition-colors ${
        active ? "bg-white/[0.05]" : "border-l-transparent hover:bg-white/[0.025]"
      }`}
      style={active ? { borderLeftColor: "rgba(255,255,255,0.45)" } : undefined}
    >
      <CoinLogo pair={s.pair} size={26} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-semibold text-text-primary">{sym(s.pair)}</p>
        <p className="font-mono text-[9px] text-text-muted">{fmtWhen(s.created_at)}</p>
      </div>
      <span
        className="rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide"
        style={{ color, background: `${color}1a` }}
      >
        {s.outcome}
      </span>
      <span
        className="w-14 text-right font-mono text-[12px] font-semibold tabular-nums"
        style={{ color: (s.peak_pct ?? 0) >= 0 ? C.win : C.loss }}
      >
        {bigPct(s.peak_pct)}
      </span>
    </button>
  );
}

function TargetRow({ label, price, entry, hit, isStop }) {
  if (price == null && !hit) return null;
  const movePct = entry != null && price != null ? ((price - entry) / entry) * 100 : null;
  const done = !!hit;
  const tone = isStop ? C.loss : done ? C.win : C.muted;
  return (
    <div className="flex items-center gap-2 border-b border-white/[0.04] py-2 last:border-0">
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
        style={{ color: tone, background: `${tone}18` }}
      >
        {done ? "✓" : "·"}
      </span>
      <span className="w-10 font-mono text-[11px] font-bold" style={{ color: tone }}>
        {label}
      </span>
      <span className="font-mono text-[12px] tabular-nums text-text-primary">
        {price != null ? `$${fmtP(price)}` : "—"}
      </span>
      {movePct != null && (
        <span className="font-mono text-[10px] tabular-nums" style={{ color: isStop ? C.loss : C.muted }}>
          {fmtPct(movePct)}
        </span>
      )}
      <span className="ml-auto font-mono text-[9.5px] text-text-muted">
        {done ? `hit ${fmtWhen(hit.update_at)}` : isStop ? "not hit" : "—"}
      </span>
      {hit?.price != null && price == null && (
        <span className="font-mono text-[10px] text-text-primary/70">${fmtP(hit.price)}</span>
      )}
    </div>
  );
}

function StatTile({ label, value, tone }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className={`mt-1 text-[18px] font-semibold tabular-nums leading-none ${tone || "text-text-primary"}`}>
        {value}
      </p>
    </div>
  );
}

/** Merge drill row (public proof) with optional detail (updates / charts). */
function mergeCall(call, detail) {
  if (!call) return null;
  const d = detail && !detail.is_redacted ? detail : detail || {};
  return {
    ...call,
    entry: call.entry ?? d.entry ?? null,
    target1: call.target1 ?? d.target1 ?? null,
    target2: call.target2 ?? d.target2 ?? null,
    target3: call.target3 ?? d.target3 ?? null,
    target4: call.target4 ?? d.target4 ?? null,
    stop1: call.stop1 ?? d.stop1 ?? null,
    stop2: call.stop2 ?? d.stop2 ?? null,
    risk_level: call.risk_level || d.risk_level,
    status: call.status || d.status,
    entry_chart_url: call.entry_chart_url || d.entry_chart_url,
    latest_chart_url: call.latest_chart_url || d.latest_chart_url,
    message_link: call.message_link || d.message_link,
    x_post_url: d.x_post_url,
    updates: d.updates || [],
    is_redacted: !!d.is_redacted && call.entry == null,
  };
}

function Proof({ call, detail }) {
  const m = mergeCall(call, detail);
  if (!m) return null;
  const updates = m.updates || [];
  const upMap = {};
  updates.forEach((u) => {
    if (!upMap[u.update_type]) upMap[u.update_type] = u;
  });
  const isWin = WINS.includes(m.outcome);
  const entry = m.entry;
  const hasCharts = !!(m.entry_chart_url || m.latest_chart_url);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <CoinLogo pair={m.pair} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[17px] font-semibold tracking-tight text-text-primary">{sym(m.pair)}</p>
            <span className="font-mono text-[10px] text-text-muted">USDT</span>
            {m.risk_level && (
              <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-primary/55">
                {m.risk_level} risk
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[10.5px] text-text-muted">
            opened {fmtWhen(m.created_at)}
            {m.hit_date ? ` · resolved ${m.hit_date}` : ""}
          </p>
        </div>
        <span
          className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
          style={{ color: isWin ? C.win : C.loss, background: `${isWin ? C.win : C.loss}1a` }}
        >
          {m.outcome}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Peak" value={bigPct(m.peak_pct ?? m.mfe_pct)} tone="text-emerald-400" />
        <StatTile label="Banked" value={fmtPct(m.realized_pct)} />
        <StatTile label="Worst dip" value={fmtPct(m.mae_pct)} tone="text-red-400" />
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">Entry & targets</span>
          <span className="font-mono text-[14px] font-semibold tabular-nums text-text-primary">
            {entry != null ? `$${fmtP(entry)}` : "—"}
          </span>
        </div>
        <div className="border-t border-white/[0.06] pt-1">
          {[1, 2, 3, 4].map((i) => (
            <TargetRow
              key={i}
              label={`TP${i}`}
              price={m[`target${i}`]}
              entry={entry}
              hit={upMap[`tp${i}`]}
            />
          ))}
        </div>
        {(m.stop1 != null || m.stop2 != null || upMap.sl) && (
          <div className="mt-1 border-t border-white/[0.06] pt-1">
            {m.stop1 != null && <TargetRow label="SL1" price={m.stop1} entry={entry} hit={upMap.sl} isStop />}
            {m.stop2 != null && <TargetRow label="SL2" price={m.stop2} entry={entry} hit={null} isStop />}
            {m.stop1 == null && upMap.sl && (
              <TargetRow label="SL" price={upMap.sl.price} entry={entry} hit={upMap.sl} isStop />
            )}
          </div>
        )}
        {entry == null && (
          <p className="mt-2 font-mono text-[10px] text-text-muted/70">
            Price levels unavailable for this record — peak & outcome still verified.
          </p>
        )}
      </div>

      {hasCharts && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
            Chart proof · entry → outcome
          </p>
          <ChartProof
            entryChartUrl={m.entry_chart_url}
            latestChartUrl={m.latest_chart_url}
            pair={m.pair}
            status={m.status || m.outcome}
            variant="card"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
        {m.message_link && (
          <a
            href={m.message_link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[10px] text-text-primary/75 transition hover:border-white/20 hover:text-text-primary"
          >
            Original call ↗
          </a>
        )}
        {m.x_post_url && (
          <a
            href={m.x_post_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[10px] text-text-primary/75 transition hover:border-white/20 hover:text-text-primary"
          >
            Explore on X ↗
          </a>
        )}
        <a
          href={`/signals?signal=${encodeURIComponent(m.signal_id)}`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-white/12 bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-text-primary transition hover:bg-white/[0.12]"
        >
          Open in Terminal →
        </a>
      </div>
    </div>
  );
}

export default function DayDrillModal({ date, data, loading, onClose }) {
  const all = data?.signals || [];
  const winners = useMemo(() => all.filter((s) => WINS.includes(s.outcome)), [all]);
  const losers = useMemo(() => all.filter((s) => s.outcome === "sl"), [all]);
  const [tab, setTab] = useState("winners");
  const list = tab === "losers" ? losers : winners.length ? winners : all;

  const [selId, setSelId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setTab(winners.length ? "winners" : "all");
  }, [data]); // eslint-disable-line

  useEffect(() => {
    setSelId(list[0]?.signal_id || null);
  }, [data, tab]); // eslint-disable-line

  useEffect(() => {
    if (!selId) {
      setDetail(null);
      return undefined;
    }
    let alive = true;
    setDetail(null);
    setDetailLoading(true);
    fetch(`/api/v1/signals/detail/${selId}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive) {
          setDetail(j);
          setDetailLoading(false);
        }
      })
      .catch(() => alive && setDetailLoading(false));
    return () => {
      alive = false;
    };
  }, [selId]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", h);
    };
  }, [onClose]);

  const sel = list.find((s) => s.signal_id === selId) || null;
  const dateLabel = (() => {
    try {
      return new Date(date).toLocaleDateString("en", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return date;
    }
  })();

  const modal = (
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-5"
      style={{ zIndex: 200000 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Calls on ${dateLabel}`}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-[ddFade_.2s_ease-out]" onClick={onClose} />

      <div className="relative z-10 flex max-h-[min(94dvh,100%)] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-white/[0.1] bg-surface-raised shadow-[0_-20px_60px_rgba(0,0,0,0.65)] animate-[ddSheetUp_.32s_cubic-bezier(.16,1,.3,1)] sm:max-h-[min(90vh,880px)] sm:rounded-xl sm:shadow-[0_32px_90px_rgba(0,0,0,0.75)] sm:animate-none">
        <div className="flex justify-center pt-2.5 pb-0 sm:hidden" aria-hidden="true">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header strip */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.07] bg-white/[0.015] px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-text-muted">Resolved calls · proof</p>
            <h3 className="mt-0.5 font-display text-[17px] font-semibold tracking-tight text-text-primary sm:text-[18px]">
              {dateLabel}
            </h3>
            {data && (
              <p className="mt-1 font-mono text-[11px] tabular-nums text-text-muted">
                <span className="text-text-primary/80">{(data.win_rate ?? 0).toFixed(1)}% WR</span>
                <span className="text-text-muted/40"> · </span>
                {data.wins}/{data.count} resolved
                {data.losses != null && (
                  <>
                    <span className="text-text-muted/40"> · </span>
                    {data.losses} SL
                  </>
                )}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-text-muted transition hover:border-white/25 hover:text-text-primary"
          >
            ✕
          </button>
        </div>

        {/* List filter tabs */}
        {!loading && all.length > 0 && (
          <div className="flex shrink-0 gap-1 border-b border-white/[0.05] px-3 py-2 sm:px-4">
            {[
              { id: "winners", label: "Winners", n: winners.length },
              { id: "losers", label: "Stopped", n: losers.length },
              { id: "all", label: "All", n: all.length },
            ].map((t) => {
              const on = tab === t.id || (t.id === "winners" && tab === "winners");
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wide transition ${
                    active
                      ? "bg-white/[0.1] text-text-primary"
                      : "text-text-muted hover:bg-white/[0.04] hover:text-text-primary/80"
                  }`}
                >
                  {t.label}
                  <span className="ml-1.5 tabular-nums text-text-muted/70">{t.n}</span>
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center px-6 text-center text-[13px] text-text-muted">
            No resolved calls recorded on this day.
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden sm:grid-cols-[280px_1fr]">
            <div className="max-h-[34vh] overflow-y-auto border-b border-white/[0.06] sm:max-h-none sm:border-b-0 sm:border-r sm:border-white/[0.06]">
              {list.map((s) => (
                <CallRow key={s.signal_id} s={s} active={s.signal_id === selId} onClick={() => setSelId(s.signal_id)} />
              ))}
            </div>
            <div className="min-h-0 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
              {/* Proof uses drill row immediately; detail loads for timestamps/charts */}
              {sel ? (
                detailLoading && !sel.entry && !detail ? (
                  <Spinner />
                ) : (
                  <Proof call={sel} detail={detail} />
                )
              ) : (
                <Spinner />
              )}
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

  return createPortal(modal, document.body);
}
