# backend/app/api/routes/growth.py
"""
Growth / Activity analytics endpoints for the admin workspace.

Reads the passive activity data captured by ActivityTrackerMiddleware
(users.last_active_at / total_sessions + user_activity_events) and turns
it into actionable growth metrics:

  GET /overview            DAU / WAU / MAU, stickiness, signups, headline counts
  GET /feature-funnel      per-feature reach (subscriber vs free) over N days
  GET /at-risk             active subscribers gone dormant / expiring soon
  GET /hot-leads           free users engaging a lot -> upgrade candidates
  GET /user-activity/{id}  detailed timeline + sparkline for one user

Design:
  * DAU/WAU/MAU use users.last_active_at (a single column updated by the
    middleware heartbeat for EVERY authenticated request), so "active in
    last N days" == last_active_at >= now-N.
  * "active days" (for power-user / hot-lead detection) come from the
    user_activity_events table (distinct calendar days with a feature hit).
  * Overview + funnel are cached in Redis (short TTL); lists use a tiny TTL
    so admins still see near-fresh data.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timezone, timedelta

from app.core.database import get_db
from app.api.deps import get_admin_user
from app.core.redis import cache_get, cache_set
from app.models.user import User  # noqa: F401  (ensures model import side-effects)

router = APIRouter(prefix="/api/v1/workspace/growth", tags=["growth"])


# ════════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════════

def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.isoformat()


def _windows(now=None):
    now = now or _now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return {
        "now": now,
        "today": today,
        "d7": now - timedelta(days=7),
        "d14": now - timedelta(days=14),
        "d30": now - timedelta(days=30),
    }


def _engagement_score(active_days_30d: int, distinct_features_30d: int, events_7d: int) -> int:
    """0–100 heuristic. Days carry the most weight, breadth + recency add on."""
    score = (active_days_30d * 5) + (distinct_features_30d * 5) + (min(events_7d, 20) * 1.5)
    return int(min(100, round(score)))


def _effective_telegram(row) -> str | None:
    v = (row.get("admin_telegram_username") or row.get("telegram_username") or "")
    v = (v or "").strip().lstrip("@")
    return v or None


def _effective_discord(row) -> str | None:
    if row.get("admin_discord_handle"):
        v = row["admin_discord_handle"].strip()
        return v or None
    if row.get("discord_id"):
        return str(row["discord_id"])
    return None


def _top_features_map(db: Session, user_ids: list, since) -> dict:
    """Return {user_id: [{'feature': str, 'count': int}, ...]} top 3 per user."""
    if not user_ids:
        return {}
    rows = db.execute(
        text(
            """
            SELECT user_id, feature, COUNT(*) AS c
            FROM user_activity_events
            WHERE user_id = ANY(:ids) AND occurred_at >= :since
            GROUP BY user_id, feature
            ORDER BY user_id, c DESC
            """
        ),
        {"ids": user_ids, "since": since},
    ).fetchall()
    out: dict = {}
    for r in rows:
        bucket = out.setdefault(r.user_id, [])
        if len(bucket) < 3:
            bucket.append({"feature": r.feature, "count": int(r.c)})
    return out


# ════════════════════════════════════════════════════════════════════
# 1. OVERVIEW — headline metrics
# ════════════════════════════════════════════════════════════════════

@router.get("/overview")
def growth_overview(db: Session = Depends(get_db), admin: User = Depends(get_admin_user)):
    cached = cache_get("lq:growth:overview")
    if cached is not None:
        return cached

    w = _windows()

    active = db.execute(
        text(
            """
            SELECT
              COUNT(*) FILTER (WHERE last_active_at >= :today) AS dau,
              COUNT(*) FILTER (WHERE last_active_at >= :d7)    AS wau,
              COUNT(*) FILTER (WHERE last_active_at >= :d30)   AS mau
            FROM users
            WHERE last_active_at IS NOT NULL
            """
        ),
        {"today": w["today"], "d7": w["d7"], "d30": w["d30"]},
    ).fetchone()

    signups = db.execute(
        text(
            """
            SELECT
              COUNT(*) FILTER (WHERE created_at >= :today) AS today,
              COUNT(*) FILTER (WHERE created_at >= :d7)    AS d7,
              COUNT(*) FILTER (WHERE created_at >= :d30)   AS d30,
              COUNT(*) AS total
            FROM users
            """
        ),
        {"today": w["today"], "d7": w["d7"], "d30": w["d30"]},
    ).fetchone()

    active_subs = db.execute(
        text(
            """
            SELECT COUNT(*) AS c FROM users
            WHERE role IN ('premium','subscriber')
              AND (subscription_expires_at IS NULL OR subscription_expires_at > :now)
            """
        ),
        {"now": w["now"]},
    ).scalar() or 0

    dormant_subs = db.execute(
        text(
            """
            SELECT COUNT(*) AS c FROM users
            WHERE role IN ('premium','subscriber')
              AND (subscription_expires_at IS NULL OR subscription_expires_at > :now)
              AND (last_active_at IS NULL OR last_active_at < :d14)
            """
        ),
        {"now": w["now"], "d14": w["d14"]},
    ).scalar() or 0

    power_users = db.execute(
        text(
            """
            SELECT COUNT(*) FROM (
              SELECT user_id
              FROM user_activity_events
              WHERE occurred_at >= :d7
              GROUP BY user_id
              HAVING COUNT(DISTINCT (occurred_at AT TIME ZONE 'UTC')::date) >= 5
            ) t
            """
        ),
        {"d7": w["d7"]},
    ).scalar() or 0

    dau = int(active.dau or 0)
    wau = int(active.wau or 0)
    mau = int(active.mau or 0)
    stickiness = round((dau / mau) * 100, 1) if mau else 0.0

    result = {
        "dau": dau,
        "wau": wau,
        "mau": mau,
        "stickiness_pct": stickiness,          # DAU/MAU
        "active_subscribers": int(active_subs),
        "dormant_subscribers": int(dormant_subs),
        "power_users": int(power_users),
        "signups_today": int(signups.today or 0),
        "signups_7d": int(signups.d7 or 0),
        "signups_30d": int(signups.d30 or 0),
        "total_users": int(signups.total or 0),
        "generated_at": _iso(w["now"]),
    }
    cache_set("lq:growth:overview", result, ttl=300)
    return result


# ════════════════════════════════════════════════════════════════════
# 2. FEATURE FUNNEL — reach per feature, subscriber vs free
# ════════════════════════════════════════════════════════════════════

@router.get("/feature-funnel")
def feature_funnel(
    days: int = Query(30, ge=1, le=90),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    cache_key = f"lq:growth:funnel:{days}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    since = _now() - timedelta(days=days)

    rows = db.execute(
        text(
            """
            SELECT
              e.feature,
              COUNT(DISTINCT e.user_id) AS users_total,
              COUNT(DISTINCT e.user_id) FILTER (
                WHERE u.role IN ('premium','subscriber')
              ) AS users_subs,
              COUNT(DISTINCT e.user_id) FILTER (
                WHERE u.role = 'free'
              ) AS users_free,
              COUNT(*) AS hits
            FROM user_activity_events e
            JOIN users u ON u.id = e.user_id
            WHERE e.occurred_at >= :since
            GROUP BY e.feature
            ORDER BY users_total DESC
            """
        ),
        {"since": since},
    ).fetchall()

    # denominators for % reach
    denom = db.execute(
        text(
            """
            SELECT
              COUNT(*) FILTER (WHERE role IN ('premium','subscriber')) AS subs,
              COUNT(*) FILTER (WHERE role = 'free') AS free
            FROM users
            """
        )
    ).fetchone()
    subs_total = int(denom.subs or 0)
    free_total = int(denom.free or 0)

    features = []
    for r in rows:
        ut = int(r.users_total or 0)
        us = int(r.users_subs or 0)
        uf = int(r.users_free or 0)
        features.append({
            "feature": r.feature,
            "users_total": ut,
            "users_subscribers": us,
            "users_free": uf,
            "hits": int(r.hits or 0),
            "pct_of_subscribers": round((us / subs_total) * 100, 1) if subs_total else 0.0,
            "pct_of_free": round((uf / free_total) * 100, 1) if free_total else 0.0,
        })

    result = {
        "days": days,
        "subscriber_base": subs_total,
        "free_base": free_total,
        "features": features,
        "generated_at": _iso(_now()),
    }
    cache_set(cache_key, result, ttl=300)
    return result


# ════════════════════════════════════════════════════════════════════
# 3. AT-RISK — active subscribers gone dormant / expiring soon
# ════════════════════════════════════════════════════════════════════

@router.get("/at-risk")
def at_risk(
    dormant_days: int = Query(14, ge=1, le=90),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    cache_key = f"lq:growth:atrisk:{dormant_days}:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    w = _windows()
    cutoff = w["now"] - timedelta(days=dormant_days)

    rows = db.execute(
        text(
            """
            SELECT id, username, email, role, avatar_url,
                   telegram_username, admin_telegram_username,
                   discord_id, admin_discord_handle,
                   last_active_at, subscription_expires_at, total_sessions
            FROM users
            WHERE role IN ('premium','subscriber')
              AND (subscription_expires_at IS NULL OR subscription_expires_at > :now)
              AND (last_active_at IS NULL OR last_active_at < :cutoff)
            ORDER BY
              -- soonest expiry first (NULL = lifetime, last),
              -- then longest dormant
              subscription_expires_at ASC NULLS LAST,
              last_active_at ASC NULLS FIRST
            LIMIT :limit
            """
        ),
        {"now": w["now"], "cutoff": cutoff, "limit": limit},
    ).mappings().all()

    user_ids = [r["id"] for r in rows]
    feats = _top_features_map(db, user_ids, w["d30"])

    items = []
    for r in rows:
        la = r["last_active_at"]
        exp = r["subscription_expires_at"]
        days_inactive = (w["now"] - la).days if la else None
        days_until_expiry = (exp - w["now"]).days if exp else None
        items.append({
            "id": r["id"],
            "username": r["username"],
            "email": r["email"],
            "role": r["role"],
            "avatar_url": r["avatar_url"],
            "telegram": _effective_telegram(dict(r)),
            "discord": _effective_discord(dict(r)),
            "last_active_at": _iso(la),
            "days_inactive": days_inactive,
            "subscription_expires_at": _iso(exp),
            "days_until_expiry": days_until_expiry,        # None = lifetime
            "total_sessions": int(r["total_sessions"] or 0),
            "top_features": feats.get(r["id"], []),
        })

    result = {
        "dormant_days": dormant_days,
        "count": len(items),
        "items": items,
        "generated_at": _iso(w["now"]),
    }
    cache_set(cache_key, result, ttl=120)
    return result


# ════════════════════════════════════════════════════════════════════
# 4. HOT LEADS — free users engaging a lot (upgrade candidates)
# ════════════════════════════════════════════════════════════════════

@router.get("/hot-leads")
def hot_leads(
    min_active_days: int = Query(4, ge=1, le=30),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    cache_key = f"lq:growth:hotleads:{min_active_days}:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    w = _windows()

    rows = db.execute(
        text(
            """
            SELECT u.id, u.username, u.email, u.role, u.avatar_url,
                   u.telegram_username, u.admin_telegram_username,
                   u.discord_id, u.admin_discord_handle,
                   u.last_active_at, u.created_at,
                   agg.active_days, agg.events_30d, agg.features_30d
            FROM (
                SELECT user_id,
                       COUNT(DISTINCT (occurred_at AT TIME ZONE 'UTC')::date) AS active_days,
                       COUNT(*) AS events_30d,
                       COUNT(DISTINCT feature) AS features_30d
                FROM user_activity_events
                WHERE occurred_at >= :d30
                GROUP BY user_id
                HAVING COUNT(DISTINCT (occurred_at AT TIME ZONE 'UTC')::date) >= :min_days
            ) agg
            JOIN users u ON u.id = agg.user_id
            WHERE u.role = 'free'
            ORDER BY agg.active_days DESC, u.last_active_at DESC NULLS LAST
            LIMIT :limit
            """
        ),
        {"d30": w["d30"], "min_days": min_active_days, "limit": limit},
    ).mappings().all()

    user_ids = [r["id"] for r in rows]
    feats = _top_features_map(db, user_ids, w["d30"])

    # events in last 7d for engagement score (one query)
    ev7 = {}
    if user_ids:
        for r in db.execute(
            text(
                """
                SELECT user_id, COUNT(*) AS c
                FROM user_activity_events
                WHERE user_id = ANY(:ids) AND occurred_at >= :d7
                GROUP BY user_id
                """
            ),
            {"ids": user_ids, "d7": w["d7"]},
        ).fetchall():
            ev7[r.user_id] = int(r.c)

    items = []
    for r in rows:
        joined_days = (w["now"] - r["created_at"]).days if r["created_at"] else None
        items.append({
            "id": r["id"],
            "username": r["username"],
            "email": r["email"],
            "role": r["role"],
            "avatar_url": r["avatar_url"],
            "telegram": _effective_telegram(dict(r)),
            "discord": _effective_discord(dict(r)),
            "last_active_at": _iso(r["last_active_at"]),
            "joined_days_ago": joined_days,
            "active_days_30d": int(r["active_days"] or 0),
            "events_30d": int(r["events_30d"] or 0),
            "distinct_features_30d": int(r["features_30d"] or 0),
            "engagement_score": _engagement_score(
                int(r["active_days"] or 0),
                int(r["features_30d"] or 0),
                ev7.get(r["id"], 0),
            ),
            "top_features": feats.get(r["id"], []),
        })

    # rank by engagement score for display
    items.sort(key=lambda x: x["engagement_score"], reverse=True)

    result = {
        "min_active_days": min_active_days,
        "count": len(items),
        "items": items,
        "generated_at": _iso(w["now"]),
    }
    cache_set(cache_key, result, ttl=120)
    return result


# ════════════════════════════════════════════════════════════════════
# 5. USER ACTIVITY — detailed timeline for one user (Batch 3 drawer)
# ════════════════════════════════════════════════════════════════════

@router.get("/user-activity/{user_id}")
def user_activity(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    w = _windows()

    u = db.execute(
        text(
            """
            SELECT id, username, last_active_at, total_sessions,
                   last_feature_touched, created_at, login_count, last_login_at
            FROM users WHERE id = :uid
            """
        ),
        {"uid": user_id},
    ).mappings().first()
    if not u:
        return {"error": "user_not_found", "user_id": user_id}

    agg = db.execute(
        text(
            """
            SELECT
              COUNT(*) FILTER (WHERE occurred_at >= :d7)  AS events_7d,
              COUNT(*) FILTER (WHERE occurred_at >= :d30) AS events_30d,
              COUNT(DISTINCT (occurred_at AT TIME ZONE 'UTC')::date)
                FILTER (WHERE occurred_at >= :d7)  AS active_days_7d,
              COUNT(DISTINCT (occurred_at AT TIME ZONE 'UTC')::date)
                FILTER (WHERE occurred_at >= :d30) AS active_days_30d,
              COUNT(DISTINCT feature) FILTER (WHERE occurred_at >= :d30) AS features_30d
            FROM user_activity_events
            WHERE user_id = :uid
            """
        ),
        {"uid": user_id, "d7": w["d7"], "d30": w["d30"]},
    ).mappings().first()

    # daily counts for the last 30 days (sparkline)
    spark_rows = db.execute(
        text(
            """
            SELECT (occurred_at AT TIME ZONE 'UTC')::date AS d, COUNT(*) AS c
            FROM user_activity_events
            WHERE user_id = :uid AND occurred_at >= :d30
            GROUP BY d ORDER BY d
            """
        ),
        {"uid": user_id, "d30": w["d30"]},
    ).fetchall()
    spark_map = {str(r.d): int(r.c) for r in spark_rows}
    sparkline = []
    for i in range(29, -1, -1):
        day = (w["today"] - timedelta(days=i)).date()
        sparkline.append({"date": str(day), "count": spark_map.get(str(day), 0)})

    # top features last 30d
    top = _top_features_map(db, [user_id], w["d30"]).get(user_id, [])

    score = _engagement_score(
        int(agg["active_days_30d"] or 0),
        int(agg["features_30d"] or 0),
        int(agg["events_7d"] or 0),
    )

    return {
        "user_id": u["id"],
        "username": u["username"],
        "last_active_at": _iso(u["last_active_at"]),
        "last_feature_touched": u["last_feature_touched"],
        "total_sessions": int(u["total_sessions"] or 0),
        "login_count": int(u["login_count"] or 0),
        "last_login_at": _iso(u["last_login_at"]),
        "created_at": _iso(u["created_at"]),
        "events_7d": int(agg["events_7d"] or 0),
        "events_30d": int(agg["events_30d"] or 0),
        "active_days_7d": int(agg["active_days_7d"] or 0),
        "active_days_30d": int(agg["active_days_30d"] or 0),
        "distinct_features_30d": int(agg["features_30d"] or 0),
        "engagement_score": score,
        "top_features": top,
        "sparkline_30d": sparkline,
        "generated_at": _iso(w["now"]),
    }


# ════════════════════════════════════════════════════════════════════
# Activity Feed (global stream) + Most Active Users (sortable)
# ════════════════════════════════════════════════════════════════════

@router.get("/activity-feed")
def activity_feed(
    feature: str = Query(None, description="filter by feature (fx|signals|watchlist|...)"),
    limit: int = Query(50, ge=1, le=200),
    before_id: int = Query(None, description="pagination: return events with id < before_id"),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Global activity stream: who touched which feature, when (newest first)."""
    where = []
    params = {"limit": limit}
    if feature:
        where.append("e.feature = :feature")
        params["feature"] = feature
    if before_id:
        where.append("e.id < :before_id")
        params["before_id"] = before_id
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    rows = db.execute(
        text(
            f"""
            SELECT e.id, e.occurred_at, e.feature,
                   u.id AS user_id, u.username, u.telegram_username,
                   u.admin_telegram_username, u.role, u.avatar_url
            FROM user_activity_events e
            JOIN users u ON u.id = e.user_id
            {where_sql}
            ORDER BY e.occurred_at DESC
            LIMIT :limit
            """
        ),
        params,
    ).mappings().all()

    events = [{
        "id": int(r["id"]),
        "user_id": int(r["user_id"]),
        "username": r["username"],
        "telegram_username": _effective_telegram(r),
        "role": r["role"],
        "avatar_url": r["avatar_url"],
        "feature": r["feature"],
        "occurred_at": _iso(r["occurred_at"]),
    } for r in rows]

    return {
        "events": events,
        "count": len(events),
        "next_before_id": events[-1]["id"] if events else None,
        "generated_at": _iso(_now()),
    }


@router.get("/active-users")
def active_users(
    sort_by: str = Query("last_seen", description="last_seen | event_count | feature"),
    window: str = Query("30d", description="7d | 30d | all"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Per-user activity summary, sortable by recency / volume / dominant feature."""
    w = _windows()
    params = {"limit": limit}
    if window == "7d":
        time_filter = "WHERE e.occurred_at >= :d7"
        params["d7"] = w["d7"]
    elif window == "30d":
        time_filter = "WHERE e.occurred_at >= :d30"
        params["d30"] = w["d30"]
    else:
        time_filter = ""

    order = {
        "last_seen": "last_seen DESC NULLS LAST",
        "event_count": "event_count DESC, last_seen DESC NULLS LAST",
        "feature": "top_feature ASC, event_count DESC",
    }.get(sort_by, "last_seen DESC NULLS LAST")

    rows = db.execute(
        text(
            f"""
            SELECT u.id, u.username, u.telegram_username, u.admin_telegram_username,
                   u.role, u.avatar_url,
                   agg.last_seen, agg.event_count, agg.top_feature
            FROM (
                SELECT e.user_id,
                       MAX(e.occurred_at) AS last_seen,
                       COUNT(*) AS event_count,
                       (SELECT feature FROM user_activity_events e2
                        WHERE e2.user_id = e.user_id
                        ORDER BY e2.occurred_at DESC LIMIT 1) AS top_feature
                FROM user_activity_events e
                {time_filter}
                GROUP BY e.user_id
            ) agg
            JOIN users u ON u.id = agg.user_id
            ORDER BY {order}
            LIMIT :limit
            """
        ),
        params,
    ).mappings().all()

    users = [{
        "user_id": int(r["id"]),
        "username": r["username"],
        "telegram_username": _effective_telegram(r),
        "role": r["role"],
        "avatar_url": r["avatar_url"],
        "last_seen": _iso(r["last_seen"]),
        "event_count": int(r["event_count"] or 0),
        "last_feature": r["top_feature"],
    } for r in rows]

    return {
        "users": users,
        "count": len(users),
        "sort_by": sort_by,
        "window": window,
        "generated_at": _iso(w["now"]),
    }
