'use client';
import { useRef, useState, type ReactNode } from 'react';

/**
 * Home emblem that tilts toward the pointer (or finger) with a moving glare,
 * floats gently, and spins its star when tapped. Purely decorative.
 */
export function TiltEmblem({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [spin, setSpin] = useState(0);
  const move = (x: number, y: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = Math.max(0, Math.min(1, (x - r.left) / r.width));
    const py = Math.max(0, Math.min(1, (y - r.top) / r.height));
    el.style.setProperty('--tilt-y', `${(px - 0.5) * 26}deg`);
    el.style.setProperty('--tilt-x', `${(0.5 - py) * 26}deg`);
    el.style.setProperty('--glare-x', `${px * 100}%`);
    el.style.setProperty('--glare-y', `${py * 100}%`);
  };
  const reset = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--tilt-x', '0deg');
    el.style.setProperty('--tilt-y', '0deg');
  };
  return (
    <div className="float mx-auto w-fit">
      <div
        ref={ref}
        className={`tilt relative cursor-pointer select-none ${className}`}
        onPointerMove={(e) => move(e.clientX, e.clientY)}
        onPointerLeave={reset}
        onPointerUp={reset}
        onClick={() => setSpin((n) => n + 1)}
        aria-hidden="true"
      >
        <div key={spin} className={spin ? 'star-spin' : undefined}>
          {children}
        </div>
        <span className="tilt-glare" />
      </div>
    </div>
  );
}
