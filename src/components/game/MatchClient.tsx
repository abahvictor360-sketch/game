'use client';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchView } from '@/lib/server/game/matches';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { Avatar } from '../Avatar';
import { ConfirmDialog, MuteButton, Toast, useOnline, useSound, useToast } from '../feedback';
import { ResultGrid } from '../ui';
import { AnswerButton, type AnswerState } from './AnswerButton';
import { TimerEmblem } from './TimerEmblem';

/**
 * Live match screen. The server is authoritative; this client polls (and,
 * when Supabase Realtime is available, refetches on a private-channel ping).
 * Missed or duplicate events are harmless because every update is a full,
 * fresh view.
 */
export function MatchClient({ initial, supabase }: { initial: MatchView; supabase: { url: string; key: string } | null }) {
  const [view, setView] = useState(initial);
  const [offset, setOffset] = useState(() => new Date(initial.serverTime).getTime() - Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [offlineSince, setOfflineSince] = useState<number | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { muted, toggle, play } = useSound();
  const { toast, show, clear } = useToast();
  const lastReveal = useRef<number>(-1);
  const lastScore = useRef(initial.me.score);

  const refresh = useCallback(async () => {
    try {
      const v = await apiFetch<MatchView>(`/api/match/${view.id}`);
      setOffset(new Date(v.serverTime).getTime() - Date.now());
      setView(v);
      setOfflineSince(null);
      if (v.reconnected) show('You’re back in the match.', 'success');
    } catch (e) {
      if ((e as ApiError).offline) setOfflineSince((t) => t ?? Date.now());
    }
  }, [view.id, show]);

  const online = useOnline(refresh);
  useEffect(() => {
    if (!online) setOfflineSince((t) => t ?? Date.now());
  }, [online]);

  const forfeited = view.me.status === 'forfeited';
  const finished = view.status === 'completed' || view.status === 'cancelled';

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  // Poll: frequent during play (also serves as the presence heartbeat).
  useEffect(() => {
    if (finished || forfeited) return;
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [finished, forfeited, refresh]);

  // Optional Realtime accelerator (private channel; payload-free pings).
  useEffect(() => {
    if (!supabase) return;
    const client = createBrowserClient(supabase.url, supabase.key);
    let channel: ReturnType<typeof client.channel> | null = null;
    client.auth.getSession().then(({ data }) => {
      if (!data.session) return; // guests rely on polling
      client.realtime.setAuth(data.session.access_token);
      channel = client.channel(`match:${view.id}`, { config: { private: true } }).on('broadcast', { event: 'changed' }, () => refresh());
      channel.subscribe();
    });
    return () => {
      if (channel) client.removeChannel(channel);
    };
  }, [supabase, view.id, refresh]);

  useEffect(() => {
    if (view.reveal && lastReveal.current !== view.position) {
      lastReveal.current = view.position;
      play(view.reveal.myOutcome === 'correct' ? 'correct' : 'wrong');
      setPending(null);
    }
  }, [view.reveal, view.position, play]);

  const serverNow = now + offset;
  const q = view.question;

  const canAnswer = !!q && view.status === 'active' && view.roundState === 'open' && !view.me.answered && !pending && !forfeited;

  const answer = useCallback(
    async (optionId: string) => {
      if (!q || !canAnswer) return;
      setPending(optionId);
      play('select');
      try {
        const v = await apiFetch<MatchView>(`/api/match/${view.id}/answer`, { json: { position: q.position, optionId } });
        setView(v);
      } catch (e) {
        setPending(null);
        show((e as ApiError).message, 'error');
        refresh();
      }
    },
    [q, canAnswer, view.id, play, show, refresh],
  );

  // Keyboard: 1–4 or A–D to answer (same as solo games).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmLeave || e.metaKey || e.ctrlKey || e.altKey || !q) return;
      const i = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
      const opt = i >= 0 ? q.options[i] : null;
      if (opt && canAnswer) {
        e.preventDefault();
        answer(opt.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [q, canAnswer, answer, confirmLeave]);

  // Animate the score when it changes.
  const scoreChanged = view.me.score !== lastScore.current;
  useEffect(() => {
    lastScore.current = view.me.score;
  }, [view.me.score]);

  async function leave() {
    setConfirmLeave(false);
    await apiFetch(`/api/match/${view.id}/forfeit`, { json: {} }).catch(() => {});
    refresh();
  }

  const stateFor = (id: string): AnswerState => {
    if (view.reveal) {
      if (id === view.reveal.correctOptionId) return 'correct';
      if (id === view.me.selectedOptionId) return 'wrong';
      return 'dim';
    }
    if (view.me.selectedOptionId === id || pending === id) return 'selected';
    if (view.me.answered || pending) return 'dim';
    return 'idle';
  };

  const Player = ({ who, side }: { who: { name: string; avatarKey: string; score: number }; side: 'me' | 'them' }) => (
    <div className={`flex items-center gap-2 ${side === 'them' ? 'flex-row-reverse text-right' : ''}`}>
      <Avatar name={who.avatarKey} size={36} />
      <div>
        <p className="max-w-28 truncate text-sm font-bold">{side === 'me' ? 'You' : who.name}</p>
        <p className="font-display text-xl font-black tabular-nums text-gold-400">
          <span key={who.score} className={side === 'me' && scoreChanged ? 'anim-bump' : undefined}>
            {who.score}
          </span>
        </p>
      </div>
    </div>
  );

  if (forfeited && !finished) {
    return (
      <main id="main" className="relative z-10 mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="font-display text-3xl font-black">You left the match</h1>
        <p className="mt-2 text-blue-100/80">
          {view.opponent.name} wins by forfeit and can finish the remaining questions.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/versus" className="btn btn-gold">
            Find a new match
          </Link>
          <Link href="/" className="btn btn-ghost">
            Home
          </Link>
        </div>
      </main>
    );
  }

  if (finished) {
    const r = view.result!;
    return (
      <main id="main" className="relative z-10 mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="font-display text-3xl font-black">{r.outcome === 'win' ? 'You won! 🏆' : r.outcome === 'loss' ? `${view.opponent.name} won` : r.outcome === 'draw' ? 'It’s a draw' : 'Match cancelled'}</h1>
        <p className="mt-2 text-blue-100/80">
          {r.reason === 'forfeit' ? (r.outcome === 'win' ? 'Your opponent left the match.' : 'You left the match.') : r.reason === 'both_disconnected' || r.reason === 'opponent_missing' ? 'The match couldn’t be completed fairly, so no result was recorded.' : ''}
        </p>
        {view.status === 'completed' ? (
          <div className="panel mt-6 grid grid-cols-2 gap-4 p-4">
            <div>
              <p className="text-sm font-bold">You</p>
              <p className="font-display text-3xl font-black text-gold-400">{view.me.score}</p>
              <ResultGrid grid={view.history.me} size="sm" />
            </div>
            <div>
              <p className="text-sm font-bold">{view.opponent.name}</p>
              <p className="font-display text-3xl font-black text-gold-400">{view.opponent.score}</p>
              <ResultGrid grid={view.history.opponent} size="sm" />
            </div>
          </div>
        ) : null}
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/versus" className="btn btn-gold">
            Play again
          </Link>
          <Link href="/" className="btn btn-ghost">
            Home
          </Link>
        </div>
      </main>
    );
  }

  const remaining = view.deadlineAt ? new Date(view.deadlineAt).getTime() - serverNow : 0;
  const countdown = Math.max(0, Math.ceil((new Date(view.startsAt).getTime() - serverNow) / 1000));
  const oppDisconnected = view.opponent.status === 'disconnected';
  const offlineLeft = offlineSince ? Math.max(0, Math.ceil((view.reconnectWindowMs - (now - offlineSince)) / 1000)) : 0;

  return (
    <main id="main" className="relative z-10 mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pb-6 pt-3">
      <header className="flex items-center justify-between">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmLeave(true)}>
          Leave
        </button>
        <p className="text-eyebrow font-bold uppercase text-blue-100/80">Live match</p>
        <MuteButton muted={muted} onToggle={toggle} />
      </header>
      {offlineSince ? (
        <div role="status" className="mt-2 rounded-xl bg-flame-500 px-3 py-2 text-center text-sm font-semibold">
          {offlineLeft > 0
            ? `Connection lost — reconnect within ${offlineLeft}s to stay in the match. The clock keeps running.`
            : 'Connection lost. If you don’t reconnect, the match is forfeited.'}
        </div>
      ) : null}
      {oppDisconnected ? (
        <div role="status" className="mt-2 rounded-xl bg-violet-700 px-3 py-2 text-center text-sm">
          {view.opponent.name} lost connection. Waiting up to {Math.max(0, Math.ceil((view.reconnectWindowMs - (view.opponent.disconnectedForMs ?? 0)) / 1000))}s…
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
        <Player who={view.me} side="me" />
        {view.status === 'countdown' ? (
          <div className="emblem grid h-24 w-24 place-items-center font-display text-4xl font-black" role="timer" aria-live="assertive" aria-label={countdown ? `Starting in ${countdown}` : 'Go'}>
            {countdown || 'Go!'}
          </div>
        ) : q ? (
          <TimerEmblem remainingMs={view.roundState === 'open' ? remaining : 0} durationMs={q.durationMs} done={view.roundState === 'closed'} />
        ) : null}
        <Player who={view.opponent} side="them" />
      </div>

      {q ? (
        <>
          <div className="mt-3 flex justify-center">
            <span className="ribbon px-6 py-1 font-display text-sm font-black">
              Q{q.position + 1}/{view.totalQuestions} · {q.points} pts + speed bonus
            </span>
          </div>
          <div className="mt-4 railed">
            <div className="hex" style={{ ['--hex' as string]: '28px' }}>
              <div className="hex-inner px-9 py-5 text-center">
                <p className="mb-1 text-eyebrow font-bold uppercase text-gold-300">{q.category}</p>
                <h1 className="text-lg font-bold">{q.text}</h1>
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-x-8">
            {q.options.map((o) => (
              <AnswerButton key={o.id} label={o.label} text={o.text} state={stateFor(o.id)} disabled={!canAnswer} onClick={() => answer(o.id)} />
            ))}
          </div>
          <p className="mt-3 text-center text-sm text-blue-100/80" role="status">
            {view.roundState === 'open'
              ? view.me.answered
                ? view.opponent.answered
                  ? 'Both answered — revealing…'
                  : `Waiting for ${view.opponent.name}…`
                : view.opponent.answered
                  ? `${view.opponent.name} has answered!`
                  : 'Choose your answer'
              : null}
          </p>
          {view.reveal ? (
            <section className="ivory anim-rise mt-4 rounded-2xl p-4" aria-live="polite">
              <h2 className="sr-only">Round {q.position + 1} result</h2>
              <p className={`font-display text-lg font-black ${view.reveal.myOutcome === 'correct' ? 'text-emerald-700' : 'text-coral-700'}`}>
                {view.reveal.myOutcome === 'correct' ? 'Correct!' : view.reveal.myOutcome === 'timeout' ? 'Time’s up' : 'Not quite'}
                {view.reveal.myOutcome !== 'correct' ? (
                  <span className="ml-2 text-sm font-semibold text-ink-700">Answer: {q.options.find((o) => o.id === view.reveal!.correctOptionId)?.text}</span>
                ) : null}
              </p>
              <p className="font-display font-black">
                You: <span className={view.reveal.myOutcome === 'correct' ? 'text-emerald-700' : 'text-coral-700'}>+{view.reveal.myPoints}</span> · {view.opponent.name}:{' '}
                <span className={view.reveal.opponentOutcome === 'correct' ? 'text-emerald-700' : 'text-coral-700'}>+{view.reveal.opponentPoints}</span>
              </p>
              <p className="mt-1 text-sm text-ink-700">{view.reveal.explanation}</p>
            </section>
          ) : null}
        </>
      ) : (
        <section className="mt-8 text-center" aria-labelledby="ready-title">
          <h1 id="ready-title" className="font-display text-2xl font-black">
            Get ready!
          </h1>
          <ul className="mx-auto mt-4 grid max-w-xs gap-2 text-sm">
            {[
              { name: 'You', status: offlineSince ? 'disconnected' : view.me.status },
              { name: view.opponent.name, status: view.opponent.status },
            ].map((p) => (
              <li key={p.name} className="panel flex items-center justify-between px-4 py-2">
                <span className="font-bold">{p.name}</span>
                <span className={p.status === 'connected' ? 'text-emerald-400' : 'text-coral-400'}>{p.status === 'connected' ? '✓ Ready' : 'Connecting…'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-blue-100/80">
            {view.totalQuestions} questions · same questions, same clock · faster correct answers earn a speed bonus.
          </p>
        </section>
      )}
      <Toast toast={toast} onDismiss={clear} />
      <ConfirmDialog open={confirmLeave} title="Leave the match?" confirmLabel="Leave and forfeit" cancelLabel="Keep playing" onConfirm={leave} onCancel={() => setConfirmLeave(false)}>
        Leaving now counts as a forfeit, and {view.opponent.name} wins.
      </ConfirmDialog>
    </main>
  );
}
