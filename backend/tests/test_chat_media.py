from pathlib import Path

from app.services import chat_media


def test_delete_chat_image_stays_inside_media_root(tmp_path, monkeypatch):
    monkeypatch.setattr(chat_media, "CHAT_IMAGES_DIR", Path(tmp_path))
    image = tmp_path / "abc.png"
    image.write_bytes(b"png")

    assert chat_media.delete_chat_image("/api/v1/chat-images/abc.png") is True
    assert not image.exists()
    assert chat_media.delete_chat_image("/api/v1/chat-images/../secret") is False
    assert chat_media.delete_chat_image("https://elsewhere/image.png") is False


def test_delete_chat_image_is_idempotent(tmp_path, monkeypatch):
    monkeypatch.setattr(chat_media, "CHAT_IMAGES_DIR", Path(tmp_path))
    assert chat_media.delete_chat_image("/api/v1/chat-images/missing.png") is False
