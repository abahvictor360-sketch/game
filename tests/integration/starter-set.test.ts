import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/lib/server/db';
import { startOrResumeDaily } from '@/lib/server/game/daily';
import { advance, getSessionView, startClassic, submitAnswer } from '@/lib/server/game/sessions';
import { buildStarterSql } from '../../scripts/build-starter-sql';
import { account, correctOption, fakeClock, freshDb } from '../support/db';

let db: Db;
const clock = fakeClock(new Date('2026-10-09T08:00:00Z'));
const sql = readFileSync('db/seed/starter_questions_100.sql', 'utf8');

beforeAll(async () => {
  db = await freshDb({ fixtures: false }); // like production: no dev fixtures
});
afterAll(async () => {
  clock.reset();
  await db.close();
});

describe('starter question SQL (db/seed/starter_questions_100.sql)', () => {
  it('is up to date with db/content/starter-questions.ts', () => {
    expect(sql).toBe(buildStarterSql().sql);
  });

  it('loads 100 approved questions, and running it twice changes nothing', async () => {
    // The file has its own begin/commit (for the SQL editor); the test driver opens its own transaction.
    const body = sql.replace(/^begin;$/m, '').replace(/^commit;$/m, '');
    await db.tx((q) => q.exec(body));
    await db.tx((q) => q.exec(body));
    const [{ n }] = await db.query<{ n: number }>(
      `select count(*)::int as n from public.questions q join public.question_versions v on v.id = q.live_version_id
        where q.status = 'approved' and v.state = 'approved' and 'starter-set' = any(v.tags)`,
    );
    expect(n).toBe(100);
    const keys = await db.query<{ ok: boolean }>(
      `select k.correct_option_id in (select id from public.question_options o where o.version_id = k.version_id) as ok from private.answer_keys k`,
    );
    expect(keys).toHaveLength(100);
    expect(keys.every((k) => k.ok)).toBe(true);
    const byDifficulty = await db.query<{ difficulty: string; n: number }>('select difficulty, count(*)::int as n from public.question_versions group by 1');
    for (const d of byDifficulty) expect(d.n).toBeGreaterThanOrEqual(25);
  });

  it('serves a full Classic game and a Daily Challenge from the starter set', async () => {
    const p = await account(db);
    const s = await db.tx((q) => startClassic(q, p));
    let v = await db.tx((q) => getSessionView(q, p.id, s));
    const seen = new Set<string>();
    while (v.phase !== 'completed') {
      const i = v.question!.position;
      seen.add(v.question!.text);
      const c = await correctOption(db, v.question!.issuedId);
      clock.advance(2000);
      await db.tx((q) => submitAnswer(q, p.id, s, { issuedId: v.question!.issuedId, optionId: c, submissionKey: crypto.randomUUID() }));
      v = await db.tx((q) => advance(q, p.id, s, i));
    }
    expect(seen.size).toBe(15);
    expect(v.score).toBe(5 * 100 + 5 * 200 + 5 * 300);
    const d = await db.tx((q) => startOrResumeDaily(q, p));
    expect((await db.tx((q) => getSessionView(q, p.id, d))).totalQuestions).toBe(10);
  });
});
