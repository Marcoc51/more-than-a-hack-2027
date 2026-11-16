"""Tests for tools/export_scenarios.py. Synthetic only; run with `python -m pytest tools -q`."""

import builtins
import hashlib
import json
import os
import sys

import pytest

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import export_scenarios as ex  # noqa: E402


@pytest.fixture(scope="module")
def scenario():
    return ex.export_s1()


def test_export_is_byte_identical_across_runs(scenario):
    assert ex.render(scenario) == ex.render(ex.export_s1())


def test_committed_json_is_current():
    assert ex.main(["--check"]) == 0


def test_shape_and_frame_alignment(scenario):
    n = scenario["frameCount"]
    assert n == 400 and len(scenario["frames"]) == n and scenario["fps"] == 25
    assert scenario["graded"] == [[25, 375]]
    ids = {t["id"] for t in scenario["teams"]}
    assert ids == {"home", "away"}
    assert all(p["teamId"] in ids for p in scenario["players"]) and len(scenario["players"]) == 22
    assert all(len(f["players"]) == 22 for f in scenario["frames"])
    for model in scenario["models"].values():
        assert len(model["labels"]) == n and set(model["labels"]) <= set("HADX")
    p3 = scenario["models"]["phase3b"]
    assert len(p3["evidence"]) == len(p3["reasons"]) == len(p3["nearestHome"]) == n
    # The engine saw no ball exactly where the exported frame has no ball.
    for frame, code in zip(scenario["frames"], p3["evidence"]):
        assert (frame["ball"] is None) == (code == "_")


def test_reference_is_separate_from_model_output(scenario):
    assert scenario["reference"]["source"] == "scenario-script"
    assert "reference" not in scenario["models"]
    assert len(scenario["reference"]["labels"]) == scenario["frameCount"]


def test_provenance(scenario):
    prov = scenario["provenance"]
    assert prov["kind"] == "synthetic" and prov["generatorVersion"] == ex.GENERATOR_VERSION
    assert len(prov["engineCommit"]) == 40
    for rel, digest in prov["engineFiles"].items():
        with open(os.path.join(ex.ROOT, rel), "rb") as handle:
            assert hashlib.sha256(handle.read().replace(b"\r\n", b"\n")).hexdigest() == digest


def test_labels_come_from_the_unchanged_engines(monkeypatch):
    calls = {}
    real_p3, real_b = ex.possession.build_labels, ex.baseline.build_labels

    def spy_p3(meta, raw, **kw):
        calls["phase3b"] = (raw, kw, "".join(real_p3(meta, raw, **kw)))
        return list(calls["phase3b"][2])

    def spy_b(meta, raw, **kw):
        calls["smooth50"] = (raw, kw, "".join(real_b(meta, raw, **kw)))
        return list(calls["smooth50"][2])

    monkeypatch.setattr(ex.possession, "build_labels", spy_p3)
    monkeypatch.setattr(ex.baseline, "build_labels", spy_b)
    out = ex.export_s1()
    assert calls["phase3b"][0] == calls["smooth50"][0]   # identical synthetic observations
    assert "params" not in calls["phase3b"][1]            # default (unchanged) parameters
    assert out["models"]["phase3b"]["labels"] == calls["phase3b"][2]
    assert out["models"]["smooth50"]["labels"] == calls["smooth50"][2]


def test_baseline_output_flows_through_unedited(monkeypatch):
    monkeypatch.setattr(ex.baseline, "build_labels", lambda meta, raw, **kw: ["A"] * 400)
    assert ex.export_s1()["models"]["smooth50"]["labels"] == "A" * 400


def test_engine_divergence_is_detected(monkeypatch):
    monkeypatch.setattr(ex.possession, "build_labels", lambda meta, raw, **kw: ["X"] * 400)
    with pytest.raises(RuntimeError, match="diverges"):
        ex.export_s1()


def test_no_restricted_path_is_opened_and_env_fallback_is_ignored(monkeypatch, tmp_path):
    decoy = os.path.join(ex.ROOT, "dataset")
    monkeypatch.setenv("MTAH_DATA_DIR", decoy)
    opened = []
    real_open = builtins.open

    def tracking_open(path, *args, **kwargs):
        opened.append(os.path.realpath(str(path)))
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", tracking_open)
    ex.export_s1()
    for name in ex.FORBIDDEN_DIRS:
        banned = os.path.realpath(os.path.join(ex.ROOT, name))
        assert not any(p == banned or p.startswith(banned + os.sep) for p in opened)


@pytest.mark.parametrize("rel", ["dataset", "dataset/tactical/x.txt", "outputs/a.csv"])
def test_assert_safe_rejects_restricted_paths(rel):
    with pytest.raises(RuntimeError):
        ex.assert_safe(os.path.join(ex.ROOT, rel))


def test_brief_touch_annotation_follows_the_script_not_the_model(scenario):
    """A-03: the touch starts when the scripted pass reaches home #8, not where the engine's
    2 m control radius first sees home control (the ball is still in flight then)."""
    event = next(e for e in scenario["events"] if e["type"] == "brief-touch")
    start, end = event["interval"]
    assert (start, end) == ex.BRIEF_TOUCH and event["frame"] == start
    h8 = [p["id"] for p in scenario["players"]].index("h8")

    def gap(f):
        frame = scenario["frames"][f]
        return ((frame["ball"][0] - frame["players"][h8][0]) ** 2
                + (frame["ball"][1] - frame["players"][h8][1]) ** 2) ** 0.5

    assert gap(start - 1) > 0.5                      # in flight the frame before
    assert all(gap(f) <= 0.5 for f in range(start, end))  # at the player's feet throughout
    assert set(scenario["reference"]["labels"][start:end]) == {"A"}  # away keeps possession


def test_reference_labels_are_declared_by_the_script(scenario):
    declared = "".join(label * (end - start) for start, end, label in ex.REFERENCE)
    assert scenario["reference"]["labels"] == declared
    assert [s for s, _, _ in ex.REFERENCE][0] == 0 and ex.REFERENCE[-1][1] == ex.N_FRAMES
    for (_, end, _), (start, _, _) in zip(ex.REFERENCE, ex.REFERENCE[1:]):
        assert end == start                           # contiguous, no gaps or overlaps


def test_reference_does_not_follow_a_changed_baseline(monkeypatch):
    before = ex.export_s1()["reference"]["labels"]
    monkeypatch.setattr(ex.baseline, "build_labels", lambda meta, raw, **kw: ["D"] * 400)
    assert ex.export_s1()["reference"]["labels"] == before


def test_json_has_no_nan_and_is_valid(scenario):
    json.loads(ex.render(scenario))  # allow_nan=False would have raised on NaN/inf
