import { Fragment, useMemo, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { LABELS, frameTime, labelAt, runs, type Run } from '../scenario/labels';
import { scoredMask } from '../scenario/compare';
import type { Scenario } from '../scenario/types';
import { usePlayback, usePlaybackDispatch } from '../playback/PlaybackProvider';
import { clampFrame } from '../playback/reducer';

/** label: H/A/D/X · evidence: engine control codes · ball: t/n · diff: vs a reference ·
 *  pair: two predictions agree (=) or differ (!), with no reference involved. */
export type TrackKind = 'label' | 'evidence' | 'ball' | 'diff' | 'pair';
export type TimelineVariant = 'explorer' | 'compare' | 'mini';

export interface Track {
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
  pair: { '=': 'Predictions agree', '!': 'Predictions differ' },
};

function diffValues(scenario: Scenario, labels: string): string {
  const ref = scenario.reference?.labels ?? '';
  const mask = scoredMask(scenario);
  return mask.map((g, f) => (!g ? 'u' : labels[f] === ref[f] ? '=' : '!')).join('');
}

export interface TrackGroup {
  title: string | null;
  tracks: Track[];
}

/** Tracks in named groups: possession first, then evidence (Explorer) or differences (Compare).
 *  The mini variant (Home) shows only the two model outputs. */
function groupsFor(scenario: Scenario, variant: TimelineVariant): TrackGroup[] {
  const { phase3b, smooth50 } = scenario.models;
  const p3: Track = { id: 'phase3b', name: phase3b.name, origin: 'model output', kind: 'label', values: phase3b.labels };
  const sm: Track = { id: 'smooth50', name: smooth50.name, origin: 'model output', kind: 'label', values: smooth50.labels };
  if (variant === 'mini') return [{ title: null, tracks: [p3, sm] }];
  const possession: Track[] = scenario.reference
    ? [{ id: 'reference', name: 'Reference', origin: 'scenario script', kind: 'label', values: scenario.reference.labels }, p3, sm]
    : [p3, sm];
  if (variant === 'compare') {
    const groups: TrackGroup[] = [{ title: 'Possession', tracks: possession }];
    if (scenario.reference) {
      groups.push({ title: 'Differences from the reference', tracks: [
        { id: 'diff-phase3b', name: 'Possession Engine vs reference', origin: 'computed here', kind: 'diff', values: diffValues(scenario, phase3b.labels) },
        { id: 'diff-smooth50', name: 'smooth50 vs reference', origin: 'computed here', kind: 'diff', values: diffValues(scenario, smooth50.labels) },
      ] });
    }
    return groups;
  }
  return [
    { title: 'Possession', tracks: possession },
    { title: 'Evidence and annotations', tracks: [
      { id: 'evidence', name: 'Control evidence', origin: 'Possession Engine output', kind: 'evidence', values: phase3b.evidence },
      { id: 'ball', name: 'Ball tracking', origin: 'synthetic observation', kind: 'ball', values: scenario.frames.map((f) => (f.ball ? 't' : 'n')).join('') },
    ] },
  ];
}

function segmentClass(kind: TrackKind, value: string): string {
  if (kind === 'label') return `seg seg-${value}`;
  if (kind === 'evidence') return `seg seg-ev-${{ H: 'home', A: 'away', '.': 'none', _: 'noball' }[value] ?? 'none'}`;
  if (kind === 'diff') return `seg seg-diff-${{ u: 'ungraded', '=': 'agree', '!': 'differ' }[value] ?? 'ungraded'}`;
  if (kind === 'pair') return `seg seg-diff-${value === '!' ? 'differ' : 'agree'}`;
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

interface TimelineProps {
  scenario: Scenario;
  variant?: TimelineVariant;
  /** Rendered under the tracks, inside the same section (legend, shortcuts). */
  children?: ReactNode;
}

export function Timeline({ scenario, variant = 'explorer', children }: TimelineProps) {
  const groups = useMemo(() => groupsFor(scenario, variant), [scenario, variant]);
  const events = useMemo(() => scenario.events.map((ev) => ({ key: `${ev.type}-${ev.frame}`, frame: ev.frame, title: `${ev.type} · frame ${ev.frame}` })), [scenario]);
  const valueText = (frame: number, last: number) => {
    const p3 = labelAt(scenario.models.phase3b.labels, frame);
    const base = labelAt(scenario.models.smooth50.labels, frame);
    return `Frame ${frame} of ${last}, ${frameTime(frame, scenario.fps)}. ` +
      `${scenario.models.phase3b.name}: ${LABELS[p3].name}. ${scenario.models.smooth50.name}: ${LABELS[base].name}.`;
  };
  return <TrackTimeline groups={groups} variant={variant} events={variant === 'mini' ? null : events} valueText={valueText}>{children}</TrackTimeline>;
}

export interface TimelineMark {
  key: string;
  frame: number;
  title: string;
}

interface TrackTimelineProps {
  groups: TrackGroup[];
  variant?: TimelineVariant;
  /** Marks on an "Events" row; null hides the row. */
  events: readonly TimelineMark[] | null;
  /** Spoken position of the slider. */
  valueText: (frame: number, last: number) => string;
  children?: ReactNode;
}

/** The shared track timeline: grouped bars, click and keyboard seeking (WAI-ARIA slider) and
 *  the playhead, driven by the surrounding PlaybackProvider. */
export function TrackTimeline({ groups, variant = 'explorer', events, valueText: describe, children }: TrackTimelineProps) {
  const { frame, frameCount } = usePlayback();
  const dispatch = usePlaybackDispatch();
  const showEvents = events !== null;
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

  const valueText = describe(frame, last);

  return (
    <section className={`timeline timeline-${variant}`} aria-label="Possession timelines">
      <div className="tl-grid">
        <div className="tl-names">
          {groups.map((g) => (
            <Fragment key={g.title ?? 'tracks'}>
              {g.title && <div className="tl-group-head">{g.title}</div>}
              {g.tracks.map((t) => (
                <div key={t.id} className="tl-name">
                  <span className="tl-name-main">{t.name}</span>
                  {variant !== 'mini' && <span className="tl-name-origin">{t.origin}</span>}
                </div>
              ))}
            </Fragment>
          ))}
          {showEvents && <div className="tl-name tl-name-events"><span className="tl-name-main">Events</span></div>}
        </div>
        {/* Pointer seeking: a click or tap anywhere on the bars seeks to that exact frame. */}
        <div className="tl-bars" onClick={seek} data-testid="timeline-bars">
          {groups.map((g) => (
            <Fragment key={g.title ?? 'tracks'}>
              {g.title && <div className="tl-group-spacer" aria-hidden="true" />}
              {g.tracks.map((t) => <Segments key={t.id} track={t} n={n} />)}
            </Fragment>
          ))}
          {showEvents && (
            <div className="tl-events" aria-hidden="true">
              {events.map((ev) => (
                <span key={ev.key} className="tl-event" style={{ left: `${((ev.frame + 0.5) / n) * 100}%` }} title={ev.title} />
              ))}
            </div>
          )}
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
      {children}
    </section>
  );
}
