# backend/app/api/deps_public.py
"""
Public Data API — auth dependency (API key) + per-user rate limiter.

Dipakai HANYA oleh endpoint di namespace publik (/api/public/v1/...).
Web app tetap pakai JWT (deps.py) — file ini nggak nyentuh jalur itu.

Alur (sama kayak diagram pipeline):
    1. baca key dari header (Authorization: Bearer <key> atau X-API-Key)
    2. hash -> lookup di api_keys (is_active)            -> 401 kalau gagal
    3. cek user aktif + langganan masih jalan            -> 403 kalau gagal
    4. cek rate limit per-user (Redis)                   -> 429 kalau lewat
    5. update last_used_at (throttled) -> lolos, balikin User
"""
import time
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.redis import get_redis
from app.models.api_key import ApiKey, hash_api_key
from app.models.user import User
from app.config import settings

logger = logging.getLogger("public-api-auth")

# Default limit kalau key nggak punya override. Bisa di-set via .env biar tunable.
DEFAULT_RATE_LIMIT_PER_MIN = getattr(settings, "PUBLIC_API_RATELIMIT_PER_MIN", 120)

# Throttle nulis last_used_at biar nggak nulis DB tiap request.
LAST_USED_WRITE_EVERY_SECONDS = 60

# auto_error=False: header kosong jangan langsung 403, kita handle sendiri.
_bearer = HTTPBearer(auto_error=False)


def _extract_key(request: Request, creds: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    """Ambil key dari Authorization: Bearer <key>, fallback ke header X-API-Key."""
    if creds and creds.scheme.lower() == "bearer" and creds.credentials:
        return creds.credentials.strip()
    x = request.headers.get("X-API-Key")
    return x.strip() if x else None


def _check_rate_limit(user_id: int, limit_per_min: int) -> int:
    """
    Sliding-window log per-user pakai Redis ZSET (anti boundary-burst).
    Hitung request dalam 60 detik terakhir; >= limit -> 429.

    Return: sisa kuota (remaining) buat header informatif.
    Fail-open: Redis mati / error -> request diloloskan (sesuai filosofi app
    yang degrade tanpa cache). Trade-off: pas Redis down, nggak ada limit.
    """
    r = get_redis()
    if r is None:
        return limit_per_min  # fail-open, sisa nggak diketahui

    key = f"rl:apikey:{user_id}"
    now_ms = int(time.time() * 1000)
    window_start = now_ms - 60_000

    try:
        # Step 1 — buang entri lewat window, hitung yang masih dalam window.
        pipe = r.pipeline()
        pipe.zremrangebyscore(key, 0, window_start)
        pipe.zcard(key)
        _, used = pipe.execute()

        if used >= limit_per_min:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Coba lagi sebentar.",
                headers={
                    "Retry-After": "60",
                    "X-RateLimit-Limit": str(limit_per_min),
                    "X-RateLimit-Remaining": "0",
                },
            )

        # Step 2 — catat request ini (cuma kalau lolos, jadi request yang
        # ditolak nggak ikut keitung). EXPIRE biar key bersih sendiri.
        member = f"{now_ms}-{secrets.token_hex(4)}"
        pipe = r.pipeline()
        pipe.zadd(key, {member: now_ms})
        pipe.expire(key, 60)
        pipe.execute()

        return max(0, limit_per_min - used - 1)

    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Rate limiter fail-open: {e}")
        return limit_per_min


async def get_api_key_user(
    request: Request,
    response: Response,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    """Dependency utama: autentikasi via API key + rate limit. Balikin User."""
    raw_key = _extract_key(request, creds)
    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Lookup by hash (cepat, ter-index oleh UNIQUE constraint).
    key_hash = hash_api_key(raw_key)
    api_key = (
        db.query(ApiKey)
        .filter(ApiKey.key_hash == key_hash, ApiKey.is_active == True)  # noqa: E712
        .first()
    )
    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key",
        )

    # 3. User aktif + langganan masih jalan (pakai property User.is_premium).
    user = api_key.user
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account inactive")
    if not user.is_premium:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Subscription inactive")

    # 4. Rate limit per-user (override key kalau ada, else default global).
    limit = api_key.rate_limit_per_min or DEFAULT_RATE_LIMIT_PER_MIN
    remaining = _check_rate_limit(user.id, limit)
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(remaining)

    # 5. Update last_used_at (throttled — bukan tiap request).
    now = datetime.now(timezone.utc)
    if api_key.last_used_at is None or (now - api_key.last_used_at) > timedelta(
        seconds=LAST_USED_WRITE_EVERY_SECONDS
    ):
        api_key.last_used_at = now
        db.commit()

    return user
