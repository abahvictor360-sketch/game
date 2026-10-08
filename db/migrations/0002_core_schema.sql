-- Fastora core schema (Phase 1 + Phase 2 tables).
-- Authoritative game state lives here. The web server connects with a
-- privileged role; browsers never receive answer keys or future questions.

-- ---------------------------------------------------------------------------
-- Versioned game configuration (rules + feature flags)
-- ---------------------------------------------------------------------------
create table public.game_config (
  version     integer primary key,
  rules       jsonb not null,
  flags       jsonb not null default '{}'::jsonb,
  note        text,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Players and roles
-- ---------------------------------------------------------------------------
create table public.players (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'guest' check (kind in ('guest', 'account')),
  auth_user_id   uuid unique,
  email          text,
  display_name   text not null,
  avatar_key     text not null default 'baobab',
  country_code   text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  settings       jsonb not null default '{}'::jsonb,
  merged_into    uuid references public.players(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint display_name_length check (char_length(display_name) between 2 and 24)
);
create index players_merged_into_idx on public.players(merged_into);

-- Server-verified administrative roles. Never derived from profile metadata.
create table public.staff_roles (
  player_id   uuid primary key references public.players(id) on delete cascade,
  role        text not null check (role in ('admin', 'editor')),
  granted_by  uuid references public.players(id),
  granted_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Question bank
-- ---------------------------------------------------------------------------
create table public.categories (
  id          text primary key check (id ~ '^[a-z][a-z0-9-]*$'),
  name        text not null,
  description text,
  sort_order  integer not null default 0
);

create table public.questions (
  id                 uuid primary key default gen_random_uuid(),
  status             text not null default 'draft'
                     check (status in ('draft', 'review', 'approved', 'archived')),
  live_version_id    uuid,
  latest_version_id  uuid,
  is_fixture         boolean not null default false,
  created_by         uuid references public.players(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz
);
create index questions_status_idx on public.questions(status);

create table public.question_versions (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid not null references public.questions(id) on delete cascade,
  version          integer not null,
  state            text not null default 'draft'
                   check (state in ('draft', 'review', 'approved', 'superseded', 'rejected')),
  text             text not null check (char_length(text) between 10 and 400),
  explanation      text not null check (char_length(explanation) between 10 and 800),
  category_id      text not null references public.categories(id),
  country_scope    text[] not null default '{}',
  difficulty       text not null check (difficulty in ('easy', 'medium', 'hard')),
  age_rating       text not null default 'all' check (age_rating in ('all', '13+', '16+')),
  tags             text[] not null default '{}',
  language         text not null default 'en',
  sources          jsonb not null default '[]'::jsonb,
  verified_at      date,
  sponsor_ref      text,
  content_hash     text not null,
  author_id        uuid references public.players(id),
  reviewer_id      uuid references public.players(id),
  review_note      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  published_at     timestamptz,
  unique (question_id, version)
);
create index question_versions_hash_idx on public.question_versions(content_hash);
create index question_versions_category_idx on public.question_versions(category_id);

alter table public.questions
  add constraint questions_live_version_fk foreign key (live_version_id)
    references public.question_versions(id) deferrable initially deferred,
  add constraint questions_latest_version_fk foreign key (latest_version_id)
    references public.question_versions(id) deferrable initially deferred;
create index questions_live_version_idx on public.questions(live_version_id);

-- Answer options are player-visible once the question is issued.
create table public.question_options (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.question_versions(id) on delete cascade,
  label       text not null check (label in ('A', 'B', 'C', 'D')),
  text        text not null check (char_length(text) between 1 and 160),
  unique (version_id, label)
);

-- The answer key is private: separate schema, no client grants.
create table private.answer_keys (
  version_id         uuid primary key references public.question_versions(id) on delete cascade,
  correct_option_id  uuid not null references public.question_options(id)
);

-- Observed performance used for difficulty calibration.
-- Only unassisted answers (no 50/50, no audience) are counted.
create table public.question_stats (
  version_id            uuid primary key references public.question_versions(id) on delete cascade,
  unassisted_attempts   integer not null default 0,
  unassisted_correct    integer not null default 0,
  difficulty_locked     boolean not null default false,
  answer_distribution   jsonb not null default '{}'::jsonb,
  updated_at            timestamptz not null default now()
);

create table public.question_reports (
  id              uuid primary key default gen_random_uuid(),
  question_id     uuid not null references public.questions(id) on delete cascade,
  version_id      uuid not null references public.question_versions(id) on delete cascade,
  player_id       uuid references public.players(id) on delete set null,
  reason          text not null check (reason in ('incorrect', 'outdated', 'offensive', 'unclear', 'typo', 'other')),
  details         text check (details is null or char_length(details) <= 1000),
  status          text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  resolved_by     uuid references public.players(id),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index question_reports_status_idx on public.question_reports(status, created_at desc);

create table public.content_imports (
  id             uuid primary key default gen_random_uuid(),
  actor_id       uuid references public.players(id),
  filename       text,
  row_count      integer not null,
  created_count  integer not null default 0,
  skipped_count  integer not null default 0,
  status         text not null check (status in ('previewed', 'committed', 'failed')),
  errors         jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now()
);

create table public.audit_events (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.players(id) on delete set null,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_events_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);
create index audit_events_created_idx on public.audit_events(created_at desc);

create table public.ops_alerts (
  id          bigint generated always as identity primary key,
  kind        text not null,
  message     text not null,
  data        jsonb not null default '{}'::jsonb,
  dedupe_key  text unique,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Daily Challenge
-- ---------------------------------------------------------------------------
create table public.daily_challenges (
  id               uuid primary key default gen_random_uuid(),
  challenge_date   date not null unique,
  ruleset_version  integer not null references public.game_config(version),
  published_at     timestamptz not null default now()
);

create table public.daily_challenge_questions (
  challenge_id  uuid not null references public.daily_challenges(id) on delete cascade,
  position      integer not null check (position >= 0),
  version_id    uuid not null references public.question_versions(id),
  option_order  uuid[] not null,
  primary key (challenge_id, position),
  unique (challenge_id, version_id)
);

-- ---------------------------------------------------------------------------
-- Friend challenges & ghost recordings (Phase 2)
-- ---------------------------------------------------------------------------
create table public.friend_challenges (
  id                 uuid primary key default gen_random_uuid(),
  token_hash         text not null unique,
  creator_id         uuid not null references public.players(id),
  source_session_id  uuid not null,
  ruleset_version    integer not null references public.game_config(version),
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Game sessions
-- ---------------------------------------------------------------------------
create table public.game_sessions (
  id                   uuid primary key default gen_random_uuid(),
  player_id            uuid not null references public.players(id),
  mode                 text not null check (mode in ('classic', 'daily', 'friend', 'ghost', 'match')),
  status               text not null default 'active' check (status in ('active', 'completed', 'abandoned', 'forfeited', 'cancelled')),
  ruleset_version      integer not null references public.game_config(version),
  scoring_key          text not null,
  total_questions      integer not null check (total_questions > 0),
  current_position     integer not null default 0,
  score                integer not null default 0,
  correct_count        integer not null default 0,
  answered_count       integer not null default 0,
  total_response_ms    bigint not null default 0,
  lifelines_used       integer not null default 0,
  leaderboard_eligible boolean not null default false,
  daily_challenge_id   uuid references public.daily_challenges(id),
  friend_challenge_id  uuid references public.friend_challenges(id),
  ghost_recording_id   uuid,
  match_id             uuid,
  started_at           timestamptz not null default now(),
  completed_at         timestamptz,
  updated_at           timestamptz not null default now()
);
create index game_sessions_player_idx on public.game_sessions(player_id, started_at desc);
create index game_sessions_board_idx on public.game_sessions(mode, status, scoring_key, score desc);
create index game_sessions_daily_idx on public.game_sessions(daily_challenge_id, status, score desc);

alter table public.friend_challenges
  add constraint friend_challenges_source_fk foreign key (source_session_id) references public.game_sessions(id);

-- Every question issued to a session. A replaced question (Change Question)
-- keeps its row with outcome 'replaced' so the history is complete.
create table public.issued_questions (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.game_sessions(id) on delete cascade,
  position            integer not null check (position >= 0),
  version_id          uuid not null references public.question_versions(id),
  difficulty          text not null check (difficulty in ('easy', 'medium', 'hard')),
  option_order        uuid[] not null,
  removed_option_ids  uuid[] not null default '{}',
  duration_ms         integer not null check (duration_ms > 0),
  issued_at           timestamptz not null,
  deadline_at         timestamptz not null,
  paused_at           timestamptz,
  answered_at         timestamptz,
  selected_option_id  uuid references public.question_options(id),
  outcome             text not null default 'pending'
                      check (outcome in ('pending', 'correct', 'incorrect', 'timeout', 'replaced')),
  points              integer not null default 0,
  response_ms         integer,
  assisted            boolean not null default false,
  submission_key      text
);
create unique index issued_questions_active_position_uq
  on public.issued_questions(session_id, position) where outcome <> 'replaced';
create unique index issued_questions_session_version_uq
  on public.issued_questions(session_id, version_id);
create index issued_questions_pending_deadline_idx
  on public.issued_questions(deadline_at) where outcome = 'pending';

create table public.lifeline_uses (
  session_id          uuid not null references public.game_sessions(id) on delete cascade,
  lifeline            text not null check (lifeline in ('fifty_fifty', 'change_question', 'ask_audience')),
  issued_question_id  uuid not null references public.issued_questions(id),
  request_key         text,
  result              jsonb not null default '{}'::jsonb,
  used_at             timestamptz not null default now(),
  primary key (session_id, lifeline)
);

create table public.daily_attempts (
  challenge_id  uuid not null references public.daily_challenges(id),
  player_id     uuid not null references public.players(id),
  session_id    uuid not null unique references public.game_sessions(id),
  created_at    timestamptz not null default now(),
  primary key (challenge_id, player_id)
);

create table public.friend_challenge_attempts (
  challenge_id  uuid not null references public.friend_challenges(id),
  player_id     uuid not null references public.players(id),
  session_id    uuid not null unique references public.game_sessions(id),
  created_at    timestamptz not null default now(),
  primary key (challenge_id, player_id)
);

-- Freshness: what each player has seen, for repeat avoidance across runs.
create table public.player_question_history (
  player_id    uuid not null references public.players(id) on delete cascade,
  question_id  uuid not null references public.questions(id) on delete cascade,
  times_seen   integer not null default 1,
  last_seen_at timestamptz not null,
  primary key (player_id, question_id)
);
create index player_question_history_recent_idx on public.player_question_history(player_id, last_seen_at desc);

create table public.ghost_recordings (
  id                uuid primary key default gen_random_uuid(),
  source_session_id uuid not null unique references public.game_sessions(id),
  source_player_id  uuid not null references public.players(id),
  display_alias     text not null,
  ruleset_version   integer not null references public.game_config(version),
  scoring_key       text not null,
  version_ids       uuid[] not null,
  outcomes          jsonb not null,
  final_score       integer not null,
  created_at        timestamptz not null default now()
);
create index ghost_recordings_scoring_idx on public.ghost_recordings(scoring_key, created_at desc);

alter table public.game_sessions
  add constraint game_sessions_ghost_fk foreign key (ghost_recording_id) references public.ghost_recordings(id);

-- ---------------------------------------------------------------------------
-- Live matches & audience (Phase 2)
-- ---------------------------------------------------------------------------
create table public.matchmaking_entries (
  player_id      uuid primary key references public.players(id) on delete cascade,
  scoring_key    text not null,
  enqueued_at    timestamptz not null default now(),
  heartbeat_at   timestamptz not null default now(),
  match_id       uuid
);

create table public.matches (
  id                uuid primary key default gen_random_uuid(),
  status            text not null default 'countdown'
                    check (status in ('countdown', 'active', 'completed', 'cancelled')),
  ruleset_version   integer not null references public.game_config(version),
  scoring_key       text not null,
  total_questions   integer not null,
  current_position  integer not null default 0,
  round_state       text not null default 'pending' check (round_state in ('pending', 'open', 'closed')),
  round_opened_at   timestamptz,
  round_deadline_at timestamptz,
  round_closed_at   timestamptz,
  starts_at         timestamptz not null,
  winner_player_id  uuid references public.players(id),
  result_reason     text,
  finalized_at      timestamptz,
  created_at        timestamptz not null default now()
);

create table public.match_questions (
  match_id      uuid not null references public.matches(id) on delete cascade,
  position      integer not null,
  version_id    uuid not null references public.question_versions(id),
  option_order  uuid[] not null,
  primary key (match_id, position)
);

create table public.match_participants (
  match_id           uuid not null references public.matches(id) on delete cascade,
  player_id          uuid not null references public.players(id),
  seat               integer not null check (seat in (1, 2)),
  status             text not null default 'connected'
                     check (status in ('connected', 'disconnected', 'forfeited', 'finished')),
  score              integer not null default 0,
  correct_count      integer not null default 0,
  total_response_ms  bigint not null default 0,
  last_seen_at       timestamptz not null default now(),
  disconnected_at    timestamptz,
  primary key (match_id, player_id),
  unique (match_id, seat)
);

create table public.match_answers (
  match_id            uuid not null references public.matches(id) on delete cascade,
  position            integer not null,
  player_id           uuid not null references public.players(id),
  selected_option_id  uuid references public.question_options(id),
  outcome             text not null check (outcome in ('correct', 'incorrect', 'timeout')),
  points              integer not null default 0,
  response_ms         integer,
  answered_at         timestamptz not null default now(),
  primary key (match_id, position, player_id)
);

alter table public.matchmaking_entries
  add constraint matchmaking_match_fk foreign key (match_id) references public.matches(id) on delete set null;
alter table public.game_sessions
  add constraint game_sessions_match_fk foreign key (match_id) references public.matches(id);

create table public.helper_presence (
  player_id     uuid primary key references public.players(id) on delete cascade,
  last_seen_at  timestamptz not null default now(),
  last_invited_at timestamptz
);

create table public.audience_requests (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.game_sessions(id) on delete cascade,
  issued_question_id  uuid not null unique references public.issued_questions(id),
  version_id          uuid not null references public.question_versions(id),
  status              text not null default 'collecting'
                      check (status in ('collecting', 'closed', 'fallback', 'insufficient')),
  source              text check (source in ('live', 'historical')),
  closes_at           timestamptz not null,
  result              jsonb,
  sample_size         integer,
  created_at          timestamptz not null default now()
);

create table public.audience_invitations (
  request_id  uuid not null references public.audience_requests(id) on delete cascade,
  helper_id   uuid not null references public.players(id) on delete cascade,
  primary key (request_id, helper_id)
);

create table public.audience_votes (
  request_id  uuid not null references public.audience_requests(id) on delete cascade,
  helper_id   uuid not null references public.players(id) on delete cascade,
  option_id   uuid not null references public.question_options(id),
  created_at  timestamptz not null default now(),
  primary key (request_id, helper_id)
);

-- ---------------------------------------------------------------------------
-- Operational: rate limiting (private)
-- ---------------------------------------------------------------------------
create table private.rate_limits (
  bucket        text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket, window_start)
);

