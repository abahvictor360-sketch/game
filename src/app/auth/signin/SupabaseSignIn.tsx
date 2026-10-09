'use client';
import { createBrowserClient } from '@supabase/ssr';
import { useMemo, useState } from 'react';
import { BRAND } from '@/lib/shared/brand';

export function SupabaseSignIn({ url, anonKey, next }: { url: string; anonKey: string; next: string }) {
  const supabase = useMemo(() => createBrowserClient(url, anonKey), [url, anonKey]);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const redirectTo = `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback?next=${encodeURIComponent(next)}`;

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) {
      setState('error');
      setMessage('Google sign-in is unavailable right now. Try email instead.');
    }
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: true } });
    if (error) {
      setState('error');
      setMessage(error.status === 429 ? 'Too many attempts. Please wait a minute and try again.' : 'We couldn’t send the email. Check the address and try again.');
    } else {
      setState('sent');
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <button type="button" onClick={google} className="btn w-full bg-white text-ink-900">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        Continue with Google
      </button>
      <div className="flex items-center gap-3 text-xs text-blue-100/60" aria-hidden="true">
        <span className="h-px flex-1 bg-white/20" /> or <span className="h-px flex-1 bg-white/20" />
      </div>
      {state === 'sent' ? (
        <div role="status" className="rounded-lg bg-emerald-500/20 px-3 py-3 text-sm">
          Check your inbox for a sign-in link from {BRAND.name}. It may take a minute — look in spam too. Didn’t get it?{' '}
          <button type="button" className="underline" onClick={() => setState('idle')}>
            Send another
          </button>
        </div>
      ) : (
        <form onSubmit={sendLink} className="space-y-3">
          <label className="block text-sm font-semibold">
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field field-dark mt-1" />
          </label>
          <button className="btn btn-gold w-full" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          <p className="text-xs text-blue-100/60">No password needed. Lost access? Just request a new link to the same email.</p>
        </form>
      )}
      {state === 'error' ? (
        <p role="alert" className="text-sm text-coral-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}
