import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import './styles/tokens.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { initialTheme } from './components/ThemeToggle';

document.documentElement.dataset.theme = initialTheme();

// Vite's base path (`vite build --base=/sub/path/`) doubles as the router basename.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
