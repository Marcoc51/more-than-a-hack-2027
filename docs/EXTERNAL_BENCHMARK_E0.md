# E0 external possession benchmark

Status: synthetic scoring harness implemented; external benchmark execution pending.
Frozen reference: MAF FC main commit `ff686e3` (`src/possession.py` unchanged).
Scope: independent matches only. No competition match, supplied video, labels, or generated predictions are benchmark inputs.

## Official contract

The public [README](https://github.com/metrica-sports/more-than-a-hack-2027), [SUBMISSION](https://github.com/metrica-sports/more-than-a-hack-2027/blob/main/SUBMISSION.md), [EVALUATION](https://github.com/metrica-sports/more-than-a-hack-2027/blob/main/EVALUATION.md), [RULES](https://github.com/metrica-sports/more-than-a-hack-2027/blob/main/RULES.md), and [metric source](https://github.com/metrica-sports/more-than-a-hack-2027/blob/main/evaluation/possession_metrics.py) define the contract. A competition submission is UTF-8 `frame,label`, exactly 199,319 ordered zero-based rows; labels are H (home alive), A (away alive), D (dead), X (abstain). The public scorer accepts another `frame,label` CSV as `--gt`. Its `evaluate` function accepts equal-length integer-coded arrays. Ground-truth X excludes a frame from grading and separates temporal runs, including at halftime. Inside graded runs, predicted X is a macroF1 miss; for spellF1 it is filled with the previous non-X label in that run and backfilled at its head. D is not a possession spell. A spell is a maximal H or A run; matching is one-to-one by temporal IoU. The ranking number is mean spell F1 at 0.3, 0.4, 0.5, 0.6, and 0.7. Unweighted H/A/D frame macroF1 breaks ties. The official module reports other diagnostics and optional bootstrap intervals. Its transition tolerances and reported spell duration assume 25 fps; at a 10 fps external source use spellF1 and macroF1, and compute durations/tolerance diagnostics in physical time separately. No competition baseline score is an external benchmark result.

[Rules](https://github.com/metrica-sports/more-than-a-hack-2027/blob/main/RULES.md) allow inspectable external data about other matches and independently hand-labelled other matches. They prohibit human-produced data about the competition match; the public five-minute labels are for pipeline checks, not tuning. [Submission terms](https://github.com/metrica-sports/more-than-a-hack-2027/blob/main/SUBMISSION.md) say the supplied match assets are not redistributable. Publish only external results after checking the external provider's terms. Do not publish restricted inputs or derived match predictions.

## External dataset shortlist

Labels: **A** independent human possession ground truth; **B** provider/event-derived proxy; **C** our own heuristic pseudo-label; **D** no suitable possession target. None of the sources below has verified A labels matching H/A/D boundaries.

| Candidate | Data and compatibility | Label quality | License, distribution and action |
| --- | --- | --- | --- |
| [SkillCorner Open Data](https://github.com/SkillCorner/opendata) | README currently advertises 10 A-League matches, 10 fps broadcast tracking, players and ball, match metadata, center-origin metre coordinates, team/player IDs, dynamic events and phases of play. Its tracking record has a possession group field. Broadcast view and extrapolation differ from Metrica tactical data. Confirm phase intervals, orientation, team IDs, missing ball, restarts, and frame timestamps on a small permitted sample. | **B**: possession field and phase-derived H/A are provider outputs, with no verified independent human annotation. Treat the complement of phase intervals as D only after checking coverage; otherwise leave it unscored. Never use tracking's possession field as both input feature and target. | [Repository LICENSE](https://github.com/SkillCorner/opendata/blob/master/LICENSE) is MIT and [README](https://github.com/SkillCorner/opendata) calls the data open sourced and asks for SkillCorner credit. The root MIT text names software and associated documentation, not data files explicitly. Its scope for raw tracking, phases, and derived labels is unverified; confirm redistribution and commercial terms with SkillCorner before publishing data or derivatives. Pin revision and credit SkillCorner. No match files downloaded in E0/E0.1. |
| [Metrica Sports sample data](https://github.com/metrica-sports/sample-data) | Two anonymized CSV games plus a third EPTS game; synchronized 25 fps player/ball tracking and events, normalized 0-1 coordinates with top-left origin, 105 x 68 m pitch. Similar provider format helps adapter checks. Match identity and orientation must be verified. | **B** from event intervals if constructed, otherwise **D**. Events are not frame-level H/A/D truth, especially at stoppages and loose-ball transitions. | README's [legal note](https://github.com/metrica-sports/sample-data#legal-stuff) asks for responsible use and source credit; no explicit data redistribution/commercial license was found. Obtain permission or use locally without redistribution pending clarification. |
| [Sportec/DFL IDSSE](https://www.nature.com/articles/s41597-025-04505-y) | Seven Bundesliga matches, 25 Hz continuous player/ball tracking plus aligned event and match metadata. Different provider gives a strong portability test. XML parsing, field direction, and event timing need checks. | **B** from event spans; precise possession and dead-ball intervals are not established by the paper. Do not infer D from absence of an event. | Paper states DFL-authorized [CC BY 4.0](https://www.nature.com/articles/s41597-025-04505-y) release via Figshare, allowing redistribution with attribution and changes noted. Large download requires approval; none in E0. |
| [StatsBomb Open Data](https://github.com/statsbomb/open-data) | Events and 360 freeze frames at event moments, not continuous full-match ball/player tracking. | **D** for frame-level possession benchmarking; event possession IDs can support auxiliary event checks only. | [Public Data User Agreement](https://github.com/statsbomb/open-data/blob/master/LICENSE.pdf) must be followed; no dataset downloaded. |
| SoccerNet Tracking / SoccerTrack v2 | Tracking or action spotting with short clips; licenses and H/A/D annotation coverage require separate verification. | **D** until full frame-level possession and dead-ball labels are verified. | Do not ingest or redistribute before license and access review. |

**Recommendation:** start with SkillCorner as a *weak-label external development benchmark* because it has multiple matches, tracking, team mapping, and provider possession/phase signals. It is not an accuracy claim against independent truth. Keep Sportec/DFL for a later cross-provider check with clearer CC BY licensing but event proxy labels. For defensible absolute spellF1, obtain permitted, independently annotated H/A/D intervals for several other matches, including stoppages and restarts. That is the E1 label blocker. A small blind human-labelled external set could serve this purpose if annotation rights are secured and annotators never use the competition match.

## Normalized contract and protocol

Proposed tracking record, one row per provider observation: `match_id, period, frame_id, timestamp_s, fps, ball_x_m, ball_y_m, ball_valid, player_tracks[{track_id, team_id, x_m, y_m, valid}], pitch_length_m, pitch_width_m`. Coordinates are fixed pitch metres with recorded origin, axis directions, and each team's attacking direction by period; do not silently flip. Separate interval/event data: `start_s, stop_s, period, label, label_kind, annotator_or_provider, source_event_id, uncertainty_s`. A label adapter maps provider team IDs to H/A using match metadata, maps physical time to zero-based tracking frames with a declared rule, clips at period boundaries, and marks genuinely unlabelled frames X. Validate monotone timestamps, gaps, duplicates, frame rate, ball/player presence, home/away mapping, side switches, and restart/out-of-play coverage before scoring.

The E0 scorer input is a smaller label-only JSON (`maf-external-labels-v1`): `match_id`, `source`, `label_kind`, `split`, `fps`, `n_frames`, ordered half-open `halves`, full-length `truth`, and named full-length `predictions`. Truth must be H/A/D on every declared graded frame and X elsewhere. Missing truth is rejected. This is deliberately separate from a future raw-tracking adapter. The runner produces JSON on stdout and writes no competition outputs.

Freeze `ff686e3` as reference. In E1, adapt external tracking to the engine's expected observation and restart inputs without editing `src/possession.py`, `src/baseline.py`, or defaults. Run every candidate on exactly the same external matches and frames. Split by **match**, with provider and game IDs recorded; keep a final test set sealed until model and thresholds are frozen. For 10 SkillCorner matches, a provisional 6 train / 2 dev / 2 test assignment is possible, but publish a deterministic match-ID manifest before fitting. Test selection must never use test labels. Avoid shared match footage, clips, duplicate provider exports, or events from the same match across splits. Record source URL, revision, file hashes, license, transformations, label provenance, annotation uncertainty, model version, and parameters. Check mapping and alignment on synthetic cases and permitted external snippets; do not use competition labels or predictions.

Report per-match official spellF1 and macroF1, H/A/D per-class F1, abstentions, spell counts, and label coverage. Aggregate equal-weight match scores plus a pooled score, named separately. For enough independent test matches, use match-level bootstrap confidence intervals and paired match-level differences; never frame-level bootstrap. With only provider/event proxies, call the numbers **agreement with proxy labels**, not possession accuracy. Dead-ball F1 and spell boundaries are especially sensitive to inferred phase complements. If only H/A event intervals have reliable labels, score those intervals as a limited team-agreement diagnostic and do not claim official whole-match spellF1 parity.

## Minimal runner

Use the public official scorer from pinned revision `f8f2629ff1e0985f81d7e59d8413678514ee1530` (SHA-256 `341BAD48904B489D6E875397B27687F5D6A4D22A397F3DC8AF3A00D48F16874D`). The setup fetches only the scorer, starter baseline, games.py, and upstream MIT LICENSE into ignored `source/more-than-a-hack-2027/`. It verifies each file by SHA-256, refuses modified files, and does not fetch match assets or ground truth. The scorer itself is unchanged:

```powershell
python benchmark/setup_official.py
python benchmark/setup_official.py --verify-only
python benchmark/compare.py benchmark/synthetic_case.json
python -m pytest tests -q -rs -p no:cacheprovider
```

The included eight-frame fixture yields reference spellF1/macroF1 of 1.0/1.0 and altered-sequence scores of 0.8/0.7778 using the pinned official module. The JSON must contain explicit labels and provenance. `--purpose selection` rejects test split. The harness checks exact scorer threshold constants and calls its `label_codes` and `evaluate`; it does not load tracking or infer labels. Two named prediction arrays enable paired synthetic comparison. The tests use a scorer spy to verify invocation and the pinned real official module to verify synthetic numeric behavior. The real-module test is mandatory and fails if setup was not run; the two existing optional equivalence tests also run after setup. The harness does not alter official scoring logic.

## Public method comparison

| Public repository | Confirmed versus proposed | External labels and validation | E1 relevance |
| --- | --- | --- | --- |
| [MAF FC frozen reference](../src/possession.py) | Implemented rule engine: nearest-team control, state hysteresis, dead-ball/restart evidence. | 145 original synthetic tests and format checks are implementation evidence, not measured accuracy. | Must run unchanged on external matches. |
| [hadisotudeh](https://github.com/hadisotudeh/more-than-a-hack-2027) | README describes implemented two boosted-tree classifiers, ball/touch/spatial features, and Viterbi. | SkillCorner phase-derived weak labels; reported four-match holdout and public five-minute scores are not on our external benchmark. README discloses a match-specific kickoff override, which MAF FC must not import. | Test the generic feature/decoder ideas later; audit phase labels and licensing first. No code copied. |
| [darfattt](https://github.com/darfattt/mtah-2027-possession) | Public README lays out nearest-player baseline and *roadmap* for ball-gap handling, dead-ball features, and HMM/Viterbi; no verified implemented decoder performance from the README. | Public five-minute scoring loop described for alignment. No independently labelled external benchmark established there. | Compare only after implementations and external results are verified. No code copied. |

## E1 entry gate and remaining blockers

1. Confirm SkillCorner data license scope and pin a small set of permitted matches without downloading large archives in E0.
2. Audit possession/phase fields, restarts, dead-ball gaps, frame timing, orientation, and leakage from provider labels.
3. Implement minimal provider adapter and frozen-engine external input bridge; verify with synthetic and small external samples.
4. Obtain independent H/A/D labels or explicitly limit claims to proxy agreement.
5. Preserve the verified official scorer revision; establish a match-level split manifest and provenance report.

E0 is ready as a research and synthetic integration foundation. Real external scoring, model training, new decoder work, and any submission changes await the next phase and should not displace the validated competition submission before the deadline.





## E0.1 reproducibility and E1A audit (16 November 2026)

### Official public source setup

Run `python benchmark/setup_official.py` from the experimental worktree in a fresh checkout, then `python benchmark/setup_official.py --verify-only` and `python -m pytest tests -q -rs -p no:cacheprovider`. Python standard-library networking is sufficient; the project's existing pinned numpy, pandas, and pytest dependencies are still needed for tests. The setup pins organizer revision `f8f2629ff1e0985f81d7e59d8413678514ee1530`. SHA-256 values: scorer `341BAD48904B489D6E875397B27687F5D6A4D22A397F3DC8AF3A00D48F16874D`; starter baseline `84D8A414FB1BDF8C7E1FBE4A8789FE6F9CC0C2CCCEC4685201285B75DBC0CFE6`; `games.py` `3B2122794E9E0476E2B3A871D14880E5FA47C4FEAEACF99CAEF054C2309076CE`; [upstream LICENSE](https://github.com/metrica-sports/more-than-a-hack-2027/blob/f8f2629ff1e0985f81d7e59d8413678514ee1530/LICENSE) `B1F93728571A232A0E158ABDD869891F2EFD51894134FB20678292C2468FF3EC`. Attribution: Copyright (c) 2026-2027 Metrica Sports, MIT. The upstream license explicitly limits its scope to public repository contents and excludes gated match assets.

Before setup, the two original skips were `tests/test_baseline.py::test_check_agrees_with_official_validator` and `tests/test_baseline.py::test_matches_official_baseline_on_synthetic_data`. Both were environment-dependent because they expected the absent public reference directory. The second also imports public `games.py`. Neither skip reflected incomplete benchmark logic or a missing dataset. Setup supplies the four small files; the tests now execute. The E0 real-scorer test is mandatory, with focused missing-file and altered-hash failure tests. A fresh checkout that omits setup fails clearly rather than treating scorer parity as optional. After setup, the full synthetic suite reports **156 passed, 0 skipped**. The eight-frame official-scoring fixture remains 1.0/1.0 for the reference and 0.8/0.7778 for the altered sequence. Missing and modified scorer files are rejected by tests.

### SkillCorner public documentation audit

At public `master` revision `4340d274572876239c154c90bc507a9b3250a656`, the [README](https://github.com/SkillCorner/opendata/blob/4340d274572876239c154c90bc507a9b3250a656/README.md) describes 10 2024/25 Australian A-League matches; per-match metadata, 10 fps extrapolated tracking JSONL, dynamic events CSV, and phases CSV. Tracking records include `frame`, `timestamp`, `period`, ball and player data, and a `possession` object with `player_id` and home/away `group`. Coordinates are pitch-centered metres. The README states that phases exist only while the ball is in play. The linked [phase specification](https://26560301.fs1.hubspotusercontent-eu1.net/hubfs/26560301/Guides/Phases%20of%20Play/20250216%20-%20Phases%20of%20Play%20CSV%20Specifications.pdf) says phases derive from tracking and dynamic events, assigns team possession by player possession events, carries possession between same-team events, switches at the next team's event, and treats an event gap over 30 seconds as out of bounds. It also describes short disruptions retained inside an overall phase. These are provider rules, not independently observed truth; absence of a phase cannot automatically be mapped to D without a coverage audit.

The repository's [root MIT license](https://github.com/SkillCorner/opendata/blob/4340d274572876239c154c90bc507a9b3250a656/LICENSE) refers to software and associated documentation. The README calls the *data* open sourced and asks for credit, but neither text explicitly states that the MIT grant covers every tracking JSONL and phases CSV or their redistributed derivatives. **Dataset-file license scope is unresolved.** E1A must obtain or locate explicit provider terms before redistribution, and record allowed internal use, commercial use, attribution, raw-file sharing, and publication of derived labels/results. No match file was downloaded for this audit.

### E1A input-and-label gate

- Record provider revision, match IDs, per-file license evidence, hashes, metadata fields, pitch size, team IDs, and period attacking directions before conversion.
- Audit `frame` and `timestamp` monotonicity, 10 fps cadence, missing/duplicated frames, period resets, extrapolation flags, ball gaps, and player/team mapping.
- Specify possession `group` and `player_id` semantics for null, contested, airborne, out-of-play, and untracked frames. Keep this provider output out of predictor features if it is a target.
- Check phase `frame_start`/`frame_end` inclusivity, period boundaries, `team_in_possession_id`, overlaps, disruptions, and coverage against tracking frames. Inspect exact definitions and quality criteria in the provider phase specification.
- Separate verified live H/A intervals from unlabeled gaps. Determine D and restarts from documented independent evidence; otherwise score only covered team intervals and label the result proxy agreement.
- Freeze match-level train/development/test IDs before fitting. Audit same-match duplicates and cross-provider overlap; seal test labels and record all transformations.

**Smallest next E1A task:** resolve SkillCorner dataset-file rights and perform a documented schema/label audit on one permitted small public sample, without building an adapter or training a model until these gates pass.



