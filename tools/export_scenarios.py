"""Export synthetic scenarios for the MAF FC Possession Explorer (explorer/).

    python tools/export_scenarios.py           # write explorer/src/scenario/generated/s1.json
    python tools/export_scenarios.py --check   # exit 1 if the committed JSON is out of date

Every scenario is scripted here, in code, from scratch: no match data is read. The script is
written to temporary files in the same raw ATD / metadata / Smart Tagging formats that the
synthetic tests use, and the UNCHANGED engines are run on those files:

  * MAF FC Phase 3B: possession.build_labels (with the default parameters);
  * official smooth50: baseline.build_labels (the reproduction of the organisers' baseline).

The per-frame evidence and reason codes come from the same public functions that
possession.build_labels composes; the export asserts that this composition reproduces
build_labels exactly. Nothing is hand-labelled except the scenario's own reference labels,
which are written down from the script and kept separate from the model output.

Safety: there are no input path arguments, MTAH_DATA_DIR is never read, every path is checked
against dataset/ and outputs/, and the only output is the fixed JSON path below.
"""

import argparse
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

import baseline  # noqa: E402  (unchanged official-baseline reproduction)
import possession  # noqa: E402  (unchanged Phase 3B engine)
import smart_tagging  # noqa: E402

GENERATOR_VERSION = "1.0.0"
OUT_PATH = os.path.join(ROOT, "explorer", "src", "scenario", "generated", "s1.json")
ENGINE_FILES = ("src/possession.py", "src/baseline.py", "src/smart_tagging.py")
FORBIDDEN_DIRS = ("dataset", "outputs")

FPS = possession.FPS
LENGTH, WIDTH = baseline.PITCH
CENTRE = (LENGTH / 2, WIDTH / 2)
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


# -- scenario S1: scripted 11 v 11 sequence ---------------------------------------------------

N_FRAMES = 400
HALF = (25, 375)  # graded interval, half-open

HOME_BASE = {1: ("GK", 5.0, 34.0), 2: ("RB", 22.0, 56.0), 3: ("LB", 22.0, 12.0),
             4: ("CB", 18.0, 40.0), 5: ("CB", 18.0, 28.0), 6: ("CM", 42.0, 34.0),
             7: ("RW", 49.0, 56.0), 8: ("CM", 40.0, 46.0), 9: ("ST", 52.2, 34.6),
             10: ("CM", 40.0, 22.0), 11: ("LW", 49.0, 12.0)}
AWAY_BASE = {1: ("GK", 100.3, 34.0), 2: ("RB", 83.0, 12.0), 3: ("LB", 83.0, 56.0),
             4: ("CB", 87.0, 28.0), 5: ("CB", 87.0, 40.0), 6: ("CM", 70.0, 34.0),
             7: ("RW", 60.0, 12.0), 8: ("CM", 66.0, 24.0), 9: ("ST", 62.5, 34.0),
             10: ("CM", 66.0, 44.0), 11: ("LW", 60.0, 56.0)}

# Scripted actor paths: (team, shirt) -> [(frame, x, y), ...], linear between keyframes.
ACTORS = {
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
}

# Ball script: each phase is (start, end, kind, args). "still": fixed point; "carry": just ahead
# of a player; "pass": straight line between points; "missing": not tracked.
BALL = [
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
MISSING_PLAYERS = {("away", 7): (100, 126)}  # occluded track: not observed in [100, 126)

KICKOFF = (20, 100)   # Smart Tagging window, video frames (half-open)
THROW_IN = (232, 290)
# The brief home touch, defined by the ball script (not by any model output): the loose pass
# reaches home #8 on the last frame of its "pass" phase, home #8 carries it, and away #6 wins it
# back when the "carry" by home #8 ends. Half-open [arrival, regain).
_PASS_TO_HOME_8 = next(p for p in BALL if p[2] == "pass" and p[1] == next(
    c[0] for c in BALL if c[2] == "carry" and c[3][0] == ("home", 8)))
BRIEF_TOUCH = (_PASS_TO_HOME_8[1] - 1,
               next(c[1] for c in BALL if c[2] == "carry" and c[3][0] == ("home", 8)))
# Reference labels written from the script. A strike is the last frame the ball rests on: the
# raw speed field is the speed with which the ball leaves the frame.
REFERENCE = [(0, 25, "X"), (25, 60, "D"), (60, 186, "H"), (186, 260, "D"), (260, 375, "A"),
             (375, 400, "X")]
EVENTS = [
    {"type": "half-start", "frame": 25, "teamId": None, "source": "scenario",
     "description": "Graded interval starts (frames before it are ungraded)."},
    {"type": "kickoff", "frame": 60, "interval": list(KICKOFF), "teamId": "home",
     "source": "smart-tagging", "description": "Kick Off (Start) set-piece tag, Team: Synthetic Home."},
    {"type": "ball-out", "frame": 186, "teamId": None, "source": "scenario",
     "description": "The whole ball crosses the touchline after a home cross."},
    {"type": "throw-in", "frame": 260, "interval": list(THROW_IN), "teamId": None,
     "source": "smart-tagging", "description": "Throw-in set-piece tag, Team: N/A (as for every throw-in)."},
    {"type": "brief-touch", "frame": BRIEF_TOUCH[0], "interval": list(BRIEF_TOUCH), "teamId": "home",
     "source": "scenario",
     "description": ("A loose away pass reaches home #8, who keeps the ball for {} frames before away "
                     "#6 wins it back; by the script, away keeps possession.").format(
                         BRIEF_TOUCH[1] - BRIEF_TOUCH[0])},
    {"type": "half-end", "frame": 375, "teamId": None, "source": "scenario",
     "description": "Graded interval ends (frames after it are ungraded)."},
]


def lerp_path(keys, frame):
    if frame <= keys[0][0]:
        return keys[0][1], keys[0][2]
    for (f0, x0, y0), (f1, x1, y1) in zip(keys, keys[1:]):
        if f0 <= frame <= f1:
            t = (frame - f0) / (f1 - f0)
            return x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
    return keys[-1][1], keys[-1][2]


def ball_xy(frame, positions):
    for start, end, kind, args in BALL:
        if start <= frame < end:
            if kind == "missing":
                return None
            if kind == "still":
                return args
            if kind == "carry":
                actor, dx, dy = args
                x, y = positions[actor]
                return x + dx, y + dy
            (x0, y0), (x1, y1) = args
            t = (frame - start + 1) / (end - start)  # the strike frame already moves
            return x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
    raise ValueError(frame)


def build_s1():
    """Per-frame positions (metres), deterministic. Players and ball as in the script above."""
    players = [("home", n) for n in sorted(HOME_BASE)] + [("away", n) for n in sorted(AWAY_BASE)]
    frames = []
    anchor = CENTRE
    for f in range(N_FRAMES):
        positions = {}
        for team, shirt in players:
            if (team, shirt) in ACTORS:
                positions[(team, shirt)] = lerp_path(ACTORS[(team, shirt)], f)
                continue
            role, bx, by = (HOME_BASE if team == "home" else AWAY_BASE)[shirt]
            k = 0.12 if role == "GK" else (0.35 if f >= 61 else 0.0)
            wobble = 0.0 if f < 61 else 0.6 * math.sin(f / 23.0 + shirt * 1.7 + (team == "away"))
            positions[(team, shirt)] = (bx + k * (anchor[0] - CENTRE[0]) + wobble,
                                        by + 0.15 * (anchor[1] - CENTRE[1]) * (f >= 61))
        ball = ball_xy(f, positions)
        if ball is not None:
            anchor = ball
        observed = [None if (p in MISSING_PLAYERS
                             and MISSING_PLAYERS[p][0] <= f < MISSING_PLAYERS[p][1])
                    else positions[p] for p in players]
        frames.append((observed, ball))
    return players, frames


# -- writing the synthetic files in the engines' input formats ----------------------------------

def _norm(value, scale):
    return "{:.6f}".format(value / scale)


def write_inputs(players, frames, folder):
    """Metadata XML, raw ATD text and Smart Tagging XML, as in tests/conftest.py."""
    meta = os.path.join(folder, "S1_atd.xml")
    raw = os.path.join(folder, "S1_atd.txt")
    tags = os.path.join(folder, "S1_smart_tagging.xml")
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

    def instance(i, window, type_, team):
        return ("  <instance><ID>{}</ID><start>{:.2f}</start><end>{:.2f}</end>"
                "<code>SET PIECES</code><label><group>Type</group><text>{}</text></label>"
                "<label><group>Team</group><text>{}</text></label></instance>\n").format(
                    i, window[0] / FPS, window[1] / FPS, type_, team)
    with open(assert_safe(tags), "w", encoding="utf-8", newline="\n") as handle:
        handle.write("<file><ALL_INSTANCES>\n" + instance(1, KICKOFF, "Kick Off (Start)", "Synthetic Home")
                     + instance(2, THROW_IN, "Throw-in", "N/A") + "</ALL_INSTANCES></file>\n")
    return meta, raw, tags


# -- running the unchanged engines ----------------------------------------------------------

def run_engines(meta, raw, tags):
    segments = [HALF]
    phase3b = "".join(possession.build_labels(meta, raw, n_frames=N_FRAMES, segments=segments,
                                              tags_path=tags))
    # The same composition as possession.build_labels, keeping the intermediate evidence.
    tracking = possession.read_tracking(raw, baseline.team_of_each_track(meta), N_FRAMES)
    evidence = possession.control_evidence(tracking.home, tracking.away)
    dead, restarts = possession.game_evidence(tracking, smart_tagging.load(tags),
                                              possession.team_names(meta), segments)
    state, source = possession.infer_states(evidence, possession.DEFAULTS, segments, dead, restarts)
    if "".join(possession.to_labels(state)) != phase3b:
        raise RuntimeError("evidence composition diverges from possession.build_labels")

    smooth50 = "".join(baseline.build_labels(meta, raw, n_frames=N_FRAMES))
    nearest = baseline.nearest_player_labels(raw, baseline.team_of_each_track(meta), N_FRAMES)
    return {
        "phase3b": phase3b, "smooth50": smooth50,
        "evidence": "".join(EVIDENCE_CODES[int(e)] for e in evidence),
        "reasons": [int(s) for s in source],
        "restarts": {int(k): int(v) for k, v in restarts.items()},
        "distances": (tracking.home, tracking.away),
        "nearest": "".join({baseline.HOME: "H", baseline.AWAY: "A"}.get(int(c), "-") for c in nearest),
    }


def _metres(value):
    if value is None or not math.isfinite(value):
        return None
    return round(float(value), 2)


def engine_provenance():
    hashes = {}
    for rel in ENGINE_FILES:
        with open(os.path.join(ROOT, rel), "rb") as handle:  # LF/CRLF-independent hash
            hashes[rel] = hashlib.sha256(handle.read().replace(b"\r\n", b"\n")).hexdigest()
    commit = subprocess.run(["git", "-C", ROOT, "log", "-1", "--format=%H", "--"] + list(ENGINE_FILES),
                            capture_output=True, text=True, check=True).stdout.strip()
    return commit, hashes


def export_s1():
    players, frames = build_s1()
    with tempfile.TemporaryDirectory(prefix="maf-s1-") as folder:
        out = run_engines(*write_inputs(players, frames, folder))
        # Read back exactly what the engines read, so the UI draws the engines' input.
        tracked = []
        with open(os.path.join(folder, "S1_atd.txt"), encoding="utf-8") as handle:
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
    reference = "".join(label * (end - start) for start, end, label in REFERENCE)
    home_d, away_d = out["distances"]
    role = {**{("home", n): r for n, (r, _, _) in HOME_BASE.items()},
            **{("away", n): r for n, (r, _, _) in AWAY_BASE.items()}}
    return {
        "schemaVersion": 1,
        "id": "s1",
        "title": "Kickoff, ball out, throw-in",
        "description": ("A scripted 16-second sequence: pre-match footage, kickoff, a home build-up "
                        "down the right, a cross that goes out for a throw-in, the away restart, "
                        "a brief home touch, and footage after the graded interval."),
        "provenance": {
            "kind": "synthetic",
            "generator": "tools/export_scenarios.py",
            "generatorVersion": GENERATOR_VERSION,
            "engineCommit": commit,
            "engineFiles": hashes,
            "statement": ("Synthetic data, scripted in tools/export_scenarios.py. No competition "
                          "data was read. Model labels are the unchanged Python engines' output."),
        },
        "fps": FPS,
        "frameCount": N_FRAMES,
        "pitch": {"length": LENGTH, "width": WIDTH},
        "graded": [list(HALF)],
        "teams": [{"id": "home", "side": "home", "name": "Synthetic Home", "shortName": "HOM"},
                  {"id": "away", "side": "away", "name": "Synthetic Away", "shortName": "AWY"}],
        "players": [{"id": "{}{}".format(t[0], n), "teamId": t, "shirt": n, "role": role[(t, n)]}
                    for t, n in players],
        "frames": tracked,
        "events": EVENTS,
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
            },
            "smooth50": {
                "name": "Official smooth50 baseline", "producer": "src/baseline.py build_labels (window 50)",
                "labels": out["smooth50"],
                "nearestTeam": out["nearest"],
            },
        },
    }


def render(scenario):
    return json.dumps(scenario, ensure_ascii=True, separators=(",", ":"), allow_nan=False) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description="Export synthetic Explorer scenarios.")
    parser.add_argument("--check", action="store_true", help="verify the committed JSON is current")
    args = parser.parse_args(argv)
    text = render(export_s1())
    assert_safe(OUT_PATH)
    if args.check:
        with open(OUT_PATH, encoding="utf-8") as handle:
            current = handle.read()
        print("s1.json is up to date" if current == text else "s1.json is OUT OF DATE")
        return 0 if current == text else 1
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    print("wrote " + os.path.relpath(OUT_PATH, ROOT).replace(os.sep, "/"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
