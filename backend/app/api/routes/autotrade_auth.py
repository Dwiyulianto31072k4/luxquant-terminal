# backend/app/api/routes/autotrade_auth.py
"""
AutoTrade cross-service auth bridge.

AutoTrade backend (VPS terpisah, dev: teman) butuh tau 3 hal tentang user:
  1. Identitas    -> siapa user-nya (stable user_id buat keying API key exchange)
  2. Entitlement  -> punya akses aktif? (admin / lifetime / premium/subscriber belum expired)
  3. Google linked -> syarat aktivasi AutoTrade

Pola: server-to-server introspection. LuxQuant = source of truth.

DUA endpoint:
  POST /autotrade/verify-access        -> handshake awal (butuh token user + service key)
  GET  /autotrade/entitlement/{uid}    -> cek ulang berkelanjutan (service key doang)

PENTING (security boundary):
- Google OAuth token / credential user TIDAK PERNAH dikirim ke AutoTrade.
  AutoTrade cuma dapat boolean google_linked.
- Service key disimpan di .env (kedua VPS), JANGAN pernah ke browser.
- Semua trafik HARUS lewat HTTPS.
- AutoTrade WAJIB panggil /entitlement tepat sebelum eksekusi trade,
  bukan cuma pas login -- biar user expired langsung ke-cut.
"""
import os
import hmac
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models.user import User

router = APIRouter(prefix="/autotrade", tags=["AutoTrade Auth"])

# Rahasia server-to-server. Generate: openssl rand -hex 32
# Set di .env LuxQuant + pastikan systemd unit punya EnvironmentFile=
AUTOTRADE_SERVICE_KEY = os.getenv("AUTOTRADE_SERVICE_KEY", "")


class VerifyAccessRequest(BaseModel):
    access_token: str


def _require_service_key(x_service_key: str = Header(None)):
    """Autentikasi AutoTrade-the-service (bukan user) via shared secret."""
    if not AUTOTRADE_SERVICE_KEY:
        raise HTTPException(status_code=503, detail="AUTOTRADE_SERVICE_KEY is not configured on the server")
    if not x_service_key or not hmac.compare_digest(x_service_key, AUTOTRADE_SERVICE_KEY):
        raise HTTPException(status_code=403, detail="Invalid service key")
    return True


def _entitlement_payload(user: User) -> dict:
    """Bentuk response entitlement yang konsisten dipakai kedua endpoint."""
    google_linked = user.google_id is not None
    return {
        "user_id": user.id,
        "email": user.email,
        "username": user.username,
        "role": user.role,
        # has_active_access = admin | lifetime | premium/subscriber belum expired.
        # Ini SATU-SATUNYA field yang AutoTrade pakai buat gate akses.
        "has_active_access": user.has_active_access,
        "google_linked": google_linked,
        "subscription_expires_at": (
            user.subscription_expires_at.isoformat()
            if user.subscription_expires_at else None
        ),
        "subscription_source": user.subscription_source,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@router.post("/verify-access")
def verify_access(
    body: VerifyAccessRequest,
    _: bool = Depends(_require_service_key),
    db: Session = Depends(get_db),
):
    """
    Handshake awal: AutoTrade kirim token user LuxQuant (di-forward dari frontend).
    LuxQuant validasi token + balikin identitas & entitlement.

    AutoTrade simpan user_id hasil sini sebagai FK buat semua record-nya
    (API key exchange, jobs, dll), lalu pakai /entitlement buat cek selanjutnya.
    """
    payload = decode_token(body.access_token)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="User token is invalid or expired")

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    return _entitlement_payload(user)


@router.get("/entitlement/{user_id}")
def get_entitlement(
    user_id: int,
    _: bool = Depends(_require_service_key),
    db: Session = Depends(get_db),
):
    """
    Cek entitlement berkelanjutan TANPA token user (pakai user_id + service key).

    Dipakai AutoTrade buat:
      - re-check periodik sesi aktif
      - WAJIB: cek tepat sebelum eksekusi trade (user bisa expired mid-session)

    Selalu balikin 200 dengan has_active_access true/false; AutoTrade yang
    mutusin. (404 cuma kalau user benar-benar gak ada.)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        # Akun dinonaktifkan/ban -> anggap gak punya akses
        data = _entitlement_payload(user)
        data["has_active_access"] = False
        return data
    return _entitlement_payload(user)
