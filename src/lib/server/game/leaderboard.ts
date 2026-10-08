import 'server-only';
import { scoringKey } from '@/lib/game/rules';
import { getActiveConfig } from '../config';
import type { Queryable } from '../db';

export type BoardEntry = {
  rank: number;
  playerId: string;
  displayName: string;
  avatarKey: string;
  countryCode: string | null;
  score: number;
  correct: number;
  responseMs: number;
  isMe: boolean;
};

export type Board = { entries: BoardEntry[]; total: number; me: BoardEntry | null; label: string };

// Only public profile fields leave this module: display name, avatar, country.
const RANK = 'rank() over (order by score desc, correct desc, ms asc)::int';

type Row = {
  r: number;
  player_id: string;
  display_name: string;
  avatar_key: string;
  country_code: string | null;
  score: number;
  correct: number;
  ms: number;
  total: number;
};

function toEntry(r: Row, me: string | null): BoardEntry {
  return {
    rank: r.r,
    playerId: r.player_id,
    displayName: r.display_name,
    avatarKey: r.avatar_key,
    countryCode: r.country_code,
    score: r.score,
    correct: r.correct,
    responseMs: Number(r.ms),
    isMe: r.player_id === me,
  };
}

const DAILY_ENTRIES = `
  select s.id as session_id, s.player_id, p.display_name, p.avatar_key, p.country_code,
         s.score, s.correct_count as correct, s.total_response_ms::int as ms
    from public.daily_attempts da
    join public.game_sessions s on s.id = da.session_id
    join public.players p on p.id = s.player_id
   where da.challenge_id = $1 and da.player_id = s.player_id
     and s.status = 'completed' and s.leaderboard_eligible`;

const CLASSIC_ENTRIES = `
  select distinct on (s.player_id) s.id as session_id, s.player_id, p.display_name, p.avatar_key, p.country_code,
         s.score, s.correct_count as correct, s.total_response_ms::int as ms
    from public.game_sessions s join public.players p on p.id = s.player_id
   where s.mode = 'classic' and s.status = 'completed' and s.leaderboard_eligible and s.scoring_key = $1
   order by s.player_id, s.score desc, s.correct_count desc, s.total_response_ms asc, s.completed_at asc`;

async function board(q: Queryable, entriesSql: string, key: string, opts: { limit: number; offset: number; playerId: string | null }, label: string): Promise<Board> {
  const rows = await q.query<Row>(
    `with e as (${entriesSql}), ranked as (select *, ${RANK} as r, count(*) over ()::int as total from e)
     select * from ranked order by r, display_name, player_id limit $2 offset $3`,
    [key, opts.limit, opts.offset],
  );
  let me: BoardEntry | null = null;
  if (opts.playerId) {
    const [m] = await q.query<Row>(
      `with e as (${entriesSql}), ranked as (select *, ${RANK} as r, count(*) over ()::int as total from e)
       select * from ranked where player_id = $2`,
      [key, opts.playerId],
    );
    if (m) me = toEntry(m, opts.playerId);
  }
  const [count] = rows.length
    ? [{ total: rows[0].total }]
    : await q.query<{ total: number }>(`with e as (${entriesSql}) select count(*)::int as total from e`, [key]);
  return { entries: rows.map((r) => toEntry(r, opts.playerId)), total: count?.total ?? 0, me, label };
}

export async function dailyLeaderboard(
  q: Queryable,
  date: string,
  opts: { limit?: number; offset?: number; playerId?: string | null } = {},
): Promise<Board & { challengeId: string | null }> {
  const [c] = await q.query<{ id: string }>('select id from public.daily_challenges where challenge_date = $1::date', [date]);
  if (!c) return { entries: [], total: 0, me: null, label: `Daily · ${date}`, challengeId: null };
  const b = await board(q, DAILY_ENTRIES, c.id, { limit: opts.limit ?? 50, offset: opts.offset ?? 0, playerId: opts.playerId ?? null }, `Daily · ${date}`);
  return { ...b, challengeId: c.id };
}

export async function classicLeaderboard(
  q: Queryable,
  opts: { limit?: number; offset?: number; playerId?: string | null } = {},
): Promise<Board & { scoringKey: string }> {
  const cfg = await getActiveConfig(q);
  const key = scoringKey('classic', cfg.rules, cfg.flags);
  const b = await board(q, CLASSIC_ENTRIES, key, { limit: opts.limit ?? 50, offset: opts.offset ?? 0, playerId: opts.playerId ?? null }, 'Classic · All-time best');
  return { ...b, scoringKey: key };
}

export async function dailyRankFor(q: Queryable, challengeId: string, sessionId: string): Promise<number | null> {
  const [row] = await q.query<{ r: number }>(
    `with e as (${DAILY_ENTRIES}), ranked as (select *, ${RANK} as r from e) select r from ranked where session_id = $2`,
    [challengeId, sessionId],
  );
  return row?.r ?? null;
}

export async function classicRankFor(q: Queryable, sessionId: string): Promise<number | null> {
  const [s] = await q.query<{ scoring_key: string; player_id: string }>('select scoring_key, player_id from public.game_sessions where id = $1', [sessionId]);
  if (!s) return null;
  const [row] = await q.query<{ r: number; session_id: string }>(
    `with e as (${CLASSIC_ENTRIES}), ranked as (select *, ${RANK} as r from e) select r, session_id from ranked where player_id = $2`,
    [s.scoring_key, s.player_id],
  );
  return row && row.session_id === sessionId ? row.r : null;
}
