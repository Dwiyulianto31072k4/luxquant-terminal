// Day drill — resolved calls for a WR×BTC day (landing).
// Layout: header + top filters + full-width list.
// Row click → navigate to /signals?signal=<id>&tab=trade (same unique URL as
// Potential Trades, default Trade tab with journey + execution proof).
// Works for any age signal — SignalsPage fetches by id if outside the 7d list.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import CoinLogo from "../../../CoinLogo";

const C = { win: "#4ade80", loss: "#f87171" };
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
function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
    </div>
  );
}

function OutcomeChip({ outcome }) {
  const isWin = WINS.includes(outcome);
  const color = isWin ? C.win : C.loss;
  return (
    <span
      className="inline-flex rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide"
      style={{ color, background: `${color}18` }}
    >
      {outcome || "—"}
    </span>
  );
}

/** Compact desktop+mobile row — opens SignalModal on click */
function SignalRow({ s, busy, onOpen }) {
  const isSl = s.outcome === "sl";
  const peak = s.peak_pct ?? s.mfe_pct;
  const banked = s.realized_pct;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onOpen(s)}
      className="group grid w-full grid-cols-[minmax(0,1.4fr)_auto] items-center gap-x-3 gap-y-1 border-b border-white/[0.045] px-3 py-3 text-left transition hover:bg-white/[0.035] active:bg-white/[0.05] disabled:opacity-60 sm:grid-cols-[minmax(0,1.3fr)_4.5rem_5.5rem_5rem_5rem_5rem_1.25rem] sm:px-4 sm:py-2.5"
    >
      {/* Token + meta */}
      <div className="flex min-w-0 items-center gap-2.5">
        <CoinLogo pair={s.pair} size={30} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-mono text-[13.5px] font-semibold text-text-primary group-hover:text-white">
              {sym(s.pair)}
            </span>
            <span className="hidden font-mono text-[10px] text-text-primary/30 sm:inline">USDT</span>
            <OutcomeChip outcome={s.outcome} />
            {s.risk_level && (
              <span className="hidden rounded border border-white/10 px-1 py-px font-mono text-[8px] uppercase text-text-muted sm:inline">
                {s.risk_level}
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-text-muted">
            {fmtWhen(s.created_at)}
            {s.hit_date ? ` · res ${s.hit_date}` : ""}
          </p>
        </div>
      </div>

      {/* Mobile secondary metrics */}
      <div className="flex flex-col items-end gap-0.5 sm:hidden">
        <span
          className="font-mono text-[13px] font-semibold tabular-nums"
          style={{ color: isSl ? C.loss : (peak ?? 0) >= 0 ? C.win : C.loss }}
        >
          {isSl ? bigPct(banked) : bigPct(peak)}
        </span>
        <span className="font-mono text-[8px] uppercase tracking-wide text-text-muted/55">
          {isSl ? "banked" : "peak"}
        </span>
      </div>

      {/* Desktop columns */}
      <div className="hidden text-right font-mono text-[12px] tabular-nums text-text-primary/55 sm:block">
        {s.entry != null ? `$${fmtP(s.entry)}` : "—"}
      </div>
      <div
        className="hidden text-right font-mono text-[12px] font-semibold tabular-nums sm:block"
        style={{ color: (peak ?? 0) >= 0 ? C.win : C.loss }}
      >
        {bigPct(peak)}
      </div>
      <div
        className="hidden text-right font-mono text-[12px] font-semibold tabular-nums sm:block"
        style={{
          color:
            banked == null ? undefined : banked >= 0 ? C.win : C.loss,
        }}
      >
        {fmtPct(banked)}
      </div>
      <div className="hidden text-right font-mono text-[12px] tabular-nums text-red-400/90 sm:block">
        {fmtPct(s.mae_pct)}
      </div>
      <div className="hidden text-right font-mono text-[11px] tabular-nums text-text-muted sm:block">
        {s.hit_date || "—"}
      </div>
      <div className="hidden justify-end text-text-primary/20 transition group-hover:text-text-primary/45 sm:flex">
        {busy ? (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border border-white/20 border-t-white/60" />
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
    </button>
  );
}

export default function DayDrillModal({ date, data, loading, onClose }) {
  const all = data?.signals || [];
  const winners = useMemo(() => all.filter((s) => WINS.includes(s.outcome)), [all]);
  const losers = useMemo(() => all.filter((s) => s.outcome === "sl"), [all]);

  const [tab, setTab] = useState("winners");
  const list = useMemo(() => {
    if (tab === "losers") return losers;
    if (tab === "all") return all;
    return winners.length ? winners : all;
  }, [tab, winners, losers, all]);

  const navigate = useNavigate();
  const [openingId, setOpeningId] = useState(null);

  // Default filter when data arrives
  useEffect(() => {
    if (!data) return;
    setTab(winners.length ? "winners" : "all");
  }, [data]); // eslint-disable-line

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const h = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", h);
    };
  }, [onClose]);

  // Same deep-link as Potential Trades: unique signal id + Trade tab.
  // Seed partial drill fields via router state so modal paints immediately
  // even for calls older than 7 days (trust path for landing visitors).
  const openSignal = useCallback(
    (row) => {
      if (!row?.signal_id) return;
      setOpeningId(row.signal_id);
      const sid = String(row.signal_id);
      const seed = {
        signal_id: sid,
        pair: row.pair,
        entry: row.entry,
        target1: row.target1,
        target2: row.target2,
        target3: row.target3,
        target4: row.target4,
        stop1: row.stop1,
        stop2: row.stop2,
        status: row.status || row.outcome,
        risk_level: row.risk_level,
        created_at: row.created_at,
        peak_pct: row.peak_pct,
        entry_chart_url: row.entry_chart_url,
        latest_chart_url: row.latest_chart_url,
        message_link: row.message_link,
      };
      navigate(`/signals?signal=${encodeURIComponent(sid)}&tab=trade`, {
        state: { seedSignal: seed },
      });
    },
    [navigate],
  );

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

  const shell = (
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4 md:p-6"
      style={{ zIndex: 190000 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Calls on ${dateLabel}`}
    >
      {/* Dim behind — click closes list (not when SignalModal open) */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={() => {
          if (!selectedSignal) onClose();
        }}
      />

      <div className="relative z-10 flex h-[min(94dvh,100%)] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-white/[0.1] bg-surface-raised shadow-2xl sm:h-[min(88vh,820px)] sm:rounded-xl">
        {/* ── Header ── */}
        <header className="shrink-0 border-b border-white/[0.07] px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                Resolved calls · row opens Trade proof with unique link
              </p>
              <h3 className="mt-0.5 font-display text-[17px] font-semibold tracking-tight text-text-primary sm:text-[19px]">
                {dateLabel}
              </h3>
              {data && (
                <p className="mt-1 font-mono text-[11px] tabular-nums text-text-muted">
                  <span className="text-text-primary/90">{(data.win_rate ?? 0).toFixed(1)}% WR</span>
                  <span className="mx-1.5 text-white/15">·</span>
                  {data.wins}/{data.count} resolved
                  {(data.losses ?? losers.length) > 0 && (
                    <>
                      <span className="mx-1.5 text-white/15">·</span>
                      <span className="text-red-400/90">{data.losses ?? losers.length} stopped</span>
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

          {/* ── Filters on top (not left) ── */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {tabs.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-md px-3 py-1.5 font-mono text-[11px] font-medium transition ${
                    on
                      ? "bg-white/[0.12] text-text-primary shadow-sm"
                      : "border border-white/[0.08] bg-white/[0.02] text-text-muted hover:border-white/16 hover:text-text-primary"
                  }`}
                >
                  {t.label}
                  <span className={`ml-1.5 tabular-nums ${on ? "text-text-primary/70" : "text-text-muted/60"}`}>
                    {t.n}
                  </span>
                </button>
              );
            })}
          </div>
          {tab === "losers" && (
            <p className="mt-2 text-[11px] leading-snug text-text-muted">
              Peak can stay green after a stop — max run-up before price reversed into SL. Banked is the realized P&amp;L.
            </p>
          )}
        </header>

        {/* ── Column headers (desktop) ── */}
        {!loading && list.length > 0 && (
          <div className="hidden shrink-0 grid-cols-[minmax(0,1.3fr)_4.5rem_5.5rem_5rem_5rem_5rem_1.25rem] gap-x-3 border-b border-white/[0.05] bg-white/[0.015] px-4 py-2 sm:grid">
            <span className="font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-text-muted/55">
              Token
            </span>
            <span className="text-right font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-text-muted/55">
              Entry
            </span>
            <span className="text-right font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-text-muted/55">
              Peak
            </span>
            <span className="text-right font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-text-muted/55">
              Banked
            </span>
            <span className="text-right font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-text-muted/55">
              Worst
            </span>
            <span className="text-right font-mono text-[9px] font-medium uppercase tracking-[0.12em] text-text-muted/55">
              Resolved
            </span>
            <span />
          </div>
        )}

        {/* ── Full-width list ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <Spinner />
          ) : list.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <p className="text-[13px] text-text-muted">
                {tab === "losers"
                  ? "No stopped calls on this day."
                  : tab === "winners"
                    ? "No winners on this day."
                    : "No resolved calls on this day."}
              </p>
              {tab !== "all" && all.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTab("all")}
                  className="font-mono text-[11px] text-text-primary/70 underline-offset-2 hover:text-text-primary hover:underline"
                >
                  Show all {all.length}
                </button>
              )}
            </div>
          ) : (
            list.map((s) => (
              <SignalRow
                key={s.signal_id}
                s={s}
                busy={openingId === s.signal_id}
                onOpen={openSignal}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {!loading && list.length > 0 && (
          <footer className="shrink-0 border-t border-white/[0.06] bg-white/[0.015] px-4 py-2.5 sm:px-5">
            <p className="font-mono text-[10px] text-text-muted/70">
              Showing {list.length}
              {tab !== "all" ? ` · ${tab}` : ""} · tap a row → Trade proof (unique signal link)
            </p>
          </footer>
        )}
      </div>
    </div>
  );

  return createPortal(shell, document.body);
}
