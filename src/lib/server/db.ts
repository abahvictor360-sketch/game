import 'server-only';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Minimal SQL interface shared by both adapters:
 *  - `postgres` (postgres.js) for Supabase / any hosted Postgres (DATABASE_URL)
 *  - `pglite` (embedded Postgres in WASM) for local development and tests
 * The same SQL migrations run on both.
 */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run a multi-statement script (no parameters). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  readonly kind: 'postgres' | 'pglite';
  close(): Promise<void>;
}

/** Serialise a JS array as a Postgres array literal for `$n::type[]` params. */
export function pgArray(values: readonly (string | number)[]): string {
  return (
    '{' +
    values
      .map((v) => (typeof v === 'number' ? String(v) : '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'))
      .join(',') +
    '}'
  );
}

export function pgJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

async function createPostgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    types: {
      bigint: postgres.BigInt,
      // Callers pass JSON as pre-serialised text ($n::jsonb). The default
      // serializer would JSON-encode it again, storing a JSON *string*.
      json: {
        to: 114,
        from: [114, 3802],
        serialize: (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x)),
        parse: (x: string) => JSON.parse(x),
      },
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wrap = (s: { unsafe: (text: string, params?: any[]) => Promise<unknown> }): Queryable => ({
    async query<T>(text: string, params: unknown[] = []) {
      const rows = (await s.unsafe(text, params as never[])) as Iterable<T>;
      return Array.from(rows);
    },
    async exec(text: string) {
      await s.unsafe(text);
    },
  });
  const base = wrap(sql as never);
  return {
    kind: 'postgres',
    query: base.query,
    exec: base.exec,
    async tx(fn) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (await sql.begin((t: any) => fn(wrap(t)))) as any;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

async function createPgliteDb(dataDir: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (!dataDir.includes('://')) await mkdir(dataDir, { recursive: true });
  const pg = new PGlite(dataDir);
  await pg.waitReady;
  const run = async <T>(target: { query: typeof pg.query }, text: string, params: unknown[] = []) => {
    const res = await target.query<T>(text, params as never[]);
    return res.rows;
  };
  return {
    kind: 'pglite',
    query: (text, params) => run(pg, text, params),
    async exec(text) {
      await pg.exec(text);
    },
    async tx(fn) {
      return pg.transaction(async (t) =>
        fn({
          query: (text, params) => run(t, text, params),
          exec: async (text) => {
            await t.exec(text);
          },
        }),
      );
    },
    async close() {
      await pg.close();
    },
  };
}

export async function runMigrations(db: Db, dir = path.join(process.cwd(), 'db', 'migrations')): Promise<string[]> {
  await db.query('create schema if not exists private');
  await db.query(
    'create table if not exists private.app_migrations (name text primary key, applied_at timestamptz not null default now())',
  );
  const done = new Set((await db.query<{ name: string }>('select name from private.app_migrations')).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    await db.tx(async (q) => {
      await q.exec(sql);
      await q.query('insert into private.app_migrations(name) values ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}

type GlobalWithDb = typeof globalThis & { __fastoraDb?: Promise<Db> };

export function resolveDbTarget(): { kind: 'postgres'; url: string } | { kind: 'pglite'; dir: string } {
  const url = process.env.DATABASE_URL;
  if (url) return { kind: 'postgres', url };
  if (process.env.VERCEL || process.env.VERCEL_ENV === 'production') {
    throw new Error('DATABASE_URL is required on Vercel; the embedded database is for local development only.');
  }
  return { kind: 'pglite', dir: process.env.PGLITE_DIR ?? path.join(process.cwd(), '.data', 'pglite') };
}

/** Process-wide database handle. */
export function getDb(): Promise<Db> {
  const g = globalThis as GlobalWithDb;
  if (!g.__fastoraDb) {
    g.__fastoraDb = (async () => {
      const target = resolveDbTarget();
      if (target.kind === 'postgres') {
        const db = await createPostgresDb(target.url);
        if (process.env.AUTO_MIGRATE === 'true') await runMigrations(db);
        return db;
      }
      const db = await createPgliteDb(target.dir);
      await runMigrations(db);
      return db;
    })().catch((err) => {
      g.__fastoraDb = undefined;
      throw err;
    });
  }
  return g.__fastoraDb;
}

/** Test/script helper: open an isolated database. */
export async function openDb(target: { kind: 'postgres'; url: string } | { kind: 'pglite'; dir: string }): Promise<Db> {
  return target.kind === 'postgres' ? createPostgresDb(target.url) : createPgliteDb(target.dir);
}

/** Inject a database (tests). */
export function setDbForTesting(db: Db | undefined) {
  (globalThis as GlobalWithDb).__fastoraDb = db ? Promise.resolve(db) : undefined;
}
