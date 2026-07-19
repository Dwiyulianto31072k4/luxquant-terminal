# backend/app/api/deps_public.py
"""
Public Data API — auth dependency (API key) + per-user rate limiter
+ per-key IP anomaly tracking (anti account-sharing/resale).

Dipakai HANYA oleh endpoint di namespace publik (/api/public/v1/...).
Web app tetap pakai JWT (deps.py) — file ini nggak nyentuh jalur itu.

Alur:
    1. baca key dari header (Authorization: Bearer <key> atau X-API-Key)
    2. hash -> lookup di api_keys (is_active)            -> 401 kalau gagal
    3. cek user aktif + langganan masih jalan            -> 403 kalau gagal
    4. cek rate limit per-user (Redis)                   -> 429 kalau lewat
    5. track IP unik per-key (Redis) -> flag kalau anomali (TIDAK blokir)
    6. update last_used_at (throttled) -> lolos, balikin User
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
DEFAULT_RATE_LIMIT_PER_MIN = getattr(settings, "PUBLIC_API_RATELIMIT_PER_MIN", 60)

# Throttle nulis last_used_at biar nggak nulis DB tiap request.
LAST_USED_WRITE_EVERY_SECONDS = 60

# ── IP anomaly tracking (Tahap 2) ──────────────────────────────────
# Window rolling + threshold IP unik per-key. Dipakai buat NANDAIN
# (flag) key yang kemungkinan dishare/dijual — BUKAN buat blokir.
# Owner review manual; sistem nggak auto-suspend (hindari false-positive
# dari CGNAT / mobile rotate IP). Semua tunable via .env (getattr fallback).
IP_TRACK_WINDOW_SECONDS = getattr(settings, "PUBLIC_API_IP_WINDOW_SECONDS", 86400)  # 24h
IP_TRACK_THRESHOLD = getattr(settings, "PUBLIC_API_IP_THRESHOLD", 5)
IP_ALERT_DEDUPE_SECONDS = 21600   # log alert max sekali / 6 jam per key
IP_FLAG_TTL_SECONDS = 604800      # flag review bertahan 7 hari

# auto_error=False: header kosong jangan langsung 403, kita handle sendiri.
_bearer = HTTPBearer(auto_error=False)


def _extract_key(request: Request, creds: Optional[HTTPAuthorizationCredentials]) -> Optional[str]:
    """Ambil key dari Authorization: Bearer <key>, fallback ke header X-API-Key."""
    if creds and creds.scheme.lower() == "bearer" and creds.credentials:
        return creds.credentials.strip()
    x = request.headers.get("X-API-Key")
    return x.strip() if x else None


def _client_ip(request: Request) -> Optional[str]:
    """
    IP client asli di balik Cloudflare + Nginx.
    Prioritas: CF-Connecting-IP (di-set Cloudflare) -> X-Forwarded-For
    (hop pertama = client asli) -> request.client.host (fallback).
    PENTING: tanpa ini yang kebaca cuma IP proxy (sama buat semua) ->
    deteksi sharing jadi nggak ada gunanya.
    """
    cf = request.headers.get("CF-Connecting-IP")
    if cf:
        return cf.strip()
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _track_key_ips(api_key_id: int, user_id: int, ip: Optional[str]) -> None:
    """
    Catat IP unik per-key di Redis SET (rolling window). Kalau jumlah IP
    unik dalam window >= threshold, log WARNING (ter-dedupe) + set flag
    persisten buat review manual owner. Fail-open & non-blocking: error
    apapun di sini TIDAK boleh ganggu request asli.
    """
    if not ip:
        return
    r = get_redis()
    if r is None:
        return
    try:
        ips_key = f"apikey:ips:{api_key_id}"
        pipe = r.pipeline()
        pipe.sadd(ips_key, ip)
        pipe.expire(ips_key, IP_TRACK_WINDOW_SECONDS)  # refresh rolling window
        pipe.scard(ips_key)
        results = pipe.execute()
        distinct = results[-1] or 0

        if distinct >= IP_TRACK_THRESHOLD:
            # dedupe: cuma log/flag sekali per window pendek, bukan tiap request
            alert_key = f"apikey:ipalert:{api_key_id}"
            if r.set(alert_key, "1", nx=True, ex=IP_ALERT_DEDUPE_SECONDS):
                raw = list(r.smembers(ips_key))[:10]
                sample = [m.decode() if isinstance(m, bytes) else m for m in raw]
                logger.warning(
                    "[IP-ANOMALY] api_key=%s user=%s distinct_ips=%s window=%ss sample=%s",
                    api_key_id, user_id, distinct, IP_TRACK_WINDOW_SECONDS, sample,
                )
                # flag persisten buat review manual (key_id -> "user|count|ts")
                flag_key = f"apikey:flag:{api_key_id}"
                r.set(flag_key, f"{user_id}|{distinct}|{int(time.time())}", ex=IP_FLAG_TTL_SECONDS)
    except Exception as e:
        logger.warning(f"IP anomaly tracker fail-open: {e}")


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


def get_api_key_user(
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

    # 3. User aktif + langganan masih jalan (pakai property User.has_active_access).
    user = api_key.user
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account inactive")
    if not user.has_active_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Subscription inactive")

    # 4. Rate limit per-user (override key kalau ada, else default global).
    limit = api_key.rate_limit_per_min or DEFAULT_RATE_LIMIT_PER_MIN
    remaining = _check_rate_limit(user.id, limit)
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(remaining)

    # 5. Track IP unik per-key (anti-share). Non-blocking, flag-only.
    _track_key_ips(api_key.id, user.id, _client_ip(request))

    # 6. Update last_used_at (throttled — bukan tiap request).
    now = datetime.now(timezone.utc)
    if api_key.last_used_at is None or (now - api_key.last_used_at) > timedelta(
        seconds=LAST_USED_WRITE_EVERY_SECONDS
    ):
        api_key.last_used_at = now
        db.commit()

    return user
