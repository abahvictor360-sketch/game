# Architecture

## Stack

| Concern | Choice |
|---|---|
| Web app | Next.js 16 (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS 4 with design tokens in `src/app/globals.css` |
| Database | Supabase Postgres in production (`postgres` driver via `DATABASE_URL`); embedded Postgres (PGlite) locally and in tests: **the same SQL migrations run on both** |
| Auth | Supabase Auth (Google OAuth + email magic link) → linked to a Fastora player; signed session cookie for guests and accounts |
| Realtime | Supabase Realtime private channels as a *ping* accelerator; authoritative state is always fetched from the server (polling fallback) |
| Deadlines | Durable timestamps in Postgres, resolved lazily on every read/write and by a scheduled sweeper (`/api/cron/tick`) |
| Analytics / errors | PostHog capture API and Sentry envelope API behind small adapters (`analytics.ts`, `monitoring.ts`) |
| Hosting | Vercel-compatible (`vercel.json` cron) |

## Code map

```
src/lib/game/          Pure rules: rules.ts (versioned config + mode rules), scoring.ts, dates.ts
src/lib/shared/        Types and schemas shared by client and server (no secrets)
src/lib/server/        Server-only modules ("server-only" import guard)
  db.ts                Db adapter (postgres.js | PGlite), migration runner
  bootstrap.ts         First-run config/categories, dev fixtures, module registration
  config.ts            Versioned game_config + feature flags
  content.ts           Question bank, versioning workflow, import commit
  csv.ts               CSV template + validation (no writes)
  players.ts           Guests, accounts, guest→account merge, profile
  identity.ts          Signed cookie → current player
  staff.ts             Server-side staff authorisation (staff_roles)
  game/selection.ts    Question selection, freshness, effective difficulty
  game/sessions.ts     Engine: issue → answer → advance, timeouts, lifelines, views
  game/daily.ts        Daily Challenge publish/start/status
  game/leaderboard.ts  Daily + all-time boards
  game/results.ts      Public-safe summaries + owner review
  game/phase2.ts       Friend challenges, ghost recordings, Ask the Audience
  game/matches.ts      Matchmaking + live match state machine
src/app/               Routes: (site) player pages, play/[id], match/[id], admin/*, api/*
src/components/        Presentation (design system, game UI, admin UI)
db/migrations/         Portable SQL migrations (schema, RLS, grants)
db/supabase/           Supabase-only SQL (Realtime channel policies)
tests/                 unit, integration (real Postgres via PGlite), e2e (Playwright)
```

The engine exposes small registration hooks (`registerFixedSource`,
`registerLifeline`, `registerViewDecorator`, `onSessionCompleted`,
`registerPreStep`) so modes and Phase 2 features plug in without the core
knowing about them.

## Game flow (solo modes)

1. `POST /api/play/{classic|daily|ghost}`: server creates the session with the
   active ruleset version and issues question 0 (`issued_questions` row with
   `issued_at`/`deadline_at`, shuffled option order).
2. `GET /api/sessions/:id`: returns the current question **without** the answer
   key or explanation, plus `serverTime` so the client can correct clock skew.
3. `POST /api/sessions/:id/answer {issuedId, optionId, submissionKey}`: locks
   the session row, rejects foreign/stale/duplicate/expired submissions, judges
   timing and correctness on the server, records the outcome, returns feedback
   (now including the correct option and explanation).
4. `POST /api/sessions/:id/next {fromPosition}`: idempotent advance; completes
   the session after the last question.
5. Timeouts: if a deadline (+grace) passes with no answer, the next read/write
   or the sweeper records a timeout. Browser timers are display-only.

Every mutation runs in a transaction with `SELECT … FOR UPDATE` on the session
row; uniqueness constraints back up the logic (one active question per
position, one lifeline use per type, one daily attempt per player/date, one
vote per helper, one answer per player per match round).

## Security model

- The browser never talks to the database in Phase 1; all reads go through
  server routes that return only what the player may see.
- **Answer keys** live in `private.answer_keys` (separate schema, no grants to
  `anon`/`authenticated`). Explanations and keys are sent only after the
  player's answer is locked (or a match round closes).
- RLS is enabled on every table; client roles get only: categories (read),
  their own profile row (selected columns, no email), their own session
  summaries. Tested in `tests/integration/content-security.test.ts`.
- Scores are computed only by server code; clients send option ids.
- Staff access is checked on the server against `staff_roles`; non-staff get
  404 for `/admin`. The admin bootstrap uses the identity provider's verified
  email (`ADMIN_BOOTSTRAP_EMAILS`), never user-editable metadata.
- Signed (HMAC-SHA256) httpOnly SameSite=Lax session cookie; same-origin check
  on state-changing requests; Postgres-backed rate limits for gameplay,
  matchmaking, voting, reports and imports.
- No browser source maps in production; `server-only` guards prevent server
  modules being bundled for the client.

## Realtime and recovery

Live match clients poll `GET /api/match/:id` every second (also the presence
heartbeat). With Supabase configured and a signed-in player, they also join
the private channel `match:<id>`; the server broadcasts payload-free
“changed” pings (`realtime.ts`), authorised by
`db/supabase/realtime_policies.sql`. Every update is a full fresh view, so
missed or duplicated events are harmless.

## PWA

`app/manifest.ts`, generated icons (`/icons/192`, `/icons/512`, maskable),
`public/sw.js`: cache-first for immutable build assets and icons, network-only
for pages with an offline fallback page, and **never** caches `/api/*` or game
state. Updates are offered with an “Update” prompt; the page reloads only when
the player accepts.

## Scaling notes

- Leaderboards are computed with window functions over indexed columns. At
  large volumes, materialise per-day and per-scoring-key bests (e.g. a
  `leaderboard_best` table maintained on completion): the query layer is
  isolated in `leaderboard.ts`.
- The sweeper is idempotent and safe to run concurrently.
- PGlite is single-connection and for development/tests only; production uses
  Supabase's pooler (`prepare: false`).
