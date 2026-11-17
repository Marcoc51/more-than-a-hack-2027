import type { Label, Scenario, ScenarioEvent } from './types';

export const LABELS: Readonly<Record<Label, { name: string; short: string }>> = {
  H: { name: 'Home possession', short: 'Home' },
  A: { name: 'Away possession', short: 'Away' },
  D: { name: 'Dead ball', short: 'Dead' },
  X: { name: 'No answer', short: 'None' },
};

export function isLabel(c: string | undefined): c is Label {
  return c === 'H' || c === 'A' || c === 'D' || c === 'X';
}

/** Label of a label string at a frame; X if the frame is out of range. */
export function labelAt(labels: string, frame: number): Label {
  const c = labels[frame];
  return isLabel(c) ? c : 'X';
}

export interface Run {
  value: string;
  start: number;
  /** Exclusive. */
  end: number;
}

/** Maximal runs of equal characters, with exact half-open frame boundaries. */
export function runs(s: string): Run[] {
  const out: Run[] = [];
  let start = 0;
  for (let i = 1; i <= s.length; i++) {
    if (i === s.length || s[i] !== s[start]) {
      out.push({ value: s[start] ?? '', start, end: i });
      start = i;
    }
  }
  return out;
}

export function frameTime(frame: number, fps: number): string {
  return `${(frame / fps).toFixed(2)} s`;
}

export function isGraded(scenario: Scenario, frame: number): boolean {
  return scenario.graded.some(([start, end]) => frame >= start && frame < end);
}

/** Events whose interval covers the frame, or that happen exactly at it. */
export function eventsAt(scenario: Scenario, frame: number): ScenarioEvent[] {
  return scenario.events.filter((e) =>
    e.interval ? frame >= e.interval[0] && frame < e.interval[1] : frame === e.frame);
}

export function nextEvent(scenario: Scenario, frame: number): ScenarioEvent | undefined {
  return scenario.events.filter((e) => e.frame > frame).sort((a, b) => a.frame - b.frame)[0];
}
