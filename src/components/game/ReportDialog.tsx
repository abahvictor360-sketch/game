'use client';
import { useEffect, useRef, useState } from 'react';
import { apiFetch, type ApiError } from '@/lib/client/api';

const REASONS = [
  ['incorrect', 'The answer is wrong'],
  ['outdated', 'It is out of date'],
  ['unclear', 'The question is unclear'],
  ['typo', 'Spelling or grammar'],
  ['offensive', 'It is offensive or disrespectful'],
  ['other', 'Something else'],
] as const;

export function ReportDialog({ open, onClose, issuedId, onDone }: { open: boolean; onClose: () => void; issuedId: string; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState<string>('incorrect');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/reports', { json: { issuedId, reason, details: details || null } });
      setDetails('');
      onDone();
      onClose();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} className="ivory m-auto w-[min(92vw,28rem)] rounded-2xl p-0 backdrop:bg-black/60" aria-labelledby="report-title">
      <form onSubmit={submit} className="p-5">
        <h2 id="report-title" className="font-display text-lg font-black">
          Report this question
        </h2>
        <fieldset className="mt-3 space-y-1">
          <legend className="sr-only">Reason</legend>
          {REASONS.map(([value, label]) => (
            <label key={value} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-ivory-100">
              <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} className="h-5 w-5 accent-stage-700" />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="mt-3 block text-sm font-semibold">
          Details (optional)
          <textarea className="field mt-1" rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What should we check? Links to sources help." />
        </label>
        {error ? (
          <p role="alert" className="mt-2 text-sm font-semibold text-coral-700">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-sm text-ink-700 ring-1 ring-ink-500/40" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-sm btn-blue" disabled={busy}>
            {busy ? 'Sending…' : 'Send report'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
