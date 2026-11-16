import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'maf-fc-theme';

function storedTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

/** Night (dark) is the default, as in the Motus visual identity; the OS preference or the
 *  viewer's last choice can select Floodlight (light). */
export function initialTheme(): Theme {
  const stored = storedTheme();
  if (stored) return stored;
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
  }, [theme]);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="btn btn-outline btn-sm" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`}>
      {theme === 'dark' ? 'Light theme' : 'Dark theme'}
    </button>
  );
}
