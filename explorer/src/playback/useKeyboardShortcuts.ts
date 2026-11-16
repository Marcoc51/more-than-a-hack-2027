import { useEffect } from 'react';
import { usePlaybackDispatch } from './PlaybackProvider';

/** True when the focused element already owns this key, so a shortcut must not fire. */
export function ownsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    // Text-like inputs own everything; a range input owns the arrows; checkboxes etc. own Space.
    if (type === 'range') return key.startsWith('Arrow');
    if (['checkbox', 'radio', 'button', 'submit', 'reset'].includes(type)) return key === ' ';
    return true;
  }
  const role = target.getAttribute('role');
  if (role === 'slider') return key.startsWith('Arrow');
  if (role === 'radio' || role === 'tab' || role === 'listbox' || role === 'option') {
    return key.startsWith('Arrow') || key === ' ';
  }
  // Buttons and links activate on Space themselves.
  if (tag === 'BUTTON' || tag === 'A' || role === 'button') return key === ' ';
  return false;
}

/** Space toggles playback; arrows step one frame; Shift + arrows step ten. */
export function useKeyboardShortcuts(): void {
  const dispatch = usePlaybackDispatch();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== ' ' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (ownsKey(e.target, e.key)) return;
      e.preventDefault();
      if (e.key === ' ') dispatch({ type: 'toggle' });
      else dispatch({ type: 'step', delta: (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 10 : 1) });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch]);
}
