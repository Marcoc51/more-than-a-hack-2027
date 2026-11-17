/** One in-memory local data source shared by the local Explorer and Compare pages.
 *
 *  Sources, in order of preference:
 *   1. the export registered first in .local-explorer/explorer-config.json, fetched from the
 *      loopback-only development loader (scripts/local-export-server.mjs);
 *   2. a file the user opens with the browser file picker (memory only; gone on reload).
 *  Nothing is uploaded or persisted except the chosen registered file NAME (never data), so the
 *  next session reopens the same registered export. There is no synthetic fallback: without a
 *  configured export the pages show setup instructions. */
import { useSyncExternalStore } from 'react';
import { LOCAL_MAX_BYTES, parseLocalScenario, readLocalFile, type LocalScenario } from './validate';

export const LOCAL_ENDPOINT = '/__local-explorer/';
const CHOICE_KEY = 'maf-fc-local-export';

export interface RegisteredExport {
  index: number;
  name: string;
  bytes: number | null;
  available: boolean;
}

export type Manifest =
  | { status: 'checking' }
  | { status: 'unavailable'; message: string }
  | { status: 'ready'; configured: boolean; problem: string | null; exports: RegisteredExport[] };

export type Source = { kind: 'registered'; index: number; name: string } | { kind: 'file'; name: string };

export interface LocalState {
  manifest: Manifest;
  loaded: { scenario: LocalScenario; source: Source; serial: number } | null;
  busy: boolean;
  error: string;
}

const initial: LocalState = { manifest: { status: 'checking' }, loaded: null, busy: false, error: '' };
let state: LocalState = initial;
let started = false;
let request = 0;
const listeners = new Set<() => void>();

function set(patch: Partial<LocalState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function remember(name: string | null) {
  try {
    if (name) window.localStorage.setItem(CHOICE_KEY, name); else window.localStorage.removeItem(CHOICE_KEY);
  } catch { /* storage unavailable: the configured default is used next time */ }
}

function remembered(): string | null {
  try { return window.localStorage.getItem(CHOICE_KEY); } catch { return null; }
}

async function getJson(path: string, maxBytes: number): Promise<unknown> {
  const response = await fetch(LOCAL_ENDPOINT + path, { cache: 'no-store', credentials: 'same-origin' });
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new Error('The local export loader is not running. Start the viewer with npm run dev:local.');
  const body = await response.text();
  if (body.length > maxBytes) throw new Error('The registered export exceeds the 16 MiB local export limit.');
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new Error('The registered export is not valid JSON.'); }
  if (!response.ok) {
    const message = parsed && typeof parsed === 'object' && 'error' in parsed ? String((parsed as { error: unknown }).error).slice(0, 200) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return parsed;
}

function parseManifest(raw: unknown): Manifest {
  const o = raw as { configured?: unknown; problem?: unknown; exports?: unknown };
  if (!o || typeof o !== 'object' || !Array.isArray(o.exports)) return { status: 'unavailable', message: 'The local export loader returned an unexpected manifest.' };
  const exports = o.exports.slice(0, 64).flatMap((e): RegisteredExport[] => {
    const x = e as Partial<RegisteredExport>;
    return typeof x.index === 'number' && typeof x.name === 'string'
      ? [{ index: x.index, name: x.name.slice(0, 100), bytes: typeof x.bytes === 'number' ? x.bytes : null, available: x.available === true }]
      : [];
  });
  return { status: 'ready', configured: o.configured === true && exports.length > 0, problem: typeof o.problem === 'string' ? o.problem.slice(0, 300) : null, exports };
}

/** Load a registered export by its index in the configuration. */
export async function openRegistered(entry: RegisteredExport): Promise<void> {
  const serial = ++request;
  set({ busy: true, error: '', loaded: null });
  try {
    const scenario = parseLocalScenario(await getJson(`export/${entry.index}`, LOCAL_MAX_BYTES));
    if (serial !== request) return;
    remember(entry.name);
    set({ busy: false, loaded: { scenario, source: { kind: 'registered', index: entry.index, name: entry.name }, serial } });
  } catch (e) {
    if (serial === request) set({ busy: false, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Load a user-selected file into memory only. */
export async function openFile(file: File): Promise<void> {
  const serial = ++request;
  set({ busy: true, error: '', loaded: null });
  try {
    const scenario = await readLocalFile(file);
    if (serial === request) set({ busy: false, loaded: { scenario, source: { kind: 'file', name: file.name }, serial } });
  } catch (e) {
    if (serial === request) set({ busy: false, error: e instanceof Error ? e.message : String(e) });
  }
}

export function clearLocal(): void {
  ++request;
  set({ loaded: null, busy: false, error: '' });
}

/** Read the manifest once per page load and open the remembered (or first) registered export. */
export async function startLocal(): Promise<void> {
  if (started) return;
  started = true;
  let manifest: Manifest;
  try {
    manifest = parseManifest(await getJson('manifest', 1024 * 1024));
  } catch (e) {
    manifest = { status: 'unavailable', message: e instanceof Error ? e.message : String(e) };
  }
  set({ manifest });
  if (manifest.status !== 'ready' || !manifest.configured || state.loaded || state.busy) return;
  const usable = manifest.exports.filter((e) => e.available);
  const choice = usable.find((e) => e.name === remembered()) ?? usable[0];
  if (choice) await openRegistered(choice);
  else set({ error: 'No registered export is available. Re-run the exporter with --register.' });
}

export function useLocalState(): LocalState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

/** Tests only: forget everything this module holds. */
export function resetLocalStore(): void {
  state = initial;
  started = false;
  request = 0;
  listeners.forEach((l) => l());
}
