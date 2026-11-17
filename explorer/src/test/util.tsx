import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from '../App';
import s1Json from '../scenario/generated/s1.json';
import s2Json from '../scenario/generated/s2.json';
import s3Json from '../scenario/generated/s3.json';
import s4Json from '../scenario/generated/s4.json';
import { parseScenario } from '../scenario/validate';

export const S1 = parseScenario(s1Json);
export const S2 = parseScenario(s2Json);
export const S3 = parseScenario(s3Json);
export const S4 = parseScenario(s4Json);
export const ALL = [S1, S2, S3, S4] as const;

/** Render the routed app at a path (no browser history). */
export function renderApp(path = '/explorer?scenario=s1') {
  return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
}

/** Render a page that shows a scenario workspace and wait for the scenario to load. */
export async function renderLoaded(path = '/explorer?scenario=s1') {
  const result = renderApp(path);
  await screen.findByTestId('readout');
  return result;
}
