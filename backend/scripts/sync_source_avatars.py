"""
Mirror Telegram source-channel avatars onto our own host.

Telegram serves channel pictures from cdn*.telesco.pe, which is unreachable on
networks that block Telegram — including a good share of our Indonesian
readers. Copying the avatars into the news-images tree lets every credit render
its real mark from luxquant.tw instead.

The files live in a `sources/` subdirectory, which the news bot's 3-day purge
skips because it only deletes plain files at the top level.

Run:  ./venv/bin/python scripts/sync_source_avatars.py
"""

from __future__ import annotations

import os
import sys

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.api.routes.crypto_news_endpoint import SOURCE_ICON_DIR, TELEGRAM_SOURCES  # noqa: E402

USERPIC = "https://t.me/i/userpic/320/{username}.jpg"
TIMEOUT = 20.0


def sync() -> int:
    os.makedirs(SOURCE_ICON_DIR, exist_ok=True)
    saved = 0

    with httpx.Client(timeout=TIMEOUT, follow_redirects=True) as client:
        for name, username, _writes_its_own in TELEGRAM_SOURCES.values():
            if not username:
                print(f"  skip   {name}: private channel, no public avatar")
                continue
            try:
                response = client.get(USERPIC.format(username=username))
                response.raise_for_status()
                if not response.headers.get("content-type", "").startswith("image/"):
                    print(f"  skip   {name}: not an image")
                    continue
                target = os.path.join(SOURCE_ICON_DIR, f"{username}.jpg")
                with open(target, "wb") as handle:
                    handle.write(response.content)
                saved += 1
                print(f"  saved  {name} -> {target} ({len(response.content)} bytes)")
            except Exception as exc:
                print(f"  FAILED {name}: {type(exc).__name__}: {exc}")

    return saved


if __name__ == "__main__":
    print(f"Syncing source avatars into {SOURCE_ICON_DIR}")
    total = sync()
    print(f"done: {total} avatars mirrored")
