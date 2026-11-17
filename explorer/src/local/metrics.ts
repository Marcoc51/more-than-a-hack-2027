/** Model-to-model statistics for local exports. Neither label string is a reference: nothing
 *  here computes accuracy, precision, recall or F1, and no function accepts a reference. */

import { labelCounts } from '../scenario/compare';
import type { Label } from '../scenario/types';
import type { LocalScenario } from './validate';

export interface PairAgreement {
  frames: number;
  same: number;
  different: number;
  /** same / frames: how often two predictions coincide, not how often either is right. */
  rate: number | null;
}

export function pairAgreement(a: string, b: string): PairAgreement {
  const frames = Math.min(a.length, b.length);
  let same = 0;
  for (let f = 0; f < frames; f++) if (a[f] === b[f]) same += 1;
  return { frames, same, different: frames - same, rate: frames ? same / frames : null };
}

export interface PairDifference {
  /** Half-open [start, end) clip frames. */
  start: number;
  end: number;
  primary: Label;
  baseline: Label;
}

/** Maximal runs where the two predictions differ and each keeps one label. */
export function pairDifferences(a: string, b: string): PairDifference[] {
  const out: PairDifference[] = [];
  let current: PairDifference | null = null;
  const n = Math.min(a.length, b.length);
  for (let f = 0; f <= n; f++) {
    const x = a[f] as Label | undefined;
    const y = b[f] as Label | undefined;
    const differs = f < n && x !== y;
    if (current && (!differs || current.primary !== x || current.baseline !== y)) {
      out.push(current);
      current = null;
    }
    if (differs && x && y) {
      if (current) current.end = f + 1;
      else current = { start: f, end: f + 1, primary: x, baseline: y };
    }
  }
  return out;
}

/** '=' where the predictions coincide, '!' where they differ: a Timeline 'pair' track. */
export function pairTrack(a: string, b: string): string {
  let s = '';
  for (let f = 0; f < Math.min(a.length, b.length); f++) s += a[f] === b[f] ? '=' : '!';
  return s;
}

export interface LabelSummary {
  counts: Record<Label, number>;
  /** Maximal runs of H or of A (possession spells, as the official scorer counts them). */
  possessionSpells: number;
  /** Frames whose label differs from the previous frame's. */
  labelChanges: number;
  /** H↔A switches, ignoring any D/X frames in between. */
  possessionChanges: number;
}

export function summarizeLabels(labels: string): LabelSummary {
  const counts = labelCounts(labels, Array.from({ length: labels.length }, () => true));
  let possessionSpells = 0;
  let labelChanges = 0;
  let possessionChanges = 0;
  let lastTeam: string | null = null;
  for (let f = 0; f < labels.length; f++) {
    const c = labels[f]!;
    if (f > 0 && c !== labels[f - 1]) labelChanges += 1;
    if ((c === 'H' || c === 'A') && c !== labels[f - 1]) possessionSpells += 1;
    if (c === 'H' || c === 'A') {
      if (lastTeam !== null && lastTeam !== c) possessionChanges += 1;
      lastTeam = c;
    }
  }
  return { counts, possessionSpells, labelChanges, possessionChanges };
}

export interface NearestPlayers {
  /** Metres from the ball to the nearest observed player of each team; null when unavailable. */
  home: number | null;
  away: number | null;
}

/** Tracking context computed in the browser from the exported positions. It is not the
 *  engine's internal control evidence, which local exports do not contain. */
export function nearestPlayers(scenario: LocalScenario, frame: number): NearestPlayers {
  const f = scenario.frames[frame];
  if (!f?.ball) return { home: null, away: null };
  const [bx, by] = f.ball;
  const sideOf = new Map(scenario.teams.map((t) => [t.id, t.side]));
  let home: number | null = null;
  let away: number | null = null;
  scenario.players.forEach((p, i) => {
    const xy = f.players[i];
    if (!xy) return;
    const d = Math.hypot(xy[0] - bx, xy[1] - by);
    if (sideOf.get(p.teamId) === 'home') home = home === null ? d : Math.min(home, d);
    else away = away === null ? d : Math.min(away, d);
  });
  return { home, away };
}

/** "mm:ss" of a source frame at the export's frame rate. */
export function matchClock(sourceFrame: number, fps: number): string {
  const seconds = Math.floor(sourceFrame / fps);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
