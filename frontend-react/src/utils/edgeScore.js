// Edge Score v2 — journal-aligned multi-factor scoring.
// Lockstep with backend/app/api/routes/edge_lab.py get_edge_correlation open scoring:
//   EB-shrunk tag rates + Wilson uncertainty + volume/risk/BTC/time-to-TP/coin/expectancy.
// Prefer set = top non-confound tags with shrunk lift ≥ +2pp.
//
// Anti-leak (as-of-entry best practice):
//   Open rows  → tag-wr is resolved-only history (this call not in outcomes).
//   Closed rows → leave-one-out: reverse this call’s outcome from tag + coin
//                 priors before scoring so the result cannot invent the score.

const CONFOUND = new Set([
  "LATE_ENTRY",
  "PARABOLIC",
  "OVEREXTENDED",
  "EXHAUSTION_CANDLE",
]);

const MIN_N = 40;
const PREFER_TOP_N = 8;
const PREFER_LIFT_PP = 2;
const EB_STRENGTH = 40;
const WIN_OUTCOMES = new Set(["tp1", "tp2", "tp3", "tp4"]);
const FULL_OUTCOMES = new Set(["tp3", "tp4"]);

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

/** Beta-Binomial style shrink toward prior rate (0–100 scale in/out). */
export function ebShrinkRate(wins, n, priorPct, strength = EB_STRENGTH) {
  if (n == null || n < 0) return priorPct;
  const prior = clamp((Number(priorPct) || 0) / 100, 0, 1);
  const a = prior * strength;
  const b = (1 - prior) * strength;
  return (((Number(wins) || 0) + a) / (n + a + b)) * 100;
}

/** Map signal status → outcome bucket used in tag-wr, or null if still open. */
export function resolveEdgeOutcome(status) {
  if (!status) return null;
  const s = String(status).toLowerCase();
  if (s === "open" || s === "active") return null;
  if (s === "closed_win") return "tp4";
  if (s === "closed_loss") return "sl";
  if (s === "sl1" || s === "sl2") return "sl";
  if (s === "tp1" || s === "tp2" || s === "tp3" || s === "tp4" || s === "sl") return s;
  return null;
}

function isWinOutcome(o) {
  return o && WIN_OUTCOMES.has(o);
}

function isFullOutcome(o) {
  return o && FULL_OUTCOMES.has(o);
}

/** Wilson half-width (pp) from wins/n — matches backend scale roughly. */
function wilsonHalfPp(wins, n) {
  if (!n || n <= 0) return 12;
  const z = 1.96;
  const p = clamp(wins / n, 0, 1);
  const den = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  const lo = (centre - margin) / den;
  const hi = (centre + margin) / den;
  return Math.round(((hi - lo) / 2) * 1000) / 10; // percentage points
}

function rebuildPreferSet(tagMap, baseWr) {
  const preferCandidates = Object.entries(tagMap)
    .filter(
      ([tag, m]) =>
        !CONFOUND.has(tag) && m.lift != null && m.lift >= PREFER_LIFT_PP && m.n >= MIN_N
    )
    .sort((a, b) => b[1].lift - a[1].lift || b[1].n - a[1].n)
    .slice(0, PREFER_TOP_N);
  return new Set(preferCandidates.map(([tag]) => tag));
}

/**
 * Build baseline + prefer set + tag map from tag-wr (or edge-correlation tags).
 * Uses win_rate_shrunk / lift_shrunk_pp when API provides them.
 * Stores raw wins/full_n so closed rows can leave-one-out cleanly.
 */
export function buildEdgeScoreContext(tagWr = [], baselineWr = null) {
  const list = (tagWr || []).filter(
    (t) =>
      t &&
      t.tag &&
      (typeof t.win_rate === "number" || typeof t.win_rate_shrunk === "number") &&
      (t.n || 0) >= 1
  );
  if (!list.length) {
    return { baseWr: 80, baseFull: 35, preferSet: new Set(), tagMap: {} };
  }

  let tw = 0;
  let tn = 0;
  let tf = 0;
  for (const t of list) {
    if ((t.n || 0) < MIN_N) continue;
    const wr = t.win_rate_shrunk ?? t.win_rate;
    if (typeof wr !== "number") continue;
    tw += wr * t.n;
    tn += t.n;
    if (typeof t.full_tp_rate === "number") tf += (t.full_tp_rate_shrunk ?? t.full_tp_rate) * t.n;
  }
  const weighted = tn > 0 ? tw / tn : 80;
  const baseWr =
    baselineWr != null && Number.isFinite(Number(baselineWr))
      ? Number(baselineWr)
      : weighted;
  const baseFull = tn > 0 ? tf / tn : 35;

  const tagMap = {};
  for (const t of list) {
    if ((t.n || 0) < MIN_N && t.win_rate_shrunk == null) continue;
    const n = t.n || 0;
    let wins = t.wins;
    if (wins == null && typeof t.win_rate === "number") {
      wins = Math.round((t.win_rate / 100) * n);
    }
    wins = wins ?? 0;
    let fullN = t.full_tp_n;
    if (fullN == null && typeof t.full_tp_rate === "number") {
      fullN = Math.round((t.full_tp_rate / 100) * n);
    }
    fullN = fullN ?? 0;

    let wrS = t.win_rate_shrunk;
    let fullS = t.full_tp_rate_shrunk;
    if (wrS == null) {
      wrS = ebShrinkRate(wins, n, baseWr);
    }
    if (fullS == null) {
      fullS = ebShrinkRate(fullN, n, baseFull);
    }
    const liftS = wrS != null ? wrS - baseWr : t.lift_shrunk_pp ?? t.lift_pp ?? null;
    tagMap[t.tag] = {
      wr: wrS,
      wrRaw: t.win_rate,
      n,
      wins,
      fullN,
      full: fullS,
      tp4: t.tp4_rate ?? null,
      peak: t.median_peak_wins ?? t.median_peak ?? null,
      lift: liftS,
      wilsonHalf: t.win_rate_wilson_half ?? wilsonHalfPp(wins, n),
      medianTtTp1: t.median_tt_tp1_sec ?? null,
      reliability: t.reliability || null,
    };
  }

  const preferSet = rebuildPreferSet(tagMap, baseWr);
  return { baseWr, baseFull, preferSet, tagMap };
}

/**
 * Leave-one-out tag context: reverse this resolved outcome from every tag on
 * the signal, re-shrink rates, rebuild prefer set. Open calls skip this.
 */
export function leaveOneOutEdgeContext(ctx, tagNames, outcome) {
  if (!ctx?.tagMap || !outcome || !Array.isArray(tagNames) || !tagNames.length) return ctx;

  const baseWr = ctx.baseWr ?? 80;
  const baseFull = ctx.baseFull ?? 35;
  const tagMap = { ...ctx.tagMap };
  const win = isWinOutcome(outcome);
  const full = isFullOutcome(outcome);
  let changed = false;

  for (const tg of tagNames) {
    const m = tagMap[tg];
    if (!m || !m.n || m.n < 1) continue;
    const n = Math.max(0, m.n - 1);
    const wins = Math.max(0, (m.wins ?? 0) - (win ? 1 : 0));
    const fullN = Math.max(0, (m.fullN ?? 0) - (full ? 1 : 0));
    if (n < 1) {
      // No prior samples left for this tag after reverse
      delete tagMap[tg];
      changed = true;
      continue;
    }
    const wrS = ebShrinkRate(wins, n, baseWr);
    const fullS = ebShrinkRate(fullN, n, baseFull);
    tagMap[tg] = {
      ...m,
      n,
      wins,
      fullN,
      wr: wrS,
      wrRaw: (wins / n) * 100,
      full: fullS,
      lift: wrS - baseWr,
      wilsonHalf: wilsonHalfPp(wins, n),
    };
    changed = true;
  }

  if (!changed) return ctx;
  const preferSet = rebuildPreferSet(tagMap, baseWr);
  return { ...ctx, tagMap, preferSet, _loo: true, _loo_outcome: outcome };
}

/**
 * Coin WR prior without this resolved trade (for coinAdj only).
 */
export function leaveOneOutCoinWr(coin, outcome) {
  if (!coin || outcome == null) return coin?.win_rate ?? null;
  const closed = coin.closed_trades || 0;
  if (closed < 1) return coin.win_rate ?? null;
  let wins;
  if (coin.outcome_dist) {
    const d = coin.outcome_dist;
    wins = (d.tp1 || 0) + (d.tp2 || 0) + (d.tp3 || 0) + (d.tp4 || 0);
  } else if (coin.win_rate != null) {
    wins = Math.round((Number(coin.win_rate) / 100) * closed);
  } else {
    return coin.win_rate ?? null;
  }
  const newClosed = closed - 1;
  if (newClosed < 1) return null;
  const newWins = Math.max(0, wins - (isWinOutcome(outcome) ? 1 : 0));
  return Math.round((newWins / newClosed) * 1000) / 10;
}

/**
 * Score one signal — multi-factor v2.
 * Closed rows auto LOO so score is as-of-entry (no own-outcome leak).
 * @param {string[]} tagNames
 * @param {object} ctx from buildEdgeScoreContext
 * @param {object} [signal] desk row (risk, volume, btc, pair)
 * @param {object} [coin] coin intel for pair
 */
export function scoreSignalTags(tagNames, ctx, signal = null, coin = null) {
  if (!ctx?.tagMap || !Array.isArray(tagNames) || !tagNames.length) {
    return null;
  }

  const outcome = resolveEdgeOutcome(signal?.status);
  const scoringCtx = outcome ? leaveOneOutEdgeContext(ctx, tagNames, outcome) : ctx;
  const { baseWr, preferSet, tagMap } = scoringCtx || {};
  if (!tagMap) return null;

  // Coin prior: LOO when this row is already resolved
  let scoringCoin = coin;
  if (outcome && coin) {
    const looWr = leaveOneOutCoinWr(coin, outcome);
    scoringCoin = looWr == null ? coin : { ...coin, win_rate: looWr };
  }

  const hist = [];
  for (const tg of tagNames) {
    const m = tagMap[tg];
    // After LOO, tag may drop below MIN_N — still use if n>=1 for continuity
    if (m && (m.n || 0) >= 1) hist.push({ tag: tg, ...m });
  }
  if (!hist.length) return null;

  const lifts = [];
  const fulls = [];
  const wrs = [];
  const halves = [];
  const tts = [];
  let confoundN = 0;
  let preferN = 0;
  for (const m of hist) {
    const wr = Number(m.wr) || 0;
    wrs.push(wr);
    lifts.push(wr - (baseWr || 80));
    fulls.push(Number(m.full) || 0);
    if (m.wilsonHalf != null) halves.push(Number(m.wilsonHalf));
    if (m.medianTtTp1 != null) tts.push(Number(m.medianTtTp1));
    if (CONFOUND.has(m.tag)) confoundN += 1;
    if (preferSet?.has(m.tag)) preferN += 1;
  }
  const avgWr = wrs.reduce((a, b) => a + b, 0) / wrs.length;
  const avgFull = fulls.reduce((a, b) => a + b, 0) / fulls.length;
  const avgLift = lifts.reduce((a, b) => a + b, 0) / lifts.length;
  const avgHalf = halves.length ? halves.reduce((a, b) => a + b, 0) / halves.length : 12;
  const medianTt = tts.length ? [...tts].sort((a, b) => a - b)[Math.floor(tts.length / 2)] : null;
  const confoundFrac = confoundN / hist.length;
  const preferFrac = preferN / hist.length;

  const core =
    52 +
    1.5 * avgLift +
    0.2 * avgFull +
    7 * preferFrac -
    12 * confoundFrac -
    0.25 * Math.max(0, avgHalf - 6);

  // Volume rank
  let volAdj = 0;
  const vn = signal?.volume_rank_num;
  const vd = signal?.volume_rank_den;
  if (vn != null && vd && Number(vd) > 0) {
    const pctile = 1 - Number(vn) / Number(vd);
    volAdj = 3 * (pctile - 0.5);
  }

  // Risk
  let riskAdj = 0;
  const rl = String(signal?.risk_level || "").toLowerCase();
  if (rl.startsWith("low")) riskAdj = 1.5;
  else if (rl.startsWith("high")) riskAdj = -1.5;

  // BTC
  let btcAdj = 0;
  if (signal?.btc_decoupled) btcAdj = avgLift < 2 ? -1 : 0.5;
  const corr = signal?.btc_corr ?? signal?.corr_4h_30d;
  if (corr != null && Number(corr) > 0.85 && avgLift < 0) btcAdj -= 0.5;
  const tags = tagNames || [];
  if (tags.some((t) => String(t).startsWith("BTC_BEARISH"))) btcAdj -= 1;
  else if (tags.some((t) => String(t).startsWith("BTC_BULLISH"))) btcAdj += 0.5;

  // Time-to-TP prior from tags
  let ttAdj = 0;
  if (medianTt != null && medianTt > 0) {
    const hours = medianTt / 3600;
    if (hours <= 2) ttAdj = 1.5;
    else if (hours <= 8) ttAdj = 0.5;
    else if (hours >= 36) ttAdj = -1;
  }

  // Coin prior (already LOO-adjusted when this row is resolved)
  let coinAdj = 0;
  const coinWr = scoringCoin?.win_rate;
  if (coinWr != null && Number.isFinite(Number(coinWr))) {
    coinAdj = clamp(0.08 * (Number(coinWr) - (baseWr || 80)), -2, 2.5);
  }

  // Expectancy proxy from levels
  let expR = null;
  let expAdj = 0;
  const entry = Number(signal?.entry);
  const stop = Number(signal?.stop1);
  if (entry > 0 && stop > 0 && Math.abs(entry - stop) > 0) {
    const risk = Math.abs(entry - stop);
    const r1 = signal?.target1 != null ? Math.abs(Number(signal.target1) - entry) / risk : 1;
    const r3 = signal?.target3 != null ? Math.abs(Number(signal.target3) - entry) / risk : null;
    const r4 = signal?.target4 != null ? Math.abs(Number(signal.target4) - entry) / risk : null;
    const rFull = r4 ?? r3 ?? r1 * 2.5;
    const pWin = avgWr / 100;
    const pFull = avgFull / 100;
    const pSl = Math.max(0, 1 - pWin);
    const pPartial = Math.max(0, pWin - pFull);
    expR = pFull * rFull + pPartial * r1 - pSl * 1;
    expAdj = clamp((expR - 0.6) * 2.5, -3, 3.5);
  }

  let score = core + volAdj + riskAdj + btcAdj + ttAdj + coinAdj + expAdj;
  score = Math.round(clamp(score, 35, 85) * 10) / 10;

  let confidence = "low";
  if (avgHalf <= 6 && hist.length >= 2) confidence = "high";
  else if (avgHalf <= 10 || hist.length >= 2) confidence = "medium";

  const best = hist.reduce((a, b) => {
    const liftA = a.lift != null ? a.lift : (a.wr || 0) - (baseWr || 80);
    const liftB = b.lift != null ? b.lift : (b.wr || 0) - (baseWr || 80);
    if (liftB !== liftA) return liftB > liftA ? b : a;
    return (b.wr || 0) > (a.wr || 0) ? b : a;
  }, hist[0]);
  const caution = hist.filter((m) => CONFOUND.has(m.tag)).map((m) => m.tag);

  const factors = {
    core: Math.round(core * 10) / 10,
    vol: Math.round(volAdj * 10) / 10,
    risk: Math.round(riskAdj * 10) / 10,
    btc: Math.round(btcAdj * 10) / 10,
    time_to_tp: Math.round(ttAdj * 10) / 10,
    coin: Math.round(coinAdj * 10) / 10,
    expectancy_r: expR != null ? Math.round(expR * 100) / 100 : null,
    expectancy_adj: Math.round(expAdj * 10) / 10,
    uncertainty_half_pp: Math.round(avgHalf * 10) / 10,
  };

  const reason = `v2 lift* ${avgLift >= 0 ? "+" : ""}${avgLift.toFixed(1)}pp · full* ${avgFull.toFixed(0)}% · ${preferN}/${hist.length} prefer · conf ${confidence}${expR != null ? ` · E[${expR.toFixed(2)}R]` : ""}`;

  const result = {
    score,
    scoreVersion: "v2",
    confidence,
    avgWr: Math.round(avgWr * 10) / 10,
    avgFull: Math.round(avgFull * 10) / 10,
    avgLift: Math.round(avgLift * 10) / 10,
    matchedN: hist.length,
    preferN,
    bestTag: best?.tag || null,
    bestTagWr: best?.wr ?? null,
    caution,
    reason,
    factors,
    expectancyR: expR,
    // as-of-entry: open = prior history only; closed = LOO of this outcome
    asOfEntry: true,
    excludedOutcome: outcome || null,
  };
  result.plainWhy = plainEdgeWhy(result);
  return result;
}

export function plainEdgeWhy(e) {
  if (!e || e.score == null) return null;
  const parts = [];
  const lift = e.avgLift ?? e.avg_lift_pp;
  const full = e.avgFull ?? e.avg_full_tp;
  const conf = e.confidence;
  const preferN = e.preferN;
  const matchedN = e.matchedN ?? e.matched_n;
  const caution = e.caution || e.caution_tags || [];
  const exp = e.expectancyR ?? e.expectancy_r ?? e.factors?.expectancy_r;

  if (conf) parts.push(`${conf} conf`);
  if (lift != null && Number.isFinite(Number(lift))) {
    const l = Number(lift);
    if (l >= 2) parts.push("setup history better than average");
    else if (l >= 0) parts.push("setup history about average");
    else parts.push("setup history weaker than average");
  }
  if (full != null && Number.isFinite(Number(full))) {
    const f = Number(full);
    if (f >= 45) parts.push("often fuller targets");
    else if (f >= 25) parts.push("sometimes full TP");
    else if (f > 0) parts.push("full TP less often");
  }
  if (exp != null && Number.isFinite(Number(exp))) {
    parts.push(`~${Number(exp).toFixed(1)}R expectancy`);
  }
  if (preferN != null && matchedN != null && matchedN > 0 && preferN > 0) {
    parts.push(`${preferN}/${matchedN} strong tags`);
  }
  if (caution?.length) {
    parts.push(caution.length === 1 ? "1 caution tag" : `${caution.length} caution tags`);
  } else if (parts.length) {
    parts.push("no caution tags");
  }
  if (!parts.length) return e.reason || "From long tag history (v2)";
  return parts.join(" · ");
}

export function edgeWhyTooltip(e) {
  if (!e || e.score == null) return "";
  const plain = e.plainWhy || plainEdgeWhy(e);
  const lines = [
    `Edge ${Number(e.score).toFixed(1)} · v2 · ${e.confidence || e.confidence === 0 ? e.confidence : "?"} conf`,
    plain,
  ];
  if (e.reason && e.reason !== plain) lines.push(e.reason);
  const f = e.factors;
  if (f) {
    lines.push(
      `Factors: lift/full core ${f.core ?? "—"} · vol ${f.vol ?? 0} · risk ${f.risk ?? 0} · btc ${f.btc ?? 0} · tt ${f.time_to_tp ?? 0} · coin ${f.coin ?? 0}`
    );
  }
  if (e.bestTag || e.best_tag) {
    const t = e.bestTag || e.best_tag;
    const wr = e.bestTagWr ?? e.best_tag_wr;
    lines.push(wr != null ? `Best tag: ${t} ${wr}%` : `Best tag: ${t}`);
  }
  const caution = e.caution || e.caution_tags;
  if (caution?.length) lines.push(`Caution: ${caution.join(", ")}`);
  if (e.excludedOutcome) {
    lines.push("As of entry · this call’s outcome excluded (no look-ahead)");
  } else {
    lines.push("As of now · resolved tag history only (open call not in rates)");
  }
  lines.push("Long-history EB rates · not a guarantee");
  return lines.filter(Boolean).join("\n");
}

/**
 * Map signal_id → score for whole desk.
 */
export function buildEdgeScoreMap(signals, signalTags, tagWr, baselineWr = null, coinIntel = null) {
  const ctx = buildEdgeScoreContext(tagWr, baselineWr);
  const map = {};
  for (const s of signals || []) {
    const id = s.signal_id;
    if (!id) continue;
    const tags = signalTags?.[id] || s.important_tags || [];
    const coin = coinIntel?.[s.pair] || null;
    const r = scoreSignalTags(tags, ctx, s, coin);
    if (r) map[id] = r;
  }
  return { map, ctx };
}

export function edgeScoreTone(score) {
  if (score == null) return "muted";
  if (score >= 68) return "hot";
  if (score >= 62) return "good";
  if (score >= 55) return "mid";
  return "cool";
}
