"""Possession inference: control evidence, dead-ball/restart evidence, and a state machine.

    python src/possession.py --out outputs/possession_v3b.csv

Five separate stages:

  1. Tracking observation (`read_tracking`): per frame, each team's nearest distance to the ball,
     and the ball's position and speed.
  2. Control evidence (`control_evidence`, Phase 3A): a team controls the ball when its nearest
     player is within CONTROL_RADIUS and the other team's nearest is at least MARGIN further away.
  3. Dead-ball / restart evidence (`game_evidence`, Phase 3B):
       * confirmed dead: ball tracked outside the pitch lines (sustained), the part of a Smart
         Tagging set-piece window before the ball is struck, and pre-kickoff frames of a half;
       * restarts: the frame a set piece's ball is struck, with the tagged team when it maps.
  4. Possession state (`infer_states`), run independently per half from an unknown state:
       * a team takes possession after CONFIRM consecutive control frames, backdated to the run;
       * held through ball flight, contested frames and missing-ball gaps up to MAX_GAP;
       * a confirmed dead frame ends the possession (state D), and D persists -- also through
         missing-ball frames -- until a restart; a restart sets the tagged team, or leaves the
         team open and backdates the first established team to the restart frame;
       * without a tagged restart ahead -- or once this stoppage's own set-piece tag has passed
         without a locatable strike -- sustained control also ends a stoppage.

Ball speed: the official starter (`starter/baseline.py`) describes every raw group, the ball's
included, as "x,y,speed", and the official DATA.md says the ATD gives "the position and speed of
every object ... including the ball", stating m/s for the player slots. The unit of the ball's
value is therefore taken to be m/s by the shared group format; it is not stated separately for the
ball. If restarts cannot be located, the engine degrades towards out-of-bounds dead ball plus
sustained control rather than failing.
  5. Output (`to_labels`): H, A, D; X where no possession is established or outside the halves.

The tracking files, frame numbering, team mapping and output format are those of
src/baseline.py, which is reused and stays unchanged. The raw-line parser below follows the same
format rules as the official starter (MIT, Copyright (c) 2026-2027 Metrica Sports; full notice in
src/baseline.py) but keeps each team's nearest distance and the ball's position and speed.
"""

import argparse
import bisect
import os
import sys
import xml.etree.ElementTree as ET
from collections import namedtuple

import numpy as np

import smart_tagging
from baseline import (AWAY, FIELD_SEP, GAME_STEM, GROUP_SEP, HOME, MISSING, N_VIDEO_FRAMES,
                      PITCH, data_paths, team_of_each_track, write_submission)

FPS = 25  # tactical source frame rate (official games.py)

# The two graded halves in video frames, half-open [first, last + 1). Source: official games.py
# half_video_blocks("BAR-ATH") -> [(1, 11185, 90651), (2, 110808, 190197)], also tabled in the
# official DATA.md ("boundaries, not answers ... they reveal no label"). Everything outside them
# (before the match, halftime, after the final whistle) is ungraded; we write X there.
HALVES = ((11185, 90652), (110808, 190198))

# Evidence codes (per frame). HOME and AWAY come from baseline.py (0 and 1).
NO_CONTROL = -1   # ball tracked, but no team has credible control
NO_BALL = -2      # ball not tracked in this frame

# State codes.
UNKNOWN = 2
DEAD = 3

# Where each frame's label comes from -- kept for diagnostics on synthetic data.
SRC_UNKNOWN = 0   # no established possession
SRC_CONTROL = 1   # the labelled team has control evidence in this frame
SRC_CARRIED = 2   # ball tracked, no evidence for the labelled team; possession carried over
SRC_GAP = 3       # ball not tracked; possession carried over
SRC_DEAD = 4      # stoppage
SRC_RESTART = 5   # possession set by a tagged restart

Params = namedtuple("Params", "control_radius_m margin_m confirm_frames max_gap_frames")

# Every value is an a-priori engineering assumption, NOT fitted to the competition match.
# Rationale per parameter: see README "Possession engine".
DEFAULTS = Params(
    control_radius_m=2.0,        # metres: ball within ~a stride of the player's tracked centre
    margin_m=1.0,                # metres: opponent's nearest must be this much further away
    confirm_frames=10,           # frames: 0.4 s of sustained opposing control to switch
    max_gap_frames=10 * FPS,     # frames: hold possession through ball dropouts up to 10 s
)

GameParams = namedtuple("GameParams", "out_tolerance_m out_confirm_frames restart_speed_mps "
                                      "restart_still_frames stoppage_lookahead_frames")

GAME_DEFAULTS = GameParams(
    out_tolerance_m=0.5,              # metres beyond a line before the ball counts as out
    out_confirm_frames=3,             # tracked frames out in a row before it is confirmed
    restart_speed_mps=4.0,            # m/s: a struck/thrown ball, not one placed or carried
    restart_still_frames=5,           # tracked slow frames needed before the strike
    stoppage_lookahead_frames=90 * FPS,  # frames: wait this long for a tagged restart
)

Tracking = namedtuple("Tracking", "home away ball_x ball_y ball_speed")


# -- 1. tracking observation --------------------------------------------------------------------

def _xys(group):
    first = group.index(",")
    second = group.index(",", first + 1)
    return float(group[:first]), float(group[first + 1:second]), group[second + 1:]


def read_tracking(raw_path, team_of_track, n_frames, pitch=PITCH):
    """Per-frame arrays: each team's nearest distance to the ball (m), ball x/y (m), ball speed.

    NaN everywhere the ball is not tracked (or the frame is absent); a team with no tracked
    player gets inf. Line format and frame numbering as in src/baseline.py.
    """
    length, width = pitch
    home, away = np.full(n_frames, np.nan), np.full(n_frames, np.nan)
    ball_x, ball_y, ball_speed = (np.full(n_frames, np.nan) for _ in range(3))

    with open(raw_path, encoding="utf-8") as handle:
        for line in handle:
            parts = line.split(FIELD_SEP)
            if len(parts) != 3:
                continue
            ball = parts[2]
            if ball[0] == MISSING:
                continue
            bx, by, speed = _xys(ball)
            bx, by = bx * length, by * width

            best = [np.inf, np.inf]
            for slot, group in enumerate(parts[1].split(GROUP_SEP)):
                if group[0] == MISSING:
                    continue
                px, py, _ = _xys(group)
                dx, dy = px * length - bx, py * width - by
                distance = (dx * dx + dy * dy) ** 0.5
                team = team_of_track[slot]
                if distance < best[team]:
                    best[team] = distance

            frame = int(parts[0]) - 1  # frame_id counts from 1, submissions from 0
            home[frame], away[frame] = best[HOME], best[AWAY]
            ball_x[frame], ball_y[frame] = bx, by
            try:
                ball_speed[frame] = float(speed)
            except ValueError:
                pass
    return Tracking(home, away, ball_x, ball_y, ball_speed)


def team_distances(raw_path, team_of_track, n_frames, pitch=PITCH):
    """(home, away) nearest distances; see read_tracking."""
    tracking = read_tracking(raw_path, team_of_track, n_frames, pitch)
    return tracking.home, tracking.away


def team_names(meta_path):
    """[home name, away name], in the order team_of_each_track uses (first <Team> is home)."""
    root = ET.parse(meta_path).getroot()
    return [(team.findtext("Name") or team.get("name") or team.get("id") or "").strip()
            for team in root.iter("Team")]


# -- 2. control evidence ----------------------------------------------------------------------

def control_evidence(d_home, d_away, params=DEFAULTS):
    """Per-frame evidence: HOME, AWAY, NO_CONTROL or NO_BALL. No temporal logic here."""
    d_home, d_away = np.asarray(d_home, float), np.asarray(d_away, float)
    evidence = np.full(len(d_home), NO_CONTROL, dtype=np.int8)
    ball = ~(np.isnan(d_home) | np.isnan(d_away))

    with np.errstate(invalid="ignore"):  # inf - inf when neither team is tracked -> NaN -> False
        home = ball & (d_home <= params.control_radius_m) & (d_home < d_away) \
            & (d_away - d_home >= params.margin_m)
        away = ball & (d_away <= params.control_radius_m) & (d_away < d_home) \
            & (d_home - d_away >= params.margin_m)

    evidence[~ball] = NO_BALL
    evidence[home] = HOME
    evidence[away] = AWAY
    return evidence


# -- 3. dead-ball and restart evidence -----------------------------------------------------------

def out_of_bounds(ball_x, ball_y, pitch=PITCH, game=GAME_DEFAULTS):
    """Confirmed-dead mask: the ball tracked beyond a pitch line by more than the tolerance, for
    out_confirm_frames tracked frames in a row (missing frames pause the count). Marks the
    tracked out frames of a confirmed run, from its first one."""
    length, width = pitch
    tol = game.out_tolerance_m
    x, y = np.asarray(ball_x, float), np.asarray(ball_y, float)
    with np.errstate(invalid="ignore"):
        out = (x < -tol) | (x > length + tol) | (y < -tol) | (y > width + tol)
    seen = ~np.isnan(x)

    dead = np.zeros(len(x), dtype=bool)
    run_start, count = 0, 0
    for i in np.flatnonzero(seen):
        if not out[i]:
            count = 0
            continue
        if count == 0:
            run_start = i
        count += 1
        if count == game.out_confirm_frames:             # confirmed: mark the run so far
            dead[run_start:i + 1] = out[run_start:i + 1]
        elif count > game.out_confirm_frames:
            dead[i] = True
    return dead


def locate_restart(start, end, ball_speed, game=GAME_DEFAULTS):
    """Frame inside [start, end) where a set piece's ball is struck, or None.

    The strike is the first tracked frame at restart_speed_mps or faster, and it only counts if
    at least restart_still_frames tracked frames before it in the window were slower: a dead ball
    lies still (or is carried) before a restart. A ball already moving fast at the start of the
    window means live play or a mistimed tag, so the tag is not used.
    """
    still = 0
    for frame in range(max(0, start), min(len(ball_speed), end)):
        speed = ball_speed[frame]
        if speed != speed:  # NaN: ball not tracked
            continue
        if speed >= game.restart_speed_mps:
            return frame if still >= game.restart_still_frames else None
        still += 1
    return None


def game_evidence(tracking, tags, names, segments, pitch=PITCH, game=GAME_DEFAULTS):
    """(dead mask, {restart frame: HOME | AWAY | UNKNOWN}) from tracking and Smart Tagging tags.

    * Out-of-bounds frames are confirmed dead.
    * Each SET PIECES tag whose strike is located gives a restart at the strike, and the frames
      from the tag start to the strike are dead. Unlocated tags are dropped. Several tags on
      the same strike merge; tagged teams that disagree make the team unknown.
    * Each segment (half) is dead from its start to its first Kick Off (Start) strike. If that
      strike cannot be located, only the frames before the kickoff tag are marked dead.
    """
    n = len(tracking.ball_x)
    dead = out_of_bounds(tracking.ball_x, tracking.ball_y, pitch, game)
    restarts = {}

    def add_restart(frame, team):
        if frame not in restarts or restarts[frame] == UNKNOWN:
            restarts[frame] = team
        elif team != UNKNOWN and team != restarts[frame]:
            restarts[frame] = UNKNOWN  # contradictory tags

    def side(tag):
        index = smart_tagging.match_team(tag.team, names)
        return (HOME, AWAY)[index] if index is not None else UNKNOWN

    pieces = smart_tagging.set_pieces(tags)
    for tag in pieces:
        strike = locate_restart(tag.start_frame, tag.end_frame, tracking.ball_speed, game)
        if strike is not None:
            dead[max(0, tag.start_frame):strike] = True
            add_restart(strike, side(tag))

    kickoffs = sorted((tag for tag in pieces if tag.type == smart_tagging.KICKOFF_START),
                      key=lambda tag: tag.start_frame)
    for lo, hi in segments:
        tag = next((t for t in kickoffs if t.start_frame < hi and t.end_frame > lo), None)
        if tag is None:
            continue  # no kickoff tag: the half starts unknown, nothing is invented
        strike = locate_restart(tag.start_frame, tag.end_frame, tracking.ball_speed, game)
        if strike is None:
            dead[lo:min(hi, max(lo, tag.start_frame))] = True
        else:
            strike = min(max(strike, lo), hi - 1)
            dead[lo:strike] = True
            add_restart(strike, side(tag))

    for frame in restarts:  # the strike itself is live
        if 0 <= frame < n:
            dead[frame] = False
    return dead, restarts


def missed_restarts(tracking, tags, game=GAME_DEFAULTS):
    """Mask of the frames covered by SET PIECES windows whose strike could not be located.

    A stoppage that has passed such a window has lost its own restart, so it must not wait for a
    later stoppage's restart (see _run_segment).
    """
    mask = np.zeros(len(tracking.ball_speed), dtype=bool)
    for tag in smart_tagging.set_pieces(tags):
        if locate_restart(tag.start_frame, tag.end_frame, tracking.ball_speed, game) is None:
            mask[max(0, tag.start_frame):max(0, tag.end_frame)] = True
    return mask


# -- 4. possession state machine ----------------------------------------------------------------

def _held(state):
    return {HOME: SRC_CARRIED, AWAY: SRC_CARRIED, DEAD: SRC_DEAD}.get(state, SRC_UNKNOWN)


def _run_segment(evidence, lo, hi, params, state_out, source_out, dead, restarts, lookahead,
                 missed_count=None):
    """State machine on [lo, hi); starts UNKNOWN and shares nothing outside the segment.

    missed_count is the cumulative count of missed-restart frames (len n + 1), or None.
    """
    restart_frames = sorted(f for f in restarts if lo <= f < hi)
    state = UNKNOWN
    candidate, run_start, run_length = None, 0, 0
    gap = 0
    floor = None  # frame of a restart whose team is unknown: the first team is backdated to it
    onset = lo    # first frame of the current stoppage

    def waits_for_restart(i):
        """In a stoppage: is a tagged restart coming that can still be this stoppage's own?"""
        if not restart_frames or bisect.bisect_right(restart_frames, i + lookahead) == \
                bisect.bisect_right(restart_frames, i):
            return False
        # A set-piece window inside this stoppage whose strike was not found means its restart
        # was missed; a later restart belongs to another stoppage.
        return missed_count is None or missed_count[i + 1] == missed_count[onset]

    for i in range(lo, hi):
        if dead is not None and dead[i]:                 # confirmed stoppage ends possession
            if state != DEAD:
                onset = i
            state, candidate, floor, gap = DEAD, None, None, 0
            state_out[i], source_out[i] = DEAD, SRC_DEAD
            continue

        restarted = i in restarts
        if restarted:
            team = restarts[i]
            candidate, gap = None, 0
            state, floor = (team, None) if team in (HOME, AWAY) else (UNKNOWN, i)

        seen = evidence[i]
        if seen == NO_BALL:
            gap += 1
            if state != DEAD and gap > params.max_gap_frames:   # too long to carry over
                state, candidate, floor = UNKNOWN, None, None
            state_out[i] = state                         # a pending run is paused, not reset
            source_out[i] = SRC_GAP if state in (HOME, AWAY) else _held(state)
        else:
            gap = 0
            if seen == NO_CONTROL:                       # contradicts any pending run
                candidate = None
                state_out[i], source_out[i] = state, _held(state)
            elif seen == state:                          # current team confirmed again
                candidate = None
                state_out[i], source_out[i] = state, SRC_CONTROL
            elif state == DEAD and waits_for_restart(i):
                candidate = None                         # its tagged restart is coming: wait
                state_out[i], source_out[i] = DEAD, SRC_DEAD
            else:                                        # another team (or a first team)
                if seen != candidate:
                    candidate, run_start, run_length = seen, i, 0
                run_length += 1
                state_out[i], source_out[i] = state, _held(state)
                if run_length >= params.confirm_frames:  # switch, backdated
                    start = floor if floor is not None else run_start
                    state, candidate, floor = seen, None, None
                    run = slice(start, i + 1)
                    state_out[run] = state
                    source_out[run] = np.select(
                        [evidence[run] == NO_BALL, evidence[run] == state],
                        [SRC_GAP, SRC_CONTROL], SRC_CARRIED)

        if restarted:
            source_out[i] = SRC_RESTART


def infer_states(evidence, params=DEFAULTS, segments=None, dead=None, restarts=None,
                 game=GAME_DEFAULTS, missed=None):
    """(state, source) per frame. Each (start, stop) segment runs independently from UNKNOWN.

    segments=None means one segment over everything; frames outside all segments are UNKNOWN.
    dead (bool mask), restarts ({frame: team}) and missed (bool mask, see missed_restarts) are the
    Phase 3B evidence; without them the behaviour is exactly Phase 3A's.
    """
    n = len(evidence)
    state = np.full(n, UNKNOWN, dtype=np.int8)
    source = np.full(n, SRC_UNKNOWN, dtype=np.int8)
    missed_count = None
    if missed is not None:
        missed_count = np.concatenate(([0], np.cumsum(np.asarray(missed, dtype=bool))))
    for lo, hi in (segments if segments is not None else [(0, n)]):
        _run_segment(evidence, max(0, lo), min(n, hi), params, state, source, dead,
                     restarts or {}, game.stoppage_lookahead_frames, missed_count)
    return state, source


def to_labels(state):
    out = np.full(len(state), "X", dtype="<U1")
    out[state == HOME] = "H"
    out[state == AWAY] = "A"
    out[state == DEAD] = "D"
    return out


# -- 5. pipeline ----------------------------------------------------------------------------

def build_labels(meta_path, raw_path, n_frames=N_VIDEO_FRAMES, params=DEFAULTS, segments=None,
                 tags_path=None, game=GAME_DEFAULTS, pitch=PITCH):
    """Tracking files (and optionally Smart Tagging) in, one H/A/D/X label per frame out."""
    tracking = read_tracking(raw_path, team_of_each_track(meta_path), n_frames, pitch)
    evidence = control_evidence(tracking.home, tracking.away, params)
    tags = smart_tagging.load(tags_path) if tags_path else []
    dead, restarts = game_evidence(tracking, tags, team_names(meta_path),
                                   segments if segments is not None else [(0, n_frames)],
                                   pitch, game)
    missed = missed_restarts(tracking, tags, game)
    state, _ = infer_states(evidence, params, segments, dead, restarts, game, missed)
    return to_labels(state)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Possession inference (Phase 3B).")
    parser.add_argument("--out", required=True, help="output CSV path (keep it under outputs/)")
    parser.add_argument("--data-dir", default=os.environ.get("MTAH_DATA_DIR"),
                        help="match data root containing tactical/ (default: $MTAH_DATA_DIR)")
    args = parser.parse_args(argv)
    if not args.data_dir:
        parser.error("set MTAH_DATA_DIR or pass --data-dir")

    meta_path, raw_path = data_paths(args.data_dir)
    tags_path = os.path.join(args.data_dir, "tactical", GAME_STEM + "_smart_tagging.xml")
    if not os.path.isfile(tags_path):
        print("smart tagging file not found; running without restart evidence")
        tags_path = None
    write_submission(args.out, build_labels(meta_path, raw_path, segments=HALVES,
                                            tags_path=tags_path))
    print("wrote {}".format(args.out))  # the path only; nothing derived from the data
    return 0


if __name__ == "__main__":
    sys.exit(main())
