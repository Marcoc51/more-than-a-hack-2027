# E1B — SkillCorner native-rate bridge

Status: synthetic integration complete; bounded public sample passed **schema compatibility only**. No external predictions, label files, or accuracy results were generated. Frozen engine source: MAF FC main `ff686e3`. License and label limitations from [E1A](SKILLCORNER_E1A.md) remain in force.

## Interface and field mapping

`benchmark/skillcorner_adapter.py` constructs an `EngineInput` from a validated, contiguous list of [SkillCorner 10 fps tracking records](https://github.com/SkillCorner/opendata/blob/4340d274572876239c154c90bc507a9b3250a656/README.md) and its match metadata. The only prediction entry point is `predict(EngineInput)`, which calls the unchanged `src/possession.py` functions `control_evidence`, `game_evidence`, `infer_states`, and `to_labels`. It never calls the competition file-loading or submission paths. Provider labels are handled by a separate `consensus_proxy_labels` function and are absent from `EngineInput`.

| SkillCorner field | Verified external engine contract |
| --- | --- |
| `match.id`; tracking `frame` | Numeric match ID and contiguous nonnegative absolute frame IDs; local array indices are distinct from provider frame IDs. A missing frame is rejected rather than silently reindexed. |
| `match_periods[].period,start_frame,end_frame`; tracking `period,timestamp` | Periods 1 and 2 only, validated against metadata bounds; consecutive timestamps must match the native 0.1 s grid, anchored at 00:00:00 and 00:45:00. Runs of valid period IDs become half-open local `segments`; null-period rows stay outside them. |
| `home_team.id`, `away_team.id`, `players[].id,team_id`, `player_data[].player_id` | Explicit player-ID-to-team mapping; player array order never defines home/away. Unknown or duplicate IDs fail. |
| `pitch_length,pitch_width`; `ball_data.x,y`; `player_data[].x,y` | Provider pitch-centred metres become engine corner-origin metres by adding half the pitch length/width. Distances and out-of-bounds use the match pitch, not the competition pitch. No attacking-direction reflection is applied. |
| `home_team_side[]` | Validate two opposite directions and retain as metadata. It does not affect team identity or nearest-player geometry. |
| `ball_data.is_detected`, `player_data[].is_detected` | Only genuine `True` observations enter geometry; false/null ball observations become NaN and break speed continuity. Undetected players are not used for nearest-team distance. Coordinate presence alone never means detected. |
| `ball_data.z` | Present in provider schema but excluded from this 2D engine bridge. |
| `possession.group,player_id`, phases CSV, dynamic events CSV | **Never enter `EngineInput` or `predict`.** The H/A/X proxy routine reads `possession.group` and phase `match_id,period,frame_start,frame_end,team_in_possession_id` only. Events are not consumed. |

The prediction entry point also rejects caller-constructed inputs lacking the adapter validation token. Numeric IDs must be integral JSON integers or decimal CSV strings; fractional IDs cannot be truncated into another team or player. The input validator rejects malformed metadata, pitch dimensions, team or player IDs, period order, frame gaps, mistimed timestamps, unsupported detection flags, and detected observations without finite coordinates. A partial contiguous window is allowed; its period bounds and timestamps still have to agree with metadata. This permits bounded schema inspection without a full match download.

## Rate adaptation and speed

`rate_adapted_config(10)` is external-only. For a 25 fps frame threshold `n`, it uses `ceil(n × 10 / 25)`, so a coarse-grid confirmation is never shorter than the original physical duration. This yields control confirmation **4** frames (0.4 s), maximum held gap **100** frames (10 s), out-of-bounds confirmation **2** frames (0.2 s rather than the unrepresentable 0.12 s), and pre-strike stillness **2** frames (0.2 s). The 4 m/s speed threshold, distances, and pitch tolerance remain unchanged. The unused lookahead is scaled for an internally consistent configuration. This is a **rate-adapted reference**, not the original 25 fps competition configuration; no default in `src/possession.py` changes.

The adapter derives horizontal ball speed as `hypot(dx,dy)/dt` in m/s **only** when both current and immediately preceding rows are genuinely detected, consecutive, and in the same period. It emits NaN at the first observation, after a missing or extrapolated ball, and across half boundaries. It does not interpolate positions or manufacture a strike across a gap. SkillCorner has no observed ball-speed field in the audited schema; this 2D estimate is not claimed equivalent to Metrica's supplied speed. `predict` passes no set-piece tags to `game_evidence`, so it generates no tag-supported restart strikes or kickoff dead intervals. Confirmed observed out-of-bounds remains available. The frozen `locate_restart` helper skips NaN without resetting its earlier still-ball count. Thus a future event/tag bridge could falsely count stillness across a missing interval even though this E1B prediction path supplies no tags and creates no such strike. An event bridge must resolve that gap rule before use.

## Proxy-label boundary

`consensus_proxy_labels` produces H or A only where tracking `period` is valid, phase match/period/team agrees with metadata, and `possession.group` agrees with that phase team. All other frames are X; it never emits D. Phase end exclusivity must be explicitly acknowledged with `phase_end_exclusive=True`, because the provider [phase specification](https://26560301.fs1.hubspotusercontent-eu1.net/hubfs/26560301/Guides/Phases%20of%20Play/20250216%20-%20Phases%20of%20Play%20CSV%20Specifications.pdf) does not resolve inclusivity. The routine keys phases by both period and frame, clipping a period-1 phase that crosses into period-2 tracking. It reports H/A/X coverage counts. A phase gap or null possession remains X, even if the ball is unobserved or an event suggests a later restart.

These are **provider-consensus proxies**, not independent possession truth. Their internal X gaps fragment the official scorer's valid runs. Whole-match official spellF1 or H/A/D macroF1 against this target would not be a sound possession-accuracy claim. A later E1C may report coverage-limited H/A agreement if the data rights and label policy are approved and all methods use the same audited matches and frames.

## Synthetic validation and sample gate

Synthetic integration proves interface and isolation behavior; it measures neither provider H/A agreement nor independent possession accuracy or official competition spellF1. Synthetic tests cover away-first player ordering, team IDs, centre-to-corner coordinates, attacking-direction metadata, exact 10 fps timestamps and half resets, rate scaling without changing defaults, missing-ball speed gaps, phase conflicts and period clipping, label isolation, prediction through the unchanged engine, and clear invalid-input failures. Run `python -m pytest tests -q -rs -p no:cacheprovider`.

The retained ignored E1A sample under `external_samples/skillcorner/1874553/` passed `adapt_tracking` schema validation on its initial contiguous prefix and its bounded halftime window. **No prediction or proxy-label conversion was run on that external sample.** These windows cannot validate full-match continuity, provider-label coverage, dead-ball intervals, or benchmark results; the 90 MB tracking file remains undownloaded.

## E1C readiness

E1C external **agreement** benchmarking is conditional: confirm research and derivative rights for match files, approve a limited full-match download, settle phase interval semantics, audit complete-frame continuity and label coverage, and freeze a match-level split and proxy policy before scoring. Keep the frozen source and rate-adapted configuration named separately. If D intervals and complete H/A boundaries remain unavailable, restrict comparisons to coverage-limited team agreement; do not report full official possession accuracy or compare with competitor scores from different matches or labels.
