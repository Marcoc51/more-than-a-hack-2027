import { Moon, Sun } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';

export type Theme = 'dark' | 'light';
export const THEME_KEY = 'maf-fc-theme';

function storedTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

/** Night (dark) is the default for every first-time visitor, whatever the OS colour scheme.
 *  Only an explicit, previously saved choice selects Floodlight (light). */
export function initialTheme(): Theme {
  return storedTheme() ?? 'dark';
}

/** The one theme state of the app, applied to <html data-theme>. Only an explicit toggle is
 *  remembered, so the default never masquerades as a saved preference. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => {
    const next: Theme = t === 'dark' ? 'light' : 'dark';
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
    return next;
  }), []);
  return [theme, toggle];
}

interface Props {
  theme: Theme;
  onToggle: () => void;
  /** 'icon': compact bar button; 'row': full-width row inside the mobile menu. */
  variant?: 'icon' | 'row';
}

export function ThemeToggle({ theme, onToggle, variant = 'icon' }: Props) {
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? 'Light theme' : 'Dark theme';
  return (
    <button
      type="button"
      className={`btn btn-outline theme-toggle theme-toggle-${variant}${variant === 'icon' ? ' btn-icon' : ''}`}
      onClick={onToggle}
      aria-label={`Switch to ${next} theme`}
      title={variant === 'icon' ? `Switch to ${next} theme` : undefined}
    >
      <Icon icon={next === 'light' ? Sun : Moon} />
      {variant === 'row' && <span>{label}</span>}
    </button>
  );
}
