'use client';
import { useEffect, useState } from 'react';
import { useOnline } from '@/components/feedback';
import { Panel } from '@/components/ui';
import { apiFetch, type ApiError } from '@/lib/client/api';

type Invitation = { requestId: string; closesAt: string; text: string; options: { id: string; text: string }[] };

export function HelperClient() {
  const [inv, setInv] = useState<Invitation | null>(null);
  const [voted, setVoted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const online = useOnline();

  useEffect(() => {
    const beat = async () => {
      try {
        const r = await apiFetch<{ invitation: Invitation | null }>('/api/audience/heartbeat', { json: {} });
        setInv((cur) => (r.invitation && r.invitation.requestId !== cur?.requestId ? r.invitation : r.invitation ? cur : null));
      } catch {
        // Offline or a transient failure: the next heartbeat retries.
      }
    };
    beat();
    const t = setInterval(beat, 3000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!inv) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [inv]);

  async function vote(optionId: string) {
    if (!inv) return;
    setError(null);
    setVoted(inv.requestId);
    try {
      await apiFetch('/api/audience/vote', { json: { requestId: inv.requestId, optionId } });
    } catch (e) {
      setError((e as ApiError).code === 'expired' ? 'Voting closed before your vote arrived.' : (e as ApiError).message);
    }
  }

  const secondsLeft = inv ? Math.max(0, Math.ceil((new Date(inv.closesAt).getTime() - now) / 1000)) : 0;

  if (!inv || voted === inv.requestId || secondsLeft === 0) {
    return (
      <Panel className="text-center">
        {!online ? (
          <p role="status" className="font-semibold text-flame-400">
            You’re offline, so you won’t receive questions until you reconnect.
          </p>
        ) : (
          <p role="status">{voted && !error ? 'Thanks for voting! Waiting for the next question…' : 'Waiting for a player to ask the audience…'}</p>
        )}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-coral-400">
            {error}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-blue-100/60">Keep this page open. You’ll be invited at most once every two minutes.</p>
      </Panel>
    );
  }
  return (
    <Panel>
      <div className="flex items-center justify-between gap-2">
        <p className="text-label font-bold uppercase text-gold-300">A player needs your help</p>
        <span role="timer" aria-label={`${secondsLeft} seconds left to vote`} className="font-display text-lg font-black tabular-nums text-gold-400">
          {secondsLeft}s
        </span>
      </div>
      <h2 className="mt-2 text-lg font-bold">{inv.text}</h2>
      <div className="mt-4 grid gap-2" role="group" aria-label="Your answer">
        {inv.options.map((o) => (
          <button key={o.id} type="button" className="btn btn-blue justify-start text-left" onClick={() => vote(o.id)}>
            {o.text}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-blue-100/60">Your vote is anonymous. Answer only if you know — the player sees the vote percentages.</p>
    </Panel>
  );
}
