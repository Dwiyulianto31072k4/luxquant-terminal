// src/components/aiArenaV6/LongerView.jsx
// ────────────────────────────────────────────────────────────────
// "Longer View" — separate focus from The Read. Flowscan skin.
//   • Swing (7d):   secondary_7d verdict + drivers at the 72h horizon + swing zones.
//   • Holder (30d): primary_30d verdict + cycle phase/score + macro/on-chain/cycle
//                   context rows (evidence_matrix), labelled "backdrop, not entry".
// Consumes the full getLatestReport() object as `data`. No backend changes.
// ────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  Card, SectionHeader, Eyebrow, Tag, Tile, Num, ConfidenceMeter, WeightBar, Segmented,
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

/* ── shared compact verdict hero ── */
const VerdictHero = ({ horizon, verdict, note }) => {
  const dir = dirMeta(verdict?.direction);
  const conf = Number(verdict?.confidence);
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-6">
        <div className="min-w-[240px] flex-[1.2]">
          <Eyebrow>{horizon} stance</Eyebrow>
          <div className={`mt-2 flex items-center gap-3 font-display ${dir.text}`}>
            <span className="text-3xl">{dir.arrow}</span>
            <span className="text-[38px] font-bold leading-none tracking-tight">{dir.label}</span>
          </div>
          <p className="mt-2.5 font-mono text-[13px] text-text-muted">{tier(conf)}{isFinite(conf) ? ` · ${conf}%` : ""}</p>
          {note && <p className="mt-3 max-w-[50ch] text-[13.5px] leading-relaxed text-text-muted">{note}</p>}
        </div>
        <div className="min-w-[220px] flex-1">
          <Eyebrow className="mb-3">Confidence</Eyebrow>
          <ConfidenceMeter value={conf} dir={verdict?.direction} />
        </div>
      </div>
    </Card>
  );
};

/* ── driver table (72h) ── */
const DriverTable = ({ rows }) => (
  <div className="overflow-hidden rounded-sm border border-white/[0.05]">
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-b border-white/[0.06] bg-white/[0.015]">
          {["Driver", "Strength", "Weight", "Signal"].map((h) => (
            <th key={h} className="px-3 py-2 text-left font-mono text-[9px] font-normal uppercase tracking-[0.12em] text-text-muted/60">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr><td colSpan={4} className="px-3 py-4 text-center font-mono text-[11px] uppercase tracking-wider text-text-muted/60">No driver data</td></tr>
        )}
        {rows.map((r) => {
          const s = rowScore(r, "72h");
          const m = dirMeta(s.direction);
          const strength = Math.round((Number(s.strength) || 0) * 100);
          return (
            <tr key={r.key} className="border-b border-white/[0.04] last:border-0">
              <td className="px-3 py-2.5 text-white/90">{r.label}</td>
              <td className="px-3 py-2.5"><WeightBar pct={strength} /><Num className="text-text-muted">{strength}%</Num></td>
              <td className="px-3 py-2.5"><Num className="text-text-muted">{Number(s.weight ?? 0).toFixed(2)}</Num></td>
              <td className="px-3 py-2.5"><Tag tone={m.k === "up" ? "up" : m.k === "down" ? "down" : "neutral"}>{m.label}</Tag></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

/* ── metric grid for a set of rows ── */
const RowMetrics = ({ rows }) => (
  <div className="space-y-2.5">
    {rows.map((r) => (
      (r.evidence?.length > 0) && (
        <div key={r.key} className="rounded-sm border border-white/[0.04] bg-[#120809] p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold-primary/80">{r.label}</span>
            {r.rationale ? <span className="truncate text-[11px] text-text-muted/70">— {r.rationale}</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {r.evidence.slice(0, 6).map((it, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className="truncate text-[12px] text-white/70">{it.metric}</span>
                <Num className="text-[12px] text-white/85">{it.value ?? "—"}</Num>
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
      <div className="flex items-center justify-between gap-3">
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
        <>
          <VerdictHero
            horizon="7-day swing"
            verdict={vs.secondary_7d || verdict.secondary_7d}
            note="The swing view looks past intraday noise at the multi-day range — where positioning and flow favour the next leg. Frame swing entries here, not scalps."
          />

          {zones.length > 0 && (
            <Card className="p-5">
              <SectionHeader label="Swing zones to watch" />
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {[...zones].slice(0, 3).map((z, i) => (
                  <Tile key={i} label={readable(z.kind)}>
                    <Num className="text-[15px] text-white">{fmtUsd(z.price_low)}{z.price_high ? <span className="text-text-muted"> – {fmtUsd(z.price_high)}</span> : null}</Num>
                    {z.why ? <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-text-muted/70">{z.why}</p> : null}
                  </Tile>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-5" accent="gold">
            <div className="mb-4 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary">★ Swing breakdown</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted/60">72h horizon</span>
            </div>
            <DriverTable rows={swing} />
            <p className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted/80">Supporting numbers</p>
            <RowMetrics rows={swing} />
          </Card>
        </>
      ) : (
        <>
          <VerdictHero
            horizon="30-day holder"
            verdict={vs.primary_30d || verdict.primary_30d}
            note="The structural backdrop — valuation and macro liquidity over weeks. It sets the weather, not the entry: a constructive backdrop doesn't override a bearish 24h read, and vice-versa."
          />

          <Card className="p-5">
            <SectionHeader
              label="Cycle position"
              right={data?.cycle?.phase ? <Tag tone="gold">{readable(data.cycle.phase)}</Tag> : null}
            />
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Tile label="Cycle score"><Num className="text-[17px] text-white">{data?.cycle?.score != null ? data.cycle.score : "—"}</Num></Tile>
              <Tile label="Phase"><span className="font-display text-[14px] font-semibold text-gold-primary">{readable(data?.cycle?.phase)}</span></Tile>
              {outlook.slice(0, 2).map((r) => {
                const m = dirMeta(rowScore(r, "72h").direction);
                return (
                  <Tile key={r.key} label={r.label}>
                    <span className={`font-display text-[14px] font-semibold ${m.text}`}>{m.label}</span>
                  </Tile>
                );
              })}
            </div>
          </Card>

          <Card className="p-5" accent="gold">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary">★ Structural metrics</span>
              <Tag tone="muted">backdrop · not an entry signal</Tag>
            </div>
            <p className="mb-4 max-w-[68ch] text-[13.5px] leading-relaxed text-text-muted">
              Valuation and macro gauges describing where this cycle sits. They move slowly — read them as context for the 24h and 7d calls, not as triggers.
            </p>
            <RowMetrics rows={outlook} />
          </Card>
        </>
      )}
    </div>
  );
}
