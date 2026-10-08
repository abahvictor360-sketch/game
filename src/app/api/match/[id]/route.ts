import { NextResponse } from 'next/server';
import { api } from '@/lib/server/api';
import { track } from '@/lib/server/analytics';
import { getMatchView } from '@/lib/server/game/matches';
import { requirePlayer } from '@/lib/server/identity';
import { rateLimit } from '@/lib/server/rate-limit';

export const GET = api<{ params: Promise<{ id: string }> }>(async (_req, db, ctx) => {
  const { id } = await ctx.params;
  const player = await requirePlayer();
  await rateLimit(db, `match:${player.id}`, 240, 60);
  const view = await db.tx((q) => getMatchView(q, player.id, id));
  if (view.reconnected) void track('match_reconnected', player.id);
  return NextResponse.json(view);
});
