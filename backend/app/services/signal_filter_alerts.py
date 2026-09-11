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

from app.services.hunt_recipe import CONFOUND_TAGS

log = logging.getLogger(__name__)

# A filter cannot reach further back than this even if it was saved long ago
# and the worker was down. Bounds the blast radius of any restart.
MAX_LOOKBACK_HOURS = 12

# Per pass, per filter. Keeps one badly-written filter from flooding a batch.
MAX_MATCHES_PER_PASS = 10


def _norm_pair(p) -> str:
    u = str(p or "").upper().strip()
    if not u:
        return u
    if u.endswith(("USDT", "USDC", "BUSD")):
        return u
    return u + "USDT"


def _as_list(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v) for v in value if v not in (None, "")]
    return [str(value)]


def _with_live_runners(criteria: dict, db) -> dict:
    """Runners is a live recipe, not a frozen tag list — resolve at eval time."""
    if not criteria.get("runners"):
        return criteria
    from app.api.routes.edge_lab import get_tag_wr
    from app.services.hunt_recipe import select_runner_tags

    tw = get_tag_wr(days=0, min_n=40, db=db)
    names = [t.get("tag") for t in select_runner_tags(tw.get("tags") or []) if t.get("tag")]
    out = dict(criteria)
    out["_runner_tags"] = names or ["__NO_RUNNER_TAGS__"]
    return out


def _build_conditions(criteria: dict) -> tuple[list[str], dict]:
    """Translate saved criteria into SQL. Unknown keys are ignored, not guessed."""
    where: list[str] = []
    params: dict = {}

    risks = _as_list(criteria.get("risk_level"))
    if risks:
        where.append("(CASE WHEN lower(s.risk_level) LIKE 'low%' THEN 'low' WHEN lower(s.risk_level) LIKE 'high%' THEN 'high' WHEN lower(s.risk_level) LIKE 'med%' OR lower(s.risk_level) LIKE 'nor%' THEN 'normal' ELSE 'unrated' END) = ANY(:risks)")
        params["risks"] = [r.lower() for r in risks]

    ratings = _as_list(criteria.get("rating"))
    if ratings:
        where.append("upper(e.rating) = ANY(:ratings)")
        params["ratings"] = [r.upper() for r in ratings]

    pairs = _as_list(criteria.get("pairs"))
    if pairs:
        where.append("upper(s.pair) = ANY(:pairs)")
        params["pairs"] = [_norm_pair(p) for p in pairs]

    exclude_pairs = _as_list(criteria.get("exclude_pairs"))
    if exclude_pairs:
        where.append("upper(s.pair) <> ALL(:exclude_pairs)")
        params["exclude_pairs"] = [_norm_pair(p) for p in exclude_pairs]

    statuses = [s.lower() for s in _as_list(criteria.get("status"))]
    if statuses and not {"all", "any"}.intersection(statuses):
        aliases = {"tp1_plus": ["tp1", "tp2", "tp3", "tp4"],
                   "tp2_plus": ["tp2", "tp3", "tp4"], "full_tp": ["tp3", "tp4"],
                   "closed_win": ["tp4"], "closed_loss": ["sl"]}
        concrete = list({v for st in statuses if st != "updated" for v in aliases.get(st, [st])})
        status_where = []
        if concrete:
            status_where.append("COALESCE((SELECT o.outcome FROM _cache_outcomes o WHERE o.signal_id=s.signal_id), 'open') = ANY(:statuses)")
            params["statuses"] = concrete
        if "updated" in statuses:
            status_where.append("EXISTS (SELECT 1 FROM _cache_last_updates u WHERE u.signal_id=s.signal_id AND u.last_update_at IS NOT NULL)")
        where.append("(" + " OR ".join(status_where) + ")")

    min_conf = criteria.get("min_confidence")
    if isinstance(min_conf, (int, float)):
        where.append("e.confidence_score >= :min_conf")
        params["min_conf"] = int(min_conf)

    directions = _as_list(criteria.get("direction"))
    if directions:
        where.append("lower(coalesce(e.signal_direction, '')) = ANY(:directions)")
        params["directions"] = [d.lower() for d in directions]

    # Stored values include "$250M" and "N/A". Unknown size must stay NULL.
    mcap_clean = "upper(regexp_replace(coalesce(s.market_cap, ''), '[,$[:space:]]', '', 'g'))"
    mcap_number = f"(CASE WHEN {mcap_clean} ~ '^[0-9]+([.][0-9]+)?[KMBT]?$' THEN regexp_replace({mcap_clean}, '[KMBT]$', '')::numeric * CASE right({mcap_clean},1) WHEN 'T' THEN 1e12 WHEN 'B' THEN 1e9 WHEN 'M' THEN 1e6 WHEN 'K' THEN 1e3 ELSE 1 END ELSE NULL END)"
    min_mcap = criteria.get("min_mcap")
    if isinstance(min_mcap, (int, float)):
        where.append(f"{mcap_number} >= :min_mcap")
        params["min_mcap"] = float(min_mcap)
    max_mcap = criteria.get("max_mcap")
    if isinstance(max_mcap, (int, float)):
        where.append(f"{mcap_number} <= :max_mcap")
        params["max_mcap"] = float(max_mcap)

    max_vol_rank = criteria.get("max_volume_rank")
    if isinstance(max_vol_rank, (int, float)):
        where.append("s.volume_rank_num IS NOT NULL AND s.volume_rank_num <= :max_vol_rank")
        params["max_vol_rank"] = int(max_vol_rank)

    min_sl = criteria.get("min_sl_pct")
    max_sl = criteria.get("max_sl_pct")
    if isinstance(min_sl, (int, float)) or isinstance(max_sl, (int, float)):
        where.append("s.entry IS NOT NULL AND s.stop1 IS NOT NULL AND s.entry <> 0")
        sl_expr = "abs(s.entry - s.stop1) / abs(s.entry) * 100"
        if isinstance(min_sl, (int, float)):
            where.append(f"{sl_expr} >= :min_sl_pct")
            params["min_sl_pct"] = float(min_sl)
        if isinstance(max_sl, (int, float)):
            where.append(f"{sl_expr} <= :max_sl_pct")
            params["max_sl_pct"] = float(max_sl)

    if criteria.get("btc_decoupled"):
        where.append("bc.is_decoupled IS TRUE")
    min_align = criteria.get("min_btc_align")
    if isinstance(min_align, (int, float)):
        where.append("(bc.interpretation->>'alignment_score')::int >= :min_btc_align")
        params["min_btc_align"] = int(min_align)

    if criteria.get("smc_golden"):
        where.append("e.smc_golden_setup IS TRUE")

    # There is deliberately no criterion here for the coin's own track record.
    # Reconstructed point-in-time over all 58,075 resolved calls, a pair's
    # record as of publish carries no information about the call being
    # published: win rate -0.46pp between top and bottom quartile, last-5 form
    # +0.16pp, streak +0.13pp, 30-day rate -0.05pp. The old `verdict` filter
    # passed 487 of 491 pairs, so a user who saved "only worth-it coins" was
    # screening out four coins and being told they had a filter. Offering it
    # was worse than not offering it: the promise was invisible from both ends.
    # What does separate is the tag/enrichment side, which is what `tags`,
    # `rating` and `min_confidence` below screen on.

    tags = _as_list(criteria.get("tags"))
    if tags:
        params["tags"] = tags
        # Two things this used to get wrong, both of which let a saved filter
        # screen on a different tag set than the desk the user built it on:
        #
        #   * the `facts` path. tag-wr and hunt-full-tp both read
        #     entry_snapshot->'facts'->'tags_annotated' first and fall back to
        #     the flat key. Reading only the flat key sees a different array on
        #     every row that has both.
        #   * the `important` flag. The signals payload sends `important_tags`,
        #     which is filtered to important = true — 46 of the 113 distinct
        #     tags. Without the same filter this matched tags that never reach
        #     the browser, so a filter could fire on a criterion its owner was
        #     never shown and cannot see on the row.
        tag_sql = """
            SELECT count(DISTINCT t->>'name')
            FROM jsonb_array_elements(
                COALESCE(e.entry_snapshot->'facts'->'tags_annotated',
                         e.entry_snapshot->'tags_annotated', '[]'::jsonb)
            ) t
            WHERE t->>'name' = ANY(:tags)
              AND (t->>'important')::boolean IS TRUE
        """
        if str(criteria.get("tag_match") or "any").lower() == "all":
            where.append(f"({tag_sql}) = :tag_total")
            params["tag_total"] = len(set(tags))
        else:
            where.append(f"({tag_sql}) > 0")

    # Runner gate is ANDed with the user's tag rules, not merged into their OR.
    if criteria.get("_runner_tags"):
        runner_where, runner_params = _build_conditions({"tags": criteria["_runner_tags"]})
        where.extend(w.replace(":tags", ":runner_tags") for w in runner_where)
        params["runner_tags"] = runner_params["tags"]

    exclude_tags = _as_list(criteria.get("exclude_tags"))
    if criteria.get("exclude_confound"):
        exclude_tags = list(dict.fromkeys([*exclude_tags, *sorted(CONFOUND_TAGS)]))
    if exclude_tags:
        params["exclude_tags"] = exclude_tags
        where.append(f"""
            (
              SELECT count(*) FROM jsonb_array_elements(
                  COALESCE(e.entry_snapshot->'facts'->'tags_annotated',
                           e.entry_snapshot->'tags_annotated', '[]'::jsonb)
              ) t
              WHERE t->>'name' = ANY(:exclude_tags)
                AND (t->>'important')::boolean IS TRUE
            ) = 0
        """)

    return where, params


def _describe(criteria: dict) -> str:
    bits = []
    if _as_list(criteria.get("status")):
        bits.append("/".join(_as_list(criteria["status"])).lower())
    if _as_list(criteria.get("rating")):
        bits.append("/".join(_as_list(criteria["rating"])).lower())
    if _as_list(criteria.get("risk_level")):
        bits.append("risk " + "/".join(_as_list(criteria["risk_level"])).lower())
    if criteria.get("runners"):
        bits.append("runners")
    if isinstance(criteria.get("min_confidence"), (int, float)):
        bits.append(f"score ≥ {int(criteria['min_confidence'])}")
    if _as_list(criteria.get("pairs")):
        bits.append("coins " + "/".join(_as_list(criteria["pairs"])[:3]))
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
        if not where and not criteria.get("edge_top") and not criteria.get("runners"):
            continue
        try:
            from app.services.signal_screen import match_screen
            ids = match_screen(criteria, db)
        except Exception:
            log.exception("filter %s evaluation failed; skipped", fid)
            continue
        if not ids:
            continue
        where, params = ["s.signal_id = ANY(:screen_ids)"], {"screen_ids": ids}

        params.update({"fid": fid, "since": updated_at, "lim": MAX_MATCHES_PER_PASS})
        rows = db.execute(text(f"""
            SELECT s.signal_id, s.pair, s.entry, s.risk_level, e.rating, e.confidence_score
            FROM signals s
            JOIN signal_enrichment e ON e.signal_id = s.signal_id
            LEFT JOIN signal_btc_correlation bc ON bc.signal_id = s.signal_id
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
