/** UI-written descriptions. These are explanatory text authored for the interface. They are NOT
 *  emitted by the Python engine; the engine emits only the codes they describe. */

export const REASON_DESCRIPTIONS: Readonly<Record<string, string>> = {
  unknown: 'No possession is established at this frame, so the engine answers X.',
  control: 'The labelled team has credible control in this frame.',
  carried: 'The ball is tracked but gives no new evidence, so the current possession is carried over.',
  gap: 'The ball is not tracked, so the current possession is held through the gap (up to 10 s).',
  dead: 'Confirmed dead ball: out of play, before a set-piece strike, or before the kickoff.',
  restart: 'A Smart Tagging set-piece strike was located here, and it starts a new possession.',
};

export const EVIDENCE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  H: 'Home has credible control: nearest home player within 2.0 m, and every away player at least 1.0 m further away.',
  A: 'Away has credible control: nearest away player within 2.0 m, and every home player at least 1.0 m further away.',
  '.': 'The ball is tracked, but neither team has credible control (ball in flight, contested, or nobody close).',
  _: 'The ball is not tracked in this frame.',
};

export const OUTSIDE_GRADED = 'Outside the graded interval: these frames are ungraded and written as X.';
