import { useState, type CSSProperties } from 'react';
import { assetUrl } from '../app/assets';

interface LogoFile {
  file: string;
  /** Intrinsic size of the supplied file, and the display height that balances it optically. */
  width: number;
  height: number;
  displayHeight: number;
}

/** How a logo is presented directly on the header background, per theme. Presentation only:
 *  the files themselves are never edited.
 *  - `screen` (Night): blends the file's own pure-black background into the dark header.
 *  - `mono-dark` (Floodlight): shows a one-colour white logo in black. */
type Presentation = 'screen' | 'mono-dark';

export interface Organiser extends LogoFile {
  name: string;
  href: string;
  /** An owner-supplied alternative file for the light (Floodlight) header. */
  lightFile?: LogoFile;
  night?: Presentation;
  floodlight?: Presentation;
}

/** Logos are the owner-supplied files in public/organisers/, used unmodified. In the competition
 *  strip they sit on a black plate. In the header they sit directly on the bar's background:
 *  - Metrica Sports: the only file has a pure-black background built in. In Night it is blended
 *    away; in Floodlight it keeps its black background (no transparent variant was supplied).
 *  - Barça Innovation Hub: white-text file in Night, the supplied dark-text file in Floodlight.
 *  - Mobile World Capital Barcelona: a one-colour white logo, shown in black in Floodlight.
 *  Destinations: the official sites linked from the organisers' repository, and the Barça
 *  Innovation Hub's own site on the fcbarcelona.com domain. */
export const ORGANISERS: readonly Organiser[] = [
  {
    name: 'Metrica Sports', href: 'https://metrica-sports.com',
    file: 'organisers/metrica-sports.webp', width: 345, height: 108, displayHeight: 56,
    night: 'screen',
  },
  {
    name: 'Barça Innovation Hub', href: 'https://barcainnovationhub.fcbarcelona.com',
    file: 'organisers/barca-innovation-hub.webp', width: 345, height: 108, displayHeight: 56,
    // Content fills 54% of this file's height against 65% of the white-text file's: 68 px matches 56 px.
    lightFile: { file: 'organisers/barca-innovation-hub-dark-text.png', width: 1926, height: 627, displayHeight: 68 },
  },
  {
    name: 'Mobile World Capital Barcelona', href: 'https://www.mwcbarcelona.com',
    file: 'organisers/mobile-world-capital-barcelona.webp', width: 300, height: 99, displayHeight: 40,
    floodlight: 'mono-dark',
  },
];

function LogoImage({ name, f, scale, eager, className, onError }: {
  name: string; f: LogoFile; scale: number; eager: boolean; className: string; onError: () => void;
}) {
  const h = Math.round(f.displayHeight * scale);
  return (
    <img
      className={`organiser-logo ${className}`.trim()}
      src={assetUrl(f.file)}
      alt={name}
      width={Math.round((f.width * h) / f.height)}
      height={h}
      style={{ '--logo-h': `${h}px` } as CSSProperties}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={onError}
    />
  );
}

/** One organiser logo link; if an image cannot load, the organiser's name is shown as text.
 *  `scale` shrinks every logo by the same factor, so their optical balance is kept. With
 *  `themed`, the logo is prepared for the header background of each theme; when a theme uses a
 *  different file, both are rendered and CSS displays the one for the current theme (the other
 *  is display: none, so the link always has exactly one visible, named image). */
function OrganiserLogo({ org, scale, eager, themed }: { org: Organiser; scale: number; eager: boolean; themed: boolean }) {
  const [failed, setFailed] = useState(false);
  const fail = () => setFailed(true);
  const presentation = themed
    ? [org.night && `logo-night-${org.night}`, org.floodlight && `logo-floodlight-${org.floodlight}`].filter(Boolean).join(' ')
    : '';
  return (
    <a className="organiser-link" href={org.href} rel="noreferrer">
      {failed
        ? <span className="organiser-name">{org.name}</span>
        : themed && org.lightFile
          ? (
            <>
              <LogoImage name={org.name} f={org} scale={scale} eager={eager} className={`logo-for-night ${presentation}`} onError={fail} />
              <LogoImage name={org.name} f={org.lightFile} scale={scale} eager={eager} className="logo-for-floodlight" onError={fail} />
            </>
          )
          : <LogoImage name={org.name} f={org} scale={scale} eager={eager} className={presentation} onError={fail} />}
    </a>
  );
}

/** The three organiser logos as a labelled list of links. Without `themed` (the competition
 *  strip) they sit on a black plate; with it (the header) they sit on the header background. */
export function OrganiserLogos({ className, label = 'Competition organisers', scale = 1, eager = false, themed = false }: {
  className: string;
  label?: string;
  scale?: number;
  eager?: boolean;
  themed?: boolean;
}) {
  return (
    <ul className={`${themed ? 'organiser-group' : 'organiser-plate'} ${className}`} aria-label={label}>
      {ORGANISERS.map((org) => <li key={org.name}><OrganiserLogo org={org} scale={scale} eager={eager} themed={themed} /></li>)}
    </ul>
  );
}
