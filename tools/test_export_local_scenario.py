"""Local adapter tests use newly written synthetic inputs only, never match data."""

import json
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).parent))
import export_local_scenario as ex  # noqa: E402


META = """<Metadata><Teams><Team id="H"><Name>Private name omitted</Name></Team>
<Team id="A"/></Teams><Players>
<Player id="private-id" teamId="A"><ShirtNumber>8</ShirtNumber></Player>
<Player id="h2" teamId="H"/></Players></Metadata>"""
ROW = "{frame}:0.1,0.2,1;NaN,NaN,NaN:0.5,0.5,2\n"


@pytest.fixture
def inputs(tmp_path):
    meta, tracking, predictions = [tmp_path / name for name in ("synthetic.xml", "synthetic.txt", "synthetic.csv")]
    meta.write_text(META, encoding="utf-8")
    tracking.write_text("".join(ROW.format(frame=f) for f in range(1, 7)), encoding="utf-8")
    predictions.write_text("frame,label\n" + "".join("{},{}\n".format(f, "HADXHA"[f]) for f in range(6)), encoding="utf-8")
    return meta, tracking, predictions


def test_crop_alignment_and_shared_visualization_shape(inputs):
    scenario = ex.export(*inputs, 2, 3)
    assert scenario["schemaVersion"] == "local-1"
    assert scenario["sourceFrameStart"] == 2
    assert scenario["frameCount"] == 3 and scenario["fps"] == 25
    assert scenario["predictions"]["labels"] == "DXH"
    assert len(scenario["frames"]) == 3
    assert scenario["frames"][0] == {"ball": [52.65, 34.0, 2.0], "players": [[10.53, 13.6], None]}
    assert scenario["players"] == [{"id": "slot-1", "teamId": "away", "shirt": 8, "role": "track"},
                                   {"id": "slot-2", "teamId": "home", "shirt": 0, "role": "track"}]
    assert scenario["provenance"]["kind"] == "local-private"
    assert "reference" not in scenario and "models" not in scenario


def test_no_private_names_paths_or_fabricated_metrics(inputs):
    out = json.dumps(ex.export(*inputs, 0, 6))
    assert "Private name omitted" not in out and "private-id" not in out
    assert str(inputs[0]) not in out and inputs[0].name not in out
    assert "scores" not in out and "smooth50" not in out and "evidence" not in out.replace("inferred evidence", "")


def test_deterministic_and_read_only(inputs):
    before = [p.read_bytes() for p in inputs]
    assert ex.export(*inputs, 0, 6) == ex.export(*inputs, 0, 6)
    assert [p.read_bytes() for p in inputs] == before


def test_environment_is_not_an_input(inputs, monkeypatch):
    monkeypatch.setenv("MTAH_DATA_DIR", "must-not-be-opened")
    assert ex.export(*inputs, 0, 1)["frameCount"] == 1


@pytest.mark.parametrize("start,count", [(-1, 1), (True, 1), (0.5, 1), (0, 0), (0, 7501), (0, True), (0, 1.5)])
def test_window_limits(inputs, start, count):
    with pytest.raises(ValueError):
        ex.export(*inputs, start, count)


@pytest.mark.parametrize("content,match", [
    ("frame,label\n0,H\n2,A\n", "contiguous"),
    ("frame,label\n0,H\n0,A\n", "contiguous"),
    ("frame,label\n0,H\n1,Q\n", "H, A, D or X"),
    ("frame,label\n0,H\n1,h\n", "H, A, D or X"),
    ("frame,label\n0,H\n", "every requested frame"),
    ("frame,label,other\n0,H,1\n", "exact frame,label"),
    ("frame,label\n0,H,1\n", "two columns"),
    ("frame,label\n0.0,H\n", "decimal integer"),
    ('"frame,label\n', "malformed CSV"),
])
def test_predictions_validation(inputs, content, match):
    inputs[2].write_text(content, encoding="utf-8")
    with pytest.raises(ValueError, match=match):
        ex.export(*inputs, 0, 2)


@pytest.mark.parametrize("rows,match", [
    ([1, 3], "missing requested frame"),
    ([1, 1], "strictly increasing"),
    ([2, 1], "missing requested frame"),
    ([1], "every requested frame"),
    ([0, 1], "below 1"),
])
def test_tracking_frame_validation(inputs, rows, match):
    inputs[1].write_text("".join(ROW.format(frame=f) for f in rows), encoding="utf-8")
    with pytest.raises(ValueError, match=match):
        ex.export(*inputs, 0, 2)


@pytest.mark.parametrize("group", ["Infinity,0,0", "0.1,0.2,inf", "0.2,0.2", "0.2,0.2,1,1", "hello,0,0", "0.1,,1",
                                   " 0.1,0.2,1", "1_0,0,0", "0x1,0,0", "11,0,0", "0,0,-1", "0,0,101"])
def test_malformed_observations(inputs, group):
    inputs[1].write_text("1:0.1,0.2,1;NaN,NaN,NaN:" + group + "\n", encoding="utf-8")
    with pytest.raises(ValueError):
        ex.export(*inputs, 0, 1)


def test_nan_ball_and_off_pitch_observations(inputs):
    inputs[1].write_text("1:-0.1,1.1,0;NaN,NaN,NaN:NaN,NaN,NaN\n", encoding="utf-8")
    frame = ex.export(*inputs, 0, 1)["frames"][0]
    assert frame["ball"] is None and frame["players"][0] == [-10.53, 74.8]


def test_player_count_mismatch(inputs):
    inputs[1].write_text("1:0.1,0.2,0:0.2,0.2,1\n", encoding="utf-8")
    with pytest.raises(ValueError, match="player slots"):
        ex.export(*inputs, 0, 1)


@pytest.mark.parametrize("content,match", [
    ("<bad>", "valid XML"),
    ("<!DOCTYPE Metadata><Metadata/>", "DTDs"),
    (META.replace('teamId="A"', 'teamId="unknown"'), "unknown teamId"),
    (META.replace('<Team id="A"/>', '<Team id="H"/>'), "distinct teams"),
    (META.replace("<ShirtNumber>8</ShirtNumber>", "<ShirtNumber>8.5</ShirtNumber>"), "decimal integer"),
])
def test_metadata_validation(inputs, content, match):
    inputs[0].write_text(content, encoding="utf-8")
    with pytest.raises(ValueError, match=match):
        ex.export(*inputs, 0, 1)


def test_metadata_player_cap(inputs):
    inputs[0].write_text('<Metadata><Team id="H"/><Team id="A"/>' + '<Player teamId="H"/>' * 65 + '</Metadata>', encoding="utf-8")
    with pytest.raises(ValueError, match=r"1\.\.64 player slots \(found 65\)"):
        ex.export(*inputs, 0, 1)


def test_scanning_and_memory_are_bounded_to_window(inputs, monkeypatch):
    def bounded(path):
        if Path(path) == inputs[1]:
            yield ROW.format(frame=1)
        else:
            yield "frame,label\n"
            yield "0,H\n"
        raise AssertionError("adapter scanned beyond the requested window")
    monkeypatch.setattr(ex, "bounded_lines", bounded)
    assert ex.export(*inputs, 0, 1)["frameCount"] == 1


def test_output_confinement_no_overwrite_and_json(inputs, monkeypatch, tmp_path):
    local = tmp_path / ".local-explorer"
    monkeypatch.setattr(ex, "OUTPUT_ROOT", local)
    scenario = ex.export(*inputs, 0, 2)
    destination = local / "synthetic-only.json"
    size = ex.write_export(scenario, destination)
    assert size == destination.stat().st_size
    assert json.loads(destination.read_text(encoding="utf-8")) == scenario
    with pytest.raises(FileExistsError):
        ex.write_export(scenario, destination)
    for output in (tmp_path / "public" / "private.json", local / ".." / "private.json", local / "private.js"):
        with pytest.raises(ValueError, match="repository .local-explorer"):
            ex.write_export(scenario, output)


def test_output_limit(inputs, monkeypatch, tmp_path):
    monkeypatch.setattr(ex, "OUTPUT_ROOT", tmp_path / ".local-explorer")
    monkeypatch.setattr(ex, "MAX_OUTPUT_BYTES", 5)
    with pytest.raises(ValueError, match="16 MiB"):
        ex.write_export(ex.export(*inputs, 0, 1), ex.OUTPUT_ROOT / "too-big.json")
    assert not ex.OUTPUT_ROOT.exists()


def test_line_and_file_limits(inputs, monkeypatch):
    monkeypatch.setattr(ex, "MAX_LINE_BYTES", 5)
    with pytest.raises(ValueError, match="64 KiB"):
        list(ex.bounded_lines(inputs[1]))
    monkeypatch.setattr(ex, "MAX_INPUT_BYTES", 1)
    with pytest.raises(ValueError, match="2 GiB"):
        list(ex.bounded_lines(inputs[1]))


def test_cli_checks_destination_before_opening_inputs(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "OUTPUT_ROOT", tmp_path / ".local-explorer")
    with pytest.raises(SystemExit) as exc:
        ex.main(["--metadata", "never-open.xml", "--tracking", "never-open.txt", "--predictions", "never-open.csv",
                 "--start-frame", "0", "--frame-count", "1", "--out", str(tmp_path / "public.json")])
    assert exc.value.code == 2


def test_cli_synthetic_success(inputs, tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "OUTPUT_ROOT", tmp_path / ".local-explorer")
    destination = ex.OUTPUT_ROOT / "synthetic.json"
    assert ex.main(["--metadata", str(inputs[0]), "--tracking", str(inputs[1]), "--predictions", str(inputs[2]),
                    "--start-frame", "1", "--frame-count", "2", "--out", str(destination)]) == 0
    assert json.loads(destination.read_text(encoding="utf-8"))["predictions"]["labels"] == "AD"


@pytest.fixture
def baseline(tmp_path):
    path = tmp_path / "smooth50.csv"
    path.write_text("frame,label\n" + "".join("{},{}\n".format(f, "HHAAAD"[f]) for f in range(6)), encoding="utf-8")
    return path


def test_baseline_is_cropped_to_the_same_frames_and_never_a_reference(inputs, baseline):
    scenario = ex.export(*inputs, 2, 3, baseline=baseline)
    assert scenario["predictions"] == {"name": "Rule-Based Possession Engine", "labels": "DXH"}
    assert scenario["baseline"] == {"name": "Official smooth50 baseline", "labels": "AAA"}
    assert "reference" not in scenario and "scores" not in json.dumps(scenario)
    assert "baseline" not in ex.export(*inputs, 2, 3)


@pytest.mark.parametrize("body, message", [
    ("frame,label\n0,H\n1,H\n2,Q\n3,H\n4,H\n", "label"),
    ("frame,label\n0,H\n1,H\n", "cover every requested frame"),
    ("frame,label\n0,H\n2,H\n3,H\n4,H\n", "contiguous"),
])
def test_malformed_baseline_is_rejected(inputs, tmp_path, body, message):
    bad = tmp_path / "bad-baseline.csv"
    bad.write_text(body, encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        ex.export(*inputs, 2, 3, baseline=bad)


def test_register_lists_only_file_names_and_puts_the_newest_first(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "OUTPUT_ROOT", tmp_path / ".local-explorer")
    ex.OUTPUT_ROOT.mkdir()
    assert ex.register("window-000.json") == ["window-000.json"]
    assert ex.register("window-001.json") == ["window-001.json", "window-000.json"]
    assert ex.register("window-000.json") == ["window-000.json", "window-001.json"]
    config = json.loads((ex.OUTPUT_ROOT / ex.CONFIG_NAME).read_text(encoding="utf-8"))
    assert config == {"schema": "local-explorer-config-1", "exports": ["window-000.json", "window-001.json"]}
    for name in ("explorer-config.json", "../escape.json", "sub/dir.json", ".hidden.json", "a.txt"):
        with pytest.raises(ValueError):
            ex.register(name)


def test_register_refuses_a_corrupt_or_foreign_config(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "OUTPUT_ROOT", tmp_path / ".local-explorer")
    ex.OUTPUT_ROOT.mkdir()
    config = ex.OUTPUT_ROOT / ex.CONFIG_NAME
    for body in ("{not json", '{"exports": ["a.json"]}', '{"schema": "local-explorer-config-1", "exports": ["../x.json"]}'):
        config.write_text(body, encoding="utf-8")
        with pytest.raises(ValueError):
            ex.register("window.json")
        assert config.read_text(encoding="utf-8") == body


def test_destination_must_be_a_plain_name_directly_in_the_export_directory(tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "OUTPUT_ROOT", tmp_path / ".local-explorer")
    for name in ("nested/window.json", "explorer-config.json", "-flag.json", "space name.json"):
        with pytest.raises(ValueError):
            ex.check_destination(ex.OUTPUT_ROOT / name)


def test_cli_with_baseline_and_register(inputs, baseline, tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(ex, "OUTPUT_ROOT", tmp_path / ".local-explorer")
    destination = ex.OUTPUT_ROOT / "window.json"
    assert ex.main(["--metadata", str(inputs[0]), "--tracking", str(inputs[1]), "--predictions", str(inputs[2]),
                    "--baseline-predictions", str(baseline), "--start-frame", "0", "--frame-count", "6",
                    "--out", str(destination), "--register"]) == 0
    document = json.loads(destination.read_text(encoding="utf-8"))
    assert document["baseline"]["labels"] == "HHAAAD" and document["predictions"]["labels"] == "HADXHA"
    assert json.loads((ex.OUTPUT_ROOT / ex.CONFIG_NAME).read_text(encoding="utf-8"))["exports"] == ["window.json"]
    printed = capsys.readouterr().out
    assert "HADXHA" not in printed and "HHAAAD" not in printed


def tactical_like_metadata(slots=46):
    """The organisers' DATA.md layout: 46 track slots named Track 1..46 whose ShirtNumber is the
    slot index, each assigned to one of two teams. Names here are invented placeholders."""
    players = "".join(
        '<Player id="p{0}" teamId="{1}"><Name>Track {0}</Name><ShirtNumber>{0}</ShirtNumber></Player>'.format(
            i, "T-home" if i % 2 else "T-away") for i in range(1, slots + 1))
    return ('<Metadata><GlobalConfig><FrameRate>25</FrameRate></GlobalConfig><Teams>'
            '<Team id="T-home"><Name>SECRET_HOME_NAME</Name></Team><Team id="T-away"><Name>SECRET_AWAY_NAME</Name></Team>'
            '</Teams><Players>' + players + '</Players></Metadata>')


def tactical_like_row(frame, slots=46, tracked=22):
    groups = ["0.{:03d},0.5,1.5".format(100 + i) if i < tracked else "NaN,NaN,NaN" for i in range(slots)]
    ball = "NaN,NaN,NaN" if frame % 7 == 0 else "0.5,0.5,3"
    return "{}:{}:{}\n".format(frame, ";".join(groups), ball)


def test_46_track_slot_metadata_like_the_competition_file_is_accepted(tmp_path):
    """Regression: the exporter capped slots at 32 while the documented tactical metadata has 46."""
    meta, tracking, predictions = tmp_path / "m.xml", tmp_path / "t.txt", tmp_path / "p.csv"
    meta.write_text(tactical_like_metadata(), encoding="utf-8")
    tracking.write_text("".join(tactical_like_row(f) for f in range(1, 11)), encoding="utf-8")
    predictions.write_text("frame,label\n" + "".join("{},H\n".format(f) for f in range(10)), encoding="utf-8")
    scenario = ex.export(meta, tracking, predictions, 2, 5)
    assert len(scenario["players"]) == 46
    assert [p["shirt"] for p in scenario["players"]] == list(range(1, 47))
    assert {p["teamId"] for p in scenario["players"][:2]} == {"home", "away"}
    assert sum(xy is not None for xy in scenario["frames"][0]["players"]) == 22
    text = json.dumps(scenario)
    assert "SECRET_HOME_NAME" not in text and "Track 1" not in text and '"p1"' not in text


def test_full_window_with_46_tracked_slots_fits_the_output_limit(tmp_path):
    meta, tracking, predictions = tmp_path / "m.xml", tmp_path / "t.txt", tmp_path / "p.csv"
    meta.write_text(tactical_like_metadata(), encoding="utf-8")
    tracking.write_text("".join(tactical_like_row(f, tracked=46) for f in range(1, 7501)), encoding="utf-8")
    predictions.write_text("frame,label\n" + "".join("{},A\n".format(f) for f in range(7500)), encoding="utf-8")
    document = ex.export(meta, tracking, predictions, 0, 7500)
    size = len(json.dumps(document, separators=(",", ":")).encode("utf-8"))
    assert size < ex.MAX_OUTPUT_BYTES / 2


def test_diagnose_reports_only_names_of_tags_counts_and_outcomes(tmp_path, capsys):
    meta, tracking = tmp_path / "m.xml", tmp_path / "t.txt"
    meta.write_text(tactical_like_metadata(), encoding="utf-8")
    rows = [tactical_like_row(f) for f in range(1, 6)]
    rows[2] = rows[2].replace("NaN,NaN,NaN", "0.2,0.3,NaN", 1)  # one player: position present, speed NaN
    tracking.write_text("".join(rows), encoding="utf-8")
    assert ex.main(["--diagnose", "--metadata", str(meta), "--tracking", str(tracking), "--frame-count", "5"]) == 0
    out = capsys.readouterr().out
    assert "<Player> track slots: 46 (limit 64); first team: 23; second team: 23; other/missing teamId: 0" in out
    assert "metadata: validation PASSED (46 slots)" in out
    assert "player group shapes: all-NaN 119, finite 110, x/y-present-speed-NaN 1" in out
    assert "tracking: validation PASSED" in out
    for private in ("SECRET_HOME_NAME", "T-home", "Track 1", '"p1"', "0.100", "0.2,0.3", "1.5"):
        assert private not in out


def test_diagnose_explains_a_slot_count_failure_without_writing_anything(tmp_path, capsys, monkeypatch):
    monkeypatch.setattr(ex, "OUTPUT_ROOT", tmp_path / ".local-explorer")
    meta = tmp_path / "m.xml"
    meta.write_text(tactical_like_metadata(slots=70), encoding="utf-8")
    assert ex.main(["--diagnose", "--metadata", str(meta)]) == 0
    out = capsys.readouterr().out
    assert "track slots: 70 (limit 64)" in out and "validation FAILED: metadata must declare 1..64 player slots (found 70)" in out
    assert not ex.OUTPUT_ROOT.exists()


def test_export_still_requires_its_arguments_without_diagnose(tmp_path):
    with pytest.raises(SystemExit) as exc:
        ex.main(["--metadata", str(tmp_path / "m.xml"), "--tracking", "t.txt"])
    assert exc.value.code == 2



# ---- Partially missing observations (DATA.md: x,y,speed; "Missing observations are NaN") ----

MIXED_PLAYERS = {
    0: "0.100,0.200,1.5",   # fully finite
    1: "NaN,NaN,NaN",       # fully missing
    2: "0.300,0.400,NaN",   # position present, speed unknown -> position kept
    3: "NaN,0.400,1.0",     # x missing -> position unavailable
    4: "0.300,NaN,1.0",     # y missing -> position unavailable
    5: "NaN,NaN,2.0",       # position missing, speed present -> unavailable
}
MIXED_BALLS = ["0.500,0.500,3.0", "0.510,0.500,NaN", "NaN,0.500,3.0", "NaN,NaN,NaN", "0.520,NaN,NaN"]


def mixed_row(frame, slots=46):
    groups = [MIXED_PLAYERS.get(i, "0.{:03d},0.6,1.0".format(100 + i) if i < 22 else "NaN,NaN,NaN") for i in range(slots)]
    return "{}:{}:{}\n".format(frame, ";".join(groups), MIXED_BALLS[(frame - 1) % len(MIXED_BALLS)])


@pytest.fixture
def mixed(tmp_path):
    meta, tracking = tmp_path / "m.xml", tmp_path / "t.txt"
    engine, smooth = tmp_path / "engine.csv", tmp_path / "smooth50.csv"
    meta.write_text(tactical_like_metadata(), encoding="utf-8")
    tracking.write_text("".join(mixed_row(f) for f in range(1, 21)), encoding="utf-8")
    engine.write_text("frame,label\n" + "".join("{},{}\n".format(f, "HHAADDXXHA"[f % 10]) for f in range(20)), encoding="utf-8")
    smooth.write_text("frame,label\n" + "".join("{},{}\n".format(f, "HAAAHHAAHH"[f % 10]) for f in range(20)), encoding="utf-8")
    return meta, tracking, engine, smooth


def test_partially_missing_observations_keep_positions_and_never_invent_values(mixed):
    meta, tracking, engine, smooth = mixed
    scenario = ex.export(meta, tracking, engine, 5, 10, baseline=smooth)
    first = scenario["frames"][0]  # raw ATD id 6 -> frame 5
    players = first["players"]
    assert len(players) == 46
    assert players[0] == [10.53, 13.6]          # finite
    assert players[1] is None                   # all NaN
    assert players[2] == [31.59, 27.2]          # speed NaN: position kept
    assert players[3] is None and players[4] is None and players[5] is None  # x or y missing
    assert players[30] is None                  # untracked slot
    # Ball cycle starts at raw id 6 -> (6 - 1) % 5 == 0.
    assert [f["ball"] for f in scenario["frames"][:5]] == [
        [52.65, 34.0, 3.0], [53.703, 34.0, None], None, None, None]
    # Labels and the same-frame smooth50 comparison are copied unchanged from frames 5..14.
    assert scenario["sourceFrameStart"] == 5
    assert scenario["predictions"]["labels"] == "DXXHAHHAAD"
    assert scenario["baseline"]["labels"] == "HAAAHHAAHH"[5:] + "HAAAH"
    assert len(scenario["predictions"]["labels"]) == len(scenario["baseline"]["labels"]) == len(scenario["frames"]) == 10


def test_partially_missing_export_writes_json_null_not_nan_or_zero(mixed, tmp_path, monkeypatch):
    monkeypatch.setattr(ex, "OUTPUT_ROOT", tmp_path / ".local-explorer")
    meta, tracking, engine, smooth = mixed
    destination = ex.OUTPUT_ROOT / "mixed.json"
    assert ex.main(["--metadata", str(meta), "--tracking", str(tracking), "--predictions", str(engine),
                    "--baseline-predictions", str(smooth), "--start-frame", "0", "--frame-count", "20",
                    "--out", str(destination)]) == 0
    text = destination.read_text(encoding="utf-8")
    assert "NaN" not in text and "Infinity" not in text
    document = json.loads(text)
    assert document["frames"][1]["ball"] == [53.703, 34.0, None]
    assert all(xy is None or all(isinstance(v, float) for v in xy) for f in document["frames"] for xy in f["players"])
    assert [0.0, 0.0] not in [xy for f in document["frames"] for xy in f["players"]]


def test_diagnose_reports_each_missingness_category(mixed, capsys):
    meta, tracking, _engine, _smooth = mixed
    assert ex.main(["--diagnose", "--metadata", str(meta), "--tracking", str(tracking), "--frame-count", "20"]) == 0
    out = capsys.readouterr().out
    assert ("player group shapes: all-NaN 500, finite 340, x-NaN 20, x/y-NaN-speed-present 20, "
            "x/y-present-speed-NaN 20, y-NaN 20") in out
    assert "ball group shapes: all-NaN 4, finite 4, x-NaN 4, x/y-present-speed-NaN 4, y-NaN 4" in out
    assert "tracking: validation PASSED" in out
    for private in ("0.100", "0.300", "0.510", "Track 1", "T-home", "HHAAD"):
        assert private not in out
