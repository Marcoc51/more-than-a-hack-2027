import type { LucideIcon } from 'lucide-react';

/** A decorative line icon (lucide-react, ISC): 16 or 20 px, 1.75 px stroke, hidden from assistive
 *  technology. Icons always sit next to visible text, which carries the meaning. */
export function Icon({ icon: Glyph, size = 16, className }: { icon: LucideIcon; size?: 16 | 20; className?: string }) {
  return <Glyph size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" className={className ? `icon ${className}` : 'icon'} />;
}
