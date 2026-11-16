"""Reproduction of the official More than a Hack 2027 `baseline_smooth50` submission.

Whoever is closest to the ball has it, then a centred majority vote over +/- 50 frames:

  1. For every frame where the tracking sees the ball, find the nearest tracked player and give
     that player's team the ball. Where the ball is not visible, there is no answer.
  2. Smooth with a centred majority vote over +/- 50 frames. D where no frame in the window has
     an answer; ties go to the home side.

Usage, from the repository root:

    python src/baseline.py --out outputs/baseline_smooth50.csv

The match data is read from MTAH_DATA_DIR (or --data-dir), laid out as the organisers ship it:
<data-dir>/tactical/BAR-ATH_tactical_atd.xml and <data-dir>/tactical/BAR-ATH_tactical_atd.txt.

Differences from the official script are deliberately limited to I/O, so the labels are identical:
  * one variant only (window 50) instead of four;
  * explicit UTF-8 and LF line endings, so the bytes are the same on every OS;
  * no output derived from the match data is printed.

Attribution
-----------
The parsing, nearest-player and smoothing logic below is adapted from `starter/baseline.py` in
https://github.com/metrica-sports/more-than-a-hack-2027, released under the MIT Licence:

    Copyright (c) 2026-2027 Metrica Sports

    Permission is hereby granted, free of charge, to any person obtaining a copy of this software
    and associated documentation files (the "Software"), to deal in the Software without
    restriction, including without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
    Software is furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all copies or
    substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
    BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
    NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
    DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The match data is NOT covered by that licence; it is licensed separately for the competition.
"""

import argparse
import os
import sys
import xml.etree.ElementTree as ET

import numpy as np

# -- constants, from the official games.py (tactical source of BAR-ATH) -----------------------
GAME_STEM = "BAR-ATH_tactical"
N_VIDEO_FRAMES = 199319          # rows in a submission: video frames 0..199318
PITCH = (105.3, 68.0)            # metres; normalised 0-1 coordinates are scaled by this
WINDOW = 50                      # half-width of the majority vote: baseline_smooth50

# Raw ATD line: "<frame_id>:<player>;<player>;...:<ball>", each group "x,y,speed" with NaN for a
# missing observation. frame_id counts from 1; submission rows count from 0.
FIELD_SEP = ":"
GROUP_SEP = ";"
MISSING = "N"  # first character of "NaN"

HOME, AWAY, NOBODY = 0, 1, -1


def data_paths(data_dir):
    """(meta_xml, raw_txt) for the tactical recording, or a readable error if either is missing."""
    folder = os.path.join(data_dir, "tactical")
    meta = os.path.join(folder, GAME_STEM + "_atd.xml")
    raw = os.path.join(folder, GAME_STEM + "_atd.txt")
    missing = [path for path in (meta, raw) if not os.path.isfile(path)]
    if missing:
        raise IOError("match data not found:\n  {}\nSet MTAH_DATA_DIR or pass --data-dir.".format(
            "\n  ".join(missing)))
    return meta, raw


def team_of_each_track(meta_path):
    """Array over track slots: HOME if the slot belongs to the first team in the XML, else AWAY.

    The first <Team> is the home side (FIFA/EPTS convention, followed by kloppy). Slot order is
    the order of the <Player> elements, which is the order of the groups in each raw line.
    """
    root = ET.parse(meta_path).getroot()
    team_ids = [team.get("id") for team in root.iter("Team")]
    if len(team_ids) != 2:
        raise ValueError("{}: expected 2 teams, found {}".format(meta_path, len(team_ids)))

    home_id = team_ids[0]
    slots = [player.get("teamId") for player in root.iter("Player")]
    if not slots:
        raise ValueError("{}: no Player entries".format(meta_path))
    return np.array([HOME if team_id == home_id else AWAY for team_id in slots], dtype=np.int8)


def nearest_player_labels(raw_path, team_of_track, n_frames, pitch=PITCH):
    """Per-frame team code of the player nearest the ball; NOBODY where the ball is not seen.

    Both axes are scaled to metres before distances are compared. Strict '<' means the first
    slot wins an exact distance tie, as in the official script.
    """
    length, width = pitch
    out = np.full(n_frames, NOBODY, dtype=np.int8)

    with open(raw_path, encoding="utf-8") as handle:
        for line in handle:
            parts = line.split(FIELD_SEP)
            if len(parts) != 3:
                continue
            ball = parts[2]
            if ball[0] == MISSING:
                continue

            comma = ball.index(",")
            ball_x = float(ball[:comma]) * length
            ball_y = float(ball[comma + 1:ball.index(",", comma + 1)]) * width

            best, best_team = None, NOBODY
            for slot, group in enumerate(parts[1].split(GROUP_SEP)):
                if group[0] == MISSING:
                    continue
                comma = group.index(",")
                dx = float(group[:comma]) * length - ball_x
                dy = float(group[comma + 1:group.index(",", comma + 1)]) * width - ball_y
                distance = dx * dx + dy * dy
                if best is None or distance < best:
                    best, best_team = distance, team_of_track[slot]

            out[int(parts[0]) - 1] = best_team  # frame_id counts from 1, submissions from 0
    return out


def smooth(codes, window):
    """Centred majority vote over +/- window frames. D where nobody has the ball; ties to H."""
    if window <= 0:
        return np.where(codes == HOME, "H", np.where(codes == AWAY, "A", "D"))

    home_cumulative = np.concatenate(([0], np.cumsum(codes == HOME)))
    away_cumulative = np.concatenate(([0], np.cumsum(codes == AWAY)))

    index = np.arange(len(codes))
    low = np.maximum(0, index - window)
    high = np.minimum(len(codes), index + window + 1)
    home = home_cumulative[high] - home_cumulative[low]
    away = away_cumulative[high] - away_cumulative[low]

    labels = np.full(len(codes), "D", dtype="<U1")
    seen = (home + away) > 0
    labels[seen] = np.where(home[seen] >= away[seen], "H", "A")
    return labels


def write_submission(path, labels):
    """frame,label CSV: UTF-8, LF line endings, one row per frame from 0."""
    folder = os.path.dirname(path)
    if folder and not os.path.isdir(folder):
        os.makedirs(folder)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("frame,label\n")
        handle.writelines("{},{}\n".format(frame, label) for frame, label in enumerate(labels))
    return path


def build_labels(meta_path, raw_path, n_frames=N_VIDEO_FRAMES, window=WINDOW):
    """The whole baseline: tracking files in, one label per frame out."""
    codes = nearest_player_labels(raw_path, team_of_each_track(meta_path), n_frames)
    return smooth(codes, window)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Reproduce the official baseline_smooth50.")
    parser.add_argument("--out", required=True, help="output CSV path (keep it under outputs/)")
    parser.add_argument("--data-dir", default=os.environ.get("MTAH_DATA_DIR"),
                        help="match data root containing tactical/ (default: $MTAH_DATA_DIR)")
    args = parser.parse_args(argv)

    if not args.data_dir:
        parser.error("set MTAH_DATA_DIR or pass --data-dir")

    meta_path, raw_path = data_paths(args.data_dir)
    write_submission(args.out, build_labels(meta_path, raw_path))
    print("wrote {}".format(args.out))  # the path only; nothing derived from the data
    return 0


if __name__ == "__main__":
    sys.exit(main())
