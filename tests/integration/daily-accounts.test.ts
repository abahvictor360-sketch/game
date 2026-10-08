import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/server/db';
import { getDailyStatus, startOrResumeDaily } from '@/lib/server/game/daily';
import { dailyLeaderboard } from '@/lib/server/game/leaderboard';
import { advance, getSessionView, submitAnswer } from '@/lib/server/game/sessions';
import { getPlayer, linkAccount } from '@/lib/server/players';
import { account, correctOption, fakeClock, freshDb, guest } from '../support/db';

let db: Db;
const clock = fakeClock(new Date('2026-05-01T08:00:00Z')); // 09:00 in Lagos

beforeAll(async () => {
  db = await freshDb();
});
afterAll(async () => {
  clock.reset();
  await db.close();
});

async function playAll(playerId: string, sessionId: string, correctUpTo: number) {
  let v = await db.tx((q) => getSessionView(q, playerId, sessionId));
  while (v.phase !== 'completed') {
    const i = v.question!.position;
    const correct = await correctOption(db, v.question!.issuedId);
    const opt = i < correctUpTo ? correct : v.question!.options.find((o) => o.id !== correct)!.id;
    clock.advance(2000);
    await db.tx((q) => submitAnswer(q, playerId, sessionId, { issuedId: v.question!.issuedId, optionId: opt, submissionKey: crypto.randomUUID() }));
    v = await db.tx((q) => advance(q, playerId, sessionId, i));
  }
  return v;
}

describe('Daily Challenge', () => {
  it('publishes one immutable 10-question set; everyone gets the same versions and option order', async () => {
    const a = await account(db);
    const b = await guest(db);
    const sa = await db.tx((q) => startOrResumeDaily(q, a));
    const sb = await db.tx((q) => startOrResumeDaily(q, b));
    const va = await db.tx((q) => getSessionView(q, a.id, sa));
    const vb = await db.tx((q) => getSessionView(q, b.id, sb));
    expect(va.totalQuestions).toBe(10);
    expect(va.challengeDate).toBe('2026-05-01');
    expect(va.question!.text).toBe(vb.question!.text);
    expect(va.question!.options.map((o) => o.id)).toEqual(vb.question!.options.map((o) => o.id));
    expect(va.lifelines).toEqual({ fifty_fifty: 'disabled', change_question: 'disabled', ask_audience: 'disabled' });
    const [{ n }] = await db.query<{ n: number }>('select count(*)::int as n from public.daily_challenges');
    expect(n).toBe(1);
  });

  it('refresh resumes the same attempt without resetting the deadline; one attempt per player', async () => {
    const p = await account(db);
    const s1 = await db.tx((q) => startOrResumeDaily(q, p));
    const v1 = await db.tx((q) => getSessionView(q, p.id, s1));
    clock.advance(5000);
    const s2 = await db.tx((q) => startOrResumeDaily(q, p));
    expect(s2).toBe(s1);
    const v2 = await db.tx((q) => getSessionView(q, p.id, s2));
    expect(v2.question!.deadlineAt).toBe(v1.question!.deadlineAt);
    await playAll(p.id, s1, 10);
    const s3 = await db.tx((q) => startOrResumeDaily(q, p));
    expect(s3).toBe(s1);
    const st = await db.tx((q) => getDailyStatus(q, p.id));
    expect(st.attempt!.status).toBe('completed');
    expect(st.attempt!.grid.every((g) => g === 'correct')).toBe(true);
  });

  it('concurrent starts create exactly one attempt', async () => {
    const p = await account(db);
    const ids = await Promise.all(Array.from({ length: 6 }, () => db.tx((q) => startOrResumeDaily(q, p))));
    expect(new Set(ids).size).toBe(1);
    const [{ n }] = await db.query<{ n: number }>('select count(*)::int as n from public.daily_attempts where player_id = $1', [p.id]);
    expect(n).toBe(1);
  });

  it('ranks only eligible (signed-in) attempts with deterministic tie-breaks', async () => {
    const date = '2026-05-01';
    const fast = await account(db);
    const slow = await account(db);
    const g = await guest(db);
    const sf = await db.tx((q) => startOrResumeDaily(q, fast));
    await playAll(fast.id, sf, 7);
    const sg = await db.tx((q) => startOrResumeDaily(q, g));
    await playAll(g.id, sg, 10);
    const ss = await db.tx((q) => startOrResumeDaily(q, slow));
    // slow: same answers, but takes longer per question
    let v = await db.tx((q) => getSessionView(q, slow.id, ss));
    while (v.phase !== 'completed') {
      const i = v.question!.position;
      const c = await correctOption(db, v.question!.issuedId);
      clock.advance(6000);
      await db.tx((q) => submitAnswer(q, slow.id, ss, { issuedId: v.question!.issuedId, optionId: i < 7 ? c : v.question!.options.find((o) => o.id !== c)!.id, submissionKey: crypto.randomUUID() }));
      v = await db.tx((q) => advance(q, slow.id, ss, i));
    }
    const board = await dailyLeaderboard(db, date, { playerId: fast.id });
    const ids = board.entries.map((e) => e.playerId);
    expect(ids).not.toContain(g.id); // guest unranked
    expect(ids.indexOf(fast.id)).toBeLessThan(ids.indexOf(slow.id));
    const f = board.entries.find((e) => e.playerId === fast.id)!;
    const s = board.entries.find((e) => e.playerId === slow.id)!;
    expect(f.score).toBe(s.score);
    expect(f.rank).toBeLessThan(s.rank);
    expect(board.me?.playerId).toBe(fast.id);
    // Public entries never include email.
    expect(JSON.stringify(board)).not.toContain('@example.test');
  });

  it('the next day publishes a new set', async () => {
    clock.set(new Date('2026-05-01T23:30:00Z')); // 00:30 in Lagos on 2 May
    const p = await account(db);
    const s = await db.tx((q) => startOrResumeDaily(q, p));
    const v = await db.tx((q) => getSessionView(q, p.id, s));
    expect(v.challengeDate).toBe('2026-05-02');
    clock.set(new Date('2026-05-01T08:00:00Z'));
  });
});

describe('Guest → account conversion', () => {
  it('a new account keeps the guest identity and history', async () => {
    const g = await guest(db);
    const s = await db.tx((q) => startOrResumeDaily(q, g));
    const acct = await db.tx((q) => linkAccount(q, { authUserId: crypto.randomUUID(), email: 'new@example.test', currentPlayerId: g.id }));
    expect(acct.id).toBe(g.id);
    expect(acct.kind).toBe('account');
    const st = await db.tx((q) => getDailyStatus(q, acct.id));
    expect(st.attempt!.sessionId).toBe(s);
    expect(st.attempt!.eligible).toBe(false); // played as a guest: stays unranked
  });

  it('merging into an existing account never creates a duplicate daily attempt', async () => {
    const authId = crypto.randomUUID();
    const acct = await db.tx((q) => linkAccount(q, { authUserId: authId, email: 'merge@example.test', currentPlayerId: null }));
    const accountSession = await db.tx((q) => startOrResumeDaily(q, acct));
    const g = await guest(db);
    const guestSession = await db.tx((q) => startOrResumeDaily(q, g));
    await playAll(g.id, guestSession, 10);
    const merged = await db.tx((q) => linkAccount(q, { authUserId: authId, email: 'merge@example.test', currentPlayerId: g.id }));
    expect(merged.id).toBe(acct.id);
    const attempts = await db.query<{ session_id: string }>('select session_id from public.daily_attempts where player_id = $1', [acct.id]);
    expect(attempts.map((a) => a.session_id)).toEqual([accountSession]);
    // The guest's game moved into the account's history.
    const [{ n }] = await db.query<{ n: number }>('select count(*)::int as n from public.game_sessions where player_id = $1', [acct.id]);
    expect(n).toBe(2);
    // Old guest cookie now resolves to the account.
    expect((await getPlayer(db, g.id))!.id).toBe(acct.id);
  });

  it('bootstrap admin is granted only from the configured verified email', async () => {
    process.env.ADMIN_BOOTSTRAP_EMAILS = 'boss@example.test';
    const a = await db.tx((q) => linkAccount(q, { authUserId: crypto.randomUUID(), email: 'boss@example.test', currentPlayerId: null }));
    const b = await db.tx((q) => linkAccount(q, { authUserId: crypto.randomUUID(), email: 'nobody@example.test', currentPlayerId: null }));
    expect(a.role).toBe('admin');
    expect(b.role).toBeNull();
    delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  });
});
