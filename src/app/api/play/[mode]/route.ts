import { NextResponse, type NextRequest } from 'next/server';
import { assertSameOrigin, jsonError, redirect303 } from '@/lib/server/api';
import { track } from '@/lib/server/analytics';
import { ensureReady } from '@/lib/server/bootstrap';
import { AppError } from '@/lib/server/errors';
import { captureException } from '@/lib/server/monitoring';
import { startOrResumeDaily } from '@/lib/server/game/daily';
import { startGhostGame } from '@/lib/server/game/phase2';
import { startClassic } from '@/lib/server/game/sessions';
import { requireAccount, SIGN_IN_REQUIRED } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rate-limit';

const STARTERS = {
  classic: startClassic,
  daily: startOrResumeDaily,
  ghost: startGhostGame,
} as const;

export async function POST(req: NextRequest, ctx: { params: Promise<{ mode: string }> }) {
  const { mode } = await ctx.params;
  const isForm = (req.headers.get('content-type') ?? '').includes('form');
  try {
    assertSameOrigin(req);
    const start = STARTERS[mode as keyof typeof STARTERS];
    if (!start) throw new AppError('not_found', 'Unknown game mode.');
    const db = await ensureReady();
    const player = await requireAccount(db);
    await rateLimit(db, `start:${player.id}`, 20, 60);
    const sessionId = await db.tx((q) => start(q, player));
    void track(mode === 'daily' ? 'daily_started' : 'game_started', player.id, { mode, eligible: player.kind === 'account' });
    if (isForm) return redirect303(req, `/play/${sessionId}`);
    return NextResponse.json({ sessionId });
  } catch (err) {
    if (!(err instanceof AppError)) captureException(err, { where: 'play.start', mode });
    if (isForm) {
      const code = err instanceof AppError ? (err.reason ?? err.code) : 'internal';
      const back = mode === 'daily' ? '/daily' : mode === 'ghost' ? '/versus' : '/play/classic';
      if (err instanceof AppError && err.reason === SIGN_IN_REQUIRED) return redirect303(req, `/auth/signin?next=${encodeURIComponent(back)}`);
      return redirect303(req, `${back}?error=${encodeURIComponent(code)}`);
    }
    return jsonError(err);
  }
}
