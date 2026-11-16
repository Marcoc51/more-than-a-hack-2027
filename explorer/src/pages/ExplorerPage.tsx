import { useState } from 'react';
import { Inspector } from '../components/Inspector';
import { Legend } from '../components/Legend';
import { Pitch } from '../components/Pitch';
import { ScenarioPanel } from '../components/ScenarioPanel';
import { Timeline } from '../components/Timeline';
import { Transport } from '../components/Transport';
import type { Scenario } from '../scenario/types';
import { PlaybackProvider } from '../playback/PlaybackProvider';
import { useKeyboardShortcuts } from '../playback/useKeyboardShortcuts';

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

export function ExplorerPage({ scenarios }: { scenarios: readonly Scenario[] }) {
  const [activeId, setActiveId] = useState(scenarios[0]?.id ?? '');
  const scenario = scenarios.find((s) => s.id === activeId);

  return (
    <div className="explorer">
      <ScenarioPanel scenarios={scenarios} activeId={activeId} onSelect={setActiveId} />
      {scenario ? (
        // One provider per scenario: switching remounts it, which stops the old loop and resets the frame.
        <PlaybackProvider key={scenario.id} frameCount={scenario.frameCount} fps={scenario.fps}>
          <Workspace scenario={scenario} />
        </PlaybackProvider>
      ) : (
        <p className="empty">No synthetic scenario is available.</p>
      )}
    </div>
  );
}
