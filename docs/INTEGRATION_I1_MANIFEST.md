# I2.1 release-candidate integration inventory

Release-candidate worktree: `maf-fc-release-candidate`; branch `integration/release-candidate`.
The benchmark and Explorer branches were integrated with normal `--no-ff` merge commits
from frozen main `ff686e3`. The reviewed I1 worktree remains the unchanged comparison reference.
`README.md` and `docs/TECHNICAL_DOCUMENT.md` also contain two small I1 pointers to the synthetic React Explorer.
`tools/vendor/README.md` clarifies that its upstream SHA-256 is checked after normalizing Windows
CRLF to LF; the scorer implementation is unchanged.
This inventory originated as an I1-only file and is tracked in the release candidate.
I2.1 also corrects the full-suite setup and test scope in the root README and technical document,
and clarifies unresolved Explorer publication rights. Those documentation corrections do not
change the competition engine.

## External benchmark (`9c64651`): 22 paths

- `.gitignore`
- `README.md`
- `benchmark/compare.py`
- `benchmark/idsse_adapter.py`
- `benchmark/idsse_benchmark.py`
- `benchmark/setup_official.py`
- `benchmark/skillcorner_adapter.py`
- `benchmark/synthetic_case.json`
- `docs/EXTERNAL_BENCHMARK_E0.md`
- `docs/IDSSE_ADAPTER_E1C_C.md`
- `docs/IDSSE_AUDIT_E1C_D.md`
- `docs/IDSSE_BENCHMARK_E1D_B.md`
- `docs/IDSSE_FEASIBILITY_E1C_B.md`
- `docs/IDSSE_LABEL_SPEED_E1D_A.md`
- `docs/SKILLCORNER_E1A.md`
- `docs/SKILLCORNER_E1B.md`
- `docs/SKILLCORNER_E1C_A.md`
- `docs/TECHNICAL_DOCUMENT.md`
- `tests/test_external_benchmark.py`
- `tests/test_idsse_adapter.py`
- `tests/test_idsse_benchmark.py`
- `tests/test_skillcorner_adapter.py`

## React Explorer (`0cba496`): 79 paths

- `design-explorations/_brand.md`
- `design-explorations/_template.html`
- `design-explorations/possession-explorer.html`
- `design-explorations/possession-explorer.manifest.md`
- `design-explorations/ui3a-direction.html`
- `explorer/.gitignore`
- `explorer/README.md`
- `explorer/index.html`
- `explorer/package-lock.json`
- `explorer/package.json`
- `explorer/public/organisers/barca-innovation-hub-dark-text.png`
- `explorer/public/organisers/barca-innovation-hub.webp`
- `explorer/public/organisers/metrica-sports.webp`
- `explorer/public/organisers/mobile-world-capital-barcelona.webp`
- `explorer/public/team/eslam.webp`
- `explorer/public/team/fahmy.webp`
- `explorer/public/team/faris.webp`
- `explorer/public/team/marc.webp`
- `explorer/scripts/browser-smoke.mjs`
- `explorer/src/App.tsx`
- `explorer/src/app/assets.ts`
- `explorer/src/app/routing.ts`
- `explorer/src/components/AppHeader.tsx`
- `explorer/src/components/CompetitionStrip.tsx`
- `explorer/src/components/Diagrams.tsx`
- `explorer/src/components/Icon.tsx`
- `explorer/src/components/Inspector.tsx`
- `explorer/src/components/Legend.tsx`
- `explorer/src/components/Organisers.tsx`
- `explorer/src/components/PageHeading.tsx`
- `explorer/src/components/Pitch.tsx`
- `explorer/src/components/Reveal.tsx`
- `explorer/src/components/ScenarioPanel.tsx`
- `explorer/src/components/ScenarioStatus.tsx`
- `explorer/src/components/ThemeToggle.tsx`
- `explorer/src/components/Timeline.tsx`
- `explorer/src/components/Transport.tsx`
- `explorer/src/main.tsx`
- `explorer/src/pages/ComparePage.tsx`
- `explorer/src/pages/ExplorerPage.tsx`
- `explorer/src/pages/HomePage.tsx`
- `explorer/src/pages/MethodologyPage.tsx`
- `explorer/src/pages/NotFoundPage.tsx`
- `explorer/src/pages/TeamPage.tsx`
- `explorer/src/playback/PlaybackProvider.tsx`
- `explorer/src/playback/clock.ts`
- `explorer/src/playback/reducer.ts`
- `explorer/src/playback/useKeyboardShortcuts.ts`
- `explorer/src/scenario/compare.ts`
- `explorer/src/scenario/explain.ts`
- `explorer/src/scenario/generated/index.json`
- `explorer/src/scenario/generated/s1.json`
- `explorer/src/scenario/generated/s2.json`
- `explorer/src/scenario/generated/s3.json`
- `explorer/src/scenario/generated/s4.json`
- `explorer/src/scenario/interpretation.ts`
- `explorer/src/scenario/labels.ts`
- `explorer/src/scenario/scenarios.ts`
- `explorer/src/scenario/types.ts`
- `explorer/src/scenario/validate.ts`
- `explorer/src/styles/app.css`
- `explorer/src/styles/tokens.css`
- `explorer/src/team/members.ts`
- `explorer/src/test/compare.test.ts`
- `explorer/src/test/data.test.ts`
- `explorer/src/test/history.test.tsx`
- `explorer/src/test/pages.test.tsx`
- `explorer/src/test/playback.test.tsx`
- `explorer/src/test/setup.ts`
- `explorer/src/test/ui.test.tsx`
- `explorer/src/test/ui3b.test.tsx`
- `explorer/src/test/util.tsx`
- `explorer/tsconfig.json`
- `explorer/vite.config.ts`
- `tools/export_scenarios.py`
- `tools/test_export_scenarios.py`
- `tools/vendor/LICENSE-metrica.txt`
- `tools/vendor/README.md`
- `tools/vendor/possession_metrics.py`

## I1-only path

- `docs/INTEGRATION_I1_MANIFEST.md`
