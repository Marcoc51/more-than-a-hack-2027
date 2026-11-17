"""External-only SkillCorner 10 fps bridge to the unchanged Phase 3B functions.

Provider possession and phase records are never members of EngineInput.
"""
from dataclasses import dataclass, field
from math import ceil, hypot, isfinite
from pathlib import Path
import re
import sys

import numpy as np

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "src"))
import possession as ps  # noqa: E402

_VALIDATED_INPUT = object()

_TIMESTAMP = re.compile(r"^(\d{2}):(\d{2}):(\d{2})\.(\d{2})$")


@dataclass(frozen=True)
class ExternalConfig:
    fps: int
    params: object
    game: object


@dataclass(frozen=True)
class EngineInput:
    match_id: int
    frame_ids: tuple
    timestamps_s: tuple
    periods: tuple
    segments: tuple
    pitch: tuple
    tracking: object
    config: ExternalConfig
    home_id: int
    away_id: int
    home_team_side: tuple
    _validation_token: object = field(repr=False)


@dataclass(frozen=True)
class ProxyLabels:
    labels: tuple
    home_frames: int
    away_frames: int
    unknown_frames: int


def _integer(value, name):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{name} must be an integer")
    return value


def _id(value, name):
    # JSON IDs are integers; phase CSV IDs are decimal strings. Never truncate floats.
    if type(value) is int:
        return value
    if isinstance(value, str) and value.isascii() and value.isdecimal():
        return int(value)
    raise ValueError(f"{name} must be an integral numeric ID")


def _number(value, name):
    if isinstance(value, bool):
        raise ValueError(f"{name} must be a finite number")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a finite number") from exc
    if not isfinite(result):
        raise ValueError(f"{name} must be a finite number")
    return result


def _seconds(value):
    match = _TIMESTAMP.fullmatch(value) if isinstance(value, str) else None
    if match is None:
        raise ValueError("tracked frame timestamp must be HH:MM:SS.cc")
    hour, minute, second, centisecond = map(int, match.groups())
    if minute >= 60 or second >= 60:
        raise ValueError("invalid tracking timestamp")
    return 3600 * hour + 60 * minute + second + centisecond / 100


def rate_adapted_config(fps=10):
    """Ceiling preserves or lengthens physical confirmation times on a coarser grid."""
    if _integer(fps, "fps") != 10:
        raise ValueError("SkillCorner adapter requires native 10 fps")
    scale = lambda frames: ceil(frames * fps / ps.FPS)
    params = ps.DEFAULTS._replace(
        confirm_frames=scale(ps.DEFAULTS.confirm_frames),
        max_gap_frames=scale(ps.DEFAULTS.max_gap_frames),
    )
    game = ps.GAME_DEFAULTS._replace(
        out_confirm_frames=scale(ps.GAME_DEFAULTS.out_confirm_frames),
        restart_still_frames=scale(ps.GAME_DEFAULTS.restart_still_frames),
        stoppage_lookahead_frames=scale(ps.GAME_DEFAULTS.stoppage_lookahead_frames),
    )
    return ExternalConfig(fps, params, game)


def _metadata(metadata):
    if not isinstance(metadata, dict):
        raise ValueError("SkillCorner match metadata must be an object")
    match_id = _id(metadata.get("id"), "match.id")
    home_meta, away_meta = metadata.get("home_team"), metadata.get("away_team")
    if not isinstance(home_meta, dict) or not isinstance(away_meta, dict):
        raise ValueError("home_team and away_team metadata are required")
    home = _id(home_meta.get("id"), "home_team.id")
    away = _id(away_meta.get("id"), "away_team.id")
    if home == away:
        raise ValueError("home_team.id and away_team.id must differ")
    pitch = (_number(metadata.get("pitch_length"), "pitch_length"),
             _number(metadata.get("pitch_width"), "pitch_width"))
    if min(pitch) <= 0:
        raise ValueError("pitch dimensions must be positive")
    sides = metadata.get("home_team_side")
    if sides not in (["left_to_right", "right_to_left"],
                     ["right_to_left", "left_to_right"]):
        raise ValueError("home_team_side must give opposite directions for two periods")
    period_entries = metadata.get("match_periods")
    if not isinstance(period_entries, list):
        raise ValueError("match_periods must be a list")
    periods = {}
    for entry in period_entries:
        if not isinstance(entry, dict):
            raise ValueError("invalid match_periods entry")
        period = _integer(entry.get("period"), "match_periods.period")
        lo = _integer(entry.get("start_frame"), "match_periods.start_frame")
        hi = _integer(entry.get("end_frame"), "match_periods.end_frame")
        if period not in (1, 2) or period in periods or lo < 0 or lo > hi:
            raise ValueError("expected distinct periods 1 and 2 with valid frame bounds")
        periods[period] = (lo, hi)
    if set(periods) != {1, 2} or periods[1][1] >= periods[2][0]:
        raise ValueError("match_periods must have disjoint ordered halves")
    team_of_player = {}
    players = metadata.get("players")
    if not isinstance(players, list) or not players:
        raise ValueError("metadata.players must be a nonempty list")
    for player in players:
        if not isinstance(player, dict):
            raise ValueError("invalid players entry")
        ident = _id(player.get("id"), "players.id")
        team = _id(player.get("team_id"), "players.team_id")
        if ident in team_of_player or team not in (home, away):
            raise ValueError("duplicate player ID or unknown player team")
        team_of_player[ident] = team
    return match_id, home, away, pitch, tuple(sides), periods, team_of_player


def adapt_tracking(metadata, frames):
    """Validate a contiguous native-rate slice and construct label-free engine arrays."""
    match_id, home_id, away_id, pitch, sides, bounds, team_of_player = _metadata(metadata)
    if not isinstance(frames, list) or not frames:
        raise ValueError("tracking must be a nonempty list of frames")
    config = rate_adapted_config()
    n = len(frames)
    home, away = np.full(n, np.nan), np.full(n, np.nan)
    ball_x, ball_y, ball_speed = (np.full(n, np.nan) for _ in range(3))
    frame_ids, timestamps, periods, segments = [], [], [], []
    prior_id = None
    prior_period = None
    prior_ball = None
    seen_periods = set()
    run_start = None

    for index, row in enumerate(frames):
        if not isinstance(row, dict):
            raise ValueError(f"tracking row {index} must be an object")
        frame = _integer(row.get("frame"), "frame")
        if frame < 0 or (prior_id is not None and frame != prior_id + 1):
            raise ValueError("tracking frame IDs must be nonnegative and contiguous")
        period = row.get("period")
        if period is not None and (type(period) is not int or period not in (1, 2)):
            raise ValueError(f"unsupported tracking period at frame {frame}")
        if period is not None:
            lo, hi = bounds[period]
            if not lo <= frame <= hi:
                raise ValueError(f"frame {frame} disagrees with match_periods")
            timestamp = _seconds(row.get("timestamp"))
            expected = (period - 1) * 2700 + (frame - lo) / config.fps
            if abs(timestamp - expected) > 0.011:
                raise ValueError(f"timestamp misaligned at frame {frame}")
        else:
            if row.get("timestamp") is not None:
                raise ValueError(f"non-period frame {frame} must have null timestamp")
            if any(lo <= frame <= hi for lo, hi in bounds.values()):
                raise ValueError(f"missing tracking period at frame {frame}")
            timestamp = None

        if period != prior_period:
            if run_start is not None:
                segments.append((run_start, index))
                run_start = None
            if period is not None:
                if period in seen_periods or (seen_periods and period <= max(seen_periods)):
                    raise ValueError("tracking periods must be ordered single runs")
                seen_periods.add(period)
                run_start = index
            prior_ball = None

        ball = row.get("ball_data")
        players = row.get("player_data")
        if not isinstance(ball, dict) or not isinstance(players, list):
            raise ValueError(f"frame {frame} lacks ball_data or player_data")
        detected_ball = ball.get("is_detected")
        if detected_ball is not True and detected_ball is not False and detected_ball is not None:
            raise ValueError(f"invalid ball detection flag at frame {frame}")
        seen_players = set()
        detected = []
        for player in players:
            if not isinstance(player, dict):
                raise ValueError(f"invalid player record at frame {frame}")
            ident = _id(player.get("player_id"), "player_data.player_id")
            if ident not in team_of_player or ident in seen_players:
                raise ValueError(f"unknown or duplicate player ID at frame {frame}")
            seen_players.add(ident)
            flag = player.get("is_detected")
            if flag is not True and flag is not False:
                raise ValueError(f"invalid player detection flag at frame {frame}")
            if flag and period is not None:
                detected.append((team_of_player[ident],
                                 _number(player.get("x"), "player_data.x") + pitch[0] / 2,
                                 _number(player.get("y"), "player_data.y") + pitch[1] / 2))

        if period is not None and detected_ball is True:
            x = _number(ball.get("x"), "ball_data.x") + pitch[0] / 2
            y = _number(ball.get("y"), "ball_data.y") + pitch[1] / 2
            ball_x[index], ball_y[index] = x, y
            best = {home_id: float("inf"), away_id: float("inf")}
            for team, px, py in detected:
                best[team] = min(best[team], hypot(px - x, py - y))
            home[index], away[index] = best[home_id], best[away_id]
            if prior_ball is not None:
                px, py, pt = prior_ball
                ball_speed[index] = hypot(x - px, y - py) / (timestamp - pt)
            prior_ball = (x, y, timestamp)
        else:
            prior_ball = None

        frame_ids.append(frame)
        timestamps.append(timestamp)
        periods.append(period)
        prior_id, prior_period = frame, period

    if run_start is not None:
        segments.append((run_start, n))
    tracking = ps.Tracking(home, away, ball_x, ball_y, ball_speed)
    return EngineInput(match_id, tuple(frame_ids), tuple(timestamps), tuple(periods),
                       tuple(segments), pitch, tracking, config, home_id, away_id, sides,
                       _VALIDATED_INPUT)


def predict(engine_input):
    """Run only frozen Phase 3B functions; no provider labels, phases, or events enter."""
    if (not isinstance(engine_input, EngineInput)
            or engine_input._validation_token is not _VALIDATED_INPUT):
        raise ValueError("predict requires a validated EngineInput")
    evidence = ps.control_evidence(engine_input.tracking.home,
                                   engine_input.tracking.away, engine_input.config.params)
    dead, restarts = ps.game_evidence(engine_input.tracking, [], [],
                                      engine_input.segments, engine_input.pitch,
                                      engine_input.config.game)
    states, _ = ps.infer_states(evidence, engine_input.config.params,
                                engine_input.segments, dead, restarts)
    return tuple(ps.to_labels(states))


def consensus_proxy_labels(engine_input, frames, phases, *, phase_end_exclusive):
    """Conservative H/A-only provider agreement. The end convention is provisional."""
    if phase_end_exclusive is not True:
        raise ValueError("explicit phase_end_exclusive=True acknowledgement required")
    if len(frames) != len(engine_input.frame_ids) or not isinstance(phases, list):
        raise ValueError("frames and phase records are required for proxy labels")
    phase_at = {}
    for phase in phases:
        if not isinstance(phase, dict):
            raise ValueError("invalid phase record")
        try:
            lo, hi, period = (_id(phase[name], name) for name in
                              ("frame_start", "frame_end", "period"))
            match_id = _id(phase["match_id"], "phase.match_id")
            team = _id(phase["team_in_possession_id"], "team_in_possession_id")
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("phase lacks valid frame, period, match, or team fields") from exc
        if match_id != engine_input.match_id:
            raise ValueError("phase match_id mismatch")
        if lo >= hi or period not in (1, 2) or team not in (engine_input.home_id, engine_input.away_id):
            raise ValueError("invalid phase interval or team")
        for frame in range(lo, hi):
            phase_at.setdefault((period, frame), []).append(team)

    labels = []
    for index, row in enumerate(frames):
        if row.get("frame") != engine_input.frame_ids[index] or row.get("period") != engine_input.periods[index]:
            raise ValueError("proxy frames must match validated engine timeline")
        period = engine_input.periods[index]
        value = "X"
        if period is not None:
            possession = row.get("possession")
            if possession is not None and not isinstance(possession, dict):
                raise ValueError("possession must be an object or null")
            group = (possession or {}).get("group")
            if group not in (None, "home team", "away team"):
                raise ValueError("unsupported possession.group")
            teams = phase_at.get((period, engine_input.frame_ids[index]), [])
            expected = {"home team": engine_input.home_id,
                        "away team": engine_input.away_id}.get(group)
            if expected is not None and teams == [expected]:
                value = "H" if expected == engine_input.home_id else "A"
        labels.append(value)
    return ProxyLabels(tuple(labels), labels.count("H"), labels.count("A"),
                       labels.count("X"))
