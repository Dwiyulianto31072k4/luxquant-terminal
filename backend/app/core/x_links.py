"""Where a link about one of our published posts should point.

@luxquantcrypto was suspended on 2026-08-18 and its posts went with it, so every
`tweet_id` recorded before that date is a dead link — 17,634 of them — no matter
which handle is written into the URL.

Rewriting those to the live handle is worse than leaving them wrong: a 404 then
looks legitimate, and it points readers at an account that never held the post.
So anything from before the cutover gets **no X link at all**, and callers that
have a Telegram message id should prefer it, because that archive is still up.

Both values are env-overridable so a future account change is a config edit, not
a code hunt.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

# The moment the old account stopped being reachable. Tweet ids recorded at or
# before this are unreachable regardless of handle.
_CUTOVER_RAW = os.getenv("X_ACCOUNT_CUTOVER", "2026-08-18T00:00:00+00:00")
try:
    X_CUTOVER = datetime.fromisoformat(_CUTOVER_RAW)
    if X_CUTOVER.tzinfo is None:
        X_CUTOVER = X_CUTOVER.replace(tzinfo=timezone.utc)
except ValueError:
    X_CUTOVER = datetime(2026, 8, 18, tzinfo=timezone.utc)

# Handles this brand no longer posts from. A config still naming one of these
# is stale by definition — @luxquantcrypto was suspended on 2026-08-18 and
# @luxquantapp was retired with it — so honouring it produces links and card
# footers pointing at accounts that never held the post.
#
# This guard exists because of a real failure: .env was corrected to
# luxquantalgo on 2026-08-21 12:42, but the gunicorn master had started at
# 06:12, and systemd only re-reads EnvironmentFile on *restart*. Every reload
# after that faithfully carried the dead value, with nothing on the outside to
# show it. Rejecting a known-dead handle makes that self-healing on reload
# instead of needing a restart nobody can schedule.
RETIRED_HANDLES = {"luxquantcrypto", "luxquantapp"}
DEFAULT_HANDLE = "luxquantalgo"


def resolve_handle(raw: Optional[str] = None) -> str:
    """The handle to publish under — never a retired one, whatever config says."""
    value = (raw if raw is not None else os.getenv("X_ACCOUNT_HANDLE") or "").strip().lstrip("@")
    if not value or value.lower() in RETIRED_HANDLES:
        return DEFAULT_HANDLE
    return value


X_HANDLE = resolve_handle()
TG_CHANNEL = (os.getenv("TG_TARGET_CHANNEL", "LuxQuantSignal") or "LuxQuantSignal").lstrip("@")


def tweet_url(tweet_id, posted_at) -> Optional[str]:
    """X permalink, or None when the post is on the account that was suspended.

    `posted_at` missing is treated as "before the cutover": the rows that lack a
    timestamp are all old ones, and guessing in the other direction would emit a
    broken link.
    """
    if not tweet_id:
        return None
    if posted_at is None:
        return None
    if posted_at.tzinfo is None:
        posted_at = posted_at.replace(tzinfo=timezone.utc)
    if posted_at <= X_CUTOVER:
        return None
    return f"https://x.com/{X_HANDLE}/status/{tweet_id}"


def telegram_url(message_id) -> Optional[str]:
    """Permalink into the public Telegram channel — the archive that survived."""
    if not message_id:
        return None
    return f"https://t.me/{TG_CHANNEL}/{message_id}"
