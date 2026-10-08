# Operations

## Daily routine

- **Admin → Overview**: operational alerts (e.g. a Daily Challenge that could
  not be published), servable pool per difficulty, open reports, recent activity.
- **Reports**: triage player reports daily (see CONTENT_GUIDE.md).

## Alerts

| Alert | Meaning | Action |
|---|---|---|
| `daily_unavailable` | Not enough approved questions to publish a date’s set | Approve more content; the next request or cron run retries automatically |
| Errors in Sentry | Server exceptions (with route context) | Investigate; players see a friendly error and their progress is preserved |

Alerts are deduplicated per date. Mark resolved directly in `ops_alerts`
(`resolved_at`) once handled.

## Analytics events (PostHog)

`game_started`, `game_completed`, `daily_started`, `daily_completed`,
`lifeline_used`, `result_shared` (channel), `account_linked`,
`question_reported`, `friend_challenge_created`/`started`,
`matchmaking_outcome`, `match_reconnected`, `audience_requested`.
Properties are allow-listed (mode, lifeline, score, correct, total, channel,
outcome…). No emails, question text or answers are sent.

## Changing rules

Admin → Settings creates a new ruleset version (audited). In-progress games
keep their version. Score-affecting changes start a fresh all-time board.
Daily changes apply from the next published date (tomorrow’s set may already
be published by the sweeper).

## Staff

Grant roles with `npm run admin:grant -- email [admin|editor]`; revoke by
deleting the row from `staff_roles`. Bootstrap admins come from
`ADMIN_BOOTSTRAP_EMAILS` on their first verified sign-in.

## Incident notes

- **Live matches during an outage**: if the service cannot adjudicate (both
  players gone, or a player missing at kick-off) the match is cancelled with
  no result. Matches resume from durable state once the service is back; the
  sweeper finalises anything overdue exactly once.
- **Database restore**: answer keys are in the `private` schema — include it
  in backups (Supabase backups do).
