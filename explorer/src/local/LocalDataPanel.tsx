import { useEffect, useId } from 'react';
import { matchClock } from './metrics';
import { clearLocal, openFile, openRegistered, startLocal, useLocalState, type Manifest } from './store';

const EXPORT_COMMAND = String.raw`python tools/export_local_scenario.py ` +
  String.raw`--metadata "C:\authorized\tactical\BAR-ATH_tactical_atd.xml" ` +
  String.raw`--tracking "C:\authorized\tactical\BAR-ATH_tactical_atd.txt" ` +
  String.raw`--predictions "outputs\submission\MAF FC.csv" ` +
  String.raw`--baseline-predictions "outputs\baseline_smooth50.csv" ` +
  String.raw`--start-frame 11185 --frame-count 7500 --out .local-explorer\first-half-000.json --register`;

function SetupInstructions({ manifest }: { manifest: Manifest }) {
  const reason = manifest.status === 'unavailable' ? manifest.message
    : manifest.status === 'ready' && manifest.problem ? manifest.problem
      : 'No local export is registered yet.';
  return (
    <div className="local-setup" data-testid="local-setup">
      <p><strong>No authorized match data is loaded.</strong> {reason} This viewer never substitutes synthetic data here.</p>
      <ol className="local-setup-steps">
        <li>Keep the organisers&apos; files and your existing prediction CSVs outside Git, as they are today.</li>
        <li>Optionally write the smooth50 comparison from the repository root: <code>python src/baseline.py --out outputs\baseline_smooth50.csv</code>.</li>
        <li>From the repository root, export a window of at most 7,500 frames and register it as the default:
          <pre className="code-block"><code>{EXPORT_COMMAND}</code></pre>
        </li>
        <li>Reload this page. The first registered export opens automatically; register more windows to switch between them.</li>
      </ol>
      <p className="muted">Exports stay in the Git-ignored <code>.local-explorer/</code> folder and are served only to this computer by <code>npm run dev:local</code>. You can also open an export file directly below.</p>
    </div>
  );
}

/** Data source controls shared by the local Explorer and Compare pages. */
export function LocalDataPanel() {
  const { manifest, loaded, busy, error } = useLocalState();
  const selectId = useId();
  useEffect(() => { void startLocal(); }, []);
  const registered = manifest.status === 'ready' && manifest.configured ? manifest.exports : [];
  const scenario = loaded?.scenario;
  const last = scenario ? scenario.sourceFrameStart + scenario.frameCount - 1 : 0;
  return (
    <section className="card local-source" aria-label="Local data source">
      <p className="eyebrow">Authorized local data · this computer only · never deploy</p>
      {manifest.status === 'checking' && <p role="status">Looking for registered local exports…</p>}
      {registered.length > 0 && (
        <div className="local-select">
          <label htmlFor={selectId}>Registered export</label>
          <select id={selectId} className="select" disabled={busy}
            value={loaded?.source.kind === 'registered' ? String(loaded.source.index) : ''}
            onChange={(e) => { const entry = registered.find((r) => String(r.index) === e.currentTarget.value); if (entry) void openRegistered(entry); }}>
            {loaded?.source.kind !== 'registered' && <option value="">Choose a registered export</option>}
            {registered.map((r) => <option key={r.index} value={String(r.index)} disabled={!r.available}>{r.name}{r.available ? '' : ' (missing or invalid)'}</option>)}
          </select>
        </div>
      )}
      {manifest.status !== 'checking' && registered.length === 0 && !loaded && <SetupInstructions manifest={manifest} />}
      {busy && <p role="status">Checking local export…</p>}
      {error && <p role="alert">Could not load export: {error}</p>}
      {scenario && loaded && (
        <p data-testid="local-source">
          Data source: {loaded.source.kind === 'registered' ? 'registered export' : 'local file'} <strong>{loaded.source.name}</strong> · {scenario.frameCount} frames ·
          source {scenario.sourceFrameStart}–{last} ({matchClock(scenario.sourceFrameStart, scenario.fps)}–{matchClock(last, scenario.fps)} video time) ·
          {' '}{scenario.baseline ? `${scenario.predictions.name} and ${scenario.baseline.name}` : `${scenario.predictions.name} only (no smooth50 in this export)`}
        </p>
      )}
      <div className="local-actions">
        <label className="local-file-control">Open an export file <input aria-label="Open local export" type="file" accept=".json,application/json" disabled={busy}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void openFile(file);
          }} /></label>
        {loaded && <button className="btn btn-outline" type="button" onClick={clearLocal}>Clear local data</button>}
      </div>
    </section>
  );
}
