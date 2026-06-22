# backend/app/services/notifier.py
"""
Notifier — satu pintu untuk membuat notifikasi in-app.
Semua producer (news, market_pulse, signal, dst) memanggil create_notification().

Model BROADCAST: user_id=None -> notif tampil ke semua user, lalu di-filter
saat BACA berdasarkan notification_preferences (in_app per tipe) di notifications.py.
Telegram delivery (Layer 4) membaca preferensi telegram secara terpisah.

Kenapa broadcast (bukan fan-out): event seperti market_pulse bisa puluhan/jam.
Fan-out (1 row per user) akan meledakkan tabel notifications. Broadcast = 1 row/event.
"""
from typing import Optional
import json

from sqlalchemy import text
from sqlalchemy.orm import Session


def create_notification(
    db: Session,
    *,
    type: str,
    title: str,
    body: Optional[str] = None,
    data: Optional[dict] = None,
    source_type: Optional[str] = None,
    source_id: Optional[str] = None,
    user_id: Optional[int] = None,
    commit: bool = True,
) -> int:
    """
    Insert satu notifikasi. user_id=None => broadcast ke semua user.
    Return id notif yang baru dibuat.

    Catatan: pakai CAST(:data AS jsonb), bukan ::jsonb, agar tidak bentrok
    dengan named param SQLAlchemy.
    """
    row = db.execute(
        text("""
            INSERT INTO notifications (user_id, type, title, body, data, source_type, source_id)
            VALUES (:user_id, :type, :title, :body, CAST(:data AS jsonb), :source_type, :source_id)
            RETURNING id
        """),
        {
            "user_id": user_id,
            "type": type,
            "title": title,
            "body": body,
            "data": json.dumps(data) if data is not None else None,
            "source_type": source_type,
            "source_id": source_id,
        },
    )
    nid = row.scalar()
    if commit:
        db.commit()
    return nid


def notification_exists(db: Session, *, type: str, source_id: str) -> bool:
    """
    Dedup guard. Cek apakah notif dengan (type, source_id) sudah pernah dibuat.
    Dipakai producer agar 1 event = 1 notif (mis. news pakai hash URL,
    market_pulse pakai 'COIN:window' sebagai source_id).
    """
    found = db.execute(
        text("SELECT 1 FROM notifications WHERE type = :type AND source_id = :sid LIMIT 1"),
        {"type": type, "sid": source_id},
    ).fetchone()
    return found is not None
