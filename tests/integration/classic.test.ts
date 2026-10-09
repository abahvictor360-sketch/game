import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/server/db';
import { advance, getSessionView, startClassic, submitAnswer, useLifeline } from '@/lib/server/game/sessions';
import { account, correctOption, fakeClock, freshDb, guest, wrongOption } from '../support/db';

let db: Db;
const clock = fakeClock();

beforeAll(async () => {
  db = await freshDb();
});
afterAll(async () => {
  clock.reset();
  await db.close();
});
beforeEach(() => clock.set(new Date('2026-03-10T09:00:00Z')));

const key = () => crypto.randomUUID();

describe('Classic mode', () => {
  it('plays 15 questions with rising difficulty and server-side scoring', async () => {
    const p = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    let view = await db.tx((q) => getSessionView(q, p.id, id));
    expect(view.totalQuestions).toBe(15);
    expect(view.ladder.map((l) => l.difficulty)).toEqual([...Array(5).fill('easy'), ...Array(5).fill('medium'), ...Array(5).fill('hard')]);
    const seenVersions = new Set<string>();
    let expected = 0;
    for (let i = 0; i < 15; i++) {
      expect(view.phase).toBe('question');
      expect(view.question!.position).toBe(i);
      expect(view.question!.difficulty).toBe(view.ladder[i].difficulty);
      const [row] = await db.query<{ version_id: string }>('select version_id from public.issued_questions where id = $1', [view.question!.issuedId]);
      expect(seenVersions.has(row.version_id)).toBe(false);
      seenVersions.add(row.version_id);
      const answerCorrect = i % 2 === 0;
      const option = answerCorrect ? await correctOption(db, view.question!.issuedId) : await wrongOption(db, view.question!.issuedId);
      clock.advance(3000);
      view = await db.tx((q) => submitAnswer(q, p.id, id, { issuedId: view.question!.issuedId, optionId: option, submissionKey: key() }));
      expect(view.phase).toBe('feedback');
      expect(view.feedback!.outcome).toBe(answerCorrect ? 'correct' : 'incorrect');
      const pts = { easy: 100, medium: 200, hard: 300 }[view.ladder[i].difficulty];
      expect(view.feedback!.points).toBe(answerCorrect ? pts : 0);
      expected += answerCorrect ? pts : 0;
      view = await db.tx((q) => advance(q, p.id, id, i));
    }
    expect(view.phase).toBe('completed');
    expect(view.status).toBe('completed');
    expect(view.score).toBe(expected);
    expect(view.correctCount).toBe(8);
    expect(view.leaderboardEligible).toBe(false); // guest
  });

  it('never sends the answer key or explanation before the answer is locked', async () => {
    const p = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    const view = await db.tx((q) => getSessionView(q, p.id, id));
    const json = JSON.stringify(view);
    const correct = await correctOption(db, view.question!.issuedId);
    expect(view.feedback).toBeNull();
    // The correct option id appears exactly once (as one of the four options), never flagged.
    expect(json.split(correct).length - 1).toBe(1);
    expect(json).not.toMatch(/correctOptionId|explanation/i);
  });

  it('times out on the server even if the browser never answers, and grace is respected', async () => {
    const p = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    let view = await db.tx((q) => getSessionView(q, p.id, id));
    clock.advance(20000 + 900); // inside the 1s latency grace
    const opt = await correctOption(db, view.question!.issuedId);
    view = await db.tx((q) => submitAnswer(q, p.id, id, { issuedId: view.question!.issuedId, optionId: opt, submissionKey: key() }));
    expect(view.feedback!.outcome).toBe('correct');
    view = await db.tx((q) => advance(q, p.id, id, 0));
    clock.advance(20000 + 1001); // question 2 is easy (20s): past deadline + grace
    view = await db.tx((q) => getSessionView(q, p.id, id));
    expect(view.phase).toBe('feedback');
    expect(view.feedback!.outcome).toBe('timeout');
    // Time-out penalty (default 50%): an easy question costs 50 of the 100 earned.
    expect(view.feedback!.points).toBe(-50);
    expect(view.score).toBe(50);
    // A late answer cannot overwrite the timeout.
    const late = await correctOption(db, view.question!.issuedId);
    await expect(db.tx((q) => submitAnswer(q, p.id, id, { issuedId: view.question!.issuedId, optionId: late, submissionKey: key() }))).rejects.toMatchObject({ reason: 'already_answered' });
  });

  it('a late submission past the grace period is recorded as a timeout', async () => {
    const p = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    const view = await db.tx((q) => getSessionView(q, p.id, id));
    clock.advance(21500);
    const opt = await correctOption(db, view.question!.issuedId);
    const after = await db.tx((q) => submitAnswer(q, p.id, id, { issuedId: view.question!.issuedId, optionId: opt, submissionKey: key() }));
    expect(after.feedback!.outcome).toBe('timeout');
    // The penalty never takes a score below zero.
    expect(after.feedback!.points).toBe(0);
    expect(after.score).toBe(0);
  });

  it('duplicate submissions are idempotent and a different second answer is rejected', async () => {
    const p = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    const view = await db.tx((q) => getSessionView(q, p.id, id));
    const k = key();
    const opt = await correctOption(db, view.question!.issuedId);
    const wrong = await wrongOption(db, view.question!.issuedId);
    const a = await db.tx((q) => submitAnswer(q, p.id, id, { issuedId: view.question!.issuedId, optionId: opt, submissionKey: k }));
    const b = await db.tx((q) => submitAnswer(q, p.id, id, { issuedId: view.question!.issuedId, optionId: opt, submissionKey: k }));
    expect(b.score).toBe(a.score);
    expect(b.score).toBe(100);
    await expect(db.tx((q) => submitAnswer(q, p.id, id, { issuedId: view.question!.issuedId, optionId: wrong, submissionKey: key() }))).rejects.toMatchObject({ reason: 'already_answered' });
  });

  it('concurrent submissions score at most once', async () => {
    const p = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    const view = await db.tx((q) => getSessionView(q, p.id, id));
    const opt = await correctOption(db, view.question!.issuedId);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => db.tx((q) => submitAnswer(q, p.id, id, { issuedId: view.question!.issuedId, optionId: opt, submissionKey: key() }))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const final = await db.tx((q) => getSessionView(q, p.id, id));
    expect(final.score).toBe(100);
    expect(final.answeredCount).toBe(1);
  });

  it('rejects foreign sessions, foreign options and repeated advance is idempotent', async () => {
    const p = await guest(db);
    const other = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    await expect(db.tx((q) => getSessionView(q, other.id, id))).rejects.toMatchObject({ code: 'not_found' });
    const view = await db.tx((q) => getSessionView(q, p.id, id));
    await expect(
      db.tx((q) => submitAnswer(q, p.id, id, { issuedId: view.question!.issuedId, optionId: crypto.randomUUID(), submissionKey: key() })),
    ).rejects.toMatchObject({ code: 'bad_request' });
    await expect(db.tx((q) => advance(q, p.id, id, 0))).rejects.toMatchObject({ reason: 'question_pending' });
    const opt = await correctOption(db, view.question!.issuedId);
    await db.tx((q) => submitAnswer(q, p.id, id, { issuedId: view.question!.issuedId, optionId: opt, submissionKey: key() }));
    const a = await db.tx((q) => advance(q, p.id, id, 0));
    const b = await db.tx((q) => advance(q, p.id, id, 0));
    expect(a.position).toBe(1);
    expect(b.position).toBe(1);
    expect(b.question!.issuedId).toBe(a.question!.issuedId);
  });

  it('refresh resumes without resetting the deadline', async () => {
    const p = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    const v1 = await db.tx((q) => getSessionView(q, p.id, id));
    clock.advance(7000);
    const v2 = await db.tx((q) => getSessionView(q, p.id, id));
    expect(v2.question!.deadlineAt).toBe(v1.question!.deadlineAt);
    expect(v2.question!.remainingMs).toBe(v1.question!.remainingMs - 7000);
  });

  it('accounts are leaderboard eligible', async () => {
    const p = await account(db);
    const id = await db.tx((q) => startClassic(q, p));
    const v = await db.tx((q) => getSessionView(q, p.id, id));
    expect(v.leaderboardEligible).toBe(true);
  });
});

describe('Lifelines', () => {
  it('50/50 removes two wrong options, keeps the timer, and is single-use', async () => {
    const p = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    const v = await db.tx((q) => getSessionView(q, p.id, id));
    clock.advance(4000);
    const rk = key();
    const after = await db.tx((q) => useLifeline(q, p.id, id, { issuedId: v.question!.issuedId, lifeline: 'fifty_fifty', requestKey: rk }));
    const correct = await correctOption(db, v.question!.issuedId);
    expect(after.question!.removedOptionIds).toHaveLength(2);
    expect(after.question!.removedOptionIds).not.toContain(correct);
    expect(after.question!.deadlineAt).toBe(v.question!.deadlineAt);
    expect(after.lifelines.fifty_fifty).toBe('used');
    // Duplicate request with the same key is a no-op.
    const dup = await db.tx((q) => useLifeline(q, p.id, id, { issuedId: v.question!.issuedId, lifeline: 'fifty_fifty', requestKey: rk }));
    expect(dup.question!.removedOptionIds).toEqual(after.question!.removedOptionIds);
    await expect(db.tx((q) => useLifeline(q, p.id, id, { issuedId: v.question!.issuedId, lifeline: 'fifty_fifty', requestKey: key() }))).rejects.toMatchObject({ reason: 'lifeline_used' });
    // Removed options cannot be submitted.
    await expect(
      db.tx((q) => submitAnswer(q, p.id, id, { issuedId: v.question!.issuedId, optionId: after.question!.removedOptionIds[0], submissionKey: key() })),
    ).rejects.toMatchObject({ code: 'bad_request' });
    const [{ n }] = await db.query<{ n: number }>('select count(*)::int as n from public.lifeline_uses where session_id = $1', [id]);
    expect(n).toBe(1);
  });

  it('Change Question swaps in an equivalent question with a fresh timer; 50/50 stays consumed', async () => {
    const p = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    const v = await db.tx((q) => getSessionView(q, p.id, id));
    await db.tx((q) => useLifeline(q, p.id, id, { issuedId: v.question!.issuedId, lifeline: 'fifty_fifty', requestKey: key() }));
    clock.advance(5000);
    const after = await db.tx((q) => useLifeline(q, p.id, id, { issuedId: v.question!.issuedId, lifeline: 'change_question', requestKey: key() }));
    expect(after.question!.issuedId).not.toBe(v.question!.issuedId);
    expect(after.question!.difficulty).toBe(v.question!.difficulty);
    expect(after.question!.position).toBe(0);
    expect(after.question!.remainingMs).toBe(20000);
    expect(after.question!.removedOptionIds).toEqual([]);
    expect(after.lifelines.fifty_fifty).toBe('used');
    expect(after.lifelines.change_question).toBe('used');
    const [old] = await db.query<{ outcome: string }>('select outcome from public.issued_questions where id = $1', [v.question!.issuedId]);
    expect(old.outcome).toBe('replaced');
  });

  it('lifelines cannot be used after the answer is locked', async () => {
    const p = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    const v = await db.tx((q) => getSessionView(q, p.id, id));
    const opt = await correctOption(db, v.question!.issuedId);
    await db.tx((q) => submitAnswer(q, p.id, id, { issuedId: v.question!.issuedId, optionId: opt, submissionKey: key() }));
    await expect(db.tx((q) => useLifeline(q, p.id, id, { issuedId: v.question!.issuedId, lifeline: 'fifty_fifty', requestKey: key() }))).rejects.toMatchObject({ reason: 'answer_locked' });
    const after = await db.tx((q) => getSessionView(q, p.id, id));
    expect(after.lifelines.fifty_fifty).toBe('available');
  });

  it('Change Question with no replacement available leaves the lifeline unused', async () => {
    const p = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    const v = await db.tx((q) => getSessionView(q, p.id, id));
    // Archive every other easy question so no replacement exists.
    await db.query(
      `update public.questions set status = 'archived' where id in (
         select q.id from public.questions q join public.question_versions v on v.id = q.live_version_id
          where v.difficulty = 'easy' and q.id <> (select v2.question_id from public.issued_questions iq join public.question_versions v2 on v2.id = iq.version_id where iq.id = $1))`,
      [v.question!.issuedId],
    );
    try {
      await expect(db.tx((q) => useLifeline(q, p.id, id, { issuedId: v.question!.issuedId, lifeline: 'change_question', requestKey: key() }))).rejects.toMatchObject({ reason: 'no_replacement' });
      const after = await db.tx((q) => getSessionView(q, p.id, id));
      expect(after.lifelines.change_question).toBe('available');
      expect(after.question!.issuedId).toBe(v.question!.issuedId);
    } finally {
      await db.query(`update public.questions set status = 'approved' where status = 'archived' and live_version_id is not null`);
    }
  });

  it('Ask the Audience is disabled while its Phase 2 flag is off', async () => {
    const p = await guest(db);
    const id = await db.tx((q) => startClassic(q, p));
    const v = await db.tx((q) => getSessionView(q, p.id, id));
    expect(v.lifelines.ask_audience).toBe('disabled');
    await expect(db.tx((q) => useLifeline(q, p.id, id, { issuedId: v.question!.issuedId, lifeline: 'ask_audience', requestKey: key() }))).rejects.toMatchObject({ code: 'bad_request' });
  });
});

describe('Freshness', () => {
  it('avoids questions a player saw recently while unseen ones remain', async () => {
    const p = await guest(db);
    const first = await db.tx((q) => startClassic(q, p));
    const [{ v: firstQ }] = await db.query<{ v: string }>('select v.question_id as v from public.issued_questions iq join public.question_versions v on v.id = iq.version_id where iq.session_id = $1', [first]);
    // Start several new runs; the first question of each must differ from the
    // already-seen first question while unseen easy questions exist.
    for (let i = 0; i < 5; i++) {
      const id = await db.tx((q) => startClassic(q, p));
      const [{ v }] = await db.query<{ v: string }>('select v.question_id as v from public.issued_questions iq join public.question_versions v on v.id = iq.version_id where iq.session_id = $1', [id]);
      expect(v).not.toBe(firstQ);
    }
  });
});
