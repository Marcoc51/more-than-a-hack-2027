import {
  LABEL_ORDER, agreement, confusion, declaredMask, disagreements, eventsIn, firstFrame, labelCounts, longestRun, scoredMask,
} from '../scenario/compare';
import { interpret } from '../scenario/interpretation';
import { runs } from '../scenario/labels';
import type { Scenario } from '../scenario/types';
import { ALL, S1, S2, S3, S4 } from './util';

/** A tiny scenario with only the fields the comparison functions read. */
function mini(ref: string, p3: string, sm: string, graded: [number, number][]): Scenario {
  return {
    ...S1, frameCount: ref.length, graded, events: [],
    reference: { labels: ref, source: 'scenario-script', description: '' },
    models: { phase3b: { ...S1.models.phase3b, labels: p3 }, smooth50: { ...S1.models.smooth50, labels: sm } },
  };
}

describe('comparison metrics on hand-built labels', () => {
  const s = mini('XHHHHDDAAX', 'XHHHDDDAAA', 'HHHHHHAAAA', [[1, 9]]);
  const mask = scoredMask(s);

  it('grades exactly the frames where the reference is not X', () => {
    expect(mask).toEqual([false, true, true, true, true, true, true, true, true, false]);
  });

  it('counts agreement on graded frames only', () => {
    expect(agreement(s.reference!.labels, s.models.phase3b.labels, mask)).toEqual({ graded: 8, agree: 7, disagree: 1, rate: 7 / 8 });
    // graded frames 1-8: reference HHHHDDAA vs smooth50 HHHHHAAA -> differs at frames 5 and 6
    expect(agreement(s.reference!.labels, s.models.smooth50.labels, mask)).toEqual({ graded: 8, agree: 6, disagree: 2, rate: 6 / 8 });
    expect(agreement('', '', []).rate).toBeNull();
  });

  it('counts labels and builds the confusion matrix on graded frames', () => {
    expect(labelCounts(s.models.smooth50.labels, mask)).toEqual({ H: 5, A: 3, D: 0, X: 0 });
    const cm = confusion(s.reference!.labels, s.models.smooth50.labels, mask);
    expect(cm[0]).toEqual([4, 0, 0, 0]);   // reference H -> all H
    expect(cm[1]).toEqual([0, 2, 0, 0]);   // reference A -> A
    expect(cm[2]).toEqual([1, 1, 0, 0]);   // reference D -> one H, one A
    expect(cm.flat().reduce((a, b) => a + b, 0)).toBe(8);
  });

  it('finds maximal disagreement intervals with constant labels, never across ungraded frames', () => {
    expect(disagreements(s)).toEqual([
      { start: 4, end: 5, reference: 'H', phase3b: 'D', smooth50: 'H', models: ['phase3b'] },
      { start: 5, end: 6, reference: 'D', phase3b: 'D', smooth50: 'H', models: ['smooth50'] },
      { start: 6, end: 7, reference: 'D', phase3b: 'D', smooth50: 'A', models: ['smooth50'] },
    ]);
  });

  it('helpers: first frame, longest run, overlapping events', () => {
    expect(firstFrame('HHAAD', 'A')).toBe(2);
    expect(firstFrame('HHH', 'A')).toBeNull();
    expect(longestRun('AA.AAA.A', 'A')).toBe(3);
    expect(longestRun('AA.AAA.A', 'A', 0, 4)).toBe(2);
    const withEvents = { ...s, events: [
      { type: 'a', frame: 2, interval: [2, 4] as const, teamId: null, source: 'scenario' as const, description: '' },
      { type: 'b', frame: 8, interval: null, teamId: null, source: 'scenario' as const, description: '' },
    ] };
    expect(eventsIn(withEvents, 3, 5).map((e) => e.type)).toEqual(['a']);
    expect(eventsIn(withEvents, 8, 9).map((e) => e.type)).toEqual(['b']);
  });
});

describe('comparison metrics on the exported scenarios', () => {
  it.each(ALL.map((s) => [s.id, s] as const))('%s: browser confusion matches the official scorer on graded rows', (_id, s) => {
    const mask = scoredMask(s);
    for (const m of ['phase3b', 'smooth50'] as const) {
      const ours = confusion(s.reference!.labels, s.models[m].labels, mask);
      const official = s.models[m].scores.confusion;
      LABEL_ORDER.slice(0, 3).forEach((_, r) => expect(ours[r]).toEqual(official[r]));   // H, A, D rows
      expect(ours[3]).toEqual([0, 0, 0, 0]);                                              // X is never graded
    }
  });

  it.each(ALL.map((s) => [s.id, s] as const))('%s: disagreements cover exactly the frames where a model differs', (_id, s) => {
    const mask = scoredMask(s);
    const ref = s.reference!.labels;
    const covered = new Set<number>();
    for (const d of disagreements(s)) for (let f = d.start; f < d.end; f++) covered.add(f);
    for (let f = 0; f < s.frameCount; f++) {
      const differs = mask[f]! && (s.models.phase3b.labels[f] !== ref[f] || s.models.smooth50.labels[f] !== ref[f]);
      expect(covered.has(f)).toBe(differs);
    }
  });

  it('S1: Possession Engine matches the reference on every graded frame', () => {
    expect(disagreements(S1).every((d) => !d.models.includes('phase3b'))).toBe(true);
  });
});

describe('interpretation text states facts computed from the data', () => {
  it('S2: short away bursts stay under the 10-observation confirmation', () => {
    const contest = S2.events.find((e) => e.type === 'contest')!.interval!;
    expect(longestRun(S2.models.phase3b.evidence, 'A', contest[0], contest[1])).toBeLessThan(10);
    expect(interpret(S2).observations).toContain(`${longestRun(S2.models.phase3b.evidence, 'A', contest[0], contest[1])} consecutive frames`);
  });

  it('S3: smooth50 flips at the gap midpoint, Possession Engine when tracking resumes', () => {
    const gap = S3.events.find((e) => e.type === 'tracking-lost')!.interval!;
    expect(firstFrame(S3.models.smooth50.labels, 'A')).toBe((gap[0] + gap[1]) / 2);
    expect(firstFrame(S3.models.phase3b.labels, 'A')).toBe(gap[1]);
    expect(interpret(S3).predictions).toContain('the midpoint of the gap');
  });

  it('S4: the late tag produces a dead-ball run inside live play', () => {
    const tag = S4.events.find((e) => e.type === 'mistimed-tag')!.interval!;
    const falseDead = runs(S4.models.phase3b.labels).filter((r) => r.value === 'D' && r.start >= tag[0] && r.start < tag[1]);
    expect(falseDead).toHaveLength(1);
    expect(S4.reference!.labels.slice(tag[0], tag[1])).toMatch(/^A+$/);
    expect(interpret(S4).predictions).toContain(`${falseDead[0]!.start}–${falseDead[0]!.end - 1}`);
  });

  it('every scenario has all four parts', () => {
    for (const s of ALL) {
      const t = interpret(s);
      for (const part of [t.reference, t.observations, t.predictions, t.interpretation]) expect(part.length).toBeGreaterThan(20);
    }
  });
});

describe('UI2-01: the comparison mask follows the official scorer (reference X is never graded)', () => {
  // Official outputs below were computed with tools/vendor/possession_metrics.py evaluate() on the
  // same synthetic arrays: n_graded, then the 4x4 confusion (rows reference, columns output, H/A/D/X).
  const OFFICIAL = {
    'HXH vs HHH': { nGraded: 2, confusion: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [1, 0, 0, 0]] },
    'HXH vs XAH': { nGraded: 2, confusion: [[1, 0, 0, 1], [0, 0, 0, 0], [0, 0, 0, 0], [0, 1, 0, 0]] },
    'HXHHD vs AAAAD': { nGraded: 4, confusion: [[0, 3, 0, 0], [0, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0]] },
  };
  const graded = (cm: number[][]) => cm.flat().reduce((a, b) => a + b, 0);

  it('HXH inside a declared [0, 3) interval grades 2 frames, not 3', () => {
    const s = mini('HXH', 'HHH', 'HHH', [[0, 3]]);
    expect(declaredMask(s)).toEqual([true, true, true]);
    expect(scoredMask(s)).toEqual([true, false, true]);
    expect(agreement('HXH', 'HHH', scoredMask(s)).graded).toBe(OFFICIAL['HXH vs HHH'].nGraded);
  });

  it('a predicted X on a reference H frame is a miss', () => {
    const s = mini('HXH', 'XAH', 'HHH', [[0, 3]]);
    expect(agreement('HXH', 'XAH', scoredMask(s))).toEqual({ graded: 2, agree: 1, disagree: 1, rate: 0.5 });
    expect(confusion('HXH', 'XAH', scoredMask(s))[0]).toEqual(OFFICIAL['HXH vs XAH'].confusion[0]);   // H -> X counted
  });

  it('a reference X never creates a graded disagreement', () => {
    const s = mini('HXH', 'HAH', 'HDH', [[0, 3]]);
    expect(disagreements(s)).toEqual([]);
  });

  it('reference X frames are excluded from the graded confusion totals; graded rows match the official scorer', () => {
    for (const [ref, pred, key] of [['HXH', 'HHH', 'HXH vs HHH'], ['HXH', 'XAH', 'HXH vs XAH'], ['HXHHD', 'AAAAD', 'HXHHD vs AAAAD']] as const) {
      const official = OFFICIAL[key];
      const s = mini(ref, pred, pred, [[0, ref.length]]);
      const cm = confusion(ref, pred, scoredMask(s));
      expect(graded(cm)).toBe(official.nGraded);
      expect(cm.slice(0, 3)).toEqual(official.confusion.slice(0, 3));   // H, A, D rows identical
      expect(cm[3]).toEqual([0, 0, 0, 0]);                               // the X row is never graded
    }
  });

  it('handles an absent class consistently', () => {
    const s = mini('HXHHD', 'AAAAD', 'AAAAD', [[0, 5]]);
    const mask = scoredMask(s);
    expect(labelCounts('HXHHD', mask)).toEqual({ H: 3, A: 0, D: 1, X: 0 });   // no reference A at all
    expect(confusion('HXHHD', 'AAAAD', mask)[1]).toEqual([0, 0, 0, 0]);     // empty A row, not NaN
    expect(agreement('HXHHD', 'AAAAD', mask)).toEqual({ graded: 4, agree: 1, disagree: 3, rate: 0.25 });
    expect(agreement('XXX', 'HHH', scoredMask(mini('XXX', 'HHH', 'HHH', [[0, 3]]))).rate).toBeNull();
  });

  it('keeps the interval semantics: constant-label runs merge, a reference X separates them', () => {
    const s = mini('HXHH', 'AAAA', 'HHHH', [[0, 4]]);
    expect(disagreements(s)).toEqual([
      { start: 0, end: 1, reference: 'H', phase3b: 'A', smooth50: 'H', models: ['phase3b'] },
      { start: 2, end: 4, reference: 'H', phase3b: 'A', smooth50: 'H', models: ['phase3b'] },
    ]);
  });

  it('leaves the four exported scenarios unchanged (frozen before the fix)', () => {
    const frozen = { s1: [350, 350, 241], s2: [300, 300, 264], s3: [300, 240, 290], s4: [320, 290, 243] } as const;
    for (const s of ALL) {
      const mask = scoredMask(s);
      const [n, p3, sm] = frozen[s.id as keyof typeof frozen];
      expect(agreement(s.reference!.labels, s.models.phase3b.labels, mask)).toMatchObject({ graded: n, agree: p3 });
      expect(agreement(s.reference!.labels, s.models.smooth50.labels, mask)).toMatchObject({ graded: n, agree: sm });
      expect(mask).toEqual(declaredMask(s));
    }
  });
});
