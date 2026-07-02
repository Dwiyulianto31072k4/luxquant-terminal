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

LOOKBACK_DAYS = 14
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

def _lifecycle(cohort: dict, existing_status: str | None) -> tuple[str | None, str | None]:
    """Returns (status, direction) — direction 'avoid'/'favor' — or (None, None)."""
    scored = cohort["wins"] + cohort["losses"]
    if scored < MIN_EVIDENCE:
        return None, None
    hit = 100 * cohort["wins"] / scored
    if hit <= AVOID_PCT:
        direction = "avoid"
    elif hit >= FAVOR_PCT:
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
    return f"{key} {where} is your strongest cohort: {hit}% hit rate over {n} scored calls — lean on it when evidence agrees.".strip()


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
        # 1+2 — cohort lessons (bias cohorts are regime-scoped; flag cohorts are regime-agnostic)
        for cohort, regime_scope, prefix in (
            *[(c, regime, "bias") for c in _bias_cohorts(db)],
            *[(c, "any", "flag") for c in _flag_cohorts(db)],
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
