import { useId } from 'react';
import type { Scenario, ScenarioEntry } from '../scenario/types';

interface Props {
  entries: readonly ScenarioEntry[];
  activeId: string;
  onSelect: (id: string) => void;
  /** The loaded active scenario, for its provenance; null while it loads. */
  scenario: Scenario | null;
}

export function ScenarioPanel({ entries, activeId, onSelect, scenario }: Props) {
  const headingId = useId();
  const active = entries.find((e) => e.id === activeId);
  return (
    <section className="scenarios card" aria-labelledby={headingId}>
      <h2 id={headingId} className="panel-heading">Synthetic scenarios</h2>
      <fieldset className="scenario-list">
        <legend className="sr-only">Select a synthetic scenario</legend>
        {entries.map((e) => (
          <label key={e.id} className={`scenario-option${e.id === activeId ? ' is-active' : ''}`}>
            <input type="radio" name={`scenario-${headingId}`} value={e.id} checked={e.id === activeId} onChange={() => onSelect(e.id)} />
            <span className="scenario-title">{e.id.toUpperCase()} · {e.title}</span>
            <span className="scenario-meta">{e.frameCount} frames · {(e.frameCount / e.fps).toFixed(1)} s · synthetic</span>
          </label>
        ))}
      </fieldset>
      {active && <p className="scenario-description">{active.description}</p>}
      {scenario && scenario.id === activeId && (
        <details className="provenance">
          <summary>Data provenance</summary>
          <dl>
            <div><dt>Kind</dt><dd>{scenario.provenance.kind}</dd></div>
            <div><dt>Generator</dt><dd><code>{scenario.provenance.generator}</code> v{scenario.provenance.generatorVersion}</dd></div>
            <div><dt>Engine commit</dt><dd><code>{scenario.provenance.engineCommit.slice(0, 7)}</code></dd></div>
            <div><dt>Models</dt><dd>{scenario.models.phase3b.producer}; {scenario.models.smooth50.producer}</dd></div>
            <div><dt>Scorer</dt><dd><code>{scenario.provenance.scorer.file}</code> (official, unchanged)</dd></div>
          </dl>
          <p>{scenario.provenance.statement}</p>
        </details>
      )}
    </section>
  );
}
