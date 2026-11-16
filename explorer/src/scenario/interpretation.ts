/** Scenario-specific explanation for the Compare page, written for the UI. Every number is
 *  computed from the exported data, so the text cannot drift from the model output. The four
 *  parts are kept apart on purpose: the script (ground truth), what the engines observe, what
 *  the models output, and the interface's own interpretation. */

import { agreement, firstFrame, scoredMask, longestRun } from './compare';
import { runs } from './labels';
import type { Scenario } from './types';

export interface Interpretation {
  reference: string;
  observations: string;
  predictions: string;
  interpretation: string;
}

const eventFrame = (s: Scenario, type: string) => s.events.find((e) => e.type === type);

function generic(s: Scenario): Interpretation {
  const mask = scoredMask(s);
  const ref = s.reference?.labels ?? '';
  const p3 = agreement(ref, s.models.phase3b.labels, mask);
  const sm = agreement(ref, s.models.smooth50.labels, mask);
  return {
    reference: s.reference?.description ?? 'This scenario has no script reference.',
    observations: 'Both models read the same synthetic tracking frames.',
    predictions: `Phase 3B matches the reference on ${p3.agree} of ${p3.graded} graded frames; smooth50 on ${sm.agree}.`,
    interpretation: 'See the disagreement list for where and how the outputs differ.',
  };
}

export function interpret(s: Scenario): Interpretation {
  const ref = s.reference?.labels ?? '';
  const p3 = s.models.phase3b.labels;
  const sm = s.models.smooth50.labels;
  const ev = s.models.phase3b.evidence;
  const mask = scoredMask(s);
  const p3Agree = agreement(ref, p3, mask);
  const smA = firstFrame(sm, 'A');
  const smHasD = sm.includes('D');

  if (s.id === 's1') {
    const throwIn = eventFrame(s, 'throw-in')?.frame;
    return {
      reference: `The script has home possession from the kickoff strike, a dead ball once the cross goes out, and away possession from the throw-in strike at frame ${throwIn}. Frames outside the graded interval are X.`,
      observations: 'Ball tracking stops after the ball goes out and resumes at the touchline. Both set pieces are tagged in Smart Tagging.',
      predictions: `Phase 3B matches the reference on ${p3Agree.agree} of ${p3Agree.graded} graded frames. smooth50 ${smHasD ? 'includes' : 'has no'} dead-ball frames, labels every frame (no X), and switches to away at frame ${smA}.`,
      interpretation: 'The baseline only knows which player is nearest; it has no notion of a stoppage or a restart, so it moves the possession change into the stoppage.',
    };
  }
  if (s.id === 's2') {
    const win = eventFrame(s, 'away-wins-ball')?.frame ?? 0;
    const contest = eventFrame(s, 'contest')?.interval ?? [0, win];
    const burst = longestRun(ev, 'A', contest[0], contest[1]);
    return {
      reference: `Home keeps possession through the scramble (possession stays with the last team that had it) until away #8 wins the ball outright at frame ${win}.`,
      observations: `During the scramble the engine sees mostly contested frames, with short bursts of clear control for each side. The longest away burst before frame ${win} is ${burst} consecutive frames.`,
      predictions: `Phase 3B switches to away at frame ${firstFrame(p3, 'A')}. smooth50 switches at frame ${smA}, ${win - (smA ?? win)} frames before the script.`,
      interpretation: `Phase 3B needs 10 control observations to change possession, so ${burst}-frame bursts do not flip it. smooth50 votes on the nearest player, who is often the away challenger during the scramble. Note that macroF1 is at most 0.667 here: it averages over H, A and D, and this scenario has no dead ball.`,
    };
  }
  if (s.id === 's3') {
    const gap = eventFrame(s, 'tracking-lost')?.interval ?? [0, 0];
    const tackle = eventFrame(s, 'tackle')?.frame;
    const mid = Math.floor((gap[0] + gap[1]) / 2);
    return {
      reference: `Away #3 tackles at frame ${tackle}, while the ball is untracked, so the script has away possession from frame ${tackle}.`,
      observations: `The ball is missing for ${gap[1] - gap[0]} frames (${gap[0]}–${gap[1] - 1}); players stay tracked. No model sees the ball during the tackle.`,
      predictions: `Phase 3B holds home possession through the gap and switches to away at frame ${firstFrame(p3, 'A')}, when tracking resumes. smooth50 switches at frame ${smA}${smA === mid ? ', the midpoint of the gap' : ''}.`,
      interpretation: `Holding possession through a gap of up to 10 s is a deliberate engine rule, so the tackle is invisible to it until the ball reappears. smooth50 lands nearer the tackle by construction rather than by observation: inside the gap, its ±50-frame vote only sees the tracked frames on either side${smA === mid ? ', which flips it at the midpoint' : ''}.`,
    };
  }
  if (s.id === 's4') {
    const thrown = eventFrame(s, 'throw-in')?.frame ?? 0;
    const tag = eventFrame(s, 'mistimed-tag')?.interval ?? [0, 0];
    const falseDead = runs(p3).filter((r) => r.value === 'D' && r.start >= tag[0] && r.start < tag[1]);
    const restart = s.models.phase3b.restarts[0]?.frame;
    const p3A = firstFrame(p3, 'A');
    return {
      reference: `The ball goes out, away takes the throw-in at frame ${thrown}, and away keeps possession to the end. The Smart Tagging throw-in tag (frames ${tag[0]}–${tag[1] - 1}) is ${tag[0] - thrown} frames late: by the script, play is live throughout it.`,
      observations: 'The tag is read exactly as the engine parser expects. Inside its window the ball rolls slowly at an away player\'s feet, then is passed.',
      predictions: `Phase 3B keeps the stoppage until away control is confirmed at frame ${p3A}, ${(p3A ?? thrown) - thrown} frames after the real throw.${falseDead.length ? ` The late tag then makes it label frames ${falseDead.map((r) => `${r.start}–${r.end - 1}`).join(', ')} as a dead ball, with a restart at frame ${restart}.` : ''} smooth50 ${smHasD ? 'includes' : 'never outputs'} a dead ball here and switches to away at frame ${smA}.`,
      interpretation: 'The engine trusts a located restart in a tag window: a slow ball followed by a strike looks like a set piece. A mistimed tag therefore inserts a short false stoppage. This is the known limitation the technical document describes, shown on synthetic data.',
    };
  }
  return generic(s);
}
