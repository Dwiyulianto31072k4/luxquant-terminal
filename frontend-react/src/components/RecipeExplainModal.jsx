// Drill-down explain for Quick path recipes. Compact page, deep modal.
// Hunt full TP carries live SL / TP1–TP4 mix vs all closed calls.

import { useMemo, useState } from "react";
import Modal from "./ui/Modal";
import { SegGroup } from "./ui/SegGroup";
import { TAG_GLOSSARY } from "./terminal/tagGlossary";
import { OUTCOME_LABELS, RECIPE_EXPLAIN } from "./recipeExplain";

const RECIPE_TABS = [
  { key: "quick", label: "Overview" },
  { key: "full_tp", label: "Hunt" },
  { key: "strongest", label: "Strongest" },
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

const BAR_TONE = {
  sl: "bg-loss/80",
  tp1: "bg-ink/25",
  tp2: "bg-ink/45",
  tp3: "bg-positive/55",
  tp4: "bg-positive/85",
};

function StackedBar({ mix, className = "" }) {
  const final = mix?.final_pct || {};
  return (
    <div
      className={`flex h-2.5 overflow-hidden rounded-full bg-ink/[0.06] ${className}`}
      aria-hidden
    >
      {OUTCOME_LABELS.map((o) => {
        const w = Number(final[o.key]) || 0;
        if (w <= 0) return null;
        return (
          <span
            key={o.key}
            className={BAR_TONE[o.key]}
            style={{ width: `${w}%` }}
            title={`${o.short} ${fmtPct(w)}`}
          />
        );
      })}
    </div>
  );
}

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

export function HuntResults({ stats, loading, error }) {
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
        Loading Hunt results…
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

  return (
    <div className="rounded-xl border border-positive/20 bg-positive/[0.04] p-3 sm:p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-positive">
            Results so far · closed only
            {stats.window_label ? ` · ${stats.window_label}` : ""}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-text-primary">
            {fmtN(hunt.n)} Hunt calls vs {fmtN(base?.n)} all closed · {windowLabel}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
            Open calls are not in these bars — same as Performance. A call counts when it hits TP or
            SL.
            {stats.tags_selected_from?.label
              ? ` Hunt tags picked ${stats.tags_selected_from.label}.`
              : ""}
          </p>
        </div>
        <SegGroup
          size="sm"
          aria-label="Outcome view"
          value={view}
          onChange={setView}
          options={[
            { key: "final", label: "Final mix" },
            { key: "reached", label: "Reached ≥" },
          ]}
        />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-text-muted">
          <span>Hunt</span>
          <span className="tabular-nums">
            SL {fmtPct(hunt.sl_rate)} · win {fmtPct(hunt.win_rate)} · TP3+ {fmtPct(hunt.full_tp_rate)}
          </span>
        </div>
        <StackedBar mix={hunt} />
        {base ? (
          <>
            <div className="mb-1 mt-2.5 flex items-center justify-between gap-2 text-[10px] text-text-muted">
              <span>All closed calls</span>
              <span className="tabular-nums">
                SL {fmtPct(base.sl_rate)} · win {fmtPct(base.win_rate)} · TP3+ {fmtPct(base.full_tp_rate)}
              </span>
            </div>
            <StackedBar mix={base} className="opacity-80" />
          </>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1">
        {OUTCOME_LABELS.map((o) => {
          const pct = hunt[pctKey]?.[o.key];
          const d = vs?.[deltaKey]?.[o.key];
          const colorDelta =
            d == null || d === 0
              ? null
              : o.key === "sl"
                ? d < 0
                : view === "reached" || o.key === "tp3" || o.key === "tp4"
                  ? d > 0
                  : null;
          return (
            <div
              key={o.key}
              className="rounded-lg border border-ink/[0.07] bg-surface-raised/80 px-1 py-1.5 text-center sm:px-1.5"
            >
              <div className="flex items-center justify-center">
                <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
                  {o.short}
                </span>
                <OutcomeInfo item={o} view={view} />
              </div>
              <p className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums text-text-primary sm:text-[14px]">
                {fmtPct(pct)}
              </p>
              <p
                className={`font-mono text-[9px] tabular-nums ${
                  colorDelta == null
                    ? "text-text-muted"
                    : colorDelta
                      ? "text-positive"
                      : "text-loss"
                }`}
              >
                {fmtPp(d)}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-2.5 text-[11px] leading-snug text-text-muted">
        {view === "final"
          ? stats.how_to_read?.final
          : stats.how_to_read?.reached}{" "}
        {stats.open_count != null ? (
          <span className="text-text-primary/80">
            {stats.open_count} open on the desk now.
          </span>
        ) : null}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-text-muted">
        {stats.stats_cover}
      </p>

      {Array.isArray(stats.per_tag) && stats.per_tag.length > 0 ? (
        <div className="mt-3 border-t border-ink/[0.06] pt-2.5">
          <p className="font-mono text-[9.5px] uppercase tracking-wider text-text-muted">
            Runner tags in this mix · tap for that tag only
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {stats.per_tag.map((t) => {
              const active = tagOpen === t.tag;
              return (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() => setTagOpen(active ? null : t.tag)}
                  className={`rounded-lg border px-2 py-1 text-left text-[11px] ${
                    active
                      ? "border-positive/35 bg-positive/10 text-text-primary"
                      : "border-ink/[0.1] bg-ink/[0.02] text-text-primary/90 hover:border-ink/20"
                  }`}
                >
                  <span className="block font-medium capitalize">{niceTag(t.tag)}</span>
                  <span className="font-mono text-[10px] tabular-nums text-text-muted">
                    n={fmtN(t.n)} · TP3+ {fmtPct(t.full_tp_rate)} · {t.active_count || 0} open
                  </span>
                </button>
              );
            })}
          </div>
          {tagOpen ? (
            <TagDrill
              tag={stats.per_tag.find((t) => t.tag === tagOpen)}
              view={view}
            />
          ) : null}
        </div>
      ) : null}
    </div>
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
        Overlapping — this tag’s n can exceed its share of the Hunt union. A call with two
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
    if (id === "full_tp") return "Shortlist Hunt full TP";
    if (id === "strongest") return "Shortlist Strongest setups";
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
