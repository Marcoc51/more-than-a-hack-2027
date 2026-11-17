import { useEffect, useRef, useState, type ReactNode } from 'react';

/** A section that fades and rises in once when it first scrolls into view (Home only).
 *  Without IntersectionObserver, or after a short fallback delay, it simply shows; CSS removes
 *  the effect entirely under prefers-reduced-motion. Content is always in the DOM. */
export function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (shown || !ref.current) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setShown(true);
    }, { rootMargin: '0px 0px -10% 0px' });
    observer.observe(ref.current);
    const fallback = window.setTimeout(() => setShown(true), 1500);
    return () => { observer.disconnect(); window.clearTimeout(fallback); };
  }, [shown]);
  return <div ref={ref} className={`reveal${shown ? ' is-revealed' : ''} ${className}`}>{children}</div>;
}
