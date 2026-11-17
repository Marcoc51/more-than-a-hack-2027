import type { ReactNode } from 'react';
import type { ScenarioState } from '../scenario/scenarios';
import type { Scenario } from '../scenario/types';

interface Props {
  state: ScenarioState;
  onRetry: () => void;
  children: (s: Scenario) => ReactNode;
}

/** Loading and error states for a lazily loaded scenario; renders `children` once ready. */
export function ScenarioStatus({ state, onRetry, children }: Props) {
  if (state.status === 'ready') return <>{children(state.scenario)}</>;
  if (state.status === 'loading') {
    return (
      <div className="status card" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" /> Loading synthetic scenario {state.id.toUpperCase()}…
      </div>
    );
  }
  return (
    <div className="status card status-error" role="alert">
      <p><strong>Scenario {state.id.toUpperCase()} could not be loaded.</strong> {state.message}</p>
      <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>Try again</button>
    </div>
  );
}
