"""Decode Telegram Mini App ``start_param`` acquisition payloads.

Normal UTM parameters disappear when a Telegram Ad or channel button opens a
Mini App. Telegram's signed initData preserves ``start_param`` instead. The
``lq1*`` namespace is owned by LuxQuant and compact enough for Telegram's
64-character limit:

    lq1p_<campaign>_<creative>   paid Telegram traffic
    lq1c_<campaign>_<content>    owned Telegram channel traffic
    lq1f_login_redirect          popup/auth rescue
    lq1r_<CODE>                  organic referral (code looked up case-insensitive)

Legacy ``<event>_<coin>_<cta>`` payloads remain supported unchanged.
"""
from __future__ import annotations

from typing import Optional

from app.schemas.user import AcqPayload


_MEDIUM_BY_PREFIX = {
    "lq1p": "paid_social",
    "lq1c": "channel",
    "lq1f": "auth_fallback",
    "lq1r": "referral",
}

_LEGACY_EVENTS = (
    "closed_loss",
    "closed_win",
    "tp1",
    "tp2",
    "tp3",
    "tp4",
    "post",
)


def acq_from_telegram_start_param(start_param: object) -> Optional[AcqPayload]:
    raw = str(start_param or "").strip().lower()[:64]
    if not raw:
        return None

    bits = [bit for bit in raw.split("_") if bit]
    medium = _MEDIUM_BY_PREFIX.get(bits[0] if bits else "")
    if medium:
        return AcqPayload(
            source="telegram",
            medium=medium,
            campaign=bits[1] if len(bits) > 1 else None,
            content="_".join(bits[2:]) or None,
        )

    campaign = next(
        (
            event
            for event in sorted(_LEGACY_EVENTS, key=len, reverse=True)
            if raw == event or raw.startswith(event + "_")
        ),
        None,
    )
    if campaign:
        content = raw[len(campaign) + 1 :] or None
    else:
        campaign = bits[0] if bits else None
        content = "_".join(bits[1:]) or None

    if not campaign:
        return None
    return AcqPayload(
        source="telegram",
        medium="miniapp",
        campaign=campaign,
        content=content,
    )


def referral_code_from_start_param(start_param: object) -> Optional[str]:
    """Extract a referral code from ``lq1r_<CODE>``. None for every other payload."""
    raw = str(start_param or "").strip()
    if len(raw) < 6:
        return None
    if not raw.lower().startswith("lq1r_"):
        return None
    code = raw[5:].strip()
    return code.upper() if code else None


__all__ = ["acq_from_telegram_start_param", "referral_code_from_start_param"]
