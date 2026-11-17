# MAF FC Possession Explorer

An interactive viewer for frame-by-frame football possession (`H` home, `A` away, `D` dead ball,
`X` no answer). It plays synthetic tracking on a 2D pitch. Frame by frame, it shows the labels of
the **Rule-Based Possession Engine** and of the **official smooth50 baseline**, both computed by the
unchanged Python code in [`../src`](../src), and compares them with each scenario's scripted
reference.

**Public demo: synthetic data only.** Every bundled scenario is scripted in
[`../tools/export_scenarios.py`](../tools/export_scenarios.py). No competition data, video,
ground truth or match prediction is bundled. A separate local development mode can open
owner-authorized exports, as described below.

## Pages

| Route | What it does |
|---|---|
| `/` | Home: the problem, a working mini-Explorer on S1 (its own playback), entry points, facts, and the competition context with the organisers' logos |
| `/explorer` | The analysis workspace: pitch, playback, five timeline tracks and the frame inspector |
| `/compare` | Possession Engine and smooth50 against the scripted reference: frame agreement, official synthetic spellF1/macroF1, a comparison timeline, disagreement intervals, label counts and confusion matrices |
| `/methodology` | How the engine works, with three diagrams, how it differs from smooth50, its parameters and limitations, and how to reproduce everything |
| `/team` | The four MAF FC members, with photos and LinkedIn and GitHub links (see "Team data" below) |

- Unknown paths show a "Page not found" page.
- The selected scenario lives in the URL (`?scenario=s2`), so it carries across pages and links
  can be shared. `?frame=N` opens the Explorer at a frame.

In local mode (`npm run dev:local`), `/explorer` and `/compare` instead show authorized actual-match
exports; see [Operating modes](#operating-modes).

## Scenarios

| ID | Title | What it shows |
|---|---|---|
| S1 | Kickoff, ball out, throw-in | Pre-match footage, a tagged kickoff, a ball out of play, a tagged throw-in, a brief opposing touch, ungraded frames |
| S2 | Contested loose ball | A 60-frame scramble with short bursts of control for both teams before away wins the ball |
| S3 | Ball tracking lost | 100 untracked ball frames, with an away tackle hidden inside the gap |
| S4 | Mistimed restart tag | A throw-in whose Smart Tagging tag is placed 50 frames late, over live play |

## Operating modes

| | Public Explorer (default) | Local Explorer (`npm run dev:local`) |
|---|---|---|
| Data | The four tracked **synthetic** scenarios only | Your **authorized actual-match** exports, from this computer only |
| Explorer page | Synthetic pitch, engine evidence, scripted reference | Real tracking window, imported predictions, real source frame numbers |
| Compare page | Both models against each scenario's **scripted reference** (synthetic spellF1/macroF1) | Rule-Based Possession Engine **against smooth50**: agreement only, no reference, no accuracy |
| Home, Methodology | Synthetic demo | Synthetic demo (marked as such) |
| Where it runs | Any static host; `npm run build` | Loopback development server only; cannot be built or deployed |

**Public Demo is the default.** `npm run dev`, `npm run build` and `npm run preview` use only
the four tracked synthetic scenarios. The production output needs no backend or external
network service. No actual-match inputs, video, predictions or private reference labels are
part of it. The UI explicitly identifies the public synthetic source.

**Local Explorer is development-only.** From `explorer/`, run:

```powershell
npm ci
npm run dev:local
# Open http://127.0.0.1:5173/explorer
```

With a registered export (below), `/explorer` opens it immediately and `/compare` reuses the
same loaded data; switching pages or windows never asks for the file again. Without one, both
pages show setup instructions. They never fall back to synthetic data. The local viewer
reuses the app's pitch, playback, transport and timeline components and shows real source
frame numbers and video time.

**How the default is found.** Only in `local-explorer` serve mode, a small development
loader ([`scripts/local-export-server.mjs`](scripts/local-export-server.mjs)) answers two
read-only routes under `/__local-explorer/`:
- `manifest`: the file names listed in `.local-explorer/explorer-config.json`;
- `export/<n>`: the n-th listed file, addressed by index, so no path from the URL ever reaches
  the filesystem.

Its limits:
- It serves only plain, non-symlinked `*.json` files of at most 16 MiB placed directly in the
  Git-ignored `.local-explorer/`.
- It answers only loopback clients sending a loopback `Host`, and refuses cross-origin and
  cross-site requests. The `Host` check also guards against DNS rebinding.
- It is absent from `npm run dev`, from `vite preview` and from every production build, and the
  public build fails if its route name appears in the output.

The browser keeps only the chosen registered file **name** (`localStorage`), never data. You can
still open any export with the file picker. That copy lives in the tab's memory and is gone
after a reload.

The Vite server permits only the Explorer project root and binds to `127.0.0.1`. Do not
override that binding, expose the server through a tunnel, or deploy local mode.
`vite build --mode local-explorer` fails deliberately; `VITE_*` values are public configuration,
not secrets or privacy controls. The compile-time local entries are removed from public builds.

Public asset copying is disabled. [`scripts/public-assets.mjs`](scripts/public-assets.mjs)
lists only the eight previously reviewed portraits/logos; untracked additions do not enter
`dist/`. The build checks module boundaries, and `npm run privacy:test` exercises ignored
canaries, the emitted output and the local loader's refusals (17 checks). See
[image inventory and rights caveats](../docs/assets/ASSET_INVENTORY.md).

### Verify local mode with synthetic fixtures

From `explorer/`, with the documented Python, npm dependencies and local browser available:

```bash
npm run smoke:local
```

This creates synthetic tracking, metadata and two prediction CSVs, then runs the local exporter
with smooth50. It registers the export in a temporary folder (never your
`.local-explorer/explorer-config.json`). It then checks the default load, Explorer, Compare,
the missing-smooth50 view, malformed files and the setup state in the browser. It validates
local-mode behavior with synthetic inputs, not the actual private competition match.

### Prepare and register authorized data

The public exporter accepts no match inputs: it only generates its four authored scripts.
The separate [`../tools/export_local_scenario.py`](../tools/export_local_scenario.py) adapter
lets the owner crop existing authorized tracking and existing prediction CSVs without
running inference, altering predictions, using ground truth, or annotating anything.

**Real-data status:** The owner has exported and viewed a 7,500-frame window of the competition
match with this adapter, including its 46 track slots and partially missing tracking groups.
Other windows, other matches and other tracking formats are not all verified. Frame gaps are
still rejected; according to the organisers' starter documentation, the delivered file has none.

Run from the repository root in Windows PowerShell (Python 3.10; no additional dependencies):

```powershell
# Optional, once: the official smooth50 reproduction for the same match (never overwrites the submission)
python src/baseline.py --data-dir "C:\authorized" --out outputs/baseline_smooth50.csv

# One five-minute window (first half starts at video frame 11185), registered as the default
python tools/export_local_scenario.py `
  --metadata "C:\authorized\tactical\BAR-ATH_tactical_atd.xml" `
  --tracking "C:\authorized\tactical\BAR-ATH_tactical_atd.txt" `
  --predictions "outputs\submission\MAF FC.csv" `
  --baseline-predictions "outputs\baseline_smooth50.csv" `
  --start-frame 11185 --frame-count 7500 `
  --out .local-explorer\first-half-000.json --register
```

- `--predictions` is your existing Rule-Based Possession Engine CSV. The adapter only reads it.
  It does not rerun the engine or change the submission.
- `--baseline-predictions` is optional. Without it, Compare shows a single-model view and says
  what is missing.
- `--register` adds the file name to `.local-explorer/explorer-config.json` and makes it the
  default; re-register an older window to make it the default again. Export more windows
  (for example `--start-frame 18685`) to step through the match; the page's
  **Registered export** selector switches between them.
- The configuration is plain JSON you can also edit by hand:
  `{"schema": "local-explorer-config-1", "exports": ["first-half-000.json", "first-half-001.json"]}`.
  The first entry is the default.

If an export is refused, run the same command with `--diagnose` (no `--predictions` or `--out`
needed). It writes nothing and prints only element names, counts, group shapes (`finite`, `all-NaN`,
`x/y-present-speed-NaN`, `x-NaN`, `y-NaN`), and validation outcomes, never names, identifiers,
coordinates or labels:

```powershell
python tools/export_local_scenario.py --diagnose --metadata "$metadata" --tracking "$tracking" --start-frame 0 --frame-count 7500
```

Choose a new output filename on every run: the adapter never overwrites a file. It writes
only plain file names directly inside the Git-ignored repository `.local-explorer/` directory
and rejects anything else. Never put exports in `public/`, commit them, or share them
publicly. The adapter's implementation and automated tests use synthetic inputs only; real-data
checks are run by the owner on their own computer.

Inputs are normalized ATD `frame:player-groups:ball` TXT and the metadata XML's ordered
teams/player slots. The first team is home. Each group is `x,y,speed`; raw frame IDs are
one-based, whereas CSV `frame,label` IDs and `--start-frame` are zero-based. Each CSV must
be contiguous from zero with exact H/A/D/X labels. The selected tracking window must be
complete and ordered without duplicate IDs. Missing values are `NaN` (organisers' `DATA.md`).
Missing observations follow the engine's own reading (`src/possession.py` treats a group as
missing when x is NaN):
- **x or y is NaN:** the position is unavailable (`null`).
- **x and y are numbers but speed is NaN:** the position is kept and the ball's speed becomes `null`.
  Player speed is not exported.

Nothing is filled in, interpolated, forward-filled or set to zero. Missing rows, infinity,
non-numeric values, out-of-range values, wrong field counts and inconsistent slot counts fail
with a field-specific error. This adapter does not change the engine's semantics.

The JSON schema is `schemaVersion: "local-1"`, with `provenance.kind: "local-private"`,
`sourceFrameStart`, `fps`, `frameCount`, `pitch`, `teams`, `players`, `frames`,
`predictions: {name, labels}` and, **optionally**, `baseline: {name, labels}` (same length;
exports without it remain valid). Frames reuse public-schema metre positions: `ball` is
`[x,y,speed]` (speed may be `null`, unknown) or null and `players` is an ordered array of `[x,y]` or null. IDs and team names
are generic. Player names, input paths, player speeds, reference labels, scores and inferred
engine evidence are omitted, and the viewer rejects exports that carry `reference`, `models`
or `scores`. See the [TypeScript runtime validator](src/local/validate.ts) and Python adapter
for the full contract. Importing the CSVs does not independently verify which algorithm
produced them or the owner's data-use authorization.

Limits: at most **7,500 frames (five minutes at 25 fps), 64 track slots and 16 MiB per export**
(the tactical metadata has 46 track slots, per the organisers' `DATA.md`),
and 64 registered exports. Fixed 105.3 by 68 metre pitch and 25 fps; at most 2 GiB per input
file, 1 MiB metadata and 64 KiB per text line. Streams stop at the selected window's end; the
unselected tail is deliberately not validated. Memory scales with the selected window, not
full-match length; later windows still require scanning the input prefix. Other tracking
formats, frame rates and pitch dimensions require an explicit adapter change. Browser errors
identify malformed fields before displaying data.

### Comparing the Rule-Based Possession Engine with smooth50

Local Compare puts both predictions on the **same real frames**:
- side-by-side possession timelines and a prediction-agreement track;
- the share of frames on which they agree;
- every interval where they differ, with source frames, video time and duration;
- possession spells, possession changes and label changes per model;
- H/A/D/X distributions;
- nearest home and away player distances at the playhead, computed in the browser from the
  exported tracking.

**What it can establish:** where, how often and for how long the two predictions differ, and
how differently they segment possession.

**What it cannot establish:** which prediction is right. Without authorized reference labels,
the page shows no accuracy, F1, precision, recall or confusion matrix, and neither model is
treated as ground truth. Disagreement between predictions is not evaluation against reference
labels. The project's only reference-based numbers are the public five-minute results in the
root README and the synthetic scenario checks on the public Compare page.

### Troubleshooting

- **Setup instructions appear instead of match data:** no export is registered, or
  `.local-explorer/explorer-config.json` lists none that is available. The page states the
  reason. Re-run the exporter with `--register`.
- **"The local export loader is not running":** the page was opened from `npm run dev` (public
  demo). Start `npm run dev:local` instead.
- **The exporter refuses a file:** re-run it with `--diagnose` (see above). If the output file
  already exists, choose a new `--out` name; exports are never overwritten.
- **`EPERM` from Vite on Windows when starting a dev server:** `dev` and `dev:local` share the
  dependency cache in `explorer/node_modules/.vite`, and Windows can lock it (another running
  Vite server, an antivirus scan or a sync client). Stop every running Vite server, then run
  `npm run dev:local -- --force` to rebuild the cache. If the error persists, delete the cache
  from `explorer/` with `Remove-Item -Recurse -Force node_modules\.vite` and start again.
- **`npm` is blocked by the PowerShell execution policy:** use `npm.cmd` (for example
  `npm.cmd run dev:local`).

## Run

Node 22+ and npm.

```bash
cd explorer
npm ci
npm run dev        # public synthetic demo, http://127.0.0.1:5173 (dark theme by default)
npm run dev:local  # local Explorer for authorized exports (see Operating modes)
npm test           # Vitest + Testing Library
npm run typecheck  # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm run build      # typecheck + production build into dist/
npm run licenses:check  # verify exact notices in an existing dist/
npm run preview    # serve dist/
npm run smoke      # browser smoke test of dist/ (needs a local Chrome, Chromium or Edge)
npm run privacy:test # synthetic canaries, rejected private builds/imports, local loader refusals
npm run smoke:local  # synthetic adapter-to-local-viewer browser smoke test
```

No private registry, token or backend is needed.

Each production build copies the exact license files from the installed, lockfile-matched production
packages and Vite into `dist/licenses/`, plus the repository MIT license. It writes
`dist/licenses/NOTICE.txt`, linked from the app footer. The build fails if a required package
notice is missing, a version differs from the lockfile, or the emitted font set changes.
`npm run licenses:check` verifies the distributed copies byte for byte. `dist/` remains ignored;
run `npm ci` and `npm run build` to reproduce it.

### Static hosting

The build is a static single-page app, which client-side routing needs to serve correctly:
- Any host must serve `index.html` for `/explorer`, `/compare`, `/methodology` and `/team`.
- `vite preview` and most hosts can be configured to do this (an SPA rewrite). For hosts that
  only serve files, such as GitHub Pages, the build also writes `dist/404.html`, a copy of
  `index.html`, so deep links still load.
- To deploy under a sub-path, build with `npm run build -- --base=/sub-path/`; the router uses
  the same base.

### Browser smoke test

`npm run smoke` runs `scripts/browser-smoke.mjs`:
- It starts `vite preview` itself and drives the local browser with `puppeteer-core`, which
  downloads no browser.
- Set `CHROME_PATH` if the browser is not in a standard location. Add `-- --out <dir>` to choose
  where screenshots go (the default is a temporary folder).
- In a managed test environment that cannot launch sandboxed Chrome, the public smoke runner
  supports `CHROME_NO_SANDBOX=1`; this affects only the test browser launch.
- It exits 1 on any failure.

It checks:
- **Every route at 1440, 1280, 1024, 768, 720 and 375 px, in both themes:** heading, document title, active link, menu
  button visibility, no horizontal overflow, no console errors, no failed requests.
- **Navigation:** the mobile menu (open, focus, Escape, link selection), focus moving to the new
  heading, browser Back, deep links, and the `404.html` fallback.
- **Explorer:** fixture coordinates, playback, keyboard and timeline seeking, speed changes, the
  final frame, hidden tabs, panels staying in sync, scenario switching, themes, reduced motion
  and touch targets.
- **Compare:** seeking from a disagreement row, filtering, and opening the Explorer at a frame.
- **Theme:** a first visit opens dark even with an OS light preference; an explicit choice persists.
- **Methodology navigation at five widths, both themes:** two balanced rows of section links on
  wide screens, wrapped links on tablets, a "Jump to section" selector on phones. No horizontal
  scroller or clipped link, the current section highlighted while scrolling, visible keyboard focus,
  and jump targets just below the sticky bar.

## Team data

MAF FC has four members: Marc, Fahmy, Faris and Eslam. The owner confirms that all four members
permit public repository and website use of their names and supplied portraits. Their names and
links live in
[`src/team/members.ts`](src/team/members.ts); no biographies or contact details are shown.
- Photos are 400 x 500 px WebP portraits in `public/team/`, cropped from owner-supplied images with all metadata
  removed. A missing or broken photo falls back to the member's initial. The project owner supplied
  the images, but this repository contains no individual consent record covering public GitHub
  distribution and public site display.
- The grid has four columns on wide screens, two on tablets and one horizontal card per row on phones.

## Synthetic data provenance

`src/scenario/generated/` (`s1.json` to `s4.json`, plus the `index.json` manifest) is generated,
not written by hand:

```bash
python tools/export_scenarios.py          # from the repository root: regenerate
python tools/export_scenarios.py --check  # exit 1 if any generated file is stale
python -m pytest tools -q                 # exporter tests
```

The exporter, for each scenario:
1. scripts 22 players, the ball, missing observations and Smart Tagging set pieces;
2. writes them to a temporary folder in the raw ATD, metadata and Smart Tagging formats used by
   the synthetic tests;
3. runs `possession.build_labels` (default parameters) and `baseline.build_labels` on the same
   files;
4. scores both outputs against the script reference with the organisers' public scorer, vendored
   unchanged in [`../tools/vendor/`](../tools/vendor/).

It also checks that the per-frame evidence, rebuilt from the same public functions,
reproduces `build_labels` exactly.

The output is deterministic, byte for byte. It records the commit of the engine files, their
SHA-256 hashes and the scorer's source. Reference labels are written down from each script and
kept apart from the model output.

Each scenario is a separate lazily loaded chunk, so switching scenario loads only that file.

Source audit: `HOME_BASE`, `AWAY_BASE`, `PLAYERS`, `lerp_path`, `ball_xy` and `build` author
all coordinates in code. `write_inputs` authors metadata and optional Smart Tagging XML.
The project team independently authored these synthetic fixtures; no external tracking or
external labels are incorporated. Only the public format conventions, unchanged algorithms
and credited official scorer are external contributions. No dataset attribution is needed for
the invented coordinates or scripted reference labels; retain the code/scorer notices.

| Script | Frames at 25 fps | Generation and reference |
|---|---:|---|
| `S1` | 400 | Actor keyframes, carried/passed/still/missing ball phases; kickoff and throw-in tags. Explicit reference intervals distinguish pre/post graded footage, dead ball, home and away possession; the brief home touch does not change scripted ownership. |
| `S2` | 300 | Actor offsets around a scripted loose-ball path and short bursts of control; no tags. Reference remains home until the scripted away win at frame 152. |
| `S3` | 300 | Scripted carries/passes and a 100-frame ball-observation gap `[100,200)`; no tags or gap interpolation. Reference changes at the scripted tackle at frame 140, even though the ball is hidden from the algorithms. |
| `S4` | 320 | Scripted ball-out geometry, missing ball, placed ball and away throw at frame 135. An authored tag is deliberately late at `[185,215)`. Reference uses the script's throw time and geometric ball-out frame. |

`run_engines` calls `possession.build_labels` and `baseline.build_labels` (default window 50) on the
same temporary synthetic files. Its separately composed evidence trace must equal the engine
labels. `official_scores` calls the unchanged public scorer's `evaluate` against `Spec.reference`;
X reference frames are ungraded. Spell F1, macroF1, agreement and confusion matrices measure
agreement with the authored scenario reference, never real-match competition accuracy.
The stable `phase3b` schema key and recorded engine commit retain historical traceability;
the displayed name is Rule-Based Possession Engine. The rename changes no predictions.

The five generated JSON files live under `src/scenario/generated/`. Regenerate with the exact
commands above, then run `npm test` from `explorer/` to validate browser schema consumption.
The Python tests check deterministic bytes, freshness, engine calls, evidence alignment,
reference independence, scorer checksums and restricted-path exclusion.

## Structure

| Path | Purpose |
|---|---|
| `src/app/` | Routes, page titles, the URL scenario selection |
| `src/scenario/` | Types, the runtime validator, the lazy scenario registry, label helpers, comparison maths, UI-written explanations |
| `src/playback/` | The single playback reducer, the clock, the provider (one animation loop), keyboard shortcuts |
| `src/components/` | AppHeader (navigation), Pitch (SVG), Timeline, Transport, Inspector, Legend, ScenarioPanel (scenario chips), ThemeToggle, Diagrams, CompetitionStrip, Reveal, Icon, page headings and loading states |
| `src/pages/` | Home, Explorer, Compare, Methodology, Team, Not found |
| `src/team/members.ts` | The four team members (names and links) |
| `public/` | Team portraits (`team/`) and the organisers' logos (`organisers/`) |
| `src/styles/` | `tokens.css` (design tokens, both themes) and `app.css` |
| `src/local/` | Local mode only (removed from public builds): data panel and store, local Explorer and Compare, export validator, model-to-model metrics |
| `src/test/` | Vitest suites: data, playback, comparison, UI, pages, routing, theme and local mode |
| `scripts/` | Browser smoke tests, licence notices, public-build privacy checks and the local-only export loader |

Every page that plays a scenario has one `PlaybackProvider`, and every pitch, timeline and
panel on that page reads its frame. Embedding the pitch and timeline elsewhere (for example a
future Home page) only needs another provider.

**Motion:**
- Page entrances, the navigation indicator, the mobile menu, disclosures, tabs, theme changes and
  the once-only section reveals on Home use the token durations (120 ms and 240 ms).
- The playhead is never animated, so it always shows the exact frame.
- `prefers-reduced-motion: reduce` removes every transition and animation; user-started
  playback still works.

## Visual identity and licences

- **Brand:** the app is publicly branded **MAF FC** / **MAF FC Possession Explorer**. It shows no
  Motus logo or artwork, and it is not an official Motus product.
- **Styling:** the look follows the **Motus visual identity**. The owner confirms authorization
  for this project's public repository and website use; no independent grant document is included:
  - Night (dark, the default for every first visit) and Floodlight (light, kept once chosen) themes, Volt accent;
  - Space Grotesk and Inter;
  - Motus spacing, radii, control sizes, motion and control conventions.
- **Where the values live:** they are re-stated in `src/styles/tokens.css`, whose header lists
  which values are Motus-derived and which are MAF FC originals. No Motus Design System source,
  component, icon, logo or font file is copied or installed.
- **Licence scope:** the Motus-derived values are not covered by this repository's MIT licence.
- **MAF FC originals:** the possession data colours (H/A/D/X), pitch colours and all
  application code.
- **Icons:** [`lucide-react`](https://lucide.dev) line icons, ISC licence. Icons are decorative and
  always sit next to a visible label.
- **Competition context:** the attribution sentence follows the organisers' official repository.
  The Metrica Sports, Barça Innovation Hub and Mobile World Capital Barcelona logos in
  `public/organisers/` were supplied by the project owner, who confirms authorization for their
  intended public repository and website use. They are shown unmodified on a black plate, each
  linking to the organiser's official site. They belong to their owners, are not covered by this
  repository's MIT licence, and do not imply endorsement of MAF FC.
- **Fonts:** Inter and Space Grotesk, from the public
  [`@fontsource-variable`](https://fontsource.org) npm packages, under the SIL Open Font Licence
  1.1. The licence texts ship in those packages.
- **Official scorer:** `tools/vendor/possession_metrics.py`, MIT, © 2026-2027 Metrica Sports; see
  `tools/vendor/README.md`.
- **Code:** MIT (see [`../LICENSE`](../LICENSE)). The repository MIT licence does not license
  the portraits, organiser artwork or Motus-derived styling values.

### Owner-confirmed public-use permissions

The owner explicitly confirms public repository distribution and website display of the four
team members' names and supplied portraits, intended public repository and website use of the
four organiser logo files, and project use of the Motus-derived styling. These are owner-provided
confirmations; the independent referee has not inspected signed grants, and no such documents are
included here. The portraits, organiser artwork and Motus-derived styling remain outside the
repository's MIT license. No Motus package, logo, artwork, component, icon or font file is bundled.
