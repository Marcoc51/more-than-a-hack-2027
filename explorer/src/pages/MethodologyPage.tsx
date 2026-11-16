import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '../app/routing';
import { LabelChip } from '../components/Legend';
import { PageHeading } from '../components/PageHeading';

const REPO = 'https://github.com/Marcoc51/more-than-a-hack-2027/blob/main/';
const file = (path: string) => <a href={`${REPO}${path}`} rel="noreferrer"><code>{path}</code></a>;

const SECTIONS = [
  ['possession', 'What possession means'],
  ['labels', 'The four labels'],
  ['inputs', 'Inputs'],
  ['evidence', 'Player and ball evidence'],
  ['uncertainty', 'Short uncertainty'],
  ['dead-ball', 'Dead ball and restarts'],
  ['baseline', 'Phase 3B and smooth50'],
  ['assumptions', 'Assumptions'],
  ['limitations', 'Known limitations'],
  ['evaluation', 'Synthetic and real-match evaluation'],
  ['scenarios', 'How the scenarios are made'],
  ['reproduce', 'Reproduce it locally'],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="method-section" aria-labelledby={`h-${id}`}>
      <h2 id={`h-${id}`} className="method-title"><a className="anchor" href={`#h-${id}`}>{title}</a></h2>
      {children}
    </section>
  );
}

const STAGES = [
  ['Tracking', 'Per frame: the nearest home and away player to the ball, in metres, and the ball’s position and speed.'],
  ['Control evidence', 'A team has credible control in this frame, or nobody does. No memory.'],
  ['Dead ball and restarts', 'Ball out of play, set-piece windows before the strike, pre-kickoff frames, located restart strikes.'],
  ['State machine', 'Confirms possession changes, holds possession through uncertainty, runs each half separately.'],
  ['Labels', 'H, A or D inside the graded halves; X outside them.'],
] as const;

const PARAMETERS = [
  ['control_radius_m', '2.0 m', 'nearest player must be this close to the ball'],
  ['margin_m', '1.0 m', 'the other team’s nearest player must be this much further away'],
  ['confirm_frames', '10', 'control observations needed to change possession'],
  ['max_gap_frames', '250 (10 s)', 'longest ball dropout possession is held through'],
  ['out_tolerance_m', '0.5 m', 'distance beyond a line before the ball counts as out'],
  ['out_confirm_frames', '3', 'tracked frames out in a row to confirm a dead ball'],
  ['restart_speed_mps', '4.0 m/s', 'speed that marks a set-piece strike'],
  ['restart_still_frames', '5', 'slower tracked frames needed before a strike'],
  ['stoppage_lookahead_frames', '2250', 'kept for compatibility; no longer used by the engine'],
] as const;

export function MethodologyPage() {
  useDocumentTitle('Methodology');
  return (
    <div className="page methodology">
      <PageHeading title="Methodology">
        How the MAF FC Phase 3B engine turns tracking data and Smart Tagging into one possession label per
        frame, how it differs from the official smooth50 baseline, and what we can and cannot claim about it.
      </PageHeading>

      <div className="method-layout">
        <nav className="method-toc card" aria-label="On this page">
          <p className="panel-heading">On this page</p>
          <ol>
            {SECTIONS.map(([id, title]) => <li key={id}><a href={`#h-${id}`}>{title}</a></li>)}
          </ol>
        </nav>

        <div className="method-content">
          <ol className="pipeline" aria-label="The five stages of the Phase 3B engine">
            {STAGES.map(([name, text], i) => (
              <li key={name} className="pipeline-step card">
                <span className="pipeline-index" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                <strong>{name}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ol>

          <Section id="possession" title="What possession means">
            <p>
              The challenge labels every frame of a match video. A team is in possession when it has the ball
              alive; in the challenge&apos;s words, possession stays with the last team that had it through passes,
              loose balls and challenges. Stoppages are not anyone&apos;s possession.
            </p>
            <p>
              Ranking uses <strong>spellF1</strong>: each possession, a maximal run of H or of A, is one object, and
              predicted possessions are matched one-to-one to true ones by temporal overlap (IoU). So whole,
              correctly bounded possessions matter more than any single frame. <strong>macroF1</strong> over H, A and
              D breaks ties.
            </p>
          </Section>

          <Section id="labels" title="The four labels">
            <dl className="label-defs">
              <div><dt><LabelChip label="H" /> Home possession</dt><dd>The home team has the ball alive.</dd></div>
              <div><dt><LabelChip label="A" /> Away possession</dt><dd>The away team has the ball alive.</dd></div>
              <div><dt><LabelChip label="D" /> Dead ball</dt><dd>The ball is out of play: before a kickoff, after it leaves the pitch, until a restart.</dd></div>
              <div><dt><LabelChip label="X" /> No answer</dt><dd>Outside the graded halves (ungraded), or inside a half before any possession can be established.</dd></div>
            </dl>
          </Section>

          <Section id="inputs" title="Inputs">
            <ul>
              <li>
                <strong>Automatic tracking.</strong> For every frame where the ball is tracked: each team&apos;s nearest
                player distance to the ball, the ball&apos;s position and its speed, on a 105.3 × 68 m pitch. A frame
                without a tracked ball gives no observation; a team with no tracked player is infinitely far away.
              </li>
              <li>
                <strong>Smart Tagging set pieces.</strong> Only <code>SET PIECES</code> instances are used, as evidence of
                restarts. Times become frames as <code>round(seconds × 25)</code>. The tagged team is matched to the
                metadata team names by text similarity; <code>N/A</code> (every throw-in) or no clear match means the
                team is unknown. Phase tags (build-up, progression, …) are not used.
              </li>
              <li><strong>The published half boundaries.</strong> Each half is processed on its own.</li>
            </ul>
            <p className="source-ref">Source: {file('src/possession.py')}, {file('src/smart_tagging.py')}.</p>
          </Section>

          <Section id="evidence" title="Player and ball evidence">
            <p>Each tracked frame gives one piece of evidence, with no memory of other frames:</p>
            <pre className="code-block"><code>{`home control  if  d_home ≤ 2.0 m  and  d_away − d_home ≥ 1.0 m
away control  if  d_away ≤ 2.0 m  and  d_home − d_away ≥ 1.0 m
otherwise     no credible control   (ball in flight, contested, or nobody close)
no ball       if the ball is not tracked`}</code></pre>
            <p>Being nearest is never enough: a contested ball, where both teams are about equally close, gives no evidence.</p>
          </Section>

          <Section id="uncertainty" title="Short uncertainty">
            <ul>
              <li>
                <strong>Changing possession</strong> needs 10 control observations for the same team, with no tracked
                frame contradicting them. Untracked frames pause the count; a dropout of 10 frames or more resets
                it. A change therefore spans at least 0.4 s, and longer when it bridges short dropouts.
              </li>
              <li><strong>Backdating.</strong> The change is placed at the first observation of that run, the moment the new team took control.</li>
              <li><strong>Holding.</strong> Between control frames, possession is kept through passes, loose balls and challenges. Brief touches shorter than the confirmation do not change it.</li>
              <li>
                <strong>Missing ball.</strong> In open play, possession is held through ball dropouts of up to 250 frames
                (10 s); after a longer gap the state becomes unknown (X). During a stoppage, a missing ball stays D.
              </li>
            </ul>
            <p className="source-ref">See the <Link to="/explorer?scenario=s2">contested loose ball (S2)</Link> and <Link to="/explorer?scenario=s3">missing tracking (S3)</Link> scenarios.</p>
          </Section>

          <Section id="dead-ball" title="Dead ball and restarts">
            <ul>
              <li><strong>Ball out of play:</strong> tracked more than 0.5 m beyond a touchline or goal line for 3 tracked frames in a row within the same half.</li>
              <li><strong>Before a set piece:</strong> the frames of a <code>SET PIECES</code> tag window before its strike.</li>
              <li><strong>Before kickoff:</strong> each half&apos;s frames before the Kick Off (Start) strike (or before the tag, if no strike is found).</li>
              <li>
                <strong>Strike:</strong> the first tracked frame in the tag window, inside the half, at 4 m/s or faster,
                after at least 5 slower tracked frames. A strike found outside the half is rejected, never moved into it.
              </li>
              <li>
                <strong>Restart:</strong> a known tagged team takes possession from the strike. With an unknown team, the
                first team to establish control is backdated to the strike. The confirmation rule still applies,
                so a wrong team tag is overridden by sustained opposing control.
              </li>
              <li><strong>Ending a stoppage:</strong> a restart, or sustained control outside dead frames. A future restart never vetoes present control.</li>
            </ul>
            <p className="source-ref">See the <Link to="/explorer?scenario=s1">kickoff and throw-in (S1)</Link> and <Link to="/explorer?scenario=s4">mistimed tag (S4)</Link> scenarios.</p>
          </Section>

          <Section id="baseline" title="Phase 3B and smooth50">
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

          <Section id="assumptions" title="Assumptions">
            <p>
              The engine is rule-based: there is no machine learning and no training data. The nine parameters were
              fixed in advance from football reasoning. None was fitted to, swept on or checked against the
              competition match.
            </p>
            <div className="table-scroll" role="region" aria-labelledby="h-assumptions" tabIndex={0}>
              <table className="data-table">
                <thead><tr><th scope="col">Parameter</th><th scope="col">Value</th><th scope="col">Meaning</th></tr></thead>
                <tbody>{PARAMETERS.map(([n, v, m]) => <tr key={n}><th scope="row"><code>{n}</code></th><td className="num">{v}</td><td>{m}</td></tr>)}</tbody>
              </table>
            </div>
            <p>Other assumptions: the first team in the metadata is home; the ball&apos;s third raw value is its speed in m/s (stated for player slots, inferred for the ball).</p>
          </Section>

          <Section id="limitations" title="Known limitations">
            <div className="accordion">
              {[
                ['High balls near a line', 'The ball’s height is lost on the pitch plane, so a high ball near a line can briefly read as out of play and end a possession falsely.'],
                ['Ball leaving the pitch untracked', 'Such a stoppage is only recognised in the tag window before its restart, so its D starts late.'],
                ['Missed or early restarts', 'A slow short free kick (under 4 m/s) or a noisy speed reading can hide the strike; a ball thrown back to the taker can trigger it early.'],
                ['Mistimed tags', 'A tag placed over live play, where the ball rests and is then played, inserts a short false stoppage. Scenario S4 shows this.'],
                ['Set-up before the tag window', 'A player holding or placing the ball before the set-piece tag opens reads as possession until the tag window starts.'],
                ['Unknown-team restarts', 'After a restart with no known team, the first team to establish control is credited from the strike, which can favour a quick interception.'],
                ['Unseen events in a tracking gap', 'Possession is held through a ball dropout, so a change of possession during the gap is detected only when the ball reappears. Scenario S3 shows this.'],
                ['Kickoff just before a half block', 'A strike in the ungraded frames before a half is rejected; that half starts unknown until control establishes a team.'],
                ['Unvalidated thresholds', 'The parameters are reasoned, not validated: there is no measured evidence of how they perform on the match.'],
              ].map(([title, text]) => (
                <details key={title}>
                  <summary>{title}</summary>
                  <p>{text}</p>
                </details>
              ))}
            </div>
            <p className="source-ref">Source: {file('docs/TECHNICAL_DOCUMENT.md')}, section 8.</p>
          </Section>

          <Section id="evaluation" title="Synthetic and real-match evaluation">
            <ul>
              <li>
                <strong>What the synthetic scenarios show:</strong> how both models behave on four scripted situations whose
                true labels we wrote ourselves. The <Link to="/compare">Compare</Link> page scores them with the
                organisers&apos; public scorer.
              </li>
              <li>
                <strong>What they do not show:</strong> performance on the competition match. Four short scripted scenarios are
                not a sample of real football, and the reference labels are our own script, not independent ground truth.
              </li>
              <li>
                <strong>On the match:</strong> following the organisers&apos; 3 November 2026 clarification, no accuracy was computed,
                and no parameter was tuned, on the competition match or its ground truth. We make no claim about our competition score.
              </li>
            </ul>
          </Section>

          <Section id="scenarios" title="How the scenarios are made">
            <ol>
              <li>Each scenario is scripted in code (<code>tools/export_scenarios.py</code>): 22 players, the ball, missing observations and Smart Tagging set pieces.</li>
              <li>The script is written to temporary files in the same tracking and tagging formats the engines read.</li>
              <li>The unchanged Phase 3B engine and the smooth50 baseline run on identical files. Their labels and per-frame evidence are exported.</li>
              <li>Reference labels are written down from the script, never from a model. The official scorer (vendored unchanged) compares each output with them.</li>
              <li>The output is deterministic JSON, with the engine commit and file hashes recorded as provenance. No competition data is read.</li>
            </ol>
          </Section>

          <Section id="reproduce" title="Reproduce it locally">
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
    </div>
  );
}
