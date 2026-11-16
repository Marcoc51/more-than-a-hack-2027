import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { runs } from '../scenario/labels';
import { SCENARIOS } from '../scenario/scenarios';
import type { Scenario } from '../scenario/types';
import { ownsKey } from '../playback/useKeyboardShortcuts';

const s1 = SCENARIOS[0]!;
const frameText = () => screen.getByTestId('readout').textContent ?? '';
const seekTo = (frame: number) => fireEvent.change(screen.getByRole('slider', { name: 'Frame' }), { target: { value: String(frame) } });

describe('Explorer app', () => {
  it('shows the MAF FC brand, the synthetic-data indicator and no logo image', () => {
    render(<App scenarios={SCENARIOS} />);
    expect(screen.getByText('MAF FC')).toBeInTheDocument();
    expect(screen.getByText('Synthetic data')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('banner').textContent).not.toMatch(/motus/i);
  });

  it('loads the scenario and its provenance', () => {
    render(<App scenarios={SCENARIOS} />);
    expect(screen.getByRole('radio', { name: /S1/ })).toBeChecked();
    expect(screen.getByText('Data provenance')).toBeInTheDocument();
    expect(screen.getByText(s1.provenance.engineCommit.slice(0, 7))).toBeInTheDocument();
  });

  it('draws players and the ball from the fixture coordinates', () => {
    render(<App scenarios={SCENARIOS} />);
    const first = s1.frames[0]!;
    const p = first.players[0]!;
    expect(screen.getByTestId(`player-${s1.players[0]!.id}`)).toHaveAttribute('transform', `translate(${p[0]} ${p[1]})`);
    expect(screen.getByTestId('ball')).toHaveAttribute('cx', String(first.ball![0]));
    seekTo(120);
    const later = s1.frames[120]!.players[0]!;
    expect(screen.getByTestId(`player-${s1.players[0]!.id}`)).toHaveAttribute('transform', `translate(${later[0]} ${later[1]})`);
  });

  it('marks a missing ball and omits untracked players', () => {
    render(<App scenarios={SCENARIOS} />);
    const noBall = s1.frames.findIndex((f) => f.ball === null);
    seekTo(noBall);
    expect(screen.queryByTestId('ball')).toBeNull();
    expect(screen.getByTestId('ball-ghost')).toHaveTextContent('Ball not tracked');
    const f = s1.frames.findIndex((fr) => fr.players.some((p) => p === null));
    seekTo(f);
    const missing = s1.players[s1.frames[f]!.players.findIndex((p) => p === null)]!;
    expect(screen.queryByTestId(`player-${missing.id}`)).toBeNull();
  });

  it('renders every timeline track with exact segment boundaries', () => {
    render(<App scenarios={SCENARIOS} />);
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

  it('shows the H/A/D/X legend with names, not colour alone', () => {
    render(<App scenarios={SCENARIOS} />);
    const legend = screen.getByLabelText('Legend');
    for (const name of ['Home possession', 'Away possession', 'Dead ball', 'No answer']) {
      expect(within(legend).getByText(name)).toBeInTheDocument();
    }
  });

  it('keeps pitch, timeline, transport and inspector on the same frame', () => {
    render(<App scenarios={SCENARIOS} />);
    seekTo(200);
    expect(frameText()).toContain('Frame 200');
    expect(screen.getByTestId('playhead')).toHaveAttribute('data-frame', '200');
    const inspector = screen.getByRole('complementary', { name: 'Frame inspector' });
    expect(within(inspector).getByText('200')).toBeInTheDocument();
    const label = s1.models.phase3b.labels[200];
    expect(within(inspector).getAllByLabelText(label === 'D' ? 'Dead ball' : /possession|answer/).length).toBeGreaterThan(0);
  });

  it('seeks when the timeline is clicked', () => {
    render(<App scenarios={SCENARIOS} />);
    const bars = screen.getByTestId('timeline-bars');
    bars.getBoundingClientRect = () => ({ left: 0, width: 400, top: 0, height: 100, right: 400, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(bars, { clientX: 250.7 });
    expect(frameText()).toContain('Frame 250');
  });

  it('labels engine evidence, annotations and UI text separately', () => {
    render(<App scenarios={SCENARIOS} />);
    seekTo(100);
    const inspector = screen.getByRole('complementary', { name: 'Frame inspector' });
    expect(within(inspector).getByText('Phase 3B output')).toBeInTheDocument();
    expect(within(inspector).getByText('smooth50 output')).toBeInTheDocument();
    expect(within(inspector).getByText('synthetic annotations')).toBeInTheDocument();
    expect(within(inspector).getByText('UI description')).toBeInTheDocument();
    expect(within(inspector).getByText(s1.models.phase3b.reasonNames[String(s1.models.phase3b.reasons[100])]!)).toBeInTheDocument();
  });
});

describe('keyboard shortcuts', () => {
  it('steps with arrows and Shift+arrows, and toggles with Space', async () => {
    const user = userEvent.setup();
    render(<App scenarios={SCENARIOS} />);
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
    render(<App scenarios={SCENARIOS} />);
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
  it('resets playback for the newly selected scenario', () => {
    const s2: Scenario = { ...s1, id: 's2', title: 'Copy for the switching test', frameCount: 50, frames: s1.frames.slice(0, 50),
      models: { phase3b: { ...s1.models.phase3b, labels: s1.models.phase3b.labels.slice(0, 50), evidence: s1.models.phase3b.evidence.slice(0, 50), reasons: s1.models.phase3b.reasons.slice(0, 50), nearestHome: s1.models.phase3b.nearestHome.slice(0, 50), nearestAway: s1.models.phase3b.nearestAway.slice(0, 50) },
        smooth50: { ...s1.models.smooth50, labels: s1.models.smooth50.labels.slice(0, 50), nearestTeam: s1.models.smooth50.nearestTeam.slice(0, 50) } },
      reference: null, events: [] };
    render(<App scenarios={[s1, s2]} />);
    seekTo(300);
    expect(frameText()).toContain('Frame 300');
    act(() => screen.getByRole('radio', { name: /S2/ }).click());
    expect(frameText()).toContain('Frame 0');
    expect(frameText()).toContain('/ 49');
    expect(screen.queryByTestId('track-reference')).toBeNull();
  });
});

describe('timeline seek control (A-01)', () => {
  const seekControl = () => screen.getByRole('slider', { name: 'Timeline position' });

  it('is a focusable slider with an accessible name and current value', () => {
    render(<App scenarios={SCENARIOS} />);
    const slider = seekControl();
    expect(slider).toHaveAttribute('tabindex', '0');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', String(s1.frameCount - 1));
    expect(slider).toHaveAttribute('aria-valuenow', '0');
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^Frame 0 of 399, 0\.00 s\. MAF FC Phase 3B: No answer\./);
  });

  it('seeks exactly one frame per arrow, ten with Shift, and supports Home, End, PageUp and PageDown', async () => {
    const user = userEvent.setup();
    render(<App scenarios={SCENARIOS} />);
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
    render(<App scenarios={SCENARIOS} />);
    seekControl().focus();
    await user.keyboard('{End}{PageDown}');
    expect(seekControl()).toHaveAttribute('aria-valuenow', '389');
    expect(screen.getByTestId('playhead')).toHaveAttribute('data-frame', '389');
    const inspector = screen.getByRole('complementary', { name: 'Frame inspector' });
    expect(within(inspector).getByText('389')).toBeInTheDocument();
  });

  it('leaves Space to the global play/pause shortcut, toggling once', async () => {
    const user = userEvent.setup();
    render(<App scenarios={SCENARIOS} />);
    seekControl().focus();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('is reachable with Tab', async () => {
    const user = userEvent.setup();
    render(<App scenarios={SCENARIOS} />);
    for (let i = 0; i < 30 && document.activeElement !== seekControl(); i++) await user.tab();
    expect(seekControl()).toHaveFocus();
  });

  it('pointer seeking still works and moves focus to the seek control', () => {
    render(<App scenarios={SCENARIOS} />);
    const bars = screen.getByTestId('timeline-bars');
    bars.getBoundingClientRect = () => ({ left: 10, width: 800, top: 0, height: 100, right: 810, bottom: 100, x: 10, y: 0, toJSON: () => ({}) });
    fireEvent.click(bars, { clientX: 10 + 800 * (123.5 / 400) });
    expect(frameText()).toContain('Frame 123 ');
    expect(seekControl()).toHaveFocus();
    fireEvent.click(bars, { clientX: 10 + 800 });   // right edge clamps to the last frame
    expect(frameText()).toContain('Frame 399 ');
  });
});
