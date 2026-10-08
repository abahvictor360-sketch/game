import type { Difficulty } from './rules';

export type Outcome = 'correct' | 'incorrect' | 'timeout';

/**
 * Points for one answer. Classic and Daily use difficulty points only
 * (speedBonusFactor 0); versus modes add a speed bonus:
 *   speedBonus = floor(base × factor × remaining / duration)
 */
export function scoreAnswer(args: {
  outcome: Outcome;
  difficulty: Difficulty;
  points: Record<Difficulty, number>;
  speedBonusFactor: number;
  remainingMs: number;
  durationMs: number;
}): number {
  if (args.outcome !== 'correct') return 0;
  const base = args.points[args.difficulty];
  if (args.speedBonusFactor <= 0) return base;
  const remaining = Math.max(0, Math.min(args.remainingMs, args.durationMs));
  return base + Math.floor((base * args.speedBonusFactor * remaining) / args.durationMs);
}

/**
 * Judge an answer's timing against the server deadline. The browser's clock
 * is never consulted. A small grace window absorbs network latency.
 */
export function judgeTiming(args: {
  now: number;
  issuedAt: number;
  deadlineAt: number;
  durationMs: number;
  graceMs: number;
}): { timely: boolean; responseMs: number; remainingMs: number } {
  const timely = args.now <= args.deadlineAt + args.graceMs;
  const responseMs = Math.max(0, Math.min(args.now - args.issuedAt, args.durationMs));
  const remainingMs = Math.max(0, args.deadlineAt - args.now);
  return { timely, responseMs, remainingMs };
}

export type RankInput = { id: string; score: number; correct: number; responseMs: number };

/**
 * Deterministic ranking: score desc, then correct answers desc, then total
 * validated response time asc. Entries equal on all three share a rank
 * (standard competition ranking: 1, 1, 3).
 */
export function rankEntries<T extends RankInput>(entries: T[]): (T & { rank: number })[] {
  const sorted = [...entries].sort(compareEntries);
  let rank = 0;
  return sorted.map((e, i) => {
    if (i === 0 || compareEntries(sorted[i - 1], e) !== 0) rank = i + 1;
    return { ...e, rank };
  });
}

export function compareEntries(a: RankInput, b: RankInput): number {
  return b.score - a.score || b.correct - a.correct || a.responseMs - b.responseMs;
}

/** Map an unassisted correct-rate to an observed difficulty bucket. */
export function observedDifficulty(
  attempts: number,
  correct: number,
  cfg: { minSample: number; easyAtOrAbove: number; hardBelow: number },
): Difficulty | null {
  if (attempts < cfg.minSample) return null;
  const rate = correct / attempts;
  if (rate >= cfg.easyAtOrAbove) return 'easy';
  if (rate < cfg.hardBelow) return 'hard';
  return 'medium';
}
