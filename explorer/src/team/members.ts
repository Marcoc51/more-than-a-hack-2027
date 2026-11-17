/** The four MAF FC team members shown on the Team page, as approved by the project owner.
 *
 * MAF FC has exactly four members. Names and links are the owner-approved ones; no full names,
 * roles, biographies or contact details are added. `photo` is a file in `explorer/public/team/`
 * (a 400 x 500 px WebP portrait); without one, or if it fails to load, the card shows the
 * member's initial instead.
 */

export interface TeamMember {
  name: string;
  /** Neutral label shown under the name (no invented job titles). */
  role: string;
  /** Path relative to the site base, for example 'team/marc.webp'. */
  photo?: string;
  linkedin?: string;
  github?: string;
}

const ROLE = 'Team member';

export const TEAM_MEMBERS: readonly TeamMember[] = [
  { name: 'Marc', role: ROLE, photo: 'team/marc.webp', linkedin: 'https://www.linkedin.com/in/marc-sanad/', github: 'https://github.com/Marcoc51' },
  { name: 'Fahmy', role: ROLE, photo: 'team/fahmy.webp', linkedin: 'https://www.linkedin.com/in/mohamed-atef-fahmy-khalil/', github: 'https://github.com/Muhammadatef' },
  { name: 'Faris', role: ROLE, photo: 'team/faris.webp', linkedin: 'https://www.linkedin.com/in/faris-ali-352077201/', github: 'https://github.com/farisali21' },
  { name: 'Eslam', role: ROLE, photo: 'team/eslam.webp', linkedin: 'https://www.linkedin.com/in/eslamkhafagy505/', github: 'https://github.com/eslamkhafagy505' },
];
