# more-than-a-hack-2027

Our submission for **More than a Hack 2027, Phase 1: Ball Possession**, organised by Metrica Sports,
FC Barcelona Innovation Hub and Mobile World Capital Barcelona.

The task is to label every frame of the tactical video of FC Barcelona vs Athletic Club as:
- `H`: home possession;
- `A`: away possession;
- `D`: dead ball;
- `X`: no answer.

Submissions are ranked on `spellF1`, which matches whole possessions by temporal IoU, with
`macroF1` as the tie-break.

The submitted file is produced by **`src/possession.py`**. It is a deterministic, rule-based
engine: no machine learning and no training data. It combines:
- player–ball control evidence from the automatic tracking data;
- a hysteresis state machine for possession;
- dead-ball and restart evidence from the tracking and from Metrica Smart Tagging set pieces.

The method, its parameters and its limitations are described in
[docs/TECHNICAL_DOCUMENT.md](docs/TECHNICAL_DOCUMENT.md).

## Repository layout

| Path | What it is | In git? |
|---|---|---|
| `src/possession.py` | **the submission algorithm** | yes |
| `src/smart_tagging.py` | minimal Smart Tagging reader (set-piece restarts only) | yes |
| `src/baseline.py` | reproduction of the official `baseline_smooth50` (fallback); also provides the shared parsing, team mapping and CSV writer | yes |
| `src/check_submission.py` | format check; prints PASS/FAIL and a reason, never labels | yes |
| `tests/` | synthetic tests; they never read the match data | yes |
| `docs/TECHNICAL_DOCUMENT.md` | technical document | yes |
| `dataset/` | the gated match data, supplied separately by the organisers | **no, never** |
| `outputs/` | generated predictions | **no** |
| `source/` | optional local clone of the official repository, used only as a reference | **no** |

Nothing under `source/` is needed to generate the competition submission. The full integrated
Python test suite requires pinned public official scorer and reference files under `source/`;
install them with the checksum-verified setup command in the Tests section.

## Requirements

- Python 3.10. Development and verification used 3.10.4.
- Pinned dependencies, in `requirements.txt`:
  - `numpy==1.24.1`, used by the algorithm;
  - `pandas==1.5.2`, used only by the format check;
  - `pytest==7.2.0`, used only by the tests.
- Everything else comes from the Python standard library.

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1          # macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
```

## Match data (not included)

The match data is licensed for the competition only and is **not** in this repository. Put the
organisers' bundle anywhere and point `MTAH_DATA_DIR` at it (or pass `--data-dir`). Only these
three files are read:

```
<data-dir>/
└── tactical/
    ├── BAR-ATH_tactical_atd.xml            tracking metadata (teams, track slots)
    ├── BAR-ATH_tactical_atd.txt            tracking data, one line per video frame
    └── BAR-ATH_tactical_smart_tagging.xml  Smart Tagging (optional; see below)
```

If the Smart Tagging file is missing, the engine still runs without restart evidence and prints
a one-line notice.

## Regenerate the submission

From the repository root:

```powershell
$env:MTAH_DATA_DIR = "C:\path\to\data-dir"     # macOS/Linux: export MTAH_DATA_DIR=/path/to/data-dir
python src/possession.py --out outputs/submission.csv
python src/check_submission.py outputs/submission.csv
```

- **Run time:** about 1–2 minutes, because the tracking file is streamed once.
- **Output:** exactly 199,319 rows, `frame,label` for frames `0 … 199318`, UTF-8 with LF line
  endings.
- **Determinism:** the result is the same byte for byte on every run.
- **Console output:** the script prints only the output path, never anything derived from the
  data.
- **Official validator:** if you have the official repository, you can run its validator too:
  `python <official-repo>/evaluation/validate_submission.py outputs/submission.csv`.

**Fallback:** `python src/baseline.py --out outputs/baseline_smooth50.csv` reproduces the
organisers' nearest-player baseline.

## Tests

The original competition-engine checks use synthetic fixtures and do not require the optional
benchmark setup:

```powershell
python -m pytest tests/test_baseline.py tests/test_possession.py tests/test_game_state.py -q
```

For the full integrated Python suite, install the pinned public official files and then run all
synthetic tests, including the optional benchmark and Explorer exporter tests:

```powershell
python benchmark/setup_official.py
python -m pytest tests tools -q
```

The tests use small, artificial tracking and Smart Tagging files built inside the tests. They cover:
- parsing, the team mapping, control evidence and the state machine;
- halves, kickoffs, out-of-bounds, restarts and conflicting tags;
- frame alignment, the output format and determinism.

## Optional external benchmarking

The competition CSV is generated by the frozen Phase 3B `src/possession.py` without IDSSE or
SkillCorner data. External adapters and benchmark modules are optional research tools, not
competition inference dependencies. IDSSE data must be acquired separately under its CC BY 4.0
license. The IDSSE benchmark keeps provider possession/status labels and events out of model
prediction inputs and has no Smart Tagging restart bridge. Its reported numbers describe agreement
with provider annotations on one development match, not competition results or independently
verified possession accuracy. See [the IDSSE benchmark report](docs/IDSSE_BENCHMARK_E1D_B.md).

## Synthetic React Explorer

The optional [MAF FC Possession Explorer](explorer/README.md) plays four scripted synthetic
scenarios exported by the unchanged Python engines. Its scenario scores compare with scripted
references only; it bundles no competition data, videos, labels or predictions and reports no
competition-match result. The app is not needed to generate the competition CSV.

## Method in brief

1. **Tracking:** for each team, the nearest player's distance to the ball, plus the ball's
   position and speed. Positions are converted to metres on a 105.3 × 68.0 m pitch.
2. **Control evidence:** a team controls the ball when its nearest player is within 2.0 m and the
   other team's nearest player is at least 1.0 m further away.
3. **Dead-ball and restart evidence:**
   - **dead:** the ball is tracked beyond a line; the pre-strike part of a `SET PIECES` tag; the
     time before each half's kickoff;
   - **restart:** the frame where the ball is struck, with the tagged team when it maps to one.
     A strike counts only inside the half it belongs to; one found before a half starts is
     rejected, so that half stays unknown until control establishes a team.
4. **Possession state:** each half runs on its own.
   - A team gets possession after 10 control observations of its own, with no tracked frame
     contradicting them, backdated to the first. Untracked frames pause the count unless the
     dropout reaches 10 frames, so a run spans at least 0.4 s and possibly longer.
   - Possession is held through loose balls and short tracking gaps.
   - A dead ball ends it; a restart, or sustained control outside dead frames, starts the next
     one. A future restart never vetoes present control.
5. **Output:** `H`, `A` or `D` inside the halves, and `X` outside them or where no possession can
   be established.

All nine parameters were chosen in advance from football reasoning; one
(`stoppage_lookahead_frames`) is no longer used and is kept only so the defaults are unchanged.
None was fitted to, or checked against, the competition match. See the technical document for each value and its reason.

## Competition rules we follow

- **The match data is never committed or published, and neither is any prediction derived from
  it.** `.gitignore` excludes `dataset/`, `data/`, `outputs/`, `source/`, `*.mp4` and
  root-level CSVs.
- **Labels come from the algorithm only:**
  - no hand labelling;
  - no checking against the match video;
  - no training or tuning on the match or its ground truth (organisers' clarification of
    3 November 2026).

## Licence and credits

- **Our code** is under the MIT licence; see [LICENSE](LICENSE).
- **Adapted code:** parts of `src/` are adapted from the official
  [More than a Hack 2027 starter kit](https://github.com/metrica-sports/more-than-a-hack-2027),
  © 2026-2027 Metrica Sports, MIT. Its full notice is reproduced in `src/baseline.py`.
- **Explorer asset exception:** the team portraits and organiser logos are excluded from this
  repository's MIT licence, as are the Motus-derived styling values. The owner confirms their
  project-specific public use; no independent grant documents were inspected. See
  [Explorer rights status](explorer/README.md#owner-confirmed-public-use-permissions).
- **The match data** is not covered by either licence.
