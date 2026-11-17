import { useState } from 'react';
import { ExternalLink, GitBranch } from 'lucide-react';
import { Link } from 'react-router';
import { assetUrl } from '../app/assets';
import { useDocumentTitle } from '../app/routing';
import { CompetitionStrip } from '../components/CompetitionStrip';
import { Icon } from '../components/Icon';
import { PageHeading } from '../components/PageHeading';
import { TEAM_MEMBERS, type TeamMember } from '../team/members';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

/** The member's portrait, or their initial when there is no photo or it fails to load. */
function Portrait({ member }: { member: TeamMember }) {
  const [failed, setFailed] = useState(false);
  if (!member.photo || failed) {
    return <span className="member-portrait member-initials" aria-hidden="true" data-testid="member-fallback">{initials(member.name)}</span>;
  }
  return (
    <img
      className="member-portrait member-photo"
      src={assetUrl(member.photo)}
      alt={`Portrait of ${member.name}`}
      width={400}
      height={500}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function MemberCard({ member }: { member: TeamMember }) {
  return (
    <li className="card member-card">
      <Portrait member={member} />
      <div className="member-body">
        <h2 className="member-name">{member.name}</h2>
        <p className="member-role">{member.role}</p>
        {(member.linkedin || member.github) && (
          <p className="member-links">
            {member.linkedin && <a className="btn btn-outline btn-sm" href={member.linkedin} rel="noreferrer">LinkedIn <Icon icon={ExternalLink} /><span className="sr-only"> profile of {member.name}</span></a>}
            {member.github && <a className="btn btn-outline btn-sm" href={member.github} rel="noreferrer">GitHub <Icon icon={ExternalLink} /><span className="sr-only"> profile of {member.name}</span></a>}
          </p>
        )}
      </div>
    </li>
  );
}

/** Team page: the four MAF FC members from src/team/members.ts. */
export function TeamPage({ members = TEAM_MEMBERS }: { members?: readonly TeamMember[] }) {
  useDocumentTitle('Team');
  return (
    <div className="page team-page">
      <PageHeading title="Team">
        MAF FC is a team of four taking part in The Initial Challenge of More than a Hack 2027. Together we
        built the possession engine, its synthetic test scenarios and this Explorer.
      </PageHeading>
      <ul className="member-grid" aria-label="Team members">
        {members.map((m) => <MemberCard key={m.name} member={m} />)}
      </ul>
      <p className="team-links">
        <a className="btn btn-outline btn-sm" href="https://github.com/Marcoc51/more-than-a-hack-2027" rel="noreferrer"><Icon icon={GitBranch} /> Project repository</a>
        <Link className="btn btn-outline btn-sm" to="/methodology">How the engine works</Link>
      </p>
      <CompetitionStrip />
    </div>
  );
}
