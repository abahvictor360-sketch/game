# Fastora African Quiz Game

A mobile-first quiz game that makes African knowledge fun, competitive and easy
to share. Players start instantly as guests, climb a 15-question ladder from
easy to hard, learn from an explanation after every answer, take a shared Daily
Challenge, and compare results on leaderboards. Phase 2 adds friend
challenges, recorded ("ghost") opponents, live two-player matches and Ask the
Audience, all behind feature flags.

> **This README is the complete handover.** If you clone this repository with a
> different account (or a new Claude session), read this file top to bottom
> and you can continue exactly where the work stopped. Deeper detail is in
> [`docs/`](docs) — each section below links to the relevant file.

| Phone — question | Phone — feedback | Desktop |
|---|---|---|
| ![Question](docs/screenshots/question-phone.png) | ![Feedback](docs/screenshots/feedback-phone.png) | ![Desktop](docs/screenshots/question-desktop.png) |

---

## Contents

1. [Project status at a glance](#1-project-status-at-a-glance)
2. [Continue from here (step by step)](#2-continue-from-here-step-by-step)
3. [Supabase and Vercel status](#3-supabase-and-vercel-status)
4. [Tech stack and versions](#4-tech-stack-and-versions)
5. [Repository map](#5-repository-map)
6. [How the game works (architecture)](#6-how-the-game-works-architecture)
7. [Database](#7-database)
8. [Game rules and defaults](#8-game-rules-and-defaults)
9. [Design system](#9-design-system)
10. [Authentication and admin access](#10-authentication-and-admin-access)
11. [Feature flags (Phase 2)](#11-feature-flags-phase-2)
12. [Environment variables](#12-environment-variables)
13. [Commands](#13-commands)
14. [Testing](#14-testing)
15. [Deployment](#15-deployment)
16. [Content (questions)](#16-content-questions)
17. [Gotchas — read before changing code](#17-gotchas--read-before-changing-code)
18. [What is left to do (backlog)](#18-what-is-left-to-do-backlog)
19. [Decisions log](#19-decisions-log)
20. [History of the build](#20-history-of-the-build)

---

## 1. Project status at a glance

| Area | Status |
|---|---|
| **Phase 1** (Classic, lifelines, Daily, guest play, auth, profiles, leaderboards, sharing, admin, CSV import, PWA) | ✅ Built and tested |
| **Phase 2** (friend challenges, ghost opponents, live matches, Ask the Audience) | ✅ Built and tested, **switched off** by default |
| Unit + integration tests (57) | ✅ Pass on embedded Postgres **and** real PostgreSQL 16 |
| End-to-end tests (14, incl. two-browser live match and accessibility scans) | ✅ Pass |
| Supabase | ✅ Dedicated project **`fastora`** created, schema + RLS + Realtime policy applied (see §3) |
| Vercel | ✅ Project **`fastora-quiz`** linked to this repo, env vars set — ⚠️ needs `DATABASE_URL` before it can serve (see §3) |
| Verified question bank | ❌ Not supplied — only 72 **unverified development fixtures** exist |
| Final branding (logo, palette from fastora.africa) | ❌ Pending — palette taken from reference screenshots |
| Pull request | ❌ Not opened — the GitHub repo has no `main` branch yet (see §2) |

**Where the code is:** GitHub `abahvictor360-sketch/game`, branch
**`claude/youthful-ptolemy-26brkb`** (currently the repo's only branch).

---

## 2. Continue from here (step by step)

### 2.1 Get the code running (≈5 minutes)

Requirements: **Node.js 22+** and npm. Nothing else is needed locally.

```bash
git clone https://github.com/abahvictor360-sketch/game.git fastora
cd fastora
git checkout claude/youthful-ptolemy-26brkb
npm install
npm run dev            # → http://localhost:3000
```

With no configuration the app creates an **embedded Postgres** (PGlite) in
`.data/pglite`, runs the migrations, and seeds 72 labelled development
questions. You can play immediately.

To use the admin area locally:

```bash
echo "ADMIN_BOOTSTRAP_EMAILS=you@example.com" >> .env.local
npm run dev
# open /auth/signin → "Development sign-in" → enter you@example.com → visit /admin
```

To see Phase 2 features locally add
`FEATURE_FLAGS=multiplayer,ghostOpponents,friendChallenges,askAudience` to
`.env.local` (or toggle them in **Admin → Settings**).

### 2.2 Verify everything still works

```bash
npm run typecheck
npm test                         # 57 unit + integration tests
npm run build && npm run test:e2e   # 14 Playwright tests (needs Chromium: npx playwright install chromium)
```

### 2.3 Tidy up the Git setup (recommended first job)

The repository has no default `main` branch — all work is on
`claude/youthful-ptolemy-26brkb`. To make normal pull requests possible:

```bash
git checkout -b main
git push -u origin main
# then on GitHub: Settings → Branches → set "main" as the default branch
```

New work should then go on feature branches with PRs into `main`.

### 2.4 Pick up the backlog

The prioritised list of what is left is in [§18](#18-what-is-left-to-do-backlog).
The single most important launch items are: finishing the **manual
Supabase/Vercel steps in §3**, the **verified question bank**, and **final
branding**.

### 2.5 If you are a new Claude Code session

Tell it: *"Read README.md fully, then continue with the backlog in §18."*
Key facts it needs are all here, especially [§17 Gotchas](#17-gotchas--read-before-changing-code)
(Next.js 16 changes, the PGlite transaction rule, JSON parameters, test
commands).

---

## 3. Supabase and Vercel status

### Supabase — project `fastora` ✅

| | |
|---|---|
| Organisation | *xpelbeauty001@gmail.com's Org* |
| Project | **`fastora`** — ref `tsfhuyxvznpzbmwcswkq`, region `eu-west-2` (London) |
| API URL | `https://tsfhuyxvznpzbmwcswkq.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/tsfhuyxvznpzbmwcswkq |
| Schema | Migrations `0001`–`0003` applied (31 public + 3 private tables, RLS on all) and recorded in `private.app_migrations`, so `npm run db:migrate` will skip them |
| Realtime | `db/supabase/realtime_policies.sql` applied |
| Security advisor | Only "RLS enabled, no policy" notices — intentional: browsers get no direct access; the server reads/writes |
| Data | Empty. Default rules and categories are created automatically on the first request. No dev fixtures (they never go to Supabase). |

> The other Supabase project in the same organisation, **"Xtend"**
> (`jxbugdxeofbjspdcnvmx`), is a **separate live app** — do not deploy Fastora
> there or run these migrations against it.

### Vercel — project `fastora-quiz` ✅ (one manual step left)

| | |
|---|---|
| Team | *abahvictor360-3017's projects* (`team_Y1PGVkrNWi7NT2b2NtLd2TUh`) |
| Project | **`fastora-quiz`** (`prj_58P2BqUFiruxui748V3RJpzUADtY`) |
| Git | `abahvictor360-sketch/game`, production branch `claude/youthful-ptolemy-26brkb` — **every push deploys** |
| Env vars set | `SESSION_SECRET` (sensitive), `CRON_SECRET` (sensitive), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ADMIN_BOOTSTRAP_EMAILS=abahvictor360@gmail.com` |
| Cron | Daily at 22:30 UTC (Hobby plan allows daily crons only) |

> A different, older Vercel project named **`fastora`** exists in the same team
> (linked to another repository). It was deliberately left untouched.

### ⚠️ Remaining manual steps (only you can do these)

1. **Database connection string → Vercel.** A new Supabase project gets a
   random database password that nobody can read back, so:
   - Supabase dashboard → **Project Settings → Database → Reset database password** (save it).
   - Supabase dashboard → **Connect** → *Transaction pooler* → copy the URI
     (`postgresql://postgres.tsfhuyxvznpzbmwcswkq:[YOUR-PASSWORD]@aws-…pooler.supabase.com:6543/postgres`).
   - Vercel → `fastora-quiz` → **Settings → Environment Variables** → add
     `DATABASE_URL` (Production + Preview, *Sensitive*) → **Redeploy**.
   - Alternative: install the **Supabase integration** from the Vercel
     Marketplace and connect `fastora-quiz` to `fastora`; it sets `POSTGRES_URL`,
     which the app also accepts.
2. **Make the site public.** Vercel enabled *Deployment Protection* (Vercel
   login required) by default. Vercel → `fastora-quiz` → **Settings →
   Deployment Protection** → turn off *Vercel Authentication* for production
   (or add a custom domain).
3. **Supabase Auth URLs.** Supabase → **Authentication → URL Configuration**:
   Site URL = your production URL (e.g. `https://fastora-quiz.vercel.app`);
   Redirect URLs: add `https://fastora-quiz.vercel.app/auth/callback` (and your
   custom domain's `/auth/callback` later). Then add `NEXT_PUBLIC_SITE_URL`
   with the same URL in Vercel.
4. **Google sign-in (optional).** Create an OAuth client in Google Cloud
   (redirect URI `https://tsfhuyxvznpzbmwcswkq.supabase.co/auth/v1/callback`),
   then Supabase → Authentication → Providers → Google. Email magic links work
   without this (Supabase's built-in mailer is rate-limited — add custom SMTP
   before launch).
5. Sign in on the live site with **abahvictor360@gmail.com** → you become
   admin → import questions in **/admin/import**.

## 4. Tech stack and versions

| Concern | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router) | **16.3.8** (patched; see §17) |
| UI | React | 19.2.8 |
| Language | TypeScript | 5.8.3 |
| Styling | Tailwind CSS (v4, CSS-first `@theme`) | 4.1.18 |
| Validation | zod | 3.25.76 |
| Production DB | Supabase Postgres via `postgres` (postgres.js) | 3.4.9 |
| Local/test DB | PGlite (Postgres compiled to WASM) | 0.5.8 |
| Auth | Supabase Auth via `@supabase/ssr` + `@supabase/supabase-js` | 0.12.7 / 2.116.0 |
| CSV | papaparse | 5.5.3 |
| Unit/integration tests | Vitest | 3.2.7 |
| E2E tests | Playwright (+ axe-core) | 1.56.1 |
| Hosting | Vercel (cron in `vercel.json`) | — |
| Analytics / errors | PostHog capture API, Sentry envelope API (lightweight adapters) | — |

`package-lock.json` is committed — always use `npm install` (not `npm update`)
unless you intend to upgrade.

---

## 5. Repository map

```
.
├── README.md                    ← this handover
├── docs/                        ← detailed docs (rules, architecture, design, content, deploy, ops, testing)
├── db/
│   ├── migrations/              ← portable SQL, runs on Supabase AND PGlite
│   │   ├── 0001_platform_compat.sql   roles/auth stubs for non-Supabase Postgres (no-op on Supabase)
│   │   ├── 0002_core_schema.sql       all tables (Phase 1 + 2)
│   │   └── 0003_access_control.sql    RLS on every table + minimal grants
│   └── supabase/realtime_policies.sql ← Supabase-only, apply manually (live-match channels)
├── scripts/
│   ├── migrate.ts               npm run db:migrate
│   ├── seed.ts                  npm run db:seed (dev fixtures; refuses in production)
│   ├── grant-admin.ts           npm run admin:grant -- email [admin|editor]
│   └── load-test.ts             npm run load-test (BASE, PLAYERS, THINK_MS env)
├── public/sw.js                 service worker (static cache + offline page; never caches /api)
├── src/
│   ├── app/                     Next.js routes
│   │   ├── (site)/              player pages with header/footer: home, play/classic, daily,
│   │   │                        leaderboard, profile, how-to-play, privacy, results/[id],
│   │   │                        challenge/[token], versus, help
│   │   ├── play/[id]/           gameplay screen (full-screen)
│   │   ├── match/[id]/          live match screen
│   │   ├── s/[id]/              public share page + opengraph-image (PNG)
│   │   ├── auth/                signin, callback (Supabase), dev (dev sign-in), signout
│   │   ├── admin/               overview, questions (list/new/[id]), import, reports, settings
│   │   ├── api/                 play/[mode], sessions/[id]/{answer,next,lifeline}, reports,
│   │   │                        share-event, challenges, match/*, audience/*, cron/tick
│   │   ├── manifest.ts, icon.tsx, apple-icon.tsx, icons/[size]  (PWA)
│   │   └── globals.css          ← design tokens (colours etc.)
│   ├── components/              Brand, Avatar, ui (Panel, HexBar, Tabs…), game/*, site/*,
│   │                            results/*, admin/*
│   └── lib/
│       ├── game/                PURE logic: rules.ts (defaults + flags), scoring.ts, dates.ts
│       ├── shared/              client+server safe: types, question input schema, categories, countries
│       ├── client/              browser helpers: api fetch wrapper, synthesized sound
│       └── server/              SERVER ONLY (guarded by `import 'server-only'`)
│           ├── db.ts            DB adapter (postgres.js | PGlite) + migration runner
│           ├── bootstrap.ts     first-run config/categories/fixtures + module registration
│           ├── config.ts        versioned game_config, feature flags
│           ├── content.ts       question bank + versioning workflow
│           ├── csv.ts           CSV template + validation
│           ├── players.ts       guests, accounts, merge, profile
│           ├── identity.ts / session-cookie.ts   signed cookie → current player
│           ├── staff.ts         admin/editor authorisation
│           ├── auth-provider.ts supabase | dev | none
│           ├── api.ts, errors.ts, rate-limit.ts, audit.ts, clock.ts
│           ├── analytics.ts, monitoring.ts, realtime.ts
│           ├── fixtures.ts      72 UNVERIFIED dev questions
│           └── game/            sessions.ts (engine), selection.ts, daily.ts, leaderboard.ts,
│                                results.ts, phase2.ts (friend/ghost/audience), matches.ts
├── tests/
│   ├── unit/                    pure logic
│   ├── integration/             real Postgres (PGlite by default; TEST_DATABASE_URL for a server)
│   ├── e2e/                     Playwright journeys + axe accessibility
│   └── support/                 test DB factory, fake clock, helpers
├── playwright.config.ts, vitest.config.ts, next.config.ts, postcss.config.mjs, tsconfig.json
├── vercel.json                  cron: /api/cron/tick daily 22:30 UTC
└── .env.example                 every environment variable, documented
```

---

## 6. How the game works (architecture)

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- **The server is the referee.** The browser never receives the answer key,
  future questions, or the explanation before answering. It sends only the
  chosen option id; the server judges timing and correctness and computes the
  score.
- **Solo game loop:** `POST /api/play/{classic|daily|ghost}` → server creates a
  session pinned to the current ruleset version and issues question 0 with a
  server deadline → `GET /api/sessions/:id` (current question + `serverTime`)
  → `POST …/answer {issuedId, optionId, submissionKey}` → feedback (now with
  correct answer + explanation) → `POST …/next {fromPosition}` (idempotent).
- **Timeouts are durable:** deadlines are stored in Postgres. Any later read or
  write, or the cron sweeper, records the timeout. Browser timers only display.
- **Concurrency safety:** every mutation runs in a transaction that locks the
  session row; unique constraints back it up (one answer per question, one
  lifeline use per type, one daily attempt per player per day, etc.).
- **Plug-in engine:** modes and Phase 2 features register hooks
  (`registerFixedSource`, `registerLifeline`, `registerViewDecorator`,
  `onSessionCompleted`, `registerPreStep`) in `sessions.ts`; registrations
  happen via side-effect imports in `bootstrap.ts`.
- **Live matches** are a state machine in `matches.ts` advanced under a row
  lock on every poll/answer and by the sweeper (countdown → open round →
  closed/reveal → next … → finalise once). Clients poll every second; Supabase
  Realtime private-channel "pings" are an optional accelerator.
- **Security:** RLS on every table; client DB roles can read almost nothing
  (no answer keys, options, versions, emails); answer keys are in the
  `private` schema; signed httpOnly cookie; same-origin checks; Postgres-backed
  rate limits; staff roles checked server-side (non-staff get 404 on `/admin`).

---

## 7. Database

Migrations are plain SQL in `db/migrations/` and are applied in filename order
by `runMigrations()` (tracked in `private.app_migrations`). The same files run
on Supabase, plain Postgres and PGlite.

Main tables (all in `public` unless noted):

| Group | Tables |
|---|---|
| Config | `game_config` (versioned rules + flags; never edited in place) |
| Players | `players` (guest/account, settings jsonb, `merged_into`), `staff_roles` |
| Question bank | `categories`, `questions`, `question_versions`, `question_options`, **`private.answer_keys`**, `question_stats`, `question_reports`, `content_imports` |
| Gameplay | `game_sessions`, `issued_questions`, `lifeline_uses`, `player_question_history` |
| Daily | `daily_challenges`, `daily_challenge_questions`, `daily_attempts` |
| Phase 2 | `friend_challenges`, `friend_challenge_attempts`, `ghost_recordings`, `matchmaking_entries`, `matches`, `match_questions`, `match_participants`, `match_answers`, `helper_presence`, `audience_requests`, `audience_invitations`, `audience_votes` |
| Ops | `audit_events`, `ops_alerts`, `private.rate_limits` |

**To change the schema:** add a new file `db/migrations/0004_<name>.sql`
(never edit an applied migration), keep it Postgres-portable, enable RLS on
any new table, then run `npm test` (PGlite) and, ideally,
`TEST_DATABASE_URL=… npm test` (real Postgres).

---

## 8. Game rules and defaults

All are **proposed defaults** stored in `game_config` and editable in
**Admin → Settings** (each save creates a new ruleset version; games in
progress keep theirs). Code defaults: `src/lib/game/rules.ts`. Full table and
reasoning: [docs/GAME_RULES.md](docs/GAME_RULES.md).

Highlights: Classic 15 questions (5 easy / 5 medium / 5 hard), timers
20 s / 18 s / 15 s, points 100 / 200 / 300, wrong or timeout = 0, play all 15
(elimination is an optional setting), 1 s latency grace. Lifelines once each:
50:50 (timer continues), Change Question (fresh timer; if no replacement, not
consumed), Ask the Audience (Phase 2). Daily: 10 questions, 20 s each, no
lifelines, resets at midnight Africa/Lagos, one attempt, only signed-in
players ranked. Versus: same ladder, speed bonus
`floor(base × 0.25 × remaining / duration)`, no lifelines, 30 s matchmaking
fallback, 20 s reconnection window.

---

## 9. Design system

Style: a modern **quiz-show stage** (requested by the owner with reference
screenshots): deep-blue spotlight background, angled hexagonal question/answer
bars joined by side rails, circular gold timer emblem, gold points ribbon,
round lifeline buttons. Fastora's identity is original (no third-party
marks).

- **All colours/tokens:** `src/app/globals.css` (`@theme` block).
- **Logo/wordmark:** `src/components/Brand.tsx`.
- **Current palette** (from the reference screenshots, because
  www.fastora.africa was blocked from the build environment):
  stage blue `#1253B8` → `#04103A`, bars `#1E1B38`, rails `#E6EDFF`,
  gold `#FCC81A`, orange `#BF5500` (text-safe) / `#FF9A3C` (accent),
  violet `#5B34B8`, correct `#12B76A`, wrong `#F2603F`, ivory `#FFFDF7`.
- **To apply the official Fastora palette:** replace the hex values in
  `globals.css`, then run `npm run build && npx playwright test tests/e2e/a11y.spec.ts`
  to confirm contrast still passes.

Details, components and accessibility rules: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

---

## 10. Authentication and admin access

- **Guests:** created automatically on first play; identified by a signed
  httpOnly cookie (`fq_session`, HMAC with `SESSION_SECRET`).
- **Accounts:** Supabase Auth — Google OAuth and email magic link. The
  callback (`/auth/callback`) links the Supabase user to a Fastora player;
  if the visitor was a guest, their history comes with them (guest-played
  results stay unranked; no duplicate Daily attempts).
- **Without Supabase configured** (local development) a clearly labelled
  **development sign-in** (`/auth/dev`) lets you type any email. It is
  disabled in production automatically.
- **Admins/editors:** `staff_roles` table. Bootstrap via
  `ADMIN_BOOTSTRAP_EMAILS` (matched against the verified sign-in email on first
  login) or `npm run admin:grant -- email admin`. Editors create/edit/submit;
  admins also approve, archive, change settings.

---

## 11. Feature flags (Phase 2)

Stored in `game_config.flags`, toggled in **Admin → Settings**. For local
development they can be forced on with
`FEATURE_FLAGS=multiplayer,ghostOpponents,friendChallenges,askAudience`.

| Flag | Feature |
|---|---|
| `friendChallenges` | "Challenge a friend" link after a Classic game |
| `ghostOpponents` | Race recordings of real players' games (always labelled) |
| `multiplayer` | Live two-player matchmaking (`/versus`, `/match/[id]`) |
| `askAudience` | Ask the Audience lifeline + `/help` page for volunteer voters |

When a flag is off, its screens return 404 and nothing appears in the UI.

---

## 12. Environment variables

Full list with comments: [`.env.example`](.env.example). Summary:

| Variable | Local | Production |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | optional | **required** (share links, OG images) |
| `SESSION_SECRET` | optional (insecure default + warning) | **required**, ≥32 chars (`openssl rand -base64 48`) |
| `DATABASE_URL` (or `POSTGRES_URL` from the Supabase integration) | empty → embedded DB | **required**: Supabase transaction pooler (port 6543); SSL is enabled automatically |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | empty → dev sign-in | **required** for sign-in |
| `SUPABASE_SERVICE_ROLE_KEY` | — | optional, server only (Realtime pings) |
| `ADMIN_BOOTSTRAP_EMAILS` | your email | first admin(s) |
| `CRON_SECRET` | — | **required** for `/api/cron/tick` |
| `POSTHOG_KEY`, `POSTHOG_HOST`, `SENTRY_DSN` | — | optional |
| `FEATURE_FLAGS`, `SEED_FIXTURES`, `ALLOW_DEV_AUTH`, `INSECURE_COOKIES` | dev/test only | **never set** |

Never commit `.env.local` (it is git-ignored).

---

## 13. Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 (embedded DB unless `DATABASE_URL`) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | TypeScript (there is no ESLint setup; `next lint` was removed in Next 16) |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run test:e2e` | Playwright (requires `npm run build` first) |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (or local DB) + default config/categories |
| `npm run db:seed` | Seed the 72 dev fixtures (refuses in production) |
| `npm run admin:grant -- you@example.com admin` | Grant a staff role |
| `BASE=… PLAYERS=50 npm run load-test` | Load test against a running server |

---

## 14. Testing

Full report with measured numbers: [docs/TESTING.md](docs/TESTING.md).

- **57 unit + integration tests** — scoring, deadlines and grace, duplicate and
  concurrent submissions, lifelines, freshness, Daily uniqueness and resume,
  guest→account merge, versioning, RLS denial, CSV validation, friend
  challenges, ghosts, audience (live + fallback), live matches (sync,
  privacy, reconnect, forfeit, cancel). They run on PGlite by default:
  ```bash
  npm test
  # same tests on a real Postgres server (user must be able to CREATE DATABASE):
  TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm test
  ```
- **14 e2e tests** (Pixel 7 viewport): guest full game + sharing, Daily resume,
  admin create→approve + CSV errors, admin 404 for non-staff, friend
  challenge across two browsers, **live match across two browsers**, axe
  accessibility on 7 pages + gameplay. Run with `npm run build && npm run test:e2e`.
- **Load:** one Node process + PostgreSQL 16 on 4 vCPU handled ~210 req/s,
  0 errors up to 400 simultaneous bots. Not yet measured on Supabase/Vercel.

---

## 15. Deployment

Current state and remaining manual steps: **§3**. Full guide:
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). How it is wired:

- **Database:** Supabase project `fastora`. Future schema changes: add
  `db/migrations/000N_*.sql`, then run
  `DATABASE_URL="<session pooler or direct URL, port 5432>" npm run db:migrate`
  (or apply the SQL in the Supabase SQL editor and insert the filename into
  `private.app_migrations`).
- **Hosting:** Vercel project `fastora-quiz`, auto-deploys on every push to
  `claude/youthful-ptolemy-26brkb` (change the production branch in Vercel →
  Settings → Git if you create `main`).
- **Cron:** `vercel.json` runs `/api/cron/tick` daily at 22:30 UTC (Hobby plan
  limit). It publishes the next Daily Challenge; live matches, timeouts and
  audience votes are also advanced on every request, so the daily cron is
  enough. On a Pro plan you can change it to every minute (`* * * * *`).
- **Phase 2:** switch features on in **Admin → Settings** when ready.

## 16. Content (questions)

- The game needs roughly **1,000–1,500 verified questions** (aim for ≥200 per
  difficulty across all nine categories). Import them in **Admin → Import**
  using the downloadable CSV template; rows are validated before anything is
  saved, and imports never auto-publish.
- The **72 dev fixtures** in `src/lib/server/fixtures.ts` are written for
  testing, **not verified**, tagged `dev-fixture`, flagged `is_fixture`, and
  seeded only into the local embedded DB. The admin overview warns while any
  are live.
- Workflow: draft → review → approve (admin) → archive. Editing a live
  question makes a new version; games keep the version they used.

Full guide (fields, CSV format, moderation, calibration):
[docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md).

---

## 17. Gotchas — read before changing code

1. **Next.js 16 is not Next.js 14/15.** `middleware` is now `proxy`, request
   APIs (`cookies()`, `headers()`, `params`, `searchParams`) are async only,
   `next lint` is gone, Turbopack is the default. Bundled docs:
   `node_modules/next/dist/docs/`. Next 16.3.8 is pinned because earlier 16.x
   versions have a high-severity advisory.
2. **PGlite transaction rule (important):** the embedded DB has one
   connection; a plain `db.query(...)` waits for any open transaction. So
   **never call `db.query`/`ensureReady()`-based helpers from inside a
   `db.tx(q => …)` callback — always use the `q` you were given**, otherwise
   local dev and tests hang forever.
3. **JSON parameters:** pass JSON as a string with a cast, e.g.
   `q.query('… $1::jsonb', [JSON.stringify(x)])` (helper `pgJson`). The
   Postgres adapter is configured not to double-encode strings. Arrays: use
   `pgArray(values)` with `$n::uuid[]`/`$n::text[]`.
4. **Scripts and `server-only`:** CLI scripts importing server modules must run
   with `tsx --conditions=react-server` (already set in `package.json`).
   Vitest aliases `server-only` to an empty module.
5. **Never trust the client:** new endpoints must accept ids, not scores or
   verdicts; reveal answers only after lock; add a rate limit
   (`rateLimit(db, key, limit, windowSec)`); wrap with `api()` for error
   handling + same-origin check.
6. **Answer privacy test:** `tests/integration/classic.test.ts` asserts no
   `correctOptionId`/`explanation` appears before answering — keep it passing
   when you change `SessionView`.
7. **Service worker:** `public/sw.js` must never cache `/api/*` or game
   pages. If you change caching, bump `VERSION`. The page only reloads after
   the player accepts an update (a past bug reloaded on first visit).
8. **Time in tests:** use `fakeClock()` from `tests/support/db.ts`; server
   code reads time via `clock.now()` (never `new Date()` for game logic).
9. **Production safety rails:** without `SESSION_SECRET` sessions refuse to
   start; the embedded DB is refused when `VERCEL_ENV=production`; dev
   sign-in is disabled in production; the seed script refuses in production.
10. **Testing a production build on http://localhost:** set
    `SESSION_SECRET`, `INSECURE_COOKIES=true` and (for sign-in)
    `ALLOW_DEV_AUTH=true` — see `playwright.config.ts` for a working example.

---

## 18. What is left to do (backlog)

Ordered by priority.

**Launch blockers**
1. ~~Create a dedicated Supabase project~~ ✅ and ~~Vercel project~~ ✅ —
   finish the **manual steps in §3** (DATABASE_URL, deployment protection,
   auth URLs, Google OAuth, custom SMTP), then confirm the cron runs.
2. Connect a **custom domain** in Vercel and add it to Supabase Auth redirect URLs.
3. Import and approve the **verified question bank**; archive the 72 dev
   fixtures.
4. Apply the **official Fastora branding** (palette from fastora.africa, logo)
   in `globals.css` and `Brand.tsx`; re-run the accessibility tests.
5. Replace the draft `/privacy` page with a reviewed privacy policy (and add
   terms of use if required).
6. Run `npm run load-test` against **staging** and record results in
   `docs/TESTING.md`.
7. Create a `main` branch and open a PR from `claude/youthful-ptolemy-26brkb` (§2.3).

**Recommended soon after launch**
8. Set up CI (GitHub Actions): `npm ci`, `npm run typecheck`, `npm test`,
   `npm run build`, `npm run test:e2e`.
9. Add ESLint (flat config) — Next 16 removed `next lint`.
10. Customise the Supabase magic-link email template with Fastora branding.
11. Swap the lightweight Sentry/PostHog adapters for full SDKs if tracing or
    session replay is wanted.
12. Materialise leaderboard "best results" tables once traffic grows
    (see ARCHITECTURE → Scaling).
13. Admin UI to resolve `ops_alerts` and manage staff roles (currently SQL/CLI).

**Phase 2 rollout** (code done — product decisions needed)
14. Turn on friend challenges → ghost opponents → live matches → Ask the
    Audience one by one, watching analytics and errors.

**Later / out of V1 scope** (per the proposal): phone OTP, payments, cash
prizes, tournaments, kids mode, country challenges, sponsor campaigns
(a `sponsor_ref` field is reserved), more languages (the data model has a
`language` field per question).

---

## 19. Decisions log

Decisions made where the proposal left things open (all configurable):

| Decision | Choice | Why |
|---|---|---|
| Classic after a wrong answer | Keep playing all 15 | Proposal default; elimination is a setting |
| Daily ranking for guests | Shown but unranked | Guest identity is per-device, so enforcement is weaker |
| Guest results after sign-up | Kept in history, stay unranked | Prevents playing as a guest first, then signing in with the best score |
| Daily difficulty mix | 4 easy / 3 medium / 3 hard | Rising difficulty within 10 questions |
| Latency grace | 1 s | Absorbs typical mobile latency without allowing late answers |
| Leaderboard separation | By "scoring key" (hash of score-affecting rules) | A rules change starts a fresh board instead of mixing results |
| Tie-breaks | Score → correct answers → total response time; exact ties share rank | Deterministic and fair |
| Friend challenges | No lifelines, never ranked | Identical conditions; answers can be shared between friends |
| Ghost recordings | Only lifeline-free Classic runs, opt-out in profile, pseudonymous | Honest, comparable, privacy-respecting |
| Audience timer | Paused while voting, resumes with remaining time | Fair to the player |
| Difficulty calibration | Prefer observed difficulty (≥30 unassisted answers) but fall back to editorial | Calibration can never empty a difficulty tier |
| Fonts | System font stack | No font downloads on slow networks |
| Local database | PGlite (embedded Postgres) | Zero setup, and the same SQL as production |

---

## 20. History of the build

Built in one session (Claude Code) from the master build prompt based on the
*Fastora Proposal — African Quiz Game* PDF. Owner requests during the build:
"modern style" quiz-show look from reference screenshots; "pick Fastora
colour" (fastora.africa was blocked by the build environment's network policy,
so the palette came from the screenshots).

Commits on `claude/youthful-ptolemy-26brkb` (oldest first):

1. Scaffold: schema, rules engine, Classic services and tests
2. Quiz-show design system, gameplay client and API routes
3. Player screens, Phase 2 screens, PWA and content admin
4. Fixes: local data dir, rail overflow, lifeline sizing
5. Integration + unit tests; fixes for CSV line endings, validation gaps, forfeit ordering
6. Service-worker reload fix; e2e tests, scripts and docs
7. Real-Postgres testing; fixes for driver JSON encoding, calibration starvation, colour contrast
8. UI screenshots
9. Full handover README (continuation guide, backlog)
10. Vercel-safe config (daily cron, no embedded DB on Vercel, `POSTGRES_URL` + SSL support)
11. Infrastructure: Supabase project `fastora` (schema applied) and Vercel project `fastora-quiz` (linked, env vars)

Bugs found and fixed during testing are listed in
[docs/TESTING.md](docs/TESTING.md#bugs-found-by-testing-fixed).
