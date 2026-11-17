/** Copy exact installed license notices into the static distribution after Vite builds. */
import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'dist');
const notices = join(dist, 'licenses');
const checkOnly = process.argv.slice(2).join(' ') === '--check';
if (process.argv.length > 2 && !checkOnly) throw new Error('Usage: node scripts/license-notices.mjs [--check]');

const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const entries = Object.entries(lock.packages)
  .filter(([path, record]) => path.startsWith('node_modules/') && !record.dev);
// Vite contributes its preload helper to the production JavaScript.
entries.push(['node_modules/vite', lock.packages['node_modules/vite']]);
if (entries.some(([, record]) => !record)) throw new Error('Required package missing from lockfile');
entries.sort(([a], [b]) => a.localeCompare(b));

const expected = new Map();
const rows = [];
for (const [lockPath, record] of entries) {
  const packageDir = join(root, lockPath);
  const pkg = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
  if (pkg.version !== record.version || !pkg.name || !pkg.license) {
    throw new Error(`Package version or license mismatch: ${lockPath}`);
  }
  const licenseNames = (await readdir(packageDir))
    .filter(name => /^LICENSE(?:\.md)?$/i.test(name));
  if (licenseNames.length !== 1) throw new Error(`Expected one license file: ${pkg.name}@${pkg.version}`);
  const fileName = `${pkg.name.replace(/^@/, '').replaceAll('/', '--')}@${pkg.version}.txt`;
  const bytes = await readFile(join(packageDir, licenseNames[0]));
  if (expected.has(fileName)) throw new Error(`Duplicate license output: ${fileName}`);
  expected.set(fileName, bytes);
  rows.push(`${pkg.name}@${pkg.version}\t${pkg.license}\t${fileName}`);
}

const ownLicenseName = 'MAF-FC-MIT.txt';
expected.set(ownLicenseName, await readFile(join(root, '..', 'LICENSE')));
const noticeText = [
  'MAF FC Possession Explorer — distribution notices',
  '',
  'The package license files below are exact copies from the versions installed by npm ci.',
  'The list covers the production-install dependency closure plus Vite, which emits a preload helper.',
  `MAF FC application code: ${ownLicenseName} (in this directory).`,
  'Team portraits, organiser logos and Motus-derived styling are excluded from the MIT grant.',
  'Their project-specific public use is confirmed by the owner in explorer/README.md.',
  '',
  'Package\tLicense\tExact notice file under licenses/',
  ...rows,
  '',
].join('\n');
expected.set('NOTICE.txt', Buffer.from(noticeText, 'utf8'));

const assets = await readdir(join(dist, 'assets'));
const fonts = assets.filter(name => name.endsWith('.woff2'));
if (fonts.length !== 10 || fonts.some(name => !/^(inter|space-grotesk)-/.test(name))) {
  throw new Error('Unexpected production font set; review font licenses before distribution');
}

if (!checkOnly) {
  await mkdir(notices, { recursive: true });
  for (const [name, bytes] of expected) {
    if (name === 'NOTICE.txt') await writeFile(join(notices, name), bytes);
    else if (name === ownLicenseName) await copyFile(join(root, '..', 'LICENSE'), join(notices, name));
    else await writeFile(join(notices, name), bytes);
  }
}
const actualNames = (await readdir(notices)).sort();
const wantedNames = [...expected.keys()].sort();
if (actualNames.join('\n') !== wantedNames.join('\n')) {
  throw new Error('Distribution license file list is missing or stale');
}
for (const [name, bytes] of expected) {
  const actual = await readFile(join(notices, name));
  if (!actual.equals(bytes)) throw new Error(`Distribution license mismatch: ${name}`);
}
console.log(`verified ${rows.length} package notices, own MIT license, and ${fonts.length} font files`);
