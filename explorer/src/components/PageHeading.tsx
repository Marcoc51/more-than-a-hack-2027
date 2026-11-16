import type { ReactNode } from 'react';

/** Page title (focus target after route changes) with an optional lead and synthetic badge. */
export function PageHeading({ title, synthetic = false, children }: { title: string; synthetic?: boolean; children?: ReactNode }) {
  return (
    <div className="page-heading">
      <div className="page-title-row">
        <h1 id="page-title" className="page-title" tabIndex={-1}>{title}</h1>
        {synthetic && (
          <span className="badge badge-synthetic" title="Every frame shown here is synthetic. No competition data is used.">Synthetic data</span>
        )}
      </div>
      {children && <p className="page-lead">{children}</p>}
    </div>
  );
}
