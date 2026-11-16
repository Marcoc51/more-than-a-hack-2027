"""Format-only check of a submission file. Prints PASS or FAIL and a reason -- never the labels.

    python src/check_submission.py outputs/baseline_smooth50.csv

Applies the same checks as the official scorer (`validate_submission` in the official
evaluation/possession_metrics.py, MIT, Copyright (c) 2026-2027 Metrica Sports) plus two of our own
reproducibility requirements: UTF-8 and LF-only line endings. Nothing it prints depends on what
the labels are, so its output is safe to share.
"""

import sys

import numpy as np
import pandas as pd

N_VIDEO_FRAMES = 199319
LABELS = ("H", "A", "D", "X")


def check(path, n_expected=N_VIDEO_FRAMES):
    """None if the file is a valid submission, else a one-line reason. Reasons carry no labels."""
    with open(path, "rb") as handle:
        raw = handle.read()
    if b"\r" in raw:
        return "line endings are not LF-only"
    try:
        raw.decode("utf-8")
    except UnicodeDecodeError:
        return "file is not valid UTF-8"
    if not raw.startswith(b"frame,label\n"):
        return "header is not exactly 'frame,label'"

    table = pd.read_csv(path, dtype={"label": "object"})
    table.columns = [str(c).strip().lower() for c in table.columns]
    if "label" not in table.columns or "frame" not in table.columns:
        return "expected columns 'frame' and 'label'"

    # -- the official scorer's checks, in its order ----------------------------------------------
    if len(table) != n_expected:
        return "row count {} != {}".format(len(table), n_expected)
    frames = table["frame"].values
    if not np.issubdtype(frames.dtype, np.integer):
        return "'frame' column is not integer"
    if not np.array_equal(frames, np.arange(n_expected)):
        return "'frame' column is not 0..{} in order".format(n_expected - 1)
    labels = table["label"].values
    if pd.isna(labels).any():
        return "empty label cells; write X to abstain"
    cleaned = {str(v).strip().upper() for v in labels}
    if cleaned - set(LABELS):
        return "labels outside {}".format(list(LABELS))
    return None


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 1:
        print("usage: python src/check_submission.py <submission.csv>")
        return 2
    try:
        reason = check(argv[0])
    except Exception as error:  # report the type only: messages could quote file content
        print("FAIL  could not read file ({})".format(type(error).__name__))
        return 1
    if reason:
        print("FAIL  {}".format(reason))
        return 1
    print("PASS  {} rows, frames 0..{}, header ok, labels in H/A/D/X, UTF-8, LF".format(
        N_VIDEO_FRAMES, N_VIDEO_FRAMES - 1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
