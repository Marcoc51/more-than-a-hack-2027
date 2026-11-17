import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PUBLIC_ASSETS } from './public-assets.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));

/** publicDir is disabled: only individually reviewed public images are served or emitted. */
export function approvedAssets() {
  return {
    name: 'approved-public-assets', enforce: 'pre',
    async resolveId(source, importer) {
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (resolved && /[/\\](?:\.local-explorer|dataset|external_samples|outputs|data|source)[/\\]/.test(resolved.id)) {
        this.error(`Public build attempted to import a private asset: ${resolved.id}`);
      }
      return resolved;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let path;
        try { path = decodeURIComponent((req.url ?? '').split('?')[0] ?? '').replace(/^\//, ''); }
        catch { return next(); }
        if (!PUBLIC_ASSETS.includes(path)) return next();
        res.setHeader('Content-Type', path.endsWith('.png') ? 'image/png' : 'image/webp');
        res.end(readFileSync(new URL(`../public/${path}`, import.meta.url)));
      });
    },
    generateBundle() {
      for (const file of PUBLIC_ASSETS) this.emitFile({ type: 'asset', fileName: file, source: readFileSync(new URL(`../public/${file}`, import.meta.url)) });
    },
  };
}

export function publicBoundary() {
  return {
    name: 'public-data-boundary', apply: 'build', enforce: 'post',
    generateBundle(_options, bundle) {
      for (const entry of Object.values(bundle)) {
        if (!PUBLIC_ASSETS.includes(entry.fileName) && !/^(?:index|404)\.html$/.test(entry.fileName)
          && !/^assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2)$/.test(entry.fileName)) {
          this.error(`Unapproved public build asset: ${entry.fileName}`);
        }
        if (entry.type === 'chunk') {
          for (const id of Object.keys(entry.modules)) {
            if (/[/\\](?:local|\.local-explorer|dataset|external_samples|outputs|data|source)[/\\]/.test(id)) {
              this.error(`Public build attempted to include a local/private module: ${id}`);
            }
          }
        }
      }
      const index = bundle['index.html'];
      if (index?.type === 'asset') this.emitFile({ type: 'asset', fileName: '404.html', source: index.source });
    },
  };
}
