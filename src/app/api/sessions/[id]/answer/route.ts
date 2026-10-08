import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, body } from '@/lib/server/api';
import { submitAnswer } from '@/lib/server/game/sessions';
import { requirePlayer } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rate-limit';

// The client sends only which option it chose — never a score or a verdict.
const Schema = z.object({ issuedId: z.string().uuid(), optionId: z.string().uuid(), submissionKey: z.string().min(8).max(64) });

export const POST = api<{ params: Promise<{ id: string }> }>(async (req, db, ctx) => {
  const { id } = await ctx.params;
  const player = await requirePlayer();
  const input = await body(req, Schema);
  await rateLimit(db, `answer:${player.id}`, 90, 60);
  const view = await db.tx((q) => submitAnswer(q, player.id, id, input));
  return NextResponse.json(view);
});
