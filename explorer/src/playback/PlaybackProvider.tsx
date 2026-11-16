import { createContext, useContext, useEffect, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import { advanceClock } from './clock';
import { initialPlayback, playbackReducer, type PlaybackAction, type PlaybackState } from './reducer';

const StateContext = createContext<PlaybackState | null>(null);
const DispatchContext = createContext<Dispatch<PlaybackAction> | null>(null);

interface Props {
  frameCount: number;
  fps: number;
  initialFrame?: number;
  children: ReactNode;
}

/** Owns the one playback state and the one animation loop. Remount (key) per scenario. */
export function PlaybackProvider({ frameCount, fps, initialFrame = 0, children }: Props) {
  const [state, dispatch] = useReducer(playbackReducer, undefined, () => initialPlayback(frameCount, initialFrame));

  // A different scenario length without remounting: reset to a valid frame.
  useEffect(() => {
    if (state.frameCount !== frameCount) dispatch({ type: 'load', frameCount });
  }, [frameCount, state.frameCount]);

  const speedRef = useRef(state.speed);
  useEffect(() => {
    speedRef.current = state.speed;
  }, [state.speed]);

  useEffect(() => {
    if (!state.playing) return undefined;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const tick = (now: number) => {
      const step = advanceClock(now - last, speedRef.current, fps, carry);
      last = now;
      carry = step.carry;
      if (step.frames > 0) dispatch({ type: 'advance', frames: step.frames });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state.playing, fps]);

  // A hidden tab pauses playback instead of drifting or catching up on return.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') dispatch({ type: 'pause' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function usePlayback(): PlaybackState {
  const v = useContext(StateContext);
  if (!v) throw new Error('usePlayback must be used inside <PlaybackProvider>');
  return v;
}

export function usePlaybackDispatch(): Dispatch<PlaybackAction> {
  const v = useContext(DispatchContext);
  if (!v) throw new Error('usePlaybackDispatch must be used inside <PlaybackProvider>');
  return v;
}
