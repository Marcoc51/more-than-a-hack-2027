import { useId, useMemo } from 'react';
import type { Scenario, XY } from '../scenario/types';
import { usePlayback } from '../playback/PlaybackProvider';

/** The pitch needs positions only (never the ball's speed), so local exports, whose ball speed may
 *  be unknown, share this view without synthetic scores. */
export interface PitchFrame {
  ball: readonly [number, number, ...unknown[]] | null;
  players: ReadonlyArray<XY | null>;
}
export type PitchScenario = Pick<Scenario, 'title' | 'pitch' | 'teams' | 'players'> & { frames: readonly PitchFrame[] };

const SPOT = 11;
const BOX_DEPTH = 16.5;
const BOX_WIDTH = 40.32;
const GOAL_AREA_DEPTH = 5.5;
const GOAL_AREA_WIDTH = 18.32;
const CIRCLE = 9.15;
const GOAL_WIDTH = 7.32;

function Markings({ length: L, width: W }: { length: number; width: number }) {
  const cy = W / 2;
  const arcDy = Math.sqrt(CIRCLE ** 2 - (BOX_DEPTH - SPOT) ** 2);
  return (
    <g className="pitch-lines" aria-hidden="true">
      <rect x={0} y={0} width={L} height={W} />
      <line x1={L / 2} y1={0} x2={L / 2} y2={W} />
      <circle cx={L / 2} cy={cy} r={CIRCLE} />
      <circle className="pitch-spot" cx={L / 2} cy={cy} r={0.3} />
      {[0, 1].map((side) => {
        const dir = side === 0 ? 1 : -1;
        const x0 = side === 0 ? 0 : L;
        return (
          <g key={side}>
            <rect x={side === 0 ? 0 : L - BOX_DEPTH} y={cy - BOX_WIDTH / 2} width={BOX_DEPTH} height={BOX_WIDTH} />
            <rect x={side === 0 ? 0 : L - GOAL_AREA_DEPTH} y={cy - GOAL_AREA_WIDTH / 2} width={GOAL_AREA_DEPTH} height={GOAL_AREA_WIDTH} />
            <rect className="pitch-goal" x={side === 0 ? -1.5 : L} y={cy - GOAL_WIDTH / 2} width={1.5} height={GOAL_WIDTH} />
            <circle className="pitch-spot" cx={x0 + dir * SPOT} cy={cy} r={0.3} />
            <path d={`M ${x0 + dir * BOX_DEPTH} ${cy - arcDy} A ${CIRCLE} ${CIRCLE} 0 0 ${side === 0 ? 1 : 0} ${x0 + dir * BOX_DEPTH} ${cy + arcDy}`} />
            <path d={`M ${x0} 1 A 1 1 0 0 ${side === 0 ? 0 : 1} ${x0 + dir} 0`} />
            <path d={`M ${x0 + dir} ${W} A 1 1 0 0 ${side === 0 ? 0 : 1} ${x0} ${W - 1}`} />
          </g>
        );
      })}
    </g>
  );
}

/** Most recent observed ball position at or before a frame, for the "not tracked" marker. */
function lastSeenBall(scenario: PitchScenario, frame: number): XY | null {
  for (let f = frame; f >= 0; f--) {
    const ball = scenario.frames[f]?.ball;
    if (ball) return [ball[0], ball[1]];
  }
  return null;
}

export function Pitch({ scenario, showNumbers = true, synthetic = true }: { scenario: PitchScenario; showNumbers?: boolean; synthetic?: boolean }) {
  const { frame } = usePlayback();
  const titleId = useId();
  const descId = useId();
  const { length: L, width: W } = scenario.pitch;
  const current = scenario.frames[frame];
  const sideOf = useMemo(
    () => new Map(scenario.teams.map((t) => [t.id, t.side])),
    [scenario.teams],
  );
  const ghost = current && !current.ball ? lastSeenBall(scenario, frame) : null;
  const tracked = current ? current.players.filter(Boolean).length : 0;
  const description = !current
    ? 'No observation for this frame.'
    : `Frame ${frame}. ${tracked} of ${scenario.players.length} players tracked. ` +
      (current.ball
        ? `Ball at ${current.ball[0].toFixed(1)} m, ${current.ball[1].toFixed(1)} m.`
        : 'Ball not tracked.');

  return (
    <figure className="pitch">
      <svg
        className="pitch-svg"
        viewBox={`-3 -3 ${L + 6} ${W + 6}`}
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
      >
        <title id={titleId}>{synthetic ? 'Synthetic tactical pitch' : 'Local tactical pitch'}, {scenario.title}</title>
        <desc id={descId}>{description}</desc>
        <rect className="pitch-surface" x={-3} y={-3} width={L + 6} height={W + 6} rx={1.5} />
        <Markings length={L} width={W} />
        {current?.players.map((pos, i) => {
          const player = scenario.players[i];
          if (!pos || !player) return null;
          const side = sideOf.get(player.teamId) ?? 'home';
          return (
            <g
              key={player.id}
              className={`player player-${side}${player.role === 'GK' ? ' player-gk' : ''}`}
              transform={`translate(${pos[0]} ${pos[1]})`}
              data-testid={`player-${player.id}`}
            >
              <circle r={1.35} />
              {showNumbers && (
                <text className="player-number" textAnchor="middle" dominantBaseline="central">
                  {player.shirt}
                </text>
              )}
            </g>
          );
        })}
        {current?.ball && (
          <circle className="ball" cx={current.ball[0]} cy={current.ball[1]} r={0.65} data-testid="ball" />
        )}
        {ghost && (
          <g className="ball-ghost" data-testid="ball-ghost">
            <circle cx={ghost[0]} cy={ghost[1]} r={1.6} />
            <text x={ghost[0]} y={ghost[1] - 2.6} textAnchor="middle">Ball not tracked</text>
          </g>
        )}
      </svg>
      <figcaption className="pitch-caption">
        <span><span className="swatch swatch-home" aria-hidden="true" /> {scenario.teams.find((t) => t.side === 'home')?.name}{synthetic ? ' attacks →' : ' (home)'}</span>
        <span>{synthetic ? '← ' : ''}<span className="swatch swatch-away" aria-hidden="true" /> {scenario.teams.find((t) => t.side === 'away')?.name}{synthetic ? '' : ' (away)'}</span>
      </figcaption>
    </figure>
  );
}
