import 'server-only';
import { ensureDefaultConfig } from './config';
import { createQuestion, ensureCategories } from './content';
import { getDb, type Db } from './db';
import { FIXTURE_QUESTIONS } from './fixtures';
// Side-effect imports register mode-specific behaviour with the engine.
import './game/daily';
import './game/phase2';

type G = typeof globalThis & { __fastoraReady?: Promise<Db> };

export function fixturesEnabled(db: Db): boolean {
  if (process.env.SEED_FIXTURES === 'false') return false;
  if (process.env.SEED_FIXTURES === 'true') return process.env.VERCEL_ENV !== 'production';
  return db.kind === 'pglite';
}

/** Idempotent first-run setup: default config, categories, dev fixtures. */
export async function bootstrap(db: Db, opts: { fixtures?: boolean } = {}) {
  await db.tx(async (q) => {
    await ensureDefaultConfig(q);
    await ensureCategories(q);
  });
  if (opts.fixtures ?? fixturesEnabled(db)) await seedFixtures(db);
}

export async function seedFixtures(db: Db) {
  const [{ n }] = await db.query<{ n: number }>('select count(*)::int as n from public.questions where is_fixture');
  if (n > 0) return;
  await db.tx(async (q) => {
    for (const input of FIXTURE_QUESTIONS) {
      await createQuestion(q, input, null, { initialState: 'approved', isFixture: true });
    }
  });
}

export function ensureReady(): Promise<Db> {
  const g = globalThis as G;
  if (!g.__fastoraReady) {
    g.__fastoraReady = (async () => {
      const db = await getDb();
      await bootstrap(db);
      return db;
    })().catch((e) => {
      g.__fastoraReady = undefined;
      throw e;
    });
  }
  return g.__fastoraReady;
}

export function resetReadyForTesting() {
  (globalThis as G).__fastoraReady = undefined;
}
