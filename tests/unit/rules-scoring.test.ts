import { describe, expect, it } from 'vitest';
import { addDays, challengeDateFor, isValidDateString, nextResetAt } from '@/lib/game/dates';
import { DEFAULT_FLAGS, DEFAULT_RULES, modeRules, scoringKey, validateRules } from '@/lib/game/rules';
import { judgeTiming, observedDifficulty, rankEntries, scoreAnswer } from '@/lib/game/scoring';
import { decodeSession, encodeSession } from '@/lib/server/session-cookie';

describe('scoring', () => {
  const pts = DEFAULT_RULES.points;
  it('awards difficulty points for correct answers only', () => {
    expect(scoreAnswer({ outcome: 'correct', difficulty: 'easy', points: pts, speedBonusFactor: 0, remainingMs: 0, durationMs: 20000 })).toBe(100);
    expect(scoreAnswer({ outcome: 'correct', difficulty: 'hard', points: pts, speedBonusFactor: 0, remainingMs: 15000, durationMs: 15000 })).toBe(300);
    expect(scoreAnswer({ outcome: 'incorrect', difficulty: 'hard', points: pts, speedBonusFactor: 0.25, remainingMs: 15000, durationMs: 15000 })).toBe(0);
    expect(scoreAnswer({ outcome: 'timeout', difficulty: 'easy', points: pts, speedBonusFactor: 0.25, remainingMs: 0, durationMs: 20000 })).toBe(0);
  });
  it('a timeout costs a share of the points, never taking the score below zero', () => {
    const base = { outcome: 'timeout' as const, points: pts, speedBonusFactor: 0, remainingMs: 0, durationMs: 15000, timeoutPenaltyFactor: 0.5 };
    expect(scoreAnswer({ ...base, difficulty: 'hard', currentScore: 1000 })).toBe(-150);
    expect(scoreAnswer({ ...base, difficulty: 'medium', currentScore: 1000 })).toBe(-100);
    expect(scoreAnswer({ ...base, difficulty: 'hard', currentScore: 40 })).toBe(-40);
    expect(scoreAnswer({ ...base, difficulty: 'hard', currentScore: 0 })).toBe(0);
    expect(scoreAnswer({ ...base, difficulty: 'hard', currentScore: 1000, timeoutPenaltyFactor: 0 })).toBe(0);
  });
  it('applies the competitive speed bonus formula', () => {
    // floor(200 × 0.25 × 9000 / 18000) = 25
    expect(scoreAnswer({ outcome: 'correct', difficulty: 'medium', points: pts, speedBonusFactor: 0.25, remainingMs: 9000, durationMs: 18000 })).toBe(225);
    expect(scoreAnswer({ outcome: 'correct', difficulty: 'hard', points: pts, speedBonusFactor: 0.25, remainingMs: 15000, durationMs: 15000 })).toBe(375);
    expect(scoreAnswer({ outcome: 'correct', difficulty: 'hard', points: pts, speedBonusFactor: 0.25, remainingMs: -50, durationMs: 15000 })).toBe(300);
  });
  it('judges timing at the deadline boundary with grace', () => {
    const base = { issuedAt: 0, deadlineAt: 20000, durationMs: 20000, graceMs: 1000 };
    expect(judgeTiming({ ...base, now: 20000 }).timely).toBe(true);
    expect(judgeTiming({ ...base, now: 21000 }).timely).toBe(true);
    expect(judgeTiming({ ...base, now: 21001 }).timely).toBe(false);
    expect(judgeTiming({ ...base, now: 20500 }).responseMs).toBe(20000);
    expect(judgeTiming({ ...base, now: 5000 })).toEqual({ timely: true, responseMs: 5000, remainingMs: 15000 });
  });
  it('ranks by score, correct answers, then time; equal entries share a rank', () => {
    const r = rankEntries([
      { id: 'a', score: 900, correct: 6, responseMs: 50000 },
      { id: 'b', score: 900, correct: 7, responseMs: 90000 },
      { id: 'c', score: 900, correct: 7, responseMs: 60000 },
      { id: 'd', score: 900, correct: 7, responseMs: 60000 },
      { id: 'e', score: 1200, correct: 5, responseMs: 99000 },
    ]);
    expect(r.map((x) => [x.id, x.rank])).toEqual([['e', 1], ['c', 2], ['d', 2], ['b', 4], ['a', 5]]);
  });
  it('maps observed difficulty only above the minimum sample', () => {
    const cfg = DEFAULT_RULES.calibration;
    expect(observedDifficulty(10, 10, cfg)).toBeNull();
    expect(observedDifficulty(100, 80, cfg)).toBe('easy');
    expect(observedDifficulty(100, 55, cfg)).toBe('medium');
    expect(observedDifficulty(100, 20, cfg)).toBe('hard');
  });
});

describe('rules', () => {
  it('defaults are valid and match the proposal', () => {
    expect(validateRules(DEFAULT_RULES)).toEqual([]);
    const c = modeRules('classic', DEFAULT_RULES, DEFAULT_FLAGS);
    expect(c.questionCount).toBe(15);
    expect(c.ladder.join(',')).toBe('easy,easy,easy,easy,easy,medium,medium,medium,medium,medium,hard,hard,hard,hard,hard');
    expect(c.lifelines).toEqual({ fifty_fifty: true, change_question: true, ask_audience: false });
    expect(modeRules('daily', DEFAULT_RULES, DEFAULT_FLAGS).lifelines.fifty_fifty).toBe(false);
    expect(modeRules('match', DEFAULT_RULES, DEFAULT_FLAGS).speedBonusFactor).toBe(0.25);
    expect(modeRules('daily', DEFAULT_RULES, DEFAULT_FLAGS).timerMs('hard')).toBe(20000);
  });
  it('rejects inconsistent rules', () => {
    const bad = structuredClone(DEFAULT_RULES);
    bad.classic.questionCount = 12;
    bad.daily.timezone = 'Mars/Olympus';
    expect(validateRules(bad)).toHaveLength(2);
  });
  it('scoring key changes only with scoring-relevant settings', () => {
    const k = scoringKey('classic', DEFAULT_RULES, DEFAULT_FLAGS);
    const fresh = structuredClone(DEFAULT_RULES);
    fresh.freshness.recentWindowDays = 7;
    expect(scoringKey('classic', fresh, DEFAULT_FLAGS)).toBe(k);
    fresh.points.hard = 500;
    expect(scoringKey('classic', fresh, DEFAULT_FLAGS)).not.toBe(k);
  });
});

describe('daily dates (Africa/Lagos)', () => {
  it('rolls over at local midnight', () => {
    expect(challengeDateFor(new Date('2026-03-01T22:59:59Z'), 'Africa/Lagos')).toBe('2026-03-01');
    expect(challengeDateFor(new Date('2026-03-01T23:00:00Z'), 'Africa/Lagos')).toBe('2026-03-02');
    expect(nextResetAt(new Date('2026-03-01T10:00:00Z'), 'Africa/Lagos').toISOString()).toBe('2026-03-01T23:00:00.000Z');
    expect(nextResetAt(new Date('2026-12-31T23:30:00Z'), 'Africa/Lagos').toISOString()).toBe('2027-01-01T23:00:00.000Z');
  });
  it('handles zones with daylight saving', () => {
    expect(nextResetAt(new Date('2026-03-28T12:00:00Z'), 'Europe/London').toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(nextResetAt(new Date('2026-03-29T12:00:00Z'), 'Europe/London').toISOString()).toBe('2026-03-29T23:00:00.000Z');
  });
  it('validates and adds dates', () => {
    expect(isValidDateString('2026-02-29')).toBe(false);
    expect(isValidDateString('2028-02-29')).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('session cookie', () => {
  it('round-trips and rejects tampering and expiry', () => {
    const now = Date.now();
    const v = encodeSession({ pid: 'p1', kind: 'guest', iat: Math.floor(now / 1000) });
    expect(decodeSession(v, now)?.pid).toBe('p1');
    const [payload, sig] = v.split('.');
    const forged = Buffer.from(JSON.stringify({ pid: 'admin', kind: 'account', iat: Math.floor(now / 1000) })).toString('base64url');
    expect(decodeSession(`${forged}.${sig}`, now)).toBeNull();
    expect(decodeSession(`${payload}.x${sig.slice(1)}`, now)).toBeNull();
    const acct = encodeSession({ pid: 'p2', kind: 'account', iat: Math.floor(now / 1000) - 31 * 86400 });
    expect(decodeSession(acct, now)).toBeNull();
  });
});
