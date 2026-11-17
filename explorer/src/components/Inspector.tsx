import { CalendarClock, ChevronDown, Cpu, Info, Lightbulb, Radar } from 'lucide-react';
import { EVIDENCE_DESCRIPTIONS, OUTSIDE_GRADED, REASON_DESCRIPTIONS } from '../scenario/explain';
import { LABELS, eventsAt, frameTime, isGraded, labelAt, nextEvent } from '../scenario/labels';
import type { Scenario } from '../scenario/types';
import { usePlayback } from '../playback/PlaybackProvider';
import { Icon } from './Icon';
import { LabelChip } from './Legend';

function metres(v: number | null | undefined): string {
  return v === null || v === undefined ? 'n/a' : `${v.toFixed(2)} m`;
}

const CONTROL = { _: 'no ball', '.': 'none', H: 'home', A: 'away' } as const;

/** The selected frame, in order of importance: labels, a short interpretation, the key evidence,
 *  scenario events, then the raw engine and baseline codes in a disclosure. Every value says
 *  where it comes from (model output, synthetic observation, annotation or UI text). */
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
    <aside className="inspector card" aria-label="Frame inspector">
      <section className="insp-now" aria-labelledby="insp-now-heading">
        <h2 id="insp-now-heading" className="eyebrow"><Icon icon={Info} /> At this frame</h2>
        <p className="insp-frame"><strong>{frame}</strong> <span>{frameTime(frame, scenario.fps)} · {graded ? 'graded' : 'ungraded'}</span></p>
        <dl className="insp-labels">
          <div><dt>{phase3b.name}</dt><dd><LabelChip label={p3} /> {LABELS[p3].name}</dd></div>
          <div><dt>{smooth50.name}</dt><dd><LabelChip label={base} /> {LABELS[base].name}</dd></div>
          {ref && (
            <div className="insp-ref"><dt>Reference <span className="origin">scenario script</span></dt><dd><LabelChip label={ref} /> {LABELS[ref].name}</dd></div>
          )}
        </dl>
      </section>

      <div className="insp-grid">
        <section className="insp-section" aria-labelledby="insp-why-heading">
          <h2 id="insp-why-heading" className="eyebrow"><Icon icon={Lightbulb} /> Why <span className="origin">UI description</span></h2>
          <p className="insp-text">
            {graded ? (reasonName ? REASON_DESCRIPTIONS[reasonName] ?? 'No description for this code.' : 'No engine evidence.') : OUTSIDE_GRADED}
          </p>
          {evidence && <p className="insp-text muted">{EVIDENCE_DESCRIPTIONS[evidence]}</p>}
        </section>

        <section className="insp-section" aria-labelledby="insp-evidence-heading">
          <h2 id="insp-evidence-heading" className="eyebrow"><Icon icon={Radar} /> Evidence <span className="origin">Possession Engine output</span></h2>
          {reasonName === undefined ? (
            <p className="empty">No engine evidence for this frame.</p>
          ) : (
            <dl className="stat-tiles">
              <div><dt>Nearest home</dt><dd>{metres(phase3b.nearestHome[frame])}</dd></div>
              <div><dt>Nearest away</dt><dd>{metres(phase3b.nearestAway[frame])}</dd></div>
              <div><dt>Control evidence</dt><dd><code>{evidence ? CONTROL[evidence as keyof typeof CONTROL] : 'n/a'}</code></dd></div>
              <div className="stat-tile-observed">
                <dt>Ball <span className="origin">synthetic observation</span></dt>
                <dd>{ball ? <>{ball[2].toFixed(1)} m/s <small>at {ball[0].toFixed(1)} m, {ball[1].toFixed(1)} m</small></> : <span className="empty">Not tracked in this frame.</span>}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>

      <section className="insp-section" aria-labelledby="insp-events-heading">
        <h2 id="insp-events-heading" className="eyebrow"><Icon icon={CalendarClock} /> Events <span className="origin">synthetic annotations</span></h2>
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

      <details className="disclosure insp-details">
        <summary><Icon icon={Cpu} /> Engine details <Icon icon={ChevronDown} className="disclosure-chevron" /></summary>
        <div className="disclosure-body">
          <dl className="insp-kv">
            <div><dt>Possession Engine state source</dt><dd><code>{reasonName ?? 'n/a'}</code>{restart ? <> · restart ({restart.team})</> : null}</dd></div>
            <div><dt>Possession Engine control code</dt><dd><code>{evidence ?? 'n/a'}</code></dd></div>
            <div>
              <dt>Baseline nearest team <span className="origin">smooth50 output</span></dt>
              <dd><code>{nearest === '-' ? 'none (no ball)' : nearest === 'H' ? 'home' : 'away'}</code></dd>
            </div>
          </dl>
          <p className="insp-text muted">The state source is the code the Possession Engine state machine records for this frame; the baseline value is the nearest team before smooth50&apos;s ±50-frame vote.</p>
        </div>
      </details>
    </aside>
  );
}
