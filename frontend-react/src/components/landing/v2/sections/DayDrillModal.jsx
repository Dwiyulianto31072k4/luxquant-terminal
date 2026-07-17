// Day drill → resolved-call proof desk (landing WR × Bitcoin).
// Portaled above landing chrome. Data: edge-lab drill v4 (public entry/targets)
// + optional /signals/detail for hit timestamps & charts.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CoinLogo from "../../../CoinLogo";
import ChartProof from "../../../ChartProof";

const C = { win: "#4ade80", loss: "#f87171", muted: "#8a8f9c", ink: "rgb(var(--fg))" };
const WINS = ["tp1", "tp2", "tp3", "tp4"];

const sym = (p) => (p || "").replace(/USDT$/i, "");
const fmtP = (p) => {
  if (p == null || Number.isNaN(Number(p))) return "—";
  const n = Number(p);
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toPrecision(4);
};
const fmtPct = (v) =>
  v == null || Number.isNaN(Number(v)) ? "—" : `${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`;
const bigPct = (v) => {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  if (Math.abs(n) >= 1000) return `${n >= 0 ? "+" : ""}${(n / 1000).toFixed(1)}K%`;
  if (Math.abs(n) >= 100) return `${n >= 0 ? "+" : ""}${Math.round(n)}%`;
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
};
const fmtWhen = (s) => {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
    <div className="flex h-full min-h-[200px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
    </div>
  );
}

/** List row: winners lead with peak; stopped lead with banked (realized) */
function CallRow({ s, active, onClick }) {
  const isWin = WINS.includes(s.outcome);
  const isSl = s.outcome === "sl";
  const primary = isSl ? s.realized_pct : s.peak_pct;
  const primaryColor = isSl
    ? C.loss
    : (s.peak_pct ?? 0) >= 0
      ? C.win
      : C.loss;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-0.5 border-l-2 px-3 py-2.5 text-left transition-colors ${
        active ? "bg-white/[0.06]" : "border-l-transparent hover:bg-white/[0.03]"
      }`}
      style={active ? { borderLeftColor: "rgba(255,255,255,0.55)" } : undefined}
    >
      <CoinLogo pair={s.pair} size={28} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] font-semibold text-text-primary">{sym(s.pair)}</span>
          <span
            className="shrink-0 rounded px-1 py-px font-mono text-[8px] font-bold uppercase tracking-wide"
            style={{
              color: isWin ? C.win : C.loss,
              background: `${isWin ? C.win : C.loss}18`,
            }}
          >
            {s.outcome}
          </span>
        </div>
        <p className="font-mono text-[9px] text-text-muted">{fmtWhen(s.created_at)}</p>
      </div>
      <div className="text-right">
        <p className="font-mono text-[12.5px] font-semibold tabular-nums" style={{ color: primaryColor }}>
          {bigPct(primary)}
        </p>
        <p className="font-mono text-[8px] uppercase tracking-wide text-text-muted/60">
          {isSl ? "banked" : "peak"}
        </p>
      </div>
    </button>
  );
}

function TargetRow({ label, price, entry, hit, isStop }) {
  if (price == null && !hit) return null;
  const movePct = entry != null && price != null ? ((price - entry) / entry) * 100 : null;
  const done = !!hit;
  const tone = isStop ? C.loss : done ? C.win : C.muted;
  return (
    <div className="grid grid-cols-[1.5rem_2.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-white/[0.04] py-2 last:border-0 sm:grid-cols-[1.5rem_2.75rem_5.5rem_4rem_1fr]">
      <span
        className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
        style={{ color: tone, background: `${tone}18` }}
      >
        {done ? "✓" : "·"}
      </span>
      <span className="font-mono text-[11px] font-bold" style={{ color: tone }}>
        {label}
      </span>
      <span className="font-mono text-[12px] tabular-nums text-text-primary">
        {price != null ? `$${fmtP(price)}` : hit?.price != null ? `$${fmtP(hit.price)}` : "—"}
      </span>
      <span className="hidden font-mono text-[10px] tabular-nums sm:block" style={{ color: isStop ? C.loss : C.muted }}>
        {movePct != null ? fmtPct(movePct) : ""}
      </span>
      <span className="text-right font-mono text-[9.5px] text-text-muted">
        {done ? fmtWhen(hit.update_at) : isStop ? "not hit" : "—"}
      </span>
    </div>
  );
}

function Metric({ label, value, tone, hint }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className={`mt-1 text-[17px] font-semibold tabular-nums leading-none sm:text-[19px] ${tone || "text-text-primary"}`}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[10px] leading-snug text-text-muted/70">{hint}</p>}
    </div>
  );
}

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
  };
}

function Proof({ call, detail, listMode }) {
  const m = mergeCall(call, detail);
  if (!m) return null;
  const updates = m.updates || [];
  const upMap = {};
  updates.forEach((u) => {
    if (!upMap[u.update_type]) upMap[u.update_type] = u;
  });
  const isWin = WINS.includes(m.outcome);
  const isSl = m.outcome === "sl";
  const entry = m.entry;
  const hasCharts = !!(m.entry_chart_url || m.latest_chart_url);
  const peak = m.peak_pct ?? m.mfe_pct;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Identity */}
      <div className="flex shrink-0 items-start gap-3 border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
        <CoinLogo pair={m.pair} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-[16px] font-semibold tracking-tight text-text-primary sm:text-[17px]">
              {sym(m.pair)}
              <span className="ml-1.5 font-mono text-[11px] font-normal text-text-muted">USDT</span>
            </h4>
            {m.risk_level && (
              <span className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-text-primary/50">
                {m.risk_level}
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[10.5px] text-text-muted">
            Opened {fmtWhen(m.created_at)}
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

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        {/* Stopped explainer */}
        {isSl && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5">
            <p className="text-[11.5px] font-medium text-red-300/95">Stopped out — why peak can still be green</p>
            <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
              <strong className="text-text-primary/80">Peak</strong> is the best price excursion while the trade was open
              (max favorable move from entry). The trade later hit stop, so{" "}
              <strong className="text-text-primary/80">Banked</strong> is the realized result (usually negative).
              A green peak with red banked means price went up first, then reversed into SL.
            </p>
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-3 gap-2">
          <Metric
            label="Peak"
            value={bigPct(peak)}
            tone={(peak ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}
            hint={isSl ? "Max run before SL" : "Best excursion"}
          />
          <Metric
            label="Banked"
            value={fmtPct(m.realized_pct)}
            tone={
              m.realized_pct == null
                ? undefined
                : m.realized_pct >= 0
                  ? "text-emerald-400"
                  : "text-red-400"
            }
            hint={isSl ? "Realized at stop" : "Locked at exit"}
          />
          <Metric
            label="Worst dip"
            value={fmtPct(m.mae_pct)}
            tone="text-red-400"
            hint="Max adverse excursion"
          />
        </div>

        {/* Levels table */}
        <section className="overflow-hidden rounded-xl border border-white/[0.07]">
          <div className="flex items-baseline justify-between gap-2 border-b border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">
              Levels
            </span>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-text-primary">
              Entry {entry != null ? `$${fmtP(entry)}` : "—"}
            </span>
          </div>
          <div className="px-3.5 py-1">
            {[1, 2, 3, 4].map((i) => (
              <TargetRow
                key={i}
                label={`TP${i}`}
                price={m[`target${i}`]}
                entry={entry}
                hit={upMap[`tp${i}`]}
              />
            ))}
            {(m.stop1 != null || m.stop2 != null || upMap.sl) && (
              <>
                {m.stop1 != null && (
                  <TargetRow label="SL1" price={m.stop1} entry={entry} hit={upMap.sl} isStop />
                )}
                {m.stop2 != null && (
                  <TargetRow label="SL2" price={m.stop2} entry={entry} hit={null} isStop />
                )}
                {m.stop1 == null && upMap.sl && (
                  <TargetRow label="SL" price={upMap.sl.price} entry={entry} hit={upMap.sl} isStop />
                )}
              </>
            )}
          </div>
        </section>

        {/* Charts */}
        {hasCharts && (
          <section>
            <p className="mb-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">
              Chart proof
            </p>
            <div className="overflow-hidden rounded-xl border border-white/[0.07]">
              <ChartProof
                entryChartUrl={m.entry_chart_url}
                latestChartUrl={m.latest_chart_url}
                pair={m.pair}
                status={m.status || m.outcome}
                variant="card"
              />
            </div>
          </section>
        )}
      </div>

      {/* Sticky footer actions */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/[0.07] bg-white/[0.015] px-4 py-3 sm:px-5">
        {m.message_link && (
          <a
            href={m.message_link}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-white/10 px-2.5 py-1.5 font-mono text-[10px] text-text-primary/70 transition hover:border-white/20 hover:text-text-primary"
          >
            Original call ↗
          </a>
        )}
        {m.x_post_url && (
          <a
            href={m.x_post_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-white/10 px-2.5 py-1.5 font-mono text-[10px] text-text-primary/70 transition hover:border-white/20 hover:text-text-primary"
          >
            On X ↗
          </a>
        )}
        <a
          href={`/signals?signal=${encodeURIComponent(m.signal_id)}`}
          className="ml-auto rounded-md border border-white/15 bg-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-text-primary transition hover:bg-white/[0.12]"
        >
          Open in app →
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
  const list = tab === "losers" ? losers : tab === "all" ? all : winners.length ? winners : all;

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

  const tabs = [
    { id: "winners", label: "Winners", n: winners.length },
    { id: "losers", label: "Stopped", n: losers.length },
    { id: "all", label: "All", n: all.length },
  ];

  const modal = (
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4 md:p-6"
      style={{ zIndex: 200000 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Calls on ${dateLabel}`}
    >
      <div className="absolute inset-0 bg-black/82 backdrop-blur-md" onClick={onClose} />

      <div className="relative z-10 flex h-[min(94dvh,100%)] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-white/[0.1] bg-surface-raised shadow-2xl sm:h-[min(88vh,860px)] sm:rounded-xl">
        {/* Header */}
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
              Resolved calls · audit proof
            </p>
            <h3 className="mt-0.5 font-display text-[17px] font-semibold tracking-tight text-text-primary sm:text-[19px]">
              {dateLabel}
            </h3>
            {data && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums text-text-muted">
                <span>
                  <span className="text-text-primary/90">{(data.win_rate ?? 0).toFixed(1)}%</span> WR
                </span>
                <span className="text-white/15">|</span>
                <span>
                  {data.wins}/{data.count} resolved
                </span>
                {(data.losses ?? losers.length) > 0 && (
                  <>
                    <span className="text-white/15">|</span>
                    <span className="text-red-400/90">{data.losses ?? losers.length} stopped</span>
                  </>
                )}
              </div>
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
        </header>

        {loading ? (
          <Spinner />
        ) : all.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] text-text-muted">
            No resolved calls recorded on this day.
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
            {/* List pane */}
            <aside className="flex min-h-0 flex-col border-b border-white/[0.06] lg:border-b-0 lg:border-r">
              <div className="flex shrink-0 gap-0.5 border-b border-white/[0.05] p-1.5">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`flex-1 rounded-md px-2 py-1.5 font-mono text-[10px] uppercase tracking-wide transition ${
                      tab === t.id
                        ? "bg-white/[0.1] text-text-primary"
                        : "text-text-muted hover:bg-white/[0.04] hover:text-text-primary/80"
                    }`}
                  >
                    {t.label}
                    <span className="ml-1 tabular-nums opacity-60">{t.n}</span>
                  </button>
                ))}
              </div>
              {tab === "losers" && (
                <p className="shrink-0 border-b border-white/[0.04] bg-white/[0.015] px-3 py-1.5 text-[10px] leading-snug text-text-muted">
                  Peak can be green while banked is red — price ran then reversed into SL.
                </p>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto max-h-[38vh] lg:max-h-none">
                {list.map((s) => (
                  <CallRow
                    key={s.signal_id}
                    s={s}
                    active={s.signal_id === selId}
                    onClick={() => setSelId(s.signal_id)}
                  />
                ))}
              </div>
            </aside>

            {/* Detail pane */}
            <main className="min-h-0 min-w-0">
              {sel ? (
                detailLoading && !sel.entry && !detail ? (
                  <Spinner />
                ) : (
                  <Proof call={sel} detail={detail} listMode={tab} />
                )
              ) : (
                <Spinner />
              )}
            </main>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
