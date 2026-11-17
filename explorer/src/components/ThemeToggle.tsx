import { Moon, Sun } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';

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

/** Night (dark) is the default; the OS preference or the viewer's last choice can select
 *  Floodlight (light). */
export function initialTheme(): Theme {
  const stored = storedTheme();
  if (stored) return stored;
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** The one theme state of the app, applied to <html data-theme> and remembered per viewer. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
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
