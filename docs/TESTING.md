# Testing and measured results

All results below were produced in the build environment on 2026-10-08.

## Automated tests

| Suite | Command | Result |
|---|---|---|
| Unit (rules, scoring, ranking, dates, cookie signing) | `npm test` | 12 passed |
| Integration on embedded Postgres (PGlite) | `npm test` | 45 passed |
| Integration on **real PostgreSQL 16** via the production driver | `TEST_DATABASE_URL=postgres://… npm test` | 57/57 passed (unit + integration) |
| End-to-end (Playwright, Pixel 7 viewport, production build) | `npm run build && npm run test:e2e` | see below |
| Accessibility (axe-core, WCAG 2.1 A/AA, serious+critical) | part of e2e | 8 passed, 0 violations |

### What the integration tests cover

- Classic: 15 questions, 5/5/5 ladder, server scoring, no repeats in a run.
- Answer privacy: no answer key / explanation in any payload before the
  answer is locked.
- Deadlines: server-side timeout without any client call; latency grace
  boundary; late answers recorded as timeouts; refresh keeps the deadline.
- Duplicate and **concurrent** submissions (5 parallel → exactly one scored);
  foreign sessions/options rejected; idempotent advance.
- Lifelines: 50:50 (keeps correct + one distractor, timer unchanged,
  single use, duplicate request no-op, removed options rejected); Change
  Question (same difficulty, fresh timer, prior lifeline stays used, no
  replacement → lifeline kept); locked-answer rejection; audience gated by flag.
- Freshness across runs.
- Daily: one immutable set, identical versions and option order for everyone,
  one attempt per player, 6 concurrent starts → one attempt, refresh resumes
  with the same deadline, local-midnight rollover, eligible-only ranking with
  tie-breaks, no emails in public payloads.
- Guest → account: identity and history kept; merging into an existing
  account never duplicates a daily attempt; admin bootstrap only from the
  configured verified email.
- Content: draft → review → approve, send-back; editing a live question
  creates a new version while in-progress Daily games keep the old version;
  archived questions never served; calibration refines but never empties a
  difficulty tier.
- All-time leaderboard keeps each player's best run.
- **RLS**: `anon`/`authenticated` cannot read answer keys, options,
  versions, issued questions, daily sets, votes or emails, cannot write
  scores; a signed-in user reads only their own profile row.
- CSV: template accepted; row-specific errors (lengths, duplicate options,
  correct letter, category, difficulty, scope, URLs, impossible dates);
  in-file and in-bank duplicates; missing columns; mixed line endings.
- Phase 2: friend challenges (same versions/order, hashed tokens, own-link
  and expiry handling, one attempt, unranked); ghost recordings (lifeline
  runs and opted-out players not recorded, pseudonymous label, nothing
  revealed early, speed-bonus scoring, no fabricated opponent); Ask the
  Audience (insufficient data restores the lifeline, historical fallback
  with sample size, live voting pauses/resumes the timer, one vote per helper,
  no answer data sent to helpers); live matches (matchmaking fallback after
  30 s, synchronized rounds with private answers, reconnection without timer
  reset, forfeit after 20 s, both-disconnected cancellation, single
  finalisation, strangers denied).

### End-to-end journeys

Guest plays a full Classic game (uses 50:50) → results → public share page
(no questions) and PNG share image; Daily Challenge resume after refresh and
single attempt with ranking; admin creates → reviews → publishes a question
and validates a bad CSV; non-staff get 404 on `/admin`; a friend completes an
asynchronous challenge in a second browser; **two browsers complete a live
match**; axe scans of 7 pages plus gameplay and feedback.

## Bugs found by testing (fixed)

- Service worker’s first activation reloaded the page and aborted in-flight
  form submissions (sign-in).
- postgres.js double-encoded JSON parameters (stored settings and audience
  data as JSON strings) — only visible against real Postgres.
- CSV files with mixed line endings merged rows.
- Duplicate options and impossible dates slipped through CSV validation.
- A forfeit at the exact kick-off cancelled the match instead of awarding it.
- Random-answer load traffic re-calibrated every question to “hard” and made
  Classic unavailable; selection now prefers calibrated difficulty but falls
  back to editorial difficulty.
- Orange call-outs failed WCAG contrast with white text.

## Load measurements

`scripts/load-test.ts`: N concurrent virtual guests each start a Classic game
and answer all 15 questions (random answers, 300 ms think time ⇒ far denser
than real play). Single `next start` process, **4 vCPU / 16 GB container**,
PostgreSQL 16 on the same machine, pool size 10, 72 questions.

| Concurrent bots | Requests | Throughput | Errors | answer p50 / p95 | next p50 / p95 |
|---|---|---|---|---|---|
| 100 | 3,200 | 186 req/s | 0 | 375 / 480 ms | 384 / 490 ms |
| 200 | 6,400 | 207 req/s | 0 | 811 / 963 ms | 844 / 1,013 ms |
| 400 | 12,800 | 212 req/s | 0 | 1,712 / 1,945 ms | 1,773 / 2,020 ms |

Embedded development database (single connection), same machine: ~60 req/s,
100 bots p95 ≈ 1.5–2.5 s, 0 errors — **not** representative of production.

Interpretation: one Node process saturates around **~210 req/s**, CPU-bound.
A real player makes roughly 2 requests per question every 10–20 s (≈0.1–0.2
req/s), so one process should serve on the order of 1,000 simultaneously
active players before latency degrades — an estimate, not a measurement.
Serverless deployment scales processes horizontally; Postgres connections
(pooler) and the leaderboard queries become the next limits. **Not tested:**
real network latency from African mobile networks, Supabase-hosted Postgres,
Vercel cold starts, more than one app process, Realtime fan-out, or sustained
multi-hour load. Run `npm run load-test` against a staging deployment before
launch.
