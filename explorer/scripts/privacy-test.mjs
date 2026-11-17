// Synthetic sentinels only. Never enumerates or reads owner local-private data.
import { build, createServer, preview } from 'vite';
import { request } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { exportDirectory } from './local-export-server.mjs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { checkPublicBuild } from './public-privacy.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'possession-public-privacy-'));
const localDir = resolve(root, '../.local-explorer');
mkdirSync(localDir, { recursive: true });
const publicCanary = join(root, 'public', 'p1-security-canary.json');
const localCanary = join(localDir, 'p1-security-canary.json');
const imageCanary = join(localDir, 'p1-security-canary.png');
const urlEntry = join(root, 'p1-security-url-entry.js');
if ([publicCanary, localCanary, imageCanary, urlEntry].some(existsSync)) throw new Error('Synthetic security sentinel path already exists; refusing to overwrite.');
const marker = 'P1_PRIVATE_CANARY_6f7b2e';
try {
  writeFileSync(publicCanary, marker);
  writeFileSync(localCanary, marker);
  await build({ root, logLevel: 'warn', build: { outDir: out, emptyOutDir: false } });
  checkPublicBuild(out);
  assert(!existsSync(join(out, 'p1-security-canary.json')));
  let chunks = '';
  for (const file of readdirSync(join(out, 'assets'))) if (file.endsWith('.js')) chunks += readFileSync(join(out, 'assets', file), 'utf8');
  assert(!chunks.includes(marker));
  assert(!chunks.includes('local-private'));
  console.log('PASS 1: public/ synthetic private sentinel excluded');
  console.log('PASS 2: ignored local sentinel and local loader excluded');
  await assert.rejects(build({ root, mode: 'local-explorer', logLevel: 'silent', build: { outDir: join(out, 'forbidden') } }), /Private-mode builds are prohibited/);
  console.log('PASS 3: local production build refused');
  await assert.rejects(build({ root, logLevel: 'silent', build: { outDir: join(out, 'forbidden-module'), rollupOptions: { input: join(root, 'src/local/validate.ts') } } }), /Public build attempted to include a local\/private module/);
  console.log('PASS 4: accidental local module import refused');
  await assert.rejects(build({ root, logLevel: 'silent', build: { outDir: join(out, 'forbidden-private'), rollupOptions: { input: localCanary } } }), /Public build attempted to import a private asset/);
  console.log('PASS 5: accidental private asset import refused before loading');
  writeFileSync(imageCanary, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6mXcAAAAASUVORK5CYII=', 'base64'));
  writeFileSync(urlEntry, "document.body.innerHTML = new URL('../.local-explorer/p1-security-canary.png', import.meta.url).href;");
  await assert.rejects(build({ root, logLevel: 'silent', build: { outDir: join(out, 'forbidden-url'), rollupOptions: { input: urlEntry } } }), /private asset|Unapproved public build asset/);
  console.log('PASS 6: tiny private URL asset cannot be inlined or emitted');
  for (const privateDirectory of ['data', 'source']) {
    const directory = join(out, privateDirectory);
    mkdirSync(directory);
    const input = join(directory, 'synthetic.json');
    writeFileSync(input, JSON.stringify({ sentinel: marker }));
    await assert.rejects(build({ root, logLevel: 'silent', build: { outDir: join(out, `forbidden-${privateDirectory}`), rollupOptions: { input } } }), /Public build attempted to import a private asset/);
  }
  console.log('PASS 7: data and source imports refused using isolated synthetic files');
  await loaderChecks(out);
  console.log('17 public privacy safeguards passed.');
} finally {
  rmSync(publicCanary, { force: true });
  rmSync(localCanary, { force: true });
  rmSync(imageCanary, { force: true });
  rmSync(urlEntry, { force: true });
  // This is the unique OS temporary directory created above, never an owner data directory.
  assert.equal(dirname(resolve(out)), resolve(tmpdir()));
  assert(basename(out).startsWith('possession-public-privacy-'));
  rmSync(out, { recursive: true, force: true });
}

/** Raw HTTP so the Host, Origin and Sec-Fetch-Site headers can be set exactly. */
function get(port, path, headers = {}, method = 'GET') {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => done({ status: res.statusCode, type: res.headers['content-type'] ?? '', body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', fail);
    req.end();
  });
}

/** The loopback local export loader: absent from public servers, narrow in local mode. */
async function loaderChecks(builtPublicOutput) {
  const marker = 'P1_PRIVATE_CANARY_loader_7c1d';
  let server = await createServer({ root, logLevel: 'silent', server: { port: 4192, strictPort: true } });
  await server.listen();
  try {
    const r = await get(4192, '/__local-explorer/manifest');
    assert(!r.type.includes('application/json') && !r.body.includes('"exports"'));
  } finally { await server.close(); }
  console.log('PASS 8: public development server has no local export endpoint');
  const pv = await preview({ root, logLevel: 'silent', build: { outDir: builtPublicOutput }, preview: { port: 4193, strictPort: true } });
  try {
    const r = await get(4193, '/__local-explorer/export/0');
    assert(!r.type.includes('application/json') && !r.body.includes(marker));
  } finally { await new Promise((done) => pv.httpServer.close(done)); }
  console.log('PASS 9: public production preview has no local export endpoint');
  assert.throws(() => exportDirectory(root, { LOCAL_EXPLORER_TEST_DIR: root }), /temporary directory/);
  assert.throws(() => exportDirectory(root, { LOCAL_EXPLORER_TEST_DIR: join(tmpdir(), 'other-directory') }), /possession-local-/);
  console.log('PASS 10: the test-only export directory override is confined to fresh OS temporary folders');

  const directory = mkdtempSync(join(tmpdir(), 'possession-local-privacy-'));
  const outside = mkdtempSync(join(tmpdir(), 'possession-outside-'));
  try {
    const listed = JSON.stringify({ schemaVersion: 'local-1', sentinel: marker });
    writeFileSync(join(directory, 'listed.json'), listed);
    writeFileSync(join(directory, 'unlisted.json'), JSON.stringify({ sentinel: `${marker}_unlisted` }));
    writeFileSync(join(outside, 'secret.json'), JSON.stringify({ sentinel: `${marker}_outside` }));
    writeFileSync(join(directory, 'huge.json'), Buffer.alloc(16 * 1024 * 1024 + 1, 32));
    let symlinked = false;
    try { symlinkSync(join(outside, 'secret.json'), join(directory, 'linked.json')); symlinked = true; } catch { /* no symlink privilege on this system */ }
    const config = (exports) => writeFileSync(join(directory, 'explorer-config.json'), JSON.stringify({ schema: 'local-explorer-config-1', exports }));
    config(['listed.json', 'huge.json', 'linked.json', 'missing.json']);
    process.env.LOCAL_EXPLORER_TEST_DIR = directory;
    server = await createServer({ root, mode: 'local-explorer', logLevel: 'silent', server: { port: 4194, strictPort: true } });
    await server.listen();
    try {
      const m = await get(4194, '/__local-explorer/manifest');
      const manifest = JSON.parse(m.body);
      assert.deepEqual(manifest.exports.map((e) => [e.name, e.available]), [['listed.json', true], ['huge.json', false], ['linked.json', false], ['missing.json', false]]);
      assert(!m.body.includes(marker) && !m.body.includes('unlisted') && !m.body.includes(basename(directory)));
      const served = await get(4194, '/__local-explorer/export/0');
      assert(served.status === 200 && served.body === listed && served.type.startsWith('application/json'));
      console.log('PASS 11: local loader lists registered names only and serves a listed export');
      for (const path of ['/__local-explorer/export/1', '/__local-explorer/export/2', '/__local-explorer/export/3', '/__local-explorer/export/9',
        '/__local-explorer/export/unlisted.json', '/__local-explorer/export/..%2Funlisted.json', '/__local-explorer/../unlisted.json',
        '/__local-explorer/export/0/../../unlisted.json', `/@fs/${join(directory, 'unlisted.json').split(sep).join('/')}`]) {
        const r = await get(4194, path);
        assert(!r.body.includes(marker), `${path} leaked`);
      }
      console.log(`PASS 12: unlisted, oversize, missing${symlinked ? ', symlinked' : ''} and traversal paths are never served`);
      const spoof = await get(4194, '/__local-explorer/export/0', { host: 'attacker.example:4194' });
      assert(spoof.status === 403 && !spoof.body.includes(marker));
      console.log('PASS 13: a non-loopback Host header is refused (DNS-rebinding guard)');
      const refused = await Promise.all([
        get(4194, '/__local-explorer/export/0', { origin: 'http://attacker.example' }),
        get(4194, '/__local-explorer/export/0', { origin: 'http://127.0.0.1:9999' }),
        get(4194, '/__local-explorer/export/0', { 'sec-fetch-site': 'cross-site' }),
      ]);
      assert(refused.every((r) => r.status === 403 && !r.body.includes(marker)));
      console.log('PASS 14: cross-origin and cross-site requests are refused');
      assert((await get(4194, '/__local-explorer/manifest', {}, 'POST')).status === 405);
      console.log('PASS 15: only GET is accepted');
      config([`../${basename(outside)}/secret.json`]);
      const traversal = await get(4194, '/__local-explorer/manifest');
      assert(JSON.parse(traversal.body).configured === false && !(await get(4194, '/__local-explorer/export/0')).body.includes(marker));
      console.log('PASS 16: a traversal entry in the configuration is rejected');
      writeFileSync(join(directory, 'explorer-config.json'), '{broken-config-sentinel');
      const broken = await get(4194, '/__local-explorer/manifest');
      assert(JSON.parse(broken.body).configured === false && /not valid JSON/.test(broken.body) && !broken.body.includes('broken-config-sentinel'));
      console.log('PASS 17: a corrupt configuration is reported without echoing its contents');
    } finally {
      await server.close();
      delete process.env.LOCAL_EXPLORER_TEST_DIR;
    }
  } finally {
    for (const d of [directory, outside]) {
      assert.equal(dirname(resolve(d)), resolve(tmpdir()));
      rmSync(d, { recursive: true, force: true });
    }
  }
}
