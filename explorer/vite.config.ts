import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Static hosts without rewrite rules (e.g. GitHub Pages) serve 404.html for unknown paths.
 *  A copy of index.html there lets deep links such as /compare load the app, which then routes. */
function spaFallback(): Plugin {
  return {
    name: 'maf-spa-fallback',
    apply: 'build',
    enforce: 'post', // after Vite has emitted index.html into the bundle
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (index && index.type === 'asset') {
        this.emitFile({ type: 'asset', fileName: '404.html', source: index.source });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), spaFallback()],
  // Absolute asset URLs, so nested routes resolve them. Deploying under a sub-path:
  // `npm run build -- --base=/repository-name/` (the router reads the same base).
  base: '/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
