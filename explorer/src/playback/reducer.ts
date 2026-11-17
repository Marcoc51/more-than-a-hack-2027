/** The single source of truth for playback. Every view reads `frame` from here. */

export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export interface PlaybackState {
  frame: number;
  playing: boolean;
  speed: Speed;
  frameCount: number;
}

export type PlaybackAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'restart' }
  | { type: 'seek'; frame: number }
  | { type: 'step'; delta: number }
  | { type: 'setSpeed'; speed: number }
  | { type: 'advance'; frames: number }
  | { type: 'load'; frameCount: number; frame?: number };

export function clampFrame(frame: number, frameCount: number): number {
  if (!Number.isFinite(frame)) return 0;
  return Math.min(Math.max(Math.trunc(frame), 0), Math.max(frameCount - 1, 0));
}

export function initialPlayback(frameCount: number, frame = 0): PlaybackState {
  return { frame: clampFrame(frame, frameCount), playing: false, speed: 1, frameCount };
}

function isSpeed(v: number): v is Speed {
  return (SPEEDS as readonly number[]).includes(v);
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  const last = state.frameCount - 1;
  switch (action.type) {
    case 'play':
      if (state.playing) return state;
      // Playing from the final frame starts again from the beginning.
      return { ...state, playing: true, frame: state.frame >= last ? 0 : state.frame };
    case 'pause':
      return state.playing ? { ...state, playing: false } : state;
    case 'toggle':
      return playbackReducer(state, { type: state.playing ? 'pause' : 'play' });
    case 'restart':
      return { ...state, frame: 0, playing: false };
    case 'seek':
      return { ...state, frame: clampFrame(action.frame, state.frameCount), playing: false };
    case 'step':
      return { ...state, frame: clampFrame(state.frame + action.delta, state.frameCount), playing: false };
    case 'setSpeed':
      return isSpeed(action.speed) ? { ...state, speed: action.speed } : state;
    case 'advance': {
      if (!state.playing || action.frames <= 0) return state;
      const frame = state.frame + Math.trunc(action.frames);
      return frame >= last ? { ...state, frame: last, playing: false } : { ...state, frame };
    }
    case 'load':
      return { ...initialPlayback(action.frameCount, action.frame ?? 0), speed: state.speed };
  }
}
