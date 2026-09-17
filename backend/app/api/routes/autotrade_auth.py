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
from app.models.agent_disclaimer import AgentDisclaimerAck
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


def _has_live_ack(db: Session, user_id: int) -> bool:
    return (
        db.query(AgentDisclaimerAck.id)
        .filter(AgentDisclaimerAck.user_id == user_id, AgentDisclaimerAck.kind == "live")
        .first()
        is not None
    )


# Agent is an Annual/Lifetime feature. `monthly` is deliberately absent.
#
# `custom` IS allowed: it is an admin-granted bespoke plan, and the one account
# holding it runs to 2027-05-02 — twenty months. Refusing that because its label
# reads "custom" rather than "yearly" would be a bug, not compliance.
#
# NULL tier is absent too, and costs nothing: every agent config on a NULL tier
# today belongs to a `free` account that `has_active_access` already stops.
BOT_TIERS = frozenset({"yearly", "lifetime", "custom"})
BOT_TIER_LABEL = "Annual or Lifetime"


def _plan_allows_bot(user: User) -> bool:
    """Whether this account's PLAN includes the Agent.

    A third gate, kept separate from has_active_access and bot_access_blocked
    for the same reason those two are separate from each other: this one says
    "your plan does not include this", which is a different sentence from "your
    subscription lapsed" and from "an operator switched you off", and the user
    is shown the difference.

    Staff always pass — an admin has to be able to reach the feature to support
    it.
    """
    if getattr(user, "is_admin_staff", False):
        return True
    return (getattr(user, "subscription_tier", None) or "") in BOT_TIERS


def _entitlement_payload(user: User, db: Session) -> dict:
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
        # Live trading acknowledgement. Connecting a key and going live both
        # require this. Assistant-only is not enough.
        "has_live_ack": _has_live_ack(db, user.id),
        # Operator kill-switch, kept SEPARATE from has_active_access on purpose:
        # that field also gates the signal feed and the journey view, so folding
        # a bot block into it would cut the user off from everything they pay
        # for. AutoTrade must treat this as its own gate.
        # Third gate. Absent in an older LuxQuant, which the bot reads as
        # permitted, so a rollout never locks anyone out by omission.
        "plan_allows_bot": _plan_allows_bot(user),
        "plan_required": BOT_TIER_LABEL,
        "subscription_tier": getattr(user, "subscription_tier", None),
        "bot_access_blocked": user.autotrade_blocked,
        "bot_access_blocked_reason": user.autotrade_blocked_reason,
        "bot_access_blocked_at": (
            user.autotrade_blocked_at.isoformat()
            if user.autotrade_blocked_at else None
        ),
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

    return _entitlement_payload(user, db)


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
        data = _entitlement_payload(user, db)
        data["has_active_access"] = False
        return data
    return _entitlement_payload(user, db)
