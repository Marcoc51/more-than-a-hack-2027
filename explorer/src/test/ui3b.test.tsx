import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { App } from '../App';
import { ComparePage } from '../pages/ComparePage';
import { ExplorerPage } from '../pages/ExplorerPage';
import { HomePage } from '../pages/HomePage';
import { TeamPage } from '../pages/TeamPage';
import { summarize } from '../scenario/compare';
import { TEAM_MEMBERS } from '../team/members';
import { S1, S3, S4, renderApp, renderLoaded } from './util';

const readouts = () => screen.getAllByTestId('readout').map((r) => r.textContent ?? '');

describe('Home page and mini-Explorer', () => {
  it('shows the value proposition, entry points, competition strip and facts', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: /Possession, frame by frame/ })).toBeInTheDocument();
    const entries = screen.getByRole('navigation', { name: 'Explore the project' });
    expect(within(entries).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/explorer', '/compare', '/methodology']);
    expect(screen.getByText(/not a measure of competition performance/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Built for More than a Hack 2027' })).toBeInTheDocument();
  });

  it('runs a real, working mini-Explorer on synthetic S1', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const mini = await screen.findByTestId('mini-explorer');
    await within(mini).findByTestId('readout');
    expect(within(mini).getByTestId('readout').textContent).toContain('Frame 120 ');
    expect(within(mini).getAllByTestId(/^player-/)).toHaveLength(S1.frames[120]!.players.filter(Boolean).length);   // S1 frame 120: away #7 occluded
    expect(within(mini).getByTestId('track-phase3b')).toBeInTheDocument();
    expect(within(mini).queryByTestId('track-evidence')).toBeNull();    // mini variant: model tracks only
    await user.click(within(mini).getByRole('button', { name: 'Next frame' }));
    expect(within(mini).getByTestId('readout').textContent).toContain('Frame 121 ');
    await user.click(within(mini).getByRole('button', { name: 'Play' }));
    expect(within(mini).getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not take over page-wide keys (Space keeps scrolling Home)', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const mini = await screen.findByTestId('mini-explorer');
    await within(mini).findByTestId('readout');
    await user.keyboard('{ArrowRight} ');
    expect(within(mini).getByTestId('readout').textContent).toContain('Frame 120 ');
    expect(within(mini).getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('keeps its playback independent from a full Explorer instance on the same data', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/explorer?scenario=s1']}><HomePage /><ExplorerPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByTestId('readout')).toHaveLength(2));
    const [mini, full] = readouts();
    expect(mini).toContain('Frame 120 ');
    expect(full).toContain('Frame 0 ');
    await user.click(within(screen.getByTestId('mini-explorer')).getByRole('button', { name: 'Next frame' }));
    expect(readouts()[0]).toContain('Frame 121 ');
    expect(readouts()[1]).toContain('Frame 0 ');         // the full Explorer did not move
  });
});

describe('competition identity', () => {
  it('names the three organisers, shows their logos as labelled links to official sites, and disclaims endorsement', async () => {
    renderApp('/');
    const strip = await screen.findByRole('region', { name: 'Built for More than a Hack 2027' });
    expect(strip.textContent).toMatch(/Organised by Metrica Sports, FC Barcelona through the Barça Innovation Hub,\s+and the Mobile World Capital Barcelona, at the Talent Arena, Barcelona/);
    const logos = within(strip).getByRole('list', { name: 'Competition organisers' });
    const links = within(logos).getAllByRole('link');
    expect(links.map((a) => [a.getAttribute('href'), a.querySelector('img')?.getAttribute('alt'), a.querySelector('img')?.getAttribute('src')])).toEqual([
      ['https://metrica-sports.com', 'Metrica Sports', '/organisers/metrica-sports.webp'],
      ['https://barcainnovationhub.fcbarcelona.com', 'Barça Innovation Hub', '/organisers/barca-innovation-hub.webp'],
      ['https://www.mwcbarcelona.com', 'Mobile World Capital Barcelona', '/organisers/mobile-world-capital-barcelona.webp'],
    ]);
    for (const a of links) expect(a).toHaveAccessibleName(/\w/);
    expect(within(strip).getByRole('link', { name: 'Official challenge repository' })).toHaveAttribute('href', 'https://github.com/metrica-sports/more-than-a-hack-2027');
    expect(strip.textContent).toMatch(/do not imply their endorsement/);
    expect(strip.textContent).not.toMatch(/sponsor|partner/i);
  });

  it('falls back to the organiser name in text when a logo cannot load', async () => {
    renderApp('/');
    const strip = await screen.findByRole('region', { name: 'Built for More than a Hack 2027' });
    fireEvent.error(within(strip).getByRole('img', { name: 'Metrica Sports' }));
    const link = within(strip).getByRole('link', { name: 'Metrica Sports' });
    expect(link.querySelector('img')).toBeNull();
    expect(link).toHaveAttribute('href', 'https://metrica-sports.com');
  });
});

const APPROVED = [
  ['Marc', 'https://www.linkedin.com/in/marc-sanad/', 'https://github.com/Marcoc51'],
  ['Fahmy', 'https://www.linkedin.com/in/mohamed-atef-fahmy-khalil/', 'https://github.com/Muhammadatef'],
  ['Faris', 'https://www.linkedin.com/in/faris-ali-352077201/', 'https://github.com/farisali21'],
  ['Eslam', 'https://www.linkedin.com/in/eslamkhafagy505/', 'https://github.com/eslamkhafagy505'],
] as const;

describe('Team page', () => {
  it('has exactly four members: Marc, Fahmy, Faris and Eslam', () => {
    expect(TEAM_MEMBERS.map((m) => m.name)).toEqual(['Marc', 'Fahmy', 'Faris', 'Eslam']);
  });

  it('renders exactly four cards with the approved names, links and photos', () => {
    render(<MemoryRouter><TeamPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Team' })).toBeInTheDocument();
    expect(screen.getByText(/MAF FC is a team of four/)).toBeInTheDocument();
    const cards = within(screen.getByRole('list', { name: 'Team members' })).getAllByRole('listitem');
    expect(cards).toHaveLength(4);
    cards.forEach((card, i) => {
      const [name, linkedin, github] = APPROVED[i]!;
      const c = within(card);
      expect(c.getByRole('heading', { level: 2, name })).toBeInTheDocument();
      expect(c.getByRole('link', { name: `LinkedIn profile of ${name}` })).toHaveAttribute('href', linkedin);
      expect(c.getByRole('link', { name: `GitHub profile of ${name}` })).toHaveAttribute('href', github);
      expect(c.getAllByRole('link')).toHaveLength(2);
      const photo = c.getByRole('img', { name: `Portrait of ${name}` });
      expect(photo).toHaveAttribute('src', `/team/${name.toLowerCase()}.webp`);
      expect(photo).toHaveAttribute('width', '400');
      expect(photo).toHaveAttribute('height', '500');
    });
  });

  it('shows no fifth profile, placeholder or future-member message', () => {
    const { container } = render(<MemoryRouter><TeamPage /></MemoryRouter>);
    expect(container.querySelectorAll('.member-card')).toHaveLength(4);
    expect(container.textContent).not.toMatch(/\bfive\b|\bfifth\b|placeholder|pending|will appear|once each member/i);
  });

  it('falls back to the initials when a photo is missing or fails to load', () => {
    const fixture = [
      { name: 'Test Person', role: 'Team member' },
      { name: 'Broken Photo', role: 'Team member', photo: 'team/missing.webp' },
    ];
    render(<MemoryRouter><TeamPage members={fixture} /></MemoryRouter>);
    const [noPhoto, broken] = within(screen.getByRole('list', { name: 'Team members' })).getAllByRole('listitem');
    expect(within(noPhoto!).queryByRole('img')).toBeNull();
    expect(within(noPhoto!).getByTestId('member-fallback')).toHaveTextContent('TP');
    expect(within(noPhoto!).queryAllByRole('link')).toHaveLength(0);
    fireEvent.error(within(broken!).getByRole('img', { name: 'Portrait of Broken Photo' }));
    expect(within(broken!).queryByRole('img')).toBeNull();
    expect(within(broken!).getByTestId('member-fallback')).toHaveTextContent('BP');
  });

  it('no source file or the README describes MAF FC as having five members', () => {
    const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../test/**', '../../README.md'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const wrong = /\bfive[- ](?:members?|people|teammates|participants|person)\b|\bfifth (?:member|teammate|profile)\b|\bteam of (?:five|5)\b|TEAM_SIZE\s*=\s*5/i;
    expect(Object.entries(sources).filter(([, text]) => wrong.test(text)).map(([file]) => file)).toEqual([]);
  });
});

describe('challenge name (UI3B.2)', () => {
  it('calls the challenge "The Initial Challenge" on Home, in the competition strip and on Team', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: /Possession, frame by frame/ });
    expect(screen.getByText(/More than a Hack 2027 · The Initial Challenge/)).toBeInTheDocument();
    const strip = screen.getByRole('region', { name: 'Built for More than a Hack 2027' });
    expect(strip.textContent).toMatch(/The Initial Challenge\. Organised by Metrica Sports/);
    render(<MemoryRouter><TeamPage /></MemoryRouter>);
    expect(screen.getByText(/taking part in The Initial Challenge of More than a Hack 2027/)).toBeInTheDocument();
  });

  it('no application source or the app README uses the old title', () => {
    const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../test/**', '../../README.md', '../../index.html'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    expect(Object.entries(sources).filter(([, t]) => /Phase 1: Ball Possession/i.test(t)).map(([f]) => f)).toEqual([]);
  });
});

describe('organiser logos in the shared header (UI3B.2)', () => {
  const ORG = [
    ['Metrica Sports', 'https://metrica-sports.com', '/organisers/metrica-sports.webp'],
    ['Barça Innovation Hub', 'https://barcainnovationhub.fcbarcelona.com', '/organisers/barca-innovation-hub.webp'],
    ['Mobile World Capital Barcelona', 'https://www.mwcbarcelona.com', '/organisers/mobile-world-capital-barcelona.webp'],
  ];

  it.each(['/explorer', '/compare', '/methodology', '/team', '/nowhere'])('shows the three named logo links on %s', async (path) => {
    renderApp(path);
    await screen.findByRole('heading', { level: 1 });
    // One placement in the bar (wide screens) and one in the row under it (narrow screens);
    // CSS displays exactly one of them, which the browser smoke test checks at every width.
    const groups = screen.getAllByRole('list', { name: 'Organisers of More than a Hack 2027' });
    // UI3B.3: header groups have no plate (organiser-group), unlike the strip (organiser-plate).
    expect(groups.map((g) => g.className)).toEqual(['organiser-group bar-organisers', 'organiser-group row-organisers']);
    expect(screen.getByRole('banner').contains(groups[0]!)).toBe(true);
    for (const g of groups) {
      const links = within(g).getAllByRole('link');
      expect(links.map((a) => [a.querySelector('img')?.getAttribute('alt'), a.getAttribute('href'), a.querySelector('img')?.getAttribute('src')])).toEqual(ORG);
      for (const a of links) expect(a).toHaveAccessibleName(/\w/);
      for (const img of within(g).getAllByRole('img')) expect(img).toHaveAttribute('loading', 'eager');
    }
  });

  it('keeps MAF FC as the first, primary identity and the five routes in the navigation', () => {
    renderApp('/methodology');
    const banner = screen.getByRole('banner');
    expect(banner.firstElementChild).toHaveAccessibleName('MAF FC Possession Explorer: go to Home');
    expect(within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('link')).toHaveLength(5);
  });

  it('shrinks the header logos by one factor, so their balance matches the strip', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: /Possession, frame by frame/ });
    const heights = (sel: string) => [...document.querySelectorAll(`${sel} img`)].map((i) => Number(i.getAttribute('height')));
    expect(heights('.organiser-logos')).toEqual([56, 56, 40]);
    // Metrica, Barça (white-text file, then the dark-text file sized to the same optical height), MWC.
    expect(heights('.bar-organisers')).toEqual([36, 36, 44, 26]);
  });

  it('prepares each header logo for both themes without changing the files (UI3B.3)', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: /Possession, frame by frame/ });
    const header = document.querySelector('.bar-organisers')!;
    const imgs = [...header.querySelectorAll('img')].map((i) => [i.getAttribute('src'), i.className, i.getAttribute('alt')]);
    expect(imgs).toEqual([
      ['/organisers/metrica-sports.webp', 'organiser-logo logo-night-screen', 'Metrica Sports'],
      ['/organisers/barca-innovation-hub.webp', 'organiser-logo logo-for-night', 'Barça Innovation Hub'],
      ['/organisers/barca-innovation-hub-dark-text.png', 'organiser-logo logo-for-floodlight', 'Barça Innovation Hub'],
      ['/organisers/mobile-world-capital-barcelona.webp', 'organiser-logo logo-floodlight-mono-dark', 'Mobile World Capital Barcelona'],
    ]);
    // The competition strip keeps its black plate and the original single files.
    const strip = document.querySelector('.organiser-logos')!;
    expect(strip.className).toBe('organiser-plate organiser-logos');
    expect([...strip.querySelectorAll('img')].map((i) => i.className)).toEqual(['organiser-logo', 'organiser-logo', 'organiser-logo']);
  });

  it('shows the organiser name if a themed header logo fails to load', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: /Possession, frame by frame/ });
    const header = document.querySelector('.bar-organisers') as HTMLElement;
    fireEvent.error(header.querySelector('img.logo-for-floodlight')!);
    const link = within(header).getByRole('link', { name: 'Barça Innovation Hub' });
    expect(link.querySelector('img')).toBeNull();
    expect(link).toHaveAttribute('href', 'https://barcainnovationhub.fcbarcelona.com');
  });

  it('keeps the non-endorsement note with the competition attribution', async () => {
    renderApp('/');
    const strip = await screen.findByRole('region', { name: 'Built for More than a Hack 2027' });
    expect(strip.textContent).toMatch(/do not imply their endorsement of this project/);
  });
});

describe('Home heading focus (UI3B.1)', () => {
  it('does not focus the hero heading on first load, even under StrictMode', async () => {
    render(<StrictMode><MemoryRouter initialEntries={['/']}><App /></MemoryRouter></StrictMode>);
    const heading = await screen.findByRole('heading', { level: 1, name: /Possession, frame by frame/ });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(heading).not.toHaveFocus();
    expect(heading).toHaveAttribute('tabindex', '-1');   // still a programmatic focus target
  });

  it('still moves focus to the new heading after navigating, under StrictMode', async () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});   // jsdom has no scrolling
    const user = userEvent.setup();
    render(<StrictMode><MemoryRouter initialEntries={['/']}><App /></MemoryRouter></StrictMode>);
    await screen.findByRole('heading', { level: 1, name: /Possession, frame by frame/ });
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Team' }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Team' });
    await waitFor(() => expect(heading).toHaveFocus());
    scroll.mockRestore();
  });
  // The visual side (no ring on the focused heading, rings kept on controls) is checked on computed
  // styles in the browser smoke test, since jsdom applies no stylesheet.
});

describe('navigation and theme', () => {
  it('shares one theme state between the bar toggle and the mobile-menu toggle', async () => {
    const user = userEvent.setup();
    renderApp('/methodology');
    document.documentElement.dataset.theme = 'dark';
    const [rowToggle, barToggle] = screen.getAllByRole('button', { name: /Switch to (light|dark) theme/ });
    const before = document.documentElement.dataset.theme;
    await user.click(barToggle!);
    expect(document.documentElement.dataset.theme).not.toBe(before);
    expect(rowToggle).toHaveAccessibleName(barToggle!.getAttribute('aria-label')!);
    await user.click(rowToggle!);
    expect(document.documentElement.dataset.theme).toBe(before);
  });
});

describe('Explorer redesign', () => {
  it('uses keyboard-operable scenario chips with descriptions and a provenance disclosure', async () => {
    const user = userEvent.setup();
    await renderLoaded('/explorer?scenario=s1');
    const chips = screen.getByRole('group', { name: 'Select a synthetic scenario' });
    expect(within(chips).getAllByRole('radio')).toHaveLength(4);
    // Native radio-group arrow keys are checked in the browser smoke test (jsdom does not implement them).
    await user.click(within(chips).getByRole('radio', { name: /^S2 / }));
    await waitFor(() => expect(within(chips).getByRole('radio', { name: /^S2 / })).toBeChecked());
    expect(screen.getByText(/60-frame scramble/)).toBeInTheDocument();      // S2 description
    const provenance = screen.getByText('Data provenance').closest('details')!;
    expect(provenance).not.toHaveAttribute('open');
    await user.click(screen.getByText('Data provenance'));
    expect(provenance).toHaveAttribute('open');
  });

  it('groups the timeline and keeps engine codes in a closed disclosure', async () => {
    await renderLoaded('/explorer?scenario=s1');
    expect(screen.getByText('Possession')).toBeInTheDocument();
    expect(screen.getByText('Evidence and annotations')).toBeInTheDocument();
    const inspector = screen.getByRole('complementary', { name: 'Frame inspector' });
    const details = within(inspector).getByText('Engine details').closest('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getByText('Possession Engine state source')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Pitch and playback' })).toContainElement(screen.getByTestId('readout'));
  });
});

describe('Compare redesign', () => {
  it('leads with a verdict generated from the data, including when smooth50 scores higher', async () => {
    await renderLoaded('/compare?scenario=s3');
    const s = summarize(S3);
    expect(s.spells).toMatch(/smooth50 scores higher/);
    expect(screen.getByTestId('verdict')).toHaveTextContent(s.agreement);
    expect(screen.getByTestId('verdict')).toHaveTextContent(s.spells);
  });

  it('switches tabs with the keyboard, keeping both panels in the DOM', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/compare?scenario=s4']}><ComparePage /></MemoryRouter>);
    await screen.findByTestId('readout');
    const differences = screen.getByRole('tab', { name: /Differences/ });
    expect(differences).toHaveAttribute('aria-selected', 'true');
    expect(within(differences).getByText(String(S4 && 4))).toBeInTheDocument();
    differences.focus();
    await user.keyboard('{ArrowRight}');
    const reading = screen.getByRole('tab', { name: /Reading this scenario/ });
    expect(reading).toHaveAttribute('aria-selected', 'true');
    expect(reading).toHaveFocus();
    expect(screen.getByTestId('disagreement-table').closest('[role="tabpanel"]')).toHaveAttribute('hidden');
    await user.keyboard('{Home}');
    expect(differences).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps detailed statistics in a closed disclosure with every table inside', async () => {
    const user = userEvent.setup();
    await renderLoaded('/compare?scenario=s4');
    const stats = document.getElementById('detailed-statistics')!;
    expect(stats.tagName).toBe('DETAILS');
    expect(stats).not.toHaveAttribute('open');
    for (const id of ['counts-table', 'confusion-phase3b', 'confusion-smooth50']) expect(within(stats).getByTestId(id)).toBeInTheDocument();
    await user.click(within(stats).getByText('Detailed statistics'));
    expect(stats).toHaveAttribute('open');
  });

  it('shows the difference at the selected frame', async () => {
    const user = userEvent.setup();
    await renderLoaded('/compare?scenario=s4');
    expect(screen.getByTestId('selected-difference')).toHaveTextContent('No difference at this frame');
    await user.click(screen.getByRole('button', { name: 'Go to frame 185' }));
    expect(screen.getByTestId('selected-difference')).toHaveTextContent('Frames 185–203');
  });
});

describe('Methodology diagrams', () => {
  it('has three titled, described diagrams', async () => {
    renderApp('/methodology');
    await screen.findByRole('heading', { level: 1, name: 'Methodology' });
    for (const name of ['Credible control: radius and margin', 'Changing possession: ten observations, backdated', 'Dead ball and restart inside a set-piece tag']) {
      const img = screen.getByRole('img', { name: new RegExp(name.replace(/[()]/g, '.')) });
      expect(img.tagName.toLowerCase()).toBe('svg');
      expect(img.querySelector('desc')?.textContent?.length).toBeGreaterThan(60);
    }
    expect(screen.getByRole('link', { name: 'Open S4 in the Explorer' })).toHaveAttribute('href', '/explorer?scenario=s4');
    act(() => undefined);
  });
});

describe('keyboard ownership of scenario chips', () => {
  it('leaves arrow keys and Space to a focused scenario radio (they belong to the radio group)', async () => {
    const { ownsKey } = await import('../playback/useKeyboardShortcuts');
    await renderLoaded('/explorer?scenario=s1');
    const radio = screen.getByRole('radio', { name: /^S1 / });
    expect(ownsKey(radio, 'ArrowRight')).toBe(true);
    expect(ownsKey(radio, 'ArrowLeft')).toBe(true);
    expect(ownsKey(radio, ' ')).toBe(true);
    const user = userEvent.setup();
    radio.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByTestId('readout').textContent).toContain('Frame 0 ');   // playhead not stepped
  });
});
