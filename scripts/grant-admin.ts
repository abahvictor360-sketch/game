/**
 * Grant a staff role to an existing account by email.
 *   npm run admin:grant -- someone@example.org [admin|editor]
 * The person must have signed in at least once.
 */
import { openDb, resolveDbTarget } from '../src/lib/server/db';

const [email, role = 'admin'] = process.argv.slice(2);
if (!email || !['admin', 'editor'].includes(role)) {
  console.error('Usage: npm run admin:grant -- <email> [admin|editor]');
  process.exit(1);
}
const db = await openDb(resolveDbTarget());
const rows = await db.query<{ id: string }>(`select id from public.players where kind = 'account' and lower(email) = lower($1)`, [email]);
if (!rows.length) {
  console.error('No account with that email. Ask them to sign in first.');
  process.exit(1);
}
await db.query(
  `insert into public.staff_roles(player_id, role) values ($1, $2) on conflict (player_id) do update set role = excluded.role`,
  [rows[0].id, role],
);
await db.query(`insert into public.audit_events(action, entity_type, entity_id, data) values ('staff.grant', 'player', $1, $2::jsonb)`, [rows[0].id, JSON.stringify({ role, via: 'cli' })]);
console.log(`Granted ${role} to ${email}.`);
await db.close();
