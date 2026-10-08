import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, body } from '@/lib/server/api';
import { submitMatchAnswer } from '@/lib/server/game/matches';
import { requirePlayer } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rate-limit';

const Schema = z.object({ position: z.number().int().min(0).max(100), optionId: z.string().uuid() });

export const POST = api<{ params: Promise<{ id: string }> }>(async (req, db, ctx) => {
  const { id } = await ctx.params;
  const player = await requirePlayer();
  const input = await body(req, Schema);
  await rateLimit(db, `manswer:${player.id}`, 60, 60);
  return NextResponse.json(await db.tx((q) => submitMatchAnswer(q, player.id, id, input)));
});
