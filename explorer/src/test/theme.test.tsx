import { fireEvent, screen } from '@testing-library/react';
import { THEME_KEY, initialTheme } from '../components/ThemeToggle';
import { renderApp } from './util';

function preferLight(light: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: light && query.includes('light'), media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

describe('theme default and persistence', () => {
  const original = window.matchMedia;
  beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; });
  afterEach(() => { window.matchMedia = original; localStorage.clear(); });

  it('opens dark for a first-time visitor even when the OS prefers light', async () => {
    preferLight(true);
    expect(initialTheme()).toBe('dark');
    renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
  });

  it('respects an explicit saved light preference', () => {
    localStorage.setItem(THEME_KEY, 'light');
    expect(initialTheme()).toBe('light');
  });

  it('ignores an unrecognised saved value', () => {
    localStorage.setItem(THEME_KEY, 'sepia');
    expect(initialTheme()).toBe('dark');
  });

  it('saves only an explicit toggle, which then survives a new visit', async () => {
    preferLight(false);
    const first = renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Switch to light theme' })[0]!);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    first.unmount();
    expect(initialTheme()).toBe('light');
    renderApp('/');
    await screen.findByRole('heading', { level: 1 });
    expect(document.documentElement.dataset.theme).toBe('light');
    fireEvent.click(screen.getAllByRole('button', { name: 'Switch to dark theme' })[0]!);
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
  });
});
