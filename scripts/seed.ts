/**
 * Seed DEVELOPMENT FIXTURE questions (unverified, never for production).
 * Refuses to run against a production deployment.
 */
import { seedFixtures } from '../src/lib/server/bootstrap';
import { openDb, resolveDbTarget, runMigrations } from '../src/lib/server/db';

if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed development fixtures in production.');
  process.exit(1);
}
const db = await openDb(resolveDbTarget());
await runMigrations(db);
await seedFixtures(db);
const [{ n }] = await db.query<{ n: number }>('select count(*)::int as n from public.questions where is_fixture');
console.log(`${n} development fixture questions present (labelled is_fixture).`);
await db.close();
