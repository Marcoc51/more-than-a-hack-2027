import { ChevronDown, CircleAlert, Cpu, Database, FlaskConical, Flag, Gauge, Rows3, Scale, SlidersHorizontal, Terminal, Waypoints } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '../app/routing';
import { ControlDiagram, RestartDiagram, SwitchDiagram } from '../components/Diagrams';
import { Icon } from '../components/Icon';
import { LabelChip } from '../components/Legend';
import type { LucideIcon } from 'lucide-react';

const REPO = 'https://github.com/Marcoc51/more-than-a-hack-2027/blob/main/';
const file = (path: string) => <a href={`${REPO}${path}`} rel="noreferrer"><code>{path}</code></a>;

const SECTIONS = [
  ['overview', 'Overview'],
  ['inputs', 'Inputs'],
  ['evidence', 'Control evidence'],
  ['changes', 'Possession changes'],
  ['dead-ball', 'Dead ball and restarts'],
  ['baseline', 'Phase 3B and smooth50'],
  ['parameters', 'Parameters'],
  ['limitations', 'Known limitations'],
  ['evaluation', 'Synthetic and real-match evaluation'],
  ['scenarios', 'How the scenarios are made'],
  ['reproduce', 'Reproduce it locally'],
] as const;

const STAGES = [
  ['Tracking', 'Nearest home and away player to the ball (m), ball position and speed'],
  ['Control evidence', 'One verdict per frame, with no memory'],
  ['Dead ball and restarts', 'Out of play, set-piece windows, pre-kickoff, restart strikes'],
  ['State machine', 'Confirms changes, holds through uncertainty, each half separately'],
  ['Labels', 'H, A or D inside the graded halves; X outside them'],
] as const;

const PARAMETER_GROUPS = [
  ['Control evidence', [
    ['control_radius_m', '2.0 m', 'nearest player must be this close to the ball'],
    ['margin_m', '1.0 m', 'the other team’s nearest player must be this much further away'],
  ]],
  ['State machine', [
    ['confirm_frames', '10', 'control observations needed to change possession'],
    ['max_gap_frames', '250 (10 s)', 'longest ball dropout possession is held through'],
  ]],
  ['Dead ball and restarts', [
    ['out_tolerance_m', '0.5 m', 'distance beyond a line before the ball counts as out'],
    ['out_confirm_frames', '3', 'tracked frames out in a row to confirm a dead ball'],
    ['restart_speed_mps', '4.0 m/s', 'speed that marks a set-piece strike'],
    ['restart_still_frames', '5', 'slower tracked frames needed before a strike'],
  ]],
  ['Compatibility', [
    ['stoppage_lookahead_frames', '2250', 'kept for compatibility; no longer used by the engine'],
  ]],
] as const;

const LIMITATIONS: readonly (readonly [string, string, string | null])[] = [
  ['Mistimed tags', 'A tag placed over live play, where the ball rests and is then played, inserts a short false stoppage.', 's4'],
  ['Unseen events in a tracking gap', 'Possession is held through a ball dropout, so a change of possession during the gap is detected only when the ball reappears.', 's3'],
  ['High balls near a line', 'The ball’s height is lost on the pitch plane, so a high ball near a line can briefly read as out of play and end a possession falsely.', null],
  ['Ball leaving the pitch untracked', 'Such a stoppage is only recognised in the tag window before its restart, so its D starts late.', null],
  ['Missed or early restarts', 'A slow short free kick (under 4 m/s) or a noisy speed reading can hide the strike; a ball thrown back to the taker can trigger it early.', null],
  ['Set-up before the tag window', 'A player holding or placing the ball before the set-piece tag opens reads as possession until the tag window starts.', null],
  ['Unknown-team restarts', 'After a restart with no known team, the first team to establish control is credited from the strike, which can favour a quick interception.', null],
  ['Kickoff just before a half block', 'A strike in the ungraded frames before a half is rejected; that half starts unknown until control establishes a team.', null],
  ['Unvalidated thresholds', 'The parameters are reasoned, not validated: there is no measured evidence of how they perform on the match.', null],
];

function Section({ id, title, icon, children, className = '' }: { id: string; title: string; icon: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <section className={`method-section card ${className}`} aria-labelledby={`h-${id}`}>
      <h2 id={`h-${id}`} className="method-title"><Icon icon={icon} size={20} /><a className="anchor" href={`#h-${id}`}>{title}</a></h2>
      {children}
    </section>
  );
}

function Details({ title = 'Implementation details', children }: { title?: string; children: ReactNode }) {
  return (
    <details className="disclosure method-details">
      <summary><Icon icon={Cpu} /> {title} <Icon icon={ChevronDown} className="disclosure-chevron" /></summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

export function MethodologyPage() {
  useDocumentTitle('Methodology');
  return (
    <div className="page methodology">
      <div className="method-hero">
        <div className="page-heading">
          <h1 id="page-title" className="page-title" tabIndex={-1}>Methodology</h1>
          <p className="page-lead">
            How the MAF FC Phase 3B engine turns tracking data and Smart Tagging into one possession label per frame, how it
            differs from the official smooth50 baseline, and what we can and cannot claim about it.
          </p>
        </div>
        <dl className="glance" aria-label="At a glance">
          <div><dt>stages</dt><dd>5</dd></div>
          <div><dt>parameters, fixed in advance</dt><dd>9</dd></div>
          <div><dt>training data</dt><dd>0</dd></div>
        </dl>
      </div>

      <nav className="section-chips" aria-label="On this page">
        <ol>{SECTIONS.map(([id, title]) => <li key={id}><a href={`#h-${id}`}>{title}</a></li>)}</ol>
      </nav>

      <ol className="pipeline" aria-label="The five stages of the Phase 3B engine">
        {STAGES.map(([name, text], i) => (
          <li key={name} className="pipeline-step">
            <span className="pipeline-index" aria-hidden="true">{i + 1}</span>
            <strong>{name}</strong>
            <span>{text}</span>
          </li>
        ))}
      </ol>

      <div className="method-content">
        <Section id="overview" title="Overview" icon={Waypoints}>
          <p>
            The challenge labels every frame of a match video. A team is in possession when it has the ball alive; in the
            challenge&apos;s words, possession stays with the last team that had it through passes, loose balls and challenges.
            Stoppages are not anyone&apos;s possession.
          </p>
          <p>
            Ranking uses <strong>spellF1</strong>: each possession, a maximal run of H or of A, is one object, and predicted
            possessions are matched one-to-one to true ones by temporal overlap (IoU). Whole, correctly bounded possessions
            matter more than any single frame. <strong>macroF1</strong> over H, A and D breaks ties.
          </p>
          <dl className="label-defs">
            <div><dt><LabelChip label="H" /> Home possession</dt><dd>The home team has the ball alive.</dd></div>
            <div><dt><LabelChip label="A" /> Away possession</dt><dd>The away team has the ball alive.</dd></div>
            <div><dt><LabelChip label="D" /> Dead ball</dt><dd>The ball is out of play: before a kickoff, after it leaves the pitch, until a restart.</dd></div>
            <div><dt><LabelChip label="X" /> No answer</dt><dd>Outside the graded halves (ungraded), or inside a half before any possession can be established.</dd></div>
          </dl>
        </Section>

        <Section id="inputs" title="Inputs" icon={Database}>
          <div className="input-cards">
            <div className="mini-card"><strong>Automatic tracking</strong><p>For every frame where the ball is tracked: each team&apos;s nearest player distance to the ball, the ball&apos;s position and its speed, on a 105.3 × 68 m pitch.</p></div>
            <div className="mini-card"><strong>Smart Tagging set pieces</strong><p>Only <code>SET PIECES</code> instances are used, as evidence of restarts. Phase tags (build-up, progression, …) are not used.</p></div>
            <div className="mini-card"><strong>Half boundaries</strong><p>The published halves. Each half is processed on its own.</p></div>
          </div>
          <Details>
            <ul>
              <li>A frame without a tracked ball gives no observation; a team with no tracked player is infinitely far away.</li>
              <li>Tag times become frames as <code>round(seconds × 25)</code>.</li>
              <li>The tagged team is matched to the metadata team names by text similarity; <code>N/A</code> (every throw-in) or no clear match means the team is unknown.</li>
            </ul>
            <p className="source-ref">Source: {file('src/possession.py')}, {file('src/smart_tagging.py')}.</p>
          </Details>
        </Section>

        <Section id="evidence" title="Control evidence" icon={Gauge} className="method-split">
          <div className="method-text">
            <p>Each tracked frame gives one piece of evidence, with no memory of other frames. Being nearest is never enough: a contested ball, where both teams are about equally close, gives no evidence.</p>
            <pre className="code-block"><code>{`home control  if  d_home ≤ 2.0 m  and  d_away − d_home ≥ 1.0 m
away control  if  d_away ≤ 2.0 m  and  d_home − d_away ≥ 1.0 m
otherwise     no credible control   (ball in flight, contested, or nobody close)
no ball       if the ball is not tracked`}</code></pre>
          </div>
          <ControlDiagram />
        </Section>

        <Section id="changes" title="Possession changes" icon={Rows3} className="method-split">
          <div className="method-text">
            <p>
              <strong>Changing possession</strong> needs 10 control observations for the same team, with no tracked frame
              contradicting them. The change is <strong>backdated</strong> to the first observation of that run, the moment the
              new team took control.
            </p>
            <p><strong>Holding.</strong> Between control frames, possession is kept through passes, loose balls and challenges. Brief touches shorter than the confirmation do not change it.</p>
            <Details>
              <ul>
                <li>Untracked frames pause the count; a dropout of 10 frames or more resets it. A change therefore spans at least 0.4 s, and longer when it bridges short dropouts.</li>
                <li><strong>Missing ball.</strong> In open play, possession is held through ball dropouts of up to 250 frames (10 s); after a longer gap the state becomes unknown (X). During a stoppage, a missing ball stays D.</li>
              </ul>
            </Details>
            <p className="source-ref">See the <Link to="/explorer?scenario=s2">contested loose ball (S2)</Link> and <Link to="/explorer?scenario=s3">missing tracking (S3)</Link> scenarios.</p>
          </div>
          <SwitchDiagram />
        </Section>

        <Section id="dead-ball" title="Dead ball and restarts" icon={Flag} className="method-split">
          <div className="method-text">
            <ul className="rule-list">
              <li><strong>Ball out of play:</strong> tracked more than 0.5 m beyond a touchline or goal line for 3 tracked frames in a row within the same half.</li>
              <li><strong>Before a set piece:</strong> the frames of a <code>SET PIECES</code> tag window before its strike.</li>
              <li><strong>Strike:</strong> the first tracked frame in the tag window, inside the half, at 4 m/s or faster, after at least 5 slower tracked frames.</li>
            </ul>
            <Details>
              <ul>
                <li><strong>Before kickoff:</strong> each half&apos;s frames before the Kick Off (Start) strike (or before the tag, if no strike is found).</li>
                <li>A strike found outside the half is rejected, never moved into it.</li>
                <li><strong>Restart:</strong> a known tagged team takes possession from the strike. With an unknown team, the first team to establish control is backdated to the strike. The confirmation rule still applies, so a wrong team tag is overridden by sustained opposing control.</li>
                <li><strong>Ending a stoppage:</strong> a restart, or sustained control outside dead frames. A future restart never vetoes present control.</li>
              </ul>
            </Details>
            <p className="source-ref">See the <Link to="/explorer?scenario=s1">kickoff and throw-in (S1)</Link> and <Link to="/explorer?scenario=s4">mistimed tag (S4)</Link> scenarios.</p>
          </div>
          <RestartDiagram />
        </Section>

        <Section id="baseline" title="Phase 3B and smooth50" icon={Scale}>
          <div className="table-scroll" role="region" aria-labelledby="h-baseline" tabIndex={0}>
            <table className="data-table">
              <thead><tr><th scope="col">Aspect</th><th scope="col">MAF FC Phase 3B</th><th scope="col">Official smooth50</th></tr></thead>
              <tbody>
                <tr><th scope="row">Per frame</th><td>Credible control (radius and margin)</td><td>Team of the nearest player, at any distance</td></tr>
                <tr><th scope="row">Over time</th><td>State machine: 10 observations to switch, backdated</td><td>Majority vote over ±50 frames; ties go to home</td></tr>
                <tr><th scope="row">Dead ball</th><td>Out of play, set pieces, kickoff, from tracking and tags</td><td>Only where the ball is unseen for the whole 101-frame window</td></tr>
                <tr><th scope="row">X</th><td>Outside the halves, or before a possession is established</td><td>Never</td></tr>
                <tr><th scope="row">Halves</th><td>Processed separately</td><td>One sequence</td></tr>
              </tbody>
            </table>
          </div>
          <p className="source-ref">Source: {file('src/baseline.py')} reproduces the organisers&apos; baseline.</p>
        </Section>

        <Section id="parameters" title="Parameters" icon={SlidersHorizontal}>
          <p>
            The engine is rule-based: there is no machine learning and no training data. The nine parameters were fixed in
            advance from football reasoning. None was fitted to, swept on or checked against the competition match.
          </p>
          <div className="table-scroll" role="region" aria-labelledby="h-parameters" tabIndex={0}>
            <table className="data-table param-table">
              <thead><tr><th scope="col">Parameter</th><th scope="col">Value</th><th scope="col">Meaning</th></tr></thead>
              {PARAMETER_GROUPS.map(([group, rows]) => (
                <tbody key={group}>
                  <tr className="param-group"><th scope="rowgroup" colSpan={3}>{group}</th></tr>
                  {rows.map(([n, v, m]) => <tr key={n}><th scope="row"><code>{n}</code></th><td className="num"><span className="unit">{v}</span></td><td>{m}</td></tr>)}
                </tbody>
              ))}
            </table>
          </div>
          <p className="muted">Other assumptions: the first team in the metadata is home; the ball&apos;s third raw value is its speed in m/s (stated for player slots, inferred for the ball).</p>
        </Section>

        <Section id="limitations" title="Known limitations" icon={CircleAlert}>
          <div className="limit-grid">
            {LIMITATIONS.map(([title, text, scenario]) => (
              <details key={title} className="disclosure limit-card">
                <summary>{title}{scenario && <span className="limit-tag">shown in {scenario.toUpperCase()}</span>} <Icon icon={ChevronDown} className="disclosure-chevron" /></summary>
                <div className="disclosure-body">
                  <p>{text}</p>
                  {scenario && <Link to={`/explorer?scenario=${scenario}`}>Open {scenario.toUpperCase()} in the Explorer</Link>}
                </div>
              </details>
            ))}
          </div>
          <p className="source-ref">Source: {file('docs/TECHNICAL_DOCUMENT.md')}, section 8.</p>
        </Section>

        <Section id="evaluation" title="Synthetic and real-match evaluation" icon={FlaskConical}>
          <div className="input-cards">
            <div className="mini-card"><strong>What the synthetic scenarios show</strong><p>How both models behave on four scripted situations whose true labels we wrote ourselves. The <Link to="/compare">Compare</Link> page scores them with the organisers&apos; public scorer.</p></div>
            <div className="mini-card"><strong>What they do not show</strong><p>Performance on the competition match. Four short scripted scenarios are not a sample of real football, and the reference labels are our own script, not independent ground truth.</p></div>
            <div className="mini-card"><strong>On the match</strong><p>Following the organisers&apos; 3 November 2026 clarification, no accuracy was computed, and no parameter was tuned, on the competition match or its ground truth. We make no claim about our competition score.</p></div>
          </div>
        </Section>

        <Section id="scenarios" title="How the scenarios are made" icon={Waypoints}>
          <ol className="numbered">
            <li>Each scenario is scripted in code (<code>tools/export_scenarios.py</code>): 22 players, the ball, missing observations and Smart Tagging set pieces.</li>
            <li>The script is written to temporary files in the same tracking and tagging formats the engines read.</li>
            <li>The unchanged Phase 3B engine and the smooth50 baseline run on identical files. Their labels and per-frame evidence are exported.</li>
            <li>Reference labels are written down from the script, never from a model. The official scorer (vendored unchanged) compares each output with them.</li>
            <li>The output is deterministic JSON, with the engine commit and file hashes recorded as provenance. No competition data is read.</li>
          </ol>
        </Section>

        <Section id="reproduce" title="Reproduce it locally" icon={Terminal}>
          <pre className="code-block"><code>{`# from the repository root (Python 3.10 with requirements.txt installed)
python tools/export_scenarios.py          # regenerate the synthetic scenarios
python tools/export_scenarios.py --check  # confirm the committed JSON is current

# the app (Node 22+)
cd explorer
npm ci
npm run dev        # http://localhost:5173
npm test           # unit and component tests
npm run build      # production build into dist/`}</code></pre>
          <p>No backend, database or private credentials are needed; the app is static.</p>
        </Section>
      </div>
    </div>
  );
}
