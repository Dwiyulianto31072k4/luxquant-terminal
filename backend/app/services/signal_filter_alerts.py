"""Raise a notification when a new signal matches a user's saved filter.

A subscriber asked to receive only the calls he cares about — "Hunt Full TP,
risk normal" — instead of all ~94 a day. Nothing existing could express that:
notification_preferences is an on/off switch per type, and coin_watch fires
only for coins already picked by hand. This evaluates a saved condition.

Two rules keep it from becoming the spam it exists to prevent:

  * A filter only ever sees signals created after it was last saved or enabled.
    Switching one on must not replay a week of history into someone's Telegram,
    which is the same mistake the delivery watermark once made.
  * Every (filter, signal) pair that fires is recorded, so a worker restart
    re-announces nothing.

Everything a filter tests lives in signals + signal_enrichment, and enrichment
lands a median 3.8 minutes after the call (p90 11.5), so a match is evaluable
almost immediately. Signals without enrichment are skipped rather than guessed
at — an alert that fires on missing data is worse than one that fires late.
"""

from __future__ import annotations

import json
import logging

from sqlalchemy import text

log = logging.getLogger(__name__)

# A filter cannot reach further back than this even if it was saved long ago
# and the worker was down. Bounds the blast radius of any restart.
MAX_LOOKBACK_HOURS = 12

# Per pass, per filter. Keeps one badly-written filter from flooding a batch.
MAX_MATCHES_PER_PASS = 10


def _as_list(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v) for v in value if v not in (None, "")]
    return [str(value)]


def _pairs_matching_verdict(wanted: list[str]) -> list[str] | None:
    """Pairs whose coin-intel verdict is one of `wanted`, or None if unknown.

    Returns None rather than an empty list when coin intel cannot be read: an
    empty list would silently mean "nothing matches", and a filter that goes
    quiet looks identical to a market with no setups.
    """
    try:
        from app.api.routes.signals import _compute_coin_intel_once

        intel = _compute_coin_intel_once() or {}
        if not isinstance(intel, dict):
            return None
        coins = list(intel.get("top_coins") or []) + list(intel.get("rest_coins") or [])
        if not coins:
            return None

        # A cached payload written before verdict existed has the key on no
        # coin at all. Defaulting those to "neutral" would quietly answer a
        # question this data cannot answer, so treat it as unavailable and let
        # the filter hold until the cache refreshes.
        if not any("verdict" in c for c in coins if isinstance(c, dict)):
            log.info("coin intel has no verdict field yet; filter held")
            return None

        want = set(wanted)
        return [
            str(c.get("pair")).upper()
            for c in coins
            if isinstance(c, dict) and c.get("pair") and (c.get("verdict") or "neutral") in want
        ]
    except Exception as e:  # never let a filter take the worker down
        log.warning("coin intel unavailable for verdict filter: %s", e)
        return None


def _build_conditions(criteria: dict) -> tuple[list[str], dict]:
    """Translate saved criteria into SQL. Unknown keys are ignored, not guessed."""
    where: list[str] = []
    params: dict = {}

    risks = _as_list(criteria.get("risk_level"))
    if risks:
        where.append("lower(s.risk_level) = ANY(:risks)")
        params["risks"] = [r.lower() for r in risks]

    ratings = _as_list(criteria.get("rating"))
    if ratings:
        where.append("upper(e.rating) = ANY(:ratings)")
        params["ratings"] = [r.upper() for r in ratings]

    pairs = _as_list(criteria.get("pairs"))
    if pairs:
        where.append("upper(s.pair) = ANY(:pairs)")
        params["pairs"] = [p.upper() for p in pairs]

    min_conf = criteria.get("min_confidence")
    if isinstance(min_conf, (int, float)):
        where.append("e.confidence_score >= :min_conf")
        params["min_conf"] = int(min_conf)

    # verdict (worth_it / avoid / neutral) is a property of the COIN's history,
    # not of this signal, so it is resolved per pair from coin intel rather than
    # in SQL. Same function the desk renders, so a saved filter screens on the
    # definition the user was looking at when they saved it.
    verdicts = _as_list(criteria.get("verdict"))
    if verdicts:
        pairs_for_verdict = _pairs_matching_verdict([v.lower() for v in verdicts])
        if pairs_for_verdict is None:
            # Coin intel unavailable — hold the filter rather than firing on a
            # criterion we cannot actually check.
            return [], {"__unavailable__": True}
        where.append("upper(s.pair) = ANY(:verdict_pairs)")
        params["verdict_pairs"] = pairs_for_verdict

    tags = _as_list(criteria.get("tags"))
    if tags:
        params["tags"] = tags
        tag_sql = """
            SELECT count(DISTINCT t->>'name')
            FROM jsonb_array_elements(
                COALESCE(e.entry_snapshot->'tags_annotated', '[]'::jsonb)
            ) t
            WHERE t->>'name' = ANY(:tags)
        """
        if str(criteria.get("tag_match") or "any").lower() == "all":
            where.append(f"({tag_sql}) = :tag_total")
            params["tag_total"] = len(set(tags))
        else:
            where.append(f"({tag_sql}) > 0")

    return where, params


def _describe(criteria: dict) -> str:
    bits = []
    if _as_list(criteria.get("rating")):
        bits.append("/".join(_as_list(criteria["rating"])).lower())
    if _as_list(criteria.get("risk_level")):
        bits.append("risk " + "/".join(_as_list(criteria["risk_level"])).lower())
    if isinstance(criteria.get("min_confidence"), (int, float)):
        bits.append(f"score ≥ {int(criteria['min_confidence'])}")
    tags = _as_list(criteria.get("tags"))
    if tags:
        joiner = " + " if str(criteria.get("tag_match") or "any").lower() == "all" else " / "
        bits.append(joiner.join(tags[:3]))
    return ", ".join(bits)


def generate_filter_match_notifications(db) -> int:
    created = 0

    filters = db.execute(text("""
        SELECT f.id, f.user_id, f.name, f.criteria, f.updated_at
        FROM signal_alert_filters f
        JOIN users u ON u.id = f.user_id
        WHERE f.enabled
        ORDER BY f.id
    """)).fetchall()

    for fid, user_id, name, criteria, updated_at in filters:
        if isinstance(criteria, str):
            try:
                criteria = json.loads(criteria)
            except ValueError:
                log.warning("filter %s has unreadable criteria; skipped", fid)
                continue
        criteria = criteria or {}

        # An empty filter matches everything. That is never what someone means
        # by "alert me", so it is treated as not yet configured.
        where, params = _build_conditions(criteria)
        if params.pop("__unavailable__", False):
            log.info("filter %s held: verdict data unavailable this pass", fid)
            continue
        if not where:
            continue

        params.update({"fid": fid, "since": updated_at, "lim": MAX_MATCHES_PER_PASS})
        rows = db.execute(text(f"""
            SELECT s.signal_id, s.pair, s.entry, s.risk_level, e.rating, e.confidence_score
            FROM signals s
            JOIN signal_enrichment e ON e.signal_id = s.signal_id
            WHERE s.created_at::timestamptz >= GREATEST(
                      :since, now() - interval '{MAX_LOOKBACK_HOURS} hours')
              AND {' AND '.join(where)}
              AND NOT EXISTS (
                  SELECT 1 FROM signal_alert_matches m
                  WHERE m.filter_id = :fid AND m.signal_id = s.signal_id
              )
            ORDER BY s.created_at::timestamptz ASC
            LIMIT :lim
        """), params).fetchall()

        for signal_id, pair, entry, risk_level, rating, score in rows:
            coin = (pair or "").replace("USDT", "") or pair
            entry_str = f"{float(entry)}" if entry is not None else "N/A"
            summary = _describe(criteria)
            db.execute(text("""
                INSERT INTO notifications
                    (user_id, type, title, body, data, source_type, source_id, created_at)
                VALUES (:uid, 'signal_match', :title, :body, :data, 'signal', :sid, NOW())
                ON CONFLICT DO NOTHING
            """), {
                "uid": user_id,
                "title": f"{coin} matches “{name}”",
                "body": (
                    f"Entry {entry_str} · risk {risk_level or 'n/a'} · "
                    f"{(rating or 'n/a').lower()} · score {score if score is not None else 'n/a'}"
                    + (f"\nFilter: {summary}" if summary else "")
                ),
                "data": json.dumps({
                    "signal_id": signal_id,
                    "pair": pair,
                    "entry": float(entry) if entry is not None else None,
                    "risk_level": risk_level,
                    "rating": rating,
                    "confidence_score": score,
                    "filter_id": fid,
                    "filter_name": name,
                }),
                "sid": signal_id,
            })
            db.execute(text("""
                INSERT INTO signal_alert_matches (filter_id, signal_id)
                VALUES (:fid, :sid) ON CONFLICT DO NOTHING
            """), {"fid": fid, "sid": signal_id})
            created += 1

        if rows:
            db.execute(text("""
                UPDATE signal_alert_filters
                SET match_count = match_count + :n, last_matched_at = now()
                WHERE id = :fid
            """), {"n": len(rows), "fid": fid})

    if created:
        log.info("signal_match notifications created: %d", created)
    return created
