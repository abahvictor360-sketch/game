-- Fastora: switch on Ghost opponents (race a recording of a real player's game).
-- Run in Supabase: Dashboard > SQL Editor > New query > paste > Run.
--
-- Settings are versioned: this adds a new settings version that copies the
-- current rules and turns the flag on. Games already running keep their rules,
-- and leaderboards are not affected. The site picks it up on the next request.
-- Running it again just adds another identical version, which is harmless.

begin;

-- 1. If the site has never started against this database, create the default
--    settings first (the same values the app would create).
insert into public.game_config (version, rules, flags, note)
values (1, '{"timersMs":{"easy":20000,"medium":18000,"hard":15000},"points":{"easy":100,"medium":200,"hard":300},"latencyGraceMs":1000,"classic":{"questionCount":15,"distribution":{"easy":5,"medium":5,"hard":5},"endOnWrongAnswer":false,"lifelines":{"fifty_fifty":true,"change_question":true,"ask_audience":true},"speedBonusFactor":0},"daily":{"questionCount":10,"distribution":{"easy":4,"medium":3,"hard":3},"timerMs":20000,"timezone":"Africa/Lagos","requireAccountForLeaderboard":true,"reuseCooldownDays":180},"versus":{"questionCount":15,"distribution":{"easy":5,"medium":5,"hard":5},"speedBonusFactor":0.25,"matchmakingFallbackMs":30000,"reconnectWindowMs":20000,"countdownMs":3000,"revealMs":4000},"friendChallenge":{"expiryDays":7},"audience":{"minLiveHelpers":5,"votingWindowMs":15000,"helperCooldownMs":120000,"helperPresenceMs":45000,"minHistoricalSample":20},"freshness":{"recentWindowDays":30},"content":{"language":"en","allowedAgeRatings":["all","13+"]},"calibration":{"minSample":30,"easyAtOrAbove":0.7,"hardBelow":0.4}}'::jsonb, '{"multiplayer": false, "ghostOpponents": false, "friendChallenges": false, "askAudience": false}'::jsonb, 'Proposed defaults')
on conflict (version) do nothing;

-- 2. New settings version with Ghost opponents on.
insert into public.game_config (version, rules, flags, note)
select version + 1, rules, flags || '{"ghostOpponents": true}'::jsonb, 'Ghost opponents switched on (SQL)'
  from public.game_config
 order by version desc
 limit 1;

commit;

-- Check: the newest version should show "ghostOpponents": true.
select version, flags, note, created_at from public.game_config order by version desc limit 3;

-- How many recordings exist so far (they come from real, lifeline-free
-- Classic games by signed-in players who have not opted out):
select count(*) as ghost_recordings from public.ghost_recordings;

-- OPTIONAL: also switch on live two-player matches (players wait about 30 s
-- for a live opponent before being offered a recording). Remove the "--" to run.
-- insert into public.game_config (version, rules, flags, note)
-- select version + 1, rules, flags || '{"multiplayer": true}'::jsonb, 'Live matches switched on (SQL)'
--   from public.game_config order by version desc limit 1;

-- TO SWITCH GHOSTS OFF AGAIN:
-- insert into public.game_config (version, rules, flags, note)
-- select version + 1, rules, flags || '{"ghostOpponents": false}'::jsonb, 'Ghost opponents switched off (SQL)'
--   from public.game_config order by version desc limit 1;
