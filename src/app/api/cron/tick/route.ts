import { NextResponse, type NextRequest } from 'next/server';
import { addDays, challengeDateFor } from '@/lib/game/dates';
import { ensureReady } from '@/lib/server/bootstrap';
import { clock } from '@/lib/server/clock';
import { getActiveConfig } from '@/lib/server/config';
import { ensureDailyChallenge } from '@/lib/server/game/daily';
import { sweepMatches } from '@/lib/server/game/matches';
import { settleAudience } from '@/lib/server/game/phase2';
import { captureException } from '@/lib/server/monitoring';
import { pruneRateLimits } from '@/lib/server/rate-limit';

/**
 * Scheduled sweeper (Vercel Cron or any scheduler). Durable state is the
 * source of truth; this only advances what is already due:
 *  - publishes today's and tomorrow's Daily Challenge ahead of time
 *  - advances live matches (deadlines, disconnects, forfeits, finalisation)
 *  - settles audience votes whose window has closed
 *  - abandons long-idle solo sessions and prunes rate-limit windows
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = await ensureReady();
  const out: Record<string, unknown> = {};
  try {
    const cfg = await getActiveConfig(db);
    const today = challengeDateFor(clock.now(), cfg.rules.daily.timezone);
    for (const d of [today, addDays(today, 1)]) {
      const c = await db.tx((q) => ensureDailyChallenge(q, d, cfg));
      out[`daily:${d}`] = c ? 'ok' : 'unavailable';
    }
    out.matches = await sweepMatches(db).catch((e) => (captureException(e), 'error'));
    const due = await db.query<{ session_id: string }>(`select session_id from public.audience_requests where status = 'collecting' and closes_at < now()`);
    for (const r of due) await db.tx((q) => settleAudience(q, r.session_id, clock.now()));
    out.audience = due.length;
    const [ab] = await db.query<{ n: number }>(
      `with x as (update public.game_sessions set status = 'abandoned', updated_at = now()
                   where status = 'active' and mode <> 'match' and updated_at < now() - interval '24 hours' returning 1)
       select count(*)::int as n from x`,
    );
    out.abandoned = ab.n;
    await pruneRateLimits(db);
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    captureException(e, { where: 'cron.tick' });
    return NextResponse.json({ ok: false, ...out }, { status: 500 });
  }
}
