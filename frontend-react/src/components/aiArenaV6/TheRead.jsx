// src/components/aiArenaV6/TheRead.jsx
// ────────────────────────────────────────────────────────────────
// "The Read" — short-term (24h) focused panel, Flowscan skin.
// Consumes the FULL getLatestReport() object (passed in as `data`):
//   data.btc_price, data.timestamp, data.cycle
//   data.verdict_summary.{tactical_24h, secondary_7d, primary_30d}
//   data.report.verdict.{scenario_contract, zones_to_watch, risk_scenarios, ...}
//   data.report.evidence_matrix.rows[*] = {key,label,role,rationale,
//        source_health,evidence:[{metric,value,note}],
//        horizons:{ '24h':{direction,strength,weight,weighted_score,available}, '72h':{...} }}
// 100% presentational — no backend changes. Every accessor is defensive.
// ────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  Card, SectionHeader, Eyebrow, Tag, Tile, Num, ConfidenceMeter, WeightBar,
  fmtUsd, fmtPct, dirMeta, normDir,
} from "./_ui";

/* ── confidence tier (matches Codex constants: STRONG>=70 / MODERATE>=50 / LOW) ── */
const tier = (c) => {
  const v = Number(c);
  if (!isFinite(v)) return "—";
  if (v >= 70) return "Strong confidence";
  if (v >= 50) return "Moderate confidence";
  return "Low confidence";
};
const tierShort = (c) => tier(c).split(" ")[0].toLowerCase();

/* ── market-mode plain-language copy ── */
const MODE = {
  ALTCOIN_FRIENDLY: ["Risk-on", "Altcoin exposure allowed after confirmation — just don't chase into first resistance."],
  SELECTIVE_RISK_ON: ["Selective risk-on", "Only the cleanest setups. Keep size controlled and wait for BTC to respect the active level."],
  BTC_ONLY_RISK_ON: ["BTC-led only", "BTC is the cleaner expression. Keep altcoin exposure lighter unless alts confirm relative strength."],
  DEFENSIVE: ["Defensive", "Reduce fresh exposure. Wait for a reclaim/confirmation before adding high-beta positions."],
  EMERGENCY_DE_RISK: ["Protect capital", "No new high-beta exposure. Prioritise stops, cash, and the next stable structure."],
  CHOPPY_RANGE: ["Range only", "Trade level-to-level with smaller size. No conviction entries until the range breaks."],
};
const modeCopy = (m) => MODE[String(m || "").toUpperCase()] || ["Selective", "Keep exposure measured until BTC confirms the active projection or invalidates it."];

/* ── evidence-matrix accessors ── */
const getRows = (data) => data?.report?.evidence_matrix?.rows || [];
const rowScore = (row, h = "24h") => row?.horizons?.[h] || {};
const TACTICAL = new Set(["price_action", "liquidity", "derivatives", "smart_money"]);

const tacticalRows = (rows, limit = 4) =>
  [...(rows || [])]
    .filter((r) => TACTICAL.has(r.key) && r.role !== "context_only")
    .map((r) => ({ ...r, _s: rowScore(r, "24h") }))
    .filter((r) => r._s?.available !== false)
    .sort((a, b) => Math.abs(Number(b._s.weighted_score) || 0) - Math.abs(Number(a._s.weighted_score) || 0))
    .slice(0, limit);

const readable = (v) => {
  const s = String(v ?? "—").replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/* ── component ── */

export default function TheRead({ data }) {
  const [showRisks, setShowRisks] = useState(false);
  if (!data) return null;

  const verdict = data?.report?.verdict || {};
  const tactical = data?.verdict_summary?.tactical_24h || verdict.tactical_24h || {};
  const dir = dirMeta(tactical.direction);
  const conf = Number(tactical.confidence);

  const btc = Number(data?.btc_price) || null;
  const contract = verdict.scenario_contract || {};
  const target = Number(contract?.primary_touch?.level) || null;
  const invalidation = Number(contract?.invalidation?.level) || null;
  const [modeLabel, modeText] = modeCopy(contract?.market_mode);

  const rows = getRows(data);
  const drivers = tacticalRows(rows, 4);
  const zones = verdict.zones_to_watch || [];
  const risks = verdict.risk_scenarios || [];

  const pctFromSpot = (lv) => (btc && lv ? ` ${fmtPct(((lv - btc) / btc) * 100)} from spot` : "");

  return (
    <div className="space-y-4">
      {/* ═══ VERDICT HERO ═══ */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="min-w-[260px] flex-[1.3]">
            <Eyebrow>24h stance</Eyebrow>
            <div className={`mt-2 flex items-center gap-3 font-display ${dir.text}`}>
              <span className="text-4xl">{dir.arrow}</span>
              <span className="text-[44px] font-bold leading-none tracking-tight">{dir.label}</span>
            </div>
            <p className="mt-2.5 font-mono text-[13px] text-text-muted">
              {tier(conf)}{isFinite(conf) ? ` · ${conf}%` : ""}
            </p>
            <p className="mt-3.5 max-w-[54ch] text-[14px] leading-relaxed text-white/90">
              <span className="font-semibold text-gold-primary">What this means: </span>
              alt exposure is <span className="text-white">{modeLabel}</span> — {modeText}
            </p>
          </div>

          <div className="min-w-[240px] flex-1">
            <Eyebrow className="mb-3">Confidence</Eyebrow>
            <ConfidenceMeter value={conf} dir={tactical.direction} />
            <p className="mt-2.5 text-[12px] text-text-muted">
              Confidence reflects how aligned the drivers below are.
            </p>
          </div>
        </div>

        {/* full-picture summary */}
        <p className="mt-5 max-w-[70ch] text-[14.5px] leading-[1.7] text-white/90">
          <span className="font-semibold text-white">The full picture: </span>
          BTC trades at <Num className="text-gold-primary">{fmtUsd(btc)}</Num>. The 24-hour read is{" "}
          <span className={`font-semibold ${dir.text}`}>{dir.label.toLowerCase()}</span>
          {isFinite(conf) ? <> at <Num className="text-gold-primary">{conf}%</Num></> : null} confidence
          {drivers.length ? <>, driven mainly by {drivers.slice(0, 2).map((r, i) => (
            <span key={r.key}>{i > 0 ? " and " : " "}<span className="text-white">{r.label.toLowerCase()}</span> ({readable(rowScore(r).direction).toLowerCase()})</span>
          ))}</> : null}
          {target ? <>. The path points toward <Num className="text-profit">{fmtUsd(target)}</Num></> : null}
          {invalidation ? <>, with the read breaking below <Num className="text-loss">{fmtUsd(invalidation)}</Num></> : null}.
        </p>

        {/* at-a-glance */}
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Tile label="Price now"><Num className="text-[16px] text-white">{fmtUsd(btc)}</Num></Tile>
          <Tile label="Target (first touch)">
            <Num className="text-[16px] text-profit">{fmtUsd(target)}</Num>
            {target ? <p className="mt-0.5 text-[11px] text-text-muted">{pctFromSpot(target)}</p> : null}
          </Tile>
          <Tile label="Invalidation">
            <Num className="text-[16px] text-loss">{fmtUsd(invalidation)}</Num>
            {invalidation ? <p className="mt-0.5 text-[11px] text-text-muted">read breaks{pctFromSpot(invalidation)}</p> : null}
          </Tile>
          <Tile label="Alt exposure">
            <span className="font-display text-[14px] font-semibold text-gold-primary">{modeLabel}</span>
          </Tile>
          {drivers.map((r) => {
            const m = dirMeta(rowScore(r).direction);
            return (
              <Tile key={r.key} label={r.label}>
                <span className={`font-display text-[14px] font-semibold ${m.text}`}>{m.label}</span>
                {r.evidence?.[0] ? <p className="mt-0.5 truncate text-[11px] text-text-muted">{r.evidence[0].metric}: {r.evidence[0].value ?? "—"}</p> : null}
              </Tile>
            );
          })}
        </div>
      </Card>

      {/* ═══ KEY LEVELS ═══ */}
      <Card className="p-5">
        <SectionHeader label="Key levels · 24h" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Tile label="Target"><Num className="text-[17px] text-profit">{fmtUsd(target)}</Num></Tile>
          {[...zones]
            .sort((a, b) => ({ supply: 0, fair_value: 1, demand: 2 }[a.kind] ?? 9) - ({ supply: 0, fair_value: 1, demand: 2 }[b.kind] ?? 9))
            .slice(0, 2)
            .map((z, i) => (
              <Tile key={i} label={readable(z.kind)}>
                <Num className="text-[15px] text-white">{fmtUsd(z.price_low)}{z.price_high ? <span className="text-text-muted"> – {fmtUsd(z.price_high)}</span> : null}</Num>
              </Tile>
            ))}
          <Tile label="Read breaks below"><Num className="text-[17px] text-loss">{fmtUsd(invalidation)}</Num></Tile>
        </div>
      </Card>

      {/* ═══ FULL BREAKDOWN ═══ */}
      <Card className="p-5" accent="gold">
        <div className="mb-1 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gold-primary">★ Full breakdown</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted/60">anatomy of this read</span>
        </div>
        <p className="mb-5 max-w-[70ch] text-[14px] leading-relaxed text-white/85">
          <span className="font-semibold text-white">Why {dir.label.toLowerCase()}{isFinite(conf) ? ` at ${conf}%` : ""}? </span>
          The 24h verdict is the weighted agreement of the drivers below. Where they align, confidence rises; where one is
          neutral or conflicts, confidence is held back — which is why this sits at{" "}
          <span className="text-gold-primary">{isFinite(conf) ? tierShort(conf) : "—"}</span>.
        </p>

        {/* 1 · drivers + weights */}
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted/80">1 · What's driving the direction</p>
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
              {drivers.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-4 text-center font-mono text-[11px] uppercase tracking-wider text-text-muted/60">No driver data</td></tr>
              )}
              {drivers.map((r) => {
                const s = rowScore(r);
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
              <tr className="bg-white/[0.02]">
                <td className="px-3 py-2.5 font-semibold text-white">Net result</td>
                <td /><td />
                <td className="px-3 py-2.5"><span className={`font-semibold ${dir.text}`}>{dir.label}{isFinite(conf) ? ` · ${tierShort(conf)} ${conf}%` : ""}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 2 · supporting numbers per driver */}
        <p className="mb-2 mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted/80">2 · Supporting numbers — per driver</p>
        <div className="space-y-2.5">
          {drivers.map((r) => (
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

        {/* 3 · why target / why invalidation */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-sm border border-white/[0.06] bg-[#120809] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-profit">Why target {target ? fmtUsd(target) : ""}?</p>
            <p className="mt-1.5 text-[13px] text-text-muted">{contract?.primary_touch?.why || "Nearest upside magnet where liquidity sits — price tends to get pulled there first if bids stay in control."}</p>
          </div>
          <div className="rounded-sm border border-white/[0.06] bg-[#120809] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-loss">Why invalidation {invalidation ? fmtUsd(invalidation) : ""}?</p>
            <p className="mt-1.5 text-[13px] text-text-muted">{contract?.invalidation?.why || "Below this level the short-term support structure breaks, so the 24h thesis is void and the read flips."}</p>
          </div>
        </div>

        {/* what breaks the read (risk scenarios) */}
        {risks.length > 0 && (
          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <button onClick={() => setShowRisks((v) => !v)} className="flex items-center gap-2 font-display text-[13px] font-semibold text-gold-primary">
              <span className={`text-[11px] transition-transform ${showRisks ? "rotate-90" : ""}`}>▸</span>
              What can break this read ({risks.length})
            </button>
            {showRisks && (
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {risks.map((rk, i) => (
                  <div key={i} className="rounded-sm border border-white/[0.06] bg-[#120809] p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-white/90">{rk.title}</span>
                      <Tag tone={normDir(rk.severity) === "down" ? "down" : rk.severity === "high" ? "down" : rk.severity === "medium" ? "neutral" : "muted"}>{rk.severity || "watch"}</Tag>
                    </div>
                    {rk.threshold ? <p className="rounded-sm border border-white/[0.06] bg-black/20 px-2.5 py-1.5 font-mono text-[11px] text-white/70">{rk.threshold}</p> : null}
                    {rk.why_matters ? <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">{rk.why_matters}</p> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
