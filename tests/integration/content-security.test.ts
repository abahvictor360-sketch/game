import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/server/db';
import { approveQuestion, archiveQuestion, createQuestion, getQuestionDetail, rejectQuestion, submitForReview, updateQuestion } from '@/lib/server/content';
import { validateCsv, csvTemplate } from '@/lib/server/csv';
import { startOrResumeDaily } from '@/lib/server/game/daily';
import { classicLeaderboard } from '@/lib/server/game/leaderboard';
import { advance, getSessionView, startClassic, submitAnswer } from '@/lib/server/game/sessions';
import type { QuestionInput } from '@/lib/shared/question-input';
import { account, correctOption, fakeClock, freshDb } from '../support/db';

let db: Db;
const clock = fakeClock(new Date('2026-06-10T10:00:00Z'));
beforeAll(async () => {
  db = await freshDb();
});
afterAll(async () => {
  clock.reset();
  await db.close();
});

const sample = (text: string): QuestionInput => ({
  text,
  options: { A: 'Right answer', B: 'Wrong one', C: 'Wrong two', D: 'Wrong three' },
  correct: 'A',
  explanation: 'Because the right answer is right.',
  categoryId: 'history',
  countryScope: ['NG'],
  difficulty: 'easy',
  ageRating: 'all',
  tags: [],
  language: 'en',
  sources: [{ title: 'Ref', url: 'https://example.org/ref' }],
  verifiedAt: '2026-01-01',
  sponsorRef: null,
});

describe('Editorial workflow and versioning', () => {
  it('draft → review → approved; reject sends back', async () => {
    const editor = await account(db);
    const { questionId } = await db.tx((q) => createQuestion(q, sample('Which test question goes through review first?'), editor.id));
    let d = (await getQuestionDetail(db, questionId))!;
    expect(d.status).toBe('draft');
    expect(d.liveVersionId).toBeNull();
    await db.tx((q) => submitForReview(q, questionId, editor.id));
    await db.tx((q) => rejectQuestion(q, questionId, editor.id, 'Add a better source'));
    d = (await getQuestionDetail(db, questionId))!;
    expect(d.versions[0].state).toBe('rejected');
    await db.tx((q) => submitForReview(q, questionId, editor.id));
    await db.tx((q) => approveQuestion(q, questionId, editor.id));
    d = (await getQuestionDetail(db, questionId))!;
    expect(d.status).toBe('approved');
    expect(d.liveVersionId).toBe(d.versions[0].id);
  });

  it('editing a published question creates a new version; games and dailies keep the old one', async () => {
    const editor = await account(db);
    const player = await account(db);
    // A daily challenge pins versions at publication.
    const dailySession = await db.tx((q) => startOrResumeDaily(q, player));
    const [pinned] = await db.query<{ version_id: string; question_id: string }>(
      `select dq.version_id, v.question_id from public.daily_challenge_questions dq join public.question_versions v on v.id = dq.version_id
        join public.game_sessions s on s.daily_challenge_id = dq.challenge_id where s.id = $1 and dq.position = 0`,
      [dailySession],
    );
    const before = (await getQuestionDetail(db, pinned.question_id))!;
    const input = { ...sample('Edited wording for a published question?'), categoryId: before.versions[0].categoryId };
    const res = await db.tx((q) => updateQuestion(q, pinned.question_id, input, editor.id));
    expect(res.newVersion).toBe(true);
    let d = (await getQuestionDetail(db, pinned.question_id))!;
    expect(d.liveVersionId).toBe(pinned.version_id); // still live until approved
    await db.tx((q) => approveQuestion(q, pinned.question_id, editor.id));
    d = (await getQuestionDetail(db, pinned.question_id))!;
    expect(d.liveVersionId).not.toBe(pinned.version_id);
    expect(d.versions.find((v) => v.id === pinned.version_id)!.state).toBe('superseded');
    // The in-progress daily still serves the original version and text.
    const v = await db.tx((q) => getSessionView(q, player.id, dailySession));
    expect(v.question!.text).toBe(before.versions[0].text);
    const [row] = await db.query<{ version_id: string }>('select version_id from public.issued_questions where id = $1', [v.question!.issuedId]);
    expect(row.version_id).toBe(pinned.version_id);
  });

  it('archived questions are never selected', async () => {
    const editor = await account(db);
    const easy = await db.query<{ id: string }>(
      `select q.id from public.questions q join public.question_versions v on v.id = q.live_version_id where v.difficulty = 'easy' and q.status = 'approved' limit 5`,
    );
    for (const e of easy) await db.tx((q) => archiveQuestion(q, e.id, editor.id));
    const p = await account(db);
    for (let i = 0; i < 4; i++) {
      const s = await db.tx((q) => startClassic(q, p));
      const [r] = await db.query<{ question_id: string }>('select v.question_id from public.issued_questions iq join public.question_versions v on v.id = iq.version_id where iq.session_id = $1', [s]);
      expect(easy.map((e) => e.id)).not.toContain(r.question_id);
    }
  });
});

describe('All-time Classic leaderboard', () => {
  it('keeps each player’s best eligible run, ranked deterministically', async () => {
    const p = await account(db);
    for (const target of [3, 9]) {
      const s = await db.tx((q) => startClassic(q, p));
      let v = await db.tx((q) => getSessionView(q, p.id, s));
      while (v.phase !== 'completed') {
        const i = v.question!.position;
        const c = await correctOption(db, v.question!.issuedId);
        await db.tx((q) => submitAnswer(q, p.id, s, { issuedId: v.question!.issuedId, optionId: i < target ? c : v.question!.options.find((o) => o.id !== c)!.id, submissionKey: crypto.randomUUID() }));
        v = await db.tx((q) => advance(q, p.id, s, i));
      }
    }
    const board = await classicLeaderboard(db, { playerId: p.id });
    const mine = board.entries.filter((e) => e.playerId === p.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].correct).toBe(9);
  });
});

describe('Database access control (RLS)', () => {
  async function asRole<T>(role: 'anon' | 'authenticated', sub: string | null, fn: () => Promise<T>): Promise<T> {
    return db.tx(async (q) => {
      await q.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub ?? '']);
      await q.query(`set local role ${role}`);
      const original = db.query;
      try {
        // Route the probe through this transaction.
        (db as { query: typeof db.query }).query = q.query;
        return await fn();
      } finally {
        (db as { query: typeof db.query }).query = original;
      }
    });
  }
  const denied = async (role: 'anon' | 'authenticated', sql: string) => {
    await expect(asRole(role, crypto.randomUUID(), () => db.query(sql))).rejects.toThrow(/permission denied/);
  };

  it('client roles cannot read answer keys, options, versions or game internals', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await denied(role, 'select * from private.answer_keys');
      await denied(role, 'select * from public.question_options');
      await denied(role, 'select * from public.question_versions');
      await denied(role, 'select * from public.issued_questions');
      await denied(role, 'select * from public.daily_challenge_questions');
      await denied(role, 'select * from public.audience_votes');
      await denied(role, 'select email from public.players');
    }
  });

  it('client roles cannot write scores', async () => {
    await denied('authenticated', `update public.game_sessions set score = 99999`);
    await denied('anon', `insert into public.game_sessions(player_id, mode, ruleset_version, scoring_key, total_questions) values (gen_random_uuid(), 'classic', 1, 'x', 15)`);
  });

  it('a signed-in player can read only their own profile row (no email column)', async () => {
    const authId = crypto.randomUUID();
    const { linkAccount } = await import('@/lib/server/players');
    await db.tx((q) => linkAccount(q, { authUserId: authId, email: 'rls@example.test', currentPlayerId: null, suggestedName: 'Rls Tester' }));
    const rows = await asRole('authenticated', authId, () => db.query<{ display_name: string }>('select id, display_name from public.players'));
    expect(rows).toHaveLength(1);
    expect(rows[0].display_name).toBe('Rls Tester');
    const cats = await asRole('anon', null, () => db.query('select id from public.categories'));
    expect(cats.length).toBeGreaterThan(5);
  });
});

describe('CSV import validation', () => {
  it('accepts the template and reports row-specific errors', async () => {
    const tpl = csvTemplate();
    const ok = await validateCsv(db, tpl);
    expect(ok.fatal).toBeNull();
    expect(ok.rows[0].errors).toEqual([]);
    const bad = tpl + '\n' + [
      'Short?', 'A', 'B', 'C', 'C', 'E', 'too short', 'astronomy', 'extreme', 'XX1', 'all', '', 'en', 'notaurl|ftp://x', '2026-13-40', '',
    ].join(',') + '\n' + tpl.split('\n')[1];
    const res = await validateCsv(db, bad);
    expect(res.rows).toHaveLength(3);
    const errs = res.rows[1].errors.join(' | ');
    expect(res.rows[1].line).toBe(3);
    for (const fragment of ['question', 'option_d', 'correct', 'explanation', 'category', 'difficulty', 'country_scope', 'sources', 'verified_at']) {
      expect(errs).toContain(fragment);
    }
    expect(res.rows[2].errors.join()).toMatch(/duplicates line 2/);
  });

  it('flags duplicates of existing questions and rejects missing columns', async () => {
    const [{ text }] = await db.query<{ text: string }>(`select v.text from public.questions q join public.question_versions v on v.id = q.live_version_id limit 1`);
    const tpl = csvTemplate().split('\n');
    const row = tpl[1].replace(/^"?[^,]*\?"?,/, `"${text.toUpperCase()}",`);
    const res = await validateCsv(db, `${tpl[0]}\n${row}`);
    expect(res.rows[0].errors.join()).toMatch(/already exists/);
    const missing = await validateCsv(db, 'question,option_a\nx,y');
    expect(missing.fatal).toMatch(/Missing required columns/);
  });
});

describe('Difficulty calibration', () => {
  it('uses observed difficulty but never empties a tier', async () => {
    const { availableCounts, selectQuestion } = await import('@/lib/server/game/selection');
    const { getActiveConfig } = await import('@/lib/server/config');
    const cfg = await getActiveConfig(db);
    const before = await availableCounts(db, cfg.rules);
    // Simulate unrepresentative traffic: every question looks "hard".
    await db.query(`update public.question_stats set unassisted_attempts = 100, unassisted_correct = 10`);
    const after = await availableCounts(db, cfg.rules);
    expect(after.easy).toBe(before.easy);
    expect(after.hard).toBeGreaterThan(before.hard);
    const p = await account(db);
    const s = await db.tx((q) => startClassic(q, p));
    expect(s).toBeTruthy();
    // With an easy-looking question available, it is preferred for 'easy'.
    const [one] = await db.query<{ version_id: string }>(
      `select q.live_version_id as version_id from public.questions q join public.question_versions v on v.id = q.live_version_id
        where v.difficulty = 'medium' and q.status = 'approved' limit 1`,
    );
    await db.query('update public.question_stats set unassisted_correct = 95 where version_id = $1', [one.version_id]);
    const pick = await db.tx((q) => selectQuestion(q, { sessionId: crypto.randomUUID(), playerId: crypto.randomUUID(), difficulty: 'easy', rules: cfg.rules, now: new Date() }));
    expect(pick!.version_id).toBe(one.version_id);
    await db.query(`update public.question_stats set unassisted_attempts = 0, unassisted_correct = 0`);
  });
});
