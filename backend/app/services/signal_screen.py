"""One read-only evaluator for Custom desk previews and notification matching.

Custom percentiles use the complete seven-day book before tag selection, so a
local day/search slice cannot change which calls qualify for notifications.
"""
import math
import hashlib
import json
from app.core.redis import cache_get, cache_set
from sqlalchemy import text
from app.services.signal_filter_alerts import _build_conditions, _with_live_runners


def match_screen(criteria, db):
    key = "lq:custom-screen:v1:" + hashlib.sha256(json.dumps(criteria, sort_keys=True).encode()).hexdigest()
    cached = cache_get(key)
    if cached is not None:
        return cached
    result = _evaluate_screen(criteria, db)
    cache_set(key, result, ttl=20)
    return result


def _evaluate_screen(criteria, db):
    criteria = _with_live_runners(criteria, db)
    where, params = _build_conditions(criteria)
    params = dict(params)
    query = """
        SELECT s.signal_id FROM signals s
        JOIN signal_enrichment e ON e.signal_id = s.signal_id
        LEFT JOIN signal_btc_correlation bc ON bc.signal_id = s.signal_id
        WHERE s.created_at::timestamptz >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '7 days'
    """
    matched = {str(r[0]) for r in db.execute(text(query + (' AND ' + ' AND '.join(where) if where else '')), params).fetchall()}
    pct = criteria.get('edge_top') or (20 if criteria.get('runners') else None)
    if not pct or not matched:
        return sorted(matched)
    pct = float(pct)
    if not math.isfinite(pct) or not 0 < pct <= 100:
        raise ValueError('Edge percentile must be between 1 and 100')
    scored = _scored_book(db)
    if scored is None:
        return []
    scores = sorted([r['score'] for r in scored if r['score'] is not None], reverse=True)
    if len(scores) < 10:
        return sorted(matched)
    cut = scores[max(0, math.ceil(len(scores)*pct/100)-1)]
    return sorted(matched.intersection(r['signal_id'] for r in scored if r['score'] is not None and r['score'] >= cut))


def _scored_book(db):
    # Shared across screens: don't rebuild historical priors for every user.
    key = "lq:custom-screen:book-scores:v1"
    cached = cache_get(key)
    if cached is not None:
        return cached
    from app.api.routes.edge_lab import get_edge_correlation, OUTCOMES_CTE, _eb_rate, _wr
    from app.services.signal_screen_score import score_candidates
    context = get_edge_correlation(days=0, min_n=40, db=db)
    if not context.get('tags'):
        return None
    prior_rows = db.execute(text(f"""
        WITH {OUTCOMES_CTE}
        SELECT s.pair, count(*), count(*) FILTER (WHERE r.outcome IN ('tp1','tp2','tp3','tp4'))
        FROM resolved r JOIN signals s ON s.signal_id=r.signal_id
        WHERE r.hit_date >= :start AND r.hit_date <= :end
        GROUP BY s.pair HAVING count(*) >= 8
    """), context['window']).fetchall()
    base = context['baseline'].get('win_rate') or 0
    prior = {r[0]: {'n': int(r[1]), 'wr': _wr(int(r[2]), int(r[1])),
                     'wr_shrunk': round((_eb_rate(int(r[2]), int(r[1]), base / 100, 30.0) or 0) * 100, 2)} for r in prior_rows}
    rows = db.execute(text("""
        SELECT s.signal_id,s.pair,s.risk_level,s.entry,s.created_at,s.status,
               s.volume_rank_num,s.volume_rank_den,s.stop1,s.target1,s.target2,s.target3,s.target4,
               bc.corr_4h_30d,bc.is_decoupled,bc.beta_30d,
               ARRAY(SELECT DISTINCT t->>'name' FROM jsonb_array_elements(
                 COALESCE(e.entry_snapshot->'facts'->'tags_annotated',e.entry_snapshot->'tags_annotated','[]'::jsonb)) t
                 WHERE (t->>'important')::boolean IS TRUE AND NULLIF(TRIM(t->>'name'),'') IS NOT NULL)
        FROM signals s JOIN signal_enrichment e ON e.signal_id=s.signal_id
        LEFT JOIN signal_btc_correlation bc ON bc.signal_id=s.signal_id
        WHERE s.created_at::timestamptz >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '7 days'
    """)).fetchall()
    scored = score_candidates(rows, context['tags'], context['prefer_tags'], base, prior)
    result = [{"signal_id": r["signal_id"], "score": r["score"]} for r in scored]
    cache_set(key, result, ttl=30)
    return result
