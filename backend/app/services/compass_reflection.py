"""
LuxQuant BTC Compass 2.0 — Daily Reflection Worker
====================================================
The learning loop. Runs daily (systemd timer) and:

  1. Measures cohorts from first-barrier outcomes (last LOOKBACK_DAYS):
     per primary_bias x regime, and per calibration flag.
  2. Writes/updates LESSONS in the brain vault with a deterministic
     lifecycle:  n>=MIN_EVIDENCE and hit<=AVOID_PCT  -> "avoid" lesson
                 n>=MIN_EVIDENCE and hit>=FAVOR_PCT  -> "favor" lesson
                 candidate -> validated at n>=VALIDATE_N (still extreme)
                 drifts back toward coin-flip        -> retired
     Human `locked: true` notes are never touched.
  3. Writes a POSTMORTEM note for every newly invalidated projection.
  4. Scores each lesson A/B: contracts created WHILE the lesson was in the
     prompt (contract_json.calibration.active_lessons) vs contracts without
     it — the honest measure of whether a lesson actually helps.
  5. Refreshes the regime snapshot + vault index.

Manual run:
    python3 -m app.services.compass_reflection [--dry-run]
"""

from __future__ import annotations

import argparse
import math
import json
import logging
from datetime import datetime, timezone

from dotenv import load_dotenv
from sqlalchemy import text

from app.core.database import SessionLocal
from app.services import compass_brain as brain
from app.services.compass_reachability import fetch_market_stats

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Widened from 14. At 14 days this pipeline produces ~140 reports spread over
# six-plus cohorts, so every cohort sat near the promotion threshold and the
# vault churned on noise. Worse, the window was short enough that the book's own
# hit rate over it read **91.4%** — a hot fortnight — against which a cohort at
# 82% was being promoted as "your strongest". At 60 days the base settles at
# 65.4% over n=257, which matches the rate measured independently across the
# whole labelled set, and the cohorts are large enough to mean something.
LOOKBACK_DAYS = 60
MIN_EVIDENCE = 10
VALIDATE_N = 20
AVOID_PCT = 35
FAVOR_PCT = 65
RETIRE_LOW, RETIRE_HIGH = 45, 55  # drifted back to coin-flip -> uninformative

HITS = ("CLEAN_HIT", "LATE_HIT")
MISS = ("INVALIDATED_FIRST",)


# ════════════════════════════════════════════════════════════════════
# Cohort measurement
# ════════════════════════════════════════════════════════════════════

def _bias_cohorts(db) -> list[dict]:
    rows = db.execute(text(f"""
        SELECT
            c.primary_bias AS key,
            COUNT(*) FILTER (WHERE r.outcome IN ('CLEAN_HIT','LATE_HIT')) AS wins,
            COUNT(*) FILTER (WHERE r.outcome = 'INVALIDATED_FIRST') AS losses
        FROM compass_projection_resolutions r
        JOIN compass_projection_contracts c USING (projection_id)
        WHERE r.outcome IN ('CLEAN_HIT','LATE_HIT','INVALIDATED_FIRST')
          AND c.active_from >= NOW() - INTERVAL '{LOOKBACK_DAYS} days'
        GROUP BY c.primary_bias
    """)).all()
    return [{"key": k, "wins": int(w or 0), "losses": int(l or 0)} for k, w, l in rows]


def _flag_cohorts(db) -> list[dict]:
    rows = db.execute(text(f"""
        SELECT
            flag.value AS key,
            COUNT(*) FILTER (WHERE r.outcome IN ('CLEAN_HIT','LATE_HIT')) AS wins,
            COUNT(*) FILTER (WHERE r.outcome = 'INVALIDATED_FIRST') AS losses
        FROM compass_projection_resolutions r
        JOIN compass_projection_contracts c USING (projection_id),
        LATERAL jsonb_array_elements_text(
            COALESCE(c.contract_json->'calibration'->'flags', '[]'::jsonb)
        ) AS flag(value)
        WHERE r.outcome IN ('CLEAN_HIT','LATE_HIT','INVALIDATED_FIRST')
          AND c.active_from >= NOW() - INTERVAL '{LOOKBACK_DAYS} days'
        GROUP BY flag.value
    """)).all()
    return [{"key": k, "wins": int(w or 0), "losses": int(l or 0)} for k, w, l in rows]


def _lesson_ab(db, lesson_id: str) -> dict:
    """Hit rate of contracts created with vs without this lesson in the prompt."""
    row = db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE has_lesson AND outcome IN ('CLEAN_HIT','LATE_HIT'))       AS w_with,
            COUNT(*) FILTER (WHERE has_lesson AND outcome = 'INVALIDATED_FIRST')             AS l_with,
            COUNT(*) FILTER (WHERE NOT has_lesson AND outcome IN ('CLEAN_HIT','LATE_HIT'))   AS w_without,
            COUNT(*) FILTER (WHERE NOT has_lesson AND outcome = 'INVALIDATED_FIRST')         AS l_without
        FROM (
            SELECT
                r.outcome,
                COALESCE(c.contract_json->'calibration'->'active_lessons', '[]'::jsonb)
                    ? :lesson_id AS has_lesson
            FROM compass_projection_resolutions r
            JOIN compass_projection_contracts c USING (projection_id)
            WHERE r.outcome IN ('CLEAN_HIT','LATE_HIT','INVALIDATED_FIRST')
        ) sub
    """), {"lesson_id": lesson_id}).one()
    return {
        "ab_with_wins": int(row.w_with or 0),
        "ab_with_losses": int(row.l_with or 0),
        "ab_without_wins": int(row.w_without or 0),
        "ab_without_losses": int(row.l_without or 0),
    }


# ════════════════════════════════════════════════════════════════════
# Lesson lifecycle
# ════════════════════════════════════════════════════════════════════

def _wilson_bounds(wins: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson interval for a hit rate, in percent.

    Wilson rather than normal-approximation because these samples are small and
    the rates are far from 50%, which is exactly where the normal approximation
    produces intervals that run past 0 or 100 and flatter the evidence.
    """
    if n <= 0:
        return 0.0, 100.0
    phat = wins / n
    denom = 1 + z * z / n
    centre = (phat + z * z / (2 * n)) / denom
    half = z * math.sqrt(phat * (1 - phat) / n + z * z / (4 * n * n)) / denom
    return max(0.0, (centre - half) * 100), min(100.0, (centre + half) * 100)


def _lifecycle(cohort: dict, existing_status: str | None) -> tuple[str | None, str | None]:
    """Returns (status, direction) — direction 'avoid'/'favor' — or (None, None).

    Promotion is gated on a confidence interval, not on a raw count, because the
    raw count was letting noise into the prompt. Under the old rule
    (MIN_EVIDENCE=10, VALIDATE_N=20) a 65% hit rate over 20 calls became a
    *validated* lesson telling the model to "lean on it" — while the 95%
    interval on 65%/20 runs from **44% to 86%**, which does not exclude a coin
    flip. That is how the vault came to hold
    `bias_bearish_continuation_trend_up`, validated at 82% on n=17, instructing
    the model to lean into a cohort that measures 69.2% (p=0.382) over the full
    labelled set and splits July +0.958% / August −0.599%. Nine July
    observations that never replicated.

    So a cohort now has to beat a coin flip *at the bottom of its interval*
    before it can claim to be a rule. On these sample sizes that is a high bar
    — which is the point: the pipeline produces ~5.5 directional calls a day,
    and a loop that promotes faster than its evidence arrives is fitting noise
    by construction.
    """
    scored = cohort["wins"] + cohort["losses"]
    if scored < MIN_EVIDENCE:
        return None, None
    hit = 100 * cohort["wins"] / scored
    lo, hi = _wilson_bounds(cohort["wins"], scored)

    # Compared against the book's OWN hit rate, not against a coin flip.
    #
    # 50% is the wrong bar here and using it flatters every cohort. These
    # contracts put the target closer than the invalidation — measured ratios
    # 0.54-0.73 — so a call hits target-first well over half the time on
    # geometry alone; the book as a whole runs around 65%. Against 50% the
    # bearish-into-a-rising-tape cohort (82% on n=17) clears easily and becomes
    # a "lean on it" rule. Against the book's own rate its interval starts at
    # 59% and it is correctly refused — which matters, because measured over the
    # full labelled set that cohort is 69.2% (p=0.382) and splits July +0.958% /
    # August -0.599%.
    #
    # Passed in rather than hard-coded, so it re-measures instead of going stale
    # the way the 14% counter-trend figure in compass_knowledge did.
    base = cohort.get("base_hit_pct")
    if base is None:
        return None, None

    if hit <= AVOID_PCT:
        if hi >= base:
            return None, None
        direction = "avoid"
    elif hit >= FAVOR_PCT:
        if lo <= base:
            return None, None
        direction = "favor"
    else:
        # informative before, coin-flip now -> retire
        if existing_status in ("candidate", "validated") and RETIRE_LOW <= hit <= RETIRE_HIGH:
            return "retired", None
        return None, None
    status = "validated" if scored >= VALIDATE_N else "candidate"
    # never downgrade validated -> candidate on the same signal
    if existing_status == "validated" and status == "candidate":
        status = "validated"
    return status, direction


def _prompt_line(key: str, direction: str, hit: int, n: int, regime: str) -> str:
    where = {"trend_up": "while the 72h tape is RISING",
             "trend_down": "while the 72h tape is FALLING",
             "flat": "in a FLAT 72h tape"}.get(regime, "")
    if direction == "avoid":
        return f"AVOID {key} {where}: only {hit}% hit rate over your last {n} scored calls.".strip()
    # Deliberately not "lean on it". A cohort that cleared the interval test is
    # evidence worth knowing, not a licence to size up — and the previous
    # wording was amplifying whatever happened to be winning that fortnight.
    return f"{key} {where} has held up: {hit}% hit rate over {n} scored calls — treat it as supporting evidence, not as a reason to stretch.".strip()


# ════════════════════════════════════════════════════════════════════
# Postmortems
# ════════════════════════════════════════════════════════════════════

def _write_postmortems(db, regime: str, dry_run: bool) -> int:
    rows = db.execute(text("""
        SELECT
            c.projection_id, c.primary_bias, c.market_mode, c.active_from,
            c.reference_price, c.primary_touch_level, c.invalidation_level,
            c.contract_json->'calibration'->'flags' AS flags,
            r.outcome, r.first_barrier_at, r.max_favorable_excursion_pct AS mfe,
            r.max_adverse_excursion_pct AS mae
        FROM compass_projection_resolutions r
        JOIN compass_projection_contracts c USING (projection_id)
        WHERE r.outcome = 'INVALIDATED_FIRST'
          AND r.resolved_at >= NOW() - INTERVAL '2 days'
    """)).mappings().all()

    written = 0
    for row in rows:
        ref = float(row["reference_price"])
        tgt = float(row["primary_touch_level"])
        inv = float(row["invalidation_level"])
        t_dist = abs(tgt - ref) / ref * 100
        progress = (float(row["mfe"] or 0) / t_dist * 100) if t_dist else 0
        flags = row["flags"] if isinstance(row["flags"], list) else []
        meta = {
            "id": row["projection_id"],
            "kind": "postmortem",
            "bias": row["primary_bias"],
            "market_mode": row["market_mode"],
            "outcome": row["outcome"],
            "regime": regime,
            "progress_to_target_pct": round(progress),
            "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        }
        body = (
            f"\n# Postmortem — {row['projection_id']}\n\n"
            f"- Called: {row['active_from']} | {row['primary_bias']} / {row['market_mode']}\n"
            f"- Geometry: ref {ref:,.0f} -> target {tgt:,.0f} ({t_dist:.2f}%), stop {inv:,.0f}\n"
            f"- Died: {row['first_barrier_at']} | MFE {row['mfe']}% / MAE {row['mae']}%\n"
            f"- Travelled {progress:.0f}% toward target before the stop.\n"
            f"- Flags: {', '.join(str(f) for f in flags) or 'none'}\n"
            f"- Lesson links: [[bias_{str(row['primary_bias']).lower()}_{regime}]]\n"
        )
        if dry_run:
            written += 1
            continue
        if brain.write_postmortem(row["projection_id"], meta, body):
            written += 1
    return written


# ════════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════════

def reflect(dry_run: bool = False) -> dict:
    summary = {"lessons_upserted": 0, "lessons_retired": 0, "postmortems": 0, "ab_scored": 0, "regime": None}
    if not brain.vault_available():
        logger.warning("Brain vault %s not writable; skipping reflection", brain.BRAIN_DIR)
        return summary

    stats = fetch_market_stats()
    regime = brain.classify_regime(stats.get("trend_72h_pct"))
    summary["regime"] = regime

    existing = {str(m.get("id")): m for m in brain.list_lessons()}
    db = SessionLocal()
    try:
        # The bar a cohort has to beat: the book's own hit rate over the same
        # window. Measured here rather than written down, so it tracks the
        # geometry instead of going stale like the constants it replaces.
        _bias_all = _bias_cohorts(db)
        _flag_all = _flag_cohorts(db)
        _w = sum(c["wins"] for c in _bias_all)
        _n = sum(c["wins"] + c["losses"] for c in _bias_all)
        base_hit_pct = (100.0 * _w / _n) if _n >= MIN_EVIDENCE else None
        logger.info("Base hit rate for the window: %s (n=%d)",
                    f"{base_hit_pct:.1f}%" if base_hit_pct is not None else "unknown", _n)
        for c in (*_bias_all, *_flag_all):
            c["base_hit_pct"] = base_hit_pct

        # 1+2 — cohort lessons (bias cohorts are regime-scoped; flag cohorts are regime-agnostic)
        for cohort, regime_scope, prefix in (
            *[(c, regime, "bias") for c in _bias_all],
            *[(c, "any", "flag") for c in _flag_all],
        ):
            lesson_id = f"{prefix}_{str(cohort['key']).lower()}_{regime_scope}"
            status, direction = _lifecycle(cohort, str(existing.get(lesson_id, {}).get("status") or "") or None)
            if status is None:
                continue
            scored = cohort["wins"] + cohort["losses"]
            hit = round(100 * cohort["wins"] / scored)
            if status == "retired":
                summary["lessons_retired"] += 1
                line = existing.get(lesson_id, {}).get("prompt_line", "")
            else:
                summary["lessons_upserted"] += 1
                line = _prompt_line(str(cohort["key"]), direction, hit, scored, regime_scope)
            logger.info("%s lesson %s -> %s (%s, %dW/%dL)",
                        "DRY-RUN" if dry_run else "UPSERT", lesson_id, status, direction, cohort["wins"], cohort["losses"])
            if not dry_run:
                brain.upsert_lesson(
                    lesson_id, status=status, regime=regime_scope,
                    prompt_line=str(line), wins=cohort["wins"], losses=cohort["losses"],
                )

        # 3 — postmortems
        summary["postmortems"] = _write_postmortems(db, regime, dry_run)

        # 4 — A/B score every lesson that has ever reached the prompt
        for lesson_id, meta in existing.items():
            ab = _lesson_ab(db, lesson_id)
            if ab["ab_with_wins"] + ab["ab_with_losses"] == 0:
                continue
            summary["ab_scored"] += 1
            if not dry_run and meta.get("locked") is not True:
                m, body = brain.read_note(brain.lesson_path(lesson_id))
                if m:
                    m.update(ab)
                    brain.write_note(brain.lesson_path(lesson_id), m, body)

        # 5 — regime snapshot + index
        if not dry_run:
            brain.write_regime_snapshot(
                {
                    "kind": "regime",
                    "regime": regime,
                    "sigma_1h_pct": stats.get("sigma_1h_pct"),
                    "trend_72h_pct": stats.get("trend_72h_pct"),
                    "updated": datetime.now(timezone.utc).isoformat(),
                },
                f"\n# Current regime: {regime}\n\nAuto-updated daily by compass_reflection.\n",
            )
            lessons = brain.list_lessons()
            index_lines = ["\n# Compass Brain\n", "## Lessons\n"]
            for m in lessons:
                index_lines.append(
                    f"- [[lessons/{m['id']}|{m['id']}]] — {m.get('status')} · "
                    f"{m.get('hit_rate')}% over {m.get('evidence_n')} calls"
                )
            index_lines.append("\n## Folders\n- lessons/ — operating rules\n- postmortems/ — loss autopsies\n- regimes/ — market state\n")
            brain.write_index("\n".join(index_lines))
    finally:
        db.close()

    logger.info("Reflection summary: %s", summary)
    return summary


def cli() -> None:
    parser = argparse.ArgumentParser(description="Compass daily reflection (brain vault)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    print(json.dumps(reflect(dry_run=args.dry_run), indent=2, default=str))


if __name__ == "__main__":
    cli()
