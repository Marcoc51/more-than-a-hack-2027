import { Link } from 'react-router';
import { ROUTES, useDocumentTitle } from '../app/routing';
import { PageHeading } from '../components/PageHeading';

export function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="page">
      <PageHeading title="Page not found">This address is not part of the MAF FC Possession Explorer.</PageHeading>
      <ul className="link-list">
        {ROUTES.map((r) => <li key={r.path}><Link to={r.path}>{r.label}</Link></li>)}
      </ul>
    </div>
  );
}
