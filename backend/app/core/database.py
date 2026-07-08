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

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=_POOL_SIZE,
    max_overflow=_MAX_OVERFLOW,
    pool_timeout=_POOL_TIMEOUT,   # wait at most N s for a free connection, then error (don't hang)
    pool_recycle=1800,
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
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_bot_started_at TIMESTAMPTZ NULL",
]


def ensure_runtime_columns():
    try:
        with engine.begin() as conn:
            for stmt in _RUNTIME_COLUMN_GUARDS:
                conn.exec_driver_sql(stmt)
    except Exception as e:  # pragma: no cover - best-effort, never fatal
        import logging
        logging.getLogger(__name__).warning("ensure_runtime_columns skipped: %s", e)


# Run once at import so the column exists before any query touches it.
ensure_runtime_columns()