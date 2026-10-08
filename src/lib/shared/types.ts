import type { Difficulty, GameMode, Lifeline } from '@/lib/game/rules';

export type PublicOption = { id: string; text: string; label: 'A' | 'B' | 'C' | 'D' };

export type QuestionView = {
  issuedId: string;
  position: number;
  difficulty: Difficulty;
  points: number;
  category: { id: string; name: string };
  text: string;
  options: PublicOption[];
  removedOptionIds: string[];
  durationMs: number;
  deadlineAt: string;
  remainingMs: number;
  paused: boolean;
};

export type AnswerOutcome = 'correct' | 'incorrect' | 'timeout';

export type FeedbackView = {
  issuedId: string;
  outcome: AnswerOutcome;
  selectedOptionId: string | null;
  correctOptionId: string;
  explanation: string;
  points: number;
  responseMs: number | null;
  sources: { title: string; url: string }[];
};

export type LifelineState = 'available' | 'used' | 'disabled';

export type AudienceView = {
  status: 'collecting' | 'ready' | 'insufficient';
  source: 'live' | 'historical' | null;
  closesAt: string | null;
  sampleSize: number;
  percentages: { optionId: string; percent: number }[];
};

export type GhostView = {
  alias: string;
  /** Ghost progress up to (and including) closed rounds only. */
  answeredThrough: number;
  score: number;
  /** Outcome per position, revealed only after the player's round is resolved. */
  outcomes: (AnswerOutcome | null)[];
  /** While a question is open: whether the recording had answered by now (no outcome). */
  answeredCurrent: boolean;
  answeredCurrentAtMs: number | null;
};

export type SessionView = {
  id: string;
  mode: GameMode;
  status: 'active' | 'completed' | 'abandoned' | 'forfeited' | 'cancelled';
  phase: 'question' | 'feedback' | 'completed';
  totalQuestions: number;
  position: number;
  score: number;
  correctCount: number;
  answeredCount: number;
  ladder: { difficulty: Difficulty; points: number }[];
  history: (AnswerOutcome | null)[];
  question: QuestionView | null;
  feedback: FeedbackView | null;
  lifelines: Record<Lifeline, LifelineState>;
  audience: AudienceView | null;
  ghost: GhostView | null;
  challengeDate: string | null;
  friendChallenge: { opponentName: string; opponentScore: number | null } | null;
  leaderboardEligible: boolean;
  serverTime: string;
};

export type ResultSummary = {
  sessionId: string;
  mode: GameMode;
  status: SessionView['status'];
  playerName: string;
  avatarKey: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
  grid: (AnswerOutcome | null)[];
  challengeDate: string | null;
  completedAt: string | null;
  totalResponseMs: number;
  lifelinesUsed: number;
  leaderboardEligible: boolean;
};
