// src/components/SignalCompare.jsx
// ════════════════════════════════════════════════════════════════
// Compare 2–5 calls side by side and answer the question the table can't:
// "of these, which one do I actually take?"
//
// WHY THIS DOESN'T RANK ON THE PLANNED RISK/REWARD
// Checked against 7 days of production signals (n=627): the planned R:R —
// (max target − entry) / (entry − stop) — sits at 4.46 median with p10 4.00
// and p90 4.94. The algo places targets and stops at fixed ratios, so that
// number is effectively the same on every call. Ranking on it would highlight
// a "winner" chosen by rounding noise.
//
// What actually differs is WHERE PRICE IS NOW inside that structure. Measured
// on the same rows, R:R from the live price spans p10 −0.13 → p90 3.54, with
// 83 calls already trading past their target and 186 more where the remaining
// upside is smaller than the distance to the stop. That is the honest basis
// for a decision, so every ranking here is computed from the live price.
// ════════════════════════════════════════════════════════════════
import { useEffect } from "react";
import { createPortal } from "react-dom";
import CoinLogo from "./CoinLogo";

const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const coinOf = (pair) => (pair ? pair.replace(/USDT$/i, "") : "");

const maxTargetOf = (s) => {
  const t = [s?.target1, s?.target2, s?.target3, s?.target4]
    .map(num)
    .filter((v) => v != null && v > 0);
  return t.length ? Math.max(...t) : null;
};

const fmtPrice = (p) => {
  if (p == null) return "—";
  const n = Number(p);
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
};
const fmtPct = (v, d = 1) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`);
const fmtBig = (v) => {
  const n = num(v);
  if (n == null) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};
const ageOf = (createdAt) => {
  if (!createdAt) return null;
  const ms = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const h = ms / 3.6e6;
  return h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
};

// ── one row's worth of numbers, all measured from the live price ──
export function metricsOf(item) {
  const s = item.signal || {};
  const price = num(item.price);
  const entry = num(s.entry);
  const stop = num(s.stop1);
  const tmax = maxTargetOf(s);

  const fromEntry = price != null && entry ? ((price - entry) / entry) * 100 : null;
  const room = price != null && tmax != null ? ((tmax - price) / price) * 100 : null;
  const risk = price != null && stop != null ? ((price - stop) / price) * 100 : null;

  // Below the stop the trade is already invalidated — there is no ratio to quote.
  const belowStop = price != null && stop != null && price <= stop;
  const pastTarget = price != null && tmax != null && price >= tmax;
  const rr =
    !belowStop && price != null && tmax != null && stop != null
      ? (tmax - price) / (price - stop)
      : null;

  return {
    signal: s,
    price,
    entry,
    stop,
    tmax,
    fromEntry,
    room,
    risk,
    rr,
    belowStop,
    pastTarget,
    corr: num(s.btc_corr),
    mcap: num(s.market_cap),
    vol: num(item.volume),
    age: ageOf(s.created_at),
    status: (s.status || "").replace(/_/g, " ").toUpperCase(),
  };
}

// ── which of these is the best trade from here ───────────────────
function scoreOne(m) {
  if (m.belowStop) return -99; // price is through the stop: not a trade
  let score = 0;
  if (m.rr != null)
    score += clamp(m.rr, -2, 5) * 2; // dominant term
  else if (m.room != null) score += (m.room / 100) * 3; // fallback when no stop
  if (m.pastTarget) score -= 4; // you'd be buying above the target
  if (m.vol != null && m.vol < 1e6) score -= 1.5; // too thin to size into
  return score;
}

function buildVerdict(rows) {
  const scored = rows.map((m) => ({ ...m, score: scoreOne(m) }));
  const usable = scored.filter((m) => m.rr != null && !m.belowStop);
  if (usable.length < 2) return { scored, verdict: null };

  // Rank only rows we can actually price. A row whose live price hasn't loaded
  // scores 0, which would otherwise beat a genuinely bad setup (past target
  // scores −4.3) and crown a winner we have no evidence for.
  const ranked = [...usable].sort((a, b) => b.score - a.score);
  const win = ranked[0];
  const second = ranked[1];
  const margin = win.score - second.score;

  const maxRR = Math.max(...scored.map((m) => m.rr ?? -Infinity));
  const maxRoom = Math.max(...scored.map((m) => m.room ?? -Infinity));

  const reasons = [];
  if (win.rr != null && win.rr === maxRR)
    reasons.push(`best risk/reward from here (${win.rr.toFixed(1)}×)`);
  if (win.room != null && win.room === maxRoom)
    reasons.push(`most room to target (${fmtPct(win.room)})`);
  if (win.fromEntry != null && Math.abs(win.fromEntry) < 1.5)
    reasons.push("price is still near its entry");
  if (win.vol != null && win.vol >= 1e7) reasons.push("deep enough to size into");

  const cautions = [];
  if (margin < 1.2)
    cautions.push(`${coinOf(second.signal.pair)} is close behind — this isn't a clear gap`);
  if (win.rr != null && win.rr < 1)
    cautions.push("even the leader risks more than it stands to make from here");
  if (win.pastTarget) cautions.push("it is already trading past its target");
  if (win.vol != null && win.vol < 1e6) cautions.push("liquidity is thin, so expect slippage");

  // Everything on the board is a bad entry right now — say so plainly.
  const weak = win.rr == null || win.rr < 1 || win.belowStop;
  return { scored, verdict: { win, reasons, cautions, weak } };
}

// ── are these actually different bets? ───────────────────────────
// The point most compare screens miss: three highly BTC-correlated coins are
// one position wearing three names. Worth saying out loud before someone
// "diversifies" into the same trade three times.
function concentrationNote(rows) {
  const corrs = rows.map((m) => m.corr).filter((c) => c != null);
  if (corrs.length < 2) return null;
  const high = corrs.filter((c) => c >= 0.7).length;
  if (high >= 2 && high === corrs.length)
    return "All of these track BTC closely (correlation ≥ 0.70). Taking more than one is effectively one larger BTC bet, not a spread of risk.";
  if (high >= 2)
    return `${high} of these track BTC closely (correlation ≥ 0.70) and will tend to move together.`;
  return null;
}

// ── layout pieces ────────────────────────────────────────────────
function Row({ label, hint, cells, best }) {
  return (
    <>
      <div
        className="border-t border-ink/[0.06] px-3 py-2.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted"
        title={hint}
      >
        <span
          className={hint ? "cursor-help decoration-dotted underline-offset-2 hover:underline" : ""}
        >
          {label}
        </span>
      </div>
      {cells.map((c, i) => (
        <div
          key={i}
          className={`border-t border-ink/[0.06] px-3 py-2.5 text-[12px] tabular-nums ${
            best === i ? "bg-accent/[0.08]" : ""
          } ${c.className || "text-text-primary"}`}
        >
          {c.node ?? c.text ?? "—"}
        </div>
      ))}
    </>
  );
}

// index of the best value; dir=1 → higher wins, dir=-1 → lower wins
const bestIdx = (vals, dir = 1) => {
  let bi = -1;
  let bv = -Infinity;
  vals.forEach((v, i) => {
    if (v == null) return;
    const x = v * dir;
    if (x > bv) {
      bv = x;
      bi = i;
    }
  });
  return bi;
};

export function SignalCompare({ items, onRemove, onClear, onOpen, open, setOpen }) {
  const rows = items.map(metricsOf);
  const { scored, verdict } = buildVerdict(rows);
  const concentration = concentrationNote(rows);
  const active = items.length > 0;

  // Tell the shell we're in selection mode so the mobile bottom nav steps
  // aside for this bar (see body[data-lq-selecting] in styles/index.css).
  // Runs on every mount so the flag can never outlive the bar — including
  // when the whole table unmounts on navigation.
  useEffect(() => {
    if (active) document.body.setAttribute("data-lq-selecting", "");
    else document.body.removeAttribute("data-lq-selecting");
    return () => document.body.removeAttribute("data-lq-selecting");
  }, [active]);

  if (!active) return null;

  // ── the docked bar: always visible once something is selected ──
  const bar = (
    <div
      className="fixed inset-x-0 bottom-0 z-[199990] border-t border-ink/[0.09] bg-surface-raised/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
            {items.length} selected
          </span>
          {rows.map((m) => (
            <button
              key={m.signal.signal_id}
              onClick={() => onRemove(m.signal.signal_id)}
              title={`Remove ${coinOf(m.signal.pair)}`}
              className="group flex shrink-0 items-center gap-1.5 rounded-full border border-ink/[0.08] bg-ink/[0.03] py-1 pl-1.5 pr-2 transition-colors hover:border-negative/40"
            >
              <CoinLogo pair={m.signal.pair} size={16} />
              <span className="font-mono text-[11px] text-text-primary">
                {coinOf(m.signal.pair)}
              </span>
              <span className="text-text-muted transition-colors group-hover:text-loss">×</span>
            </button>
          ))}
        </div>
        <button
          onClick={onClear}
          className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted transition-colors hover:text-text-primary"
        >
          Clear
        </button>
        <button
          onClick={() => setOpen(true)}
          disabled={items.length < 2}
          className="shrink-0 rounded-lg bg-accent px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-accent-fg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          title={items.length < 2 ? "Pick at least two to compare" : undefined}
        >
          Compare
        </button>
      </div>
    </div>
  );

  if (!open) return createPortal(bar, document.body);

  const cols = `132px repeat(${rows.length}, minmax(148px, 1fr))`;

  const panel = (
    <div
      className="fixed inset-0 z-[200000] flex items-end justify-center bg-scrim/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={() => setOpen(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Compare setups"
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-ink/[0.09] bg-surface-raised shadow-desk sm:rounded-2xl"
      >
        {/* header — close sits top-right, per the modal standard */}
        <div className="flex items-start justify-between gap-4 border-b border-ink/[0.07] px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-mono text-[13px] uppercase tracking-[0.14em] text-text-primary">
              Compare setups
            </h2>
            <p className="mt-1 text-[11px] text-text-secondary">
              Every number below is measured from the <strong>live price</strong>, not the original
              entry — it answers what you get by taking the trade right now.
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-ink/[0.05] hover:text-text-primary"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {/* verdict first — the answer, then the evidence */}
          {verdict && (
            <div
              className={`mx-4 mt-4 rounded-xl border px-4 py-3 ${
                verdict.weak
                  ? "border-negative/30 bg-negative/[0.06]"
                  : "border-accent/30 bg-accent/[0.06]"
              }`}
            >
              {verdict.weak ? (
                <p className="text-[12px] text-text-primary">
                  <strong>Nothing here looks good right now.</strong> From the current price, none
                  of these offers meaningfully more upside than the distance to its stop. Sitting
                  out is a position too.
                </p>
              ) : (
                <p className="text-[12px] text-text-primary">
                  <strong>{coinOf(verdict.win.signal.pair)}</strong> is the strongest of these
                  {verdict.reasons.length ? ` — ${verdict.reasons.join(", ")}` : ""}.
                </p>
              )}
              {verdict.cautions.length > 0 && (
                <p className="mt-1.5 text-[11px] text-text-secondary">
                  Caveat: {verdict.cautions.join("; ")}.
                </p>
              )}
            </div>
          )}

          {concentration && (
            <div className="mx-4 mt-3 rounded-xl border border-warning/30 bg-warning/[0.06] px-4 py-2.5">
              <p className="text-[11px] text-text-primary">{concentration}</p>
            </div>
          )}

          {/* the grid */}
          <div className="mt-4 overflow-x-auto px-4 pb-4">
            <div className="min-w-max" style={{ display: "grid", gridTemplateColumns: cols }}>
              {/* head */}
              <div />
              {rows.map((m) => (
                <div key={m.signal.signal_id} className="px-3 pb-2">
                  <div className="flex items-center gap-2">
                    <CoinLogo pair={m.signal.pair} size={22} />
                    <div className="min-w-0">
                      <button
                        onClick={() => {
                          setOpen(false);
                          onOpen && onOpen(m.signal);
                        }}
                        className="block truncate font-mono text-[13px] text-text-primary transition-colors hover:text-accent"
                      >
                        {coinOf(m.signal.pair)}
                      </button>
                      <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
                        {m.status || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              <Row
                label="R:R from here"
                hint="Remaining upside to the target divided by the distance down to the stop, both measured from the live price. Above 1× means you stand to make more than you risk. This is the row that should decide it — the planned R:R is set at a fixed ratio on every call, so it is the same everywhere and tells you nothing."
                cells={scored.map((m) => ({
                  text: m.belowStop ? "below stop" : m.rr == null ? "—" : `${m.rr.toFixed(2)}×`,
                  className: m.belowStop
                    ? "text-loss"
                    : m.rr == null
                      ? "text-text-muted"
                      : m.rr >= 2
                        ? "text-profit font-medium"
                        : m.rr >= 1
                          ? "text-text-primary"
                          : "text-loss",
                }))}
                best={bestIdx(scored.map((m) => (m.belowStop ? null : m.rr)))}
              />

              <Row
                label="Room to target"
                hint="How much further price has to travel from where it is now to reach the furthest target. Negative means it is already past the target."
                cells={rows.map((m) => ({
                  text: fmtPct(m.room),
                  className:
                    m.room == null ? "text-text-muted" : m.room > 0 ? "text-profit" : "text-loss",
                }))}
                best={bestIdx(rows.map((m) => m.room))}
              />

              <Row
                label="Risk to stop"
                hint="How far price would fall from here to hit the stop — what this trade costs you if it fails, entering now."
                cells={rows.map((m) => ({
                  text: m.risk == null ? "—" : `${m.risk.toFixed(1)}%`,
                  className: "text-text-secondary",
                }))}
                best={bestIdx(
                  rows.map((m) => m.risk),
                  -1
                )}
              />

              <Row
                label="Vs entry"
                hint="Where the live price sits against the original entry. Near zero means you can still get in on the called price; a large positive number means the move has already started without you."
                cells={rows.map((m) => ({
                  text: fmtPct(m.fromEntry),
                  className:
                    m.fromEntry == null
                      ? "text-text-muted"
                      : Math.abs(m.fromEntry) < 1.5
                        ? "text-profit"
                        : "text-text-secondary",
                }))}
                best={bestIdx(
                  rows.map((m) => (m.fromEntry == null ? null : Math.abs(m.fromEntry))),
                  -1
                )}
              />

              <Row
                label="Live price"
                cells={rows.map((m) => ({
                  text: fmtPrice(m.price),
                  className: "text-text-primary",
                }))}
              />
              <Row
                label="Entry / stop"
                cells={rows.map((m) => ({
                  node: (
                    <span className="text-text-secondary">
                      {fmtPrice(m.entry)} <span className="text-text-muted">/</span>{" "}
                      {fmtPrice(m.stop)}
                    </span>
                  ),
                }))}
              />
              <Row
                label="Target"
                cells={rows.map((m) => ({ text: fmtPrice(m.tmax), className: "text-profit" }))}
              />

              <Row
                label="Liquidity 24h"
                hint="Daily traded volume. Thin books mean your own order moves the price against you, so a great-looking setup you cannot fill is not a trade."
                cells={rows.map((m) => ({
                  text: fmtBig(m.vol),
                  className: m.vol != null && m.vol < 1e6 ? "text-loss" : "text-text-secondary",
                }))}
                best={bestIdx(rows.map((m) => m.vol))}
              />

              <Row
                label="BTC corr"
                hint="How tightly this coin has been tracking Bitcoin. Near 1.00 means it mostly does what BTC does — stacking several of those is one bet, not several."
                cells={rows.map((m) => ({
                  text: m.corr == null ? "—" : m.corr.toFixed(2),
                  className:
                    m.corr != null && m.corr >= 0.7 ? "text-warning" : "text-text-secondary",
                }))}
              />

              <Row
                label="Age"
                hint="How long ago the call was published. Older calls have had more time to move away from their entry."
                cells={rows.map((m) => ({ text: m.age || "—", className: "text-text-secondary" }))}
              />

              <Row
                label=""
                cells={rows.map((m) => ({
                  node: (
                    <button
                      onClick={() => onRemove(m.signal.signal_id)}
                      className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted transition-colors hover:text-loss"
                    >
                      Remove
                    </button>
                  ),
                }))}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink/[0.07] px-5 py-3">
          <button
            onClick={onClear}
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted transition-colors hover:text-text-primary"
          >
            Clear all
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg border border-ink/[0.1] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-text-primary transition-colors hover:bg-ink/[0.04]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {bar}
      {panel}
    </>,
    document.body
  );
}

export default SignalCompare;
