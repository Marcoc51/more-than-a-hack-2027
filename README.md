# MAF FC — Football possession from tracking

Our submission for **More than a Hack 2027, Phase 1: Ball Possession**, organised by
Metrica Sports, FC Barcelona Innovation Hub and Mobile World Capital Barcelona.

## The problem

Label every frame of FC Barcelona vs Athletic Club as home possession, away possession,
dead ball or no answer. Ranking uses `spellF1` (whole possessions matched by temporal
overlap), with frame-level `macroF1` as the tie-break.

## Our solution

The **Rule-Based Possession Engine**, implemented in [`src/possession.py`](src/possession.py), is deterministic
and rule-based: no machine learning or external training data. Automatic tactical tracking
provides player-to-ball proximity and relative team-control evidence. Temporal confirmation
and hysteresis hold possession through loose balls; dead-ball and restart evidence can end
or start it. Optional Smart Tagging set pieces support restarts. Missing tracking is handled
explicitly, and each half has independent possession state.

The submission was developed as the internal Phase 3B implementation; this public naming
change does not alter its algorithm or parameters. Parameters and limitations:
[technical document](docs/TECHNICAL_DOCUMENT.md). [Architecture diagram](docs/assets/possession-architecture.svg).

## Inputs and output

Set `MTAH_DATA_DIR` to the organisers' separately supplied data root (or use `--data-dir`).

| Files under `<data-root>/tactical/` | Purpose |
|---|---|
| `BAR-ATH_tactical_atd.xml` | Teams and tracking metadata |
| `BAR-ATH_tactical_atd.txt` | Frame-by-frame automatic tracking |
| `BAR-ATH_tactical_smart_tagging.xml` | Optional set-piece evidence; runs without it |

Output: UTF-8/LF CSV, header `frame,label`, **199,319 rows**, frames `0..199318`.

| Label | Meaning |
|---|---|
| H | Home possession |
| A | Away possession |
| D | Dead ball |
| X | No answer (also used outside the half blocks) |

## Reproduce with Python 3.10

From the repository root, with `python` pointing to Python 3.10 (verified on 3.10.4):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:MTAH_DATA_DIR = "C:\path\to\data-root"
python src/possession.py --out outputs/submission.csv
python src/check_submission.py outputs/submission.csv
```

macOS/Linux: create the environment with `python3.10 -m venv .venv`, activate with
`source .venv/bin/activate`, and replace the environment-setting line with
`export MTAH_DATA_DIR=/path/to/data-root`; the other commands are identical.

Dependencies are pinned in [requirements.txt](requirements.txt). Identical inputs and defaults
produce identical bytes. Node, the Explorer, external benchmark data and an official scorer
checkout are unnecessary for prediction generation.

`outputs/submission.csv` is the recommended reproduction destination.
Keep real inputs and all match-derived outputs outside Git.

## PUBLIC five-minute evaluation

| Method | spellF1 | macroF1 |
|---|---:|---:|
| Rule-Based Possession Engine | **0.400000** | **0.597742** |
| Official smooth125 baseline | 0.4242 | 0.5812 |
| Official smooth50 baseline | 0.3256 | 0.6207 |

MAF FC was independently measured **after freezing the algorithm**, using the organisers'
unmodified scorer at commit `f8f2629ff1e0985f81d7e59d8413678514ee1530`.
The public sample has **7,500 graded frames and only 17 ground-truth possession spells**.
With so few possession spells, generalization to the private full match is uncertain.
Public ground truth was not used to train, tune or select the submission algorithm.
These are public-window results, not private full-match scores or a prediction of final ranking.

## Optional external IDSSE benchmark

The Rule-Based Possession Engine scored spellF1 **0.3921** / macroF1 **0.6333** on one external match;
smooth50 scored **0.3011** / **0.3849**. This measures **single-match provider-annotation
agreement**, not competition scoring or independently verified possession accuracy.
Neither IDSSE nor SkillCorner data trained or modified the competition algorithm.
See the [existing IDSSE report](docs/IDSSE_BENCHMARK_E1D_B.md).

## Optional React Explorer

The [Explorer](explorer/README.md) is one React application with two modes, neither part of
competition CSV generation:

- **Public (default build):** only **four independently authored synthetic scenarios**. It
  compares unchanged Python predictions with scripted reference labels; those metrics are
  demonstrations, not competition accuracy.
- **Local (`npm run dev:local`, this computer only, never deployed):** opens the owner's
  registered actual-match export by default. It compares the Rule-Based Possession Engine with
  smooth50 on the same real frames. That is prediction-to-prediction agreement: with no
  reference labels it measures no accuracy.

See [modes, setup and what comparisons can establish](explorer/README.md#operating-modes).

## Tests and validation

Engine regression tests use synthetic fixtures:

```powershell
python -m pytest tests/test_baseline.py tests/test_possession.py tests/test_game_state.py -q
```

The full integrated suite additionally needs checksum-verified public reference files;
setup fetches the pinned scorer and starter files, not competition data:

```powershell
python benchmark/setup_official.py
python -m pytest tests tools -q
python tools/export_scenarios.py --check
```

See the [Explorer instructions](explorer/README.md#run) for React tests, build, license checks
and browser smoke tests.

## Repository structure

| Path | Contents |
|---|---|
| `src/` | Submission engine, Smart Tagging reader, baseline and format checker |
| `tests/`, `tools/` | Synthetic tests, scenario exporter and vendored scorer |
| `benchmark/` | Optional external adapters and benchmark tools |
| `explorer/` | Public synthetic demo and local-only Explorer for authorized data exports |
| `docs/` | Technical document and research reports at their existing paths |
| [docs/archive/](docs/archive/) | Design explorations and historical integration manifest; recorded paths retained |

## Rules, licenses and credits

Follow the [official repository](https://github.com/metrica-sports/more-than-a-hack-2027),
[challenge rules](https://github.com/metrica-sports/more-than-a-hack-2027/blob/main/RULES.md)
and [submission requirements](https://github.com/metrica-sports/more-than-a-hack-2027/blob/main/SUBMISSION.md).
No hand labelling, match-video checking or match/ground-truth training or tuning.
Restricted match assets and derived predictions must never be published; they are excluded by
[.gitignore](.gitignore), and the match data is not covered by the software licenses.

- **Our code:** [MIT](LICENSE).
- **Adapted starter code:** © 2026-2027 Metrica Sports, MIT; full notice in
  [`src/baseline.py`](src/baseline.py). [Vendored scorer notices](tools/vendor/README.md).
- **IDSSE:** CC BY 4.0; credit Deutsche Fußball Liga and Bassek, Rein, Weber and Memmert
  (2025). [Dataset attribution and DOI](docs/IDSSE_BENCHMARK_E1D_B.md#frozen-source-and-protocol).
- **Explorer assets:** team portraits, organiser logos and Motus-derived styling values are
  excluded from MIT. The owner confirms project-specific public use; no independent grant
  documents were inspected. [Rights details](explorer/README.md#owner-confirmed-public-use-permissions).
- **Third-party fonts and build notices:** Inter and Space Grotesk use SIL OFL 1.1;
  [Explorer licensing](explorer/README.md#visual-identity-and-licences) explains bundled notices
  and their verification.
