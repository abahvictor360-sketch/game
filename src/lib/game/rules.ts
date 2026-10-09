import { z } from 'zod';

/**
 * Game rules. Everything here is a *proposed default* (see docs/GAME_RULES.md)
 * and is stored as a versioned row in `game_config`. Every session records the
 * ruleset version it started with, so changing settings never alters a game
 * already underway.
 */

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const MODES = ['classic', 'daily', 'friend', 'ghost', 'match'] as const;
export type GameMode = (typeof MODES)[number];

export const LIFELINES = ['fifty_fifty', 'change_question', 'ask_audience'] as const;
export type Lifeline = (typeof LIFELINES)[number];

const perDifficulty = z.object({ easy: z.number().int(), medium: z.number().int(), hard: z.number().int() });

export const RulesSchema = z.object({
  timersMs: perDifficulty.refine((t) => Object.values(t).every((v) => v >= 5000 && v <= 120000), {
    message: 'Timers must be between 5 and 120 seconds',
  }),
  points: perDifficulty.refine((p) => Object.values(p).every((v) => v >= 0 && v <= 10000)),
  /** Allowance for network latency when judging whether an answer was timely. */
  latencyGraceMs: z.number().int().min(0).max(5000),
  /**
   * Running out of time costs this share of the question's points (Classic,
   * Daily and friend challenges). 0 = no penalty. A score never goes below 0.
   */
  timeoutPenaltyFactor: z.number().min(0).max(1),
  classic: z.object({
    questionCount: z.number().int().min(3).max(30),
    distribution: perDifficulty,
    /** false = proposed default: play all questions even after a wrong answer. */
    endOnWrongAnswer: z.boolean(),
    lifelines: z.object({ fifty_fifty: z.boolean(), change_question: z.boolean(), ask_audience: z.boolean() }),
    speedBonusFactor: z.number().min(0).max(1),
  }),
  daily: z.object({
    questionCount: z.number().int().min(3).max(30),
    distribution: perDifficulty,
    timerMs: z.number().int().min(5000).max(120000),
    timezone: z.string(),
    /** Only results played while signed in are ranked. */
    requireAccountForLeaderboard: z.boolean(),
    /** Avoid reusing a question in Daily Challenges published within this many days. */
    reuseCooldownDays: z.number().int().min(0).max(3650),
  }),
  versus: z.object({
    questionCount: z.number().int().min(3).max(30),
    distribution: perDifficulty,
    speedBonusFactor: z.number().min(0).max(1),
    matchmakingFallbackMs: z.number().int().min(5000).max(300000),
    reconnectWindowMs: z.number().int().min(5000).max(120000),
    countdownMs: z.number().int().min(0).max(10000),
    revealMs: z.number().int().min(1000).max(15000),
  }),
  friendChallenge: z.object({ expiryDays: z.number().int().min(1).max(90) }),
  audience: z.object({
    minLiveHelpers: z.number().int().min(1).max(100),
    votingWindowMs: z.number().int().min(5000).max(30000),
    helperCooldownMs: z.number().int().min(0).max(3600000),
    helperPresenceMs: z.number().int().min(5000).max(600000),
    minHistoricalSample: z.number().int().min(1).max(10000),
  }),
  freshness: z.object({ recentWindowDays: z.number().int().min(0).max(3650) }),
  content: z.object({
    language: z.string().min(2).max(10),
    allowedAgeRatings: z.array(z.enum(['all', '13+', '16+'])).min(1),
  }),
  calibration: z.object({
    minSample: z.number().int().min(1),
    easyAtOrAbove: z.number().min(0).max(1),
    hardBelow: z.number().min(0).max(1),
  }),
});
export type Rules = z.infer<typeof RulesSchema>;

export const FlagsSchema = z.object({
  multiplayer: z.boolean(),
  ghostOpponents: z.boolean(),
  friendChallenges: z.boolean(),
  askAudience: z.boolean(),
});
export type Flags = z.infer<typeof FlagsSchema>;

export const DEFAULT_RULES: Rules = {
  timersMs: { easy: 20000, medium: 18000, hard: 15000 },
  points: { easy: 100, medium: 200, hard: 300 },
  latencyGraceMs: 1000,
  timeoutPenaltyFactor: 0.5,
  classic: {
    questionCount: 15,
    distribution: { easy: 5, medium: 5, hard: 5 },
    endOnWrongAnswer: false,
    lifelines: { fifty_fifty: true, change_question: true, ask_audience: true },
    speedBonusFactor: 0,
  },
  daily: {
    questionCount: 10,
    distribution: { easy: 4, medium: 3, hard: 3 },
    timerMs: 20000,
    timezone: 'Africa/Lagos',
    requireAccountForLeaderboard: true,
    reuseCooldownDays: 180,
  },
  versus: {
    questionCount: 15,
    distribution: { easy: 5, medium: 5, hard: 5 },
    speedBonusFactor: 0.25,
    matchmakingFallbackMs: 30000,
    reconnectWindowMs: 20000,
    countdownMs: 3000,
    revealMs: 4000,
  },
  friendChallenge: { expiryDays: 7 },
  audience: {
    minLiveHelpers: 5,
    votingWindowMs: 15000,
    helperCooldownMs: 120000,
    helperPresenceMs: 45000,
    minHistoricalSample: 20,
  },
  freshness: { recentWindowDays: 30 },
  content: { language: 'en', allowedAgeRatings: ['all', '13+'] },
  calibration: { minSample: 30, easyAtOrAbove: 0.7, hardBelow: 0.4 },
};

/** Phase 2 features are off by default so a Phase 1 release never shows them. */
export const DEFAULT_FLAGS: Flags = {
  multiplayer: false,
  ghostOpponents: false,
  friendChallenges: false,
  askAudience: false,
};

/** Expand a distribution into an ordered difficulty ladder (easy → hard). */
export function difficultyLadder(dist: Record<Difficulty, number>): Difficulty[] {
  return DIFFICULTIES.flatMap((d) => Array.from({ length: dist[d] }, () => d));
}

export function validateRules(rules: Rules): string[] {
  const errors: string[] = [];
  const sum = (d: Record<Difficulty, number>) => d.easy + d.medium + d.hard;
  if (sum(rules.classic.distribution) !== rules.classic.questionCount)
    errors.push('Classic difficulty distribution must add up to the Classic question count.');
  if (sum(rules.daily.distribution) !== rules.daily.questionCount)
    errors.push('Daily difficulty distribution must add up to the Daily question count.');
  if (sum(rules.versus.distribution) !== rules.versus.questionCount)
    errors.push('Versus difficulty distribution must add up to the Versus question count.');
  if (rules.calibration.hardBelow >= rules.calibration.easyAtOrAbove)
    errors.push('Calibration: the hard threshold must be below the easy threshold.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: rules.daily.timezone });
  } catch {
    errors.push('Daily timezone is not a valid IANA time zone.');
  }
  return errors;
}

export type ModeRules = {
  mode: GameMode;
  questionCount: number;
  ladder: Difficulty[];
  timerMs: (d: Difficulty) => number;
  points: Record<Difficulty, number>;
  speedBonusFactor: number;
  /** Share of the question's points lost on a timeout (0 = none). */
  timeoutPenaltyFactor: number;
  lifelines: Record<Lifeline, boolean>;
  endOnWrongAnswer: boolean;
};

const NO_LIFELINES: Record<Lifeline, boolean> = { fifty_fifty: false, change_question: false, ask_audience: false };

/** Resolve the effective rules for a mode under a given ruleset + flags. */
export function modeRules(mode: GameMode, rules: Rules, flags: Flags): ModeRules {
  switch (mode) {
    case 'classic':
      return {
        mode,
        questionCount: rules.classic.questionCount,
        ladder: difficultyLadder(rules.classic.distribution),
        timerMs: (d) => rules.timersMs[d],
        points: rules.points,
        speedBonusFactor: rules.classic.speedBonusFactor,
        timeoutPenaltyFactor: rules.timeoutPenaltyFactor,
        lifelines: {
          fifty_fifty: rules.classic.lifelines.fifty_fifty,
          change_question: rules.classic.lifelines.change_question,
          ask_audience: rules.classic.lifelines.ask_audience && flags.askAudience,
        },
        endOnWrongAnswer: rules.classic.endOnWrongAnswer,
      };
    case 'daily':
      return {
        mode,
        questionCount: rules.daily.questionCount,
        ladder: difficultyLadder(rules.daily.distribution),
        timerMs: () => rules.daily.timerMs,
        points: rules.points,
        speedBonusFactor: 0,
        timeoutPenaltyFactor: rules.timeoutPenaltyFactor,
        lifelines: NO_LIFELINES,
        endOnWrongAnswer: false,
      };
    case 'friend':
      // Friend challenges replay a Classic run's questions; lifelines are off so
      // both players face identical conditions.
      return {
        ...modeRules('classic', rules, flags),
        mode,
        lifelines: NO_LIFELINES,
        endOnWrongAnswer: false,
      };
    case 'ghost':
    case 'match':
      return {
        mode,
        questionCount: rules.versus.questionCount,
        ladder: difficultyLadder(rules.versus.distribution),
        timerMs: (d) => rules.timersMs[d],
        points: rules.points,
        speedBonusFactor: rules.versus.speedBonusFactor,
        // Versus already rewards speed with a bonus; no timeout penalty there.
        timeoutPenaltyFactor: 0,
        lifelines: NO_LIFELINES,
        endOnWrongAnswer: false,
      };
  }
}

/**
 * A short signature of everything that affects a mode's score. Leaderboards
 * only compare sessions with the same key, so a scoring change starts a fresh
 * board instead of mixing incomparable results.
 */
export function scoringKey(mode: GameMode, rules: Rules, flags: Flags): string {
  const m = modeRules(mode, rules, flags);
  const base = mode === 'friend' ? 'classic' : mode === 'ghost' ? 'match' : mode;
  const sig = JSON.stringify({
    n: m.questionCount,
    l: m.ladder,
    t: m.ladder.map((d) => m.timerMs(d)),
    p: m.points,
    s: m.speedBonusFactor,
    tp: m.timeoutPenaltyFactor,
    e: m.endOnWrongAnswer,
    lf: base === 'classic' ? rules.classic.lifelines : null,
  });
  return `${base}:${fnv1a(sig)}`;
}

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
