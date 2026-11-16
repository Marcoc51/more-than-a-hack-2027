import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router';
import { ROUTES, scenarioSearch } from '../app/routing';
import { ThemeToggle } from './ThemeToggle';

/** Sticky application bar: wordmark, primary navigation and theme control. Below the tablet
 *  breakpoint the links collapse into a disclosure menu (button + list). */
export function AppHeader() {
  const location = useLocation();
  const [params] = useSearchParams();
  const search = scenarioSearch(params);
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Selecting a route closes the menu.
  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    listRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <header className="app-bar" ref={headerRef}>
      <Link className="brand" to={`/explorer${search}`} aria-label="MAF FC Possession Explorer: go to the Explorer">
        <span className="brand-mark">MAF FC</span>
        <span className="brand-product">Possession Explorer</span>
      </Link>
      <nav className="nav" aria-label="Main">
        <ul id="main-nav-list" className="nav-list" data-open={open} ref={listRef}>
          {ROUTES.map((r) => (
            <li key={r.path}>
              <NavLink to={`${r.path}${search}`} className="nav-link" onClick={() => setOpen(false)}>
                {r.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="app-bar-actions">
        <ThemeToggle />
        <button
          ref={buttonRef}
          type="button"
          className="btn btn-icon menu-button"
          aria-expanded={open}
          aria-controls="main-nav-list"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path className="menu-icon-top" d="M4 7h16" />
            <path className="menu-icon-mid" d="M4 12h16" />
            <path className="menu-icon-bottom" d="M4 17h16" />
          </svg>
        </button>
      </div>
    </header>
  );
}
