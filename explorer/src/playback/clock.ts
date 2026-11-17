/** Longest wall-clock step the playback loop accepts. A throttled or backgrounded tab produces
 *  a huge gap between animation frames; capping it prevents a sudden jump (drift). */
export const MAX_STEP_MS = 250;

export interface ClockResult {
  /** Whole frames to advance now. */
  frames: number;
  /** Fractional frame carried to the next tick. */
  carry: number;
}

/** How many scenario frames to advance after `elapsedMs` of wall-clock time. */
export function advanceClock(elapsedMs: number, speed: number, fps: number, carry: number): ClockResult {
  const ms = Math.min(Math.max(elapsedMs, 0), MAX_STEP_MS);
  const total = carry + (ms / 1000) * fps * speed;
  const frames = Math.floor(total);
  return { frames, carry: total - frames };
}
