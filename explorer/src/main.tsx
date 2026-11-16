import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import './styles/tokens.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initialTheme } from './components/ThemeToggle';
import { SCENARIOS } from './scenario/scenarios';

document.documentElement.dataset.theme = initialTheme();

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
createRoot(root).render(
  <StrictMode>
    <App scenarios={SCENARIOS} />
  </StrictMode>,
);
