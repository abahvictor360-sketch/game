/**
 * Apply database migrations.
 *   DATABASE_URL=postgres://… npm run db:migrate   (Supabase / Postgres)
 *   npm run db:migrate                             (local embedded database)
 * Use the Supabase *session* connection string (port 5432) for migrations.
 */
import { openDb, resolveDbTarget, runMigrations } from '../src/lib/server/db';
import { ensureDefaultConfig } from '../src/lib/server/config';
import { ensureCategories } from '../src/lib/server/content';

const db = await openDb(resolveDbTarget());
const applied = await runMigrations(db);
await db.tx(async (q) => {
  await ensureDefaultConfig(q);
  await ensureCategories(q);
});
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
await db.close();
