"""Shared synthetic fixtures. Nothing here reads the match data in dataset/."""

import os
import sys

import pytest

# The equivalence tests import modules from the read-only official clone in source/; do not let
# Python write __pycache__ into it.
sys.dont_write_bytecode = True

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "src"))

# Two teams, five track slots. Slot order = <Player> order = group order in each raw line.
# The away team is listed among the players first on purpose: home/away must come from <Team>
# order, not from which team's slots appear first.
META_XML = """<?xml version="1.0" encoding="UTF-8"?>
<Metadata>
  <Teams>
    <Team id="T-HOME"><Name>Synthetic Home</Name></Team>
    <Team id="T-AWAY"><Name>Synthetic Away</Name></Team>
  </Teams>
  <Players>
    <Player id="P1" teamId="T-AWAY"><Name>Track 1</Name><ShirtNumber>1</ShirtNumber></Player>
    <Player id="P2" teamId="T-HOME"><Name>Track 2</Name><ShirtNumber>2</ShirtNumber></Player>
    <Player id="P3" teamId="T-HOME"><Name>Track 3</Name><ShirtNumber>3</ShirtNumber></Player>
    <Player id="P4" teamId="T-AWAY"><Name>Track 4</Name><ShirtNumber>4</ShirtNumber></Player>
    <Player id="P5" teamId="T-HOME"><Name>Track 5</Name><ShirtNumber>5</ShirtNumber></Player>
  </Players>
</Metadata>
"""

NAN = "NaN,NaN,NaN"


def group(x, y, speed=0.0):
    return "{},{},{}".format(x, y, speed)


def raw_line(frame_id, players, ball):
    """One raw ATD line: '<frame_id>:<p1>;<p2>;...:<ball>'."""
    return "{}:{}:{}\n".format(frame_id, ";".join(players), ball)


@pytest.fixture
def meta_path(tmp_path):
    path = tmp_path / "SYN_atd.xml"
    path.write_text(META_XML, encoding="utf-8")
    return str(path)


@pytest.fixture
def write_raw(tmp_path):
    """Write raw ATD lines to a temp file and return its path."""
    def _write(lines, name="SYN_atd.txt"):
        path = tmp_path / name
        with open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.writelines(lines)
        return str(path)
    return _write
