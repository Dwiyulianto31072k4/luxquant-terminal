"""The watchlist must accept every pair we call.

The regex demanded 2+ Latin characters and refused 20 called pairs: 13 users
pressed "add" and were told "Invalid symbol".
"""
from app.api.routes.coin_watch import _SYMBOL_RX, normalize_symbol


def _ok(raw):
    return bool(_SYMBOL_RX.match(normalize_symbol(raw)))


def test_pairs_we_call_are_accepted():
    for raw in ("4", "q", "HUSDT", "s", "币安人生", "我踏马来了USDT", "龙虾", "btc", "BTC/USDT", "1000pepe"):
        assert _ok(raw), raw


def test_junk_is_still_refused():
    for raw in ("", "USDT", "btc_usdt", "BTC!", "BTC.USDT", "$$$", "a" * 21):
        assert not _ok(raw), raw
