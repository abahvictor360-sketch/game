'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from its previous value (or `from`) to `value`, with an
 * optional gold "bump" when it changes. Instant for reduced motion.
 */
export function CountUp({ value, from, durationMs = 700, className, bump = false }: { value: number; from?: number; durationMs?: number; className?: string; bump?: boolean }) {
  const [shown, setShown] = useState(from ?? value);
  const last = useRef(from ?? value);
  const initial = useRef(value);
  useEffect(() => {
    const start = last.current;
    last.current = value;
    if (start === value) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  return (
    <span className={className}>
      <span className="sr-only">{value}</span>
      <span key={value} aria-hidden="true" className={bump && value !== initial.current ? 'anim-bump' : undefined}>
        {shown}
      </span>
    </span>
  );
}
