"""Hunt full TP runner selection + outcome mix — no DB."""
from app.services.hunt_recipe import (
    CONFOUND_TAGS,
    is_runner_tag,
    mix_delta,
    outcome_mix,
    select_runner_tags,
)


def test_outcome_mix_production_union_fixture():
    # Production union 2026-03-10 → 2026-08-27, top-4 runner tags.
    m = outcome_mix(n=3717, sl=319, tp1=407, tp2=950, tp3=865, tp4=1176)
    assert m["n"] == 3717
    assert m["counts"]["sl"] + m["counts"]["tp1"] + m["counts"]["tp2"] + m["counts"]["tp3"] + m["counts"]["tp4"] == 3717
    assert m["final_pct"]["sl"] == 8.58
    assert m["final_pct"]["tp1"] == 10.95
    assert m["final_pct"]["tp2"] == 25.56
    assert m["final_pct"]["tp3"] == 23.27
    assert m["final_pct"]["tp4"] == 31.64
    assert m["win_rate"] == 91.42
    assert m["full_tp_rate"] == 54.91
    assert m["reached_pct"]["tp2"] == 80.47
    assert m["reached_pct"]["tp4"] == 31.64


def test_outcome_mix_empty():
    m = outcome_mix(0, 0, 0, 0, 0, 0)
    assert m["n"] == 0
    assert m["win_rate"] is None
    assert m["final_pct"]["sl"] is None


def test_mix_delta_vs_all_calls():
    hunt = outcome_mix(3717, 319, 407, 950, 865, 1176)
    base = outcome_mix(15967, 2199, 2164, 4435, 3438, 3731)
    d = mix_delta(hunt, base)
    assert d["win_pp"] == 5.19
    assert d["full_tp_pp"] == 10.01
    assert d["final_pp"]["sl"] == -5.19
    assert d["final_pp"]["tp4"] == 8.27


def test_confound_never_a_runner():
    for tag in CONFOUND_TAGS:
        assert not is_runner_tag({
            "tag": tag,
            "n": 2000,
            "win_rate": 99,
            "full_tp_rate": 80,
            "tp4_rate": 50,
            "median_peak_wins": 40,
        })


def test_select_runner_tags_ranks_full_tp_and_caps():
    tags = [
        {"tag": "A", "n": 200, "win_rate": 80, "full_tp_rate": 20, "tp4_rate": 6, "median_peak_wins": 10},
        {"tag": "B", "n": 200, "win_rate": 90, "full_tp_rate": 50, "tp4_rate": 20, "median_peak_wins": 22},
        {"tag": "LATE_ENTRY", "n": 2000, "win_rate": 90, "full_tp_rate": 90, "tp4_rate": 40, "median_peak_wins": 40},
        {"tag": "C", "n": 80, "win_rate": 99, "full_tp_rate": 80, "tp4_rate": 40, "median_peak_wins": 40},
        {"tag": "D", "n": 200, "win_rate": 70, "full_tp_rate": 40, "tp4_rate": 20, "median_peak_wins": 20},
        {"tag": "E", "n": 200, "win_rate": 85, "full_tp_rate": 40, "tp4_rate": 10, "median_peak_wins": 20},
        {"tag": "F", "n": 200, "win_rate": 85, "full_tp_rate": 30, "tp4_rate": 10, "median_peak_wins": 20},
        {"tag": "G", "n": 200, "win_rate": 85, "full_tp_rate": 25, "tp4_rate": 10, "median_peak_wins": 20},
    ]
    picked = [t["tag"] for t in select_runner_tags(tags, top_k=4)]
    assert picked == ["B", "E", "F", "G"]
    assert "LATE_ENTRY" not in picked
    assert "C" not in picked  # n < 150
    assert "D" not in picked  # WR < 78
