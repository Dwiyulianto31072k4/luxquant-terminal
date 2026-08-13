"""The chat image upload is the one endpoint any logged-in user can write
files through, so its guards are worth pinning.

Nothing here trusts the bytes. A file is accepted on its extension alone, then
written under a random name and served back by StaticFiles, which derives the
Content-Type from that same extension. That is what makes "a PHP script renamed
to .png" harmless: it is served as an image and never executed. The rules below
are the whole of the trust boundary.
"""
import pytest
from fastapi import HTTPException

from app.api.routes.chat import MAX_IMAGE_BYTES, validate_chat_image

PNG = b"\x89PNG\r\n\x1a\n"
JPG = b"\xff\xd8\xff\xe0"
GIF = b"GIF89a"
WEBP = b"RIFF\x04\x00\x00\x00WEBP"


def _rejects(filename, blob):
    with pytest.raises(HTTPException) as e:
        validate_chat_image(filename, blob)
    return e.value.status_code


def test_the_ordinary_formats_are_accepted():
    for name, blob in (
        ("shot.png", PNG), ("photo.jpg", JPG), ("photo.jpeg", JPG),
        ("pic.webp", WEBP), ("clip.gif", GIF),
    ):
        assert validate_chat_image(name, blob) == "." + name.split(".")[-1]


def test_the_extension_is_matched_case_insensitively():
    """Phone cameras hand back .JPG, and rejecting those would look like a bug."""
    assert validate_chat_image("IMG_0042.JPG", JPG) == ".jpg"


def test_svg_is_refused():
    """The dangerous one: SVG can carry script, and we serve it from our own
    origin, so an accepted upload would be stored XSS."""
    assert _rejects("payload.svg", PNG) == 400


def test_non_images_are_refused():
    for name in ("shell.php", "run.html", "notes.pdf", "archive.zip"):
        assert _rejects(name, PNG) == 400


def test_a_missing_or_extensionless_name_is_refused():
    assert _rejects(None, PNG) == 400
    assert _rejects("screenshot", PNG) == 400


def test_a_double_extension_is_judged_on_the_last_one():
    """'evil.php.png' is stored as a png and served as a png — accepted.
    'evil.png.php' is not an image and must not be."""
    assert validate_chat_image("evil.php.png", PNG) == ".png"
    assert _rejects("evil.png.php", PNG) == 400


def test_extension_must_match_file_signature():
    assert _rejects("disguised.png", b"<html><script>alert(1)</script>") == 400
    assert _rejects("wrong.jpg", PNG) == 400


def test_an_oversize_file_is_refused():
    assert _rejects("big.png", b"x" * (MAX_IMAGE_BYTES + 1)) == 413


def test_a_file_exactly_at_the_cap_is_accepted():
    """The handler reads MAX+1 bytes, so the boundary has to be right or every
    8 MB upload fails."""
    assert validate_chat_image("big.png", PNG + b"x" * (MAX_IMAGE_BYTES - len(PNG))) == ".png"


def test_an_empty_file_is_refused():
    """An empty upload would otherwise store a 0-byte file and render as a
    broken image in the thread forever."""
    assert _rejects("empty.png", b"") == 400
