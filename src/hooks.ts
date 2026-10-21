import { useEffect, useState } from 'react';
import type { MotionPref, Speed } from './storage/store';

/** Multiplier applied to animation durations. */
export const SPEED_FACTOR: Record<Speed, number> = { slow: 1.8, normal: 1, fast: 0.5 };

const QUERY = '(prefers-reduced-motion: reduce)';

/** True when animations should be skipped: the student chose "reduce motion", or their device asks for it. */
export function useReducedMotion(pref: MotionPref): boolean {
  const [system, setSystem] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(QUERY);
    const onChange = (): void => setSystem(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return pref === 'reduced' ? true : pref === 'full' ? false : system;
}
