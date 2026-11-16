import { useDocumentTitle, useScenarioParam } from '../app/routing';
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

function Workspace({ scenario }: { scenario: Scenario }) {
  useKeyboardShortcuts();
  return (
    <div className="workspace">
      <div className="workspace-stage">
        <Pitch scenario={scenario} />
        <Transport fps={scenario.fps} />
        <Timeline scenario={scenario} />
        <Legend />
        <p className="kbd-hint">Keyboard: <kbd>Space</kbd> play/pause · <kbd>←</kbd> <kbd>→</kbd> one frame · <kbd>Shift</kbd>+arrow ten frames · on the focused timeline also <kbd>Home</kbd> <kbd>End</kbd> <kbd>PgUp</kbd> <kbd>PgDn</kbd> · click or tap a timeline to seek.</p>
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
        Frame-by-frame possession (H home, A away, D dead ball, X no answer) from the MAF FC Phase 3B
        engine and the official smooth50 baseline, both run unchanged on synthetic tracking.
      </PageHeading>
      <div className="explorer">
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
    </div>
  );
}
