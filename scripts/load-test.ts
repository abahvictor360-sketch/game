export {};
/**
 * Simple load test: N virtual guests each play a full Classic game over HTTP
 * against a running server (answers are random; think time configurable).
 *   BASE=http://localhost:3000 PLAYERS=50 THINK_MS=300 npx tsx scripts/load-test.ts
 * Reports request latency percentiles and errors. Results depend heavily on
 * the database: the embedded development DB is single-connection.
 */
const BASE = process.env.BASE ?? 'http://localhost:3000';
const PLAYERS = Number(process.env.PLAYERS ?? 20);
const THINK = Number(process.env.THINK_MS ?? 200);
const lat: Record<string, number[]> = {};
let errors = 0;

async function call(name: string, url: string, init: RequestInit, cookie: { v: string }) {
  const t = performance.now();
  const res = await fetch(BASE + url, { ...init, redirect: 'manual', headers: { ...(init.headers ?? {}), cookie: cookie.v, origin: BASE } });
  (lat[name] ??= []).push(performance.now() - t);
  const set = res.headers.get('set-cookie');
  if (set) cookie.v = set.split(';')[0];
  if (res.status >= 400) errors++;
  return res;
}

async function player() {
  const cookie = { v: '' };
  const start = await call('start', '/api/play/classic', { method: 'POST', headers: { 'content-type': 'application/json' } }, cookie);
  const { sessionId } = (await start.json()) as { sessionId?: string };
  if (!sessionId) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let view = (await (await call('state', `/api/sessions/${sessionId}`, {}, cookie)).json()) as any;
  while (view.phase !== 'completed') {
    if (!view.question) return; // error response already counted
    await new Promise((r) => setTimeout(r, THINK));
    const opt = view.question.options[Math.floor(Math.random() * 4)].id;
    view = await (await call('answer', `/api/sessions/${sessionId}/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ issuedId: view.question.issuedId, optionId: opt, submissionKey: crypto.randomUUID() }) }, cookie)).json();
    if (!view.question) return;
    view = await (await call('next', `/api/sessions/${sessionId}/next`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fromPosition: view.position }) }, cookie)).json();
  }
}

const pct = (a: number[], p: number) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const t0 = performance.now();
await Promise.all(Array.from({ length: PLAYERS }, player));
const secs = (performance.now() - t0) / 1000;
const total = Object.values(lat).reduce((n, a) => n + a.length, 0);
console.log(`${PLAYERS} concurrent players, ${total} requests in ${secs.toFixed(1)}s (${(total / secs).toFixed(0)} req/s), errors: ${errors}`);
for (const [k, a] of Object.entries(lat)) console.log(`${k.padEnd(7)} n=${a.length} p50=${pct(a, 0.5).toFixed(0)}ms p95=${pct(a, 0.95).toFixed(0)}ms max=${pct(a, 1).toFixed(0)}ms`);
