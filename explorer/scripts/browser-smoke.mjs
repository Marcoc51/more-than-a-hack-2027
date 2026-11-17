// Browser smoke test for the production build (synthetic data only).
//
//   npm run build && npm run smoke [-- --out <screenshot dir>]
//
// Starts `vite preview` in-process, drives a locally installed Chrome/Chromium/Edge with
// puppeteer-core (no browser download), and exits 1 on any failure. It checks:
//   - every route (/, /explorer, /compare, /methodology, /team) at 1440, 1280, 1024, 768, 720 and
//     375 px in both themes: title, heading, active link, no horizontal overflow, no console errors
//     and no failed requests;
//   - Home's mini-Explorer, the Team page, Compare tabs and disclosures, scenario-chip keys and the
//     Methodology diagrams (UI3B);
//   - the four Team cards and their layout, the organiser logos, and the Home heading focus (UI3B.1);
//   - the organiser logos in the shared header at every width, and Team portrait alignment (UI3B.2);
//   - navigation, the mobile menu, deep links and the static-host 404 fallback;
//   - the Explorer's playback, keyboard, timeline, theme and reduced-motion behaviour (UI1), and
//     scenario switching;
//   - the Compare page's disagreement seeking and filtering.
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
const load = (id) => JSON.parse(readFileSync(join(root, `src/scenario/generated/${id}.json`), 'utf8'));
const scenario = load('s1');
const S3 = load('s3');
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
const BASE = 'http://127.0.0.1:4179';
const browser = await puppeteer.launch({ executablePath, headless: true, pipe: true,
  args: ['--no-first-run', ...(process.env.CHROME_NO_SANDBOX === '1' ? ['--no-sandbox'] : [])] });

async function open(label, width, height, { theme = 'dark', reducedMotion = false, path = '/explorer' } = {}) {
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
  // Dark is the default whatever the OS scheme; a light run models a viewer's saved choice.
  if (theme === 'light') {
    await page.evaluateOnNewDocument(() => { if (!localStorage.getItem('maf-fc-theme')) localStorage.setItem('maf-fc-theme', 'light'); });
  }
  await page.goto(BASE + path, { waitUntil: 'networkidle0' });
  await page.waitForSelector('h1');
  return page;
}

const ready = (page) => page.waitForSelector('[data-testid="readout"]');
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
const h1 = (page) => page.$eval('h1', (e) => e.textContent);
const activeLink = (page) => page.$eval('nav[aria-label="Main"] [aria-current="page"] .nav-label', (a) => a.textContent).catch(() => null);
const visible = (page, sel) => page.$eval(sel, (e) => { const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.5; });

const ROUTES = [
  ['/', 'Home', /^Possession, frame by frame/],
  ['/explorer', 'Explorer', /^Explorer$/],
  ['/compare', 'Compare', /^Compare$/],
  ['/methodology', 'Methodology', /^Methodology$/],
  ['/team', 'Team', /^Team$/],
];
const WIDTHS = [[1440, 1000, 'desktop'], [1280, 800, 'laptop'], [1024, 900, 'small-laptop'], [768, 1024, 'tablet'], [720, 900, 'menu-edge'], [375, 812, 'mobile']];
const SCENARIO_ROUTES = new Set(['/', '/explorer', '/compare']);

try {
  // ---- every route at every width ---------------------------------------------------
  for (const theme of ['dark', 'light']) {
    for (const [width, height, name] of WIDTHS) {
      for (const [path, title, heading] of ROUTES) {
        const label = `${width} ${theme} ${path}`;
        const page = await open(label, width, height, { theme, path: `${path}?scenario=s4` });
        if (SCENARIO_ROUTES.has(path)) await ready(page);
        check(`${label}: heading`, heading.test(await h1(page)), await h1(page));
        check(`${label}: document title`, (await page.title()) === `${title} · MAF FC Possession Explorer`);
        check(`${label}: active link`, (await activeLink(page)) === title);
        check(`${label}: no horizontal overflow`, (await overflow(page)) === 0, `${await overflow(page)} px`);
        check(`${label}: menu button only on narrow screens`, (await visible(page, '.menu-button')) === (width < 720));
        if (width === 1440 || width === 375) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await wait(300);
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: join(OUT, `${theme}-${name}-${width}${path === '/' ? '-home' : path.replace('/', '-')}.png`), fullPage: true });
        }
        await page.close();
      }
    }
  }

  // ---- UI3B: Home mini-Explorer ---------------------------------------------------------
  {
    const page = await open('1440 home', 1440, 1000, { path: '/' });
    await ready(page);
    const miniFrame = () => page.$eval('[data-testid="mini-explorer"] [data-testid="readout"]', (e) => Number(e.textContent.match(/Frame (\d+)/)[1]));
    check('home: mini-Explorer starts at frame 120', (await miniFrame()) === 120);
    await blur(page);
    await page.keyboard.press('Space');
    await wait(300);
    check('home: Space does not drive the mini-Explorer', (await miniFrame()) === 120);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click('[data-testid="mini-explorer"] .btn-play');
    await wait(1000);
    await page.click('[data-testid="mini-explorer"] .btn-play');
    const gained = (await miniFrame()) - 120;
    check('home: mini-Explorer plays at about 25 frames per second', gained >= 20 && gained <= 30, `gained ${gained}`);
    const playhead = await page.$eval('[data-testid="mini-explorer"] [data-testid="playhead"]', (e) => Number(e.dataset.frame));
    check('home: mini timeline follows its own clock', playhead === (await miniFrame()));
    check('home: competition strip names the organisers in text', (await page.$eval('.competition-strip', (e) => e.textContent)).includes('Mobile World Capital Barcelona'));
    await page.evaluate(() => document.querySelector('.organiser-logos')?.scrollIntoView());
    await page.waitForFunction(() => [...document.querySelectorAll('.organiser-logo')].every((i) => i.complete && i.naturalWidth > 0), { timeout: 5000 }).catch(() => {});
    const logos = await page.$$eval('.competition-strip img', (els) => els.map((e) => ({ alt: e.alt, ok: e.complete && e.naturalWidth > 0, cls: e.className, href: e.closest('a')?.href })));
    check('home: the strip shows the three organiser logos, all loaded', logos.length === 3 && logos.every((l) => l.ok && l.cls === 'organiser-logo'), JSON.stringify(logos));
    check('home: every image on the page is an organiser logo', await page.$$eval('img', (els) => els.every((e) => e.classList.contains('organiser-logo'))));
    check('home: logos are named links to the organisers', JSON.stringify(logos.map((l) => [l.alt, l.href])) === JSON.stringify([
      ['Metrica Sports', 'https://metrica-sports.com/'], ['Barça Innovation Hub', 'https://barcainnovationhub.fcbarcelona.com/'], ['Mobile World Capital Barcelona', 'https://www.mwcbarcelona.com/'],
    ]), JSON.stringify(logos.map((l) => [l.alt, l.href])));
    check('home: logos sit on the black plate', (await page.$eval('.organiser-logos', (e) => getComputedStyle(e).backgroundColor)) === 'rgb(0, 0, 0)');
    await page.close();
  }

  // ---- UI3B: Team, Compare tabs and disclosures, chips, diagrams ------------------------------
  {
    const page = await open('1440 team', 1440, 1000, { path: '/team' });
    const cards = await page.$$eval('.member-card', (els) => els.map((c) => ({
      name: c.querySelector('.member-name')?.textContent,
      photo: c.querySelector('img')?.getAttribute('src'),
      links: [...c.querySelectorAll('a')].map((a) => a.href),
    })));
    check('team: exactly four cards, in order', JSON.stringify(cards.map((c) => c.name)) === JSON.stringify(['Marc', 'Fahmy', 'Faris', 'Eslam']), JSON.stringify(cards.map((c) => c.name)));
    check('team: each card shows its own photo', cards.every((c) => c.photo === `/team/${c.name?.toLowerCase()}.webp`), JSON.stringify(cards.map((c) => c.photo)));
    check('team: approved LinkedIn and GitHub links', JSON.stringify(cards.map((c) => c.links)) === JSON.stringify([
      ['https://www.linkedin.com/in/marc-sanad/', 'https://github.com/Marcoc51'],
      ['https://www.linkedin.com/in/mohamed-atef-fahmy-khalil/', 'https://github.com/Muhammadatef'],
      ['https://www.linkedin.com/in/faris-ali-352077201/', 'https://github.com/farisali21'],
      ['https://www.linkedin.com/in/eslamkhafagy505/', 'https://github.com/eslamkhafagy505'],
    ]), JSON.stringify(cards.map((c) => c.links)));
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForFunction(() => [...document.querySelectorAll('.member-photo')].every((i) => i.complete && i.naturalWidth > 0), { timeout: 5000 }).catch(() => {});
    check('team: all four photos load', await page.$$eval('.member-photo', (els) => els.length === 4 && els.every((i) => i.naturalWidth === 400 && i.naturalHeight === 500)));
    check('team: no fifth card or placeholder text', !/\bfive\b|\bfifth\b|placeholder|pending|will appear/i.test(await page.$eval('.member-grid', (e) => e.textContent)));
    await page.close();
  }
  for (const [width, perRow] of [[1440, 4], [1280, 4], [1024, 4], [768, 2], [375, 1]]) {
    const page = await open(`${width} team layout`, width, 900, { path: '/team' });
    const tops = await page.$$eval('.member-card', (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    const firstRow = tops.filter((t) => t === tops[0]).length;
    check(`${width} team: ${perRow} card(s) per row`, tops.length === 4 && firstRow === perRow, tops.join(','));
    const portraits = await page.$$eval('.member-portrait', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    check(`${width} team: portraits keep their 4:5 proportions`, portraits.every(([w, h]) => w > 0 && Math.abs(h / w - 1.25) < 0.02), JSON.stringify(portraits));
    check(`${width} team: all four portrait boxes are the same size`, portraits.every(([w, h]) => w === portraits[0][0] && h === portraits[0][1]), JSON.stringify(portraits));
    const align = await page.$$eval('.member-card', (cards) => cards.map((c) => {
      const r = c.getBoundingClientRect(); const p = c.querySelector('.member-portrait').getBoundingClientRect();
      return { left: Math.round(p.left - r.left), right: Math.round(r.right - p.right), top: Math.round(p.top - r.top), bottom: Math.round(r.bottom - p.bottom), pos: getComputedStyle(c.querySelector('.member-portrait')).objectPosition, fit: getComputedStyle(c.querySelector('.member-portrait')).objectFit };
    }));
    const symmetric = width < 768
      ? align.every((a) => a.left === align[0].left && Math.abs(a.top - a.bottom) <= 2)            // phone: same inset, vertically centred
      : align.every((a) => Math.abs(a.left - a.right) <= 1 && a.top <= 1);                           // grid: full-bleed, horizontally centred
    check(`${width} team: portraits sit in the same place in every card`, symmetric, JSON.stringify(align.map(({ left, right, top, bottom }) => [left, right, top, bottom])));
    check(`${width} team: photos are cover-fitted and centred`, align.every((a) => a.fit === 'cover' && a.pos === '50% 50%'), JSON.stringify(align.map((a) => [a.fit, a.pos])));
    await page.close();
  }

  // ---- UI3B.2: organiser logos in the shared header --------------------------------------
  const ORG = [
    ['Metrica Sports', 'https://metrica-sports.com/'],
    ['Barça Innovation Hub', 'https://barcainnovationhub.fcbarcelona.com/'],
    ['Mobile World Capital Barcelona', 'https://www.mwcbarcelona.com/'],
  ];
  for (const theme of ['dark', 'light']) {
    for (const [width, height] of [[1440, 900], [1280, 800], [1024, 900], [768, 1024], [720, 900], [375, 812]]) {
      const label = `${width} ${theme} header logos`;
      const page = await open(label, width, height, { theme, path: '/methodology' });
      const inBar = width >= 1280;
      const groupSel = inBar ? '.bar-organisers' : '.organiser-row .row-organisers';
      // Only the image for the current theme is displayed (the Barça Innovation Hub link holds one per theme).
      await page.waitForFunction((sel) => [...document.querySelectorAll(`${sel} img`)].filter((i) => getComputedStyle(i).display !== 'none').every((i) => i.complete && i.naturalWidth > 0), { timeout: 5000 }, groupSel).catch(() => {});
      check(`${label}: logos ${inBar ? 'inside the bar' : 'in the row under the bar'}`, (await visible(page, groupSel)) && !(await visible(page, inBar ? '.organiser-row' : '.bar-organisers')));
      const logos = await page.$$eval(`${groupSel} a`, (as) => as.map((a) => {
        const shown = [...a.querySelectorAll('img')].filter((i) => getComputedStyle(i).display !== 'none');
        const img = shown[0]; const r = (img ?? a).getBoundingClientRect(); const lr = a.getBoundingClientRect(); const cs = img ? getComputedStyle(img) : null;
        return { shown: shown.length, src: img?.getAttribute('src'), blend: cs?.mixBlendMode, filter: cs?.filter, alt: img?.alt, href: a.href, ok: !!img && img.complete && img.naturalWidth > 0, ratio: img ? r.width / r.height : 0, natural: img ? img.naturalWidth / img.naturalHeight : 0, left: r.left, right: r.right, h: Math.round(r.height), linkH: Math.round(lr.height), linkW: Math.round(lr.width) };
      }));
      check(`${label}: three named logo links to the official sites`, JSON.stringify(logos.map((l) => [l.alt, l.href])) === JSON.stringify(ORG), JSON.stringify(logos.map((l) => [l.alt, l.href])));
      check(`${label}: all logos load`, logos.length === 3 && logos.every((l) => l.ok));
      check(`${label}: exactly one image displayed per logo link`, logos.every((l) => l.shown === 1), logos.map((l) => l.shown).join(','));
      const plate = await page.$eval(groupSel, (e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, border: c.borderTopWidth, shadow: c.boxShadow }; });
      check(`${label}: no logo panel (transparent, no border or shadow)`, plate.bg === 'rgba(0, 0, 0, 0)' && plate.border === '0px' && plate.shadow === 'none', JSON.stringify(plate));
      const linkOpacity = await page.$$eval(`${groupSel} a`, (as) => as.map((a) => getComputedStyle(a).opacity));
      check(`${label}: logo links fully opaque (keeps the blend working)`, linkOpacity.every((o) => o === '1'), linkOpacity.join(','));
      const expected = theme === 'dark'
        ? [['/organisers/metrica-sports.webp', 'screen', 'none'], ['/organisers/barca-innovation-hub.webp', 'normal', 'none'], ['/organisers/mobile-world-capital-barcelona.webp', 'normal', 'none']]
        : [['/organisers/metrica-sports.webp', 'normal', 'none'], ['/organisers/barca-innovation-hub-dark-text.png', 'normal', 'none'], ['/organisers/mobile-world-capital-barcelona.webp', 'normal', 'brightness(0)']];
      check(`${label}: ${theme} presentation of each logo`, JSON.stringify(logos.map((l) => [l.src, l.blend, l.filter])) === JSON.stringify(expected), JSON.stringify(logos.map((l) => [l.src, l.blend, l.filter])));
      check(`${label}: logo proportions preserved`, logos.every((l) => Math.abs(l.ratio - l.natural) < 0.05), logos.map((l) => `${l.ratio.toFixed(2)}/${l.natural.toFixed(2)}`).join(' '));
      check(`${label}: logos inside the viewport`, logos.every((l) => l.left >= 0 && l.right <= width), logos.map((l) => `${Math.round(l.left)}-${Math.round(l.right)}`).join(' '));
      const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
      check(`${label}: logo link targets ${coarse ? '>= 44' : '>= 24'} px tall`, logos.every((l) => l.linkH >= (coarse ? 44 : 24) && l.linkW >= 24), logos.map((l) => `${l.linkW}x${l.linkH}`).join(' '));
      if (inBar) {
        await page.focus('.bar-organisers a');
        await page.keyboard.press('Tab');
        const ring = await page.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return { inGroup: !!e.closest('.bar-organisers'), style: c.outlineStyle, width: c.outlineWidth }; });
        check(`${label}: keyboard focus on a logo link shows a ring`, ring.inGroup && ring.style === 'solid' && ring.width === '2px', JSON.stringify(ring));
        await blur(page);
      }
      check(`${label}: bar height unchanged (56 px)`, (await page.$eval('.app-bar', (e) => Math.round(e.getBoundingClientRect().height))) === 56);
      if (inBar) {
        const gaps = await page.evaluate(() => {
          const nav = document.querySelector('.nav-list').getBoundingClientRect();
          const org = document.querySelector('.bar-organisers').getBoundingClientRect();
          const act = document.querySelector('.app-bar-actions').getBoundingClientRect();
          const brand = document.querySelector('.brand').getBoundingClientRect();
          return { brandToNav: Math.round(nav.left - brand.right), navToLogos: Math.round(org.left - nav.right), logosToActions: Math.round(act.left - org.right), plateH: Math.round(org.height) };
        });
        check(`${label}: brand, links, logos and theme control do not touch`, gaps.brandToNav >= 16 && gaps.navToLogos >= 16 && gaps.logosToActions >= 16 && gaps.plateH <= 44, JSON.stringify(gaps));
      } else {
        const row = await page.$eval('.organiser-row', (e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; });
        check(`${label}: compact row directly under the bar`, row.top === 56 && row.h <= 60, JSON.stringify(row));
      }
      check(`${label}: no horizontal overflow`, (await overflow(page)) === 0, `${await overflow(page)} px`);
      if (width < 720) {
        await page.click('.menu-button');
        await wait(350);
        check(`${label}: menu still opens over the logo row`, await visible(page, '#main-nav-list'));
        const covered = await page.evaluate(() => { const r = document.querySelector('.nav-list a').getBoundingClientRect(); const el = document.elementFromPoint(r.left + 20, r.top + r.height / 2); return !!el?.closest('.nav-list'); });
        check(`${label}: first menu link is on top and clickable`, covered);
        await page.keyboard.press('Escape');
        await wait(350);
        check(`${label}: Escape closes the menu`, !(await visible(page, '#main-nav-list')));
      }
      if (width === 1440 || width === 768 || width === 375) {
        await page.screenshot({ path: join(OUT, `${theme}-header-${width}.png`), clip: { x: 0, y: 0, width, height: inBar ? 56 : 120 } });
        if (inBar) await page.screenshot({ path: join(OUT, `${theme}-header-${width}-logos.png`), clip: { x: width - 520, y: 0, width: 520, height: 56 } });
      }
      await page.close();
    }
  }
  {
    const page = await open('1440 reduced header', 1440, 900, { reducedMotion: true, path: '/' });
    const d = await page.$eval('.bar-organisers .organiser-link', (a) => getComputedStyle(a).transitionDuration);
    check('reduced motion: header logo hover has no transition', d.split(',').every((x) => parseFloat(x) === 0), d);
    check('home: non-endorsement note kept', (await page.$eval('.competition-note', (e) => e.textContent)).includes('do not imply their endorsement'));
    await page.close();
  }

  // ---- UI3B.1: Home heading focus ------------------------------------------------------
  for (const theme of ['dark', 'light']) {
    const page = await open(`1440 ${theme} home focus`, 1440, 1000, { theme, path: '/' });
    await ready(page);
    check(`${theme} home: the hero heading is not focused on first load`, await page.evaluate(() => document.activeElement !== document.getElementById('page-title')));
    const heroOutline = await page.$eval('#page-title', (e) => { e.focus(); return getComputedStyle(e).outlineStyle; });
    check(`${theme} home: the hero heading never shows a focus ring`, heroOutline === 'none', heroOutline);
    await blur(page);
    await page.keyboard.press('Tab');   // skip link
    await page.keyboard.press('Tab');   // brand
    await page.keyboard.press('Tab');   // first nav link
    const ring = await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return { tag: e.tagName, style: s.outlineStyle, width: s.outlineWidth }; });
    check(`${theme} home: keyboard focus on a control shows a visible ring`, ring.tag === 'A' && ring.style === 'solid' && ring.width === '2px', JSON.stringify(ring));
    await page.focus('nav[aria-label="Main"] a[href^="/team"]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.id === 'page-title' && document.activeElement.textContent === 'Team');
    check(`${theme}: keyboard navigation moves focus to the new heading without a ring`, (await page.$eval('#page-title', (e) => getComputedStyle(e).outlineStyle)) === 'none');
    await page.keyboard.press('Tab');
    const next = await page.evaluate(() => { const e = document.activeElement; return { tag: e.tagName, style: getComputedStyle(e).outlineStyle }; });
    check(`${theme}: Tab from the heading reaches a control with a visible ring`, next.style === 'solid', JSON.stringify(next));
    await page.close();
  }
  {
    const page = await open('1440 compare tabs', 1440, 1000, { path: '/compare?scenario=s4' });
    await ready(page);
    check('compare: verdict generated from the data', (await page.$eval('[data-testid="verdict"]', (e) => e.textContent)).includes('graded frames'));
    await page.click('[role="tab"]:nth-child(2)');
    check('compare: Reading tab shows its panel', await page.evaluate(() => !document.querySelectorAll('[role="tabpanel"]')[1].hidden && document.querySelectorAll('[role="tabpanel"]')[0].hidden));
    await page.keyboard.press('ArrowLeft');
    check('compare: arrow key returns to Differences', await page.evaluate(() => document.activeElement?.getAttribute('aria-selected') === 'true' && !document.querySelectorAll('[role="tabpanel"]')[0].hidden));
    check('compare: statistics start collapsed', !(await page.$eval('#detailed-statistics', (d) => d.open)));
    await page.click('#detailed-statistics > summary');
    check('compare: statistics open on request', (await page.$eval('#detailed-statistics', (d) => d.open)) && await visible(page, '[data-testid="counts-table"]'));
    await page.close();
  }
  {
    const page = await open('1440 chips', 1440, 1000, { path: '/explorer?scenario=s1' });
    await ready(page);
    await page.focus('input.scenario-radio[value="s1"]');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('scenario') === 's2');
    check('explorer: arrow keys move between scenario chips', (await page.$eval('input.scenario-radio:checked', (r) => r.value)) === 's2');
    await page.waitForSelector('.insp-details');   // S2 loads lazily after the selection
    check('explorer: engine details start collapsed', !(await page.$eval('.insp-details', (d) => d.open)));
    await page.close();
  }
  {
    const page = await open('1440 methodology', 1440, 1000, { path: '/methodology' });
    const diagrams = await page.$$eval('.diagram svg[role="img"]', (els) => els.map((e) => e.getBoundingClientRect().width));
    check('methodology: three diagrams render', diagrams.length === 3 && diagrams.every((w) => w > 200), diagrams.join(','));
    check('methodology: all 11 section links present', (await page.$$eval('.section-nav-list a', (a) => a.length)) === 11);
    await page.close();
  }
  {
    const page = await open('375 methodology', 375, 812, { path: '/methodology' });
    const widths = await page.$$eval('.diagram svg[role="img"]', (els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
    check('375 methodology: diagrams fit the screen', widths.every((r) => r <= 375), widths.join(','));
    await page.close();
  }
  {
    const page = await open('375 home reduced', 375, 812, { reducedMotion: true, path: '/' });
    await ready(page);
    const opacities = await page.$$eval('.reveal', (els) => els.map((e) => getComputedStyle(e).opacity));
    check('375 home: reduced motion shows every section immediately', opacities.every((o) => o === '1'), opacities.join(','));
    await page.close();
  }

  // ---- 1440 desktop: UI1 Explorer behaviour --------------------------------------------
  {
    const page = await open('1440', 1440, 1000, { path: '/explorer?scenario=s1' });
    await ready(page);
    check('1440: MAF FC brand', (await page.$eval('.brand-mark', (e) => e.textContent)) === 'MAF FC');
    // MAF FC is a text wordmark; since UI3B.2 the only images are the organisers' logos in the header.
    check('1440: no brand logo; the only images are organiser logos', await page.$$eval('img', (els) => els.every((e) => e.classList.contains('organiser-logo') && e.getAttribute('src').startsWith('/organisers/'))));
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

    // Scenario switching: S3 replaces S1 everywhere, from frame 0, paused.
    await page.click('.btn-play');
    await page.click('input[type="radio"][value="s3"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="readout"]')?.textContent.includes('/ 299'));
    check('1440: switching to S3 resets to frame 0 and pauses', (await frameOf(page)) === 0 && (await playLabel(page)) === 'Play');
    check('1440: URL carries the scenario', page.url().includes('scenario=s3'));
    await scrub(page, 150);
    check('1440: S3 shows the untracked ball at frame 150', (await page.$('[data-testid="ball-ghost"]')) !== null && S3.frames[150].ball === null);
    check('1440: S3 Phase 3B chip matches the export', (await page.$eval('.insp-labels .chip', (c) => c.textContent)) === S3.models.phase3b.labels[150]);

    check('1440: dark theme by default', (await bodyBg(page)) === 'rgb(15, 20, 25)');
    await page.screenshot({ path: join(OUT, 'explorer-1440-dark.png'), fullPage: true });
    await page.click('.bar-theme .theme-toggle');
    await wait(400);
    check('1440: theme switch to light', (await bodyBg(page)) === 'rgb(245, 247, 242)');
    await page.screenshot({ path: join(OUT, 'explorer-1440-light.png'), fullPage: true });
    await page.click('.bar-theme .theme-toggle');
    await wait(400);
    check('1440: theme switch back to dark', (await bodyBg(page)) === 'rgb(15, 20, 25)');
    {
      // First visit with an OS light preference still opens dark; an explicit choice persists.
      const context = await browser.createBrowserContext();
      const p = await context.newPage();
      await p.setViewport({ width: 1280, height: 800 });
      await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      await p.goto(BASE + '/', { waitUntil: 'networkidle0' });
      check('first visit with OS light preference opens dark', (await bodyBg(p)) === 'rgb(15, 20, 25)' && (await p.evaluate(() => localStorage.getItem('maf-fc-theme'))) === null);
      await p.click('.bar-theme .theme-toggle');
      await p.reload({ waitUntil: 'networkidle0' });
      check('explicit light choice persists across reload', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'light');
      await context.close();
    }

    // Navigation keeps the scenario, focuses the new heading and supports browser history.
    await page.click('nav[aria-label="Main"] a[href^="/compare"]');
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Compare');
    await ready(page);
    check('1440: navigation keeps the selected scenario', page.url().endsWith('/compare?scenario=s3'));
    check('1440: focus moves to the new page heading', await page.evaluate(() => document.activeElement?.id === 'page-title'));
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Explorer');
    check('1440: browser Back returns to the Explorer', page.url().includes('/explorer'));
    await page.close();
  }

  // ---- 1440 scenario history: genuine browser Back and Forward ------------------------
  {
    const page = await open('1440 history', 1440, 1000, { path: '/explorer?scenario=s1' });
    await ready(page);
    const state = () => page.evaluate(() => ({
      scenario: new URL(location.href).searchParams.get('scenario'),
      checked: document.querySelector('input[type="radio"]:checked')?.value,
      readout: document.querySelector('[data-testid="readout"]')?.textContent ?? '',
    }));
    const settle = (id, last) => page.waitForFunction((i, l) =>
      new URL(location.href).searchParams.get('scenario') === i &&
      document.querySelector('input[type="radio"]:checked')?.value === i &&
      (document.querySelector('[data-testid="readout"]')?.textContent ?? '').includes(`/ ${l}`), {}, id, last);
    const historyLength = () => page.evaluate(() => history.length);
    const start = await historyLength();
    await page.click('input[type="radio"][value="s2"]'); await settle('s2', 299);
    await page.click('input[type="radio"][value="s3"]'); await settle('s3', 299);
    check('history: two selections add two entries', (await historyLength()) === start + 2, `${start} -> ${await historyLength()}`);
    await page.click('input[type="radio"][value="s3"]');
    check('history: choosing the active scenario adds nothing', (await historyLength()) === start + 2);
    await page.goBack(); await settle('s2', 299);
    check('history: Back restores S2', JSON.stringify(await state()).includes('"scenario":"s2"'));
    await page.goBack(); await settle('s1', 399);
    check('history: Back again restores S1', (await state()).checked === 's1');
    await page.goForward(); await settle('s2', 299);
    check('history: Forward restores S2', (await state()).checked === 's2');
    await page.goForward(); await settle('s3', 299);
    check('history: Forward again restores S3, from frame 0', (await state()).checked === 's3' && (await frameOf(page)) === 0);
    await page.close();
  }
  {
    // A fresh tab's history length after one load (about:blank counts too), for comparison.
    const control = await open('1440 control', 1440, 1000, { path: '/explorer?scenario=s1' });
    await ready(control);
    const baseline = await control.evaluate(() => history.length);
    await control.close();
    const page = await open('1440 normalise', 1440, 1000, { path: '/explorer?scenario=s9' });
    await ready(page);
    await page.waitForFunction(() => new URL(location.href).searchParams.get('scenario') === 's1');
    const length = await page.evaluate(() => history.length);
    check('history: an invalid ?scenario= is normalised in place, adding no entry',
      length === baseline && (await page.$eval('input[type="radio"]:checked', (r) => r.value)) === 's1', `${length} vs ${baseline}`);
    await page.close();
  }

  // ---- 1440 Compare interactions ------------------------------------------------------
  {
    const page = await open('1440 compare', 1440, 1000, { path: '/compare?scenario=s4' });
    await ready(page);
    const rows = await page.$$eval('[data-testid="disagreement-table"] tbody tr', (r) => r.length);
    check('1440 compare: disagreement rows listed', rows > 0, `${rows} rows`);
    const target = await page.$eval('[data-testid="disagreement-table"] tbody tr:nth-child(2) td', (td) => Number(td.textContent.split('–')[0]));
    await page.click('[data-testid="disagreement-table"] tbody tr:nth-child(2) button');
    check('1440 compare: Go to seeks the shared playhead', (await frameOf(page)) === target, `frame ${target}`);
    check('1440 compare: the chosen row is marked current', await page.$eval('[data-testid="disagreement-table"] tbody tr:nth-child(2)', (tr) => tr.getAttribute('aria-current') === 'true'));
    await page.select('#' + await page.$eval('.table-controls select', (s) => s.id), 'smooth50');
    const filtered = await page.$$eval('[data-testid="disagreement-table"] tbody tr', (r) => r.length);
    check('1440 compare: filtering changes the list', filtered <= rows, `${filtered} of ${rows}`);
    await page.click('[data-testid="disagreement-table"] tbody tr a');
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Explorer');
    await ready(page);
    check('1440 compare: Open in Explorer lands on the same frame', page.url().includes('frame=') && (await frameOf(page)) === Number(new URL(page.url()).searchParams.get('frame')));
    await page.close();
  }

  // ---- deep link and static-host fallback ---------------------------------------------
  {
    const page = await open('deep link', 1280, 800, { path: '/methodology' });
    check('deep link: /methodology loads directly', (await h1(page)) === 'Methodology');
    // Checked on disk: `vite preview` would answer /404.html with its own fallback anyway.
    const fallback = join(root, 'dist/404.html');
    check('static fallback: dist/404.html exists and equals index.html', existsSync(fallback) &&
      readFileSync(fallback, 'utf8') === readFileSync(join(root, 'dist/index.html'), 'utf8'));
    await page.close();
  }

  // ---- 1280 laptop, saved light preference ------------------------------------------
  {
    const page = await open('1280', 1280, 800, { theme: 'light' });
    await ready(page);
    check('1280: a saved light preference is applied', (await bodyBg(page)) === 'rgb(245, 247, 242)');
    await page.close();
  }

  // ---- 768 tablet: inline navigation --------------------------------------------------
  {
    const page = await open('768', 768, 1024, { path: '/compare?scenario=s2' });
    await ready(page);
    check('768: links shown inline', await visible(page, '#main-nav-list'));
    await page.close();
  }

  // ---- 375 mobile, touch, reduced motion --------------------------------------------
  {
    const page = await open('375', 375, 812, { reducedMotion: true, path: '/explorer?scenario=s1' });
    await ready(page);
    check('375: reduced motion removes transitions', (await page.$eval('.btn', (e) => getComputedStyle(e).transitionDuration)) === '0s');
    check('375: reduced motion removes the page animation', (await page.$eval('.page-enter', (e) => getComputedStyle(e).animationName)) === 'none');
    await wait(400);
    check('375: no autoplay', (await frameOf(page)) === 0 && (await playLabel(page)) === 'Play');

    check('375: menu closed at first', !(await visible(page, '#main-nav-list')));
    await page.click('.menu-button');
    check('375: menu opens', await visible(page, '#main-nav-list'));
    check('375: menu button reports expanded', (await page.$eval('.menu-button', (b) => b.getAttribute('aria-expanded'))) === 'true');
    check('375: first link focused', await page.evaluate(() => document.activeElement?.querySelector('.nav-label')?.textContent === 'Home'));
    check('375: menu shows page descriptions', await visible(page, '.nav-desc'));
    const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme);
    await page.click('.nav-panel-theme .theme-toggle');
    check('375: theme control lives in the menu and works', (await page.evaluate(() => document.documentElement.dataset.theme)) !== themeBefore);
    await page.click('.nav-panel-theme .theme-toggle');
    await page.screenshot({ path: join(OUT, 'mobile-375-menu-open.png') });
    await page.keyboard.press('Escape');
    check('375: Escape closes the menu and returns focus', !(await visible(page, '#main-nav-list')) && await page.evaluate(() => document.activeElement?.classList.contains('menu-button')));
    await page.click('.menu-button');
    await page.click('nav[aria-label="Main"] a[href^="/methodology"]');
    await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Methodology');
    check('375: choosing a link navigates and closes the menu', !(await visible(page, '#main-nav-list')));
    check('375: methodology has no horizontal overflow', (await overflow(page)) === 0);

    await page.goto(`${BASE}/explorer?scenario=s1`, { waitUntil: 'networkidle0' });
    await ready(page);
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
    // Visible header controls only (the desktop theme button is display:none on phones).
    const header = await page.$$eval('.app-bar > .app-bar-actions .btn', (bs) => bs.filter((b) => b.offsetParent !== null).map((b) => Math.round(b.getBoundingClientRect().height)));
    check('375: touch-sized header controls (>= 44 px)', header.every((h) => h >= 44), header.join(','));
    await page.close();
  }
  // ---- Methodology section navigation: no horizontal scrolling at any width -------------
  for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [375, 812]]) {
    for (const theme of ['dark', 'light']) {
      const label = `${width} ${theme} methodology nav`;
      const page = await open(label, width, height, { theme, path: '/methodology' });
      const nav = await page.evaluate(() => {
        const list = document.querySelector('.section-nav-list');
        const select = document.querySelector('.section-nav-select');
        const links = [...document.querySelectorAll('.section-nav-list a')];
        const tops = [...new Set(links.map((a) => Math.round(a.getBoundingClientRect().top)))];
        const shown = (e) => getComputedStyle(e).display !== 'none';
        const navBox = document.querySelector('.section-nav').getBoundingClientRect();
        return { listShown: shown(list), selectShown: shown(select), rows: tops.length, overflow: list.scrollWidth - list.clientWidth,
          clipped: links.some((a) => shown(list) && (a.getBoundingClientRect().right > navBox.right + 1 || a.scrollWidth > a.clientWidth + 1)),
          navHeight: Math.round(navBox.height) };
      });
      check(`${label}: no horizontal scroller or clipped pill`, nav.overflow <= 0 && !nav.clipped, JSON.stringify(nav));
      if (width >= 1200) check(`${label}: two balanced rows`, nav.listShown && nav.rows === 2, JSON.stringify(nav));
      else if (width >= 720) check(`${label}: wrapped pills, no selector`, nav.listShown && !nav.selectShown && nav.rows <= 4, JSON.stringify(nav));
      else check(`${label}: compact section selector instead of pills`, !nav.listShown && nav.selectShown && nav.navHeight <= 90, JSON.stringify(nav));
      if (theme === 'dark' && width === 1440) {
        await page.screenshot({ path: join(OUT, 'methodology-nav-1440.png'), clip: { x: 0, y: 0, width, height: 520 } });
        const current = async () => page.$eval('.section-nav-list a[aria-current="location"]', (a) => a.textContent).catch(() => null);
        check(`${label}: first section highlighted on load`, (await current()) === 'Overview');
        await page.evaluate(() => document.getElementById('h-parameters').scrollIntoView({ block: 'start' }));
        await page.waitForFunction(() => document.querySelector('.section-nav-list a[aria-current="location"]')?.textContent === 'Parameters', { timeout: 3000 }).catch(() => {});
        check(`${label}: highlight follows scrolling`, (await current()) === 'Parameters', String(await current()));
        const headingTop = await page.$eval('#h-parameters', (h) => h.getBoundingClientRect().top);
        const navBottom = await page.$eval('.section-nav', (n) => n.getBoundingClientRect().bottom);
        check(`${label}: a jumped-to heading sits just below the sticky navigation`, headingTop >= navBottom - 1 && headingTop - navBottom <= 48, `${headingTop} vs ${navBottom}`);
        await page.evaluate(() => document.querySelector('.section-nav-list a').blur());
        await page.focus('.section-nav-list a');
        await page.keyboard.press('Tab');
        const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return { inNav: !!document.activeElement.closest('.section-nav'), style: s.outlineStyle, width: s.outlineWidth }; });
        check(`${label}: keyboard focus shows a visible ring`, ring.inNav && ring.style === 'solid' && ring.width === '2px', JSON.stringify(ring));
      }
      if (width === 375 && theme === 'dark') {
        await page.screenshot({ path: join(OUT, 'methodology-nav-375.png'), clip: { x: 0, y: 0, width, height: 600 } });
        await page.select('.section-nav-select select', 'limitations');
        await page.waitForFunction(() => location.hash === '#h-limitations');
        const top = await page.$eval('#h-limitations', (h) => h.getBoundingClientRect().top);
        const navBottom = await page.$eval('.section-nav', (n) => n.getBoundingClientRect().bottom);
        check(`${label}: selector jumps to the section just below the sticky bar`, top >= navBottom - 1 && top - navBottom <= 48, `${top} vs ${navBottom}`);
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

for (const p of passes) console.log(`PASS  ${p}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`\n${passes.length} passed, ${failures.length} failed. Screenshots: ${OUT}`);
process.exit(failures.length ? 1 : 0);
