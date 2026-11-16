import type { Scenario } from '../scenario/types';

interface Props {
  scenarios: readonly Scenario[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function ScenarioPanel({ scenarios, activeId, onSelect }: Props) {
  const active = scenarios.find((s) => s.id === activeId);
  return (
    <section className="scenarios" aria-labelledby="scenarios-heading">
      <h2 id="scenarios-heading" className="panel-heading">Scenarios</h2>
      <fieldset className="scenario-list">
        <legend className="sr-only">Select a synthetic scenario</legend>
        {scenarios.map((s) => (
          <label key={s.id} className={`scenario-option${s.id === activeId ? ' is-active' : ''}`}>
            <input type="radio" name="scenario" value={s.id} checked={s.id === activeId} onChange={() => onSelect(s.id)} />
            <span className="scenario-title">{s.id.toUpperCase()} · {s.title}</span>
            <span className="scenario-meta">{s.frameCount} frames · {s.fps} fps · synthetic</span>
          </label>
        ))}
      </fieldset>
      {active && (
        <>
          <p className="scenario-description">{active.description}</p>
          <details className="provenance">
            <summary>Data provenance</summary>
            <dl>
              <div><dt>Kind</dt><dd>{active.provenance.kind}</dd></div>
              <div><dt>Generator</dt><dd><code>{active.provenance.generator}</code> v{active.provenance.generatorVersion}</dd></div>
              <div><dt>Engine commit</dt><dd><code>{active.provenance.engineCommit.slice(0, 7)}</code></dd></div>
              <div><dt>Models</dt><dd>{active.models.phase3b.producer}; {active.models.smooth50.producer}</dd></div>
            </dl>
            <p>{active.provenance.statement}</p>
          </details>
        </>
      )}
    </section>
  );
}
