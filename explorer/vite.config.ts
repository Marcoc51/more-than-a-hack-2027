import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { root, approvedAssets, publicBoundary } from './scripts/privacy-plugin.mjs';
import { localExportServer } from './scripts/local-export-server.mjs';

export default defineConfig(({ command, mode }) => {
  const local = mode === 'local-explorer';
  if (local && command !== 'serve') throw new Error('Local Explorer is development-only. Private-mode builds are prohibited. Use npm run dev:local on localhost.');
  // The loopback-only local export loader exists only in the local development server.
  const localPlugins = local && command === 'serve' ? [localExportServer()] : [];
  return {
    root, plugins: [react(), approvedAssets(), publicBoundary(), ...localPlugins], publicDir: false,
    build: { assetsInlineLimit: 0 },
    define: { __LOCAL_EXPLORER__: JSON.stringify(local) },
    server: { host: '127.0.0.1', fs: { strict: true, allow: [root] } },
    preview: { host: '127.0.0.1' }, base: '/',
    test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.ts'], css: false },
  };
});
