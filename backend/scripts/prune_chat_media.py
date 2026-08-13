"""One-shot Chat image retention sweep. Scheduled by systemd every 15 minutes."""
from app.core.database import SessionLocal
from app.services.chat_media import prune_expired_chat_images


def main() -> None:
    db = SessionLocal()
    try:
        result = prune_expired_chat_images(db, max_age_hours=24)
        print(
            "chat-media-prune "
            f"messages={result['messages_expired']} "
            f"files={result['files_deleted']} "
            f"old_files={result['old_files_swept']}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()

