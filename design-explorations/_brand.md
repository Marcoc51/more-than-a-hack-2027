# MAF FC — provisional brand (explore-design init, UI0)

> **Superseded for the application (UI1).** After UI0, the project owner chose the **Motus
> visual identity** for the MAF FC Possession Explorer. That covers Motus colours, typography,
> Night/Floodlight themes and styling conventions, with **MAF FC** as the only public brand and
> **no Motus logo**. The project owner reports Motus agreement; no public-distribution grant is
> recorded in this repository. The app's tokens now live in
> `explorer/src/styles/tokens.css`, whose header lists which values are Motus-derived.
>
> The palette below is the independent provisional palette used only for the UI0 exploration
> page (`possession-explorer.html`). It is kept as the record of that exploration, unchanged.

Status: **provisional, for design exploration only.** Not an approved identity. No logo is defined;
the mark is the typographic wordmark "MAF FC".

## Why provisional values

The preferred foundation, the Motus Design System, is `private` and `UNLICENSED` (package.json,
commit 1fd5127), its artwork is proprietary, and decision 0007 limits approval to restricted
private Motus use. Its token values, names, logo and icons are therefore **not** used here. Only
generic conventions (4 px spacing, radius steps, 2 px focus ring, 120/240 ms motion) are followed;
these are common practice, not Motus property.

## Typography

| Role | Stack | Licence |
|---|---|---|
| Display / headings | "Space Grotesk", "Segoe UI", system-ui, sans-serif | OFL 1.1 (load from upstream/Fontsource later, not from the Motus repo) |
| Body | "Inter", "Segoe UI", system-ui, sans-serif | OFL 1.1 |
| Data / mono | "JetBrains Mono", ui-monospace, Consolas, monospace | OFL 1.1 |

The exploration file loads no web fonts; it falls back to system fonts.

## Colour (MAF FC values, chosen for this exploration)

| Token | Value | Use |
|---|---|---|
| `--maf-paper` | `#F5F3EE` | page background (light chrome) |
| `--maf-surface` | `#FFFFFF` | cards |
| `--maf-ink` | `#16191D` | text |
| `--maf-muted` | `#5D6470` | secondary text |
| `--maf-rule` | `#DAD6CD` | borders |
| `--maf-green` | `#0F6B4A` | brand accent (pitch green) |
| `--maf-gold` | `#B5841A` | secondary accent, highlights |
| `--maf-pitch` | `#2F7A52` / lines `#E9F3EC` | pitch surface |

### Possession states (data colours, never brand)

| Label | Meaning | Fill | Non-colour cue |
|---|---|---|---|
| H | home possession | `#2563C9` | letter "H", solid |
| A | away possession | `#C2511B` | letter "A", solid |
| D | dead ball | `#5B6472` | letter "D", dotted texture |
| X | no answer / ungraded | `#ECE9E2` | letter "X", diagonal hatch |

Blue/orange is distinguishable under common colour-vision deficiencies; each state also carries a
letter and a texture, so colour is never the only cue.

## Shape and motion

Spacing 4 px base · radius 6 / 10 / 16 · focus ring 2 px `--maf-green` with 2 px offset ·
motion 120 ms / 240 ms ease-out, disabled under `prefers-reduced-motion`.

## Voice

Plain, evidence-first, no performance claims. Every number shown must come from code, tests or
synthetic fixtures. Synthetic data is always labelled as synthetic.
