"""Synthetic-only tests for the native-rate SkillCorner bridge."""
from copy import deepcopy
from dataclasses import fields, replace
import math

import pytest
import numpy as np

from benchmark import skillcorner_adapter as sc


def metadata():
    return {
        "id": 7, "home_team": {"id": 10}, "away_team": {"id": 20},
        "home_team_side": ["left_to_right", "right_to_left"],
        "pitch_length": 105, "pitch_width": 68,
        "match_periods": [
            {"period": 1, "start_frame": 0, "end_frame": 5},
            {"period": 2, "start_frame": 8, "end_frame": 13},
        ],
        # Away is listed first: slot order must never define home.
        "players": [{"id": 200, "team_id": 20},
                    {"id": 100, "team_id": 10}],
    }


def frames():
    rows = []
    for frame in range(14):
        period = 1 if frame <= 5 else 2 if frame >= 8 else None
        if period is None:
            rows.append({"frame": frame, "period": None, "timestamp": None,
                         "ball_data": {"x": None, "y": None, "is_detected": None},
                         "player_data": [], "possession": {"group": None, "player_id": None}})
            continue
        seconds = frame / 10 if period == 1 else 2700 + (frame - 8) / 10
        hour = int(seconds // 3600)
        minute = int(seconds // 60) % 60
        second = int(seconds) % 60
        centisecond = round((seconds - int(seconds)) * 100)
        timestamp = f"{hour:02d}:{minute:02d}:{second:02d}.{centisecond:02d}"
        home_x, away_x = (0, 10) if period == 1 else (10, 0)
        rows.append({
            "frame": frame, "period": period, "timestamp": timestamp,
            "ball_data": {"x": 0, "y": 0, "z": 0, "is_detected": True},
            "player_data": [
                {"player_id": 200, "x": away_x, "y": 0, "is_detected": True},
                {"player_id": 100, "x": home_x, "y": 0, "is_detected": True},
            ],
            "possession": {"group": "home team" if period == 1 else "away team",
                           "player_id": 100 if period == 1 else 200},
        })
    return rows


def phases():
    return [
        {"match_id": "7", "period": "1", "frame_start": "0",
         "frame_end": "10", "team_in_possession_id": "10"},
        {"match_id": "7", "period": "2", "frame_start": "8",
         "frame_end": "14", "team_in_possession_id": "20"},
    ]


def test_team_mapping_coordinates_periods_and_predictions():
    item = sc.adapt_tracking(metadata(), frames())
    assert item.frame_ids == tuple(range(14))
    assert item.segments == ((0, 6), (8, 14))
    assert item.timestamps_s[0] == 0
    assert item.timestamps_s[8] == 2700
    assert item.home_team_side == ("left_to_right", "right_to_left")
    assert item.tracking.ball_x[0] == 52.5
    assert item.tracking.ball_y[0] == 34
    assert item.tracking.ball_x[8] == 52.5  # no attack-direction flip
    assert item.tracking.home[0] == 0
    assert item.tracking.away[0] == 10
    assert item.tracking.home[8] == 10
    assert item.tracking.away[8] == 0
    assert "".join(sc.predict(item)) == "HHHHHHXXAAAAAA"


def test_external_config_preserves_physical_durations_without_mutating_defaults():
    config = sc.rate_adapted_config()
    assert config.fps == 10
    assert config.params.confirm_frames == 4
    assert config.params.max_gap_frames == 100
    assert config.game.out_confirm_frames == 2
    assert config.game.restart_still_frames == 2
    assert config.game.restart_speed_mps == 4.0
    assert sc.ps.DEFAULTS.confirm_frames == 10
    assert sc.ps.DEFAULTS.max_gap_frames == 250
    with pytest.raises(ValueError, match="native 10 fps"):
        sc.rate_adapted_config(25)


def test_speed_uses_only_consecutive_detected_ball_in_same_period():
    rows = frames()
    rows[1]["ball_data"]["x"] = 0.1
    rows[2]["ball_data"] = {"x": 100, "y": 0, "is_detected": False}
    rows[3]["ball_data"]["x"] = 10
    rows[4]["ball_data"]["x"] = 10.1
    rows[5]["ball_data"]["x"] = 10.2
    item = sc.adapt_tracking(metadata(), rows)
    assert item.tracking.ball_speed[1] == pytest.approx(1.0)
    assert math.isnan(item.tracking.ball_speed[2])
    assert math.isnan(item.tracking.ball_speed[3])
    assert item.tracking.ball_speed[4] == pytest.approx(1.0)
    assert math.isnan(item.tracking.ball_speed[8])
    assert sc.ps.locate_restart(0, 6, item.tracking.ball_speed,
                                item.config.game) is None


def test_provider_labels_are_separate_and_conflicts_become_x():
    rows = frames()
    input_a = sc.adapt_tracking(metadata(), rows)
    assert "possession" not in {field.name for field in fields(input_a)}
    labels = sc.consensus_proxy_labels(input_a, rows, phases(),
                                        phase_end_exclusive=True)
    assert "".join(labels.labels) == "HHHHHHXXAAAAAA"
    assert labels.home_frames == 6 and labels.away_frames == 6
    changed = deepcopy(rows)
    changed[0]["possession"]["group"] = "away team"
    changed[1]["possession"]["group"] = None
    changed[2]["possession"]["group"] = "away team"
    input_b = sc.adapt_tracking(metadata(), changed)
    assert sc.predict(input_a) == sc.predict(input_b)
    np.testing.assert_array_equal(input_a.tracking.home, input_b.tracking.home)
    labels_b = sc.consensus_proxy_labels(input_b, changed, phases(),
                                          phase_end_exclusive=True)
    assert "".join(labels_b.labels[:4]) == "XXXH"
    assert "D" not in labels_b.labels
    with pytest.raises(ValueError, match="acknowledgement"):
        sc.consensus_proxy_labels(input_a, rows, phases(),
                                  phase_end_exclusive=False)


def test_phase_period_is_clipped_to_tracking_period():
    item = sc.adapt_tracking(metadata(), frames())
    only_first = phases()[:1]
    labels = sc.consensus_proxy_labels(item, frames(), only_first,
                                        phase_end_exclusive=True)
    assert "".join(labels.labels) == "HHHHHHXXXXXXXX"


@pytest.mark.parametrize("change,reason", [
    (lambda m, f: f[1].update(frame=3), "contiguous"),
    (lambda m, f: f[1].update(timestamp="00:00:02.00"), "misaligned"),
    (lambda m, f: f[1]["player_data"][0].update(player_id=999), "unknown"),
    (lambda m, f: f[1]["ball_data"].update(x=None), "finite"),
    (lambda m, f: f[8].update(period=1), "match_periods"),
    (lambda m, f: m.update(home_team_side=["left_to_right"]), "home_team_side"),
    (lambda m, f: m.update(home_team=None), "home_team"),
    (lambda m, f: m["home_team"].update(id=10.5), "integral numeric ID"),
    (lambda m, f: f[1]["player_data"][0].update(player_id=200.5), "integral numeric ID"),
    (lambda m, f: f[1]["ball_data"].update(x=True), "finite number"),
])
def test_invalid_inputs_fail_clearly(change, reason):
    m, f = metadata(), frames()
    change(m, f)
    with pytest.raises(ValueError, match=reason):
        sc.adapt_tracking(m, f)






def test_attacking_direction_does_not_change_team_identity_or_distances():
    normal = sc.adapt_tracking(metadata(), frames())
    reversed_meta = metadata()
    reversed_meta["home_team_side"] = ["right_to_left", "left_to_right"]
    reversed_input = sc.adapt_tracking(reversed_meta, frames())
    assert sc.predict(normal) == sc.predict(reversed_input)
    np.testing.assert_array_equal(normal.tracking.home, reversed_input.tracking.home)
    assert reversed_input.home_team_side == ("right_to_left", "left_to_right")


def test_proxy_rejects_wrong_match_and_never_infers_dead_from_missing_phase():
    rows = frames()
    item = sc.adapt_tracking(metadata(), rows)
    wrong = phases()
    wrong[0]["match_id"] = "8"
    with pytest.raises(ValueError, match="match_id mismatch"):
        sc.consensus_proxy_labels(item, rows, wrong, phase_end_exclusive=True)
    uncovered = sc.consensus_proxy_labels(item, rows, [], phase_end_exclusive=True)
    assert set(uncovered.labels) == {"X"}


def test_predict_rejects_unvalidated_engine_input():
    item = sc.adapt_tracking(metadata(), frames())
    with pytest.raises(ValueError, match="validated EngineInput"):
        sc.predict(replace(item, _validation_token=None))


def test_no_restart_tags_are_derived_from_observation_gaps():
    rows = frames()
    rows[2]["ball_data"]["is_detected"] = False
    rows[3]["ball_data"]["x"] = 0
    rows[4]["ball_data"]["x"] = 1
    item = sc.adapt_tracking(metadata(), rows)
    assert math.isnan(item.tracking.ball_speed[2])
    assert math.isnan(item.tracking.ball_speed[3])
    assert item.tracking.ball_speed[4] == pytest.approx(10)
    dead, restarts = sc.ps.game_evidence(item.tracking, [], [], item.segments,
                                          item.pitch, item.config.game)
    assert not restarts
    assert "possession" not in {field.name for field in fields(item)}
