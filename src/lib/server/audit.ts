import 'server-only';
import { pgJson, type Queryable } from './db';

export async function audit(
  q: Queryable,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  data: Record<string, unknown> = {},
) {
  await q.query(
    'insert into public.audit_events(actor_id, action, entity_type, entity_id, data) values ($1, $2, $3, $4, $5::jsonb)',
    [actorId, action, entityType, entityId, pgJson(data)],
  );
}

/** Operational alert for administrators (deduplicated by key). */
export async function raiseAlert(q: Queryable, kind: string, message: string, dedupeKey: string, data: Record<string, unknown> = {}) {
  await q.query(
    `insert into public.ops_alerts(kind, message, data, dedupe_key) values ($1, $2, $3::jsonb, $4)
     on conflict (dedupe_key) do nothing`,
    [kind, message, pgJson(data), dedupeKey],
  );
}
