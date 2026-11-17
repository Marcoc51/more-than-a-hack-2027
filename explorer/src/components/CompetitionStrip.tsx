import { Flag } from 'lucide-react';
import { Icon } from './Icon';
import { OrganiserLogos } from './Organisers';

/** Competition context, as stated in the organisers' official repository
 *  (github.com/metrica-sports/more-than-a-hack-2027, README and OVERVIEW at commit f8f2629):
 *  organised by Metrica Sports, FC Barcelona (through the Barça Innovation Hub) and the Mobile
 *  World Capital Barcelona, at the Talent Arena in Barcelona. The logos identify the organisers;
 *  the note says plainly that they do not endorse MAF FC. */
export function CompetitionStrip() {
  return (
    <section className="competition-strip" aria-labelledby="competition-heading">
      <div className="competition-head">
        <span className="competition-icon" aria-hidden="true"><Icon icon={Flag} size={20} /></span>
        <div className="competition-text">
          <h2 id="competition-heading" className="competition-title">Built for More than a Hack 2027</h2>
          <p>
            The Initial Challenge. Organised by Metrica Sports, FC Barcelona through the Barça Innovation Hub,
            and the Mobile World Capital Barcelona, at the Talent Arena, Barcelona.
          </p>
        </div>
        <a className="competition-link" href="https://github.com/metrica-sports/more-than-a-hack-2027" rel="noreferrer">Official challenge repository</a>
      </div>
      <OrganiserLogos className="organiser-logos" />
      <p className="competition-note">MAF FC is a participating team. The logos identify the competition organisers and do not imply their endorsement of this project.</p>
    </section>
  );
}
