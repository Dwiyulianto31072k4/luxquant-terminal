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
    assert any("_cache_outcomes" in w for w in where)
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


def test_updated_and_aggregate_statuses_use_recorded_outcomes():
    where, params = _build_conditions({"status": ["updated", "tp2_plus"]})
    assert set(params["statuses"]) == {"tp2", "tp3", "tp4"}
    assert any("_cache_last_updates" in w and " OR " in w for w in where)


def test_multi_pairs_risks_and_enrichment_rules_survive():
    where, params = _build_conditions({"pairs": ["BTC", "ETH"], "risk_level": ["low", "normal"], "rating": ["A", "B"], "direction": ["long"], "min_confidence": 80, "smc_golden": True})
    assert params["pairs"] == ["BTCUSDT", "ETHUSDT"]
    assert params["risks"] == ["low", "normal"]
    assert params["ratings"] == ["A", "B"]
    assert params["min_conf"] == 80
    assert any("smc_golden_setup" in w for w in where)


def test_runner_gate_does_not_replace_custom_tag_match_mode():
    where, params = _build_conditions({"tags":["CUSTOM"],"tag_match":"all","_runner_tags":["RUNNER_A","RUNNER_B"]})
    assert params["tags"] == ["CUSTOM"]
    assert params["tag_total"] == 1
    assert params["runner_tags"] == ["RUNNER_A","RUNNER_B"]
    assert any(":runner_tags" in w and "> 0" in w for w in where)


def test_market_cap_keeps_missing_unknown_instead_of_zero():
    where,params = _build_conditions({"min_mcap":50e6,"max_mcap":300e6})
    assert all("ELSE NULL" in w and "::numeric" in w for w in where)
    assert params == {"min_mcap":50e6,"max_mcap":300e6}
