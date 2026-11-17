# E1C-D — Original-source IDSSE provenance and one-match data audit

Decision: **CONDITIONAL GO for E1D**, limited to a reviewed external agreement protocol. This phase performed no model inference, possession scoring, or competition-data access. All downloaded XML and the local audit script remain under ignored `external_samples/idsse/`; only aggregate findings appear here. The frozen Phase 3B code and defaults were not changed.

## Original release and selected files

The [publisher's data descriptor](https://www.nature.com/articles/s41597-025-04505-y) states that the DFL authorized the metadata, events, and positions dataset under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit the Deutsche Fußball Liga, cite Bassek, Rein, Weber and Memmert (2025), DOI `10.1038/s41597-025-04505-y`, link the license, and identify modifications in any shared derivative. The original source is [Figshare dataset `28196177`, version 1](https://api.figshare.com/v2/articles/28196177), DOI `10.6084/m9.figshare.28196177.v1` (record modified 2025-02-02). Figshare's v1 API lists 21 XML files, with publisher supplied and computed MD5 hashes. The seven match IDs are `J03WMX`, `J03WN1`, `J03WOH`, `J03WOY`, `J03WPY`, `J03WQQ`, and `J03WR9`.

The [PySport mirror at commit `a715a38dfbaf5f58e431727c2b78d174101a703c`](https://huggingface.co/datasets/pysport/idsse-data/tree/a715a38dfbaf5f58e431727c2b78d174101a703c) lists the **same 21 XML filenames and exact byte sizes** as Figshare v1. Its dataset card lists two IDs, `J03WPF` and `J03WQF`, that are absent from both file inventories. The apparent `J03WMX` size anomaly in E1C-C was a listing misread: the original and mirror position files are both 418,524,833 bytes. The original is the provenance authority; inventory equality alone does not establish byte identity for every mirrored file. For the selected match's tracking XML, the mirror LFS SHA-256 equals the hash of the downloaded original.

`J03WOH` was selected from the predeclared development set. The following three files came directly from Figshare v1 and matched its exact sizes and publisher MD5 hashes. SHA-256 values were computed locally; they are not publisher-supplied checksums.

| File type | Figshare file ID | Bytes | Publisher MD5 verified | Local SHA-256 |
| --- | ---: | ---: | --- | --- |
| `DFL_02_01_matchinformation_DFL-COM-000002_DFL-MAT-J03WOH.xml` | [51643478](https://ndownloader.figshare.com/files/51643478) | 11,745 | `b9710781d400dd812f62b0a6e3d7bce8` | `f23b3ee13b988b1ff9a0bce438c416dac47e71355bbc7ee1dab21aaf3e33c18c` |
| `DFL_03_02_events_raw_DFL-COM-000002_DFL-MAT-J03WOH.xml` | [51643499](https://ndownloader.figshare.com/files/51643499) | 635,747 | `ab66e51512f39d06f49f27dd3b4c2f40` | `abc27e3268e6126fb3e6e90bff5cca8d4586a5e0cefe9bd59bf32871e89d8544` |
| `DFL_04_03_positions_raw_observed_DFL-COM-000002_DFL-MAT-J03WOH.xml` | [51643520](https://ndownloader.figshare.com/files/51643520) | 348,945,715 | `3efff25a86a61768e7d253b4bba137a3` | `ec4dcf30200aad694dea263d5289485fcd0ca42badddaeb7c81f5cd5a4229d4f` |

Total local source storage is 349,593,207 bytes (about 350 MB decimal); the three XML files are the only match downloaded.

**R1.1 provenance check (17 November 2026):** a fresh read-only request to the original [Figshare article API](https://api.figshare.com/v2/articles/28196177) returned article `28196177`, version `1`, DOI `10.6084/m9.figshare.28196177.v1`, and 21 listed files. For the three `J03WOH` entries, the API returned the exact file IDs, names, byte sizes and `computed_md5` values in the table above. The independent referee verified local file hashes and public mirror identity but could not fetch this primary API manifest; this R1.1 check independently confirms the publisher's current manifest metadata. The local SHA-256 values remain locally computed. Neither the referee's check nor this API request independently re-downloaded or byte-compared the original 349 MB source; original-file identity rests on the earlier local download and publisher-MD5 verification, and equality of all mirror file contents remains unverified.

## Actual XML and adapter compatibility

All three XML roots are `PutDataRequest`, with no namespace in this match. Positions have a `Positions` container with `MetaData`, `PitchSize`, and nested `FrameSet`s. Metadata has `MatchInformation/General`, `Environment`, and `Teams`; this match uses `GuestTeamId`, which the adapter already supports. Events are `Event` elements with `EventTime`, `EventId`, and typed child elements such as `KickOff`. The real player and ball `FrameSet` IDs, `GameSection`, `Frame.N/T`, and pitch-centred metre coordinates match the documented contract. The 105 × 68 m pitch and distinct metadata team IDs mapped correctly. The adapter accepts the complete match without inference and produces 137,214 normalized frames in two independent half segments.

| Quality check | First half | Second half |
| --- | ---: | ---: |
| Ball frames | 69,424 | 67,790 |
| Timestamp span | 2,776.92 s | 2,711.56 s |
| FrameSets (ball plus players/substitutes) | 23 | 33 |
| Player observations | 1,527,328 | 1,491,380 |
| Player observations per ball frame | 22.0 | 22.0 |
| Finite ball coordinates and both nearest-team distances | 100% | 100% |

Within each half, ball frame numbers are consecutive and adjacent timestamps are 40 ms apart within the adapter's 1 ms tolerance. No duplicate player frame IDs, internal player-frame gaps, or invalid player `X/Y` were found. All ball `X/Y` are finite. The two missing normalized speed entries are the first frames of each half, deliberately masked because no preceding same-half observation exists. Converted speed is otherwise finite. Ball coordinates sometimes extend beyond pitch boundaries, as expected for out-of-play tracking; 303 frames marked active also have corner-origin ball coordinates beyond the pitch rectangle, so status and geometric boundaries should not be assumed perfectly synchronous.

The initial actual-file parse revealed a memory defect: clearing the outer XML root did not release completed `FrameSet`s under the nested `Positions` container. The adapter now clears each completed `FrameSet` after consumption. On this machine, full-match adapter loading fell from about **3.17 GB to 192 MB peak working set** and from 36.7 s to 29.1 s. A synthetic nested-container regression was added. The separate local quality audit, including additional passes over positions and events, took about 58–62 s. These are single-machine observations, not production performance guarantees.

## Provider annotation coverage and limits

The [publisher definition](https://www.nature.com/articles/s41597-025-04505-y) says ball `BallStatus=0` means inactive/referee interrupted and `1` active; `BallPossession=1/2` denotes home/away player control. Both codes appear on every ball frame in this match, including inactive frames. The provisional mapper gives inactive status precedence over a retained possession code. No missing or other values were observed. These are **provider-derived annotations**, not independently adjudicated truth or model accuracy.

| Provisional state | First half | Second half | Total | Total share |
| --- | ---: | ---: | ---: | ---: |
| H | 20,714 | 18,412 | 39,126 | 28.51% |
| A | 17,130 | 15,689 | 32,819 | 23.92% |
| D | 31,580 | 33,689 | 65,269 | 47.57% |
| X | 0 | 0 | 0 | 0% |

There were 502 within-half label changes; no X runs. The longest D runs were 2,344 and 3,587 frames (about 94 s and 143 s). Full code coverage is not proof that all D boundaries or possession changes are correct. The high inactive share merits review. There are 1,389 event elements across 27 child types. The two `KickOff` event times differ from the first active tracking frames by about 1.6 s and 1.4 s, confirming that events should not be joined to exact frames without an alignment rule. Other restart/stoppage discrepancies were not quantified in this phase.

The ball `S` field converts from documented km/h to m/s, but **inactive-period speed is a quality concern**: 41,855 inactive frames report more than 4 m/s, and 41,868 unchanged consecutive ball `X/Y` pairs also report more than 4 m/s. Most such cases overlap. Median absolute difference between reported speed and adjacent-frame horizontal displacement speed is about 1.0 m/s in the first half and 1.9 m/s in the second; correlation is 0.40 and 0.14 respectively. This pattern is consistent with stale or differently processed speed during inactive periods, but its cause is unverified. Do not treat `S` alone as restart-strike evidence on this match. The adapter supplies no event-derived restart windows and does not use `BallStatus` or `BallPossession` as prediction features.

## E1D gate

The one-match XML contract, identity mapping, coordinate conversion, 25 fps timeline, and bounded parser memory are validated. Before external agreement scoring, review the meaning and timing of inactive codes and ball speed against the publisher's definitions and a small, locally retained set of event-linked transition windows. Specify an event-time alignment tolerance and decide whether the existing label mapper can support full-match provider agreement or must exclude uncertain boundaries as X. Keep the frozen algorithm and the predeclared development/test split. The smallest E1D task is a **local label-boundary and speed-quality review on `J03WOH`, followed by a written scoring protocol**; do not tune or score a model until that review is accepted.
