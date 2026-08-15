import os

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

# Per-process connection pool. MUST stay small: many processes import this
# engine (4 API workers + the poller + ~15 luxquant-* worker services), and
# each keeps up to (pool_size + max_overflow) connections against a shared
# Postgres. Old defaults (10 + 20 = 30/process) could blow past
# max_connections=100 under load → "remaining connection slots reserved for
# SUPERUSER" and failed logins. Override per service via env if needed.
_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "5"))
_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "10"))
_POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "10"))
# Postgres idle_session_timeout is 10 minutes. Recycle well under that so a
# pooled connection is never handed out after the server already closed it.
# (pool_pre_ping still catches the rest; recycle just keeps the ping rare.)
_POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "300"))


def engine_kwargs(**overrides):
    """Shared pool flags for every long-lived engine in this process."""
    kw = {
        "pool_pre_ping": True,
        "pool_size": _POOL_SIZE,
        "max_overflow": _MAX_OVERFLOW,
        "pool_timeout": _POOL_TIMEOUT,
        "pool_recycle": _POOL_RECYCLE,
    }
    kw.update(overrides)
    return kw


engine = create_engine(
    settings.DATABASE_URL,
    **engine_kwargs(),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        # Safety net: cap any single web statement so a heavy admin aggregate
        # (or a DB crunch) can never hold a worker long enough to hit gunicorn's
        # 60s WORKER TIMEOUT and cascade into a box-wide stall. Web-only — the
        # poller and background workers use their own sessions, so their long
        # cache-warm queries are unaffected.
        try:
            db.execute(text("SET statement_timeout = '20s'"))
        except Exception:
            pass
        yield db
    finally:
        db.close()


# ── Additive runtime schema guards ─────────────────────────────────────
# Idempotent "ADD COLUMN IF NOT EXISTS" statements so a fresh deploy never
# crashes on a not-yet-migrated column. Postgres only; wrapped so a DB that
# is momentarily unavailable at import just logs and moves on. Keep these in
# sync with the corresponding database/migration-*.sql files.
_RUNTIME_COLUMN_GUARDS = [
    (
        "users",
        "telegram_bot_started_at",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_bot_started_at TIMESTAMPTZ NULL",
    ),
]


def ensure_runtime_columns():
    """Add any column a fresh deploy might be missing, without freezing the table.

    `ADD COLUMN IF NOT EXISTS` still takes an ACCESS EXCLUSIVE lock even when
    the column is already there, and this runs at import — so every gunicorn
    worker recycle, background worker and CLI invocation locked `users` against
    all readers. Postgres lock queues are FIFO, so whenever that ALTER landed
    behind a slow transaction, every plain `SELECT ... WHERE id = %s` queued
    behind the ALTER and burned the 20s statement timeout above. That is the
    source of the 3,087 timeouts recorded over 14 days.

    Checking `information_schema` first costs one lock-free SELECT and skips the
    DDL entirely in the normal case, which is every case except an un-migrated
    database.
    """
    try:
        with engine.begin() as conn:
            for table, column, ddl in _RUNTIME_COLUMN_GUARDS:
                already_present = conn.execute(
                    text(
                        "SELECT 1 FROM information_schema.columns "
                        "WHERE table_schema = current_schema() "
                        "AND table_name = :table AND column_name = :column"
                    ),
                    {"table": table, "column": column},
                ).first()
                if already_present:
                    continue
                # Only reached on a genuinely un-migrated database. Give up fast
                # rather than wait: an ALTER sitting in the lock queue blocks
                # every reader behind it, which is far worse than the column
                # being absent for one more process start.
                conn.exec_driver_sql("SET lock_timeout = '3s'")
                conn.exec_driver_sql(ddl)
    except Exception as e:  # pragma: no cover - best-effort, never fatal
        import logging
        logging.getLogger(__name__).warning("ensure_runtime_columns skipped: %s", e)


# Run once at import so the column exists before any query touches it.
ensure_runtime_columns()