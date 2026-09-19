from app.api.routes.edge_lab import runner_dashboard

# [day, runner, top, hit_tags, outcome, h1, h2, h3, h4, hsl]
ROWS = [
    ["2026-09-01", False, False, [], "sl", None, None, None, None, 5.0],
    ["2026-09-01", True, True, ["VOL_CLIMAX"], "tp4", 1.0, 2.0, 3.0, 9.0, None],
    ["2026-09-08", True, False, ["RSI_OVERBOUGHT_H1"], "tp1", 2.0, None, None, None, None],
    ["2026-09-15", True, False, ["RSI_OVERBOUGHT_H1"], None, None, None, None, None, None],  # open
    ["2026-09-15", False, False, [], "tp3", 4.0, 5.0, 6.0, None, None],
]


def test_groups_count_finished_and_open_apart():
    d = runner_dashboard(ROWS, 0, ["VOL_CLIMAX", "RSI_OVERBOUGHT_H1"])
    g = d["groups"]
    assert g["every"] == {"n": 4, "open": 1, "sl": 1, "tp1": 1, "tp2": 0, "tp3": 1, "tp4": 1}
    assert g["runner"]["n"] == 2 and g["runner"]["open"] == 1
    assert g["top"] == {"n": 1, "open": 0, "sl": 0, "tp1": 0, "tp2": 0, "tp3": 0, "tp4": 1}
    assert g["rest"]["n"] == 1 and g["rest"]["tp1"] == 1


def test_window_is_by_decision_day_ending_at_the_last_day():
    d = runner_dashboard(ROWS, 7, [])
    assert (d["first_day"], d["last_day"]) == ("2026-09-09", "2026-09-15")
    assert d["groups"]["every"]["n"] == 1 and d["groups"]["every"]["open"] == 1
    # The weekly trend keeps the whole history regardless of the window.
    assert [w["week"] for w in d["weekly"]] == ["2026-08-31", "2026-09-07", "2026-09-14"]


def test_series_points_and_speed_medians():
    d = runner_dashboard(ROWS, 0, ["RSI_OVERBOUGHT_H1"])
    day1 = d["series"][0]
    assert day1["day"] == "2026-09-01" and day1["every"] == [2, 1, 1, 1]
    assert day1["runners"] == 1 and day1["tops"] == 1 and day1["decided"] == 2
    assert d["speed"]["every"]["tp1"] == 2.0  # median of 1, 2, 4
    assert d["speed"]["every"]["sl"] == 5.0
    assert d["speed"]["top"]["tp4"] == 9.0
    assert d["tags"] == [{"tag": "RSI_OVERBOUGHT_H1",
                          "counts": {"n": 1, "open": 1, "sl": 0, "tp1": 1, "tp2": 0, "tp3": 0, "tp4": 0}}]


def test_nothing_to_show():
    assert runner_dashboard([], 30, []) is None
