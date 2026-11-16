"""Synthetic/external label comparison using the unmodified official scorer."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

LABELS = {"H", "A", "D", "X"}
KINDS = {"synthetic", "independent_manual", "provider_proxy", "event_proxy"}
OFFICIAL_SHA256 = "341bad48904b489d6e875397b27687f5d6a4d22a397f3dc8af3a00d48f16874d"
DEFAULT_METRICS = Path(__file__).resolve().parents[1] / "source" / "more-than-a-hack-2027" / "evaluation" / "possession_metrics.py"


def normalize_labels(values, count, name):
    if not isinstance(values, list) or len(values) != count:
        raise ValueError(f"{name}: expected {count} labels")
    labels = []
    for index, value in enumerate(values):
        if not isinstance(value, str) or value.strip().upper() not in LABELS:
            raise ValueError(f"{name}: invalid label at frame {index}")
        labels.append(value.strip().upper())
    return labels


def validate_case(case, purpose):
    if case.get("format") != "maf-external-labels-v1":
        raise ValueError("unsupported dataset format; expected maf-external-labels-v1")
    if case.get("split") not in {"train", "dev", "test"}:
        raise ValueError("split must be train, dev, or test")
    if purpose == "selection" and case["split"] == "test":
        raise ValueError("held-out test labels cannot be used for model selection")
    if case.get("label_kind") not in KINDS:
        raise ValueError("label_kind must identify the label provenance")
    if not case.get("match_id") or not case.get("source"):
        raise ValueError("match_id and source are required")
    fps = case.get("fps")
    if not isinstance(fps, (int, float)) or isinstance(fps, bool) or fps <= 0:
        raise ValueError("fps must be positive")
    count = case.get("n_frames")
    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        raise ValueError("n_frames must be a positive integer")
    halves = case.get("halves")
    if not isinstance(halves, list) or not halves:
        raise ValueError("halves must be nonempty half-open frame spans")
    covered = set()
    previous = 0
    for span in halves:
        if not isinstance(span, list) or len(span) != 2 or any(type(v) is not int for v in span):
            raise ValueError("invalid half span")
        lo, hi = span
        if not 0 <= lo < hi <= count or lo < previous:
            raise ValueError("half spans must be ordered, disjoint, and within frames")
        covered.update(range(lo, hi))
        previous = hi
    truth = normalize_labels(case.get("truth"), count, "truth")
    for frame, label in enumerate(truth):
        if (frame in covered) != (label != "X"):
            raise ValueError(f"truth coverage disagrees with halves at frame {frame}")
    predictions = case.get("predictions")
    if not isinstance(predictions, dict) or len(predictions) < 1:
        raise ValueError("predictions must contain at least one named sequence")
    normalized = {name: normalize_labels(values, count, name)
                  for name, values in predictions.items() if isinstance(name, str) and name}
    if len(normalized) != len(predictions):
        raise ValueError("prediction names must be nonempty strings")
    return truth, normalized


def load_official(path):
    source = Path(path).resolve()
    if source.name != "possession_metrics.py" or not source.is_file():
        raise ValueError(f"official scorer missing at {source}; run python benchmark/setup_official.py")
    if hashlib.sha256(source.read_bytes()).hexdigest() != OFFICIAL_SHA256:
        raise ValueError(f"official scorer SHA-256 mismatch at {source}; expected pinned revision f8f2629")
    spec = importlib.util.spec_from_file_location("official_possession_metrics", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not all(hasattr(module, name) for name in ("label_codes", "evaluate", "SPELL_IOUS")):
        raise ValueError("official metrics module lacks required functions")
    if tuple(module.SPELL_IOUS) != (0.3, 0.4, 0.5, 0.6, 0.7):
        raise ValueError("official metric thresholds differ from the E0 contract")
    return module


def compare(case, official, purpose="report"):
    truth, predictions = validate_case(case, purpose)
    gt_codes = official.label_codes(truth)
    rows = []
    for name, labels in predictions.items():
        result = official.evaluate(gt_codes, official.label_codes(labels), bootstrap_n=0)
        rows.append({"name": name, "spell_f1_mean": result["spell_f1_mean"],
                     "macro_f1": result["macro_f1"], "n_graded": result["n_graded"],
                     "n_gt_spells": result["n_gt_spells"],
                     "n_pred_spells": result["n_pred_spells"]})
    return {"match_id": case["match_id"], "source": case["source"],
            "label_kind": case["label_kind"], "split": case["split"],
            "fps": case["fps"], "scores": rows}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("case", help="synthetic or independently licensed label JSON")
    parser.add_argument("--official-metrics", default=DEFAULT_METRICS,
                        help="path to pinned public official evaluation/possession_metrics.py")
    parser.add_argument("--purpose", choices=("report", "selection"), default="report")
    args = parser.parse_args(argv)
    try:
        case = json.loads(Path(args.case).read_text(encoding="utf-8"))
        report = compare(case, load_official(args.official_metrics), args.purpose)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        parser.error(str(exc))
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
