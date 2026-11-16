import { useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { LABELS, frameTime, labelAt, runs, type Run } from '../scenario/labels';
import { scoredMask } from '../scenario/compare';
import type { Scenario } from '../scenario/types';
import { usePlayback, usePlaybackDispatch } from '../playback/PlaybackProvider';
import { clampFrame } from '../playback/reducer';

type TrackKind = 'label' | 'evidence' | 'ball' | 'diff';
export type TimelineVariant = 'explorer' | 'compare';

interface Track {
  id: string;
  name: string;
  origin: string;
  kind: TrackKind;
  values: string;
}

const VALUE_NAMES: Readonly<Record<TrackKind, Readonly<Record<string, string>>>> = {
  label: Object.fromEntries(Object.entries(LABELS).map(([k, v]) => [k, v.name])),
  evidence: { H: 'Home control', A: 'Away control', '.': 'No credible control', _: 'Ball not tracked' },
  ball: { t: 'Ball tracked', n: 'Ball not tracked' },
  diff: { u: 'Not graded (reference X)', '=': 'Agrees with the reference', '!': 'Differs from the reference' },
};

function diffValues(scenario: Scenario, labels: string): string {
  const ref = scenario.reference?.labels ?? '';
  const mask = scoredMask(scenario);
  return mask.map((g, f) => (!g ? 'u' : labels[f] === ref[f] ? '=' : '!')).join('');
}

function tracksFor(scenario: Scenario, variant: TimelineVariant): Track[] {
  const { phase3b, smooth50 } = scenario.models;
  const tracks: Track[] = [];
  if (scenario.reference) {
    tracks.push({ id: 'reference', name: 'Reference', origin: 'scenario script', kind: 'label', values: scenario.reference.labels });
  }
  tracks.push(
    { id: 'phase3b', name: phase3b.name, origin: 'model output', kind: 'label', values: phase3b.labels },
    { id: 'smooth50', name: smooth50.name, origin: 'model output', kind: 'label', values: smooth50.labels },
  );
  if (variant === 'compare') {
    if (scenario.reference) {
      tracks.push(
        { id: 'diff-phase3b', name: 'Phase 3B vs reference', origin: 'computed here', kind: 'diff', values: diffValues(scenario, phase3b.labels) },
        { id: 'diff-smooth50', name: 'smooth50 vs reference', origin: 'computed here', kind: 'diff', values: diffValues(scenario, smooth50.labels) },
      );
    }
    return tracks;
  }
  tracks.push(
    { id: 'evidence', name: 'Control evidence', origin: 'Phase 3B output', kind: 'evidence', values: phase3b.evidence },
    { id: 'ball', name: 'Ball tracking', origin: 'synthetic observation', kind: 'ball', values: scenario.frames.map((f) => (f.ball ? 't' : 'n')).join('') },
  );
  return tracks;
}

function segmentClass(kind: TrackKind, value: string): string {
  if (kind === 'label') return `seg seg-${value}`;
  if (kind === 'evidence') return `seg seg-ev-${{ H: 'home', A: 'away', '.': 'none', _: 'noball' }[value] ?? 'none'}`;
  if (kind === 'diff') return `seg seg-diff-${{ u: 'ungraded', '=': 'agree', '!': 'differ' }[value] ?? 'ungraded'}`;
  return `seg seg-ball-${value === 't' ? 'yes' : 'no'}`;
}

function Segments({ track, n }: { track: Track; n: number }) {
  const parts: Run[] = useMemo(() => runs(track.values), [track.values]);
  const summary = parts.map((r) => `${VALUE_NAMES[track.kind][r.value] ?? r.value} frames ${r.start}–${r.end - 1}`).join('; ');
  return (
    <div className="tl-bar" role="img" aria-label={`${track.name} (${track.origin}): ${summary}`} data-testid={`track-${track.id}`}>
      {parts.map((r) => (
        <div
          key={r.start}
          className={segmentClass(track.kind, r.value)}
          style={{ left: `${(r.start / n) * 100}%`, width: `${((r.end - r.start) / n) * 100}%` }}
          title={`${VALUE_NAMES[track.kind][r.value] ?? r.value} · frames ${r.start}–${r.end - 1}`}
          data-start={r.start}
          data-end={r.end}
        >
          {track.kind === 'label' && r.end - r.start >= n / 25 ? <span>{r.value}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function Timeline({ scenario, variant = 'explorer' }: { scenario: Scenario; variant?: TimelineVariant }) {
  const { frame, frameCount } = usePlayback();
  const dispatch = usePlaybackDispatch();
  const shown = useMemo(() => tracksFor(scenario, variant), [scenario, variant]);
  const n = frameCount;

  const sliderRef = useRef<HTMLDivElement>(null);
  const last = n - 1;

  const seek = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    dispatch({ type: 'seek', frame: clampFrame(Math.floor(((e.clientX - rect.left) / rect.width) * n), n) });
    sliderRef.current?.focus({ preventScroll: true });
  };

  // WAI-ARIA slider keys. preventDefault marks the key as handled, so the page-level shortcuts
  // (which also skip any focused slider) never step a second time.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const big = 10;
    const target: Partial<Record<string, number>> = {
      ArrowRight: frame + (e.shiftKey ? big : 1), ArrowUp: frame + (e.shiftKey ? big : 1),
      ArrowLeft: frame - (e.shiftKey ? big : 1), ArrowDown: frame - (e.shiftKey ? big : 1),
      PageUp: frame + big, PageDown: frame - big, Home: 0, End: last,
    };
    const next = target[e.key];
    if (next === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    dispatch({ type: 'seek', frame: clampFrame(next, n) });
  };

  const p3 = labelAt(scenario.models.phase3b.labels, frame);
  const base = labelAt(scenario.models.smooth50.labels, frame);
  const valueText = `Frame ${frame} of ${last}, ${frameTime(frame, scenario.fps)}. ` +
    `${scenario.models.phase3b.name}: ${LABELS[p3].name}. ${scenario.models.smooth50.name}: ${LABELS[base].name}.`;

  return (
    <section className="timeline" aria-label="Possession timelines">
      <div className="tl-grid">
        <div className="tl-names">
          {shown.map((t) => (
            <div key={t.id} className="tl-name">
              <span className="tl-name-main">{t.name}</span>
              <span className="tl-name-origin">{t.origin}</span>
            </div>
          ))}
          <div className="tl-name tl-name-events"><span className="tl-name-main">Events</span></div>
        </div>
        {/* Pointer seeking: a click or tap anywhere on the bars seeks to that exact frame. */}
        <div className="tl-bars" onClick={seek} data-testid="timeline-bars">
          {shown.map((t) => <Segments key={t.id} track={t} n={n} />)}
          <div className="tl-events" aria-hidden="true">
            {scenario.events.map((ev) => (
              <span key={`${ev.type}-${ev.frame}`} className="tl-event" style={{ left: `${((ev.frame + 0.5) / n) * 100}%` }} title={`${ev.type} · frame ${ev.frame}`} />
            ))}
          </div>
          <div
            className="tl-playhead"
            style={{ left: `${(frame / n) * 100}%`, width: `${100 / n}%` }}
            data-testid="playhead"
            data-frame={frame}
            aria-hidden="true"
          />
          <div
            ref={sliderRef}
            className="tl-seek"
            role="slider"
            tabIndex={0}
            aria-label="Timeline position"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={last}
            aria-valuenow={frame}
            aria-valuetext={valueText}
            onKeyDown={onKeyDown}
            data-testid="timeline-seek"
          />
        </div>
      </div>
    </section>
  );
}
