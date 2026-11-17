import { Activity, ArrowRight, BookOpen, GitCompareArrows, Trophy, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { useDocumentTitle } from '../app/routing';
import { CompetitionStrip } from '../components/CompetitionStrip';
import { Icon } from '../components/Icon';
import { LabelChip } from '../components/Legend';
import { Pitch } from '../components/Pitch';
import { Reveal } from '../components/Reveal';
import { ScenarioStatus } from '../components/ScenarioStatus';
import { Timeline } from '../components/Timeline';
import { Transport } from '../components/Transport';
import { PlaybackProvider } from '../playback/PlaybackProvider';
import { SCENARIO_ENTRIES, useScenario } from '../scenario/scenarios';

const MINI_SCENARIO = 's1';

/** A working, self-contained Explorer for the Home page: the same Pitch, Transport and Timeline
 *  components with their own PlaybackProvider, so its clock is independent of any other page.
 *  It installs no page-wide keyboard shortcuts (Space keeps scrolling the page); its controls and
 *  timeline slider are keyboard-operable as usual. */
function MiniExplorer() {
  const [state, retry] = useScenario(MINI_SCENARIO);
  return (
    <section className="card card-primary mini-explorer" aria-label="Mini Explorer: synthetic scenario S1" data-testid="mini-explorer">
      <ScenarioStatus state={state} onRetry={retry}>
        {(scenario) => (
          <PlaybackProvider frameCount={scenario.frameCount} fps={scenario.fps} initialFrame={120}>
            <div className="mini-head">
              <span><strong>{scenario.id.toUpperCase()}</strong> · {scenario.title}</span>
              <span className="badge badge-synthetic">Synthetic</span>
            </div>
            <Pitch scenario={scenario} />
            <Transport fps={scenario.fps} />
            <Timeline scenario={scenario} variant="mini" />
            <Link className="mini-link" to={`/explorer?scenario=${scenario.id}`}>Open {scenario.id.toUpperCase()} in the full Explorer <Icon icon={ArrowRight} /></Link>
          </PlaybackProvider>
        )}
      </ScenarioStatus>
    </section>
  );
}

const ENTRIES: readonly { to: string; title: string; text: string; icon: LucideIcon; action: string }[] = [
  { to: '/explorer', title: 'Explorer', text: 'Play four synthetic scenarios frame by frame and see the evidence behind each label.', icon: Activity, action: 'Open the Explorer' },
  { to: '/compare', title: 'Compare', text: 'Possession Engine and the official smooth50 baseline against each scenario’s script, scored with the organisers’ code.', icon: GitCompareArrows, action: 'Compare the models' },
  { to: '/methodology', title: 'Methodology', text: 'The five stages, nine fixed parameters and known limitations, with diagrams.', icon: BookOpen, action: 'Read the method' },
];

export function HomePage() {
  useDocumentTitle('Home');
  return (
    <div className="page home">
      <section className="hero" aria-labelledby="page-title">
        <div className="hero-copy">
          <span className="eyebrow-chip"><Icon icon={Trophy} /> More than a Hack 2027 · The Initial Challenge</span>
          <h1 id="page-title" className="hero-title" tabIndex={-1}>Possession, frame by frame, with every label explained.</h1>
          <p className="hero-lead">
            MAF FC&apos;s rule-based engine labels every frame of a match as home possession, away possession, dead ball or no
            answer, from tracking data and Smart Tagging. This site lets you watch it decide, and check it against the
            official baseline, on synthetic scenarios.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary btn-lg" to="/explorer"><Icon icon={Activity} /> Open the Explorer</Link>
            <Link className="btn btn-outline btn-lg" to="/compare">Compare models</Link>
            <Link className="btn btn-outline btn-lg" to="/methodology">How it works</Link>
          </div>
        </div>
        <MiniExplorer />
      </section>

      <Reveal><CompetitionStrip /></Reveal>

      <Reveal>
        <section className="home-section" aria-labelledby="problem-heading">
          <h2 id="problem-heading" className="section-title">The problem</h2>
          <div className="problem-grid">
            <div className="mini-card"><strong>Who has the ball?</strong><p>Being nearest is not enough: the engine needs credible control, and keeps possession through passes and loose balls.</p></div>
            <div className="mini-card"><strong>Is the ball dead?</strong><p>Out of play, before a set piece is struck, before kickoff: stoppages are nobody&apos;s possession.</p></div>
            <div className="mini-card"><strong>Where do possessions start and end?</strong><p>The competition scores whole possessions, so changes must land on the right frame.</p></div>
          </div>
          <ul className="label-strip" aria-label="The four labels">
            <li><LabelChip label="H" /> Home possession</li>
            <li><LabelChip label="A" /> Away possession</li>
            <li><LabelChip label="D" /> Dead ball</li>
            <li><LabelChip label="X" /> No answer</li>
          </ul>
        </section>
      </Reveal>

      <Reveal>
        <nav className="entry-grid" aria-label="Explore the project">
          {ENTRIES.map((e) => (
            <Link key={e.to} className="card entry-card" to={e.to}>
              <span className="entry-title"><Icon icon={e.icon} size={20} /> {e.title}</span>
              <span className="entry-text">{e.text}</span>
              <span className="entry-action">{e.action} <Icon icon={ArrowRight} /></span>
            </Link>
          ))}
        </nav>
      </Reveal>

      <Reveal>
        <section className="facts" aria-labelledby="facts-heading">
          <h2 id="facts-heading" className="sr-only">Facts about the method and the app</h2>
          <dl className="fact-grid">
            <div><dt>synthetic scenarios, each scripted in code</dt><dd>{SCENARIO_ENTRIES.length}</dd></div>
            <div><dt>models run on identical inputs: Possession Engine and smooth50</dt><dd>2</dd></div>
            <div><dt>match labels used for training or tuning</dt><dd>0</dd></div>
            <div><dt>parameters, all fixed in advance</dt><dd>9</dd></div>
          </dl>
          <p className="facts-note">Synthetic scenarios check behaviour on situations we scripted; they are not a measure of competition performance.</p>
        </section>
      </Reveal>
    </div>
  );
}
