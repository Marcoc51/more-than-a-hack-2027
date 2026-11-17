# Explorer image audit

Audited 17 November 2026 against the existing public image references in
[`Organisers.tsx`](../../explorer/src/components/Organisers.tsx) and
[`members.ts`](../../explorer/src/team/members.ts). All files were visually inspected,
decoded with Pillow, and checked for metadata and byte-identical duplicates. No source
images were moved, edited, staged or deleted.

## Established public assets

These eight files retain their current references and filenames. Existing
[owner-confirmed permissions](../../explorer/README.md#owner-confirmed-public-use-permissions)
cover this project's public repository and site use; no independent grant was inspected.
The images are outside the software MIT license and do not imply endorsement.

| Path under `explorer/public/` | Size (px) | Bytes | Purpose |
|---|---:|---:|---|
| `team/marc.webp` | 400 × 500 | 17,350 | Marc team card |
| `team/fahmy.webp` | 400 × 500 | 11,562 | Fahmy team card |
| `team/faris.webp` | 400 × 500 | 19,576 | Faris team card |
| `team/eslam.webp` | 400 × 500 | 14,276 | Eslam team card |
| `organisers/metrica-sports.webp` | 345 × 108 | 3,354 | Metrica organiser logo |
| `organisers/barca-innovation-hub.webp` | 345 × 108 | 6,262 | Barça organiser logo, dark theme |
| `organisers/barca-innovation-hub-dark-text.png` | 1926 × 627 | 42,426 | Barça organiser logo, light theme |
| `organisers/mobile-world-capital-barcelona.webp` | 300 × 99 | 6,692 | Mobile World Capital organiser logo |

## New, untracked owner-supplied files

All seven remain unchanged at their supplied paths and are excluded from the public
build's explicit asset list. None is needed to preserve the existing Explorer.
No event or Barcelona photographs were found among these additions.

| Path under `explorer/public/` | Size (px) | Bytes | Classification and disposition |
|---|---:|---:|---|
| `organisers/8cba8190-75ba-4796-aa4f-5525dc871627.webp` | 345 × 108 | 3,354 | Unused, byte-identical to `metrica-sports.webp`; retain established reference |
| `organisers/Barca Innovation Hub Logo.webp` | 345 × 108 | 6,262 | Unused, byte-identical to `barca-innovation-hub.webp`; retain established reference |
| `organisers/GSMA_MWC_LogoLockup_White_RGB (1).webp` | 300 × 99 | 6,692 | Unused, byte-identical to `mobile-world-capital-barcelona.webp`; retain established reference |
| `organisers/bar-a-innovation-hub-logo.png` | 1926 × 627 | 42,426 | Unused, byte-identical to `barca-innovation-hub-dark-text.png`; retain established reference |
| `organisers/IOix5pWFmBpAmyPocyO6Pv06NBs.avif` | 605 × 605 | 7,760 | Unused Metrica symbol variant; no documented need or explicit extension of public-use permission to this file |
| `organisers/mobile-world-capital-logo-new-400x200.avif` | 240 × 120 | 4,841 | Unused dark Mobile World Capital wordmark variant; no documented need or explicit extension of public-use permission to this file |
| `team/Mohamed.jfif` | 400 × 400 | 28,629 | Unused alternate framing of an already supplied portrait; no requested replacement, member mapping or explicit extension of public-use permission to this source file |

Four additions are exact duplicates, not new public uses. For the other three, the
owner should confirm the intended placement and the scope of public redistribution
permission before inclusion. A filename or brand appearance alone is not a license.
No new third-party image is represented as MIT licensed.

## Metadata and integrity

No EXIF, GPS, XMP, embedded comments or unrelated private content was found in the
decoded images. The PNGs contain only 300-dpi density metadata; the JPEG contains JFIF
version/density/progressive markers; the WebPs contain loop/background decode
properties; the AVIFs expose no additional metadata through Pillow. This is a metadata
inspection, not an independent rights investigation. The new portrait includes a
normal indoor background and a phone; nothing was redacted or altered.

SHA-256 for the seven additions (the four exact duplicates were also compared with
their established counterparts):

```text
3d7bf2a252ff0ac1d80e7876b0bb47c1a799ad06aca66dad608cf66e5a1509a8  8cba8190-75ba-4796-aa4f-5525dc871627.webp
5d356f217204922f096f2958c57fc1212f334792cb56335fb7556b2eeab4361f  Barca Innovation Hub Logo.webp
009d574d4e3a399f87d5c2c258f5b5dca51a551e2c97b2da8a378745ef2b7e49  GSMA_MWC_LogoLockup_White_RGB (1).webp
eb1255ade6bee2472de491af5607385477a5b2a2ebd64a364316a5a9b636b79a  bar-a-innovation-hub-logo.png
d7e925a61b80b0e3a63001833dc0159b5bc7cc420b1616186f044082d0891478  IOix5pWFmBpAmyPocyO6Pv06NBs.avif
8e1f754b7ff334b6b1fa9a4ca29c9360f0e118940c6e3002e5ac3ea61444dffe  mobile-world-capital-logo-new-400x200.avif
f688cfcf54ab3d83c33f5259a9950c6469dcec1ebea613721d68eab7076ef4ed  Mohamed.jfif
```

## Documentation-only vector

[`possession-architecture.svg`](possession-architecture.svg) is a new, self-contained
editable vector diagram with selectable text and no embedded images, fonts, scripts
or remote resources. It follows the existing Explorer palette and general layout
language, with system-font fallbacks. The Motus-derived palette follows the existing
project-specific styling permission and remains outside the repository's MIT license.
There is no external brand artwork. Its purpose is architecture documentation, not a
new Explorer asset or an inference component.
