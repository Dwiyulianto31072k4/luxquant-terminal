"""The token-flow refresh records what happened, so a credit outage is visible.

On 25 Sep every refresh got HTTP 402 while API Health stayed green.
"""
from types import SimpleNamespace

from app.services.dune_tokenflow_service import refresh_status


def test_success_moves_last_ok():
    s = refresh_status(True, None, {"last_ok_at": 100}, 500)
    assert s == {"ok": True, "at": 500, "last_ok_at": 500}


def test_402_is_recorded_and_last_ok_is_kept():
    err = Exception("Payment Required")
    err.response = SimpleNamespace(status_code=402)
    s = refresh_status(False, err, {"last_ok_at": 100}, 500)
    assert s["ok"] is False and s["http"] == 402 and s["error"] == "HTTP 402"
    assert s["last_ok_at"] == 100


def test_empty_result_is_not_success():
    s = refresh_status(False, None, None, 500)
    assert s["ok"] is False and s["error"] == "no rows returned" and s["last_ok_at"] is None


def test_worker_stays_off_unless_enabled(monkeypatch):
    """Switched off 26 Sep 2026: no Dune call unless DUNE_TOKENFLOW_ENABLED is set."""
    import asyncio

    from app.services import dune_tokenflow_service as svc

    started = []
    monkeypatch.setattr(svc, "ENABLED", False)
    monkeypatch.setattr(svc, "API_KEY", "k")
    monkeypatch.setattr(svc, "QUERY_ID", "1")
    monkeypatch.setattr(asyncio, "get_event_loop", lambda: SimpleNamespace(create_task=started.append))
    svc.start_token_flow_worker()
    assert started == []

    monkeypatch.setattr(svc, "ENABLED", True)
    monkeypatch.setattr(svc, "token_flow_loop", lambda: "loop")
    svc.start_token_flow_worker()
    assert started == ["loop"]


def test_api_health_reports_off_without_calling_dune(monkeypatch):
    import asyncio

    from app.services import api_health
    from app.services import dune_tokenflow_service as svc

    monkeypatch.setattr(svc, "ENABLED", False)

    class NoCalls:
        async def get(self, *a, **k):
            raise AssertionError("Dune must not be called while switched off")

    res = asyncio.run(api_health._probe_dune(NoCalls(), {"DUNEAPIKEY_TERMINAL": "k"}))
    assert res.status == api_health.OFF
    assert "DUNE_TOKENFLOW_ENABLED" in res.detail
