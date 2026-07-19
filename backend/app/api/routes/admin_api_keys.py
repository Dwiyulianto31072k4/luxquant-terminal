# backend/app/api/routes/admin_api_keys.py
"""
Admin — view & manage ALL users' API keys + IP-anomaly flags.

Isolated router (keeps the large admin.py untouched). Same pattern as
public_data.py: its own router, registered in main.py.

Endpoints (all admin-gated):
    GET  /admin/api-keys           list + search + filter (active/revoked/flagged)
    POST /admin/api-keys/{id}/revoke   soft-revoke any user's key

Flag IP-anomaly dibaca dari Redis yang dipasang di deps_public.py:
    apikey:ips:{id}   -> SET berisi IP unik (window 24h)  -> SCARD = jumlah IP
    apikey:flag:{id}  -> "user_id|distinct|ts" kalau ke-flag (>=5 IP/24h)
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from app.core.database import get_db
from app.core.redis import get_redis
from app.api.deps import get_admin_user
from app.models.user import User
from app.models.api_key import ApiKey

router = APIRouter(prefix="/admin", tags=["Admin"])


def _redis_ip_info(r, key_id: int):
    """(distinct_ips_24h, flag_str|None). Fail-safe: Redis mati -> (0, None)."""
    if r is None:
        return 0, None
    try:
        distinct = r.scard(f"apikey:ips:{key_id}") or 0
        flag = r.get(f"apikey:flag:{key_id}")
        if isinstance(flag, bytes):
            flag = flag.decode()
        return int(distinct), flag
    except Exception:
        return 0, None


@router.get("/api-keys")
def admin_list_api_keys(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None, description="username / email / key name / prefix"),
    status_filter: Optional[str] = Query(None, alias="status", description="active | revoked | flagged"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """List all API keys across users, plus IP-anomaly flag status."""
    q = db.query(ApiKey, User).join(User, ApiKey.user_id == User.id)

    if search:
        s = f"%{search.lower()}%"
        q = q.filter(
            or_(
                func.lower(User.username).like(s),
                func.lower(User.email).like(s),
                func.lower(ApiKey.name).like(s),
                func.lower(ApiKey.key_prefix).like(s),
            )
        )

    if status_filter == "active":
        q = q.filter(ApiKey.is_active == True)  # noqa: E712
    elif status_filter == "revoked":
        q = q.filter(ApiKey.is_active == False)  # noqa: E712
    # "flagged" can't be filtered in SQL (data lives in Redis) -> filter after lookup

    q = q.order_by(ApiKey.created_at.desc())
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()

    r = get_redis()
    items = []
    for k, u in rows:
        distinct_ips, flag = _redis_ip_info(r, k.id)
        items.append({
            "id": k.id,
            "user_id": k.user_id,
            "username": u.username,
            "email": u.email,
            "name": k.name,
            "key_prefix": k.key_prefix,
            "is_active": k.is_active,
            "created_at": k.created_at.isoformat() if k.created_at else None,
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
            "distinct_ips_24h": distinct_ips,
            "flagged": flag is not None,
        })

    if status_filter == "flagged":
        items = [it for it in items if it["flagged"]]

    # summary (murah)
    active_total = db.query(func.count(ApiKey.id)).filter(ApiKey.is_active == True).scalar() or 0  # noqa: E712
    flagged_total = 0
    if r is not None:
        try:
            flagged_total = sum(1 for _ in r.scan_iter(match="apikey:flag:*", count=500))
        except Exception:
            flagged_total = 0

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "summary": {"active_keys": active_total, "flagged_keys": flagged_total},
    }


@router.post("/api-keys/{key_id}/revoke")
def admin_revoke_api_key(
    key_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Soft-revoke any user's API key (set is_active=False)."""
    k = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not k:
        raise HTTPException(status_code=404, detail="API key not found")
    if not k.is_active:
        return {"success": True, "message": "Already revoked"}
    k.is_active = False
    db.commit()
    return {"success": True, "message": f"API key #{key_id} revoked"}
