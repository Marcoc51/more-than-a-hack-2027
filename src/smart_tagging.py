"""Minimal Smart Tagging (SportsCode XML) reader: set-piece restarts only.

Conventions follow the official `starter/load_smart_tagging.py` (MIT, Copyright (c) 2026-2027
Metrica Sports; full notice in src/baseline.py) and the official DATA.md:

  * <start>/<end> are seconds from the first frame of the tactical video, so the video frame is
    round(seconds * 25), and the end frame is exclusive (half-open interval);
  * codes are upper case ("SET PIECES") and tag values title case ("Kick Off (Start)"), so both
    are matched case-insensitively;
  * the Team tag can be "N/A" (every throw-in, per DATA.md); that is an explicitly unknown team.

Only SET PIECES instances are used downstream. Phase codes (BUILD UP, PROGRESSION, ...) are read
but deliberately ignored: they are phases, not possessions, and not dead-ball evidence.
"""

import difflib
import math
import xml.etree.ElementTree as ET
from collections import namedtuple

FPS = 25
SET_PIECES = "set pieces"
KICKOFF_START = "kick off (start)"
UNKNOWN_TEAM_VALUES = {"", "n/a", "na", "none", "unknown", "-"}
MIN_NAME_SIMILARITY = 0.6

Tag = namedtuple("Tag", "code type team start_frame end_frame")


def _norm(text):
    return " ".join((text or "").split()).lower()


def load(path, fps=FPS):
    """[Tag] in file order. Instances with missing, non-numeric, negative or reversed times are
    skipped: an interval we cannot place is no evidence at all."""
    out = []
    for instance in ET.parse(path).iter("instance"):
        try:
            start_s = float(instance.findtext("start"))
            end_s = float(instance.findtext("end"))
        except (TypeError, ValueError):
            continue
        if not (math.isfinite(start_s) and math.isfinite(end_s)) or start_s < 0 or end_s < start_s:
            continue
        labels = {_norm(label.findtext("group")): (label.findtext("text") or "").strip()
                  for label in instance.findall("label")}  # repeated group: last one wins
        team = labels.get("team")
        out.append(Tag(code=_norm(instance.findtext("code")),
                       type=_norm(labels.get("type")),
                       team=None if _norm(team) in UNKNOWN_TEAM_VALUES else team,
                       start_frame=int(round(start_s * fps)),
                       end_frame=int(round(end_s * fps))))
    return out


def set_pieces(tags):
    return [tag for tag in tags if tag.code == SET_PIECES]


def match_team(tag_team, team_names):
    """Index into team_names (0 = home, 1 = away) of the club a Team tag names, or None.

    The tag spells club names its own way ("Atletic Club"), so names are compared by similarity.
    None unless one team is a clear, unique best match -- an unmatched tag is an unknown team.
    """
    if tag_team is None:
        return None
    scores = [difflib.SequenceMatcher(None, _norm(tag_team), _norm(name)).ratio()
              for name in team_names]
    best = max(range(len(scores)), key=scores.__getitem__)
    if scores[best] < MIN_NAME_SIMILARITY or scores.count(scores[best]) > 1:
        return None
    return best
