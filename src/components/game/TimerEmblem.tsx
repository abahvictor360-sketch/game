'use client';

import { Icon } from '@/components/Icon';
/** Circular emblem with a countdown ring. The server owns the real deadline. */
export function TimerEmblem({ remainingMs, durationMs, paused, done, label }: { remainingMs: number; durationMs: number; paused?: boolean; done?: boolean; label?: string }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remainingMs / durationMs));
  const secs = Math.ceil(Math.max(0, remainingMs) / 1000);
  const urgent = !done && !paused && secs <= 5;
  const stroke = urgent ? 'var(--color-coral-500)' : 'var(--color-gold-400)';
  return (
    <div className={`emblem relative grid h-28 w-28 place-items-center sm:h-32 sm:w-32 ${urgent ? 'timer-urgent' : ''}`} role="timer" aria-label={label ?? `${secs} seconds remaining`}>
      <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.12)" strokeWidth="6" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset 250ms linear, stroke 200ms' }} />
      </svg>
      <div className="relative text-center">
        {paused ? (
          <span className="block text-label font-bold uppercase text-gold-300">Paused</span>
        ) : (
          <span className={`font-display text-4xl font-black tabular-nums ${urgent ? 'text-coral-400' : 'text-white'}`} aria-hidden="true">
            {done ? <Icon name="check" size={36} strokeWidth={3} /> : secs}
          </span>
        )}
      </div>
    </div>
  );
}
