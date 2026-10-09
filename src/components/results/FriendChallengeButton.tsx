'use client';
import { useState } from 'react';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { BRAND, WHATSAPP_GREEN } from '@/lib/shared/brand';

export function FriendChallengeButton({ sessionId }: { sessionId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ url: string }>('/api/challenges', { json: { sessionId } });
      setLink(r.url);
      const text = `I just played ${BRAND.name} — can you beat my score on the same questions?`;
      if (navigator.share) await navigator.share({ title: `${BRAND.name} challenge`, text, url: r.url }).catch(() => {});
      else await navigator.clipboard?.writeText(`${text} ${r.url}`).catch(() => {});
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  if (link) {
    return (
      <div className="panel p-3 text-xs">
        <p className="font-semibold">Challenge link (copied):</p>
        <input className="field field-dark mt-1 text-xs" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Challenge link" />
        <a className="btn btn-sm mt-2 w-full text-white" style={{ background: WHATSAPP_GREEN }} href={`https://wa.me/?text=${encodeURIComponent(`Can you beat my ${BRAND.name} score? ` + link)}`} target="_blank" rel="noopener noreferrer">
          Send on WhatsApp
        </a>
      </div>
    );
  }
  return (
    <div>
      <button type="button" className="btn btn-blue w-full" onClick={create} disabled={busy}>
        {busy ? 'Creating…' : 'Challenge a friend'}
      </button>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-coral-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
