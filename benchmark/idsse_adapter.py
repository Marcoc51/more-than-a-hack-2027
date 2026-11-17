"""IDSSE/DFL XML bridge for the frozen Phase 3B engine.

Only positions enter EngineInput. BallStatus and BallPossession are read separately.
"""
from dataclasses import dataclass, field
from datetime import datetime
from math import hypot, isfinite
from pathlib import Path
import sys
from xml.etree import ElementTree as ET

import numpy as np

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "src"))
import possession as ps  # noqa: E402

_VALIDATED = object()
_SECTIONS = {"firsthalf": "firstHalf", "secondhalf": "secondHalf"}
_FRAME_SECONDS = 1 / ps.FPS


@dataclass(frozen=True)
class EngineInput:
    match_id: str
    home_id: str
    away_id: str
    frame_keys: tuple
    timestamps: tuple
    segments: tuple
    pitch: tuple
    tracking: object
    _validation_token: object = field(repr=False)


@dataclass(frozen=True)
class ProviderLabels:
    labels: tuple
    home_frames: int
    away_frames: int
    dead_frames: int
    unknown_frames: int


def _section(value):
    section = _SECTIONS.get((value or "").lower())
    if section is None:
        raise ValueError(f"unsupported GameSection: {value!r}")
    return section


def _number(value):
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if isfinite(result) else None


def _frame_id(value):
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"invalid Frame.N: {value!r}") from exc
    if number < 0 or str(number) != value:
        raise ValueError(f"invalid Frame.N: {value!r}")
    return number


def _time(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (AttributeError, ValueError) as exc:
        raise ValueError(f"invalid Frame.T: {value!r}") from exc


def _metadata(path, match_id):
    if not isinstance(match_id, str) or not match_id:
        raise ValueError("match_id must be a nonempty string")
    root = ET.parse(path).getroot()
    info = root.find(".//MatchInformation")
    if info is None:
        raise ValueError("missing MatchInformation")
    general, environment, teams = (info.find(name) for name in ("General", "Environment", "Teams"))
    if general is None or environment is None or teams is None:
        raise ValueError("MatchInformation needs General, Environment and Teams")
    declared = general.get("MatchId") or info.get("MatchId")
    if declared and declared.removeprefix("DFL-MAT-") != match_id:
        raise ValueError("metadata match ID disagrees with requested match_id")
    home = general.get("HomeTeamId")
    away = general.get("AwayTeamId") or general.get("GuestTeamId")
    if not home or not away or home == away:
        raise ValueError("distinct HomeTeamId and AwayTeamId/GuestTeamId required")
    length, width = _number(environment.get("PitchX")), _number(environment.get("PitchY"))
    if length is None or width is None or min(length, width) <= 0:
        raise ValueError("positive PitchX and PitchY required")
    player_team = {}
    found = set()
    for team in teams:
        team_id = team.get("TeamId")
        if team_id not in (home, away):
            continue  # referees and staff are not tracked-player teams
        if team_id in found:
            raise ValueError("duplicate metadata team")
        found.add(team_id)
        players = team.find("Players")
        if players is None:
            raise ValueError("team lacks Players")
        for player in players:
            person_id = player.get("PersonId")
            if not person_id or person_id in player_team:
                raise ValueError("missing or duplicate PersonId")
            player_team[person_id] = team_id
    if found != {home, away} or not any(v == home for v in player_team.values()) or not any(v == away for v in player_team.values()):
        raise ValueError("home and away player metadata required")
    return home, away, (length, width), player_team


def _framesets(path):
    """Stream one FrameSet at a time; do not load the large XML tree."""
    for event, element in ET.iterparse(path, events=("start", "end")):
        if event == "end" and element.tag == "FrameSet":
            yield element
            # FrameSets may share a nested parent. Clearing only the document
            # root retains every completed FrameSet and scales with file size.
            element.clear()


def _ball_frames(path):
    halves = {}
    for frame_set in _framesets(path):
        if (frame_set.get("TeamId") or "").lower() != "ball":
            continue
        section = _section(frame_set.get("GameSection"))
        if section in halves:
            raise ValueError(f"duplicate ball FrameSet for {section}")
        records = []
        previous_n, previous_t = None, None
        for frame in frame_set.iterfind("Frame"):
            number, timestamp = _frame_id(frame.get("N")), _time(frame.get("T"))
            if previous_n is not None:
                if number != previous_n + 1:
                    raise ValueError(f"ball Frame.N gap in {section}")
                try:
                    delta = (timestamp - previous_t).total_seconds()
                except TypeError as exc:
                    raise ValueError("inconsistent Frame.T timezone") from exc
                if abs(delta - _FRAME_SECONDS) > 0.001:
                    raise ValueError(f"Frame.T is not contiguous 25 Hz in {section}")
            x, y = _number(frame.get("X")), _number(frame.get("Y"))
            speed = _number(frame.get("S"))
            if speed is not None and speed < 0:
                speed = None
            records.append((number, timestamp, x, y, speed,
                            frame.get("BallStatus"), frame.get("BallPossession")))
            previous_n, previous_t = number, timestamp
        if len(records) < 2:
            raise ValueError(f"ball FrameSet for {section} needs at least two frames")
        halves[section] = records
    if set(halves) != set(_SECTIONS.values()):
        raise ValueError("ball FrameSets for firstHalf and secondHalf required")
    return halves


def adapt_tracking(match_id, metadata_path, positions_path):
    """Validate two 25 Hz halves and create a label-free engine input."""
    home_id, away_id, pitch, player_team = _metadata(metadata_path, match_id)
    ball = _ball_frames(positions_path)
    sections = ("firstHalf", "secondHalf")
    segments, offsets, frame_keys, timestamps = [], {}, [], []
    start = 0
    for section in sections:
        offsets[section] = start
        records = ball[section]
        frame_keys.extend((section, row[0]) for row in records)
        timestamps.extend(row[1] for row in records)
        start += len(records)
        segments.append((offsets[section], start))
    n = start
    ball_x, ball_y, ball_speed = (np.full(n, np.nan) for _ in range(3))
    home, away = np.full(n, np.inf), np.full(n, np.inf)
    for section in sections:
        offset = offsets[section]
        previous_valid = False
        for local, (_, _, x, y, speed, _, _) in enumerate(ball[section]):
            index = offset + local
            if x is None or y is None:
                home[index] = away[index] = np.nan
                previous_valid = False
                continue
            ball_x[index], ball_y[index] = x + pitch[0] / 2, y + pitch[1] / 2
            if previous_valid and speed is not None:
                ball_speed[index] = speed / 3.6
            previous_valid = True

    seen_sets = set()
    seen_teams = {section: set() for section in sections}
    for frame_set in _framesets(positions_path):
        team_id = frame_set.get("TeamId")
        if (team_id or "").lower() in ("ball", "referee"):
            continue
        section = _section(frame_set.get("GameSection"))
        person_id = frame_set.get("PersonId")
        if person_id not in player_team or player_team[person_id] != team_id:
            raise ValueError("player FrameSet team or PersonId disagrees with metadata")
        if (section, person_id) in seen_sets:
            raise ValueError("duplicate player FrameSet")
        seen_sets.add((section, person_id))
        seen_teams[section].add(team_id)
        records = ball[section]
        base = records[0][0]
        previous_n = None
        for frame in frame_set.iterfind("Frame"):
            number, timestamp = _frame_id(frame.get("N")), _time(frame.get("T"))
            local = number - base
            if not 0 <= local < len(records) or (previous_n is not None and number <= previous_n):
                raise ValueError("player Frame.N outside or unordered against ball timeline")
            if timestamp != records[local][1]:
                raise ValueError("player Frame.T disagrees with ball timeline")
            previous_n = number
            x, y = _number(frame.get("X")), _number(frame.get("Y"))
            if x is None or y is None:
                continue
            index = offsets[section] + local
            if np.isnan(ball_x[index]):
                continue
            distance = hypot(x + pitch[0] / 2 - ball_x[index],
                             y + pitch[1] / 2 - ball_y[index])
            if team_id == home_id:
                home[index] = min(home[index], distance)
            else:
                away[index] = min(away[index], distance)
    if any(seen_teams[section] != {home_id, away_id} for section in sections):
        raise ValueError("both teams need player FrameSets in each half")
    tracking = ps.Tracking(home, away, ball_x, ball_y, ball_speed)
    return EngineInput(match_id, home_id, away_id, tuple(frame_keys), tuple(timestamps),
                       tuple(segments), pitch, tracking, _VALIDATED)


def predict(engine_input):
    """Use frozen Phase 3B with original 25 fps defaults and no event tags."""
    if not isinstance(engine_input, EngineInput) or engine_input._validation_token is not _VALIDATED:
        raise ValueError("predict requires validated IDSSE EngineInput")
    evidence = ps.control_evidence(engine_input.tracking.home, engine_input.tracking.away,
                                   ps.DEFAULTS)
    dead, restarts = ps.game_evidence(engine_input.tracking, [], [], engine_input.segments,
                                      engine_input.pitch, ps.GAME_DEFAULTS)
    states, _ = ps.infer_states(evidence, ps.DEFAULTS, engine_input.segments, dead, restarts)
    return tuple(ps.to_labels(states))


def provider_labels(engine_input, positions_path):
    """Map explicit provider codes separately from model features; never interpolate X."""
    if not isinstance(engine_input, EngineInput) or engine_input._validation_token is not _VALIDATED:
        raise ValueError("provider_labels requires validated IDSSE EngineInput")
    halves = _ball_frames(positions_path)
    labels = []
    for section in ("firstHalf", "secondHalf"):
        for number, timestamp, _, _, _, status, possession in halves[section]:
            index = len(labels)
            if index >= len(engine_input.frame_keys):
                raise ValueError("provider label length disagrees with tracking")
            if (section, number) != engine_input.frame_keys[index] or timestamp != engine_input.timestamps[index]:
                raise ValueError("provider labels disagree with validated tracking timeline")
            if status == "0":
                label = "D"
            elif status == "1" and possession in ("1", "2"):
                label = "H" if possession == "1" else "A"
            else:
                label = "X"
            labels.append(label)
    if len(labels) != len(engine_input.frame_keys):
        raise ValueError("provider label length disagrees with tracking")
    return ProviderLabels(tuple(labels), labels.count("H"), labels.count("A"),
                          labels.count("D"), labels.count("X"))
