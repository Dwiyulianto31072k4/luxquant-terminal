// What your saved calls actually did.
//
// The shape of this panel is set by one measurement, not by taste. On the live
// watchlist (2026-09-13): 739 rows across 62 users, **median 2 saved per
// user**, 29 of 62 holding exactly one. So a wall of charts is the wrong
// answer — for half the desk it would render as a wall of empty boxes. Every
// panel here has to be readable at n=2 and still honest at n=288, which is
// what the heaviest user holds.
//
// That is also why there is no taken-vs-skipped chart in here. That comparison
// is the journal's whole point and it lives in SignalsJournalRecap, but as of
// today **zero** of 739 rows are marked, so a chart of it would be an empty
// frame on every account. The prompt to start marking is worth more than a
// picture of nothing.
//
// What IS fully populated, and therefore what this draws: outcome (732/739
// resolved), peak (739/739), and the two timestamps — the call's and the
// save's — whose difference nobody had looked at before. Median gap 1.9h, but
// 128 rows saved more than a day late.
import { useMemo } from "react";

import { wilson } from "./SignalsJournalRecap";

const WIN = new Set(["tp1", "tp2", "tp3", "tp4"]);

// Outcome is ordinal and genuinely directional, so it may carry a verdict
// colour — unlike "you took / you passed", which is an identity.
const LADDER = [
  { key: "tp4", label: "TP4", color: "rgb(var(--accent))" },
  { key: "tp3", label: "TP3", color: "rgb(var(--pos))" },
  { key: "tp2", label: "TP2", color: "rgb(var(--pos) / 0.75)" },
  { key: "tp1", label: "TP1", color: "rgb(var(--pos) / 0.5)" },
  { key: "sl", label: "Stopped", color: "rgb(var(--neg))" },
];

const PEAK_BANDS = [
  { key: "lt5", label: "under 5%", test: (p) => p < 5 },
  { key: "5_20", label: "5–20%", test: (p) => p >= 5 && p < 20 },
  { key: "20_50", label: "20–50%", test: (p) => p >= 20 && p < 50 },
  { key: "gte50", label: "50%+", test: (p) => p >= 50 },
];

// Saving a call an hour after it was published and saving it three days later
// are different acts. Nothing in the product had ever said which one you do.
const LAG_BANDS = [
  { key: "h1", label: "within the hour", hint: "you were there for the call" },
  { key: "d1", label: "same day", hint: "" },
  { key: "late", label: "a day or more later", hint: "the move had already started" },
];

function hoursBetween(saveIso, callIso) {
  const a = new Date(saveIso).getTime();
  const b = new Date(callIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (a - b) / 3600000;
}

export function summarise(rows) {
  const ladder = Object.fromEntries(LADDER.map((l) => [l.key, 0]));
  const peak = Object.fromEntries(PEAK_BANDS.map((b) => [b.key, 0]));
  const lag = { h1: 0, d1: 0, late: 0 };
  let resolved = 0;
  let wins = 0;
  let open = 0;
  let peakN = 0;
  let peakSum = 0;
  let lagN = 0;

  for (const r of rows || []) {
    const o = (r.outcome || "").toLowerCase();
    if (o) {
      resolved += 1;
      if (WIN.has(o)) wins += 1;
      if (ladder[o] !== undefined) ladder[o] += 1;
    } else {
      open += 1;
    }

    const p = Number(r.peak_pct);
    if (Number.isFinite(p)) {
      peakN += 1;
      peakSum += p;
      const band = PEAK_BANDS.find((b) => b.test(p));
      if (band) peak[band.key] += 1;
    }

    const h = r.call_created_at ? hoursBetween(r.created_at, r.call_created_at) : null;
    // A negative gap means the clocks disagree, not that you saved it before it
    // existed; drop rather than invent a bucket for it.
    if (h != null && h >= -0.5) {
      lagN += 1;
      if (h <= 1) lag.h1 += 1;
      else if (h <= 24) lag.d1 += 1;
      else lag.late += 1;
    }
  }

  return {
    total: (rows || []).length,
    resolved,
    wins,
    open,
    ladder,
    peak,
    peakN,
    avgPeak: peakN ? peakSum / peakN : null,
    lag,
    lagN,
  };
}

function Bar({ items, total }) {
  if (!total) return null;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink/[0.06]">
      {items.map((it) =>
        it.n > 0 ? (
          <div
            key={it.key}
            title={`${it.label}: ${it.n}`}
            style={{ width: `${(it.n / total) * 100}%`, background: it.color }}
          />
        ) : null
      )}
    </div>
  );
}

function Panel({ title, sample, children }) {
  return (
    <div className="rounded-xl border border-ink/[0.07] bg-surface-raised p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-primary">
          {title}
        </h4>
        {sample != null && (
          <span className="font-mono text-[10px] text-text-muted">n={sample}</span>
        )}
      </div>
      {children}
    </div>
  );
}

export default function WatchlistAnalytics({ rows = [], deskWr = null }) {
  const s = useMemo(() => summarise(rows), [rows]);

  if (!s.total) return null;

  const wr = s.resolved ? wilson(s.wins, s.resolved) : null;
  const ladderItems = LADDER.map((l) => ({ ...l, n: s.ladder[l.key] }));
  const peakItems = PEAK_BANDS.map((b, i) => ({
    key: b.key,
    label: b.label,
    n: s.peak[b.key],
    color: `rgb(var(--viz-${(i % 3) + 1}))`,
  }));

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Panel title="How they finished" sample={s.resolved}>
        <Bar items={ladderItems} total={s.resolved} />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {ladderItems
            .filter((l) => l.n > 0)
            .map((l) => (
              <span key={l.key} className="flex items-center gap-1 text-[10px] text-text-muted">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: l.color }}
                />
                {l.label} <strong className="text-text-primary">{l.n}</strong>
              </span>
            ))}
          {s.open > 0 && (
            <span className="text-[10px] text-text-muted">
              · {s.open} still open, not counted
            </span>
          )}
        </div>
      </Panel>

      <Panel title="Your hit rate" sample={s.resolved}>
        {wr ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[20px] font-bold text-text-primary">
                {wr.p.toFixed(1)}%
              </span>
              <span className="text-[10px] text-text-muted">
                reached TP1 or better
                {deskWr != null && ` · desk ${Number(deskWr).toFixed(1)}%`}
              </span>
            </div>
            {/* The interval, not the number, is the honest part at this sample
                size — the same argument SignalsJournalRecap makes. */}
            <div className="relative mt-2 h-1.5 w-full rounded-full bg-ink/[0.06]">
              <div
                className="absolute h-1.5 rounded-full bg-accent/35"
                style={{ left: `${wr.lo}%`, width: `${Math.max(1, wr.hi - wr.lo)}%` }}
              />
              <div
                className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-accent"
                style={{ left: `${wr.p}%` }}
              />
              {deskWr != null && (
                <div
                  className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink/40"
                  style={{ left: `${Number(deskWr)}%` }}
                  title={`Desk ${Number(deskWr).toFixed(1)}%`}
                />
              )}
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-text-muted">
              {s.resolved < 10
                ? `Anything from ${wr.lo.toFixed(0)}% to ${wr.hi.toFixed(0)}% fits ${s.resolved} resolved call${s.resolved === 1 ? "" : "s"} — the band is the finding, not the number.`
                : `The band spans ${wr.lo.toFixed(0)}–${wr.hi.toFixed(0)}%. The tick is the desk average.`}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-text-muted">
            Nothing has resolved yet, so there is no rate to show.
          </p>
        )}
      </Panel>

      <Panel title="How far they ran" sample={s.peakN}>
        <Bar items={peakItems} total={s.peakN} />
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {peakItems
            .filter((p) => p.n > 0)
            .map((p) => (
              <span key={p.key} className="flex items-center gap-1 text-[10px] text-text-muted">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: p.color }}
                />
                {p.label} <strong className="text-text-primary">{p.n}</strong>
              </span>
            ))}
        </div>
        {s.avgPeak != null && (
          <p className="mt-1.5 text-[10px] text-text-muted">
            Peak after the call, average{" "}
            <strong className="text-text-primary">+{s.avgPeak.toFixed(1)}%</strong>. This is the
            highest it reached, not what a trade would have returned.
          </p>
        )}
      </Panel>

      <Panel title="When you saved them" sample={s.lagN}>
        {s.lagN ? (
          <>
            <Bar
              items={LAG_BANDS.map((b, i) => ({
                key: b.key,
                label: b.label,
                n: s.lag[b.key],
                color: `rgb(var(--viz-${(i % 3) + 1}))`,
              }))}
              total={s.lagN}
            />
            <div className="mt-2 space-y-0.5">
              {LAG_BANDS.filter((b) => s.lag[b.key] > 0).map((b) => (
                <div key={b.key} className="flex items-baseline gap-1.5 text-[10px]">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: `rgb(var(--viz-${(LAG_BANDS.indexOf(b) % 3) + 1}))` }}
                  />
                  <strong className="font-mono text-text-primary">{s.lag[b.key]}</strong>
                  <span className="text-text-muted">{b.label}</span>
                  {b.hint && <span className="text-text-muted/70">— {b.hint}</span>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-text-muted">No call times on these rows yet.</p>
        )}
      </Panel>
    </div>
  );
}
