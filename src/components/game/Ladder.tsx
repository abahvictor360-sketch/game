import type { AnswerOutcome } from '@/lib/shared/types';
import type { Difficulty } from '@/lib/game/rules';

/** Rising quiz ladder. Compact strip on phones, vertical ladder on wide screens. */
export function Ladder({ ladder, history, position, vertical = false }: { ladder: { difficulty: Difficulty; points: number }[]; history: (AnswerOutcome | null)[]; position: number; vertical?: boolean }) {
  if (vertical) {
    return (
      <ol className="panel flex flex-col-reverse gap-1 p-3 text-sm" aria-label="Question ladder">
        {ladder.map((step, i) => {
          const h = history[i];
          const current = i === position && h === null;
          return (
            <li
              key={i}
              aria-current={current ? 'step' : undefined}
              className={`flex items-center justify-between gap-4 rounded-full px-3 py-1 font-bold tabular-nums ${current ? 'ribbon' : h === 'correct' ? 'text-emerald-400' : h ? 'text-coral-400' : 'text-blue-100/70'}`}
            >
              <span>{i + 1}</span>
              <span>{step.points}</span>
            </li>
          );
        })}
      </ol>
    );
  }
  return (
    <ol className="flex items-center justify-center gap-1" aria-label={`Question ${position + 1} of ${ladder.length}`}>
      {ladder.map((step, i) => {
        const h = history[i];
        const current = i === position && h === null;
        const tier = step.difficulty === 'easy' ? 'h-2' : step.difficulty === 'medium' ? 'h-3' : 'h-4';
        return (
          <li
            key={i}
            className={`w-3 rounded-sm sm:w-4 ${tier} ${current ? 'bg-gold-400 shadow-[0_0_10px_var(--color-gold-400)]' : h === 'correct' ? 'bg-emerald-400' : h ? 'bg-coral-500' : 'bg-white/20'}`}
          >
            <span className="sr-only">
              Question {i + 1}, {step.difficulty}, {h ?? (current ? 'current' : 'upcoming')}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
