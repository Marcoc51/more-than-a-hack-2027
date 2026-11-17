/** Normalised synthetic scenario, as written by tools/export_scenarios.py (schemaVersion 1). */

export type Label = 'H' | 'A' | 'D' | 'X';
export type TeamSide = 'home' | 'away';
/** Per-frame Phase 3B control evidence: H/A = that team has credible control,
 *  '.' = ball tracked but no credible control, '_' = ball not tracked. */
export type EvidenceCode = 'H' | 'A' | '.' | '_';

/** Metres on the pitch: x along the length (0 = home goal line), y across (0 = top touchline). */
export type XY = readonly [x: number, y: number];
/** Ball: position in metres plus the raw speed field (m/s, the speed leaving the frame). */
export type BallObservation = readonly [x: number, y: number, speed: number];

export interface Team {
  id: string;
  side: TeamSide;
  name: string;
  shortName: string;
}

export interface Player {
  id: string;
  teamId: string;
  shirt: number;
  role: string;
}

export interface Frame {
  ball: BallObservation | null;
  /** Same order as Scenario.players; null where the track is not observed. */
  players: ReadonlyArray<XY | null>;
}

export type EventSource = 'smart-tagging' | 'scenario';

export interface ScenarioEvent {
  type: string;
  frame: number;
  /** Half-open [start, end) in frames, when the event spans an interval. */
  interval: readonly [number, number] | null;
  teamId: string | null;
  source: EventSource;
  description: string;
}

export interface Provenance {
  kind: 'synthetic';
  generator: string;
  generatorVersion: string;
  engineCommit: string;
  engineFiles: Readonly<Record<string, string>>;
  /** The organisers' public scorer, vendored unchanged, used for the synthetic scores. */
  scorer: { file: string; source: string; sha256: string };
  statement: string;
}

/** Output of the official scorer (tools/vendor/possession_metrics.py evaluate()), computed
 *  offline with the scenario's script reference as the ground truth. Synthetic only. */
export interface ModelScores {
  spellF1Mean: number;
  spellF1ByIou: Readonly<Record<string, number>>;
  macroF1: number;
  nReferenceSpells: number;
  nPredictedSpells: number;
  nGraded: number;
  /** 4x4 counts over all frames, rows = reference H/A/D/X, columns = prediction H/A/D/X. */
  confusion: ReadonlyArray<readonly number[]>;
}

export interface Restart {
  frame: number;
  team: TeamSide | 'unknown';
}

/** MAF FC Phase 3B output: labels plus the engine's own per-frame evidence. */
export interface Phase3bOutput {
  name: string;
  producer: string;
  labels: string;
  evidence: string;
  /** State-machine source code per frame (see reasonNames). */
  reasons: readonly number[];
  reasonNames: Readonly<Record<string, string>>;
  restarts: readonly Restart[];
  /** Engine-computed nearest player distance to the ball per team (m); null = not available. */
  nearestHome: ReadonlyArray<number | null>;
  nearestAway: ReadonlyArray<number | null>;
  scores: ModelScores;
}

/** Official smooth50 baseline output: labels plus its per-frame nearest team before smoothing. */
export interface Smooth50Output {
  name: string;
  producer: string;
  labels: string;
  /** 'H' | 'A' | '-' (no ball) per frame. */
  nearestTeam: string;
  scores: ModelScores;
}

/** One entry of generated/index.json: enough to list a scenario before loading it. */
export interface ScenarioEntry {
  id: string;
  title: string;
  description: string;
  frameCount: number;
  fps: number;
  file: string;
}

export interface ReferenceLabels {
  labels: string;
  source: 'scenario-script';
  description: string;
}

export interface Scenario {
  schemaVersion: 1;
  id: string;
  title: string;
  description: string;
  provenance: Provenance;
  fps: number;
  frameCount: number;
  pitch: { length: number; width: number };
  /** Graded intervals, half-open [start, end). */
  graded: ReadonlyArray<readonly [number, number]>;
  teams: readonly [Team, Team];
  players: readonly Player[];
  frames: readonly Frame[];
  events: readonly ScenarioEvent[];
  reference: ReferenceLabels | null;
  models: { phase3b: Phase3bOutput; smooth50: Smooth50Output };
}

export type ModelId = keyof Scenario['models'];
