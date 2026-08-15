"""Apply the source-controlled LuxQuant Terminal Bot profile and webhook.

Run from ``backend/`` with the production environment loaded.  The script
prints method status only and never prints the bot token or webhook secret.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import httpx


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROFILE_PHOTO = BACKEND_DIR / "assets" / "telegram-terminal-bot-profile.jpg"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.telegram_bot_onboarding import (  # noqa: E402
    BOT_COMMANDS,
    BOT_DESCRIPTION,
    BOT_SHORT_DESCRIPTION,
    webhook_secret,
)


async def main() -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        raise SystemExit("TELEGRAM_BOT_TOKEN is required")

    public_origin = os.getenv("LUXQUANT_PUBLIC_ORIGIN", "https://luxquant.tw").rstrip("/")
    api = f"https://api.telegram.org/bot{token}"
    operations = [
        ("setMyCommands", {"commands": BOT_COMMANDS}),
        ("setMyDescription", {"description": BOT_DESCRIPTION}),
        ("setMyShortDescription", {"short_description": BOT_SHORT_DESCRIPTION}),
        (
            "setChatMenuButton",
            {
                "menu_button": {
                    "type": "web_app",
                    "text": "Open LuxQuant",
                    "web_app": {"url": f"{public_origin}/"},
                }
            },
        ),
        (
            "setWebhook",
            {
                "url": f"{public_origin}/api/v1/auth/telegram/bot/webhook",
                "secret_token": webhook_secret(token),
                "allowed_updates": ["message"],
                # Old updates are harmless: the endpoint acknowledges messages
                # older than five minutes without replying, then Telegram clears
                # them normally.  This avoids both data loss and a reply storm.
                "drop_pending_updates": False,
            },
        ),
    ]

    async with httpx.AsyncClient(timeout=15.0) as client:
        me_response = await client.get(f"{api}/getMe")
        me = me_response.json()
        if me_response.status_code != 200 or not me.get("ok"):
            raise SystemExit(f"getMe failed: {me.get('description', me_response.status_code)}")
        bot_id = me["result"]["id"]
        photos_response = await client.get(
            f"{api}/getUserProfilePhotos",
            params={"user_id": bot_id, "limit": 1},
        )
        photos = photos_response.json()
        if photos_response.status_code != 200 or not photos.get("ok"):
            raise SystemExit(
                f"getUserProfilePhotos failed: {photos.get('description', photos_response.status_code)}"
            )

        if int(photos["result"].get("total_count") or 0) == 0:
            if not PROFILE_PHOTO.is_file():
                raise SystemExit(f"profile photo missing: {PROFILE_PHOTO}")
            with PROFILE_PHOTO.open("rb") as photo_file:
                response = await client.post(
                    f"{api}/setMyProfilePhoto",
                    data={
                        "photo": json.dumps(
                            {
                                "type": "static",
                                "photo": "attach://profile_file",
                            }
                        )
                    },
                    files={
                        "profile_file": (
                            PROFILE_PHOTO.name,
                            photo_file,
                            "image/jpeg",
                        )
                    },
                )
            data = response.json()
            if response.status_code != 200 or not data.get("ok"):
                raise SystemExit(
                    f"setMyProfilePhoto failed: {data.get('description', response.status_code)}"
                )
            print("setMyProfilePhoto: ok")
        else:
            print("setMyProfilePhoto: already present")

        for method, payload in operations:
            response = await client.post(f"{api}/{method}", json=payload)
            data = response.json()
            if response.status_code != 200 or not data.get("ok"):
                raise SystemExit(f"{method} failed: {data.get('description', response.status_code)}")
            print(f"{method}: ok")


if __name__ == "__main__":
    asyncio.run(main())
