"""Synthetic tests for src/possession.py (Phase 3A). No match data is read."""

import hashlib

import numpy as np
import pytest

import baseline as bl
import check_submission as cs
import possession as ps
from conftest import NAN, group, raw_line

# Small parameters so the patterns stay readable: switch after 3 frames, hold gaps up to 4.
P = ps.Params(control_radius_m=2.0, margin_m=1.0, confirm_frames=3, max_gap_frames=4)

CODE = {"H": bl.HOME, "A": bl.AWAY, ".": ps.NO_CONTROL, "_": ps.NO_BALL}


def ev(pattern):
    """Evidence from a pattern: H/A = that team in control, '.' = no control, '_' = no ball."""
    return np.array([CODE[c] for c in pattern.replace(" ", "")], dtype=np.int8)


def run(pattern, params=P, segments=None):
    state, source = ps.infer_states(ev(pattern), params, segments)
    return "".join(ps.to_labels(state)), source


def players(**positions):
    far = group(0.9, 0.9)
    return [positions.get("p{}".format(i), far) for i in range(1, 6)]  # away,home,home,away,home


# 1. initial possession establishment ----------------------------------------------------------

def test_possession_is_established_after_confirm_frames_and_backdated():
    labels, source = run("..HHH..")
    assert labels == "XXHHHHH"
    assert source[:2].tolist() == [ps.SRC_UNKNOWN] * 2


def test_too_short_first_run_does_not_establish():
    assert run("..HH..H.")[0] == "XXXXXXXX"


# 2. stable possession, 3. passing between teammates ---------------------------------------------

def test_stable_possession():
    assert run("HHHHHHHH")[0] == "HHHHHHHH"


def test_ball_flight_between_teammates_keeps_possession():
    labels, source = run("HHHH....HHHH")
    assert labels == "H" * 12
    assert (source[4:8] == ps.SRC_CARRIED).all()


def test_pass_between_teammates_end_to_end(meta_path, write_raw):
    # p2 and p3 are home, p1 away. Ball: at p2, in flight, at p3, in flight, then at p1 (away).
    at = {"p1": group(0.70, 0.5), "p2": group(0.30, 0.5), "p3": group(0.50, 0.5)}
    lines, frame_id = [], 1
    for ball_x, count in ((0.301, 15), (0.40, 5), (0.501, 15), (0.60, 5), (0.701, 20)):
        for _ in range(count):
            lines.append(raw_line(frame_id, players(**at), group(ball_x, 0.5)))
            frame_id += 1
    labels = ps.build_labels(meta_path, write_raw(lines), n_frames=60)
    # The pass that is intercepted (frames 35-39, in flight) stays with the passer; the away
    # possession starts at the first frame the away player controls the ball.
    assert "".join(labels) == "H" * 40 + "A" * 20


# 4. brief opponent proximity, 5. sustained opposing control, 6. backdating --------------------------

def test_brief_opponent_control_does_not_switch():
    assert run("HHHHAAHHHH")[0] == "H" * 10


def test_opponent_run_interrupted_by_no_control_is_reset():
    assert run("HHHHAA.AAHH")[0] == "H" * 11


def test_sustained_opponent_control_switches():
    assert run("HHHHAAAA")[0] == "HHHHAAAA"


def test_switch_is_backdated_to_first_frame_of_run():
    labels, source = run("HHH..AAAA")
    assert labels == "HHHHHAAAA"          # ball flight before the run stays with the passer
    assert source[5:].tolist() == [ps.SRC_CONTROL] * 4


def test_missing_ball_pauses_a_pending_run_and_is_backdated_too():
    labels, source = run("HHHA_AAH")
    assert labels == "HHHAAAAA"
    assert source[4] == ps.SRC_GAP


# 7. missing ball inside possession, 8. leading gap, 12. consecutive gaps --------------------------

def test_short_gap_inside_possession_is_held():
    labels, source = run("HHH____HHH")
    assert labels == "H" * 10
    assert (source[3:7] == ps.SRC_GAP).all()


def test_long_gap_resets_to_unknown_without_inventing_a_switch():
    labels, _ = run("HHH______HAAA")
    #               gap of 6 > 4: hold 4, then X; state is unknown afterwards, so the lone H does
    #               not re-establish and AAA establishes from scratch.
    assert labels == "HHH" + "HHHH" + "XX" + "X" + "AAA"


def test_leading_gap_is_unknown_not_dead():
    labels, source = run("____HHH")
    assert labels == "XXXXHHH"
    assert (source[:4] == ps.SRC_UNKNOWN).all()
    assert "D" not in labels


def test_consecutive_short_gaps_are_counted_separately():
    assert run("HHH___H___HHH")[0] == "H" * 13  # 3 + 3 missing, each within the 4-frame hold


# 9. ambiguous distances, 10. exact ties, 11. missing player slots ----------------------------------

@pytest.mark.parametrize("d_home, d_away, expected", [
    (0.5, 5.0, bl.HOME),           # clear control
    (5.0, 0.5, bl.AWAY),
    (1.0, 1.5, ps.NO_CONTROL),     # within radius but contested: margin 0.5 < 1.0
    (3.0, 10.0, ps.NO_CONTROL),    # nobody within the 2 m radius (ball in flight)
    (2.0, 3.0, bl.HOME),           # boundaries are inclusive
    (np.inf, 1.0, bl.AWAY),        # no home player tracked
    (np.inf, np.inf, ps.NO_CONTROL),
    (np.nan, np.nan, ps.NO_BALL),
])
def test_control_evidence(d_home, d_away, expected):
    assert ps.control_evidence([d_home], [d_away], P).tolist() == [expected]


@pytest.mark.parametrize("margin", [0.0, 1.0])
def test_exact_tie_is_ambiguous_even_without_margin(margin):
    params = P._replace(margin_m=margin)
    assert ps.control_evidence([0.5], [0.5], params).tolist() == [ps.NO_CONTROL]


def test_team_distances_handles_missing_slots_and_missing_ball(meta_path, write_raw):
    raw = write_raw([
        raw_line(1, players(p1=group(0.5, 0.5), p4=NAN), group(0.5, 0.5)),     # away at ball
        raw_line(2, [NAN] * 5, group(0.5, 0.5)),                                # nobody tracked
        raw_line(3, players(p2=group(0.5, 0.5)), NAN),                          # no ball
        "malformed\n",
    ])
    home, away = ps.team_distances(raw, bl.team_of_each_track(meta_path), n_frames=4)
    assert away[0] == 0.0 and home[0] > 10
    assert np.isinf(home[1]) and np.isinf(away[1])
    assert np.isnan(home[2]) and np.isnan(away[2]) and np.isnan(home[3])
    assert ps.control_evidence(home, away, P).tolist() == [
        bl.AWAY, ps.NO_CONTROL, ps.NO_BALL, ps.NO_BALL]


def test_team_distances_in_metres_and_consistent_with_baseline(meta_path, write_raw):
    rng = np.random.RandomState(5)
    lines = []
    for frame_id in range(1, 301):
        slots = [group(*rng.rand(2)) if rng.rand() > .2 else NAN for _ in range(5)]
        ball = group(*rng.rand(2)) if rng.rand() > .3 else NAN
        lines.append(raw_line(frame_id, slots, ball))
    raw = write_raw(lines)
    teams = bl.team_of_each_track(meta_path)
    home, away = ps.team_distances(raw, teams, 300)
    nearest = bl.nearest_player_labels(raw, teams, 300)
    seen = ~np.isnan(home)
    assert (seen == (nearest != bl.NOBODY)).all()
    expected = np.where(home[seen] <= away[seen], bl.HOME, bl.AWAY)
    assert (expected == nearest[seen]).all()

    one = write_raw([raw_line(1, players(p2=group(0.6, 0.5)), group(0.5, 0.5))], name="m.txt")
    home, _ = ps.team_distances(one, teams, 1)
    assert home[0] == pytest.approx(0.1 * 105.3)


# 13. no cross-half leakage -------------------------------------------------------------------

def test_segments_start_unknown_and_do_not_share_state():
    pattern = "HHHHHH" + "..AAA."
    labels, _ = run(pattern, segments=[(0, 6), (6, 12)])
    assert labels == "HHHHHH" + "XXAAAA"
    assert run(pattern)[0] == "HHHHHH" + "HHAAAA"     # without segments the H would carry over


def test_pending_run_does_not_cross_segments():
    assert run("HHHAA" + "AHHH", segments=[(0, 5), (5, 9)])[0] == "HHHHH" + "XHHH"


def test_frames_outside_segments_are_unknown():
    assert run("HHHHHHHHH", segments=[(3, 6)])[0] == "XXXHHHXXX"


# 14. labels and row count, 15. determinism and LF ----------------------------------------------

def test_full_length_output_is_a_valid_submission(meta_path, write_raw, tmp_path):
    lines = [raw_line(i, players(p2=group(0.5, 0.5)), group(0.5, 0.5)) for i in range(1, 40)]
    labels = ps.build_labels(meta_path, write_raw(lines))
    assert len(labels) == bl.N_VIDEO_FRAMES == 199319
    assert set(labels.tolist()) <= {"H", "A", "X"}
    path = str(tmp_path / "out.csv")
    bl.write_submission(path, labels)
    assert cs.check(path) is None


def test_output_is_deterministic_with_lf_endings(meta_path, write_raw, tmp_path):
    rng = np.random.RandomState(9)
    lines = []
    for frame_id in range(1, 401):
        slots = [group(*rng.rand(2)) if rng.rand() > .2 else NAN for _ in range(5)]
        lines.append(raw_line(frame_id, slots, group(*rng.rand(2)) if rng.rand() > .3 else NAN))
    raw = write_raw(lines)
    blobs = []
    for i in range(2):
        path = str(tmp_path / "run{}.csv".format(i))
        bl.write_submission(path, ps.build_labels(meta_path, raw, n_frames=400))
        with open(path, "rb") as handle:
            blobs.append(handle.read())
    assert hashlib.sha256(blobs[0]).digest() == hashlib.sha256(blobs[1]).digest()
    assert b"\r" not in blobs[0] and blobs[0].startswith(b"frame,label\n0,")


def test_defaults_are_the_documented_values():
    assert ps.DEFAULTS == ps.Params(2.0, 1.0, 10, 250)


def test_cli_requires_a_data_dir(monkeypatch):
    monkeypatch.delenv("MTAH_DATA_DIR", raising=False)
    with pytest.raises(SystemExit) as stop:
        ps.main(["--out", "unused.csv"])
    assert stop.value.code == 2
