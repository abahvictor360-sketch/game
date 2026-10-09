import 'server-only';
import type { AnswerOutcome, ResultSummary } from '@/lib/shared/types';
import type { Queryable } from '../db';
import { gridFor } from './daily';
import { classicRankFor, dailyRankFor } from './leaderboard';
import { isUuid } from './sessions';
import { BRAND } from '@/lib/shared/brand';

/**
 * Public-safe summary of a finished game: score and outcome grid only —
 * never questions or answers, so it can be shared.
 */
export async function getResultSummary(q: Queryable, sessionId: string): Promise<ResultSummary | null> {
  if (!isUuid(sessionId)) return null;
  const [s] = await q.query<{
    id: string;
    mode: ResultSummary['mode'];
    status: ResultSummary['status'];
    score: number;
    correct_count: number;
    total_questions: number;
    total_response_ms: number;
    lifelines_used: number;
    leaderboard_eligible: boolean;
    completed_at: Date | null;
    display_name: string;
    avatar_key: string;
    challenge_date: string | null;
  }>(
    `select s.id, s.mode, s.status, s.score, s.correct_count, s.total_questions, s.total_response_ms::int as total_response_ms,
            s.lifelines_used, s.leaderboard_eligible, s.completed_at, p.display_name, p.avatar_key,
            to_char(dc.challenge_date, 'YYYY-MM-DD') as challenge_date
       from public.game_sessions s join public.players p on p.id = s.player_id
       left join public.daily_challenges dc on dc.id = s.daily_challenge_id
      where s.id = $1 and s.status = 'completed'`,
    [sessionId],
  );
  if (!s) return null;
  return {
    sessionId: s.id,
    mode: s.mode,
    status: s.status,
    playerName: s.display_name,
    avatarKey: s.avatar_key,
    score: s.score,
    correctCount: s.correct_count,
    totalQuestions: s.total_questions,
    accuracy: s.total_questions ? Math.round((s.correct_count / s.total_questions) * 100) : 0,
    grid: await gridFor(q, s.id, s.total_questions),
    challengeDate: s.challenge_date,
    completedAt: s.completed_at?.toISOString() ?? null,
    totalResponseMs: s.total_response_ms,
    lifelinesUsed: s.lifelines_used,
    leaderboardEligible: s.leaderboard_eligible,
  };
}

export type ReviewItem = {
  position: number;
  text: string;
  category: string;
  difficulty: string;
  outcome: AnswerOutcome;
  points: number;
  selected: string | null;
  correct: string;
  explanation: string;
};

/** The player's own question-by-question review (owner only). */
export async function getOwnerReview(q: Queryable, sessionId: string, playerId: string): Promise<ReviewItem[] | null> {
  const [own] = await q.query('select 1 from public.game_sessions where id = $1 and player_id = $2 and status = $3', [sessionId, playerId, 'completed']);
  if (!own) return null;
  return q.query<ReviewItem>(
    `select iq.position, v.text, c.name as category, iq.difficulty, iq.outcome, iq.points,
            so.text as selected, co.text as correct, v.explanation
       from public.issued_questions iq
       join public.question_versions v on v.id = iq.version_id
       join public.categories c on c.id = v.category_id
       join private.answer_keys k on k.version_id = v.id
       join public.question_options co on co.id = k.correct_option_id
       left join public.question_options so on so.id = iq.selected_option_id
      where iq.session_id = $1 and iq.outcome in ('correct','incorrect','timeout')
      order by iq.position`,
    [sessionId],
  );
}

export async function rankFor(q: Queryable, summary: ResultSummary): Promise<number | null> {
  if (!summary.leaderboardEligible) return null;
  if (summary.mode === 'classic') return classicRankFor(q, summary.sessionId);
  if (summary.mode === 'daily') {
    const [s] = await q.query<{ daily_challenge_id: string }>('select daily_challenge_id from public.game_sessions where id = $1', [summary.sessionId]);
    return s ? dailyRankFor(q, s.daily_challenge_id, summary.sessionId) : null;
  }
  return null;
}

export function shareText(r: ResultSummary): string {
  const grid = r.grid.map((g) => (g === 'correct' ? '🟩' : g ? '🟥' : '⬜')).join('');
  const head =
    r.mode === 'daily'
      ? `${BRAND.name} Daily ${r.challengeDate} — ${r.correctCount}/${r.totalQuestions}`
      : `${BRAND.name} ${r.mode === 'classic' ? 'Classic' : 'Quiz'} — ${r.score} points (${r.correctCount}/${r.totalQuestions})`;
  return `${head}\n${grid}\nHow well do you know Africa?`;
}
