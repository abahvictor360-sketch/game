'use client';
import type { Lifeline } from '@/lib/game/rules';
import type { LifelineState } from '@/lib/shared/types';

const META: Record<Lifeline, { label: string; short: string; icon: React.ReactNode }> = {
  fifty_fifty: { label: '50:50 — remove two wrong answers', short: '50:50', icon: <span className="font-display text-base font-black">50:50</span> },
  change_question: {
    label: 'Change question — swap for another of the same difficulty',
    short: 'Swap',
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9a8 8 0 0114-3l2 2M20 15a8 8 0 01-14 3l-2-2M20 4v4h-4M4 20v-4h4" />
      </svg>
    ),
  },
  ask_audience: {
    label: 'Ask the audience',
    short: 'Audience',
    icon: (
      <svg width="28" height="26" viewBox="0 0 28 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="14" cy="7" r="3.2" />
        <circle cx="6" cy="9" r="2.6" />
        <circle cx="22" cy="9" r="2.6" />
        <path d="M8 20c0-3.5 2.7-6 6-6s6 2.5 6 6M1.5 19c0-2.6 2-4.6 4.5-4.6M26.5 19c0-2.6-2-4.6-4.5-4.6" />
      </svg>
    ),
  },
};

export function Lifelines({ states, loading, disabled, onUse }: { states: Record<Lifeline, LifelineState>; loading: Lifeline | null; disabled: boolean; onUse: (l: Lifeline) => void }) {
  const visible = (Object.keys(META) as Lifeline[]).filter((l) => states[l] !== 'disabled');
  if (!visible.length) return null;
  return (
    <div role="group" aria-label="Lifelines" className="flex items-start justify-center gap-4">
      {visible.map((l) => {
        const st = loading === l ? 'loading' : states[l];
        return (
          <div key={l} className="flex flex-col items-center gap-1">
            <button
              type="button"
              className="lifeline"
              data-state={st}
              disabled={disabled || states[l] === 'used' || loading !== null}
              onClick={() => onUse(l)}
              aria-label={`${META[l].label}${states[l] === 'used' ? ' (used)' : ''}`}
              aria-busy={loading === l}
            >
              {META[l].icon}
            </button>
            <span className="text-[11px] font-semibold text-blue-100/80" aria-hidden="true">
              {META[l].short}
            </span>
          </div>
        );
      })}
    </div>
  );
}
