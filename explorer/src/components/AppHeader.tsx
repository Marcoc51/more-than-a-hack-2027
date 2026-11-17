import { Activity, BookOpen, GitCompareArrows, House, Menu, Users, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router';
import { ROUTES, scenarioSearch, type RoutePath } from '../app/routing';
import { Icon } from './Icon';
import { OrganiserLogos } from './Organisers';
import { ThemeToggle, useTheme } from './ThemeToggle';

const ICONS: Record<RoutePath, LucideIcon> = {
  '/': House,
  '/explorer': Activity,
  '/compare': GitCompareArrows,
  '/methodology': BookOpen,
  '/team': Users,
};

/** Header logo size: 64% of the competition strip's, so the tallest logo fits the 56 px bar. */
const HEADER_LOGO_SCALE = 0.64;
const ORGANISERS_LABEL = 'Organisers of More than a Hack 2027';

/** Sticky application bar: wordmark, primary navigation (icon + label), the competition
 *  organisers' logos and the theme control. Below the tablet breakpoint the links collapse into a
 *  disclosure menu that also holds the theme control and a one-line description of each page.
 *  The organiser logos sit inside the bar from 1280 px; on narrower screens they move to a
 *  compact row under the bar, on every page, so they are never hidden behind the menu. Only one
 *  of the two is displayed at a time (the other is display: none, so it is not announced). */
export function AppHeader() {
  const location = useLocation();
  const [params] = useSearchParams();
  const search = scenarioSearch(params);
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const headerRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Selecting a route closes the menu.
  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return undefined;
    panelRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
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
    <>
      <header className="app-bar" ref={headerRef}>
        <Link className="brand" to={`/${search}`} aria-label="MAF FC Possession Explorer: go to Home">
          <span className="brand-mark">MAF FC</span>
          <span className="brand-product">Possession Explorer</span>
        </Link>
        <nav className="nav" aria-label="Main">
          <div id="main-nav-list" className="nav-panel" data-open={open} ref={panelRef}>
            <ul className="nav-list">
              {ROUTES.map((r) => {
                const descId = `nav-desc-${r.label.toLowerCase()}`;
                return (
                  <li key={r.path}>
                    <NavLink to={`${r.path}${search}`} end={r.path === '/'} className="nav-link" aria-describedby={descId} onClick={() => setOpen(false)}>
                      <Icon icon={ICONS[r.path]} />
                      <span className="nav-text">
                        <span className="nav-label">{r.label}</span>
                        {/* Hidden from the link's name; announced as its description via aria-describedby. */}
                        <span id={descId} className="nav-desc" aria-hidden="true">{r.description}</span>
                      </span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
            <div className="nav-panel-theme">
              <span className="nav-panel-theme-label">Theme</span>
              <ThemeToggle theme={theme} onToggle={toggleTheme} variant="row" />
            </div>
          </div>
        </nav>
        <OrganiserLogos className="bar-organisers" label={ORGANISERS_LABEL} scale={HEADER_LOGO_SCALE} eager themed />
        <div className="app-bar-actions">
          <span className="bar-theme"><ThemeToggle theme={theme} onToggle={toggleTheme} /></span>
          <button
            ref={buttonRef}
            type="button"
            className="btn btn-outline btn-icon menu-button"
            aria-expanded={open}
            aria-controls="main-nav-list"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon icon={open ? X : Menu} size={20} />
          </button>
        </div>
      </header>
      <div className="organiser-row">
        <span className="organiser-row-label" aria-hidden="true">Organised by</span>
        <OrganiserLogos className="row-organisers" label={ORGANISERS_LABEL} scale={HEADER_LOGO_SCALE} eager themed />
      </div>
    </>
  );
}
