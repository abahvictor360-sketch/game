import 'server-only';

/**
 * Error monitoring adapter. When SENTRY_DSN is set, events are sent to Sentry
 * using its envelope endpoint (no SDK needed, keeping bundles small). Without
 * a DSN, errors are logged to the server console. Swap in @sentry/nextjs for
 * tracing/performance if needed — callers only use these two functions.
 */

type Ctx = Record<string, unknown>;

function parseDsn(dsn: string) {
  const u = new URL(dsn);
  const projectId = u.pathname.replace(/^\//, '');
  return { endpoint: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, key: u.username, dsn };
}

async function send(event: Record<string, unknown>) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const { endpoint, key } = parseDsn(dsn);
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const body =
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn }) +
      '\n' +
      JSON.stringify({ type: 'event' }) +
      '\n' +
      JSON.stringify({ event_id: eventId, timestamp: Date.now() / 1000, platform: 'node', environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV, ...event });
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${key}` },
      body,
    });
  } catch {
    // Monitoring must never break gameplay.
  }
}

export function captureException(err: unknown, ctx: Ctx = {}) {
  const e = err instanceof Error ? err : new Error(String(err));
  if (process.env.NODE_ENV !== 'test') console.error('[fastora]', e, ctx);
  void send({
    level: 'error',
    exception: { values: [{ type: e.name, value: e.message, stacktrace: { frames: [] } }] },
    extra: { ...ctx, stack: e.stack },
  });
}

export function captureMessage(message: string, ctx: Ctx = {}) {
  if (process.env.NODE_ENV !== 'test') console.warn('[fastora]', message, ctx);
  void send({ level: 'warning', message: { formatted: message }, extra: ctx });
}
