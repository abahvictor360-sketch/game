import { type NextRequest } from 'next/server';
import { assertSameOrigin, redirect303 } from '@/lib/server/api';
import { track } from '@/lib/server/analytics';
import { ensureReady } from '@/lib/server/bootstrap';
import { AppError } from '@/lib/server/errors';
import { startFriendChallenge } from '@/lib/server/game/phase2';
import { requireAccount, SIGN_IN_REQUIRED } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rate-limit';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  try {
    assertSameOrigin(req);
    const db = await ensureReady();
    const player = await requireAccount(db);
    await rateLimit(db, `start:${player.id}`, 20, 60);
    const id = await db.tx((q) => startFriendChallenge(q, player, token));
    void track('friend_challenge_started', player.id);
    return redirect303(req, `/play/${id}`);
  } catch (e) {
    if (e instanceof AppError && e.reason === SIGN_IN_REQUIRED) return redirect303(req, `/auth/signin?next=${encodeURIComponent(`/challenge/${token}`)}`);
    const code = e instanceof AppError ? (e.reason ?? e.code) : 'internal';
    return redirect303(req, `/challenge/${encodeURIComponent(token)}?error=${code}`);
  }
}
