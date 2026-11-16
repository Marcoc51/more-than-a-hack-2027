// Browser smoke test for the production build (synthetic data only).
//
//   npm run build && npm run smoke [-- --out <screenshot dir>]
//
// Starts `vite preview` in-process, drives a locally installed Chrome/Chromium/Edge with
// puppeteer-core (no browser download), checks 1440, 1280 and 375 px layouts and the playback,
// keyboard, timeline, theme and reduced-motion behaviour, and exits 1 on any failure.
// Set CHROME_PATH if the browser is not in a standard location.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const OUT = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(tmpdir(), 'maf-fc-smoke');
mkdirSync(OUT, { recursive: true });
const scenario = JSON.parse(readFileSync(join(root, 'src/scenario/generated/s1.json'), 'utf8'));
const LAST = scenario.frameCount - 1;

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome/Chromium/Edge found; set CHROME_PATH.');
  process.exit(2);
}
if (!existsSync(join(root, 'dist/index.html'))) {
  console.error('dist/ is missing; run `npm run build` first.');
  process.exit(2);
}

const failures = [];
const passes = [];
const check = (name, ok, detail = '') => (ok ? passes : failures).push(detail ? `${name} (${detail})` : name);

const server = await preview({ root, preview: { port: 4179, strictPort: true, host: '127.0.0.1', open: false }, logLevel: 'silent' });
const URL = 'http://127.0.0.1:4179/';
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-first-run'] });

async function open(label, width, height, { theme = 'dark', reducedMotion = false } = {}) {
  // A fresh context per viewport: no theme choice or other storage carries over between runs.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warn') check(`${label}: no console ${m.type()}`, false, m.text()); });
  page.on('pageerror', (e) => check(`${label}: no page error`, false, e.message));
  page.on('requestfailed', (r) => check(`${label}: no failed request`, false, r.url()));
  page.on('response', (r) => { if (r.status() >= 400) check(`${label}: no HTTP error`, false, `${r.status()} ${r.url()}`); });
  await page.setViewport({ width, height, deviceScaleFactor: 1, hasTouch: width < 500, isMobile: width < 500 });
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: theme },
    { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' },
  ]);
  await page.goto(URL, { waitUntil: 'networkidle0' });
  return page;
}

const frameOf = async (page) => Number((await page.$eval('[data-testid="readout"]', (e) => e.textContent)).match(/Frame (\d+)/)[1]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const scrub = (page, f) => page.$eval('input[type="range"][aria-label="Frame"]', (el, v) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, f);
const blur = (page) => page.evaluate(() => { document.activeElement?.blur(); document.body.focus(); });
const playLabel = (page) => page.$eval('.btn-play', (b) => b.getAttribute('aria-label'));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const bodyBg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const playerTransform = (page, id) => page.$eval(`[data-testid="player-${id}"]`, (g) => g.getAttribute('transform'));

try {
  // ---- 1440 desktop -----------------------------------------------------------------
  {
    const page = await open('1440', 1440, 1000);
    check('1440: title', (await page.title()) === 'MAF FC Possession Explorer');
    check('1440: MAF FC brand', (await page.$eval('.brand-mark', (e) => e.textContent)) === 'MAF FC');
    check('1440: no logo or other images', (await page.$$eval('img', (e) => e.length)) === 0);
    check('1440: 22 players and the ball at frame 0', (await page.$$eval('.player', (e) => e.length)) === 22 && (await page.$('[data-testid="ball"]')) !== null);

    const p0 = scenario.frames[0].players[0];
    check('1440: player drawn at fixture coordinates', (await playerTransform(page, scenario.players[0].id)) === `translate(${p0[0]} ${p0[1]})`);
    await scrub(page, 120);
    const p120 = scenario.frames[120].players[0];
    const b120 = scenario.frames[120].ball;
    check('1440: scrub moves players to the frame-120 fixture', (await playerTransform(page, scenario.players[0].id)) === `translate(${p120[0]} ${p120[1]})`);
    check('1440: ball at the frame-120 fixture', (await page.$eval('[data-testid="ball"]', (c) => c.getAttribute('cx'))) === String(b120[0]));

    await page.click('button[aria-label="Restart from frame 0"]');
    check('1440: restart', (await frameOf(page)) === 0);

    await blur(page);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    check('1440: arrow steps one frame', (await frameOf(page)) === 2);
    await page.keyboard.down('Shift'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');
    check('1440: Shift+arrow steps ten frames', (await frameOf(page)) === 12);
    await page.keyboard.press('ArrowLeft');
    check('1440: left arrow steps back', (await frameOf(page)) === 11);

    await page.focus('[role="slider"][aria-label="Timeline position"]');
    await page.keyboard.press('ArrowRight');
    check('1440: timeline slider seeks exactly one frame', (await frameOf(page)) === 12);
    await page.keyboard.down('Shift'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift');
    check('1440: timeline slider Shift+arrow', (await frameOf(page)) === 22);
    await page.keyboard.press('End');
    check('1440: timeline slider End', (await frameOf(page)) === LAST);
    await page.keyboard.press('Home');
    check('1440: timeline slider Home', (await frameOf(page)) === 0);
    check('1440: timeline slider focus ring visible', (await page.$eval('.tl-seek', (e) => getComputedStyle(e).outlineStyle)) === 'solid');

    const bars = await page.$('[data-testid="timeline-bars"]');
    const box = await bars.boundingBox();
    await page.mouse.click(box.x + box.width * (250.5 / scenario.frameCount), box.y + 10);
    check('1440: mouse click on timeline seeks to frame 250', (await frameOf(page)) === 250);
    check('1440: click focuses the timeline slider', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Timeline position'));

    await scrub(page, 0); await blur(page);
    await page.keyboard.press('Space');
    await wait(1000);
    await page.keyboard.press('Space');
    const played = await frameOf(page);
    check('1440: Space play/pause advances about 25 frames per second', played >= 20 && played <= 30, `frame ${played}`);
    check('1440: paused after second Space', (await playLabel(page)) === 'Play');

    await scrub(page, 0); await blur(page);
    await page.click('.btn-play');
    await wait(400);
    const before = await frameOf(page);
    await page.select('.speed select', '2');
    await wait(1000);
    await page.click('.btn-play');
    const gained = (await frameOf(page)) - before;
    check('1440: changing speed while playing (2x for 1 s)', gained >= 40 && gained <= 60, `gained ${gained}`);
    await page.select('.speed select', '1');

    await scrub(page, LAST - 5);
    await page.click('.btn-play');
    await wait(700);
    check('1440: stops at the final frame', (await frameOf(page)) === LAST && (await playLabel(page)) === 'Play');

    await scrub(page, 50);
    await page.click('.btn-play');
    await wait(150);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const hiddenAt = await frameOf(page);
    await wait(400);
    check('1440: hidden tab pauses playback', (await playLabel(page)) === 'Play' && (await frameOf(page)) === hiddenAt);
    await page.evaluate(() => { delete document.visibilityState; });

    await scrub(page, 200);
    const sync = await page.evaluate(() => ({
      playhead: document.querySelector('[data-testid="playhead"]').dataset.frame,
      slider: document.querySelector('[aria-label="Timeline position"]').getAttribute('aria-valuenow'),
      inspector: document.querySelector('.insp-frame strong').textContent,
      chip: document.querySelector('.insp-labels .chip').textContent,
      ghost: document.querySelector('[data-testid="ball-ghost"]') !== null,
    }));
    check('1440: pitch, timeline, slider and inspector agree at frame 200',
      sync.playhead === '200' && sync.slider === '200' && sync.inspector === '200' &&
      sync.chip === scenario.models.phase3b.labels[200] && sync.ghost === (scenario.frames[200].ball === null),
      JSON.stringify(sync));

    check('1440: dark theme by default', (await bodyBg(page)) === 'rgb(15, 20, 25)');
    await page.screenshot({ path: join(OUT, 'desktop-1440-dark.png'), fullPage: true });
    await page.click('.app-bar-actions button');
    check('1440: theme switch to light', (await bodyBg(page)) === 'rgb(245, 247, 242)');
    await page.screenshot({ path: join(OUT, 'desktop-1440-light.png'), fullPage: true });
    await page.click('.app-bar-actions button');
    check('1440: theme switch back to dark', (await bodyBg(page)) === 'rgb(15, 20, 25)');
    check('1440: no horizontal overflow', (await overflow(page)) === 0);
    await page.close();
  }

  // ---- 1280 laptop, OS light preference ---------------------------------------------
  {
    const page = await open('1280', 1280, 800, { theme: 'light' });
    check('1280: follows the OS light preference', (await bodyBg(page)) === 'rgb(245, 247, 242)');
    check('1280: no horizontal overflow', (await overflow(page)) === 0);
    await page.screenshot({ path: join(OUT, 'laptop-1280-light.png'), fullPage: true });
    await page.close();
  }

  // ---- 375 mobile, touch, reduced motion --------------------------------------------
  {
    const page = await open('375', 375, 812, { reducedMotion: true });
    check('375: no horizontal overflow', (await overflow(page)) === 0);
    check('375: reduced motion removes transitions', (await page.$eval('.btn', (e) => getComputedStyle(e).transitionDuration)) === '0s');
    await wait(400);
    check('375: no autoplay', (await frameOf(page)) === 0 && (await playLabel(page)) === 'Play');
    const bars = await page.$('[data-testid="timeline-bars"]');
    await bars.scrollIntoView();
    const box = await bars.boundingBox();
    // Touch points are whole pixels (about 1.7 frames each at this width): expect the frame
    // under the pixel actually tapped.
    const tx = Math.round(box.x + box.width * (100.5 / scenario.frameCount));
    const expected = Math.floor(((tx - box.x) / box.width) * scenario.frameCount);
    await page.touchscreen.tap(tx, Math.round(box.y + 10));
    check('375: tap on timeline seeks', (await frameOf(page)) === expected, `frame ${await frameOf(page)}, expected ${expected}`);
    const buttons = await page.$$eval('.transport .btn', (bs) => bs.map((b) => Math.round(b.getBoundingClientRect().height)));
    check('375: touch-sized transport buttons (>= 44 px)', buttons.every((h) => h >= 44), buttons.join(','));
    await page.screenshot({ path: join(OUT, 'mobile-375.png'), fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

for (const p of passes) console.log(`PASS  ${p}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`\n${passes.length} passed, ${failures.length} failed. Screenshots: ${OUT}`);
process.exit(failures.length ? 1 : 0);
