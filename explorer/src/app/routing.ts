import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { DEFAULT_SCENARIO_ID, isScenarioId } from '../scenario/scenarios';

export const APP_NAME = 'MAF FC Possession Explorer';

/** The routes with real pages, in navigation order. */
export const ROUTES = [
  { path: '/explorer', label: 'Explorer' },
  { path: '/compare', label: 'Compare' },
  { path: '/methodology', label: 'Methodology' },
] as const;

export function useDocumentTitle(page: string): void {
  useEffect(() => {
    document.title = `${page} · ${APP_NAME}`;
  }, [page]);
}

/** The selected scenario, kept in the URL (?scenario=s2) so Explorer and Compare share it and
 *  every view is a shareable link. An optional ?frame= gives the starting frame.
 *
 *  History: a user's choice of another scenario PUSHES an entry, so Back and Forward step
 *  through their selections; choosing the active scenario adds nothing. An invalid ?scenario= is
 *  normalised once with REPLACE, so it never becomes a separate step. Other query parameters are
 *  kept; only the stale ?frame= is dropped when the scenario changes. */
export function useScenarioParam(): {
  id: string;
  initialFrame: number;
  select: (id: string) => void;
} {
  const [params, setParams] = useSearchParams();
  const requested = params.get('scenario');
  const valid = isScenarioId(requested);
  const id = valid ? requested : DEFAULT_SCENARIO_ID;
  const frame = Number(params.get('frame'));
  const initialFrame = Number.isInteger(frame) && frame >= 0 ? frame : 0;

  useEffect(() => {
    if (requested === null || valid) return;
    setParams((current) => {
      const out = new URLSearchParams(current);
      out.set('scenario', DEFAULT_SCENARIO_ID);
      out.delete('frame');
      return out;
    }, { replace: true });
  }, [requested, valid, setParams]);

  const select = useCallback((next: string) => {
    if (next === id || !isScenarioId(next)) return;
    setParams((current) => {
      const out = new URLSearchParams(current);
      out.set('scenario', next);
      out.delete('frame');
      return out;
    });
  }, [id, setParams]);
  return { id, initialFrame, select };
}

/** Search string carrying only the scenario selection, for links between pages. */
export function scenarioSearch(params: URLSearchParams): string {
  const id = params.get('scenario');
  return isScenarioId(id) ? `?scenario=${id}` : '';
}
