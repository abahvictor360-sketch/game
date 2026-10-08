import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, body } from '@/lib/server/api';
import { track } from '@/lib/server/analytics';
import { advance } from '@/lib/server/game/sessions';
import { requirePlayer } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rate-limit';

const Schema = z.object({ fromPosition: z.number().int().min(0).max(100) });

export const POST = api<{ params: Promise<{ id: string }> }>(async (req, db, ctx) => {
  const { id } = await ctx.params;
  const player = await requirePlayer();
  const { fromPosition } = await body(req, Schema);
  await rateLimit(db, `next:${player.id}`, 90, 60);
  const view = await db.tx((q) => advance(q, player.id, id, fromPosition));
  if (view.status === 'completed' && view.position === fromPosition) {
    void track(view.mode === 'daily' ? 'daily_completed' : 'game_completed', player.id, {
      mode: view.mode,
      score: view.score,
      correct: view.correctCount,
      total: view.totalQuestions,
    });
  }
  return NextResponse.json(view);
});
