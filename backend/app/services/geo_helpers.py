"""IP / edge geolocation helpers.

Primary source: Cloudflare `CF-IPCountry` (free, country-level, already on every
request through luxquant.tw). Fallback: none — we do not call external GeoIP
APIs on the hot path.

Country codes are ISO 3166-1 alpha-2 (e.g. ID, US, TW). Cloudflare uses `XX`
for unknown and `T1` for Tor — we store those as-is so admin can filter noise.
"""
from __future__ import annotations

import logging
import hashlib
import hmac
import ipaddress
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.user import User

logger = logging.getLogger("geo")

_CODE_RE = re.compile(r"^[A-Za-z0-9]{2}$")
_COLS_READY = False


def country_from_request(request: Optional[Request]) -> Optional[str]:
    """Best-effort country from edge headers. Never raises."""
    if request is None:
        return None
    try:
        # Cloudflare — authoritative when the site sits behind CF
        for key in (
            "cf-ipcountry",
            "CF-IPCountry",
            "cloudfront-viewer-country",  # if ever on AWS
        ):
            raw = request.headers.get(key)
            if raw:
                code = str(raw).strip().upper()
                if _CODE_RE.match(code):
                    return code
        # Optional: some reverse proxies
        raw = request.headers.get("x-country-code") or request.headers.get("x-geo-country")
        if raw:
            code = str(raw).strip().upper()[:2]
            if _CODE_RE.match(code):
                return code
    except Exception:
        return None
    return None


def client_ip_from_request(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    try:
        cf = request.headers.get("cf-connecting-ip") or request.headers.get("CF-Connecting-IP")
        if cf:
            return cf.strip()[:64]
        xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
        if xff:
            return xff.split(",")[0].strip()[:64]
        if request.client and request.client.host:
            return request.client.host[:64]
    except Exception:
        return None
    return None


def _clean_header(value: Optional[str], limit: int) -> Optional[str]:
    if not value:
        return None
    cleaned = " ".join(str(value).strip().split())[:limit]
    return cleaned or None


def location_from_request(request: Optional[Request]) -> dict:
    """Return trusted edge geo metadata without calling a third-party API.

    Cloudflare supplies country on every proxied request. City/region/timezone
    are accepted only when an upstream edge explicitly injects them; they stay
    null otherwise instead of guessing from an untrusted client value.
    """
    if request is None:
        return {}
    try:
        headers = request.headers
        return {
            "country": country_from_request(request),
            "region": _clean_header(
                headers.get("cf-region")
                or headers.get("x-geo-region")
                or headers.get("x-region-code"),
                100,
            ),
            "city": _clean_header(
                headers.get("cf-ipcity") or headers.get("x-geo-city"),
                100,
            ),
            "geo_timezone": _clean_header(
                headers.get("cf-timezone") or headers.get("x-geo-timezone"),
                64,
            ),
            "ip": client_ip_from_request(request),
        }
    except Exception:
        return {}


def _privacy_safe_ip(ip: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """Return a masked network and a keyed fingerprint, never the raw address."""
    if not ip:
        return None, None
    try:
        addr = ipaddress.ip_address(str(ip).strip())
    except ValueError:
        return None, None
    prefix = 24 if addr.version == 4 else 48
    masked = str(ipaddress.ip_network(f"{addr}/{prefix}", strict=False))
    secret = os.getenv("GEO_IP_HASH_KEY") or os.getenv("JWT_SECRET_KEY")
    fingerprint = None
    if secret:
        fingerprint = hmac.new(
            secret.encode("utf-8"), addr.packed, hashlib.sha256
        ).hexdigest()
    return masked, fingerprint


def _ensure_user_geo_columns(db: Session) -> None:
    global _COLS_READY
    if _COLS_READY:
        return
    for stmt in (
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS geo_country VARCHAR(2)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS geo_country_first VARCHAR(2)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS geo_region VARCHAR(100)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS geo_city VARCHAR(100)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS geo_timezone VARCHAR(64)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS geo_ip_prefix VARCHAR(64)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS geo_ip_first_prefix VARCHAR(64)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS geo_ip_hash VARCHAR(64)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS geo_ip_first_hash VARCHAR(64)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS geo_last_seen_at TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS geo_first_seen_at TIMESTAMPTZ",
        "CREATE INDEX IF NOT EXISTS ix_users_geo_country ON users (geo_country)",
        "CREATE INDEX IF NOT EXISTS ix_users_geo_country_first ON users (geo_country_first)",
        "CREATE INDEX IF NOT EXISTS ix_users_geo_ip_hash ON users (geo_ip_hash)",
    ):
        try:
            db.execute(text(stmt))
        except Exception:
            logger.exception("geo column ensure failed: %s", stmt[:50])
            db.rollback()
            return
    try:
        db.commit()
    except Exception:
        db.rollback()
        return
    _COLS_READY = True


def apply_geo_to_user(
    db: Session,
    user: User,
    country: Optional[str],
    *,
    ip: Optional[str] = None,
    region: Optional[str] = None,
    city: Optional[str] = None,
    geo_timezone: Optional[str] = None,
    commit: bool = False,
) -> bool:
    """Persist privacy-safe, best-effort edge location. Never stores raw IP."""
    if not user:
        return False
    code = str(country).strip().upper() if country else None
    if code and not _CODE_RE.match(code):
        code = None
    masked_ip, ip_hash = _privacy_safe_ip(ip)
    if not any((code, masked_ip, region, city, geo_timezone)):
        return False
    try:
        _ensure_user_geo_columns(db)
    except Exception:
        return False

    changed = False
    now = datetime.now(timezone.utc)
    if code:
        first = getattr(user, "geo_country_first", None)
        last = getattr(user, "geo_country", None)
        if not first:
            user.geo_country_first = code
            changed = True
        if last != code:
            user.geo_country = code
            changed = True
    if masked_ip:
        if not getattr(user, "geo_ip_first_prefix", None):
            user.geo_ip_first_prefix = masked_ip
            user.geo_ip_first_hash = ip_hash
            user.geo_first_seen_at = now
            changed = True
        if getattr(user, "geo_ip_prefix", None) != masked_ip:
            user.geo_ip_prefix = masked_ip
            user.geo_ip_hash = ip_hash
            changed = True
    for field, value in (
        ("geo_region", _clean_header(region, 100)),
        ("geo_city", _clean_header(city, 100)),
        ("geo_timezone", _clean_header(geo_timezone, 64)),
    ):
        if value and getattr(user, field, None) != value:
            setattr(user, field, value)
            changed = True
    last_geo_seen = getattr(user, "geo_last_seen_at", None)
    if last_geo_seen and last_geo_seen.tzinfo is None:
        last_geo_seen = last_geo_seen.replace(tzinfo=timezone.utc)
    if any((code, masked_ip, region, city, geo_timezone)) and (
        not last_geo_seen or now - last_geo_seen >= timedelta(hours=6)
    ):
        user.geo_last_seen_at = now
        if not getattr(user, "geo_first_seen_at", None):
            user.geo_first_seen_at = now
        changed = True
    # Also seed profile country_code if user never set one (admin / display)
    # without clobbering an explicit preference.
    pref = getattr(user, "country_code", None)
    if code and not pref:
        user.country_code = code
        changed = True
    if changed and commit:
        try:
            db.commit()
            db.refresh(user)
        except Exception:
            logger.exception("geo apply commit failed user=%s", getattr(user, "id", None))
            db.rollback()
            return False
    return changed


def apply_request_geo_to_user(
    db: Session,
    user: User,
    request: Optional[Request],
    *,
    commit: bool = False,
) -> bool:
    geo = location_from_request(request)
    country = geo.pop("country", None)
    return apply_geo_to_user(db, user, country, commit=commit, **geo)
