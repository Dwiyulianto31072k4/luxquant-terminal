"""Conditional GETs: an unchanged payload must come back as 304 with no body."""
from app.core.http_cache import cached_json


class Req:
    def __init__(self, inm=None):
        self.headers = {"if-none-match": inm} if inm else {}


def test_version_path_sets_etag_and_private_cache():
    r = cached_json(Req(), {"a": 1}, version="v1", max_age=60)
    assert r.status_code == 200
    assert r.headers["etag"].startswith('W/"')
    assert "private" in r.headers["cache-control"] and "max-age=60" in r.headers["cache-control"]
    # Per-account bodies must never be cached by a shared cache under one key.
    assert "Authorization" in r.headers["vary"]


def test_matching_etag_returns_304_without_a_body():
    etag = cached_json(Req(), {"a": 1}, version="v1").headers["etag"]
    again = cached_json(Req(etag), {"a": 1}, version="v1")
    assert again.status_code == 304
    assert not again.body


def test_a_changed_version_invalidates():
    first = cached_json(Req(), {"a": 1}, version="v1").headers["etag"]
    second = cached_json(Req(first), {"a": 2}, version="v2")
    assert second.status_code == 200


def test_without_a_version_the_body_decides():
    e1 = cached_json(Req(), {"a": 1}).headers["etag"]
    assert cached_json(Req(e1), {"a": 1}).status_code == 304
    assert cached_json(Req(e1), {"a": 2}).status_code == 200
