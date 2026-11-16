import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { App } from '../App';
import { useScenarioParam } from '../app/routing';

/** The real app inside a real (memory) router, so Back and Forward use actual router history. */
function renderRouted(entries: string[]) {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: entries, initialIndex: entries.length - 1 });
  render(<RouterProvider router={router} />);
  return router;
}
type Router = ReturnType<typeof createMemoryRouter>;
const where = (r: Router) => r.state.location.pathname + r.state.location.search;
const radio = (id: string) => screen.getByRole('radio', { name: new RegExp(`^${id.toUpperCase()} `) });
const frameText = () => screen.getByTestId('readout').textContent ?? '';

async function pick(id: string) {
  act(() => radio(id).click());
  await waitFor(() => expect(radio(id)).toBeChecked());
}
async function go(r: Router, delta: number, expected: string) {
  await act(async () => { await r.navigate(delta); });
  await waitFor(() => expect(where(r)).toBe(expected));
}
async function shows(id: string, lastFrame: number) {
  await waitFor(() => expect(radio(id)).toBeChecked());
  await waitFor(() => expect(frameText()).toContain(`/ ${lastFrame}`));
}

describe('UI2-02: scenario selection creates browser history entries', () => {
  it('S1 -> S2 -> S3, then Back, Back, Forward, Forward', async () => {
    const r = renderRouted(['/explorer?scenario=s1']);
    await screen.findByTestId('readout');
    await pick('s2');
    await pick('s3');
    expect(where(r)).toBe('/explorer?scenario=s3');
    await go(r, -1, '/explorer?scenario=s2');
    await shows('s2', 299);
    await go(r, -1, '/explorer?scenario=s1');
    await shows('s1', 399);
    await go(r, 1, '/explorer?scenario=s2');
    await shows('s2', 299);
    await go(r, 1, '/explorer?scenario=s3');
    await shows('s3', 299);
  });

  it('navigating between Explorer and Compare keeps the current scenario', async () => {
    const r = renderRouted(['/explorer?scenario=s1']);
    await screen.findByTestId('readout');
    await pick('s2');
    act(() => within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Compare' }).click());
    await waitFor(() => expect(where(r)).toBe('/compare?scenario=s2'));
    await shows('s2', 299);
    await go(r, -1, '/explorer?scenario=s2');
    await shows('s2', 299);
  });

  it('an explicit selection on Compare is a navigable entry too', async () => {
    const r = renderRouted(['/compare?scenario=s1']);
    await screen.findByTestId('readout');
    await pick('s4');
    expect(where(r)).toBe('/compare?scenario=s4');
    await go(r, -1, '/compare?scenario=s1');
    await shows('s1', 399);
  });

  it('choosing the scenario that is already active adds no entry', async () => {
    let select: ((id: string) => void) | undefined;
    function Harness() {
      const scenario = useScenarioParam();
      select = scenario.select;
      return <p>active {scenario.id}</p>;
    }
    const router = createMemoryRouter([{ path: '*', element: <Harness /> }], {
      initialEntries: ['/methodology', '/explorer?scenario=s1'], initialIndex: 1,
    });
    render(<RouterProvider router={router} />);
    act(() => select!('s1'));             // already active
    act(() => select!('s1'));
    expect(where(router)).toBe('/explorer?scenario=s1');
    await go(router, -1, '/methodology');  // straight back past it: no duplicate entries
    await go(router, 1, '/explorer?scenario=s1');
    act(() => select!('s3'));
    await waitFor(() => expect(where(router)).toBe('/explorer?scenario=s3'));
    await go(router, -1, '/explorer?scenario=s1');
  });

  it('an invalid scenario URL is normalised in place, without an extra history step', async () => {
    const r = renderRouted(['/methodology', '/explorer?scenario=s9&frame=50']);
    await waitFor(() => expect(where(r)).toBe('/explorer?scenario=s1'));
    await shows('s1', 399);
    expect(frameText()).toContain('Frame 0 ');
    await go(r, -1, '/methodology');       // the invalid URL was replaced, not kept behind
    await go(r, 1, '/explorer?scenario=s1');
  });

  it('a valid URL, and one without ?scenario=, are left as they are', async () => {
    const a = renderRouted(['/explorer']);
    await screen.findByTestId('readout');
    expect(where(a)).toBe('/explorer');
    expect(radio('s1')).toBeChecked();
  });

  it('scenario changes through history reset playback, with no stale frame', async () => {
    const r = renderRouted(['/explorer?scenario=s1']);
    await screen.findByTestId('readout');
    fireEvent.change(screen.getByRole('slider', { name: 'Frame' }), { target: { value: '200' } });
    expect(frameText()).toContain('Frame 200 ');
    await pick('s2');
    await shows('s2', 299);
    expect(frameText()).toContain('Frame 0 ');
    await go(r, -1, '/explorer?scenario=s1');
    await shows('s1', 399);
    expect(frameText()).toContain('Frame 0 ');      // a fresh S1, not the old frame 200
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('selecting a scenario drops a stale ?frame= but keeps unrelated query parameters', async () => {
    const r = renderRouted(['/explorer?scenario=s4&frame=190&ref=share']);
    await screen.findByTestId('readout');
    await waitFor(() => expect(frameText()).toContain('Frame 190 '));
    await pick('s2');
    expect(where(r)).toBe('/explorer?scenario=s2&ref=share');
    await go(r, -1, '/explorer?scenario=s4&frame=190&ref=share');
    await waitFor(() => expect(frameText()).toContain('Frame 190 '));
  });
});
