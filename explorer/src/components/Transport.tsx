import { useId } from 'react';
import { frameTime } from '../scenario/labels';
import { usePlayback, usePlaybackDispatch } from '../playback/PlaybackProvider';
import { SPEEDS } from '../playback/reducer';

function Icon({ d }: { d: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

const ICONS = {
  restart: 'M6 5h2v14H6zM9.5 12 19 5v14z',
  prev: 'M7 5h2v14H7zM20 5v14l-9-7z',
  next: 'M15 5h2v14h-2zM4 5l9 7-9 7z',
  play: 'M7 4.5v15l13-7.5z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
};

export function Transport({ fps }: { fps: number }) {
  const { frame, frameCount, playing, speed } = usePlayback();
  const dispatch = usePlaybackDispatch();
  const speedId = useId();
  const last = frameCount - 1;

  return (
    <div className="transport" role="group" aria-label="Playback controls">
      <div className="transport-buttons">
        <button type="button" className="btn btn-icon" onClick={() => dispatch({ type: 'restart' })} aria-label="Restart from frame 0">
          <Icon d={ICONS.restart} />
        </button>
        <button type="button" className="btn btn-icon" onClick={() => dispatch({ type: 'step', delta: -1 })} disabled={frame <= 0} aria-label="Previous frame">
          <Icon d={ICONS.prev} />
        </button>
        <button
          type="button"
          className="btn btn-primary btn-icon btn-play"
          onClick={() => dispatch({ type: 'toggle' })}
          aria-label={playing ? 'Pause' : 'Play'}
          aria-pressed={playing}
        >
          <Icon d={playing ? ICONS.pause : ICONS.play} />
        </button>
        <button type="button" className="btn btn-icon" onClick={() => dispatch({ type: 'step', delta: 1 })} disabled={frame >= last} aria-label="Next frame">
          <Icon d={ICONS.next} />
        </button>
      </div>
      <input
        className="scrubber"
        type="range"
        min={0}
        max={last}
        step={1}
        value={frame}
        onChange={(e) => dispatch({ type: 'seek', frame: Number(e.currentTarget.value) })}
        aria-label="Frame"
        aria-valuetext={`Frame ${frame} of ${last}, ${frameTime(frame, fps)}`}
      />
      <output className="readout" aria-live="off" data-testid="readout">
        <span className="readout-frame">Frame {frame}<span className="readout-total"> / {last}</span></span>
        <span className="readout-time">{frameTime(frame, fps)}</span>
      </output>
      <div className="speed">
        <label htmlFor={speedId}>Speed</label>
        <select
          id={speedId}
          className="select"
          value={speed}
          onChange={(e) => dispatch({ type: 'setSpeed', speed: Number(e.currentTarget.value) })}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>
      </div>
    </div>
  );
}
