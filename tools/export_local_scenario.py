"""Crop owner-authorized ATD tracking and existing prediction CSVs for local viewing.

This adapter never runs inference, reads ground truth or changes predictions. Inputs are
explicit: MTAH_DATA_DIR and other environment variables are not consulted. Raw ATD frame
IDs are one-based; prediction IDs and --start-frame are zero-based. Only the requested
window is exported. No input filenames, personal names or tracking speed for players are
included. Output may only be a new JSON file under the ignored .local-explorer/ directory.

The two input streams are scanned only through the requested end frame, with at most
7,500 frames, 64 track slots and 16 MiB of JSON retained. Memory is independent of match length.
The selected window must be complete in both files; use NaN observations for
missing tracking (a group whose x or y is NaN is an unavailable position; a NaN speed is kept
as unknown). This is visualization, not a competition submission or accuracy report.

An optional --baseline-predictions CSV (for example the official smooth50 reproduction written by
src/baseline.py) is cropped to the same frames for a model-to-model comparison. Neither CSV is
treated as ground truth. --register lists the new export in .local-explorer/explorer-config.json
and makes it the default that `npm run dev:local` opens.
"""

import argparse
import csv
import json
import math
import os
import re
from pathlib import Path
import sys
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_ROOT = ROOT / ".local-explorer"
CONFIG_NAME = "explorer-config.json"
CONFIG_SCHEMA = "local-explorer-config-1"
MAX_REGISTERED = 64
EXPORT_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.json$")
PRIMARY_NAME = "Rule-Based Possession Engine"
BASELINE_NAME = "Official smooth50 baseline"
MAX_FRAMES = 7500
# Track slots, not people. The organisers' DATA.md documents 46 slots in the tactical metadata
# (51 in the broadcast source) for 22 players on the pitch; the engine itself has no upper bound.
# 64 slots x 7,500 frames stays far below MAX_OUTPUT_BYTES even if every slot is tracked.
MAX_PLAYERS = 64
MAX_OUTPUT_BYTES = 16 * 1024 * 1024
MAX_METADATA_BYTES = 1024 * 1024
MAX_LINE_BYTES = 64 * 1024
MAX_INPUT_BYTES = 2 * 1024 * 1024 * 1024
FPS = 25
PITCH = (105.3, 68.0)


def bounded_lines(path):
    """Read bounded UTF-8 lines without reading an entire match into memory."""
    path = Path(path)
    if path.stat().st_size > MAX_INPUT_BYTES:
        raise ValueError("input exceeds the 2 GiB file limit")
    with path.open("rb") as handle:
        number = 0
        while True:
            data = handle.readline(MAX_LINE_BYTES + 1)
            if not data:
                return
            number += 1
            if len(data) > MAX_LINE_BYTES:
                raise ValueError("line {} exceeds the 64 KiB limit".format(number))
            try:
                yield data.decode("utf-8-sig" if number == 1 else "utf-8")
            except UnicodeDecodeError as exc:
                raise ValueError("line {} is not UTF-8".format(number)) from exc


def integer(text, context, minimum=0):
    """Accept decimal integer text only (no floats, signs or whitespace)."""
    if not isinstance(text, str) or not text.isascii() or not text.isdigit():
        raise ValueError(context + ": expected a decimal integer")
    result = int(text)
    if result < minimum:
        raise ValueError(context + ": value below {}".format(minimum))
    return result


def read_metadata(path):
    path = Path(path)
    if path.stat().st_size > MAX_METADATA_BYTES:
        raise ValueError("metadata exceeds the 1 MiB limit")
    content = path.read_bytes()
    if b"<!DOCTYPE" in content.upper() or b"<!ENTITY" in content.upper():
        raise ValueError("metadata DTDs and entities are not supported")
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise ValueError("metadata is not valid XML") from exc
    teams = [t.get("id") for t in root.iter("Team")]
    if len(teams) != 2 or any(not t for t in teams) or len(set(teams)) != 2:
        raise ValueError("metadata must declare two distinct teams; the first is home")
    raw_players = list(root.iter("Player"))
    if not 1 <= len(raw_players) <= MAX_PLAYERS:
        raise ValueError("metadata must declare 1..{} player slots (found {})".format(MAX_PLAYERS, len(raw_players)))
    players = []
    for i, player in enumerate(raw_players):
        if player.get("teamId") not in teams:
            raise ValueError("player slot {} has an unknown teamId".format(i + 1))
        shirt_text = player.findtext("ShirtNumber")
        shirt = 0 if shirt_text is None else integer(shirt_text, "ShirtNumber")
        if shirt > 999:
            raise ValueError("ShirtNumber exceeds 999")
        players.append({"id": "slot-{}".format(i + 1),
                        "teamId": "home" if player.get("teamId") == teams[0] else "away",
                        "shirt": shirt, "role": "track"})
    return players


# One raw ATD value: a plain decimal number or NaN (DATA.md: "Missing observations are NaN").
NUMBER = re.compile(r"^(?:[Nn]a[Nn]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)$")


def observation(group, context, ball=False):
    """One x,y,speed group (normalised position, speed in m/s), as the engine reads it.

    Policy, mirroring src/possession.py read_tracking (a group counts as missing when x is NaN;
    a NaN speed is an unknown speed, never a reason to drop the position):
      * x or y NaN        -> position unavailable (None); nothing is filled, interpolated or zeroed;
      * x and y numbers   -> position kept, range-checked and scaled to metres;
      * speed NaN         -> ball speed null (players' speed is not exported); position still kept.
    Wrong field counts, non-numeric text, infinity and out-of-range values are still rejected.
    """
    values = group.split(",")
    if len(values) != 3:
        raise ValueError(context + ": expected x,y,speed")
    if not all(NUMBER.match(v) for v in values):
        raise ValueError(context + ": expected numeric x,y,speed or NaN")
    x, y, speed = (float(v) for v in values)
    if math.isnan(x) or math.isnan(y):
        return None
    # Coordinates may legitimately be outside [0,1] when the ball/player is off pitch.
    # Bound extreme values to catch incompatible coordinate systems and typing errors.
    if abs(x) > 10 or abs(y) > 10 or (not math.isnan(speed) and not 0 <= speed <= 100):
        raise ValueError(context + ": expected normalized coordinates and speed in 0..100 m/s")
    position = [round(x * PITCH[0], 3), round(y * PITCH[1], 3)]
    if not ball:
        return position
    return position + [None if math.isnan(speed) else speed]


def read_tracking(path, start, count, players):
    end = start + count
    previous = -1
    frames = []
    for line_number, line in enumerate(bounded_lines(path), 1):
        parts = line.rstrip("\r\n").split(":", 2)
        if len(parts) != 3:
            raise ValueError("tracking line {}: expected frame:players:ball".format(line_number))
        frame = integer(parts[0], "tracking frame", 1) - 1
        if frame <= previous:
            raise ValueError("tracking frames must be strictly increasing without duplicates")
        previous = frame
        if frame >= end:
            raise ValueError("tracking is missing requested frame {}".format(start + len(frames)))
        if frame < start:
            continue
        if frame != start + len(frames):
            raise ValueError("tracking is missing requested frame {}".format(start + len(frames)))
        groups = parts[1].split(";")
        if len(groups) != players:
            raise ValueError("tracking frame {}: expected {} player slots".format(frame, players))
        frames.append({"ball": observation(parts[2], "ball frame {}".format(frame), ball=True),
                       "players": [observation(g, "player {} frame {}".format(i + 1, frame))
                                   for i, g in enumerate(groups)]})
        if len(frames) == count:
            break
    if len(frames) != count:
        raise ValueError("tracking does not cover every requested frame")
    return frames


def read_predictions(path, start, count):
    rows = csv.reader(bounded_lines(path), strict=True)
    try:
        header = next(rows, None)
    except csv.Error as exc:
        raise ValueError("predictions contain malformed CSV") from exc
    if header != ["frame", "label"]:
        raise ValueError("predictions must have the exact frame,label header")
    end = start + count
    expected = 0
    labels = []
    try:
        for row in rows:
            if len(row) != 2:
                raise ValueError("predictions must have exactly two columns")
            frame = integer(row[0], "prediction frame")
            if frame != expected:
                raise ValueError("prediction frames must be contiguous from zero without duplicates")
            if row[1] not in ("H", "A", "D", "X"):
                raise ValueError("prediction label must be H, A, D or X")
            expected += 1
            if frame >= start:
                labels.append(row[1])
            if expected == end:
                break
    except csv.Error as exc:
        raise ValueError("predictions contain malformed CSV") from exc
    if len(labels) != count:
        raise ValueError("predictions do not cover every requested frame")
    return "".join(labels)


def export(meta, tracking, predictions, start, count, baseline=None):
    if isinstance(start, bool) or not isinstance(start, int) or start < 0:
        raise ValueError("start-frame must be a non-negative integer")
    if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= MAX_FRAMES:
        raise ValueError("frame-count must be 1..7500 (at most five minutes at 25 fps)")
    players = read_metadata(meta)
    frames = read_tracking(tracking, start, count, len(players))
    labels = read_predictions(predictions, start, count)
    document = {
        "schemaVersion": "local-1", "id": "local", "title": "Local match window",
        "description": "Owner-authorized tracking and existing predictions; local viewing only.",
        "provenance": {"kind": "local-private", "generator": "tools/export_local_scenario.py",
                       "generatorVersion": "1.0.0",
                       "statement": "Owner-authorized local visualization; no reference labels or inferred evidence."},
        "sourceFrameStart": start, "fps": FPS, "frameCount": count,
        "pitch": {"length": PITCH[0], "width": PITCH[1]},
        "teams": [{"id": "home", "side": "home", "name": "Home", "shortName": "HOM"},
                  {"id": "away", "side": "away", "name": "Away", "shortName": "AWY"}],
        "players": players, "frames": frames,
        "predictions": {"name": PRIMARY_NAME, "labels": labels},
    }
    if baseline is not None:
        # Same frames, same validation; a second model's output, never a reference.
        document["baseline"] = {"name": BASELINE_NAME, "labels": read_predictions(baseline, start, count)}
    return document


def check_destination(output):
    destination = Path(output).resolve()
    if OUTPUT_ROOT.absolute() not in destination.parents or destination.suffix.lower() != ".json":
        raise ValueError("output must be a JSON file inside the repository .local-explorer/ directory")
    if destination.parent != OUTPUT_ROOT.absolute() or not EXPORT_NAME.match(destination.name) \
            or destination.name == CONFIG_NAME:
        raise ValueError("output must be a plain file name (letters, digits, . _ -) directly in "
                         ".local-explorer/, other than " + CONFIG_NAME)
    if destination.exists():
        raise ValueError("output already exists; choose a new filename")
    return destination


def register(name):
    """Put an export first in the local Explorer configuration (first = default). Only file
    names are stored; the development server serves nothing that is not listed here."""
    if not EXPORT_NAME.match(name) or name == CONFIG_NAME:
        raise ValueError("cannot register that file name")
    config_path = OUTPUT_ROOT / CONFIG_NAME
    exports = []
    if config_path.exists():
        try:
            config = json.loads(config_path.read_text(encoding="utf-8"))
        except ValueError as exc:
            raise ValueError(CONFIG_NAME + " is not valid JSON; fix or remove it") from exc
        if not isinstance(config, dict) or config.get("schema") != CONFIG_SCHEMA \
                or not isinstance(config.get("exports"), list) \
                or not all(isinstance(n, str) and EXPORT_NAME.match(n) for n in config["exports"]):
            raise ValueError(CONFIG_NAME + " has an unsupported format; fix or remove it")
        exports = [n for n in config["exports"] if n != name]
    exports = [name] + exports
    if len(exports) > MAX_REGISTERED:
        raise ValueError("at most {} registered exports".format(MAX_REGISTERED))
    data = json.dumps({"schema": CONFIG_SCHEMA, "exports": exports}, indent=2) + "\n"
    temporary = config_path.with_name(CONFIG_NAME + ".tmp")
    temporary.write_text(data, encoding="utf-8")
    os.replace(temporary, config_path)
    return exports


def write_export(document, output):
    output = Path(output)
    # Keep the lexical ignored directory as the boundary: a symlink/junction must
    # not redirect it (or a child directory) into public/ or another destination.
    allowed = OUTPUT_ROOT.absolute()
    destination = output.resolve()
    if destination.suffix.lower() != ".json" or allowed not in destination.parents:
        raise ValueError("output must be a JSON file inside the repository .local-explorer/ directory")
    data = (json.dumps(document, ensure_ascii=True, separators=(",", ":"), allow_nan=False) + "\n").encode("utf-8")
    if len(data) > MAX_OUTPUT_BYTES:
        raise ValueError("output exceeds 16 MiB; request a smaller frame window")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Never overwrite an existing export, input or prediction file.
    with destination.open("xb") as handle:
        handle.write(data)
    return len(data)


def _local(tag):
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else "?"


def _classify(group):
    """Missingness shape of one x,y,speed group, never its values."""
    values = group.split(",")
    if len(values) != 3:
        return "wrong-field-count"
    if not all(NUMBER.match(v) for v in values):
        return "non-numeric-or-infinite"
    x, y, speed = (math.isnan(float(v)) for v in values)
    if x and y:
        return "all-NaN" if speed else "x/y-NaN-speed-present"
    if x:
        return "x-NaN"
    if y:
        return "y-NaN"
    try:
        observation(group, "", ball=True)
    except ValueError:
        return "out-of-range"
    return "x/y-present-speed-NaN" if speed else "finite"


def diagnose(meta, tracking=None, start=0, count=MAX_FRAMES):
    """Privacy-safe compatibility report: tag names, counts and validation outcomes only. It never
    returns names, identifiers, coordinates, speeds or labels."""
    report = []
    content = Path(meta).read_bytes()[:MAX_METADATA_BYTES + 1]
    try:
        root = ET.fromstring(content) if b"<!DOCTYPE" not in content.upper() and b"<!ENTITY" not in content.upper() else None
    except ET.ParseError:
        root = None
    if root is None:
        report.append("metadata: not parseable as plain XML (or uses DTDs/entities)")
    else:
        tags = sorted({_local(e.tag) for e in root.iter()})
        teams = [t.get("id") for t in root.iter("Team")]
        players = list(root.iter("Player"))
        home = sum(1 for p in players if teams and p.get("teamId") == teams[0])
        away = sum(1 for p in players if len(teams) > 1 and p.get("teamId") == teams[1])
        shirts = [p.findtext("ShirtNumber") for p in players]
        report += [
            "metadata: element names: " + ", ".join(tags),
            "metadata: namespaced tags: {}".format(any(isinstance(e.tag, str) and e.tag.startswith("{") for e in root.iter())),
            "metadata: <Team> elements: {}; distinct non-empty ids: {}".format(len(teams), len({t for t in teams if t})),
            "metadata: <Player> track slots: {} (limit {}); first team: {}; second team: {}; other/missing teamId: {}".format(
                len(players), MAX_PLAYERS, home, away, len(players) - home - away),
            "metadata: ShirtNumber present: {}; decimal integers: {}".format(
                sum(s is not None for s in shirts), sum(isinstance(s, str) and s.isascii() and s.isdigit() for s in shirts)),
        ]
    try:
        slots = read_metadata(meta)
        report.append("metadata: validation PASSED ({} slots)".format(len(slots)))
    except (ValueError, OSError) as exc:
        report.append("metadata: validation FAILED: {}".format(exc))
        return report
    if tracking is None:
        return report
    shapes = {"ball": {}, "player": {}}
    seen = wrong_groups = 0
    end = start + count
    try:
        for line in bounded_lines(tracking):
            parts = line.rstrip("\r\n").split(":", 2)
            if len(parts) != 3 or not parts[0].isdigit():
                continue
            frame = int(parts[0]) - 1
            if frame < start:
                continue
            if frame >= end:
                break
            seen += 1
            groups = parts[1].split(";")
            wrong_groups += len(groups) != len(slots)
            shape = _classify(parts[2])
            shapes["ball"][shape] = shapes["ball"].get(shape, 0) + 1
            for g in groups:
                shape = _classify(g)
                shapes["player"][shape] = shapes["player"].get(shape, 0) + 1
    except (ValueError, OSError) as exc:
        report.append("tracking: scan stopped: {}".format(exc))
    report.append("tracking: frames found in window [{}, {}): {} of {}; rows with a slot count other than {}: {}".format(
        start, end, seen, count, len(slots), wrong_groups))
    for kind in ("ball", "player"):
        report.append("tracking: {} group shapes: {}".format(
            kind, ", ".join("{} {}".format(k, v) for k, v in sorted(shapes[kind].items())) or "none"))
    try:
        read_tracking(tracking, start, count, len(slots))
        report.append("tracking: validation PASSED")
    except (ValueError, OSError) as exc:
        report.append("tracking: validation FAILED: {}".format(exc))
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--metadata", required=True, help="authorized ATD metadata XML")
    parser.add_argument("--tracking", help="authorized normalized ATD tracking TXT")
    parser.add_argument("--predictions",
                        help="existing Rule-Based Possession Engine frame,label CSV (zero-based)")
    parser.add_argument("--baseline-predictions", help="optional existing smooth50 frame,label CSV for the same match")
    parser.add_argument("--start-frame", type=int, help="first zero-based prediction frame")
    parser.add_argument("--frame-count", type=int, help="1..7500 frames (25 fps)")
    parser.add_argument("--out", help="new .local-explorer/*.json file; never overwritten")
    parser.add_argument("--register", action="store_true", help="make this export the local Explorer default")
    parser.add_argument("--diagnose", action="store_true",
                        help="report only tag names, counts and validation outcomes for --metadata (and --tracking); writes nothing")
    args = parser.parse_args(argv)
    if args.diagnose:
        try:
            for line in diagnose(args.metadata, args.tracking, args.start_frame or 0, args.frame_count or MAX_FRAMES):
                print(line)
        except OSError as exc:
            parser.error(str(exc))
        return 0
    missing = [flag for flag, value in (("--tracking", args.tracking), ("--predictions", args.predictions),
                                        ("--start-frame", args.start_frame), ("--frame-count", args.frame_count),
                                        ("--out", args.out)) if value is None]
    if missing:
        parser.error("the following arguments are required: " + ", ".join(missing))
    try:
        # Check output confinement before opening any authorized inputs.
        destination = check_destination(args.out)
        document = export(args.metadata, args.tracking, args.predictions, args.start_frame, args.frame_count,
                          args.baseline_predictions)
        size = write_export(document, destination)
        registered = register(destination.name) if args.register else None
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    print("Wrote local-only visualization ({} bytes{}).".format(size, ", with smooth50" if args.baseline_predictions else ""))
    print("Registered as the local Explorer default." if registered
          else "Open it with the file picker in npm run dev:local, or re-export with --register.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
