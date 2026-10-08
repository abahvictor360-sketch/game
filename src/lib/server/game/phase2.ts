import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { modeRules, type Difficulty, type Rules } from '@/lib/game/rules';
import { scoreAnswer } from '@/lib/game/scoring';
import type { AnswerOutcome, AudienceView, GhostView } from '@/lib/shared/types';
import { clock } from '../clock';
import { getActiveConfig, getConfigVersion } from '../config';
import { pgArray, pgJson, type Queryable } from '../db';
import { AppError, notFound } from '../errors';
import { optionIdsFor, shuffle } from './selection';
import {
  createSession,
  issueQuestion,
  lockSession,
  onSessionCompleted,
  registerFixedSource,
  registerLifeline,
  registerPreStep,
  registerViewDecorator,
  rulesFor,
  type IssuedRow,
  type SessionRow,
} from './sessions';

// ===========================================================================
// Challenge a Friend (asynchronous, casual — never on ranked leaderboards)
// ===========================================================================

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function createFriendChallenge(q: Queryable, playerId: string, sourceSessionId: string): Promise<{ token: string; expiresAt: Date }> {
  const cfg = await getActiveConfig(q);
  if (!cfg.flags.friendChallenges) throw new AppError('feature_disabled', 'Friend challenges are not available yet.');
  const s = await lockSession(q, sourceSessionId, playerId);
  if (s.status !== 'completed' || (s.mode !== 'classic' && s.mode !== 'friend')) {
    throw new AppError('conflict', 'Finish a Classic game to challenge a friend with it.');
  }
  // Challenges made from a friend game reuse that game's original source.
  const sourceId =
    s.mode === 'friend'
      ? (await q.query<{ source_session_id: string }>('select source_session_id from public.friend_challenges where id = $1', [s.friend_challenge_id]))[0]
          .source_session_id
      : s.id;
  const [source] = await q.query<{ ruleset_version: number }>('select ruleset_version from public.game_sessions where id = $1', [sourceId]);
  const token = randomBytes(18).toString('base64url');
  const expiresAt = new Date(clock.now().getTime() + cfg.rules.friendChallenge.expiryDays * 86400000);
  await q.query(
    `insert into public.friend_challenges(token_hash, creator_id, source_session_id, ruleset_version, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [hashToken(token), playerId, sourceId, source.ruleset_version, expiresAt.toISOString()],
  );
  return { token, expiresAt };
}

type ChallengeRow = {
  id: string;
  creator_id: string;
  source_session_id: string;
  ruleset_version: number;
  expires_at: Date;
  creator_name: string;
  creator_score: number;
  question_count: number;
  archived_count: number;
};

async function findChallenge(q: Queryable, token: string): Promise<ChallengeRow | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await q.query<ChallengeRow>(
    `select fc.id, fc.creator_id, fc.source_session_id, fc.ruleset_version, fc.expires_at,
            p.display_name as creator_name, s.score as creator_score,
            (select count(*)::int from public.issued_questions iq where iq.session_id = s.id and iq.outcome <> 'replaced') as question_count,
            (select count(*)::int from public.issued_questions iq join public.question_versions v on v.id = iq.version_id
               join public.questions qq on qq.id = v.question_id
              where iq.session_id = s.id and iq.outcome <> 'replaced' and qq.status = 'archived') as archived_count
       from public.friend_challenges fc
       join public.game_sessions s on s.id = fc.source_session_id
       join public.players p on p.id = fc.creator_id
      where fc.token_hash = $1`,
    [hashToken(token)],
  );
  return row ?? null;
}

export type FriendChallengePreview = {
  creatorName: string;
  questionCount: number;
  expiresAt: string;
  state: 'open' | 'expired' | 'unavailable' | 'own' | 'played';
  sessionId: string | null;
};

export async function previewFriendChallenge(q: Queryable, token: string, playerId: string | null): Promise<FriendChallengePreview | null> {
  const c = await findChallenge(q, token);
  if (!c) return null;
  let state: FriendChallengePreview['state'] = 'open';
  let sessionId: string | null = null;
  if (playerId) {
    const [a] = await q.query<{ session_id: string }>(
      'select session_id from public.friend_challenge_attempts where challenge_id = $1 and player_id = $2',
      [c.id, playerId],
    );
    if (a) {
      state = 'played';
      sessionId = a.session_id;
    }
  }
  if (state === 'open') {
    if (playerId === c.creator_id) state = 'own';
    else if (c.expires_at.getTime() < clock.now().getTime()) state = 'expired';
    else if (c.archived_count > 0) state = 'unavailable';
  }
  return { creatorName: c.creator_name, questionCount: c.question_count, expiresAt: c.expires_at.toISOString(), state, sessionId };
}

export async function startFriendChallenge(q: Queryable, player: { id: string }, token: string): Promise<string> {
  const cfg = await getActiveConfig(q);
  if (!cfg.flags.friendChallenges) throw new AppError('feature_disabled', 'Friend challenges are not available yet.');
  const c = await findChallenge(q, token);
  if (!c) throw notFound('Challenge');
  await q.query('select id from public.players where id = $1 for update', [player.id]);
  const [existing] = await q.query<{ session_id: string }>(
    'select session_id from public.friend_challenge_attempts where challenge_id = $1 and player_id = $2',
    [c.id, player.id],
  );
  if (existing) return existing.session_id;
  if (c.creator_id === player.id) throw new AppError('conflict', 'You can’t accept your own challenge — share it with a friend!', 'own_challenge');
  if (c.expires_at.getTime() < clock.now().getTime()) throw new AppError('expired', 'This challenge has expired.', 'expired');
  if (c.archived_count > 0) throw new AppError('content_unavailable', 'Some questions in this challenge have been withdrawn, so it can no longer be played.', 'unavailable');
  const now = clock.now();
  const challengeCfg = await getConfigVersion(q, c.ruleset_version);
  const s = await createSession(q, {
    playerId: player.id,
    mode: 'friend',
    eligible: false,
    cfg: challengeCfg,
    friendChallengeId: c.id,
    totalQuestions: c.question_count,
    now,
  });
  await q.query('insert into public.friend_challenge_attempts(challenge_id, player_id, session_id) values ($1, $2, $3)', [c.id, player.id, s.id]);
  const { mr } = await rulesFor(q, s);
  await issueQuestion(q, s, 0, mr, challengeCfg, await friendSource(q, s, 0), now);
  return s.id;
}

async function friendSource(q: Queryable, s: SessionRow, position: number) {
  const [row] = await q.query<{ version_id: string; option_order: string[]; difficulty: Difficulty }>(
    `select iq.version_id, iq.option_order, iq.difficulty
       from public.friend_challenges fc join public.issued_questions iq on iq.session_id = fc.source_session_id
      where fc.id = $1 and iq.position = $2 and iq.outcome <> 'replaced'`,
    [s.friend_challenge_id, position],
  );
  if (!row) throw new AppError('internal', 'Challenge question missing.');
  return { kind: 'fixed' as const, versionId: row.version_id, optionOrder: row.option_order, difficulty: row.difficulty };
}
registerFixedSource('friend', friendSource);

registerViewDecorator(async (q, s, view) => {
  if (!s.friend_challenge_id) return;
  const [row] = await q.query<{ name: string; score: number }>(
    `select p.display_name as name, src.score from public.friend_challenges fc
       join public.game_sessions src on src.id = fc.source_session_id join public.players p on p.id = fc.creator_id
      where fc.id = $1`,
    [s.friend_challenge_id],
  );
  if (row) view.friendChallenge = { opponentName: row.name, opponentScore: s.status === 'completed' ? row.score : null };
});

// ===========================================================================
// Ghost opponents: replays of real, completed, lifeline-free Classic runs
// ===========================================================================

/** Two runs are replay-compatible when their question ladder and timers match. */
export function ghostCompatKey(ladder: Difficulty[], timers: Record<Difficulty, number>) {
  return 'ghost:' + ladder.map((d) => `${d[0]}${timers[d]}`).join('');
}

const ALIAS_A = ['Swift', 'Bright', 'Bold', 'Calm', 'Keen', 'Quick', 'Wise', 'Steady'];
const ALIAS_B = ['Kudu', 'Ibis', 'Gazelle', 'Heron', 'Cheetah', 'Eagle', 'Okapi', 'Lion'];
function pseudonym(playerId: string) {
  const h = createHash('sha256').update('ghost:' + playerId).digest();
  return `${ALIAS_A[h[0] % ALIAS_A.length]} ${ALIAS_B[h[1] % ALIAS_B.length]}`;
}

onSessionCompleted(async (q, s) => {
  if (s.mode !== 'classic' || s.lifelines_used > 0) return;
  const [p] = await q.query<{ settings: { allowGhostReplay?: boolean } }>('select settings from public.players where id = $1', [s.player_id]);
  if (p?.settings?.allowGhostReplay === false) return;
  const issued = await q.query<IssuedRow>(
    `select * from public.issued_questions where session_id = $1 and outcome <> 'replaced' order by position`,
    [s.id],
  );
  if (issued.length !== s.total_questions || issued.some((i) => i.outcome === 'pending')) return;
  const cfg = await getConfigVersion(q, s.ruleset_version);
  const ladder = issued.map((i) => i.difficulty);
  await q.query(
    `insert into public.ghost_recordings
       (source_session_id, source_player_id, display_alias, ruleset_version, scoring_key, version_ids, outcomes, final_score)
     values ($1, $2, $3, $4, $5, $6::uuid[], $7::jsonb, $8) on conflict (source_session_id) do nothing`,
    [
      s.id,
      s.player_id,
      pseudonym(s.player_id),
      s.ruleset_version,
      ghostCompatKey(ladder, cfg.rules.timersMs),
      pgArray(issued.map((i) => i.version_id)),
      pgJson(issued.map((i) => ({ o: i.outcome, ms: i.response_ms ?? i.duration_ms, d: i.difficulty }))),
      s.score,
    ],
  );
});

type GhostRecording = { id: string; display_alias: string; version_ids: string[]; outcomes: { o: AnswerOutcome; ms: number; d: Difficulty }[] };

export async function startGhostGame(q: Queryable, player: { id: string }): Promise<string> {
  const now = clock.now();
  const cfg = await getActiveConfig(q);
  if (!cfg.flags.ghostOpponents) throw new AppError('feature_disabled', 'Recorded opponents are not available yet.');
  const mr = modeRules('ghost', cfg.rules, cfg.flags);
  const key = ghostCompatKey(mr.ladder, cfg.rules.timersMs);
  const since = new Date(now.getTime() - cfg.rules.freshness.recentWindowDays * 86400000).toISOString();
  // Prefer recordings whose questions this player has not seen recently, and
  // only recordings whose questions are all still approved.
  const [rec] = await q.query<GhostRecording>(
    `select g.id, g.display_alias, g.version_ids, g.outcomes
       from public.ghost_recordings g
      where g.scoring_key = $1 and g.source_player_id <> $2
        and not exists (select 1 from unnest(g.version_ids) vid join public.question_versions v on v.id = vid
                          join public.questions qq on qq.id = v.question_id where qq.status = 'archived')
      order by (select count(*) from unnest(g.version_ids) vid join public.question_versions v on v.id = vid
                  join public.player_question_history h on h.question_id = v.question_id and h.player_id = $2 and h.last_seen_at > $3::timestamptz) asc,
               random()
      limit 1`,
    [key, player.id, since],
  );
  if (!rec) throw new AppError('content_unavailable', 'No recorded opponent is available right now.', 'no_recording');
  await q.query(
    `update public.game_sessions set status = 'abandoned', updated_at = $2 where player_id = $1 and mode = 'ghost' and status = 'active'`,
    [player.id, now.toISOString()],
  );
  const s = await createSession(q, { playerId: player.id, mode: 'ghost', eligible: false, cfg, ghostRecordingId: rec.id, totalQuestions: rec.version_ids.length, now });
  await issueQuestion(q, s, 0, mr, cfg, await ghostSource(q, s, 0), now);
  return s.id;
}

async function ghostSource(q: Queryable, s: SessionRow, position: number) {
  const [rec] = await q.query<Pick<GhostRecording, 'version_ids' | 'outcomes'>>('select version_ids, outcomes from public.ghost_recordings where id = $1', [
    s.ghost_recording_id,
  ]);
  const versionId = rec.version_ids[position];
  return { kind: 'fixed' as const, versionId, optionOrder: shuffle(await optionIdsFor(q, versionId)), difficulty: rec.outcomes[position]?.d };
}
registerFixedSource('ghost', ghostSource);

export function ghostScore(outcomes: { o: AnswerOutcome; ms: number }[], ladder: Difficulty[], rules: Rules, upTo: number) {
  let score = 0;
  for (let i = 0; i < Math.min(upTo, outcomes.length); i++) {
    const d = ladder[i];
    const dur = rules.timersMs[d];
    score += scoreAnswer({ outcome: outcomes[i].o, difficulty: d, points: rules.points, speedBonusFactor: rules.versus.speedBonusFactor, remainingMs: dur - outcomes[i].ms, durationMs: dur });
  }
  return score;
}

registerViewDecorator(async (q, s, view, now) => {
  if (!s.ghost_recording_id) return;
  const [rec] = await q.query<GhostRecording>('select id, display_alias, version_ids, outcomes from public.ghost_recordings where id = $1', [s.ghost_recording_id]);
  if (!rec) return;
  const cfg = await getConfigVersion(q, s.ruleset_version);
  const ladder = view.ladder.map((l) => l.difficulty);
  // Reveal the recording's results only for rounds the player has closed.
  const closed = view.history.filter((h) => h !== null).length;
  const outcomes = view.history.map((h, i) => (h !== null ? rec.outcomes[i]?.o ?? null : null));
  let answeredCurrent = false;
  let answeredAt: number | null = null;
  if (view.phase === 'question' && view.question) {
    const rr = rec.outcomes[view.question.position];
    if (rr && rr.o !== 'timeout') {
      answeredAt = rr.ms;
      const elapsed = view.question.durationMs - view.question.remainingMs;
      answeredCurrent = elapsed >= rr.ms;
    }
  }
  const ghost: GhostView = {
    alias: rec.display_alias,
    answeredThrough: closed,
    score: ghostScore(rec.outcomes, ladder, cfg.rules, s.status === 'completed' ? rec.outcomes.length : closed),
    outcomes,
    answeredCurrent,
    answeredCurrentAtMs: answeredAt,
  };
  void now;
  view.ghost = ghost;
});

// ===========================================================================
// Ask the Audience (Classic, Phase 2)
// ===========================================================================

async function eligibleHelpers(q: Queryable, requesterId: string, rules: Rules, now: Date) {
  const presenceSince = new Date(now.getTime() - rules.audience.helperPresenceMs).toISOString();
  const cooldownSince = new Date(now.getTime() - rules.audience.helperCooldownMs).toISOString();
  return q.query<{ player_id: string }>(
    `select hp.player_id from public.helper_presence hp join public.players p on p.id = hp.player_id
      where hp.player_id <> $1 and hp.last_seen_at > $2::timestamptz
        and coalesce((p.settings ->> 'helpOthers')::boolean, false)
        and (hp.last_invited_at is null or hp.last_invited_at < $3::timestamptz)
        and not exists (select 1 from public.game_sessions gs where gs.player_id = hp.player_id and gs.status = 'active'
                          and gs.updated_at > $2::timestamptz)
        and not exists (select 1 from public.match_participants mp join public.matches m on m.id = mp.match_id
                          where mp.player_id = hp.player_id and m.status in ('countdown', 'active'))
      order by random() limit 50`,
    [requesterId, presenceSince, cooldownSince],
  );
}

async function historicalDistribution(q: Queryable, versionId: string, optionIds: string[], minSample: number) {
  const [row] = await q.query<{ answer_distribution: Record<string, number> }>(
    'select answer_distribution from public.question_stats where version_id = $1',
    [versionId],
  );
  const dist = row?.answer_distribution ?? {};
  const total = optionIds.reduce((t, id) => t + (dist[id] ?? 0), 0);
  if (total < minSample) return null;
  return { sample: total, result: percentages(optionIds, (id) => dist[id] ?? 0, total) };
}

function percentages(optionIds: string[], count: (id: string) => number, total: number) {
  return optionIds.map((id) => ({ optionId: id, percent: total ? Math.round((count(id) / total) * 100) : 0 }));
}

registerLifeline('ask_audience', async (q, { s, iq, cfg, now }) => {
  const helpers = await eligibleHelpers(q, s.player_id, cfg.rules, now);
  if (helpers.length >= cfg.rules.audience.minLiveHelpers) {
    const closesAt = new Date(now.getTime() + cfg.rules.audience.votingWindowMs);
    const [req] = await q.query<{ id: string }>(
      `insert into public.audience_requests(session_id, issued_question_id, version_id, status, source, closes_at)
       values ($1, $2, $3, 'collecting', 'live', $4) returning id`,
      [s.id, iq.id, iq.version_id, closesAt.toISOString()],
    );
    for (const h of helpers) {
      await q.query('insert into public.audience_invitations(request_id, helper_id) values ($1, $2)', [req.id, h.player_id]);
    }
    await q.query('update public.helper_presence set last_invited_at = $2 where player_id = any($1::uuid[])', [
      pgArray(helpers.map((h) => h.player_id)),
      now.toISOString(),
    ]);
    // Pause the question timer while the audience votes (persisted, server-side).
    await q.query('update public.issued_questions set paused_at = $2 where id = $1', [iq.id, now.toISOString()]);
    return { source: 'live', invited: helpers.length };
  }
  const hist = await historicalDistribution(q, iq.version_id, iq.option_order, cfg.rules.audience.minHistoricalSample);
  if (!hist) {
    // Nothing honest to show: the transaction rolls back, so the lifeline stays available.
    throw new AppError('content_unavailable', 'Not enough audience data for this question. Your lifeline is still available.', 'audience_insufficient');
  }
  await q.query(
    `insert into public.audience_requests(session_id, issued_question_id, version_id, status, source, closes_at, result, sample_size)
     values ($1, $2, $3, 'fallback', 'historical', $4, $5::jsonb, $6)`,
    [s.id, iq.id, iq.version_id, now.toISOString(), pgJson(hist.result), hist.sample],
  );
  return { source: 'historical', sample: hist.sample };
});

/** Close a live audience request once its window ends, then resume the timer. */
export async function settleAudience(q: Queryable, sessionId: string, now: Date): Promise<void> {
  const [req] = await q.query<{ id: string; issued_question_id: string; version_id: string; closes_at: Date }>(
    `select id, issued_question_id, version_id, closes_at from public.audience_requests
      where session_id = $1 and status = 'collecting' for update`,
    [sessionId],
  );
  if (!req || now.getTime() < req.closes_at.getTime()) return;
  const [iq] = await q.query<IssuedRow>('select * from public.issued_questions where id = $1 for update', [req.issued_question_id]);
  const cfg = await getConfigVersion(q, (await q.query<{ ruleset_version: number }>('select ruleset_version from public.game_sessions where id = $1', [sessionId]))[0].ruleset_version);
  const votes = await q.query<{ option_id: string; n: number }>(
    'select option_id, count(*)::int as n from public.audience_votes where request_id = $1 group by option_id',
    [req.id],
  );
  const total = votes.reduce((t, v) => t + v.n, 0);
  let status: 'closed' | 'fallback' | 'insufficient' = 'closed';
  let source: 'live' | 'historical' | null = 'live';
  let result: { optionId: string; percent: number }[] | null = null;
  let sample = total;
  if (total > 0) {
    result = percentages(iq.option_order, (id) => votes.find((v) => v.option_id === id)?.n ?? 0, total);
  } else {
    const hist = await historicalDistribution(q, req.version_id, iq.option_order, cfg.rules.audience.minHistoricalSample);
    if (hist) {
      status = 'fallback';
      source = 'historical';
      result = hist.result;
      sample = hist.sample;
    } else {
      status = 'insufficient';
      source = null;
      sample = 0;
      // Restore the lifeline: no honest result could be produced.
      await q.query(`delete from public.lifeline_uses where session_id = $1 and lifeline = 'ask_audience'`, [sessionId]);
      await q.query('update public.game_sessions set lifelines_used = greatest(lifelines_used - 1, 0) where id = $1', [sessionId]);
    }
  }
  await q.query('update public.audience_requests set status = $2, source = $3, result = $4::jsonb, sample_size = $5 where id = $1', [
    req.id,
    status,
    source,
    result ? pgJson(result) : null,
    sample,
  ]);
  // Resume: the remaining time at the pause is restored from the close time.
  if (iq.outcome === 'pending' && iq.paused_at) {
    const remaining = iq.deadline_at.getTime() - iq.paused_at.getTime();
    const resumeAt = req.closes_at.getTime();
    await q.query('update public.issued_questions set paused_at = null, deadline_at = $2 where id = $1', [
      iq.id,
      new Date(resumeAt + remaining).toISOString(),
    ]);
    iq.deadline_at = new Date(resumeAt + remaining);
    iq.paused_at = null;
  }
}

registerViewDecorator(async (q, s, view) => {
  if (!view.question) return;
  const [req] = await q.query<{ status: string; source: 'live' | 'historical' | null; closes_at: Date; result: { optionId: string; percent: number }[] | null; sample_size: number | null }>(
    'select status, source, closes_at, result, sample_size from public.audience_requests where issued_question_id = $1',
    [view.question.issuedId],
  );
  if (!req) return;
  const audience: AudienceView = {
    status: req.status === 'collecting' ? 'collecting' : req.status === 'insufficient' ? 'insufficient' : 'ready',
    source: req.source,
    closesAt: req.status === 'collecting' ? req.closes_at.toISOString() : null,
    sampleSize: req.sample_size ?? 0,
    percentages: req.result ?? [],
  };
  view.audience = audience;
  void s;
});

/** Helpers: presence heartbeat + pending invitation (question shown without answers). */
export async function helperHeartbeat(q: Queryable, playerId: string) {
  const now = clock.now();
  await q.query(
    `insert into public.helper_presence(player_id, last_seen_at) values ($1, $2)
     on conflict (player_id) do update set last_seen_at = excluded.last_seen_at`,
    [playerId, now.toISOString()],
  );
  const [inv] = await q.query<{ request_id: string; version_id: string; issued_question_id: string; closes_at: Date }>(
    `select r.id as request_id, r.version_id, r.issued_question_id, r.closes_at
       from public.audience_invitations i join public.audience_requests r on r.id = i.request_id
      where i.helper_id = $1 and r.status = 'collecting' and r.closes_at > $2::timestamptz
        and not exists (select 1 from public.audience_votes v where v.request_id = r.id and v.helper_id = $1)
      order by r.created_at desc limit 1`,
    [playerId, now.toISOString()],
  );
  if (!inv) return { invitation: null };
  const [v] = await q.query<{ text: string }>('select text from public.question_versions where id = $1', [inv.version_id]);
  const [iq] = await q.query<{ option_order: string[] }>('select option_order from public.issued_questions where id = $1', [inv.issued_question_id]);
  const opts = await q.query<{ id: string; text: string }>('select id, text from public.question_options where version_id = $1', [inv.version_id]);
  const byId = new Map(opts.map((o) => [o.id, o.text]));
  return {
    invitation: {
      requestId: inv.request_id,
      closesAt: inv.closes_at.toISOString(),
      text: v.text,
      options: iq.option_order.map((id) => ({ id, text: byId.get(id) ?? '' })),
    },
  };
}

export async function castAudienceVote(q: Queryable, playerId: string, requestId: string, optionId: string) {
  const now = clock.now();
  const [inv] = await q.query<{ closes_at: Date; status: string; option_order: string[] }>(
    `select r.closes_at, r.status, iq.option_order from public.audience_invitations i
       join public.audience_requests r on r.id = i.request_id
       join public.issued_questions iq on iq.id = r.issued_question_id
      where i.request_id = $1 and i.helper_id = $2`,
    [requestId, playerId],
  );
  if (!inv) throw notFound('Invitation');
  if (inv.status !== 'collecting' || inv.closes_at.getTime() < now.getTime()) throw new AppError('expired', 'Voting has closed.');
  if (!inv.option_order.includes(optionId)) throw new AppError('bad_request', 'Invalid option.');
  await q.query(
    'insert into public.audience_votes(request_id, helper_id, option_id) values ($1, $2, $3) on conflict (request_id, helper_id) do nothing',
    [requestId, playerId, optionId],
  );
}

registerPreStep(settleAudience);
