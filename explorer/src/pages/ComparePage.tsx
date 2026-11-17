import { BookOpen, ChevronDown, Info, Split, Table2, Rows3 } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle, useScenarioParam } from '../app/routing';
import { Icon } from '../components/Icon';
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
  LABEL_ORDER, MODEL_IDS, agreement, confusion, disagreements, eventsIn, labelCounts, percent, scoredMask, summarize,
  type Disagreement,
} from '../scenario/compare';
import { interpret } from '../scenario/interpretation';
import { LABELS, eventsAt, frameTime, labelAt } from '../scenario/labels';
import { SCENARIO_ENTRIES, useScenario } from '../scenario/scenarios';
import type { ModelId, Scenario } from '../scenario/types';

const ROLE: Record<ModelId, string> = { phase3b: 'Prediction', smooth50: 'Baseline' };

function score(v: number): string {
  return v.toFixed(3);
}

function Verdict({ scenario }: { scenario: Scenario }) {
  const s = summarize(scenario);
  return (
    <section className="card verdict" aria-label="Summary" data-testid="verdict">
      <p className="verdict-text"><strong>{s.agreement}</strong> {s.spells} {s.difference}</p>
      <span className="chip-note"><Icon icon={Info} /> Synthetic checks, not the competition score</span>
    </section>
  );
}

function ModelCards({ scenario }: { scenario: Scenario }) {
  const mask = useMemo(() => scoredMask(scenario), [scenario]);
  const ref = scenario.reference?.labels ?? '';
  const graded = mask.filter(Boolean).length;
  return (
    <div className="model-cards">
      {MODEL_IDS.map((m) => {
        const model = scenario.models[m];
        const a = agreement(ref, model.labels, mask);
        return (
          <article key={m} className={`card model-card${m === 'phase3b' ? ' card-primary' : ''}`} data-testid={`model-card-${m}`}>
            <div className="model-card-head">
              <div>
                <p className="eyebrow">{ROLE[m]}</p>
                <h3 className="model-name">{model.name}</h3>
              </div>
              <p className="model-agreement">
                <span className="stat" data-testid={`agreement-${m}`}>{percent(a.rate)} <span className="stat-sub">({a.agree}/{a.graded})</span></span>
                <span className="stat-label">frame agreement</span>
              </p>
            </div>
            <div className={`meter${m === 'phase3b' ? '' : ' meter-muted'}`} aria-hidden="true"><span style={{ width: `${(a.rate ?? 0) * 100}%` }} /></div>
            <dl className="metric-row">
              <div><dt>spellF1 <span className="origin">official</span></dt><dd data-testid={`spellf1-${m}`}>{score(model.scores.spellF1Mean)}</dd></div>
              <div><dt>macroF1 <span className="origin">official</span></dt><dd>{score(model.scores.macroF1)}</dd></div>
              <div><dt>Possessions</dt><dd>{model.scores.nPredictedSpells} <span className="muted">/ {model.scores.nReferenceSpells}</span></dd></div>
              <div><dt>Frames that differ</dt><dd>{a.disagree}</dd></div>
            </dl>
            <p className="model-source"><code>{model.producer}</code></p>
          </article>
        );
      })}
      <article className="card model-card model-card-reference">
        <p className="eyebrow">Scripted reference</p>
        <h3 className="model-name">Synthetic reference</h3>
        <p className="model-source">Written from the scenario script, not produced by any model.</p>
        <dl className="metric-row metric-row-stack">
          <div><dt>Graded frames</dt><dd>{graded} of {scenario.frameCount}</dd></div>
          <div><dt>Possessions (H/A spells)</dt><dd>{scenario.models.phase3b.scores.nReferenceSpells}</dd></div>
        </dl>
      </article>
    </div>
  );
}

function FrameContext({ scenario, all }: { scenario: Scenario; all: readonly Disagreement[] }) {
  const { frame } = usePlayback();
  const ref = scenario.reference ? labelAt(scenario.reference.labels, frame) : null;
  const events = eventsAt(scenario, frame);
  const here = all.find((d) => frame >= d.start && frame < d.end);
  return (
    <section className="frame-context" aria-labelledby="at-frame-heading">
      <h2 id="at-frame-heading" className="eyebrow">At frame {frame} · {frameTime(frame, scenario.fps)}</h2>
      <dl className="insp-labels">
        {ref && <div><dt>Reference <span className="origin">scenario script</span></dt><dd><LabelChip label={ref} /> {LABELS[ref].name}</dd></div>}
        {MODEL_IDS.map((m) => {
          const l = labelAt(scenario.models[m].labels, frame);
          return <div key={m}><dt>{scenario.models[m].name} <span className="origin">{m === 'phase3b' ? 'prediction' : 'baseline'}</span></dt><dd><LabelChip label={l} /> {LABELS[l].name}</dd></div>;
        })}
      </dl>
      <div className={`difference-card${here ? ' is-difference' : ''}`} data-testid="selected-difference">
        <p className="eyebrow"><Icon icon={Split} /> {here ? 'Difference at this frame' : 'No difference at this frame'}</p>
        {here ? (
          <p className="insp-text">
            <strong>Frames {here.start}–{here.end - 1}</strong> · {here.end - here.start} f · {((here.end - here.start) / scenario.fps).toFixed(2)} s.
            {' '}{here.models.map((m) => scenario.models[m].name).join(' and ')} {here.models.length > 1 ? 'differ' : 'differs'} from the reference.
          </p>
        ) : (
          <p className="insp-text muted">All outputs agree with the reference here, or the frame is not graded. Choose a row under Differences to jump to one.</p>
        )}
      </div>
      <p className="insp-text muted">{events.length ? events.map((e) => `${e.type}: ${e.description}`).join(' ') : 'No scenario event at this frame.'}</p>
    </section>
  );
}

type Filter = 'all' | 'phase3b' | 'smooth50' | 'both';
type Sort = 'start' | 'duration';

function DisagreementTable({ scenario, all }: { scenario: Scenario; all: readonly Disagreement[] }) {
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
    <div className="disagreements">
      <div className="section-head">
        <p className="section-note">
          Graded frames only (frames where the reference is not X). Each row is a stretch where the three labels stay the same and at least one model
          differs from the reference. Choose a row to move the playhead there.
        </p>
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
      {rows.length === 0 ? (
        <p className="empty">{all.length === 0 ? 'Both models agree with the reference on every graded frame.' : 'No differences match this filter.'}</p>
      ) : (
        <div className="table-scroll" role="region" aria-label="Differences from the reference" tabIndex={0}>
          <table className="data-table data-table-stack" data-testid="disagreement-table">
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
                    <td className="num" data-label="Frames">{d.start}–{d.end - 1}</td>
                    <td className="num" data-label="Duration">{d.end - d.start} f · {((d.end - d.start) / scenario.fps).toFixed(2)} s</td>
                    <td data-label="Reference"><LabelChip label={d.reference} /></td>
                    <td data-label="Phase 3B" className={differs(d, 'phase3b') ? 'cell-diff' : undefined}><LabelChip label={d.phase3b} />{differs(d, 'phase3b') && <span className="sr-only"> (differs)</span>}</td>
                    <td data-label="smooth50" className={differs(d, 'smooth50') ? 'cell-diff' : undefined}><LabelChip label={d.smooth50} />{differs(d, 'smooth50') && <span className="sr-only"> (differs)</span>}</td>
                    <td data-label="Event" className="cell-event">{events.length ? events.map((e) => e.type).join(', ') : '—'}</td>
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
    </div>
  );
}

function Interpretation({ scenario }: { scenario: Scenario }) {
  const text = interpret(scenario);
  return (
    <dl className="interpretation-list">
      <div><dt>Scripted reference <span className="origin">ground truth for this synthetic scenario</span></dt><dd>{text.reference}</dd></div>
      <div><dt>What the models observe <span className="origin">synthetic tracking and tags</span></dt><dd>{text.observations}</dd></div>
      <div><dt>What the models output <span className="origin">computed from exported labels</span></dt><dd>{text.predictions}</dd></div>
      <div><dt>Interpretation <span className="origin">UI description</span></dt><dd>{text.interpretation}</dd></div>
    </dl>
  );
}

/** WAI-ARIA tabs: arrow keys, Home and End move between tabs; inactive panels stay in the DOM. */
function AnalysisTabs({ scenario, all }: { scenario: Scenario; all: readonly Disagreement[] }) {
  const tabs = [
    { id: 'differences', label: 'Differences', icon: Split, count: all.length },
    { id: 'reading', label: 'Reading this scenario', icon: BookOpen, count: null },
  ] as const;
  const [active, setActive] = useState<(typeof tabs)[number]['id']>('differences');
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const i = (next + tabs.length) % tabs.length;
    setActive(tabs[i]!.id);
    refs.current[i]?.focus();
  };
  return (
    <section className="card tabs-card" aria-label="Differences and interpretation">
      <div className="tabs" role="tablist" aria-label="Analysis">
        {tabs.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`${base}-tab-${t.id}`}
            aria-selected={active === t.id} aria-controls={`${base}-panel-${t.id}`} tabIndex={active === t.id ? 0 : -1}
            className="tab" onClick={() => setActive(t.id)} onKeyDown={(e) => onKey(e, i)}>
            <Icon icon={t.icon} /> {t.label}{t.count !== null && <span className="tab-count">{t.count}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel-differences`} aria-labelledby={`${base}-tab-differences`} hidden={active !== 'differences'} className="tabpanel">
        <DisagreementTable scenario={scenario} all={all} />
      </div>
      <div role="tabpanel" id={`${base}-panel-reading`} aria-labelledby={`${base}-tab-reading`} hidden={active !== 'reading'} className="tabpanel">
        <Interpretation scenario={scenario} />
      </div>
    </section>
  );
}

function DetailedStatistics({ scenario }: { scenario: Scenario }) {
  const mask = useMemo(() => scoredMask(scenario), [scenario]);
  const ref = scenario.reference?.labels ?? '';
  const series: { id: string; name: string; labels: string }[] = [
    { id: 'reference', name: 'Reference', labels: ref },
    ...MODEL_IDS.map((m) => ({ id: m, name: scenario.models[m].name, labels: scenario.models[m].labels })),
  ];
  return (
    <details className="card disclosure stats-disclosure" id="detailed-statistics">
      <summary><Icon icon={Table2} /> Detailed statistics <span className="summary-hint">label counts, confusion matrices, metric definitions</span> <Icon icon={ChevronDown} className="disclosure-chevron" /></summary>
      <div className="disclosure-body stats-body">
        <section aria-labelledby="counts-heading">
          <h3 id="counts-heading" className="subsection-title">Labels on graded frames</h3>
          <p className="section-note">Every count on this page uses the official scorer&apos;s graded frames: the frames where the reference is not X. A model answering X on a graded frame counts as a miss.</p>
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
        </section>
        <div className="confusions">
          {MODEL_IDS.map((m) => {
            const cm = confusion(ref, scenario.models[m].labels, mask);
            const headingId = `confusion-${m}`;
            return (
              <section key={m} className="confusion" aria-labelledby={headingId}>
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
              </section>
            );
          })}
        </div>
        <section aria-labelledby="definitions-heading" id="metric-definitions">
          <h3 id="definitions-heading" className="subsection-title">About these numbers</h3>
          <ul className="definition-list">
            <li><strong>Frame agreement</strong> is computed here, in the browser: the share of graded frames (frames where the reference is not X, the official scorer&apos;s rule) on which an output equals the reference.</li>
            <li><strong>spellF1</strong> (the competition ranking metric: possessions matched one-to-one by temporal IoU, F1 averaged over IoU 0.3–0.7) and <strong>macroF1</strong> (the first tie-break: per-frame F1 averaged over H, A and D) come from the organisers&apos; public scorer, <code>evaluation/possession_metrics.py</code>, vendored unchanged in <code>tools/vendor/</code> and run offline by the exporter.</li>
            <li>macroF1 averages over H, A and D. In a scenario with no dead ball the D term is zero, so even a perfect output scores at most 0.667.</li>
            <li>All figures describe four short synthetic scenarios. They are not, and do not predict, the score on the competition match.</li>
          </ul>
        </section>
      </div>
    </details>
  );
}

function CompareWorkspace({ scenario }: { scenario: Scenario }) {
  useKeyboardShortcuts();
  const all = useMemo(() => disagreements(scenario), [scenario]);
  return (
    <div className="compare-body">
      <Verdict scenario={scenario} />
      <ModelCards scenario={scenario} />
      <section className="card card-primary compare-workspace" aria-label="Comparison workspace">
        <p className="eyebrow"><Icon icon={Rows3} /> Comparison timeline</p>
        <Timeline scenario={scenario} variant="compare">
          <div className="timeline-foot"><Legend variant="compare" /></div>
        </Timeline>
        <div className="compare-stage">
          <div className="compare-pitch">
            <Pitch scenario={scenario} />
            <Transport fps={scenario.fps} />
          </div>
          <FrameContext scenario={scenario} all={all} />
        </div>
      </section>
      <AnalysisTabs scenario={scenario} all={all} />
      <DetailedStatistics scenario={scenario} />
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
  );
}
