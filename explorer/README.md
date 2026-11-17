# MAF FC Possession Explorer

An interactive viewer for frame-by-frame football possession (`H` home, `A` away, `D` dead ball,
`X` no answer). It plays synthetic tracking on a 2D pitch. Frame by frame, it shows the labels of
the **MAF FC Phase 3B** engine and of the **official smooth50 baseline**, both computed by the
unchanged Python code in [`../src`](../src), and compares them with each scenario's scripted
reference.

**Synthetic data only.** Every scenario is scripted in [`../tools/export_scenarios.py`](../tools/export_scenarios.py).
No competition data, video, ground truth or match prediction is read, bundled or reconstructed.

## Pages

| Route | What it does |
|---|---|
| `/` | Home: the problem, a working mini-Explorer on S1 (its own playback), entry points, facts, and the competition context with the organisers' logos |
| `/explorer` | The analysis workspace: pitch, playback, five timeline tracks and the frame inspector |
| `/compare` | Phase 3B and smooth50 against the scripted reference: frame agreement, official synthetic spellF1/macroF1, a comparison timeline, disagreement intervals, label counts and confusion matrices |
| `/methodology` | How the engine works, with three diagrams, how it differs from smooth50, its parameters and limitations, and how to reproduce everything |
| `/team` | The four MAF FC members, with photos and LinkedIn and GitHub links (see "Team data" below) |

- Unknown paths show a "Page not found" page.
- The selected scenario lives in the URL (`?scenario=s2`), so it carries across pages and links
  can be shared. `?frame=N` opens the Explorer at a frame.

## Scenarios

| ID | Title | What it shows |
|---|---|---|
| S1 | Kickoff, ball out, throw-in | Pre-match footage, a tagged kickoff, a ball out of play, a tagged throw-in, a brief opposing touch, ungraded frames |
| S2 | Contested loose ball | A 60-frame scramble with short bursts of control for both teams before away wins the ball |
| S3 | Ball tracking lost | 100 untracked ball frames, with an away tackle hidden inside the gap |
| S4 | Mistimed restart tag | A throw-in whose Smart Tagging tag is placed 50 frames late, over live play |

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

## Team data

MAF FC has four members: Marc, Fahmy, Faris and Eslam. Their names and links, approved by the project owner, live in
[`src/team/members.ts`](src/team/members.ts); no biographies or contact details are shown.
- Photos are 400 x 500 px WebP portraits in `public/team/`, cropped from owner-supplied images with all metadata
  removed. A missing or broken photo falls back to the member's initial. The project owner supplied
  the images, but this repository contains no individual consent record covering public GitHub
  distribution and public site display.
- The grid has four columns on wide screens, two on tablets and one horizontal card per row on phones.

## Data

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

Each scenario is a separate lazily loaded chunk, so switching scenario downloads only that file.

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
| `src/test/` | Vitest suites: data, playback, comparison, UI, pages and routing |
| `scripts/` | The browser smoke test |

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
- **Styling:** the look follows the **Motus visual identity**. The project owner reports Motus
  permission, but this repository contains no grant specifying public GitHub or deployment scope:
  - Night (dark, default) and Floodlight (light) themes, Volt accent;
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
  `public/organisers/` were supplied by the project owner for this use and are shown unmodified on a
  black plate, each linking to the organiser's official site. They belong to their owners, are not
  covered by this repository's MIT licence, and do not imply endorsement of MAF FC. Public event
  branding or attribution guidance is not, by itself, a grant to redistribute these artwork files;
  no such grant is recorded in this repository.
- **Fonts:** Inter and Space Grotesk, from the public
  [`@fontsource-variable`](https://fontsource.org) npm packages, under the SIL Open Font Licence
  1.1. The licence texts ship in those packages.
- **Official scorer:** `tools/vendor/possession_metrics.py`, MIT, © 2026-2027 Metrica Sports; see
  `tools/vendor/README.md`.
- **Code:** MIT (see [`../LICENSE`](../LICENSE)). The repository MIT licence does not license
  the portraits, organiser artwork or Motus-derived styling values.

### Publication rights still to verify

No independent permission records for the four portraits, four organiser logo files or
Motus-derived visual identity are included here. The relevant paths are:

- `public/team/{marc,fahmy,faris,eslam}.webp`: obtain each person's consent to both public
  repository distribution and public site display, plus rights from the photographer or source.
  If unavailable, remove the images and use the existing initial-letter fallback.
- `public/organisers/{metrica-sports.webp,barca-innovation-hub.webp,barca-innovation-hub-dark-text.png,mobile-world-capital-barcelona.webp}`:
  obtain artwork redistribution/display permission from the rights holders, or use text links
  and the existing text fallback.
- `src/styles/tokens.css`, the Motus-derived conventions in `src/styles/app.css`, and
  `../design-explorations/{_brand.md,ui3a-direction.html}`: confirm that Motus's grant covers
  the selected identity and public distribution. If it does not, replace the Motus-specific
  palette, theme names and token selection with independently chosen MAF FC values while
  keeping the functional layout, navigation and openly licensed fonts/icons.

Ordinary spacing, focus, layout and motion ideas implemented independently do not require
installing Motus code. No Motus package, logo, artwork, component, icon or font file is bundled.
Do not publish or deploy the current artwork and Motus-derived identity until the required
scope is documented.
