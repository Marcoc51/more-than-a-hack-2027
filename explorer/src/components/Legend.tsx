import { LABELS } from '../scenario/labels';
import type { Label } from '../scenario/types';

export function LabelChip({ label, title }: { label: Label; title?: string }) {
  return (
    <span className={`chip chip-${label}`} title={title ?? LABELS[label].name} aria-label={title ?? LABELS[label].name}>
      {label}
    </span>
  );
}

export function Legend({ variant = 'explorer' }: { variant?: 'explorer' | 'compare' }) {
  return (
    <div className="legend" role="group" aria-label="Legend">
      <ul className="legend-list">
        {(Object.keys(LABELS) as Label[]).map((l) => (
          <li key={l}><LabelChip label={l} /> <span>{LABELS[l].name}</span></li>
        ))}
      </ul>
      {variant === 'explorer' ? (
        <ul className="legend-list legend-secondary">
          <li><span className="legend-swatch seg-ev-home" aria-hidden="true" /> Home control</li>
          <li><span className="legend-swatch seg-ev-away" aria-hidden="true" /> Away control</li>
          <li><span className="legend-swatch seg-ev-none" aria-hidden="true" /> No credible control</li>
          <li><span className="legend-swatch seg-ball-no" aria-hidden="true" /> Ball not tracked</li>
        </ul>
      ) : (
        <ul className="legend-list legend-secondary">
          <li><span className="legend-swatch seg-diff-agree" aria-hidden="true" /> Agrees with the reference</li>
          <li><span className="legend-swatch seg-diff-differ" aria-hidden="true" /> Differs from the reference</li>
          <li><span className="legend-swatch seg-diff-ungraded" aria-hidden="true" /> Not graded (reference X)</li>
        </ul>
      )}
    </div>
  );
}
