// src/components/aiArenaV6/TheRead.jsx
// ────────────────────────────────────────────────────────────────
// "The Read" — Compass v2. 24h command center.
// Layout: 12-col grid — narrative + drivers on the left (8),
// decision rail (LevelRail + gauge + exposure) sticky on the right (4).
// Consumes the FULL getLatestReport() object. 100% presentational.
// ────────────────────────────────────────────────────────────────

import { useState } from "react";
import { useLiveBtcPrice } from "./useLiveBtcPrice";
import {
  Card,
  SectionHeader,
  Eyebrow,
  Tag,
  Tile,
  Num,
  Hi,
  StanceGauge,
  confLevel,
  LevelRail,
  fmtUsd,
  fmtPct,
  dirMeta,
  normDir,
  timeAgo,
  humanizeTrigger,
} from "./_ui";

/* ── confidence tier ──
   Was a private copy with 70/50 thresholds while StanceGauge — in the very same
   card — graded the number with the shared confLevel() at 65/45. The two
   disagreed across the whole 65-69 band: "Moderate confidence · 65%" beside a
   dial reading "65% HIGH CONFIDENCE". One classifier, app-wide. */
const tierShort = (c) => confLevel(Number(c) || 0).short.toLowerCase();

/* ── market-mode copy ── */
const MODE = {
  ALTCOIN_FRIENDLY: [
    "Risk-on",
    "Altcoin exposure allowed after confirmation — just don't chase into first resistance.",
  ],
  SELECTIVE_RISK_ON: [
    "Selective risk-on",
    "Only the cleanest setups. Keep size controlled and wait for BTC to respect the active level.",
  ],
  BTC_ONLY_RISK_ON: [
    "BTC-led only",
    "BTC is the cleaner expression. Keep altcoin exposure lighter unless alts confirm relative strength.",
  ],
  DEFENSIVE: [
    "Defensive",
    "Reduce fresh exposure. Wait for a reclaim/confirmation before adding high-beta positions.",
  ],
  EMERGENCY_DE_RISK: [
    "Protect capital",
    "No new high-beta exposure. Prioritise stops, cash, and the next stable structure.",
  ],
  CHOPPY_RANGE: [
    "Range only",
    "Trade level-to-level with smaller size. No conviction entries until the range breaks.",
  ],
};
const modeCopy = (m) =>
  MODE[String(m || "").toUpperCase()] || [
    "Selective",
    "Keep exposure measured until BTC confirms the active projection or invalidates it.",
  ];

/* ── evidence-matrix accessors ── */
const getRows = (data) => data?.report?.evidence_matrix?.rows || [];
const rowScore = (row, h = "24h") => row?.horizons?.[h] || {};
const TACTICAL = new Set(["price_action", "liquidity", "derivatives", "smart_money"]);

const tacticalRows = (rows, limit = 4) =>
  [...(rows || [])]
    .filter((r) => TACTICAL.has(r.key) && r.role !== "context_only")
    .map((r) => ({ ...r, _s: rowScore(r, "24h") }))
    .filter((r) => r._s?.available !== false)
    .sort(
      (a, b) =>
        Math.abs(Number(b._s.weighted_score) || 0) - Math.abs(Number(a._s.weighted_score) || 0)
    )
    .slice(0, limit);

const readable = (v) => {
  const s = String(v ?? "—").replaceAll("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const METRIC_LABELS = {
  top_trader_position: "Top traders long",
  top_trader_position_long: "Top traders long",
  top_trader_account: "Accounts long",
  top_trader_accounts: "Accounts long",
  top_trader_accounts_long: "Accounts long",
  funding_rate: "Funding",
  taker_volume: "Taker volume",
  basis: "Basis",
  btc_price: "BTC price",
  "24h_change": "24h change",
  "72h_change": "72h change",
  "24h_range": "24h range",
  upside_liquidity_mass: "Upside liquidity",
  magnet_above: "Magnet above",
  magnet_below: "Magnet below",
  model_confidence: "Model confidence",
};

function prettyMetric(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (METRIC_LABELS[key]) return METRIC_LABELS[key];
  return readable(String(raw || "").replaceAll("_", " "));
}

/* ── component ── */

/**
 * The headlines the read was formed against.
 *
 * `event_risk.headlines` has been in the payload all along — twelve items with
 * impact, topic, age and a source link — and nothing rendered them. The
 * component that used to (CompassBrief) was orphaned when TheRead replaced it,
 * so the data kept arriving and stopped being shown.
 *
 * Placed near the top rather than at the bottom: a reader asking "why is the
 * call what it is" wants the news before the levels, not after them. Kept to
 * four, sorted by impact then recency — this is context for the read, not a
 * news feed, and the News tab exists for the rest.
 */
function HeadlineStrip({ eventRisk }) {
  const all = eventRisk?.headlines || [];
  if (!all.length) return null;

  const rank = { high: 0, medium: 1, low: 2 };
  const rows = [...all]
    .sort(
      (a, b) =>
        (rank[a.impact] ?? 3) - (rank[b.impact] ?? 3) ||
        (a.age_seconds ?? 1e9) - (b.age_seconds ?? 1e9),
    )
    .slice(0, 4);

  const ago = (secs) => {
    const n = Number(secs);
    if (!Number.isFinite(n)) return "";
    if (n < 3600) return `${Math.max(1, Math.round(n / 60))}m`;
    if (n < 86400) return `${Math.floor(n / 3600)}h`;
    return `${Math.floor(n / 86400)}d`;
  };

  // Only high gets colour. If every row is tinted nothing is emphasised, and
  // the point of the badge is to let one line pull the eye.
  const tone = (impact) =>
    impact === "high"
      ? "border-accent/40 text-accent"
      : "border-ink/[0.12] text-text-muted";

  return (
    <div className="rounded-xl border border-ink/[0.08] bg-surface-raised p-3.5">
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-text-muted">
          News behind this read
        </span>
        <span className="font-mono text-[9.5px] text-text-muted">{all.length} tracked</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((h, i) => (
          <li key={h.url || i} className="flex items-start gap-2.5">
            <span
              className={`mt-[3px] shrink-0 rounded border px-1.5 py-px font-mono text-[8.5px] uppercase tracking-[0.1em] ${tone(h.impact)}`}
            >
              {h.impact || "news"}
            </span>
            <div className="min-w-0 flex-1">
              {h.url ? (
                <a
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] leading-snug text-text-primary/90 transition-colors hover:text-accent"
                >
                  {h.title}
                </a>
              ) : (
                <span className="text-[13px] leading-snug text-text-primary/90">{h.title}</span>
              )}
              <div className="mt-0.5 font-mono text-[9.5px] text-text-muted">
                {[h.source, h.topic_label, ago(h.age_seconds)].filter(Boolean).join(" · ")}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One driver, told once.
 *
 * The same four drivers were rendered in three separate sections — "What's
 * driving the read", "Why this read", and "Supporting numbers — per driver" —
 * plus named again in the opening prose. Direction and strength appeared in all
 * three; the only thing each added over the last was the bar, the weight, and
 * the remaining metrics. The page was not dense, it was repetitive, and a
 * reader had to work out that the three sections were the same four facts.
 *
 * Everything a driver has now lives in one card: which way it points and how
 * strongly, how much it counts toward the verdict, the numbers underneath it,
 * and the sentence explaining it.
 */
// A driver card that shows a number without showing how old that number is
// invites the reader to trust it equally. The liquidity row is the reason this
// exists: its magnets set the contract target while its own source sat 2.5h
// behind, and nothing on the read said so.
function sourceAge(secs) {
  const n = Number(secs);
  if (!Number.isFinite(n) || n < 60) return "";
  if (n < 3600) return `${Math.round(n / 60)}m`;
  if (n < 86400) return `${Math.floor(n / 3600)}h`;
  return `${Math.floor(n / 86400)}d`;
}

function DriverCard({ row }) {
  const s = rowScore(row);
  const m = dirMeta(s.direction);
  const strengthPct = Math.max(0, Math.min(100, Math.round((Number(s.strength) || 0) * 100)));
  const half = strengthPct / 2;
  const weight = Number(s.weight);
  const metrics = (row.evidence || []).slice(0, 6);
  const why = row.rationale || row.evidence?.[0]?.note || null;
  const health = (row.source_health || {}).status || null;
  const healthAge = sourceAge((row.source_health || {}).age_seconds);

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-ink/[0.08] bg-surface-raised">
      <div className="px-3.5 pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-text-primary">{row.label}</span>
            {health && health !== "fresh" ? (
              <span
                className="shrink-0 rounded-md bg-accent/[0.12] px-1.5 py-px font-mono text-[9px] font-semibold uppercase text-accent"
                title={`Source ${health}${healthAge ? ` · last updated ${healthAge} ago` : ""}`}
              >
                {health}
                {healthAge ? ` ${healthAge}` : ""}
              </span>
            ) : null}
          </div>
          <span className={`shrink-0 font-mono text-[11px] font-semibold tabular-nums ${m.text}`}>
            {m.arrow} {m.label} · {strengthPct}%
          </span>
        </div>

        <div className="relative mt-2.5 h-[6px] overflow-hidden rounded-full bg-ink/[0.06]">
          <span className="absolute bottom-0 left-1/2 top-0 w-px bg-ink/[0.16]" />
          {m.k !== "flat" && strengthPct > 0 ? (
            <span
              className="absolute bottom-0 top-0 rounded-full"
              style={
                m.k === "up"
                  ? { left: "50%", width: `${half}%`, background: `linear-gradient(90deg, ${m.hex}55, ${m.hex})` }
                  : { right: "50%", width: `${half}%`, background: `linear-gradient(270deg, ${m.hex}55, ${m.hex})` }
              }
            />
          ) : null}
        </div>
        {Number.isFinite(weight) ? (
          <p className="mt-1 text-right font-mono text-[10px] tabular-nums text-text-muted">
            weight {weight.toFixed(2)}
          </p>
        ) : null}
      </div>

      {metrics.length ? (
        <div className="mt-3 grid grid-cols-2 gap-px border-t border-ink/[0.06] bg-ink/[0.06]">
          {metrics.map((it, i) => (
            <div key={i} className="min-w-0 bg-surface-raised px-3 py-2.5">
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-text-muted" title={prettyMetric(it.metric)}>
                {prettyMetric(it.metric)}
              </p>
              <p className="mt-0.5 truncate font-mono text-[12.5px] font-semibold tabular-nums text-text-primary">
                {it.value ?? "—"}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {why ? (
        <p className="border-t border-ink/[0.06] px-3.5 py-2.5 text-[12px] leading-snug text-text-muted">
          {why}
        </p>
      ) : null}
    </div>
  );
}

export default function TheRead({ data }) {
  const liveBtc = useLiveBtcPrice();
  const [showRisks, setShowRisks] = useState(false);
  if (!data) return null;

  const verdict = data?.report?.verdict || {};
  const tactical = data?.verdict_summary?.tactical_24h || verdict.tactical_24h || {};
  const dir = dirMeta(tactical.direction);
  const conf = Number(tactical.confidence);

  const btc = liveBtc ?? (Number(data?.btc_price) || null);
  const contract = verdict.scenario_contract || {};
  const target = Number(contract?.primary_touch?.level) || null;
  const invalidation = Number(contract?.invalidation?.level) || null;
  const [modeLabel, modeText] = modeCopy(contract?.market_mode);

  const rows = getRows(data);
  const drivers = tacticalRows(rows, 4);
  const zones = verdict.zones_to_watch || [];
  const risks = verdict.risk_scenarios || [];

  // driver agreement — the "why" behind the confidence number
  const driverDir = (r) => normDir(rowScore(r).direction);
  const bull = drivers.filter((r) => driverDir(r) === "up").length;
  const bear = drivers.filter((r) => driverDir(r) === "down").length;
  const flat = drivers.filter((r) => driverDir(r) === "flat").length;
  const aligned = Math.max(bull, bear, flat);

  // why this report exists — the diff narrative + the trigger cause
  const whatChanged = verdict.what_changed || data?.report?.what_changed || "";
  const genSecs = Number(data?.generated_in_seconds);
  const generatedAt = data?.timestamp;
  const isAnomaly = Boolean(data?.is_anomaly_triggered || data?.report?.is_anomaly_triggered);
  const anomalyReason = data?.anomaly_reason || data?.report?.anomaly_reason || "";
  const triggerHuman = humanizeTrigger(anomalyReason);

  const pctFromSpot = (lv) => (btc && lv ? `${fmtPct(((lv - btc) / btc) * 100)} from spot` : "");

  return (
    <div className="space-y-4">
      {/* ════════ WHY THIS UPDATED — Terminal desk strip ════════ */}
      <div className="flex items-start gap-3 rounded-xl border border-ink/[0.08] bg-surface-raised p-3.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-ink/[0.1] bg-surface-secondary text-text-secondary">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-text-muted">
              Why this updated
            </span>
            <span
              className={`rounded border px-1.5 py-px font-mono text-[8.5px] uppercase tracking-[0.12em] ${
                isAnomaly
                  ? "border-ink/15 bg-ink/[0.06] text-text-primary"
                  : "border-ink/[0.1] bg-ink/[0.03] text-text-muted"
              }`}
            >
              {isAnomaly ? "Market-move trigger" : "Baseline read"}
            </span>
            <span className="font-mono text-[9.5px] text-text-muted">
              generated {timeAgo(generatedAt)}
              {isFinite(genSecs)
                ? ` · ${genSecs < 60 ? `${genSecs.toFixed(0)}s` : `${(genSecs / 60).toFixed(1)}m`} run`
                : ""}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-primary">
            {whatChanged
              ? whatChanged
              : `The stance stays ${dir.label.toLowerCase()}${
                  isFinite(conf) ? ` at ${conf}%` : ""
                } and the projected range is broadly unchanged since the previous read.`}
          </p>
          <p className="mt-1.5 text-[11px] leading-[1.5] text-text-muted">
            {isAnomaly
              ? `Trigger: ${triggerHuman || "a material market move"}. Reports are event-driven — a fresh read is produced only when price, volatility, or a key projection level actually moves, not on a fixed clock.`
              : "Event-driven: the model publishes a fresh read only when the market materially changes — a live monitor watches price, volatility, and the projection's key levels every couple of minutes."}
          </p>
        </div>
      </div>

      <HeadlineStrip eventRisk={data?.report?.event_risk || data?.event_risk} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* ════════ LEFT — narrative + drivers (8 cols) ════════ */}
        <div className="min-w-0 space-y-4 xl:col-span-8">
          {/* ── stance hero ── */}
          <Card className="p-5 md:p-7">
            <div className="flex flex-col gap-6 md:flex-row md:flex-wrap md:items-start md:justify-between">
              <div className="min-w-0 flex-1 md:basis-[260px]">
                <Eyebrow>24h stance</Eyebrow>
                <div className={`mt-2 flex items-center gap-4 font-display ${dir.text}`}>
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-xl border text-2xl md:h-14 md:w-14 md:text-3xl"
                    style={{ borderColor: `${dir.hex}44`, background: `${dir.hex}14` }}
                  >
                    {dir.arrow}
                  </span>
                  {/* Direction only — the gauge in this same card states the
                      confidence, and stating it twice is what let the two
                      drift apart in the first place. */}
                  <span className="block text-[28px] font-semibold leading-none tracking-tight md:text-[32px]">
                    {dir.label}
                  </span>
                </div>
                <p className="mt-5 max-w-[62ch] text-[14.5px] leading-[1.9] text-text-primary">
                  <span className="font-semibold text-text-primary">The full picture: </span>
                  BTC trades at{" "}
                  <Hi tone="white">
                    <Num>{fmtUsd(btc)}</Num>
                  </Hi>
                  . The 24-hour read is{" "}
                  <Hi tone={dir.k === "down" ? "down" : dir.k === "flat" ? "gold" : "up"}>
                    {dir.label.toLowerCase()}
                    {isFinite(conf) ? ` · ${conf}%` : ""}
                  </Hi>
                  {drivers.length ? (
                    <>
                      , driven mainly by{" "}
                      {drivers.slice(0, 2).map((r, i) => (
                        <span key={r.key}>
                          {i > 0 ? " and " : " "}
                          <span className="text-text-primary">{r.label.toLowerCase()}</span> (
                          {readable(rowScore(r).direction).toLowerCase()})
                        </span>
                      ))}
                    </>
                  ) : null}
                  {target ? (
                    <>
                      . The path points toward{" "}
                      <Hi tone="up">
                        <Num>{fmtUsd(target)}</Num>
                      </Hi>
                    </>
                  ) : null}
                  {invalidation ? (
                    <>
                      , with the read breaking below{" "}
                      <Hi tone="down">
                        <Num>{fmtUsd(invalidation)}</Num>
                      </Hi>
                    </>
                  ) : null}
                  .
                </p>
              </div>

              {/* confidence gauge + numeric breakdown — centered, self-explaining */}
              <div className="flex w-full shrink-0 flex-col items-center gap-3 md:w-auto">
                <StanceGauge value={conf} dir={tactical.direction} />
                {drivers.length > 0 && (
                  <div className="w-full max-w-[280px] space-y-2.5 rounded-xl border border-ink/[0.06] bg-surface-secondary p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-text-muted">
                        Driver agreement
                      </span>
                      <span className="font-mono text-[12px] tabular-nums text-text-primary">
                        {aligned}/{drivers.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[12px] tabular-nums">
                      <div className="rounded-md border border-profit/15 bg-profit/[0.07] py-1.5">
                        <span className="text-profit">{bull}</span>
                        <span className="ml-0.5 text-text-muted">↑</span>
                      </div>
                      <div className="rounded-md border border-accent/15 bg-accent/[0.07] py-1.5">
                        <span className="text-accent">{flat}</span>
                        <span className="ml-0.5 text-text-muted">→</span>
                      </div>
                      <div className="rounded-md border border-loss/15 bg-loss/[0.07] py-1.5">
                        <span className="text-loss">{bear}</span>
                        <span className="ml-0.5 text-text-muted">↓</span>
                      </div>
                    </div>
                    <p className="text-center text-[10.5px] leading-4 text-text-muted">
                      {isFinite(conf) ? `${conf}% confidence` : "Confidence"} — {aligned} of{" "}
                      {drivers.length} drivers point {dir.label.toLowerCase()}. Conflicting drivers
                      hold it back.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* driver breakdown — each driver, its number, and why it reads that way */}
            {drivers.length > 0 && (
              <div className="mt-6 border-t border-ink/[0.06] pt-5">
                <p className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                  What's driving the read — and why
                </p>
                <p className="mb-3 max-w-[74ch] text-[12.5px] leading-relaxed text-text-muted">
                  Each bar pulls left for bearish, right for bullish; longer means stronger. The
                  verdict is their weighted agreement, so conflicting drivers hold confidence back.
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {drivers.map((r) => (
                    <DriverCard key={r.key} row={r} />
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* ── why this read: diverging driver bars ── */}
          <Card className="p-5 md:p-6" accent="gold">
            <SectionHeader
              label="Why these levels"
              right={<Tag tone="gold">{isFinite(conf) ? `${tierShort(conf)} ${conf}%` : "—"}</Tag>}
            />
            {/* why target / why invalidation */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-profit/15 bg-profit/[0.04] p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-profit">
                  Why target {target ? <Hi tone="up">{fmtUsd(target)}</Hi> : ""}?
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
                  {contract?.primary_touch?.why ||
                    "Nearest upside magnet where liquidity sits — price tends to get pulled there first if bids stay in control."}
                </p>
              </div>
              <div className="rounded-xl border border-loss/15 bg-loss/[0.04] p-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-loss">
                  Why invalidation {invalidation ? <Hi tone="down">{fmtUsd(invalidation)}</Hi> : ""}
                  ?
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
                  {contract?.invalidation?.why ||
                    "Below this level the short-term support structure breaks, so the 24h thesis is void and the read flips."}
                </p>
              </div>
            </div>

            {/* risk scenarios */}
            {risks.length > 0 && (
              <div className="mt-5 border-t border-ink/[0.06] pt-4">
                <button
                  onClick={() => setShowRisks((v) => !v)}
                  className="flex items-center gap-2 font-display text-[13px] font-semibold text-text-primary transition hover:text-text-secondary"
                >
                  <span
                    className={`text-[11px] transition-transform ${showRisks ? "rotate-90" : ""}`}
                  >
                    ▸
                  </span>
                  What can break this read ({risks.length})
                </button>
                {showRisks && (
                  <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {risks.map((rk, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-ink/[0.08] bg-surface-secondary p-3.5"
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="text-[13px] font-medium text-text-primary">
                            {rk.title}
                          </span>
                          <Tag
                            tone={
                              normDir(rk.severity) === "down"
                                ? "down"
                                : rk.severity === "high"
                                  ? "down"
                                  : rk.severity === "medium"
                                    ? "neutral"
                                    : "muted"
                            }
                          >
                            {rk.severity || "watch"}
                          </Tag>
                        </div>
                        {rk.threshold ? (
                          <p className="rounded-md border border-ink/[0.06] lq-well px-2.5 py-1.5 font-mono text-[11px] text-text-secondary">
                            {rk.threshold}
                          </p>
                        ) : null}
                        {rk.why_matters ? (
                          <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">
                            {rk.why_matters}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* ════════ RIGHT — decision rail (4 cols, sticky) ════════ */}
        <div className="min-w-0 space-y-4 xl:col-span-4">
          <div className="space-y-4 xl:sticky xl:top-[64px]">
            {/* level rail */}
            <Card className="p-5">
              <SectionHeader label="Trade geometry · 24h" />
              {target && invalidation && btc ? (
                <LevelRail
                  spot={btc}
                  target={target}
                  invalidation={invalidation}
                  dir={tactical.direction}
                />
              ) : (
                <div className="grid gap-2.5">
                  <Tile label="Price now">
                    <Num className="text-[16px] text-text-primary">{fmtUsd(btc)}</Num>
                  </Tile>
                  <Tile label="Target (first touch)">
                    <Num className="text-[16px] text-profit">{fmtUsd(target)}</Num>
                    {target ? (
                      <p className="mt-0.5 font-mono text-[10.5px] text-text-muted">
                        {pctFromSpot(target)}
                      </p>
                    ) : null}
                  </Tile>
                  <Tile label="Invalidation">
                    <Num className="text-[16px] text-loss">{fmtUsd(invalidation)}</Num>
                    {invalidation ? (
                      <p className="mt-0.5 font-mono text-[10.5px] text-text-muted">
                        read breaks {pctFromSpot(invalidation)}
                      </p>
                    ) : null}
                  </Tile>
                </div>
              )}
            </Card>

            {/* alt exposure */}
            <Card className="p-5" accent="gold">
              <Eyebrow className="text-text-muted">
                Alt exposure — how to trade alts right now
              </Eyebrow>
              <div className="mt-2 font-display text-2xl font-bold tracking-tight">
                <Hi tone="gold">{modeLabel}</Hi>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-text-muted">{modeText}</p>
            </Card>

            {/* key levels / zones */}
            <Card className="p-5">
              <SectionHeader label="Key levels · 24h" />
              <div className="grid gap-2.5">
                <Tile label="Target">
                  <div className="flex items-baseline justify-between gap-2">
                    <Num className="text-[16px] text-profit">{fmtUsd(target)}</Num>
                    {target ? (
                      <span className="font-mono text-[10px] text-text-muted">
                        {pctFromSpot(target)}
                      </span>
                    ) : null}
                  </div>
                </Tile>
                {[...zones]
                  .sort(
                    (a, b) =>
                      (({ supply: 0, fair_value: 1, demand: 2 })[a.kind] ?? 9) -
                      ({ supply: 0, fair_value: 1, demand: 2 }[b.kind] ?? 9)
                  )
                  .slice(0, 3)
                  .map((z, i) => (
                    <Tile key={i} label={readable(z.kind)}>
                      <Num className="text-[14px] text-text-primary">
                        {fmtUsd(z.price_low)}
                        {z.price_high ? (
                          <span className="text-text-muted"> – {fmtUsd(z.price_high)}</span>
                        ) : null}
                      </Num>
                      {z.why ? (
                        <p className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-text-muted">
                          {z.why}
                        </p>
                      ) : null}
                    </Tile>
                  ))}
                <Tile label="Read breaks below">
                  <div className="flex items-baseline justify-between gap-2">
                    <Num className="text-[16px] text-loss">{fmtUsd(invalidation)}</Num>
                    {invalidation ? (
                      <span className="font-mono text-[10px] text-text-muted">
                        {pctFromSpot(invalidation)}
                      </span>
                    ) : null}
                  </div>
                </Tile>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
