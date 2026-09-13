"""Calls whose setup looks like this one.

WHY IT IS NOT "shares the most tags"
------------------------------------
Measured on production, 2026-09-13, over the 17,575 calls that carry an entry
snapshot:

  * every call is annotated with ~33 tags (min 25, median 33, max 42), so a
    plain overlap count matches almost everything against almost everything;
  * the `important` subset is the real fingerprint -- median 10 per call,
    46 distinct names;
  * but even there the frequencies are wildly uneven:

        PATTERN_CONFLICTING      17,565 / 17,575   99.94%
        FRESH_BREAKOUT           14,138            80.4%
        HTF_BIAS_NEUTRAL         11,581            65.9%
        FNG_EXTREME_FEAR         11,452            65.2%
        ...
        17 tags appear on under 10% of calls

    Sharing PATTERN_CONFLICTING says nothing at all -- everything shares it.
    Sharing a 6%-frequency tag says a great deal.

So similarity is an IDF-weighted overlap: each shared tag contributes
ln(N / df(tag)). The near-universal five collapse to roughly zero weight on
their own, without anyone maintaining a blocklist, and the score self-adjusts
as the tagger changes. Of the 46, five are near-universal (>60%), 24 sit in the
10-60% band that actually discriminates, and 17 are rare.

Score is normalised against the target's OWN total weight, so 1.0 means "every
distinctive thing about this setup is also true of that one".

WHAT IT DOES NOT CLAIM
----------------------
This reports, it does not forecast. The outcome figures describe what happened
to the calls returned; nothing here has been shown to predict the next one, and
[[coin-record-has-no-signal]] is a standing reminder that an obvious-looking
predictor on this book can measure nothing. Sample size ships with the numbers
so a thin set reads as thin.

Window: 90 days by default. Measured cost -- unnesting every snapshot ever is
2.3s, which is not a thing to do while a modal opens; 90 days is 8,727 calls
and 344ms, cached after that.
"""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.redis import cache_get, cache_set
from app.models.user import User
# The outcome per call, already reduced to one row each by the cache worker.
# Building it inline from signal_updates instead (signals.py's outcomes CTE) is
# correct but costs a full scan with a window function: measured 1.80s against
# 0.34s here, for a panel that opens together with a modal.
from app.services.cache_worker import ensure_outcomes_table, precompute_outcomes
from app.utils.chart_urls import chart_path_to_url

router = APIRouter()

# Long enough to be a real sample, short enough that the regime is comparable
# and the unnest stays cheap. See the module docstring for the measurements.
DEFAULT_DAYS = 90
# The desk's own front tab is Today, and a setup that fired this week is the
# only kind you can still do anything about. Recent calls get a reserved quota
# rather than a re-sort — see the row_number() in the SQL.
RECENT_DAYS = 7
RECENT_LIMIT = 12


class SimilarCall(BaseModel):
    # Deliberately the same shape SignalModal already opens (PastCallItem in
    # coin_profile.py), so a row here can be handed straight to onSwitchSignal
    # without another round trip.
    signal_id: str
    pair: Optional[str] = None
    entry: Optional[float] = None
    target1: Optional[float] = None
    target2: Optional[float] = None
    target3: Optional[float] = None
    target4: Optional[float] = None
    stop1: Optional[float] = None
    stop2: Optional[float] = None
    risk_level: Optional[str] = None
    market_cap: Optional[str] = None
    status: Optional[str] = None
    outcome: Optional[str] = None
    created_at: Optional[str] = None
    entry_chart_url: Optional[str] = None
    latest_chart_url: Optional[str] = None
    gain_pct: Optional[float] = None
    # What makes it similar, so the user can see the reason rather than trust a
    # number: the shared tags, rarest first.
    shared_tags: List[str] = []
    shared_count: int = 0
    score: float = 0.0
    # Drives the grouping in the panel: a setup that fired this week is
    # something you can still act on; one from June is history.
    is_recent: bool = False


class SimilarSummary(BaseModel):
    returned: int = 0
    resolved: int = 0
    tp1_plus: int = 0
    tp3_plus: int = 0
    sl: int = 0
    win_rate: Optional[float] = None
    window_days: int = DEFAULT_DAYS
    recent_days: int = RECENT_DAYS
    recent_count: int = 0
    # The target's own distinctive tags, rarest first — the thing being matched.
    basis_tags: List[str] = []


class SimilarResponse(BaseModel):
    summary: SimilarSummary
    items: List[SimilarCall]


_SQL = """
WITH cand AS (
    SELECT signal_id, pair FROM signals WHERE created_at >= :since
),
imp AS (
    SELECT e.signal_id, t->>'name' AS tag
    FROM signal_enrichment e
    JOIN cand c ON c.signal_id = e.signal_id,
         jsonb_array_elements(e.entry_snapshot->'tags_annotated') t
    WHERE (t->>'important')::boolean = true
),
df AS (SELECT tag, count(*)::float AS n FROM imp GROUP BY tag),
tot AS (SELECT count(DISTINCT signal_id)::float AS n FROM imp),
w AS (
    -- ln(N/df): the 99.94% tag lands near zero on its own, no blocklist.
    SELECT df.tag, ln((SELECT n FROM tot) / GREATEST(df.n, 1)) AS idf FROM df
),
target AS (SELECT tag FROM imp WHERE signal_id = :sid),
target_w AS (SELECT COALESCE(sum(w.idf), 0) AS total FROM target tg JOIN w ON w.tag = tg.tag),
scored AS (
    SELECT i.signal_id,
           sum(w.idf) AS shared_w,
           count(*) AS shared_n,
           array_agg(i.tag ORDER BY w.idf DESC) AS shared_tags
    FROM imp i
    JOIN target tg ON tg.tag = i.tag
    JOIN w ON w.tag = i.tag
    WHERE i.signal_id <> :sid
    GROUP BY i.signal_id
),
ranked AS (
    SELECT s.signal_id, s.pair, s.entry,
           s.target1, s.target2, s.target3, s.target4,
           s.stop1, s.stop2, s.risk_level, s.market_cap, s.status,
           so.outcome, s.created_at, s.entry_chart_path, s.latest_chart_path,
           sc.shared_tags, sc.shared_n, sc.shared_w,
           (s.created_at >= :recent_since) AS is_recent,
           -- Ranked INSIDE each bucket, which is the whole point: seven days
           -- is about 8% of a ninety-day window, so a single similarity
           -- ordering would seat maybe two or three recent calls by luck and
           -- some days none at all. Each bucket gets its own quota instead.
           row_number() OVER (
               PARTITION BY (s.created_at >= :recent_since)
               ORDER BY sc.shared_w DESC, s.created_at DESC
           ) AS rn
    FROM scored sc
    JOIN signals s ON s.signal_id = sc.signal_id
    LEFT JOIN _cache_outcomes so ON so.signal_id = s.signal_id
    WHERE (:include_same_pair OR s.pair IS DISTINCT FROM :pair)
)
SELECT signal_id, pair, entry, target1, target2, target3, target4,
       stop1, stop2, risk_level, market_cap, status, outcome, created_at,
       entry_chart_path, latest_chart_path, shared_tags, shared_n,
       shared_w / NULLIF((SELECT total FROM target_w), 0) AS score,
       is_recent
FROM ranked
WHERE (is_recent AND rn <= :recent_limit) OR ((NOT is_recent) AND rn <= :limit)
ORDER BY is_recent DESC, shared_w DESC, created_at DESC
"""


@router.get("/{signal_id}/similar", response_model=SimilarResponse)
def get_similar_signals(
    signal_id: str,
    limit: int = Query(30, ge=1, le=100, description="Older matches to return, on top of the recent quota"),
    days: int = Query(DEFAULT_DAYS, ge=7, le=400),
    recent_days: int = Query(RECENT_DAYS, ge=1, le=90),
    recent_limit: int = Query(RECENT_LIMIT, ge=0, le=50),
    include_same_pair: bool = Query(
        False,
        description="Same-pair history is already the History tab; off by default so this adds other coins.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Calls whose distinctive tags overlap this one's, rarest tags weighted highest."""
    row = db.execute(
        text("SELECT pair FROM signals WHERE signal_id = :sid"), {"sid": signal_id}
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Signal not found")
    pair = row[0]

    cache_key = (
        f"lq:similar:v2:{signal_id}:l{limit}:d{days}"
        f":r{recent_days}x{recent_limit}:sp{int(include_same_pair)}"
    )
    cached = cache_get(cache_key)
    if cached:
        return cached

    # The cache worker drops and recreates this table each cycle; if a restart
    # caught it mid-rebuild, build it rather than 500 on a missing relation.
    if not ensure_outcomes_table(db):
        precompute_outcomes(db)

    now = datetime.now(timezone.utc)
    since = (now - timedelta(days=days)).strftime("%Y-%m-%d")
    recent_since = (now - timedelta(days=recent_days)).strftime("%Y-%m-%d")
    rows = db.execute(
        text(_SQL),
        {
            "sid": signal_id,
            "pair": pair,
            "since": since,
            "recent_since": recent_since,
            "limit": limit,
            "recent_limit": recent_limit,
            "include_same_pair": include_same_pair,
        },
    ).fetchall()

    basis = db.execute(
        text(
            """
            SELECT t->>'name'
            FROM signal_enrichment e, jsonb_array_elements(e.entry_snapshot->'tags_annotated') t
            WHERE e.signal_id = :sid AND (t->>'important')::boolean = true
            """
        ),
        {"sid": signal_id},
    ).fetchall()

    items: List[SimilarCall] = []
    resolved = tp1_plus = tp3_plus = sl_n = 0
    for r in rows:
        outcome = r[12]
        entry_val = float(r[2]) if r[2] else 0.0
        gain = None
        if entry_val > 0 and outcome:
            tp = {"tp1": r[3], "tp2": r[4], "tp3": r[5], "tp4": r[6], "sl": r[7]}.get(outcome)
            if tp and float(tp) > 0:
                gain = round(((float(tp) - entry_val) / entry_val) * 100, 2)
        if outcome:
            resolved += 1
            if outcome in ("tp1", "tp2", "tp3", "tp4"):
                tp1_plus += 1
            if outcome in ("tp3", "tp4"):
                tp3_plus += 1
            if outcome == "sl":
                sl_n += 1
        items.append(
            SimilarCall(
                signal_id=str(r[0]),
                pair=r[1],
                entry=r[2],
                target1=r[3],
                target2=r[4],
                target3=r[5],
                target4=r[6],
                stop1=r[7],
                stop2=r[8],
                risk_level=r[9],
                market_cap=r[10],
                status=r[11],
                outcome=outcome,
                created_at=str(r[13]) if r[13] else None,
                entry_chart_url=chart_path_to_url(r[14]),
                latest_chart_url=chart_path_to_url(r[15]),
                gain_pct=gain,
                shared_tags=list(r[16] or []),
                shared_count=int(r[17] or 0),
                score=round(float(r[18] or 0), 4),
                is_recent=bool(r[19]),
            )
        )

    payload = SimilarResponse(
        summary=SimilarSummary(
            returned=len(items),
            resolved=resolved,
            tp1_plus=tp1_plus,
            tp3_plus=tp3_plus,
            sl=sl_n,
            # Only over the resolved ones: an open call has not failed, and
            # counting it as a loss is how a desk talks itself into a number.
            win_rate=round(tp1_plus / resolved * 100, 1) if resolved else None,
            window_days=days,
            recent_days=recent_days,
            recent_count=sum(1 for x in items if x.is_recent),
            basis_tags=[b[0] for b in basis],
        ),
        items=items,
    ).model_dump()

    # Short TTL on purpose: the tags never change after entry, but the outcomes
    # of the neighbours do, and a stale win rate is the misleading half.
    cache_set(cache_key, payload, ttl=600)
    return payload
