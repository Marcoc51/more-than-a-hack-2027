# MAF FC Possession Explorer

An interactive viewer for frame-by-frame football possession (`H` home, `A` away, `D` dead ball,
`X` no answer). It plays synthetic tracking on a 2D pitch and shows, frame by frame, the labels of
the **MAF FC Phase 3B** engine and of the **official smooth50 baseline**, both computed by the
unchanged Python code in [`../src`](../src).

**Synthetic data only.** Every scenario is scripted in [`../tools/export_scenarios.py`](../tools/export_scenarios.py).
No competition data, video, ground truth or match prediction is read, bundled or reconstructed.

## Run

Node 22+ and npm.

```bash
cd explorer
npm ci
npm run dev        # http://localhost:5173
npm test           # Vitest + Testing Library
npm run typecheck  # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm run build      # typecheck + production build into dist/
npm run preview    # serve dist/
npm run smoke      # browser smoke test of dist/ (needs a local Chrome, Chromium or Edge)
```

No private registry, token or backend is needed.

`npm run smoke` runs `scripts/browser-smoke.mjs`. It starts `vite preview` itself and drives the
local browser with `puppeteer-core`, which downloads no browser. Set `CHROME_PATH` if the browser
is not in a standard location; add `-- --out <dir>` to choose where screenshots go (the default
is a temporary folder). At 1440, 1280 and 375 px it checks:
- loading, console errors and failed requests;
- players and ball drawn at the fixture coordinates;
- play, pause and restart; arrow and Shift+arrow steps;
- scrubbing, and keyboard, mouse and touch timeline seeking;
- changing speed while playing; stopping at the end; pausing on a hidden tab;
- reduced motion, both themes, and that every panel shows the same frame;
- no horizontal overflow.

It exits 1 on any failure.

## Data

`src/scenario/generated/s1.json` is generated, not written by hand:

```bash
python tools/export_scenarios.py          # from the repository root: regenerate
python tools/export_scenarios.py --check  # exit 1 if the committed JSON is stale
python -m pytest tools -q                 # exporter tests
```

The exporter:
1. scripts a 22-player scenario;
2. writes it to a temporary folder in the raw ATD, metadata and Smart Tagging formats used by the
   synthetic tests;
3. runs `possession.build_labels` (default parameters) and `baseline.build_labels`.

The per-frame evidence comes from the same public functions that `build_labels` composes. The
export checks that this composition reproduces `build_labels` exactly.

The output is deterministic, byte for byte. It records the commit of the engine files and their
SHA-256 hashes. Reference labels are written down from the scenario script and kept apart from
the model output.

## Structure

| Path | Purpose |
|---|---|
| `src/scenario/` | Scenario types, the runtime validator, label helpers, UI-written explanation text, the scenario registry |
| `src/playback/` | The single playback reducer, the clock, the provider (one animation loop), keyboard shortcuts |
| `src/components/` | Pitch (SVG), Timeline, Transport, Inspector, Legend, ScenarioPanel, ThemeToggle |
| `src/pages/ExplorerPage.tsx` | The Explorer workspace |
| `src/styles/` | `tokens.css` (design tokens, both themes) and `app.css` |
| `src/test/` | Vitest suites: data, playback, UI |

Every component reads the frame from one `PlaybackProvider`. To embed the pitch and timeline
elsewhere (for example a future Home page), wrap them in their own provider.

## Visual identity, licences and publication status

- **Brand:** the app is publicly branded **MAF FC** / **MAF FC Possession Explorer**. It shows no
  Motus logo, name or artwork, and it is not an official Motus product.
- **Styling:** the look follows the **Motus visual identity**: Night (dark, default) and
  Floodlight (light) themes, Volt accent, Space Grotesk and Inter, Motus spacing, radii, control
  sizes, motion and control conventions.
  - The values are re-stated by hand in `src/styles/tokens.css`, whose header lists exactly
    which values are Motus-derived and which are MAF FC originals.
  - No Motus Design System source, component, icon, logo or font file is copied or installed.
    The package is private, and public reviewers could not install it.
- **Publication status: pending.**
  - The project owner authorised the Motus visual identity for this app.
  - Explicit permission to publish the Motus-derived values in a public repository has not yet
    been confirmed by the Motus/Youth of Future rights holder. The design system is
    `UNLICENSED`, and its decision record 0007 limits approval to restricted private use.
  - Until that is confirmed, keep this branch unpublished.
  - The Motus-derived values are not covered by this repository's MIT licence.
- **MAF FC originals:** the possession data colours (H/A/D/X), pitch colours and all
  application code.
- **Fonts:** Inter and Space Grotesk, from the public
  [`@fontsource-variable`](https://fontsource.org) npm packages, under the SIL Open Font Licence
  1.1. The licence texts ship in those packages.
- **Code:** MIT (see [`../LICENSE`](../LICENSE)).
