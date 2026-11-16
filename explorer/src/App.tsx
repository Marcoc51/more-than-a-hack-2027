import { ThemeToggle } from './components/ThemeToggle';
import type { Scenario } from './scenario/types';
import { ExplorerPage } from './pages/ExplorerPage';

export function App({ scenarios }: { scenarios: readonly Scenario[] }) {
  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to the Explorer</a>
      <header className="app-bar">
        <div className="brand">
          <span className="brand-mark">MAF FC</span>
          <span className="brand-product">Possession Explorer</span>
        </div>
        <span className="badge badge-synthetic" title="Every frame shown here is synthetic. No competition data is used.">Synthetic data</span>
        <div className="app-bar-actions">
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="app-main" tabIndex={-1}>
        <h1 className="page-title">Explorer</h1>
        <p className="page-lead">
          Frame-by-frame possession (H home, A away, D dead ball, X no answer) from the MAF FC Phase 3B
          engine and the official smooth50 baseline, both run unchanged on synthetic tracking.
        </p>
        <ExplorerPage scenarios={scenarios} />
      </main>
      <footer className="app-footer">
        <p>
          MAF FC · More than a Hack 2027 ·{' '}
          <a href="https://github.com/Marcoc51/more-than-a-hack-2027">source on GitHub</a> · MIT.
          Synthetic scenarios only. Not an official product of the competition organisers or of Motus.
        </p>
      </footer>
    </div>
  );
}
