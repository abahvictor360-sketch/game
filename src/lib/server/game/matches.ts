import 'server-only';
import { modeRules, scoringKey, type Difficulty, type Rules } from '@/lib/game/rules';
import { compareEntries, judgeTiming, scoreAnswer, type Outcome } from '@/lib/game/scoring';
import { clock } from '../clock';
import { getActiveConfig, getConfigVersion } from '../config';
import { pgArray, type Queryable } from '../db';
import { AppError, notFound } from '../errors';
import { notifyMatch } from '../realtime';
import { difficultyMatchSql, difficultyPreferenceSql, optionIdsFor, shuffle } from './selection';
import { isUuid } from './sessions';

/** A participant is presumed disconnected after this long without a heartbeat. */
export const STALE_PRESENCE_MS = 6000;
const QUEUE_STALE_MS = 10000;

type MatchRow = {
  id: string;
  status: 'countdown' | 'active' | 'completed' | 'cancelled';
  ruleset_version: number;
  total_questions: number;
  current_position: number;
  round_state: 'pending' | 'open' | 'closed';
  round_opened_at: Date | null;
  round_deadline_at: Date | null;
  round_closed_at: Date | null;
  starts_at: Date;
  winner_player_id: string | null;
  result_reason: string | null;
  finalized_at: Date | null;
};

type ParticipantRow = {
  player_id: string;
  seat: number;
  status: 'connected' | 'disconnected' | 'forfeited' | 'finished';
  score: number;
  correct_count: number;
  total_response_ms: number;
  last_seen_at: Date;
  disconnected_at: Date | null;
  display_name: string;
  avatar_key: string;
};

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------

export type QueueState =
  | { status: 'waiting'; waitedMs: number; fallbackAfterMs: number; fallbackAvailable: boolean }
  | { status: 'matched'; matchId: string }
  | { status: 'idle' };

export async function joinQueue(q: Queryable, playerId: string): Promise<QueueState> {
  const cfg = await getActiveConfig(q);
  if (!cfg.flags.multiplayer) throw new AppError('feature_disabled', 'Live matches are not available yet.');
  const now = clock.now();
  const key = scoringKey('match', cfg.rules, cfg.flags);
  const active = await activeMatchFor(q, playerId);
  if (active) return { status: 'matched', matchId: active };
  await q.query(
    `insert into public.matchmaking_entries(player_id, scoring_key, enqueued_at, heartbeat_at, match_id)
     values ($1, $2, $3, $3, null)
     on conflict (player_id) do update set heartbeat_at = excluded.heartbeat_at,
       enqueued_at = case when matchmaking_entries.match_id is not null or matchmaking_entries.heartbeat_at < $4::timestamptz
                          then excluded.enqueued_at else matchmaking_entries.enqueued_at end,
       match_id = case when matchmaking_entries.match_id is not null then null else matchmaking_entries.match_id end,
       scoring_key = excluded.scoring_key`,
    [playerId, key, now.toISOString(), new Date(now.getTime() - QUEUE_STALE_MS).toISOString()],
  );
  return pollQueue(q, playerId);
}

export async function pollQueue(q: Queryable, playerId: string): Promise<QueueState> {
  const now = clock.now();
  const cfg = await getActiveConfig(q);
  const [me] = await q.query<{ enqueued_at: Date; match_id: string | null; scoring_key: string }>(
    'select enqueued_at, match_id, scoring_key from public.matchmaking_entries where player_id = $1 for update',
    [playerId],
  );
  if (!me) return { status: 'idle' };
  if (me.match_id) return { status: 'matched', matchId: me.match_id };
  await q.query('update public.matchmaking_entries set heartbeat_at = $2 where player_id = $1', [playerId, now.toISOString()]);
  const [other] = await q.query<{ player_id: string }>(
    `select player_id from public.matchmaking_entries
      where player_id <> $1 and match_id is null and scoring_key = $2 and heartbeat_at > $3::timestamptz
      order by enqueued_at limit 1 for update skip locked`,
    [playerId, me.scoring_key, new Date(now.getTime() - QUEUE_STALE_MS).toISOString()],
  );
  if (other) {
    const matchId = await createMatch(q, [other.player_id, playerId], cfg.version, cfg.rules, now);
    if (matchId) {
      await q.query('update public.matchmaking_entries set match_id = $2 where player_id = any($1::uuid[])', [
        pgArray([playerId, other.player_id]),
        matchId,
      ]);
      return { status: 'matched', matchId };
    }
  }
  const waitedMs = now.getTime() - me.enqueued_at.getTime();
  return {
    status: 'waiting',
    waitedMs,
    fallbackAfterMs: cfg.rules.versus.matchmakingFallbackMs,
    fallbackAvailable: waitedMs >= cfg.rules.versus.matchmakingFallbackMs,
  };
}

export async function leaveQueue(q: Queryable, playerId: string) {
  await q.query('delete from public.matchmaking_entries where player_id = $1 and match_id is null', [playerId]);
}

async function activeMatchFor(q: Queryable, playerId: string): Promise<string | null> {
  const [row] = await q.query<{ id: string }>(
    `select m.id from public.matches m join public.match_participants p on p.match_id = m.id
      where p.player_id = $1 and m.status in ('countdown', 'active') and p.status <> 'forfeited' limit 1`,
    [playerId],
  );
  return row?.id ?? null;
}

async function createMatch(q: Queryable, players: string[], version: number, rules: Rules, now: Date): Promise<string | null> {
  const cfg = await getConfigVersion(q, version);
  const mr = modeRules('match', rules, cfg.flags);
  const since = new Date(now.getTime() - rules.freshness.recentWindowDays * 86400000).toISOString();
  const picked: { version_id: string; difficulty: Difficulty }[] = [];
  for (const d of ['easy', 'medium', 'hard'] as const) {
    const need = mr.ladder.filter((x) => x === d).length;
    if (!need) continue;
    const rows = await q.query<{ version_id: string }>(
      `select v.id as version_id from public.questions qq
         join public.question_versions v on v.id = qq.live_version_id
         left join public.question_stats s on s.version_id = v.id
        where qq.status = 'approved' and v.language = $1 and v.age_rating = any($2::text[])
          and ${difficultyMatchSql('$3', { minSample: '$4', easy: '$5', hard: '$6' })}
        order by (select count(*) from public.player_question_history h
                   where h.question_id = qq.id and h.player_id = any($7::uuid[]) and h.last_seen_at > $8::timestamptz) asc,
                 ${difficultyPreferenceSql('$3', { minSample: '$4', easy: '$5', hard: '$6' })},
                 random()
        limit $9`,
      [rules.content.language, pgArray(rules.content.allowedAgeRatings), d, rules.calibration.minSample, rules.calibration.easyAtOrAbove, rules.calibration.hardBelow, pgArray(players), since, need],
    );
    if (rows.length < need) return null;
    picked.push(...rows.map((r) => ({ version_id: r.version_id, difficulty: d })));
  }
  const startsAt = new Date(now.getTime() + rules.versus.countdownMs);
  const [m] = await q.query<{ id: string }>(
    `insert into public.matches(ruleset_version, scoring_key, total_questions, starts_at) values ($1, $2, $3, $4) returning id`,
    [version, scoringKey('match', rules, cfg.flags), picked.length, startsAt.toISOString()],
  );
  for (const [i, p] of picked.entries()) {
    await q.query('insert into public.match_questions(match_id, position, version_id, option_order) values ($1, $2, $3, $4::uuid[])', [
      m.id,
      i,
      p.version_id,
      pgArray(shuffle(await optionIdsFor(q, p.version_id))),
    ]);
  }
  for (const [i, pid] of players.entries()) {
    await q.query('insert into public.match_participants(match_id, player_id, seat, last_seen_at) values ($1, $2, $3, $4)', [m.id, pid, i + 1, now.toISOString()]);
  }
  return m.id;
}

// ---------------------------------------------------------------------------
// Authoritative state machine. Advanced by `tick` under a row lock on every
// read/answer and by the scheduled sweeper. Never by browser timers.
// ---------------------------------------------------------------------------

async function loadMatch(q: Queryable, matchId: string): Promise<MatchRow | null> {
  const [m] = await q.query<MatchRow>('select * from public.matches where id = $1 for update', [matchId]);
  return m ?? null;
}

async function loadParticipants(q: Queryable, matchId: string): Promise<ParticipantRow[]> {
  return q.query<ParticipantRow>(
    `select mp.player_id, mp.seat, mp.status, mp.score, mp.correct_count, mp.total_response_ms::int as total_response_ms,
            mp.last_seen_at, mp.disconnected_at, p.display_name, p.avatar_key
       from public.match_participants mp join public.players p on p.id = mp.player_id
      where mp.match_id = $1 order by mp.seat`,
    [matchId],
  );
}

async function difficultyAt(q: Queryable, matchId: string, position: number): Promise<{ difficulty: Difficulty; version_id: string; option_order: string[] }> {
  const [row] = await q.query<{ difficulty: Difficulty; version_id: string; option_order: string[] }>(
    `select v.difficulty, mq.version_id, mq.option_order from public.match_questions mq
       join public.question_versions v on v.id = mq.version_id where mq.match_id = $1 and mq.position = $2`,
    [matchId, position],
  );
  return row;
}

export async function tickMatch(q: Queryable, matchId: string, now = clock.now()): Promise<MatchRow | null> {
  let m: MatchRow | null = await loadMatch(q, matchId);
  if (!m) return null;
  const cfg = await getConfigVersion(q, m.ruleset_version);
  const rules = cfg.rules;
  let changed = false;
  for (let guard = 0; guard < 64; guard++) {
    if (m.status === 'completed' || m.status === 'cancelled') break;
    const parts = await loadParticipants(q, m.id);
    // Presence: mark stale connections, then forfeit after the reconnection window.
    for (const p of parts) {
      if (p.status === 'connected' && now.getTime() - p.last_seen_at.getTime() > STALE_PRESENCE_MS) {
        await q.query(`update public.match_participants set status = 'disconnected', disconnected_at = last_seen_at where match_id = $1 and player_id = $2`, [m.id, p.player_id]);
        p.status = 'disconnected';
        p.disconnected_at = p.last_seen_at;
        changed = true;
      }
      if (p.status === 'disconnected' && p.disconnected_at && now.getTime() - p.disconnected_at.getTime() > rules.versus.reconnectWindowMs) {
        await q.query(`update public.match_participants set status = 'forfeited' where match_id = $1 and player_id = $2`, [m.id, p.player_id]);
        p.status = 'forfeited';
        changed = true;
      }
    }
    const live = parts.filter((p) => p.status !== 'forfeited');
    if (live.length === 0) {
      await finalize(q, m, 'cancelled', null, 'both_disconnected');
      changed = true;
      break;
    }
    if (m.status === 'countdown') {
      if (now.getTime() < m.starts_at.getTime()) break;
      // Starting a match needs both players present.
      if (live.length < 2) {
        await finalize(q, m, 'cancelled', null, 'opponent_missing');
        changed = true;
        break;
      }
      m = await openRound(q, m, 0, m.starts_at);
      changed = true;
      continue;
    }
    if (m.round_state === 'open') {
      const answered: { player_id: string }[] = await q.query<{ player_id: string }>('select player_id from public.match_answers where match_id = $1 and position = $2', [m.id, m.current_position]);
      const answeredSet = new Set<string>(answered.map((a) => a.player_id));
      const deadlinePassed: boolean = now.getTime() > m.round_deadline_at!.getTime() + rules.latencyGraceMs;
      const allAnswered: boolean = live.every((p) => answeredSet.has(p.player_id));
      if (!allAnswered && !deadlinePassed) break;
      const closedAt: Date = allAnswered && !deadlinePassed ? now : new Date(m.round_deadline_at!.getTime() + rules.latencyGraceMs);
      for (const p of live) {
        if (answeredSet.has(p.player_id)) continue;
        const { difficulty } = await difficultyAt(q, m.id, m.current_position);
        await q.query(
          `insert into public.match_answers(match_id, position, player_id, outcome, points, response_ms, answered_at)
           values ($1, $2, $3, 'timeout', 0, $4, $5) on conflict do nothing`,
          [m.id, m.current_position, p.player_id, rules.timersMs[difficulty], closedAt.toISOString()],
        );
        await q.query(
          `update public.match_participants set total_response_ms = total_response_ms + $3 where match_id = $1 and player_id = $2`,
          [m.id, p.player_id, rules.timersMs[difficulty]],
        );
      }
      [m] = await q.query<MatchRow>(`update public.matches set round_state = 'closed', round_closed_at = $2 where id = $1 returning *`, [m.id, closedAt.toISOString()]);
      changed = true;
      continue;
    }
    if (m.round_state === 'closed') {
      const nextAt = m.round_closed_at!.getTime() + rules.versus.revealMs;
      if (now.getTime() < nextAt) break;
      if (m.current_position + 1 >= m.total_questions) {
        await finishMatch(q, m, parts);
        changed = true;
        break;
      }
      m = await openRound(q, m, m.current_position + 1, new Date(nextAt));
      changed = true;
      continue;
    }
    break;
  }
  if (changed) await notifyMatch(m.id);
  return (await loadMatch(q, m.id))!;
}

async function openRound(q: Queryable, m: MatchRow, position: number, at: Date): Promise<MatchRow> {
  const cfg = await getConfigVersion(q, m.ruleset_version);
  const { difficulty } = await difficultyAt(q, m.id, position);
  const deadline = new Date(at.getTime() + cfg.rules.timersMs[difficulty]);
  const [row] = await q.query<MatchRow>(
    `update public.matches set status = 'active', current_position = $2, round_state = 'open', round_opened_at = $3,
            round_deadline_at = $4, round_closed_at = null where id = $1 returning *`,
    [m.id, position, at.toISOString(), deadline.toISOString()],
  );
  return row;
}

async function finishMatch(q: Queryable, m: MatchRow, parts: ParticipantRow[]) {
  const live = parts.filter((p) => p.status !== 'forfeited');
  if (live.length === 1 && parts.length === 2) return finalize(q, m, 'completed', live[0].player_id, 'forfeit');
  if (live.length === 0) return finalize(q, m, 'cancelled', null, 'both_disconnected');
  const [a, b] = live.map((p) => ({ id: p.player_id, score: p.score, correct: p.correct_count, responseMs: p.total_response_ms }));
  const cmp = compareEntries(a, b);
  return finalize(q, m, 'completed', cmp === 0 ? null : cmp < 0 ? a.id : b.id, cmp === 0 ? 'draw' : 'score');
}

/** Single, idempotent finalisation (guarded by finalized_at). */
async function finalize(q: Queryable, m: MatchRow, status: 'completed' | 'cancelled', winner: string | null, reason: string) {
  const [row] = await q.query<{ id: string }>(
    `update public.matches set status = $2, winner_player_id = $3, result_reason = $4, finalized_at = now(), round_state = 'closed'
      where id = $1 and finalized_at is null returning id`,
    [m.id, status, winner, reason],
  );
  if (!row) return;
  await q.query(`update public.match_participants set status = 'finished' where match_id = $1 and status in ('connected', 'disconnected')`, [m.id]);
  await q.query('delete from public.matchmaking_entries where match_id = $1', [m.id]);
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

async function participant(q: Queryable, matchId: string, playerId: string) {
  if (!isUuid(matchId)) throw notFound('Match');
  const [p] = await q.query<{ status: string }>('select status from public.match_participants where match_id = $1 and player_id = $2', [matchId, playerId]);
  if (!p) throw notFound('Match');
  return p;
}

/** Heartbeat: restores a disconnected player within the window (timers keep running). */
async function heartbeat(q: Queryable, matchId: string, playerId: string, now: Date) {
  const [row] = await q.query<{ was: string }>(
    `update public.match_participants mp set last_seen_at = $3,
            status = case when mp.status = 'disconnected' then 'connected' else mp.status end,
            disconnected_at = case when mp.status = 'disconnected' then null else mp.disconnected_at end
      from (select status as was from public.match_participants where match_id = $1 and player_id = $2) prev
      where mp.match_id = $1 and mp.player_id = $2 returning prev.was`,
    [matchId, playerId, now.toISOString()],
  );
  return row?.was === 'disconnected';
}

export async function submitMatchAnswer(q: Queryable, playerId: string, matchId: string, input: { position: number; optionId: string }) {
  const now = clock.now();
  await participant(q, matchId, playerId);
  await heartbeat(q, matchId, playerId, now);
  const m = await tickMatch(q, matchId, now);
  if (!m) throw notFound('Match');
  const [me] = await q.query<{ status: string }>('select status from public.match_participants where match_id = $1 and player_id = $2', [matchId, playerId]);
  if (me.status === 'forfeited') throw new AppError('conflict', 'You left this match.', 'forfeited');
  if (m.status !== 'active' || m.round_state !== 'open' || m.current_position !== input.position) {
    throw new AppError('conflict', 'This round has closed.', 'round_closed');
  }
  const [existing] = await q.query('select 1 from public.match_answers where match_id = $1 and position = $2 and player_id = $3', [matchId, input.position, playerId]);
  if (existing) return getMatchView(q, playerId, matchId);
  const cfg = await getConfigVersion(q, m.ruleset_version);
  const mq = await difficultyAt(q, matchId, input.position);
  if (!isUuid(input.optionId) || !mq.option_order.includes(input.optionId)) throw new AppError('bad_request', 'Invalid option.');
  const duration = cfg.rules.timersMs[mq.difficulty];
  const t = judgeTiming({ now: now.getTime(), issuedAt: m.round_opened_at!.getTime(), deadlineAt: m.round_deadline_at!.getTime(), durationMs: duration, graceMs: cfg.rules.latencyGraceMs });
  const [key] = await q.query<{ correct_option_id: string }>('select correct_option_id from private.answer_keys where version_id = $1', [mq.version_id]);
  const outcome: Outcome = !t.timely ? 'timeout' : key.correct_option_id === input.optionId ? 'correct' : 'incorrect';
  const points = scoreAnswer({ outcome, difficulty: mq.difficulty, points: cfg.rules.points, speedBonusFactor: cfg.rules.versus.speedBonusFactor, remainingMs: t.remainingMs, durationMs: duration });
  await q.query(
    `insert into public.match_answers(match_id, position, player_id, selected_option_id, outcome, points, response_ms, answered_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing`,
    [matchId, input.position, playerId, outcome === 'timeout' ? null : input.optionId, outcome, points, t.responseMs, now.toISOString()],
  );
  await q.query(
    `update public.match_participants set score = score + $3, correct_count = correct_count + $4, total_response_ms = total_response_ms + $5
      where match_id = $1 and player_id = $2`,
    [matchId, playerId, points, outcome === 'correct' ? 1 : 0, t.responseMs],
  );
  await notifyMatch(matchId);
  await tickMatch(q, matchId, now);
  return getMatchView(q, playerId, matchId);
}

export async function forfeitMatch(q: Queryable, playerId: string, matchId: string) {
  await participant(q, matchId, playerId);
  // Bring the match up to date first, so a forfeit after kick-off counts as one.
  await tickMatch(q, matchId);
  await q.query(`update public.match_participants set status = 'forfeited' where match_id = $1 and player_id = $2 and status in ('connected','disconnected')`, [matchId, playerId]);
  await tickMatch(q, matchId);
  await notifyMatch(matchId);
}

export type MatchView = {
  id: string;
  status: MatchRow['status'];
  position: number;
  totalQuestions: number;
  roundState: MatchRow['round_state'];
  startsAt: string;
  deadlineAt: string | null;
  revealUntil: string | null;
  serverTime: string;
  reconnectWindowMs: number;
  reconnected: boolean;
  question: null | {
    position: number;
    difficulty: Difficulty;
    points: number;
    category: string;
    text: string;
    durationMs: number;
    options: { id: string; text: string; label: 'A' | 'B' | 'C' | 'D' }[];
  };
  me: { name: string; avatarKey: string; score: number; answered: boolean; selectedOptionId: string | null; status: string };
  opponent: { name: string; avatarKey: string; score: number; answered: boolean; status: string; disconnectedForMs: number | null };
  reveal: null | { correctOptionId: string; explanation: string; myOutcome: Outcome; myPoints: number; opponentOutcome: Outcome; opponentPoints: number };
  history: { me: (Outcome | null)[]; opponent: (Outcome | null)[] };
  result: null | { outcome: 'win' | 'loss' | 'draw' | 'cancelled'; reason: string };
};

export async function getMatchView(q: Queryable, playerId: string, matchId: string): Promise<MatchView> {
  const now = clock.now();
  await participant(q, matchId, playerId);
  const reconnected = await heartbeat(q, matchId, playerId, now);
  const m = (await tickMatch(q, matchId, now))!;
  const cfg = await getConfigVersion(q, m.ruleset_version);
  const parts = await loadParticipants(q, matchId);
  const me = parts.find((p) => p.player_id === playerId)!;
  const opp = parts.find((p) => p.player_id !== playerId)!;
  const answers = await q.query<{ position: number; player_id: string; selected_option_id: string | null; outcome: Outcome; points: number }>(
    'select position, player_id, selected_option_id, outcome, points from public.match_answers where match_id = $1 order by position',
    [matchId],
  );
  const roundClosed = (pos: number) => pos < m.current_position || (pos === m.current_position && m.round_state === 'closed') || m.status === 'completed';
  // Opponent's answers and points stay private until their round closes.
  const visibleScore = (pid: string) => answers.filter((a) => a.player_id === pid && (pid === playerId || roundClosed(a.position))).reduce((t, a) => t + a.points, 0);
  const hist = (pid: string) => {
    const out: (Outcome | null)[] = Array.from({ length: m.total_questions }, () => null);
    for (const a of answers) if (a.player_id === pid && roundClosed(a.position)) out[a.position] = a.outcome;
    return out;
  };
  let question: MatchView['question'] = null;
  let reveal: MatchView['reveal'] = null;
  if (m.status === 'active' || (m.status === 'completed' && m.round_opened_at)) {
    const mq = await difficultyAt(q, matchId, m.current_position);
    const [v] = await q.query<{ text: string; explanation: string; category: string }>(
      'select v.text, v.explanation, c.name as category from public.question_versions v join public.categories c on c.id = v.category_id where v.id = $1',
      [mq.version_id],
    );
    const opts = await q.query<{ id: string; text: string }>('select id, text from public.question_options where version_id = $1', [mq.version_id]);
    const byId = new Map(opts.map((o) => [o.id, o.text]));
    const labels = ['A', 'B', 'C', 'D'] as const;
    question = {
      position: m.current_position,
      difficulty: mq.difficulty,
      points: cfg.rules.points[mq.difficulty],
      category: v.category,
      text: v.text,
      durationMs: cfg.rules.timersMs[mq.difficulty],
      options: mq.option_order.map((id, i) => ({ id, text: byId.get(id) ?? '', label: labels[i] })),
    };
    if (m.round_state === 'closed') {
      const [key] = await q.query<{ correct_option_id: string }>('select correct_option_id from private.answer_keys where version_id = $1', [mq.version_id]);
      const mine = answers.find((a) => a.position === m.current_position && a.player_id === playerId);
      const theirs = answers.find((a) => a.position === m.current_position && a.player_id === opp.player_id);
      reveal = {
        correctOptionId: key.correct_option_id,
        explanation: v.explanation,
        myOutcome: mine?.outcome ?? 'timeout',
        myPoints: mine?.points ?? 0,
        opponentOutcome: theirs?.outcome ?? 'timeout',
        opponentPoints: theirs?.points ?? 0,
      };
    }
  }
  const mineNow = answers.find((a) => a.position === m.current_position && a.player_id === playerId);
  const theirsNow = answers.find((a) => a.position === m.current_position && a.player_id === opp.player_id);
  let result: MatchView['result'] = null;
  if (m.status === 'cancelled') result = { outcome: 'cancelled', reason: m.result_reason ?? 'cancelled' };
  if (m.status === 'completed') {
    result = {
      outcome: m.winner_player_id === null ? 'draw' : m.winner_player_id === playerId ? 'win' : 'loss',
      reason: m.result_reason ?? 'score',
    };
  }
  return {
    id: m.id,
    status: m.status,
    position: m.current_position,
    totalQuestions: m.total_questions,
    roundState: m.round_state,
    startsAt: m.starts_at.toISOString(),
    deadlineAt: m.round_deadline_at?.toISOString() ?? null,
    revealUntil: m.round_closed_at ? new Date(m.round_closed_at.getTime() + cfg.rules.versus.revealMs).toISOString() : null,
    serverTime: now.toISOString(),
    reconnectWindowMs: cfg.rules.versus.reconnectWindowMs,
    reconnected,
    question,
    me: { name: me.display_name, avatarKey: me.avatar_key, score: visibleScore(playerId), answered: !!mineNow, selectedOptionId: mineNow?.selected_option_id ?? null, status: me.status },
    opponent: {
      name: opp.display_name,
      avatarKey: opp.avatar_key,
      score: visibleScore(opp.player_id),
      answered: !!theirsNow,
      status: opp.status,
      disconnectedForMs: opp.disconnected_at ? now.getTime() - opp.disconnected_at.getTime() : null,
    },
    reveal,
    history: { me: hist(playerId), opponent: hist(opp.player_id) },
    result,
  };
}

/** Sweeper: advance every unfinished match (deadlines, presence, forfeits). */
export async function sweepMatches(q: Queryable) {
  const rows = await q.query<{ id: string }>(`select id from public.matches where status in ('countdown', 'active')`);
  for (const r of rows) await tickMatch(q, r.id);
  return rows.length;
}
