// Shared Signal Journey event building — used by TopPerformers modal,
// SignalModal timeline, and any other journey steppers.
//
// Rules (product):
// 1. If price touched SL then later hit TP(s) / final status is WIN → do NOT
//    show SL as a red "Stop Loss Hit" failure (confusing on winning calls).
// 2. Distinguish SL1 vs SL2 when we do show SL (losses / true stop path).
// 3. SL2 is the structural stop many swing/intraday traders use; label it.

/**
 * @param {string|null|undefined} updateType
 * @returns {{ kind: 'sl'|'tp'|'other', level: number }}
 */
export function classifyUpdateType(updateType) {
  const t = String(updateType || "")
    .toLowerCase()
    .trim();
  if (!t) return { kind: "other", level: 0 };

  // SL2 first (more specific)
  if (/\bsl\s*2\b/.test(t) || t === "sl2" || /stop\s*2|stop2|sl_2/.test(t)) {
    return { kind: "sl", level: 2 };
  }
  if (
    t === "sl" ||
    t === "sl1" ||
    /\bsl\s*1\b/.test(t) ||
    /stop\s*1|stop1|sl_1/.test(t) ||
    /\bstop\b/.test(t) ||
    t.includes("stop loss")
  ) {
    return { kind: "sl", level: 1 };
  }

  const tp = t.match(/\btp\s*([1-4])\b/) || t.match(/target\s*([1-4])/);
  if (tp) return { kind: "tp", level: Number(tp[1]) };
  if (t.includes("tp4") || t.includes("target 4")) return { kind: "tp", level: 4 };
  if (t.includes("tp3") || t.includes("target 3")) return { kind: "tp", level: 3 };
  if (t.includes("tp2") || t.includes("target 2")) return { kind: "tp", level: 2 };
  if (t.includes("tp1") || t.includes("target 1")) return { kind: "tp", level: 1 };

  return { kind: "other", level: 0 };
}

export function isWinStatus(status) {
  const s = String(status || "").toLowerCase();
  return /win|closed_win|^tp[1-4]$/.test(s);
}

export function isLossStatus(status) {
  const s = String(status || "").toLowerCase();
  return /loss|closed_loss|^sl$/.test(s);
}

/**
 * True when SL appears in the update stream but the trade still printed TPs
 * (or final status is a win). Showing "Stop Loss Hit" then TP is wrong UX.
 */
export function shouldSuppressSlFailure(updates, status) {
  const list = Array.isArray(updates) ? updates : [];
  const sorted = [...list].sort(
    (a, b) => new Date(a.update_at || 0) - new Date(b.update_at || 0)
  );
  let sawSl = false;
  let tpAfterSl = false;
  let anyTp = false;
  for (const u of sorted) {
    const c = classifyUpdateType(u.update_type);
    if (c.kind === "sl") sawSl = true;
    if (c.kind === "tp") {
      anyTp = true;
      if (sawSl) tpAfterSl = true;
    }
  }
  if (tpAfterSl) return true;
  if (sawSl && anyTp && isWinStatus(status)) return true;
  return false;
}

/**
 * Build horizontal journey stepper events for proof modals.
 *
 * @param {object} opts
 * @param {Array} opts.updates
 * @param {string} [opts.status]
 * @param {number|string} [opts.entry]
 * @param {string} [opts.createdAt]
 * @param {(n:number)=>string} opts.formatPrice
 * @param {(from:string,to:string)=>string} opts.fmtDiff
 * @param {(d:string)=>string} [opts.fmtDt]
 * @param {object} [opts.labels]
 */
export function buildProofJourneyEvents({
  updates,
  status,
  entry,
  createdAt,
  formatPrice,
  fmtDiff,
  fmtDt,
  labels = {},
}) {
  const L = {
    called: labels.called || "Signal Called",
    sl1: labels.sl1 || "SL1 Hit",
    sl2: labels.sl2 || "SL2 Hit",
    hit: labels.hit || "Hit",
    entry: labels.entry || "Entry",
  };

  const entryN = Number(entry) || 0;
  const suppressSl = shouldSuppressSlFailure(updates, status);

  const events = [
    {
      label: L.called,
      time: "T+0",
      sub: fmtDt ? fmtDt(createdAt) : null,
      detail: entryN > 0 ? `${L.entry} @ $${formatPrice(entryN)}` : null,
      key: "gold",
      isSL: false,
      kind: "call",
    },
  ];

  const sorted = [...(Array.isArray(updates) ? updates : [])].sort(
    (a, b) => new Date(a.update_at || 0) - new Date(b.update_at || 0)
  );

  for (const u of sorted) {
    const c = classifyUpdateType(u.update_type);
    if (c.kind === "sl") {
      if (suppressSl) continue; // won after SL noise — hide failure chip
      const price = Number(u.price) || 0;
      events.push({
        label: c.level === 2 ? L.sl2 : L.sl1,
        time: createdAt && u.update_at ? `+${fmtDiff(createdAt, u.update_at)}` : "—",
        sub: fmtDt && u.update_at ? fmtDt(u.update_at) : null,
        detail: price > 0 ? `$${formatPrice(price)}` : null,
        key: "red",
        isSL: true,
        kind: "sl",
        level: c.level,
      });
      continue;
    }
    if (c.kind === "tp") {
      const price = Number(u.price) || 0;
      let pctStr = null;
      if (price > 0 && entryN > 0) {
        const pct = (Math.abs(price - entryN) / entryN) * 100;
        pctStr = ` (+${pct.toFixed(2)}%)`;
      }
      events.push({
        label: `TP ${c.level} ${L.hit}`,
        time: createdAt && u.update_at ? `+${fmtDiff(createdAt, u.update_at)}` : "—",
        sub: fmtDt && u.update_at ? fmtDt(u.update_at) : null,
        detail: price > 0 ? `$${formatPrice(price)}${pctStr || ""}` : null,
        key: "green",
        isSL: false,
        kind: "tp",
        level: c.level,
      });
    }
  }

  return {
    events,
    suppressedSl: suppressSl,
    note: suppressSl
      ? "SL touch skipped — trade continued to TP (not a final stop-out)."
      : isLossStatus(status)
        ? "SL1 is the tight stop; SL2 is the structure stop (swing / intraday)."
        : null,
  };
}

/**
 * Level strip for SignalModal-style timeline (ENTRY · SL1/SL2 risk · TPs).
 * SL levels are always shown as structure when present; "hit" only if true loss.
 */
export function buildLevelTimeline({
  signal,
  hitTargets = [false, false, false, false],
  isStopped,
  getUpdateInfo,
  formatPrice,
  calcPct,
  formatShortDateTime,
}) {
  const ev = [];
  const stop1 = signal?.stop1 != null ? Number(signal.stop1) : null;
  const stop2 = signal?.stop2 != null ? Number(signal.stop2) : null;
  const sl1Hit = isStopped && !!(getUpdateInfo("sl") || getUpdateInfo("sl1"));
  const sl2Hit = isStopped && !!getUpdateInfo("sl2");

  // Structure stops on the left (not a failure story on wins)
  if (stop1 > 0) {
    const su = getUpdateInfo("sl") || getUpdateInfo("sl1");
    const hit = sl1Hit && !sl2Hit; // prefer SL2 if both somehow marked
    ev.push({
      label: "SL1",
      sub: hit ? formatShortDateTime(su?.update_at) : "Risk",
      detail: `${formatPrice(stop1)}`,
      pct: `${calcPct(stop1, signal?.entry)}%`,
      icon: hit ? "✗" : "1",
      active: hit,
      color: hit ? "text-negative" : "text-text-muted",
      border: hit ? "border-negative/30" : "border-line",
      bg: hit ? "bg-negative/10" : "bg-surface-secondary",
      kind: "sl",
      level: 1,
    });
  }
  if (stop2 > 0) {
    const su = getUpdateInfo("sl2");
    const hit = sl2Hit;
    ev.push({
      label: "SL2",
      sub: hit ? formatShortDateTime(su?.update_at) : "Structure",
      detail: `${formatPrice(stop2)}`,
      pct: `${calcPct(stop2, signal?.entry)}%`,
      icon: hit ? "✗" : "2",
      active: hit,
      color: hit ? "text-negative" : "text-text-muted",
      border: hit ? "border-negative/30" : "border-line",
      bg: hit ? "bg-negative/10" : "bg-surface-secondary",
      kind: "sl",
      level: 2,
    });
  }

  ev.push({
    label: "ENTRY",
    sub: formatShortDateTime(signal?.created_at),
    detail: `@ ${formatPrice(signal?.entry)}`,
    icon: "•",
    active: true,
    color: "text-text-secondary",
    border: "border-ink/10",
    bg: "bg-ink/[0.04]",
    kind: "entry",
  });

  const tps = [
    { k: "tp1", l: "TP1", v: signal?.target1, i: 0 },
    { k: "tp2", l: "TP2", v: signal?.target2, i: 1 },
    { k: "tp3", l: "TP3", v: signal?.target3, i: 2 },
    { k: "tp4", l: "TP4", v: signal?.target4, i: 3 },
  ];
  for (const tp of tps) {
    if (!tp.v) continue;
    const u = getUpdateInfo(tp.k);
    const h = hitTargets[tp.i];
    ev.push({
      label: tp.l,
      sub: h ? formatShortDateTime(u?.update_at) : "Pending",
      detail: `${formatPrice(tp.v)}`,
      pct: `+${calcPct(tp.v, signal?.entry)}%`,
      icon: h ? "✓" : String(tp.i + 1),
      active: h,
      color: h ? "text-positive" : "text-text-muted",
      border: h ? "border-positive/30" : "border-line",
      bg: h ? "bg-positive/10" : "bg-surface-secondary",
      kind: "tp",
      level: tp.i + 1,
    });
  }
  return ev;
}
