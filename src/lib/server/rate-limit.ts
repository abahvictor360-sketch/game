import 'server-only';
import type { Queryable } from './db';
import { AppError } from './errors';

/**
 * Fixed-window rate limiting stored in Postgres, so limits hold across
 * serverless instances. `bucket` should include the action and the actor.
 */
export async function rateLimit(q: Queryable, bucket: string, limit: number, windowSec: number) {
  const [row] = await q.query<{ hits: number }>(
    `insert into private.rate_limits(bucket, window_start, hits)
     values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
     on conflict (bucket, window_start) do update set hits = private.rate_limits.hits + 1
     returning hits`,
    [bucket, windowSec],
  );
  if (row.hits > limit) throw new AppError('rate_limited', 'Too many requests — please slow down a little.');
}

export async function pruneRateLimits(q: Queryable) {
  await q.query(`delete from private.rate_limits where window_start < now() - interval '1 day'`);
}
