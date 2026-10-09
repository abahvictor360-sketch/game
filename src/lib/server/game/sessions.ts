import 'server-only';
import { modeRules, scoringKey, type Difficulty, type GameMode, type Lifeline, type ModeRules } from '@/lib/game/rules';
import { judgeTiming, scoreAnswer, type Outcome } from '@/lib/game/scoring';
import type { FeedbackView, LifelineState, SessionView } from '@/lib/shared/types';
import { clock } from '../clock';
import { getActiveConfig, getConfigVersion, type ConfigVersion } from '../config';
import { pgArray, type Queryable } from '../db';
import { AppError, notFound } from '../errors';
import { availableCounts, optionIdsFor, selectQuestion, shuffle } from './selection';

export type SessionRow = {
  id: string;
  player_id: string;
  mode: GameMode;
  status: SessionView['status'];
  ruleset_version: number;
  scoring_key: string;
  total_questions: number;
  current_position: number;
  score: number;
  correct_count: number;
  answered_count: number;
  total_response_ms: number;
  lifelines_used: number;
  leaderboard_eligible: boolean;
  daily_challenge_id: string | null;
  friend_challenge_id: string | null;
  ghost_recording_id: string | null;
  started_at: Date;
  completed_at: Date | null;
};

export type IssuedRow = {
  id: string;
  session_id: string;
  position: number;
  version_id: string;
  difficulty: Difficulty;
  option_order: string[];
  removed_option_ids: string[];
  duration_ms: number;
  issued_at: Date;
  deadline_at: Date;
  paused_at: Date | null;
  answered_at: Date | null;
  selected_option_id: string | null;
  outcome: 'pending' | Outcome | 'replaced';
  points: number;
  response_ms: number | null;
  assisted: boolean;
  submission_key: string | null;
};

const SESSION_COLS = `id, player_id, mode, status, ruleset_version, scoring_key, total_questions, current_position, score,
  correct_count, answered_count, total_response_ms::int as total_response_ms, lifelines_used, leaderboard_eligible,
  daily_challenge_id, friend_challenge_id, ghost_recording_id, started_at, completed_at`;

export async function lockSession(q: Queryable, sessionId: string, playerId: string): Promise<SessionRow> {
  if (!isUuid(sessionId)) throw notFound('Game');
  const [s] = await q.query<SessionRow>(
    `select ${SESSION_COLS} from public.game_sessions where id = $1 and player_id = $2 for update`,
    [sessionId, playerId],
  );
  if (!s) throw notFound('Game');
  return s;
}

export async function currentIssued(q: Queryable, sessionId: string, position: number): Promise<IssuedRow | null> {
  const [row] = await q.query<IssuedRow>(
    `select * from public.issued_questions where session_id = $1 and position = $2 and outcome <> 'replaced'`,
    [sessionId, position],
  );
  return row ?? null;
}

export function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function rulesFor(q: Queryable, s: { ruleset_version: number; mode: GameMode }) {
  const cfg = await getConfigVersion(q, s.ruleset_version);
  const active = await getActiveConfig(q);
  // Flags that gate *availability* follow the active config; rules are pinned.
  return { cfg, mr: modeRules(s.mode, cfg.rules, active.flags), flags: active.flags };
}

// ---------------------------------------------------------------------------
// Issuing questions
// ---------------------------------------------------------------------------

type IssueSource =
  | { kind: 'select' }
  | { kind: 'fixed'; versionId: string; optionOrder: string[] | null; difficulty?: Difficulty };

export async function issueQuestion(
  q: Queryable,
  s: SessionRow,
  position: number,
  mr: ModeRules,
  cfg: ConfigVersion,
  source: IssueSource,
  now: Date,
): Promise<IssuedRow> {
  let versionId: string;
  let optionOrder: string[];
  let difficulty: Difficulty = mr.ladder[position] ?? 'hard';
  if (source.kind === 'select') {
    const pick = await selectQuestion(q, { sessionId: s.id, playerId: s.player_id, difficulty, rules: cfg.rules, now });
    if (!pick) {
      throw new AppError('content_unavailable', 'There are not enough approved questions to continue this game right now.');
    }
    versionId = pick.version_id;
    optionOrder = shuffle(await optionIdsFor(q, versionId));
  } else {
    versionId = source.versionId;
    optionOrder = source.optionOrder ?? shuffle(await optionIdsFor(q, versionId));
    if (source.difficulty) difficulty = source.difficulty;
  }
  const durationMs = mr.timerMs(difficulty);
  const deadline = new Date(now.getTime() + durationMs);
  const [row] = await q.query<IssuedRow>(
    `insert into public.issued_questions
       (session_id, position, version_id, difficulty, option_order, duration_ms, issued_at, deadline_at)
     values ($1, $2, $3, $4, $5::uuid[], $6, $7, $8) returning *`,
    [s.id, position, versionId, difficulty, pgArray(optionOrder), durationMs, now.toISOString(), deadline.toISOString()],
  );
  await q.query(
    `insert into public.player_question_history(player_id, question_id, last_seen_at)
     select $1, v.question_id, $3 from public.question_versions v where v.id = $2
     on conflict (player_id, question_id) do update
       set times_seen = player_question_history.times_seen + 1, last_seen_at = excluded.last_seen_at`,
    [s.player_id, versionId, now.toISOString()],
  );
  await q.query('update public.game_sessions set current_position = $2, updated_at = $3 where id = $1', [
    s.id,
    position,
    now.toISOString(),
  ]);
  s.current_position = position;
  return row;
}

/** Fixed question source for modes that replay a pinned list. */
export type FixedSourceResolver = (q: Queryable, s: SessionRow, position: number) => Promise<IssueSource>;
const fixedResolvers: Partial<Record<GameMode, FixedSourceResolver>> = {};
export function registerFixedSource(mode: GameMode, resolver: FixedSourceResolver) {
  fixedResolvers[mode] = resolver;
}

async function sourceFor(q: Queryable, s: SessionRow, position: number): Promise<IssueSource> {
  const r = fixedResolvers[s.mode];
  return r ? r(q, s, position) : { kind: 'select' };
}

// ---------------------------------------------------------------------------
// Starting games
// ---------------------------------------------------------------------------

export async function createSession(
  q: Queryable,
  args: {
    playerId: string;
    mode: GameMode;
    eligible: boolean;
    cfg: ConfigVersion;
    dailyChallengeId?: string;
    friendChallengeId?: string;
    ghostRecordingId?: string;
    totalQuestions?: number;
    now: Date;
  },
): Promise<SessionRow> {
  const mr = modeRules(args.mode, args.cfg.rules, args.cfg.flags);
  const [s] = await q.query<SessionRow>(
    `insert into public.game_sessions
       (player_id, mode, ruleset_version, scoring_key, total_questions, leaderboard_eligible,
        daily_challenge_id, friend_challenge_id, ghost_recording_id, started_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) returning ${SESSION_COLS}`,
    [
      args.playerId,
      args.mode,
      args.cfg.version,
      scoringKey(args.mode, args.cfg.rules, args.cfg.flags),
      args.totalQuestions ?? mr.questionCount,
      args.eligible,
      args.dailyChallengeId ?? null,
      args.friendChallengeId ?? null,
      args.ghostRecordingId ?? null,
      args.now.toISOString(),
    ],
  );
  return s;
}

export async function startClassic(q: Queryable, player: { id: string; kind: string }): Promise<string> {
  const now = clock.now();
  const cfg = await getActiveConfig(q);
  const mr = modeRules('classic', cfg.rules, cfg.flags);
  const counts = await availableCounts(q, cfg.rules);
  // Refuse to start a run that cannot be completed with the approved content.
  for (const d of ['easy', 'medium', 'hard'] as const) {
    const need = mr.ladder.filter((x) => x === d).length;
    if (need && counts[d] < need) {
      throw new AppError('content_unavailable', 'Classic is temporarily unavailable while we add more questions.');
    }
  }
  // Abandon any unfinished Classic run so a player has one active run at a time.
  await q.query(
    `update public.game_sessions set status = 'abandoned', updated_at = $2
      where player_id = $1 and mode = 'classic' and status = 'active'`,
    [player.id, now.toISOString()],
  );
  const s = await createSession(q, { playerId: player.id, mode: 'classic', eligible: player.kind === 'account', cfg, now });
  await issueQuestion(q, s, 0, mr, cfg, { kind: 'select' }, now);
  return s.id;
}

// ---------------------------------------------------------------------------
// Timeouts (durable, server-side; resolved lazily on any read or write and by
// the scheduled sweeper, never by the browser)
// ---------------------------------------------------------------------------

export async function resolveIfExpired(q: Queryable, s: SessionRow, iq: IssuedRow, cfg: ConfigVersion, now: Date): Promise<boolean> {
  if (iq.outcome !== 'pending' || iq.paused_at) return false;
  if (now.getTime() <= iq.deadline_at.getTime() + cfg.rules.latencyGraceMs) return false;
  await recordOutcome(q, s, iq, { outcome: 'timeout', optionId: null, points: 0, responseMs: iq.duration_ms, at: iq.deadline_at, key: null });
  return true;
}

async function recordOutcome(
  q: Queryable,
  s: SessionRow,
  iq: IssuedRow,
  r: { outcome: Outcome; optionId: string | null; points: number; responseMs: number; at: Date; key: string | null },
) {
  const [updated] = await q.query<{ id: string }>(
    `update public.issued_questions
        set outcome = $2, selected_option_id = $3, points = $4, response_ms = $5, answered_at = $6, submission_key = $7
      where id = $1 and outcome = 'pending' returning id`,
    [iq.id, r.outcome, r.optionId, r.points, r.responseMs, r.at.toISOString(), r.key],
  );
  if (!updated) throw new AppError('conflict', 'This question has already been answered.');
  Object.assign(iq, {
    outcome: r.outcome,
    selected_option_id: r.optionId,
    points: r.points,
    response_ms: r.responseMs,
    answered_at: r.at,
    submission_key: r.key,
  });
  await q.query(
    `update public.game_sessions
        set score = score + $2, correct_count = correct_count + $3, answered_count = answered_count + 1,
            total_response_ms = total_response_ms + $4, updated_at = $5
      where id = $1`,
    [s.id, r.points, r.outcome === 'correct' ? 1 : 0, r.responseMs, r.at.toISOString()],
  );
  s.score += r.points;
  s.correct_count += r.outcome === 'correct' ? 1 : 0;
  s.answered_count += 1;
  s.total_response_ms += r.responseMs;
  // Calibration + historical audience data: unassisted answers only.
  if (!iq.assisted) {
    await q.query(
      `insert into public.question_stats(version_id, unassisted_attempts, unassisted_correct, answer_distribution)
       values ($1, 1, $2, case when $3::text is null then '{}'::jsonb else jsonb_build_object($3::text, 1) end)
       on conflict (version_id) do update set
         unassisted_attempts = question_stats.unassisted_attempts + 1,
         unassisted_correct = question_stats.unassisted_correct + excluded.unassisted_correct,
         answer_distribution = case when $3::text is null then question_stats.answer_distribution
           else jsonb_set(question_stats.answer_distribution, array[$3::text],
                          to_jsonb(coalesce((question_stats.answer_distribution ->> $3::text)::int, 0) + 1)) end,
         updated_at = now()`,
      [iq.version_id, r.outcome === 'correct' ? 1 : 0, r.optionId],
    );
  }
}

/** Steps run after a session is locked and before it is inspected (e.g. settle audience votes). */
export type PreStep = (q: Queryable, sessionId: string, now: Date) => Promise<void>;
const preSteps: PreStep[] = [];
export function registerPreStep(step: PreStep) {
  preSteps.push(step);
}
async function runPreSteps(q: Queryable, s: SessionRow, now: Date) {
  if (s.status !== 'active') return;
  for (const step of preSteps) await step(q, s.id, now);
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

export async function submitAnswer(
  q: Queryable,
  playerId: string,
  sessionId: string,
  input: { issuedId: string; optionId: string; submissionKey: string },
): Promise<SessionView> {
  const now = clock.now();
  const s = await lockSession(q, sessionId, playerId);
  await runPreSteps(q, s, now);
  const { cfg, mr } = await rulesFor(q, s);
  if (!isUuid(input.issuedId) || !isUuid(input.optionId)) throw new AppError('bad_request', 'Invalid answer.');
  const [iq] = await q.query<IssuedRow>('select * from public.issued_questions where id = $1 and session_id = $2', [
    input.issuedId,
    s.id,
  ]);
  if (!iq) throw notFound('Question');
  if (iq.outcome === 'replaced') throw new AppError('conflict', 'This question was replaced.', 'question_replaced');
  if (iq.outcome !== 'pending') {
    // Idempotent retry of the same submission returns the recorded result.
    if (iq.submission_key === input.submissionKey) return buildView(q, s, now);
    throw new AppError('conflict', 'This question has already been answered.', 'already_answered');
  }
  if (s.status !== 'active' || iq.position !== s.current_position) {
    throw new AppError('conflict', 'This question is no longer active.', 'not_current');
  }
  if (iq.paused_at) throw new AppError('conflict', 'Wait for the audience result before answering.', 'paused');
  if (!iq.option_order.includes(input.optionId) || iq.removed_option_ids.includes(input.optionId)) {
    throw new AppError('bad_request', 'That answer is not one of the options.');
  }
  const timing = judgeTiming({
    now: now.getTime(),
    issuedAt: iq.issued_at.getTime(),
    deadlineAt: iq.deadline_at.getTime(),
    durationMs: iq.duration_ms,
    graceMs: cfg.rules.latencyGraceMs,
  });
  if (!timing.timely) {
    await resolveIfExpired(q, s, iq, cfg, now);
    return buildView(q, s, now);
  }
  const [key] = await q.query<{ correct_option_id: string }>(
    'select correct_option_id from private.answer_keys where version_id = $1',
    [iq.version_id],
  );
  const outcome: Outcome = key.correct_option_id === input.optionId ? 'correct' : 'incorrect';
  const points = scoreAnswer({
    outcome,
    difficulty: iq.difficulty,
    points: mr.points,
    speedBonusFactor: mr.speedBonusFactor,
    remainingMs: timing.remainingMs,
    durationMs: iq.duration_ms,
  });
  await recordOutcome(q, s, iq, { outcome, optionId: input.optionId, points, responseMs: timing.responseMs, at: now, key: input.submissionKey });
  return buildView(q, s, now);
}

// ---------------------------------------------------------------------------
// Advancing
// ---------------------------------------------------------------------------

export type CompletionHook = (q: Queryable, s: SessionRow, now: Date) => Promise<void>;
const completionHooks: CompletionHook[] = [];
export function onSessionCompleted(hook: CompletionHook) {
  completionHooks.push(hook);
}

export async function completeSession(q: Queryable, s: SessionRow, now: Date) {
  const [row] = await q.query<{ id: string }>(
    `update public.game_sessions set status = 'completed', completed_at = $2, updated_at = $2
      where id = $1 and status = 'active' returning id`,
    [s.id, now.toISOString()],
  );
  if (!row) return;
  s.status = 'completed';
  s.completed_at = now;
  for (const hook of completionHooks) await hook(q, s, now);
}

export async function advance(q: Queryable, playerId: string, sessionId: string, fromPosition: number): Promise<SessionView> {
  const now = clock.now();
  const s = await lockSession(q, sessionId, playerId);
  if (s.status !== 'active' || s.current_position > fromPosition) return buildView(q, s, now);
  await runPreSteps(q, s, now);
  const { cfg, mr } = await rulesFor(q, s);
  const iq = await currentIssued(q, s.id, s.current_position);
  if (!iq) throw new AppError('internal', 'Game state is inconsistent.');
  await resolveIfExpired(q, s, iq, cfg, now);
  if (iq.outcome === 'pending') throw new AppError('conflict', 'Answer the current question first.', 'question_pending');
  const last = s.current_position + 1 >= s.total_questions;
  if (last || (mr.endOnWrongAnswer && iq.outcome !== 'correct')) {
    await completeSession(q, s, now);
  } else {
    const next = s.current_position + 1;
    await issueQuestion(q, s, next, mr, cfg, await sourceFor(q, s, next), now);
  }
  return buildView(q, s, now);
}

export async function getSessionView(q: Queryable, playerId: string, sessionId: string): Promise<SessionView> {
  const now = clock.now();
  const s = await lockSession(q, sessionId, playerId);
  await runPreSteps(q, s, now);
  if (s.status === 'active') {
    const { cfg } = await rulesFor(q, s);
    const iq = await currentIssued(q, s.id, s.current_position);
    if (iq) await resolveIfExpired(q, s, iq, cfg, now);
  }
  return buildView(q, s, now);
}

// ---------------------------------------------------------------------------
// Lifelines
// ---------------------------------------------------------------------------

export type LifelineHandler = (
  q: Queryable,
  ctx: { s: SessionRow; iq: IssuedRow; cfg: ConfigVersion; mr: ModeRules; now: Date },
) => Promise<Record<string, unknown>>;
const lifelineHandlers: Partial<Record<Lifeline, LifelineHandler>> = {};
export function registerLifeline(l: Lifeline, h: LifelineHandler) {
  lifelineHandlers[l] = h;
}

export async function useLifeline(
  q: Queryable,
  playerId: string,
  sessionId: string,
  input: { issuedId: string; lifeline: Lifeline; requestKey: string },
): Promise<SessionView> {
  const now = clock.now();
  const s = await lockSession(q, sessionId, playerId);
  await runPreSteps(q, s, now);
  const { cfg, mr } = await rulesFor(q, s);
  if (!mr.lifelines[input.lifeline]) throw new AppError('bad_request', 'That lifeline is not available in this mode.');
  const [used] = await q.query<{ request_key: string | null }>(
    'select request_key from public.lifeline_uses where session_id = $1 and lifeline = $2',
    [s.id, input.lifeline],
  );
  if (used) {
    // A duplicate request (same key) is a no-op; anything else is a second use.
    if (used.request_key === input.requestKey) return buildView(q, s, now);
    throw new AppError('conflict', 'You have already used this lifeline.', 'lifeline_used');
  }
  if (s.status !== 'active') throw new AppError('conflict', 'This game has finished.');
  const iq = await currentIssued(q, s.id, s.current_position);
  if (!iq || iq.id !== input.issuedId) throw new AppError('conflict', 'This question is no longer active.', 'not_current');
  await resolveIfExpired(q, s, iq, cfg, now);
  if (iq.outcome !== 'pending') throw new AppError('conflict', 'Lifelines cannot be used after the answer is locked.', 'answer_locked');
  if (iq.paused_at) throw new AppError('conflict', 'Wait for the audience result first.', 'paused');
  const handler = lifelineHandlers[input.lifeline];
  if (!handler) throw new AppError('bad_request', 'That lifeline is not available.');
  const result = await handler(q, { s, iq, cfg, mr, now });
  await q.query(
    `insert into public.lifeline_uses(session_id, lifeline, issued_question_id, request_key, result, used_at)
     values ($1, $2, $3, $4, $5::jsonb, $6)`,
    [s.id, input.lifeline, iq.id, input.requestKey, JSON.stringify(result), now.toISOString()],
  );
  await q.query('update public.game_sessions set lifelines_used = lifelines_used + 1 where id = $1', [s.id]);
  s.lifelines_used += 1;
  return buildView(q, s, now);
}

registerLifeline('fifty_fifty', async (q, { iq }) => {
  const [key] = await q.query<{ correct_option_id: string }>(
    'select correct_option_id from private.answer_keys where version_id = $1',
    [iq.version_id],
  );
  const wrong = iq.option_order.filter((id) => id !== key.correct_option_id);
  const keep = shuffle(wrong)[0];
  const removed = wrong.filter((id) => id !== keep);
  await q.query('update public.issued_questions set removed_option_ids = $2::uuid[], assisted = true where id = $1', [
    iq.id,
    pgArray(removed),
  ]);
  // 50/50 does not reset the timer.
  return { removed };
});

registerLifeline('change_question', async (q, { s, iq, cfg, mr, now }) => {
  const pick = await selectQuestion(q, { sessionId: s.id, playerId: s.player_id, difficulty: iq.difficulty, rules: cfg.rules, now });
  if (!pick) {
    // Thrown inside the transaction: nothing is consumed.
    throw new AppError('content_unavailable', 'No replacement question is available right now. Your lifeline has not been used.', 'no_replacement');
  }
  await q.query(`update public.issued_questions set outcome = 'replaced', answered_at = $2 where id = $1`, [iq.id, now.toISOString()]);
  const fresh = await issueQuestion(
    q,
    s,
    iq.position,
    mr,
    cfg,
    { kind: 'fixed', versionId: pick.version_id, optionOrder: null, difficulty: iq.difficulty },
    now,
  );
  return { replaced: iq.id, replacement: fresh.id };
});

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export type ViewDecorator = (q: Queryable, s: SessionRow, view: SessionView, now: Date) => Promise<void>;
const decorators: ViewDecorator[] = [];
export function registerViewDecorator(d: ViewDecorator) {
  decorators.push(d);
}

export async function buildView(q: Queryable, s: SessionRow, now: Date): Promise<SessionView> {
  const cfg = await getConfigVersion(q, s.ruleset_version);
  const active = await getActiveConfig(q);
  const mr = modeRules(s.mode, cfg.rules, active.flags);
  const resolved = await q.query<{ position: number; outcome: Outcome }>(
    `select position, outcome from public.issued_questions
      where session_id = $1 and outcome in ('correct', 'incorrect', 'timeout') order by position`,
    [s.id],
  );
  const history: SessionView['history'] = Array.from({ length: s.total_questions }, () => null);
  for (const r of resolved) history[r.position] = r.outcome;

  const usedRows = await q.query<{ lifeline: Lifeline }>('select lifeline from public.lifeline_uses where session_id = $1', [s.id]);
  const used = new Set(usedRows.map((r) => r.lifeline));
  const lifelines = Object.fromEntries(
    (['fifty_fifty', 'change_question', 'ask_audience'] as const).map((l) => [
      l,
      (used.has(l) ? 'used' : mr.lifelines[l] ? 'available' : 'disabled') as LifelineState,
    ]),
  ) as Record<Lifeline, LifelineState>;

  const view: SessionView = {
    id: s.id,
    mode: s.mode,
    status: s.status,
    phase: 'completed',
    totalQuestions: s.total_questions,
    position: s.current_position,
    score: s.score,
    correctCount: s.correct_count,
    answeredCount: s.answered_count,
    ladder: mr.ladder.slice(0, s.total_questions).map((d) => ({ difficulty: d, points: mr.points[d] })),
    history,
    question: null,
    feedback: null,
    lifelines,
    audience: null,
    ghost: null,
    challengeDate: null,
    friendChallenge: null,
    leaderboardEligible: s.leaderboard_eligible,
    serverTime: now.toISOString(),
  };

  if (s.status === 'active') {
    const iq = await currentIssued(q, s.id, s.current_position);
    if (iq) {
      const [v] = await q.query<{ text: string; explanation: string; sources: { title: string; url: string }[]; category_id: string; category_name: string }>(
        `select v.text, v.explanation, v.sources, v.category_id, c.name as category_name
           from public.question_versions v join public.categories c on c.id = v.category_id where v.id = $1`,
        [iq.version_id],
      );
      const opts = await q.query<{ id: string; text: string }>('select id, text from public.question_options where version_id = $1', [
        iq.version_id,
      ]);
      const byId = new Map(opts.map((o) => [o.id, o.text]));
      const labels = ['A', 'B', 'C', 'D'] as const;
      const remainingMs = iq.paused_at
        ? Math.max(0, iq.deadline_at.getTime() - iq.paused_at.getTime())
        : Math.max(0, iq.deadline_at.getTime() - now.getTime());
      view.question = {
        issuedId: iq.id,
        position: iq.position,
        difficulty: iq.difficulty,
        points: mr.points[iq.difficulty],
        category: { id: v.category_id, name: v.category_name },
        text: v.text,
        options: iq.option_order.map((id, i) => ({ id, text: byId.get(id) ?? '', label: labels[i] })),
        removedOptionIds: iq.removed_option_ids,
        durationMs: iq.duration_ms,
        deadlineAt: iq.deadline_at.toISOString(),
        remainingMs,
        paused: !!iq.paused_at,
      };
      if (iq.outcome === 'pending') {
        view.phase = 'question';
      } else {
        // The answer key and explanation are revealed only once the answer is locked.
        const [key] = await q.query<{ correct_option_id: string }>(
          'select correct_option_id from private.answer_keys where version_id = $1',
          [iq.version_id],
        );
        view.phase = 'feedback';
        view.feedback = {
          issuedId: iq.id,
          outcome: iq.outcome as FeedbackView['outcome'],
          selectedOptionId: iq.selected_option_id,
          correctOptionId: key.correct_option_id,
          explanation: v.explanation,
          points: iq.points,
          responseMs: iq.response_ms,
          sources: v.sources ?? [],
        };
      }
    }
  }
  for (const d of decorators) await d(q, s, view, now);
  return view;
}

export const _internal = { recordOutcome, sourceFor };
