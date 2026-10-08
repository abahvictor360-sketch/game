import 'server-only';

/**
 * Realtime accelerator. Authoritative state lives in Postgres; clients can
 * always recover by refetching. When Supabase is configured, the server sends
 * a payload-free "changed" ping on a *private* channel (`match:<id>`) so
 * subscribed clients refetch immediately instead of waiting for their next
 * poll. Channel access is authorised by RLS on realtime.messages
 * (db/supabase/realtime_policies.sql). Pings never contain answers or scores.
 */
export async function notifyMatch(matchId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: `match:${matchId}`, event: 'changed', payload: { at: Date.now() }, private: true }] }),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Clients fall back to polling.
  }
}
