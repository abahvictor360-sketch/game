import 'server-only';
import { challengeDateFor, nextResetAt } from '@/lib/game/dates';
import type { Difficulty } from '@/lib/game/rules';
import type { AnswerOutcome } from '@/lib/shared/types';
import { raiseAlert } from '../audit';
import { clock } from '../clock';
import { getActiveConfig, getConfigVersion, type ConfigVersion } from '../config';
import { pgArray, type Queryable } from '../db';
import { AppError } from '../errors';
import { captureMessage } from '../monitoring';
import { dailyRankFor } from './leaderboard';
import { optionIdsFor, selectDailySet, shuffle } from './selection';
import { createSession, issueQuestion, registerFixedSource, registerViewDecorator, rulesFor } from './sessions';

export type DailyChallenge = { id: string; date: string; rulesetVersion: number; questionCount: number };

async function findChallenge(q: Queryable, date: string): Promise<DailyChallenge | null> {
  const [row] = await q.query<{ id: string; ruleset_version: number; n: number }>(
    `select dc.id, dc.ruleset_version, (select count(*)::int from public.daily_challenge_questions where challenge_id = dc.id) as n
       from public.daily_challenges dc where dc.challenge_date = $1::date`,
    [date],
  );
  return row ? { id: row.id, date, rulesetVersion: row.ruleset_version, questionCount: row.n } : null;
}

/**
 * Publish the immutable question set for `date` if it does not exist yet.
 * Safe under concurrency: the unique challenge_date constraint makes exactly
 * one publisher win; others read the winner's set.
 */
export async function ensureDailyChallenge(q: Queryable, date: string, cfg?: ConfigVersion): Promise<DailyChallenge | null> {
  const existing = await findChallenge(q, date);
  if (existing) return existing;
  const config = cfg ?? (await getActiveConfig(q));
  const set = await selectDailySet(q, { rules: config.rules, date });
  if (!set) {
    await raiseAlert(q, 'daily_unavailable', `Daily Challenge for ${date} could not be published: not enough approved questions.`, `daily:${date}`, { date });
    captureMessage(`Daily Challenge ${date} could not be published`, { date });
    return null;
  }
  const [created] = await q.query<{ id: string }>(
    `insert into public.daily_challenges(challenge_date, ruleset_version) values ($1::date, $2)
     on conflict (challenge_date) do nothing returning id`,
    [date, config.version],
  );
  if (!created) return findChallenge(q, date);
  // Ladder order (easy → hard); option order fixed for everyone.
  for (const [position, item] of set.entries()) {
    const order = shuffle(await optionIdsFor(q, item.version_id));
    await q.query(
      `insert into public.daily_challenge_questions(challenge_id, position, version_id, option_order) values ($1, $2, $3, $4::uuid[])`,
      [created.id, position, item.version_id, pgArray(order)],
    );
  }
  return { id: created.id, date, rulesetVersion: config.version, questionCount: set.length };
}

registerFixedSource('daily', async (q, s, position) => {
  const [row] = await q.query<{ version_id: string; option_order: string[]; difficulty: Difficulty }>(
    `select dq.version_id, dq.option_order, v.difficulty
       from public.daily_challenge_questions dq join public.question_versions v on v.id = dq.version_id
      where dq.challenge_id = $1 and dq.position = $2`,
    [s.daily_challenge_id, position],
  );
  if (!row) throw new AppError('internal', 'Daily Challenge question missing.');
  return { kind: 'fixed', versionId: row.version_id, optionOrder: row.option_order, difficulty: row.difficulty };
});

registerViewDecorator(async (q, s, view) => {
  if (!s.daily_challenge_id) return;
  const [row] = await q.query<{ d: string }>(
    `select to_char(challenge_date, 'YYYY-MM-DD') as d from public.daily_challenges where id = $1`,
    [s.daily_challenge_id],
  );
  view.challengeDate = row?.d ?? null;
});

/**
 * Start (or resume) today's Daily Challenge. One attempt per player per date:
 * the player row is locked to serialise concurrent requests, and the
 * (challenge_id, player_id) primary key is the final guarantee.
 */
export async function startOrResumeDaily(q: Queryable, player: { id: string; kind: string }): Promise<string> {
  const now = clock.now();
  const cfg = await getActiveConfig(q);
  const date = challengeDateFor(now, cfg.rules.daily.timezone);
  const challenge = await ensureDailyChallenge(q, date, cfg);
  if (!challenge) throw new AppError('content_unavailable', "Today's Daily Challenge isn't available yet. Please check back soon.", 'daily_unavailable');
  await q.query('select id from public.players where id = $1 for update', [player.id]);
  const [attempt] = await q.query<{ session_id: string }>(
    'select session_id from public.daily_attempts where challenge_id = $1 and player_id = $2',
    [challenge.id, player.id],
  );
  if (attempt) return attempt.session_id;
  const challengeCfg = await getConfigVersion(q, challenge.rulesetVersion);
  const eligible = player.kind === 'account' || !challengeCfg.rules.daily.requireAccountForLeaderboard;
  const s = await createSession(q, {
    playerId: player.id,
    mode: 'daily',
    eligible,
    cfg: challengeCfg,
    dailyChallengeId: challenge.id,
    totalQuestions: challenge.questionCount,
    now,
  });
  await q.query('insert into public.daily_attempts(challenge_id, player_id, session_id) values ($1, $2, $3)', [
    challenge.id,
    player.id,
    s.id,
  ]);
  const { mr } = await rulesFor(q, s);
  const [first] = await q.query<{ version_id: string; option_order: string[]; difficulty: Difficulty }>(
    `select dq.version_id, dq.option_order, v.difficulty from public.daily_challenge_questions dq
       join public.question_versions v on v.id = dq.version_id where dq.challenge_id = $1 and dq.position = 0`,
    [challenge.id],
  );
  await issueQuestion(q, s, 0, mr, challengeCfg, { kind: 'fixed', versionId: first.version_id, optionOrder: first.option_order, difficulty: first.difficulty }, now);
  return s.id;
}

export type DailyStatus = {
  date: string;
  available: boolean;
  resetAt: string;
  questionCount: number;
  attempt: null | {
    sessionId: string;
    status: string;
    score: number;
    correctCount: number;
    grid: (AnswerOutcome | null)[];
    eligible: boolean;
    rank: number | null;
  };
  participants: number;
};

export async function getDailyStatus(q: Queryable, playerId: string | null): Promise<DailyStatus> {
  const now = clock.now();
  const cfg = await getActiveConfig(q);
  const date = challengeDateFor(now, cfg.rules.daily.timezone);
  const challenge = await ensureDailyChallenge(q, date, cfg);
  const status: DailyStatus = {
    date,
    available: !!challenge,
    resetAt: nextResetAt(now, cfg.rules.daily.timezone).toISOString(),
    questionCount: challenge?.questionCount ?? cfg.rules.daily.questionCount,
    attempt: null,
    participants: 0,
  };
  if (!challenge) return status;
  const [p] = await q.query<{ n: number }>(
    `select count(*)::int as n from public.daily_attempts da join public.game_sessions s on s.id = da.session_id
      where da.challenge_id = $1 and s.status = 'completed'`,
    [challenge.id],
  );
  status.participants = p.n;
  if (!playerId) return status;
  const [a] = await q.query<{ session_id: string; status: string; score: number; correct_count: number; total_questions: number; leaderboard_eligible: boolean }>(
    `select s.id as session_id, s.status, s.score, s.correct_count, s.total_questions, s.leaderboard_eligible
       from public.daily_attempts da join public.game_sessions s on s.id = da.session_id
      where da.challenge_id = $1 and da.player_id = $2`,
    [challenge.id, playerId],
  );
  if (!a) return status;
  const grid = await gridFor(q, a.session_id, a.total_questions);
  let rank: number | null = null;
  if (a.status === 'completed' && a.leaderboard_eligible) {
    rank = await dailyRankFor(q, challenge.id, a.session_id);
  }
  status.attempt = {
    sessionId: a.session_id,
    status: a.status,
    score: a.score,
    correctCount: a.correct_count,
    grid,
    eligible: a.leaderboard_eligible,
    rank,
  };
  return status;
}

export async function gridFor(q: Queryable, sessionId: string, total: number): Promise<(AnswerOutcome | null)[]> {
  const rows = await q.query<{ position: number; outcome: AnswerOutcome }>(
    `select position, outcome from public.issued_questions where session_id = $1 and outcome in ('correct','incorrect','timeout')`,
    [sessionId],
  );
  const grid: (AnswerOutcome | null)[] = Array.from({ length: total }, () => null);
  for (const r of rows) grid[r.position] = r.outcome;
  return grid;
}
