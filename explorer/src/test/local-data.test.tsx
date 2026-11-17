// Local actual-match mode with synthetic fixtures only. The loopback loader is mocked with fetch.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import LocalComparePage from '../local/LocalComparePage';
import LocalExplorerPage from '../local/LocalExplorerPage';
import { matchClock, nearestPlayers, pairAgreement, pairDifferences, pairTrack, summarizeLabels } from '../local/metrics';
import { resetLocalStore } from '../local/store';
import { parseLocalScenario } from '../local/validate';

type Fixture = Record<string, unknown> & { predictions: { name: string; labels: string }; baseline?: { name: string; labels: string } };

/** 10 synthetic frames starting at source frame 11185; two tracks, a missing ball at clip frame 4. */
function fixture(primary = 'HHHAAAADDH', baseline: string | null = 'HHAAAAADHH'): Fixture {
  const frames = Array.from({ length: primary.length }, (_, f) => ({
    ball: f === 4 ? null : [50 + f, 34, 3],
    players: [[48 + f, 34], [56, 34]],
  }));
  return {
    schemaVersion: 'local-1', id: 'local', title: 'Synthetic window', description: 'Invented coordinates.',
    provenance: { kind: 'local-private', generator: 'test', generatorVersion: '1', statement: 'Synthetic.' },
    sourceFrameStart: 11185, fps: 25, frameCount: primary.length, pitch: { length: 105.3, width: 68 },
    teams: [{ id: 'home', side: 'home', name: 'Home', shortName: 'HOM' }, { id: 'away', side: 'away', name: 'Away', shortName: 'AWY' }],
    players: [{ id: 'slot-1', teamId: 'home', shirt: 7, role: 'track' }, { id: 'slot-2', teamId: 'away', shirt: 4, role: 'track' }],
    frames,
    predictions: { name: 'Rule-Based Possession Engine', labels: primary },
    ...(baseline === null ? {} : { baseline: { name: 'Official smooth50 baseline', labels: baseline } }),
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function serve(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    const handler = routes[url];
    return handler ? handler() : new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } });
  }));
  return calls;
}

const manifest = (names: string[]) => () => json({ configured: names.length > 0, problem: null, exports: names.map((name, index) => ({ index, name, bytes: 100, available: true })) });

beforeEach(() => { resetLocalStore(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const renderPage = (page: 'explorer' | 'compare') => render(<MemoryRouter>{page === 'explorer' ? <LocalExplorerPage /> : <LocalComparePage />}</MemoryRouter>);

describe('local data source', () => {
  it('shows setup instructions, not synthetic data, when no export is registered', async () => {
    serve({ '/__local-explorer/manifest': manifest([]) });
    renderPage('explorer');
    const setup = await screen.findByTestId('local-setup');
    expect(setup).toHaveTextContent('No authorized match data is loaded');
    expect(setup).toHaveTextContent('--register');
    expect(screen.queryByTestId('readout')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('Synthetic Home');
  });

  it('explains when the loopback loader is not running', async () => {
    serve({});
    renderPage('explorer');
    expect(await screen.findByTestId('local-setup')).toHaveTextContent('npm run dev:local');
  });

  it('opens the first registered export by default, with real source frame numbers', async () => {
    const calls = serve({ '/__local-explorer/manifest': manifest(['first-half-000.json', 'first-half-001.json']), '/__local-explorer/export/0': () => json(fixture()) });
    renderPage('explorer');
    expect(await screen.findByTestId('local-source')).toHaveTextContent('registered export first-half-000.json');
    expect(screen.getByTestId('local-source')).toHaveTextContent('source 11185–11194');
    expect(screen.getByTestId('local-frame')).toHaveTextContent('source frame 11185');
    expect(calls).toEqual(['/__local-explorer/manifest', '/__local-explorer/export/0']);
    expect(localStorage.getItem('maf-fc-local-export')).toBe('first-half-000.json');
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }));
    expect(screen.getByTestId('local-frame')).toHaveTextContent('Clip frame 1 · source frame 11186');
    expect(screen.getByTestId('track-primary')).toBeInTheDocument();
    expect(screen.getByTestId('track-baseline')).toBeInTheDocument();
  });

  it('reopens the remembered registered export and switches without re-importing', async () => {
    localStorage.setItem('maf-fc-local-export', 'first-half-001.json');
    const calls = serve({
      '/__local-explorer/manifest': manifest(['first-half-000.json', 'first-half-001.json']),
      '/__local-explorer/export/0': () => json(fixture()),
      '/__local-explorer/export/1': () => json({ ...fixture(), sourceFrameStart: 18685 }),
    });
    renderPage('explorer');
    expect(await screen.findByTestId('local-source')).toHaveTextContent('first-half-001.json');
    expect(screen.getByTestId('local-source')).toHaveTextContent('source 18685–18694');
    fireEvent.change(screen.getByLabelText('Registered export'), { target: { value: '0' } });
    expect(await screen.findByText(/source 11185–11194/)).toBeInTheDocument();
    expect(calls.filter((c) => c.includes('/export/'))).toEqual(['/__local-explorer/export/1', '/__local-explorer/export/0']);
  });

  it('keeps the loaded export when moving between the local Explorer and Compare pages', async () => {
    const calls = serve({ '/__local-explorer/manifest': manifest(['w.json']), '/__local-explorer/export/0': () => json(fixture()) });
    const first = renderPage('explorer');
    await screen.findByTestId('local-source');
    first.unmount();
    renderPage('compare');
    expect(await screen.findByTestId('local-verdict')).toBeInTheDocument();
    expect(calls).toEqual(['/__local-explorer/manifest', '/__local-explorer/export/0']);
  });

  it('rejects a malformed registered export with a field-specific error and shows nothing', async () => {
    const bad = fixture();
    bad.predictions.labels = 'HHH';
    serve({ '/__local-explorer/manifest': manifest(['bad.json']), '/__local-explorer/export/0': () => json(bad) });
    renderPage('explorer');
    expect(await screen.findByRole('alert')).toHaveTextContent('predictions.labels');
    expect(screen.queryByTestId('readout')).not.toBeInTheDocument();
  });
});

describe('local model-to-model comparison', () => {
  it('compares the two predictions on the same frames without any accuracy or F1', async () => {
    serve({ '/__local-explorer/manifest': manifest(['w.json']), '/__local-explorer/export/0': () => json(fixture()) });
    renderPage('compare');
    // HHHAAAADDH vs HHAAAAADHH: frames 2 (H/A) and 8 (D/H) differ.
    expect(await screen.findByTestId('local-verdict')).toHaveTextContent('agree on 8 of 10 frames (80.0%)');
    expect(screen.getByTestId('local-verdict')).toHaveTextContent('not accuracy');
    const table = screen.getByTestId('local-difference-table');
    const rows = within(table).getAllByRole('row').slice(1).map((r) => r.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('11187–11187');
    expect(screen.getByTestId('track-pair')).toBeInTheDocument();
    const distribution = within(screen.getByTestId('local-distribution-table')).getAllByRole('row').map((r) => r.textContent);
    expect(distribution[1]).toContain('4 (40.0%)');
    // No metric values, reference series or confusion matrices; only prose saying none exist.
    for (const forbidden of ['spellF1', 'macroF1', 'confusion', 'Synthetic reference']) expect(document.body.textContent).not.toContain(forbidden);
    expect(screen.queryAllByRole('columnheader', { name: /reference/i })).toHaveLength(0);
    expect(screen.queryByTestId('track-reference')).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^(spellf1|agreement|confusion)-/)).not.toBeInTheDocument();
    fireEvent.click(within(table).getByRole('button', { name: 'Go to source frame 11193' }));
    expect(screen.getByTestId('local-frame')).toHaveTextContent('source frame 11193');
    expect(screen.getByTestId('local-pair-state')).toHaveTextContent('differ');
  });

  it('shows a single-model view and says what is missing without smooth50', async () => {
    serve({ '/__local-explorer/manifest': manifest(['w.json']), '/__local-explorer/export/0': () => json(fixture('HHHAAAADDH', null)) });
    renderPage('compare');
    expect(await screen.findByTestId('local-missing-baseline')).toHaveTextContent('smooth50 predictions are not in this export');
    expect(screen.queryByTestId('local-difference-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('track-pair')).not.toBeInTheDocument();
    expect(screen.getByTestId('local-model-primary')).toBeInTheDocument();
    expect(screen.queryByTestId('local-model-baseline')).not.toBeInTheDocument();
  });
});

describe('local export contract (optional smooth50)', () => {
  it('accepts exports with and without a baseline', () => {
    expect(parseLocalScenario(fixture()).baseline?.labels).toBe('HHAAAAADHH');
    expect(parseLocalScenario(fixture('HHHAAAADDH', null)).baseline).toBeNull();
  });
  it.each([
    ['misaligned baseline', (v: Fixture) => { v.baseline!.labels = 'HH'; }],
    ['invalid baseline label', (v: Fixture) => { v.baseline!.labels = 'HHAAAAADHZ'; }],
    ['baseline without a name', (v: Fixture) => { (v.baseline as Record<string, unknown>).name = 5; }],
    ['reference labels', (v: Fixture) => { v.reference = { labels: 'HHHAAAADDH' }; }],
    ['scores', (v: Fixture) => { v.scores = { spellF1: 1 }; }],
  ])('rejects %s', (_name, mutate) => { const v = fixture(); mutate(v); expect(() => parseLocalScenario(v)).toThrow(); });
});

describe('partially missing tracking (exporter policy)', () => {
  it('accepts an unknown ball speed and keeps the ball position', async () => {
    const v = fixture();
    (v.frames as { ball: unknown }[])[0]!.ball = [50, 34, null];
    expect(parseLocalScenario(v).frames[0]!.ball).toEqual([50, 34, null]);
    serve({ '/__local-explorer/manifest': manifest(['w.json']), '/__local-explorer/export/0': () => json(v) });
    renderPage('explorer');
    await screen.findByTestId('local-source');
    expect(screen.getByTestId('ball')).toBeInTheDocument();
    expect(screen.getByTestId('local-frame')).toHaveTextContent('2.0 m');
  });
  it('shows an unavailable player position as absent, never at a made-up point', () => {
    const v = fixture();
    (v.frames as { players: unknown[] }[])[0]!.players = [null, [56, 34]];
    const s = parseLocalScenario(v);
    expect(s.frames[0]!.players[0]).toBeNull();
    expect(nearestPlayers(s, 0)).toEqual({ home: null, away: 6 });
  });
  it.each([
    ['ball without x', [null, 34, 3]],
    ['ball without y', [50, null, 3]],
    ['non-numeric speed', [50, 34, 'NaN']],
    ['two-value ball', [50, 34]],
  ])('rejects a %s', (_name, ball) => {
    const v = fixture();
    (v.frames as { ball: unknown }[])[0]!.ball = ball;
    expect(() => parseLocalScenario(v)).toThrow(/frames\[0\]\.ball/);
  });
});

describe('model-to-model metrics', () => {
  it('counts agreement, differences, spells and changes from labels alone', () => {
    expect(pairAgreement('HHAD', 'HAAD')).toEqual({ frames: 4, same: 3, different: 1, rate: 0.75 });
    expect(pairDifferences('HHHAAX', 'HAAAHX')).toEqual([{ start: 1, end: 3, primary: 'H', baseline: 'A' }, { start: 4, end: 5, primary: 'A', baseline: 'H' }]);
    expect(pairTrack('HAD', 'HDD')).toBe('=!=');
    const s = summarizeLabels('XHHDHHAADXA');
    expect(s.counts).toEqual({ H: 4, A: 3, D: 2, X: 2 });
    expect(s.possessionSpells).toBe(4);
    expect(s.possessionChanges).toBe(1);
    expect(s.labelChanges).toBe(7);
  });
  it('derives nearest-player distances from tracking only and formats real video time', () => {
    const scenario = parseLocalScenario(fixture());
    expect(nearestPlayers(scenario, 0)).toEqual({ home: 2, away: 6 });
    expect(nearestPlayers(scenario, 4)).toEqual({ home: null, away: null });
    expect(matchClock(11185, 25)).toBe('07:27');
  });
});

describe('public demo is unaffected', () => {
  it('keeps the synthetic Compare page with its scripted reference', async () => {
    const { renderApp } = await import('./util');
    await act(async () => { renderApp('/compare?scenario=s1'); });
    expect(await screen.findByText('Synthetic reference')).toBeInTheDocument();
    expect(screen.queryByTestId('local-source')).not.toBeInTheDocument();
  });
});
