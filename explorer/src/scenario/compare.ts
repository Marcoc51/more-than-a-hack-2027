/** Frame-level comparison of model labels with a scenario's script reference, computed in the
 *  browser directly from the exported labels.
 *
 *  Every comparison uses ONE mask, scoredMask(): the official scorer's rule
 *  (tools/vendor/possession_metrics.py valid_runs): a frame is graded exactly when the reference is
 *  not X. A reference X is never scored; a predicted X on a scored frame is a miss. The scenario's
 *  declared intervals (declaredMask) are the engine's halves: context for the Explorer, not the
 *  comparison mask. */

import { isLabel } from './labels';
import type { Label, ModelId, Scenario, ScenarioEvent } from './types';

export const LABEL_ORDER: readonly Label[] = ['H', 'A', 'D', 'X'];
export const MODEL_IDS: readonly ModelId[] = ['phase3b', 'smooth50'];

/** Frames inside the scenario's declared graded intervals (half-open). Context only. */
export function declaredMask(scenario: Scenario): boolean[] {
  const mask = new Array<boolean>(scenario.frameCount).fill(false);
  for (const [start, end] of scenario.graded) for (let f = start; f < end; f++) mask[f] = true;
  return mask;
}

/** The official graded-frame mask: the reference label is not X. No reference: nothing is scored. */
export function scoredMask(scenario: Scenario): boolean[] {
  const ref = scenario.reference?.labels;
  return Array.from({ length: scenario.frameCount }, (_, f) => ref !== undefined && isLabel(ref[f]) && ref[f] !== 'X');
}

export interface Agreement {
  graded: number;
  agree: number;
  disagree: number;
  /** agree / graded, or null when nothing is graded. */
  rate: number | null;
}

export function agreement(reference: string, labels: string, mask: readonly boolean[]): Agreement {
  let graded = 0;
  let agree = 0;
  mask.forEach((g, f) => {
    if (!g) return;
    graded += 1;
    if (reference[f] === labels[f]) agree += 1;
  });
  return { graded, agree, disagree: graded - agree, rate: graded ? agree / graded : null };
}

export function labelCounts(labels: string, mask: readonly boolean[]): Record<Label, number> {
  const counts: Record<Label, number> = { H: 0, A: 0, D: 0, X: 0 };
  mask.forEach((g, f) => {
    const c = labels[f];
    if (g && isLabel(c)) counts[c] += 1;
  });
  return counts;
}

/** 4x4 counts on graded frames: rows = reference H/A/D/X, columns = prediction H/A/D/X. */
export function confusion(reference: string, labels: string, mask: readonly boolean[]): number[][] {
  const m = LABEL_ORDER.map(() => LABEL_ORDER.map(() => 0));
  mask.forEach((g, f) => {
    if (!g) return;
    const r = LABEL_ORDER.indexOf(reference[f] as Label);
    const p = LABEL_ORDER.indexOf(labels[f] as Label);
    if (r >= 0 && p >= 0) m[r]![p]! += 1;
  });
  return m;
}

export interface Disagreement {
  /** Half-open [start, end) frames. */
  start: number;
  end: number;
  reference: Label;
  phase3b: Label;
  smooth50: Label;
  /** Models whose label differs from the reference in this interval. */
  models: ModelId[];
}

/** Maximal scored runs in which the (reference, Possession Engine, smooth50) labels are constant and at
 *  least one model differs from the reference. Never spans an unscored (reference X) frame. */
export function disagreements(scenario: Scenario): Disagreement[] {
  const mask = scoredMask(scenario);
  const ref = scenario.reference?.labels ?? '';
  const p3 = scenario.models.phase3b.labels;
  const sm = scenario.models.smooth50.labels;
  const out: Disagreement[] = [];
  let current: Disagreement | null = null;
  for (let f = 0; f <= scenario.frameCount; f++) {
    const r = ref[f];
    const a = p3[f];
    const b = sm[f];
    const differs = f < scenario.frameCount && mask[f] === true && isLabel(r) && isLabel(a) && isLabel(b) && (a !== r || b !== r);
    if (current && (!differs || current.reference !== r || current.phase3b !== a || current.smooth50 !== b)) {
      out.push(current);
      current = null;
    }
    if (differs && !current && isLabel(r) && isLabel(a) && isLabel(b)) {
      const models: ModelId[] = [];
      if (a !== r) models.push('phase3b');
      if (b !== r) models.push('smooth50');
      current = { start: f, end: f + 1, reference: r, phase3b: a, smooth50: b, models };
    } else if (current) {
      current.end = f + 1;
    }
  }
  return out;
}

/** Scenario events that overlap a frame interval (an event without an interval covers its frame). */
export function eventsIn(scenario: Scenario, start: number, end: number): ScenarioEvent[] {
  return scenario.events.filter((e) => {
    const [a, b] = e.interval ?? [e.frame, e.frame + 1];
    return a < end && b > start;
  });
}

/** First frame at or after `from` with the given label, or null. */
export function firstFrame(labels: string, label: Label, from = 0): number | null {
  const i = labels.indexOf(label, from);
  return i < 0 ? null : i;
}

/** Longest run of one evidence character inside [start, end). */
export function longestRun(s: string, c: string, start = 0, end = s.length): number {
  let best = 0;
  let run = 0;
  for (let f = start; f < end; f++) {
    run = s[f] === c ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function percent(rate: number | null): string {
  return rate === null ? 'n/a' : `${(rate * 100).toFixed(1)}%`;
}

export interface Summary {
  /** Frame agreement of both models with the reference, in one sentence. */
  agreement: string;
  /** Which model scores higher on the official synthetic spellF1 (or that they tie). */
  spells: string;
  /** Possession Engine's longest difference from the reference, or that there is none. */
  difference: string;
}

/** The Compare page's headline, generated from the exported labels and official scores only. */
export function summarize(scenario: Scenario): Summary {
  const mask = scoredMask(scenario);
  const ref = scenario.reference?.labels ?? '';
  const { phase3b, smooth50 } = scenario.models;
  const a3 = agreement(ref, phase3b.labels, mask);
  const as = agreement(ref, smooth50.labels, mask);
  const s3 = phase3b.scores.spellF1Mean;
  const ss = smooth50.scores.spellF1Mean;
  const longest = disagreements(scenario)
    .filter((d) => d.models.includes('phase3b'))
    .sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)[0];
  return {
    agreement: `Possession Engine matches the script on ${a3.agree} of ${a3.graded} graded frames (${percent(a3.rate)}); smooth50 on ${as.agree} (${percent(as.rate)}).`,
    spells: s3 === ss
      ? `Both score ${s3.toFixed(3)} on the official synthetic spellF1.`
      : `On the official synthetic spellF1, ${s3 > ss ? 'Possession Engine' : 'smooth50'} scores higher (${Math.max(s3, ss).toFixed(3)} vs ${Math.min(s3, ss).toFixed(3)}).`,
    difference: longest
      ? `Possession Engine's longest difference is frames ${longest.start}–${longest.end - 1}: reference ${longest.reference}, Possession Engine ${longest.phase3b}.`
      : 'Possession Engine agrees with the script on every graded frame.',
  };
}
