import { act, render, screen } from '@testing-library/react';
import { MAX_STEP_MS, advanceClock } from '../playback/clock';
import { PlaybackProvider, usePlayback, usePlaybackDispatch } from '../playback/PlaybackProvider';
import { initialPlayback, playbackReducer, type PlaybackAction } from '../playback/reducer';

const run = (actions: PlaybackAction[], n = 100) => actions.reduce(playbackReducer, initialPlayback(n));

describe('playbackReducer', () => {
  it('plays, pauses and toggles', () => {
    expect(run([{ type: 'play' }]).playing).toBe(true);
    expect(run([{ type: 'play' }, { type: 'pause' }]).playing).toBe(false);
    expect(run([{ type: 'toggle' }, { type: 'toggle' }]).playing).toBe(false);
  });
  it('steps exactly and clamps at both ends', () => {
    expect(run([{ type: 'step', delta: 1 }]).frame).toBe(1);
    expect(run([{ type: 'step', delta: 10 }, { type: 'step', delta: -3 }]).frame).toBe(7);
    expect(run([{ type: 'step', delta: -1 }]).frame).toBe(0);
    expect(run([{ type: 'step', delta: 500 }]).frame).toBe(99);
  });
  it('seeks with clamping, rejects non-finite frames, and pauses', () => {
    expect(run([{ type: 'play' }, { type: 'seek', frame: 42 }])).toMatchObject({ frame: 42, playing: false });
    expect(run([{ type: 'seek', frame: 1e9 }]).frame).toBe(99);
    expect(run([{ type: 'seek', frame: -4 }]).frame).toBe(0);
    expect(run([{ type: 'seek', frame: Number.NaN }]).frame).toBe(0);
    expect(run([{ type: 'seek', frame: 12.9 }]).frame).toBe(12);
  });
  it('accepts only the offered speeds', () => {
    expect(run([{ type: 'setSpeed', speed: 2 }]).speed).toBe(2);
    expect(run([{ type: 'setSpeed', speed: 3 }]).speed).toBe(1);
  });
  it('advances only while playing and stops on the final frame', () => {
    expect(run([{ type: 'advance', frames: 5 }]).frame).toBe(0);
    expect(run([{ type: 'play' }, { type: 'advance', frames: 5 }]).frame).toBe(5);
    expect(run([{ type: 'play' }, { type: 'advance', frames: 500 }])).toMatchObject({ frame: 99, playing: false });
  });
  it('restarts at frame 0, and playing from the end starts again', () => {
    expect(run([{ type: 'seek', frame: 50 }, { type: 'restart' }]).frame).toBe(0);
    expect(run([{ type: 'seek', frame: 99 }, { type: 'play' }])).toMatchObject({ frame: 0, playing: true });
  });
  it('loads a new scenario length, keeping the chosen speed', () => {
    const s = run([{ type: 'setSpeed', speed: 0.5 }, { type: 'seek', frame: 80 }, { type: 'load', frameCount: 40 }]);
    expect(s).toMatchObject({ frame: 0, frameCount: 40, playing: false, speed: 0.5 });
  });
});

describe('advanceClock', () => {
  it('converts wall time to frames at each speed, carrying fractions', () => {
    expect(advanceClock(1000, 1, 25, 0).frames).toBe(0 + Math.floor(0.25 * 25 * 1)); // capped at 250 ms
    expect(advanceClock(200, 1, 25, 0)).toEqual({ frames: 5, carry: 0 });
    expect(advanceClock(200, 2, 25, 0).frames).toBe(10);
    expect(advanceClock(200, 0.25, 25, 0).frames).toBe(1);
    const a = advanceClock(30, 1, 25, 0);
    const b = advanceClock(30, 1, 25, a.carry);
    expect(a.frames + b.frames).toBe(1);
  });
  it('caps a long pause (hidden tab) instead of jumping', () => {
    expect(advanceClock(60_000, 1, 25, 0).frames).toBe((MAX_STEP_MS / 1000) * 25 - ((MAX_STEP_MS / 1000) * 25 % 1));
    expect(advanceClock(-50, 1, 25, 0).frames).toBe(0);
  });
});

function Probe() {
  const s = usePlayback();
  const dispatch = usePlaybackDispatch();
  return (
    <div>
      <span data-testid="frame">{s.frame}</span>
      <span data-testid="playing">{String(s.playing)}</span>
      <button onClick={() => dispatch({ type: 'play' })}>play</button>
      <button onClick={() => dispatch({ type: 'setSpeed', speed: 2 })}>fast</button>
    </div>
  );
}

describe('PlaybackProvider loop', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('advances with time, respects speed, and stops at the last frame', () => {
    render(<PlaybackProvider frameCount={60} fps={25}><Probe /></PlaybackProvider>);
    act(() => screen.getByText('play').click());
    act(() => { vi.advanceTimersByTime(400); });
    const at1x = Number(screen.getByTestId('frame').textContent);
    expect(at1x).toBeGreaterThanOrEqual(8);
    expect(at1x).toBeLessThanOrEqual(11);
    act(() => screen.getByText('fast').click());
    act(() => { vi.advanceTimersByTime(400); });
    const gained = Number(screen.getByTestId('frame').textContent) - at1x;
    expect(gained).toBeGreaterThanOrEqual(17);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId('frame').textContent).toBe('59');
    expect(screen.getByTestId('playing').textContent).toBe('false');
  });

  it('pauses when the tab is hidden', () => {
    render(<PlaybackProvider frameCount={60} fps={25}><Probe /></PlaybackProvider>);
    act(() => screen.getByText('play').click());
    const spy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(screen.getByTestId('playing').textContent).toBe('false');
    spy.mockRestore();
  });

  it('cancels its animation loop on unmount', () => {
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const { unmount } = render(<PlaybackProvider frameCount={60} fps={25}><Probe /></PlaybackProvider>);
    act(() => screen.getByText('play').click());
    unmount();
    expect(cancel).toHaveBeenCalled();
  });
});
