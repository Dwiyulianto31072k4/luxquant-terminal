// Drill-down explain for Quick path recipes. Compact page, deep modal.
// Runners carries live SL / TP1–TP4 mix vs all closed calls.

import { useMemo, useState } from "react";
import Modal from "./ui/Modal";
import { SegGroup } from "./ui/SegGroup";
import { TAG_GLOSSARY } from "./terminal/tagGlossary";
import { OUTCOME_LABELS, RECIPE_EXPLAIN } from "./recipeExplain";

const RECIPE_TABS = [
  { key: "quick", label: "Overview" },
  { key: "full_tp", label: "Runners" },
  { key: "caution", label: "Caution" },
];

function niceTag(tag) {
  return String(tag || "").replace(/_/g, " ");
}

function fmtPct(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  return `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;
}

function fmtPp(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  const n = Number(v);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}pp`;
}

function fmtN(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US");
}

function fmtDate(iso) {
  if (!iso) return "—";
  const p = String(iso).split("-");
  if (p.length !== 3) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parseInt(p[2], 10)} ${months[parseInt(p[1], 10) - 1]} ${p[0]}`;
}

// ── Outcome scale ────────────────────────────────────────────────────────────
// SL is a status colour: it means loss, so it keeps the loss token. TP1→TP4 are
// one hue stepped by lightness, because "how far did it get" is an ordered
// magnitude, not four identities. Both ramps are in index.css and were run
// through the ordinal checks (monotone L, ΔL ≥ 0.06, end clears the surface).
const OUTCOME_FILL = {
  sl: "rgb(var(--neg))",
  tp1: "var(--viz-tp1)",
  tp2: "var(--viz-tp2)",
  tp3: "var(--viz-tp3)",
  tp4: "var(--viz-tp4)",
};

/** value · what it is measured against · both deltas. A rate this close to the
 *  baseline is easy to oversell with one number, so the tile always carries the
 *  point difference AND the relative one — the pair is what stops "+9.6" being
 *  read as "9.6% better" or "nearly double". */
function Headline({ label, value, baseline, deltaPp, ratio, betterWhen }) {
  const good = deltaPp == null ? null : betterWhen === "lower" ? deltaPp < 0 : deltaPp > 0;
  return (
    <div className="rounded-lg border border-ink/[0.08] bg-ink/[0.02] px-3 py-2.5">
      <p className="text-[11.5px] leading-snug text-text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-[22px] font-semibold leading-none tabular-nums text-text-primary">
        {fmtPct(value)}
      </p>
      <p className="mt-1.5 text-[11.5px] leading-snug text-text-muted tabular-nums">
        vs {fmtPct(baseline)} with no filter
      </p>
      {deltaPp != null ? (
        <p
          className={`mt-1 inline-flex items-center gap-1 font-mono text-[11px] tabular-nums ${
            good ? "text-positive" : "text-loss"
          }`}
        >
          <span aria-hidden>{deltaPp > 0 ? "▲" : "▼"}</span>
          {fmtPp(deltaPp)}
          {ratio ? <span className="text-text-muted">· {ratio.toFixed(2)}× as often</span> : null}
        </p>
      ) : null}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {OUTCOME_LABELS.map((o) => (
        <span key={o.key} className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: OUTCOME_FILL[o.key] }}
            aria-hidden
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            {o.short}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Coinglass-style long/short track: two dots on one scale so a 2pp gap is visible. */
function CompareTrack({ label, runners, baseline, betterWhen = "higher" }) {
  const a = Number(runners);
  const b = Number(baseline);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const pad = Math.max(6, (hi - lo) * 1.8);
  const min = Math.max(0, lo - pad);
  const max = Math.min(100, hi + pad);
  const span = max - min || 1;
  const pos = (v) => `${((v - min) / span) * 100}%`;
  const delta = a - b;
  const good = betterWhen === "lower" ? delta < 0 : delta > 0;
  const leftIsA = a <= b;
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-text-primary">{label}</p>
        <p
          className={`font-mono text-[12px] tabular-nums ${
            Math.abs(delta) < 0.15
              ? "text-text-muted"
              : good
                ? "text-positive"
                : "text-loss"
          }`}
        >
          {Math.abs(delta) < 0.15 ? "same" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp`}
        </p>
      </div>
      <div className="relative h-7">
        <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink/[0.08]" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent/35"
          style={{
            left: pos(lo),
            width: `${((hi - lo) / span) * 100}%`,
          }}
        />
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink/25 bg-surface-raised"
          style={{ left: pos(b) }}
          title={`No filter ${fmtPct(b)}`}
        />
        <span
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-accent shadow-sm"
          style={{ left: pos(a) }}
          title={`Runners ${fmtPct(a)}`}
        />
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[10px] tabular-nums text-text-muted">
        <span>{leftIsA ? `Runners ${fmtPct(a)}` : `No filter ${fmtPct(b)}`}</span>
        <span>{leftIsA ? `No filter ${fmtPct(b)}` : `Runners ${fmtPct(a)}`}</span>
      </div>
    </div>
  );
}

/** 100% stacked mix — Coinglass long/short ratio: the whole bar is the book. */
function StackedMix({ mix, dim = false }) {
  const keys = ["sl", "tp1", "tp2", "tp3", "tp4"];
  return (
    <div className={`flex h-4 w-full overflow-hidden rounded-sm ${dim ? "opacity-80" : ""}`}>
      {keys.map((k) => {
        const w = Number(mix?.final_pct?.[k]) || 0;
        if (w <= 0) return null;
        return (
          <span
            key={k}
            className="h-full min-w-[2px]"
            style={{ width: `${w}%`, background: OUTCOME_FILL[k] }}
            title={`${k.toUpperCase()} ${fmtPct(w)}`}
          />
        );
      })}
    </div>
  );
}

function plainTakeaway(hunt, base) {
  const sl = (Number(hunt.sl_rate) || 0) - (Number(base?.sl_rate) || 0);
  const tp3 = (Number(hunt.full_tp_rate) || 0) - (Number(base?.full_tp_rate) || 0);
  const bits = [];
  if (Math.abs(sl) >= 0.4) {
    bits.push(
      sl < 0
        ? `stopped out less often (${sl.toFixed(1)}pp)`
        : `stopped out more often (+${sl.toFixed(1)}pp)`
    );
  }
  if (Math.abs(tp3) >= 0.4) {
    bits.push(
      tp3 > 0
        ? `reached TP3 a bit more (+${tp3.toFixed(1)}pp)`
        : `reached TP3 a bit less (${tp3.toFixed(1)}pp)`
    );
  }
  if (!bits.length) return "In this window the two mixes finished almost the same.";
  return `In this window, Runners ${bits.join(" and ")}.`;
}

/** The "what does TP2 mean here" popover that rides each row of the table. */
function OutcomeInfo({ item, view }) {
  const [open, setOpen] = useState(false);
  const text = view === "reached" ? item.reached : item.final;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`What is ${item.title}?`}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 160)}
        className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-ink/25 font-mono text-[8px] font-bold leading-none text-text-muted hover:border-ink/60 hover:text-text-primary"
      >
        i
      </button>
      {open ? (
        <span className="absolute left-0 top-5 z-30 w-56 rounded-lg border border-ink/15 bg-surface-raised p-2.5 text-left shadow-[0_12px_32px_rgb(var(--scrim)/0.3)]">
          <span className="block text-[11px] font-semibold text-text-primary">{item.title}</span>
          <span className="mt-1 block text-[11px] leading-snug text-text-muted">{text}</span>
        </span>
      ) : null}
    </span>
  );
}

const LBL =
  "font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted";

export function HuntResults({
  stats,
  loading,
  error,
  windowValue,
  onWindow,
  windowOptions,
}) {
  const [view, setView] = useState("final");
  const [tagOpen, setTagOpen] = useState(null);

  const hunt = stats?.hunt;
  const base = stats?.baseline;
  const vs = stats?.vs_all;
  const pctKey = view === "reached" ? "reached_pct" : "final_pct";
  const deltaKey = view === "reached" ? "reached_pp" : "final_pp";

  if (loading && !stats) {
    return (
      <div className="rounded-xl border border-ink/[0.08] bg-ink/[0.02] px-3 py-3 text-[12px] text-text-muted">
        Loading Runner results…
      </div>
    );
  }
  if (error && !stats) {
    return (
      <div className="rounded-xl border border-ink/[0.08] px-3 py-3 text-[12px] text-text-muted">
        Results could not load. The filter still works — try again in a moment.
      </div>
    );
  }
  if (!hunt) return null;

  const windowLabel = stats.window
    ? `${fmtDate(stats.window.start)} – ${fmtDate(stats.window.end)}`
    : "tag era";

  const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
  const ratio = (a, b) => {
    const x = num(a);
    const y = num(b);
    return x != null && y ? x / y : null;
  };

  return (
    <section className="overflow-hidden rounded-xl border border-ink/[0.08] bg-surface-raised">
      {/* HEADER — what is being counted and over what window. Nothing else. */}
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-ink/[0.08] bg-ink/[0.02] px-3 py-2.5 sm:px-3.5">
        <div className="min-w-0">
          <p className={LBL}>Runners vs no filter · closed calls only</p>
          <p className="mt-1 text-[12.5px] leading-snug text-text-primary tabular-nums">
            {fmtN(hunt.n)} with runner tags vs {fmtN(base?.n)} unfiltered
          </p>
          <p className="text-[11px] leading-snug text-text-muted tabular-nums">{windowLabel}</p>
        </div>
        {onWindow && windowOptions ? (
          <SegGroup
            size="touch"
            aria-label="Runner results window"
            value={windowValue}
            onChange={onWindow}
            options={windowOptions}
          />
        ) : null}
      </header>

      <div className="space-y-5 px-3 py-3 sm:px-3.5">
        <p className="text-[13px] leading-snug text-text-primary">
          {plainTakeaway(hunt, base)}
        </p>

        <div className="grid gap-2 sm:grid-cols-3">
          <Headline
            label="Hit TP1+"
            value={hunt.win_rate}
            baseline={base?.win_rate}
            deltaPp={
              num(hunt.win_rate) != null && num(base?.win_rate) != null
                ? num(hunt.win_rate) - num(base.win_rate)
                : null
            }
            ratio={ratio(hunt.win_rate, base?.win_rate)}
            betterWhen="higher"
          />
          <Headline
            label="Hit TP3+"
            value={hunt.full_tp_rate}
            baseline={base?.full_tp_rate}
            deltaPp={
              num(hunt.full_tp_rate) != null && num(base?.full_tp_rate) != null
                ? num(hunt.full_tp_rate) - num(base.full_tp_rate)
                : null
            }
            ratio={ratio(hunt.full_tp_rate, base?.full_tp_rate)}
            betterWhen="higher"
          />
          <Headline
            label="Stopped out"
            value={hunt.sl_rate}
            baseline={base?.sl_rate}
            deltaPp={
              num(hunt.sl_rate) != null && num(base?.sl_rate) != null
                ? num(hunt.sl_rate) - num(base.sl_rate)
                : null
            }
            ratio={ratio(hunt.sl_rate, base?.sl_rate)}
            betterWhen="lower"
          />
        </div>

        <div className="rounded-lg border border-ink/[0.08] bg-ink/[0.02] px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className={LBL}>Runners vs no filter</p>
            <p className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" />
              Runners
              <span className="ml-3 mr-2 inline-block h-2 w-2 rounded-full border border-ink/30 bg-surface-raised align-middle" />
              No filter
            </p>
          </div>
          <CompareTrack
            label="Hit TP1+"
            runners={hunt.win_rate}
            baseline={base?.win_rate}
          />
          <CompareTrack
            label="Hit TP3+"
            runners={hunt.full_tp_rate}
            baseline={base?.full_tp_rate}
          />
          <CompareTrack
            label="Stopped out"
            runners={hunt.sl_rate}
            baseline={base?.sl_rate}
            betterWhen="lower"
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={LBL}>How the book finished</p>
            <Legend />
          </div>
          <div className="mt-2 space-y-2">
            {[
              { name: "Runners", mix: hunt, dim: false },
              { name: "No filter", mix: base, dim: true },
            ]
              .filter((r) => r.mix)
              .map((r) => (
                <div key={r.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="text-[11.5px] text-text-primary">{r.name}</span>
                    <span className="font-mono text-[11px] tabular-nums text-text-muted">
                      SL {fmtPct(r.mix.sl_rate)} · TP3+ {fmtPct(r.mix.full_tp_rate)}
                    </span>
                  </div>
                  <StackedMix mix={r.mix} dim={r.dim} />
                </div>
              ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-text-muted">
            Each bar is 100% of that mix. Red is stopped out; darker green ran further.
            {stats.open_count != null
              ? ` ${stats.open_count} calls are still open and are in neither bar.`
              : ""}{" "}
            Live Runners also keeps the top 20% of Edge on the day you are looking at — not in these bars.
          </p>
        </div>

        {/* 3 — every step, for anyone who wants the table */}
        <details className="group rounded-lg border border-ink/[0.08] bg-ink/[0.02] px-3 py-2.5">
          <summary className={`flex cursor-pointer list-none items-center justify-between gap-2 ${LBL} [&::-webkit-details-marker]:hidden`}>
            Step by step
            <span className="transition-transform group-open:rotate-180" aria-hidden>
              ▾
            </span>
          </summary>

          <div className="mt-3">
            <SegGroup
              size="touch"
              fill
              aria-label="Outcome view"
              value={view}
              onChange={setView}
              options={[
                { key: "final", label: "Ended here" },
                { key: "reached", label: "Reached ≥" },
              ]}
            />
            <p className="mt-2 text-[11px] leading-snug text-text-muted">
              {view === "final" ? stats.how_to_read?.final : stats.how_to_read?.reached}
            </p>

            <div className="mt-2.5 overflow-x-auto">
              <table className="w-full min-w-[19rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-ink/[0.08]">
                    <th className={`py-1.5 pr-2 ${LBL} font-normal`}>Outcome</th>
                    <th className={`py-1.5 px-2 text-right ${LBL} font-normal`}>Runners</th>
                    <th className={`py-1.5 px-2 text-right ${LBL} font-normal`}>No filter</th>
                    <th className={`py-1.5 pl-2 text-right ${LBL} font-normal`}>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {OUTCOME_LABELS.map((o) => {
                    const d = num(vs?.[deltaKey]?.[o.key]);
                    const good =
                      d == null || d === 0
                        ? null
                        : o.key === "sl"
                          ? d < 0
                          : view === "reached" || o.key === "tp3" || o.key === "tp4"
                            ? d > 0
                            : null;
                    return (
                      <tr key={o.key} className="border-b border-ink/[0.05] last:border-0">
                        <td className="py-1.5 pr-2">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-[2px]"
                              style={{ background: OUTCOME_FILL[o.key] }}
                              aria-hidden
                            />
                            <span className="font-mono text-[11px] uppercase tracking-wider text-text-primary">
                              {o.short}
                            </span>
                            <OutcomeInfo item={o} view={view} />
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-[12px] tabular-nums text-text-primary">
                          {fmtPct(hunt[pctKey]?.[o.key])}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-[12px] tabular-nums text-text-muted">
                          {fmtPct(base?.[pctKey]?.[o.key])}
                        </td>
                        <td
                          className={`py-1.5 pl-2 text-right font-mono text-[12px] tabular-nums ${
                            good == null ? "text-text-muted" : good ? "text-positive" : "text-loss"
                          }`}
                        >
                          {fmtPp(d)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-[11px] leading-snug text-text-muted">
              A difference can be good while it reads negative: fewer calls
              <span className="text-text-primary"> ending </span>
              at TP1 or TP2 usually means they carried on to TP3 or TP4. Those two rows are
              left grey for that reason.
            </p>
            <p className="mt-1 text-[11px] leading-snug text-text-muted">{stats.stats_cover}</p>
          </div>
        </details>

        {/* 4 — the tags the mix is built from */}
        {Array.isArray(stats.per_tag) && stats.per_tag.length > 0 ? (
          <div>
            <p className={LBL}>Runner tags in this mix</p>
            <p className="mb-2 mt-1 text-[11px] leading-snug text-text-muted">
              Tap one to see that tag on its own. Tags overlap, so a call with two of them is
              one row above and appears under both here.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {stats.per_tag.map((t) => {
                const active = tagOpen === t.tag;
                return (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => setTagOpen(active ? null : t.tag)}
                    className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                      active
                        ? "border-accent/45 bg-accent/10"
                        : "border-ink/[0.1] bg-ink/[0.02] hover:border-ink/20"
                    }`}
                  >
                    <span className="block text-[11.5px] font-medium capitalize text-text-primary">
                      {niceTag(t.tag)}
                    </span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-ink/[0.08]">
                      <span
                        className="block h-full rounded-full bg-accent/80"
                        style={{ width: `${Math.min(100, Number(t.full_tp_rate) || 0)}%` }}
                      />
                    </span>
                    <span className="mt-0.5 font-mono text-[10px] tabular-nums text-text-muted">
                      TP3+ {fmtPct(t.full_tp_rate)} · n={fmtN(t.n)}
                      {t.active_count ? ` · ${t.active_count} open` : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            {tagOpen ? (
              <TagDrill tag={stats.per_tag.find((t) => t.tag === tagOpen)} view={view} />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TagDrill({ tag, view }) {
  if (!tag) return null;
  const gloss = TAG_GLOSSARY[tag.tag];
  const mix = tag.mix;
  const pctKey = view === "reached" ? "reached_pct" : "final_pct";
  return (
    <div className="mt-2 rounded-lg border border-ink/[0.08] bg-surface-raised px-2.5 py-2">
      <p className="text-[12px] font-semibold capitalize text-text-primary">{niceTag(tag.tag)}</p>
      {gloss ? <p className="mt-1 text-[11.5px] leading-snug text-text-muted">{gloss}</p> : null}
      {mix ? (
        <div className="mt-2 grid grid-cols-5 gap-1">
          {OUTCOME_LABELS.map((o) => (
            <div key={o.key} className="text-center">
              <p className="font-mono text-[9px] uppercase text-text-muted">{o.short}</p>
              <p className="font-mono text-[12px] tabular-nums text-text-primary">
                {fmtPct(mix[pctKey]?.[o.key])}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-1.5 text-[10.5px] leading-snug text-text-muted">
        Overlapping — this tag’s n can exceed its share of the Runner union. A call with two
        runner tags is one row in Results so far, and counted in both tag chips.
      </p>
    </div>
  );
}

function Drill({ id, title, hint, simple, expert, openId, onToggle }) {
  const open = openId === id;
  const [depth, setDepth] = useState("simple");
  return (
    <div className="border-t border-ink/[0.07]">
      <button
        type="button"
        onClick={() => onToggle(open ? null : id)}
        className="flex w-full items-start justify-between gap-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span>
          <span className="block text-[13px] font-semibold text-text-primary">{title}</span>
          {!open && hint ? (
            <span className="mt-0.5 block text-[11.5px] text-text-muted">{hint}</span>
          ) : null}
        </span>
        <span className="mt-0.5 font-mono text-[12px] text-text-muted" aria-hidden>
          {open ? "–" : "+"}
        </span>
      </button>
      {open ? (
        <div className="pb-3">
          <p className="text-[13px] leading-relaxed text-text-primary/90">
            {depth === "expert" ? expert : simple}
          </p>
          {expert && expert !== simple ? (
            <button
              type="button"
              onClick={() => setDepth((d) => (d === "simple" ? "expert" : "simple"))}
              className="mt-2 font-mono text-[10px] uppercase tracking-wider text-accent hover:underline"
            >
              {depth === "simple" ? "Expert detail" : "Simpler"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function RecipeExplainModal({
  recipeId = "quick",
  onChangeRecipe,
  onClose,
  onApply,
  huntStats = null,
  huntLoading = false,
  huntError = false,
}) {
  const [openId, setOpenId] = useState(null);
  const id = RECIPE_EXPLAIN[recipeId] ? recipeId : "quick";
  const copy = RECIPE_EXPLAIN[id];

  const applyLabel = useMemo(() => {
    if (id === "full_tp") return "Shortlist Runners";
    if (id === "strongest") return "Shortlist Top rated";
    if (id === "caution") return "Show Caution first";
    return null;
  }, [id]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      padded={false}
      eyebrow="Quick path"
      title={copy.label}
      subtitle={copy.oneLiner}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-ink/12 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-text-primary"
          >
            Close
          </button>
          {applyLabel && onApply ? (
            <button
              type="button"
              onClick={() => onApply(id)}
              className="rounded-lg border border-accent/35 bg-accent/15 px-3 py-1.5 text-[12px] font-semibold text-text-primary hover:bg-accent/25"
            >
              {applyLabel}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="px-5 py-4 sm:px-6">
        <SegGroup
          size="sm"
          fill
          aria-label="Recipe"
          value={id}
          onChange={(key) => {
            onChangeRecipe?.(key);
            setOpenId(null);
          }}
          options={RECIPE_TABS}
        />

        <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-text-primary/90">
          {(copy.simple || []).map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>

        {id === "full_tp" ? (
          <div className="mt-3">
            <HuntResults stats={huntStats} loading={huntLoading} error={huntError} />
          </div>
        ) : null}

        <div className="mt-3">
          {(copy.drills || []).map((d) => (
            <Drill
              key={d.id}
              id={d.id}
              title={d.title}
              hint={d.hint}
              simple={d.simple}
              expert={d.expert}
              openId={openId}
              onToggle={setOpenId}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
