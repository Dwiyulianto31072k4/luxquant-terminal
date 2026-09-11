from app.services.signal_filter_alerts import _build_conditions, _describe


def test_empty_criteria_matches_nothing_on_purpose():
    where, params = _build_conditions({})
    assert where == []
    assert params == {}


def test_tags_any_and_status():
    where, params = _build_conditions(
        {"tags": ["VOL_CLIMAX"], "tag_match": "any", "status": ["open"]}
    )
    assert any("important" in w for w in where)
    assert "lower(s.status) = ANY(:statuses)" in where
    assert params["tags"] == ["VOL_CLIMAX"]
    assert params["statuses"] == ["open"]


def test_describe():
    s = _describe({"tags": ["VOL_CLIMAX", "RSI_OVERBOUGHT_H1"], "risk_level": ["normal"]})
    assert "VOL_CLIMAX" in s
    assert "risk normal" in s


def test_size_and_btc_keys_compile():
    where, params = _build_conditions(
        {
            "max_volume_rank": 40,
            "min_sl_pct": 1,
            "max_sl_pct": 3,
            "btc_decoupled": True,
            "min_btc_align": 70,
            "exclude_confound": True,
        }
    )
    assert params["max_vol_rank"] == 40
    assert params["min_sl_pct"] == 1
    assert any("is_decoupled" in w for w in where)
    assert "exclude_tags" in params
