import importlib.util
import io
from pathlib import Path

import pytest

SPEC = importlib.util.spec_from_file_location(
    "benchmark_compare", Path(__file__).resolve().parents[1] / "benchmark" / "compare.py")
benchmark = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(benchmark)


class OfficialSpy:
    SPELL_IOUS = (0.3, 0.4, 0.5, 0.6, 0.7)

    def __init__(self):
        self.calls = []

    def label_codes(self, labels):
        return tuple(labels)

    def evaluate(self, truth, prediction, bootstrap_n):
        self.calls.append((truth, prediction, bootstrap_n))
        equal = truth == prediction
        return {"spell_f1_mean": 1.0 if equal else 0.0,
                "macro_f1": 1.0 if equal else 0.5,
                "n_graded": sum(x != "X" for x in truth),
                "n_gt_spells": 2, "n_pred_spells": 2}


def case():
    return {"format": "maf-external-labels-v1", "match_id": "SYN-1",
            "source": "synthetic", "label_kind": "synthetic", "split": "dev",
            "fps": 10, "n_frames": 8, "halves": [[1, 4], [5, 7]],
            "truth": ["X", "H", "H", "D", "X", "A", "A", "X"],
            "predictions": {"reference": ["X", "H", "H", "D", "X", "A", "A", "X"],
                            "variant": ["X", "H", "D", "D", "X", "A", "A", "X"]}}


def test_calls_official_for_both_sequences():
    spy = OfficialSpy()
    result = benchmark.compare(case(), spy)
    assert [row["spell_f1_mean"] for row in result["scores"]] == [1.0, 0.0]
    assert len(spy.calls) == 2
    assert all(call[2] == 0 for call in spy.calls)


def test_identical_predictions_identical_scores():
    item = case()
    item["predictions"]["variant"] = item["predictions"]["reference"][:]
    scores = benchmark.compare(item, OfficialSpy())["scores"]
    assert scores[0]["spell_f1_mean"] == scores[1]["spell_f1_mean"]
    assert scores[0]["macro_f1"] == scores[1]["macro_f1"]


def test_missing_truth_rejected():
    item = case()
    del item["truth"]
    with pytest.raises(ValueError, match="truth"):
        benchmark.compare(item, OfficialSpy())


def test_half_boundary_and_alignment_rejected():
    item = case()
    item["truth"][4] = "H"
    with pytest.raises(ValueError, match="coverage"):
        benchmark.compare(item, OfficialSpy())
    item = case()
    item["halves"] = [[1, 5], [5, 7]]
    with pytest.raises(ValueError, match="coverage"):
        benchmark.compare(item, OfficialSpy())


def test_normalizes_labels_and_variable_fps():
    for fps in (10, 25):
        item = case()
        item["fps"] = fps
        item["predictions"]["reference"][1] = " h "
        result = benchmark.compare(item, OfficialSpy())
        assert result["scores"][0]["spell_f1_mean"] == 1.0
        assert result["fps"] == fps


def test_test_split_blocked_for_selection():
    item = case()
    item["split"] = "test"
    with pytest.raises(ValueError, match="held-out"):
        benchmark.compare(item, OfficialSpy(), purpose="selection")


def test_unsupported_format_rejected():
    item = case()
    item["format"] = "unknown"
    with pytest.raises(ValueError, match="unsupported"):
        benchmark.compare(item, OfficialSpy())



def test_real_official_scorer_on_synthetic_case():
    path = Path(__file__).resolve().parents[1] / "source" / "more-than-a-hack-2027" / "evaluation" / "possession_metrics.py"
    official = benchmark.load_official(path)
    result = benchmark.compare(case(), official)
    reference, variant = result["scores"]
    assert reference["spell_f1_mean"] == reference["macro_f1"] == 1.0
    assert variant["spell_f1_mean"] < reference["spell_f1_mean"]
    assert variant["macro_f1"] < reference["macro_f1"]
    assert result["fps"] == 10




def test_missing_official_scorer_fails_clearly(tmp_path):
    with pytest.raises(ValueError, match="official"):
        benchmark.load_official(tmp_path / "possession_metrics.py")


def test_modified_official_scorer_fails_hash_check(tmp_path):
    source = Path(__file__).resolve().parents[1] / "source" / "more-than-a-hack-2027" / "evaluation" / "possession_metrics.py"
    altered = tmp_path / "possession_metrics.py"
    altered.write_bytes(source.read_bytes() + b"\\n# altered")
    with pytest.raises(ValueError, match="pinned revision"):
        benchmark.load_official(altered)




def test_clean_official_setup_fetches_only_pinned_public_files(tmp_path, monkeypatch):
    setup_path = Path(__file__).resolve().parents[1] / "benchmark" / "setup_official.py"
    spec = importlib.util.spec_from_file_location("official_setup", setup_path)
    setup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(setup)
    installed = setup.DESTINATION
    monkeypatch.setattr(setup, "DESTINATION", tmp_path / "source" / "more-than-a-hack-2027")
    requested = []

    def fake_urlopen(url, timeout):
        relative = url.removeprefix(setup.BASE_URL)
        requested.append(relative)
        return io.BytesIO((installed / relative).read_bytes())

    monkeypatch.setattr(setup, "urlopen", fake_urlopen)
    setup.setup()
    setup.setup(verify_only=True)
    assert set(requested) == set(setup.FILES)
    assert set(requested) == {
        "evaluation/possession_metrics.py", "starter/baseline.py", "games.py", "LICENSE"
    }

