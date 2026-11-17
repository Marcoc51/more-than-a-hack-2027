"""One-match IDSSE/DFL provider-agreement runner for frozen Phase 3B.

Raw match files and all derived labels/reports stay in ignored external_samples/.
"""
from collections import Counter
from hashlib import sha256
import argparse
import json
from pathlib import Path
import time

import numpy as np

from benchmark import compare, idsse_adapter
from baseline import HOME, AWAY, NOBODY, WINDOW, smooth


MATCH_ID = "J03WOH"
SOURCE_DOI = "10.6084/m9.figshare.28196177.v1"
ENGINE_COMMIT = "ff686e3"
FILES = {
    "metadata": ("DFL_02_01_matchinformation_DFL-COM-000002_DFL-MAT-J03WOH.xml",
                 "f23b3ee13b988b1ff9a0bce438c416dac47e71355bbc7ee1dab21aaf3e33c18c"),
    "positions": ("DFL_04_03_positions_raw_observed_DFL-COM-000002_DFL-MAT-J03WOH.xml",
                  "ec4dcf30200aad694dea263d5289485fcd0ca42badddaeb7c81f5cd5a4229d4f"),
}


def verified_paths(data_dir):
    """Refuse any source bytes other than the provenance-verified original files."""
    paths = {}
    for kind, (name, expected) in FILES.items():
        path = data_dir / name
        hasher = sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                hasher.update(chunk)
        digest = hasher.hexdigest()
        if digest != expected:
            raise ValueError(f"{kind} SHA-256 mismatch: expected Figshare v1 J03WOH file")
        paths[kind] = path
    return paths


def separated_halves(truth, prediction, segments):
    """One ungraded X separator makes official valid_runs half-aware."""
    if len(truth) != len(prediction) or len(segments) != 2:
        raise ValueError("two equal-length label arrays and two halves required")
    (first_start, first_end), (second_start, second_end) = segments
    if first_start != 0 or first_end != second_start or second_end != len(truth) or first_end < 1 or second_end <= second_start:
        raise ValueError("expected two contiguous, nonempty adapter half segments")
    if any(label not in "HAD" for label in truth):
        raise ValueError("full-match scoring requires explicit H/A/D on every observed frame")
    if any(label not in "HADX" for label in prediction):
        raise ValueError("unsupported prediction label")
    gt = tuple(truth[:first_end]) + ("X",) + tuple(truth[first_end:])
    pred = tuple(prediction[:first_end]) + ("X",) + tuple(prediction[first_end:])
    spans = ((0, first_end), (first_end + 1, len(gt)))
    return gt, pred, spans


def frozen_smooth50(engine_input):
    """Exact nearest-player + +/-50 vote when cross-team nearest ties are absent.

    The original slot-order tie break cannot be recovered from nearest distances.
    Refuse such input rather than fabricate a tie outcome. Each half is smoothed
    separately, equivalent to the original long unobserved halftime gap.
    """
    home, away = engine_input.tracking.home, engine_input.tracking.away
    finite_ties = np.isfinite(home) & np.isfinite(away) & (home == away)
    if finite_ties.any():
        raise ValueError("smooth50 slot-order tie cannot be recovered from nearest-team distances")
    codes = np.full(len(home), NOBODY, dtype=np.int8)
    valid = ~np.isnan(home) & ~np.isnan(away)
    codes[valid & (home < away)] = HOME
    codes[valid & (away < home)] = AWAY
    labels = []
    for start, end in engine_input.segments:
        labels.extend(smooth(codes[start:end], WINDOW).tolist())
    return tuple(labels)


def scored_report(official, truth, prediction, segments):
    gt, pred, spans = separated_halves(truth, prediction, segments)
    gt_codes, pred_codes = official.label_codes(gt), official.label_codes(pred)
    if official.valid_runs(gt_codes) != list(spans):
        raise ValueError("official scorer failed to preserve separate half runs")
    whole = official.evaluate(gt_codes, pred_codes, bootstrap_n=0)
    if whole["n_graded"] != len(truth) or whole["n_abstain_on_graded"] != prediction.count("X"):
        raise ValueError("structural separator changed graded coverage")
    halves = []
    for start, end in segments:
        result = official.evaluate(official.label_codes(truth[start:end]),
                                   official.label_codes(prediction[start:end]), bootstrap_n=0)
        halves.append({"frames": end - start, "spell_f1_mean": result["spell_f1_mean"],
                       "macro_f1": result["macro_f1"], "n_gt_spells": result["n_gt_spells"],
                       "n_pred_spells": result["n_pred_spells"]})
    if whole["n_gt_spells"] != sum(row["n_gt_spells"] for row in halves) or whole["n_pred_spells"] != sum(row["n_pred_spells"] for row in halves):
        raise ValueError("structural separator merged spells across halftime")
    return {"spell_f1_mean": whole["spell_f1_mean"], "macro_f1": whole["macro_f1"],
            "n_graded": whole["n_graded"], "n_gt_spells": whole["n_gt_spells"],
            "n_pred_spells": whole["n_pred_spells"], "per_class": whole["per_class"],
            "per_half": halves, "provider_distribution": dict(Counter(truth)),
            "prediction_distribution": dict(Counter(prediction)),
            "evaluation_halves": [list(span) for span in spans],
            "structural_separator_count": 1}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("external_samples/idsse"))
    parser.add_argument("--out-dir", type=Path, default=Path("external_samples/idsse/e1d_b"))
    args = parser.parse_args(argv)
    data_dir, out_dir = args.data_dir.resolve(), args.out_dir.resolve()
    workspace = Path(__file__).resolve().parents[1]
    ignored = (workspace / "external_samples").resolve()
    if data_dir != ignored / "idsse" or out_dir != ignored / "idsse" / "e1d_b":
        parser.error("this frozen run requires the ignored external_samples/idsse paths")
    try:
        paths = verified_paths(data_dir)
        official = compare.load_official(compare.DEFAULT_METRICS)
        start = time.perf_counter()
        item = idsse_adapter.adapt_tracking(MATCH_ID, paths["metadata"], paths["positions"])
        labels = idsse_adapter.provider_labels(item, paths["positions"])
        if item.segments != ((0, 69424), (69424, 137214)) or labels.unknown_frames:
            raise ValueError("J03WOH validated timeline or label coverage changed")
        first = idsse_adapter.predict(item)
        report = scored_report(official, labels.labels, first, item.segments)
        smooth50 = frozen_smooth50(item)
        report["smooth50"] = scored_report(official, labels.labels, smooth50, item.segments)
        first_digest = sha256("".join(first).encode("ascii")).hexdigest()
        second = idsse_adapter.predict(item)
        smooth50_second = frozen_smooth50(item)
        deterministic = first == second and smooth50 == smooth50_second
        second_digest = sha256("".join(second).encode("ascii")).hexdigest()
        if not deterministic or first_digest != second_digest:
            raise ValueError("frozen prediction changed across two runs")
        report.update({"match_id": MATCH_ID, "source_doi": SOURCE_DOI,
                       "label_kind": "provider_proxy", "split": "dev", "fps": 25,
                       "engine_commit": ENGINE_COMMIT,
                       "official_scorer_sha256": compare.OFFICIAL_SHA256,
                       "input_sha256": {kind: digest for kind, (_, digest) in FILES.items()},
                       "prediction_sha256": first_digest, "deterministic_two_runs": deterministic,
                       "smooth50_prediction_sha256": sha256("".join(smooth50).encode("ascii")).hexdigest(),
                       "runtime_seconds": round(time.perf_counter() - start, 2)})
        try:
            import psutil
            report["peak_working_set_mb"] = round(psutil.Process().memory_info().peak_wset / 1e6, 1)
        except ImportError:
            report["peak_working_set_mb"] = None
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "prediction_labels.txt").write_text("\n".join(first) + "\n", encoding="ascii")
        (out_dir / "smooth50_labels.txt").write_text("\n".join(smooth50) + "\n", encoding="ascii")
        (out_dir / "provider_labels.txt").write_text("\n".join(labels.labels) + "\n", encoding="ascii")
        (out_dir / "aggregate_report.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2, sort_keys=True))
    except (OSError, ValueError) as exc:
        parser.error(str(exc))


if __name__ == "__main__":
    main()
