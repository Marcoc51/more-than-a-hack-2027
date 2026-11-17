# E1D-B — First IDSSE/DFL provider-annotation agreement

**Decision: GO for independent review of this single-match development result.** This is **single-match IDSSE/DFL provider-annotation agreement**, not independently verified possession accuracy, competition-match performance, a hidden-leaderboard estimate, or evidence of superiority on other matches. No threshold, label, engine, or method was changed after seeing the result.

## Frozen source and protocol

The [E1D-A scoring protocol](IDSSE_LABEL_SPEED_E1D_A.md) was checked before inference. `J03WOH` came from [original Figshare v1](https://api.figshare.com/v2/articles/28196177), DOI `10.6084/m9.figshare.28196177.v1`; its metadata and tracking SHA-256 matched the values recorded in [E1C-D](IDSSE_AUDIT_E1C_D.md). Figshare's publisher MD5s were also verified there. The [publisher](https://www.nature.com/articles/s41597-025-04505-y) says DFL authorized the data under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit the Deutsche Fußball Liga and Bassek, Rein, Weber and Memmert (2025), DOI `10.1038/s41597-025-04505-y`.

The working `src/possession.py` and `src/baseline.py` Git blobs match frozen main commit `ff686e3`. The scorer is the unchanged organizer `evaluation/possession_metrics.py` from revision `f8f2629ff1e0985f81d7e59d8413678514ee1530`, SHA-256 `341bad48904b489d6e875397b27687f5d6a4d22a397f3dc8af3a00d48f16874d`. `python benchmark/setup_official.py --verify-only` passed. Phase 3B uses the original 25 fps defaults, verified home/away mapping and coordinates, no provider `BallStatus`/`BallPossession` in inference features, and empty Smart Tagging/event inputs. Its input carries converted provider ball `S`, but this no-tag path does not consult speed to create restart evidence. The actual inference timeline has 137,214 frames in half-open segments `[0, 69424)` and `[69424, 137214)`.

The official scorer accepts concatenated label arrays and derives temporal runs from ground-truth X gaps; it has no explicit half argument. We inserted **one ungraded structural X separator** between the halves in both truth and predictions, producing evaluation spans `[0, 69424)` and `[69425, 137215)`. The separator is not an IDSSE frame or a claimed halftime duration. Entirely synthetic tests independently established that it leaves graded-frame count and macroF1 unchanged, prevents a same-team spell from joining across halves, and gives the same IoU matched-spell counts as scoring the halves separately at every official threshold. The real run checked `valid_runs`, graded coverage and spell-count additivity again. All 137,214 original frames have explicit supported provider codes; none was filled or excluded to improve a score. `BallStatus=0` takes precedence over its retained possession code.

**Transition diagnostic limit:** the independent referee demonstrated that the scorer's auxiliary transition matcher can match transitions across this one-frame X halftime separator. This does not change the reported spellF1 or macroF1: their spell extraction and graded-frame scoring respect the X run split. Whole-array transition metrics from this representation are unsupported and must not be published unless a half-aware evaluation method is specified and validated. The pinned official scorer is unchanged; this report publishes no transition metric.

## Aggregate result

| Metric | Frozen Phase 3B | Faithful frozen smooth50 |
| --- | ---: | ---: |
| Mean possession-spell F1 across official IoU thresholds | **0.3921** | 0.3011 |
| MacroF1 over H/A/D | **0.6333** | 0.3849 |
| Provider possession spells | 402 | 402 |
| Predicted possession spells | 254 | 383 |
| Graded original frames | 137,214 | 137,214 |

| Method and class | Precision | Recall | F1 |
| --- | ---: | ---: | ---: |
| Phase 3B H | 0.5754 | 0.8587 | 0.6890 |
| Phase 3B A | 0.5409 | 0.8229 | 0.6527 |
| Phase 3B D | 0.9120 | 0.4021 | 0.5581 |
| smooth50 H | 0.5272 | 0.8445 | 0.6492 |
| smooth50 A | 0.3641 | 0.8271 | 0.5056 |
| smooth50 D | 0 | 0 | 0 |

| Distribution | H | A | D | X |
| --- | ---: | ---: | ---: | ---: |
| DFL provider labels | 39,126 | 32,819 | 65,269 | 0 |
| Phase 3B predictions | 58,392 | 49,934 | 28,775 | 113 |
| smooth50 predictions | 62,666 | 74,548 | 0 | 0 |

| Half | Graded frames | Phase 3B spellF1 / macroF1 | smooth50 spellF1 / macroF1 |
| --- | ---: | ---: | ---: |
| First | 69,424 | 0.3856 / 0.6258 | 0.2709 / 0.3899 |
| Second | 67,790 | 0.4000 / 0.6416 | 0.3391 / 0.3820 |

The smooth50 comparison uses the unchanged [baseline majority-vote function](../src/baseline.py) with its ±50-frame window. The same adapter's nearest-home and nearest-away distances reproduce the nearest-player team whenever they are unequal; all original frames have finite team distances and **zero exact cross-team ties**. The runner rejects ties instead of inventing an unavailable original slot order. Smoothing each half separately is equivalent to the original method with a halftime observation gap much longer than its window. Both methods use identical provider labels and the same pinned scorer. This is a fair **external-method comparison on this one match**, with no claim of wider superiority.

Phase 3B identifies substantially fewer D frames than the provider (28,775 versus 65,269), and its D recall is 0.4021. Missing external restart tags, provider-defined inactivity and sticky ownership, and tracking-provider domain shift are methodological limits. Inactive-period `S` was shown in E1D-A to disagree with fixed ball coordinates; no event bridge is active, so that field does not explain the current score. The provider annotations are not independent ground truth. The structural separator preserves half boundaries, but no competitor score from another match or label source is comparable.

## Reproduce and inspect locally

From the experimental worktree, with the three verified original XML files under ignored `external_samples/idsse/`:

```powershell
python benchmark/setup_official.py --verify-only
python -m pytest tests/test_idsse_benchmark.py -q -rs -p no:cacheprovider
python -m benchmark.idsse_benchmark
python -m pytest -q -rs -p no:cacheprovider
git diff --check
```

`benchmark/idsse_benchmark.py` refuses altered metadata/tracking SHA-256, unexpected half sizes, unsupported provider codes, score-path locations outside the ignored directory, scorer checksum mismatches, or inconsistent separated spell counts. It generated only ignored local artifacts: `external_samples/idsse/e1d_b/prediction_labels.txt`, `smooth50_labels.txt`, `provider_labels.txt`, and `aggregate_report.json`. The prediction SHA-256 hashes, source hashes, version IDs and exact unrounded metrics are in that local report; prediction sequences are not printed here. Repeating each method on the same validated input produced identical label arrays and hashes. A second complete command run also reproduced the exact spellF1, macroF1, graded-frame count and prediction hashes for both methods. Total measured wall time for the first run's adapter loading, label mapping, both scores and repeat inference was **39.67 s**; approximate process peak working set was **234.7 MB** on this machine. The full synthetic suite passed **192 tests, zero skipped**.

The next step is an independent referee review of provenance, label semantics, half separation, leakage barriers, smooth50 equivalence and the aggregate report. Only then should a separate match-level held-out protocol be authorized. Benchmark code and documentation can be considered for integration independently of the competition submission; raw XML and match-derived labels/predictions must stay ignored, and these external scores must not be presented as competition performance.
