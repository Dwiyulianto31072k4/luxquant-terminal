"""Agent exchange waitlist — Bitget / BingX demand, before those venues execute.

Kept on the LuxQuant side (not Cryptobot) so we can count interest without
touching encrypted API keys. Table is created on first use so a missed
migration cannot 500 the Agent page.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_admin_user, get_current_user
from app.core.database import get_db
from app.models.user import User

router = APIRouter(prefix="/agent", tags=["agent"])

ALLOWED = ("bitget", "bingx")


def _ensure(db: Session) -> None:
    db.execute(
        text(
            """
            CREATE TABLE IF NOT EXISTS agent_exchange_waitlist (
                id          SERIAL PRIMARY KEY,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                exchange    VARCHAR(20) NOT NULL,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (user_id, exchange)
            )
            """
        )
    )
    db.execute(
        text(
            "CREATE INDEX IF NOT EXISTS idx_agent_waitlist_exchange "
            "ON agent_exchange_waitlist (exchange, created_at DESC)"
        )
    )
    db.commit()


class JoinBody(BaseModel):
    exchange: str = Field(min_length=3, max_length=20)


@router.get("/exchange-waitlist")
def my_waitlist(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure(db)
    rows = db.execute(
        text(
            "SELECT exchange, created_at FROM agent_exchange_waitlist "
            "WHERE user_id = :uid ORDER BY created_at"
        ),
        {"uid": user.id},
    ).mappings().all()
    return {
        "items": [
            {"exchange": r["exchange"], "created_at": r["created_at"].isoformat() if r["created_at"] else None}
            for r in rows
        ]
    }


@router.post("/exchange-waitlist")
def join_waitlist(
    body: JoinBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exchange = body.exchange.strip().lower()
    if exchange not in ALLOWED:
        raise HTTPException(status_code=422, detail="exchange must be bitget or bingx")
    if not user.has_active_access:
        raise HTTPException(status_code=403, detail="Active subscription required")
    _ensure(db)
    db.execute(
        text(
            "INSERT INTO agent_exchange_waitlist (user_id, exchange, created_at) "
            "VALUES (:uid, :ex, :at) "
            "ON CONFLICT (user_id, exchange) DO NOTHING"
        ),
        {"uid": user.id, "ex": exchange, "at": datetime.now(timezone.utc)},
    )
    db.commit()
    return {"ok": True, "exchange": exchange}


@router.get("/admin/exchange-waitlist")
def admin_waitlist(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    _ensure(db)
    counts = db.execute(
        text(
            "SELECT exchange, count(*)::int AS n FROM agent_exchange_waitlist "
            "GROUP BY exchange ORDER BY n DESC"
        )
    ).mappings().all()
    recent = db.execute(
        text(
            """
            SELECT w.exchange, w.created_at, u.id AS user_id, u.email, u.username
            FROM agent_exchange_waitlist w
            JOIN users u ON u.id = w.user_id
            ORDER BY w.created_at DESC
            LIMIT 40
            """
        )
    ).mappings().all()
    return {
        "counts": {r["exchange"]: r["n"] for r in counts},
        "recent": [
            {
                "exchange": r["exchange"],
                "user_id": r["user_id"],
                "email": r["email"],
                "username": r["username"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in recent
        ],
    }
