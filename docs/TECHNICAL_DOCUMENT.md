# Ball possession from automatic tracking: a rule-based state machine

*More than a Hack 2027, Phase 1: Ball Possession. Technical document.*

## 1. Challenge and objective

The task is to label every frame (199,319 in total) of the tactical video of FC Barcelona vs
Athletic Club as `H` (home possession), `A` (away possession), `D` (dead ball) or `X` (no answer).

The ranking metric, `spellF1`, treats each possession (a maximal run of `H` or `A`) as one object
and matches predicted possessions to true ones by temporal IoU. Our goal was therefore to produce
**complete, correctly bounded possessions**, not just accurate individual frames. That means:
- no flicker at loose balls;
- explicit stoppages, so that `H D H` reads as two possessions;
- possession changes placed where control actually changes.

The result is a deterministic, rule-based engine with no learned components and **no training
data**. No labelled data of any kind was used, from the provided game or from anywhere else.

## 2. Inputs

**Used:**
- **Automatic tracking (ATD), tactical source:**
  - `BAR-ATH_tactical_atd.xml` gives the teams and the track slots;
  - `BAR-ATH_tactical_atd.txt` gives positions and speeds for each frame;
  - coordinates are normalised 0–1 and scaled to the organisers' 105.3 × 68.0 m pitch;
  - ATD `frame_id` *k* is video frame *k* − 1.
- **Smart Tagging** (`BAR-ATH_tactical_smart_tagging.xml`):
  - only `SET PIECES` instances, as evidence of restarts;
  - times converted with `round(seconds × 25)`, the official convention.
- **Published half boundaries:** video frames 11185–90651 and 110808–190197, from the official
  `games.half_video_blocks` and DATA.md. The organisers publish these as "boundaries, not answers".

**Deliberately not used:**
- the broadcast recording, which isn't aligned to the tactical video;
- the homography;
- the video itself;
- the Smart Tagging *phase* codes (Build Up, Progression, and so on). These are phases, not
  possessions; DATA.md warns against copying them as labels.
- the public 5-minute ground truth, which was never used for development or tuning.

## 3. Method

The engine (`src/possession.py`) runs five separate stages.

**3.1 Tracking parser.** For every frame where the ball is tracked, the parser records:
- the nearest home and the nearest away player's distance to the ball, in metres;
- the ball's position;
- the ball's speed.

Missing players are ignored, and a team with no tracked player gets distance ∞. A missing ball
leaves the frame without an observation. The line format, frame numbering and home/away mapping
(the first `<Team>` in the metadata is home) are those of the official starter kit.

**3.2 Control evidence (per frame, with no memory).** A team has credible control when its nearest
player is within **2.0 m** of the ball **and** the other team's nearest player is at least
**1.0 m** further away. Every other tracked frame gives *no evidence*: a ball in flight, a
contested ball, an exact tie, or nobody close enough. Being near the ball is therefore never
enough to count as possession.

**3.3 Possession state machine.** The states are `H`, `A`, `D` and *unknown*, and each half starts
as unknown.
- **Taking possession:** a team needs **10 control observations** of its own, either to
  establish possession or to take it from the other side. The observations need not be
  consecutive video frames:
  - any tracked frame without that team's control (no control, or the other team's) resets the
    count;
  - a frame where the ball isn't tracked pauses it, as long as the dropout is shorter than 10
    frames;
  - a dropout of 10 frames or more resets it.
  A run therefore spans at least 10 frames (0.4 s) and can span more when it bridges short
  dropouts: at most 10 observations with nine 9-frame gaps, 91 frames.
- **Backdating:** the change is placed at the **first observation of that run**, the moment the
  new team took control; the bridged untracked frames inside the run get the new team too.
- **Holding possession:** between control frames, the current possession is kept through passes,
  loose balls and challenges. This matches the challenge definition: "possession stays with the
  last team that had it".
- **What is filtered out:** brief touches, deflections and a ball rolling past a defender, seen
  in fewer than 10 tracked frames, don't change possession. This short-gap policy is a reasoned
  choice, not an optimised one.

**3.4 Missing ball.** The ball is missing on about 41% of graded frames, according to DATA.md.
- **During play:** possession is held through gaps of up to **10 s**. After a longer gap the state
  becomes unknown, so nothing is carried over an interruption we can't see.
- **During a stoppage:** a missing ball stays `D` for however long it lasts.
- A missing ball on its own is never taken to mean a dead ball.

**3.5 Dead-ball detection.** A frame is a confirmed dead ball when any of these holds:
1. **Ball out of play:** the ball is tracked more than **0.5 m** beyond a touchline or goal line
   for **3** tracked frames in a row within the same half (the whole ball must cross the line,
   under Law 9).
2. **Before a set piece:** within a `SET PIECES` tag window, the frames before the ball is struck.
3. **Before kickoff:** within each half, the frames before the `Kick Off (Start)` strike. If that
   strike can't be located, only the frames before the kickoff tag count.

A dead frame ends the current possession. `D` then lasts until a restart.

**3.6 Smart Tagging restarts.**
- **The strike:** the first tracked frame in the tag window where the ball's speed reaches
  **4 m/s**, preceded by at least **5** slower tracked frames, i.e. a ball that was still and is
  then kicked or thrown.
- **Tags that are not used:** if the ball is already moving at the start of the window, or no
  strike is found, the tag is treated as mistimed or as live play.
- **The restarting team:** the tag's team is matched to the metadata team names by text
  similarity (the tags spell names their own way). It is unknown when the tag says `N/A` (for
  example every throw-in), when the name matches neither team, or when the tags on one strike
  name both teams (whatever their order or number).
- **What a restart does:**
  - A known team takes possession from the strike.
  - With an unknown team, the first team to establish control is backdated to the strike.
  - The 10-observation rule still applies after a restart, so a wrong team tag is overridden by
    sustained opposing control. Tags are treated as evidence, not as answers.
- **Control during a stoppage:** sustained control outside confirmed-dead frames ends a
  stoppage. A future restart never vetoes it: a restart's only dead-ball evidence is its own
  tag-supported interval before the strike. Set-up control inside that interval is therefore
  ignored, but set-up control before the tag opens reads as possession (section 8).
- **Halves:** each tag is searched for a strike separately in every half it overlaps, reading no
  frames of another half. A strike establishes a restart only if it lies inside that half
  (`[start, end)`); a strike in one half is never reused in another. Ungraded frames just before
  a half may show the ball still before a strike at or after the half's first frame, but a
  strike found in them is rejected, never moved into the half. This applies to every restart
  type and to known and unknown teams alike.

**3.7 Halves and output.**
- Each half is processed independently, with nothing carried over.
- Frames outside the halves are written as `X`; they are ungraded.
- Inside a half, `X` appears only where no possession can be established (for example before the
  first sustained control when no kickoff is tagged).
- The output is exactly 199,319 rows of `frame,label`, UTF-8 with LF line endings, deterministic.

**How this differs from the official baseline.** The baseline gives each frame to the team of the
nearest player, then smooths with a ±50-frame majority vote. It produces `D` only where the ball
has been missing for a whole window. Our engine differs in three ways:
1. It separates *being nearest* from *being in control*, using a radius and a margin.
2. It replaces smoothing with a state machine that needs sustained control and backdates changes.
3. It models stoppages, kickoffs, restarts and halves explicitly.

## 4. Parameters

All nine values were fixed in advance from football reasoning; eight are used. **None was fitted to, swept on, or
checked against the competition match or its ground truth.**

| Parameter | Value | Rationale | Basis |
|---|---|---|---|
| `control_radius_m` | 2.0 m | ball within about a stride of the player's tracked centre, plus tracking noise | engineering assumption |
| `margin_m` | 1.0 m | both teams about equally close means a contested ball | engineering assumption |
| `confirm_frames` | 10 | control observations needed to switch (at least 0.4 s; see 3.3) | engineering assumption |
| `max_gap_frames` | 250 (10 s) | covers short tracking dropouts in open play | engineering assumption |
| `out_tolerance_m` | 0.5 m | whole ball over the line (ball radius ≈ 0.11 m) plus noise | Law 9 plus assumption |
| `out_confirm_frames` | 3 | one stray off-pitch position isn't a stoppage | engineering assumption |
| `restart_speed_mps` | 4.0 m/s | a struck or thrown ball is faster than a placed or carried one | engineering assumption |
| `restart_still_frames` | 5 (0.2 s) | a dead ball is still before a restart | engineering assumption |
| `stoppage_lookahead_frames` | 2250 (90 s) | **not used** since our final correction (a future restart no longer vetoes control); kept so the defaults are unchanged | — |

The frame rate (25 fps) and the pitch size come from the official `games.py`. The structure (a
distance threshold plus an inertia counter) follows common practice in public possession
trackers such as the Tryolabs write-up; the specific numbers are our own.

## 5. Testing

The original Phase 3B competition-engine verification used **synthetic data only**. Its 145
passing tests build small artificial tracking and Smart Tagging files and check exact
frame-by-frame outputs; they cover:
- **Parsing and mapping:** parsing and malformed lines, the home/away mapping, missing players
  and missing ball, metres versus normalised distances, exact ties.
- **Control and possession:** passes between teammates, brief versus sustained opposing control,
  backdating.
- **Missing ball:** gaps that are short, long, repeated and leading.
- **Game state:** halves with no carry-over, both kickoffs and the footage before them, the ball
  crossing every line, a missing ball during play versus during a stoppage, restarts by either
  team or an unknown team, same-team possessions separated by a stoppage, a later restart by
  either team after a live possession, kickoff tags that overlap both halves, strikes before a
  half or exactly at its start and end.
- **Smart Tagging:** conflicting evidence, overlapping and mistimed tags.
- **Output:** a full 199,319-row file aligned to the official half blocks, determinism, LF line
  endings, and agreement with the official format validator; malformed or out-of-range frame ids
  are skipped, never written to another frame, and a duplicated frame never mixes fields from
  two rows.
- **Audit regressions:** each defect found in our internal and independent reviews has a test
  that fails on the earlier code.
- **Fallback:** the baseline reproduction matches the official functions on synthetic data.

The organisers' validator and our format check both pass on the generated file. These are
**format and reproducibility checks only**: no accuracy figure was computed on the match, by
design.

## 6. Competition-rule compliance

- **No labels from the match:** no manual labelling of the provided match, no comparison with its
  video, and no training, tuning or parameter selection on the match or its ground truth (in line
  with the 3 November 2026 clarification).
- **No data in the repository:** the match data and every prediction derived from it are excluded
  by `.gitignore` and never published.
- **Only official assets, plus published rules:** every input is an organiser-supplied asset or a
  published constant; there are no private models or datasets.
- **AI assistance:** an AI coding assistant helped write the code and tests. It worked from public
  code, public documentation and synthetic data only; all runs on the match data were made locally
  by the team.

## 7. Reproduction

```powershell
python -m pip install -r requirements.txt        # Python 3.10; numpy 1.24.1, pandas 1.5.2
$env:MTAH_DATA_DIR = "C:\path\to\data-dir"       # contains tactical/BAR-ATH_tactical_*
python src/possession.py --out outputs/submission.csv
python src/check_submission.py outputs/submission.csv
python -m pytest tests/test_baseline.py tests/test_possession.py tests/test_game_state.py -q
```

The output is the same byte for byte on every run. The official reference repository is not
needed for competition CSV generation. The optional integrated suite has 220 passing synthetic
Python tests across `tests/` and `tools/`; it also checks external adapters and the Explorer
exporter. To run that suite, first install the pinned public official files with
`python benchmark/setup_official.py`, then run `python -m pytest tests tools -q`. The
separate IDSSE study used one external match to measure provider-annotation agreement; it was
not synthetic-only validation and is not a competition score.

## 8. Known limitations and uncertainties

- **High balls near a line:** the ball's height is lost when it is projected onto the pitch, so a
  high ball near a line can briefly read as out of play. That ends a possession falsely, and the
  stoppage lasts until sustained control or a restart.
- **Ball leaving the pitch while untracked:** such a stoppage is only recognised in the tag window
  before its restart, so its `D` starts late.
- **Missed or early restarts:** the strike detector can miss a slow short free kick (under 4 m/s)
  or a ball with a noisy speed reading, and can fire early on a ball thrown back to the taker.
  A wrongly timed tag in live play can insert a false short stoppage.
- **Kickoff just before a half block:** if the true kickoff strike falls in the ungraded frames
  before a published half starts, it is rejected. That half then starts unknown (`X`) until
  control evidence establishes a team; no team is inferred from the rejected strike.
- **Set-up before the tag window:** once the ball is out, a player holding or placing it (for
  example a goalkeeper before a goal kick) reads as possession until the set-piece tag opens.
  This splits the stoppage into `D`, a short possession and `D`. We accept it rather than let a
  future tag erase a real possession; no rule is added to hide it.
- **Unknown-team restarts:** after a restart with no known team, the first team to establish
  control is backdated to the strike. A quick interception can therefore be credited from the
  strike to the intercepting team.
- **The ball's speed value:** the official starter and DATA.md document the third value of every
  raw group, the ball's included, as speed. The unit (m/s) is stated explicitly only for players.
- **Home team:** taken to be the first team in the metadata, the official starter's convention.
- **Unvalidated choices:** the thresholds are reasoned, not validated. We have no measured evidence
  of how they perform on this match, and we make no claim about the score.

**With more time:**
- validate and calibrate the thresholds on external tracking data with verified data-use rights
  and documented possession labels;
- add a ball-height or trajectory cue for aerial balls;
- detect untagged restarts from ball motion alone.

## Optional external validation

The competition inference and CSV above use the frozen Phase 3B engine without IDSSE or SkillCorner
data. External adapters are optional research tools; IDSSE match data is acquired separately under
CC BY 4.0. The external benchmark excludes provider labels and events from prediction inputs and
does not bridge IDSSE events into Smart Tagging restarts. Its single development-match numbers are
agreement with DFL provider annotations, not competition performance or independent possession
ground truth. See [the detailed benchmark report](IDSSE_BENCHMARK_E1D_B.md).

The optional [React Explorer](../explorer/README.md) displays scripted synthetic scenarios and
their engine-generated predictions. It reads no competition match data and is not part of CSV
generation; its synthetic scores are separate from the IDSSE provider-agreement result.

## 9. References and attribution

- Metrica Sports, *More than a Hack 2027* official repository: challenge, data, evaluation and
  starter kit documentation. https://github.com/metrica-sports/more-than-a-hack-2027
- IFAB, *Laws of the Game*, Law 9 (The Ball In and Out of Play).
- Tryolabs, "Measuring soccer ball possession with AI and video analytics" (public blog post and
  code).

Parsing and baseline code are adapted from the official starter kit, © 2026-2027 Metrica Sports,
under the MIT Licence; the full notice is in `src/baseline.py`. Our code is under the MIT Licence
(`LICENSE`).
