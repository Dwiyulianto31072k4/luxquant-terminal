"""Conditional responses for the read endpoints the app polls.

Every API response went out with no validator and no cache directive, so a
second tab, a refresh or a 90-second poll paid full price again — /signals/
coin-intel alone shipped 1.63 GB in fourteen hours, 817 KB at a time, of data
that had not changed since the previous poll.

`cached_json` adds the two things that fix that: an ETag so an unchanged
payload comes back as a 304 with no body, and a short private max-age so a
reload inside that window does not leave the browser at all.

The ETag is built from a cheap `version` (the payload's own computed_at, a
cache timestamp) rather than by hashing megabytes, so a 304 costs nothing on
the server either. `private` because these bodies are per-account: Cloudflare
must never hold one and hand it to someone else.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse, Response


def _etag(version: Any) -> str:
    return 'W/"' + hashlib.md5(str(version).encode("utf-8")).hexdigest()[:20] + '"'


def cached_json(request: Request, payload: Any, *, version: Any = None, max_age: int = 60,
                stale_while_revalidate: int | None = None) -> Response:
    """Return `payload` as JSON with an ETag, or 304 when the client has it.

    Pass `version` when the payload carries its own — a cache's computed_at —
    and a 304 then costs one hash of a short string instead of serialising
    megabytes. Without it the body itself is hashed, which is correct for any
    payload and cheap enough below a megabyte.
    """
    swr = stale_while_revalidate if stale_while_revalidate is not None else max_age * 5
    headers = {
        "Cache-Control": f"private, max-age={max_age}, stale-while-revalidate={swr}",
        "Vary": "Authorization, Accept-Encoding",
    }
    matches = [t.strip() for t in request.headers.get("if-none-match", "").split(",") if t.strip()]

    if version is not None:
        etag = _etag(version)
        headers["ETag"] = etag
        if etag in matches:
            return Response(status_code=304, headers=headers)
        return JSONResponse(content=jsonable(payload), headers=headers)

    body = json.dumps(jsonable(payload), separators=(",", ":"), default=str).encode("utf-8")
    etag = _etag(hashlib.md5(body).hexdigest())
    headers["ETag"] = etag
    if etag in matches:
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)


def jsonable(payload: Any) -> Any:
    """FastAPI's encoder is slow on 500-coin payloads; these are plain data."""
    try:
        json.dumps(payload)
        return payload
    except TypeError:
        from fastapi.encoders import jsonable_encoder

        return jsonable_encoder(payload)
