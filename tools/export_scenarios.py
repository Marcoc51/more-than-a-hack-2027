"""Export synthetic scenarios for the MAF FC Possession Explorer (explorer/).

    python tools/export_scenarios.py           # write explorer/src/scenario/generated/*.json
    python tools/export_scenarios.py --check   # exit 1 if any committed JSON is out of date

Every scenario is scripted here, in code, from scratch: no match data is read. Each script is
written to temporary files in the same raw ATD / metadata / Smart Tagging formats that the
synthetic tests use, and the UNCHANGED engines are run on those files:

  * MAF FC Phase 3B: possession.build_labels (with the default parameters);
  * official smooth50: baseline.build_labels (the reproduction of the organisers' baseline).

The per-frame evidence and reason codes come from the same public functions that
possession.build_labels composes; the export asserts that this composition reproduces
build_labels exactly. Nothing is hand-labelled except each scenario's own reference labels,
which are written down from the script and kept separate from the model output. The synthetic
scores come from the organisers' public scorer (tools/vendor/possession_metrics.py, unchanged),
with the script reference as the ground truth.

Safety: there are no input path arguments, MTAH_DATA_DIR is never read, every path is checked
against dataset/ and outputs/, and the only outputs are the fixed JSON paths below.
"""

import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile
from collections import namedtuple

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))
sys.path.insert(0, os.path.join(ROOT, "tools", "vendor"))

import baseline  # noqa: E402  (unchanged official-baseline reproduction)
import possession  # noqa: E402  (unchanged Phase 3B engine)
import possession_metrics  # noqa: E402  (organisers' public scorer, vendored unchanged)
import smart_tagging  # noqa: E402

GENERATOR_VERSION = "2.0.0"
OUT_DIR = os.path.join(ROOT, "explorer", "src", "scenario", "generated")
ENGINE_FILES = ("src/possession.py", "src/baseline.py", "src/smart_tagging.py")
SCORER_FILE = "tools/vendor/possession_metrics.py"
SCORER_SOURCE = ("metrica-sports/more-than-a-hack-2027 evaluation/possession_metrics.py "
                 "@ f8f2629ff1e0985f81d7e59d8413678514ee1530")
FORBIDDEN_DIRS = ("dataset", "outputs")

FPS = possession.FPS
LENGTH, WIDTH = baseline.PITCH
CENTRE = (LENGTH / 2, WIDTH / 2)
BALL_RADIUS = 0.11  # metres: the whole ball must cross a line (Law 9)
REASON_NAMES = {possession.SRC_UNKNOWN: "unknown", possession.SRC_CONTROL: "control",
                possession.SRC_CARRIED: "carried", possession.SRC_GAP: "gap",
                possession.SRC_DEAD: "dead", possession.SRC_RESTART: "restart"}
EVIDENCE_CODES = {baseline.HOME: "H", baseline.AWAY: "A", possession.NO_CONTROL: ".",
                  possession.NO_BALL: "_"}


def assert_safe(path):
    """Refuse any path inside the repository's restricted dataset/ or outputs/ folders."""
    real = os.path.realpath(path)
    for name in FORBIDDEN_DIRS:
        banned = os.path.realpath(os.path.join(ROOT, name))
        if real == banned or real.startswith(banned + os.sep):
            raise RuntimeError("refusing restricted path: " + name + "/")
    return path


# -- shared squad ---------------------------------------------------------------------------

HOME_BASE = {1: ("GK", 5.0, 34.0), 2: ("RB", 22.0, 56.0), 3: ("LB", 22.0, 12.0),
             4: ("CB", 18.0, 40.0), 5: ("CB", 18.0, 28.0), 6: ("CM", 42.0, 34.0),
             7: ("RW", 49.0, 56.0), 8: ("CM", 40.0, 46.0), 9: ("ST", 52.2, 34.6),
             10: ("CM", 40.0, 22.0), 11: ("LW", 49.0, 12.0)}
AWAY_BASE = {1: ("GK", 100.3, 34.0), 2: ("RB", 83.0, 12.0), 3: ("LB", 83.0, 56.0),
             4: ("CB", 87.0, 28.0), 5: ("CB", 87.0, 40.0), 6: ("CM", 70.0, 34.0),
             7: ("RW", 60.0, 12.0), 8: ("CM", 66.0, 24.0), 9: ("ST", 62.5, 34.0),
             10: ("CM", 66.0, 44.0), 11: ("LW", 60.0, 56.0)}
PLAYERS = [("home", n) for n in sorted(HOME_BASE)] + [("away", n) for n in sorted(AWAY_BASE)]

# A scenario script.
#   actors:  (team, shirt) -> [(frame, x, y), ...], linear between keyframes; other players hold
#            their base position, drifting with the ball from `live_from` on.
#   ball:    phases (start, end, kind, args): "still" fixed point; "carry" just ahead of a
#            player; "pass" straight line (the start frame already moves); "path" keyframes;
#            "missing" not tracked.
#   tags:    Smart Tagging SET PIECES instances: (start, end, type, team text).
#   reference: [(start, end, label)], written from the script; never from a model.
Spec = namedtuple("Spec", "id title description n_frames graded live_from actors ball "
                          "missing tags reference events")


def lerp_path(keys, frame):
    if frame <= keys[0][0]:
        return keys[0][1], keys[0][2]
    for (f0, x0, y0), (f1, x1, y1) in zip(keys, keys[1:]):
        if f0 <= frame <= f1:
            t = (frame - f0) / (f1 - f0)
            return x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
    return keys[-1][1], keys[-1][2]


def ball_xy(spec, frame, positions):
    for start, end, kind, args in spec.ball:
        if start <= frame < end:
            if kind == "missing":
                return None
            if kind == "still":
                return args
            if kind == "path":
                return lerp_path(args, frame)
            if kind == "carry":
                actor, dx, dy = args
                x, y = positions[actor]
                return x + dx, y + dy
            (x0, y0), (x1, y1) = args
            t = (frame - start + 1) / (end - start)  # the strike frame already moves
            return x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
    raise ValueError(frame)


def build(spec):
    """Per-frame positions (metres) for a scenario script, deterministic."""
    frames = []
    anchor = CENTRE
    for f in range(spec.n_frames):
        live = f >= spec.live_from
        positions = {}
        for team, shirt in PLAYERS:
            if (team, shirt) in spec.actors:
                positions[(team, shirt)] = lerp_path(spec.actors[(team, shirt)], f)
                continue
            role, bx, by = (HOME_BASE if team == "home" else AWAY_BASE)[shirt]
            k = 0.12 if role == "GK" else (0.35 if live else 0.0)
            wobble = 0.0 if not live else 0.6 * math.sin(f / 23.0 + shirt * 1.7 + (team == "away"))
            positions[(team, shirt)] = (bx + k * (anchor[0] - CENTRE[0]) + wobble,
                                        by + 0.15 * (anchor[1] - CENTRE[1]) * live)
        ball = ball_xy(spec, f, positions)
        if ball is not None:
            anchor = ball
        observed = [None if (p in spec.missing and spec.missing[p][0] <= f < spec.missing[p][1])
                    else positions[p] for p in PLAYERS]
        frames.append((observed, ball))
    return frames


def phase_end(spec, kind, actor):
    """End frame of the first ball phase of `kind` involving `actor` (a script fact)."""
    return next(p[1] for p in spec.ball if p[2] == kind and p[3][0] == actor)


def phase_start(spec, kind, actor):
    return next(p[0] for p in spec.ball if p[2] == kind and p[3][0] == actor)


def first_out_frame(spec, start, end):
    """First frame in [start, end) where the scripted ball is wholly over a line."""
    frames = build(spec)
    for f in range(start, end):
        ball = frames[f][1]
        if ball and (ball[0] < -BALL_RADIUS or ball[0] > LENGTH + BALL_RADIUS
                     or ball[1] < -BALL_RADIUS or ball[1] > WIDTH + BALL_RADIUS):
            return f
    raise ValueError("ball never goes out")


# -- S1: kickoff, ball out, throw-in -----------------------------------------------------------

_S1_BALL = [
    (0, 61, "still", CENTRE),
    (61, 74, "pass", (CENTRE, (42.7, 34.0))),
    (74, 110, "carry", (("home", 6), 0.7, 0.0)),
    (110, 134, "pass", ((50.7, 40.0), (60.6, 58.0))),
    (134, 176, "carry", (("home", 7), 0.7, 0.0)),
    (176, 191, "pass", ((74.7, 62.0), (80.0, 71.5))),
    (191, 230, "missing", None),
    (230, 261, "still", (80.0, 68.3)),
    (261, 280, "pass", ((80.0, 68.3), (71.4, 57.8))),
    (280, 318, "carry", (("away", 10), -0.7, 0.0)),
    (318, 322, "pass", ((62.3, 50.0), (59.2, 47.3))),
    (322, 329, "carry", (("home", 8), 0.2, 0.3)),
    (329, 345, "carry", (("away", 6), -0.7, 0.0)),
    (345, 365, "pass", ((51.3, 40.0), (39.8, 36.0))),
    (365, 400, "carry", (("away", 9), -0.7, 0.0)),
]
# The brief home touch, defined by the ball script (not by any model output): the loose pass
# reaches home #8 on the last frame of its "pass" phase (the frame before home #8's carry starts),
# home #8 carries it, and away #6 wins it back when that carry ends. Half-open [arrival, regain).
BRIEF_TOUCH = (next(c[0] for c in _S1_BALL if c[2] == "carry" and c[3][0] == ("home", 8)) - 1,
               next(c[1] for c in _S1_BALL if c[2] == "carry" and c[3][0] == ("home", 8)))

S1 = Spec(
    id="s1",
    title="Kickoff, ball out, throw-in",
    description=("A scripted 16-second sequence: pre-match footage, kickoff, a home build-up down the "
                 "right, a cross that goes out for a throw-in, the away restart, a brief home touch, "
                 "and footage after the graded interval."),
    n_frames=400, graded=[(25, 375)], live_from=61,
    actors={
        ("home", 9): [(0, 52.2, 34.6), (60, 52.2, 34.6), (90, 56.0, 36.0)],
        ("home", 6): [(0, 42.0, 34.0), (74, 42.0, 34.0), (110, 50.0, 40.0), (140, 52.0, 42.0)],
        ("home", 7): [(0, 49.0, 56.0), (100, 55.0, 57.0), (134, 60.0, 58.0), (176, 74.0, 62.0),
                      (200, 74.5, 62.5), (259, 73.0, 61.0), (300, 66.0, 56.0)],
        ("away", 3): [(0, 83.0, 56.0), (140, 79.0, 58.0), (160, 75.6, 61.0), (176, 74.4, 63.4),
                      (200, 78.0, 66.0), (229, 80.0, 68.9), (260, 80.0, 68.9), (290, 77.0, 64.0)],
        ("away", 10): [(0, 66.0, 44.0), (240, 70.0, 54.0), (280, 72.0, 58.0), (318, 63.0, 50.0),
                       (340, 60.0, 49.0)],
        ("home", 8): [(0, 40.0, 46.0), (200, 52.0, 50.0), (300, 58.0, 48.0), (318, 59.0, 47.5),
                      (329, 59.3, 47.0), (350, 54.0, 44.0)],
        ("away", 6): [(0, 70.0, 34.0), (300, 64.0, 42.0), (329, 60.2, 46.4), (345, 52.0, 40.0),
                      (360, 48.0, 38.0)],
        ("away", 9): [(0, 62.5, 34.0), (300, 50.0, 34.0), (365, 40.5, 36.0), (399, 32.0, 35.0)],
    },
    ball=_S1_BALL,
    missing={("away", 7): (100, 126)},
    tags=[(20, 100, "Kick Off (Start)", "Synthetic Home"), (232, 290, "Throw-in", "N/A")],
    # A strike is the last frame the ball rests on: the raw speed field is the speed with which
    # the ball leaves the frame.
    reference=[(0, 25, "X"), (25, 60, "D"), (60, 186, "H"), (186, 260, "D"), (260, 375, "A"),
               (375, 400, "X")],
    events=[
        {"type": "half-start", "frame": 25, "teamId": None, "source": "scenario",
         "description": "Graded interval starts (frames before it are ungraded)."},
        {"type": "kickoff", "frame": 60, "interval": [20, 100], "teamId": "home",
         "source": "smart-tagging", "description": "Kick Off (Start) set-piece tag, Team: Synthetic Home."},
        {"type": "ball-out", "frame": 186, "teamId": None, "source": "scenario",
         "description": "The whole ball crosses the touchline after a home cross."},
        {"type": "throw-in", "frame": 260, "interval": [232, 290], "teamId": None,
         "source": "smart-tagging", "description": "Throw-in set-piece tag, Team: N/A (as for every throw-in)."},
        {"type": "brief-touch", "frame": BRIEF_TOUCH[0], "interval": list(BRIEF_TOUCH), "teamId": "home",
         "source": "scenario",
         "description": ("A loose away pass reaches home #8, who keeps the ball for {} frames before away "
                         "#6 wins it back; by the script, away keeps possession.").format(
                             BRIEF_TOUCH[1] - BRIEF_TOUCH[0])},
        {"type": "half-end", "frame": 375, "teamId": None, "source": "scenario",
         "description": "Graded interval ends (frames after it are ungraded)."},
    ],
)

# -- S2: contested loose ball ----------------------------------------------------------------
# Home #6 carries, plays a loose pass, and home #10 and away #8 scramble for the ball. Each side
# gets short bursts of clear control (under the engine's 10-observation threshold) until away #8
# wins the ball outright and keeps it.

_S2_LOOSE = [(90, 60.0, 31.0), (105, 60.6, 30.5), (120, 61.4, 30.2), (135, 62.0, 29.8), (152, 62.8, 29.4)]
# (frame, home #10 offset from the ball, away #8 offset from the ball)
_S2_CONTEST = [(90, (-1.3, 0.2), (1.4, -0.3)), (100, (-1.2, 0.0), (1.3, 0.0)),
               (104, (-2.1, 0.0), (0.5, 0.0)), (110, (-2.1, 0.0), (0.5, 0.0)),
               (114, (-1.2, 0.2), (1.2, -0.2)), (119, (-0.5, 0.0), (2.0, 0.3)),
               (126, (-0.5, 0.0), (2.0, 0.3)), (130, (-1.2, 0.1), (1.2, 0.0)),
               (138, (-1.3, 0.0), (1.2, 0.1)), (141, (-2.0, 0.0), (0.5, 0.0)),
               (147, (-2.0, 0.0), (0.5, 0.0)), (150, (-1.4, 0.0), (0.9, 0.0)),
               (152, (-1.6, 0.0), (0.6, 0.0))]
S2_WIN = 152


def _s2_actor(index):
    keys = []
    for frame, *offsets in _S2_CONTEST:
        bx, by = lerp_path(_S2_LOOSE, frame)
        dx, dy = offsets[index]
        keys.append((frame, bx + dx, by + dy))
    return keys


S2 = Spec(
    id="s2",
    title="Contested loose ball",
    description=("Home builds through midfield, then a loose pass starts a 60-frame scramble. Home and "
                 "away each get short bursts of clear control before away wins the ball outright."),
    n_frames=300, graded=[(0, 300)], live_from=0,
    actors={
        ("home", 6): [(0, 45.0, 34.0), (70, 55.0, 36.0), (110, 54.0, 38.0)],
        ("home", 10): [(0, 50.0, 26.0), (60, 56.0, 30.0)] + _s2_actor(0)
                      + [(175, 58.0, 30.0), (300, 52.0, 28.0)],
        ("away", 8): [(0, 66.0, 24.0), (60, 64.0, 28.0)] + _s2_actor(1)
                     + [(240, 68.0, 22.0)],
        ("away", 6): [(0, 70.0, 34.0), (240, 70.0, 30.0), (262, 71.0, 30.0), (300, 64.0, 33.0)],
    },
    ball=[
        (0, 70, "carry", (("home", 6), 0.7, 0.0)),
        (70, 90, "pass", ((55.7, 36.0), (60.0, 31.0))),
        (90, S2_WIN, "path", _S2_LOOSE),
        (S2_WIN, 240, "carry", (("away", 8), 0.5, -0.5)),
        (240, 262, "pass", ((68.5, 21.5), (70.3, 30.0))),
        (262, 300, "carry", (("away", 6), -0.7, 0.0)),
    ],
    missing={},
    tags=[],
    reference=[(0, S2_WIN, "H"), (S2_WIN, 300, "A")],
    events=[
        {"type": "loose-pass", "frame": 70, "interval": [70, 90], "teamId": "home", "source": "scenario",
         "description": "Home #6 plays an under-hit pass; nobody controls it."},
        {"type": "contest", "frame": 90, "interval": [90, S2_WIN], "teamId": None, "source": "scenario",
         "description": ("Home #10 and away #8 scramble for the ball. Each gets short bursts of clear "
                         "control; by the script, home keeps possession until away wins it.")},
        {"type": "away-wins-ball", "frame": S2_WIN, "teamId": "away", "source": "scenario",
         "description": "Away #8 wins the ball outright and keeps it."},
        {"type": "pass", "frame": 240, "interval": [240, 262], "teamId": "away", "source": "scenario",
         "description": "Away #8 passes to away #6."},
    ],
)

# -- S3: missing ball tracking -----------------------------------------------------------------
# Home keeps the ball down the right; ball tracking is then lost for 100 frames (4 s). Players stay
# tracked, and during the gap away #3 tackles home #7 and takes the ball. Tracking resumes with the
# ball at away #3's feet. The ball is never interpolated through the gap.

S3_GAP = (100, 200)
S3_TACKLE = 140
S3 = Spec(
    id="s3",
    title="Ball tracking lost",
    description=("Home keeps the ball down the right, then ball tracking is lost for 4 seconds. Players "
                 "stay visible: away #3 tackles during the gap, and the ball reappears with away."),
    n_frames=300, graded=[(0, 300)], live_from=0,
    actors={
        ("home", 8): [(0, 40.0, 46.0), (60, 48.0, 44.0), (120, 52.0, 46.0)],
        ("home", 7): [(0, 49.0, 56.0), (80, 57.3, 56.0), (100, 62.0, 58.0), (S3_TACKLE, 66.0, 60.0),
                      (170, 64.0, 62.0), (300, 58.0, 58.0)],
        ("away", 3): [(0, 83.0, 56.0), (100, 72.0, 58.0), (S3_TACKLE, 66.6, 60.4), (200, 62.0, 52.0),
                      (240, 55.0, 46.0), (300, 60.0, 50.0)],
        ("away", 6): [(0, 70.0, 34.0), (200, 58.0, 40.0), (260, 50.7, 40.0), (300, 42.0, 38.0)],
    },
    ball=[
        (0, 60, "carry", (("home", 8), 0.7, 0.0)),
        (60, 80, "pass", ((48.7, 44.0), (58.0, 56.0))),
        (80, S3_GAP[0], "carry", (("home", 7), 0.7, 0.0)),
        (S3_GAP[0], S3_GAP[1], "missing", None),
        (S3_GAP[1], 240, "carry", (("away", 3), -0.7, 0.0)),
        (240, 260, "pass", ((54.3, 46.0), (50.0, 40.0))),
        (260, 300, "carry", (("away", 6), -0.7, 0.0)),
    ],
    missing={},
    tags=[],
    reference=[(0, S3_TACKLE, "H"), (S3_TACKLE, 300, "A")],
    events=[
        {"type": "tracking-lost", "frame": S3_GAP[0], "interval": list(S3_GAP), "teamId": None,
         "source": "scenario", "description": "The ball is not tracked for 100 frames (4.0 s); players still are."},
        {"type": "tackle", "frame": S3_TACKLE, "teamId": "away", "source": "scenario",
         "description": "Away #3 tackles home #7 and takes the ball, while the ball is untracked."},
        {"type": "tracking-resumes", "frame": S3_GAP[1], "teamId": "away", "source": "scenario",
         "description": "Ball tracking resumes, with the ball at away #3's feet."},
        {"type": "pass", "frame": 240, "interval": [240, 260], "teamId": "away", "source": "scenario",
         "description": "Away #3 passes to away #6."},
    ],
)

# -- S4: mistimed restart tag ------------------------------------------------------------------
# Home crosses over the near touchline. Away takes the throw-in at frame 135. The Smart Tagging
# Throw-in tag, however, is placed 50 frames late, over live play [185, 215), while away #8 dribbles
# slowly and then passes. The tag is given to the engine exactly as the parser reads it.

S4_THROW = 135
S4_TAG = (185, 215)
S4_BALL = [
    (0, 50, "carry", (("home", 11), 0.7, 0.0)),
    (50, 62, "pass", ((62.7, 6.0), (68.0, -3.0))),
    (62, 100, "missing", None),
    (100, S4_THROW + 1, "still", (70.0, -0.8)),
    (S4_THROW + 1, 150, "pass", ((70.0, -0.8), (65.3, 8.0))),
    (150, 205, "carry", (("away", 8), -0.7, 0.0)),
    (205, 225, "pass", ((60.3, 12.0), (50.3, 20.0))),
    (225, 320, "carry", (("away", 9), -0.7, 0.0)),
]
_S4_PARTIAL = Spec("s4", "", "", 320, [(0, 320)], 0, {
    ("home", 11): [(0, 52.0, 10.0), (50, 62.0, 6.0), (80, 64.0, 4.0), (300, 56.0, 10.0)],
}, S4_BALL, {}, [], [], [])
S4_OUT = first_out_frame(_S4_PARTIAL, 50, 62)
S4 = Spec(
    id="s4",
    title="Mistimed restart tag",
    description=("A home cross goes out for an away throw-in, taken at frame 135. The automatic "
                 "Smart Tagging throw-in tag is placed 50 frames late, over live play."),
    n_frames=320, graded=[(0, 320)], live_from=0,
    actors={
        ("home", 11): [(0, 52.0, 10.0), (50, 62.0, 6.0), (80, 64.0, 4.0), (300, 56.0, 10.0)],
        ("away", 2): [(0, 83.0, 12.0), (100, 70.0, -1.4), (S4_THROW, 70.0, -1.4), (160, 68.0, 4.0)],
        ("away", 8): [(0, 66.0, 24.0), (150, 66.0, 8.0), (205, 61.0, 12.0), (260, 56.0, 16.0)],
        ("away", 9): [(0, 62.5, 34.0), (225, 51.0, 20.0), (320, 40.0, 24.0)],
    },
    ball=S4_BALL,
    missing={},
    tags=[(S4_TAG[0], S4_TAG[1], "Throw-in", "N/A")],
    reference=[(0, S4_OUT, "H"), (S4_OUT, S4_THROW, "D"), (S4_THROW, 320, "A")],
    events=[
        {"type": "ball-out", "frame": S4_OUT, "teamId": None, "source": "scenario",
         "description": "The whole ball crosses the near touchline after a home cross."},
        {"type": "throw-in", "frame": S4_THROW, "teamId": "away", "source": "scenario",
         "description": "Away #2 takes the throw-in (scripted: the ball leaves the hands here)."},
        {"type": "mistimed-tag", "frame": S4_TAG[0], "interval": list(S4_TAG), "teamId": None,
         "source": "smart-tagging",
         "description": ("Throw-in set-piece tag, Team: N/A, placed {} frames after the real throw, "
                         "over live play.").format(S4_TAG[0] - S4_THROW)},
        {"type": "pass", "frame": 205, "interval": [205, 225], "teamId": "away", "source": "scenario",
         "description": "Away #8, dribbling slowly, passes to away #9."},
    ],
)

SCENARIOS = (S1, S2, S3, S4)

# Backwards-compatible names for S1 (used by tests and documentation).
N_FRAMES = S1.n_frames
HALF = S1.graded[0]
REFERENCE = S1.reference


def build_s1():
    return PLAYERS, build(S1)


# -- writing the synthetic files in the engines' input formats ----------------------------------

def _norm(value, scale):
    return "{:.6f}".format(value / scale)


def write_inputs(players, frames, folder, tags=None):
    """Metadata XML, raw ATD text and Smart Tagging XML, as in tests/conftest.py."""
    tags = S1.tags if tags is None else tags
    meta = os.path.join(folder, "atd.xml")
    raw = os.path.join(folder, "atd.txt")
    tags_path = os.path.join(folder, "smart_tagging.xml")
    rows = "".join(
        '    <Player id="{t}{n}" teamId="T-{T}"><Name>{T} {n}</Name>'
        "<ShirtNumber>{n}</ShirtNumber></Player>\n".format(t=t[0], n=n, T=t.upper())
        for t, n in players)
    with open(assert_safe(meta), "w", encoding="utf-8", newline="\n") as handle:
        handle.write('<?xml version="1.0" encoding="UTF-8"?>\n<Metadata>\n  <Teams>\n'
                     '    <Team id="T-HOME"><Name>Synthetic Home</Name></Team>\n'
                     '    <Team id="T-AWAY"><Name>Synthetic Away</Name></Team>\n'
                     "  </Teams>\n  <Players>\n" + rows + "  </Players>\n</Metadata>\n")

    with open(assert_safe(raw), "w", encoding="utf-8", newline="\n") as handle:
        for f, (observed, ball) in enumerate(frames):
            groups = ["NaN,NaN,NaN" if p is None else "{},{},0".format(_norm(p[0], LENGTH),
                                                                        _norm(p[1], WIDTH))
                      for p in observed]
            if ball is None:
                ball_group = "NaN,NaN,NaN"
            else:
                nxt = frames[f + 1][1] if f + 1 < len(frames) else None
                speed = 0.0 if nxt is None else math.hypot(nxt[0] - ball[0], nxt[1] - ball[1]) * FPS
                ball_group = "{},{},{:.3f}".format(_norm(ball[0], LENGTH), _norm(ball[1], WIDTH), speed)
            handle.write("{}:{}:{}\n".format(f + 1, ";".join(groups), ball_group))

    instances = "".join(
        ("  <instance><ID>{}</ID><start>{:.2f}</start><end>{:.2f}</end>"
         "<code>SET PIECES</code><label><group>Type</group><text>{}</text></label>"
         "<label><group>Team</group><text>{}</text></label></instance>\n").format(
             i + 1, start / FPS, end / FPS, type_, team)
        for i, (start, end, type_, team) in enumerate(tags))
    with open(assert_safe(tags_path), "w", encoding="utf-8", newline="\n") as handle:
        handle.write("<file><ALL_INSTANCES>\n" + instances + "</ALL_INSTANCES></file>\n")
    return meta, raw, tags_path


# -- running the unchanged engines and the official scorer --------------------------------------

def run_engines(meta, raw, tags, n_frames, segments):
    phase3b = "".join(possession.build_labels(meta, raw, n_frames=n_frames, segments=segments,
                                              tags_path=tags))
    # The same composition as possession.build_labels, keeping the intermediate evidence.
    tracking = possession.read_tracking(raw, baseline.team_of_each_track(meta), n_frames)
    evidence = possession.control_evidence(tracking.home, tracking.away)
    dead, restarts = possession.game_evidence(tracking, smart_tagging.load(tags),
                                              possession.team_names(meta), segments)
    state, source = possession.infer_states(evidence, possession.DEFAULTS, segments, dead, restarts)
    if "".join(possession.to_labels(state)) != phase3b:
        raise RuntimeError("evidence composition diverges from possession.build_labels")

    smooth50 = "".join(baseline.build_labels(meta, raw, n_frames=n_frames))
    nearest = baseline.nearest_player_labels(raw, baseline.team_of_each_track(meta), n_frames)
    return {
        "phase3b": phase3b, "smooth50": smooth50,
        "evidence": "".join(EVIDENCE_CODES[int(e)] for e in evidence),
        "reasons": [int(s) for s in source],
        "restarts": {int(k): int(v) for k, v in restarts.items()},
        "distances": (tracking.home, tracking.away),
        "nearest": "".join({baseline.HOME: "H", baseline.AWAY: "A"}.get(int(c), "-") for c in nearest),
    }


def official_scores(reference, labels):
    """The organisers' public scorer, with the script reference as the ground truth."""
    result = possession_metrics.evaluate(possession_metrics.label_codes(list(reference)),
                                         possession_metrics.label_codes(list(labels)))
    return {
        "spellF1Mean": round(result["spell_f1_mean"], 6),
        "spellF1ByIou": {str(k): round(v["f1"], 6) for k, v in sorted(result["spell_f1"].items())},
        "macroF1": round(result["macro_f1"], 6),
        "nReferenceSpells": result["n_gt_spells"],
        "nPredictedSpells": result["n_pred_spells"],
        "nGraded": result["n_graded"],
        "confusion": result["confusion"],
    }


def _metres(value):
    if value is None or not math.isfinite(value):
        return None
    return round(float(value), 2)


def _sha(rel):
    with open(os.path.join(ROOT, rel), "rb") as handle:  # LF/CRLF-independent hash
        return hashlib.sha256(handle.read().replace(b"\r\n", b"\n")).hexdigest()


def engine_provenance():
    hashes = {rel: _sha(rel) for rel in ENGINE_FILES}
    commit = subprocess.run(["git", "-C", ROOT, "log", "-1", "--format=%H", "--"] + list(ENGINE_FILES),
                            capture_output=True, text=True, check=True).stdout.strip()
    return commit, hashes


def export(spec):
    frames = build(spec)
    with tempfile.TemporaryDirectory(prefix="maf-{}-".format(spec.id)) as folder:
        meta, raw, tags = write_inputs(PLAYERS, frames, folder, spec.tags)
        out = run_engines(meta, raw, tags, spec.n_frames, spec.graded)
        # Read back exactly what the engines read, so the UI draws the engines' input.
        tracked = []
        with open(raw, encoding="utf-8") as handle:
            for line in handle:
                _, groups, ball = line.rstrip("\n").split(":")
                ps_ = [None if g.startswith("NaN") else
                       [round(float(g.split(",")[0]) * LENGTH, 2), round(float(g.split(",")[1]) * WIDTH, 2)]
                       for g in groups.split(";")]
                b = None if ball.startswith("NaN") else [
                    round(float(ball.split(",")[0]) * LENGTH, 2),
                    round(float(ball.split(",")[1]) * WIDTH, 2), float(ball.split(",")[2])]
                tracked.append({"ball": b, "players": ps_})

    commit, hashes = engine_provenance()
    reference = "".join(label * (end - start) for start, end, label in spec.reference)
    if len(reference) != spec.n_frames:
        raise ValueError("{}: reference covers {} of {} frames".format(spec.id, len(reference), spec.n_frames))
    home_d, away_d = out["distances"]
    role = {**{("home", n): r for n, (r, _, _) in HOME_BASE.items()},
            **{("away", n): r for n, (r, _, _) in AWAY_BASE.items()}}
    return {
        "schemaVersion": 1,
        "id": spec.id,
        "title": spec.title,
        "description": spec.description,
        "provenance": {
            "kind": "synthetic",
            "generator": "tools/export_scenarios.py",
            "generatorVersion": GENERATOR_VERSION,
            "engineCommit": commit,
            "engineFiles": hashes,
            "scorer": {"file": SCORER_FILE, "source": SCORER_SOURCE, "sha256": _sha(SCORER_FILE)},
            "statement": ("Synthetic data, scripted in tools/export_scenarios.py. No competition "
                          "data was read. Model labels are the unchanged Python engines' output."),
        },
        "fps": FPS,
        "frameCount": spec.n_frames,
        "pitch": {"length": LENGTH, "width": WIDTH},
        "graded": [list(g) for g in spec.graded],
        "teams": [{"id": "home", "side": "home", "name": "Synthetic Home", "shortName": "HOM"},
                  {"id": "away", "side": "away", "name": "Synthetic Away", "shortName": "AWY"}],
        "players": [{"id": "{}{}".format(t[0], n), "teamId": t, "shirt": n, "role": role[(t, n)]}
                    for t, n in PLAYERS],
        "frames": tracked,
        "events": spec.events,
        "reference": {"labels": reference, "source": "scenario-script",
                      "description": "Written down from the scenario script, not produced by any model."},
        "models": {
            "phase3b": {
                "name": "MAF FC Phase 3B", "producer": "src/possession.py build_labels (default parameters)",
                "labels": out["phase3b"],
                "evidence": out["evidence"],
                "reasons": out["reasons"],
                "reasonNames": {str(k): v for k, v in sorted(REASON_NAMES.items())},
                "restarts": [{"frame": f, "team": {0: "home", 1: "away"}.get(t, "unknown")}
                             for f, t in sorted(out["restarts"].items())],
                "nearestHome": [_metres(v) for v in home_d],
                "nearestAway": [_metres(v) for v in away_d],
                "scores": official_scores(reference, out["phase3b"]),
            },
            "smooth50": {
                "name": "Official smooth50 baseline", "producer": "src/baseline.py build_labels (window 50)",
                "labels": out["smooth50"],
                "nearestTeam": out["nearest"],
                "scores": official_scores(reference, out["smooth50"]),
            },
        },
    }


def export_s1():
    return export(S1)


def manifest(exported):
    return {"schemaVersion": 1, "scenarios": [
        {"id": s["id"], "title": s["title"], "description": s["description"],
         "frameCount": s["frameCount"], "fps": s["fps"], "file": "{}.json".format(s["id"])}
        for s in exported]}


def render(document):
    return json.dumps(document, ensure_ascii=True, separators=(",", ":"), allow_nan=False) + "\n"


def outputs():
    """{absolute path: text} for every generated file."""
    exported = [export(spec) for spec in SCENARIOS]
    files = {os.path.join(OUT_DIR, "{}.json".format(s["id"])): render(s) for s in exported}
    files[os.path.join(OUT_DIR, "index.json")] = render(manifest(exported))
    return files


def main(argv=None):
    parser = argparse.ArgumentParser(description="Export synthetic Explorer scenarios.")
    parser.add_argument("--check", action="store_true", help="verify the committed JSON is current")
    args = parser.parse_args(argv)
    files = outputs()
    stale = []
    for path, text in files.items():
        assert_safe(path)
        rel = os.path.relpath(path, ROOT).replace(os.sep, "/")
        if args.check:
            try:
                with open(path, encoding="utf-8") as handle:
                    current = handle.read()
            except FileNotFoundError:
                current = None
            if current != text:
                stale.append(rel)
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        print("wrote " + rel)
    if args.check:
        print("all {} generated files are up to date".format(len(files)) if not stale
              else "OUT OF DATE: " + ", ".join(stale))
        return 1 if stale else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
