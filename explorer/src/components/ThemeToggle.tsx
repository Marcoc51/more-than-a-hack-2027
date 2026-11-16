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
    <button type="button" className="btn btn-outline btn-sm theme-toggle" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`}>
      <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
        {next === 'light' ? (
          <path fill="currentColor" d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5 1.5 3h-3L12 2Zm0 20-1.5-3h3L12 22ZM2 12l3-1.5v3L2 12Zm20 0-3 1.5v-3L22 12ZM4.9 4.9l3.2 1.1-2.1 2.1-1.1-3.2Zm14.2 14.2-3.2-1.1 2.1-2.1 1.1 3.2ZM4.9 19.1 6 15.9 8.1 18l-3.2 1.1ZM19.1 4.9 18 8.1 15.9 6l3.2-1.1Z" />
        ) : (
          <path fill="currentColor" d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        )}
      </svg>
      <span className="theme-toggle-label">{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
    </button>
  );
}
