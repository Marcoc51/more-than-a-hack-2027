import { LABELS } from '../scenario/labels';
import type { Label } from '../scenario/types';

export function LabelChip({ label, title }: { label: Label; title?: string }) {
  return (
    <span className={`chip chip-${label}`} title={title ?? LABELS[label].name} aria-label={title ?? LABELS[label].name}>
      {label}
    </span>
  );
}

export function Legend() {
  return (
    <div className="legend" aria-label="Legend">
      <ul className="legend-list">
        {(Object.keys(LABELS) as Label[]).map((l) => (
          <li key={l}><LabelChip label={l} /> <span>{LABELS[l].name}</span></li>
        ))}
      </ul>
      <ul className="legend-list legend-secondary">
        <li><span className="legend-swatch seg-ev-home" aria-hidden="true" /> Home control</li>
        <li><span className="legend-swatch seg-ev-away" aria-hidden="true" /> Away control</li>
        <li><span className="legend-swatch seg-ev-none" aria-hidden="true" /> No credible control</li>
        <li><span className="legend-swatch seg-ball-no" aria-hidden="true" /> Ball not tracked</li>
      </ul>
    </div>
  );
}
