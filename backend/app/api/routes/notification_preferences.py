# backend/app/api/routes/notification_preferences.py
"""
Notification Preferences — user mengatur notif apa saja yang mau diterima,
dan lewat channel mana (in-app / Telegram).

Pola: ABSENCE = DEFAULT. Kalau user belum pernah set sebuah tipe, pakai default
dari NOTIF_REGISTRY (in_app=True, telegram=False). Jadi tidak perlu seed.

Telegram gating: channel telegram hanya bisa di-ON-kan kalau user.telegram_id
sudah ada (link via /profile). Validasi di PUT — frontend mendeteksi sentinel
'LINK_TELEGRAM_REQUIRED' untuk redirect ke halaman profile.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from pydantic import BaseModel

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["Notification Preferences"])


# ── Registry tipe notif: SINGLE SOURCE OF TRUTH ──
# Frontend render toggle berdasarkan list ini. Tambah tipe baru = cukup tambah 1 baris.
# telegram_eligible=False  -> channel telegram dikunci untuk tipe itu.
NOTIF_REGISTRY = [
    # type               label              group      tg_eligible  def_inapp  def_tg
    {"type": "price_pump",       "label": "Price Alerts",    "group": "market",  "telegram_eligible": True, "default_in_app": True, "default_telegram": False},
    {"type": "daily_results",    "label": "Daily Results",   "group": "signals", "telegram_eligible": True, "default_in_app": True, "default_telegram": False},
    {"type": "btcdom_call",      "label": "BTC Dominance",   "group": "signals", "telegram_eligible": True, "default_in_app": True, "default_telegram": False},
    {"type": "coin_called",      "label": "Watchlist Calls", "group": "signals", "telegram_eligible": True, "default_in_app": True, "default_telegram": False},
    {"type": "watchlist_update", "label": "Watchlist TP/SL", "group": "signals", "telegram_eligible": True, "default_in_app": True, "default_telegram": False},
    {"type": "news",             "label": "News",            "group": "market",  "telegram_eligible": True, "default_in_app": True, "default_telegram": False},
    {"type": "market_pulse",     "label": "Market Pulse",    "group": "market",  "telegram_eligible": True, "default_in_app": True, "default_telegram": False},
    {"type": "sub_expiry",       "label": "Subscription",    "group": "account", "telegram_eligible": True, "default_in_app": True, "default_telegram": False},
    {"type": "admin_broadcast",  "label": "Announcements",   "group": "account", "telegram_eligible": True, "default_in_app": True, "default_telegram": False},
    {"type": "autotrade",        "label": "AutoTrade",       "group": "autotrade", "telegram_eligible": True, "default_in_app": True, "default_telegram": False},
]
_REGISTRY_BY_TYPE = {r["type"]: r for r in NOTIF_REGISTRY}


class PreferenceItem(BaseModel):
    type: str
    label: str
    group: str
    in_app: bool
    telegram: bool
    telegram_eligible: bool


class PreferencesResponse(BaseModel):
    telegram_linked: bool
    items: List[PreferenceItem]


class PreferenceUpdate(BaseModel):
    type: str
    in_app: bool
    telegram: bool


@router.get("/preferences", response_model=PreferencesResponse)
async def get_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text("SELECT notif_type, in_app, telegram FROM notification_preferences WHERE user_id = :uid"),
        {"uid": current_user.id},
    ).fetchall()
    saved = {r[0]: (bool(r[1]), bool(r[2])) for r in rows}

    telegram_linked = current_user.telegram_id is not None

    items = []
    for r in NOTIF_REGISTRY:
        in_app, tg = saved.get(r["type"], (r["default_in_app"], r["default_telegram"]))
        # TG efektif hanya jika: user set ON, akun ter-link, dan tipe eligible.
        effective_tg = bool(tg and telegram_linked and r["telegram_eligible"])
        items.append(PreferenceItem(
            type=r["type"], label=r["label"], group=r["group"],
            in_app=in_app, telegram=effective_tg,
            telegram_eligible=r["telegram_eligible"],
        ))

    return PreferencesResponse(telegram_linked=telegram_linked, items=items)


@router.put("/preferences")
async def update_preference(
    data: PreferenceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reg = _REGISTRY_BY_TYPE.get(data.type)
    if not reg:
        raise HTTPException(status_code=400, detail=f"Unknown notification type: {data.type}")

    telegram = data.telegram
    if telegram:
        if not reg["telegram_eligible"]:
            raise HTTPException(status_code=400, detail="Telegram delivery not available for this type")
        if current_user.telegram_id is None:
            # Sentinel khusus -> frontend tangkap & arahkan ke /profile
            raise HTTPException(status_code=400, detail="LINK_TELEGRAM_REQUIRED")

    db.execute(
        text("""
            INSERT INTO notification_preferences (user_id, notif_type, in_app, telegram, updated_at)
            VALUES (:uid, :type, :in_app, :telegram, NOW())
            ON CONFLICT (user_id, notif_type)
            DO UPDATE SET in_app = EXCLUDED.in_app,
                          telegram = EXCLUDED.telegram,
                          updated_at = NOW()
        """),
        {"uid": current_user.id, "type": data.type, "in_app": data.in_app, "telegram": telegram},
    )
    db.commit()
    return {"message": "Preference updated", "type": data.type, "in_app": data.in_app, "telegram": telegram}
