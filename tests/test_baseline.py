"""Synthetic tests for src/baseline.py and src/check_submission.py. No match data is read."""

import hashlib
import importlib.util
import os

import numpy as np
import pytest

import baseline as bl
import check_submission as cs
from conftest import NAN, ROOT, group, raw_line

OFFICIAL = os.path.join(ROOT, "source", "more-than-a-hack-2027")

# Five slots: away, home, home, away, home (see conftest.META_XML).
FAR = group(0.9, 0.9)


def players(**positions):
    """Five player groups; slots not given are far away from everything."""
    return [positions.get("p{}".format(i), FAR) for i in range(1, 6)]


def load_official(relpath, name):
    path = os.path.join(OFFICIAL, *relpath.split("/"))
    if not os.path.isfile(path):
        pytest.skip("official reference clone not present")
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# 1. tracking-frame parsing ----------------------------------------------------------------------

def test_parses_lines_and_skips_malformed(meta_path, write_raw):
    raw = write_raw([
        raw_line(1, players(p2=group(0.50, 0.50)), group(0.501, 0.50)),
        "garbage line without separators\n",
        "7:only-two-fields\n",
        raw_line(2, players(p1=group(0.20, 0.20)), group(0.20, 0.201, 3.5)),
    ])
    codes = bl.nearest_player_labels(raw, bl.team_of_each_track(meta_path), n_frames=3)
    assert codes.tolist() == [bl.HOME, bl.AWAY, bl.NOBODY]


# 2. home/away team mapping ----------------------------------------------------------------------

def test_first_team_in_xml_is_home(meta_path):
    teams = bl.team_of_each_track(meta_path)
    assert teams.tolist() == [bl.AWAY, bl.HOME, bl.HOME, bl.AWAY, bl.HOME]


def test_rejects_metadata_without_two_teams(tmp_path):
    path = tmp_path / "bad.xml"
    path.write_text('<Metadata><Teams><Team id="A"/></Teams><Players>'
                    '<Player teamId="A"/></Players></Metadata>', encoding="utf-8")
    with pytest.raises(ValueError):
        bl.team_of_each_track(str(path))


# 3. missing ball observations -------------------------------------------------------------------

def test_missing_ball_gives_no_answer_and_d(meta_path, write_raw):
    raw = write_raw([
        raw_line(1, players(p2=group(0.5, 0.5)), NAN),
        raw_line(2, players(p2=group(0.5, 0.5)), group(0.5, 0.5)),
    ])
    codes = bl.nearest_player_labels(raw, bl.team_of_each_track(meta_path), n_frames=2)
    assert codes.tolist() == [bl.NOBODY, bl.HOME]
    assert bl.smooth(codes, 0).tolist() == ["D", "H"]


def test_frames_absent_from_file_stay_no_answer(meta_path, write_raw):
    raw = write_raw([raw_line(3, players(p1=group(0.5, 0.5)), group(0.5, 0.5))])
    codes = bl.nearest_player_labels(raw, bl.team_of_each_track(meta_path), n_frames=5)
    assert codes.tolist() == [bl.NOBODY, bl.NOBODY, bl.AWAY, bl.NOBODY, bl.NOBODY]


# 4. nearest-player assignment -------------------------------------------------------------------

def test_missing_players_are_ignored(meta_path, write_raw):
    # The away slot would be nearest, but it is NaN; the home slot further away wins.
    raw = write_raw([raw_line(1, players(p1=NAN, p3=group(0.55, 0.5)), group(0.5, 0.5))])
    codes = bl.nearest_player_labels(raw, bl.team_of_each_track(meta_path), n_frames=1)
    assert codes.tolist() == [bl.HOME]


def test_distance_is_measured_in_metres_not_normalised_units(meta_path, write_raw):
    # Away is 0.10 along x (10.53 m); home is 0.12 along y (8.16 m). Normalised units would pick
    # away; metres pick home. The official script scales to metres.
    raw = write_raw([raw_line(1, players(p1=group(0.60, 0.50), p2=group(0.50, 0.62)),
                              group(0.50, 0.50))])
    codes = bl.nearest_player_labels(raw, bl.team_of_each_track(meta_path), n_frames=1)
    assert codes.tolist() == [bl.HOME]


def test_exact_distance_tie_goes_to_lower_slot(meta_path, write_raw):
    raw = write_raw([raw_line(1, players(p1=group(0.40, 0.5), p2=group(0.60, 0.5)),
                              group(0.50, 0.5))])
    codes = bl.nearest_player_labels(raw, bl.team_of_each_track(meta_path), n_frames=1)
    assert codes.tolist() == [bl.AWAY]  # slot 1 (away) is first


# 5. majority-vote smoothing ---------------------------------------------------------------------

def brute_force_smooth(codes, window):
    out = []
    for i in range(len(codes)):
        chunk = codes[max(0, i - window):i + window + 1]
        home, away = int(np.sum(chunk == bl.HOME)), int(np.sum(chunk == bl.AWAY))
        out.append("D" if home + away == 0 else ("H" if home >= away else "A"))
    return out


@pytest.mark.parametrize("window", [1, 2, 3, 50])
def test_smoothing_matches_brute_force(window):
    rng = np.random.RandomState(7)
    codes = rng.choice([bl.HOME, bl.AWAY, bl.NOBODY], size=400, p=[.4, .3, .3]).astype(np.int8)
    codes[150:260] = bl.NOBODY  # a long gap, so D appears for wide windows too
    assert bl.smooth(codes, window).tolist() == brute_force_smooth(codes, window)


def test_smoothing_ties_go_home_and_empty_windows_are_d():
    codes = np.array([bl.HOME, bl.AWAY, bl.NOBODY, bl.NOBODY, bl.NOBODY, bl.NOBODY],
                     dtype=np.int8)
    assert bl.smooth(codes, 1).tolist() == ["H", "H", "A", "D", "D", "D"]


def test_window_is_50():
    assert bl.WINDOW == 50


# 6. output row numbering, 7. header and labels, 9. LF line endings --------------------------------

def test_written_file_layout(tmp_path):
    path = str(tmp_path / "out" / "sub.csv")
    bl.write_submission(path, np.array(["H", "A", "D", "X"]))
    with open(path, "rb") as handle:
        data = handle.read()
    assert data == b"frame,label\n0,H\n1,A\n2,D\n3,X\n"
    assert b"\r" not in data


def test_full_length_file_passes_our_check(tmp_path):
    path = str(tmp_path / "sub.csv")
    labels = np.array(["H", "A", "D", "X"])[np.arange(bl.N_VIDEO_FRAMES) % 4]
    bl.write_submission(path, labels)
    assert cs.check(path) is None


@pytest.mark.parametrize("content, reason", [
    (b"frame,label\r\n0,H\r\n1,A\r\n", "line endings"),
    (b"frame,lbl\n0,H\n1,A\n", "header"),
    (b"frame,label\n0,H\n", "row count"),
    (b"frame,label\n1,H\n0,A\n", "not 0..1"),
    (b"frame,label\n0,H\n1,\n", "empty label"),
    (b"frame,label\n0,H\n1,Q\n", "labels outside"),
])
def test_check_rejects_bad_files(tmp_path, content, reason):
    path = tmp_path / "bad.csv"
    path.write_bytes(content)
    assert reason in cs.check(str(path), n_expected=2)


def test_check_agrees_with_official_validator(tmp_path):
    pm = load_official("evaluation/possession_metrics.py", "official_possession_metrics")
    good, bad = tmp_path / "good.csv", tmp_path / "bad.csv"
    good.write_bytes(b"frame,label\n0,H\n1,A\n2,D\n3,X\n")
    bad.write_bytes(b"frame,label\n0,H\n2,A\n1,D\n3,X\n")
    for path in (good, bad):
        ours = cs.check(str(path), n_expected=4)
        official = pm.validate_submission(pm.read_label_csv(str(path)), 4)
        assert (ours is None) == (official is None)


# 8. deterministic output ------------------------------------------------------------------------

def test_identical_inputs_give_identical_bytes(meta_path, write_raw, tmp_path):
    rng = np.random.RandomState(3)
    lines = []
    for frame_id in range(1, 301):
        ps = [group(*rng.rand(2)) if rng.rand() > .2 else NAN for _ in range(5)]
        ball = group(*rng.rand(2)) if rng.rand() > .4 else NAN
        lines.append(raw_line(frame_id, ps, ball))
    raw = write_raw(lines)

    digests = []
    for run in range(2):
        out = str(tmp_path / "run{}.csv".format(run))
        bl.write_submission(out, bl.build_labels(meta_path, raw, n_frames=300))
        with open(out, "rb") as handle:
            digests.append(hashlib.sha256(handle.read()).hexdigest())
    assert digests[0] == digests[1]


# 10. off-by-one frame alignment -------------------------------------------------------------------

def test_frame_id_one_is_row_zero_and_last_id_is_last_row(meta_path, write_raw):
    n = 10
    raw = write_raw([
        raw_line(1, players(p2=group(0.5, 0.5)), group(0.5, 0.5)),   # home at row 0
        raw_line(n, players(p1=group(0.5, 0.5)), group(0.5, 0.5)),   # away at row n-1
    ])
    codes = bl.nearest_player_labels(raw, bl.team_of_each_track(meta_path), n_frames=n)
    assert codes[0] == bl.HOME and codes[n - 1] == bl.AWAY
    assert (codes[1:n - 1] == bl.NOBODY).all()


def test_constants_match_the_submission_contract():
    assert bl.N_VIDEO_FRAMES == cs.N_VIDEO_FRAMES == 199319
    assert bl.PITCH == (105.3, 68.0)


# Equivalence with the official implementation, on synthetic data only ----------------------------

def test_matches_official_baseline_on_synthetic_data(meta_path, write_raw):
    official = load_official("starter/baseline.py", "official_baseline")
    rng = np.random.RandomState(11)
    lines = []
    for frame_id in range(1, 501):
        ps = [group(*rng.rand(2)) if rng.rand() > .15 else NAN for _ in range(5)]
        ball = group(*rng.rand(2)) if rng.rand() > .4 else NAN
        lines.append(raw_line(frame_id, ps, ball))
    raw = write_raw(lines)

    ours_teams = bl.team_of_each_track(meta_path)
    assert ours_teams.tolist() == official.team_of_each_track(meta_path).tolist()

    ours = bl.nearest_player_labels(raw, ours_teams, 500, bl.PITCH)
    theirs = official.nearest_player_labels(raw, ours_teams, 500,
                                            official.GAMES[official.GAME]["pitch"])
    assert ours.tolist() == theirs.tolist()
    for window in (0, 25, 50, 125):
        assert bl.smooth(ours, window).tolist() == official.smooth(theirs, window).tolist()
