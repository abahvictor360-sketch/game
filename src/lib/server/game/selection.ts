import 'server-only';
import type { Difficulty, Rules } from '@/lib/game/rules';
import { pgArray, type Queryable } from '../db';

/**
 * SQL for a version's *effective* difficulty: the editorial difficulty until
 * enough unassisted answers exist (or when an editor locked it), otherwise the
 * observed bucket from the unassisted correct rate.
 * Expects aliases `v` (question_versions) and `s` (question_stats).
 */
export function effectiveDifficultySql(p: { minSample: string; easy: string; hard: string }) {
  return `(case when coalesce(s.difficulty_locked, false) or coalesce(s.unassisted_attempts, 0) < ${p.minSample} then v.difficulty
               when s.unassisted_correct::float8 / s.unassisted_attempts >= ${p.easy} then 'easy'
               when s.unassisted_correct::float8 / s.unassisted_attempts < ${p.hard} then 'hard'
               else 'medium' end)`;
}

/**
 * A version is eligible for difficulty `d` when its effective difficulty is
 * `d` OR its editorial difficulty is `d`; calibrated matches are preferred
 * (see `difficultyPreferenceSql`). This way calibration refines selection but
 * can never empty a difficulty tier (e.g. after unrepresentative traffic).
 */
export function difficultyMatchSql(d: string, p: { minSample: string; easy: string; hard: string }) {
  return `(${effectiveDifficultySql(p)} = ${d} or v.difficulty = ${d})`;
}
export function difficultyPreferenceSql(d: string, p: { minSample: string; easy: string; hard: string }) {
  return `(${effectiveDifficultySql(p)} = ${d}) desc`;
}

export type Candidate = { question_id: string; version_id: string };

/**
 * Choose the next question for a session:
 *  - approved, live versions only, matching language and allowed age ratings
 *  - never a question already issued in this session (incl. replaced ones)
 *  - prefer questions the player has not seen within the freshness window,
 *    then categories least used in this run, then least-recently seen
 */
export async function selectQuestion(
  q: Queryable,
  args: {
    sessionId: string;
    playerId: string;
    difficulty: Difficulty;
    rules: Rules;
    now: Date;
  },
): Promise<Candidate | null> {
  const { rules } = args;
  const freshSince = new Date(args.now.getTime() - rules.freshness.recentWindowDays * 86400000);
  const rows = await q.query<Candidate>(
    `with used as (
        select v.question_id, v.category_id
          from public.issued_questions iq join public.question_versions v on v.id = iq.version_id
         where iq.session_id = $1
     ), cat_use as (select category_id, count(*) as n from used group by category_id)
     select q.id as question_id, v.id as version_id
       from public.questions q
       join public.question_versions v on v.id = q.live_version_id
       left join public.question_stats s on s.version_id = v.id
       left join public.player_question_history h on h.player_id = $2 and h.question_id = q.id
       left join cat_use cu on cu.category_id = v.category_id
      where q.status = 'approved'
        and v.language = $4 and v.age_rating = any($5::text[])
        and q.id not in (select question_id from used)
        and ${difficultyMatchSql('$3', { minSample: '$6', easy: '$7', hard: '$8' })}
      order by (h.last_seen_at is not null and h.last_seen_at > $9::timestamptz) asc,
               ${difficultyPreferenceSql('$3', { minSample: '$6', easy: '$7', hard: '$8' })},
               coalesce(cu.n, 0) asc,
               h.last_seen_at asc nulls first,
               random()
      limit 1`,
    [
      args.sessionId,
      args.playerId,
      args.difficulty,
      rules.content.language,
      pgArray(rules.content.allowedAgeRatings),
      rules.calibration.minSample,
      rules.calibration.easyAtOrAbove,
      rules.calibration.hardBelow,
      freshSince.toISOString(),
    ],
  );
  return rows[0] ?? null;
}

/** Count of servable questions per difficulty (calibrated or editorial match). */
export async function availableCounts(q: Queryable, rules: Rules): Promise<Record<Difficulty, number>> {
  const p = { minSample: '$3', easy: '$4', hard: '$5' };
  const [row] = await q.query<Record<Difficulty, number>>(
    `select count(*) filter (where ${difficultyMatchSql("'easy'", p)})::int as easy,
            count(*) filter (where ${difficultyMatchSql("'medium'", p)})::int as medium,
            count(*) filter (where ${difficultyMatchSql("'hard'", p)})::int as hard
       from public.questions q
       join public.question_versions v on v.id = q.live_version_id
       left join public.question_stats s on s.version_id = v.id
      where q.status = 'approved' and v.language = $1 and v.age_rating = any($2::text[])`,
    [
      rules.content.language,
      pgArray(rules.content.allowedAgeRatings),
      rules.calibration.minSample,
      rules.calibration.easyAtOrAbove,
      rules.calibration.hardBelow,
    ],
  );
  return row;
}

/**
 * Pick a fixed Daily Challenge set: per difficulty, prefer questions not used
 * in a recent Daily Challenge, spread across categories.
 */
export async function selectDailySet(
  q: Queryable,
  args: { rules: Rules; date: string },
): Promise<{ version_id: string; difficulty: Difficulty }[] | null> {
  const { rules } = args;
  const picked: { version_id: string; difficulty: Difficulty }[] = [];
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const need = rules.daily.distribution[difficulty];
    if (!need) continue;
    const rows = await q.query<{ version_id: string }>(
      `with recent as (
          select distinct v.question_id
            from public.daily_challenge_questions dq
            join public.daily_challenges dc on dc.id = dq.challenge_id
            join public.question_versions v on v.id = dq.version_id
           where dc.challenge_date >= ($1::date - $2::int) and dc.challenge_date < $1::date
       ), pool as (
          select v.id as version_id, v.category_id, (q.id in (select question_id from recent)) as recently_used,
                 ${effectiveDifficultySql({ minSample: '$6', easy: '$7', hard: '$8' })} = $5 as calibrated
            from public.questions q
            join public.question_versions v on v.id = q.live_version_id
            left join public.question_stats s on s.version_id = v.id
           where q.status = 'approved' and v.language = $3 and v.age_rating = any($4::text[])
             and ${difficultyMatchSql('$5', { minSample: '$6', easy: '$7', hard: '$8' })}
       )
       select version_id from (
         select version_id, recently_used, calibrated,
                row_number() over (partition by category_id order by random()) as rn
           from pool
       ) ranked
       order by recently_used asc, calibrated desc, rn asc, random()
       limit $9`,
      [
        args.date,
        rules.daily.reuseCooldownDays,
        rules.content.language,
        pgArray(rules.content.allowedAgeRatings),
        difficulty,
        rules.calibration.minSample,
        rules.calibration.easyAtOrAbove,
        rules.calibration.hardBelow,
        need,
      ],
    );
    if (rows.length < need) return null;
    picked.push(...rows.map((r) => ({ version_id: r.version_id, difficulty })));
  }
  return picked;
}

export async function optionIdsFor(q: Queryable, versionId: string): Promise<string[]> {
  const rows = await q.query<{ id: string }>('select id from public.question_options where version_id = $1 order by label', [versionId]);
  return rows.map((r) => r.id);
}

export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(randomUnit() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randomUnit(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}
