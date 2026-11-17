# possession-explorer.html: data manifest

Every data-bound element in the three previews, and where its data comes from. Counts are taken
from the synthetic end-to-end fixture (`tests/test_game_state.py`: `scenario_lines()` + `TAGS_XML`,
120 frames, graded half = frames 10–109), run through `src/possession.py` and `src/baseline.py` at
`ff686e3`. No match data is involved.

Classes: ✅ Real (populated from the fixture/engine) · ⚠️ Sometimes (partly populated) ·
❌ Aspirational (no data today; a spec for what to build).

| Element | Field path (proposed) | Class | Count |
|---|---|---|---|
| Frame clock, scrubber | `frames[i]`, `fps` | ✅ Real | 120/120 frames, 25 fps |
| Team names | `teams.home.name`, `teams.away.name` | ✅ Real | 2/2 ("Synthetic Home", "Synthetic Away") |
| Player dots | `frames[i].players[k].{x,y}` | ⚠️ Sometimes | 5 tracks × 120 frames; in every frame 4 of 5 tracks are parked at one point (0.9, 0.9), so only 1 player moves at a time |
| Player identity / names | `players[k].{id,label,team}` | ⚠️ Sometimes | 5/5 ids; labels are "Track 1–5", no names, no shirt numbers in use |
| Ball | `frames[i].ball.{x,y}` or `null` | ✅ Real | 105/120 tracked, 15 missing (frames 65–79) |
| Ball speed | `frames[i].ball.speed` | ✅ Real | 105/105 tracked frames |
| Phase 3B labels | `predictions.phase3b[i]` | ✅ Real | 120/120 (X×10 D×10 H×40 D×25 A×25 X×10) |
| smooth50 labels | `predictions.smooth50[i]` | ✅ Real | 120/120 (H×68 A×52) |
| "Why" text (Phase 3B) | `explanations.phase3b[i].source` | ✅ Real | 120/120: state-machine `source` codes inside the half; outside the half a fixed "ungraded" string |
| Control evidence strip | `evidence[i]` (H/A/no-control/no-ball) | ✅ Real | 120/120 |
| Restart markers | `events[]` type `restart`, `frame`, `team` | ✅ Real | 2 (frame 20 home kickoff; frame 85 throw-in, team unknown) |
| Event labels (kickoff, ball out, throw-in, half) | `events[]` | ⚠️ Sometimes | 5 shown; kickoff and throw-in come from tags, "ball out" from confirmed out-of-bounds frames 60–64, half from the segment; positions are hand-placed in the mock |
| Synthetic reference labels | `reference[i]` | ❌ Aspirational | 0/120. The fixture's expected string equals the engine's output by construction, so it is **not** an independent reference; per-scenario reference labels must be authored separately |
| Scenarios S2–S4 | `scenarios[]` | ❌ Aspirational | 0/3 exist; drawn as "planned" |
| Parameters panel | `params` | ✅ Real | values from `DEFAULTS` / `GAME_DEFAULTS` |
| Evidence stats (B) | static copy | ✅ Real | 143 passed + 2 skipped (pytest at ff686e3, no official clone); 9 parameters, 8 used |
| Team members (B, C) | `team[]` | ✅ Real | 4/4 members (Marc, Fahmy, Faris, Eslam), approved by the owner in UI3B.1 |
| Confidence / accuracy | — | not shown | none exists; must never be invented |

## Gaps the implement phase must decide

1. **Reference labels:** author independent synthetic reference labels per scenario (by hand, from the scenario script), or omit the reference row.
2. **Scenario richness:** the existing fixture is minimal (parked tracks). New scenarios should be authored as typed TypeScript fixtures with 22 moving players, or generated offline by a small script that is committed with its output.
3. **Engine output for the UI:** labels and `source` codes must be generated offline by the unchanged Python engine and committed as static JSON, or the explanation layer is re-derived in TypeScript. Re-deriving duplicates the algorithm and is not recommended.
4. **Team data:** names, roles and links only after each member approves.
