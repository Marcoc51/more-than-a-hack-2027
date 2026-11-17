import { useId } from 'react';

/** Explanatory SVG diagrams for the Methodology page. Colours come from CSS classes (theme-aware);
 *  each diagram has a title and a text description that states the rule it illustrates. */

function Figure({ title, desc, viewBox, children, caption }: { title: string; desc: string; viewBox: string; children: React.ReactNode; caption: string }) {
  const id = useId();
  return (
    <figure className="diagram">
      <svg viewBox={viewBox} role="img" aria-labelledby={`${id}-t ${id}-d`} className="diagram-svg">
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{desc}</desc>
        {children}
      </svg>
      <figcaption className="diagram-caption">{caption}</figcaption>
    </figure>
  );
}

export function ControlDiagram() {
  return (
    <Figure
      title="Credible control: radius and margin"
      desc="The ball sits at the centre of a 2.0 metre circle. The nearest home player is inside the circle. The nearest away player is outside it and at least 1.0 metre further from the ball than the home player, so home has credible control in this frame."
      viewBox="0 0 320 170"
      caption="Home is within 2.0 m and the nearest away player is at least 1.0 m further away: credible home control."
    >
      <circle className="dg-zone" cx="118" cy="85" r="60" />
      <line className="dg-home-line" x1="118" y1="85" x2="152" y2="68" />
      <line className="dg-away-line" x1="118" y1="85" x2="270" y2="110" />
      <circle className="dg-ball" cx="118" cy="85" r="5" />
      <circle className="dg-home" cx="152" cy="68" r="9" />
      <circle className="dg-away" cx="270" cy="110" r="9" />
      <text className="dg-text" x="164" y="58">home</text>
      <text className="dg-text" x="252" y="134">away</text>
      <text className="dg-text dg-strong" x="62" y="162">2.0 m radius</text>
      <text className="dg-text" x="176" y="96">≥ 1.0 m further</text>
    </Figure>
  );
}

export function SwitchDiagram() {
  const dots = Array.from({ length: 10 }, (_, i) => 132 + i * 17);
  return (
    <Figure
      title="Changing possession: ten observations, backdated"
      desc="Home is in possession. Away then has credible control in ten observations with no contradicting tracked frame. At the tenth observation the change is confirmed, and the away possession is backdated to the first of the ten observations."
      viewBox="0 0 320 130"
      caption="Ten away control observations confirm the change; it is placed at the first of them."
    >
      <text className="dg-text" x="16" y="18">home possession</text>
      <text className="dg-text" x="200" y="18">away (backdated)</text>
      <rect className="dg-home" x="16" y="26" width="110" height="22" rx="4" />
      <rect className="dg-away" x="126" y="26" width="178" height="22" rx="4" />
      {dots.map((x, i) => <circle key={x} className={i === 9 ? 'dg-away dg-confirm' : 'dg-away'} cx={x} cy="74" r="5.5" />)}
      <path className="dg-arrow" d="M285 88 C 250 118, 160 118, 130 54" />
      <path className="dg-arrowhead" d="M126 50 l9 2 -5 7 z" />
      <text className="dg-text" x="132" y="96">1</text>
      <text className="dg-text dg-strong" x="200" y="124">10th observation confirms</text>
    </Figure>
  );
}

export function RestartDiagram() {
  return (
    <Figure
      title="Dead ball and restart inside a set-piece tag"
      desc="A Smart Tagging set-piece window is shown. The ball is still for at least five tracked frames, which are labelled dead ball. The first tracked frame at four metres per second or faster is the strike; the restart starts there, with the tagged team or, if unknown, the first team to establish control."
      viewBox="0 0 320 130"
      caption="Within the tag window, the frames before the strike are dead; the strike (≥ 4 m/s after ≥ 5 slower frames) starts the restart."
    >
      <text className="dg-text" x="18" y="22">set-piece tag window</text>
      <rect className="dg-window" x="16" y="30" width="288" height="34" rx="6" />
      <rect className="dg-dead" x="20" y="36" width="156" height="22" rx="3" />
      <rect className="dg-away" x="176" y="36" width="124" height="22" rx="3" />
      <line className="dg-strike" x1="176" y1="26" x2="176" y2="74" />
      <text className="dg-text" x="28" y="90">≥ 5 slower tracked frames · D</text>
      <text className="dg-text dg-strong" x="186" y="90">strike ≥ 4 m/s</text>
      <text className="dg-text" x="186" y="108">restart: tagged team,</text>
      <text className="dg-text" x="186" y="122">or first to establish control</text>
    </Figure>
  );
}
