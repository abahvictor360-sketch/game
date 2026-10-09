import 'server-only';

/**
 * Product analytics (PostHog capture API). Events carry pseudonymous player
 * ids and coarse properties only, never answers, emails or question text.
 * Without POSTHOG_KEY this is a no-op (logged in development).
 */
export type AnalyticsEvent =
  | 'game_started'
  | 'game_completed'
  | 'lifeline_used'
  | 'daily_started'
  | 'daily_completed'
  | 'result_shared'
  | 'account_linked'
  | 'friend_challenge_created'
  | 'friend_challenge_started'
  | 'matchmaking_outcome'
  | 'match_reconnected'
  | 'audience_requested'
  | 'question_reported';

const ALLOWED_PROPS = new Set(['mode', 'lifeline', 'score', 'correct', 'total', 'eligible', 'channel', 'outcome', 'source', 'reason', 'kind']);

export async function track(event: AnalyticsEvent, distinctId: string, props: Record<string, string | number | boolean> = {}) {
  const safe = Object.fromEntries(Object.entries(props).filter(([k]) => ALLOWED_PROPS.has(k)));
  const key = process.env.POSTHOG_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'development') console.info('[analytics]', event, safe);
    return;
  }
  const host = process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com';
  try {
    await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, event, distinct_id: distinctId, properties: { ...safe, $process_person_profile: false } }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Analytics is best-effort.
  }
}
