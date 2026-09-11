"""Who must not be mailed, and the token that lets them say so.

Two things live here because they are one idea: the list of addresses LuxQuant
has been told to stop mailing, and the signed token that puts an address on
that list from a link in a mail — no login, because a person who wants out
should never have to sign in to get out.

The table is created by hand, not at import. `CREATE TABLE IF NOT EXISTS` on a
new table is cheap, but running DDL on every worker start is how the statement
timeouts of 2026-07-31 happened; startup code has no business touching schema.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os

from sqlalchemy import text

logger = logging.getLogger(__name__)

# Its own salt, so a leaked unsubscribe link can never be replayed as a session
# token even though both are signed with the same secret.
_SALT = b"luxquant-email-unsubscribe-v1"

PUBLIC_BASE = os.getenv("PUBLIC_BASE_URL", "https://luxquant.tw")

# Addresses minted for Telegram/Discord sign-ins are not mailboxes. Nothing
# sent to them is delivered, and the bounces are what cost a young sending
# domain its reputation.
SYNTHETIC_DOMAINS = ("@telegram.luxquant.tw", "@discord.luxquant.tw")


def _secret() -> bytes:
    return (os.getenv("JWT_SECRET_KEY") or "luxquant-secret-key-change-in-production-123").encode()


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def deliverable(email: str | None) -> bool:
    """A real mailbox we are willing to write to."""
    if not email or "@" not in email:
        return False
    return not email.lower().endswith(SYNTHETIC_DOMAINS)


def make_token(email: str) -> str:
    """`<address>.<signature>` — the address travels in the link so the
    endpoint needs no lookup table, and the signature is what stops anyone
    unsubscribing somebody else by editing the URL."""
    e = email.strip().lower()
    sig = hmac.new(_secret(), _SALT + e.encode(), hashlib.sha256).digest()[:16]
    return f"{_b64(e.encode())}.{_b64(sig)}"


def read_token(token: str) -> str | None:
    """The address a token vouches for, or None if it does not verify."""
    try:
        body, sig = token.split(".", 1)
        email = _unb64(body).decode().strip().lower()
        expect = hmac.new(_secret(), _SALT + email.encode(), hashlib.sha256).digest()[:16]
        if not hmac.compare_digest(_unb64(sig), expect):
            return None
        return email if "@" in email else None
    except Exception:
        return None


def unsubscribe_url(email: str) -> str:
    return f"{PUBLIC_BASE}/api/v1/email/unsubscribe?t={make_token(email)}"


def is_suppressed(db, email: str) -> bool:
    if not email:
        return True
    try:
        row = db.execute(
            text("SELECT 1 FROM email_suppressions WHERE email = :e"),
            {"e": email.strip().lower()},
        ).first()
        return row is not None
    except Exception as e:
        # A suppression list we cannot read is not permission to mail. Failing
        # closed costs a delayed reminder; failing open mails someone who asked
        # us to stop, which is the one mistake with no way back.
        logger.warning("suppression check failed for %s: %s", email, type(e).__name__)
        return True


def suppress(db, email: str, reason: str = "unsubscribed") -> bool:
    try:
        db.execute(
            text("""
                INSERT INTO email_suppressions (email, reason)
                VALUES (:e, :r)
                ON CONFLICT (email) DO NOTHING
            """),
            {"e": email.strip().lower(), "r": reason[:60]},
        )
        db.commit()
        return True
    except Exception as e:
        logger.warning("suppress failed for %s: %s", email, type(e).__name__)
        db.rollback()
        return False


DDL = """
CREATE TABLE IF NOT EXISTS email_suppressions (
    email      TEXT PRIMARY KEY,
    reason     TEXT NOT NULL DEFAULT 'unsubscribed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
"""
