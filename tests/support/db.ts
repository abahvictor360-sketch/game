import { bootstrap } from '@/lib/server/bootstrap';
import { setClockForTesting } from '@/lib/server/clock';
import { openDb, runMigrations, setDbForTesting, type Db } from '@/lib/server/db';
import { createGuest, linkAccount, type Player } from '@/lib/server/players';

/**
 * A fresh, migrated database per test file. Uses embedded Postgres by default;
 * set TEST_DATABASE_URL (a server URL whose user can CREATE DATABASE) to run
 * the same tests against a real Postgres server through the production driver.
 */
export async function freshDb(opts: { fixtures?: boolean } = {}): Promise<Db> {
  let db: Db;
  const server = process.env.TEST_DATABASE_URL;
  if (server) {
    const name = `fastora_t_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const admin = await openDb({ kind: 'postgres', url: server });
    await admin.exec(`create database ${name}`);
    await admin.close();
    const url = new URL(server);
    url.pathname = `/${name}`;
    const inner = await openDb({ kind: 'postgres', url: url.toString() });
    const close = inner.close.bind(inner);
    db = Object.assign(inner, {
      close: async () => {
        await close();
        const a = await openDb({ kind: 'postgres', url: server });
        await a.exec(`drop database if exists ${name} with (force)`);
        await a.close();
      },
    });
  } else {
    db = await openDb({ kind: 'pglite', dir: 'memory://' });
  }
  await runMigrations(db);
  await bootstrap(db, { fixtures: opts.fixtures ?? true });
  setDbForTesting(db);
  return db;
}

/** Controllable clock. */
export function fakeClock(start = new Date('2026-03-10T09:00:00Z')) {
  let t = start.getTime();
  setClockForTesting(() => new Date(t));
  return {
    advance(ms: number) {
      t += ms;
    },
    set(d: Date) {
      t = d.getTime();
    },
    now: () => new Date(t),
    reset: () => setClockForTesting(null),
  };
}

export async function guest(db: Db): Promise<Player> {
  return db.tx((q) => createGuest(q));
}

let n = 0;
export async function account(db: Db, email?: string): Promise<Player> {
  n += 1;
  return db.tx((q) => linkAccount(q, { authUserId: crypto.randomUUID(), email: email ?? `player${n}@example.test`, currentPlayerId: null, suggestedName: `Player ${n}` }));
}

export async function correctOption(db: Db, issuedId: string): Promise<string> {
  const [row] = await db.query<{ correct_option_id: string }>(
    `select k.correct_option_id from public.issued_questions iq join private.answer_keys k on k.version_id = iq.version_id where iq.id = $1`,
    [issuedId],
  );
  return row.correct_option_id;
}

export async function wrongOption(db: Db, issuedId: string): Promise<string> {
  const correct = await correctOption(db, issuedId);
  const [row] = await db.query<{ option_order: string[]; removed_option_ids: string[] }>('select option_order, removed_option_ids from public.issued_questions where id = $1', [issuedId]);
  return row.option_order.find((o) => o !== correct && !row.removed_option_ids.includes(o))!;
}
