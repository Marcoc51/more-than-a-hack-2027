// End-to-end local workflow with artificial inputs only:
// exporter (with smooth50) -> registered default -> loopback loader -> local Explorer and Compare.
// The owner's .local-explorer/explorer-config.json is never read or written: the dev server is
// pointed at a fresh possession-local-* folder under the OS temporary directory.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(root, '..');
const inputs = mkdtempSync(join(tmpdir(), 'possession-smoke-inputs-'));
const served = mkdtempSync(join(tmpdir(), 'possession-local-smoke-'));
const name = `smoke-${process.pid}-${Date.now()}.json`;
const destination = join(repository, '.local-explorer', name);
if (existsSync(destination)) throw new Error('Synthetic smoke export already exists; refusing to overwrite.');
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean).find(existsSync);
if (!executablePath) throw new Error('No installed browser; set CHROME_PATH.');
const python = process.env.PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3');
let server, browser;
let count = 0;
const check = (label, value) => { assert(value, label); count++; console.log(`PASS ${count}: ${label}`); };
const PORT = 4191;
const BASE = `http://127.0.0.1:${PORT}`;
// 12 synthetic frames from source frame 100: engine HHHHAAAADDHH, smooth50 HHHAAAAAADHH.
const ENGINE = 'HHHHAAAADDHH';
const SMOOTH = 'HHHAAAAAADHH';
try {
  writeFileSync(join(inputs, 'synthetic.xml'), '<Metadata><Teams><Team id="H"/><Team id="A"/></Teams><Players><Player id="1" teamId="H"/><Player id="2" teamId="A"/></Players></Metadata>');
  const rows = Array.from({ length: 112 }, (_, i) => {
    const id = i + 1;
    // Partially missing groups as in real ATD: id 105 ball speed unknown, id 106 slot 2 without x,
    // id 107 slot 1 speed unknown. Positions must stay or vanish, never be invented.
    const ball = id === 103 ? 'NaN,NaN,NaN' : `${(0.5 + i * 0.001).toFixed(3)},0.5,${id === 105 ? 'NaN' : '2'}`;
    const one = id === 107 ? '0.1,0.2,NaN' : '0.1,0.2,1';
    const two = id === 106 ? 'NaN,0.4,1' : '0.3,0.4,1';
    return `${id}:${one};${two}:${ball}`;
  });
  writeFileSync(join(inputs, 'synthetic.txt'), rows.join('\n') + '\n');
  const csv = (labels) => 'frame,label\n' + Array.from({ length: 112 }, (_, f) => `${f},${f < 100 ? 'X' : labels[f - 100]}`).join('\n') + '\n';
  writeFileSync(join(inputs, 'engine.csv'), csv(ENGINE));
  writeFileSync(join(inputs, 'smooth50.csv'), csv(SMOOTH));
  execFileSync(python, [join(repository, 'tools/export_local_scenario.py'), '--metadata', join(inputs, 'synthetic.xml'), '--tracking', join(inputs, 'synthetic.txt'),
    '--predictions', join(inputs, 'engine.csv'), '--baseline-predictions', join(inputs, 'smooth50.csv'), '--start-frame', '100', '--frame-count', '12', '--out', destination], { cwd: repository });
  const exported = JSON.parse(readFileSync(destination, 'utf8'));
  check('synthetic adapter export aligns both predictions', exported.predictions.labels === ENGINE && exported.baseline.labels === SMOOTH && exported.sourceFrameStart === 100);
  check('partially missing groups export as null speed / null position, never NaN or zero',
    exported.frames[4].ball[2] === null && exported.frames[4].ball[0] === 63.601 && exported.frames[5].players[1] === null
    && JSON.stringify(exported.frames[6].players[0]) === '[10.53,13.6]' && !readFileSync(destination, 'utf8').includes('NaN'));
  copyFileSync(destination, join(served, name));
  rmSync(destination, { force: true });
  const config = (exports) => writeFileSync(join(served, 'explorer-config.json'), JSON.stringify({ schema: 'local-explorer-config-1', exports }));
  config([name]);

  process.env.LOCAL_EXPLORER_TEST_DIR = served;
  server = await createServer({ root, mode: 'local-explorer', logLevel: 'silent', server: { port: PORT, strictPort: true } });
  await server.listen();
  browser = await puppeteer.launch({ executablePath, headless: true, pipe: true, args: ['--no-first-run', ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });
  const page = await browser.newPage();
  const errors = [], requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/explorer`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="local-source"]');
  check('local Explorer opens the registered export by default', (await page.$eval('[data-testid="local-source"]', (e) => e.textContent)).includes(`registered export ${name}`));
  check('dark theme by default in local mode', await page.evaluate(() => document.documentElement.dataset.theme) === 'dark');
  check('real source frame numbers are shown', (await page.$eval('[data-testid="local-frame"]', (e) => e.textContent)).includes('source frame 100'));
  check('pitch uses adapter coordinates', (await page.$eval('[data-testid="player-slot-1"]', (e) => e.getAttribute('transform'))) === 'translate(10.53 13.6)');
  check('local pitch makes no unsupported attack-direction claim', !(await page.$eval('.pitch-caption', (e) => e.textContent)).includes('attacks'));
  check('both prediction timelines and the agreement track are shown', !!await page.$('[data-testid="track-primary"]') && !!await page.$('[data-testid="track-baseline"]') && !!await page.$('[data-testid="track-pair"]'));
  for (let i = 0; i < 2; i++) await page.click('[aria-label="Next frame"]');
  check('shared playback seeks exactly', (await page.$eval('[data-testid="local-frame"]', (e) => e.textContent)).includes('Clip frame 2 · source frame 102'));
  check('missing ball (raw ATD id 103) displays ghost marker at source frame 102', !!await page.$('[data-testid="ball-ghost"]'));
  for (let i = 0; i < 2; i++) await page.click('[aria-label="Next frame"]');
  check('a ball with unknown speed is still drawn at its tracked position', !!await page.$('[data-testid="ball"]') && !await page.$('[data-testid="ball-ghost"]'));
  await page.click('[aria-label="Next frame"]');
  check('a player group without x is absent from the pitch, not drawn at a made-up point', !await page.$('[data-testid="player-slot-2"]') && !!await page.$('[data-testid="player-slot-1"]'));
  await page.click('[aria-label="Next frame"]');
  check('a player with unknown speed keeps its tracked position', (await page.$eval('[data-testid="player-slot-1"]', (e) => e.getAttribute('transform'))) === 'translate(10.53 13.6)');
  await page.focus('[data-testid="timeline-seek"]');
  await page.keyboard.press('End');
  check('keyboard End on the timeline reaches the last frame', (await page.$eval('[data-testid="local-frame"]', (e) => e.textContent)).includes('source frame 111'));
  check('local Explorer shows no reference or accuracy score', !await page.$('[data-testid="model-card-phase3b"]') && !(await page.$eval('main', (e) => e.textContent)).includes('spellF1'));

  const exportFetches = () => requests.filter((u) => u.includes('/__local-explorer/export/')).length;
  const before = exportFetches();
  await page.click('nav[aria-label="Main"] a[href="/compare"]');
  await page.waitForSelector('[data-testid="local-verdict"]');
  check('Compare reuses the loaded export without importing it again', exportFetches() === before);
  check('Compare reports model-to-model agreement, not accuracy', /agree on 10 of 12 frames \(83\.3%\)/.test(await page.$eval('[data-testid="local-verdict"]', (e) => e.textContent)) && (await page.$eval('[data-testid="local-verdict"]', (e) => e.textContent)).includes('not accuracy'));
  const diffRows = await page.$$eval('[data-testid="local-difference-table"] tbody tr', (rs) => rs.map((r) => r.textContent));
  check('difference intervals use real source frames', diffRows.length === 2 && diffRows[0].includes('103–103') && diffRows[1].includes('108–108'));
  await page.click('[aria-label="Go to source frame 108"]');
  check('going to a difference moves the shared playhead', (await page.$eval('[data-testid="local-frame"]', (e) => e.textContent)).includes('source frame 108') && (await page.$eval('[data-testid="local-pair-state"]', (e) => e.textContent)).includes('differ'));
  check('Compare shows no F1 metrics, reference series or confusion matrices', await page.evaluate(() => !/spellF1|macroF1|confusion/.test(document.querySelector('main').textContent) && !document.querySelector('[data-testid="track-reference"]')));
  check('loading registered data makes no request outside localhost', requests.every((u) => u.startsWith(`${BASE}/`)));
  const forbidden = await page.evaluate(async (p) => { const r = await fetch('/@fs/' + p); return { status: r.status, text: await r.text() }; }, join(served, name).replaceAll('\\', '/'));
  check('the export is not reachable through Vite file serving', forbidden.status === 403 && !forbidden.text.includes('local-private'));
  for (const path of ['/explorer', '/compare']) {
    for (const width of [1280, 375]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-testid="local-source"]');
      check(`${path} fits ${width}px without horizontal scrolling`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  }
  check('a reload reopens the registered export without a file dialog', (await page.$eval('[data-testid="local-source"]', (e) => e.textContent)).includes(name));

  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/compare`, { waitUntil: 'networkidle0' });
  const oneModel = join(inputs, 'one-model.json');
  writeFileSync(oneModel, JSON.stringify({ ...exported, baseline: undefined }));
  await (await page.$('input[type=file]')).uploadFile(oneModel);
  await page.waitForSelector('[data-testid="local-missing-baseline"]');
  check('an export without smooth50 gives a single-model view naming what is missing', (await page.$eval('[data-testid="local-source"]', (e) => e.textContent)).includes('local file one-model.json') && !await page.$('[data-testid="local-difference-table"]'));
  writeFileSync(join(inputs, 'bad.json'), JSON.stringify({ ...exported, baseline: { name: 'x', labels: 'HH' } }));
  await (await page.$('input[type=file]')).uploadFile(join(inputs, 'bad.json'));
  await page.waitForSelector('[role=alert]');
  check('a misaligned export gives a field-specific error and shows no data', (await page.$eval('[role=alert]', (e) => e.textContent)).includes('baseline.labels') && !await page.$('[data-testid="readout"]'));

  config([]);
  await page.goto(`${BASE}/explorer`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="local-setup"]');
  check('without a registered export, setup instructions replace the viewer', !await page.$('[data-testid="readout"]') && !(await page.$eval('main', (e) => e.textContent)).includes('Synthetic Home'));
  check('browser reports no JavaScript error', errors.length === 0);
  console.log(`${count} local browser checks passed (synthetic inputs only).`);
} finally {
  await browser?.close();
  await server?.close();
  delete process.env.LOCAL_EXPLORER_TEST_DIR;
  rmSync(destination, { force: true });
  for (const d of [inputs, served]) {
    assert.equal(dirname(resolve(d)), resolve(tmpdir()));
    assert(basename(d).startsWith('possession-'));
    rmSync(d, { recursive: true, force: true });
  }
}
