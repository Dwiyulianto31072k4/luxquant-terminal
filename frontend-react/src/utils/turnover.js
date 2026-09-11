// Turnover — how much of a coin's market cap changed hands in 24 hours.
//
// The ratio itself (volume ÷ market cap) is the same number Money Flow calls
// "flow intensity", but 0.098 tells a reader nothing. Read as a percentage it
// says something plain: a tenth of the whole market cap traded today.
//
// Denominator: the market cap RECORDED WITH THE CALL, not a live one. There is
// no live market cap for most called pairs — only 170 of the 631 pairs called
// in the last seven days appear in the 250-coin Money Flow snapshot, while 613
// of them carry a recorded figure. And the recorded figure is the better number
// anyway: measured against the live snapshot for the 110 pairs present in both,
// it is off by 6.2% on average, while scaling it by the price move since entry
// — the obvious "correction" — is off by 7.3%. Supply moves too, so the
// correction adds error rather than removing it.

/** "1,582.84B" / "$6.18B" / "740000000" → number, or null. Mirrors the SQL in
 *  backend/app/services/custom_signal_rules.py so both ends agree. */
export function parseMarketCap(raw) {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  const clean = String(raw).replace(/[,$\s]/g, "").toUpperCase();
  if (!/^[0-9]+(\.[0-9]+)?[KMBT]?$/.test(clean)) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[clean.slice(-1)] || 1;
  const n = parseFloat(mult === 1 ? clean : clean.slice(0, -1)) * mult;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Live 24h quote volume ÷ recorded market cap. Null unless both are usable. */
export function turnoverRatio(volume24h, marketCap) {
  const v = Number(volume24h);
  const m = parseMarketCap(marketCap);
  if (!Number.isFinite(v) || v <= 0 || !m) return null;
  const r = v / m;
  return Number.isFinite(r) && r > 0 ? r : null;
}

// Bands are the book's own distribution, not round numbers picked by feel.
// Measured across the 234 coins in the live snapshot that carry both figures:
// median 3.9% of market cap, p75 9.8%, p90 16.7%, p99 76.7%, max 145%.
const BANDS = [
  { key: "very_heavy", min: 0.3, label: "Very heavy", share: "top 5%" },
  { key: "heavy", min: 0.1, label: "Heavy", share: "top 25%" },
  { key: "active", min: 0.04, label: "Active", share: "above the median coin" },
  { key: "quiet", min: 0, label: "Quiet", share: "bottom half" },
];

export function turnoverBand(ratio) {
  if (ratio == null) return null;
  return BANDS.find((b) => ratio >= b.min) || BANDS[BANDS.length - 1];
}

/** The number as people read it: "9.8%" of market cap. */
export function formatTurnover(ratio) {
  if (ratio == null) return null;
  if (ratio >= 1) return `${ratio.toFixed(1)}×`; // past 100%, a multiple reads better
  return `${(ratio * 100).toFixed(ratio >= 0.1 ? 0 : 1)}%`;
}

/** One sentence for a tooltip or a detail row. */
export function turnoverSentence(ratio) {
  const band = turnoverBand(ratio);
  if (!band) return null;
  const amount =
    ratio >= 1
      ? `${ratio.toFixed(1)}× this coin's market cap`
      : `${(ratio * 100).toFixed(1)}% of this coin's market cap`;
  return `${amount} traded in the last 24 hours — ${band.label.toLowerCase()} turnover, ${band.share} of coins. Volume is live; market cap is the figure recorded with the call.`;
}

export function turnoverToneClass(ratio) {
  const band = turnoverBand(ratio);
  if (!band) return "text-text-muted";
  // Turnover is activity, not a verdict: heavy is not good and quiet is not bad,
  // so it steps through weight, never through green-to-red.
  return band.key === "very_heavy" || band.key === "heavy"
    ? "text-text-primary font-medium"
    : "text-text-secondary";
}
