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
