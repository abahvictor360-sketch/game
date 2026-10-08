'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lifeline } from '@/lib/game/rules';
import type { SessionView } from '@/lib/shared/types';
import { apiFetch, newKey, type ApiError } from '@/lib/client/api';
import { prefersReducedMotion, useSound } from '@/lib/client/sound';
import { Avatar } from '../Avatar';
import { AnswerButton, type AnswerState } from './AnswerButton';
import { Ladder } from './Ladder';
import { Lifelines } from './Lifelines';
import { ReportDialog } from './ReportDialog';
import { TimerEmblem } from './TimerEmblem';

const MODE_LABEL: Record<SessionView['mode'], string> = {
  classic: 'Classic',
  daily: 'Daily Challenge',
  friend: 'Friend Challenge',
  ghost: 'Versus · Recorded player',
  match: 'Live match',
};

export function GameClient({ initial }: { initial: SessionView }) {
  const router = useRouter();
  const [view, setView] = useState<SessionView>(initial);
  const [offset, setOffset] = useState(() => new Date(initial.serverTime).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<string | null>(null); // option being submitted
  const [lifelineLoading, setLifelineLoading] = useState<Lifeline | null>(null);
  const [revealHold, setRevealHold] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'error' | 'info' } | null>(null);
  const [offline, setOffline] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { muted, toggle, play } = useSound();
  const lastTick = useRef<number>(-1);
  const announced = useRef<string>('');
  const continueRef = useRef<HTMLButtonElement>(null);

  const apply = useCallback((v: SessionView) => {
    setOffset(new Date(v.serverTime).getTime() - Date.now());
    setView(v);
    setOffline(false);
  }, []);

  const fail = useCallback((e: unknown) => {
    const err = e as ApiError;
    if (err.offline) setOffline(true);
    setToast({ text: err.message ?? 'Something went wrong.', tone: 'error' });
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await apiFetch<SessionView>(`/api/sessions/${view.id}`));
    } catch (e) {
      fail(e);
    }
  }, [view.id, apply, fail]);

  // Local display clock only. Correctness and timing are judged by the server.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  const q = view.question;
  const remaining = q ? (q.paused ? q.remainingMs : new Date(q.deadlineAt).getTime() - (now + offset)) : 0;

  // When time runs out, ask the server for the authoritative result.
  useEffect(() => {
    if (view.phase !== 'question' || !q || q.paused || pending) return;
    if (remaining > -1200) return;
    const t = setTimeout(refresh, 300);
    return () => clearTimeout(t);
  }, [view.phase, q, remaining, pending, refresh]);

  // Poll while the audience is voting, and periodically for recorded opponents.
  useEffect(() => {
    if (view.audience?.status === 'collecting') {
      const t = setInterval(refresh, 1000);
      return () => clearInterval(t);
    }
  }, [view.audience?.status, refresh]);

  // Ticks for the last five seconds.
  useEffect(() => {
    if (view.phase !== 'question' || !q || q.paused) return;
    const s = Math.ceil(remaining / 1000);
    if (s <= 5 && s > 0 && s !== lastTick.current) {
      lastTick.current = s;
      play('tick');
    }
  }, [remaining, view.phase, q, play]);

  useEffect(() => {
    if (view.phase === 'completed') {
      play('win');
      router.replace(`/results/${view.id}`);
    }
  }, [view.phase, view.id, router, play]);

  useEffect(() => {
    if (view.phase === 'feedback' && !revealHold) continueRef.current?.focus();
  }, [view.phase, revealHold]);

  useEffect(() => {
    const on = () => {
      setOffline(false);
      refresh();
    };
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const answer = useCallback(
    async (optionId: string) => {
      if (!q || view.phase !== 'question' || pending || q.paused) return;
      setPending(optionId);
      play('select');
      const started = Date.now();
      try {
        const v = await apiFetch<SessionView>(`/api/sessions/${view.id}/answer`, { json: { issuedId: q.issuedId, optionId, submissionKey: newKey() } });
        // A short, suspenseful pause before the reveal (skipped for reduced motion).
        const hold = prefersReducedMotion() ? 0 : Math.max(0, 700 - (Date.now() - started));
        setRevealHold(true);
        setTimeout(() => {
          apply(v);
          setRevealHold(false);
          setPending(null);
          play(v.feedback?.outcome === 'correct' ? 'correct' : 'wrong');
        }, hold);
      } catch (e) {
        setPending(null);
        const err = e as ApiError;
        if (err.reason === 'already_answered' || err.reason === 'not_current' || err.reason === 'question_replaced') await refresh();
        else fail(e);
      }
    },
    [q, view.phase, view.id, pending, play, apply, refresh, fail],
  );

  const next = useCallback(async () => {
    try {
      apply(await apiFetch<SessionView>(`/api/sessions/${view.id}/next`, { json: { fromPosition: view.position } }));
      lastTick.current = -1;
    } catch (e) {
      fail(e);
    }
  }, [view.id, view.position, apply, fail]);

  const lifeline = useCallback(
    async (l: Lifeline) => {
      if (!q) return;
      setLifelineLoading(l);
      try {
        apply(await apiFetch<SessionView>(`/api/sessions/${view.id}/lifeline`, { json: { issuedId: q.issuedId, lifeline: l, requestKey: newKey() } }));
        if (l === 'change_question') lastTick.current = -1;
      } catch (e) {
        const err = e as ApiError;
        setToast({ text: err.message, tone: err.reason === 'no_replacement' || err.reason === 'audience_insufficient' ? 'info' : 'error' });
        if (err.reason === 'answer_locked' || err.reason === 'not_current') refresh();
      } finally {
        setLifelineLoading(null);
      }
    },
    [q, view.id, apply, refresh],
  );

  // Keyboard: 1–4 or A–D to answer, Enter to continue.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (reportOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (view.phase === 'question' && q) {
        const idx = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
        const opt = idx >= 0 ? q.options[idx] : null;
        if (opt && !q.removedOptionIds.includes(opt.id)) {
          e.preventDefault();
          answer(opt.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view.phase, q, answer, reportOpen]);

  const fb = view.phase === 'feedback' && !revealHold ? view.feedback : null;
  const stateFor = (id: string): AnswerState => {
    if (q?.removedOptionIds.includes(id)) return 'removed';
    if (fb) {
      if (id === fb.correctOptionId) return 'correct';
      if (id === fb.selectedOptionId) return 'wrong';
      return 'dim';
    }
    if (pending === id) return 'selected';
    if (pending) return 'dim';
    return 'idle';
  };

  // Screen-reader announcement of results.
  let liveText = '';
  if (fb) {
    liveText = fb.outcome === 'correct' ? `Correct! Plus ${fb.points} points.` : fb.outcome === 'timeout' ? 'Time is up.' : 'Not quite.';
    const correct = q?.options.find((o) => o.id === fb.correctOptionId);
    if (fb.outcome !== 'correct' && correct) liveText += ` The answer was ${correct.label}: ${correct.text}.`;
  }
  if (liveText && announced.current !== liveText) announced.current = liveText;

  const percents = new Map((view.audience?.status === 'ready' ? view.audience.percentages : []).map((p) => [p.optionId, p.percent]));

  if (!q) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-blue-100">Loading your results…</p>
      </div>
    );
  }

  return (
    <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-6 pt-3">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-2">
        <Link href="/" className="btn btn-ghost btn-sm" aria-label="Leave game (your progress is saved)">
          ✕ <span className="hidden sm:inline">Exit</span>
        </Link>
        <p className="text-center text-xs font-bold uppercase tracking-[0.18em] text-blue-100/80">
          {MODE_LABEL[view.mode]}
          {view.challengeDate ? ` · ${view.challengeDate}` : ''}
        </p>
        <button type="button" onClick={toggle} className="btn btn-ghost btn-sm" aria-pressed={!muted} aria-label={muted ? 'Sound off. Turn sound on' : 'Sound on. Turn sound off'}>
          {muted ? '🔇' : '🔊'}
        </button>
      </header>

      {offline ? (
        <div role="status" className="mt-3 rounded-xl bg-flame-500/90 px-4 py-2 text-center text-sm font-semibold text-white">
          You’re offline. Your game is saved on our server — the timer keeps running, so reconnect as soon as you can.
        </div>
      ) : null}

      <div className="mt-2 grid flex-1 gap-6 lg:grid-cols-[1fr_180px]">
        <main className="flex flex-col">
          {/* Emblem + score */}
          <div className="flex items-center justify-center gap-4 sm:gap-8">
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-widest text-blue-100/70">Score</p>
              <p className="font-display text-2xl font-black tabular-nums text-gold-400" aria-live="polite">
                {view.score}
              </p>
            </div>
            <TimerEmblem remainingMs={view.phase === 'question' ? remaining : q.remainingMs} durationMs={q.durationMs} paused={q.paused} done={view.phase === 'feedback'} />
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-widest text-blue-100/70">Question</p>
              <p className="font-display text-2xl font-black tabular-nums">
                {q.position + 1}
                <span className="text-base text-blue-100/60">/{view.totalQuestions}</span>
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-col items-center gap-2">
            <div className="ribbon px-8 py-1.5 font-display text-sm font-black uppercase tracking-wider">
              {q.points} points · {q.difficulty}
            </div>
            <div className="lg:hidden">
              <Ladder ladder={view.ladder} history={view.history} position={view.position} />
            </div>
          </div>

          {view.ghost ? (
            <div className="mx-auto mt-3 flex w-full max-w-md items-center justify-between rounded-full bg-violet-700/70 px-4 py-2 text-sm ring-1 ring-violet-500">
              <span className="flex items-center gap-2">
                <Avatar name="star" size={26} />
                <span>
                  <span className="font-bold">{view.ghost.alias}</span> <span className="text-xs text-blue-100/70">(recorded player)</span>
                </span>
              </span>
              <span className="font-display font-black tabular-nums text-gold-300">{view.ghost.score}</span>
              <span className="sr-only">{view.ghost.answeredCurrent ? 'Opponent has answered' : 'Opponent is thinking'}</span>
              <span aria-hidden="true" className={`text-xs font-bold ${view.ghost.answeredCurrent ? 'text-emerald-400' : 'text-blue-100/60'}`}>
                {view.ghost.answeredCurrent ? 'Answered' : '…'}
              </span>
            </div>
          ) : null}

          {/* Question */}
          <section aria-labelledby="question-text" className="mt-5">
            <div className="railed">
              <div className="hex" style={{ ['--hex' as string]: '28px' }}>
                <div className="hex-inner px-9 py-5 text-center">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gold-300">{q.category.name}</p>
                  <h1 id="question-text" className="text-lg font-bold leading-snug sm:text-xl">
                    {q.text}
                  </h1>
                </div>
              </div>
            </div>
          </section>

          {/* Answers */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-x-8" role="group" aria-label="Answers">
            {q.options.map((o) => (
              <AnswerButton
                key={o.id}
                label={o.label}
                text={o.text}
                state={stateFor(o.id)}
                disabled={view.phase !== 'question' || !!pending || q.paused}
                onClick={() => answer(o.id)}
                percent={percents.has(o.id) ? percents.get(o.id)! : null}
              />
            ))}
          </div>

          {view.audience ? (
            <p className="mt-3 text-center text-sm text-blue-100/85" role="status">
              {view.audience.status === 'collecting'
                ? 'Asking the live audience… the timer is paused.'
                : view.audience.status === 'ready'
                  ? `${view.audience.source === 'live' ? 'Live audience' : 'Previous players'} · ${view.audience.sampleSize} ${view.audience.sampleSize === 1 ? 'vote' : 'votes'}. The audience can be wrong!`
                  : 'Not enough audience data — your lifeline has been restored.'}
            </p>
          ) : null}

          <div aria-live="assertive" className="sr-only">
            {liveText}
          </div>

          {/* Feedback */}
          {fb ? (
            <section className="ivory anim-rise mx-auto mt-6 w-full max-w-2xl rounded-2xl p-5 shadow-xl" aria-labelledby="feedback-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="feedback-title" className={`font-display text-xl font-black ${fb.outcome === 'correct' ? 'text-emerald-700' : 'text-coral-700'}`}>
                  {fb.outcome === 'correct' ? 'Correct!' : fb.outcome === 'timeout' ? 'Time’s up' : 'Not quite'}
                </h2>
                <span className={`rounded-full px-3 py-1 text-sm font-black ${fb.points ? 'bg-emerald-500 text-white' : 'bg-ivory-200 text-ink-700'}`}>+{fb.points} pts</span>
              </div>
              <p className="mt-2 leading-relaxed text-ink-700">{fb.explanation}</p>
              {fb.sources.length ? (
                <p className="mt-2 text-xs text-ink-500">
                  Source:{' '}
                  {fb.sources.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
                      {s.title}
                    </a>
                  ))}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button type="button" className="text-sm font-semibold text-ink-500 underline" onClick={() => setReportOpen(true)}>
                  Report a problem with this question
                </button>
                <button ref={continueRef} type="button" className="btn btn-gold" onClick={next}>
                  {view.position + 1 >= view.totalQuestions ? 'See results' : 'Next question'} →
                </button>
              </div>
            </section>
          ) : null}

          {view.phase === 'question' ? (
            <div className="mt-auto pt-6">
              <Lifelines states={view.lifelines} loading={lifelineLoading} disabled={!!pending || q.paused} onUse={lifeline} />
            </div>
          ) : null}
        </main>

        <aside className="hidden lg:block">
          <Ladder vertical ladder={view.ladder} history={view.history} position={view.position} />
        </aside>
      </div>

      {toast ? (
        <div role={toast.tone === 'error' ? 'alert' : 'status'} className={`fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl px-4 py-3 text-sm font-semibold shadow-xl ${toast.tone === 'error' ? 'bg-coral-500 text-white' : 'bg-stage-900 text-white ring-1 ring-rail'}`}>
          {toast.text}
        </div>
      ) : null}

      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} issuedId={fb?.issuedId ?? q.issuedId} onDone={() => setToast({ text: 'Thanks — our editors will review this question.', tone: 'info' })} />
    </div>
  );
}
