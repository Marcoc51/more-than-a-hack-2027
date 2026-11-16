import { EVIDENCE_DESCRIPTIONS, OUTSIDE_GRADED, REASON_DESCRIPTIONS } from '../scenario/explain';
import { LABELS, eventsAt, frameTime, isGraded, labelAt, nextEvent } from '../scenario/labels';
import type { Scenario } from '../scenario/types';
import { usePlayback } from '../playback/PlaybackProvider';
import { LabelChip } from './Legend';

function metres(v: number | null | undefined): string {
  return v === null || v === undefined ? 'n/a' : `${v.toFixed(2)} m`;
}

export function Inspector({ scenario }: { scenario: Scenario }) {
  const { frame } = usePlayback();
  const { phase3b, smooth50 } = scenario.models;
  const p3 = labelAt(phase3b.labels, frame);
  const base = labelAt(smooth50.labels, frame);
  const ref = scenario.reference ? labelAt(scenario.reference.labels, frame) : null;
  const graded = isGraded(scenario, frame);
  const reasonCode = phase3b.reasons[frame];
  const reasonName = reasonCode === undefined ? undefined : phase3b.reasonNames[String(reasonCode)];
  const evidence = phase3b.evidence[frame];
  const restart = phase3b.restarts.find((r) => r.frame === frame);
  const ball = scenario.frames[frame]?.ball ?? null;
  const active = eventsAt(scenario, frame);
  const upcoming = nextEvent(scenario, frame);
  const nearest = smooth50.nearestTeam[frame];

  return (
    <aside className="inspector" aria-label="Frame inspector">
      <section className="insp-section">
        <h2 className="insp-heading">Frame</h2>
        <p className="insp-frame"><strong>{frame}</strong> · {frameTime(frame, scenario.fps)} · {graded ? 'graded' : 'ungraded'}</p>
      </section>

      <section className="insp-section">
        <h2 className="insp-heading">Possession at this frame</h2>
        <dl className="insp-labels">
          <div><dt>{phase3b.name}</dt><dd><LabelChip label={p3} /> {LABELS[p3].name}</dd></div>
          <div><dt>{smooth50.name}</dt><dd><LabelChip label={base} /> {LABELS[base].name}</dd></div>
          {ref && (
            <div className="insp-ref"><dt>Reference <span className="origin">scenario script</span></dt><dd><LabelChip label={ref} /> {LABELS[ref].name}</dd></div>
          )}
        </dl>
      </section>

      <section className="insp-section">
        <h2 className="insp-heading">Engine evidence <span className="origin">Phase 3B output</span></h2>
        {reasonName === undefined ? (
          <p className="empty">No engine evidence for this frame.</p>
        ) : (
          <dl className="insp-kv">
            <div><dt>State source</dt><dd><code>{reasonName}</code>{restart ? <> · restart ({restart.team})</> : null}</dd></div>
            <div><dt>Control evidence</dt><dd><code>{evidence === '_' ? 'no ball' : evidence === '.' ? 'none' : evidence === 'H' ? 'home' : 'away'}</code></dd></div>
            <div><dt>Nearest home</dt><dd>{metres(phase3b.nearestHome[frame])}</dd></div>
            <div><dt>Nearest away</dt><dd>{metres(phase3b.nearestAway[frame])}</dd></div>
          </dl>
        )}
        <h3 className="insp-subheading">Baseline evidence <span className="origin">smooth50 output</span></h3>
        <p className="insp-text">Nearest team before smoothing: <code>{nearest === '-' ? 'none (no ball)' : nearest === 'H' ? 'home' : 'away'}</code></p>
      </section>

      <section className="insp-section">
        <h2 className="insp-heading">Ball <span className="origin">synthetic observation</span></h2>
        {ball ? (
          <p className="insp-text">Tracked at {ball[0].toFixed(1)} m, {ball[1].toFixed(1)} m · speed field {ball[2].toFixed(1)} m/s</p>
        ) : (
          <p className="insp-text empty">Not tracked in this frame.</p>
        )}
      </section>

      <section className="insp-section">
        <h2 className="insp-heading">Events <span className="origin">synthetic annotations</span></h2>
        {active.length > 0 ? (
          <ul className="insp-events">
            {active.map((e) => (
              <li key={`${e.type}-${e.frame}`}><strong>{e.type}</strong> · {e.source === 'smart-tagging' ? 'Smart Tagging tag' : 'scenario'} · {e.description}</li>
            ))}
          </ul>
        ) : (
          <p className="insp-text empty">No event at this frame.</p>
        )}
        {upcoming && <p className="insp-text insp-next">Next: <strong>{upcoming.type}</strong> at frame {upcoming.frame}</p>}
      </section>

      <section className="insp-section insp-explain">
        <h2 className="insp-heading">What this means <span className="origin">UI description</span></h2>
        <p className="insp-text">
          {graded ? (reasonName ? REASON_DESCRIPTIONS[reasonName] ?? 'No description for this code.' : 'No engine evidence.') : OUTSIDE_GRADED}
        </p>
        {evidence && <p className="insp-text">{EVIDENCE_DESCRIPTIONS[evidence]}</p>}
      </section>
    </aside>
  );
}
