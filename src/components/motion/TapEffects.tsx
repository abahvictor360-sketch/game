'use client';
import { useEffect } from 'react';

/**
 * Adds a ripple where the player taps a button, an answer or a lifeline.
 * One document listener for the whole app; skipped for reduced motion.
 */
export function TapEffects() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onDown = (e: PointerEvent) => {
      if (reduce.matches || e.button > 0) return;
      const target = e.target as HTMLElement | null;
      const host = target?.closest<HTMLElement>('.answer .hex-inner, .lifeline, .btn');
      if (!host || host.closest(':disabled') || (host as HTMLButtonElement).disabled) return;
      const rect = host.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      const dot = document.createElement('span');
      dot.className = 'tap-ripple';
      dot.style.width = dot.style.height = `${size}px`;
      dot.style.left = `${e.clientX - rect.left}px`;
      dot.style.top = `${e.clientY - rect.top}px`;
      host.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove(), { once: true });
      setTimeout(() => dot.remove(), 1000);
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  return null;
}
