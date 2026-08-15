from datetime import datetime, timedelta, timezone

from app.services import autotrade_monitor
from app.services.autotrade_monitor import (
    _attach_live_marks,
    _canon_symbol,
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


def test_canon_symbol_matches_bingx_hyphen_tickers():
    assert _canon_symbol("BAT-USDT") == "BATUSDT"
    assert _canon_symbol("BATUSDT") == "BATUSDT"


def test_attach_live_marks_prices_bingx_from_public_book(monkeypatch):
    monkeypatch.setattr(
        autotrade_monitor,
        "_last_prices",
        lambda venue: {"BATUSDT": 0.05854} if venue == "bingx" else {},
    )
    rows = [
        {
            "symbol": "BATUSDT",
            "exchange": "bingx",
            "venue": "bingx",
            "side": "BUY",
            "quantity": 1000,
            "entry_price": 0.058,
        }
    ]
    live = _attach_live_marks(rows)
    assert live["priced"] == 1
    assert rows[0]["mark_price"] == 0.05854
    assert rows[0]["unrealized_pnl"] == 0.54


def test_last_prices_does_not_cache_an_empty_book(monkeypatch):
    autotrade_monitor._price_books.clear()
    calls = {"n": 0}

    def boom(venue):
        calls["n"] += 1
        raise RuntimeError("timeout")

    monkeypatch.setattr(autotrade_monitor, "_fetch_venue_book", boom)
    assert autotrade_monitor._last_prices("bingx") == {}
    assert autotrade_monitor._last_prices("bingx") == {}
    assert calls["n"] == 2
    autotrade_monitor._price_books.clear()
