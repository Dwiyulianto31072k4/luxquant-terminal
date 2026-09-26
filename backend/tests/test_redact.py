"""Credentials never reach a log line (the Coinalyze key did, on every 429)."""
import asyncio

import httpx

from app.core.redact import redact
from app.services import coinalyze_service


def test_query_secrets_are_masked_and_the_rest_survives():
    msg = ("Client error '429 Too Many Requests' for url "
           "'https://api.coinalyze.net/v1/liquidation-history?symbols=A%2CB&api_key=abc123&from=1'")
    out = redact(msg)
    assert "abc123" not in out
    assert "api_key=***" in out and "symbols=A%2CB" in out and "&from=1'" in out


def test_other_providers_param_names():
    for url, secret in [
        ("https://api.etherscan.io/api?module=proxy&apikey=ETHKEY9", "ETHKEY9"),
        ("https://bitcoin-data.com/v1/x?token=BGTOKEN7&day=1", "BGTOKEN7"),
        ("https://x.example/?access_key=AK1&key=K2", "AK1"),
    ]:
        assert secret not in redact(url)


def test_telegram_bot_tokens_are_masked():
    tok = "1234567890:" + "A" * 35
    assert tok not in redact(f"https://api.telegram.org/bot{tok}/sendMessage")


def test_words_that_merely_contain_key_are_left_alone():
    assert redact("monkey=banana and keyboard") == "monkey=banana and keyboard"


def test_coinalyze_sends_the_key_as_a_header_not_in_the_url(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["header"] = request.headers.get("api_key")
        return httpx.Response(200, json=[])

    real = httpx.AsyncClient

    def client(*a, **k):
        k["transport"] = httpx.MockTransport(handler)
        return real(*a, **k)

    monkeypatch.setattr(coinalyze_service, "API_KEY", "SECRET-KEY")
    monkeypatch.setattr(coinalyze_service.httpx, "AsyncClient", client)
    asyncio.run(coinalyze_service._fetch_liq_batch(["BTCUSDT_PERP.A"], 1, 2))
    assert "SECRET-KEY" not in seen["url"]
    assert seen["header"] == "SECRET-KEY"
