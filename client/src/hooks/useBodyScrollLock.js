import { useEffect } from 'react';

/**
 * Locks body scroll when a modal/overlay is open so the background does not scroll.
 * @param {boolean} locked - When true, body overflow is hidden; when false, restored.
 */
export function useBodyScrollLock(locked) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}
