import { Info, Rows3, Split, Table2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useDocumentTitle } from '../app/routing';
import { Icon } from '../components/Icon';
import { LabelChip, Legend } from '../components/Legend';
import { PageHeading } from '../components/PageHeading';
import { Pitch } from '../components/Pitch';
import { TrackTimeline } from '../components/Timeline';
import { Transport } from '../components/Transport';
import { PlaybackProvider, usePlayback, usePlaybackDispatch } from '../playback/PlaybackProvider';
import { useKeyboardShortcuts } from '../playback/useKeyboardShortcuts';
import { LABEL_ORDER, percent } from '../scenario/compare';
import { LocalDataPanel } from './LocalDataPanel';
import { LocalFrameDetails, localGroups, localValueText } from './LocalExplorerPage';
import { matchClock, pairAgreement, pairDifferences, summarizeLabels, type LabelSummary } from './metrics';
import { useLocalState } from './store';
import type { LocalScenario } from './validate';

const MAX_ROWS = 500;

function ModelSummary({ name, role, summary, frames, primary }: { name: string; role: string; summary: LabelSummary; frames: number; primary: boolean }) {
  return (
    <article className={`card model-card${primary ? ' card-primary' : ''}`} data-testid={`local-model-${primary ? 'primary' : 'baseline'}`}>
      <p className="eyebrow">{role}</p>
      <h3 className="model-name">{name}</h3>
      <dl className="metric-row">
        <div><dt>Possession spells</dt><dd>{summary.possessionSpells}</dd></div>
        <div><dt>Possession changes</dt><dd>{summary.possessionChanges}</dd></div>
        <div><dt>Label changes</dt><dd>{summary.labelChanges}</dd></div>
        <div><dt>Frames</dt><dd>{frames}</dd></div>
      </dl>
    </article>
  );
}

function Differences({ scenario }: { scenario: LocalScenario }) {
  const dispatch = usePlaybackDispatch();
  const { frame } = usePlayback();
  const [sort, setSort] = useState<'start' | 'duration'>('start');
  const sortId = useId();
  const baseline = scenario.baseline!;
  const all = useMemo(() => pairDifferences(scenario.predictions.labels, baseline.labels), [scenario, baseline]);
  const rows = [...all].sort((a, b) => (sort === 'start' ? a.start - b.start : (b.end - b.start) - (a.end - a.start) || a.start - b.start));
  return (
    <section className="card tabs-card" aria-labelledby="local-differences-heading">
      <div className="section-head">
        <h2 id="local-differences-heading" className="eyebrow"><Icon icon={Split} /> Where the predictions differ <span className="tab-count">{all.length}</span></h2>
        <div className="table-controls">
          <label htmlFor={sortId}>Sort by</label>
          <select id={sortId} className="select select-sm" value={sort} onChange={(e) => setSort(e.currentTarget.value as 'start' | 'duration')}>
            <option value="start">Start frame</option>
            <option value="duration">Longest first</option>
          </select>
        </div>
      </div>
      <p className="section-note">A difference is not an error by either model: without reference labels, nothing here says which one is right.</p>
      {all.length === 0 ? <p className="empty">The two predictions agree on every frame of this export.</p> : (
        <div className="table-scroll" role="region" aria-label="Intervals where the predictions differ" tabIndex={0}>
          <table className="data-table data-table-stack" data-testid="local-difference-table">
            <caption className="sr-only">Intervals where the two predictions differ, {rows.length} rows</caption>
            <thead><tr>
              <th scope="col">Source frames</th><th scope="col">Video time</th><th scope="col">Duration</th>
              <th scope="col">{scenario.predictions.name}</th><th scope="col">{baseline.name}</th><th scope="col"><span className="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>
              {rows.slice(0, MAX_ROWS).map((d) => {
                const current = frame >= d.start && frame < d.end;
                const a = scenario.sourceFrameStart + d.start;
                return (
                  <tr key={d.start} className={current ? 'is-current' : undefined} aria-current={current ? 'true' : undefined}>
                    <td className="num" data-label="Source frames">{a}–{scenario.sourceFrameStart + d.end - 1}</td>
                    <td className="num" data-label="Video time">{matchClock(a, scenario.fps)}</td>
                    <td className="num" data-label="Duration">{d.end - d.start} f · {((d.end - d.start) / scenario.fps).toFixed(2)} s</td>
                    <td data-label={scenario.predictions.name}><LabelChip label={d.primary} /></td>
                    <td data-label={baseline.name}><LabelChip label={d.baseline} /></td>
                    <td className="cell-actions">
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => dispatch({ type: 'seek', frame: d.start })} aria-label={`Go to source frame ${a}`}>Go to {a}</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > MAX_ROWS && <p className="section-note">Showing the first {MAX_ROWS} of {rows.length} intervals in this order.</p>}
        </div>
      )}
    </section>
  );
}

function Distribution({ scenario, summaries }: { scenario: LocalScenario; summaries: { name: string; summary: LabelSummary }[] }) {
  return (
    <section className="card" aria-labelledby="local-distribution-heading">
      <h2 id="local-distribution-heading" className="eyebrow"><Icon icon={Table2} /> Predicted labels on all {scenario.frameCount} frames</h2>
      <div className="table-scroll" role="region" aria-labelledby="local-distribution-heading" tabIndex={0}>
        <table className="data-table" data-testid="local-distribution-table">
          <thead><tr><th scope="col">Prediction</th>{LABEL_ORDER.map((l) => <th key={l} scope="col"><LabelChip label={l} /></th>)}</tr></thead>
          <tbody>
            {summaries.map(({ name, summary }) => (
              <tr key={name}><th scope="row">{name}</th>
                {LABEL_ORDER.map((l) => <td key={l} className="num">{summary.counts[l]} <span className="muted">({percent(summary.counts[l] / scenario.frameCount)})</span></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Limits() {
  return (
    <section className="card" aria-labelledby="local-limits-heading">
      <h2 id="local-limits-heading" className="eyebrow"><Icon icon={Info} /> What this comparison can and cannot establish</h2>
      <ul className="definition-list">
        <li><strong>Can:</strong> where and for how long the two predictions agree or differ on the same real frames, how often each changes possession, and how each distributes H/A/D/X.</li>
        <li><strong>Cannot:</strong> which prediction is correct. Without authorized reference labels there is no accuracy, F1, precision or recall, and neither model is treated as ground truth.</li>
        <li>Prediction disagreement is not evaluation. The only reference-based numbers in this project are the public five-minute results and the synthetic scenario checks, which this page does not show.</li>
      </ul>
    </section>
  );
}

function LocalCompareWorkspace({ scenario }: { scenario: LocalScenario }) {
  useKeyboardShortcuts();
  const groups = useMemo(() => localGroups(scenario, 'compare'), [scenario]);
  const primary = useMemo(() => summarizeLabels(scenario.predictions.labels), [scenario]);
  const baseline = useMemo(() => (scenario.baseline ? summarizeLabels(scenario.baseline.labels) : null), [scenario]);
  const pair = scenario.baseline ? pairAgreement(scenario.predictions.labels, scenario.baseline.labels) : null;
  const summaries = [{ name: scenario.predictions.name, summary: primary }, ...(scenario.baseline && baseline ? [{ name: scenario.baseline.name, summary: baseline }] : [])];
  return (
    <div className="compare-body">
      {pair && scenario.baseline ? (
        <section className="card verdict" aria-label="Summary" data-testid="local-verdict">
          <p className="verdict-text"><strong>The predictions agree on {pair.same} of {pair.frames} frames ({percent(pair.rate)}).</strong> They differ on {pair.different} frames.</p>
          <span className="chip-note"><Icon icon={Info} /> Model-to-model agreement, not accuracy</span>
        </section>
      ) : (
        <section className="card verdict" role="note" data-testid="local-missing-baseline">
          <p className="verdict-text"><strong>smooth50 predictions are not in this export.</strong> Showing the {scenario.predictions.name} on its own.
            To compare, write <code>outputs\baseline_smooth50.csv</code> with <code>python src/baseline.py</code> and re-export with <code>--baseline-predictions</code>.</p>
        </section>
      )}
      <div className="model-cards local-model-cards">
        <ModelSummary name={scenario.predictions.name} role="Prediction" summary={primary} frames={scenario.frameCount} primary />
        {scenario.baseline && baseline && <ModelSummary name={scenario.baseline.name} role="Baseline prediction" summary={baseline} frames={scenario.frameCount} primary={false} />}
      </div>
      <section className="card card-primary compare-workspace" aria-label="Comparison workspace">
        <p className="eyebrow"><Icon icon={Rows3} /> {scenario.baseline ? 'Side-by-side timelines' : 'Prediction timeline'}</p>
        <TrackTimeline groups={groups} variant="compare" events={null} valueText={localValueText(scenario)}>
          <div className="timeline-foot"><Legend evidence={false} />{scenario.baseline && <p className="legend-note muted">Agreement track: dark where the predictions agree, orange where they differ.</p>}</div>
        </TrackTimeline>
        <div className="compare-stage">
          <div className="compare-pitch">
            <Pitch scenario={scenario} synthetic={false} />
            <Transport fps={scenario.fps} />
          </div>
          <section className="frame-context" aria-label="At this frame"><LocalFrameDetails scenario={scenario} /></section>
        </div>
      </section>
      {scenario.baseline && <Differences scenario={scenario} />}
      <Distribution scenario={scenario} summaries={summaries} />
      <Limits />
    </div>
  );
}

export default function LocalComparePage() {
  useDocumentTitle('Compare');
  const { loaded } = useLocalState();
  return (
    <div className="page">
      <PageHeading title="Compare">
        The Rule-Based Possession Engine and the official smooth50 baseline on the same authorized local frames. This compares two
        predictions with each other; with no reference labels, it does not measure accuracy.
      </PageHeading>
      <LocalDataPanel />
      {loaded && (
        <PlaybackProvider key={loaded.serial} frameCount={loaded.scenario.frameCount} fps={loaded.scenario.fps}>
          <LocalCompareWorkspace scenario={loaded.scenario} />
        </PlaybackProvider>
      )}
    </div>
  );
}
