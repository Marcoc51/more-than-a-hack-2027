import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle, useScenarioParam } from '../app/routing';
import { LabelChip, Legend } from '../components/Legend';
import { PageHeading } from '../components/PageHeading';
import { Pitch } from '../components/Pitch';
import { ScenarioPanel } from '../components/ScenarioPanel';
import { ScenarioStatus } from '../components/ScenarioStatus';
import { Timeline } from '../components/Timeline';
import { Transport } from '../components/Transport';
import { PlaybackProvider, usePlayback, usePlaybackDispatch } from '../playback/PlaybackProvider';
import { useKeyboardShortcuts } from '../playback/useKeyboardShortcuts';
import {
  LABEL_ORDER, MODEL_IDS, agreement, confusion, disagreements, eventsIn, scoredMask, labelCounts, percent,
  type Disagreement,
} from '../scenario/compare';
import { interpret } from '../scenario/interpretation';
import { LABELS, eventsAt, frameTime, labelAt } from '../scenario/labels';
import { SCENARIO_ENTRIES, useScenario } from '../scenario/scenarios';
import type { ModelId, Scenario } from '../scenario/types';

const ROLE: Record<ModelId | 'reference', string> = {
  reference: 'Scripted reference',
  phase3b: 'Prediction',
  smooth50: 'Baseline',
};

function score(v: number): string {
  return v.toFixed(3);
}

function ModelCards({ scenario }: { scenario: Scenario }) {
  const mask = useMemo(() => scoredMask(scenario), [scenario]);
  const ref = scenario.reference?.labels ?? '';
  const graded = mask.filter(Boolean).length;
  return (
    <div className="model-cards">
      <article className="card model-card model-card-reference">
        <p className="eyebrow">{ROLE.reference}</p>
        <h3 className="model-name">Synthetic reference</h3>
        <p className="model-source">Written from the scenario script, not produced by any model.</p>
        <dl className="kv">
          <div><dt>Graded frames</dt><dd>{graded} of {scenario.frameCount}</dd></div>
          <div><dt>Possessions (H/A spells)</dt><dd>{scenario.models.phase3b.scores.nReferenceSpells}</dd></div>
        </dl>
      </article>
      {MODEL_IDS.map((m) => {
        const model = scenario.models[m];
        const a = agreement(ref, model.labels, mask);
        return (
          <article key={m} className={`card model-card model-card-${m}`} data-testid={`model-card-${m}`}>
            <p className="eyebrow">{ROLE[m]}</p>
            <h3 className="model-name">{model.name}</h3>
            <p className="model-source"><code>{model.producer}</code></p>
            <dl className="kv">
              <div><dt>Frame agreement</dt><dd data-testid={`agreement-${m}`}>{percent(a.rate)} <span className="muted">({a.agree}/{a.graded})</span></dd></div>
              <div><dt>Frames that differ</dt><dd>{a.disagree}</dd></div>
              <div><dt>spellF1 (official)</dt><dd data-testid={`spellf1-${m}`}>{score(model.scores.spellF1Mean)}</dd></div>
              <div><dt>macroF1 (official)</dt><dd>{score(model.scores.macroF1)}</dd></div>
              <div><dt>Possessions found</dt><dd>{model.scores.nPredictedSpells} <span className="muted">(reference {model.scores.nReferenceSpells})</span></dd></div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}

function AtFrame({ scenario }: { scenario: Scenario }) {
  const { frame } = usePlayback();
  const ref = scenario.reference ? labelAt(scenario.reference.labels, frame) : null;
  const events = eventsAt(scenario, frame);
  return (
    <section className="card at-frame" aria-labelledby="at-frame-heading">
      <h2 id="at-frame-heading" className="panel-heading">At frame {frame} · {frameTime(frame, scenario.fps)}</h2>
      <dl className="insp-labels">
        {ref && <div><dt>Reference <span className="origin">scenario script</span></dt><dd><LabelChip label={ref} /> {LABELS[ref].name}</dd></div>}
        {MODEL_IDS.map((m) => {
          const l = labelAt(scenario.models[m].labels, frame);
          return <div key={m}><dt>{scenario.models[m].name} <span className="origin">{m === 'phase3b' ? 'prediction' : 'baseline'}</span></dt><dd><LabelChip label={l} /> {LABELS[l].name}</dd></div>;
        })}
      </dl>
      <p className="insp-text">
        {events.length ? events.map((e) => `${e.type}: ${e.description}`).join(' ') : 'No scenario event at this frame.'}
      </p>
    </section>
  );
}

type Filter = 'all' | 'phase3b' | 'smooth50' | 'both';
type Sort = 'start' | 'duration';

function DisagreementTable({ scenario }: { scenario: Scenario }) {
  const all = useMemo(() => disagreements(scenario), [scenario]);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('start');
  const { frame } = usePlayback();
  const dispatch = usePlaybackDispatch();
  const filterId = useId();
  const sortId = useId();

  const rows = all
    .filter((d) => filter === 'all' || (filter === 'both' ? d.models.length === 2 : d.models.includes(filter)))
    .sort((a, b) => (sort === 'start' ? a.start - b.start : (b.end - b.start) - (a.end - a.start) || a.start - b.start));
  const differs = (d: Disagreement, m: ModelId) => d.models.includes(m);

  return (
    <section className="card disagreements" aria-labelledby="disagreements-heading">
      <div className="section-head">
        <h2 id="disagreements-heading" className="section-title">Where the outputs differ from the reference</h2>
        <div className="table-controls">
          <label htmlFor={filterId}>Show</label>
          <select id={filterId} className="select select-sm" value={filter} onChange={(e) => setFilter(e.currentTarget.value as Filter)}>
            <option value="all">All differences</option>
            <option value="phase3b">Phase 3B differs</option>
            <option value="smooth50">smooth50 differs</option>
            <option value="both">Both differ</option>
          </select>
          <label htmlFor={sortId}>Sort by</label>
          <select id={sortId} className="select select-sm" value={sort} onChange={(e) => setSort(e.currentTarget.value as Sort)}>
            <option value="start">Start frame</option>
            <option value="duration">Longest first</option>
          </select>
        </div>
      </div>
      <p className="section-note">
        Graded frames only (frames where the reference is not X). Each row is a stretch where the three labels stay the same and at least one model
        differs from the reference. Choose a row to move the playhead there.
      </p>
      {rows.length === 0 ? (
        <p className="empty">{all.length === 0 ? 'Both models agree with the reference on every graded frame.' : 'No differences match this filter.'}</p>
      ) : (
        <div className="table-scroll" role="region" aria-labelledby="disagreements-heading" tabIndex={0}>
          <table className="data-table" data-testid="disagreement-table">
            <caption className="sr-only">Intervals where a model differs from the synthetic reference, {rows.length} rows</caption>
            <thead>
              <tr>
                <th scope="col">Frames</th>
                <th scope="col">Duration</th>
                <th scope="col">Reference</th>
                <th scope="col">Phase 3B</th>
                <th scope="col">smooth50</th>
                <th scope="col">Scenario event</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const current = frame >= d.start && frame < d.end;
                const events = eventsIn(scenario, d.start, d.end);
                return (
                  <tr key={d.start} className={current ? 'is-current' : undefined} aria-current={current ? 'true' : undefined}>
                    <td className="num">{d.start}–{d.end - 1}</td>
                    <td className="num">{d.end - d.start} f · {((d.end - d.start) / scenario.fps).toFixed(2)} s</td>
                    <td><LabelChip label={d.reference} /></td>
                    <td className={differs(d, 'phase3b') ? 'cell-diff' : undefined}><LabelChip label={d.phase3b} />{differs(d, 'phase3b') && <span className="sr-only"> (differs)</span>}</td>
                    <td className={differs(d, 'smooth50') ? 'cell-diff' : undefined}><LabelChip label={d.smooth50} />{differs(d, 'smooth50') && <span className="sr-only"> (differs)</span>}</td>
                    <td className="cell-event">{events.length ? events.map((e) => e.type).join(', ') : '—'}</td>
                    <td className="cell-actions">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => dispatch({ type: 'seek', frame: d.start })}
                        aria-label={`Go to frame ${d.start}`}>
                        Go to {d.start}
                      </button>
                      <Link className="link-sm" to={`/explorer?scenario=${scenario.id}&frame=${d.start}`}>Open in Explorer</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CountsAndConfusion({ scenario }: { scenario: Scenario }) {
  const mask = useMemo(() => scoredMask(scenario), [scenario]);
  const ref = scenario.reference?.labels ?? '';
  const series: { id: string; name: string; labels: string }[] = [
    { id: 'reference', name: 'Reference', labels: ref },
    ...MODEL_IDS.map((m) => ({ id: m, name: scenario.models[m].name, labels: scenario.models[m].labels })),
  ];
  return (
    <section className="card" aria-labelledby="counts-heading">
      <h2 id="counts-heading" className="section-title">Labels on graded frames</h2>
      <p className="section-note">Every count on this page uses the official scorer's graded frames: the frames where the reference is not X. A model answering X on a graded frame counts as a miss.</p>
      <div className="table-scroll" role="region" aria-labelledby="counts-heading" tabIndex={0}>
        <table className="data-table" data-testid="counts-table">
          <caption className="sr-only">Frames per label, graded frames only</caption>
          <thead><tr><th scope="col">Series</th>{LABEL_ORDER.map((l) => <th key={l} scope="col"><LabelChip label={l} /></th>)}</tr></thead>
          <tbody>
            {series.map((s) => {
              const c = labelCounts(s.labels, mask);
              return <tr key={s.id}><th scope="row">{s.name}</th>{LABEL_ORDER.map((l) => <td key={l} className="num">{c[l]}</td>)}</tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="confusions">
        {MODEL_IDS.map((m) => {
          const cm = confusion(ref, scenario.models[m].labels, mask);
          const headingId = `confusion-${m}`;
          return (
            <div key={m} className="confusion">
              <h3 id={headingId} className="subsection-title">{scenario.models[m].name}: reference (rows) × output (columns)</h3>
              <div className="table-scroll" role="region" aria-labelledby={headingId} tabIndex={0}>
                <table className="data-table confusion-table" data-testid={`confusion-${m}`}>
                  <thead><tr><th scope="col"><span className="sr-only">Reference label</span></th>{LABEL_ORDER.map((l) => <th key={l} scope="col"><LabelChip label={l} /></th>)}</tr></thead>
                  <tbody>
                    {LABEL_ORDER.map((r, i) => (
                      <tr key={r}><th scope="row"><LabelChip label={r} /></th>
                        {LABEL_ORDER.map((p, j) => <td key={p} className={`num${i === j ? ' cell-match' : cm[i]![j] ? ' cell-diff' : ''}`}>{cm[i]![j]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function InterpretationCard({ scenario }: { scenario: Scenario }) {
  const text = interpret(scenario);
  return (
    <section className="card interpretation" aria-labelledby="interpretation-heading">
      <h2 id="interpretation-heading" className="section-title">Reading this scenario</h2>
      <dl className="interpretation-list">
        <div><dt>Scripted reference <span className="origin">ground truth for this synthetic scenario</span></dt><dd>{text.reference}</dd></div>
        <div><dt>What the models observe <span className="origin">synthetic tracking and tags</span></dt><dd>{text.observations}</dd></div>
        <div><dt>What the models output <span className="origin">computed from exported labels</span></dt><dd>{text.predictions}</dd></div>
        <div><dt>Interpretation <span className="origin">UI description</span></dt><dd>{text.interpretation}</dd></div>
      </dl>
    </section>
  );
}

function CompareWorkspace({ scenario }: { scenario: Scenario }) {
  useKeyboardShortcuts();
  return (
    <div className="compare-body">
      <ModelCards scenario={scenario} />
      <div className="compare-stage">
        <div className="compare-pitch">
          <Pitch scenario={scenario} />
          <Transport fps={scenario.fps} />
        </div>
        <AtFrame scenario={scenario} />
      </div>
      <Timeline scenario={scenario} variant="compare" />
      <Legend variant="compare" />
      <DisagreementTable scenario={scenario} />
      <CountsAndConfusion scenario={scenario} />
      <InterpretationCard scenario={scenario} />
    </div>
  );
}

export function ComparePage() {
  useDocumentTitle('Compare');
  const { id, select } = useScenarioParam();
  const [state, retry] = useScenario(id);
  return (
    <div className="page">
      <PageHeading title="Compare" synthetic>
        MAF FC Phase 3B and the official smooth50 baseline, measured against each synthetic scenario&apos;s
        scripted reference. These are synthetic checks of behaviour, not the competition score.
      </PageHeading>
      <div className="compare">
        <ScenarioPanel entries={SCENARIO_ENTRIES} activeId={id} onSelect={select}
          scenario={state.status === 'ready' ? state.scenario : null} />
        <ScenarioStatus state={state} onRetry={retry}>
          {(scenario) => (
            <PlaybackProvider key={scenario.id} frameCount={scenario.frameCount} fps={scenario.fps}>
              <CompareWorkspace scenario={scenario} />
            </PlaybackProvider>
          )}
        </ScenarioStatus>
      </div>
      <aside className="card note-card" aria-label="About these numbers">
        <h2 className="section-title">About these numbers</h2>
        <ul>
          <li><strong>Frame agreement</strong> is computed here, in the browser: the share of graded frames (frames where the reference is not X, the official scorer's rule) on which an output equals the reference.</li>
          <li><strong>spellF1</strong> (the competition ranking metric: possessions matched one-to-one by temporal IoU, F1 averaged over IoU 0.3–0.7) and <strong>macroF1</strong> (the first tie-break: per-frame F1 averaged over H, A and D) come from the organisers&apos; public scorer, <code>evaluation/possession_metrics.py</code>, vendored unchanged in <code>tools/vendor/</code> and run offline by the exporter.</li>
          <li>macroF1 averages over H, A and D. In a scenario with no dead ball the D term is zero, so even a perfect output scores at most 0.667.</li>
          <li>All figures describe four short synthetic scenarios. They are not, and do not predict, the score on the competition match.</li>
        </ul>
      </aside>
    </div>
  );
}
