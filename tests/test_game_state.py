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


def run(evidence, dead="", restarts=None, segments=None, params=P):
    """evidence: H/A/./_ per frame. dead: 'x' marks a confirmed-dead frame (same length)."""
    ev = np.array([CODE[c] for c in evidence.replace(" ", "")], dtype=np.int8)
    mask = np.array([c == "x" for c in dead.replace(" ", "")], dtype=bool) if dead else None
    state, source = ps.infer_states(ev, params, segments, mask, restarts or {})
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


def test_control_in_a_stoppage_outside_dead_frames_is_never_vetoed_by_a_future_restart():
    # Phase 4D: sustained control outside confirmed-dead frames ends a stoppage, whoever takes
    # the next restart. Set-up control by the restarting team before its tag window therefore
    # reads as possession (documented trade-off; see the end-to-end set-up test below).
    labels, _ = run("HHH.AAAA....." + "AAAA", "---x---------" + "----", restarts={13: A})
    assert labels == "HHHD" + "A" * 13


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


# Phase 4B corrective regressions (F1-F5, F9) ----------------------------------------------------

def test_f1_unrelated_future_restart_does_not_suppress_the_other_teams_possession():
    # Untagged stoppage at frame 3; away sustains control 5..14; a later home restart at 18.
    labels, _ = run("HHH." + "." + "A" * 10 + "..." + "HH", "---x" + "-" * 17, restarts={18: H})
    assert labels == "HHHDD" + "A" * 13 + "HH"


def test_f1_unknown_team_restart_does_not_suppress_control():
    labels, _ = run("HHH." + "." + "A" * 10 + "..." + "..", "---x" + "-" * 17, restarts={18: U})
    assert labels == "HHHDD" + "A" * 13 + "XX"   # unknown-team restart, nobody confirmed after it


def test_f1_same_team_future_restart_does_not_suppress_control():
    # Home's sustained control from 15 ends the stoppage; home's later restart at 30 is a new
    # possession only if a dead interval separates them (here none is marked).
    labels, _ = run("HHH." + "." * 11 + "HHHH" + "." * 11 + "H", "---x" + "-" * 27,
                    restarts={30: H})
    assert labels == "HHH" + "D" * 12 + "H" * 16


def test_f2_restart_team_aggregation_is_order_and_duplicate_independent():
    speed = [0.0] * 30
    speed[10] = 9.0
    trk = tracking(30, speed)
    home, away, na = (tag(2, 20, team="Synthetic Home"), tag(3, 20, team="Synthetic Away"),
                      tag(4, 20))
    for order in ([home, away, home], [home, home, away], [away, home, home], [na, away, home]):
        assert ps.game_evidence(trk, order, NAMES, [(0, 30)], game=G)[1] == {10: U}
    for order in ([home, home], [home, na], [na, home, na, home]):
        assert ps.game_evidence(trk, order, NAMES, [(0, 30)], game=G)[1] == {10: H}


def test_f2_kickoff_counted_once_and_conflicts_with_a_set_piece_tag():
    speed = [0.0] * 40
    speed[15] = 10.0
    kickoff = tag(5, 25, "Kick Off (Start)", "Synthetic Home")
    other = tag(6, 25, "Free Kick", "Synthetic Away")
    for order in ([kickoff, other], [other, kickoff]):
        _, restarts = ps.game_evidence(tracking(40, speed), order, NAMES, [(10, 40)], game=G)
        assert restarts == {15: U}
    _, restarts = ps.game_evidence(tracking(40, speed), [kickoff, kickoff], NAMES, [(10, 40)],
                                   game=G)
    assert restarts == {15: H}


def test_f3_pending_run_does_not_accumulate_across_a_long_gap():
    # In a stoppage: 2 away frames, 30 missing frames, 1 away frame: no 3-frame run.
    labels, _ = run("HHH." + "AA" + "_" * 30 + "A" + "...", "---x" + "-" * 36)
    assert labels == "HHH" + "D" * 37
    # Same in live play: the away frames are disconnected, so no switch to away.
    labels, _ = run("HHH" + "AA" + "_" * 3 + "A" + "...")
    assert labels == "HHH" + "H" * 9


def test_f3_short_dropouts_still_pause_a_pending_run():
    # 1- and 2-frame dropouts (< confirm_frames = 3) pause the run; the switch is backdated.
    assert run("HHH" + "A_A_A" + "..")[0] == "HHH" + "A" * 7
    assert run("HHH" + "A__A__A" + "..")[0] == "HHH" + "A" * 9


def test_f3_established_possession_still_held_through_gaps_up_to_max_gap():
    assert run("HHH" + "____" + "..")[0] == "HHH" + "H" * 6
    assert run("HHH" + "_____" + "..")[0] == "HHH" + "H" * 4 + "X" * 3   # gap 5 > max_gap 4


def test_f5_out_of_bounds_run_does_not_carry_across_halftime():
    x = np.array([50.0, 120.0, 120.0, 120.0, 50.0, 50.0])
    y = np.full(len(x), 34.0)
    assert ps.out_of_bounds(x, y, game=G).tolist() == [False, True, True, True, False, False]
    assert not ps.out_of_bounds(x, y, game=G, segments=[(0, 3), (3, 6)]).any()
    x = np.full(6, 120.0)
    assert ps.out_of_bounds(x, y, game=G, segments=[(0, 3), (3, 6)]).all()
    assert ps.out_of_bounds(x, y, game=G, segments=[(1, 4)]).tolist() == \
        [False, True, True, True, False, False]       # outside the segments: never marked


def test_f5_game_evidence_resets_out_of_bounds_per_half():
    x = [50.0, 120.0, 120.0, 120.0, 50.0, 50.0]
    dead, _ = ps.game_evidence(tracking(6, x=x), [], NAMES, [(0, 3), (3, 6)], game=G)
    assert not dead.any()


@pytest.mark.parametrize("bad_id", ["0", "-3", "7", "999", "abc", ""])
def test_f9_invalid_frame_ids_are_skipped(meta_path, write_raw, bad_id):
    far, near = group(0.9, 0.9), group(0.5, 0.5)
    lines = [raw_line(1, [far] * 5, near),
             "{}:{}:{}\n".format(bad_id, ";".join([far, near] + [far] * 3), near)]
    trk = ps.read_tracking(write_raw(lines), bl.team_of_each_track(meta_path), 6)
    assert trk.home[0] > 20                          # the valid line: home player far away
    assert np.isnan(trk.home[1:]).all()              # nothing else written, nothing wrapped


# Phase 4D final remediation (F1 same-team veto, F5 kickoff across halves, F9 duplicates) ----------

def full_pipeline(evidence, speed, x, tags, segments, game=ps.GAME_DEFAULTS):
    """game_evidence + infer_states with the real parameter defaults."""
    n = len(evidence)
    trk = ps.Tracking(np.full(n, 9.0), np.full(n, 9.0), np.array(x, float), np.full(n, 34.0),
                      np.array(speed, float))
    dead, restarts = ps.game_evidence(trk, tags, NAMES, segments, game=game)
    ev = np.array([CODE[c] for c in evidence], dtype=np.int8)
    state, _ = ps.infer_states(ev, ps.DEFAULTS, segments, dead, restarts)
    return "".join(ps.to_labels(state)), restarts


def codex_f1(middle_team):
    """Codex re-audit scenario, 300 frames: untagged stoppage, live possession, then a separate
    stoppage whose home free kick is tagged [220, 260) and struck at 240."""
    evidence = "H" * 20 + "." * 10 + middle_team * 170 + "." * 20 + "H" * 80
    x = [50.0] * 300
    x[20:23] = x[200:203] = [120.0] * 3             # ball out of play
    speed = [0.0] * 300
    speed[240] = 9.0
    return full_pipeline(evidence, speed, x, [tag(220, 260, "Free Kick", "Synthetic Home")],
                         [(0, 300)])[0]


def test_f1_same_team_future_restart_keeps_the_live_possession_codex_scenario():
    assert codex_f1("H") == "H" * 20 + "D" * 10 + "H" * 170 + "D" * 40 + "H" * 60


def test_f1_opposing_team_future_restart_keeps_the_live_possession_codex_scenario():
    assert codex_f1("A") == "H" * 20 + "D" * 10 + "A" * 170 + "D" * 40 + "H" * 60


def test_f1_long_live_possession_before_a_same_team_restart():
    n = 2300                                         # ~2,170 frames of live home possession
    evidence = "H" * 20 + "." * 10 + "H" * 2170 + "." * 20 + "H" * 80
    x = [50.0] * n
    x[20:23] = x[2200:2203] = [120.0] * 3
    speed = [0.0] * n
    speed[2240] = 9.0
    labels, _ = full_pipeline(evidence, speed, x, [tag(2220, 2260, "Free Kick", "Synthetic Home")],
                              [(0, n)])
    assert labels == "H" * 20 + "D" * 10 + "H" * 2170 + "D" * 40 + "H" * 60


def test_f1_opposite_risk_setup_control_before_the_tag_window_is_possession():
    # Trade-off made explicit: the ball goes out at 20; the home goalkeeper controls it from 30
    # while placing it; the goal-kick tag only opens at 60 (strike 70). The set-up control before
    # the tag window reads as home possession; the tag's pre-strike interval is dead.
    evidence = "A" * 20 + "." * 10 + "H" * 40 + "H" * 30
    x = [50.0] * 100
    x[20:23] = [120.0] * 3
    speed = [0.0] * 100
    speed[70] = 9.0
    labels, restarts = full_pipeline(evidence, speed, x,
                                     [tag(60, 80, "Goal Kick", "Synthetic Home")], [(0, 100)])
    assert restarts == {70: H}
    assert labels == "A" * 20 + "D" * 10 + "H" * 30 + "D" * 10 + "H" * 30


def test_f1_located_restart_still_ends_a_stoppage_with_the_tagged_team():
    evidence = "H" * 20 + "." * 50 + "." * 30        # no control at all after the ball goes out
    x = [50.0] * 100
    x[20:23] = [120.0] * 3
    speed = [0.0] * 100
    speed[60] = 9.0
    labels, _ = full_pipeline(evidence, speed, x, [tag(40, 80, "Throw-in", "Synthetic Away")],
                              [(0, 100)])
    assert labels == "H" * 20 + "D" * 40 + "A" * 40


KICKOFF_HALVES = [(0, 15), (25, 40)]


def kickoff_case(strikes, tags):
    speed = [0.0] * 40
    for frame in strikes:
        speed[frame] = 9.0
    return full_pipeline("." * 40, speed, [50.0] * 40, tags, KICKOFF_HALVES)


SPANNING = tag(2, 35, "Kick Off (Start)", "Synthetic Home")


def test_f5_kickoff_tag_spanning_both_halves_strike_in_first_half_only_codex_scenario():
    labels, restarts = kickoff_case([8], [SPANNING])
    assert restarts == {8: H}                        # no projected restart at 25
    assert labels == "D" * 8 + "H" * 7 + "X" * 10 + "X" * 15


def test_f5_kickoff_tag_spanning_both_halves_strike_in_second_half_only():
    labels, restarts = kickoff_case([30], [SPANNING])
    assert restarts == {30: H}
    # First half: only the frames before the tag are dead, and D persists with no control.
    assert labels == "D" * 15 + "X" * 10 + "D" * 5 + "H" * 10


def test_f5_kickoff_tag_spanning_both_halves_strike_in_each_half():
    labels, restarts = kickoff_case([8, 30], [SPANNING])
    assert restarts == {8: H, 30: H}
    assert labels == "D" * 8 + "H" * 7 + "X" * 10 + "D" * 5 + "H" * 10


def test_f5_kickoff_tag_spanning_both_halves_without_a_strike():
    labels, restarts = kickoff_case([], [SPANNING])
    assert restarts == {}
    assert labels == "D" * 15 + "X" * 10 + "X" * 15     # nothing marked in the second half


def test_f5_ordinary_kickoff_tags_one_per_half():
    tags = [tag(2, 12, "Kick Off (Start)", "Synthetic Home"),
            tag(26, 36, "Kick Off (Start)", "Synthetic Away")]
    labels, restarts = kickoff_case([8, 33], tags)
    assert restarts == {8: H, 33: A}
    assert labels == "D" * 8 + "H" * 7 + "X" * 10 + "D" * 8 + "A" * 7


def test_f5_kickoff_struck_just_before_the_half_block_is_not_moved_into_it():
    # Phase 4F: a strike in the ungraded frames before a half is rejected, never placed at the
    # half's first frame. The half stays unknown until control evidence establishes a team.
    labels, restarts = kickoff_case([23], [tag(16, 35, "Kick Off (Start)", "Synthetic Away")])
    assert restarts == {}
    assert labels == "X" * 40


def test_f5_set_piece_strike_is_never_read_from_the_previous_half():
    # A set piece spanning halftime: struck in the first half only, never re-used in the second.
    speed = [0.0] * 40
    speed[10] = 9.0
    dead, restarts = ps.game_evidence(tracking(40, speed), [tag(4, 32, "Free Kick", "Synthetic Home")],
                                      NAMES, KICKOFF_HALVES, game=G)
    assert restarts == {10: H}
    assert dead[4:10].all() and not dead[10:].any()


def test_f9_duplicate_frame_does_not_inherit_ball_speed_from_an_earlier_row(meta_path, write_raw):
    far, near = group(0.9, 0.9), group(0.5, 0.5)
    lines = [raw_line(1, [far] * 5, group(0.5, 0.5, 9.0)),
             raw_line(1, [far, near] + [far] * 3, "0.5,0.5,abc")]   # later row, bad speed
    trk = ps.read_tracking(write_raw(lines), bl.team_of_each_track(meta_path), 3)
    assert trk.home[0] == 0.0                        # player distances from the later row
    assert np.isnan(trk.ball_speed[0])               # and no speed inherited from the earlier row


def test_f9_duplicate_frame_later_valid_row_wins_whole(meta_path, write_raw):
    far, near = group(0.9, 0.9), group(0.5, 0.5)
    lines = [raw_line(1, [far] * 5, group(0.5, 0.5, 9.0)),
             raw_line(1, [far, near] + [far] * 3, group(0.5, 0.5, 1.0))]
    trk = ps.read_tracking(write_raw(lines), bl.team_of_each_track(meta_path), 3)
    assert trk.home[0] == 0.0 and trk.ball_speed[0] == 1.0


# Phase 4F: a restart strike counts only inside the graded half it is assigned to -----------------

@pytest.mark.parametrize("type_, team", [
    ("Free Kick", "Synthetic Home"), ("Corner Kick", "Synthetic Away"),
    ("Goal Kick", "Synthetic Home"), ("Throw-in", None), ("Kick Off (After Goal)", None),
    ("Kick Off (Start)", "Synthetic Home"),
])
def test_4f_pre_half_strike_cannot_create_possession_in_the_half_codex_a(type_, team):
    # Codex example A for every restart type, known and unknown teams: struck at 20, between
    # the halves [0, 15) and [25, 40); no control anywhere.
    labels, restarts = kickoff_case([20], [tag(15, 26, type_, team)])
    assert restarts == {}
    assert labels == "X" * 40          # no control observations alone establish a team


def test_4f_distant_pre_half_strike_cannot_create_2000_frames_codex_b():
    n, halves = 3000, [(0, 15), (1000, 3000)]
    speed = [0.0] * n
    speed[20] = 9.0
    labels, restarts = full_pipeline("." * n, speed, [50.0] * n,
                                     [tag(15, 1001, "Free Kick", "Synthetic Home")], halves)
    assert restarts == {}
    assert labels == "X" * n


def test_4f_overlapping_kickoff_with_two_strikes_does_not_contaminate_the_next_half_codex_c():
    labels, restarts = kickoff_case([8, 20], [SPANNING])
    assert restarts == {8: H}
    assert labels == "D" * 8 + "H" * 7 + "X" * 10 + "X" * 15


def test_4f_legitimate_strike_inside_a_half_is_still_detected():
    labels, restarts = kickoff_case([30], [tag(24, 36, "Free Kick", "Synthetic Away")])
    assert restarts == {30: A}
    assert labels == "X" * 25 + "D" * 5 + "A" * 10   # in-half window before the strike: D


def test_4f_independent_kickoffs_in_both_halves():
    tags = [tag(2, 12, "Kick Off (Start)", "Synthetic Home"),
            tag(26, 36, "Kick Off (Start)", "Synthetic Away")]
    labels, restarts = kickoff_case([8, 33], tags)
    assert restarts == {8: H, 33: A}
    assert labels == "D" * 8 + "H" * 7 + "X" * 10 + "D" * 8 + "A" * 7


def test_4f_strike_exactly_at_the_half_start_counts_ungraded_frames_give_stillness_only():
    # Still ball over the ungraded frames 16..24, struck at 25 = the half's first frame.
    labels, restarts = kickoff_case([25], [tag(16, 35, "Kick Off (Start)", "Synthetic Away")])
    assert restarts == {25: A}
    assert labels == "X" * 25 + "A" * 15


def test_4f_strike_at_the_exclusive_half_end_is_not_in_the_half():
    labels, restarts = kickoff_case([15], [tag(2, 20, "Free Kick", "Synthetic Home")])
    assert restarts == {}
    assert labels == "X" * 40
    labels, restarts = kickoff_case([14], [tag(2, 20, "Free Kick", "Synthetic Home")])
    assert restarts == {14: H}                        # the half's last frame does count
    assert labels == "X" * 2 + "D" * 12 + "H" + "X" * 25
