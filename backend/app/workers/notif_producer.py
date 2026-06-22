# backend/app/workers/notif_producer.py
"""
Notification Producer Worker (standalone / systemd)
===================================================
Polls `market_pulse` & `crypto_news` -> creates BROADCAST notifications
via app.services.notifier.create_notification().

Stateless: pakai dedup + cooldown query (bukan cursor), jadi aman kalau restart.

Run lokal (test): python -m app.workers.notif_producer --once
Run service:      python -m app.workers.notif_producer
"""
import time
import sys

from sqlalchemy import text, bindparam

from app.core.database import SessionLocal
from app.services.notifier import create_notification


# ════════════════════════════════════════════
# CONFIG — tune di sini
# ════════════════════════════════════════════
POLL_INTERVAL = 60            # detik antar polling

# News
NEWS_WINDOW_MIN = 15          # lihat artikel X menit terakhir
NEWS_TYPES = ["article", "headline"]   # content_type yang layak notif
NEWS_MAX_PER_POLL = 10        # cap agar tidak banjir per siklus

# Market Pulse
PULSE_WINDOW_MIN = 10         # lihat event X menit terakhir
PULSE_PCT_THRESHOLD = 10.0    # |pct_change| minimum untuk notif
PULSE_COOLDOWN_MIN = 60       # maksimal 1 notif per coin per X menit


# ════════════════════════════════════════════
# NEWS PRODUCER
# ════════════════════════════════════════════
def produce_news(db) -> int:
    stmt = text("""
        SELECT n.id, n.title, n.description, n.url, n.domain, n.content_type
        FROM crypto_news n
        WHERE n.created_at > NOW() - make_interval(mins => :win)
          AND n.content_type IN :types
          AND n.title IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM notifications x
              WHERE x.type = 'news' AND x.source_id = CAST(n.id AS text)
          )
        ORDER BY n.created_at ASC
        LIMIT :lim
    """).bindparams(bindparam("types", expanding=True))

    rows = db.execute(stmt, {
        "win": NEWS_WINDOW_MIN,
        "types": NEWS_TYPES,
        "lim": NEWS_MAX_PER_POLL,
    }).fetchall()

    count = 0
    for r in rows:
        nid, title, desc, url, domain, ctype = r
        create_notification(
            db,
            type="news",
            title=(title or "")[:200],
            body=(desc[:280] if desc else None),
            data={"url": url, "domain": domain, "content_type": ctype},
            source_type="news",
            source_id=str(nid),
            commit=False,
        )
        count += 1

    if count:
        db.commit()
    return count


# ════════════════════════════════════════════
# MARKET PULSE PRODUCER
# ════════════════════════════════════════════
def produce_market_pulse(db) -> int:
    # Ambil event paling ekstrem per pair dalam window (yang lolos threshold)
    candidates = db.execute(text("""
        SELECT DISTINCT ON (pair)
            pair, base_symbol, direction, pct_change, event_type, id
        FROM market_pulse
        WHERE created_at > NOW() - make_interval(mins => :win)
          AND ABS(pct_change) >= :thr
        ORDER BY pair, ABS(pct_change) DESC
    """), {"win": PULSE_WINDOW_MIN, "thr": PULSE_PCT_THRESHOLD}).fetchall()

    count = 0
    for r in candidates:
        pair, base, direction, pct, etype, mp_id = r
        pct = pct or 0

        # Cooldown: skip kalau pair ini sudah dapat notif pulse dalam COOLDOWN menit
        recent = db.execute(text("""
            SELECT 1 FROM notifications
            WHERE type = 'market_pulse'
              AND data->>'pair' = :pair
              AND created_at > NOW() - make_interval(mins => :cd)
            LIMIT 1
        """), {"pair": pair, "cd": PULSE_COOLDOWN_MIN}).fetchone()
        if recent:
            continue

        sym = base or (pair or "").replace("USDT", "")
        moved = "surged" if pct > 0 else "dropped"

        create_notification(
            db,
            type="market_pulse",
            title=f"{sym} {moved} {abs(pct):.1f}%",
            body=f"{pair} flagged on Market Pulse ({etype}).",
            data={
                "pair": pair,
                "percentage": round(pct, 2),
                "direction": direction,
                "event_type": etype,
            },
            source_type="market_pulse",
            source_id=f"{pair}:{mp_id}",
            commit=False,
        )
        count += 1

    if count:
        db.commit()
    return count


# ════════════════════════════════════════════
# RUNNER
# ════════════════════════════════════════════
def run_once():
    db = SessionLocal()
    try:
        n = produce_news(db)
        p = produce_market_pulse(db)
        if n or p:
            print(f"[notif_producer] news={n} pulse={p}", flush=True)
    except Exception as e:
        db.rollback()
        print(f"[notif_producer] error: {e}", flush=True)
    finally:
        db.close()


def main():
    print("[notif_producer] started", flush=True)
    while True:
        run_once()
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    if "--once" in sys.argv:
        run_once()
    else:
        main()
