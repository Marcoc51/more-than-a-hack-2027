import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_ASSETS } from './public-assets.mjs';

export function checkPublicBuild(directory) {
  const files = [];
  function walk(path) {
    for (const entry of readdirSync(path)) {
      const full = resolve(path, entry);
      if (statSync(full).isDirectory()) walk(full); else files.push(full);
    }
  }
  walk(directory);
  const paths = files.map((file) => relative(directory, file).replaceAll('\\', '/'));
  for (const asset of PUBLIC_ASSETS) if (!paths.includes(asset)) throw new Error(`Missing approved public asset: ${asset}`);
  for (let i = 0; i < files.length; i++) {
    const path = paths[i];
    if (!PUBLIC_ASSETS.includes(path) && !/^(?:index|404)\.html$/.test(path)
      && !/^assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2)$/.test(path)
      && !/^licenses\/[A-Za-z0-9_./@-]+\.(?:txt|md)$/.test(path)) throw new Error(`Unapproved public build file: ${path}`);
    if (/\.(?:js|css|html|json|txt)$/.test(path)) {
      const content = readFileSync(files[i], 'utf8');
      for (const marker of ['local-private', 'local-1', 'export_local_scenario.py', 'P1_PRIVATE_CANARY_', '__local-explorer', 'explorer-config.json']) {
        if (content.includes(marker)) throw new Error(`Local-only content in public output: ${path} (${marker})`);
      }
    }
  }
  return paths.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  console.log(`Public privacy check passed: ${checkPublicBuild(resolve(root, 'dist'))} files; approved images only; no local loader, local endpoint or private canary.`);
}
