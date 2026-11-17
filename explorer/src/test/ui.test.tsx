import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { runs } from '../scenario/labels';
import { ownsKey } from '../playback/useKeyboardShortcuts';
import { S1, S2, renderLoaded } from './util';

const s1 = S1;
const frameText = () => screen.getByTestId('readout').textContent ?? '';
const seekTo = (frame: number) => fireEvent.change(screen.getByRole('slider', { name: 'Frame' }), { target: { value: String(frame) } });

describe('Explorer app', () => {
  it('shows the MAF FC brand, the synthetic-data indicator and no brand logo image', async () => {
    await renderLoaded();
    expect(within(screen.getByRole('banner')).getByText('MAF FC')).toBeInTheDocument();
    expect(screen.getByText('Synthetic data')).toBeInTheDocument();
    // MAF FC is a text wordmark; the only images are the competition organisers' logos (UI3B.2).
    const images = [...document.querySelectorAll('img')];
    expect(images.every((i) => i.classList.contains('organiser-logo') && i.getAttribute('src')?.startsWith('/organisers/'))).toBe(true);
    expect(screen.getByRole('banner').textContent).not.toMatch(/motus/i);
  });

  it('loads the scenario and its provenance', async () => {
    await renderLoaded();
    expect(screen.getByRole('radio', { name: /S1/ })).toBeChecked();
    expect(screen.getByText('Data provenance')).toBeInTheDocument();
    expect(screen.getByText(s1.provenance.engineCommit.slice(0, 7))).toBeInTheDocument();
  });

  it('draws players and the ball from the fixture coordinates', async () => {
    await renderLoaded();
    const first = s1.frames[0]!;
    const p = first.players[0]!;
    expect(screen.getByTestId(`player-${s1.players[0]!.id}`)).toHaveAttribute('transform', `translate(${p[0]} ${p[1]})`);
    expect(screen.getByTestId('ball')).toHaveAttribute('cx', String(first.ball![0]));
    seekTo(120);
    const later = s1.frames[120]!.players[0]!;
    expect(screen.getByTestId(`player-${s1.players[0]!.id}`)).toHaveAttribute('transform', `translate(${later[0]} ${later[1]})`);
  });

  it('marks a missing ball and omits untracked players', async () => {
    await renderLoaded();
    const noBall = s1.frames.findIndex((f) => f.ball === null);
    seekTo(noBall);
    expect(screen.queryByTestId('ball')).toBeNull();
    expect(screen.getByTestId('ball-ghost')).toHaveTextContent('Ball not tracked');
    const f = s1.frames.findIndex((fr) => fr.players.some((p) => p === null));
    seekTo(f);
    const missing = s1.players[s1.frames[f]!.players.findIndex((p) => p === null)]!;
    expect(screen.queryByTestId(`player-${missing.id}`)).toBeNull();
  });

  it('renders every timeline track with exact segment boundaries', async () => {
    await renderLoaded();
    for (const id of ['reference', 'phase3b', 'smooth50', 'evidence', 'ball']) {
      expect(screen.getByTestId(`track-${id}`)).toBeInTheDocument();
    }
    const segs = screen.getByTestId('track-phase3b').querySelectorAll('.seg');
    const expected = runs(s1.models.phase3b.labels);
    expect(segs).toHaveLength(expected.length);
    segs.forEach((seg, i) => {
      expect(seg.getAttribute('data-start')).toBe(String(expected[i]!.start));
      expect(seg.getAttribute('data-end')).toBe(String(expected[i]!.end));
    });
  });

  it('shows the H/A/D/X legend with names, not colour alone', async () => {
    await renderLoaded();
    const legend = screen.getByLabelText('Legend');
    for (const name of ['Home possession', 'Away possession', 'Dead ball', 'No answer']) {
      expect(within(legend).getByText(name)).toBeInTheDocument();
    }
  });

  it('keeps pitch, timeline, transport and inspector on the same frame', async () => {
    await renderLoaded();
    seekTo(200);
    expect(frameText()).toContain('Frame 200');
    expect(screen.getByTestId('playhead')).toHaveAttribute('data-frame', '200');
    const inspector = screen.getByRole('complementary', { name: 'Frame inspector' });
    expect(within(inspector).getByText('200')).toBeInTheDocument();
    const label = s1.models.phase3b.labels[200];
    expect(within(inspector).getAllByLabelText(label === 'D' ? 'Dead ball' : /possession|answer/).length).toBeGreaterThan(0);
  });

  it('seeks when the timeline is clicked', async () => {
    await renderLoaded();
    const bars = screen.getByTestId('timeline-bars');
    bars.getBoundingClientRect = () => ({ left: 0, width: 400, top: 0, height: 100, right: 400, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(bars, { clientX: 250.7 });
    expect(frameText()).toContain('Frame 250');
  });

  it('labels engine evidence, annotations and UI text separately', async () => {
    await renderLoaded();
    seekTo(100);
    const inspector = screen.getByRole('complementary', { name: 'Frame inspector' });
    expect(within(inspector).getByText('Possession Engine output')).toBeInTheDocument();
    expect(within(inspector).getByText('smooth50 output')).toBeInTheDocument();
    expect(within(inspector).getByText('synthetic annotations')).toBeInTheDocument();
    expect(within(inspector).getByText('UI description')).toBeInTheDocument();
    expect(within(inspector).getByText(s1.models.phase3b.reasonNames[String(s1.models.phase3b.reasons[100])]!)).toBeInTheDocument();
  });
});

describe('keyboard shortcuts', () => {
  it('steps with arrows and Shift+arrows, and toggles with Space', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(frameText()).toContain('Frame 2');
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(frameText()).toContain('Frame 12');
    await user.keyboard('{ArrowLeft}');
    expect(frameText()).toContain('Frame 11');
    const play = screen.getByRole('button', { name: 'Play' });
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard(' ');
    expect(play).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not steal keys from form controls that own them', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    const select = screen.getByLabelText('Speed');
    select.focus();
    await user.keyboard('{ArrowRight}');
    expect(frameText()).toContain('Frame 0');
    expect(ownsKey(select, 'ArrowRight')).toBe(true);
    const slider = screen.getByRole('slider', { name: 'Frame' });
    expect(ownsKey(slider, 'ArrowLeft')).toBe(true);
    expect(ownsKey(slider, ' ')).toBe(false);
    expect(ownsKey(screen.getByRole('button', { name: 'Next frame' }), ' ')).toBe(true);
  });
});

describe('scenario switching', () => {
  it('loads the selected scenario and resets playback, with no stale data', async () => {
    await renderLoaded();
    seekTo(300);
    expect(frameText()).toContain('Frame 300');
    act(() => screen.getByRole('radio', { name: /S2/ }).click());
    await screen.findByText(`/ ${S2.frameCount - 1}`, { exact: false });
    expect(frameText()).toContain('Frame 0 ');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    const segs = screen.getByTestId('track-phase3b').querySelectorAll('.seg');
    expect(segs).toHaveLength(runs(S2.models.phase3b.labels).length);
    expect(screen.getByRole('radio', { name: /S2/ })).toBeChecked();
  });
});

describe('timeline seek control (A-01)', () => {
  const seekControl = () => screen.getByRole('slider', { name: 'Timeline position' });

  it('is a focusable slider with an accessible name and current value', async () => {
    await renderLoaded();
    const slider = seekControl();
    expect(slider).toHaveAttribute('tabindex', '0');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', String(s1.frameCount - 1));
    expect(slider).toHaveAttribute('aria-valuenow', '0');
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^Frame 0 of 399, 0\.00 s\. Rule-Based Possession Engine: No answer\./);
  });

  it('seeks exactly one frame per arrow, ten with Shift, and supports Home, End, PageUp and PageDown', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    seekControl().focus();
    await user.keyboard('{ArrowRight}');
    expect(frameText()).toContain('Frame 1 ');      // not 2: no double handling with the global shortcut
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(frameText()).toContain('Frame 11 ');
    await user.keyboard('{ArrowLeft}{ArrowDown}{ArrowUp}');
    expect(frameText()).toContain('Frame 10 ');
    await user.keyboard('{PageUp}');
    expect(frameText()).toContain('Frame 20 ');
    await user.keyboard('{End}');
    expect(frameText()).toContain('Frame 399 ');
    await user.keyboard('{ArrowRight}');
    expect(frameText()).toContain('Frame 399 ');    // clamped at the last frame
    await user.keyboard('{PageDown}');
    expect(frameText()).toContain('Frame 389 ');
    await user.keyboard('{Home}{ArrowLeft}');
    expect(frameText()).toContain('Frame 0 ');      // clamped at the first frame
  });

  it('keeps the slider value, playhead and inspector in sync', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    seekControl().focus();
    await user.keyboard('{End}{PageDown}');
    expect(seekControl()).toHaveAttribute('aria-valuenow', '389');
    expect(screen.getByTestId('playhead')).toHaveAttribute('data-frame', '389');
    const inspector = screen.getByRole('complementary', { name: 'Frame inspector' });
    expect(within(inspector).getByText('389')).toBeInTheDocument();
  });

  it('leaves Space to the global play/pause shortcut, toggling once', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    seekControl().focus();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('is reachable with Tab', async () => {
    const user = userEvent.setup();
    await renderLoaded();
    for (let i = 0; i < 30 && document.activeElement !== seekControl(); i++) await user.tab();
    expect(seekControl()).toHaveFocus();
  });

  it('pointer seeking still works and moves focus to the seek control', async () => {
    await renderLoaded();
    const bars = screen.getByTestId('timeline-bars');
    bars.getBoundingClientRect = () => ({ left: 10, width: 800, top: 0, height: 100, right: 810, bottom: 100, x: 10, y: 0, toJSON: () => ({}) });
    fireEvent.click(bars, { clientX: 10 + 800 * (123.5 / 400) });
    expect(frameText()).toContain('Frame 123 ');
    expect(seekControl()).toHaveFocus();
    fireEvent.click(bars, { clientX: 10 + 800 });   // right edge clamps to the last frame
    expect(frameText()).toContain('Frame 399 ');
  });
});
