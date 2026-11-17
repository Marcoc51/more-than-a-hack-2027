import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { agreement, disagreements, scoredMask, percent } from '../scenario/compare';
import { S1, S2, S3, S4, renderApp, renderLoaded } from './util';

const nav = () => screen.getByRole('navigation', { name: 'Main' });
const link = (name: string) => within(nav()).getByRole('link', { name });
const frameText = () => screen.getByTestId('readout').textContent ?? '';

describe('routing and navigation', () => {
  it('serves the Home page at / (UI3B: Home replaces the UI2 redirect)', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: /Possession, frame by frame/ })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Home · MAF FC Possession Explorer'));
    expect(link('Home')).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['/explorer', 'Explorer'], ['/compare', 'Compare'], ['/methodology', 'Methodology'], ['/team', 'Team'],
  ])('%s renders its page, title and active link', async (path, name) => {
    renderApp(path);
    expect(await screen.findByRole('heading', { level: 1, name })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe(`${name} · MAF FC Possession Explorer`));
    expect(link(name)).toHaveAttribute('aria-current', 'page');
    for (const other of ['Home', 'Explorer', 'Compare', 'Methodology', 'Team'].filter((n) => n !== name)) {
      expect(link(other)).not.toHaveAttribute('aria-current');
    }
  });

  it('lists the five real pages, and shows an honest page for unknown paths', async () => {
    renderApp('/nowhere');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    const names = within(nav()).getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(names).toEqual(['/', '/explorer', '/compare', '/methodology', '/team']);
    // Icons are hidden and descriptions are not part of the name: each link is named by its label alone.
    for (const name of ['Home', 'Explorer', 'Compare', 'Methodology', 'Team']) {
      const l = within(nav()).getByRole('link', { name });
      expect(l).toHaveAccessibleDescription(/\w+/);
      expect(l.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('moves focus to the new page heading after navigating', async () => {
    const user = userEvent.setup();
    renderApp('/explorer');
    await screen.findByTestId('readout');
    await user.click(link('Methodology'));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Methodology' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('keeps the selected scenario in the navigation links', async () => {
    renderApp('/explorer?scenario=s2');
    await screen.findByTestId('readout');
    expect(link('Compare')).toHaveAttribute('href', '/compare?scenario=s2');
    act(() => screen.getByRole('radio', { name: /S4/ }).click());
    await waitFor(() => expect(link('Compare')).toHaveAttribute('href', '/compare?scenario=s4'));
  });

  it('has a skip link to the main content', () => {
    renderApp('/methodology');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });
});

describe('mobile navigation menu', () => {
  it('opens, focuses the first link, closes with Escape and returns focus', async () => {
    const user = userEvent.setup();
    renderApp('/explorer');
    const button = screen.getByRole('button', { name: 'Open menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'main-nav-list');
    await user.click(button);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('main-nav-list')).toHaveAttribute('data-open', 'true');
    expect(link('Home')).toHaveFocus();   // the first link (Home since UI3B)
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveFocus();
  });

  it('closes when a route is chosen', async () => {
    const user = userEvent.setup();
    renderApp('/explorer');
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await user.click(link('Compare'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Compare' })).toBeInTheDocument();
    expect(document.getElementById('main-nav-list')).toHaveAttribute('data-open', 'false');
  });

  it('closes on a pointer press outside the header', async () => {
    const user = userEvent.setup();
    renderApp('/methodology');
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.pointerDown(screen.getByRole('main'));
    expect(document.getElementById('main-nav-list')).toHaveAttribute('data-open', 'false');
  });
});

describe('Compare page', () => {
  it('shows agreement and official scores for both models', async () => {
    await renderLoaded('/compare?scenario=s3');
    const mask = scoredMask(S3);
    for (const m of ['phase3b', 'smooth50'] as const) {
      const a = agreement(S3.reference!.labels, S3.models[m].labels, mask);
      expect(screen.getByTestId(`agreement-${m}`)).toHaveTextContent(`${percent(a.rate)} (${a.agree}/${a.graded})`);
      expect(screen.getByTestId(`spellf1-${m}`)).toHaveTextContent(S3.models[m].scores.spellF1Mean.toFixed(3));
    }
    expect(within(screen.getByTestId('verdict')).getByText(/not the competition score/)).toBeInTheDocument();
  });

  it('lists every disagreement, filters and sorts them', async () => {
    const user = userEvent.setup();
    await renderLoaded('/compare?scenario=s4');
    const all = disagreements(S4);
    const rows = () => within(screen.getByTestId('disagreement-table')).getAllByRole('row').slice(1);
    expect(rows()).toHaveLength(all.length);
    await user.selectOptions(screen.getByLabelText('Show'), 'phase3b');
    expect(rows()).toHaveLength(all.filter((d) => d.models.includes('phase3b')).length);
    await user.selectOptions(screen.getByLabelText('Show'), 'all');
    await user.selectOptions(screen.getByLabelText('Sort by'), 'duration');
    const longest = [...all].sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)[0]!;
    expect(within(rows()[0]!).getByText(`${longest.start}–${longest.end - 1}`)).toBeInTheDocument();
  });

  it('seeks to a disagreement and links it into the Explorer', async () => {
    const user = userEvent.setup();
    await renderLoaded('/compare?scenario=s2');
    const first = disagreements(S2)[0]!;
    await user.click(screen.getByRole('button', { name: `Go to frame ${first.start}` }));
    expect(frameText()).toContain(`Frame ${first.start} `);
    expect(screen.getByRole('heading', { name: new RegExp(`At frame ${first.start} `) })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Open in Explorer' })[0]).toHaveAttribute('href', `/explorer?scenario=s2&frame=${first.start}`);
  });

  it('opens the Explorer at a linked frame', async () => {
    await renderLoaded('/explorer?scenario=s4&frame=190');
    expect(frameText()).toContain('Frame 190 ');
    expect(screen.getByRole('radio', { name: /S4/ })).toBeChecked();
  });

  it('shows the compare timeline with difference tracks and the reading guide', async () => {
    await renderLoaded('/compare?scenario=s1');
    for (const id of ['reference', 'phase3b', 'smooth50', 'diff-phase3b', 'diff-smooth50']) {
      expect(screen.getByTestId(`track-${id}`)).toBeInTheDocument();
    }
    act(() => screen.getByRole('tab', { name: /Reading this scenario/ }).click());
    const guide = screen.getByRole('tabpanel', { name: /Reading this scenario/ });
    expect(within(guide).getByText('Scripted reference', { exact: false })).toBeInTheDocument();
    expect(within(guide).getByText('UI description')).toBeInTheDocument();
    expect(S1.models.phase3b.scores.spellF1Mean).toBe(1);
  });
});

describe('Methodology page', () => {
  it('has every section, in order, with working in-page links', async () => {
    renderApp('/methodology');
    await screen.findByRole('heading', { level: 1, name: 'Methodology' });
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    const links = within(toc).getAllByRole('link');
    expect(links).toHaveLength(11);
    for (const a of links) {
      const id = a.getAttribute('href')!.slice(1);
      expect(document.getElementById(id)).not.toBeNull();
    }
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(links.map((l) => l.textContent));
  });

  it('offers two-row section links and a compact selector that highlight the current section', async () => {
    renderApp('/methodology');
    await screen.findByRole('heading', { level: 1, name: 'Methodology' });
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    const links = within(toc).getAllByRole('link');
    expect(links[0]).toHaveAttribute('aria-current', 'location');
    expect(links.filter((l) => l.hasAttribute('aria-current'))).toHaveLength(1);
    const select = within(toc).getByRole('combobox', { name: 'Jump to section' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(links.map((l) => l.textContent));
    fireEvent.change(select, { target: { value: 'parameters' } });
    expect(within(toc).getByRole('link', { name: 'Parameters' })).toHaveAttribute('aria-current', 'location');
    expect(links[0]).not.toHaveAttribute('aria-current');
    expect(window.location.hash).toBe('#h-parameters');
    fireEvent.click(within(toc).getByRole('link', { name: 'Known limitations' }));
    expect(within(toc).getByRole('link', { name: 'Known limitations' })).toHaveAttribute('aria-current', 'location');
  });

  it('states the engine parameters as implemented and links public source files', async () => {
    renderApp('/methodology');
    await screen.findByRole('heading', { level: 1, name: 'Methodology' });
    for (const [name, value] of [['control_radius_m', '2.0 m'], ['margin_m', '1.0 m'], ['confirm_frames', '10'], ['max_gap_frames', '250 (10 s)'], ['restart_speed_mps', '4.0 m/s']] as const) {
      const row = screen.getByText(name).closest('tr')!;
      expect(within(row).getByText(value)).toBeInTheDocument();
    }
    for (const a of screen.getAllByRole('link').filter((l) => l.getAttribute('href')?.includes('/blob/'))) {
      expect(a.getAttribute('href')).toMatch(/blob\/main\/(src\/(possession|baseline|smart_tagging)\.py|docs\/TECHNICAL_DOCUMENT\.md)$/);
    }
    expect(screen.getByText(/spellF1 0.400000 and macroF1 0.597742/)).toHaveTextContent("not a private full-match score");
  });
});
