"""Synthetic XML contract tests; no IDSSE match data is used."""
from dataclasses import fields, replace
from datetime import datetime, timedelta, timezone
from math import isnan, isinf
from xml.etree import ElementTree as ET

import numpy as np
import pytest

from benchmark import idsse_adapter as idsse


def synthetic_xml(tmp_path):
    meta = ET.Element("PutDataRequest")
    info = ET.SubElement(meta, "MatchInformation", MatchId="DFL-MAT-SYNTH")
    ET.SubElement(info, "General", HomeTeamId="HOME", AwayTeamId="AWAY")
    ET.SubElement(info, "Environment", PitchX="105", PitchY="68")
    teams = ET.SubElement(info, "Teams")
    for team_id, person_id in (("AWAY", "P2"), ("HOME", "P1")):
        team = ET.SubElement(teams, "Team", TeamId=team_id)
        ET.SubElement(ET.SubElement(team, "Players"), "Player", PersonId=person_id)
    positions = ET.Element("PutDataRequest")
    for section, base, start in (("firstHalf", 100, datetime(2025, 1, 1, 12, tzinfo=timezone.utc)),
                                 ("secondHalf", 200, datetime(2025, 1, 1, 13, tzinfo=timezone.utc))):
        ball = ET.SubElement(positions, "FrameSet", GameSection=section, TeamId="BALL")
        away = ET.SubElement(positions, "FrameSet", GameSection=section, TeamId="AWAY", PersonId="P2")
        home = ET.SubElement(positions, "FrameSet", GameSection=section, TeamId="HOME", PersonId="P1")
        for i in range(20):
            attrs = {"N": str(base + i), "T": (start + timedelta(milliseconds=40 * i)).isoformat()}
            ball_x = -52.5 if section == "firstHalf" else 52.5
            ball_y = -34.0 if section == "firstHalf" else 34.0
            ball_attrs = dict(attrs, X=str(ball_x), Y=str(ball_y), S="36",
                              BallStatus="1", BallPossession="1" if section == "firstHalf" else "2")
            if section == "firstHalf" and i == 1:
                ball_attrs["BallPossession"] = "2"
            if section == "firstHalf" and i == 2:
                ball_attrs["BallStatus"] = "0"
            if section == "firstHalf" and i == 3:
                ball_attrs["BallStatus"] = "9"
            if section == "firstHalf" and i == 4:
                ball_attrs["BallPossession"] = ""
            if section == "firstHalf" and i == 12:
                ball_attrs["X"] = ""
                ball_attrs["Y"] = ""
            ET.SubElement(ball, "Frame", **ball_attrs)
            ET.SubElement(away, "Frame", **dict(attrs, X="-30" if section == "firstHalf" else "52.5", Y=str(ball_y)))
            ET.SubElement(home, "Frame", **dict(attrs, X="-52.5" if section == "firstHalf" else "30", Y=str(ball_y)))
    meta_path, pos_path = tmp_path / "metadata.xml", tmp_path / "positions.xml"
    ET.ElementTree(meta).write(meta_path, encoding="utf-8")
    ET.ElementTree(positions).write(pos_path, encoding="utf-8")
    return meta_path, pos_path


def edit(path, change):
    tree = ET.parse(path)
    change(tree.getroot())
    tree.write(path, encoding="utf-8")


def test_idsse_mapping_timing_and_unchanged_engine(tmp_path):
    meta, pos = synthetic_xml(tmp_path)
    item = idsse.adapt_tracking("SYNTH", meta, pos)
    assert item.home_id == "HOME" and item.away_id == "AWAY"
    assert item.pitch == (105, 68)
    assert item.segments == ((0, 20), (20, 40))
    assert item.frame_keys == tuple([("firstHalf", 100 + i) for i in range(20)] +
                                    [("secondHalf", 200 + i) for i in range(20)])
    assert (item.timestamps[1] - item.timestamps[0]).total_seconds() == pytest.approx(0.04)
    assert item.tracking.ball_x[0] == 0 and item.tracking.ball_y[0] == 0
    assert item.tracking.ball_x[20] == 105 and item.tracking.ball_y[20] == 68
    assert item.tracking.home[0] == 0 and item.tracking.away[0] > 20
    assert item.tracking.away[20] == 0 and item.tracking.home[20] > 20
    assert isnan(item.tracking.ball_speed[0]) and isnan(item.tracking.ball_speed[20])
    assert item.tracking.ball_speed[1] == pytest.approx(10)
    assert isnan(item.tracking.ball_speed[12]) and isnan(item.tracking.ball_speed[13])
    assert isnan(item.tracking.home[12]) and isnan(item.tracking.away[12])
    assert idsse.ps.DEFAULTS.confirm_frames == 10 and idsse.ps.GAME_DEFAULTS.out_confirm_frames == 3
    prediction = idsse.predict(item)
    assert len(prediction) == 40 and set(prediction) <= set("HADX")
    assert "H" in prediction[:20] and "A" in prediction[20:]
    assert "BallStatus" not in {f.name for f in fields(item)}
    assert "BallPossession" not in {f.name for f in fields(item)}
    with pytest.raises(ValueError, match="validated"):
        idsse.predict(replace(item, _validation_token=None))


def test_provider_codes_are_separate_and_unknowns_remain_x(tmp_path):
    meta, pos = synthetic_xml(tmp_path)
    item = idsse.adapt_tracking("SYNTH", meta, pos)
    labels = idsse.provider_labels(item, pos)
    assert "".join(labels.labels[:5]) == "HADXX"
    assert set(labels.labels[20:]) == {"A"}
    assert labels.dead_frames == 1 and labels.unknown_frames == 2
    baseline = idsse.predict(item)
    def alter(root):
        first = root.findall("FrameSet")[0]
        first.findall("Frame")[0].set("BallPossession", "2")
        first.findall("Frame")[1].set("BallStatus", "7")
    edit(pos, alter)
    changed = idsse.adapt_tracking("SYNTH", meta, pos)
    np.testing.assert_array_equal(item.tracking.home, changed.tracking.home, strict=True)
    assert idsse.predict(changed) == baseline
    changed_labels = idsse.provider_labels(changed, pos)
    assert changed_labels.labels[0] == "A" and changed_labels.labels[1] == "X"
    with pytest.raises(ValueError, match="timeline"):
        idsse.provider_labels(item, _different_timeline(tmp_path))


def _different_timeline(tmp_path):
    path = tmp_path / "different.xml"
    root = ET.parse(tmp_path / "positions.xml").getroot()
    first = root.findall("FrameSet")[0]
    for frame in first.findall("Frame"):
        frame.set("N", str(int(frame.get("N")) + 1))
    ET.ElementTree(root).write(path, encoding="utf-8")
    return path


def test_missing_player_and_invalid_speed_are_conservative(tmp_path):
    meta, pos = synthetic_xml(tmp_path)
    def alter(root):
        sets = root.findall("FrameSet")
        sets[0].findall("Frame")[5].set("S", "bad")
        sets[1].findall("Frame")[6].set("X", "")
    edit(pos, alter)
    item = idsse.adapt_tracking("SYNTH", meta, pos)
    assert isnan(item.tracking.ball_speed[5])
    assert isinf(item.tracking.away[6])
    assert item.tracking.home[6] == 0
    dead, restarts = idsse.ps.game_evidence(item.tracking, [], [], item.segments,
                                             item.pitch, idsse.ps.GAME_DEFAULTS)
    assert not restarts
    assert not dead.any()


@pytest.mark.parametrize("mutate,reason", [
    (lambda m, p: edit(p, lambda r: r.findall("FrameSet")[0].findall("Frame")[2].set("N", "105")), "gap"),
    (lambda m, p: edit(p, lambda r: r.findall("FrameSet")[0].findall("Frame")[2].set("T", "2025-01-01T12:00:01+00:00")), "25 Hz"),
    (lambda m, p: edit(p, lambda r: r.findall("FrameSet")[1].set("TeamId", "HOME")), "disagrees"),
    (lambda m, p: edit(p, lambda r: r.remove(r.findall("FrameSet")[4])), "both teams"),
    (lambda m, p: edit(m, lambda r: r.find(".//Environment").set("PitchX", "0")), "PitchX"),
    (lambda m, p: edit(p, lambda r: r.findall("FrameSet")[0].set("GameSection", "thirdHalf")), "unsupported GameSection"),
])
def test_malformed_xml_contract_fails(tmp_path, mutate, reason):
    meta, pos = synthetic_xml(tmp_path)
    mutate(meta, pos)
    with pytest.raises(ValueError, match=reason):
        idsse.adapt_tracking("SYNTH", meta, pos)


def test_out_of_bounds_stoppage_does_not_require_provider_code(tmp_path):
    meta, pos = synthetic_xml(tmp_path)
    def alter(root):
        first = root.findall("FrameSet")[0]
        for i in (15, 16, 17):
            first.findall("Frame")[i].set("X", "53.1")
    edit(pos, alter)
    item = idsse.adapt_tracking("SYNTH", meta, pos)
    prediction = idsse.predict(item)
    labels = idsse.provider_labels(item, pos)
    assert prediction[15:18] == ("D", "D", "D")
    assert labels.labels[15:18] == ("H", "H", "H")


def test_nested_framesets_are_streamed_without_losing_frames(tmp_path):
    meta, pos = synthetic_xml(tmp_path)
    def nest(root):
        container = ET.Element("PositionData")
        for frame_set in list(root):
            root.remove(frame_set)
            container.append(frame_set)
        root.append(container)
    edit(pos, nest)
    item = idsse.adapt_tracking("SYNTH", meta, pos)
    assert len(item.frame_keys) == 40
    assert len(idsse.provider_labels(item, pos).labels) == 40


def test_stale_speed_on_frozen_ball_does_not_create_restarts_without_events(tmp_path):
    meta, pos = synthetic_xml(tmp_path)
    baseline = idsse.adapt_tracking("SYNTH", meta, pos)
    expected = idsse.predict(baseline)
    def stale_speed(root):
        for frame_set in root.findall("FrameSet"):
            if frame_set.get("TeamId") == "BALL":
                for frame in frame_set.findall("Frame"):
                    frame.set("S", "90")
    edit(pos, stale_speed)
    changed = idsse.adapt_tracking("SYNTH", meta, pos)
    assert changed.tracking.ball_speed[1] == pytest.approx(25)
    dead, restarts = idsse.ps.game_evidence(changed.tracking, [], [], changed.segments,
                                             changed.pitch, idsse.ps.GAME_DEFAULTS)
    assert not restarts
    assert idsse.predict(changed) == expected
