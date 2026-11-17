import { ChevronDown, Keyboard } from 'lucide-react';
import { useDocumentTitle, useScenarioParam } from '../app/routing';
import { Icon } from '../components/Icon';
import { Inspector } from '../components/Inspector';
import { Legend } from '../components/Legend';
import { PageHeading } from '../components/PageHeading';
import { Pitch } from '../components/Pitch';
import { ScenarioPanel } from '../components/ScenarioPanel';
import { ScenarioStatus } from '../components/ScenarioStatus';
import { Timeline } from '../components/Timeline';
import { Transport } from '../components/Transport';
import { PlaybackProvider } from '../playback/PlaybackProvider';
import { useKeyboardShortcuts } from '../playback/useKeyboardShortcuts';
import { SCENARIO_ENTRIES, useScenario } from '../scenario/scenarios';
import type { Scenario } from '../scenario/types';

export function Shortcuts() {
  return (
    <details className="disclosure shortcuts">
      <summary><Icon icon={Keyboard} /> Keyboard shortcuts <Icon icon={ChevronDown} className="disclosure-chevron" /></summary>
      <div className="disclosure-body">
        <ul className="shortcut-list">
          <li><kbd>Space</kbd> play or pause</li>
          <li><kbd>←</kbd> <kbd>→</kbd> one frame</li>
          <li><kbd>Shift</kbd> + arrow: ten frames</li>
          <li>On the focused timeline: <kbd>Home</kbd> <kbd>End</kbd> <kbd>PgUp</kbd> <kbd>PgDn</kbd></li>
          <li>Click or tap a timeline to seek</li>
        </ul>
      </div>
    </details>
  );
}

function Workspace({ scenario }: { scenario: Scenario }) {
  useKeyboardShortcuts();
  return (
    <div className="explorer-grid">
      <div className="explorer-main">
        <section className="card card-primary stage" aria-label="Pitch and playback">
          <Pitch scenario={scenario} />
          <Transport fps={scenario.fps} />
        </section>
        <Timeline scenario={scenario}>
          <div className="timeline-foot">
            <Legend />
            <Shortcuts />
          </div>
        </Timeline>
      </div>
      <Inspector scenario={scenario} />
    </div>
  );
}

export function ExplorerPage() {
  useDocumentTitle('Explorer');
  const { id, initialFrame, select } = useScenarioParam();
  const [state, retry] = useScenario(id);

  return (
    <div className="page">
      <PageHeading title="Explorer" synthetic>
        Frame-by-frame possession (H home, A away, D dead ball, X no answer) from the Rule-Based Possession Engine
        and the official smooth50 baseline, both run unchanged on synthetic tracking.
      </PageHeading>
      <ScenarioPanel entries={SCENARIO_ENTRIES} activeId={id} onSelect={select}
        scenario={state.status === 'ready' ? state.scenario : null} />
      <ScenarioStatus state={state} onRetry={retry}>
        {(scenario) => (
          // One provider per scenario: switching remounts it, which stops the old loop and
          // resets the frame, so nothing from the previous scenario can leak through.
          <PlaybackProvider key={scenario.id} frameCount={scenario.frameCount} fps={scenario.fps} initialFrame={initialFrame}>
            <Workspace scenario={scenario} />
          </PlaybackProvider>
        )}
      </ScenarioStatus>
    </div>
  );
}
