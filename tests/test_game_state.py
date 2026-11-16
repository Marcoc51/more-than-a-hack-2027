"""Synthetic tests for Phase 3B: halves, dead ball, restarts and Smart Tagging. No match data."""

import importlib.util
import os

import numpy as np
import pytest

import baseline as bl
import check_submission as cs
import possession as ps
import smart_tagging as st
from conftest import NAN, ROOT, group, raw_line

P = ps.Params(control_radius_m=2.0, margin_m=1.0, confirm_frames=3, max_gap_frames=4)
G = ps.GameParams(out_tolerance_m=0.5, out_confirm_frames=3, restart_speed_mps=4.0,
                  restart_still_frames=3, stoppage_lookahead_frames=20)
CODE = {"H": bl.HOME, "A": bl.AWAY, ".": ps.NO_CONTROL, "_": ps.NO_BALL}
H, A, U = bl.HOME, bl.AWAY, ps.UNKNOWN


def run(evidence, dead="", restarts=None, segments=None, params=P, game=G):
    """evidence: H/A/./_ per frame. dead: 'x' marks a confirmed-dead frame (same length)."""
    ev = np.array([CODE[c] for c in evidence.replace(" ", "")], dtype=np.int8)
    mask = np.array([c == "x" for c in dead.replace(" ", "")], dtype=bool) if dead else None
    state, source = ps.infer_states(ev, params, segments, mask, restarts or {}, game)
    return "".join(ps.to_labels(state)), source


def tracking(n, speed=None, x=None, y=None):
    """Synthetic Tracking: ball tracked at the centre spot, standing still, unless overridden."""
    full = lambda v, default: np.array(v, float) if v is not None else np.full(n, default)
    return ps.Tracking(home=np.full(n, 9.0), away=np.full(n, 9.0), ball_x=full(x, 52.65),
                       ball_y=full(y, 34.0), ball_speed=full(speed, 0.0))


def tag(start, end, type_="Throw-in", team=None, code="set pieces"):
    return st.Tag(code=code, type=type_.lower(), team=team, start_frame=start, end_frame=end)


NAMES = ["Synthetic Home", "Synthetic Away"]


# 1, 2, 4. kickoffs and pre-kickoff footage ----------------------------------------------------

def test_first_half_kickoff_dead_until_strike_then_tagged_team():
    speed = [0.0] * 40
    speed[15] = 10.0
    dead, restarts = ps.game_evidence(tracking(40, speed),
                                      [tag(5, 25, "Kick Off (Start)", "Synthetic Home")],
                                      NAMES, [(10, 40)], game=G)
    assert dead[10:15].all() and not dead[15:].any()
    assert restarts == {15: H}


def test_second_half_kickoff_and_pre_kickoff_footage_is_dead():
    speed = [0.0] * 80
    speed[12] = speed[60] = 10.0
    kickoffs = [tag(8, 20, "Kick Off (Start)", "Synthetic Home"),
                tag(50, 70, "Kick Off (Start)", "Synthetic Away")]
    dead, restarts = ps.game_evidence(tracking(80, speed), kickoffs, NAMES, [(10, 40), (45, 80)],
                                      game=G)
    assert dead[45:60].all() and not dead[60]       # second half: start .. strike is dead
    assert restarts[60] == A
    # Players stand next to the ball before the kickoff: control evidence, but still dead.
    labels, _ = run("." * 45 + "H" * 15 + "AAAA" + "." * 16, "".join("x" if d else "-" for d in dead),
                    restarts, segments=[(45, 80)])
    assert labels[45:60] == "D" * 15 and labels[60:] == "A" * 20


def test_unlocated_kickoff_marks_only_frames_before_the_tag():
    dead, restarts = ps.game_evidence(tracking(40, [0.0] * 40), [tag(20, 30, "Kick Off (Start)")],
                                      NAMES, [(10, 40)], game=G)
    assert dead[10:20].all() and not dead[20:].any() and restarts == {}


def test_half_without_kickoff_tag_invents_nothing():
    dead, restarts = ps.game_evidence(tracking(40), [], NAMES, [(10, 40)], game=G)
    assert not dead.any() and restarts == {}


# 3, 16. halves are independent; leading and trailing unknown ------------------------------------

def test_no_state_leaks_across_halftime():
    labels, _ = run("HHHHHHHH" + "____" + "..AAA...", segments=[(0, 8), (12, 20)])
    assert labels == "HHHHHHHH" + "XXXX" + "XXAAAAAA"


def test_dead_state_does_not_leak_into_the_next_half():
    labels, _ = run("HHHH...." + "..HHH...", "----xxxx" + "--------", segments=[(0, 8), (8, 16)])
    assert labels == "HHHHDDDD" + "XXHHHHHH"


def test_leading_and_trailing_frames_outside_halves_are_x():
    labels, _ = run("HHHHHHHHHH", segments=[(3, 7)])
    assert labels == "XXXHHHHXXX"


# 5. ball crossing the lines ----------------------------------------------------------------------

def test_out_of_bounds_needs_tolerance_and_sustained_frames():
    x = np.array([52.0, 105.6, 106.0, 106.0, 52.0, 106.0, 106.0, np.nan, 106.0, -1.0])
    y = np.full(len(x), 34.0)
    dead = ps.out_of_bounds(x, y, game=G)
    # 105.6 is within the 0.5 m tolerance; frames 2-3 are only 2 in a row; 5,6,(gap),8 confirm.
    assert dead.tolist() == [False, False, False, False, False, True, True, False, True, True]


def test_out_of_bounds_on_every_line():
    for x, y in ((-1.0, 34.0), (107.0, 34.0), (50.0, -1.0), (50.0, 69.0)):
        assert ps.out_of_bounds([x] * 3, [y] * 3, game=G).all()


def test_ball_out_ends_possession():
    labels, source = run("HHHH...", "----xxx")
    assert labels == "HHHHDDD"
    assert (source[4:] == ps.SRC_DEAD).all()


# 6, 7. missing ball in live play vs in a stoppage ---------------------------------------------------

def test_missing_ball_in_live_play_keeps_possession():
    assert run("HHH___HH", "--------")[0] == "HHHHHHHH"


def test_missing_ball_in_a_stoppage_stays_dead_even_past_the_gap_limit():
    labels, _ = run("HHH." + "_" * 10, "---x" + "-" * 10)
    assert labels == "HHH" + "D" * 11       # not X, and no possession is invented


# 8, 9, 10, 11. restarts ------------------------------------------------------------------------

def test_restart_with_tagged_team_sets_possession():
    labels, source = run("HHH..." + "......", "---xxx" + "------", restarts={6: A})
    assert labels == "HHHDDD" + "AAAAAA"
    assert source[6] == ps.SRC_RESTART


def test_same_team_possessions_separated_by_a_stoppage_stay_two():
    labels, _ = run("HHH..." + "HHH", "---xxx" + "---", restarts={6: H})
    assert labels == "HHHDDDHHH"           # H D H: two possessions, not one


def test_unknown_team_restart_backdates_first_team_to_the_strike():
    labels, _ = run("HHH..." + "..AAA..", "---xxx" + "-------", restarts={6: U})
    assert labels == "HHHDDD" + "AAAAAAA"


def test_unknown_team_restart_never_confirmed_stays_x():
    assert run("HHH..." + "..A.", "---xxx" + "----", restarts={6: U})[0] == "HHHDDD" + "XXXX"


# 12. conflicting evidence -------------------------------------------------------------------------

def test_dead_evidence_overrides_control():
    assert run("HHHHHHH", "---xx--")[0] == "HHHDDDD"   # 2 control frames after D: not enough


def test_sustained_opposite_control_overrides_a_wrong_restart_team():
    labels, _ = run("...." + "..AAAA", "xxxx" + "------", restarts={4: H})
    assert labels == "DDDD" + "HHAAAA"


def test_stoppage_waits_for_an_upcoming_tagged_restart():
    # Control while the ball is dead (e.g. a goalkeeper placing it) is ignored when a tagged
    # restart lies within the lookahead.
    labels, _ = run("HHH.HHHH....." + "AAAA", "---x---------" + "----", restarts={13: A})
    assert labels == "HHHD" + "D" * 9 + "AAAA"


def test_stoppage_without_any_restart_ends_on_sustained_control():
    labels, _ = run("HHH.AAAA", "---x----")
    assert labels == "HHHDAAAA"


# 13, 14. Smart Tagging: overlaps, timing errors, unknown teams ------------------------------------

def test_overlapping_tags_on_one_strike_merge_teams():
    speed = [0.0] * 30
    speed[10] = 9.0
    trk = tracking(30, speed)
    _, restarts = ps.game_evidence(trk, [tag(2, 20, team="Synthetic Home"), tag(4, 15)], NAMES,
                                   [(0, 30)], game=G)
    assert restarts == {10: H}                       # known + unknown -> known
    _, restarts = ps.game_evidence(trk, [tag(2, 20, team="Synthetic Home"),
                                         tag(4, 15, team="Synthetic Away")], NAMES, [(0, 30)],
                                   game=G)
    assert restarts == {10: U}                       # contradictory -> unknown


def test_phase_tags_are_ignored():
    speed = [0.0] * 30
    speed[10] = 9.0
    dead, restarts = ps.game_evidence(tracking(30, speed),
                                      [tag(2, 20, team="Synthetic Home", code="build up")],
                                      NAMES, [(0, 30)], game=G)
    assert not dead.any() and restarts == {}


@pytest.mark.parametrize("speeds, expected", [
    ([0, 0, 0, 9, 9], 3),                    # still, then struck
    ([0, 0, 9, 9, 9], None),                 # too few still frames before the strike
    ([9, 0, 0, 0, 9], None),                 # moving at window start: live play / mistimed tag
    ([np.nan] * 5, None),                    # ball never tracked
    ([0, np.nan, 0, np.nan, 0, 9], 5),       # missing frames are skipped, not counted
])
def test_locate_restart(speeds, expected):
    assert ps.locate_restart(0, len(speeds), np.array(speeds, float), G) == expected


def test_window_outside_recording_is_not_used():
    assert ps.locate_restart(50, 60, np.zeros(20), G) is None


def test_unlocated_set_piece_adds_no_dead_frames():
    dead, restarts = ps.game_evidence(tracking(30, [9.0] * 30), [tag(5, 20)], NAMES, [(0, 30)],
                                      game=G)
    assert not dead.any() and restarts == {}


def test_smart_tagging_parser_skips_bad_timing_and_reads_na(tmp_path):
    xml = """<file><ALL_INSTANCES>
  <instance><ID>1</ID><start>2.0</start><end>4.0</end><code>SET PIECES</code>
    <label><group>Type</group><text>Kick Off (Start)</text></label>
    <label><group>Team</group><text>Synthetic Home</text></label></instance>
  <instance><ID>2</ID><start>10.04</start><end>12</end><code>Set Pieces</code>
    <label><group>type</group><text>THROW-IN</text></label>
    <label><group>Team</group><text>N/A</text></label></instance>
  <instance><ID>3</ID><start>abc</start><end>5</end><code>SET PIECES</code></instance>
  <instance><ID>4</ID><end>5</end><code>SET PIECES</code></instance>
  <instance><ID>5</ID><start>9</start><end>8</end><code>SET PIECES</code></instance>
  <instance><ID>6</ID><start>-1</start><end>3</end><code>SET PIECES</code></instance>
  <instance><ID>7</ID><start>1</start><end>3</end><code>BUILD UP</code>
    <label><group>Team</group><text>Synthetic Away</text></label></instance>
</ALL_INSTANCES></file>"""
    path = tmp_path / "tags.xml"
    path.write_text(xml, encoding="utf-8")
    tags = st.load(str(path))
    assert tags == [st.Tag("set pieces", "kick off (start)", "Synthetic Home", 50, 100),
                    st.Tag("set pieces", "throw-in", None, 251, 300),
                    st.Tag("build up", "", "Synthetic Away", 25, 75)]
    assert len(st.set_pieces(tags)) == 2


@pytest.mark.parametrize("tag_team, expected", [
    ("Barcelona", 0), ("Atletic Club", 1), ("athletic club", 1),
    (None, None), ("Real Sociedad", None),
])
def test_team_tag_matching(tag_team, expected):
    assert st.match_team(tag_team, ["FC Barcelona", "Athletic Club"]) == expected


def test_team_names_follow_home_away_order(meta_path):
    assert ps.team_names(meta_path) == ["Synthetic Home", "Synthetic Away"]


# 15. frames with no players ----------------------------------------------------------------------

def test_no_players_tracked_gives_no_control_but_out_of_bounds_still_counts(meta_path, write_raw):
    raw = write_raw([raw_line(i, [NAN] * 5, group(1.1, 0.5, 3.0)) for i in range(1, 6)])
    trk = ps.read_tracking(raw, bl.team_of_each_track(meta_path), 5)
    assert np.isinf(trk.home).all() and np.isinf(trk.away).all()
    assert trk.ball_speed.tolist() == [3.0] * 5
    assert (ps.control_evidence(trk.home, trk.away) == ps.NO_CONTROL).all()
    assert ps.out_of_bounds(trk.ball_x, trk.ball_y).all()


# 17, 18, 19. end to end: alignment, determinism, format --------------------------------------------

TAGS_XML = """<file><ALL_INSTANCES>
  <instance><ID>1</ID><start>0.4</start><end>1.2</end><code>SET PIECES</code>
    <label><group>Type</group><text>Kick Off (Start)</text></label>
    <label><group>Team</group><text>Synthetic Home</text></label></instance>
  <instance><ID>2</ID><start>3.2</start><end>4.0</end><code>SET PIECES</code>
    <label><group>Type</group><text>Throw-in</text></label>
    <label><group>Team</group><text>N/A</text></label></instance>
</ALL_INSTANCES></file>"""


def scenario_lines():
    """120 frames; half = frames 10..109. Slots: p1 away, p2 home, p3 home, p4 away, p5 home."""
    far = group(0.9, 0.9)
    lines = []
    for f in range(120):
        slots = [far] * 5
        if f < 20:                       # before and at kickoff: home player by the ball, still
            slots[1], ball = group(0.5, 0.5), group(0.5, 0.5, 0.0)
        elif f < 60:                     # home possession; the kick is struck at frame 20
            slots[2], ball = group(0.3, 0.5), group(0.3, 0.5, 10.0 if f == 20 else 1.0)
        elif f < 65:                     # ball over the far touchline
            ball = group(1.05, 0.5, 2.0)
        elif f < 80:                     # stoppage, ball not tracked
            ball = NAN
        elif f < 85:                     # throw-in set up: away player holds the ball, still
            slots[0], ball = group(0.6, 0.01), group(0.6, 0.0, 0.0)
        else:                            # thrown at frame 85, away player controls it
            slots[3], ball = group(0.7, 0.3), group(0.7, 0.3, 8.0 if f == 85 else 1.0)
        lines.append(raw_line(f + 1, slots, ball))
    return lines


def build_scenario(meta_path, write_raw, tmp_path):
    tags = tmp_path / "tags.xml"
    tags.write_text(TAGS_XML, encoding="utf-8")
    return ps.build_labels(meta_path, write_raw(scenario_lines()), n_frames=120,
                           params=ps.DEFAULTS, segments=[(10, 110)], tags_path=str(tags),
                           game=ps.GAME_DEFAULTS)


def test_end_to_end_game_state(meta_path, write_raw, tmp_path):
    labels = "".join(build_scenario(meta_path, write_raw, tmp_path))
    expected = "X" * 10 + "D" * 10 + "H" * 40 + "D" * 25 + "A" * 25 + "X" * 10
    assert labels == expected


def test_end_to_end_is_deterministic_with_lf(meta_path, write_raw, tmp_path):
    blobs = []
    for i in range(2):
        path = str(tmp_path / "run{}.csv".format(i))
        bl.write_submission(path, build_scenario(meta_path, write_raw, tmp_path))
        with open(path, "rb") as handle:
            blobs.append(handle.read())
    assert blobs[0] == blobs[1] and b"\r" not in blobs[0]


def test_full_match_output_alignment_and_format(meta_path, write_raw, tmp_path):
    # Home controls the ball in the first frames of each half (frame_id = video frame + 1).
    lines = [raw_line(f + 1, [group(0.9, 0.9), group(0.5, 0.5)] + [group(0.9, 0.9)] * 3,
                      group(0.5, 0.5)) for f in list(range(11185, 11200)) + list(range(110808, 110820))]
    labels = ps.build_labels(meta_path, write_raw(lines), segments=ps.HALVES)
    assert len(labels) == bl.N_VIDEO_FRAMES == 199319
    assert set(labels[:11185]) == {"X"} and set(labels[90652:110808]) == {"X"}
    assert set(labels[190198:]) == {"X"}
    assert labels[11185] == "H" and labels[110808] == "H"
    path = str(tmp_path / "full.csv")
    bl.write_submission(path, labels)
    assert cs.check(path) is None

    official = os.path.join(ROOT, "source", "more-than-a-hack-2027", "evaluation",
                            "possession_metrics.py")
    if os.path.isfile(official):
        spec = importlib.util.spec_from_file_location("official_pm_3b", official)
        pm = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(pm)
        assert pm.validate_submission(pm.read_label_csv(path), bl.N_VIDEO_FRAMES) is None


def test_halves_match_the_official_published_blocks():
    assert ps.HALVES == ((11185, 90651 + 1), (110808, 190197 + 1))


def test_game_defaults_are_the_documented_values():
    assert ps.GAME_DEFAULTS == ps.GameParams(0.5, 3, 4.0, 5, 2250)
    assert ps.DEFAULTS == ps.Params(2.0, 1.0, 10, 250)   # Phase 3A values unchanged


# Phase 4 audit regressions --------------------------------------------------------------------

def test_stoppage_whose_own_restart_was_missed_does_not_wait_for_a_later_one():
    # Ball out at frame 3; this stoppage's set-piece window (frames 4-6) had no locatable strike;
    # live play resumes (away control from frame 8); a different stoppage's restart is at 21.
    evidence = "HHH." + "...." + "AAAA" + "." * 9 + "H"
    dead = "---x" + "-" * 18
    missed = np.zeros(22, dtype=bool)
    missed[4:7] = True
    ev = np.array([CODE[c] for c in evidence], dtype=np.int8)
    mask = np.array([c == "x" for c in dead])
    state, _ = ps.infer_states(ev, P, None, mask, {21: H}, G, missed)
    assert "".join(ps.to_labels(state)) == "HHH" + "D" * 5 + "A" * 13 + "H"
    # Without the missed window the stoppage would wait for frame 21 -- the old behaviour.
    state, _ = ps.infer_states(ev, P, None, mask, {21: H}, G)
    assert "".join(ps.to_labels(state)) == "HHH" + "D" * 18 + "H"


def test_missed_window_before_the_stoppage_does_not_cancel_waiting():
    evidence = "HHH." + "AAAA" + "...." + "A"
    missed = np.zeros(13, dtype=bool)
    missed[0:2] = True                       # an earlier, unrelated unlocated tag
    ev = np.array([CODE[c] for c in evidence], dtype=np.int8)
    mask = np.array([c == "x" for c in "---x" + "-" * 9])
    state, _ = ps.infer_states(ev, P, None, mask, {12: A}, G, missed)
    assert "".join(ps.to_labels(state)) == "HHH" + "D" * 9 + "A"


def test_missed_restarts_mask_covers_only_unlocated_set_pieces():
    speed = [0.0] * 40
    speed[10] = 9.0                          # strike for the first tag only
    tags = [tag(4, 15), tag(20, 30), tag(32, 38, code="build up")]
    mask = ps.missed_restarts(tracking(40, speed), tags, G)
    assert not mask[:20].any() and mask[20:30].all() and not mask[30:].any()


def test_out_of_bounds_matches_a_reference_and_handles_long_runs():
    rng = np.random.RandomState(4)
    x = np.where(rng.rand(3000) < .5, 120.0, 50.0)
    x[rng.rand(3000) < .2] = np.nan
    x[1000:2500] = 120.0                     # one long off-pitch run
    y = np.full(len(x), 34.0)

    expected = np.zeros(len(x), dtype=bool)  # straightforward reference implementation
    run = []
    for i in range(len(x)):
        if np.isnan(x[i]):
            continue
        if x[i] > 105.3 + G.out_tolerance_m:
            run.append(i)
            if len(run) >= G.out_confirm_frames:
                expected[run] = True
        else:
            run = []
    assert (ps.out_of_bounds(x, y, game=G) == expected).all()
