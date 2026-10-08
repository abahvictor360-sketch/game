'use client';
import { useEffect, useState } from 'react';
import { Panel } from '@/components/ui';
import { apiFetch } from '@/lib/client/api';

type Invitation = { requestId: string; closesAt: string; text: string; options: { id: string; text: string }[] };

export function HelperClient() {
  const [inv, setInv] = useState<Invitation | null>(null);
  const [voted, setVoted] = useState<string | null>(null);
  useEffect(() => {
    const beat = async () => {
      try {
        const r = await apiFetch<{ invitation: Invitation | null }>('/api/audience/heartbeat', { json: {} });
        setInv((cur) => (r.invitation && r.invitation.requestId !== cur?.requestId ? r.invitation : r.invitation ? cur : null));
      } catch {}
    };
    beat();
    const t = setInterval(beat, 3000);
    return () => clearInterval(t);
  }, []);
  async function vote(optionId: string) {
    if (!inv) return;
    setVoted(inv.requestId);
    await apiFetch('/api/audience/vote', { json: { requestId: inv.requestId, optionId } }).catch(() => {});
  }
  if (!inv || voted === inv.requestId) {
    return (
      <Panel className="text-center" >
        <p role="status">{voted ? 'Thanks for voting! Waiting for the next question…' : 'Waiting for a player to ask the audience…'}</p>
      </Panel>
    );
  }
  return (
    <Panel>
      <p className="text-xs font-bold uppercase tracking-widest text-gold-300">A player needs your help</p>
      <h2 className="mt-2 text-lg font-bold">{inv.text}</h2>
      <div className="mt-4 grid gap-2">
        {inv.options.map((o) => (
          <button key={o.id} type="button" className="btn btn-blue justify-start" onClick={() => vote(o.id)}>
            {o.text}
          </button>
        ))}
      </div>
    </Panel>
  );
}
