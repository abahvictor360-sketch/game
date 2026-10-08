'use client';

export type AnswerState = 'idle' | 'selected' | 'correct' | 'wrong' | 'removed' | 'dim';

export function AnswerButton({ label, text, state, disabled, onClick, percent }: { label: string; text: string; state: AnswerState; disabled: boolean; onClick: () => void; percent?: number | null }) {
  const status = state === 'correct' ? ', correct answer' : state === 'wrong' ? ', your answer, incorrect' : state === 'removed' ? ', removed by 50:50' : state === 'selected' ? ', selected' : '';
  return (
    <button type="button" className="answer railed block w-full text-left" data-state={state} disabled={disabled || state === 'removed'} onClick={onClick} aria-label={`${label}: ${text}${status}`}>
      <span className="hex block">
        <span className="hex-inner flex min-h-14 items-center gap-3 px-7 py-2.5 sm:min-h-16">
          <span className="answer-letter font-display text-lg font-black text-gold-400">{label}:</span>
          <span className="flex-1 text-[15px] font-semibold leading-snug sm:text-base">{state === 'removed' ? '' : text}</span>
          {percent != null ? <span className="font-display text-sm font-black tabular-nums text-gold-300">{percent}%</span> : null}
        </span>
      </span>
    </button>
  );
}
