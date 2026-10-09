# Local setup and deployment

## Local development

Requirements: Node.js 22+, npm.

```bash
npm install
cp .env.example .env.local     # optional; defaults work locally
npm run dev                    # http://localhost:3000
```

With no `DATABASE_URL`, an embedded Postgres (PGlite) is created in
`.data/pglite`, migrations run automatically and the 72 **unverified
development fixtures** are seeded. Sign in with the labelled *development
sign-in* (any email; nothing is sent). To become an admin locally set
`ADMIN_BOOTSTRAP_EMAILS=you@example.com` before signing in, or run
`npm run admin:grant -- you@example.com`.

Enable Phase 2 locally with `FEATURE_FLAGS=multiplayer,ghostOpponents,friendChallenges,askAudience`
or in **Admin → Settings**.

Commands:

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit + integration tests (real Postgres via PGlite) |
| `npm run build && npm run test:e2e` | Playwright end-to-end tests (mobile viewport) |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (or the local DB) |
| `npm run db:seed` | Seed dev fixtures (refuses in production) |
| `npm run admin:grant -- email [admin\|editor]` | Grant a staff role |

## Production (Supabase + Vercel)

> Already provisioned: Supabase project `fastora` (`tsfhuyxvznpzbmwcswkq`,
> schema applied) and Vercel project `fastora-quiz` (linked, env vars set).
> See README §3 for the remaining manual steps.

1. **Supabase project**
   - Run migrations with the *session* connection string:
     `DATABASE_URL="postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres" npm run db:migrate`
   - In the SQL editor run `db/supabase/realtime_policies.sql` (live matches).
   - Auth → Providers: enable **Email** (magic link) and **Google** (OAuth
     client from Google Cloud). Auth → URL configuration: site URL = your
     domain; redirect URL = `https://<domain>/auth/callback`.
   - Customise the magic-link email template with Fastora branding.
2. **Vercel project** — environment variables (see `.env.example`):
   `NEXT_PUBLIC_SITE_URL`, `SESSION_SECRET` (`openssl rand -base64 48`),
   `DATABASE_URL` (transaction pooler, port 6543), `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only),
   `ADMIN_BOOTSTRAP_EMAILS`, `CRON_SECRET`, optionally `POSTHOG_KEY`,
   `SENTRY_DSN`. Do **not** set `ALLOW_DEV_AUTH`, `SEED_FIXTURES`,
   `FEATURE_FLAGS` or `INSECURE_COOKIES` in production.
3. **Cron** — `vercel.json` runs `/api/cron/tick` daily at 22:30 UTC (the
   Hobby plan allows daily crons only). It publishes today’s and tomorrow’s
   Daily Challenge, advances live matches, settles audience votes and abandons
   idle sessions. Matches, timeouts and votes are also advanced on every
   request, so daily is sufficient; on Pro you may use `* * * * *`.
4. **Content** — import and approve the verified question bank; archive the
   development fixtures if they were ever loaded.
5. **Phase 2** — features stay hidden until switched on in Admin → Settings.

Safety rails: production refuses to start sessions without `SESSION_SECRET`,
refuses the embedded database when `VERCEL_ENV=production`, disables the
development sign-in, and the seed script refuses to run.
