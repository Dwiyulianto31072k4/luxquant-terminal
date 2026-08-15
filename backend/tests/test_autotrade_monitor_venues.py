from datetime import datetime, timedelta, timezone

from app.services.autotrade_monitor import (
    _canon_venue,
    _extract_error_code,
    _health,
    _merge_venues,
    _venue_totals,
)


def test_canon_venue_collapses_binance_market_suffixes():
    assert _canon_venue("binance") == "binance"
    assert _canon_venue("binance_spot") == "binance"
    assert _canon_venue("binance_futures") == "binance"
    assert _canon_venue("BingX") == "bingx"
    assert _canon_venue("okx") == "okx"


def test_health_copy_is_not_binance_only():
    status, reasons = _health(
        {
            "has_account": True,
            "is_active": True,
            "key_status": "invalid",
            "venues": [{"exchange": "bingx", "key_status": "invalid"}],
            "stuck_positions": 0,
            "recent_errors": 0,
        }
    )
    assert status == "error"
    assert "bingx" in reasons[0].lower()
    assert "Binance" not in reasons[0]

    status, reasons = _health({"has_account": False})
    assert status == "unlinked"
    assert "Binance" not in reasons[0]


def test_merge_venues_and_totals_count_each_desk():
    row = {
        "accounts": [
            {"exchange": "binance_futures", "key_status": "valid"},
            {"exchange": "bingx", "key_status": "invalid"},
        ],
        "configs": [
            {
                "exchange": "binance",
                "is_active": True,
                "dry_run": False,
                "spot_enabled": False,
                "futures_enabled": True,
                "leverage": 10,
            },
            {
                "exchange": "bingx",
                "is_active": False,
                "dry_run": True,
                "spot_enabled": False,
                "futures_enabled": True,
                "leverage": 5,
            },
        ],
    }
    venues = _merge_venues(row)
    by_id = {v["exchange"]: v for v in venues}
    assert by_id["binance"]["connected"] is True
    assert by_id["binance"]["dry_run"] is False
    assert by_id["binance"]["is_active"] is True
    assert by_id["bingx"]["key_status"] == "invalid"

    totals = _venue_totals([{"subject": "lq:1", "venues": venues}])
    snap = {v["exchange"]: v for v in totals}
    assert snap["binance"]["connected"] == 1
    assert snap["binance"]["live"] == 1
    assert snap["bingx"]["invalid_keys"] == 1
    assert snap["okx"]["connected"] == 0


def test_health_marks_recovered_errors_as_warning_not_error():
    now = datetime.now(timezone.utc)
    status, reasons = _health(
        {
            "has_account": True,
            "is_active": True,
            "key_status": "valid",
            "venues": [{"exchange": "bingx", "key_status": "valid"}],
            "stuck_positions": 0,
            "recent_errors": 3,
            "last_error_at": now - timedelta(hours=6),
            "last_success_at": now - timedelta(hours=1),
        }
    )
    assert status == "warn"
    assert "recovered" in reasons[0].lower()


def test_extract_error_code_reads_bingx_and_418():
    assert _extract_error_code("BingX 109400 reduceOnly not allowed") == "109400"
    assert _extract_error_code("HTTP 418 Way too many requests") == "418"
