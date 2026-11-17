// Development-only loader for owner-authorized local exports (`npm run dev:local`).
//
// Registered by vite.config.ts only in the `local-explorer` serve mode; production builds of
// that mode are refused, and public builds never include this plugin. It answers exactly two
// read-only routes under ENDPOINT and nothing else:
//   manifest     the file names listed in .local-explorer/explorer-config.json (first = default)
//   export/<n>   the n-th listed export, by index, so no path from the URL reaches the filesystem
// Requests must come from the loopback interface with a loopback Host header (DNS-rebinding
// guard) and, when the browser sends them, a same-origin Origin / Sec-Fetch-Site. Files must be
// plain, non-symlinked *.json files directly inside the export directory, at most 16 MiB.
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENDPOINT = '/__local-explorer/';
export const CONFIG_NAME = 'explorer-config.json';
export const CONFIG_SCHEMA = 'local-explorer-config-1';
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.json$/;
const MAX_EXPORT_BYTES = 16 * 1024 * 1024;
const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_EXPORTS = 64;
const LOOPBACK_PEERS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** The repository's ignored .local-explorer/, or, for automated tests only, a fresh
 *  possession-local-* directory directly under the OS temporary directory. */
export function exportDirectory(repositoryRoot, env = process.env) {
  const test = env.LOCAL_EXPLORER_TEST_DIR;
  if (!test) return resolve(repositoryRoot, '.local-explorer');
  const directory = resolve(test);
  if (dirname(directory) !== resolve(tmpdir()) || !basename(directory).startsWith('possession-local-')) {
    throw new Error('LOCAL_EXPLORER_TEST_DIR must be a possession-local-* directory directly under the OS temporary directory.');
  }
  return directory;
}

const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);

/** A listed export as a plain regular file directly inside `directory`, or null. */
function regularFile(directory, name, maxBytes) {
  if (!NAME.test(name)) return null;
  const full = join(directory, name);
  try {
    const stat = lstatSync(full);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) return null;
    if (!same(realpathSync(full), join(realpathSync(directory), name))) return null;
    return { full, bytes: stat.size };
  } catch {
    return null;
  }
}

/** Parsed configuration. Never throws; problems are reported without file contents. */
export function readConfig(directory) {
  const config = regularFile(directory, CONFIG_NAME, MAX_CONFIG_BYTES);
  if (!config) {
    let exists = false;
    try { lstatSync(join(directory, CONFIG_NAME)); exists = true; } catch { /* not configured */ }
    return { configured: false, exports: [], problem: exists ? `${CONFIG_NAME} is not a plain file of at most 64 KiB.` : null };
  }
  let parsed;
  try { parsed = JSON.parse(readFileSync(config.full, 'utf8')); } catch { return { configured: false, exports: [], problem: `${CONFIG_NAME} is not valid JSON.` }; }
  if (!parsed || parsed.schema !== CONFIG_SCHEMA || !Array.isArray(parsed.exports) || parsed.exports.length > MAX_EXPORTS
    || !parsed.exports.every((n) => typeof n === 'string' && NAME.test(n) && n !== CONFIG_NAME)) {
    return { configured: false, exports: [], problem: `${CONFIG_NAME} must be {"schema": "${CONFIG_SCHEMA}", "exports": ["<file>.json", ...]}.` };
  }
  const names = [...new Set(parsed.exports)];
  const exports = names.map((name, index) => {
    const file = regularFile(directory, name, MAX_EXPORT_BYTES);
    return { index, name, bytes: file?.bytes ?? null, available: file !== null };
  });
  return { configured: names.length > 0, exports, problem: names.length ? null : `${CONFIG_NAME} lists no exports.` };
}

function hostName(header) {
  if (typeof header !== 'string') return null;
  const match = /^(\[[^\]]+\]|[^:]+)(?::(\d{1,5}))?$/.exec(header.trim().toLowerCase());
  return match ? { name: match[1], port: match[2] ?? '' } : null;
}

/** Why a request is refused, or null when it is an allowed loopback same-origin read. */
export function refusal(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return [405, 'Only GET is supported.'];
  if (!LOOPBACK_PEERS.has(req.socket?.remoteAddress ?? '')) return [403, 'Loopback clients only.'];
  const host = hostName(req.headers.host);
  if (!host || !LOOPBACK_HOSTS.has(host.name)) return [403, 'Loopback Host header required.'];
  const origin = req.headers.origin;
  if (origin !== undefined) {
    const allowed = ['http://127.0.0.1', 'http://localhost', 'http://[::1]'].map((o) => (host.port ? `${o}:${host.port}` : o));
    if (!allowed.includes(String(origin).toLowerCase())) return [403, 'Cross-origin requests are refused.'];
  }
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return [403, 'Cross-site requests are refused.'];
  return null;
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.end(body);
}

export function createHandler(directory) {
  return (req, res, next) => {
    let path;
    try { path = new URL(req.url ?? '/', 'http://local.invalid').pathname; } catch { return next(); }
    if (!path.startsWith(ENDPOINT)) return next();
    const refused = refusal(req);
    if (refused) return send(res, refused[0], JSON.stringify({ error: refused[1] }));
    const route = path.slice(ENDPOINT.length);
    const config = readConfig(directory);
    if (route === 'manifest') {
      return send(res, 200, JSON.stringify({ configured: config.configured, problem: config.problem, exports: config.exports }));
    }
    const match = /^export\/(\d{1,2})$/.exec(route);
    const entry = match ? config.exports[Number(match[1])] : undefined;
    if (!entry) return send(res, 404, JSON.stringify({ error: 'No such registered export.' }));
    const file = regularFile(directory, entry.name, MAX_EXPORT_BYTES);
    if (!file) return send(res, 404, JSON.stringify({ error: 'The registered export is missing, too large or not a plain file.' }));
    return send(res, 200, readFileSync(file.full));
  };
}

/** Vite plugin: serve-only; vite.config.ts adds it in local-explorer mode only. */
export function localExportServer(repositoryRoot = fileURLToPath(new URL('../../', import.meta.url))) {
  const directory = exportDirectory(repositoryRoot);
  return {
    name: 'local-export-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createHandler(directory));
    },
  };
}
