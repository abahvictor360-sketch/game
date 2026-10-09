'use client';
import { useRef, type ReactNode } from 'react';

/**
 * Home hero with bold brush-stroke squiggles behind it (red, green, cyan,
 * gold), in the spirit of African textile and mural painting. The strokes
 * draw themselves in on load and drift gently with the pointer or finger.
 */
const STROKES: { d: string; color: string; delay: number }[] = [
  { d: 'M-10 60 C 40 10, 80 110, 130 60 S 210 10, 250 70', color: 'var(--color-red-500)', delay: 0 },
  { d: 'M300 20 c 30 40, -20 60, 10 95 s 60 10, 90 -20', color: 'var(--color-cyan-400)', delay: 120 },
  { d: 'M20 190 q 40 -60 80 0 t 80 0', color: 'var(--color-emerald-500)', delay: 240 },
  { d: 'M250 230 c 20 -50, 70 -50, 80 -10 c 8 30, -30 40, -40 15', color: 'var(--color-gold-400)', delay: 360 },
  { d: 'M330 150 l 25 -25 l 25 25 l 25 -25', color: 'var(--color-cream-100)', delay: 480 },
  { d: 'M60 120 c -25 -10, -25 -45, 5 -50', color: 'var(--color-gold-400)', delay: 600 },
];
const DOTS: { cx: number; cy: number; r: number; color: string }[] = [
  { cx: 280, cy: 40, r: 7, color: 'var(--color-gold-400)' },
  { cx: 205, cy: 205, r: 6, color: 'var(--color-red-500)' },
  { cx: 110, cy: 30, r: 5, color: 'var(--color-cyan-400)' },
  { cx: 380, cy: 230, r: 6, color: 'var(--color-emerald-500)' },
  { cx: 150, cy: 240, r: 4, color: 'var(--color-cream-100)' },
];

export function HeroArt({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (x: number, y: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--sx', `${((x - r.left) / r.width - 0.5) * -18}px`);
    el.style.setProperty('--sy', `${((y - r.top) / r.height - 0.5) * -12}px`);
  };
  return (
    <section ref={ref} className="relative text-center" onPointerMove={(e) => move(e.clientX, e.clientY)}>
      <div className="pointer-events-none absolute inset-x-[-16px] -top-2 h-[12.5rem] overflow-hidden opacity-75 sm:inset-x-0 sm:h-[14.5rem]" aria-hidden="true">
        <svg className="squiggles squiggle mx-auto h-full w-full max-w-3xl" viewBox="0 0 420 260" preserveAspectRatio="xMidYMid slice" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {STROKES.map((s, i) => (
            <path key={i} d={s.d} stroke={s.color} strokeWidth={11} pathLength={100} style={{ ['--len' as string]: 100, animationDelay: `${s.delay}ms` }} />
          ))}
          {DOTS.map((d, i) => (
            <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.color} />
          ))}
        </svg>
      </div>
      <div className="relative [&_h1]:[text-shadow:0_2px_12px_rgb(4_16_58_/_0.8)] [&_p]:[text-shadow:0_1px_8px_rgb(4_16_58_/_0.8)]">{children}</div>
    </section>
  );
}
