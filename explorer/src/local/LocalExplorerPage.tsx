import { useMemo } from 'react';
import { useDocumentTitle } from '../app/routing';
import { LabelChip, Legend } from '../components/Legend';
import { PageHeading } from '../components/PageHeading';
import { Pitch } from '../components/Pitch';
import { TrackTimeline, type TrackGroup } from '../components/Timeline';
import { Transport } from '../components/Transport';
import { PlaybackProvider, usePlayback } from '../playback/PlaybackProvider';
import { useKeyboardShortcuts } from '../playback/useKeyboardShortcuts';
import { LABELS, labelAt } from '../scenario/labels';
import { LocalDataPanel } from './LocalDataPanel';
import { matchClock, nearestPlayers, pairTrack } from './metrics';
import { useLocalState } from './store';
import type { LocalScenario } from './validate';

const metres = (d: number | null) => (d === null ? 'n/a' : `${d.toFixed(1)} m`);

/** Possession tracks for one or two predictions, their agreement, and ball tracking. */
export function localGroups(scenario: LocalScenario, variant: 'explorer' | 'compare'): TrackGroup[] {
  const primary = { id: 'primary', name: scenario.predictions.name, origin: 'imported prediction', kind: 'label' as const, values: scenario.predictions.labels };
  const groups: TrackGroup[] = [{
    title: 'Possession',
    tracks: scenario.baseline
      ? [primary, { id: 'baseline', name: scenario.baseline.name, origin: 'imported prediction', kind: 'label' as const, values: scenario.baseline.labels }]
      : [primary],
  }];
  if (scenario.baseline) {
    groups.push({ title: 'Prediction agreement (no reference)', tracks: [
      { id: 'pair', name: 'Possession Engine vs smooth50', origin: 'computed here', kind: 'pair', values: pairTrack(scenario.predictions.labels, scenario.baseline.labels) },
    ] });
  }
  if (variant === 'explorer' || !scenario.baseline) {
    groups.push({ title: 'Tracking', tracks: [
      { id: 'ball', name: 'Ball tracking', origin: 'local observation', kind: 'ball', values: scenario.frames.map((f) => (f.ball ? 't' : 'n')).join('') },
    ] });
  }
  return groups;
}

export function localValueText(scenario: LocalScenario) {
  return (frame: number, last: number) => {
    const parts = [`Frame ${frame} of ${last}, source frame ${scenario.sourceFrameStart + frame}.`,
      `${scenario.predictions.name}: ${LABELS[labelAt(scenario.predictions.labels, frame)].name}.`];
    if (scenario.baseline) parts.push(`${scenario.baseline.name}: ${LABELS[labelAt(scenario.baseline.labels, frame)].name}.`);
    return parts.join(' ');
  };
}

/** Labels and tracking context at the playhead, with real source frame numbers. */
export function LocalFrameDetails({ scenario }: { scenario: LocalScenario }) {
  const { frame } = usePlayback();
  const source = scenario.sourceFrameStart + frame;
  const near = nearestPlayers(scenario, frame);
  const primary = labelAt(scenario.predictions.labels, frame);
  const baseline = scenario.baseline ? labelAt(scenario.baseline.labels, frame) : null;
  return (
    <div className="local-frame" data-testid="local-frame">
      <p className="insp-text">Clip frame {frame} · source frame {source} · {matchClock(source, scenario.fps)} video time</p>
      <dl className="insp-labels">
        <div><dt>{scenario.predictions.name} <span className="origin">imported prediction</span></dt><dd><LabelChip label={primary} /> {LABELS[primary].name}</dd></div>
        {baseline && scenario.baseline && <div><dt>{scenario.baseline.name} <span className="origin">imported prediction</span></dt><dd><LabelChip label={baseline} /> {LABELS[baseline].name}</dd></div>}
      </dl>
      {baseline && <p className="insp-text" data-testid="local-pair-state">{baseline === primary ? 'The two predictions agree at this frame.' : 'The two predictions differ at this frame.'}</p>}
      <dl className="insp-labels">
        <div><dt>Nearest home player to the ball <span className="origin">from tracking, computed here</span></dt><dd>{metres(near.home)}</dd></div>
        <div><dt>Nearest away player to the ball <span className="origin">from tracking, computed here</span></dt><dd>{metres(near.away)}</dd></div>
      </dl>
      <p className="insp-text muted">
        Distances come from the exported positions, not from the engine&apos;s internal control evidence, which local exports do not contain.
        Predictions come from your existing CSVs; no inference runs in this viewer and no reference labels are available, so no accuracy is shown.
      </p>
    </div>
  );
}

function LocalWorkspace({ scenario }: { scenario: LocalScenario }) {
  useKeyboardShortcuts();
  const groups = useMemo(() => localGroups(scenario, 'explorer'), [scenario]);
  return (
    <div className="explorer-grid">
      <div className="explorer-main">
        <section className="card card-primary stage" aria-label="Pitch and playback">
          <Pitch scenario={scenario} synthetic={false} />
          <Transport fps={scenario.fps} />
        </section>
        <section className="card local-timeline" aria-label="Local timelines">
          <TrackTimeline groups={groups} events={null} valueText={localValueText(scenario)}>
            <div className="timeline-foot"><Legend evidence={false} /></div>
          </TrackTimeline>
        </section>
      </div>
      <aside className="card inspector local-inspector" aria-label="Local frame inspector">
        <h2 className="eyebrow">Imported frame</h2>
        <LocalFrameDetails scenario={scenario} />
      </aside>
    </div>
  );
}

export default function LocalExplorerPage() {
  useDocumentTitle('Local Explorer');
  const { loaded } = useLocalState();
  return (
    <div className="page">
      <PageHeading title="Local Explorer">
        Authorized actual-match exports from this computer: tracking plus your existing prediction CSVs. The data stays in this
        browser tab&apos;s memory and is never part of the public site.
      </PageHeading>
      <LocalDataPanel />
      {loaded && (
        <PlaybackProvider key={loaded.serial} frameCount={loaded.scenario.frameCount} fps={loaded.scenario.fps}>
          <LocalWorkspace scenario={loaded.scenario} />
        </PlaybackProvider>
      )}
    </div>
  );
}
