import { useEffect, useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { AppHeader } from './components/AppHeader';
import { ComparePage } from './pages/ComparePage';
import { ExplorerPage } from './pages/ExplorerPage';
import { HomePage } from './pages/HomePage';
import { MethodologyPage } from './pages/MethodologyPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { TeamPage } from './pages/TeamPage';

/** After a client-side route change, move focus to the new page's heading (and to the top), so
 *  keyboard and screen-reader users are not left on a link that has disappeared. The first page
 *  load is left alone: the effect compares with the last path it handled rather than using a
 *  "first run" flag, because React StrictMode runs mount effects twice in development and the
 *  flag let the second run focus the heading on initial load. */
function RouteFocus() {
  const { pathname } = useLocation();
  const handled = useRef(pathname);
  useEffect(() => {
    if (handled.current === pathname) return;
    handled.current = pathname;
    window.scrollTo?.({ top: 0 });
    document.getElementById('page-title')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

export function App() {
  const { pathname } = useLocation();
  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <AppHeader />
      <RouteFocus />
      <main id="main" className="app-main" tabIndex={-1}>
        <div className="page-enter" key={pathname}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/explorer" element={<ExplorerPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/methodology" element={<MethodologyPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
      <footer className="app-footer">
        <p>
          <span className="footer-brand">MAF FC</span> · Built for More than a Hack 2027 ·{' '}
          <a href="https://github.com/Marcoc51/more-than-a-hack-2027">source on GitHub</a> · code under MIT.
          Synthetic scenarios only. Not an official product of the competition organisers.
        </p>
      </footer>
    </div>
  );
}
