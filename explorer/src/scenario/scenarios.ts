import { useCallback, useEffect, useState } from 'react';
import manifestJson from './generated/index.json';
import type { Scenario, ScenarioEntry } from './types';
import { parseManifest, parseScenario } from './validate';

/** Every scenario listed in generated/index.json, written by tools/export_scenarios.py. The
 *  scenario files themselves are loaded on demand (one JSON chunk each) and validated. */
export const SCENARIO_ENTRIES: readonly ScenarioEntry[] = parseManifest(manifestJson);
export const DEFAULT_SCENARIO_ID = SCENARIO_ENTRIES[0]?.id ?? 's1';

const loaders = import.meta.glob<{ default: unknown }>('./generated/s*.json');
const cache = new Map<string, Promise<Scenario>>();

export function isScenarioId(id: string | null | undefined): id is string {
  return !!id && SCENARIO_ENTRIES.some((e) => e.id === id);
}

/** Load, validate and cache one scenario. Rejects for unknown ids or invalid data. */
export function loadScenario(id: string): Promise<Scenario> {
  const cached = cache.get(id);
  if (cached) return cached;
  const entry = SCENARIO_ENTRIES.find((e) => e.id === id);
  const loader = entry ? loaders[`./generated/${entry.file}`] : undefined;
  const promise = loader
    ? loader().then((mod) => {
      const scenario = parseScenario(mod.default);
      if (scenario.id !== id) throw new Error(`scenario file ${entry?.file} contains "${scenario.id}"`);
      return scenario;
    })
    : Promise.reject(new Error(`unknown scenario "${id}"`));
  promise.catch(() => cache.delete(id)); // a failed load can be retried
  cache.set(id, promise);
  return promise;
}

export type ScenarioState =
  | { status: 'loading'; id: string }
  | { status: 'ready'; id: string; scenario: Scenario }
  | { status: 'error'; id: string; message: string };

/** The scenario for `id`, never a stale one from a previous id, plus a retry after a failure. */
export function useScenario(id: string): [ScenarioState, () => void] {
  const [state, setState] = useState<ScenarioState>({ status: 'loading', id });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    loadScenario(id).then(
      (scenario) => { if (live) setState({ status: 'ready', id, scenario }); },
      (error: unknown) => { if (live) setState({ status: 'error', id, message: error instanceof Error ? error.message : String(error) }); },
    );
    return () => { live = false; };
  }, [id, attempt]);
  const retry = useCallback(() => {
    setState({ status: 'loading', id });
    setAttempt((a) => a + 1);
  }, [id]);
  return [state.id === id ? state : { status: 'loading', id }, retry];
}
