import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { AppHeader } from './components/AppHeader';
import { ComparePage } from './pages/ComparePage';
import { ExplorerPage } from './pages/ExplorerPage';
import { MethodologyPage } from './pages/MethodologyPage';
import { NotFoundPage } from './pages/NotFoundPage';

/** After a client-side route change, move focus to the new page's heading (and to the top), so
 *  keyboard and screen-reader users are not left on a link that has disappeared. */
function RouteFocus() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo?.({ top: 0 });
    document.getElementById('page-title')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

function RootRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/explorer', search }} replace />;
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
            <Route path="/" element={<RootRedirect />} />
            <Route path="/explorer" element={<ExplorerPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/methodology" element={<MethodologyPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
      <footer className="app-footer">
        <p>
          MAF FC · More than a Hack 2027 ·{' '}
          <a href="https://github.com/Marcoc51/more-than-a-hack-2027">source on GitHub</a> · code under MIT.
          Synthetic scenarios only. Not an official product of the competition organisers. Visual identity by
          Motus, used with permission.
        </p>
      </footer>
    </div>
  );
}
