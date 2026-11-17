"""Synthetic-only independent checks for IDSSE half separation and scoring."""
from types import SimpleNamespace

import numpy as np
import pytest

from benchmark import compare, idsse_benchmark as bench


def test_structural_x_matches_two_independent_halves():
    official = compare.load_official(compare.DEFAULT_METRICS)
    truth = tuple("HHAH" + "HHAA")
    prediction = tuple("HAAH" + "HHAA")
    segments = ((0, 4), (4, 8))
    gt, pred, spans = bench.separated_halves(truth, prediction, segments)
    assert gt[4] == pred[4] == "X"
    assert spans == ((0, 4), (5, 9))
    gt_codes, pred_codes = official.label_codes(gt), official.label_codes(pred)
    runs = official.valid_runs(gt_codes)
    assert runs == list(spans)
    assert official.possession_spells(gt_codes, runs) == [
        (0, 2, official.H), (2, 3, official.A), (3, 4, official.H),
        (5, 7, official.H), (7, 9, official.A)]
    assert len(official.possession_spells(official.label_codes(truth),
                                          official.valid_runs(official.label_codes(truth)))) < 5

    whole = official.evaluate(gt_codes, pred_codes, bootstrap_n=0)
    no_separator = official.evaluate(official.label_codes(truth),
                                     official.label_codes(prediction), bootstrap_n=0)
    halves = [official.evaluate(official.label_codes(truth[a:b]),
                                official.label_codes(prediction[a:b]), bootstrap_n=0)
              for a, b in segments]
    assert whole["n_graded"] == no_separator["n_graded"] == 8
    assert whole["n_abstain_on_graded"] == 0
    assert whole["macro_f1"] == no_separator["macro_f1"]
    assert whole["n_gt_spells"] == sum(x["n_gt_spells"] for x in halves) == 5
    assert whole["n_pred_spells"] == sum(x["n_pred_spells"] for x in halves)
    for threshold in official.SPELL_IOUS:
        key = "n_matched"
        assert whole["spell_f1"][threshold][key] == sum(x["spell_f1"][threshold][key] for x in halves)
    summary = bench.scored_report(official, truth, prediction, segments)
    assert summary["n_graded"] == 8 and summary["structural_separator_count"] == 1


@pytest.mark.parametrize("truth,prediction,segments", [
    (tuple("HAXH"), tuple("HAAH"), ((0, 2), (2, 4))),
    (tuple("HAHH"), tuple("HABH"), ((0, 2), (2, 4))),
    (tuple("HAHH"), tuple("HAHH"), ((0, 3), (2, 4))),
])
def test_full_match_gate_rejects_unsupported_or_ambiguous_input(truth, prediction, segments):
    with pytest.raises(ValueError):
        bench.separated_halves(truth, prediction, segments)


def test_frozen_smooth50_preserves_half_gap_and_rejects_slot_ties():
    tracking = SimpleNamespace(home=np.array([0., 0., 0., 10., 10., 10.]),
                               away=np.array([10., 10., 10., 0., 0., 0.]))
    item = SimpleNamespace(tracking=tracking, segments=((0, 3), (3, 6)))
    assert bench.frozen_smooth50(item) == tuple("HHHAAA")
    assert tuple(bench.smooth(np.array([bench.HOME] * 3 + [bench.AWAY] * 3),
                              bench.WINDOW)) != tuple("HHHAAA")
    tracking.home[0] = tracking.away[0]
    with pytest.raises(ValueError, match="slot-order tie"):
        bench.frozen_smooth50(item)
