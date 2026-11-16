import type {
  BallObservation, EventSource, Frame, Phase3bOutput, Player, Provenance, ReferenceLabels, Restart,
  Scenario, ScenarioEvent, Smooth50Output, Team, XY,
} from './types';

/** Runtime check of an exported scenario. Throws ScenarioError naming the first bad field. */
export class ScenarioError extends Error {}

type Obj = Record<string, unknown>;

function fail(path: string, what: string): never {
  throw new ScenarioError(`${path}: ${what}`);
}
function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected an object');
  return v as Obj;
}
function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, 'expected an array');
  return v;
}
function str(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(path, 'expected a string');
  return v;
}
function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected a finite number');
  return v;
}
function int(v: unknown, path: string, min = 0): number {
  const n = num(v, path);
  if (!Number.isInteger(n) || n < min) fail(path, `expected an integer >= ${min}`);
  return n;
}
function labelString(v: unknown, path: string, n: number, alphabet: string): string {
  const s = str(v, path);
  if (s.length !== n) fail(path, `expected ${n} labels, got ${s.length}`);
  for (const c of s) if (!alphabet.includes(c)) fail(path, `unexpected label "${c}"`);
  return s;
}
function interval(v: unknown, path: string, n: number): readonly [number, number] {
  const a = arr(v, path);
  const start = int(a[0], `${path}[0]`);
  const end = int(a[1], `${path}[1]`);
  if (a.length !== 2 || start >= end || end > n) fail(path, 'expected a half-open [start, end) inside the scenario');
  return [start, end];
}
function xy(v: unknown, path: string): XY {
  const a = arr(v, path);
  if (a.length !== 2) fail(path, 'expected [x, y]');
  return [num(a[0], `${path}[0]`), num(a[1], `${path}[1]`)];
}

function parseFrame(v: unknown, path: string, players: number): Frame {
  const o = obj(v, path);
  let ball: BallObservation | null = null;
  if (o.ball !== null) {
    const b = arr(o.ball, `${path}.ball`);
    if (b.length !== 3) fail(`${path}.ball`, 'expected [x, y, speed]');
    ball = [num(b[0], `${path}.ball[0]`), num(b[1], `${path}.ball[1]`), num(b[2], `${path}.ball[2]`)];
  }
  const ps = arr(o.players, `${path}.players`);
  if (ps.length !== players) fail(`${path}.players`, `expected ${players} entries`);
  return { ball, players: ps.map((p, i) => (p === null ? null : xy(p, `${path}.players[${i}]`))) };
}

export function parseScenario(raw: unknown): Scenario {
  const o = obj(raw, 'scenario');
  if (o.schemaVersion !== 1) fail('schemaVersion', 'unsupported schema version');
  const frameCount = int(o.frameCount, 'frameCount', 1);
  const fps = int(o.fps, 'fps', 1);

  const p = obj(o.provenance, 'provenance');
  if (p.kind !== 'synthetic') fail('provenance.kind', 'only synthetic scenarios are allowed');
  const files = obj(p.engineFiles, 'provenance.engineFiles');
  const provenance: Provenance = {
    kind: 'synthetic',
    generator: str(p.generator, 'provenance.generator'),
    generatorVersion: str(p.generatorVersion, 'provenance.generatorVersion'),
    engineCommit: str(p.engineCommit, 'provenance.engineCommit'),
    engineFiles: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, str(v, `engineFiles.${k}`)])),
    statement: str(p.statement, 'provenance.statement'),
  };

  const pitchObj = obj(o.pitch, 'pitch');
  const pitch = { length: num(pitchObj.length, 'pitch.length'), width: num(pitchObj.width, 'pitch.width') };

  const teamsRaw = arr(o.teams, 'teams');
  if (teamsRaw.length !== 2) fail('teams', 'expected two teams');
  const teams = teamsRaw.map((t, i): Team => {
    const to = obj(t, `teams[${i}]`);
    const side = str(to.side, `teams[${i}].side`);
    if (side !== 'home' && side !== 'away') fail(`teams[${i}].side`, 'expected home or away');
    return { id: str(to.id, `teams[${i}].id`), side, name: str(to.name, `teams[${i}].name`), shortName: str(to.shortName, `teams[${i}].shortName`) };
  }) as unknown as readonly [Team, Team];
  if (teams[0].side === teams[1].side) fail('teams', 'expected one home and one away team');
  const teamIds = new Set(teams.map((t) => t.id));

  const players = arr(o.players, 'players').map((pl, i): Player => {
    const po = obj(pl, `players[${i}]`);
    const teamId = str(po.teamId, `players[${i}].teamId`);
    if (!teamIds.has(teamId)) fail(`players[${i}].teamId`, `unknown team "${teamId}"`);
    return { id: str(po.id, `players[${i}].id`), teamId, shirt: int(po.shirt, `players[${i}].shirt`), role: str(po.role, `players[${i}].role`) };
  });

  const frames = arr(o.frames, 'frames');
  if (frames.length !== frameCount) fail('frames', `expected ${frameCount} frames, got ${frames.length}`);
  const parsedFrames = frames.map((f, i) => parseFrame(f, `frames[${i}]`, players.length));

  const graded = arr(o.graded, 'graded').map((g, i) => interval(g, `graded[${i}]`, frameCount));

  const events = arr(o.events, 'events').map((e, i): ScenarioEvent => {
    const eo = obj(e, `events[${i}]`);
    const source = str(eo.source, `events[${i}].source`);
    if (source !== 'smart-tagging' && source !== 'scenario') fail(`events[${i}].source`, 'unknown source');
    const teamId = eo.teamId === null ? null : str(eo.teamId, `events[${i}].teamId`);
    if (teamId !== null && !teamIds.has(teamId)) fail(`events[${i}].teamId`, `unknown team "${teamId}"`);
    const frame = int(eo.frame, `events[${i}].frame`);
    if (frame > frameCount) fail(`events[${i}].frame`, 'outside the scenario');
    return {
      type: str(eo.type, `events[${i}].type`), frame,
      interval: eo.interval === undefined ? null : interval(eo.interval, `events[${i}].interval`, frameCount),
      teamId, source: source as EventSource, description: str(eo.description, `events[${i}].description`),
    };
  });

  let reference: ReferenceLabels | null = null;
  if (o.reference !== undefined && o.reference !== null) {
    const r = obj(o.reference, 'reference');
    if (r.source !== 'scenario-script') fail('reference.source', 'reference labels must come from the scenario script');
    reference = { labels: labelString(r.labels, 'reference.labels', frameCount, 'HADX'), source: 'scenario-script', description: str(r.description, 'reference.description') };
  }

  const m = obj(o.models, 'models');
  const p3 = obj(m.phase3b, 'models.phase3b');
  const distances = (v: unknown, path: string) => {
    const a = arr(v, path);
    if (a.length !== frameCount) fail(path, `expected ${frameCount} values`);
    return a.map((d, i) => (d === null ? null : num(d, `${path}[${i}]`)));
  };
  const reasons = arr(p3.reasons, 'models.phase3b.reasons').map((r, i) => int(r, `models.phase3b.reasons[${i}]`));
  if (reasons.length !== frameCount) fail('models.phase3b.reasons', `expected ${frameCount} values`);
  const reasonNames = Object.fromEntries(Object.entries(obj(p3.reasonNames, 'models.phase3b.reasonNames')).map(([k, v]) => [k, str(v, `reasonNames.${k}`)]));
  for (const r of reasons) if (!(String(r) in reasonNames)) fail('models.phase3b.reasons', `reason ${r} has no name`);
  const phase3b: Phase3bOutput = {
    name: str(p3.name, 'models.phase3b.name'),
    producer: str(p3.producer, 'models.phase3b.producer'),
    labels: labelString(p3.labels, 'models.phase3b.labels', frameCount, 'HADX'),
    evidence: labelString(p3.evidence, 'models.phase3b.evidence', frameCount, 'HA._'),
    reasons,
    reasonNames,
    restarts: arr(p3.restarts, 'models.phase3b.restarts').map((r, i): Restart => {
      const ro = obj(r, `restarts[${i}]`);
      const team = str(ro.team, `restarts[${i}].team`);
      if (team !== 'home' && team !== 'away' && team !== 'unknown') fail(`restarts[${i}].team`, 'unexpected team');
      return { frame: int(ro.frame, `restarts[${i}].frame`), team };
    }),
    nearestHome: distances(p3.nearestHome, 'models.phase3b.nearestHome'),
    nearestAway: distances(p3.nearestAway, 'models.phase3b.nearestAway'),
  };
  const sm = obj(m.smooth50, 'models.smooth50');
  const smooth50: Smooth50Output = {
    name: str(sm.name, 'models.smooth50.name'),
    producer: str(sm.producer, 'models.smooth50.producer'),
    labels: labelString(sm.labels, 'models.smooth50.labels', frameCount, 'HADX'),
    nearestTeam: labelString(sm.nearestTeam, 'models.smooth50.nearestTeam', frameCount, 'HA-'),
  };

  // Frame alignment: the engine saw no ball exactly where the frame has no ball.
  parsedFrames.forEach((f, i) => {
    if ((f.ball === null) !== (phase3b.evidence[i] === '_')) fail(`frames[${i}]`, 'ball observation and engine evidence disagree');
  });

  return {
    schemaVersion: 1, id: str(o.id, 'id'), title: str(o.title, 'title'), description: str(o.description, 'description'),
    provenance, fps, frameCount, pitch, graded, teams, players, frames: parsedFrames, events, reference,
    models: { phase3b, smooth50 },
  };
}
