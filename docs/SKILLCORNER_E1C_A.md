# E1C-A - SkillCorner rights and possession-label decision

Status: documentation-only audit on `experiment/external-benchmark` at `016c9c7`. No complete match, external prediction, or derived label file was produced. The E1A and E1B findings remain the synthetic and bounded-sample baseline.

## Authoritative sources and permission decision

- [SkillCorner Open Data README](https://github.com/SkillCorner/opendata/blob/master/README.md): expressly offers access to tracking data for researchers and the analytics community, lists the four files per match, and asks users to credit SkillCorner. It gives examples of analysis and tutorials but does not spell out a data-file license or downstream publication rights.
- [Repository LICENSE](https://github.com/SkillCorner/opendata/blob/master/LICENSE): MIT wording grants rights to "software and associated documentation files". It does not expressly name JSONL/JSON/CSV data, raw excerpts, labels, or aggregate results. GitHub's MIT badge is therefore insufficient to establish those data rights. No separate data license, contributor grant, or file-level use notice was found in the inspected root documentation and previously audited match files; absence is not a grant.
- [SkillCorner 2026 standard terms](https://skillcorner.com/legal/standard-terms-and-conditions-2026) and its [PDF](https://26560301.fs1.hubspotusercontent-eu1.net/hubfs/26560301/SkillCorner%20T%26Cs_.pdf): these define an Agreement with a Partner and Work Order, including a work-order-specific Permitted Use. Their partner redistribution restrictions must not be presumed to govern this open repository without evidence of an applicable agreement. They also do not clarify the open-data file license.

| Intended action | Public-evidence classification | Reason / operational rule |
| --- | --- | --- |
| Read or locally download publicly offered files | Unclear / needs provider clarification for complete-copy and retention rights; public research access is explicitly offered | The [README](https://github.com/SkillCorner/opendata/blob/master/README.md) makes files accessible and invites research, but the [LICENSE](https://github.com/SkillCorner/opendata/blob/master/LICENSE) does not expressly grant data-copy rights. The bounded E1A sample remains local and ignored. |
| Private benchmark/model evaluation | Unclear / needs provider clarification | The [README](https://github.com/SkillCorner/opendata/blob/master/README.md) welcomes research, but the [LICENSE](https://github.com/SkillCorner/opendata/blob/master/LICENSE) does not establish data-file evaluation terms. |
| ML training | Unclear / needs provider clarification | The [README](https://github.com/SkillCorner/opendata/blob/master/README.md) does not address training or model rights. |
| Publish aggregate benchmark scores | Unclear / needs provider clarification | The [README](https://github.com/SkillCorner/opendata/blob/master/README.md) lists public analytical work, but provides no express results-publication grant. |
| Publish reusable derived possession labels | Unclear / needs provider clarification | No derivative-data grant is stated in the [README](https://github.com/SkillCorner/opendata/blob/master/README.md) or [LICENSE](https://github.com/SkillCorner/opendata/blob/master/LICENSE). Do not publish labels. |
| Redistribute raw tracking/events/phases or excerpts | Unclear / needs provider clarification | The [LICENSE](https://github.com/SkillCorner/opendata/blob/master/LICENSE) describes software and documentation, without expressly identifying data; do not redistribute it. |
| Public React demo containing match data or derived visuals | Unclear / needs provider clarification | The [README](https://github.com/SkillCorner/opendata/blob/master/README.md) does not address display or hosting rights. A synthetic-only demo is outside this data question. |
| Attribution | Explicitly requested | The [README](https://github.com/SkillCorner/opendata/blob/master/README.md) asks users to credit SkillCorner; link the source in any permitted use. Exact mandatory notice language for data remains unclear. |

These classifications concern the **public open-data release**, not a paid partner Work Order. No public source inspected expressly prohibits these open-data uses; unclear means do not proceed with publication or bulk copying pending clarification. Technical download access is not the same as legal permission.

## Provider semantics and unresolved boundaries

The [README tracking schema](https://github.com/SkillCorner/opendata/blob/master/README.md) defines 10 fps `frame`, match-clock `timestamp`, `period`, `ball_data`, `player_data`, and `possession.player_id/group`; `group` indicates the player/team in possession. It does **not** define how that tracking field is annotated, whether it is instantaneous physical control, or what a null value means. The [dynamic-events specification](https://26560301.fs1.hubspotusercontent-eu1.net/hubfs/26560301/Guides/Dynamic%20Events/20250216%20-%20Dynamic%20Events%20CSV%20Specifications.pdf) defines a `player_possession` as control sufficient to pass, shoot or carry, from first to last touch; it does not establish that tracking `possession.group` uses the identical rule.

The [phase specification](https://26560301.fs1.hubspotusercontent-eu1.net/hubfs/26560301/Guides/Phases%20of%20Play/20250216%20-%20Phases%20of%20Play%20CSV%20Specifications.pdf) says phases occur only while the ball is in play and gives each in-possession phase a corresponding out-of-possession phase. Team possession is constructed from player-possession events: it persists between same-team events and changes at the start of the next team's event. It also treats more than 30 seconds without player-possession, set-piece or goal events as out of bounds. A short defending-player `disruption` can leave the overall attacking phase unchanged. These are provider-derived rules, not independent frame-by-frame truth.

The specifications identify phase `match_id`, `period`, `frame_start`, `frame_end`, `time_start`, `time_end`, and `team_in_possession_id`, but do **not** define whether `frame_end` is inclusive. They do not guarantee exhaustive non-overlapping phase coverage of every live frame. E1A's bounded sample found a period-1 phase whose frame span extended past the tracking period-2 start; that is an observed alignment conflict, not proof that phases legitimately cross halves. Clip by tracking `period` and keep boundary conflicts unknown. Event and phase clocks start period 2 at `00:45:00`; metadata identifies team/player IDs, pitch, and period frame bounds, while tracking period must still be checked per frame.

Dynamic-event `game_interruption_before/after` names a category preceding/following a `player_possession` (corner, free kick, goal kick, penalty, throw-in, goal). `start_type` can name a set-piece reception/interception. Event `frame_start/frame_end` and `time_start/time_end` time the **event**, not a whistle-to-restart dead-ball interval. No exact kickoff or other D interval is specified. `set_play` is an in-play phase after a set piece; it is not D evidence. A phase gap, null `possession.group`, absent ball, or an interruption category alone cannot mark D. Their exact semantics and true dead-ball boundaries remain unresolved.

## Conservative label and evaluation policy

- **H/A**: provider-consensus proxy only when tracking `period` is valid, metadata home/away IDs are known, exactly one phase covers the frame under an explicitly provisional boundary convention, phase `team_in_possession_id` maps to that team, and tracking `possession.group` agrees. Keep inference features separate from provider metadata.
- **X**: null/unsupported period, invalid identity, null/ambiguous possession, phase gap/overlap, phase-versus-possession conflict, half-boundary conflict, uncertain endpoint frame, or unverified stoppage. Do not fill X from nearby frames.
- **D**: unavailable until a provider field or independent annotation gives a positive, aligned start and end of dead ball. Never infer D solely from absence of phases.

| Measurement | Status | Limit |
| --- | --- | --- |
| H/A agreement on consensus-supported frames, with coverage by match/team/period | Provider-proxy agreement, conditionally supportable | Same frozen labels and evaluated frames for every algorithm; not independent accuracy. |
| Possession-change boundary agreement | Proxy agreement only after event/phase alignment and boundary rules are verified | Current boundary convention and disruption behavior prevent a trustworthy boundary score. |
| Dead-ball detection | Not currently supportable | No independently timed D intervals. |
| Official-style whole-match spellF1 | Not currently supportable | Sparse X holes split or remove spells; unknown D and boundary conventions change both denominators and transitions. Do not describe a sparse-proxy score as full possession accuracy. |

## E1C-B eligibility gate

Before examining a complete match locally: obtain a clear data-file permission for intended internal research/benchmark use; freeze eligible public match IDs; record source revision/URLs, file sizes and SHA-256 checksums; verify metadata/tracking/events/phases schemas; check full frame continuity and period/timestamp alignment; predeclare H/A/X coverage, phase-end and exclusion rules; keep files under ignored `external_samples/`; avoid competition inputs/outputs and any raw-data upload. The E1A bounded match ID is a candidate only, not an approved full-match download. A complete match is not required to answer E1C-A.

Internal research requires the first gate. Public aggregate reporting additionally requires permission to publish derived scores and a disclosed proxy definition/coverage. Reusable label publication additionally requires derivative-label rights and a validated label timeline. A public React visualization additionally requires permission to display/host the underlying tracking or derivatives; synthetic-only visuals do not use SkillCorner match data. These permissions are separate.

**Decision: NO-GO for E1C-B complete-match examination pending explicit data-file research/download clarification.** The public README supports bounded research access, but it does not resolve the intended full-copy and benchmark rights. If SkillCorner confirms those rights, E1C-B may proceed with the above local-only gate; publication, training, labels and demo use require separately stated answers.

## Clarification draft (not sent)

Subject: SkillCorner Open Data permissions and possession-field definitions

Hello SkillCorner team,

We are evaluating your public A-League `opendata` files for a research benchmark of football possession. Could you confirm whether the repository's MIT license covers the JSONL/JSON/CSV match data, or identify the applicable data terms? In particular, may we (1) download and retain complete public matches for private benchmark evaluation, (2) train models, (3) publish aggregate scores with attribution, (4) publish derived frame-level labels, (5) redistribute raw excerpts, and (6) show tracking or derived visuals in a public React demo? Please specify required attribution and any restrictions.

For label interpretation, does tracking `possession.group` mean instantaneous player control or a held team-possession state, and what does null mean? Are phase `frame_start/frame_end` inclusive or half-open, are in-play phases exhaustive and non-overlapping, and how should records that span a tracking period boundary be interpreted? Is there an authoritative field or file with exact dead-ball and restart frame boundaries, including kickoffs and set pieces?

Thank you.
