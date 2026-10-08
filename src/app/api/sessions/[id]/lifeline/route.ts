import { NextResponse } from 'next/server';
import { z } from 'zod';
import { LIFELINES } from '@/lib/game/rules';
import { api, body } from '@/lib/server/api';
import { track } from '@/lib/server/analytics';
import { useLifeline } from '@/lib/server/game/sessions';
import { requirePlayer } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rate-limit';

const Schema = z.object({ issuedId: z.string().uuid(), lifeline: z.enum(LIFELINES), requestKey: z.string().min(8).max(64) });

export const POST = api<{ params: Promise<{ id: string }> }>(async (req, db, ctx) => {
  const { id } = await ctx.params;
  const player = await requirePlayer();
  const input = await body(req, Schema);
  await rateLimit(db, `lifeline:${player.id}`, 30, 60);
  // eslint-disable-next-line react-hooks/rules-of-hooks -- server function, not a React hook
  const view = await db.tx((q) => useLifeline(q, player.id, id, input));
  void track('lifeline_used', player.id, { lifeline: input.lifeline, mode: view.mode });
  return NextResponse.json(view);
});
