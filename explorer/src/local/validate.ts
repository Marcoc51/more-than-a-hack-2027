import type { Player, Team, XY } from '../scenario/types';

/** A local frame: positions in metres, null where unavailable. The ball's third value is its
 *  speed in m/s, or null where the tracking reports it as NaN (unknown, never filled in). */
export interface LocalFrame {
  ball: readonly [x: number, y: number, speed: number | null] | null;
  players: ReadonlyArray<XY | null>;
}

export const LOCAL_MAX_BYTES = 16 * 1024 * 1024;
export const LOCAL_MAX_FRAMES = 7500;
/** Track slots, not people: the tactical metadata documents 46 (DATA.md); matches the exporter. */
export const LOCAL_MAX_PLAYERS = 64;
export interface LocalScenario {
  schemaVersion: 'local-1';
  id: string;
  title: string;
  description: string;
  provenance: { kind: 'local-private'; generator: string; generatorVersion: string; statement: string };
  sourceFrameStart: number;
  fps: number;
  frameCount: number;
  pitch: { length: number; width: number };
  teams: readonly [Team, Team];
  players: readonly Player[];
  frames: readonly LocalFrame[];
  predictions: { name: string; labels: string };
  /** Optional second model on the same frames (for example the official smooth50 reproduction).
   *  Another prediction, never a reference: no accuracy is derived from it. */
  baseline: { name: string; labels: string } | null;
}

type Obj = Record<string, unknown>;
function fail(path: string, message: string): never { throw new Error(`${path}: ${message}`); }
function object(v: unknown, path: string): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v)) fail(path, 'expected an object');
  return v as Obj;
}
function array(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, 'expected an array');
  return v;
}
function text(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length > 1000) fail(path, 'expected a string of at most 1000 characters');
  return v;
}
function number(v: unknown, path: string, min = -10000, max = 10000): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(path, `expected a finite number in [${min}, ${max}]`);
  return v;
}
function integer(v: unknown, path: string, min: number, max: number): number {
  const n = number(v, path, min, max);
  if (!Number.isSafeInteger(n)) fail(path, 'expected an integer');
  return n;
}
function point(v: unknown, path: string): readonly [number, number] | null {
  if (v === null) return null;
  const a = array(v, path);
  if (a.length !== 2) fail(path, 'expected [x, y] or null');
  return [number(a[0], `${path}[0]`), number(a[1], `${path}[1]`)];
}

/** Separate local schema: no synthetic reference, fabricated evidence, baseline or scores. */
export function parseLocalScenario(raw: unknown): LocalScenario {
  const o = object(raw, 'export');
  if (o.schemaVersion !== 'local-1') fail('schemaVersion', 'expected local-1');
  const p = object(o.provenance, 'provenance');
  if (p.kind !== 'local-private') fail('provenance.kind', 'expected local-private');
  const frameCount = integer(o.frameCount, 'frameCount', 1, LOCAL_MAX_FRAMES);
  const fps = integer(o.fps, 'fps', 25, 25);
  const sourceFrameStart = integer(o.sourceFrameStart, 'sourceFrameStart', 0, Number.MAX_SAFE_INTEGER - LOCAL_MAX_FRAMES);
  const pitch = object(o.pitch, 'pitch');
  const teams = array(o.teams, 'teams').map((v, i): Team => {
    const t = object(v, `teams[${i}]`);
    if (t.side !== 'home' && t.side !== 'away') fail(`teams[${i}].side`, 'expected home or away');
    return { id: text(t.id, `teams[${i}].id`), side: t.side, name: text(t.name, `teams[${i}].name`), shortName: text(t.shortName, `teams[${i}].shortName`) };
  });
  if (teams.length !== 2 || teams[0]?.side === teams[1]?.side || teams[0]?.id === teams[1]?.id) fail('teams', 'expected distinct home and away teams');
  const players = array(o.players, 'players').map((v, i): Player => {
    const pl = object(v, `players[${i}]`);
    const teamId = text(pl.teamId, `players[${i}].teamId`);
    if (!teams.some((t) => t.id === teamId)) fail(`players[${i}].teamId`, 'unknown team');
    return { id: text(pl.id, `players[${i}].id`), teamId, shirt: integer(pl.shirt, `players[${i}].shirt`, 0, 999), role: text(pl.role, `players[${i}].role`) };
  });
  if (!players.length || players.length > LOCAL_MAX_PLAYERS || new Set(players.map((pl) => pl.id)).size !== players.length) fail('players', `expected 1 to ${LOCAL_MAX_PLAYERS} unique track slots`);
  const frames = array(o.frames, 'frames');
  if (frames.length !== frameCount) fail('frames', `expected ${frameCount} aligned frames`);
  const parsedFrames = frames.map((v, i): LocalFrame => {
    const f = object(v, `frames[${i}]`);
    const positions = array(f.players, `frames[${i}].players`);
    if (positions.length !== players.length) fail(`frames[${i}].players`, `expected ${players.length} entries`);
    let ball: LocalFrame['ball'] = null;
    if (f.ball !== null) {
      const b = array(f.ball, `frames[${i}].ball`);
      if (b.length !== 3) fail(`frames[${i}].ball`, 'expected [x, y, speed] or null');
      // Speed may be null (unknown); the position must still be two finite numbers.
      ball = [number(b[0], `frames[${i}].ball[0]`), number(b[1], `frames[${i}].ball[1]`), b[2] === null ? null : number(b[2], `frames[${i}].ball[2]`, 0, 1000)];
    }
    return { ball, players: positions.map((xy, j) => point(xy, `frames[${i}].players[${j}]`)) };
  });
  const predictions = object(o.predictions, 'predictions');
  if (typeof predictions.labels !== 'string' || predictions.labels.length !== frameCount || /[^HADX]/.test(predictions.labels)) fail('predictions.labels', `expected ${frameCount} H/A/D/X labels`);
  let baseline: LocalScenario['baseline'] = null;
  if (o.baseline !== undefined && o.baseline !== null) {
    const b = object(o.baseline, 'baseline');
    if (typeof b.labels !== 'string' || b.labels.length !== frameCount || /[^HADX]/.test(b.labels)) fail('baseline.labels', `expected ${frameCount} H/A/D/X labels aligned with predictions`);
    baseline = { name: text(b.name, 'baseline.name'), labels: b.labels };
  }
  for (const key of ['reference', 'models', 'scores'] as const) if (key in o) fail(key, 'local exports carry no reference labels or scores');
  return {
    schemaVersion: 'local-1', id: text(o.id, 'id'), title: text(o.title, 'title'), description: text(o.description, 'description'),
    provenance: { kind: 'local-private', generator: text(p.generator, 'provenance.generator'), generatorVersion: text(p.generatorVersion, 'provenance.generatorVersion'), statement: text(p.statement, 'provenance.statement') },
    sourceFrameStart, fps, frameCount,
    pitch: { length: number(pitch.length, 'pitch.length', 50, 150), width: number(pitch.width, 'pitch.width', 30, 100) },
    teams: teams as [Team, Team], players, frames: parsedFrames,
    predictions: { name: text(predictions.name, 'predictions.name'), labels: predictions.labels },
    baseline,
  };
}

/** Read only the user-selected file; this code performs no fetch or persistence. */
export async function readLocalFile(file: File): Promise<LocalScenario> {
  if (file.size > LOCAL_MAX_BYTES) throw new Error('File exceeds the 16 MiB local export limit.');
  let raw: unknown;
  try { raw = JSON.parse(await file.text()); }
  catch { throw new Error('File is not valid JSON. Choose a local-1 export from export_local_scenario.py.'); }
  return parseLocalScenario(raw);
}
