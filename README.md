# Fastora African Quiz Game

A mobile-first quiz game that makes African knowledge fun, competitive and
easy to share. Players start instantly as guests, climb a 15-question ladder
from easy to hard, learn from an explanation after every answer, take a
shared Daily Challenge, and compare results on leaderboards. Phase 2 adds
friend challenges, recorded (“ghost”) opponents, live two-player matches and
Ask the Audience, all behind feature flags.

The interface is a modern quiz-show stage, following the reference screens
Fastora supplied: a deep-blue spotlight stage, angled answer bars joined by
side rails, a circular timer emblem, gold accents and round lifeline buttons.
Fastora's own identity is original (no third-party marks).

**Stack:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth,
Realtime) · Vercel · PostHog · Sentry.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
```

No configuration is needed locally. An embedded Postgres is created in
`.data/`, migrations run automatically, and 72 clearly labelled **development
fixture** questions are seeded. These are unverified and must not be used in
production. Sign in with the development sign-in and set
`ADMIN_BOOTSTRAP_EMAILS` to reach `/admin`. Details: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## What works

**Phase 1 (enabled)**
- Guest play with no sign-up form; Google and email sign-in (Supabase Auth);
  guest progress kept when an account is created.
- Classic: 15 questions on a 5 easy / 5 medium / 5 hard ladder, server-side
  timers (20 s / 18 s / 15 s) and scoring (100 / 200 / 300), explanations
  with sources, and 50:50 and Change Question lifelines.
- Daily Challenge: one fixed 10-question set per day (Africa/Lagos), one
  attempt per player, resume on refresh, countdown to the next challenge, and
  a results grid.
- Daily and all-time leaderboards with deterministic tie-breaks; only
  signed-in results are ranked.
- Results screen with a per-question review; sharing by native share sheet,
  WhatsApp, copied text, a downloadable PNG, and a public share page with an
  Open Graph image.
- Profile: name, avatar, country, statistics, history, and replay and helper
  settings.
- Admin: content overview, search and filters, create/edit/preview, the
  draft → review → approve → archive workflow with versioning, duplicate
  detection, CSV template, import with validation preview and row-level
  errors, player reports, audit history, versioned game settings and
  feature flags.
- Installable PWA with an offline page and an update prompt; gameplay and
  answers are never cached.

**Phase 2 (built, off by default):** Challenge a Friend links, ghost
opponents from real lifeline-free runs, live matchmaking and synchronized
two-player matches with reconnect and forfeit handling, and Ask the Audience
with live voting and a historical fallback.

## Docs

| Document | Contents |
|---|---|
| [docs/GAME_RULES.md](docs/GAME_RULES.md) | All proposed defaults and the decisions behind them |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Code map, game flow, data model, security model, realtime, PWA |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Tokens, components, accessibility |
| [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md) | Question fields, editorial workflow, CSV import, moderation |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Local setup, Supabase + Vercel deployment, env vars |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Alerts, analytics events, staff roles, incidents |
| [docs/TESTING.md](docs/TESTING.md) | Test coverage, results, load measurements, limits |

Database: `db/migrations/*.sql` (portable; the same files run on Supabase and
locally), plus `db/supabase/realtime_policies.sql`.

## Tests

```bash
npm run typecheck
npm test                                    # unit + integration (embedded Postgres)
TEST_DATABASE_URL=postgres://… npm test     # same suite on a real Postgres server
npm run build && npm run test:e2e           # Playwright journeys + axe accessibility
```

## Launch dependencies (not in this repository)

1. **A verified question bank** of about 1,000–1,500 questions, imported
   through Admin → Import. Archive the development fixtures before launch.
2. **Final branding**: logo, palette and name. The colour tokens were taken
   from the reference screenshots because fastora.africa could not be reached
   from the build environment. Replace the tokens in `src/app/globals.css`
   and the mark in `src/components/Brand.tsx`.
3. **Domain**, plus `NEXT_PUBLIC_SITE_URL`.
4. **Production credentials**: a Supabase project with Google OAuth and the
   email provider, Vercel, `SESSION_SECRET`, `CRON_SECRET`, and optionally
   PostHog and Sentry.
5. **A reviewed privacy policy.** `/privacy` holds a development draft.
6. **A staging load test** on the real infrastructure. See
   [docs/TESTING.md](docs/TESTING.md).

## Known limitations

- Guest identity is per device (a cookie), so Daily attempt enforcement for
  guests is weaker across devices. Only signed-in results are ranked.
- Answers are timed on the server. Slow connections can lose a fraction of a
  second; a 1 s grace period absorbs typical latency.
- Friend challenges are casual: questions can be shared between friends, so
  their results are never ranked.
- Live matches poll every second. Supabase Realtime pings only speed them up,
  and only for signed-in players.
- Leaderboards are computed on demand. At large scale, materialise the best
  results per board as described in ARCHITECTURE.md.
- Sentry and PostHog are wired through lightweight HTTP adapters, not their
  full SDKs, so there is no performance tracing yet.
- The interface is English only. The data model stores `language` per
  question.
- Out of scope for V1, as specified: phone OTP, payments, prizes,
  tournaments, kids mode, country challenges and sponsor campaigns. A
  `sponsor_ref` field is reserved.
