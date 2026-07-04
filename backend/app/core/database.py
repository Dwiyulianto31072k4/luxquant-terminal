from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
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