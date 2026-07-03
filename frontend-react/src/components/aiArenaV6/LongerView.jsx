// src/components/aiArenaV6/LongerView.jsx
// ────────────────────────────────────────────────────────────────
// "Longer View" — Compass v2.
//   • Swing (7d):   secondary_7d verdict + drivers at 72h + swing zones.
//   • Holder (30d): primary_30d verdict + cycle phase/score + structural rows.
// Consumes the full getLatestReport() object as `data`.
// ────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  Card, SectionHeader, Eyebrow, Tag, Tile, Num,
  StanceGauge, SignalBar, Segmented,
  fmtUsd, dirMeta,
} from "./_ui";

const tier = (c) => {
  const v = Number(c);
  if (!isFinite(v)) return "—";
  if (v >= 70) return "Strong confidence";
  if (v >= 50) return "Moderate confidence";
  return "Low confidence";
};

const getRows = (data) => data?.report?.evidence_matrix?.rows || [];
const rowScore = (row, h) => row?.horizons?.[h] || {};
const readable = (v) => {
  const s = String(v ?? "—").replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const SWING = new Set(["price_action", "liquidity", "derivatives", "smart_money", "onchain"]);
const OUTLOOK = new Set(["macro", "onchain", "cycle_context"]);

const swingRows = (rows) =>
  [...(rows || [])]
    .filter((r) => SWING.has(r.key) && r.role !== "context_only")
    .map((r) => ({ ...r, _s: rowScore(r, "72h") }))
    .filter((r) => r._s?.available !== false)
    .sort((a, b) => Math.abs(Number(b._s.weighted_score) || 0) - Math.abs(Number(a._s.weighted_score) || 0))
    .slice(0, 4);

const outlookRows = (rows) => (rows || []).filter((r) => OUTLOOK.has(r.key)).slice(0, 4);

/* ── shared stance hero ── */
const VerdictHero = ({ horizon, verdict, note }) => {
  const dir = dirMeta(verdict?.direction);
  const conf = Number(verdict?.confidence);
  return (
    <Card className="p-5 md:p-7">
      <div className="flex flex-col gap-6 md:flex-row md:flex-wrap md:items-start md:justify-between">
        <div className="min-w-0 flex-1 md:basis-[240px]">
          <Eyebrow>{horizon} stance</Eyebrow>
          <div className={`mt-2 flex items-center gap-4 font-display ${dir.text}`}>
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl border text-2xl"
              style={{ borderColor: `${dir.hex}44`, background: `${dir.hex}14` }}
            >
              {dir.arrow}
            </span>
            <div>
              <span className="block text-[30px] font-bold leading-none tracking-tight md:text-[38px]">{dir.label}</span>
              <span className="mt-1 block font-mono text-[12px] tracking-wide text-text-muted">
                {tier(conf)}{isFinite(conf) ? ` · ${conf}%` : ""}
              </span>
            </div>
          </div>
          {note && <p className="mt-4 max-w-[58ch] text-[13.5px] leading-relaxed text-text-muted">{note}</p>}
        </div>
        <div className="flex w-full shrink-0 flex-col items-center gap-2 md:w-auto md:pt-1">
          <StanceGauge value={conf} dir={verdict?.direction} size={150} />
          <p className="max-w-[200px] text-center text-[10.5px] leading-4 text-text-muted/60">
            {isFinite(conf) ? `${tier(conf)} · ${conf}%` : "Confidence"} — how aligned the {horizon.toLowerCase()} drivers are.
          </p>
        </div>
      </div>
    </Card>
  );
};

/* ── metric grid for a set of rows ── */
const RowMetrics = ({ rows, horizon = "72h" }) => (
  <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
    {rows.map((r) => (
      (r.evidence?.length > 0) && (
        <div key={r.key} className="min-w-0 rounded-lg border border-white/[0.05] bg-[#140b0d] p-3.5">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold-primary/80">{r.label}</span>
            {r.rationale ? <span className="truncate text-[11px] text-text-muted/70">— {r.rationale}</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {r.evidence.slice(0, 6).map((it, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] text-white/65">{it.metric}</span>
                <Num className="text-[12px] text-white/90">{it.value ?? "—"}</Num>
              </div>
            ))}
          </div>
        </div>
      )
    ))}
  </div>
);

/* ── main ── */
export default function LongerView({ data }) {
  const [view, setView] = useState("7d");
  if (!data) return null;

  const verdict = data?.report?.verdict || {};
  const vs = data?.verdict_summary || {};
  const rows = getRows(data);
  const zones = verdict.zones_to_watch || [];
  const swing = swingRows(rows);
  const outlook = outlookRows(rows);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[{ value: "7d", label: "Swing · 7d" }, { value: "30d", label: "Holder · 30d" }]}
          value={view}
          onChange={setView}
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted/50">
          {view === "7d" ? "range-based" : "cycle backdrop"}
        </span>
      </div>

      {view === "7d" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="min-w-0 space-y-4 xl:col-span-8">
            <VerdictHero
              horizon="7-day swing"
              verdict={vs.secondary_7d || verdict.secondary_7d}
              note="The swing view looks past intraday noise at the multi-day range — where positioning and flow favour the next leg. Frame swing entries here, not scalps."
            />

            <Card className="p-5 md:p-6" accent="gold">
              <SectionHeader label="Swing drivers · 72h horizon" />
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {swing.length === 0 && (
                  <p className="col-span-full py-6 text-center font-mono text-[11px] uppercase tracking-wider text-text-muted/60">
                    No driver data
                  </p>
                )}
                {swing.map((r) => {
                  const s = rowScore(r, "72h");
                  return (
                    <SignalBar
                      key={r.key}
                      label={r.label}
                      direction={s.direction}
                      strength={s.strength}
                      weight={s.weight}
                      detail={r.evidence?.[0] ? `${r.evidence[0].metric}: ${r.evidence[0].value ?? "—"}` : r.rationale}
                    />
                  );
                })}
              </div>
              <p className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted/80">
                Supporting numbers
              </p>
              <RowMetrics rows={swing} />
            </Card>
          </div>

          <div className="min-w-0 space-y-4 xl:col-span-4">
            <div className="space-y-4 xl:sticky xl:top-[64px]">
              {zones.length > 0 && (
                <Card className="p-5">
                  <SectionHeader label="Swing zones to watch" />
                  <div className="grid gap-2.5">
                    {[...zones].slice(0, 3).map((z, i) => (
                      <Tile key={i} label={readable(z.kind)}>
                        <Num className="text-[15px] text-white">
                          {fmtUsd(z.price_low)}
                          {z.price_high ? <span className="text-text-muted"> – {fmtUsd(z.price_high)}</span> : null}
                        </Num>
                        {z.why ? <p className="mt-1 line-clamp-3 text-[10.5px] leading-snug text-text-muted/70">{z.why}</p> : null}
                      </Tile>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="min-w-0 space-y-4 xl:col-span-8">
            <VerdictHero
              horizon="30-day holder"
              verdict={vs.primary_30d || verdict.primary_30d}
              note="The structural backdrop — valuation and macro liquidity over weeks. It sets the weather, not the entry: a constructive backdrop doesn't override a bearish 24h read, and vice-versa."
            />

            <Card className="p-5 md:p-6" accent="gold">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary">★ Structural metrics</span>
                <Tag tone="muted">backdrop · not an entry signal</Tag>
              </div>
              <p className="mb-4 max-w-[70ch] text-[13.5px] leading-relaxed text-text-muted">
                Valuation and macro gauges describing where this cycle sits. They move slowly — read them as
                context for the 24h and 7d calls, not as triggers.
              </p>
              <RowMetrics rows={outlook} />
            </Card>
          </div>

          <div className="min-w-0 space-y-4 xl:col-span-4">
            <div className="space-y-4 xl:sticky xl:top-[64px]">
              <Card className="p-5">
                <SectionHeader
                  label="Cycle position"
                  right={data?.cycle?.phase ? <Tag tone="gold">{readable(data.cycle.phase)}</Tag> : null}
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <Tile label="Cycle score">
                    <Num className="text-[20px] text-white">{data?.cycle?.score != null ? data.cycle.score : "—"}</Num>
                  </Tile>
                  <Tile label="Phase">
                    <span className="font-display text-[14px] font-semibold text-gold-light">{readable(data?.cycle?.phase)}</span>
                  </Tile>
                  {outlook.slice(0, 2).map((r) => {
                    const m = dirMeta(rowScore(r, "72h").direction);
                    return (
                      <Tile key={r.key} label={r.label}>
                        <span className={`font-display text-[14px] font-semibold ${m.text}`}>{m.arrow} {m.label}</span>
                      </Tile>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
