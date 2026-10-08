import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, body } from '@/lib/server/api';
import { castAudienceVote } from '@/lib/server/game/phase2';
import { requirePlayer } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rate-limit';

const Schema = z.object({ requestId: z.string().uuid(), optionId: z.string().uuid() });

export const POST = api(async (req, db) => {
  const player = await requirePlayer();
  const input = await body(req, Schema);
  await rateLimit(db, `vote:${player.id}`, 20, 60);
  await db.tx((q) => castAudienceVote(q, player.id, input.requestId, input.optionId));
  return NextResponse.json({ ok: true });
});
