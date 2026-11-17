import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import LocalExplorerPage from '../local/LocalExplorerPage';
import { LOCAL_MAX_BYTES, parseLocalScenario, readLocalFile } from '../local/validate';
import { resetLocalStore } from '../local/store';

beforeEach(() => resetLocalStore());

const fixture = () => ({
  schemaVersion: 'local-1', id: 'local', title: 'Synthetic local fixture', description: 'Artificial coordinates only.',
  provenance: { kind: 'local-private', generator: 'synthetic-test', generatorVersion: '1', statement: 'Synthetic test fixture.' },
  sourceFrameStart: 100, fps: 25, frameCount: 3, pitch: { length: 105.3, width: 68 },
  teams: [{ id: 'home', side: 'home', name: 'Home', shortName: 'HOM' }, { id: 'away', side: 'away', name: 'Away', shortName: 'AWY' }],
  players: [{ id: 'slot-1', teamId: 'home', shirt: 1, role: 'track' }],
  frames: [{ ball: [20, 30, 1], players: [[19, 30]] }, { ball: null, players: [null] }, { ball: [22, 30, 2], players: [[21, 30]] }],
  predictions: { name: 'Rule-Based Possession Engine', labels: 'HDA' },
});

describe('local export validation', () => {
  it('accepts synthetic-only aligned observations and labels without invented scores', () => {
    const s = parseLocalScenario(fixture());
    expect(s.frames[1]?.ball).toBeNull();
    expect(s.sourceFrameStart).toBe(100);
    expect(s).not.toHaveProperty('reference');
    expect(s).not.toHaveProperty('models');
  });
  it.each([
    ['schema version', (v: ReturnType<typeof fixture>) => { v.schemaVersion = '1'; }],
    ['provenance', (v: ReturnType<typeof fixture>) => { v.provenance.kind = 'synthetic'; }],
    ['frame limit', (v: ReturnType<typeof fixture>) => { v.frameCount = 7501; }],
    ['frame alignment', (v: ReturnType<typeof fixture>) => { v.frames.pop(); }],
    ['labels', (v: ReturnType<typeof fixture>) => { v.predictions.labels = 'H?A'; }],
    ['label alignment', (v: ReturnType<typeof fixture>) => { v.predictions.labels = 'HA'; }],
    ['fps', (v: ReturnType<typeof fixture>) => { v.fps = 0; }],
    ['team mapping', (v: ReturnType<typeof fixture>) => { v.players[0]!.teamId = 'unknown'; }],
    ['duplicate teams', (v: ReturnType<typeof fixture>) => { v.teams[1]!.id = 'home'; }],
    ['missing position', (v: ReturnType<typeof fixture>) => { v.frames[0]!.players = []; }],
    ['nonfinite coordinate', (v: ReturnType<typeof fixture>) => { v.frames[0]!.ball![0] = Infinity; }],
    ['source alignment type', (v: ReturnType<typeof fixture>) => { v.sourceFrameStart = 1.5; }],
    ['player limit', (v: ReturnType<typeof fixture>) => { v.players = Array.from({ length: 65 }, (_, i) => ({ id: `slot-${i}`, teamId: 'home', shirt: i, role: 'track' })); }],
  ])('rejects malformed %s', (_name, mutate) => { const v = fixture(); mutate(v); expect(() => parseLocalScenario(v)).toThrow(); });
  it('accepts the 46 track slots documented for the tactical metadata', () => {
    const v: Record<string, unknown> = {
      ...fixture(),
      players: Array.from({ length: 46 }, (_, i) => ({ id: `slot-${i + 1}`, teamId: i % 2 ? 'away' : 'home', shirt: i + 1, role: 'track' })),
      frames: fixture().frames.map((f) => ({ ball: f.ball, players: Array.from({ length: 46 }, (_, i) => (i < 22 ? [10 + i, 30] : null)) })),
    };
    expect(parseLocalScenario(v).players).toHaveLength(46);
  });
  it('rejects oversize files before reading them', async () => {
    const read = vi.fn();
    await expect(readLocalFile({ size: LOCAL_MAX_BYTES + 1, text: read } as unknown as File)).rejects.toThrow('16 MiB');
    expect(read).not.toHaveBeenCalled();
  });
  it('explains malformed JSON', async () => {
    await expect(readLocalFile({ size: 2, text: async () => '{?' } as File)).rejects.toThrow('not valid JSON');
  });
  it('loads, seeks and clears a synthetic file in the same playback components', async () => {
    const file = new File([JSON.stringify(fixture())], 'synthetic-local.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(fixture()) });
    render(<MemoryRouter><LocalExplorerPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Open local export'), { target: { files: [file] } });
    expect(await screen.findByTestId('local-source')).toHaveTextContent('synthetic-local.json');
    fireEvent.click(screen.getByRole('button', { name: 'Next frame' }));
    expect(screen.getByTestId('readout')).toHaveTextContent('Frame 1');
    expect(screen.getByText(/source frame 101/)).toBeInTheDocument();
    expect(screen.queryByText('spellF1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear local data' }));
    expect(screen.queryByTestId('readout')).not.toBeInTheDocument();
  });
  it('shows a field-specific error and clears the previous visualization', async () => {
    const file = new File(['{}'], 'bad.json');
    Object.defineProperty(file, 'text', { value: async () => '{}' });
    render(<MemoryRouter><LocalExplorerPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Open local export'), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('schemaVersion');
    expect(screen.queryByTestId('readout')).not.toBeInTheDocument();
  });
});
