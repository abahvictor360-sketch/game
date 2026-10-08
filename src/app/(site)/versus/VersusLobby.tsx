'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Panel } from '@/components/ui';
import { apiFetch, type ApiError } from '@/lib/client/api';

type Queue = { status: 'waiting'; waitedMs: number; fallbackAfterMs: number; fallbackAvailable: boolean } | { status: 'matched'; matchId: string } | { status: 'idle' };

export function VersusLobby({ live, ghosts, fallbackMs, initialError }: { live: boolean; ghosts: boolean; fallbackMs: number; initialError: string | null }) {
  const router = useRouter();
  const [q, setQ] = useState<Queue>({ status: 'idle' });
  const [error, setError] = useState<string | null>(initialError === 'no_recording' ? 'No recorded opponent is available right now. Try a solo Classic game or keep waiting.' : initialError ? 'Something went wrong. Please try again.' : null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const handle = useCallback(
    (s: Queue) => {
      setQ(s);
      if (s.status === 'matched') {
        stop();
        router.push(`/match/${s.matchId}`);
      }
    },
    [router, stop],
  );

  async function join() {
    setError(null);
    try {
      handle(await apiFetch<Queue>('/api/match/queue', { json: {} }));
      timer.current = setInterval(async () => {
        try {
          handle(await apiFetch<Queue>('/api/match/queue'));
        } catch (e) {
          setError((e as ApiError).message);
        }
      }, 1500);
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  async function cancel() {
    stop();
    await apiFetch('/api/match/queue', { method: 'DELETE' }).catch(() => {});
    setQ({ status: 'idle' });
  }

  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    const leave = () => navigator.sendBeacon?.('/api/match/queue?leave=1');
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, []);

  const waiting = q.status === 'waiting';
  return (
    <Panel className="text-center">
      {!live ? (
        <>
          <p className="text-sm text-blue-100/85">Race a recording of a real player’s completed game. It’s clearly labelled — never presented as someone online now.</p>
          <form action="/api/play/ghost" method="post" className="mt-5">
            <button className="btn btn-gold w-full">Play a recorded opponent</button>
          </form>
        </>
      ) : waiting ? (
        <div role="status" aria-live="polite">
          <div className="emblem mx-auto grid h-24 w-24 place-items-center">
            <span className="font-display text-2xl font-black tabular-nums">{Math.floor(q.waitedMs / 1000)}s</span>
          </div>
          <p className="mt-4 font-semibold">Looking for an opponent…</p>
          {q.fallbackAvailable ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-blue-100/85">No one is available right now.</p>
              {ghosts ? (
                <form action="/api/play/ghost" method="post" onSubmit={() => cancel()}>
                  <button className="btn btn-gold w-full">Race a recorded player instead</button>
                </form>
              ) : null}
              <form action="/api/play/classic" method="post" onSubmit={() => cancel()}>
                <button className="btn btn-blue w-full">Play solo Classic</button>
              </form>
              <p className="text-xs text-blue-100/60">Or keep waiting — we’ll keep searching.</p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-blue-100/60">Usually under {Math.round(fallbackMs / 1000)} seconds.</p>
          )}
          <button type="button" className="btn btn-ghost btn-sm mt-4" onClick={cancel}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-gold min-h-14 w-full text-lg" onClick={join}>
          Find an opponent
        </button>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-coral-400">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
