"""One read-only evaluator for Custom desk previews, notification matching
and the Signals desk's Runners.

Custom percentiles use the complete seven-day book before tag selection, so a
local day/search slice cannot change which calls qualify for notifications.

Runners has two faces and they must not be confused:
  * the RULE (live_runner_ids) — a current runner tag AND the top 20% of the
    book's Edge, evaluated now. Only the Runners topic worker asks it, once
    per new call, to decide;
  * the MEMBERS (runner_members) — what that decision was. The desk, saved
    alerts and Custom previews all read this, so every surface shows the
    calls the topic posted and none that it did not.
"""
import math
import hashlib
import json
from app.core.redis import cache_get, cache_set
from sqlalchemy import text
from app.services.signal_filter_alerts import _build_conditions, _with_live_runners

# The seven-day book every screen ranks against: from UTC midnight seven days
# ago. /signals/bulk-7d starts at the same instant, so the desk and the screens
# hold the same calls.
BOOK_START_SQL = "date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '7 days'"
MIN_SCORED_FOR_CUT = 10
RUNNERS_EDGE_TOP = 20


def match_screen(criteria, db):
    # v2: `runners` now means the topic's decision (runner_members), not the
    # rule re-evaluated — a new key so no v1 answer is read back as one.
    key = "lq:custom-screen:v2:" + hashlib.sha256(json.dumps(criteria, sort_keys=True).encode()).hexdigest()
    cached = cache_get(key)
    if cached is not None:
        return cached
    result = _evaluate_screen(criteria, db)
    cache_set(key, result, ttl=20)
    return result


def _evaluate_screen(criteria, db):
    if "rules_v2" in criteria:
        from app.services.custom_signal_rules import evaluate_rules
        return evaluate_rules(criteria["rules_v2"], db)["signal_ids"]
    rest = {k: v for k, v in criteria.items() if k != "runners"}
    matched = _book_matches(rest, db)
    if criteria.get("runners"):
        matched &= set(runner_members(db))
    return _edge_top(matched, criteria.get("edge_top"), db)


def _book_matches(criteria, db):
    """Ids in the seven-day book (enriched) that pass the SQL-expressible rules."""
    where, params = _build_conditions(criteria)
    query = """
        SELECT s.signal_id FROM signals s
        JOIN signal_enrichment e ON e.signal_id = s.signal_id
        LEFT JOIN signal_btc_correlation bc ON bc.signal_id = s.signal_id
        WHERE s.created_at::timestamptz >= """ + BOOK_START_SQL + """
    """
    return {str(r[0]) for r in db.execute(text(query + (' AND ' + ' AND '.join(where) if where else '')), dict(params)).fetchall()}


def _edge_top(matched, pct, db):
    """Keep the ids whose Edge sits in the top `pct`% of the whole book."""
    if not pct or not matched:
        return sorted(matched)
    pct = float(pct)
    if not math.isfinite(pct) or not 0 < pct <= 100:
        raise ValueError('Edge percentile must be between 1 and 100')
    scored = _scored_book(db)
    if scored is None:
        return []
    scores = sorted([r['score'] for r in scored if r['score'] is not None], reverse=True)
    cut = _percentile_cut(scores, pct)
    if cut is None:
        return sorted(matched)
    return sorted(matched.intersection(r['signal_id'] for r in scored if r['score'] is not None and r['score'] >= cut))


def live_runner_ids(db):
    """The Runners rule evaluated now: a current runner tag AND the top 20% of
    the book's Edge. The Runners topic worker decides new calls with this;
    nothing a member sees reads it directly (see runner_members)."""
    key = "lq:runners-live:v1"
    cached = cache_get(key)
    if cached is not None:
        return cached
    tagged = _book_matches(_with_live_runners({"runners": True}, db), db)
    result = _edge_top(tagged, RUNNERS_EDGE_TOP, db)
    cache_set(key, result, ttl=20)
    return result


def runner_members(db):
    """Runners as every surface shows it.

    From the moment the topic started, a call is a Runner exactly when the
    topic decided so — once, at publish, never re-judged when later calls
    out-rank it or the runner tags rotate. A call it has not decided yet is
    not one (it will be within a minute of its enrichment). Calls from before
    the topic existed have no decision, so the rule is evaluated for them.
    """
    start, decided = _runner_decisions(db)
    live = live_runner_ids(db)
    if start is None:
        return sorted(live)
    before = set()
    if live:
        before = {str(r[0]) for r in db.execute(text("""
            SELECT signal_id FROM signals
            WHERE signal_id = ANY(:ids) AND created_at::timestamptz < CAST(:start AS timestamptz)
        """), {"ids": list(live), "start": start}).fetchall()}
    return sorted(before | {sid for sid, matched in decided.items() if matched})


def _percentile_cut(scores_desc, pct):
    """Lowest score still inside the top `pct`% of the book (ties kept).

    Mirrored by edgeTopCutFromScores in frontend-react/src/utils/signalFilters.js.
    """
    if len(scores_desc) < MIN_SCORED_FOR_CUT:
        return None
    return scores_desc[max(0, math.ceil(len(scores_desc) * pct / 100) - 1)]


# The columns score_candidates unpacks, in its order. The walk-forward selects
# the same list (plus its own extras after it), so the two score one way.
BOOK_SCORE_COLUMNS = """
    s.signal_id,s.pair,s.risk_level,s.entry,s.created_at,s.status,
    s.volume_rank_num,s.volume_rank_den,s.stop1,s.target1,s.target2,s.target3,s.target4,
    bc.corr_4h_30d,bc.is_decoupled,bc.beta_30d,
    ARRAY(SELECT DISTINCT t->>'name' FROM jsonb_array_elements(
      COALESCE(e.entry_snapshot->'facts'->'tags_annotated',e.entry_snapshot->'tags_annotated','[]'::jsonb)) t
      WHERE (t->>'important')::boolean IS TRUE AND NULLIF(TRIM(t->>'name'),'') IS NOT NULL)
"""


def _scored_book(db):
    # Shared across screens: don't rebuild historical priors for every user.
    # v2 also keeps the factor breakdown, which the desk shows beside the score.
    key = "lq:custom-screen:book-scores:v2"
    cached = cache_get(key)
    if cached is not None:
        return cached
    from app.api.routes.edge_lab import get_edge_correlation
    context = get_edge_correlation(days=0, min_n=40, db=db)
    if not context.get('tags'):
        return None
    rows = db.execute(text("""
        SELECT """ + BOOK_SCORE_COLUMNS + """
        FROM signals s JOIN signal_enrichment e ON e.signal_id=s.signal_id
        LEFT JOIN signal_btc_correlation bc ON bc.signal_id=s.signal_id
        WHERE s.created_at::timestamptz >= """ + BOOK_START_SQL + """
    """)).fetchall()
    scored = score_book(db, rows, context['tags'], context['prefer_tags'],
                        context['baseline'].get('win_rate') or 0, context['window'])
    result = [{"signal_id": r["signal_id"], "score": r["score"], "factors": r.get("factors")} for r in scored]
    cache_set(key, result, ttl=30)
    return result


def score_book(db, rows, tags, prefer_tags, base, window, as_of=None):
    """Score `rows` (BOOK_SCORE_COLUMNS order) against a learned context, with
    the pair prior drawn from the same window — as of `as_of` when given."""
    from app.api.routes.edge_lab import outcomes_cte, _eb_rate, _wr
    from app.services.signal_screen_score import score_candidates
    params = {"start": window["start"], "end": window["end"]}
    if as_of is not None:
        params["as_of"] = as_of
    prior_rows = db.execute(text(f"""
        WITH {outcomes_cte(as_of is not None)}
        SELECT s.pair, count(*), count(*) FILTER (WHERE r.outcome IN ('tp1','tp2','tp3','tp4'))
        FROM resolved r JOIN signals s ON s.signal_id=r.signal_id
        WHERE r.hit_date >= :start AND r.hit_date <= :end
        GROUP BY s.pair HAVING count(*) >= 8
    """), params).fetchall()
    prior = {r[0]: {'n': int(r[1]), 'wr': _wr(int(r[2]), int(r[1])),
                     'wr_shrunk': round((_eb_rate(int(r[2]), int(r[1]), base / 100, 30.0) or 0) * 100, 2)} for r in prior_rows}
    return score_candidates(rows, tags, prefer_tags, base, prior)


def desk_edge(db):
    """Edge scores and Runners membership for the Signals desk, from the same
    evaluator the Runners topic, saved alerts and Custom screens use.

    The desk used to score in the browser and only borrow server scores for
    open calls. The browser formula had drifted (it priced the full-TP leg at
    R4, the server at the mean of R2-R4), so the two scales ran ~1.9 apart and
    the cut was taken over a mix of both: fresh calls, the ones the topic
    posts, were ranked against inflated history and dropped off the tab.

    Membership is runner_members: the topic's own decision. A live-only rule
    would drop a posted call the moment later calls out-rank it or the runner
    tags rotate.
    """
    key = "lq:desk-edge:v1"
    cached = cache_get(key)
    if cached is not None:
        return cached
    scored = _scored_book(db)
    if not scored:
        return {"ok": False}
    from app.api.routes.edge_lab import get_tag_wr
    from app.services.hunt_recipe import select_runner_tags

    scores = sorted((r["score"] for r in scored if r.get("score") is not None), reverse=True)
    tags = [t["tag"] for t in select_runner_tags(get_tag_wr(days=0, min_n=40, db=db).get("tags") or [])
            if t.get("tag")]
    members = set(runner_members(db))
    book = [str(r["signal_id"]) for r in scored]
    result = {
        "ok": True,
        "edge": {str(r["signal_id"]): {"score": r["score"], "factors": r.get("factors")}
                 for r in scored if r.get("score") is not None},
        # Every score in the book, highest first: the basis of any "top N%".
        "book_scores": scores,
        "runners": {
            "tags": tags,
            "edge_top": RUNNERS_EDGE_TOP,
            "cut": _percentile_cut(scores, RUNNERS_EDGE_TOP),
            "ids": sorted(sid for sid in book if sid in members),
        },
    }
    cache_set(key, result, ttl=30)
    return result


def _runner_decisions(db):
    """(topic start, {signal_id: matched}) for the book's decided calls.

    (None, {}) where the Runners topic has never run — its worker creates the
    tables on first start — so the rule stands in for every call.
    """
    try:
        start = db.execute(text(
            "SELECT value FROM runner_call_config WHERE key = 'start_ts'")).scalar()
        if start is None:
            return None, {}
        rows = db.execute(text("""
            SELECT r.signal_id, r.matched FROM runner_call_posts r
            JOIN signals s ON s.signal_id = r.signal_id
            WHERE s.created_at::timestamptz >= """ + BOOK_START_SQL)).fetchall()
    except Exception:
        db.rollback()
        return None, {}
    return start, {str(r[0]): bool(r[1]) for r in rows}
